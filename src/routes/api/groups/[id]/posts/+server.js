import { json } from '@sveltejs/kit';
import { pool } from '$lib/db.js';

// GET /api/groups/[id]/posts - Get all posts accessible by a group
export async function GET({ params, locals }) {
  const idParam = params.id;

  // Handle virtual groups (public/private)
  if (idParam === 'public') {
    try {
      const result = await pool.query(`
        SELECT
          p.id,
          p.title,
          p.slug,
          p.excerpt,
          p.category,
          p.category_post_number,
          p.visibility,
          p.created_at,
          p.updated_at,
          p.read_time,
          p.path_id,
          p.closed_at,
          u.display_name as author,
          u.id as author_id
        FROM posts p
        INNER JOIN users u ON p.author_id = u.id
        WHERE p.published = true AND p.visibility = 'public'
        ORDER BY p.created_at DESC
      `);

      return json({
        success: true,
        posts: result.rows
      });
    } catch (error) {
      console.error('Error fetching public posts:', error);
      return json({ success: false, error: 'Failed to fetch posts' }, { status: 500 });
    }
  }

  if (idParam === 'private') {
    if (!locals.user) {
      return json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    try {
      const result = await pool.query(`
        SELECT
          p.id,
          p.title,
          p.slug,
          p.excerpt,
          p.category,
          p.category_post_number,
          p.visibility,
          p.created_at,
          p.updated_at,
          p.read_time,
          p.path_id,
          p.closed_at,
          u.display_name as author,
          u.id as author_id
        FROM posts p
        INNER JOIN users u ON p.author_id = u.id
        WHERE p.author_id = $1 AND p.visibility = 'private'
        ORDER BY p.created_at DESC
      `, [locals.user.id]);

      return json({
        success: true,
        posts: result.rows
      });
    } catch (error) {
      console.error('Error fetching private posts:', error);
      return json({ success: false, error: 'Failed to fetch posts' }, { status: 500 });
    }
  }

  // Real group - require authentication
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  const groupId = parseInt(idParam);

  if (isNaN(groupId)) {
    return json({
      success: false,
      error: 'Invalid group ID'
    }, { status: 400 });
  }

  try {
    // Get group info
    const groupResult = await pool.query(`
      SELECT id, name, description
      FROM groups
      WHERE id = $1
    `, [groupId]);

    if (groupResult.rows.length === 0) {
      return json({
        success: false,
        error: 'Group not found'
      }, { status: 404 });
    }

    const group = groupResult.rows[0];

    // Get posts with read access for this group
    const readPostsResult = await pool.query(`
      SELECT DISTINCT
        p.id,
        p.title,
        p.slug,
        p.excerpt,
        p.category,
        p.category_post_number,
        p.visibility,
        p.created_at,
        p.updated_at,
        p.read_time,
        p.path_id,
        u.display_name as author,
        u.id as author_id,
        'read' as access_type
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      INNER JOIN post_read_groups prg ON p.id = prg.post_id
      WHERE prg.group_id = $1
        AND p.published = true
        AND NOT EXISTS (
          SELECT 1 FROM post_write_groups pwg
          WHERE pwg.post_id = p.id AND pwg.group_id = $1
        )
      ORDER BY p.created_at DESC
    `, [groupId]);

    // Get posts with write access for this group
    const writePostsResult = await pool.query(`
      SELECT DISTINCT
        p.id,
        p.title,
        p.slug,
        p.excerpt,
        p.category,
        p.category_post_number,
        p.visibility,
        p.created_at,
        p.updated_at,
        p.read_time,
        p.path_id,
        u.display_name as author,
        u.id as author_id,
        'write' as access_type
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      INNER JOIN post_write_groups pwg ON p.id = pwg.post_id
      WHERE pwg.group_id = $1
        AND p.published = true
      ORDER BY p.created_at DESC
    `, [groupId]);

    // Get member count for the group
    const memberCountResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM user_groups
      WHERE group_id = $1
    `, [groupId]);

    // Combine all posts
    const allPosts = [...writePostsResult.rows, ...readPostsResult.rows];

    return json({
      success: true,
      group: {
        ...group,
        memberCount: parseInt(memberCountResult.rows[0].count)
      },
      posts: allPosts,
      readPosts: readPostsResult.rows,
      writePosts: writePostsResult.rows,
      totalPosts: allPosts.length
    });
  } catch (error) {
    console.error('Error fetching group posts:', error);
    return json({
      success: false,
      error: 'Failed to fetch group posts'
    }, { status: 500 });
  }
}
