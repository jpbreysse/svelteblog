# Stage 4: RAG Chat with SSE Streaming

## Overview

Stage 4 implements a Retrieval-Augmented Generation (RAG) chat interface that allows users to ask questions and receive AI-generated answers based on the knowledge base. Responses are streamed in real-time using Server-Sent Events (SSE).

**Key Features:**
- Real-time token streaming (no waiting for full response)
- Hybrid search combining semantic similarity + keyword matching
- Source citations with links to original documents
- Fully on-premise (no external API calls)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                           │
│                                                                   │
│   ┌─────────────┐    ┌─────────────────────────────────────┐    │
│   │  Question   │───▶│  EventSource (SSE Consumer)         │    │
│   │  Input      │    │  Receives tokens in real-time       │    │
│   └─────────────┘    └─────────────────────────────────────┘    │
│                                      │                           │
│                                      ▼                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Chat Messages                                           │   │
│   │  - User messages (right-aligned, blue)                  │   │
│   │  - Assistant messages (left-aligned, streaming)         │   │
│   │  - Source citations (links to documents)                │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ POST /api/chat
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend Pipeline                         │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Step 1: Hybrid Search                                     │   │
│  │                                                           │   │
│  │  User Question ──▶ MiniLM Embedding ──▶ pgvector Search  │   │
│  │                          +                                │   │
│  │                    Keyword Matching                       │   │
│  │                          ▼                                │   │
│  │              Top 5 Relevant Chunks                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Step 2: Prompt Assembly                                   │   │
│  │                                                           │   │
│  │  System Instructions                                      │   │
│  │       +                                                   │   │
│  │  Context Chunks (with titles and summaries)              │   │
│  │       +                                                   │   │
│  │  User Question                                            │   │
│  │       ▼                                                   │   │
│  │  Complete RAG Prompt                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Step 3: Ollama Streaming                                  │   │
│  │                                                           │   │
│  │  RAG Prompt ──▶ Mistral 7B ──▶ Token Stream              │   │
│  │                                                           │   │
│  │  Ollama returns newline-delimited JSON:                  │   │
│  │  {"response":"The",...}                                  │   │
│  │  {"response":" answer",...}                              │   │
│  │  {"done":true,...}                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Step 4: SSE Response                                      │   │
│  │                                                           │   │
│  │  event: token                                             │   │
│  │  data: {"text": "The"}                                   │   │
│  │                                                           │   │
│  │  event: token                                             │   │
│  │  data: {"text": " answer"}                               │   │
│  │                                                           │   │
│  │  event: sources                                           │   │
│  │  data: [{"title":"Doc 1","slug":"doc-1",...}]           │   │
│  │                                                           │   │
│  │  event: done                                              │   │
│  │  data: {}                                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Ollama Streaming (`src/lib/server/ollama.js`)

The `generateStream()` function is an async generator that yields tokens as they arrive from Ollama:

```javascript
export async function* generateStream(prompt, options = {}) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mistral',
      prompt,
      stream: true,  // Enable streaming
      options: {
        temperature: 0.7,
        num_predict: 1000
      }
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line);
      if (parsed.response) {
        yield parsed.response;  // Yield each token
      }
    }
  }
}
```

**Key Points:**
- Uses `ReadableStream` reader for chunked reading
- Ollama sends newline-delimited JSON objects
- Each object contains a `response` field with one or more tokens
- Generator pattern allows `for await...of` consumption

---

### 2. Chat API Endpoint (`src/routes/api/chat/+server.js`)

The endpoint orchestrates the RAG pipeline:

```javascript
export async function POST({ request, locals }) {
  // 1. Authentication check
  if (!locals.user) {
    return sseError('Authentication required', 401);
  }

  // 2. Parse request
  const { message, limit = 5 } = await request.json();

  // 3. Check Ollama availability
  const ollamaStatus = await checkOllama();
  if (!ollamaStatus.available || !ollamaStatus.hasMistral) {
    return sseError('Ollama/Mistral not available', 503);
  }

  // 4. Hybrid search for context
  const contextChunks = await hybridSearch(message, limit);

  // 5. Build RAG prompt
  const ragPrompt = buildRAGPrompt(message, contextChunks);

  // 6. Stream response
  const generator = generateStream(ragPrompt);
  const stream = createSSEStream(generator, sources);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

---

### 3. Hybrid Search

Combines semantic similarity (vector search) with keyword matching:

```javascript
async function hybridSearch(query, limit = 5, keywordWeight = 0.3) {
  // Generate embedding for semantic search
  const queryEmbedding = await generateEmbedding(query);

  // Extract keywords (filter stop words)
  const keywords = query.toLowerCase().split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // SQL query with hybrid scoring
  const result = await pool.query(`
    WITH ranked_chunks AS (
      SELECT
        dc.*,
        p.title, p.slug,
        1 - (dc.embedding <=> $1::vector) as semantic_similarity,
        CASE WHEN keyword_matches THEN 1.0 ELSE 0.0 END as keyword_match
      FROM document_chunks dc
      JOIN posts p ON dc.post_id = p.id
      WHERE p.published = true
    )
    SELECT *,
      (semantic_similarity * 0.7) + (keyword_match * 0.3) as hybrid_score
    FROM ranked_chunks
    ORDER BY hybrid_score DESC
    LIMIT $2
  `, [embeddingStr, limit]);

  return result.rows;
}
```

**Scoring Formula:**
```
hybrid_score = (semantic_similarity × 0.7) + (keyword_match × 0.3) + (keyword_count × 0.05)
```

---

### 4. RAG Prompt Template

The prompt instructs the LLM to use only the provided context:

```
You are a helpful assistant answering questions based on the knowledge base.
Use ONLY the context provided below to answer. If the context doesn't contain
relevant information, say "I don't have information about that in my knowledge base."

