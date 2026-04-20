import Database from 'better-sqlite3';
import fs from 'fs';

// Open database directly
const dbFile = fs.existsSync('dev.db') ? 'dev.db' : 'prod.db';
const db = new Database(dbFile);
db.pragma('foreign_keys = ON');

console.log(`📦 Using database: ${dbFile}\n`);

// Query paths directly
console.log('📂 All Root Paths:');
const rootPaths = db.prepare(`
  SELECT p.*,
    (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as child_count,
    (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
  FROM paths p
  WHERE p.parent_id IS NULL
  ORDER BY p.position ASC, p.name ASC
`).all();

rootPaths.forEach(path => {
  console.log(`  ${path.icon} ${path.name}`);
  console.log(`     Path: ${path.full_path}`);
  console.log(`     ID: ${path.id}, Level: ${path.level}`);
  console.log(`     Children: ${path.child_count}, Posts: ${path.post_count}`);
  console.log('');
});

// Get all paths
console.log('📊 All Paths in Database:');
const allPaths = db.prepare(`
  SELECT id, name, full_path, level, parent_id
  FROM paths
  ORDER BY full_path ASC
`).all();

allPaths.forEach(path => {
  const indent = '  '.repeat(path.level - 1);
  console.log(`${indent}${path.name} (${path.full_path})`);
});

// Statistics
const stats = {
  total: db.prepare('SELECT COUNT(*) as count FROM paths').get().count,
  roots: db.prepare('SELECT COUNT(*) as count FROM paths WHERE parent_id IS NULL').get().count,
  maxLevel: db.prepare('SELECT MAX(level) as max FROM paths').get().max
};

console.log('\n📈 Statistics:');
console.log(`  Total paths: ${stats.total}`);
console.log(`  Root paths: ${stats.roots}`);
console.log(`  Maximum depth: ${stats.maxLevel}`);

db.close();