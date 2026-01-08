/**
 * Post Permission System
 *
 * Rules:
 * - Public posts: Everyone can read
 * - Private posts: Only author can read/write
 * - Group posts: Only specified groups can read/write
 * - Author always has full permissions on their posts
 * - Admins have full permissions on all posts
 */

import { pool } from '$lib/db.js';

/**
 * Check if user can read a specific post
 * @param {number} postId - Post ID
 * @param {number|null} userId - User ID (null for anonymous)
 * @param {string} userRole - User role ('user' or 'admin')
 * @returns {Promise<boolean>}
 */
export async function canReadPost(postId, userId = null, userRole = 'user') {
  // Admins can read everything
  if (userRole === 'admin') {
    return true;
  }

  const result = await pool.query(`
    SELECT p.id
    FROM posts p
    LEFT JOIN post_read_groups prg ON p.id = prg.post_id
    LEFT JOIN user_groups ug ON prg.group_id = ug.group_id AND ug.user_id = $2
    WHERE p.id = $1
      AND p.published = true
      AND (
        -- Public posts
        p.visibility = 'public'
        -- Private posts (author only)
        OR (p.visibility = 'private' AND p.author_id = $2)
        -- Group posts (user is in a read group)
        OR (p.visibility = 'groups' AND ug.user_id IS NOT NULL)
      )
    LIMIT 1
  `, [postId, userId]);

  return result.rows.length > 0;
}

/**
 * Check if user can write/edit a specific post
 * @param {number} postId - Post ID
 * @param {number} userId - User ID
 * @param {string} userRole - User role ('user' or 'admin')
 * @returns {Promise<boolean>}
 */
export async function canWritePost(postId, userId, userRole = 'user') {
  console.log('🔐 Checking write permission - Post:', postId, 'User:', userId, 'Role:', userRole);

  // Admins can edit everything
  if (userRole === 'admin') {
    console.log('✅ User is admin - write access granted');
    return true;
  }

  const result = await pool.query(`
    SELECT p.id, p.author_id, pwg.group_id as write_group_id, ug.user_id as user_in_group
    FROM posts p
    LEFT JOIN post_write_groups pwg ON p.id = pwg.post_id
    LEFT JOIN user_groups ug ON pwg.group_id = ug.group_id AND ug.user_id = $2
    WHERE p.id = $1
      AND (
        -- Post author can always write
        p.author_id = $2
        -- User is in a write group
        OR ug.user_id IS NOT NULL
      )
    LIMIT 1
  `, [postId, userId]);

  console.log('🔐 Write check result:', result.rows);
  const hasAccess = result.rows.length > 0;
  console.log(hasAccess ? '✅ Write access granted' : '❌ Write access denied');

  return hasAccess;
}

/**
 * Check if user can delete a specific post
 * @param {number} postId - Post ID
 * @param {number} userId - User ID
 * @param {string} userRole - User role ('user' or 'admin')
 * @returns {Promise<boolean>}
 */
export async function canDeletePost(postId, userId, userRole = 'user') {
  // Admins can delete everything
  if (userRole === 'admin') {
    return true;
  }

  // Only author can delete (not group members)
  const result = await pool.query(`
    SELECT id FROM posts
    WHERE id = $1 AND author_id = $2
    LIMIT 1
  `, [postId, userId]);

  return result.rows.length > 0;
}

/**
 * Get all posts a user can read
 * @param {number|null} userId - User ID (null for anonymous)
 * @returns {Promise<Array>}
 */
export async function getUserReadablePosts(userId = null) {
  const result = await pool.query(`
    SELECT DISTINCT
      p.id,
      p.title,
      p.excerpt,
      p.category,
      p.category_post_number,
      p.slug,
      p.visibility,
      p.created_at,
      p.updated_at,
      p.read_time,
      u.display_name as author,
      u.id as author_id,
      -- Include permission info
      CASE
        WHEN p.author_id = $1 THEN true
        ELSE EXISTS(
          SELECT 1 FROM post_write_groups pwg
          JOIN user_groups ug ON pwg.group_id = ug.group_id
          WHERE pwg.post_id = p.id AND ug.user_id = $1
        )
      END as can_edit
    FROM posts p
    INNER JOIN users u ON p.author_id = u.id
    LEFT JOIN post_read_groups prg ON p.id = prg.post_id
    LEFT JOIN user_groups ug ON prg.group_id = ug.group_id AND ug.user_id = $1
    WHERE p.published = true
      AND (
        p.visibility = 'public'
        OR (p.visibility = 'private' AND p.author_id = $1)
        OR (p.visibility = 'groups' AND ug.user_id IS NOT NULL)
      )
    ORDER BY p.created_at DESC
  `, [userId]);

  return result.rows;
}

