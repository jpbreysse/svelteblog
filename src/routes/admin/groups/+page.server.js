import { redirect } from '@sveltejs/kit';
import { groupDB } from '$lib/db.js';

export async function load({ locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    throw redirect(302, '/login');
  }

  try {
    const groups = await groupDB.getAllGroups();

    return {
      groups,
      user: locals.user
    };
  } catch (error) {
    console.error('Error loading groups:', error);
    return {
      groups: [],
      error: 'Failed to load groups',
      user: locals.user
    };
  }
}
