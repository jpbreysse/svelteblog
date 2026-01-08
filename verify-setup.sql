-- Comprehensive verification script for group permissions

-- 1. Verify migration ran - Check if visibility column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'posts' AND column_name = 'visibility';

-- 2. Verify tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('post_read_groups', 'post_write_groups', 'groups', 'user_groups');

-- 3. Get test4 user details
SELECT id, email, display_name, role FROM users WHERE email = 'test4@yahoo.fr';

-- 4. Get solution group details
SELECT id, name, description FROM groups WHERE name = 'solution';

-- 5. Verify test4 is in solution group (with actual IDs shown)
SELECT
  u.id as user_id,
  u.email,
  ug.group_id,
  g.name as group_name
FROM users u
JOIN user_groups ug ON u.id = ug.user_id
JOIN groups g ON ug.group_id = g.id
WHERE u.email = 'test4@yahoo.fr';

-- 6. Get the most recent post with all details
SELECT
  id,
  title,
  visibility,
  author_id,
  created_at
FROM posts
ORDER BY created_at DESC
LIMIT 1;

-- 7. Show ALL posts with visibility = 'groups'
SELECT
  id,
  title,
  visibility,
  author_id,
  created_at
FROM posts
WHERE visibility = 'groups'
ORDER BY created_at DESC;

-- 8. For the latest post, show read permissions (IMPORTANT!)
SELECT
  p.id as post_id,
  p.title,
  p.visibility,
  prg.group_id,
  g.name as group_name
FROM posts p
LEFT JOIN post_read_groups prg ON p.id = prg.post_id
LEFT JOIN groups g ON prg.group_id = g.id
WHERE p.id = (SELECT id FROM posts ORDER BY created_at DESC LIMIT 1);

-- 9. For the latest post, show write permissions (IMPORTANT!)
SELECT
  p.id as post_id,
  p.title,
  p.visibility,
  pwg.group_id,
  g.name as group_name
FROM posts p
LEFT JOIN post_write_groups pwg ON p.id = pwg.post_id
LEFT JOIN groups g ON pwg.group_id = g.id
WHERE p.id = (SELECT id FROM posts ORDER BY created_at DESC LIMIT 1);

-- 10. Manual test of the canWritePost query for test4 and latest post
-- This simulates what the code does
SELECT
  p.id,
  p.title,
  p.author_id,
  pwg.group_id as write_group_id,
  ug.user_id as user_in_group,
  ug.group_id as users_group_id
FROM posts p
LEFT JOIN post_write_groups pwg ON p.id = pwg.post_id
LEFT JOIN user_groups ug ON pwg.group_id = ug.group_id
WHERE p.id = (SELECT id FROM posts ORDER BY created_at DESC LIMIT 1)
  AND ug.user_id = (SELECT id FROM users WHERE email = 'test4@yahoo.fr');
