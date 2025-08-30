import Database from 'better-sqlite3';
import { dev } from '$app/environment';
import bcrypt from 'bcrypt';

const db = new Database(dev ? 'dev.db' : 'prod.db');

// Enable foreign keys and WAL mode for better performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize USER tables (your existing setup)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME,
      approved_by INTEGER,
      FOREIGN KEY (approved_by) REFERENCES users(id)
    )
  `);
  
  console.log('✅ User tables initialized successfully');
} catch (error) {
  console.error('❌ Error creating user tables:', error);
  throw error;
}

// Initialize BLOG tables (new addition)
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published BOOLEAN DEFAULT 1,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
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

  // Post-Tags junction table (many-to-many relationship)
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_tags (
      post_id INTEGER,
      tag_id INTEGER,
      PRIMARY KEY (post_id, tag_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
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
  `);

  console.log('✅ Blog tables initialized successfully');
} catch (error) {
  console.error('❌ Error creating blog tables:', error);
  throw error;
}

// Create default admin user (your existing logic)
async function createDefaultAdmin() {
  try {
    const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
    
    if (!adminExists) {
      console.log('📝 Creating default admin user...');
      
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      const insertAdmin = db.prepare(`
        INSERT INTO users (email, first_name, last_name, password_hash, status, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      const result = insertAdmin.run(
        'admin@example.com', 
        'Admin', 
        'User', 
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

// BLOG Helper functions
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
        u.first_name, u.last_name, u.email,
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
      author: `${post.first_name} ${post.last_name}`,
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
        u.first_name, u.last_name,
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
      author: `${post.first_name} ${post.last_name}`,
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
        u.first_name, u.last_name, u.email,
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
      author: `${post.first_name} ${post.last_name}`,
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
        u.first_name, u.last_name, u.email,
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
      author: `${post.first_name} ${post.last_name}`,
      tags: post.tags ? post.tags.split(',') : [],
      created_at: new Date(post.created_at),
      updated_at: new Date(post.updated_at)
    };
  },

  // Create new post
  createPost(postData, authorId) {
    const { title, content, category = 'thoughts', tags = [] } = postData;
    
    if (!title || !content) {
      throw new Error('Title and content are required');
    }

    const slug = generateSlug(title);
    const excerpt = generateExcerpt(content);
    const readTime = calculateReadTime(content);

    // Start transaction
    const transaction = db.transaction(() => {
      // Insert post
      const result = db.prepare(`
        INSERT INTO posts (title, content, excerpt, category, slug, read_time, author_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(title, content, excerpt, category, slug, readTime, authorId);

      const postId = result.lastInsertRowid;

      // Handle tags
      if (tags.length > 0) {
        this.updatePostTags(postId, tags);
      }

      return postId;
    });

    const postId = transaction();
    return this.getPostById(postId);
  },

  // Update existing post
  updatePost(id, postData, authorId) {
    const { title, content, category, tags = [] } = postData;
    
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
      // Update post
      const result = db.prepare(`
        UPDATE posts 
        SET title = ?, content = ?, excerpt = ?, category = ?, slug = ?, 
            read_time = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(title, content, excerpt, category, slug, readTime, id);

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

  // Update post tags (helper method)
  updatePostTags(postId, tagNames) {
    // Remove existing tags for this post
    db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(postId);

    if (tagNames.length === 0) return;

    // Insert or get tags
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const getTagId = db.prepare('SELECT id FROM tags WHERE name = ?');
    const linkPostTag = db.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)');

    for (const tagName of tagNames) {
      const cleanTag = tagName.trim().toLowerCase();
      if (!cleanTag) continue;

      insertTag.run(cleanTag);
      const tag = getTagId.get(cleanTag);
      if (tag) {
        linkPostTag.run(postId, tag.id);
      }
    }
  },

  // Search posts
  searchPosts(query, category = null) {
    let sql = `
      SELECT 
        p.*,
        u.first_name, u.last_name,
        GROUP_CONCAT(t.name) as tags
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.published = 1
        AND (p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ?)
    `;
    
    const params = [`%${query}%`, `%${query}%`, `%${query}%`];

    if (category) {
      sql += ' AND p.category = ?';
      params.push(category);
    }

    sql += ' GROUP BY p.id ORDER BY p.created_at DESC';

    const posts = db.prepare(sql).all(...params);

    return posts.map(post => ({
      ...post,
      author: `${post.first_name} ${post.last_name}`,
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
        u.first_name, u.last_name,
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
      author: `${post.first_name} ${post.last_name}`,
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
      LEFT JOIN post_tags pt ON t.id = pt.id
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

// Export the original db connection (for your existing user management)
export { db };

// USER Management database operations
export const userDB = {
  // Get user by ID
  getUserById(id) {
    return db.prepare('SELECT id, email, first_name, last_name, role, status, created_at FROM users WHERE id = ?').get(id);
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
    // Verify current password first
    const isCurrentPasswordValid = await this.verifyPassword(userId, currentPassword);
    if (!isCurrentPasswordValid) {
      throw new Error('Current password is incorrect');
    }
    
    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password in database
    const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, userId);
    
    if (result.changes === 0) {
      throw new Error('Failed to update password');
    }
    
    return { success: true, message: 'Password updated successfully' };
  },

  // Admin: Reset user password (without requiring current password)
  async resetUserPassword(adminId, targetUserId, newPassword) {
    // Check if admin has permission
    const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminId);
    if (!admin || admin.role !== 'admin') {
      throw new Error('Unauthorized: Admin access required');
    }
    
    // Check if target user exists
    const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) {
      throw new Error('Target user not found');
    }
    
    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password
    const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, targetUserId);
    
    if (result.changes === 0) {
      throw new Error('Failed to reset password');
    }
    
    return { success: true, message: 'Password reset successfully' };
  }
};