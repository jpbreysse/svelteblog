import { pool } from '$lib/db.js';

export async function load({ params, locals }) {
  const userId = locals.user?.id;
  const isAdmin = locals.user?.role === 'admin';
  const idParam = params.id;

  // Handle virtual groups: "public" and "private"
  const isPublicView = idParam === 'public';
  const isPrivateView = idParam === 'private';
  const isVirtualGroup = isPublicView || isPrivateView;
  const groupId = isVirtualGroup ? null : parseInt(idParam);

  if (!isVirtualGroup && isNaN(groupId)) {
    return {
      error: 'Invalid group ID',
      group: null,
      posts: [],
      allGroups: [],
      virtualGroups: []
    };
  }

  try {
    let group = null;
    let posts = [];

    if (isPublicView) {
      // Virtual "Public" group - all public posts
      group = {
        id: 'public',
        name: 'Public',
        description: 'Posts visible to everyone',
        isVirtual: true,
        icon: '🌍'
      };

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
        WHERE p.published = true
          AND p.visibility = 'public'
        ORDER BY p.created_at DESC
      `);
      posts = result.rows;

    } else if (isPrivateView) {
      // Virtual "Private" group - user's private posts only
      if (!userId) {
        return {
          error: 'You must be logged in to view private posts',
          group: null,
          posts: [],
          allGroups: [],
          virtualGroups: []
        };
      }

      group = {
        id: 'private',
        name: 'My Private',
        description: 'Posts only you can see',
        isVirtual: true,
        icon: '🔒'
      };

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
        WHERE p.author_id = $1
          AND p.visibility = 'private'
        ORDER BY p.created_at DESC
      `, [userId]);
      posts = result.rows;

    } else {
      // Real group
      const groupResult = await pool.query(`
        SELECT id, name, description
        FROM groups
        WHERE id = $1
      `, [groupId]);

      if (groupResult.rows.length === 0) {
        return {
          error: 'Group not found',
          group: null,
          posts: [],
          allGroups: [],
          virtualGroups: []
        };
      }

      group = { ...groupResult.rows[0], isVirtual: false, icon: '👥' };

      // Check if user is a member of this group (or admin)
      if (!isAdmin && userId) {
        const memberCheck = await pool.query(`
          SELECT 1 FROM user_groups
          WHERE user_id = $1 AND group_id = $2
          LIMIT 1
        `, [userId, groupId]);

        if (memberCheck.rows.length === 0) {
          return {
            error: 'You are not a member of this group',
            group,
            posts: [],
            allGroups: [],
            virtualGroups: [],
            userIsMember: false
          };
        }
      }

      // Get member count
      const memberCountResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM user_groups
        WHERE group_id = $1
      `, [groupId]);
      group.memberCount = parseInt(memberCountResult.rows[0].count);

      // Get posts for this group (both read and write access)
      const result = await pool.query(`
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
          p.closed_at,
          u.display_name as author,
          u.id as author_id,
          CASE WHEN pwg.post_id IS NOT NULL THEN 'write' ELSE 'read' END as access_type
        FROM posts p
        INNER JOIN users u ON p.author_id = u.id
        LEFT JOIN post_read_groups prg ON p.id = prg.post_id AND prg.group_id = $1
        LEFT JOIN post_write_groups pwg ON p.id = pwg.post_id AND pwg.group_id = $1
        WHERE p.published = true
          AND p.visibility = 'groups'
          AND (prg.post_id IS NOT NULL OR pwg.post_id IS NOT NULL)
        ORDER BY p.created_at DESC
      `, [groupId]);
      posts = result.rows;
    }

    // Get virtual groups with counts
    const publicCountResult = await pool.query(`
      SELECT COUNT(*) as count FROM posts
      WHERE published = true AND visibility = 'public'
    `);

    const privateCountResult = userId ? await pool.query(`
      SELECT COUNT(*) as count FROM posts
      WHERE author_id = $1 AND visibility = 'private'
    `, [userId]) : { rows: [{ count: 0 }] };

    const virtualGroups = [
      { id: 'public', name: 'Public', icon: '🌍', post_count: parseInt(publicCountResult.rows[0].count) },
      { id: 'private', name: 'My Private', icon: '🔒', post_count: parseInt(privateCountResult.rows[0].count) }
    ];

    // Get real groups the user is a member of (or all for admin) with post counts
    console.log('📡 Loading groups for user:', userId, 'isAdmin:', isAdmin);

    let allGroupsResult;
    if (isAdmin) {
      // Admin sees all groups
      allGroupsResult = await pool.query(`
        SELECT
          g.id,
          g.name,
          '👥' as icon,
          (
            SELECT COUNT(DISTINCT ap.post_id) FROM (
              SELECT prg.post_id FROM post_read_groups prg
              JOIN posts p ON prg.post_id = p.id AND p.published = true AND p.visibility = 'groups'
              WHERE prg.group_id = g.id
              UNION
              SELECT pwg.post_id FROM post_write_groups pwg
              JOIN posts p ON pwg.post_id = p.id AND p.published = true AND p.visibility = 'groups'
              WHERE pwg.group_id = g.id
            ) ap
          ) as post_count
        FROM groups g
        ORDER BY g.name
      `);
    } else {
      // Regular user only sees groups they're a member of
      allGroupsResult = await pool.query(`
        SELECT
          g.id,
          g.name,
          '👥' as icon,
          (
            SELECT COUNT(DISTINCT ap.post_id) FROM (
              SELECT prg.post_id FROM post_read_groups prg
              JOIN posts p ON prg.post_id = p.id AND p.published = true AND p.visibility = 'groups'
              WHERE prg.group_id = g.id
              UNION
              SELECT pwg.post_id FROM post_write_groups pwg
              JOIN posts p ON pwg.post_id = p.id AND p.published = true AND p.visibility = 'groups'
              WHERE pwg.group_id = g.id
            ) ap
          ) as post_count
        FROM groups g
        INNER JOIN user_groups ug ON g.id = ug.group_id
        WHERE ug.user_id = $1
        ORDER BY g.name
      `, [userId]);
    }

    console.log('📡 Groups found:', allGroupsResult.rows.map(g => g.name));

    return {
      user: locals.user,
      group,
      posts,
      virtualGroups,
      allGroups: allGroupsResult.rows,
      userIsMember: true,
      error: null
    };
  } catch (error) {
    console.error('Error loading group posts:', error);
    return {
      error: 'Failed to load posts',
      group: null,
      posts: [],
      allGroups: [],
      virtualGroups: []
    };
  }
}
