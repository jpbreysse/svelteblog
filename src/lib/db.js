import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

// Load environment variables
dotenv.config();

const { Pool } = pg;

// ============================================
// PostgreSQL Connection Pool Setup
// ============================================
console.log('🔄 Initializing PostgreSQL connection pool...');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set. Check your .env file.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
  idleTimeoutMillis: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: 2000,
});

// Connection pool event handlers
pool.on('error', (err) => {
  console.error('❌ Pool error (will attempt to recover):', err.message);
  console.error('   Error code:', err.code);
  // Don't exit - let the pool recover and retry connections automatically
});

pool.on('connect', () => {
  console.log('✅ PostgreSQL connection pool initialized');
});

pool.on('remove', () => {
  console.log('⚠️ Connection removed from pool');
});

// Test connection on startup
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connection successful!');
    console.log(`   Current database time: ${result.rows[0].now}`);
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL:');
    console.error(`   Error: ${error.message}`);
    console.error('   Make sure:');
    console.error('   1. PostgreSQL is running: docker-compose up -d');
    console.error('   2. DATABASE_URL is set in .env');
    console.error('   3. Credentials match docker-compose.yml');
    process.exit(1);
  }
}

// Test connection on startup
testConnection().catch(console.error);

// Export the pool for use in other files
export { pool };

// Helper functions
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

function calculateReadTime(content) {
  const text = content.replace(/<[^>]*>/g, '');
  const wordCount = text.split(/\s+/).length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));
  return `${readTime} min read`;
}

function generateExcerpt(content, length = 120) {
  const text = content.replace(/<[^>]*>/g, '');
  return text.length > length ? text.substring(0, length) + '...' : text;
}

// ============================================
// NOTE: All database methods below are STILL SYNCHRONOUS
// They will be converted to ASYNC in Phases 2.2-2.4
// ============================================

// ============================================
// BLOG Database Operations
// Phase 2.3: All 13 methods converted to async ✅
// ============================================

