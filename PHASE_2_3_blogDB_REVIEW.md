// ============================================
// BLOG Database Operations
// Phase 2.3: All 13 methods converted to async
// ============================================

export const blogDB = {
  /**
   * Get all posts with author info
   * @returns {Promise<Array>} All posts with author details
   */
  async getAllPosts() {
    const result = await pool.query(`
      SELECT 
        p.id, p.title, p.content, p.excerpt, p.category, p.slug,
        p.read_time, p.created_at, p.updated_at, p.published,
        u.id as author_id, u.display_name as author_name, u.email as author_email,
        array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags,
        pa.full_path as path
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      LEFT JOIN paths pa ON p.path_id = pa.id
      GROUP BY p.id, u.id, pa.id
      ORDER BY p.created_at DESC
    `);
    return result.rows;
  },

  /**
   * Get posts by user
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Posts authored by user
   */
  async getPostsByUser(userId) {
    const result = await pool.query(`
      SELECT 
        p.id, p.title, p.content, p.excerpt, p.category, p.slug,
        p.read_time, p.created_at, p.updated_at, p.published,
        u.id as author_id, u.display_name as author_name,
        array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.author_id = $1
      GROUP BY p.id, u.id
      ORDER BY p.created_at DESC
    `, [userId]);
    return result.rows;
  },

  /**
   * Get post by ID
   * @param {number} id - Post ID
   * @returns {Promise<Object|null>} Post object or null
   */
  async getPostById(id) {
    const result = await pool.query(`
      SELECT 
        p.*,
        u.id as author_id, u.display_name as author_name, u.email as author_email,
        array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags,
        pa.full_path as path
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      LEFT JOIN paths pa ON p.path_id = pa.id
      WHERE p.id = $1
      GROUP BY p.id, u.id, pa.id
    `, [id]);
    return result.rows[0] || null;
  },

  /**
   * Get post by slug
   * @param {string} slug - Post slug
   * @returns {Promise<Object|null>} Post object or null
   */
  async getPostBySlug(slug) {
    const result = await pool.query(`
      SELECT 
        p.*,
        u.id as author_id, u.display_name as author_name, u.email as author_email,
        array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags,
        pa.full_path as path
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      LEFT JOIN paths pa ON p.path_id = pa.id
      WHERE p.slug = $1 AND p.published = true
      GROUP BY p.id, u.id, pa.id
    `, [slug]);
    return result.rows[0] || null;
  },

  /**
   * Create new post
   * @param {Object} postData - Post data (title, content, category, etc.)
   * @param {number} authorId - Author user ID
   * @returns {Promise<Object>} Created post with ID
   */
  async createPost(postData, authorId) {
    const { title, content, category = 'thoughts', path_id = null } = postData;
    
    // Generate slug, read_time, and excerpt
    const slug = generateSlug(title);
    const read_time = calculateReadTime(content);
    const excerpt = generateExcerpt(content);

    const result = await pool.query(`
      INSERT INTO posts (
        title, content, excerpt, category, slug, read_time, 
        author_id, path_id, published
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      RETURNING id, title, slug, created_at
    `, [title, content, excerpt, category, slug, read_time, authorId, path_id]);

    if (result.rowCount === 0) {
      throw new Error('Failed to create post');
    }

    return {
      success: true,
      post: result.rows[0]
    };
  },

  /**
   * Update existing post
   * @param {number} id - Post ID
   * @param {Object} postData - Updated data
   * @param {number} authorId - User ID (for authorization)
   * @returns {Promise<Object>} Success message
   */
  async updatePost(id, postData, authorId) {
    // Verify post belongs to author
    const postResult = await pool.query(
      'SELECT author_id FROM posts WHERE id = $1',
      [id]
    );
    const post = postResult.rows[0];

    if (!post) {
      throw new Error('Post not found');
    }

    if (post.author_id !== authorId) {
      throw new Error('You can only edit your own posts');
    }

    // Update the post
    const { title, content, category, path_id } = postData;
    const read_time = calculateReadTime(content);
    const excerpt = generateExcerpt(content);

    const result = await pool.query(`
      UPDATE posts 
      SET title = $1, content = $2, excerpt = $3, category = $4, 
          read_time = $5, path_id = $6, updated_at = NOW()
      WHERE id = $7
    `, [title, content, excerpt, category, read_time, path_id, id]);

    if (result.rowCount === 0) {
      throw new Error('Failed to update post');
    }

    return { success: true, message: 'Post updated successfully' };
  },

  /**
   * Delete post
   * @param {number} id - Post ID
   * @param {number} authorId - User ID (for authorization)
   * @returns {Promise<Object>} Success message
   */
  async deletePost(id, authorId) {
    // Verify post belongs to author
    const postResult = await pool.query(
      'SELECT author_id FROM posts WHERE id = $1',
      [id]
    );
    const post = postResult.rows[0];

    if (!post) {
      throw new Error('Post not found');
    }

    if (post.author_id !== authorId) {
      throw new Error('You can only delete your own posts');
    }

    // Delete post (cascade will delete tags via foreign key)
    const result = await pool.query(
      'DELETE FROM posts WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error('Failed to delete post');
    }

    return { success: true, message: 'Post deleted successfully' };
  },

  /**
   * Update post tags
   * @param {number} postId - Post ID
   * @param {Array<string>} tagNames - Array of tag names
   * @returns {Promise<Object>} Success message
   */
  async updatePostTags(postId, tagNames) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing tags for this post
      await client.query('DELETE FROM post_tags WHERE post_id = $1', [postId]);

      // For each tag, get or create it, then add to post
      for (const tagName of tagNames) {
        // Get or create tag
        const tagResult = await client.query(`
          INSERT INTO tags (name) VALUES ($1)
          ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
          RETURNING id
        `, [tagName]);

        const tagId = tagResult.rows[0].id;

        // Add tag to post
        await client.query(
          'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)',
          [postId, tagId]
        );
      }

      await client.query('COMMIT');

      return {
        success: true,
        message: `Post tagged with ${tagNames.length} tags`
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Search posts by title/content
   * @param {string} query - Search query
   * @param {string} category - Optional category filter
   * @returns {Promise<Array>} Matching posts
   */
  async searchPosts(query, category = null) {
    let sql = `
      SELECT 
        p.id, p.title, p.excerpt, p.category, p.slug,
        p.created_at, u.display_name as author_name,
        array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.published = true 
        AND (p.title ILIKE $1 OR p.content ILIKE $1 OR p.excerpt ILIKE $1)
    `;
    
    const params = [`%${query}%`];

    if (category) {
      sql += ' AND p.category = $2';
      params.push(category);
    }

    sql += ' GROUP BY p.id, u.id ORDER BY p.created_at DESC';

    const result = await pool.query(sql, params);
    return result.rows;
  },

  /**
   * Get posts by category
   * @param {string} category - Category name
   * @returns {Promise<Array>} Posts in category
   */
  async getPostsByCategory(category) {
    const result = await pool.query(`
      SELECT 
        p.id, p.title, p.excerpt, p.category, p.slug,
        p.created_at, u.display_name as author_name,
        array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.category = $1 AND p.published = true
      GROUP BY p.id, u.id
      ORDER BY p.created_at DESC
    `, [category]);
    return result.rows;
  },

  /**
   * Get all categories
   * @returns {Promise<Array>} Distinct categories
   */
  async getCategories() {
    const result = await pool.query(`
      SELECT DISTINCT category, COUNT(*) as post_count
      FROM posts
      WHERE published = true
      GROUP BY category
      ORDER BY category ASC
    `);
    return result.rows;
  },

  /**
   * Get all tags
   * @returns {Promise<Array>} All tags with usage count
   */
  async getTags() {
    const result = await pool.query(`
      SELECT t.id, t.name, COUNT(pt.post_id) as usage_count
      FROM tags t
      LEFT JOIN post_tags pt ON t.id = pt.tag_id
      GROUP BY t.id, t.name
      ORDER BY usage_count DESC, t.name ASC
    `);
    return result.rows;
  },

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database stats
   */
  async getStats() {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE published = true) as published_posts,
        (SELECT COUNT(*) FROM posts) as total_posts,
        (SELECT COUNT(*) FROM users WHERE role = 'user') as total_users,
        (SELECT COUNT(*) FROM tags) as total_tags,
        (SELECT COUNT(DISTINCT author_id) FROM posts) as authors_count,
        (SELECT COUNT(*) FROM content_reports WHERE status = 'pending') as pending_reports
    `);
    return result.rows[0];
  }
};
