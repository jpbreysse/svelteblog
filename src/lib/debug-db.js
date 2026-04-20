// Simple database inspection script
import Database from 'better-sqlite3';
import { dev } from '$app/environment';

const db = new Database(dev ? 'dev.db' : 'prod.db');

console.log('🔍 Checking database structure...');

// Check users table structure
console.log('\n👥 Users table structure:');
const userTableInfo = db.prepare("PRAGMA table_info(users)").all();
console.table(userTableInfo);

// Check if there are any users
console.log('\n👥 Users in database:');
const users = db.prepare('SELECT id, email, display_name, first_name, last_name FROM users LIMIT 5').all();
console.table(users);

// Check posts table structure
console.log('\n📝 Posts table structure:');
const postTableInfo = db.prepare("PRAGMA table_info(posts)").all();
console.table(postTableInfo);

// Check if there are any posts
console.log('\n📝 Posts in database:');
const posts = db.prepare('SELECT id, title, author_id FROM posts LIMIT 5').all();
console.table(posts);

// Try the query that's failing
console.log('\n🔍 Testing the getAllPosts query...');
try {
  const testPosts = db.prepare(`
    SELECT 
      p.*,
      u.display_name, u.email,
      GROUP_CONCAT(t.name) as tags
    FROM posts p
    INNER JOIN users u ON p.author_id = u.id
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.published = 1
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();
  
  console.log('✅ Query successful, found posts:', testPosts.length);
  console.table(testPosts);
} catch (error) {
  console.error('❌ Query failed:', error.message);
}

db.close();
