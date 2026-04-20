import { json } from '@sveltejs/kit';
import { blogDB } from '$lib/db.js';

/**
 * GET /api/posts/hierarchy
 * Get hierarchical tree of posts
 * Query params:
 *   - path_id: Optional path filter
 */
export async function GET({ url }) {
  try {
    const pathId = url.searchParams.get('path_id');
    const pathIdNum = pathId ? parseInt(pathId) : null;

    const hierarchy = await blogDB.getPostHierarchy(pathIdNum);

    return json({
      success: true,
      hierarchy
    });
  } catch (error) {
    console.error('Error fetching post hierarchy:', error);
    return json({
      success: false,
      error: 'Failed to fetch post hierarchy'
    }, { status: 500 });
  }
}
