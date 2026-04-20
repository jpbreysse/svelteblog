/**
 * Workflow Executor
 * Execute multi-step LLM workflows with RAG context
 */

import { generateStream } from './ollama.js';
import { generateEmbedding } from './embeddings.js';
import { interpolateVariables } from './workflow-parser.js';
import { pool } from '$lib/db.js';

/**
 * Execute a workflow step by step
 * @param {Array<{stepNumber, title, content}>} steps - Parsed workflow steps
 * @param {string} input - Input document/text to process
 * @param {object} options - Execution options
 * @param {number} options.ragLimit - Number of RAG context chunks per step (default: 3)
 * @param {boolean} options.useRAG - Whether to use RAG context (default: true)
 * @param {number} options.temperature - LLM temperature (default: 0.7)
 * @param {number} options.maxTokens - Max tokens per step (default: 2000)
 * @param {number} options.userId - User ID for permission filtering
 * @param {string} options.userRole - User role for permission filtering
 * @yields {object} - Step progress and tokens
 */
export async function* executeWorkflow(steps, input, options = {}) {
  const {
    ragLimit = 3,
    useRAG = true,
    temperature = 0.7,
    maxTokens = 2000,
    userId = null,
    userRole = 'user'
  } = options;

  const outputs = { input };

  for (const step of steps) {
    // Signal step start
    yield {
      type: 'step_start',
      step: step.stepNumber,
      title: step.title
    };

    try {
      // Get RAG context if enabled
      let context = '';
      if (useRAG) {
        const contextChunks = await getRAGContext(step.content, ragLimit, userId, userRole);
        context = formatContext(contextChunks);
        outputs.context = context;
      }

      // Interpolate variables in step content
      const interpolatedContent = interpolateVariables(step.content, outputs);

      // Build full prompt
      const fullPrompt = buildStepPrompt(interpolatedContent, context, step.title);

      // Debug logging
      console.log(`📋 Step ${step.stepNumber} - Input length: ${outputs.input?.length || 0}`);
      console.log(`📋 Step ${step.stepNumber} - Interpolated (first 300 chars): ${interpolatedContent.substring(0, 300)}...`);
      console.log(`📋 Step ${step.stepNumber} - Full prompt length: ${fullPrompt.length}`);

      // Stream LLM output
      let stepOutput = '';
      const generator = generateStream(fullPrompt, {
        temperature,
        maxTokens
      });

      for await (const token of generator) {
        stepOutput += token;
        yield {
          type: 'token',
          step: step.stepNumber,
          text: token
        };
      }

      // Store output for next steps
      outputs[`step${step.stepNumber}`] = stepOutput;

      // Signal step complete
      yield {
        type: 'step_complete',
        step: step.stepNumber,
        output: stepOutput
      };

    } catch (error) {
      yield {
        type: 'step_error',
        step: step.stepNumber,
        error: error.message
      };
      // Continue to next step or break based on error handling strategy
      break;
    }
  }

  // Return all outputs
  yield {
    type: 'workflow_complete',
    outputs
  };
}

/**
 * Get RAG context for a step using hybrid search with permission filtering
 * @param {string} query - Step content to search for context
 * @param {number} limit - Number of chunks to return
 * @param {number} userId - User ID for permission filtering
 * @param {string} userRole - User role for permission filtering
 * @returns {Promise<Array>} - Relevant chunks
 */
async function getRAGContext(query, limit = 3, userId = null, userRole = 'user') {
  // Generate embedding for semantic search
  const queryEmbedding = await generateEmbedding(query.substring(0, 1000)); // Limit query length
  const embeddingStr = '[' + queryEmbedding.join(',') + ']';

  // Extract keywords for hybrid search
  const stopWords = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou',
    'qui', 'que', 'quoi', 'the', 'a', 'an', 'and', 'or', 'is', 'are',
    'was', 'were', 'to', 'for', 'in', 'on', 'at', 'with', 'how', 'what',
    'when', 'where', 'why', 'can', 'do', 'does', 'did', 'you', 'your',
    'from', 'this', 'that', 'these', 'those', 'be', 'been', 'being',
    'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may',
    'might', 'must', 'shall', 'step', 'output', 'input', 'following'
  ]);

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10); // Limit keywords

  // Build keyword conditions - params start at $5 (after embedding, limit, userId, isAdmin)
  const keywordConditions = keywords.map((_, i) => `LOWER(dc.chunk_text) LIKE $${i + 5}`);
  const keywordParams = keywords.map(k => `%${k}%`);

  const isAdmin = userRole === 'admin';

  // Hybrid search query with permission filtering
  const result = await pool.query(
    `WITH ranked_chunks AS (
      SELECT
        dc.id as chunk_id,
        dc.post_id,
        dc.chunk_text,
        dc.summary,
        p.title,
        p.slug,
        1 - (dc.embedding <=> $1::vector) as semantic_similarity,
        CASE
          WHEN ${keywordConditions.length > 0 ? keywordConditions.join(' OR ') : 'FALSE'}
          THEN 1.0
          ELSE 0.0
        END as keyword_match
      FROM document_chunks dc
      JOIN posts p ON dc.post_id = p.id
      LEFT JOIN post_read_groups prg ON p.id = prg.post_id
      LEFT JOIN user_groups ug ON prg.group_id = ug.group_id AND ug.user_id = $3
      WHERE p.published = true
        AND (
          -- Admins can see everything
          $4 = true
          -- Public posts
          OR p.visibility = 'public'
          -- User's own posts
          OR p.author_id = $3
          -- Group posts where user is a member
          OR (p.visibility = 'groups' AND ug.user_id IS NOT NULL)
        )
    )
    SELECT DISTINCT ON (chunk_id) *,
      (semantic_similarity * 0.7) + (keyword_match * 0.3) as hybrid_score
    FROM ranked_chunks
    ORDER BY chunk_id, hybrid_score DESC`,
    [embeddingStr, limit, userId, isAdmin, ...keywordParams]
  );

  // Re-sort by hybrid_score and limit
  return result.rows
    .sort((a, b) => b.hybrid_score - a.hybrid_score)
    .slice(0, limit);
}

/**
 * Format context chunks for prompt
 * @param {Array} chunks - RAG context chunks
 * @returns {string} - Formatted context
 */
function formatContext(chunks) {
  if (!chunks || chunks.length === 0) {
    return '';
  }

  return chunks.map((chunk, i) => {
    const summary = chunk.summary ? ` (${chunk.summary})` : '';
    return `[${i + 1}] ${chunk.title}${summary}:\n${chunk.chunk_text}`;
  }).join('\n\n---\n\n');
}

/**
 * Build prompt for a workflow step
 * @param {string} stepContent - Interpolated step content
 * @param {string} context - RAG context (may be empty)
 * @param {string} stepTitle - Step title for context
 * @returns {string} - Full prompt
 */
function buildStepPrompt(stepContent, context, stepTitle) {
  let prompt = '';

  if (context) {
    prompt += `## Relevant Knowledge Base Context:\n\n${context}\n\n---\n\n`;
  }

  prompt += `## Task: ${stepTitle}\n\n${stepContent}`;

  return prompt;
}

/**
 * Create SSE stream from workflow execution
 * @param {AsyncGenerator} executor - Workflow executor generator
 * @param {object} options - Stream options
 * @returns {ReadableStream} - SSE formatted stream
 */
export function createWorkflowSSEStream(executor, options = {}) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of executor) {
          const sseEvent = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseEvent));
        }

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
}
