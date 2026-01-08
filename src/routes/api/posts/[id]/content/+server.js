import { json } from '@sveltejs/kit';
import { blogDB } from '$lib/db.js';

/**
 * GET /api/posts/[id]/content
 * Get post content with children and breadcrumbs
 * Used for dynamic loading in Explorer view
 */
export async function GET({ params }) {
  try {
    const postId = parseInt(params.id);

    // Get post with children
    const post = await blogDB.getPostWithChildren(postId);

    if (!post) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }

    // Get breadcrumbs
    const breadcrumbs = await blogDB.getPostBreadcrumbs(postId);

    return json({
      success: true,
      post,
      breadcrumbs
    });
  } catch (error) {
    console.error('Error fetching post content:', error);
    return json({
      success: false,
      error: 'Failed to fetch post content'
    }, { status: 500 });
  }
}
