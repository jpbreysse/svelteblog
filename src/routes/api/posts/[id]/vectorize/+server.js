/**
 * POST /api/posts/[id]/vectorize
 * Vectorize a post's content for semantic search
 *
 * For regular posts: extracts and vectorizes the post HTML content
 * For link posts: fetches external URL, extracts text, and vectorizes
 */

import { json } from '@sveltejs/kit';
import { blogDB, chunksDB } from '$lib/db.js';
import { canWritePost } from '$lib/server/permissions.js';
import { fetchAndExtractText, extractTextFromPostContent } from '$lib/server/documents.js';
import { chunkText, getChunkStats } from '$lib/server/chunker.js';
import { generateEmbeddings } from '$lib/server/embeddings.js';

export async function POST({ params, locals }) {
  // Require authentication
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  const postId = parseInt(params.id);

  if (isNaN(postId)) {
    return json({
      success: false,
      error: 'Invalid post ID'
    }, { status: 400 });
  }

  try {
    // Check permissions
    const canWrite = await canWritePost(postId, locals.user.id, locals.user.role);
    if (!canWrite) {
      return json({
        success: false,
        error: 'You do not have permission to vectorize this post'
      }, { status: 403 });
    }

    // Get the post
    const post = await blogDB.getPostById(postId);
    if (!post) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }

    console.log(`🔄 Starting vectorization for post ${postId}: "${post.title}"`);

    let text = '';
    let sourceType = 'post';

    // Check if this is a link post with external URL
    if (post.category === 'link' && post.source_url) {
      console.log(`📥 Fetching external document: ${post.source_url}`);

      try {
        const result = await fetchAndExtractText(post.source_url);
        text = result.text;
        sourceType = result.type;
        console.log(`✅ Extracted ${text.length} characters from ${sourceType}`);
      } catch (fetchError) {
        console.error('❌ Failed to fetch external document:', fetchError);
        return json({
          success: false,
          error: `Failed to fetch external document: ${fetchError.message}`
        }, { status: 400 });
      }
    } else {
      // Regular post - extract text from HTML content
      text = extractTextFromPostContent(post.content);
      sourceType = 'post';
      console.log(`📄 Extracted ${text.length} characters from post content`);
    }

    // Validate we have content to vectorize
    if (!text || text.length < 50) {
      return json({
        success: false,
        error: 'Not enough content to vectorize (minimum 50 characters)'
      }, { status: 400 });
    }

    // Chunk the text
    console.log('✂️ Chunking text...');
    const chunks = chunkText(text, { chunkSize: 500, overlap: 50 });
    const stats = getChunkStats(chunks);
    console.log(`   Created ${stats.count} chunks (avg ${stats.avgLength} chars)`);

    if (chunks.length === 0) {
      return json({
        success: false,
        error: 'Could not create any text chunks'
      }, { status: 400 });
    }

    // Generate embeddings
    console.log('🧠 Generating embeddings...');
    const embeddings = await generateEmbeddings(chunks);
    console.log(`   Generated ${embeddings.length} embeddings`);

    // Save to database
    console.log('💾 Saving to database...');
    await chunksDB.saveChunks(postId, chunks, embeddings, sourceType);

    console.log(`✅ Vectorization complete for post ${postId}`);

    return json({
      success: true,
      message: 'Post vectorized successfully',
      stats: {
        chunkCount: chunks.length,
        avgChunkLength: stats.avgLength,
        sourceType,
        textLength: text.length
      }
    });

  } catch (error) {
    console.error('❌ Vectorization error:', error);

    return json({
      success: false,
      error: error.message || 'Failed to vectorize post'
    }, { status: 500 });
  }
}

/**
 * GET /api/posts/[id]/vectorize
 * Get vectorization status for a post
 */
export async function GET({ params, locals }) {
  const postId = parseInt(params.id);

  if (isNaN(postId)) {
    return json({
      success: false,
      error: 'Invalid post ID'
    }, { status: 400 });
  }

  try {
    const status = await chunksDB.getVectorizationStatus(postId);

    return json({
      success: true,
      ...status
    });

  } catch (error) {
    console.error('❌ Error getting vectorization status:', error);

    return json({
      success: false,
      error: 'Failed to get vectorization status'
    }, { status: 500 });
  }
}

/**
 * DELETE /api/posts/[id]/vectorize
 * Remove vectorization from a post
 */
export async function DELETE({ params, locals }) {
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  const postId = parseInt(params.id);

  if (isNaN(postId)) {
    return json({
      success: false,
      error: 'Invalid post ID'
    }, { status: 400 });
  }

  try {
    // Check permissions
    const canWrite = await canWritePost(postId, locals.user.id, locals.user.role);
    if (!canWrite) {
      return json({
        success: false,
        error: 'You do not have permission to modify this post'
      }, { status: 403 });
    }

    await chunksDB.deleteChunks(postId);

    return json({
      success: true,
      message: 'Vectorization removed successfully'
    });

  } catch (error) {
    console.error('❌ Error removing vectorization:', error);

    return json({
      success: false,
      error: 'Failed to remove vectorization'
    }, { status: 500 });
  }
}
