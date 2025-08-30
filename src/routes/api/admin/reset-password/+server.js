import { json } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';

export async function POST({ request, locals }) {
  try {
    // Check if user is authenticated and is admin
    if (!locals.user || locals.user.role !== 'admin') {
      return json({ 
        success: false, 
        error: 'Admin access required' 
      }, { status: 403 });
    }

    const { userId, newPassword } = await request.json();

    // Validate input
    if (!userId || !newPassword) {
      return json({ 
        success: false, 
        error: 'User ID and new password are required' 
      }, { status: 400 });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return json({ 
        success: false, 
        error: 'New password must be at least 8 characters long' 
      }, { status: 400 });
    }

    // Reset the password
    const result = await userDB.resetUserPassword(locals.user.id, userId, newPassword);

    return json({
      success: true,
      message: 'Password reset successfully!'
    });

  } catch (error) {
    console.error('Admin password reset error:', error);
    
    return json({ 
      success: false, 
      error: error.message || 'Failed to reset password. Please try again.' 
    }, { status: 500 });
  }
}
