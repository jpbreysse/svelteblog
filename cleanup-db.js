// Simple database cleanup script
// Run this manually to fix the production database

import Database from 'better-sqlite3';

const db = new Database('prod.db');

console.log('🔍 Current schema:');
const currentSchema = db.prepare("PRAGMA table_info(users)").all();
console.log(currentSchema.map(col => `${col.name}${col.notnull ? ' NOT NULL' : ''}`));

console.log('\n🔄 Creating new clean users table...');

// Drop any existing temp tables first
try {
  db.exec('DROP TABLE IF EXISTS users_new');
  db.exec('DROP TABLE IF EXISTS users_backup');
  console.log('🗑️ Cleaned up any existing temp tables');
} catch (e) {
  // Ignore errors if tables don't exist
}

// Create the new clean table
db.exec(`
  CREATE TABLE users_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'deletion_requested')),
    role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    approved_by INTEGER,
    deletion_requested_at DATETIME,
    deletion_reason TEXT
  )
`);

console.log('🔄 Copying data (only the columns we need)...');

// Check which columns actually exist in the current table
const existingColumns = db.prepare("PRAGMA table_info(users)").all().map(col => col.name);
console.log('📊 Available columns:', existingColumns);

// Build the INSERT and SELECT statements dynamically based on existing columns
const requiredColumns = ['id', 'email', 'display_name', 'password_hash'];
const optionalColumns = ['status', 'role', 'created_at', 'approved_at', 'approved_by', 'deletion_requested_at', 'deletion_reason'];

// Find which columns we can actually copy
const columnsToCopy = [];
const columnsToSelect = [];

// Add required columns (these must exist)
for (const col of requiredColumns) {
  if (existingColumns.includes(col)) {
    columnsToCopy.push(col);
    columnsToSelect.push(col);
  } else {
    console.log(`⚠️ Required column missing: ${col}`);
  }
}

// Add optional columns that exist
for (const col of optionalColumns) {
  if (existingColumns.includes(col)) {
    columnsToCopy.push(col);
    columnsToSelect.push(col);
    console.log(`✅ Including optional column: ${col}`);
  } else {
    console.log(`⏩ Skipping missing column: ${col}`);
  }
}

console.log('📋 Copying columns:', columnsToCopy);

// Copy only the data we can actually get
const insertSQL = `
  INSERT INTO users_new (${columnsToCopy.join(', ')})
  SELECT ${columnsToSelect.join(', ')}
  FROM users
`;

console.log('📝 SQL:', insertSQL);
db.exec(insertSQL);

console.log('🔄 Backing up old table and switching...');

// Backup old table and switch to new one
db.exec('ALTER TABLE users RENAME TO users_backup');
db.exec('ALTER TABLE users_new RENAME TO users');

console.log('🔄 Recreating indexes...');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name)');

console.log('\n✅ Final clean schema:');
const finalSchema = db.prepare("PRAGMA table_info(users)").all();
console.log(finalSchema.map(col => `${col.name}${col.notnull ? ' NOT NULL' : ''}`));

console.log('\n🎉 Database cleanup complete!');
console.log('💡 You can now drop the backup table if everything works:');
console.log('   DROP TABLE users_backup;');

db.close();
