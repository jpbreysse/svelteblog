/**
 * POST /api/chat
 * RAG chat endpoint with SSE streaming and conversation memory
 *
 * Body:
 * - message: User's question (required)
 * - history: Array of previous messages [{role: 'user'|'assistant', content: '...'}] (optional)
 * - postId: Filter to specific post ID (optional - null for all documents)
 * - pathId: Filter to specific folder/path ID (optional - null for all folders)
 * - limit: Number of context chunks (default: 5)
 * - keywordWeight: Hybrid search weight (default: 0.3)
 *
 * Response: Server-Sent Events stream
 * - event: token → { text: "..." }
 * - event: sources → [{ title, slug, similarity }]
 * - event: done → {}
 * - event: error → { message: "..." }
 */

import { pool } from '$lib/db.js';
import { generateEmbedding } from '$lib/server/embeddings.js';
import { generateStream, checkOllama } from '$lib/server/ollama.js';

/**
 * Perform hybrid search (semantic + keyword) with permission filtering
 * @param {string} query - Search query
 * @param {number} userId - Current user ID
 * @param {string} userRole - User role ('user' or 'admin')
 * @param {number} limit - Max results
 * @param {number} keywordWeight - Weight for keyword matching
 * @param {number|null} postId - Filter to specific post (null for all)
 * @param {number|null} pathId - Filter to specific folder/path (null for all)
 */
async function hybridSearch(query, userId, userRole = 'user', limit = 5, keywordWeight = 0.3, postId = null, pathId = null) {
  // Generate embedding
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = '[' + queryEmbedding.join(',') + ']';

  // Extract keywords
  const stopWords = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou',
    'qui', 'que', 'quoi', 'the', 'a', 'an', 'and', 'or', 'is', 'are',
    'was', 'were', 'to', 'for', 'in', 'on', 'at', 'with', 'how', 'what',
    'when', 'where', 'why', 'can', 'do', 'does', 'did'
  ]);
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Build SQL - keyword params start at $6 (after embedding, userId, isAdmin, postId, pathId)
  const keywordConditions = keywords.map((_, i) => `LOWER(dc.chunk_text) LIKE $${i + 6}`);
  const keywordParams = keywords.map(k => `%${k}%`);

  // Permission filtering:
  // - Admins can see all published posts
  // - Users can see: public posts, their own posts, or posts in groups they belong to
  const isAdmin = userRole === 'admin';

  // Post filter condition (null means all posts)
  const postFilter = postId ? 'AND p.id = $4' : '';

  // Path filter condition (null means all folders)
  const pathFilter = pathId ? 'AND p.path_id = $5' : '';

  // Hybrid query with permission filtering and optional post/path filter
  const result = await pool.query(
    `WITH ranked_chunks AS (
      SELECT
        dc.id as chunk_id,
        dc.post_id,
        dc.chunk_index,
        dc.chunk_text,
        dc.summary,
        p.title,
        p.slug,
        p.category,
        p.source_url,
        p.source_type,
        1 - (dc.embedding <=> $1::vector) as semantic_similarity,
        CASE
          WHEN ${keywordConditions.length > 0 ? keywordConditions.join(' OR ') : 'FALSE'}
          THEN 1.0
          ELSE 0.0
        END as keyword_match,
        (${keywords.map((_, i) => `CASE WHEN LOWER(dc.chunk_text) LIKE $${i + 6} THEN 1 ELSE 0 END`).join(' + ') || '0'}) as keyword_count
      FROM document_chunks dc
      JOIN posts p ON dc.post_id = p.id
      LEFT JOIN post_read_groups prg ON p.id = prg.post_id
      LEFT JOIN user_groups ug ON prg.group_id = ug.group_id AND ug.user_id = $2
      WHERE p.published = true
        ${postFilter}
        ${pathFilter}
        AND (
          -- Admins can see everything
          $3 = true
          -- Public posts
          OR p.visibility = 'public'
          -- User's own posts
          OR p.author_id = $2
          -- Group posts where user is a member
          OR (p.visibility = 'groups' AND ug.user_id IS NOT NULL)
        )
    )
    SELECT DISTINCT ON (post_id)
      *,
      (semantic_similarity * ${1 - keywordWeight}) + (keyword_match * ${keywordWeight}) + (keyword_count * 0.05) as hybrid_score
    FROM ranked_chunks
    ORDER BY post_id, hybrid_score DESC, semantic_similarity DESC`,
    [embeddingStr, userId, isAdmin, postId, pathId, ...keywordParams]
  );

  // Re-sort by hybrid_score after DISTINCT ON
  const sortedRows = result.rows.sort((a, b) => b.hybrid_score - a.hybrid_score).slice(0, limit * 3);

  // Group by post and return best match per post
  const postResults = new Map();
  for (const row of sortedRows) {
    const existing = postResults.get(row.post_id);
    if (!existing || row.hybrid_score > existing.hybridScore) {
      postResults.set(row.post_id, {
        postId: row.post_id,
        title: row.title,
        slug: row.slug,
        category: row.category,
        sourceUrl: row.source_url,
        sourceType: row.source_type,
        semanticSimilarity: row.semantic_similarity,
        hybridScore: row.hybrid_score,
        matchedChunk: row.chunk_text,
        summary: row.summary,
        chunkIndex: row.chunk_index
      });
    }
  }

  return Array.from(postResults.values())
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, limit);
}

