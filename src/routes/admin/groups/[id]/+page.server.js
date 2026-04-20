import { redirect, error } from '@sveltejs/kit';
import { groupDB } from '$lib/db.js';

export async function load({ params, locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    throw redirect(302, '/login');
  }

  try {
    const groupId = parseInt(params.id);

    // Load group details
    const group = await groupDB.getGroupById(groupId);

    if (!group) {
      throw error(404, 'Group not found');
    }

    // Load group members
    const members = await groupDB.getUsersInGroup(groupId);

    // Load all users for the add member dropdown
    const allUsersResult = await groupDB.getAllUsersWithGroups();

    // Filter out users already in this group
    const memberIds = new Set(members.map(m => m.id));
    const availableUsers = allUsersResult.filter(u => !memberIds.has(u.id));

    return {
      group,
      members,
      availableUsers,
      user: locals.user
    };
  } catch (err) {
    if (err.status === 404) {
      throw err;
    }
    console.error('Error loading group details:', err);
    throw error(500, 'Failed to load group details');
  }
}
