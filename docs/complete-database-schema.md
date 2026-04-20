# Complete Database Schema Documentation

This document contains all CREATE TABLE statements and schema definitions for the entire application.

**Source Files:**
- `init-scripts/01-schema.sql` - Main schema
- `scripts/add-post-hierarchy.sql` - Post hierarchy migration
- `scripts/add-category-post-numbers.sql` - Category numbering migration

---

## Table of Contents

1. [Extensions](#extensions)
2. [Users & Authentication](#users--authentication)
3. [Groups & Membership](#groups--membership)
4. [Paths (Hierarchical Organization)](#paths-hierarchical-organization)
5. [Posts & Content](#posts--content)
6. [Tags & Tagging](#tags--tagging)
7. [Content Moderation](#content-moderation)
8. [Application Metadata](#application-metadata)
9. [Views](#views)
10. [Complete Schema ERD](#complete-schema-erd)
11. [Migrations](#migrations)

---

## Extensions

```sql
-- Enable pgvector extension (for future semantic search)
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Users & Authentication

### Users Table

```sql
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

-- Documentation
COMMENT ON TABLE users IS 'User accounts with authentication and roles';
COMMENT ON COLUMN users.status IS 'pending=new user waiting approval, approved=active, rejected=rejected signup, deletion_requested=user requested account deletion';
COMMENT ON COLUMN users.role IS 'user=normal user, admin=administrator';
```

**Columns:**
- `id` - Auto-incrementing primary key
- `email` - Unique email address for login
- `display_name` - Public display name
- `password_hash` - Bcrypt hashed password
- `status` - Account status (pending/approved/rejected/deletion_requested)
- `role` - User role (user/admin)
- `created_at` - Account creation timestamp
- `approved_at` - When account was approved
- `approved_by` - Admin who approved the account
- `deletion_requested_at` - When user requested deletion
- `deletion_reason` - Why user requested deletion

---

## Groups & Membership

### Groups Table

```sql
-- ============================================
-- GROUPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);

COMMENT ON TABLE groups IS 'User groups for organizing users';
```

### User Groups Junction Table

```sql
-- ============================================
-- USER_GROUPS JUNCTION TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_groups (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_user_groups_user_id ON user_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_group_id ON user_groups(group_id);

COMMENT ON TABLE user_groups IS 'Many-to-many relationship between users and groups';
```

**Relationship:**
- Many-to-many: Users can belong to multiple groups
- Composite primary key on (user_id, group_id)
- Cascade delete: Removes membership when user or group deleted

---

## Paths (Hierarchical Organization)

### Paths Table

```sql
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

COMMENT ON TABLE paths IS 'Hierarchical organization structure for posts';
COMMENT ON COLUMN paths.level IS 'Depth in hierarchy (1-5), prevents deeply nested structures';
COMMENT ON COLUMN paths.full_path IS 'Complete path like /parent/child/grandchild for easy hierarchical queries';
```

**Columns:**
- `id` - Auto-incrementing primary key
- `name` - Display name of the path/folder
- `slug` - URL-friendly name
- `description` - Optional description
- `parent_id` - Reference to parent path (NULL for root paths)
- `level` - Depth in hierarchy (1-5), prevents excessive nesting
- `full_path` - Complete hierarchical path (e.g., "/documentation/business")
- `icon` - Emoji or icon for display
- `color` - Color code for visual differentiation
- `position` - Sort order within parent
- `created_by` - User who created this path
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

**Hierarchical Structure:**
- Self-referencing: `parent_id` references `paths(id)`
- Root paths have `parent_id = NULL`
- Maximum depth: 5 levels
- Cascade delete: Deleting a path deletes all children
- Example hierarchy:
  ```
  documentation (level 1, parent_id=NULL)
    └─ business (level 2, parent_id=1)
       └─ reports (level 3, parent_id=2)
  ```

---

## Posts & Content

### Posts Table

```sql
-- ============================================
-- POSTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  excerpt VARCHAR(500),
  category VARCHAR(50) NOT NULL DEFAULT 'thoughts',
  category_post_number INTEGER,
  slug VARCHAR(50) UNIQUE NOT NULL,
  read_time VARCHAR(50),
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path_id INTEGER REFERENCES paths(id) ON DELETE SET NULL,
  parent_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1 CHECK(level >= 1 AND level <= 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published BOOLEAN DEFAULT true
);

-- Indexes for post queries
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_category_number ON posts(category, category_post_number);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_updated_at ON posts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_path_id ON posts(path_id);
CREATE INDEX IF NOT EXISTS idx_posts_parent_id ON posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_posts_parent_position ON posts(parent_id, position);
CREATE INDEX IF NOT EXISTS idx_posts_level ON posts(level);

COMMENT ON TABLE posts IS 'Blog posts content';
COMMENT ON COLUMN posts.published IS 'true=visible to public, false=draft or unpublished';
```

**Columns:**
- `id` - Auto-incrementing primary key
- `title` - Post title (max 500 chars)
- `content` - Full HTML content
- `excerpt` - Short summary (max 500 chars)
- `category` - Post category (e.g., "tutorial", "thoughts")
- `category_post_number` - Sequential number within category (TUT #1, TUT #2)
- `slug` - URL-friendly unique identifier
- `read_time` - Estimated reading time (e.g., "5 min read")
- `author_id` - User who created the post
- `path_id` - Optional path/folder location
- `parent_id` - Parent post for hierarchical structure (Confluence-style)
- `position` - Sort order within parent
- `level` - Depth in post hierarchy (1-5)
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp
- `published` - Visibility status (true=public, false=draft)

**Hierarchical Features:**
- Posts can be organized in **paths** (folders): `path_id`
- Posts can have **parent posts** (Confluence-style): `parent_id`
- Category numbering: TUT #1, TUT #2 (sequential per category)
- Example:
  ```
  Path: /documentation/business
    Post: "Business Overview" (parent_id=NULL)
      └─ Child: "Q1 Report" (parent_id=123)
  ```

---

## Tags & Tagging

### Tags Table

```sql
-- ============================================
-- TAGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

COMMENT ON TABLE tags IS 'Post tags/categories';
```

### Post Tags Junction Table

```sql
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

COMMENT ON TABLE post_tags IS 'Many-to-many relationship between posts and tags';
```

**Relationship:**
- Many-to-many: Posts can have multiple tags, tags can apply to multiple posts
- Composite primary key on (post_id, tag_id)
- Cascade delete: Removes tagging when post or tag deleted

---

## Content Moderation

### Content Reports Table

```sql
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

COMMENT ON TABLE content_reports IS 'Content moderation reports';
COMMENT ON COLUMN content_reports.status IS 'pending=new report, reviewed=admin reviewed, resolved=action taken, dismissed=no action needed';
```

**Issue Types:**
- `inappropriate` - Offensive content
- `copyright` - Copyright violation
- `gdpr_removal` - GDPR data removal request
- `privacy` - Privacy concerns
- `spam` - Spam content
- `misinformation` - False information
- `harassment` - Harassment or abuse
- `other` - Other issues

**Status Workflow:**
1. `pending` - New report submitted
2. `reviewed` - Admin has reviewed
3. `resolved` - Action taken
4. `dismissed` - No action needed

---

## Application Metadata

### App Info Table

```sql
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

COMMENT ON TABLE app_info IS 'Application release version information and changelog';
```

### App Features Table

```sql
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

COMMENT ON TABLE app_features IS 'Features associated with each application release';
```

### App Metadata Table

```sql
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

COMMENT ON TABLE app_metadata IS 'Application-wide configuration and metadata';
```

**Usage Examples:**
- Store feature flags: `{"key": "enable_vector_search", "value": "true", "value_type": "boolean"}`
- Store configuration: `{"key": "max_upload_size", "value": "10485760", "value_type": "integer"}`
- Store JSON data: `{"key": "api_settings", "value": "{...}", "value_type": "json"}`

---

## Views

### Posts with Details View

```sql
-- Drop views if they already exist (for safe recreation)
DROP VIEW IF EXISTS posts_with_details CASCADE;

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
```

**Purpose:** Provides a denormalized view of posts with all related data in one query.

**Includes:**
- All post columns
- Author display name and email
- Array of tag names
- Count of pending reports

### Path Statistics View

```sql
DROP VIEW IF EXISTS path_statistics CASCADE;

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
```

**Purpose:** Aggregated statistics for each path.

**Includes:**
- Path information
- Count of direct child paths
- Count of direct posts in this path
- Creator information

---

## Complete Schema ERD

```
┌─────────────────────────────────────────────────────────────────┐
│                       DATABASE SCHEMA                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│   users     │──────<│  user_groups │>──────│   groups    │
│             │       └──────────────┘       │             │
│ id (PK)     │                              │ id (PK)     │
│ email       │                              │ name        │
│ display_name│                              │ description │
│ password_   │                              └─────────────┘
│  hash       │
│ status      │
│ role        │
└─────┬───────┘
      │
      │ created_by
      │
      ▼
┌─────────────┐       ┌─────────────┐
│   paths     │       │   posts     │
│             │       │             │
│ id (PK)     │<──────│ id (PK)     │
│ name        │       │ title       │
│ slug        │       │ content     │
│ parent_id   │◄──┐   │ category    │
│ level       │   │   │ slug        │
│ full_path   │   │   │ author_id   │───┐
│ icon        │   │   │ path_id     │   │
│ color       │   │   │ parent_id   │◄──┤
│ position    │   │   │ position    │   │
│ created_by  │───┘   │ level       │   │
└─────────────┘       │ published   │   │
                      └──────┬──────┘   │
                             │           │
                      ┌──────┴──────┐   │
                      │             │   │
                      ▼             ▼   │
                ┌──────────┐  ┌─────────────┐
                │post_tags │  │content_     │
                │          │  │ reports     │
                │post_id   │  │             │
                │tag_id    │  │ id (PK)     │
                └────┬─────┘  │ issue_type  │
                     │        │ post_id     │
                     │        │ status      │
                     │        │ resolved_by │───┘
                     │        └─────────────┘
                     │
                     ▼
                ┌─────────────┐
                │    tags     │
                │             │
                │ id (PK)     │
                │ name        │
                └─────────────┘

┌──────────────┐       ┌──────────────┐
│  app_info    │──────<│app_features  │
│              │       │              │
│ id (PK)      │       │ id (PK)      │
│ version      │       │ app_info_id  │
│ release_date │       │ feature_name │
│ changelog    │       │ status       │
│ is_current   │       └──────────────┘
└──────────────┘

┌──────────────┐
│ app_metadata │
│              │
│ id (PK)      │
│ key          │
│ value        │
│ value_type   │
└──────────────┘
```

**Relationship Legend:**
- `───` One-to-Many
- `──<` Many-to-Many
- `◄──` Self-Referencing
- `(PK)` Primary Key
- `(FK)` Foreign Key

---

## Migrations

### Migration 1: Add Post Hierarchy

**File:** `scripts/add-post-hierarchy.sql`

```sql
-- Migration: Add Post Hierarchy (Confluence-style parent-child relationships)

-- Step 1: Add hierarchy columns to posts table
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES posts(id) ON DELETE CASCADE;

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1 CHECK(level >= 1 AND level <= 5);

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_parent_id ON posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_posts_parent_position ON posts(parent_id, position);
CREATE INDEX IF NOT EXISTS idx_posts_level ON posts(level);

-- Step 3: Initialize existing posts as root-level (no parent)
UPDATE posts
SET parent_id = NULL, position = 0, level = 1
WHERE parent_id IS NULL;

-- Step 4: Verify the update
SELECT
  id,
  title,
  parent_id,
  level,
  position
FROM posts
ORDER BY parent_id NULLS FIRST, position, created_at
LIMIT 10;
```

**What it adds:**
- `parent_id` - Reference to parent post
- `position` - Sort order within siblings
- `level` - Depth in post hierarchy (1-5)

**Use case:** Enables Confluence-style hierarchical posts (parent-child relationships)

### Migration 2: Add Category Post Numbers

**File:** `scripts/add-category-post-numbers.sql`

```sql
-- Migration: Add category_post_number column to posts table

-- Step 1: Add the column
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS category_post_number INTEGER;

-- Step 2: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_posts_category_number ON posts(category, category_post_number);

-- Step 3: Backfill existing posts with sequential numbers
-- This assigns numbers based on creation date within each category
WITH numbered_posts AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY category ORDER BY created_at ASC) as post_num
  FROM posts
)
UPDATE posts
SET category_post_number = numbered_posts.post_num
FROM numbered_posts
WHERE posts.id = numbered_posts.id;

-- Step 4: Verify the update
SELECT
  category,
  COUNT(*) as total_posts,
  MIN(category_post_number) as min_number,
  MAX(category_post_number) as max_number
FROM posts
GROUP BY category
ORDER BY category;
```

**What it adds:**
- `category_post_number` - Sequential number within each category

**Use case:** Enables automatic numbering like "TUT #1", "TUT #2", "BLOG #1", etc.

**Example:**
```
category: "tutorial"
  - TUT #1: Getting Started
  - TUT #2: Advanced Features
  - TUT #3: Best Practices

category: "thoughts"
  - THO #1: My First Post
  - THO #2: Reflections
```

---

## Key Features Summary

### Hierarchical Organization
1. **Paths Hierarchy**
   - Self-referencing paths (folders within folders)
   - Max depth: 5 levels
   - Full path tracking: `/parent/child/grandchild`
   - Visual customization: icons and colors

2. **Post Hierarchy**
   - Posts can have parent posts (Confluence-style)
   - Max depth: 5 levels
   - Position-based ordering
   - Example: Documentation → Sub-pages → Sub-sub-pages

### Content Organization
1. **Path Organization**
   - Posts can be placed in paths (folders)
   - Each path can contain multiple posts
   - Paths can be nested

2. **Category System**
   - Posts have categories (tutorial, thoughts, etc.)
   - Automatic sequential numbering per category
   - Prefix display: TUT #1, BLOG #5

3. **Tagging System**
   - Many-to-many relationship
   - Posts can have multiple tags
   - Tags are reusable across posts

### Access Control
1. **User Roles**
   - `user` - Normal user
   - `admin` - Administrator

2. **User Status**
   - `pending` - Awaiting approval
   - `approved` - Active account
   - `rejected` - Rejected signup
   - `deletion_requested` - Account deletion requested

### Content Moderation
- Report inappropriate content
- Multiple issue types
- Status tracking workflow
- Admin response system

### Application Management
- Version tracking
- Feature management per release
- Changelog tracking
- Configuration key-value store

---

## Database Constraints

### Foreign Key Constraints

```sql
-- User relationships
users.approved_by → users(id) ON DELETE SET NULL

-- Path relationships
paths.parent_id → paths(id) ON DELETE CASCADE
paths.created_by → users(id) ON DELETE SET NULL

-- Post relationships
posts.author_id → users(id) ON DELETE CASCADE
posts.path_id → paths(id) ON DELETE SET NULL
posts.parent_id → posts(id) ON DELETE CASCADE

-- Tag relationships
post_tags.post_id → posts(id) ON DELETE CASCADE
post_tags.tag_id → tags(id) ON DELETE CASCADE

-- Report relationships
content_reports.post_id → posts(id) ON DELETE SET NULL
content_reports.resolved_by → users(id) ON DELETE SET NULL

-- Group relationships
user_groups.user_id → users(id) ON DELETE CASCADE
user_groups.group_id → groups(id) ON DELETE CASCADE

-- App feature relationships
app_features.app_info_id → app_info(id) ON DELETE CASCADE
```

### Check Constraints

```sql
-- User constraints
CHECK (status IN ('pending', 'approved', 'rejected', 'deletion_requested'))
CHECK (role IN ('user', 'admin'))

-- Path constraints
CHECK (level >= 1 AND level <= 5)

-- Post constraints
CHECK (level >= 1 AND level <= 5)

-- Report constraints
CHECK (issue_type IN ('inappropriate', 'copyright', 'gdpr_removal', 'privacy',
                      'spam', 'misinformation', 'harassment', 'other'))
CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed'))

-- Feature constraints
CHECK (status IN ('planned', 'in_progress', 'released', 'deprecated'))

-- Metadata constraints
CHECK (value_type IN ('string', 'integer', 'boolean', 'json'))
```

### Unique Constraints

```sql
users.email - Unique email per user
paths.full_path - Unique full path
posts.slug - Unique slug per post
tags.name - Unique tag name
groups.name - Unique group name
app_info.version - Unique version number
app_metadata.key - Unique configuration key
```

---

## Performance Indexes

### Critical Indexes for Search

```sql
-- User lookups
idx_users_email (email) - UNIQUE
idx_users_status (status)
idx_users_role (role)

-- Path traversal
idx_paths_parent_id (parent_id)
idx_paths_full_path (full_path)
idx_paths_level (level)

-- Post queries
idx_posts_published (published)
idx_posts_category (category)
idx_posts_category_number (category, category_post_number)
idx_posts_path_id (path_id)
idx_posts_parent_id (parent_id)
idx_posts_created_at (created_at DESC)

-- Tag filtering
idx_post_tags_post_id (post_id)
idx_post_tags_tag_id (tag_id)

-- Report management
idx_reports_status (status)
idx_reports_created_at (created_at DESC)
```

---

## Sample Data Queries

### Get Complete Post with All Relationships

```sql
SELECT
  p.*,
  u.display_name as author,
  path.full_path,
  ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags,
  (SELECT COUNT(*) FROM posts WHERE parent_id = p.id) as child_count
FROM posts p
INNER JOIN users u ON p.author_id = u.id
LEFT JOIN paths path ON p.path_id = path.id
LEFT JOIN post_tags pt ON p.id = pt.post_id
LEFT JOIN tags t ON pt.tag_id = t.id
WHERE p.id = $1
GROUP BY p.id, u.display_name, path.full_path;
```

### Get Full Path Hierarchy

```sql
WITH RECURSIVE path_tree AS (
  -- Root paths
  SELECT
    id, name, parent_id, full_path, 1 as depth,
    ARRAY[id] as path_ids
  FROM paths
  WHERE parent_id IS NULL

  UNION ALL

  -- Child paths
  SELECT
    p.id, p.name, p.parent_id, p.full_path, pt.depth + 1,
    pt.path_ids || p.id
  FROM paths p
  INNER JOIN path_tree pt ON p.parent_id = pt.id
  WHERE pt.depth < 5
)
SELECT * FROM path_tree
ORDER BY depth, name;
```

### Get Post Hierarchy (Children)

```sql
WITH RECURSIVE post_tree AS (
  -- Root post
  SELECT
    id, title, parent_id, level, 1 as depth
  FROM posts
  WHERE id = $1

  UNION ALL

  -- Child posts
  SELECT
    p.id, p.title, p.parent_id, p.level, pt.depth + 1
  FROM posts p
  INNER JOIN post_tree pt ON p.parent_id = pt.id
  WHERE pt.depth < 5
)
SELECT * FROM post_tree
ORDER BY depth, position;
```

---

## Next Steps

To extend the database for search features, see:
- `database-search-queries.md` - Full-text and vector search SQL
- `content-search-implementation.md` - Content search strategies
- `vector-search-implementation.md` - AI-powered semantic search
