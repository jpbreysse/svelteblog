-- Migration: Add Ticket Features (Closed & Assignment)
-- For support system functionality

-- ============================================
-- STEP 1: Add closed columns to posts
-- ============================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS closed_by INTEGER REFERENCES users(id);

COMMENT ON COLUMN posts.closed_at IS 'When the post/ticket was closed';
COMMENT ON COLUMN posts.closed_by IS 'User who closed the post/ticket';

-- ============================================
-- STEP 2: Add assignment columns to posts
-- ============================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS assigned_by INTEGER REFERENCES users(id);

COMMENT ON COLUMN posts.assigned_to IS 'User the post/ticket is assigned to';
COMMENT ON COLUMN posts.assigned_at IS 'When the assignment was made';
COMMENT ON COLUMN posts.assigned_by IS 'User who made the assignment';

-- Index for filtering by assignment
CREATE INDEX IF NOT EXISTS idx_posts_assigned_to ON posts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_posts_closed_at ON posts(closed_at);

-- ============================================
-- STEP 3: Update post_history action types
-- ============================================

-- Drop and recreate the check constraint to add new action types
ALTER TABLE post_history DROP CONSTRAINT IF EXISTS post_history_action_check;
ALTER TABLE post_history ADD CONSTRAINT post_history_action_check
  CHECK(action IN ('created', 'updated', 'closed', 'reopened', 'assigned', 'unassigned'));

-- Add target_user_id for assignment tracking (who was assigned to)
ALTER TABLE post_history ADD COLUMN IF NOT EXISTS target_user_id INTEGER REFERENCES users(id);
COMMENT ON COLUMN post_history.target_user_id IS 'For assignment actions: the user who was assigned to';

-- ============================================
-- STEP 4: Verification
-- ============================================

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'posts'
  AND column_name IN ('closed_at', 'closed_by', 'assigned_to', 'assigned_at', 'assigned_by');
