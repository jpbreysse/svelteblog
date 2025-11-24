import { blogDB, pathsDB } from '$lib/db.js';

export async function load({ url }) {
  try {
    console.log('🔍 Blog page loading...', new Date().toISOString());
    
    // Check for edit parameter
    const editPostId = url.searchParams.get('edit');
    let editPost = null;
    
    if (editPostId) {
      try {
        // ✅ FIXED: Added await
        editPost = await blogDB.getPostById(parseInt(editPostId));
        console.log('✏️ Loading post for editing:', editPostId, editPost ? 'found' : 'not found');
      } catch (error) {
        console.error('❌ Error loading post for editing:', error);
      }
    }
    
    // Get search parameters
    const searchQuery = url.searchParams.get('search') || '';
    const categoryFilter = url.searchParams.get('category') || '';
    const authorFilter = url.searchParams.get('author') || '';

    // Load posts with search/filter
    // ✅ FIXED: Added await to all blogDB calls
    let posts = [];
    if (authorFilter) {
      // Filter by author first (new priority)
      posts = await blogDB.getPostsByUser(parseInt(authorFilter));
    } else if (searchQuery) {
      posts = await blogDB.searchPosts(searchQuery, categoryFilter || null);
    } else if (categoryFilter) {
      posts = await blogDB.getPostsByCategory(categoryFilter);
    } else {
      posts = await blogDB.getAllPosts();
    }

    console.log('📄 Posts loaded:', posts.length);

    // Load categories, authors, and stats
    // ✅ FIXED: Added await
    const categories = await blogDB.getCategories();
    const authors = await blogDB.getAuthors();
    const stats = await blogDB.getStats();
    
    // Load paths for folder selection
    // ✅ FIXED: Replaced db.prepare() with pathsDB.getAllPaths()
    const paths = await pathsDB.getAllPaths();
    
    return {
      posts,
      categories,
      authors,
      stats,
      paths,
      searchQuery,
      categoryFilter,
      authorFilter,
      editPost
    };
  } catch (error) {
    console.error('❌ Error loading blog data:', error);
    console.error('❌ Error details:', error.stack);
    return {
      posts: [],
      categories: [],
      authors: [],
      stats: { published_posts: 0, total_posts: 0 },
      paths: [],
      searchQuery: '',
      categoryFilter: '',
      authorFilter: '',
      editPost: null
    };
  }
}
