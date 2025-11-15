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
    const post = blogDB.getPostById(parseInt(params.id));
    
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
    console.error('Error fetching post:', error);
    return json({
      success: false,
      error: error.message
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
    
    const post = blogDB.updatePost(parseInt(params.id), postData, locals.user.id);
    
    return json({
      success: true,
      post,
      message: 'Post updated successfully'
    });
  } catch (error) {
    console.error('Error updating post:', error);
    
    if (error.message === 'Post not found') {
      return json({
        success: false,
        error: error.message
      }, { status: 404 });
    }
    
    if (error.message === 'Unauthorized to edit this post') {
      return json({
        success: false,
        error: error.message
      }, { status: 403 });
    }
    
    return json({
      success: false,
      error: error.message
    }, { status: 400 });
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
    const existingPost = blogDB.getPostById(postId);
    if (!existingPost) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }
    
    // Check authorization
    if (existingPost.user_id !== locals.user.id && !locals.user.is_admin) {
      return json({
        success: false,
        error: 'Unauthorized to modify this post'
      }, { status: 403 });
    }
    
    // Handle path_id update (moving post)
    if ('path_id' in updates) {
      const db = blogDB.db;
      const stmt = db.prepare(`
        UPDATE posts 
        SET path_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(updates.path_id, postId);
      
      return json({
        success: true,
        message: 'Post moved successfully'
      });
    }
    
    // For other partial updates, use the regular update method
    const post = blogDB.updatePost(postId, { ...existingPost, ...updates }, locals.user.id);
    
    return json({
      success: true,
      post,
      message: 'Post updated successfully'
    });
  } catch (error) {
    console.error('Error patching post:', error);
    return json({
      success: false,
      error: error.message
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

  try {
    const success = blogDB.deletePost(parseInt(params.id), locals.user.id);
    
    if (!success) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }

    return json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    
    if (error.message === 'Unauthorized to delete this post') {
      return json({
        success: false,
        error: error.message
      }, { status: 403 });
    }
    
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}