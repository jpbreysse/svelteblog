import { json } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';

export async function POST({ request, getClientAddress }) {
  try {
    const reportData = await request.json();
    
    // Validate required fields
    if (!reportData.issueType || !reportData.description || !reportData.agreedToProcess) {
      return json({ 
        success: false, 
        error: 'Missing required fields' 
      }, { status: 400 });
    }
    
    // Validate issue type
    const validIssueTypes = [
      'inappropriate', 'copyright', 'gdpr_removal', 'privacy', 
      'spam', 'misinformation', 'harassment', 'other'
    ];
    
    if (!validIssueTypes.includes(reportData.issueType)) {
      return json({ 
        success: false, 
        error: 'Invalid issue type' 
      }, { status: 400 });
    }
    
    // Get client IP for logging (anonymized)
    const clientIP = getClientAddress();
    const anonymizedIP = clientIP.split('.').slice(0, 3).join('.') + '.xxx';
    
    // Prepare report data for database
    const report = {
      issue_type: reportData.issueType,
      description: reportData.description.trim(),
      reporter_email: reportData.email?.trim() || null,
      post_id: reportData.postId || null,
      post_title: reportData.postTitle || null,
      post_url: reportData.postUrl || null,
      reporter_ip: anonymizedIP,
      user_agent: reportData.userAgent || null,
      created_at: new Date().toISOString(),
      status: 'pending'
    };
    
    // Save to database
    const result = await userDB.createContentReport(report);
    
    // For GDPR requests, also notify immediately (in real implementation, 
    // you'd send email to admin or create high-priority ticket)
    if (reportData.issueType === 'gdpr_removal') {
      console.log('🚨 GDPR REMOVAL REQUEST:', {
        id: result.reportId,
        post: reportData.postTitle,
        description: reportData.description
      });
    }
    
    return json({
      success: true,
      message: 'Report submitted successfully',
      reportId: result.reportId
    });
    
  } catch (error) {
    console.error('Error creating content report:', error);
    return json({ 
      success: false, 
      error: 'Failed to submit report' 
    }, { status: 500 });
  }
}