/**
 * Chunk Reviewer
 * Uses Mistral 7B to review and enrich document chunks
 */

import { generateJSON } from './ollama.js';

/**
 * Review a single chunk with all four tasks
 * @param {Object} chunk - The chunk to review
 * @param {string} chunk.chunk_text - The text content
 * @param {number} chunk.id - Chunk ID
 * @returns {Promise<Object>} Review results
 */
export async function reviewChunk(chunk) {
  const text = chunk.chunk_text;

  // Run all review tasks in parallel for efficiency
  const [quality, classification, metadata] = await Promise.all([
    evaluateQuality(text),
    classifyDocument(text),
    extractMetadata(text)
  ]);

  return {
    chunk_id: chunk.id,
    quality_score: quality.quality_score,
    quality_reason: quality.reason,
    doc_type: classification.doc_type,
    auto_tags: classification.tags,
    confidence: classification.confidence,
    summary: metadata.summary,
    keywords: metadata.keywords
  };
}

/**
 * Task 1: Quality Check
 * Evaluate if the chunk makes sense on its own
 */
async function evaluateQuality(text) {
  const prompt = `You are evaluating a text chunk extracted from a larger document.
Determine if this chunk is coherent and makes sense on its own.

Score guidelines:
- 1.0: Complete, standalone content that fully makes sense
- 0.7-0.9: Good content with minor context dependencies
- 0.4-0.6: Partial content, references missing context
- 0.1-0.3: Fragment, incomplete sentence, or broken content
- 0.0: Completely incoherent or empty

Text chunk:
"""
${text.substring(0, 1500)}
"""

Respond with JSON only:
{"quality_score": 0.8, "reason": "Brief explanation"}`;

  try {
    const result = await generateJSON(prompt);
    return {
      quality_score: Math.max(0, Math.min(1, parseFloat(result.quality_score) || 0.5)),
      reason: result.reason || ''
    };
  } catch (error) {
    console.error('Quality evaluation failed:', error);
    return { quality_score: 0.5, reason: 'Evaluation failed' };
  }
}

/**
 * Task 2: Auto-Classification
 * Classify as technical doc or meeting summary
 */
async function classifyDocument(text) {
  const prompt = `Classify this text into one of two document types and extract relevant tags.

Document types:
- technicaldoc: Technical documentation, tutorials, how-to guides, code explanations, architecture docs, API docs, troubleshooting guides
- meetingsummary: Meeting notes, action items, discussions, decisions, attendee lists, status updates, planning sessions

Text:
"""
${text.substring(0, 1500)}
"""

Respond with JSON only:
{"doc_type": "technicaldoc", "tags": ["database", "postgresql", "optimization"], "confidence": 0.9}`;

  try {
    const result = await generateJSON(prompt);
    return {
      doc_type: ['technicaldoc', 'meetingsummary'].includes(result.doc_type)
        ? result.doc_type
        : 'technicaldoc',
      tags: Array.isArray(result.tags) ? result.tags.slice(0, 5) : [],
      confidence: Math.max(0, Math.min(1, parseFloat(result.confidence) || 0.5))
    };
  } catch (error) {
    console.error('Classification failed:', error);
    return { doc_type: 'technicaldoc', tags: [], confidence: 0 };
  }
}

/**
 * Task 3: Metadata Enrichment
 * Generate summary and extract keywords
 */
async function extractMetadata(text) {
  const prompt = `For this text, provide:
1. A one-line summary (max 100 characters)
2. 3-5 important keywords

Text:
"""
${text.substring(0, 1500)}
"""

Respond with JSON only:
{"summary": "Brief one-line summary here", "keywords": ["keyword1", "keyword2", "keyword3"]}`;

  try {
    const result = await generateJSON(prompt);
    return {
      summary: (result.summary || '').substring(0, 200),
      keywords: Array.isArray(result.keywords) ? result.keywords.slice(0, 5) : []
    };
  } catch (error) {
    console.error('Metadata extraction failed:', error);
    return { summary: '', keywords: [] };
  }
}

/**
 * Task 4: Redundancy Detection
 * Check if two chunks are saying the same thing
 */
export async function checkRedundancy(chunkA, chunkB) {
  const prompt = `Are these two text chunks saying essentially the same thing?
They may use different words but convey the same information.

Text A:
"""
${chunkA.substring(0, 800)}
"""

Text B:
"""
${chunkB.substring(0, 800)}
"""

Respond with JSON only:
{"redundant": true, "reason": "Both describe the same database optimization technique"}`;

  try {
    const result = await generateJSON(prompt);
    return {
      redundant: result.redundant === true,
      reason: result.reason || ''
    };
  } catch (error) {
    console.error('Redundancy check failed:', error);
    return { redundant: false, reason: 'Check failed' };
  }
}

/**
 * Review multiple chunks in batch
 * @param {Array} chunks - Array of chunks to review
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Promise<Array>} Array of review results
 */
export async function reviewChunks(chunks, onProgress = null) {
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      const review = await reviewChunk(chunk);
      results.push({ success: true, ...review });
    } catch (error) {
      console.error(`Failed to review chunk ${chunk.id}:`, error);
      results.push({
        success: false,
        chunk_id: chunk.id,
        error: error.message
      });
    }

    if (onProgress) {
      onProgress(i + 1, chunks.length);
    }
  }

  return results;
}
