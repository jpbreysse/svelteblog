import Database from 'better-sqlite3';
import { dev } from '$app/environment';
import bcrypt from 'bcrypt';

const db = new Database(dev ? 'dev.db' : 'prod.db');

// Enable foreign keys and WAL mode for better performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize USER tables (updated with display_name)
try {
  console.log('🔄 Checking database schema...');
  
  // Check if we need to migrate from first_name/last_name to display_name
  const tableInfo = db.prepare("PRAGMA table_info(users)").all();
  console.log('📊 Current table columns:', tableInfo.map(col => col.name));
  
  const hasDisplayName = tableInfo.some(col => col.name === 'display_name');
  const hasFirstName = tableInfo.some(col => col.name === 'first_name');
  
  console.log('📊 Schema check results:');
  console.log('  - Has display_name:', hasDisplayName);
  console.log('  - Has first_name:', hasFirstName);
  
  if (hasDisplayName && hasFirstName) {
    console.log('⚠️ OLD COLUMNS DETECTED!');
    console.log('📝 To fix the registration issue, run: node cleanup-db.js');
    console.log('📝 This will clean up the database schema.');
  } else if (hasDisplayName) {
    console.log('✅ Database schema is clean and ready');
  } else {
    console.log('🔄 Creating fresh users table with display_name...');
    // Create fresh table with display_name
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'deletion_requested')),
        role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME,
        approved_by INTEGER,
        deletion_requested_at DATETIME,
        deletion_reason TEXT
      )
    `);
  }
  
  console.log('✅ User tables initialized successfully');
} catch (error) {
  console.error('❌ Error creating user tables:', error);
  throw error;
}

// Initialize BLOG tables
try {
  // Posts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT,
      category TEXT NOT NULL DEFAULT 'thoughts',
      slug TEXT UNIQUE NOT NULL,
      read_time TEXT,
      author_id INTEGER NOT NULL,
      path_id INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published BOOLEAN DEFAULT 1,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (path_id) REFERENCES paths(id) ON DELETE SET NULL
    )
  `);

  // Tags table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Post-Tags junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_tags (
      post_id INTEGER,
      tag_id INTEGER,
      PRIMARY KEY (post_id, tag_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )
  `);

  // Content Reports table
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_type TEXT NOT NULL CHECK(issue_type IN (
        'inappropriate', 'copyright', 'gdpr_removal', 'privacy', 
        'spam', 'misinformation', 'harassment', 'other'
      )),
      description TEXT NOT NULL,
      reporter_email TEXT,
      post_id INTEGER,
      post_title TEXT,
      post_url TEXT,
      reporter_ip TEXT,
      user_agent TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
      admin_response TEXT,
      resolved_by INTEGER,
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
      FOREIGN KEY (resolved_by) REFERENCES users(id)
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published);
    CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
    CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
    CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status);
    CREATE INDEX IF NOT EXISTS idx_reports_type ON content_reports(issue_type);
    CREATE INDEX IF NOT EXISTS idx_reports_created ON content_reports(created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_display_name ON users(display_name);
  `);

  console.log('✅ Blog tables initialized successfully');
} catch (error) {
  console.error('❌ Error creating blog tables:', error);
  throw error;
}

// Create default admin user
async function createDefaultAdmin() {
  try {
    const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');

    if (!adminExists) {
      console.log('📝 Creating default admin user...');

      const hashedPassword = await bcrypt.hash('admin123', 10);

      const insertAdmin = db.prepare(`
        INSERT INTO users (email, display_name, password_hash, status, role)
        VALUES (?, ?, ?, ?, ?)
      `);

      const result = insertAdmin.run(
        'admin@example.com',
        'Admin User',
        hashedPassword,
        'approved',
        'admin'
      );

      console.log('✅ Default admin user created with ID:', result.lastInsertRowid);
    } else {
      console.log('✅ Admin user already exists');
    }
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    throw error;
  }
}

// Initialize admin user
createDefaultAdmin().catch(console.error);

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

