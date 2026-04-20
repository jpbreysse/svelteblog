-- Migration: Add Group-Based Permissions to Posts
-- Implements separate read/write group permissions

-- ============================================
-- STEP 1: Add visibility column to posts
-- ============================================

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS visibility VARCHAR(50) DEFAULT 'public'
  CHECK(visibility IN ('public', 'groups', 'private'));

COMMENT ON COLUMN posts.visibility IS
  'public = everyone can read, groups = only specified groups can read, private = only author';

-- Set all existing posts to public (safe default)
UPDATE posts SET visibility = 'public' WHERE visibility IS NULL;

-- ============================================
-- STEP 2: Create post_read_groups junction table
-- ============================================

CREATE TABLE IF NOT EXISTS post_read_groups (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_post_read_groups_post_id ON post_read_groups(post_id);
CREATE INDEX IF NOT EXISTS idx_post_read_groups_group_id ON post_read_groups(group_id);

COMMENT ON TABLE post_read_groups IS
  'Groups that can read a post. Used when post.visibility = ''groups''';

-- ============================================
-- STEP 3: Create post_write_groups junction table
-- ============================================

CREATE TABLE IF NOT EXISTS post_write_groups (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_post_write_groups_post_id ON post_write_groups(post_id);
CREATE INDEX IF NOT EXISTS idx_post_write_groups_group_id ON post_write_groups(group_id);

COMMENT ON TABLE post_write_groups IS
  'Groups that can edit/write a post. Members can modify content.';

-- ============================================
-- STEP 4: Create helper view for post permissions
-- ============================================

CREATE OR REPLACE VIEW post_permissions_summary AS
SELECT
  p.id as post_id,
  p.title,
  p.visibility,
  p.author_id,
  u.display_name as author_name,
  -- Aggregate read groups
  COALESCE(
    (SELECT array_agg(g.name)
     FROM post_read_groups prg
     JOIN groups g ON prg.group_id = g.id
     WHERE prg.post_id = p.id),
    ARRAY[]::VARCHAR[]
  ) as read_groups,
  -- Aggregate write groups
  COALESCE(
    (SELECT array_agg(g.name)
     FROM post_write_groups pwg
     JOIN groups g ON pwg.group_id = g.id
     WHERE pwg.post_id = p.id),
    ARRAY[]::VARCHAR[]
  ) as write_groups,
  -- Count of groups
  (SELECT COUNT(*) FROM post_read_groups WHERE post_id = p.id) as read_group_count,
  (SELECT COUNT(*) FROM post_write_groups WHERE post_id = p.id) as write_group_count
FROM posts p
LEFT JOIN users u ON p.author_id = u.id;

COMMENT ON VIEW post_permissions_summary IS
  'Summary view of post permissions for easy debugging and display';

-- ============================================
-- STEP 5: Verification queries
-- ============================================

-- Verify the changes
SELECT
  'posts' as table_name,
  COUNT(*) as total_posts,
  COUNT(*) FILTER (WHERE visibility = 'public') as public_posts,
  COUNT(*) FILTER (WHERE visibility = 'groups') as group_posts,
  COUNT(*) FILTER (WHERE visibility = 'private') as private_posts
FROM posts;

-- Show current state
SELECT * FROM post_permissions_summary LIMIT 5;
