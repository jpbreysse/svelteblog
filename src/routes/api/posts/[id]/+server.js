import { json } from '@sveltejs/kit';
import { blogDB } from '$lib/db.js';

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