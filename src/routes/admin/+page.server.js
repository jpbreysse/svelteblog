import { redirect, error, fail } from '@sveltejs/kit';
import { userDB, blogDB, pathsDB, pool } from '$lib/db.js';

export async function load({ locals }) {
  console.log('🏛️  Admin page load - User:', locals.user?.email);
  
  // Check if user exists
  if (!locals.user) {
    console.log('❌ No user in locals - redirecting to home');
    throw redirect(303, '/');
  }
  
  // Check if user is admin
  if (locals.user.role !== 'admin') {
    console.log('❌ User is not admin:', locals.user.role);
    throw error(403, 'Admin access required');
  }
  
  console.log('✅ Admin access granted');
  
  try {
    // ✅ Get all users for user management
    const usersResult = await pool.query(`
      SELECT 
        id, email, display_name, role, status, created_at
      FROM users 
      ORDER BY created_at DESC
    `);
    const users = usersResult.rows;

    // ✅ Get blog statistics
    const stats = await blogDB.getStats();

    // ✅ Get path statistics
    const pathStats = await pathsDB.getPathStatistics();

    // ✅ Get report statistics (with await)
    const reports = await userDB.getAllContentReports();
    
    const reportStats = {
      total: reports.length,
      pending: reports.filter(r => r.status === 'pending').length,
      reviewed: reports.filter(r => r.status === 'reviewed').length,
      resolved: reports.filter(r => r.status === 'resolved').length
    };

    // ✅ Get post statistics for nav
    const postStats = {
      total: stats.total_posts,
      published: stats.published_posts
    };

    console.log('📊 Dashboard data loaded:');
    console.log('   Users:', users.length);
    console.log('   Posts:', stats.published_posts, 'published,', stats.total_posts, 'total');
    console.log('   Reports:', reportStats.pending, 'pending,', reportStats.total, 'total');
    console.log('   Paths:', pathStats.total_paths, 'total');

    return {
      users,
      stats,
      reportStats,
      postStats,
      pathStats,
      user: locals.user
    };
  } catch (error) {
    console.error('❌ Error loading admin dashboard:', error.message);
    throw error(500, 'Failed to load dashboard data');
  }
}

export const actions = {
  // Approve user
  approve: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') {
      return fail(403, { error: 'Admin access required' });
    }

    try {
      const data = await request.formData();
      const userId = parseInt(data.get('user_id'));

      console.log('✅ Approving user:', userId);

      // Update user status to approved
      const result = await pool.query(
        'UPDATE users SET status = $1, approved_by = $2, approved_at = NOW() WHERE id = $3 RETURNING id, email',
        ['approved', locals.user.id, userId]
      );

      if (result.rowCount === 0) {
        return fail(404, { error: 'User not found' });
      }

      console.log('✅ User approved:', result.rows[0].email);

      return { success: true, message: 'User approved' };
    } catch (error) {
      console.error('❌ Error approving user:', error.message);
      return fail(500, { error: error.message });
    }
  },

  // Reject user
  reject: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') {
      return fail(403, { error: 'Admin access required' });
    }

    try {
      const data = await request.formData();
      const userId = parseInt(data.get('user_id'));

      console.log('🚫 Rejecting user:', userId);

      // Update user status to rejected
      const result = await pool.query(
        'UPDATE users SET status = $1, approved_by = $2, approved_at = NOW() WHERE id = $3 RETURNING id, email',
        ['rejected', locals.user.id, userId]
      );

      if (result.rowCount === 0) {
        return fail(404, { error: 'User not found' });
      }

      console.log('✅ User rejected:', result.rows[0].email);

      return { success: true, message: 'User rejected' };
    } catch (error) {
      console.error('❌ Error rejecting user:', error.message);
      return fail(500, { error: error.message });
    }
  }
};
