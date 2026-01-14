import { json } from '@sveltejs/kit';
import { pool } from '$lib/db.js';

// GET /api/posts/[id]/history - Get edit history for a post
export async function GET({ params, locals }) {
  const postId = parseInt(params.id);

  if (isNaN(postId)) {
    return json({
      success: false,
      error: 'Invalid post ID'
    }, { status: 400 });
  }

  try {
    const result = await pool.query(`
      SELECT
        ph.id,
        ph.action,
        ph.created_at,
        u.id as user_id,
        u.display_name as user_name,
        ph.target_user_id,
        tu.display_name as target_user_name
      FROM post_history ph
      INNER JOIN users u ON ph.user_id = u.id
      LEFT JOIN users tu ON ph.target_user_id = tu.id
      WHERE ph.post_id = $1
      ORDER BY ph.created_at DESC
    `, [postId]);

    return json({
      success: true,
      history: result.rows
    });
  } catch (error) {
    console.error('Error fetching post history:', error);
    return json({
      success: false,
      error: 'Failed to fetch post history'
    }, { status: 500 });
  }
}