export const blogDB = {
  /**
   * Get all posts with author info
   * @returns {Promise<Array>} All posts with author details
   */
  async getAllPosts() {
    const result = await pool.query(`
      SELECT
        p.id, p.title, p.content, p.excerpt, p.category, p.category_post_number, p.slug,
        p.read_time, p.created_at, p.updated_at, p.published, p.visibility,
        u.id as author_id, u.display_name as author, u.email as author_email,
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
   * Get posts by user/author
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Posts authored by user
   */
  async getPostsByUser(userId) {
    const result = await pool.query(`
      SELECT
        p.id, p.title, p.content, p.excerpt, p.category, p.category_post_number, p.slug,
        p.read_time, p.created_at, p.updated_at, p.published, p.visibility,
        u.id as author_id, u.display_name as author, u.email as author_email,
        array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags,
        pa.full_path as path
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      LEFT JOIN paths pa ON p.path_id = pa.id
      WHERE p.author_id = $1 AND p.published = true
      GROUP BY p.id, u.id, pa.id
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
        u.id as author_id, u.display_name as author, u.email as author_email,
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
        u.id as author_id, u.display_name as author, u.email as author_email,
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
    const { title, content, category = 'thoughts', path_id = null, source_url = null } = postData;

    // Generate slug, read_time, and excerpt
    const slug = generateSlug(title);
    const read_time = calculateReadTime(content);
    const excerpt = generateExcerpt(content);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get the next category post number
      const numberResult = await client.query(`
        SELECT COALESCE(MAX(category_post_number), 0) + 1 as next_num
        FROM posts
        WHERE category = $1
      `, [category]);
      const categoryPostNumber = numberResult.rows[0].next_num;

      // Insert the post with the assigned number
      const visibility = postData.visibility || 'public';
      const result = await client.query(`
        INSERT INTO posts (
          title, content, excerpt, category, category_post_number, slug, read_time,
          author_id, path_id, published, visibility, source_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11)
        RETURNING id, title, slug, category_post_number, created_at
      `, [title, content, excerpt, category, categoryPostNumber, slug, read_time, authorId, path_id, visibility, source_url]);

      await client.query('COMMIT');

      if (result.rowCount === 0) {
        throw new Error('Failed to create post');
      }

      return {
        success: true,
        post: result.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Update existing post
   * @param {number} id - Post ID
   * @param {Object} postData - Updated data
   * @param {number} authorId - User ID (for backward compatibility, not used for permission check)
   * @param {boolean} isAdmin - Whether user is admin (for backward compatibility, not used for permission check)
   * @param {boolean} skipPermissionCheck - Skip permission check (default: true, permissions checked in API layer)
   * @returns {Promise<Object>} Success message
   * @note Permission checks should be done in the API layer using canWritePost()
   */
  async updatePost(id, postData, authorId, isAdmin = false, skipPermissionCheck = true) {
    // Verify post exists
    const postResult = await pool.query(
      'SELECT author_id FROM posts WHERE id = $1',
      [id]
    );
    const post = postResult.rows[0];

    if (!post) {
      throw new Error('Post not found');
    }

    // Permission check (legacy - should be done in API layer)
    if (!skipPermissionCheck) {
      const postAuthorId = parseInt(post.author_id);
      const userId = parseInt(authorId);

      if (postAuthorId !== userId && !isAdmin) {
        throw new Error(`You can only edit your own posts (post author: ${postAuthorId}, user: ${userId})`);
      }
    }

    // Update the post
    const { title, content, category, path_id, visibility, source_url } = postData;
    const read_time = calculateReadTime(content);
    const excerpt = generateExcerpt(content);

    const result = await pool.query(`
      UPDATE posts
      SET title = $1, content = $2, excerpt = $3, category = $4,
          read_time = $5, path_id = $6, visibility = $7, source_url = $8, updated_at = NOW()
      WHERE id = $9
    `, [title, content, excerpt, category, read_time, path_id, visibility || 'public', source_url || null, id]);

    if (result.rowCount === 0) {
      throw new Error('Failed to update post');
    }

    return { success: true, message: 'Post updated successfully' };
  },

  /**
   * Delete post
   * @param {number} id - Post ID
   * @param {number} authorId - User ID (for backward compatibility, not used for permission check)
   * @param {boolean} isAdmin - Whether user is admin (for backward compatibility, not used for permission check)
   * @param {boolean} skipPermissionCheck - Skip permission check (default: true, permissions checked in API layer)
   * @returns {Promise<Object>} Success message
   * @note Permission checks should be done in the API layer using canWritePost()
   */
  async deletePost(id, authorId, isAdmin = false, skipPermissionCheck = true) {
    // Verify post exists
    const postResult = await pool.query(
      'SELECT author_id FROM posts WHERE id = $1',
      [id]
    );
    const post = postResult.rows[0];

    if (!post) {
      throw new Error('Post not found');
    }

    // Permission check (legacy - should be done in API layer)
    if (!skipPermissionCheck) {
      const postAuthorId = parseInt(post.author_id);
      const userId = parseInt(authorId);

      if (postAuthorId !== userId && !isAdmin) {
        throw new Error('You can only delete your own posts');
      }
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
        p.id, p.title, p.excerpt, p.category, p.category_post_number, p.slug, p.visibility,
        p.created_at, u.id as author_id, u.display_name as author,
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
        p.id, p.title, p.excerpt, p.category, p.category_post_number, p.slug, p.visibility,
        p.created_at, u.id as author_id, u.display_name as author,
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
   * Get all authors who have published posts
   * @returns {Promise<Array>} All authors with post count
   */
  async getAuthors() {
    const result = await pool.query(`
      SELECT DISTINCT u.id, u.display_name, COUNT(p.id) as post_count
      FROM users u
      INNER JOIN posts p ON u.id = p.author_id
      WHERE p.published = true
      GROUP BY u.id, u.display_name
      ORDER BY u.display_name ASC
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
  },

  /**
   * Get post hierarchy tree (for Explorer view)
   * @param {number} pathId - Optional path filter
   * @returns {Promise<Array>} Hierarchical tree of posts
   */
  async getPostHierarchy(pathId = null) {
    const params = [];
    let pathFilter = '';

    if (pathId !== null) {
      pathFilter = 'AND p.path_id = $1';
      params.push(pathId);
    }

    const result = await pool.query(`
      WITH RECURSIVE post_tree AS (
        -- Root posts (no parent)
        SELECT
          p.id, p.title, p.slug, p.parent_id, p.level, p.position,
          p.category, p.category_post_number, p.author_id, p.created_at,
          u.display_name as author,
          ARRAY[p.id] as path_ids,
          0 as depth,
          (SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND published = true) as child_count
        FROM posts p
        INNER JOIN users u ON p.author_id = u.id
        WHERE p.parent_id IS NULL
          AND p.published = true
          ${pathFilter}

        UNION ALL

        -- Child posts (recursive)
        SELECT
          p.id, p.title, p.slug, p.parent_id, p.level, p.position,
          p.category, p.category_post_number, p.author_id, p.created_at,
          u.display_name as author,
          pt.path_ids || p.id,
          pt.depth + 1,
          (SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND published = true) as child_count
        FROM posts p
        INNER JOIN users u ON p.author_id = u.id
        INNER JOIN post_tree pt ON p.parent_id = pt.id
        WHERE p.published = true
          AND pt.depth < 4  -- Max depth to prevent infinite loops
      )
      SELECT * FROM post_tree
      ORDER BY depth, position, created_at
    `, params);

    return result.rows;
  },

  /**
   * Get post with children (for displaying in content area)
   * @param {number} postId - Post ID
   * @returns {Promise<Object|null>} Post with children array
   */
  async getPostWithChildren(postId) {
    // Get the post
    const post = await this.getPostById(postId);
    if (!post) return null;

    // Get direct children
    const childrenResult = await pool.query(`
      SELECT
        p.id, p.title, p.slug, p.excerpt, p.category, p.category_post_number,
        p.level, p.position,
        u.display_name as author,
        (SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND published = true) as child_count
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      WHERE p.parent_id = $1 AND p.published = true
      ORDER BY p.position ASC, p.created_at ASC
    `, [postId]);

    post.children = childrenResult.rows;
    return post;
  },

  /**
   * Get breadcrumb trail for a post
   * @param {number} postId - Post ID
   * @returns {Promise<Array>} Array of parent posts
   */
  async getPostBreadcrumbs(postId) {
    const result = await pool.query(`
      WITH RECURSIVE breadcrumb_trail AS (
        -- Start with the current post
        SELECT id, title, slug, parent_id, 0 as depth
        FROM posts
        WHERE id = $1

        UNION ALL

        -- Get parent posts
        SELECT p.id, p.title, p.slug, p.parent_id, bt.depth + 1
        FROM posts p
        INNER JOIN breadcrumb_trail bt ON p.id = bt.parent_id
      )
      SELECT id, title, slug
      FROM breadcrumb_trail
      ORDER BY depth DESC
    `, [postId]);

    return result.rows;
  }
};

// ============================================
// USER Management Database Operations
// Phase 2.2: All methods converted to async ✅
// ============================================

export const userDB = {
  /**
   * Get user by ID
   * @param {number} id - User ID
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserById(id) {
    const result = await pool.query(
      'SELECT id, email, display_name, role, status, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    return result.rows[0] || null;
  },

  /**
   * Create new user
   * @param {Object} userData - User data (email, display_name, password_hash, role)
   * @returns {Promise<Object>} Created user with ID
   */
  async createUser(userData) {
    const { email, display_name, password_hash, role = 'user' } = userData;
    
    const result = await pool.query(`
      INSERT INTO users (email, display_name, password_hash, role, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING id, email, display_name, role, status, created_at
    `, [email.toLowerCase(), display_name, password_hash, role]);

    if (result.rowCount === 0) {
      throw new Error('Failed to create user');
    }

    return {
      success: true,
      userId: result.rows[0].id,
      user: result.rows[0]
    };
  },

  /**
   * Verify current password for a user
   * @param {number} userId - User ID
   * @param {string} currentPassword - Password to verify
   * @returns {Promise<boolean>} True if password is correct
   */
  async verifyPassword(userId, currentPassword) {
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    const user = result.rows[0];

    if (!user) {
      throw new Error('User not found');
    }

    return await bcrypt.compare(currentPassword, user.password_hash);
  },

  /**
   * Change user password
   * @param {number} userId - User ID
   * @param {string} currentPassword - Current password for verification
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Success message
   */
  async changePassword(userId, currentPassword, newPassword) {
    const isCurrentPasswordValid = await this.verifyPassword(userId, currentPassword);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, userId]
    );

    if (result.rowCount === 0) {
      throw new Error('Failed to update password');
    }

    return { success: true, message: 'Password updated successfully' };
  },

  /**
   * Complete immediate account deletion
   * @param {number} userId - User ID
   * @param {string} reason - Reason for deletion
   * @returns {Promise<Object>} Deletion confirmation
   */
  async completeAccountDeletion(userId, reason = '') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get user info before deletion
      const userResult = await client.query('SELECT email FROM users WHERE id = $1', [userId]);
      const user = userResult.rows[0];

      if (!user) {
        throw new Error('User not found');
      }

      // Count posts before deletion
      const postCountResult = await client.query(
        'SELECT COUNT(*) as count FROM posts WHERE author_id = $1',
        [userId]
      );
      const postCount = parseInt(postCountResult.rows[0].count);

      // Delete post tags first (cascade will handle this, but being explicit)
      await client.query(
        'DELETE FROM post_tags WHERE post_id IN (SELECT id FROM posts WHERE author_id = $1)',
        [userId]
      );

      // Delete posts
      await client.query('DELETE FROM posts WHERE author_id = $1', [userId]);

      // Delete user
      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      await client.query('COMMIT');

      console.log(`🗑️ User ${user.email} deleted their account. ${postCount} posts removed. Reason: ${reason}`);

      return {
        success: true,
        message: `Account and ${postCount} posts deleted permanently`,
        deletedPosts: postCount
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Get users with pending deletion requests
   * @returns {Promise<Array>} Array of users with pending deletion requests
   */
  async getPendingDeletions() {
    const result = await pool.query(`
      SELECT id, email, display_name, deletion_requested_at, deletion_reason,
             (SELECT COUNT(*) FROM posts WHERE author_id = users.id) as post_count
      FROM users 
      WHERE status = 'deletion_requested'
      ORDER BY deletion_requested_at ASC
    `);
    return result.rows;
  },

  /**
   * Create a content report
   * @param {Object} reportData - Report data
   * @returns {Promise<Object>} Success with report ID
   */
  async createContentReport(reportData) {
    const {
      issue_type,
      description,
      reporter_email,
      post_id,
      post_title,
      post_url,
      reporter_ip,
      user_agent
    } = reportData;

    const result = await pool.query(`
      INSERT INTO content_reports (
        issue_type, description, reporter_email, post_id, post_title,
        post_url, reporter_ip, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      issue_type,
      description,
      reporter_email,
      post_id,
      post_title,
      post_url,
      reporter_ip,
      user_agent
    ]);

    return {
      success: true,
      reportId: result.rows[0].id
    };
  },

  /**
   * Get all content reports
   * @returns {Promise<Array>} All content reports
   */
  async getAllContentReports() {
    const result = await pool.query(`
      SELECT cr.*, 
             p.title as current_post_title,
             u.display_name
      FROM content_reports cr
      LEFT JOIN posts p ON cr.post_id = p.id
      LEFT JOIN users u ON cr.resolved_by = u.id
      ORDER BY 
        CASE cr.status 
          WHEN 'pending' THEN 1 
          WHEN 'reviewed' THEN 2 
          ELSE 3 
        END,
        cr.created_at DESC
    `);
    return result.rows;
  },

  /**
   * Get content report by ID
   * @param {number} id - Report ID
   * @returns {Promise<Object|null>} Report object or null
   */
  async getContentReportById(id) {
    const result = await pool.query(`
      SELECT cr.*, 
             p.title as current_post_title,
             u.display_name
      FROM content_reports cr
      LEFT JOIN posts p ON cr.post_id = p.id
      LEFT JOIN users u ON cr.resolved_by = u.id
      WHERE cr.id = $1
    `, [id]);
    return result.rows[0] || null;
  },

  /**
   * Update content report status
   * @param {number} reportId - Report ID
   * @param {string} status - New status
   * @param {string} adminResponse - Admin response text
   * @param {number} resolvedBy - User ID who resolved it
   * @returns {Promise<Object>} Success message
   */
  async updateContentReportStatus(reportId, status, adminResponse = null, resolvedBy = null) {
    const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status');
    }

    const resolvedAt = (status === 'resolved' || status === 'dismissed')
      ? new Date().toISOString()
      : null;

    const result = await pool.query(`
      UPDATE content_reports 
      SET status = $1, admin_response = $2, resolved_by = $3, resolved_at = $4
      WHERE id = $5
    `, [status, adminResponse, resolvedBy, resolvedAt, reportId]);

    if (result.rowCount === 0) {
      throw new Error('Report not found');
    }

    return { success: true };
  },

  /**
   * Reset user password (admin function)
   * @param {number} adminId - Admin user ID
   * @param {number} userId - User whose password to reset
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Success with user details
   */
  async resetUserPassword(adminId, userId, newPassword) {
    // Verify admin exists and has admin role
    const adminResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [adminId]
    );
    const admin = adminResult.rows[0];

    if (!admin || admin.role !== 'admin') {
      throw new Error('Only administrators can reset passwords');
    }

    // Verify target user exists
    const userResult = await pool.query(
      'SELECT id, email, display_name FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new Error('User not found');
    }

    // Hash the new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update the password
    const updateResult = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, userId]
    );

    if (updateResult.rowCount === 0) {
      throw new Error('Failed to update password');
    }

    console.log(`🔑 Admin (ID: ${adminId}) reset password for user: ${user.email} (${user.display_name})`);

    return {
      success: true,
      message: 'Password reset successfully',
      userId: user.id,
      userEmail: user.email,
      displayName: user.display_name
    };
  }
};

// ============================================
// GROUP Management Database Operations
// ============================================

export const groupDB = {
  /**
   * Get all groups
   * @returns {Promise<Array>} All groups with member counts
   */
  async getAllGroups() {
    const result = await pool.query(`
      SELECT g.*,
             COUNT(ug.user_id) as member_count
      FROM groups g
      LEFT JOIN user_groups ug ON g.id = ug.group_id
      GROUP BY g.id
      ORDER BY g.name ASC
    `);
    return result.rows;
  },

  /**
   * Get group by ID
   * @param {number} id - Group ID
   * @returns {Promise<Object|null>} Group object or null
   */
  async getGroupById(id) {
    const result = await pool.query(`
      SELECT g.*,
             COUNT(ug.user_id) as member_count
      FROM groups g
      LEFT JOIN user_groups ug ON g.id = ug.group_id
      WHERE g.id = $1
      GROUP BY g.id
    `, [id]);
    return result.rows[0] || null;
  },

  /**
   * Create new group
   * @param {Object} groupData - Group data (name, description)
   * @returns {Promise<Object>} Created group with ID
   */
  async createGroup(groupData) {
    const { name, description } = groupData;

    const result = await pool.query(`
      INSERT INTO groups (name, description)
      VALUES ($1, $2)
      RETURNING id, name, description, created_at
    `, [name, description]);

    if (result.rowCount === 0) {
      throw new Error('Failed to create group');
    }

    return {
      success: true,
      group: result.rows[0]
    };
  },

  /**
   * Update group
   * @param {number} id - Group ID
   * @param {Object} groupData - Updated data (name, description)
   * @returns {Promise<Object>} Success message
   */
  async updateGroup(id, groupData) {
    const { name, description } = groupData;

    const result = await pool.query(`
      UPDATE groups
      SET name = $1, description = $2
      WHERE id = $3
      RETURNING id, name, description, created_at
    `, [name, description, id]);

    if (result.rowCount === 0) {
      throw new Error('Group not found');
    }

    return {
      success: true,
      group: result.rows[0]
    };
  },

  /**
   * Delete group
   * @param {number} id - Group ID
   * @returns {Promise<Object>} Success message
   */
  async deleteGroup(id) {
    const result = await pool.query(
      'DELETE FROM groups WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error('Group not found');
    }

    return { success: true, message: 'Group deleted successfully' };
  },

  /**
   * Get users in a group
   * @param {number} groupId - Group ID
   * @returns {Promise<Array>} Users in the group
   */
  async getUsersInGroup(groupId) {
    const result = await pool.query(`
      SELECT u.id, u.email, u.display_name, u.role, u.status, ug.joined_at
      FROM users u
      INNER JOIN user_groups ug ON u.id = ug.user_id
      WHERE ug.group_id = $1
      ORDER BY ug.joined_at DESC
    `, [groupId]);
    return result.rows;
  },

  /**
   * Get groups for a user
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Groups the user belongs to
   */
  async getGroupsForUser(userId) {
    const result = await pool.query(`
      SELECT g.id, g.name, g.description, ug.joined_at
      FROM groups g
      INNER JOIN user_groups ug ON g.id = ug.group_id
      WHERE ug.user_id = $1
      ORDER BY g.name ASC
    `, [userId]);
    return result.rows;
  },

  /**
   * Add user to group
   * @param {number} userId - User ID
   * @param {number} groupId - Group ID
   * @returns {Promise<Object>} Success message
   */
  async addUserToGroup(userId, groupId) {
    // Check if user exists
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rowCount === 0) {
      throw new Error('User not found');
    }

    // Check if group exists
    const groupResult = await pool.query('SELECT id FROM groups WHERE id = $1', [groupId]);
    if (groupResult.rowCount === 0) {
      throw new Error('Group not found');
    }

    // Add user to group (ON CONFLICT prevents duplicate entries)
    const result = await pool.query(`
      INSERT INTO user_groups (user_id, group_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, group_id) DO NOTHING
      RETURNING user_id, group_id, joined_at
    `, [userId, groupId]);

    if (result.rowCount === 0) {
      return { success: true, message: 'User already in group' };
    }

    return { success: true, message: 'User added to group successfully' };
  },

  /**
   * Remove user from group
   * @param {number} userId - User ID
   * @param {number} groupId - Group ID
   * @returns {Promise<Object>} Success message
   */
  async removeUserFromGroup(userId, groupId) {
    const result = await pool.query(
      'DELETE FROM user_groups WHERE user_id = $1 AND group_id = $2',
      [userId, groupId]
    );

    if (result.rowCount === 0) {
      throw new Error('User not in group');
    }

    return { success: true, message: 'User removed from group successfully' };
  },

  /**
   * Get all users with their groups
   * @returns {Promise<Array>} All users with group information
   */
  async getAllUsersWithGroups() {
    const result = await pool.query(`
      SELECT u.id, u.email, u.display_name, u.role, u.status, u.created_at,
             array_agg(DISTINCT jsonb_build_object(
               'id', g.id,
               'name', g.name,
               'joined_at', ug.joined_at
             )) FILTER (WHERE g.id IS NOT NULL) as groups
      FROM users u
      LEFT JOIN user_groups ug ON u.id = ug.user_id
      LEFT JOIN groups g ON ug.group_id = g.id
      GROUP BY u.id
      ORDER BY u.display_name ASC
    `);
    return result.rows;
  }
};

// ============================================
// CATEGORY Management Database Operations
// ============================================

export const categoryDB = {
  /**
   * Get all categories ordered by position
   * @returns {Promise<Array>} All categories
   */
  async getAllCategories() {
    const result = await pool.query(`
      SELECT id, value, label, position, created_at
      FROM categories
      ORDER BY position ASC, label ASC
    `);
    return result.rows;
  },

  /**
   * Get category by ID
   * @param {number} id - Category ID
   * @returns {Promise<Object|null>} Category object or null
   */
  async getCategoryById(id) {
    const result = await pool.query(
      'SELECT id, value, label, position, created_at FROM categories WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  /**
   * Get category by value
   * @param {string} value - Category value
   * @returns {Promise<Object|null>} Category object or null
   */
  async getCategoryByValue(value) {
    const result = await pool.query(
      'SELECT id, value, label, position, created_at FROM categories WHERE value = $1',
      [value]
    );
    return result.rows[0] || null;
  },

  /**
   * Create new category
   * @param {Object} categoryData - Category data (value, label, position)
   * @returns {Promise<Object>} Created category
   */
  async createCategory(categoryData) {
    const { value, label, position = 0 } = categoryData;

    // Get max position if not specified
    let categoryPosition = position;
    if (position === 0) {
      const maxResult = await pool.query('SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM categories');
      categoryPosition = maxResult.rows[0].next_pos;
    }

    const result = await pool.query(`
      INSERT INTO categories (value, label, position)
      VALUES ($1, $2, $3)
      RETURNING id, value, label, position, created_at
    `, [value.toLowerCase().replace(/[^a-z0-9-]/g, '-'), label, categoryPosition]);

    if (result.rowCount === 0) {
      throw new Error('Failed to create category');
    }

    return {
      success: true,
      category: result.rows[0]
    };
  },

  /**
   * Update category
   * @param {number} id - Category ID
   * @param {Object} categoryData - Updated data (value, label, position)
   * @returns {Promise<Object>} Success message
   */
  async updateCategory(id, categoryData) {
    const { value, label, position } = categoryData;

    const result = await pool.query(`
      UPDATE categories
      SET value = $1, label = $2, position = $3
      WHERE id = $4
      RETURNING id, value, label, position, created_at
    `, [value.toLowerCase().replace(/[^a-z0-9-]/g, '-'), label, position, id]);

    if (result.rowCount === 0) {
      throw new Error('Category not found');
    }

    return {
      success: true,
      category: result.rows[0]
    };
  },

  /**
   * Delete category
   * @param {number} id - Category ID
   * @returns {Promise<Object>} Success message
   */
  async deleteCategory(id) {
    // Check if category is in use
    const usageResult = await pool.query(
      'SELECT COUNT(*) as count FROM posts WHERE category = (SELECT value FROM categories WHERE id = $1)',
      [id]
    );
    const usageCount = parseInt(usageResult.rows[0].count);

    if (usageCount > 0) {
      throw new Error(`Cannot delete category: ${usageCount} posts are using it`);
    }

    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error('Category not found');
    }

    return { success: true, message: 'Category deleted successfully' };
  },

  /**
   * Reorder categories
   * @param {Array} orderedIds - Array of category IDs in new order
   * @returns {Promise<Object>} Success message
   */
  async reorderCategories(orderedIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(
          'UPDATE categories SET position = $1 WHERE id = $2',
          [i + 1, orderedIds[i]]
        );
      }

      await client.query('COMMIT');

      return { success: true, message: 'Categories reordered successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

/**
 * Document chunks database operations for vectorization
 */
export const chunksDB = {
  /**
   * Save chunks with embeddings for a post
   * @param {number} postId - Post ID
   * @param {string[]} chunks - Array of text chunks
   * @param {number[][]} embeddings - Array of embedding vectors
   * @param {string} sourceType - Source type ('post', 'html', 'pdf', 'docx')
   */
  async saveChunks(postId, chunks, embeddings, sourceType = 'post') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing chunks for this post
      await client.query('DELETE FROM document_chunks WHERE post_id = $1', [postId]);

      // Insert new chunks with embeddings
      for (let i = 0; i < chunks.length; i++) {
        // Convert embedding array to pgvector format: [1,2,3]
        const embeddingStr = '[' + embeddings[i].join(',') + ']';

        await client.query(
          `INSERT INTO document_chunks (post_id, chunk_index, chunk_text, embedding)
           VALUES ($1, $2, $3, $4::vector)`,
          [postId, i, chunks[i], embeddingStr]
        );
      }

      // Update post metadata
      await client.query(
        `UPDATE posts
         SET vectorized_at = CURRENT_TIMESTAMP,
             chunk_count = $1,
             source_type = $2
         WHERE id = $3`,
        [chunks.length, sourceType, postId]
      );

      await client.query('COMMIT');

      console.log(`✅ Saved ${chunks.length} chunks for post ${postId}`);
      return { success: true, chunkCount: chunks.length };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error saving chunks:', error);
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Search for similar chunks using vector similarity
   * @param {number[]} queryEmbedding - Query embedding vector
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Array>} Similar chunks with post info
   */
  async searchSimilar(queryEmbedding, limit = 10) {
    // Convert embedding array to pgvector format
    const embeddingStr = '[' + queryEmbedding.join(',') + ']';

    const result = await pool.query(
      `SELECT
         dc.id as chunk_id,
         dc.post_id,
         dc.chunk_index,
         dc.chunk_text,
         p.title,
         p.slug,
         p.category,
         p.source_url,
         p.source_type,
         1 - (dc.embedding <=> $1::vector) as similarity
       FROM document_chunks dc
       JOIN posts p ON dc.post_id = p.id
       WHERE p.published = true
       ORDER BY dc.embedding <=> $1::vector
       LIMIT $2`,
      [embeddingStr, limit]
    );

    return result.rows;
  },

  /**
   * Get all chunks for a post
   * @param {number} postId - Post ID
   * @returns {Promise<Array>} Chunks ordered by index
   */
  async getChunksByPost(postId) {
    const result = await pool.query(
      'SELECT * FROM document_chunks WHERE post_id = $1 ORDER BY chunk_index',
      [postId]
    );
    return result.rows;
  },

  /**
   * Delete all chunks for a post
   * @param {number} postId - Post ID
   */
  async deleteChunks(postId) {
    await pool.query('DELETE FROM document_chunks WHERE post_id = $1', [postId]);
    await pool.query(
      'UPDATE posts SET vectorized_at = NULL, chunk_count = 0 WHERE id = $1',
      [postId]
    );
  },

  /**
   * Check if a post has been vectorized
   * @param {number} postId - Post ID
   * @returns {Promise<{vectorized: boolean, chunkCount: number, vectorizedAt: Date|null}>}
   */
  async getVectorizationStatus(postId) {
    const result = await pool.query(
      'SELECT vectorized_at, chunk_count FROM posts WHERE id = $1',
      [postId]
    );

    if (result.rows.length === 0) {
      return { vectorized: false, chunkCount: 0, vectorizedAt: null };
    }

    const post = result.rows[0];
    return {
      vectorized: post.vectorized_at !== null,
      chunkCount: post.chunk_count || 0,
      vectorizedAt: post.vectorized_at
    };
  },

  /**
   * Get all vectorized posts
   * @returns {Promise<Array>} Posts with vectorization info
   */
  async getVectorizedPosts() {
    const result = await pool.query(
      `SELECT id, title, slug, category, source_url, source_type, chunk_count, vectorized_at
       FROM posts
       WHERE vectorized_at IS NOT NULL
       ORDER BY vectorized_at DESC`
    );
    return result.rows;
  },

  /**
   * Update source URL for a link post
   * @param {number} postId - Post ID
   * @param {string} sourceUrl - External URL
   */
  async updateSourceUrl(postId, sourceUrl) {
    await pool.query(
      'UPDATE posts SET source_url = $1 WHERE id = $2',
      [sourceUrl, postId]
    );
  }
};

export { pathsDB } from './paths.js';