// BLOG database operations
export const blogDB = {
  // Get all posts with author info
  getAllPosts() {
    const posts = db.prepare(`
      SELECT 
        p.*,
        u.display_name, u.email,
        GROUP_CONCAT(t.name) as tags
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.published = 1
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all();

    return posts.map(post => ({
      ...post,
      author: post.display_name,
      tags: post.tags ? post.tags.split(',') : [],
      created_at: new Date(post.created_at),
      updated_at: new Date(post.updated_at)
    }));
  },

  // Get posts by user
  getPostsByUser(userId) {
    const posts = db.prepare(`
      SELECT 
        p.*,
        u.display_name,
        GROUP_CONCAT(t.name) as tags
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.author_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all(userId);

    return posts.map(post => ({
      ...post,
      author: post.display_name,
      tags: post.tags ? post.tags.split(',') : [],
      created_at: new Date(post.created_at),
      updated_at: new Date(post.updated_at)
    }));
  },

  // Get post by ID
  getPostById(id) {
    const post = db.prepare(`
      SELECT 
        p.*,
        u.display_name, u.email,
        GROUP_CONCAT(t.name) as tags
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.id = ? AND p.published = 1
      GROUP BY p.id
    `).get(id);

    if (!post) return null;

    return {
      ...post,
      author: post.display_name,
      tags: post.tags ? post.tags.split(',') : [],
      created_at: new Date(post.created_at),
      updated_at: new Date(post.updated_at)
    };
  },

  // Get post by slug
  getPostBySlug(slug) {
    const post = db.prepare(`
      SELECT 
        p.*,
        u.display_name, u.email,
        GROUP_CONCAT(t.name) as tags
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.slug = ? AND p.published = 1
      GROUP BY p.id
    `).get(slug);

    if (!post) return null;

    return {
      ...post,
      author: post.display_name,
      tags: post.tags ? post.tags.split(',') : [],
      created_at: new Date(post.created_at),
      updated_at: new Date(post.updated_at)
    };
  },

  // Create new post
  createPost(postData, authorId) {
    const { title, content, category = 'thoughts', tags = [], path_id = 1 } = postData;

    if (!title || !content) {
      throw new Error('Title and content are required');
    }

    // Verify author exists
    const author = db.prepare('SELECT id FROM users WHERE id = ?').get(authorId);
    if (!author) {
      throw new Error(`User with ID ${authorId} does not exist`);
    }

    const slug = generateSlug(title);
    const excerpt = generateExcerpt(content);
    const readTime = calculateReadTime(content);

    console.log(`📝 Creating post with slug: "${slug}" for user: ${authorId} in folder: ${path_id}`);

    // Start transaction
    const transaction = db.transaction(() => {
      // Insert post
      const result = db.prepare(`
        INSERT INTO posts (title, content, excerpt, category, slug, read_time, author_id, path_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(title, content, excerpt, category, slug, readTime, authorId, path_id);

      const postId = result.lastInsertRowid;
      console.log(`✅ Post inserted with ID: ${postId}`);

      // Handle tags
      if (tags.length > 0) {
        console.log(`🏷️  Adding ${tags.length} tags to post ${postId}`);
        this.updatePostTags(postId, tags);
      }

      return postId;
    });

    try {
      const postId = transaction();
      return this.getPostById(postId);
    } catch (error) {
      console.error(`❌ Transaction failed:`, error.message);
      throw error;
    }
  },

  // Update existing post
  updatePost(id, postData, authorId) {
    const { title, content, category, tags = [], path_id } = postData;

    // Check if user owns the post or is admin
    const post = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(id);
    if (!post) {
      throw new Error('Post not found');
    }

    // Only allow author or admin to edit
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(authorId);
    if (post.author_id !== authorId && user?.role !== 'admin') {
      throw new Error('Unauthorized to edit this post');
    }

    const excerpt = generateExcerpt(content);
    const readTime = calculateReadTime(content);
    const slug = generateSlug(title);

    // Start transaction
    const transaction = db.transaction(() => {
      // Build UPDATE query dynamically based on provided fields
      let updateFields = ['title = ?', 'content = ?', 'excerpt = ?', 'category = ?', 'slug = ?', 'read_time = ?', 'updated_at = CURRENT_TIMESTAMP'];
      let values = [title, content, excerpt, category, slug, readTime];
      
      // Add path_id if provided
      if (path_id !== undefined) {
        updateFields.push('path_id = ?');
        values.push(path_id);
      }
      
      values.push(id); // Add id for WHERE clause
      
      const result = db.prepare(`
        UPDATE posts 
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `).run(...values);

      if (result.changes === 0) {
        throw new Error('Post not found');
      }

      // Update tags
      this.updatePostTags(id, tags);

      return id;
    });

    transaction();
    return this.getPostById(id);
  },

  // Delete post
  deletePost(id, authorId) {
    // Check if user owns the post or is admin
    const post = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(id);
    if (!post) {
      throw new Error('Post not found');
    }

    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(authorId);
    if (post.author_id !== authorId && user?.role !== 'admin') {
      throw new Error('Unauthorized to delete this post');
    }

    const result = db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    return result.changes > 0;
  },

  // Update post tags
  updatePostTags(postId, tagNames) {
    // Delete existing tags
    db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(postId);

    if (tagNames.length === 0) return;

    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
    const linkPostTag = db.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)');

    for (const tagName of tagNames) {
      const cleanTag = tagName.trim().toLowerCase();
      if (!cleanTag) continue;

      try {
        // Insert tag if it doesn't exist
        insertTag.run(cleanTag);
        
        // Get the tag ID
        const tag = getTagId.get(cleanTag);
        
        if (!tag || !tag.id) {
          console.error(`❌ Failed to get tag ID for: ${cleanTag}`);
          continue;
        }
        
        // Verify postId is valid
        const postExists = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
        if (!postExists) {
          throw new Error(`Post ID ${postId} does not exist`);
        }
        
        // Link post to tag
        linkPostTag.run(postId, tag.id);
        console.log(`✅ Linked tag "${cleanTag}" (ID: ${tag.id}) to post ${postId}`);
        
      } catch (tagError) {
        console.error(`❌ Error processing tag "${cleanTag}":`, tagError.message);
        throw new Error(`Failed to add tag "${cleanTag}": ${tagError.message}`);
      }
    }
  },

  // Search posts
  searchPosts(query, category = null) {
    let sql = `
      SELECT DISTINCT
        p.*,
        u.display_name,
        GROUP_CONCAT(t.name) as tags
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.published = 1
        AND (p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ? OR t.name LIKE ?)
    `;

    const params = [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`];

    if (category) {
      sql += ' AND p.category = ?';
      params.push(category);
    }

    sql += ' GROUP BY p.id ORDER BY p.created_at DESC';

    const posts = db.prepare(sql).all(...params);

    return posts.map(post => ({
      ...post,
      author: post.display_name,
      tags: post.tags ? post.tags.split(',') : [],
      created_at: new Date(post.created_at),
      updated_at: new Date(post.updated_at)
    }));
  },

  // Get posts by category
  getPostsByCategory(category) {
    const posts = db.prepare(`
      SELECT 
        p.*,
        u.display_name,
        GROUP_CONCAT(t.name) as tags
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.category = ? AND p.published = 1
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all(category);

    return posts.map(post => ({
      ...post,
      author: post.display_name,
      tags: post.tags ? post.tags.split(',') : [],
      created_at: new Date(post.created_at),
      updated_at: new Date(post.updated_at)
    }));
  },

  // Get all categories
  getCategories() {
    return db.prepare(`
      SELECT category, COUNT(*) as count
      FROM posts 
      WHERE published = 1
      GROUP BY category
      ORDER BY category
    `).all();
  },

  // Get all tags
  getTags() {
    return db.prepare(`
      SELECT t.name, COUNT(pt.post_id) as count
      FROM tags t
      LEFT JOIN post_tags pt ON t.id = pt.tag_id
      GROUP BY t.id, t.name
      ORDER BY count DESC, t.name
    `).all();
  },

  // Get database stats
  getStats() {
    const postCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE published = 1').get();
    const categoryCount = db.prepare('SELECT COUNT(DISTINCT category) as count FROM posts WHERE published = 1').get();
    const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get();

    return {
      posts: postCount.count,
      categories: categoryCount.count,
      tags: tagCount.count
    };
  }
};

// Export the db connection
export { db };

// USER Management database operations
export const userDB = {
  // Get user by ID
  getUserById(id) {
    return db.prepare('SELECT id, email, display_name, role, status, created_at FROM users WHERE id = ?').get(id);
  },

  // Verify current password
  async verifyPassword(userId, currentPassword) {
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return await bcrypt.compare(currentPassword, user.password_hash);
  },

  // Change user password
  async changePassword(userId, currentPassword, newPassword) {
    const isCurrentPasswordValid = await this.verifyPassword(userId, currentPassword);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, userId);

    if (result.changes === 0) {
      throw new Error('Failed to update password');
    }

    return { success: true, message: 'Password updated successfully' };
  },

  // Complete immediate account deletion
  async completeAccountDeletion(userId, reason = '') {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const postCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE author_id = ?').get(userId);

    const transaction = db.transaction(() => {
      db.prepare(`DELETE FROM post_tags WHERE post_id IN (SELECT id FROM posts WHERE author_id = ?)`).run(userId);
      db.prepare('DELETE FROM posts WHERE author_id = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });

    transaction();

    console.log(`🗑️ User ${user.email} deleted their account. ${postCount.count} posts removed. Reason: ${reason}`);

    return {
      success: true,
      message: `Account and ${postCount.count} posts deleted permanently`,
      deletedPosts: postCount.count
    };
  },

  // Get users with pending deletion requests
  getPendingDeletions() {
    return db.prepare(`
      SELECT id, email, display_name, deletion_requested_at, deletion_reason,
             (SELECT COUNT(*) FROM posts WHERE author_id = users.id) as post_count
      FROM users 
      WHERE status = 'deletion_requested'
      ORDER BY deletion_requested_at ASC
    `).all();
  },

  // Create content report
  createContentReport(reportData) {
    const {
      issue_type, description, reporter_email, post_id, post_title, 
      post_url, reporter_ip, user_agent
    } = reportData;

    const result = db.prepare(`
      INSERT INTO content_reports (
        issue_type, description, reporter_email, post_id, post_title,
        post_url, reporter_ip, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      issue_type, description, reporter_email, post_id, post_title,
      post_url, reporter_ip, user_agent
    );

    return {
      success: true,
      reportId: result.lastInsertRowid
    };
  },

  // Get all content reports
  getAllContentReports() {
    return db.prepare(`
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
    `).all();
  },

  // Get content report by ID
  getContentReportById(id) {
    return db.prepare(`
      SELECT cr.*, 
             p.title as current_post_title,
             u.display_name
      FROM content_reports cr
      LEFT JOIN posts p ON cr.post_id = p.id
      LEFT JOIN users u ON cr.resolved_by = u.id
      WHERE cr.id = ?
    `).get(id);
  },

  // Update content report status
  updateContentReportStatus(reportId, status, adminResponse = null, resolvedBy = null) {
    const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status');
    }

    const resolvedAt = (status === 'resolved' || status === 'dismissed') ? new Date().toISOString() : null;

    const result = db.prepare(`
      UPDATE content_reports 
      SET status = ?, admin_response = ?, resolved_by = ?, resolved_at = ?
      WHERE id = ?
    `).run(status, adminResponse, resolvedBy, resolvedAt, reportId);

    if (result.changes === 0) {
      throw new Error('Report not found');
    }

    return { success: true };
  },

  // Reset user password (admin function)
  async resetUserPassword(adminId, userId, newPassword) {
    // Verify admin exists and has admin role
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminId);
    if (!admin || admin.role !== 'admin') {
      throw new Error('Only administrators can reset passwords');
    }

    // Verify target user exists
    const user = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Hash the new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update the password
    const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, userId);

    if (result.changes === 0) {
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

