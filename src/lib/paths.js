import { pool } from './db.js';

// ============================================
// PATHS Database Operations (Hierarchical)
// Phase 2.4: All methods converted to async ✅
// ============================================

export const pathsDB = {
  /**
   * Generate slug from name
   * @param {string} name - Path name
   * @returns {string} Generated slug
   */
  generateSlug(name) {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')          // Replace spaces with hyphens
      .replace(/[^a-z0-9-]/g, '')    // Remove special characters
      .replace(/-+/g, '-')            // Replace multiple hyphens with single
      .replace(/^-+|-+$/g, '')        // Remove leading/trailing hyphens
      .substring(0, 50);              // Limit length
  },

  /**
   * Get all paths (flat list)
   * @returns {Promise<Array>} All paths
   */
  async getAllPaths() {
    const result = await pool.query(`
      SELECT 
        p.id, p.name, p.slug, p.description, p.parent_id,
        p.level, p.full_path, p.icon, p.color, p.position,
        p.created_at, u.display_name as created_by,
        (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as children_count,
        (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
      FROM paths p
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.level ASC, p.position ASC
    `);
    return result.rows;
  },

  /**
   * Get path by ID
   * @param {number} id - Path ID
   * @returns {Promise<Object|null>} Path object or null
   */
  async getPathById(id) {
    const result = await pool.query(`
      SELECT 
        p.*,
        u.display_name as created_by_name,
        (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as children_count,
        (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
      FROM paths p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = $1
    `, [id]);
    return result.rows[0] || null;
  },

  /**
   * Get path by full path string
   * @param {string} fullPath - Full path (e.g., "/parent/child")
   * @returns {Promise<Object|null>} Path object or null
   */
  async getPathByFullPath(fullPath) {
    const result = await pool.query(`
      SELECT 
        p.*,
        u.display_name as created_by_name,
        (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as children_count,
        (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
      FROM paths p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.full_path = $1
    `, [fullPath]);
    return result.rows[0] || null;
  },

  /**
   * Create new path
   * @param {Object} pathData - Path data
   * @param {number} userId - User creating path
   * @returns {Promise<Object>} Created path
   */
  async createPath(pathData, userId) {
    const { name, description = null, parent_id = null, icon = null, color = null, position = 0 } = pathData;

    // Auto-generate slug from name if not provided
    let slug = pathData.slug || this.generateSlug(name);

    if (!slug || slug.trim().length === 0) {
      throw new Error('Unable to generate slug from path name');
    }

    console.log(`📁 Creating path: "${name}" → slug: "${slug}"`);

    // Determine level and full_path
    let level = 1;
    let full_path = `/${slug}`;

    if (parent_id) {
      const parentResult = await pool.query(
        'SELECT level, full_path FROM paths WHERE id = $1',
        [parent_id]
      );

      if (parentResult.rows.length === 0) {
        throw new Error('Parent path not found');
      }

      const parent = parentResult.rows[0];
      level = parent.level + 1;

      if (level > 5) {
        throw new Error('Maximum hierarchy depth (5) exceeded');
      }

      full_path = `${parent.full_path}/${slug}`;
    }

    const result = await pool.query(`
      INSERT INTO paths (
        name, slug, description, parent_id, level, full_path,
        icon, color, position, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, name, slug, full_path, created_at
    `, [name, slug, description, parent_id, level, full_path, icon, color, position, userId]);

    if (result.rowCount === 0) {
      throw new Error('Failed to create path');
    }

    console.log(`✅ Created path: ${full_path} (ID: ${result.rows[0].id})`);

    return {
      success: true,
      path: result.rows[0]
    };
  },

  /**
   * Update path
   * @param {number} id - Path ID
   * @param {Object} pathData - Updated data
   * @returns {Promise<Object>} Success message
   */
  async updatePath(id, pathData) {
    const { name, description, icon, color, position } = pathData;

    const result = await pool.query(`
      UPDATE paths 
      SET name = $1, description = $2, icon = $3, color = $4, 
          position = $5, updated_at = NOW()
      WHERE id = $6
    `, [name, description, icon, color, position, id]);

    if (result.rowCount === 0) {
      throw new Error('Path not found');
    }

    console.log(`📝 Updated path: ID ${id}`);

    return { success: true, message: 'Path updated successfully' };
  },

  /**
   * Delete path (and all children if cascade)
   * @param {number} id - Path ID
   * @returns {Promise<Object>} Success message with deleted count
   */
  async deletePath(id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Count all descendants
      const countResult = await client.query(`
        WITH RECURSIVE path_tree AS (
          SELECT id FROM paths WHERE id = $1
          UNION ALL
          SELECT p.id FROM paths p
          JOIN path_tree pt ON p.parent_id = pt.id
        )
        SELECT COUNT(*) as count FROM path_tree
      `, [id]);

      const deletedCount = parseInt(countResult.rows[0].count);

      // Delete all descendants (cascade handled by foreign key)
      const result = await client.query(
        'DELETE FROM paths WHERE id = $1',
        [id]
      );

      await client.query('COMMIT');

      console.log(`🗑️ Deleted ${deletedCount} path(s)`);

      return {
        success: true,
        message: `Deleted ${deletedCount} path(s)`,
        deletedCount
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Get path children (direct children only)
   * @param {number} parentId - Parent path ID
   * @returns {Promise<Array>} Direct children
   */
  async getPathChildren(parentId) {
    const result = await pool.query(`
      SELECT 
        p.id, p.name, p.slug, p.description, p.level,
        p.full_path, p.icon, p.color, p.position,
        p.created_at,
        (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as children_count,
        (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
      FROM paths p
      WHERE p.parent_id = $1
      ORDER BY p.position ASC, p.name ASC
    `, [parentId]);
    return result.rows;
  },

  /**
   * Get full hierarchy as tree structure
   * @returns {Promise<Array>} Hierarchical tree
   */
  async getPathHierarchy() {
    const result = await pool.query(`
      WITH RECURSIVE path_tree AS (
        SELECT 
          id, name, slug, full_path, parent_id, level, 
          icon, color, position,
          ARRAY[id] as path_ids,
          1 as depth
        FROM paths
        WHERE parent_id IS NULL
        
        UNION ALL
        
        SELECT 
          p.id, p.name, p.slug, p.full_path, p.parent_id, p.level,
          p.icon, p.color, p.position,
          pt.path_ids || p.id,
          pt.depth + 1
        FROM paths p
        JOIN path_tree pt ON p.parent_id = pt.id
        WHERE pt.depth < 5
      )
      SELECT * FROM path_tree
      ORDER BY path_ids
    `);
    return result.rows;
  },

  /**
   * Get parent path
   * @param {number} id - Path ID
   * @returns {Promise<Object|null>} Parent path or null
   */
  async getParentPath(id) {
    const result = await pool.query(`
      SELECT 
        p.id, p.name, p.slug, p.full_path, p.level,
        (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as children_count,
        (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as post_count
      FROM paths p
      WHERE p.id = (SELECT parent_id FROM paths WHERE id = $1)
    `, [id]);
    return result.rows[0] || null;
  },

  /**
   * Get all descendants of a path
   * @param {number} id - Path ID
   * @returns {Promise<Array>} All descendants (including original)
   */
  async getPathDescendants(id) {
    const result = await pool.query(`
      WITH RECURSIVE descendants AS (
        SELECT id, name, slug, full_path, parent_id, level
        FROM paths
        WHERE id = $1
        
        UNION ALL
        
        SELECT p.id, p.name, p.slug, p.full_path, p.parent_id, p.level
        FROM paths p
        JOIN descendants d ON p.parent_id = d.id
      )
      SELECT * FROM descendants
      ORDER BY level ASC
    `, [id]);
    return result.rows;
  },

  /**
   * Get statistics for paths
   * @returns {Promise<Object>} Path statistics
   */
  async getPathStatistics() {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM paths) as total_paths,
        (SELECT COUNT(*) FROM paths WHERE parent_id IS NULL) as root_paths,
        (SELECT MAX(level) FROM paths) as max_depth,
        (SELECT COUNT(*) FROM paths WHERE level = 1) as level_1_count,
        (SELECT COUNT(*) FROM paths WHERE level = 2) as level_2_count,
        (SELECT COUNT(*) FROM paths WHERE level = 3) as level_3_count,
        (SELECT COUNT(*) FROM paths WHERE level = 4) as level_4_count,
        (SELECT COUNT(*) FROM paths WHERE level = 5) as level_5_count,
        (SELECT COUNT(DISTINCT path_id) FROM posts WHERE path_id IS NOT NULL) as paths_with_posts
    `);
    return result.rows[0];
  },

  /**
   * Get paths with posts count
   * @returns {Promise<Array>} Paths with post statistics
   */
  async getPathsWithPostCount() {
    const result = await pool.query(`
      SELECT 
        p.id, p.name, p.slug, p.full_path, p.level,
        p.icon, p.color,
        COUNT(po.id) as post_count
      FROM paths p
      LEFT JOIN posts po ON p.id = po.path_id
      GROUP BY p.id
      HAVING COUNT(po.id) > 0
      ORDER BY p.level ASC, p.position ASC
    `);
    return result.rows;
  }
};
