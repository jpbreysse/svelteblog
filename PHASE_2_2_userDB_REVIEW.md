// ============================================
// USER Management Database Operations
// Phase 2.2: All methods converted to async
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
