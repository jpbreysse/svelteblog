import { json } from '@sveltejs/kit';
import { groupDB } from '$lib/db.js';

// GET /api/groups/[id] - Get single group
export async function GET({ params, locals }) {
  // Require authentication
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  try {
    const group = await groupDB.getGroupById(parseInt(params.id));

    if (!group) {
      return json({
        success: false,
        error: 'Group not found'
      }, { status: 404 });
    }

    return json({
      success: true,
      group
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    return json({
      success: false,
      error: 'Failed to fetch group'
    }, { status: 500 });
  }
}

// PUT /api/groups/[id] - Update group (admin only)
export async function PUT({ params, request, locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({
      success: false,
      error: 'Admin access required'
    }, { status: 403 });
  }

  try {
    const groupData = await request.json();

    // Validate input
    if (!groupData.name?.trim()) {
      return json({
        success: false,
        error: 'Group name is required'
      }, { status: 400 });
    }

    const result = await groupDB.updateGroup(parseInt(params.id), {
      name: groupData.name.trim(),
      description: groupData.description?.trim() || ''
    });

    return json(result);
  } catch (error) {
    console.error('Error updating group:', error);

    if (error.message === 'Group not found') {
      return json({
        success: false,
        error: 'Group not found'
      }, { status: 404 });
    }

    // Handle unique constraint violation
    if (error.code === '23505') {
      return json({
        success: false,
        error: 'Group name already exists'
      }, { status: 400 });
    }

    return json({
      success: false,
      error: error.message || 'Failed to update group'
    }, { status: 500 });
  }
}

// DELETE /api/groups/[id] - Delete group (admin only)
export async function DELETE({ params, locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({
      success: false,
      error: 'Admin access required'
    }, { status: 403 });
  }

  try {
    const result = await groupDB.deleteGroup(parseInt(params.id));

    return json(result);
  } catch (error) {
    console.error('Error deleting group:', error);

    if (error.message === 'Group not found') {
      return json({
        success: false,
        error: 'Group not found'
      }, { status: 404 });
    }

    return json({
      success: false,
      error: error.message || 'Failed to delete group'
    }, { status: 500 });
  }
}
