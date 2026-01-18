import { redirect } from '@sveltejs/kit';
import { categoryDB } from '$lib/db.js';

export async function load({ locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    throw redirect(302, '/login');
  }

  try {
    const categories = await categoryDB.getAllCategories();

    return {
      categories,
      user: locals.user
    };
  } catch (error) {
    console.error('Error loading categories:', error);
    return {
      categories: [],
      error: 'Failed to load categories',
      user: locals.user
    };
  }
}
