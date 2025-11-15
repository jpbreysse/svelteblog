import { json } from '@sveltejs/kit';
import { pathsDB } from '$lib/paths.js';

// GET /api/paths/tree - Get optimized tree structure
// Query params: ?max_depth=3 (limit depth)
//               ?with_posts=true (include post counts)
export async function GET({ url, locals }) {
  try {
    const maxDepth = parseInt(url.searchParams.get('max_depth')) || 5;
    const withPosts = url.searchParams.get('with_posts') === 'true';

    // Get the tree
    const tree = pathsDB.getPathTree(null, maxDepth);

    // Get global stats
    const stats = pathsDB.getPathStats();

    return json({
      success: true,
      tree,
      stats,
      meta: {
        max_depth: maxDepth,
        with_posts: withPosts
      }
    });

  } catch (error) {
    console.error('Error fetching path tree:', error);
    return json({ error: error.message }, { status: 500 });
  }
}