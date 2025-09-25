import { redirect } from '@sveltejs/kit';
import { db, userDB } from '$lib/db.js';

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
      id, email, display_name, status, role, created_at,
      approved_at, approved_by
    FROM users 
    ORDER BY created_at DESC
  `).all();
  
  // Get post statistics
  let postStats = { total: 0, published: 0, drafts: 0, withReports: 0 };
  try {
    const posts = db.prepare('SELECT published FROM posts').all();
    const reportsWithPosts = db.prepare(`
      SELECT DISTINCT post_id FROM content_reports 
      WHERE status = 'pending' AND post_id IS NOT NULL
    `).all();
    
    postStats = {
      total: posts.length,
      published: posts.filter(p => p.published).length,
      drafts: posts.filter(p => !p.published).length,
      withReports: reportsWithPosts.length
    };
  } catch (error) {
    console.error('Error loading post stats:', error);
  }
  
  // Get report statistics
  let reportStats = { pending: 0, total: 0 };
  try {
    const reports = userDB.getAllContentReports();
    reportStats = {
      total: reports.length,
      pending: reports.filter(r => r.status === 'pending').length
    };
  } catch (error) {
    console.error('Error loading report stats:', error);
  }
  
  return { users, postStats, reportStats };
}
