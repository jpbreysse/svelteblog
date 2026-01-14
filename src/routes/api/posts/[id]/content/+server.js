import { json } from '@sveltejs/kit';
import { blogDB, pool } from '$lib/db.js';
import { canWritePost, canClosePost, canAssignPost, getAssignableUsers } from '$lib/server/permissions.js';

/**
 * GET /api/posts/[id]/content
 * Get post content with children and breadcrumbs
 * Used for dynamic loading in Explorer view
 */
export async function GET({ params, locals }) {
  try {
    const postId = parseInt(params.id);

    // Get post with children
    const post = await blogDB.getPostWithChildren(postId);

    if (!post) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }

    // Get breadcrumbs
    const breadcrumbs = await blogDB.getPostBreadcrumbs(postId);

    // Check permissions
    const userId = locals.user?.id || null;
    const userRole = locals.user?.role || 'user';
    const canWrite = await canWritePost(postId, userId, userRole);
    const canClose = await canClosePost(postId, userId, userRole);
    const canAssign = await canAssignPost(postId, userId, userRole);

    // Get assigned user name if assigned
    let assignedUser = null;
    if (post.assigned_to) {
      const assignedResult = await pool.query(
        'SELECT id, display_name FROM users WHERE id = $1',
        [post.assigned_to]
      );
      if (assignedResult.rows.length > 0) {
        assignedUser = {
          id: assignedResult.rows[0].id,
          name: assignedResult.rows[0].display_name
        };
      }
    }

    // Get closed by user name if closed
    let closedByUser = null;
    if (post.closed_by) {
      const closedByResult = await pool.query(
        'SELECT id, display_name FROM users WHERE id = $1',
        [post.closed_by]
      );
      if (closedByResult.rows.length > 0) {
        closedByUser = {
          id: closedByResult.rows[0].id,
          name: closedByResult.rows[0].display_name
        };
      }
    }

    // Get assignable users if user can assign
    let assignableUsers = [];
    if (canAssign) {
      assignableUsers = await getAssignableUsers(postId);
    }

    return json({
      success: true,
      post: {
        ...post,
        can_write: canWrite,
        can_close: canClose,
        can_assign: canAssign,
        assigned_user: assignedUser,
        closed_by_user: closedByUser,
        assignable_users: assignableUsers
      },
      breadcrumbs
    });
  } catch (error) {
    console.error('Error fetching post content:', error);
    return json({
      success: false,
      error: 'Failed to fetch post content'
    }, { status: 500 });
  }
}
