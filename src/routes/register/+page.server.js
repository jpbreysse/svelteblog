import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/db.js';
import { hashPassword } from '$lib/auth.js';

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const email = data.get('email');
    const firstName = data.get('first_name');
    const lastName = data.get('last_name');
    const password = data.get('password');
    const confirmPassword = data.get('confirm_password');
    
    const errors = {};
    
    // Validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!firstName || firstName.length < 2) {
      errors.first_name = 'First name must be at least 2 characters';
    }
    
    if (!lastName || lastName.length < 2) {
      errors.last_name = 'Last name must be at least 2 characters';
    }
    
    if (!password || password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
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
    
    if (Object.keys(errors).length > 0) {
      return fail(400, { errors });
    }
    
    try {
      const hashedPassword = await hashPassword(password);
      
      db.prepare(`
        INSERT INTO users (email, first_name, last_name, password_hash)
        VALUES (?, ?, ?, ?)
      `).run(email, firstName, lastName, hashedPassword);
      
      throw redirect(303, '/register/success');
    } catch (error) {
      if (error.status === 303) throw error;
      
      return fail(500, {
        errors: { general: 'Failed to create account. Please try again.' }
      });
    }
  }
};