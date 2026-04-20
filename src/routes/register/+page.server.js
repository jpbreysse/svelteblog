import { fail, redirect } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';
import { hashPassword } from '$lib/auth.js';

export async function load({ locals }) {
  // If already logged in, redirect to home
  if (locals.user) {
    throw redirect(303, '/');
  }
  return {
    user: locals.user || null
  };
}

export const actions = {
  default: async ({ request }) => {
    try {
      const data = await request.formData();
      const email = data.get('email')?.toString().trim();
      const displayName = data.get('display_name')?.toString().trim();
      const password = data.get('password')?.toString();
      const confirmPassword = data.get('confirm_password')?.toString();
      
      console.log('📝 Registration attempt for:', email);
      
      const errors = {};
      
      // Validation
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = 'Please enter a valid email address';
      }
      
      if (!displayName || displayName.length < 2) {
        errors.display_name = 'Display name must be at least 2 characters long';
      }
      
      if (!password || password.length < 6) {
        errors.password = 'Password must be at least 6 characters long';
      }
      
      if (password !== confirmPassword) {
        errors.confirm_password = 'Passwords do not match';
      }
      
      if (Object.keys(errors).length > 0) {
        console.log('⚠️ Validation errors:', Object.keys(errors));
        return fail(400, { 
          errors,
          email,
          displayName
        });
      }
      
      // Hash password
      const passwordHash = await hashPassword(password);
      
      // Check if user already exists
      const existingUser = await userDB.getUserByEmail(email);
      if (existingUser) {
        console.log('⚠️ User already exists:', email);
        return fail(400, {
          errors: { 
            email: 'A user with this email already exists' 
          },
          email,
          displayName
        });
      }
      
      // Create user
      const result = await userDB.createUser({
        email,
        display_name: displayName,
        password_hash: passwordHash
      });
      
      console.log('✅ User created successfully:', result.userId);
      
      throw redirect(303, '/register/success');
      
    } catch (error) {
      // Allow redirects to pass through
      if (error.status === 303) {
        throw error;
      }
      
      console.error('❌ Registration error:', error.message);
      
      return fail(500, {
        errors: { 
          general: error.message || 'An error occurred during registration' 
        }
      });
    }
  }
};