## Context from Knowledge Base:

[1] Document Title (Summary):
Chunk content here...

---

[2] Another Document:
More content...

## User Question:
{user_message}

## Instructions:
- Answer based on the context above
- Be concise and direct
- Reference document titles when citing sources (e.g., "According to [1]...")
- If unsure, acknowledge the limitation
```

---

### 5. SSE Stream Creation

The `createSSEStream()` function converts the async generator into an SSE-formatted ReadableStream:

```javascript
function createSSEStream(generator, sources) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // Stream tokens
        for await (const token of generator) {
          const event = `event: token\ndata: ${JSON.stringify({ text: token })}\n\n`;
          controller.enqueue(encoder.encode(event));
        }

        // Send sources after completion
        const sourcesEvent = `event: sources\ndata: ${JSON.stringify(sources)}\n\n`;
        controller.enqueue(encoder.encode(sourcesEvent));

        // Signal completion
        const doneEvent = `event: done\ndata: {}\n\n`;
        controller.enqueue(encoder.encode(doneEvent));

        controller.close();
      } catch (error) {
        const errorEvent = `event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
      }
    }
  });
}
```

**SSE Format:**
```
event: token
data: {"text": "Hello"}

event: token
data: {"text": " world"}

event: sources
data: [{"title": "Doc", "slug": "doc", "similarity": 0.85}]

event: done
data: {}
```

---

### 6. Frontend Consumer (`src/routes/chat/+page.svelte`)

The Svelte component uses `fetch` with streaming to consume SSE:

```javascript
async function sendMessage() {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userMessage })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    // Parse SSE events
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.substring(6));
        if (data.text) {
          // Append token to message
          messages[assistantIndex].content += data.text;
        } else if (Array.isArray(data)) {
          // Set sources
          messages[assistantIndex].sources = data;
        }
      }
    }
  }
}
```

---

## Data Flow

```
1. User types: "How do I set up PostgreSQL?"
                    │
                    ▼
2. POST /api/chat with { message: "..." }
                    │
                    ▼
3. Generate embedding (MiniLM): [0.023, -0.112, ...]
                    │
                    ▼
4. Hybrid search in pgvector:
   - Semantic: cosine similarity with query embedding
   - Keyword: LIKE '%postgresql%' OR LIKE '%setup%'
   - Combined: hybrid_score = 0.7×semantic + 0.3×keyword
                    │
                    ▼
5. Top 5 chunks returned with metadata
                    │
                    ▼
6. Build RAG prompt:
   "Context: [1] Start the server: ... [2] Install: ..."
   "Question: How do I set up PostgreSQL?"
                    │
                    ▼
7. Send to Ollama (stream: true)
                    │
                    ▼
8. Ollama returns tokens:
   {"response": "To"} → {"response": " set"} → {"response": " up"} ...
                    │
                    ▼
9. Convert to SSE:
   event: token
   data: {"text": "To"}
                    │
                    ▼
10. Browser receives and displays tokens in real-time
                    │
                    ▼
11. After all tokens, send sources:
    event: sources
    data: [{"title": "Start the server", ...}]
                    │
                    ▼
12. UI displays clickable source links
```

---

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| First token latency | 1-2 seconds | Time to first visible response |
| Token generation | ~30-50 tokens/sec | On CPU (M1/M2 Mac) |
| Full response time | 5-15 seconds | Depends on response length |
| Context retrieval | 100-300ms | Hybrid search + embedding |
| Memory usage | ~4GB | Mistral 7B model in RAM |

---

## Error Handling

| Error | SSE Event | User Message |
|-------|-----------|--------------|
| Not authenticated | `event: error` | "Authentication required" |
| Ollama not running | `event: error` | "Ollama is not running" |
| Mistral not installed | `event: error` | "Mistral model not found" |
| No context found | Normal response | LLM acknowledges limitation |
| Stream interrupted | `onerror` handler | "Connection lost" |

---

## Files

| File | Purpose |
|------|---------|
| `src/lib/server/ollama.js` | Ollama API wrapper with `generateStream()` |
| `src/routes/api/chat/+server.js` | RAG endpoint with SSE streaming |
| `src/routes/chat/+page.svelte` | Chat UI with real-time rendering |
| `src/routes/chat/+page.server.js` | Authentication check |

---

## Usage

### API Request

```bash
curl -N -X POST http://localhost:5173/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: auth_token=..." \
  -d '{"message": "How do I set up PostgreSQL?", "limit": 5}'
```

### API Response (SSE Stream)

```
event: token
data: {"text":"To"}

event: token
data: {"text":" set"}

event: token
data: {"text":" up"}

event: token
data: {"text":" PostgreSQL"}

...

event: sources
data: [{"index":1,"title":"Start the server","slug":"start-the-server","similarity":0.79}]

event: done
data: {}
```

---

## Dependencies

- **Ollama**: Local LLM runtime (`ollama serve`)
- **Mistral 7B**: Language model (`ollama pull mistral`)
- **pgvector**: PostgreSQL vector extension (Stage 1)
- **@xenova/transformers**: Embedding generation (MiniLM)

---

## Production Considerations

1. **No local GPU on Scalingo**: Replace Ollama with cloud API (Groq, Mistral API, OpenAI)
2. **Rate limiting**: Add per-user request limits
3. **Caching**: Cache frequent queries with their responses
4. **Monitoring**: Log query latency, token counts, error rates
5. **Context window**: Mistral 7B has 8K tokens; limit context to ~2K tokens
