import { blogDB, db } from '$lib/db.js';

export async function load({ url }) {
  try {
    console.log('🔍 Blog page loading...', new Date().toISOString());
    
    // Check for edit parameter
    const editPostId = url.searchParams.get('edit');
    let editPost = null;
    
    if (editPostId) {
      try {
        editPost = blogDB.getPostById(parseInt(editPostId));
        console.log('✏️ Loading post for editing:', editPostId, editPost ? 'found' : 'not found');
      } catch (error) {
        console.error('❌ Error loading post for editing:', error);
      }
    }
    
    // First, let's check the database structure
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const hasDisplayName = tableInfo.some(col => col.name === 'display_name');
    console.log('🔍 Users table has display_name:', hasDisplayName);
    
    // Check if there are any users
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    console.log('👥 Users in database:', userCount.count);
    
    // Check if there are any posts
    const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get();
    console.log('📝 Posts in database:', postCount.count);
    
    // If no posts, let's create a test post
    if (postCount.count === 0) {
      console.log('📝 No posts found, creating test post...');
      
      // Get admin user
      const adminUser = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
      if (adminUser) {
        const testPostResult = db.prepare(`
          INSERT INTO posts (title, content, excerpt, category, slug, read_time, author_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'Welcome to Our Blog!',
          '<p>This is a test post to verify the blog is working correctly with display names.</p>',
          'This is a test post to verify the blog is working correctly...',
          'thoughts',
          'welcome-to-our-blog',
          '1 min read',
          adminUser.id
        );
        console.log('✅ Test post created with ID:', testPostResult.lastInsertRowid);
      }
    }
    
    // Get search parameters
    const searchQuery = url.searchParams.get('search') || '';
    const categoryFilter = url.searchParams.get('category') || '';
    
    // Load posts with search/filter
    let posts = [];
    if (searchQuery) {
      posts = blogDB.searchPosts(searchQuery, categoryFilter || null);
    } else if (categoryFilter) {
      posts = blogDB.getPostsByCategory(categoryFilter);
    } else {
      posts = blogDB.getAllPosts();
    }
    
    console.log('📄 Posts loaded:', posts.length);
    
    // Load categories and stats
    const categories = blogDB.getCategories();
    const stats = blogDB.getStats();
    
    // Load paths for folder selection
    const paths = db.prepare(`
      SELECT id, name, parent_id, level, full_path
      FROM paths 
      ORDER BY full_path ASC
    `).all();
    
    // Ensure root folder exists
    if (!paths.find(p => p.id === 1)) {
      db.prepare(`
        INSERT INTO paths (id, name, parent_id, created_at) 
        VALUES (1, 'Root', NULL, datetime('now'))
      `).run();
      paths.unshift({ id: 1, name: 'Root', parent_id: null });
    }
    
    return {
      posts,
      categories,
      stats,
      paths,
      searchQuery,
      categoryFilter,
      editPost
    };
  } catch (error) {
    console.error('❌ Error loading blog data:', error);
    console.error('❌ Error details:', error.stack);
    return {
      posts: [],
      categories: [],
      stats: { posts: 0, categories: 0, tags: 0 },
      paths: [],
      searchQuery: '',
      categoryFilter: '',
      editPost: null
    };
  }
}
