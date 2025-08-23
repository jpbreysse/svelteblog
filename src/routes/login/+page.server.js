import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/db.js';
import { verifyPassword, createToken } from '$lib/auth.js';

export async function load({ locals }) {
  if (locals.user) {
    throw redirect(303, '/');
  }
  return {};
}



export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = data.get('email')?.toString().trim();
    const password = data.get('password')?.toString();
    
    console.log('🔐 Login attempt for:', email);
    
    const fieldErrors = {};
    
    // Validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldErrors.email = 'Please enter a valid email address';
    }
    
    if (!password || password.length < 1) {
      fieldErrors.password = 'Password is required';
    }
    
    if (Object.keys(fieldErrors).length > 0) {
      return fail(400, { fieldErrors, email });
    }
    
    try {
      // Find user by email - CORRECTED QUERY
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      
      console.log('👤 User found:', user ? `Yes (${user.email}, ${user.role}, ${user.status})` : 'No');
      
      if (!user) {
        console.log('❌ User not found for email:', email);
        return fail(400, {
          error: 'Invalid email or password',
          email
        });
      }
      
      // Check if user is approved
      if (user.status !== 'approved') {
        let message = 'Your account is not approved yet.';
        if (user.status === 'rejected') {
          message = 'Your account has been rejected. Please contact an administrator.';
        } else if (user.status === 'pending') {
          message = 'Your account is pending approval. Please wait for an administrator to approve your account.';
        }
        
        console.log('❌ User not approved:', user.status);
        return fail(400, { error: message, email });
      }
      
      // Verify password
      const isValidPassword = await verifyPassword(password, user.password_hash);
      
      if (!isValidPassword) {
        console.log('❌ Invalid password for user:', email);
        return fail(400, {
          error: 'Invalid email or password',
          email
        });
      }
      
      console.log('✅ Login successful for:', email);
      
      // Create JWT token
      const token = createToken(user);
      
      // Set cookie
      cookies.set('auth_token', token, {
        path: '/',
        httpOnly: true,
        secure: false, // Set to true in production with HTTPS
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7 // 7 days
      });
      
      // Redirect based on role
      const redirectTo = user.role === 'admin' ? '/admin' : '/';
      console.log('🚀 Redirecting to:', redirectTo);
      
      throw redirect(303, redirectTo);
      
    } catch (error) {
      if (error.status === 303) throw error;
      
      console.error('💥 Login error:', error);
      return fail(500, {
        error: 'An error occurred during login. Please try again.',
        email
      });
    }
  }
};
