import { json } from '@sveltejs/kit';
import { pool } from '$lib/db.js';
import { canAssignPost, getAssignableUsers } from '$lib/server/permissions.js';

/**
 * GET /api/posts/[id]/assign - Get assignable users for a post
 */
export async function GET({ params, locals }) {
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  const postId = parseInt(params.id);

  try {
    // Get current assignment
    const postResult = await pool.query(
      `SELECT p.assigned_to, u.display_name as assigned_name
       FROM posts p
       LEFT JOIN users u ON p.assigned_to = u.id
       WHERE p.id = $1`,
      [postId]
    );

    if (postResult.rows.length === 0) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }

    // Get assignable users (members of write groups)
    const assignableUsers = await getAssignableUsers(postId);

    return json({
      success: true,
      currentAssignment: {
        userId: postResult.rows[0].assigned_to,
        userName: postResult.rows[0].assigned_name
      },
      assignableUsers
    });
  } catch (error) {
    console.error('Error getting assignable users:', error);
    return json({
      success: false,
      error: 'Failed to get assignable users'
    }, { status: 500 });
  }
}

/**
 * POST /api/posts/[id]/assign - Assign post to a user
 * Body: { userId: number } or { userId: null } to unassign
 */
export async function POST({ params, request, locals }) {
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  const postId = parseInt(params.id);

  try {
    const { userId } = await request.json();

    // Check if user can assign
    const canAssign = await canAssignPost(postId, locals.user.id, locals.user.role);
    if (!canAssign) {
      return json({
        success: false,
        error: 'You do not have permission to assign this post'
      }, { status: 403 });
    }

    // Check post exists
    const postCheck = await pool.query(
      'SELECT id, assigned_to FROM posts WHERE id = $1',
      [postId]
    );

    if (postCheck.rows.length === 0) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }

    const previousAssignment = postCheck.rows[0].assigned_to;

    if (userId === null) {
      // Get current assignee before unassigning
      const currentAssignee = postCheck.rows[0].assigned_to;

      // Unassign
      await pool.query(
        'UPDATE posts SET assigned_to = NULL, assigned_at = NULL, assigned_by = NULL WHERE id = $1',
        [postId]
      );

      // Record in history (target_user_id = who was unassigned)
      await pool.query(
        'INSERT INTO post_history (post_id, user_id, action, target_user_id) VALUES ($1, $2, $3, $4)',
        [postId, locals.user.id, 'unassigned', currentAssignee]
      );

      console.log(`📤 Post ${postId} unassigned by user ${locals.user.id}`);

      return json({
        success: true,
        message: 'Post unassigned successfully'
      });
    }

    // Validate that target user can be assigned (is in write groups)
    const assignableUsers = await getAssignableUsers(postId);
    const canBeAssigned = assignableUsers.some(u => u.id === userId);

    // Also allow assigning to author
    const authorCheck = await pool.query(
      'SELECT author_id FROM posts WHERE id = $1',
      [postId]
    );
    const isAuthor = authorCheck.rows[0]?.author_id === userId;

    if (!canBeAssigned && !isAuthor && locals.user.role !== 'admin') {
      return json({
        success: false,
        error: 'User cannot be assigned to this post'
      }, { status: 400 });
    }

    // Assign
    await pool.query(
      'UPDATE posts SET assigned_to = $1, assigned_at = NOW(), assigned_by = $2 WHERE id = $3',
      [userId, locals.user.id, postId]
    );

    // Record in history (target_user_id = who was assigned to)
    await pool.query(
      'INSERT INTO post_history (post_id, user_id, action, target_user_id) VALUES ($1, $2, $3, $4)',
      [postId, locals.user.id, 'assigned', userId]
    );

    // Get assigned user name for response
    const userResult = await pool.query(
      'SELECT display_name FROM users WHERE id = $1',
      [userId]
    );

    console.log(`📥 Post ${postId} assigned to user ${userId} by user ${locals.user.id}`);

    return json({
      success: true,
      message: 'Post assigned successfully',
      assignedTo: {
        userId,
        userName: userResult.rows[0]?.display_name
      }
    });
  } catch (error) {
    console.error('Error assigning post:', error);
    return json({
      success: false,
      error: 'Failed to assign post'
    }, { status: 500 });
  }
}
