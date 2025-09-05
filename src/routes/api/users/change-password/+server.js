import { json } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';

export async function POST({ request, locals }) {
  try {
    // Check if user is authenticated
    if (!locals.user) {
      return json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { currentPassword, newPassword, confirmPassword } = await request.json();

    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return json({ 
        success: false, 
        error: 'All fields are required' 
      }, { status: 400 });
    }

    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      return json({ 
        success: false, 
        error: 'New passwords do not match' 
      }, { status: 400 });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return json({ 
        success: false, 
        error: 'New password must be at least 8 characters long' 
      }, { status: 400 });
    }

    // Change the password
    const result = await userDB.changePassword(locals.user.id, currentPassword, newPassword);

    return json({
      success: true,
      message: 'Password changed successfully!'
    });

  } catch (error) {
    console.error('Password change error:', error);
    
    // Return specific error messages
    if (error.message === 'Current password is incorrect') {
      return json({ 
        success: false, 
        error: 'Current password is incorrect' 
      }, { status: 400 });
    }

    return json({ 
      success: false, 
      error: 'Failed to change password. Please try again.' 
    }, { status: 500 });
  }
}
