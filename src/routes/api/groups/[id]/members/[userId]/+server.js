import { json } from '@sveltejs/kit';
import { groupDB } from '$lib/db.js';

// DELETE /api/groups/[id]/members/[userId] - Remove user from group (admin only)
export async function DELETE({ params, locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({
      success: false,
      error: 'Admin access required'
    }, { status: 403 });
  }

  try {
    const result = await groupDB.removeUserFromGroup(
      parseInt(params.userId),
      parseInt(params.id)
    );

    return json(result);
  } catch (error) {
    console.error('Error removing user from group:', error);

    if (error.message === 'User not in group') {
      return json({
        success: false,
        error: 'User not in group'
      }, { status: 404 });
    }

    return json({
      success: false,
      error: error.message || 'Failed to remove user from group'
    }, { status: 500 });
  }
}
