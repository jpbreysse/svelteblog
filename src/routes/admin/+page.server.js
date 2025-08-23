import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db.js';

export async function load({ locals }) {
  console.log('🏛️  Admin page load - User:', locals.user);
  
  // Check if user exists
  if (!locals.user) {
    console.log('❌ No user in locals - redirecting to home');
    throw redirect(303, '/');
  }
  
  // Check if user is admin
  if (locals.user.role !== 'admin') {
    console.log('❌ User is not admin:', locals.user.role);
    throw redirect(303, '/');
  }
  
  console.log('✅ Admin access granted');
  
  const users = db.prepare(`
    SELECT 
      id, email, first_name, last_name, status, role, created_at,
      approved_at, approved_by
    FROM users 
    ORDER BY created_at DESC
  `).all();
  
  return { users };
}