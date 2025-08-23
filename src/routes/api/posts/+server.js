import { json } from '@sveltejs/kit';
import { blogDB } from '$lib/db.js';

// GET /api/posts - Get all posts or search
export async function GET({ url, locals }) {
  try {
    const searchQuery = url.searchParams.get('search');
    const category = url.searchParams.get('category');
    const userId = url.searchParams.get('user');

    let posts;
    
    if (userId && locals.user) {
      // Get posts by specific user (only if authenticated)
      posts = blogDB.getPostsByUser(parseInt(userId));
    } else if (searchQuery) {
      posts = blogDB.searchPosts(searchQuery, category);
    } else if (category && category !== 'all') {
      posts = blogDB.getPostsByCategory(category);
    } else {
      posts = blogDB.getAllPosts();
    }

    return json({
      success: true,
      posts,
      count: posts.length
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

// POST /api/posts - Create new post (authenticated users only)
export async function POST({ request, locals }) {
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  try {
    const postData = await request.json();
    const post = blogDB.createPost(postData, locals.user.id);
    
    return json({
      success: true,
      post,
      message: 'Post created successfully'
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    return json({
      success: false,
      error: error.message
    }, { status: 400 });
  }
}