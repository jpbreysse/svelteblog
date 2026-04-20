import { json } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';

// Generate a temporary password like "user123"
function generateTempPassword(userName) {
  // Get first part of display name or email, clean it
  const baseName = userName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 6) || 'user';
  // Add random 3-digit number
  const randomNum = Math.floor(100 + Math.random() * 900);
  return `${baseName}${randomNum}`;
}

export async function POST({ request, locals }) {
  try {
    // Check if user is authenticated and is admin
    if (!locals.user || locals.user.role !== 'admin') {
      return json({ 
        success: false, 
        error: 'Admin access required' 
      }, { status: 403 });
    }

    const { userId } = await request.json();

    // Validate input
    if (!userId) {
      return json({ 
        success: false, 
        error: 'User ID is required' 
      }, { status: 400 });
    }

    // Get user info to generate password
    const user = await userDB.getUserById(userId);
    
    if (!user) {
      return json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 404 });
    }

    // Generate temporary password
    const tempPassword = generateTempPassword(user.display_name);

    // Reset the password
    const result = await userDB.resetUserPassword(locals.user.id, userId, tempPassword);

    return json({
      success: true,
      message: 'Password reset successfully!',
      tempPassword: tempPassword,
      userEmail: result.userEmail,
      displayName: result.displayName
    });

  } catch (error) {
    console.error('❌ Admin password reset error:', error);
    
    return json({ 
      success: false, 
      error: error.message || 'Failed to reset password. Please try again.' 
    }, { status: 500 });
  }
}