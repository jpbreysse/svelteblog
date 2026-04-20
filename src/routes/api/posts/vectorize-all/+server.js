/**
 * POST /api/posts/vectorize-all
 * Vectorize all posts that haven't been vectorized yet
 */

import { json } from '@sveltejs/kit';
import { blogDB, chunksDB, pool } from '$lib/db.js';
import { extractTextFromPostContent } from '$lib/server/documents.js';
import { chunkText, getChunkStats } from '$lib/server/chunker.js';
import { generateEmbeddings } from '$lib/server/embeddings.js';

export async function POST({ locals, url }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({
      success: false,
      error: 'Admin access required'
    }, { status: 403 });
  }

  // Option to force re-vectorize all
  const forceAll = url.searchParams.get('force') === 'true';

  try {
    // Get all posts
    const allPosts = await blogDB.getAllPosts();

    // Get vectorization status directly from database
    const statusResult = await pool.query(`
      SELECT id, vectorized_at IS NOT NULL as is_vectorized
      FROM posts
    `);
    const vectorizedIds = new Set(
      statusResult.rows.filter(s => s.is_vectorized).map(s => s.id)
    );

    const results = {
      total: allPosts.length,
      processed: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    console.log(`🚀 Starting bulk vectorization of ${allPosts.length} posts (force=${forceAll})`);

    for (const post of allPosts) {
      // Skip already vectorized unless force=true
      if (!forceAll && vectorizedIds.has(post.id)) {
        results.skipped++;
        continue;
      }

      try {
        // Extract text from post content
        const text = extractTextFromPostContent(post.content);

        // Skip if not enough content
        if (!text || text.length < 50) {
          results.skipped++;
          console.log(`⏭️ Post ${post.id}: skipped (content too short)`);
          continue;
        }

        // Chunk the text
        const chunks = chunkText(text, { chunkSize: 500, overlap: 50 });

        if (chunks.length === 0) {
          results.skipped++;
          console.log(`⏭️ Post ${post.id}: skipped (no chunks created)`);
          continue;
        }

        // Generate embeddings
        const embeddings = await generateEmbeddings(chunks);

        // Save to database
        await chunksDB.saveChunks(post.id, chunks, embeddings, 'post');

        results.processed++;
        console.log(`✅ Post ${post.id}: vectorized (${chunks.length} chunks)`);

      } catch (error) {
        results.failed++;
        results.errors.push(`Post ${post.id}: ${error.message}`);
        console.error(`❌ Post ${post.id}: ${error.message}`);
      }
    }

    console.log(`🏁 Bulk vectorization complete: ${results.processed} processed, ${results.skipped} skipped, ${results.failed} failed`);

    return json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('❌ Bulk vectorization error:', error);
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
