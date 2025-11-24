import { json } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';
import { verifyPassword, createToken } from '$lib/auth.js';

export async function POST({ request, cookies }) {
  try {
    const { email, password } = await request.json();

    console.log('🔐 API Login attempt for:', email);

    // Validation
    if (!email || !password) {
      return json({
        success: false,
        error: 'Email and password are required'
      }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({
        success: false,
        error: 'Please enter a valid email address'
      }, { status: 400 });
    }

    // Find user by email
    const user = await userDB.getUserByEmail(email);

    console.log('👤 User lookup:', user ? `Found (${user.email}, ${user.role}, ${user.status})` : 'Not found');

    if (!user) {
      console.log('❌ User not found for email:', email);
      return json({
        success: false,
        error: 'Invalid credentials'
      }, { status: 401 });
    }

    // Check account status
    if (user.status !== 'approved') {
      let statusMessage;

      switch (user.status) {
        case 'pending':
          statusMessage = 'Account pending approval';
          break;
        case 'rejected':
          statusMessage = 'Account has been rejected';
          break;
        case 'deletion_requested':
          statusMessage = 'Account is scheduled for deletion';
          break;
        default:
          statusMessage = `Account status: ${user.status}`;
      }

      console.log('❌ Account not approved:', user.status);
      return json({
        success: false,
        error: statusMessage
      }, { status: 403 });
    }

    // Verify password
    console.log('🔑 Verifying password...');
    const isValidPassword = await verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      console.log('❌ Invalid password for user:', email);
      return json({
        success: false,
        error: 'Invalid credentials'
      }, { status: 401 });
    }

    console.log('✅ API Login successful for:', email);

    // Create JWT token
    const token = createToken(user);

    // Set secure cookie
    cookies.set('auth_token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    // Return success with user info
    return json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        status: user.status
      }
    });

  } catch (error) {
    console.error('💥 API Login error:', error.message);

    return json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
