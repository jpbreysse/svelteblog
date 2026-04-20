-- Migration: Add Post Hierarchy (Confluence-style parent-child relationships)
-- Run this on your database to add hierarchical structure to posts

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

-- You should see all posts with level = 1 and parent_id = NULL initially
