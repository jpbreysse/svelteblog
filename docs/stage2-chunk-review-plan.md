# Technical Plan: Stage 2 - Chunk Review with Mistral 7B

## Overview
Add intelligent review layer on top of vectorized chunks using local Mistral 7B via Ollama.

**Prerequisites (Complete):**
- Stage 1 vectorization working (16 posts, ~50-100 chunks)
- Ollama installed with Mistral model (`ollama pull mistral`)
- Ollama running on `http://localhost:11434`

**Four Review Tasks:**
1. **Quality Check** - Flag chunks that don't stand alone (mid-sentence, missing context)
2. **Auto-Classification** - Assign category and tags based on content
3. **Metadata Enrichment** - Generate summary, keywords, related topics
4. **Redundancy Detection** - Identify duplicate content across chunks

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Stage 1 (Complete)                        │
│   Post → Chunk → Embed (MiniLM) → pgvector                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Stage 2 (New)                             │
│                                                              │
│   ┌──────────────┐     ┌──────────────┐                     │
│   │ Unreviewed   │────▶│  Mistral 7B  │                     │
│   │ Chunks       │     │  (Ollama)    │                     │
│   └──────────────┘     └──────┬───────┘                     │
│                               │                              │
│                               ▼                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Enriched Metadata:                                   │   │
│   │ - quality_score (0.0-1.0)                           │   │
│   │ - doc_type (technicaldoc/meetingsummary), auto_tags  │   │
│   │ - summary, keywords                                 │   │
│   │ - redundant_of (chunk_id if duplicate)              │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema Extension

**File:** `migrations/add-chunk-review.sql`

```sql
-- Add review metadata columns to document_chunks
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS quality_score FLOAT;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS doc_type VARCHAR(50);  -- 'technicaldoc' or 'meetingsummary'
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS auto_tags TEXT[];
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS keywords TEXT[];
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS redundant_of INTEGER REFERENCES document_chunks(id);
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- Index for finding unreviewed chunks
CREATE INDEX IF NOT EXISTS idx_chunks_unreviewed
  ON document_chunks(id) WHERE reviewed_at IS NULL;

-- Index for finding low-quality chunks
CREATE INDEX IF NOT EXISTS idx_chunks_low_quality
  ON document_chunks(quality_score) WHERE quality_score < 0.5;
```

---

## Phase 2: Ollama Service

**File:** `src/lib/server/ollama.js`

```javascript
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

export async function generateWithMistral(prompt, options = {}) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mistral',
      prompt,
      stream: false,
      format: 'json',  // Request JSON output
      options: {
        temperature: 0.1,  // Low temperature for consistent output
        ...options
      }
    })
  });

  const result = await response.json();
  return JSON.parse(result.response);
}
```

---

## Phase 3: Review Logic

**File:** `src/lib/server/chunk-reviewer.js`

### 3.1 Quality Check
Prompt Mistral to evaluate if chunk is coherent:
```
Evaluate this text chunk. Does it make sense on its own?
Score 0.0 (incomplete/broken) to 1.0 (fully coherent).

Chunk: "{chunk_text}"

Respond with JSON: { "quality_score": 0.8, "reason": "..." }
```

### 3.2 Auto-Classification
Prompt Mistral to classify chunk by document type:
```
Classify this text. Is it from a technical document or a meeting summary?

Document types:
- technicaldoc: Technical documentation, tutorials, how-to guides, code explanations, architecture docs
- meetingsummary: Meeting notes, action items, discussions, decisions, attendee lists

Text: "{chunk_text}"

Respond with JSON: { "doc_type": "technicaldoc", "tags": ["database", "postgresql"], "confidence": 0.9 }
```

**Note:** This classification is stored separately from the post's category. It helps filter search results by document type.

### 3.3 Metadata Enrichment
```
For this text, provide:
1. A one-line summary (max 100 chars)
2. 3-5 keywords

Text: "{chunk_text}"

Respond with JSON: { "summary": "...", "keywords": ["k1", "k2", "k3"] }
```

### 3.4 Redundancy Detection
Two-step process:
1. pgvector finds chunks with cosine similarity > 0.92
2. Mistral confirms if truly redundant:
```
Are these two texts saying the same thing?

Text A: "{chunk_a}"
Text B: "{chunk_b}"

Respond with JSON: { "redundant": true/false, "reason": "..." }
```

---

## Phase 4: API Endpoint

**File:** `src/routes/api/chunks/review/+server.js`

```
POST /api/chunks/review
```

**Query params:**
- `limit` - Number of chunks to process (default: 10)
- `post_id` - Review chunks for specific post only

**Process:**
1. Fetch unreviewed chunks (WHERE reviewed_at IS NULL)
2. For each chunk, call Mistral for quality + classification + metadata
3. Run redundancy check against similar chunks
4. UPDATE chunks with enriched data
5. Return summary of processed chunks

**Response:**
```json
{
  "success": true,
  "processed": 10,
  "lowQuality": 2,
  "redundant": 1,
  "categories": { "tech": 5, "tutorial": 3, "thoughts": 2 }
}
```

---

## Phase 5: Batch Review Endpoint

**File:** `src/routes/api/chunks/review-all/+server.js`

```
POST /api/chunks/review-all
```

Reviews all unreviewed chunks in batches. For background processing.

---

## Phase 6: Database Operations

**File:** `src/lib/db.js` (additions to chunksDB)

```javascript
// Get unreviewed chunks
async getUnreviewedChunks(limit = 10, postId = null) { ... }

// Update chunk with review data
async updateChunkReview(chunkId, reviewData) { ... }

// Find similar chunks for redundancy check
async findSimilarChunks(chunkId, threshold = 0.92) { ... }

// Mark chunk as redundant
async markRedundant(chunkId, redundantOfId) { ... }

// Get review statistics
async getReviewStats() { ... }
```

---

## Implementation Order

| Step | Task | Files |
|------|------|-------|
| 1 | Create migration | `migrations/add-chunk-review.sql` |
| 2 | Run migration on dev | Manual SQL execution |
| 3 | Create Ollama service | `src/lib/server/ollama.js` |
| 4 | Create chunk reviewer | `src/lib/server/chunk-reviewer.js` |
| 5 | Add DB operations | `src/lib/db.js` |
| 6 | Create review endpoint | `src/routes/api/chunks/review/+server.js` |
| 7 | Create batch endpoint | `src/routes/api/chunks/review-all/+server.js` |
| 8 | Test with existing chunks | Manual API calls |

---

## Key Files

### New Files:
- `migrations/add-chunk-review.sql`
- `src/lib/server/ollama.js`
- `src/lib/server/chunk-reviewer.js`
- `src/routes/api/chunks/review/+server.js`
- `src/routes/api/chunks/review-all/+server.js`

### Modified Files:
- `src/lib/db.js` - Add review-related chunksDB methods

---

## Environment Variables

```
OLLAMA_URL=http://localhost:11434
```

---

## Notes

1. **Processing time:** ~2-5 seconds per chunk with Mistral 7B on CPU
2. **Batch size:** Process 10 chunks at a time to avoid timeouts
3. **Idempotent:** Re-running review on already-reviewed chunks updates their data
4. **Production:** For Scalingo, would need cloud LLM API (Groq/Mistral API) since no local GPU
