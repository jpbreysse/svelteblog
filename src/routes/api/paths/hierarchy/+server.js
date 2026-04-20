import { json } from '@sveltejs/kit';
import { pool } from '$lib/db.js';
import { canReadPost } from '$lib/server/permissions.js';

/**
 * GET /api/paths/hierarchy
 * Get hierarchical tree of paths with their posts
 */
export async function GET({ locals }) {
  try {
    // Get all paths with hierarchy
    const pathsResult = await pool.query(`
      WITH RECURSIVE path_tree AS (
        -- Root paths (no parent)
        SELECT
          p.id, p.name, p.slug, p.parent_id, p.level, p.position,
          p.full_path, p.icon, p.color,
          ARRAY[p.id] as path_ids,
          0 as depth,
          (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as child_count
        FROM paths p
        WHERE p.parent_id IS NULL

        UNION ALL

        -- Child paths (recursive)
        SELECT
          p.id, p.name, p.slug, p.parent_id, p.level, p.position,
          p.full_path, p.icon, p.color,
          pt.path_ids || p.id,
          pt.depth + 1,
          (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as child_count
        FROM paths p
        INNER JOIN path_tree pt ON p.parent_id = pt.id
        WHERE pt.depth < 4  -- Max depth to prevent infinite loops
      )
      SELECT * FROM path_tree
      ORDER BY depth, position, name
    `);

    // Get all published posts with their path and author info
    const postsResult = await pool.query(`
      SELECT
        p.id, p.title, p.slug, p.path_id, p.parent_id as post_parent_id,
        p.category, p.category_post_number, p.author_id, p.created_at, p.visibility,
        u.display_name as author,
        (SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND published = true) as child_count
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      WHERE p.published = true
      ORDER BY p.path_id, p.position, p.created_at
    `);

    // Filter posts based on read permissions
    const userId = locals.user?.id || null;
    const userRole = locals.user?.role || 'user';
    const filteredPosts = [];

    for (const post of postsResult.rows) {
      const canRead = await canReadPost(post.id, userId, userRole);
      if (canRead) {
        filteredPosts.push(post);
      }
    }

    return json({
      success: true,
      paths: pathsResult.rows,
      posts: filteredPosts
    });
  } catch (error) {
    console.error('Error fetching path hierarchy:', error);
    return json({
      success: false,
      error: 'Failed to fetch path hierarchy'
    }, { status: 500 });
  }
}
