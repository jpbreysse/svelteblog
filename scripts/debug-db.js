// scripts/debug-db.js - CORRECTED VERSION
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the project root directory (one level up from scripts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const dbPath = path.join(projectRoot, 'dev.db');

console.log('=== DATABASE DEBUG ===');
console.log('📍 Looking for database at:', dbPath);
console.log('📁 Project root:', projectRoot);
console.log('📂 Current script directory:', __dirname);

// Check if database file exists
if (!fs.existsSync(dbPath)) {
  console.log('❌ Database file does not exist!');
  console.log('💡 Run: node scripts/reset-database.js');
  process.exit(1);
}

try {
  const db = new Database(dbPath);
  
  console.log('✅ Database connection successful');
  
  // Check if table exists
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('📋 Tables found:', tables.map(t => t.name));
  
  if (tables.length === 0) {
    console.log('❌ No tables found in database');
    db.close();
    process.exit(1);
  }
  
  // Check if users table exists
  const usersTable = tables.find(t => t.name === 'users');
  if (!usersTable) {
    console.log('❌ Users table not found');
    db.close();
    process.exit(1);
  }
  
  // Check table schema
  const schema = db.prepare("PRAGMA table_info(users)").all();
  console.log('🏗️  Users table schema:');
  schema.forEach(col => {
    console.log(`   - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
  });
  
  // Check existing users
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get();
  console.log(`👥 Total users in database: ${userCount.count}`);
  
  if (userCount.count > 0) {
    const users = db.prepare("SELECT id, email, first_name, last_name, role, status, created_at FROM users").all();
    console.log('👤 Users:');
    users.forEach(user => {
      console.log(`   - ID: ${user.id}, Email: ${user.email}, Name: ${user.first_name} ${user.last_name}, Role: ${user.role}, Status: ${user.status}`);
    });
    
    // Test admin query
    const admin = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
    console.log('👑 Admin user:', admin ? `Found (${admin.email})` : 'Not found');
    
    // Test pending users
    const pendingUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'pending'").get();
    console.log(`⏳ Pending users: ${pendingUsers.count}`);
    
    // Test approved users
    const approvedUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'approved'").get();
    console.log(`✅ Approved users: ${approvedUsers.count}`);
  } else {
    console.log('📝 No users found in database');
  }
  
  db.close();
  console.log('✅ Database debug complete');
  
} catch (error) {
  console.error('❌ Database error:', error.message);
  console.log('💡 Try running: node scripts/reset-database.js');
  process.exit(1);
}