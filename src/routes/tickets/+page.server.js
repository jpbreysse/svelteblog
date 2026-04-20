import { pool } from '$lib/db.js';

export async function load({ locals, url }) {
  const userId = locals.user?.id;
  const userRole = locals.user?.role || 'user';
  const isAdmin = userRole === 'admin';

  // Get filter parameters
  const closedFilter = url.searchParams.get('closed'); // 'all', 'open', 'closed'
  const assignedFilter = url.searchParams.get('assigned'); // 'all', 'assigned', 'unassigned', 'mine'
  const groupFilter = url.searchParams.get('group'); // group id or 'all'
  const searchQuery = url.searchParams.get('search') || '';

  try {
    let posts = [];

    if (isAdmin) {
      // Admin sees all posts
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
          p.published,
          p.closed_at,
          p.assigned_to,
          p.assigned_at,
          author.id as author_id,
          author.display_name as author_name,
          assignee.display_name as assignee_name,
          closer.display_name as closed_by_name,
          p.closed_by,
          -- Get groups with read access
          (
            SELECT array_agg(DISTINCT g.name)
            FROM post_read_groups prg
            JOIN groups g ON prg.group_id = g.id
            WHERE prg.post_id = p.id
          ) as read_groups,
          -- Get groups with write access
          (
            SELECT array_agg(DISTINCT g.name)
            FROM post_write_groups pwg
            JOIN groups g ON pwg.group_id = g.id
            WHERE pwg.post_id = p.id
          ) as write_groups
        FROM posts p
        INNER JOIN users author ON p.author_id = author.id
        LEFT JOIN users assignee ON p.assigned_to = assignee.id
        LEFT JOIN users closer ON p.closed_by = closer.id
        WHERE p.published = true
        ORDER BY p.updated_at DESC
      `);
      posts = result.rows;
    } else if (userId) {
      // Regular user sees posts they have access to
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
          p.published,
          p.closed_at,
          p.assigned_to,
          p.assigned_at,
          author.id as author_id,
          author.display_name as author_name,
          assignee.display_name as assignee_name,
          closer.display_name as closed_by_name,
          p.closed_by,
          -- Get groups with read access
          (
            SELECT array_agg(DISTINCT g.name)
            FROM post_read_groups prg
            JOIN groups g ON prg.group_id = g.id
            WHERE prg.post_id = p.id
          ) as read_groups,
          -- Get groups with write access
          (
            SELECT array_agg(DISTINCT g.name)
            FROM post_write_groups pwg
            JOIN groups g ON pwg.group_id = g.id
            WHERE pwg.post_id = p.id
          ) as write_groups,
          -- Check if user can write
          CASE
            WHEN p.author_id = $1 THEN true
            WHEN EXISTS (
              SELECT 1 FROM post_write_groups pwg
              JOIN user_groups ug ON pwg.group_id = ug.group_id
              WHERE pwg.post_id = p.id AND ug.user_id = $1
            ) THEN true
            ELSE false
          END as can_write
        FROM posts p
        INNER JOIN users author ON p.author_id = author.id
        LEFT JOIN users assignee ON p.assigned_to = assignee.id
        LEFT JOIN users closer ON p.closed_by = closer.id
        LEFT JOIN post_read_groups prg ON p.id = prg.post_id
        LEFT JOIN user_groups ug_read ON prg.group_id = ug_read.group_id AND ug_read.user_id = $1
        LEFT JOIN post_write_groups pwg ON p.id = pwg.post_id
        LEFT JOIN user_groups ug_write ON pwg.group_id = ug_write.group_id AND ug_write.user_id = $1
        WHERE p.published = true
          AND (
            -- Public posts
            p.visibility = 'public'
            -- Private posts (author only)
            OR (p.visibility = 'private' AND p.author_id = $1)
            -- Author's own posts
            OR p.author_id = $1
            -- Group posts (user is in a read or write group)
            OR (p.visibility = 'groups' AND (ug_read.user_id IS NOT NULL OR ug_write.user_id IS NOT NULL))
          )
        ORDER BY p.updated_at DESC
      `, [userId]);
      posts = result.rows;
    } else {
      // Anonymous user sees only public posts
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
          p.published,
          p.closed_at,
          p.assigned_to,
          author.id as author_id,
          author.display_name as author_name,
          assignee.display_name as assignee_name,
          null as read_groups,
          null as write_groups
        FROM posts p
        INNER JOIN users author ON p.author_id = author.id
        LEFT JOIN users assignee ON p.assigned_to = assignee.id
        WHERE p.published = true AND p.visibility = 'public'
        ORDER BY p.updated_at DESC
      `);
      posts = result.rows;
    }

    // Get available groups for filtering (user's groups or all for admin)
    let availableGroups = [];
    if (isAdmin) {
      const groupsResult = await pool.query(`
        SELECT id, name FROM groups ORDER BY name
      `);
      availableGroups = groupsResult.rows;
    } else if (userId) {
      const groupsResult = await pool.query(`
        SELECT g.id, g.name
        FROM groups g
        INNER JOIN user_groups ug ON g.id = ug.group_id
        WHERE ug.user_id = $1
        ORDER BY g.name
      `, [userId]);
      availableGroups = groupsResult.rows;
    }

    // Calculate stats
    const stats = {
      total: posts.length,
      open: posts.filter(p => !p.closed_at).length,
      closed: posts.filter(p => p.closed_at).length,
      assigned: posts.filter(p => p.assigned_to).length,
      unassigned: posts.filter(p => !p.assigned_to).length,
      myTickets: posts.filter(p => p.assigned_to === userId).length
    };

    return {
      user: locals.user,
      posts,
      availableGroups,
      stats,
      filters: {
        closed: closedFilter || 'all',
        assigned: assignedFilter || 'all',
        group: groupFilter || 'all',
        search: searchQuery
      }
    };
  } catch (error) {
    console.error('Error loading tickets:', error);
    return {
      user: locals.user,
      posts: [],
      availableGroups: [],
      stats: { total: 0, open: 0, closed: 0, assigned: 0, unassigned: 0, myTickets: 0 },
      filters: { closed: 'all', assigned: 'all', group: 'all', search: '' },
      error: 'Failed to load tickets'
    };
  }
}
