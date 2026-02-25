import { redirect } from '@sveltejs/kit';
import { pool } from '$lib/db.js';

export async function load({ locals }) {
  // Require authentication
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  // Get categories for filter dropdown
  const categoriesResult = await pool.query(`
    SELECT DISTINCT category as value, category as label
    FROM posts
    WHERE published = true AND chunk_count > 0
    ORDER BY category
  `);

  return {
    categories: categoriesResult.rows,
    user: locals.user
  };
}
