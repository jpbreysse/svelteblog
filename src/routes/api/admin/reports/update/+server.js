import { json } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';

export async function POST({ request, locals }) {
  try {
    // Check if user is authenticated and is admin
    if (!locals.user) {
      return json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    
    if (locals.user.role !== 'admin') {
      return json({ success: false, error: 'Admin access required' }, { status: 403 });
    }
    
    const { reportId, status, adminResponse } = await request.json();
    
    if (!reportId || !status) {
      return json({ success: false, error: 'Report ID and status are required' }, { status: 400 });
    }
    
    // Validate status
    const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      return json({ success: false, error: 'Invalid status' }, { status: 400 });
    }
    
    // Update report status
    const result = userDB.updateContentReportStatus(
      reportId, 
      status, 
      adminResponse, 
      locals.user.id
    );
    
    console.log(`📋 Admin ${locals.user.email} updated report ${reportId} to status: ${status}`);
    
    return json({ 
      success: true, 
      message: `Report status updated to ${status}`,
      status 
    });
    
  } catch (error) {
    console.error('❌ Error updating report status:', error);
    return json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
