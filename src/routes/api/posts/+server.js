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

// Validation constants (server-side safety limits)
const VALIDATION_LIMITS = {
  title: { max: 500 },        // Generous server limit
  content: { max: 100000 },   // Generous server limit
  category: { max: 50 },
  tags: { max: 15, tagLength: 50 } // Generous server limits
};

// Server-side validation function
function validatePostData(postData) {
  const errors = [];
  
  if (!postData.title?.trim()) {
    errors.push('Title is required');
  } else if (postData.title.length > VALIDATION_LIMITS.title.max) {
    errors.push(`Title is extremely long (max ${VALIDATION_LIMITS.title.max} characters)`);
  }
  
  if (!postData.content?.trim()) {
    errors.push('Content is required');
  } else if (postData.content.length > VALIDATION_LIMITS.content.max) {
    errors.push(`Content is extremely long (max ${VALIDATION_LIMITS.content.max} characters)`);
  }
  
  if (postData.category && postData.category.length > VALIDATION_LIMITS.category.max) {
    errors.push(`Category name too long (max ${VALIDATION_LIMITS.category.max} characters)`);
  }
  
  if (postData.tags && Array.isArray(postData.tags)) {
    if (postData.tags.length > VALIDATION_LIMITS.tags.max) {
      errors.push(`Too many tags (max ${VALIDATION_LIMITS.tags.max})`);
    }
    
    postData.tags.forEach((tag, index) => {
      if (typeof tag === 'string' && tag.length > VALIDATION_LIMITS.tags.tagLength) {
        errors.push(`Tag "${tag.substring(0, 20)}..." is too long (max ${VALIDATION_LIMITS.tags.tagLength} characters)`);
      }
    });
  }
  
  return errors;
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
    
    // Server-side validation (basic safety checks)
    const validationErrors = validatePostData(postData);
    if (validationErrors.length > 0) {
      console.log('⚠️ Post validation failed:', validationErrors);
      return json({
        success: false,
        error: `Validation failed: ${validationErrors.join(', ')}`,
        validationErrors
      }, { status: 400 });
    }
    
    console.log('🔄 Creating post:', postData.title, 'for user:', locals.user.id);
    const post = blogDB.createPost(postData, locals.user.id);
    console.log('✅ Post created with ID:', post.id);
    
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