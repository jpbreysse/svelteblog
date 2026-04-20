import { json } from '@sveltejs/kit';
import { pathsDB } from '$lib/paths.js';

// Convert flat list to nested tree structure
function buildNestedTree(flatPaths) {
  if (!flatPaths || flatPaths.length === 0) return [];

  // Create a map for easy lookup and add children array
  const pathMap = {};
  flatPaths.forEach(path => {
    pathMap[path.id] = {
      ...path,
      children: []
    };
  });

  // Build tree by connecting parents and children
  const roots = [];
  flatPaths.forEach(path => {
    if (path.parent_id === null) {
      // Root level path
      roots.push(pathMap[path.id]);
    } else if (pathMap[path.parent_id]) {
      // Add as child of parent
      pathMap[path.parent_id].children.push(pathMap[path.id]);
    }
  });

  return roots;
}

// GET /api/paths/tree - Get optimized tree structure
// Query params: ?max_depth=3 (limit depth)
//               ?with_posts=true (include post counts)
export async function GET({ url, locals }) {
  try {
    const maxDepth = parseInt(url.searchParams.get('max_depth')) || 5;
    const withPosts = url.searchParams.get('with_posts') === 'true';

    // Get all paths (flat list)
    const flatPaths = await pathsDB.getAllPaths();

    // Convert to nested tree structure
    const tree = buildNestedTree(flatPaths);

    // Get global stats
    const stats = await pathsDB.getPathStatistics();

    console.log(`✅ Tree structure built: ${tree.length} root paths, ${flatPaths.length} total paths`);

    return json({
      success: true,
      tree,
      stats,
      meta: {
        max_depth: maxDepth,
        with_posts: withPosts,
        total_paths: flatPaths.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching path tree:', error);
    return json({ error: error.message }, { status: 500 });
  }
}