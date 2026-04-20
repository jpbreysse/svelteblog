-- Migration: Add Post History Tracking
-- Tracks who edited posts and when

-- ============================================
-- STEP 1: Create post_history table
-- ============================================

CREATE TABLE IF NOT EXISTS post_history (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(20) NOT NULL CHECK(action IN ('created', 'updated')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_post_history_post_id ON post_history(post_id);
CREATE INDEX IF NOT EXISTS idx_post_history_user_id ON post_history(user_id);
CREATE INDEX IF NOT EXISTS idx_post_history_created_at ON post_history(created_at DESC);

COMMENT ON TABLE post_history IS 'Audit log of post changes - who edited and when';
COMMENT ON COLUMN post_history.action IS 'created = initial creation, updated = any edit';

-- ============================================
-- STEP 2: Add updated_by to posts for quick access
-- ============================================

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

COMMENT ON COLUMN posts.updated_by IS 'Last user to update this post';

-- ============================================
-- STEP 3: Backfill existing posts with author as creator
-- ============================================

-- Add history entry for existing posts (as 'created' by the author)
INSERT INTO post_history (post_id, user_id, action, created_at)
SELECT id, author_id, 'created', created_at
FROM posts
WHERE NOT EXISTS (
  SELECT 1 FROM post_history ph WHERE ph.post_id = posts.id
);

-- Set updated_by to author for existing posts
UPDATE posts SET updated_by = author_id WHERE updated_by IS NULL;

-- ============================================
-- STEP 4: Verification
-- ============================================

SELECT
  'post_history' as table_name,
  COUNT(*) as total_entries
FROM post_history;
