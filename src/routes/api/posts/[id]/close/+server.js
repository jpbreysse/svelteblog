import { json } from '@sveltejs/kit';
import { pool } from '$lib/db.js';
import { canClosePost } from '$lib/server/permissions.js';

/**
 * POST /api/posts/[id]/close - Close a post/ticket
 */
export async function POST({ params, locals }) {
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  const postId = parseInt(params.id);

  try {
    // Check if user can close this post
    const canClose = await canClosePost(postId, locals.user.id, locals.user.role);
    if (!canClose) {
      return json({
        success: false,
        error: 'You do not have permission to close this post'
      }, { status: 403 });
    }

    // Check if already closed
    const checkResult = await pool.query(
      'SELECT closed_at FROM posts WHERE id = $1',
      [postId]
    );

    if (checkResult.rows.length === 0) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }

    if (checkResult.rows[0].closed_at) {
      return json({
        success: false,
        error: 'Post is already closed'
      }, { status: 400 });
    }

    // Close the post
    await pool.query(
      'UPDATE posts SET closed_at = NOW(), closed_by = $1 WHERE id = $2',
      [locals.user.id, postId]
    );

    // Record in history
    await pool.query(
      'INSERT INTO post_history (post_id, user_id, action) VALUES ($1, $2, $3)',
      [postId, locals.user.id, 'closed']
    );

    console.log(`🔒 Post ${postId} closed by user ${locals.user.id}`);

    return json({
      success: true,
      message: 'Post closed successfully'
    });
  } catch (error) {
    console.error('Error closing post:', error);
    return json({
      success: false,
      error: 'Failed to close post'
    }, { status: 500 });
  }
}

/**
 * DELETE /api/posts/[id]/close - Reopen a post/ticket
 */
export async function DELETE({ params, locals }) {
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  const postId = parseInt(params.id);

  try {
    // Check if user can reopen (same permission as close)
    const canClose = await canClosePost(postId, locals.user.id, locals.user.role);
    if (!canClose) {
      return json({
        success: false,
        error: 'You do not have permission to reopen this post'
      }, { status: 403 });
    }

    // Check if actually closed
    const checkResult = await pool.query(
      'SELECT closed_at FROM posts WHERE id = $1',
      [postId]
    );

    if (checkResult.rows.length === 0) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }

    if (!checkResult.rows[0].closed_at) {
      return json({
        success: false,
        error: 'Post is not closed'
      }, { status: 400 });
    }

    // Reopen the post
    await pool.query(
      'UPDATE posts SET closed_at = NULL, closed_by = NULL WHERE id = $1',
      [postId]
    );

    // Record in history
    await pool.query(
      'INSERT INTO post_history (post_id, user_id, action) VALUES ($1, $2, $3)',
      [postId, locals.user.id, 'reopened']
    );

    console.log(`🔓 Post ${postId} reopened by user ${locals.user.id}`);

    return json({
      success: true,
      message: 'Post reopened successfully'
    });
  } catch (error) {
    console.error('Error reopening post:', error);
    return json({
      success: false,
      error: 'Failed to reopen post'
    }, { status: 500 });
  }
}
