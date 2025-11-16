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
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
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

export { pathsDB } from './paths.js';
