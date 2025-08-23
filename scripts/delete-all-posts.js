// scripts/delete-all-posts.js
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

// Get the project root directory (one level up from scripts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Use dev database by default (you can change this to 'prod.db' if needed)
const dbPath = path.join(projectRoot, 'dev.db');

console.log('🗑️  Deleting all blog posts...');
console.log('📍 Database path:', dbPath);

try {
  const db = new Database(dbPath);
  
  // Check if database file exists and has the expected tables
  try {
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'").get();
    if (!tableCheck) {
      console.log('❌ Posts table not found. Make sure you are running this from the correct directory.');
      db.close();
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error accessing database:', error.message);
    process.exit(1);
  }
  
  // Check current post count
  const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get();
  console.log(`📊 Found ${postCount.count} posts in database`);
  
  if (postCount.count === 0) {
    console.log('✅ No posts to delete');
    db.close();
    process.exit(0);
  }
  
  // Show some example posts
  const samplePosts = db.prepare('SELECT id, title, author_id FROM posts LIMIT 3').all();
  console.log('📄 Sample posts:');
  samplePosts.forEach(post => {
    console.log(`   - "${post.title}" (ID: ${post.id})`);
  });
  
  // Confirm deletion
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question(`⚠️  Are you sure you want to delete all ${postCount.count} posts? This cannot be undone! (y/N): `, (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      
      console.log('🗑️  Deleting all posts and related data...');
      
      // Start transaction for safe deletion
      const transaction = db.transaction(() => {
        // Delete post-tag relationships first (foreign key constraint)
        const deletedPostTags = db.prepare('DELETE FROM post_tags').run();
        console.log(`📋 Deleted ${deletedPostTags.changes} post-tag relationships`);
        
        // Delete posts
        const deletedPosts = db.prepare('DELETE FROM posts').run();
        console.log(`📝 Deleted ${deletedPosts.changes} posts`);
        
        // Optionally delete orphaned tags (tags with no posts)
        const deletedTags = db.prepare(`
          DELETE FROM tags 
          WHERE id NOT IN (SELECT DISTINCT tag_id FROM post_tags WHERE tag_id IS NOT NULL)
        `).run();
        console.log(`🏷️  Deleted ${deletedTags.changes} orphaned tags`);
        
        return {
          posts: deletedPosts.changes,
          postTags: deletedPostTags.changes,
          tags: deletedTags.changes
        };
      });
      
      const result = transaction();
      
      console.log('✅ All posts deleted successfully!');
      console.log(`📊 Summary:`);
      console.log(`   - Posts deleted: ${result.posts}`);
      console.log(`   - Post-tag relationships deleted: ${result.postTags}`);
      console.log(`   - Orphaned tags deleted: ${result.tags}`);
      
      // Verify deletion
      const remainingPosts = db.prepare('SELECT COUNT(*) as count FROM posts').get();
      console.log(`✅ Verification: ${remainingPosts.count} posts remaining`);
      
    } else {
      console.log('❌ Deletion cancelled');
    }
    
    db.close();
    rl.close();
  });
  
} catch (error) {
  console.error('💥 Error deleting posts:', error);
  process.exit(1);
}