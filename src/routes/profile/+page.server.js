import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
  // Redirect to login if not authenticated
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  return {
    user: locals.user
  };
}
