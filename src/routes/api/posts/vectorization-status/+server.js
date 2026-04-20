/**
 * GET /api/posts/vectorization-status
 * Get vectorization status for all posts
 */

import { json } from '@sveltejs/kit';
import { pool } from '$lib/db.js';

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        id as "postId",
        vectorized_at IS NOT NULL as "isVectorized",
        COALESCE(chunk_count, 0) as "chunkCount"
      FROM posts
      WHERE published = true
      ORDER BY id
    `);

    return json({
      success: true,
      statuses: result.rows
    });

  } catch (error) {
    console.error('❌ Error fetching vectorization statuses:', error);

    return json({
      success: false,
      error: 'Failed to fetch vectorization statuses'
    }, { status: 500 });
  }
}
