// Database migration script to update from first_name/last_name to display_name
import Database from 'better-sqlite3';
import { dev } from '$app/environment';

const db = new Database(dev ? 'dev.db' : 'prod.db');

console.log('🔄 Starting database migration to display_name...');

try {
  // Start a transaction for safe migration
  const transaction = db.transaction(() => {
    console.log('1️⃣ Adding display_name column...');
    
    // Add the new display_name column
    db.exec(`ALTER TABLE users ADD COLUMN display_name TEXT`);
    
    console.log('2️⃣ Migrating existing data...');
    
    // Migrate existing data: combine first_name and last_name into display_name
    const users = db.prepare('SELECT id, first_name, last_name FROM users').all();
    const updateStmt = db.prepare('UPDATE users SET display_name = ? WHERE id = ?');
    
    for (const user of users) {
      const displayName = `${user.first_name} ${user.last_name}`.trim();
      updateStmt.run(displayName, user.id);
      console.log(`   ✅ Migrated user ${user.id}: "${displayName}"`);
    }
    
    console.log('3️⃣ Making display_name NOT NULL...');
    
    // Create a new table with the correct schema
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
        deletion_reason TEXT,
        FOREIGN KEY (approved_by) REFERENCES users_new(id)
      )
    `);
    
    console.log('4️⃣ Copying data to new table...');
    
    // Copy data to new table
    db.exec(`
      INSERT INTO users_new (
        id, email, display_name, password_hash, status, role, 
        created_at, approved_at, approved_by, deletion_requested_at, deletion_reason
      )
      SELECT 
        id, email, display_name, password_hash, status, role,
        created_at, approved_at, approved_by, deletion_requested_at, deletion_reason
      FROM users
    `);
    
    console.log('5️⃣ Replacing old table...');
    
    // Drop the old table and rename the new one
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');
    
    console.log('6️⃣ Creating indexes...');
    
    // Recreate any indexes if needed
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name)');
    
    console.log('✅ Migration completed successfully!');
  });
  
  // Execute the transaction
  transaction();
  
} catch (error) {
  console.error('❌ Migration failed:', error);
  throw error;
} finally {
  db.close();
}
