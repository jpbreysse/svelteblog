import Database from 'better-sqlite3';
import fs from 'fs';

const dbFile = fs.existsSync('dev.db') ? 'dev.db' : 'prod.db';
const db = new Database(dbFile);
db.pragma('foreign_keys = ON');

console.log(`📦 Using database: ${dbFile}`);
console.log('🔄 Assigning posts to paths...\n');

try {
  // Get all posts
  const posts = db.prepare('SELECT id, title, category FROM posts').all();
  console.log(`Found ${posts.length} posts\n`);
  
  // Get all paths
  const paths = db.prepare('SELECT id, name, full_path FROM paths').all();
  console.log('Available paths:');
  paths.forEach(p => console.log(`  ${p.id}: ${p.full_path}`));
  console.log('');
  
  // Assignment rules based on category or keywords
  const assignmentRules = [
    { pathName: 'Technical', keywords: ['tech', 'code', 'programming', 'tutorial'] },
    { pathName: 'Backend Development', keywords: ['backend', 'server', 'api', 'database'] },
    { pathName: 'Python', keywords: ['python', 'django', 'flask'] },
    { pathName: 'Frontend Development', keywords: ['frontend', 'react', 'vue', 'svelte', 'css', 'html'] },
    { pathName: 'Projects', keywords: ['project', 'build', 'demo'] },
    { pathName: 'General', keywords: ['general', 'thoughts', 'blog'] }
  ];
  
  const updateStmt = db.prepare('UPDATE posts SET path_id = ? WHERE id = ?');
  
  posts.forEach(post => {
    let assignedPath = null;
    
    // Try to match based on title or category
    const searchText = `${post.title} ${post.category}`.toLowerCase();
    
    for (const rule of assignmentRules) {
      const matchingPath = paths.find(p => p.name === rule.pathName);
      if (!matchingPath) continue;
      
      // Check if any keyword matches
      const hasMatch = rule.keywords.some(keyword => 
        searchText.includes(keyword.toLowerCase())
      );
      
      if (hasMatch) {
        assignedPath = matchingPath;
        break;
      }
    }
    
    if (assignedPath) {
      updateStmt.run(assignedPath.id, post.id);
      console.log(`✅ "${post.title}" → ${assignedPath.full_path}`);
    } else {
      console.log(`⚠️  "${post.title}" → (no path assigned)`);
    }
  });
  
  // Show summary
  console.log('\n📊 Summary:');
  const summary = db.prepare(`
    SELECT 
      COALESCE(path.full_path, '(No folder)') as path,
      COUNT(p.id) as post_count
    FROM posts p
    LEFT JOIN paths path ON p.path_id = path.id
    GROUP BY p.path_id
    ORDER BY post_count DESC
  `).all();
  
  summary.forEach(s => {
    console.log(`  ${s.path}: ${s.post_count} posts`);
  });
  
  console.log('\n✨ Post assignment complete!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  db.close();
}