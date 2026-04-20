-- Debug script to check permissions for test4 user

-- 1. Find test4 user ID
SELECT id, email, display_name, role FROM users WHERE email LIKE '%test4%' OR display_name LIKE '%test4%';

-- 2. Find solution group ID
SELECT id, name, description FROM groups WHERE name LIKE '%solution%';

-- 3. Check if test4 is in solution group
SELECT
  u.id as user_id,
  u.display_name,
  g.id as group_id,
  g.name as group_name
FROM users u
JOIN user_groups ug ON u.id = ug.user_id
JOIN groups g ON ug.group_id = g.id
WHERE u.email LIKE '%test4%' OR u.display_name LIKE '%test4%';

-- 4. Check the last created post and its permissions
SELECT
  p.id,
  p.title,
  p.visibility,
  p.author_id,
  p.created_at
FROM posts p
ORDER BY p.created_at DESC
LIMIT 1;

-- 5. Check read groups for the last post
SELECT
  p.id as post_id,
  p.title,
  g.id as group_id,
  g.name as group_name
FROM posts p
LEFT JOIN post_read_groups prg ON p.id = prg.post_id
LEFT JOIN groups g ON prg.group_id = g.id
WHERE p.id = (SELECT id FROM posts ORDER BY created_at DESC LIMIT 1);

-- 6. Check write groups for the last post
SELECT
  p.id as post_id,
  p.title,
  g.id as group_id,
  g.name as group_name
FROM posts p
LEFT JOIN post_write_groups pwg ON p.id = pwg.post_id
LEFT JOIN groups g ON pwg.group_id = g.id
WHERE p.id = (SELECT id FROM posts ORDER BY created_at DESC LIMIT 1);

-- 7. Test the exact query used in canWritePost
-- Replace <POST_ID> and <USER_ID> with actual values
-- Example: WHERE p.id = 123 AND ... ($2 = 5)
/*
SELECT p.id
FROM posts p
LEFT JOIN post_write_groups pwg ON p.id = pwg.post_id
LEFT JOIN user_groups ug ON pwg.group_id = ug.group_id AND ug.user_id = <USER_ID>
WHERE p.id = <POST_ID>
  AND (
    p.author_id = <USER_ID>
    OR ug.user_id IS NOT NULL
  )
LIMIT 1;
*/
