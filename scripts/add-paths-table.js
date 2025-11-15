import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

// Get current directory (needed for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if we're in dev mode (dev.db exists) or prod mode
const dbFile = fs.existsSync('dev.db') ? 'dev.db' : 'prod.db';
const db = new Database(dbFile);

console.log(`📦 Using database: ${dbFile}`);
db.pragma('foreign_keys = ON');

console.log('🔄 Starting paths table migration...');

try {
  // Create paths table with hierarchical structure (max 5 levels)
  db.exec(`
    CREATE TABLE IF NOT EXISTS paths (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      parent_id INTEGER,
      level INTEGER NOT NULL DEFAULT 1 CHECK(level >= 1 AND level <= 5),
      full_path TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      FOREIGN KEY (parent_id) REFERENCES paths(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Add path_id column to posts table
  const tableInfo = db.prepare("PRAGMA table_info(posts)").all();
  const hasPathId = tableInfo.some(col => col.name === 'path_id');
  
  if (!hasPathId) {
    console.log('📝 Adding path_id column to posts table...');
    db.exec(`
      ALTER TABLE posts ADD COLUMN path_id INTEGER REFERENCES paths(id) ON DELETE SET NULL
    `);
  } else {
    console.log('✅ path_id column already exists in posts table');
  }

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_paths_parent ON paths(parent_id);
    CREATE INDEX IF NOT EXISTS idx_paths_level ON paths(level);
    CREATE INDEX IF NOT EXISTS idx_paths_full_path ON paths(full_path);
    CREATE INDEX IF NOT EXISTS idx_paths_slug ON paths(slug);
    CREATE INDEX IF NOT EXISTS idx_posts_path ON posts(path_id);
  `);

  // Create some default root-level paths
  const existingPaths = db.prepare('SELECT COUNT(*) as count FROM paths').get();
  
  if (existingPaths.count === 0) {
    console.log('📁 Creating default root paths...');
    
    const defaultPaths = [
      { name: 'General', slug: 'general', description: 'General content and discussions', icon: '📝', color: '#6366f1' },
      { name: 'Technical', slug: 'technical', description: 'Technical documentation and guides', icon: '💻', color: '#8b5cf6' },
      { name: 'Projects', slug: 'projects', description: 'Project-related content', icon: '🚀', color: '#ec4899' },
      { name: 'Resources', slug: 'resources', description: 'Helpful resources and references', icon: '📚', color: '#10b981' }
    ];

    const insertPath = db.prepare(`
      INSERT INTO paths (name, slug, description, parent_id, level, full_path, icon, color, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    defaultPaths.forEach((path, index) => {
      insertPath.run(
        path.name,
        path.slug,
        path.description,
        null,
        1,
        `/${path.slug}`,
        path.icon,
        path.color,
        index
      );
    });

    console.log(`✅ Created ${defaultPaths.length} default root paths`);
  } else {
    console.log(`✅ Paths table already has ${existingPaths.count} entries`);
  }

  console.log('✅ Paths table migration completed successfully');

} catch (error) {
  console.error('❌ Error during migration:', error);
  process.exit(1);
}

db.close();