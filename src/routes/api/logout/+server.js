import { json, redirect } from '@sveltejs/kit';

export async function POST({ cookies }) {
  // Clear the auth token cookie
  cookies.delete('auth_token', { path: '/' });
  
  return json({ success: true });
}