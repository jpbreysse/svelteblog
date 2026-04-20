/**
 * POST /api/chunks/review-all
 * Review ALL unreviewed chunks in batches
 * This is a long-running operation - process in batches of 10
 */

import { json } from '@sveltejs/kit';
import { chunksDB } from '$lib/db.js';
import { reviewChunk, checkRedundancy } from '$lib/server/chunk-reviewer.js';
import { checkOllama } from '$lib/server/ollama.js';

const BATCH_SIZE = 10;

export async function POST({ locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({
      success: false,
      error: 'Admin access required'
    }, { status: 403 });
  }

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

    // Get initial stats
    const initialStats = await chunksDB.getReviewStats();
    const totalUnreviewed = parseInt(initialStats.total_chunks) - parseInt(initialStats.reviewed_chunks);

    if (totalUnreviewed === 0) {
      return json({
        success: true,
        message: 'All chunks are already reviewed',
        processed: 0,
        total: parseInt(initialStats.total_chunks)
      });
    }

    console.log(`🚀 Starting batch review of ${totalUnreviewed} unreviewed chunks...`);

    const results = {
      totalToProcess: totalUnreviewed,
      processed: 0,
      failed: 0,
      lowQuality: 0,
      redundant: 0,
      docTypes: {},
      batches: 0
    };

    // Process in batches until no more unreviewed chunks
    let hasMore = true;

    while (hasMore) {
      const chunks = await chunksDB.getUnreviewedChunks(BATCH_SIZE);

      if (chunks.length === 0) {
        hasMore = false;
        break;
      }

      results.batches++;
      console.log(`\n📦 Batch ${results.batches}: Processing ${chunks.length} chunks...`);

      for (const chunk of chunks) {
        try {
          // Review the chunk
          const review = await reviewChunk(chunk);

          // Check for redundancy
          let redundantOf = null;
          const similarChunks = await chunksDB.findSimilarChunks(chunk.id, 0.92);

          if (similarChunks.length > 0) {
            const redundancyCheck = await checkRedundancy(
              chunk.chunk_text,
              similarChunks[0].chunk_text
            );

            if (redundancyCheck.redundant) {
              redundantOf = similarChunks[0].id;
              results.redundant++;
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

          if (review.quality_score < 0.5) {
            results.lowQuality++;
          }

          results.docTypes[review.doc_type] = (results.docTypes[review.doc_type] || 0) + 1;

          // Progress indicator
          const progress = ((results.processed / results.totalToProcess) * 100).toFixed(1);
          console.log(`   [${progress}%] Chunk ${chunk.id}: quality=${review.quality_score.toFixed(2)}, type=${review.doc_type}`);

        } catch (error) {
          console.error(`   ❌ Chunk ${chunk.id} failed:`, error.message);
          results.failed++;
        }
      }
    }

    console.log(`\n🏁 Batch review complete!`);
    console.log(`   Processed: ${results.processed}`);
    console.log(`   Failed: ${results.failed}`);
    console.log(`   Low quality: ${results.lowQuality}`);
    console.log(`   Redundant: ${results.redundant}`);

    return json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('❌ Batch review error:', error);
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