/**
 * Build RAG prompt with context and conversation history
 * @param {string} userMessage - Current user message
 * @param {Array} contextChunks - Retrieved context chunks
 * @param {Array} history - Previous conversation messages [{role, content}]
 */
function buildRAGPrompt(userMessage, contextChunks, history = []) {
  let contextText = '';

  if (contextChunks.length > 0) {
    contextText = contextChunks.map((chunk, i) => {
      const summary = chunk.summary ? ` (${chunk.summary})` : '';
      return `[${i + 1}] ${chunk.title}${summary}:\n${chunk.matchedChunk}`;
    }).join('\n\n---\n\n');
  } else {
    contextText = '(No relevant context found in the knowledge base)';
  }

  // Build conversation history text (limit to last 10 messages to avoid token overflow)
  let conversationText = '';
  if (history.length > 0) {
    const recentHistory = history.slice(-10);
    conversationText = `## Conversation History:

${recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')}

---

`;
  }

  return `You are a helpful assistant answering questions based on the knowledge base.
Use the context provided below and the conversation history to answer.
If the context doesn't contain relevant information, say "I don't have information about that in my knowledge base."

## Context from Knowledge Base:

${contextText}

${conversationText}## Current Question:
${userMessage}

## Instructions:
- Answer based on the context above and conversation history
- Maintain continuity with previous messages (understand references like "it", "that", etc.)
- Provide detailed, helpful explanations
- Include relevant examples or steps when available in the context
- Reference document titles when citing sources (e.g., "According to [1] Document Title...")
- If unsure, acknowledge the limitation`;
}

/**
 * Create SSE response
 */
function createSSEStream(generator, sources) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Stream tokens
        for await (const token of generator) {
          const event = `event: token\ndata: ${JSON.stringify({ text: token })}\n\n`;
          controller.enqueue(encoder.encode(event));
        }

        // Send sources
        const sourcesEvent = `event: sources\ndata: ${JSON.stringify(sources)}\n\n`;
        controller.enqueue(encoder.encode(sourcesEvent));

        // Send done event
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

  return stream;
}

export async function POST({ request, locals }) {
  // Require authentication
  if (!locals.user) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message: 'Authentication required' })}\n\n`,
      {
        status: 401,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      }
    );
  }

  try {
    const body = await request.json();
    const { message, history = [], postId = null, pathId = null, limit = 5, keywordWeight = 0.3 } = body;

    if (!message || message.trim().length === 0) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ message: 'Message is required' })}\n\n`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/event-stream' }
        }
      );
    }

    // Check Ollama availability
    const ollamaStatus = await checkOllama();
    if (!ollamaStatus.available) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ message: 'Ollama is not running. Start it with: ollama serve' })}\n\n`,
        {
          status: 503,
          headers: { 'Content-Type': 'text/event-stream' }
        }
      );
    }

    if (!ollamaStatus.hasMistral) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ message: 'Mistral model not found. Install with: ollama pull mistral' })}\n\n`,
        {
          status: 503,
          headers: { 'Content-Type': 'text/event-stream' }
        }
      );
    }

    console.log(`💬 RAG Chat: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}" (user: ${locals.user.id}, role: ${locals.user.role}${postId ? `, post: ${postId}` : ''}${pathId ? `, path: ${pathId}` : ''})`);

    // Perform hybrid search with permission filtering (and optional post/path filter)
    const contextChunks = await hybridSearch(message, locals.user.id, locals.user.role, limit, keywordWeight, postId, pathId);
    console.log(`   Found ${contextChunks.length} relevant chunks (filtered by user permissions)`);

    // Build RAG prompt with conversation history
    const ragPrompt = buildRAGPrompt(message, contextChunks, history);

    if (history.length > 0) {
      console.log(`   Including ${history.length} previous messages in context`);
    }

    // Prepare sources for response
    const sources = contextChunks.map((chunk, i) => ({
      index: i + 1,
      title: chunk.title,
      slug: chunk.slug,
      category: chunk.category,
      similarity: Math.round(chunk.hybridScore * 100) / 100,
      sourceUrl: chunk.sourceUrl
    }));

    // Create streaming response
    const generator = generateStream(ragPrompt, {
      temperature: 0.7,
      maxTokens: 2000
    });

    const stream = createSSEStream(generator, sources);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('❌ RAG Chat error:', error);
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/event-stream' }
      }
    );
  }
}
