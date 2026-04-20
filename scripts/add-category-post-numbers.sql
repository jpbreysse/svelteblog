-- Migration: Add category_post_number column to posts table
-- Run this on existing databases to add the feature

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

-- You should see sequential numbers starting from 1 for each category
