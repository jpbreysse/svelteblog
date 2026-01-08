import { json } from '@sveltejs/kit';
import { groupDB } from '$lib/db.js';

// GET /api/groups/[id]/members - Get all members of a group
export async function GET({ params, locals }) {
  // Require authentication
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  try {
    const members = await groupDB.getUsersInGroup(parseInt(params.id));

    return json({
      success: true,
      members
    });
  } catch (error) {
    console.error('Error fetching group members:', error);
    return json({
      success: false,
      error: 'Failed to fetch group members'
    }, { status: 500 });
  }
}

// POST /api/groups/[id]/members - Add user to group (admin only)
export async function POST({ params, request, locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({
      success: false,
      error: 'Admin access required'
    }, { status: 403 });
  }

  try {
    const { userId } = await request.json();

    if (!userId) {
      return json({
        success: false,
        error: 'User ID is required'
      }, { status: 400 });
    }

    const result = await groupDB.addUserToGroup(parseInt(userId), parseInt(params.id));

    return json(result);
  } catch (error) {
    console.error('Error adding user to group:', error);

    if (error.message === 'User not found') {
      return json({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }

    if (error.message === 'Group not found') {
      return json({
        success: false,
        error: 'Group not found'
      }, { status: 404 });
    }

    return json({
      success: false,
      error: error.message || 'Failed to add user to group'
    }, { status: 500 });
  }
}
