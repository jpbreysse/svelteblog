import { pool } from '$lib/db.js';
import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
  const userId = locals.user?.id;
  const isAdmin = locals.user?.role === 'admin';

  // Redirect to public posts by default
  throw redirect(302, '/groups/public/posts');
}
