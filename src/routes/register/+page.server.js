import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/db.js';
import { hashPassword } from '$lib/auth.js';

console.log('✅ SERVER FILE EXECUTING');
console.log('🔍 Environment check:');
console.log('  - NODE_ENV:', process.env.NODE_ENV);
console.log('  - SvelteKit dev mode:', process.env.NODE_ENV === 'development');

// Check which database file is actually being used
try {
  const dbInfo = db.prepare('PRAGMA database_list').all();
  console.log('📊 Database file info:', dbInfo);
  
  const tableInfo = db.prepare("PRAGMA table_info(users)").all();
  console.log('📊 Users table columns:', tableInfo.map(col => col.name));
  
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  console.log('📊 Total users in database:', userCount.count);
} catch (dbError) {
  console.error('❌ Database check error:', dbError);
}

// Check and update database schema for production
try {
  const tableInfo = db.prepare("PRAGMA table_info(users)").all();
  const hasDisplayName = tableInfo.some(col => col.name === 'display_name');
  const hasFirstName = tableInfo.some(col => col.name === 'first_name');
  
  console.log('📊 Database schema check:');
  console.log('  - Has display_name:', hasDisplayName);
  console.log('  - Has first_name:', hasFirstName);
  
  if (!hasDisplayName && hasFirstName) {
    console.log('🔄 Migrating database schema from first_name/last_name to display_name...');
    
    // Add display_name column
    db.exec(`ALTER TABLE users ADD COLUMN display_name TEXT`);
    
    // Migrate existing data
    const users = db.prepare('SELECT id, first_name, last_name FROM users WHERE first_name IS NOT NULL').all();
    console.log(`🔄 Migrating ${users.length} existing users...`);
    
    const updateStmt = db.prepare('UPDATE users SET display_name = ? WHERE id = ?');
    for (const user of users) {
      const displayName = `${user.first_name} ${user.last_name}`.trim();
      updateStmt.run(displayName, user.id);
    }
    
    console.log('✅ Database migration completed!');
  } else if (hasDisplayName) {
    console.log('✅ Database schema is up to date');
  }
} catch (migrationError) {
  console.error('❌ Database migration error:', migrationError);
}

export async function load({ locals }) {
  console.log('✅ LOAD FUNCTION CALLED');
  return {
    user: locals.user || null
  };
}

export const actions = {
  default: async ({ request }) => {
    console.log('✅ ACTION CALLED - Environment:', process.env.NODE_ENV);
    console.log('✅ Current working directory:', process.cwd());
    
    try {
      const data = await request.formData();
      const email = data.get('email');
      const displayName = data.get('display_name');
      const password = data.get('password');
      const confirmPassword = data.get('confirm_password');
      
      console.log('Form data received:', { email, displayName, password: '***' });
      
      const errors = {};
      
      // Basic validation
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = 'Please enter a valid email address';
      }
      
      if (!displayName || displayName.trim().length < 2) {
        errors.display_name = 'Display name must be at least 2 characters long';
      }
      
      if (!password || password.length < 6) {
        errors.password = 'Password must be at least 6 characters long';
      }
      
      if (password !== confirmPassword) {
        errors.confirm_password = 'Passwords do not match';
      }
      
      if (Object.keys(errors).length > 0) {
        console.log('Validation errors:', errors);
        return fail(400, { 
          errors,
          error: 'Please correct the errors below'
        });
      }
      
      console.log('✅ Validation passed, attempting to hash password...');
      
      const hashedPassword = await hashPassword(password);
      console.log('✅ Password hashed successfully');
      
      console.log('✅ Attempting database insert...');
      console.log('✅ Database file exists:', db ? 'yes' : 'no');
      
      // Test database connection first
      try {
        const testQuery = db.prepare('SELECT COUNT(*) as count FROM users').get();
        console.log('✅ Database connection test passed, existing users:', testQuery.count);
      } catch (dbTestError) {
        console.error('💥 Database connection test failed:', dbTestError.message);
        throw new Error(`Database connection failed: ${dbTestError.message}`);
      }
      
      // Check if user already exists
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ? OR display_name = ?').get(email.trim().toLowerCase(), displayName.trim());
      if (existingUser) {
        console.log('💥 User already exists with that email or display name');
        return fail(400, {
          errors: { general: 'A user with that email or display name already exists' }
        });
      }
      
      // Use clean INSERT statement with only display_name
      const insertStatement = db.prepare(`
        INSERT INTO users (email, display_name, password_hash)
        VALUES (?, ?, ?)
      `);
      
      const result = insertStatement.run(email.trim().toLowerCase(), displayName.trim(), hashedPassword);
      console.log('✅ Database insert successful, new user ID:', result.lastInsertRowid);
      console.log('✅ Redirecting to success page...');
      
      throw redirect(303, '/register/success');
      
    } catch (error) {
      // Handle redirect separately from actual errors
      if (error.status === 303) {
        console.log('✅ Successful redirect to success page');
        throw error;
      }
      
      console.error('💥 Actual registration error:');
      console.error('💥 Error type:', error.constructor.name);
      console.error('💥 Error message:', error.message);
      console.error('💥 Error stack:', error.stack);
      
      return fail(500, {
        errors: { general: `Server error: ${error.message}` }
      });
    }
  }
};
