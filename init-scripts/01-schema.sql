-- PostgreSQL Schema for Blog Application
-- Converted from SQLite to PostgreSQL

-- Enable pgvector extension (for future semantic search)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'deletion_requested')),
  role VARCHAR(50) DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deletion_requested_at TIMESTAMP,
  deletion_reason TEXT
);

-- Index for frequently queried fields
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- ============================================
-- POSTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  excerpt VARCHAR(500),
  category VARCHAR(50) NOT NULL DEFAULT 'thoughts',
  slug VARCHAR(50) UNIQUE NOT NULL,
  read_time VARCHAR(50),
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path_id INTEGER REFERENCES paths(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published BOOLEAN DEFAULT true
);

-- Indexes for post queries
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_updated_at ON posts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_path_id ON posts(path_id);

-- ============================================
-- TAGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- ============================================
-- POST_TAGS JUNCTION TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_post_tags_post_id ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag_id ON post_tags(tag_id);

-- ============================================
-- PATHS TABLE (Hierarchical Organization)
-- ============================================
CREATE TABLE IF NOT EXISTS paths (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  parent_id INTEGER REFERENCES paths(id) ON DELETE CASCADE,
  level INTEGER DEFAULT 1 CHECK(level >= 1 AND level <= 5),
  full_path VARCHAR(500) UNIQUE NOT NULL,
  icon VARCHAR(50),
  color VARCHAR(50),
  position INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for path queries
CREATE INDEX IF NOT EXISTS idx_paths_parent_id ON paths(parent_id);
CREATE INDEX IF NOT EXISTS idx_paths_level ON paths(level);
CREATE INDEX IF NOT EXISTS idx_paths_full_path ON paths(full_path);
CREATE INDEX IF NOT EXISTS idx_paths_slug ON paths(slug);
CREATE INDEX IF NOT EXISTS idx_paths_created_by ON paths(created_by);
CREATE INDEX IF NOT EXISTS idx_paths_position ON paths(position);

-- ============================================
-- CONTENT_REPORTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS content_reports (
  id SERIAL PRIMARY KEY,
  issue_type VARCHAR(50) NOT NULL CHECK(issue_type IN (
    'inappropriate', 'copyright', 'gdpr_removal', 'privacy', 
    'spam', 'misinformation', 'harassment', 'other'
  )),
  description TEXT NOT NULL,
  reporter_email VARCHAR(255),
  post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  post_title VARCHAR(500),
  post_url TEXT,
  reporter_ip VARCHAR(50),
  user_agent TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_response TEXT,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for report queries
CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_issue_type ON content_reports(issue_type);
CREATE INDEX IF NOT EXISTS idx_reports_post_id ON content_reports(post_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON content_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_resolved_by ON content_reports(resolved_by);

-- ============================================
-- APP_INFO TABLE (Release information)
-- ============================================
CREATE TABLE IF NOT EXISTS app_info (
  id SERIAL PRIMARY KEY,
  version VARCHAR(20) UNIQUE NOT NULL,
  release_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  changelog TEXT,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_info_version ON app_info(version);
CREATE INDEX IF NOT EXISTS idx_app_info_is_current ON app_info(is_current);
CREATE INDEX IF NOT EXISTS idx_app_info_release_date ON app_info(release_date DESC);

-- ============================================
-- APP_FEATURES TABLE (Features per release)
-- ============================================
CREATE TABLE IF NOT EXISTS app_features (
  id SERIAL PRIMARY KEY,
  app_info_id INTEGER NOT NULL REFERENCES app_info(id) ON DELETE CASCADE,
  feature_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  status VARCHAR(50) DEFAULT 'released' CHECK(status IN ('planned', 'in_progress', 'released', 'deprecated')),
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_features_app_info_id ON app_features(app_info_id);
CREATE INDEX IF NOT EXISTS idx_app_features_status ON app_features(status);
CREATE INDEX IF NOT EXISTS idx_app_features_category ON app_features(category);
CREATE INDEX IF NOT EXISTS idx_app_features_priority ON app_features(priority);

-- ============================================
-- APP_METADATA TABLE (App configuration)
-- ============================================
CREATE TABLE IF NOT EXISTS app_metadata (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  value_type VARCHAR(50) DEFAULT 'string' CHECK(value_type IN ('string', 'integer', 'boolean', 'json')),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_metadata_key ON app_metadata(key);

-- ============================================
-- VIEWS (Create AFTER all tables exist)
-- ============================================

-- Drop views if they already exist (for safe recreation)
DROP VIEW IF EXISTS posts_with_details CASCADE;
DROP VIEW IF EXISTS path_statistics CASCADE;

-- View: All posts with author and tags
CREATE VIEW posts_with_details AS
SELECT 
  p.*,
  u.display_name as author_name,
  u.email as author_email,
  array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags,
  (SELECT COUNT(*) FROM content_reports WHERE post_id = p.id AND status = 'pending') as pending_reports_count
FROM posts p
INNER JOIN users u ON p.author_id = u.id
LEFT JOIN post_tags pt ON p.id = pt.post_id
LEFT JOIN tags t ON pt.tag_id = t.id
GROUP BY p.id, u.id;

-- View: Path statistics
CREATE VIEW path_statistics AS
SELECT 
  p.id,
  p.name,
  p.full_path,
  p.level,
  (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as direct_children,
  (SELECT COUNT(*) FROM posts WHERE path_id = p.id) as direct_posts,
  p.created_at,
  u.display_name as created_by
FROM paths p
LEFT JOIN users u ON p.created_by = u.id;

-- ============================================
-- TABLE COMMENTS (Documentation)
-- ============================================

COMMENT ON TABLE users IS 'User accounts with authentication and roles';
COMMENT ON TABLE posts IS 'Blog posts content';
COMMENT ON TABLE tags IS 'Post tags/categories';
COMMENT ON TABLE post_tags IS 'Many-to-many relationship between posts and tags';
COMMENT ON TABLE paths IS 'Hierarchical organization structure for posts';
COMMENT ON TABLE content_reports IS 'Content moderation reports';
COMMENT ON TABLE app_info IS 'Application release version information and changelog';
COMMENT ON TABLE app_features IS 'Features associated with each application release';
COMMENT ON TABLE app_metadata IS 'Application-wide configuration and metadata';

-- ============================================
-- COLUMN COMMENTS (Documentation)
-- ============================================

COMMENT ON COLUMN users.status IS 'pending=new user waiting approval, approved=active, rejected=rejected signup, deletion_requested=user requested account deletion';
COMMENT ON COLUMN users.role IS 'user=normal user, admin=administrator';
COMMENT ON COLUMN posts.published IS 'true=visible to public, false=draft or unpublished';
COMMENT ON COLUMN paths.level IS 'Depth in hierarchy (1-5), prevents deeply nested structures';
COMMENT ON COLUMN paths.full_path IS 'Complete path like /parent/child/grandchild for easy hierarchical queries';
COMMENT ON COLUMN content_reports.status IS 'pending=new report, reviewed=admin reviewed, resolved=action taken, dismissed=no action needed';
