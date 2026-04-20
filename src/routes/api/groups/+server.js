import { json } from '@sveltejs/kit';
import { groupDB } from '$lib/db.js';

// GET /api/groups - Get all groups
export async function GET({ locals }) {
  // Require authentication
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  try {
    const groups = await groupDB.getAllGroups();

    return json({
      success: true,
      groups
    });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return json({
      success: false,
      error: 'Failed to fetch groups'
    }, { status: 500 });
  }
}

// POST /api/groups - Create new group (admin only)
export async function POST({ request, locals }) {
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

    const result = await groupDB.createGroup({
      name: groupData.name.trim(),
      description: groupData.description?.trim() || ''
    });

    return json(result);
  } catch (error) {
    console.error('Error creating group:', error);

    // Handle unique constraint violation
    if (error.code === '23505') {
      return json({
        success: false,
        error: 'Group name already exists'
      }, { status: 400 });
    }

    return json({
      success: false,
      error: error.message || 'Failed to create group'
    }, { status: 500 });
  }
}
