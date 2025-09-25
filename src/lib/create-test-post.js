// Script to create a test blog post
import Database from 'better-sqlite3';
import { dev } from '$app/environment';

const db = new Database(dev ? 'dev.db' : 'prod.db');

console.log('📝 Creating test blog post...');

try {
  // First, check if admin user exists
  const adminUser = db.prepare('SELECT id, display_name FROM users WHERE role = ?').get('admin');
  console.log('👤 Admin user:', adminUser);
  
  if (!adminUser) {
    console.log('❌ No admin user found! Cannot create test post.');
    db.close();
    process.exit(1);
  }
  
  // Check if test post already exists
  const existingPost = db.prepare('SELECT id FROM posts WHERE title = ?').get('Welcome to Our Blog!');
  
  if (existingPost) {
    console.log('✅ Test post already exists');
  } else {
    // Create a test post
    const testPost = {
      title: 'Welcome to Our Blog!',
      content: `
        <h2>Hello and Welcome!</h2>
        <p>This is our first blog post to test the new display name system. We're excited to share our thoughts and ideas with you.</p>
        
        <h3>What's New</h3>
        <ul>
          <li>✨ New display name system for better privacy</li>
          <li>📝 GDPR-compliant content reporting</li>
          <li>🛡️ Enhanced security features</li>
          <li>📱 Responsive design that works everywhere</li>
        </ul>
        
        <p>Feel free to create your own posts and share your thoughts with the community!</p>
        
        <blockquote>
          "The best way to find out if you can trust somebody is to trust them." - Ernest Hemingway
        </blockquote>
      `,
      category: 'thoughts',
      tags: ['welcome', 'introduction', 'community']
    };
    
    // Generate slug and other metadata
    const slug = testPost.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const excerpt = testPost.content.replace(/<[^>]*>/g, '').substring(0, 120) + '...';
    const readTime = '2 min read';
    
    // Insert the post
    const result = db.prepare(`
      INSERT INTO posts (title, content, excerpt, category, slug, read_time, author_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      testPost.title,
      testPost.content,
      excerpt,
      testPost.category,
      slug,
      readTime,
      adminUser.id
    );
    
    console.log('✅ Test post created with ID:', result.lastInsertRowid);
    
    // Add tags
    const postId = result.lastInsertRowid;
    for (const tagName of testPost.tags) {
      // Insert tag if it doesn't exist
      db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tagName);
      
      // Get tag ID
      const tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName);
      
      // Link post to tag
      db.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)').run(postId, tag.id);
    }
    
    console.log('✅ Tags added to test post');
  }
  
  // Test the query
  console.log('\n🔍 Testing blog query...');
  const posts = db.prepare(`
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
  
  console.log('📄 Found posts:', posts.length);
  if (posts.length > 0) {
    console.log('📄 First post:', {
      id: posts[0].id,
      title: posts[0].title,
      author: posts[0].display_name,
      tags: posts[0].tags
    });
  }
  
} catch (error) {
  console.error('❌ Error:', error);
} finally {
  db.close();
}