/**
 * Get all posts a user can write/edit
 * @param {number} userId - User ID
 * @param {string} userRole - User role
 * @returns {Promise<Array>}
 */
export async function getUserEditablePosts(userId, userRole = 'user') {
  // Admins can edit everything
  if (userRole === 'admin') {
    const result = await pool.query(`
      SELECT DISTINCT
        p.id,
        p.title,
        p.excerpt,
        p.category,
        p.slug,
        p.visibility,
        p.created_at,
        u.display_name as author
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      WHERE p.published = true
      ORDER BY p.created_at DESC
    `);
    return result.rows;
  }

  const result = await pool.query(`
    SELECT DISTINCT
      p.id,
      p.title,
      p.excerpt,
      p.category,
      p.slug,
      p.visibility,
      p.created_at,
      u.display_name as author,
      CASE WHEN p.author_id = $1 THEN 'owner' ELSE 'editor' END as permission_type
    FROM posts p
    INNER JOIN users u ON p.author_id = u.id
    LEFT JOIN post_write_groups pwg ON p.id = pwg.post_id
    LEFT JOIN user_groups ug ON pwg.group_id = ug.group_id AND ug.user_id = $1
    WHERE p.published = true
      AND (
        p.author_id = $1
        OR ug.user_id IS NOT NULL
      )
    ORDER BY p.created_at DESC
  `, [userId]);

  return result.rows;
}

/**
 * Set post permissions (read and write groups)
 * @param {number} postId - Post ID
 * @param {Array<number>} readGroupIds - Group IDs that can read
 * @param {Array<number>} writeGroupIds - Group IDs that can write
 * @returns {Promise<void>}
 */
export async function setPostPermissions(postId, readGroupIds = [], writeGroupIds = []) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Clear existing permissions
    await client.query('DELETE FROM post_read_groups WHERE post_id = $1', [postId]);
    await client.query('DELETE FROM post_write_groups WHERE post_id = $1', [postId]);

    // Add read groups
    for (const groupId of readGroupIds) {
      await client.query(
        'INSERT INTO post_read_groups (post_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [postId, groupId]
      );
    }

    // Add write groups
    for (const groupId of writeGroupIds) {
      await client.query(
        'INSERT INTO post_write_groups (post_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [postId, groupId]
      );

      // Write groups should also have read access
      // Add to read groups if not already there
      if (!readGroupIds.includes(groupId)) {
        await client.query(
          'INSERT INTO post_read_groups (post_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [postId, groupId]
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get post permissions (read and write groups)
 * @param {number} postId - Post ID
 * @returns {Promise<{readGroups: Array, writeGroups: Array}>}
 */
export async function getPostPermissions(postId) {
  const readResult = await pool.query(`
    SELECT g.id, g.name
    FROM post_read_groups prg
    JOIN groups g ON prg.group_id = g.id
    WHERE prg.post_id = $1
    ORDER BY g.name
  `, [postId]);

  const writeResult = await pool.query(`
    SELECT g.id, g.name
    FROM post_write_groups pwg
    JOIN groups g ON pwg.group_id = g.id
    WHERE pwg.post_id = $1
    ORDER BY g.name
  `, [postId]);

  return {
    readGroups: readResult.rows,
    writeGroups: writeResult.rows
  };
}

/**
 * Get user's groups
 * @param {number} userId - User ID
 * @returns {Promise<Array>}
 */
export async function getUserGroups(userId) {
  const result = await pool.query(`
    SELECT g.id, g.name, g.description
    FROM groups g
    INNER JOIN user_groups ug ON g.id = ug.group_id
    WHERE ug.user_id = $1
    ORDER BY g.name
  `, [userId]);

  return result.rows;
}

/**
 * Check if post is accessible (including unpublished for author/admin)
 * @param {number} postId - Post ID
 * @param {number} userId - User ID
 * @param {string} userRole - User role
 * @returns {Promise<boolean>}
 */
export async function canAccessPost(postId, userId, userRole = 'user') {
  // Admin can access everything
  if (userRole === 'admin') {
    return true;
  }

  const result = await pool.query(`
    SELECT p.id
    FROM posts p
    LEFT JOIN post_read_groups prg ON p.id = prg.post_id
    LEFT JOIN user_groups ug ON prg.group_id = ug.group_id AND ug.user_id = $2
    WHERE p.id = $1
      AND (
        -- Author can access their own posts (published or not)
        p.author_id = $2
        -- Published posts with proper permissions
        OR (
          p.published = true
          AND (
            p.visibility = 'public'
            OR (p.visibility = 'private' AND p.author_id = $2)
            OR (p.visibility = 'groups' AND ug.user_id IS NOT NULL)
          )
        )
      )
    LIMIT 1
  `, [postId, userId]);

  return result.rows.length > 0;
}
