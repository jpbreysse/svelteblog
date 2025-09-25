import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/db.js';
import { hashPassword } from '$lib/auth.js';

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const email = data.get('email');
    const displayName = data.get('display_name');
    const password = data.get('password');
    const confirmPassword = data.get('confirm_password');
    
    const errors = {};
    
    // Validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!displayName || displayName.trim().length < 2) {
      errors.display_name = 'Display name must be at least 2 characters long';
    } else if (displayName.length > 50) {
      errors.display_name = 'Display name must be less than 50 characters';
    } else if (!/^[a-zA-Z0-9\s._-]+$/.test(displayName)) {
      errors.display_name = 'Display name can only contain letters, numbers, spaces, dots, underscores, and hyphens';
    }
    
    if (!password || password.length < 6) {
      errors.password = 'Password must be at least 6 characters long';
    } else if (password.length > 100) {
      errors.password = 'Password is too long (maximum 100 characters)';
    } else if (!/(?=.*[a-zA-Z])/.test(password)) {
      errors.password = 'Password must contain at least one letter';
    }
    
    if (password !== confirmPassword) {
      errors.confirm_password = 'Passwords do not match';
    }
    
    // Check if email already exists
    if (email) {
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existingUser) {
        errors.email = 'An account with this email already exists';
      }
    }
    
    // Check if display name already exists (optional uniqueness check)
    if (displayName) {
      const existingDisplayName = db.prepare('SELECT id FROM users WHERE display_name = ?').get(displayName);
      if (existingDisplayName) {
        errors.display_name = 'This display name is already taken. Please choose another.';
      }
    }
    
    if (Object.keys(errors).length > 0) {
      return fail(400, { 
        errors,
        error: 'Please correct the errors below'
      });
    }
    
    try {
      const hashedPassword = await hashPassword(password);
      
      db.prepare(`
        INSERT INTO users (email, display_name, password_hash)
        VALUES (?, ?, ?)
      `).run(email.trim().toLowerCase(), displayName.trim(), hashedPassword);
      
      throw redirect(303, '/register/success');
    } catch (error) {
      if (error.status === 303) throw error;
      
      return fail(500, {
        errors: { general: 'Failed to create account. Please try again.' }
      });
    }
  }
};
