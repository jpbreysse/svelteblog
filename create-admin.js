import { pool, userDB } from './src/lib/db.js';
import { hashPassword } from './src/lib/auth.js';

async function createAdmin() {
  try {
    console.log('🔧 Creating admin user...');

    const email = 'admin@example.com';
    const displayName = 'Administrator';
    const password = 'oracle';

    // Check if user already exists
    const existingUser = await userDB.getUserByEmail(email);
    if (existingUser) {
      console.log('⚠️  Admin user already exists:', email);
      console.log('   User ID:', existingUser.id);
      console.log('   Status:', existingUser.status);
      console.log('   Role:', existingUser.role);

      // Update to admin if not already
      if (existingUser.role !== 'admin' || existingUser.status !== 'approved') {
        await pool.query(
          `UPDATE users SET role = 'admin', status = 'approved' WHERE id = $1`,
          [existingUser.id]
        );
        console.log('✅ Updated existing user to admin status');
      }

      process.exit(0);
    }

    // Hash password
    console.log('🔐 Hashing password...');
    const passwordHash = await hashPassword(password);

    // Create admin user
    console.log('👤 Creating user in database...');
    const result = await pool.query(`
      INSERT INTO users (email, display_name, password_hash, role, status, approved_at)
      VALUES ($1, $2, $3, 'admin', 'approved', CURRENT_TIMESTAMP)
      RETURNING id, email, display_name, role, status
    `, [email, displayName, passwordHash]);

    const user = result.rows[0];

    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log('📋 Login credentials:');
    console.log('   Email:', user.email);
    console.log('   Password: oracle');
    console.log('   Role:', user.role);
    console.log('   Status:', user.status);
    console.log('');
    console.log('🌐 You can now login at: http://localhost:5173/login');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    console.error('   Details:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

createAdmin();
