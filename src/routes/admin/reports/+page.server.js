import { redirect, error, fail } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';

export async function load({ locals }) {
  console.log('📋 Admin reports page load - User:', locals.user?.email);
  
  // Redirect to login if not authenticated
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  // Check if user is admin
  if (locals.user.role !== 'admin') {
    console.log('❌ User is not admin:', locals.user.role);
    throw error(403, 'Admin access required');
  }

  console.log('✅ Admin reports access granted');

  try {
    // ✅ FIXED: Added await to getAllContentReports()
    const reports = await userDB.getAllContentReports();
    
    // Add some statistics
    const stats = {
      total: reports.length,
      pending: reports.filter(r => r.status === 'pending').length,
      reviewed: reports.filter(r => r.status === 'reviewed').length,
      resolved: reports.filter(r => r.status === 'resolved').length,
      dismissed: reports.filter(r => r.status === 'dismissed').length,
      gdpr: reports.filter(r => r.issue_type === 'gdpr_removal').length
    };

    console.log('📊 Reports loaded:', stats);

    return {
      reports,
      stats
    };
  } catch (error) {
    console.error('❌ Error loading reports:', error.message);
    throw error(500, 'Failed to load reports');
  }
}

export const actions = {
  // Update report status
  updateStatus: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') {
      return fail(403, { error: 'Admin access required' });
    }

    try {
      const data = await request.formData();
      const reportId = parseInt(data.get('report_id'));
      const status = data.get('status');
      const response = data.get('response') || null;

      console.log('🔄 Updating report:', reportId, 'status:', status);

      // Validate status
      const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
      if (!validStatuses.includes(status)) {
        return fail(400, { error: 'Invalid status' });
      }

      // ✅ FIXED: Update report with await
      await userDB.updateContentReportStatus(
        reportId,
        status,
        response,
        locals.user.id
      );

      console.log('✅ Report status updated');

      return { success: true, message: 'Report updated successfully' };
    } catch (error) {
      console.error('❌ Error updating report:', error.message);
      return fail(500, { error: error.message });
    }
  }
};
