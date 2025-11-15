import Database from 'better-sqlite3';
import fs from 'fs';

const dbFile = fs.existsSync('dev.db') ? 'dev.db' : 'prod.db';
const db = new Database(dbFile);

console.log('📊 Current Post Assignments:\n');

const results = db.prepare(`
  SELECT 
    p.id,
    p.title,
    p.path_id,
    path.name as path_name,
    path.full_path
  FROM posts p
  LEFT JOIN paths path ON p.path_id = path.id
  ORDER BY p.id
`).all();

results.forEach(post => {
  const location = post.path_id 
    ? `${post.full_path} (ID: ${post.path_id})`
    : '(No folder assigned)';
  console.log(`Post ${post.id}: "${post.title}"`);
  console.log(`  → ${location}\n`);
});

console.log('\n📈 Summary by Path:');
const summary = db.prepare(`
  SELECT 
    COALESCE(path.full_path, '(No folder)') as location,
    COUNT(p.id) as count
  FROM posts p
  LEFT JOIN paths path ON p.path_id = path.id
  GROUP BY p.path_id
  ORDER BY count DESC
`).all();

summary.forEach(s => {
  console.log(`  ${s.location}: ${s.count} posts`);
});

db.close();