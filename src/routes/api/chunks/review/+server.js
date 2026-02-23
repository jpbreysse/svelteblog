/**
 * POST /api/chunks/review
 * Review unreviewed chunks using Mistral 7B
 *
 * Query params:
 * - limit: Number of chunks to process (default: 10, max: 50)
 * - post_id: Filter by post ID (optional)
 */

import { json } from '@sveltejs/kit';
import { chunksDB } from '$lib/db.js';
import { reviewChunk, checkRedundancy } from '$lib/server/chunk-reviewer.js';
import { checkOllama } from '$lib/server/ollama.js';

export async function POST({ url, locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({
      success: false,
      error: 'Admin access required'
    }, { status: 403 });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
  const postId = url.searchParams.get('post_id') ? parseInt(url.searchParams.get('post_id')) : null;

  try {
    // Check if Ollama is available
    const ollamaStatus = await checkOllama();
    if (!ollamaStatus.available) {
      return json({
        success: false,
        error: 'Ollama is not running. Start it with: ollama serve'
      }, { status: 503 });
    }

    if (!ollamaStatus.hasMistral) {
      return json({
        success: false,
        error: 'Mistral model not found. Install with: ollama pull mistral'
      }, { status: 503 });
    }

    // Get unreviewed chunks
    const chunks = await chunksDB.getUnreviewedChunks(limit, postId);

    if (chunks.length === 0) {
      return json({
        success: true,
        message: 'No unreviewed chunks found',
        processed: 0
      });
    }

    console.log(`🔍 Reviewing ${chunks.length} chunks with Mistral...`);

    const results = {
      processed: 0,
      failed: 0,
      lowQuality: 0,
      redundant: 0,
      docTypes: {}
    };

    // Process each chunk
    for (const chunk of chunks) {
      try {
        console.log(`   Processing chunk ${chunk.id} (post: ${chunk.post_title})...`);

        // Review the chunk
        const review = await reviewChunk(chunk);

        // Check for redundancy with similar chunks
        let redundantOf = null;
        const similarChunks = await chunksDB.findSimilarChunks(chunk.id, 0.92);

        if (similarChunks.length > 0) {
          // Use Mistral to confirm redundancy
          const redundancyCheck = await checkRedundancy(
            chunk.chunk_text,
            similarChunks[0].chunk_text
          );

          if (redundancyCheck.redundant) {
            redundantOf = similarChunks[0].id;
            results.redundant++;
            console.log(`     ⚠️ Redundant of chunk ${redundantOf}`);
          }
        }

        // Save review results
        await chunksDB.updateChunkReview(chunk.id, {
          quality_score: review.quality_score,
          doc_type: review.doc_type,
          auto_tags: review.auto_tags,
          summary: review.summary,
          keywords: review.keywords,
          redundant_of: redundantOf
        });

        results.processed++;

        // Track stats
        if (review.quality_score < 0.5) {
          results.lowQuality++;
        }

        results.docTypes[review.doc_type] = (results.docTypes[review.doc_type] || 0) + 1;

        console.log(`     ✅ Quality: ${review.quality_score.toFixed(2)}, Type: ${review.doc_type}`);

      } catch (error) {
        console.error(`     ❌ Failed to review chunk ${chunk.id}:`, error.message);
        results.failed++;
      }
    }

    console.log(`🏁 Review complete: ${results.processed} processed, ${results.failed} failed`);

    return json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('❌ Chunk review error:', error);
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * GET /api/chunks/review
 * Get review statistics
 */
export async function GET({ locals }) {
  // Require authentication
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  try {
    const stats = await chunksDB.getReviewStats();
    const ollamaStatus = await checkOllama();

    return json({
      success: true,
      stats: {
        totalChunks: parseInt(stats.total_chunks),
        reviewedChunks: parseInt(stats.reviewed_chunks),
        unreviewedChunks: parseInt(stats.total_chunks) - parseInt(stats.reviewed_chunks),
        lowQuality: parseInt(stats.low_quality),
        redundant: parseInt(stats.redundant),
        byDocType: {
          technicaldoc: parseInt(stats.technicaldoc_count),
          meetingsummary: parseInt(stats.meetingsummary_count)
        }
      },
      ollama: ollamaStatus
    });

  } catch (error) {
    console.error('❌ Review stats error:', error);
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
