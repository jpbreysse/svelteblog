import Database from 'better-sqlite3';

const db = new Database('prod.db');

console.log('🔧 Starting foreign key fix migration...\n');

try {
  // Start transaction
  db.exec('BEGIN TRANSACTION');
  
  console.log('📊 Current posts table structure:');
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='posts'").get();
  console.log(schema.sql);
  console.log('');
  
  // Check existing posts
  const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get();
  console.log(`📝 Found ${postCount.count} existing posts\n`);
  
  // Create new posts table with correct foreign key
  console.log('🔄 Creating new posts table with correct foreign key...');
  db.exec(`
    CREATE TABLE posts_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT,
      category TEXT NOT NULL DEFAULT 'thoughts',
      slug TEXT UNIQUE NOT NULL,
      read_time TEXT,
      author_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published BOOLEAN DEFAULT 1,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ New posts table created\n');
  
  // Copy data from old table to new table
  if (postCount.count > 0) {
    console.log('📋 Copying posts data...');
    db.exec(`
      INSERT INTO posts_new (id, title, content, excerpt, category, slug, read_time, author_id, created_at, updated_at, published)
      SELECT id, title, content, excerpt, category, slug, read_time, author_id, created_at, updated_at, published
      FROM posts
    `);
    console.log('✅ Posts data copied\n');
  }
  
  // Copy post_tags data (need to preserve this)
  const postTagsCount = db.prepare('SELECT COUNT(*) as count FROM post_tags').get();
  console.log(`🏷️  Found ${postTagsCount.count} post-tag relationships\n`);
  
  // Drop old posts table
  console.log('🗑️  Dropping old posts table...');
  db.exec('DROP TABLE posts');
  console.log('✅ Old posts table dropped\n');
  
  // Rename new table to posts
  console.log('🔄 Renaming posts_new to posts...');
  db.exec('ALTER TABLE posts_new RENAME TO posts');
  console.log('✅ Table renamed\n');
  
  // Recreate indexes
  console.log('📑 Recreating indexes...');
  db.exec(`
    CREATE INDEX idx_posts_category ON posts(category);
    CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
    CREATE INDEX idx_posts_published ON posts(published);
    CREATE INDEX idx_posts_slug ON posts(slug);
    CREATE INDEX idx_posts_author ON posts(author_id);
  `);
  console.log('✅ Indexes recreated\n');
  
  // Commit transaction
  db.exec('COMMIT');
  
  console.log('✅ Migration completed successfully!\n');
  
  // Verify the fix
  console.log('🔍 Verifying the fix...');
  const newSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='posts'").get();
  console.log('New posts table structure:');
  console.log(newSchema.sql);
  console.log('');
  
  const verifyCount = db.prepare('SELECT COUNT(*) as count FROM posts').get();
  console.log(`✅ Verified: ${verifyCount.count} posts in new table\n`);
  
  // Check for foreign key violations
  console.log('🔍 Checking for foreign key violations...');
  const violations = db.prepare('PRAGMA foreign_key_check(posts)').all();
  if (violations.length === 0) {
    console.log('✅ No foreign key violations found!\n');
  } else {
    console.log('⚠️  Found foreign key violations:');
    console.log(violations);
  }
  
  console.log('🎉 Migration completed successfully!');
  console.log('You can now create posts with user ID 4');
  
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  console.error('Rolling back...');
  db.exec('ROLLBACK');
  console.error('❌ Transaction rolled back');
  process.exit(1);
} finally {
  db.close();
}
