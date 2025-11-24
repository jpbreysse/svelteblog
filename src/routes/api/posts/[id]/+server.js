import { json } from '@sveltejs/kit';
import { blogDB } from '$lib/db.js';

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

// GET /api/posts/[id] - Get single post
export async function GET({ params }) {
  try {
    const post = await blogDB.getPostById(parseInt(params.id));
    
    if (!post) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }

    return json({
      success: true,
      post
    });
  } catch (error) {
    console.error('❌ Error fetching post:', {
      message: error.message,
      code: error.code
    });
    return json({
      success: false,
      error: 'Failed to fetch post'
    }, { status: 500 });
  }
}

// PUT /api/posts/[id] - Update post (authenticated users only)
export async function PUT({ params, request, locals }) {
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
      console.log('⚠️ Post update validation failed:', validationErrors);
      return json({
        success: false,
        error: `Validation failed: ${validationErrors.join(', ')}`,
        validationErrors
      }, { status: 400 });
    }
    
    const isAdmin = locals.user.role === 'admin';
    const post = await blogDB.updatePost(parseInt(params.id), postData, locals.user.id, isAdmin);

    // Update tags if provided
    if (postData.tags && Array.isArray(postData.tags)) {
      await blogDB.updatePostTags(parseInt(params.id), postData.tags);
      console.log('✅ Tags updated for post:', params.id);
    }

    return json({
      success: true,
      post,
      message: 'Post updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating post:', {
      message: error.message,
      code: error.code
    });
    
    if (error.message === 'Post not found') {
      return json({
        success: false,
        error: error.message
      }, { status: 404 });
    }
    
    if (error.message.includes('You can only edit your own posts')) {
      return json({
        success: false,
        error: error.message
      }, { status: 403 });
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return json({
        success: false,
        error: 'Database connection error'
      }, { status: 503 });
    }
    
    return json({
      success: false,
      error: error.message || 'Failed to update post'
    }, { status: 500 });
  }
}

// PATCH /api/posts/[id] - Partially update post (e.g., move to folder)
export async function PATCH({ params, request, locals }) {
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  try {
    const updates = await request.json();
    const postId = parseInt(params.id);
    
    // Get the existing post
    const existingPost = await blogDB.getPostById(postId);
    if (!existingPost) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }
    
    // Check authorization
    if (existingPost.author_id !== locals.user.id && locals.user.role !== 'admin') {
      return json({
        success: false,
        error: 'Unauthorized to modify this post'
      }, { status: 403 });
    }
    
    // Handle path_id update (moving post)
    if ('path_id' in updates) {
      const isAdmin = locals.user.role === 'admin';
      const updatedPost = await blogDB.updatePost(postId, { ...existingPost, path_id: updates.path_id }, locals.user.id, isAdmin);
      
      return json({
        success: true,
        message: 'Post moved successfully'
      });
    }
    
    // For other partial updates, use the regular update method
    const isAdmin = locals.user.role === 'admin';
    const post = await blogDB.updatePost(postId, { ...existingPost, ...updates }, locals.user.id, isAdmin);
    
    return json({
      success: true,
      post,
      message: 'Post updated successfully'
    });
  } catch (error) {
    console.error('❌ Error patching post:', {
      message: error.message,
      code: error.code
    });
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return json({
        success: false,
        error: 'Database connection error'
      }, { status: 503 });
    }
    
    return json({
      success: false,
      error: error.message || 'Failed to update post'
    }, { status: 500 });
  }
}

// DELETE /api/posts/[id] - Delete post (authenticated users only)
export async function DELETE({ params, locals }) {
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  const postId = parseInt(params.id);
  const isAdmin = locals.user.role === 'admin';

  try {
    console.log(`🗑️ DELETE /api/posts/${postId} - User: ${locals.user.email} (admin: ${isAdmin})`);
    
    const result = await blogDB.deletePost(postId, locals.user.id, isAdmin);
    
    if (!result.success) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }

    console.log(`✅ Successfully deleted post ${postId}`);

    return json({
      success: true,
      message: 'Post deleted successfully'
    });

  } catch (error) {
    // Log detailed error information
    console.error(`❌ Error deleting post ${postId}:`, {
      message: error.message,
      code: error.code,
      detail: error.detail,
      errorType: error.constructor.name
    });
    
    // Handle authorization errors
    if (error.message.includes('You can only delete your own posts')) {
      return json({
        success: false,
        error: error.message
      }, { status: 403 });
    }
    
    // Handle post not found
    if (error.message === 'Post not found') {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }
    
    // Handle database connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'EHOSTUNREACH') {
      return json({
        success: false,
        error: 'Database connection error. Please try again in a moment.'
      }, { status: 503 });
    }
    
    // Handle foreign key violations
    if (error.code === '23503') {
      return json({
        success: false,
        error: 'Cannot delete: post is referenced elsewhere'
      }, { status: 400 });
    }
    
    // Handle other database errors gracefully
    if (error.code && error.code.startsWith('42')) {
      console.error('SQL Error detected:', error);
      return json({
        success: false,
        error: 'Database error occurred. Please contact support if this persists.'
      }, { status: 500 });
    }
    
    // Generic error - don't expose implementation details
    return json({
      success: false,
      error: 'Failed to delete post. Please try again.'
    }, { status: 500 });
  }
}
