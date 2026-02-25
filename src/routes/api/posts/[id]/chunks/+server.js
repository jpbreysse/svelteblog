/**
 * GET /api/posts/[id]/chunks
 * Get all chunks for a post (admin only)
 */

import { json } from '@sveltejs/kit';
import { chunksDB } from '$lib/db.js';

export async function GET({ params, locals }) {
  // Require admin
  if (!locals.user || locals.user.role !== 'admin') {
    return json({
      success: false,
      error: 'Admin access required'
    }, { status: 403 });
  }

  const postId = parseInt(params.id);

  if (isNaN(postId)) {
    return json({
      success: false,
      error: 'Invalid post ID'
    }, { status: 400 });
  }

  try {
    const chunks = await chunksDB.getChunksByPost(postId);

    return json({
      success: true,
      chunks,
      count: chunks.length
    });

  } catch (error) {
    console.error('Error getting chunks:', error);
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
