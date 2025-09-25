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
    
    // Enhanced validation
    if (!email) {
      fieldErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldErrors.email = 'Please enter a valid email address';
    }
    
    if (!password) {
      fieldErrors.password = 'Password is required';
    } else if (password.length < 1) {
      fieldErrors.password = 'Password cannot be empty';
    }
    
    if (Object.keys(fieldErrors).length > 0) {
      console.log('⚠️ Validation failed:', fieldErrors);
      return fail(400, { 
        fieldErrors, 
        email,
        error: 'Please correct the errors below'
      });
    }
    
    try {
      // Find user by email
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
      
      console.log('👤 User lookup:', user ? `Found (${user.email}, ${user.role}, ${user.status})` : 'Not found');
      
      if (!user) {
        console.log('❌ User not found for email:', email);
        // Use generic message to prevent email enumeration
        return fail(400, {
          error: 'Invalid email or password. Please check your credentials and try again.',
          email
        });
      }
      
      // Check account status with specific messages
      if (user.status !== 'approved') {
        let statusMessage;
        
        switch (user.status) {
          case 'pending':
            statusMessage = 'Your account is pending approval. Please wait for an administrator to review your registration.';
            break;
          case 'rejected':
            statusMessage = 'Your account has been rejected. Please contact an administrator for more information.';
            break;
          case 'deletion_requested':
            statusMessage = 'Your account is scheduled for deletion. Please contact an administrator if this is incorrect.';
            break;
          default:
            statusMessage = `Your account status is '${user.status}'. Please contact an administrator.`;
        }
        
        console.log('❌ Account not approved:', user.status);
        return fail(400, { 
          error: statusMessage,
          email 
        });
      }
      
      // Verify password
      console.log('🔑 Verifying password...');
      const isValidPassword = await verifyPassword(password, user.password_hash);
      
      if (!isValidPassword) {
        console.log('❌ Invalid password for user:', email);
        // Use generic message to prevent user enumeration
        return fail(400, {
          error: 'Invalid email or password. Please check your credentials and try again.',
          email
        });
      }
      
      console.log('✅ Login successful for:', email);
      
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
      
      // Determine redirect based on role
      const redirectTo = user.role === 'admin' ? '/admin' : '/blog';
      console.log('🚀 Redirecting to:', redirectTo);
      
      throw redirect(303, redirectTo);
      
    } catch (error) {
      // Don't throw redirect errors
      if (error.status === 303) throw error;
      
      console.error('💥 Login error:', error);
      
      // Provide user-friendly error message
      return fail(500, {
        error: 'Something went wrong during sign in. Please try again in a moment.',
        email
      });
    }
  }
};
