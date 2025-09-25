import { userDB } from '$lib/db.js';
import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
  // Redirect to login if not authenticated
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  // Check if user is admin
  if (locals.user.role !== 'admin') {
    throw redirect(302, '/');
  }

  try {
    // Load all content reports
    const reports = userDB.getAllContentReports();
    
    // Add some statistics
    const stats = {
      total: reports.length,
      pending: reports.filter(r => r.status === 'pending').length,
      reviewed: reports.filter(r => r.status === 'reviewed').length,
      resolved: reports.filter(r => r.status === 'resolved').length,
      dismissed: reports.filter(r => r.status === 'dismissed').length,
      gdpr: reports.filter(r => r.issue_type === 'gdpr_removal').length
    };

    return {
      reports,
      stats
    };
  } catch (error) {
    console.error('Error loading reports:', error);
    return {
      reports: [],
      stats: {
        total: 0,
        pending: 0,
        reviewed: 0,
        resolved: 0,
        dismissed: 0,
        gdpr: 0
      }
    };
  }
}
