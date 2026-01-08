# Group-Based Post Permissions - Design Document

## Current State

**Write Permissions:**
- Only the post author can edit/delete their posts
- Admins can edit/delete any post

**Read Permissions:**
- All published posts are public (visible to everyone)
- Unpublished posts are visible only to author and admins

## Proposed State

**Write Permissions:**
- Post author can write
- Members of designated "write groups" can write
- Admins can write (override)

**Read Permissions:**
- Public posts (current behavior)
- Group-restricted posts (visible only to specific groups)
- Private posts (visible only to author)

---

## Design Options

### Option 1: Single Group Ownership (Simple)

**Concept:** Each post belongs to one group. All group members can read and write.

**Database Changes:**

```sql
-- Add group ownership to posts
ALTER TABLE posts
ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL;

-- Index for filtering
CREATE INDEX idx_posts_group_id ON posts(group_id);
```

**Permissions Logic:**

```javascript
// Can read?
function canReadPost(post, user) {
  if (!post.published) return false;  // Must be published
  if (!post.group_id) return true;     // Public post

  // Check if user is in the group
  return user.groups.includes(post.group_id);
}

// Can write/edit?
function canEditPost(post, user) {
  if (user.role === 'admin') return true;  // Admins can edit all
  if (post.author_id === user.id) return true;  // Author can edit

  // Group members can edit
  if (post.group_id && user.groups.includes(post.group_id)) {
    return true;
  }

  return false;
}
```

**Pros:**
- ✅ Simple to implement
- ✅ Easy to understand
- ✅ Uses existing group infrastructure

**Cons:**
- ❌ No separation of read/write permissions
- ❌ Can't share read-only with some groups
- ❌ All group members have equal permissions

**Use Case:** Internal team wiki where all team members collaborate equally.

---

### Option 2: Separate Read/Write Groups (Recommended)

**Concept:** Posts can specify different groups for reading and writing.

**Database Changes:**

```sql
-- Create post_read_groups junction table
CREATE TABLE IF NOT EXISTS post_read_groups (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, group_id)
);

CREATE INDEX idx_post_read_groups_post_id ON post_read_groups(post_id);
CREATE INDEX idx_post_read_groups_group_id ON post_read_groups(group_id);

-- Create post_write_groups junction table
CREATE TABLE IF NOT EXISTS post_write_groups (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, group_id)
);

CREATE INDEX idx_post_write_groups_post_id ON post_write_groups(post_id);
CREATE INDEX idx_post_write_groups_group_id ON post_write_groups(group_id);

-- Add visibility flag to posts
ALTER TABLE posts
ADD COLUMN visibility VARCHAR(50) DEFAULT 'public'
  CHECK(visibility IN ('public', 'groups', 'private'));

COMMENT ON COLUMN posts.visibility IS
  'public=everyone can read, groups=only specified groups, private=only author';
```

**Permissions Logic:**

```javascript
// Can read?
async function canReadPost(post, user) {
  if (!post.published) return false;

  // Visibility check
  if (post.visibility === 'public') return true;
  if (post.visibility === 'private') return post.author_id === user.id;

  if (post.visibility === 'groups') {
    // Check if user is in any read group
    const readGroups = await db.query(`
      SELECT group_id
      FROM post_read_groups
      WHERE post_id = $1
    `, [post.id]);

    const allowedGroupIds = readGroups.rows.map(r => r.group_id);
    return user.groups.some(g => allowedGroupIds.includes(g));
  }

  return false;
}

// Can write/edit?
async function canEditPost(post, user) {
  if (user.role === 'admin') return true;
  if (post.author_id === user.id) return true;

  // Check if user is in any write group
  const writeGroups = await db.query(`
    SELECT group_id
    FROM post_write_groups
    WHERE post_id = $1
  `, [post.id]);

  const allowedGroupIds = writeGroups.rows.map(r => r.group_id);
  return user.groups.some(g => allowedGroupIds.includes(g));
}
```

**Query: Get Posts User Can Read**

```sql
SELECT DISTINCT p.*
FROM posts p
LEFT JOIN post_read_groups prg ON p.id = prg.post_id
LEFT JOIN user_groups ug ON prg.group_id = ug.group_id
WHERE p.published = true
  AND (
    p.visibility = 'public'  -- Public posts
    OR (p.visibility = 'private' AND p.author_id = $1)  -- Private posts by user
    OR (p.visibility = 'groups' AND ug.user_id = $1)  -- Group posts user can read
  )
ORDER BY p.created_at DESC;
```

**Pros:**
- ✅ Flexible read/write separation
- ✅ Can share read-only with external groups
- ✅ Supports multiple groups per post
- ✅ Clear visibility model

**Cons:**
- ⚠️ More complex to implement
- ⚠️ Requires junction tables
- ⚠️ More complex queries

**Use Case:** Documentation where some groups can edit, others can only read.

---

### Option 3: Role-Based Permissions in Groups

**Concept:** Users have roles within groups (viewer, editor, admin).

**Database Changes:**

```sql
-- Add role to user_groups junction
ALTER TABLE user_groups
ADD COLUMN role VARCHAR(50) DEFAULT 'member'
  CHECK(role IN ('viewer', 'member', 'editor', 'admin'));

-- Posts belong to groups
ALTER TABLE posts
ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
ADD COLUMN visibility VARCHAR(50) DEFAULT 'public'
  CHECK(visibility IN ('public', 'group', 'private'));

CREATE INDEX idx_posts_group_id ON posts(group_id);

COMMENT ON COLUMN user_groups.role IS
  'viewer=read only, member=read+comment, editor=read+write, admin=full control';
```

**Permissions Logic:**

```javascript
// Get user's role in group
async function getUserGroupRole(userId, groupId) {
  const result = await db.query(`
    SELECT role
    FROM user_groups
    WHERE user_id = $1 AND group_id = $2
  `, [userId, groupId]);

  return result.rows[0]?.role || null;
}

// Can read?
async function canReadPost(post, user) {
  if (!post.published) return false;
  if (post.visibility === 'public') return true;
  if (post.visibility === 'private') return post.author_id === user.id;

  if (post.visibility === 'group' && post.group_id) {
    const role = await getUserGroupRole(user.id, post.group_id);
    return role !== null;  // Any role can read
  }

  return false;
}

// Can write/edit?
async function canEditPost(post, user) {
  if (user.role === 'admin') return true;
  if (post.author_id === user.id) return true;

  if (post.group_id) {
    const role = await getUserGroupRole(user.id, post.group_id);
    return role === 'editor' || role === 'admin';
  }

  return false;
}
```

**Pros:**
- ✅ Fine-grained control within groups
- ✅ Supports viewer/editor distinction
- ✅ Single group ownership (simpler)

**Cons:**
- ⚠️ Can't share with multiple groups
- ⚠️ More complex role management
- ⚠️ Roles need to be managed per user-group

**Use Case:** Corporate teams with hierarchical permissions (managers, editors, viewers).

---

### Option 4: Access Control Lists (ACL) - Most Flexible

**Concept:** Each post has explicit permissions for users and groups.

**Database Changes:**

```sql
-- Create post_permissions table
CREATE TABLE IF NOT EXISTS post_permissions (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,

  -- Can be user or group
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,

  -- Permissions
  can_read BOOLEAN DEFAULT true,
  can_write BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  can_share BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraint: must specify either user_id or group_id
  CHECK (
    (user_id IS NOT NULL AND group_id IS NULL) OR
    (user_id IS NULL AND group_id IS NOT NULL)
  )
);

CREATE INDEX idx_post_permissions_post_id ON post_permissions(post_id);
CREATE INDEX idx_post_permissions_user_id ON post_permissions(user_id);
CREATE INDEX idx_post_permissions_group_id ON post_permissions(group_id);

-- Add default visibility
ALTER TABLE posts
ADD COLUMN default_visibility VARCHAR(50) DEFAULT 'private'
  CHECK(default_visibility IN ('public', 'private'));
```

**Permissions Logic:**

```javascript
// Check specific permission
async function hasPermission(post, user, permission) {
  // Admin override
  if (user.role === 'admin') return true;

  // Author always has full permissions
  if (post.author_id === user.id) return true;

  // Check default visibility for read
  if (permission === 'can_read' && post.default_visibility === 'public') {
    return true;
  }

  // Check explicit permissions
  const result = await db.query(`
    SELECT
      MAX(CASE WHEN pp.${permission} THEN 1 ELSE 0 END) as has_permission
    FROM post_permissions pp
    LEFT JOIN user_groups ug ON pp.group_id = ug.group_id
    WHERE pp.post_id = $1
      AND (pp.user_id = $2 OR ug.user_id = $2)
  `, [post.id, user.id]);

  return result.rows[0]?.has_permission === 1;
}

// Convenience functions
const canReadPost = (post, user) => hasPermission(post, user, 'can_read');
const canEditPost = (post, user) => hasPermission(post, user, 'can_write');
const canDeletePost = (post, user) => hasPermission(post, user, 'can_delete');
```

**Query: Get Posts User Can Read**

```sql
SELECT DISTINCT p.*
FROM posts p
LEFT JOIN post_permissions pp ON p.id = pp.post_id
LEFT JOIN user_groups ug ON pp.group_id = ug.group_id
WHERE p.published = true
  AND (
    p.default_visibility = 'public'  -- Public posts
    OR p.author_id = $1  -- Author's posts
    OR (pp.user_id = $1 AND pp.can_read = true)  -- Direct user permission
    OR (ug.user_id = $1 AND pp.can_read = true)  -- Group permission
  )
ORDER BY p.created_at DESC;
```

**Pros:**
- ✅ Maximum flexibility
- ✅ Per-user and per-group permissions
- ✅ Granular permission types
- ✅ Can audit who has access

**Cons:**
- ❌ Most complex to implement
- ❌ Slower queries (multiple joins)
- ❌ Complex UI for managing permissions
- ❌ Higher maintenance burden

**Use Case:** Enterprise document management with complex sharing requirements.

---

## Comparison Matrix

| Feature | Option 1 | Option 2 | Option 3 | Option 4 |
|---------|----------|----------|----------|----------|
| **Complexity** | Low | Medium | Medium | High |
| **Flexibility** | Low | High | Medium | Very High |
| **Performance** | Fast | Medium | Medium | Slower |
| **Multiple Groups** | ❌ | ✅ | ❌ | ✅ |
| **Read/Write Separation** | ❌ | ✅ | ✅ | ✅ |
| **Per-User Permissions** | ❌ | ❌ | ❌ | ✅ |
| **Role-Based** | ❌ | ❌ | ✅ | ✅ |
| **Implementation Time** | 1-2 days | 3-4 days | 3-4 days | 5-7 days |

---

## Recommendation: Option 2 (Separate Read/Write Groups)

**Why:**
1. **Balance**: Good balance between flexibility and complexity
2. **Common Use Case**: Supports typical scenarios (read-only sharing, collaborative editing)
3. **Existing Infrastructure**: Leverages your existing groups table
4. **Scalable**: Can be extended later if needed
5. **Clear Model**: Easy to explain to users ("This post is readable by these groups, editable by these groups")

**Migration Path:**
- Start with Option 2
- If you need per-user permissions later, migrate to Option 4
- If you need roles within groups, add Option 3's role column

---

## Implementation Plan (Option 2)

### Phase 1: Database Schema

```sql
-- Migration: add_group_permissions.sql

-- Add visibility to posts
ALTER TABLE posts
ADD COLUMN visibility VARCHAR(50) DEFAULT 'public'
  CHECK(visibility IN ('public', 'groups', 'private'));

-- Create post_read_groups
CREATE TABLE IF NOT EXISTS post_read_groups (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, group_id)
);

CREATE INDEX idx_post_read_groups_post_id ON post_read_groups(post_id);
CREATE INDEX idx_post_read_groups_group_id ON post_read_groups(group_id);

-- Create post_write_groups
CREATE TABLE IF NOT EXISTS post_write_groups (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, group_id)
);

CREATE INDEX idx_post_write_groups_post_id ON post_write_groups(post_id);
CREATE INDEX idx_post_write_groups_group_id ON post_write_groups(group_id);

-- Set default: all existing posts are public
UPDATE posts SET visibility = 'public';
```

### Phase 2: API Functions

```javascript
// src/lib/server/permissions.js

export async function canReadPost(postId, userId) {
  const result = await pool.query(`
    SELECT p.id
    FROM posts p
    LEFT JOIN post_read_groups prg ON p.id = prg.post_id
    LEFT JOIN user_groups ug ON prg.group_id = ug.group_id
    WHERE p.id = $1
      AND p.published = true
      AND (
        p.visibility = 'public'
        OR (p.visibility = 'private' AND p.author_id = $2)
        OR (p.visibility = 'groups' AND ug.user_id = $2)
      )
    LIMIT 1
  `, [postId, userId]);

  return result.rows.length > 0;
}

export async function canEditPost(postId, userId, userRole) {
  if (userRole === 'admin') return true;

  const result = await pool.query(`
    SELECT p.id
    FROM posts p
    LEFT JOIN post_write_groups pwg ON p.id = pwg.post_id
    LEFT JOIN user_groups ug ON pwg.group_id = ug.group_id
    WHERE p.id = $1
      AND (
        p.author_id = $2
        OR ug.user_id = $2
      )
    LIMIT 1
  `, [postId, userId]);

  return result.rows.length > 0;
}

export async function setPostGroups(postId, readGroupIds, writeGroupIds) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Clear existing permissions
    await client.query('DELETE FROM post_read_groups WHERE post_id = $1', [postId]);
    await client.query('DELETE FROM post_write_groups WHERE post_id = $1', [postId]);

    // Add read groups
    for (const groupId of readGroupIds) {
      await client.query(
        'INSERT INTO post_read_groups (post_id, group_id) VALUES ($1, $2)',
        [postId, groupId]
      );
    }

    // Add write groups
    for (const groupId of writeGroupIds) {
      await client.query(
        'INSERT INTO post_write_groups (post_id, group_id) VALUES ($1, $2)',
        [postId, groupId]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getUserAccessiblePosts(userId) {
  const result = await pool.query(`
    SELECT DISTINCT
      p.id, p.title, p.excerpt, p.category, p.slug,
      p.created_at, p.visibility,
      u.display_name as author
    FROM posts p
    INNER JOIN users u ON p.author_id = u.id
    LEFT JOIN post_read_groups prg ON p.id = prg.post_id
    LEFT JOIN user_groups ug ON prg.group_id = ug.group_id
    WHERE p.published = true
      AND (
        p.visibility = 'public'
        OR (p.visibility = 'private' AND p.author_id = $1)
        OR (p.visibility = 'groups' AND ug.user_id = $1)
      )
    ORDER BY p.created_at DESC
  `, [userId]);

  return result.rows;
}
```

### Phase 3: UI Components

**Post Editor - Add Permissions Section:**

```svelte
<!-- src/lib/components/PostPermissions.svelte -->
<script>
  export let visibility = 'public';
  export let readGroups = [];
  export let writeGroups = [];
  export let availableGroups = [];

  $: showGroupSelector = visibility === 'groups';
</script>

<div class="permissions-section">
  <h3>Visibility</h3>

  <div class="visibility-options">
    <label>
      <input type="radio" bind:group={visibility} value="public" />
      🌍 Public - Everyone can read
    </label>

    <label>
      <input type="radio" bind:group={visibility} value="groups" />
      👥 Groups - Only specific groups
    </label>

    <label>
      <input type="radio" bind:group={visibility} value="private" />
      🔒 Private - Only you
    </label>
  </div>

  {#if showGroupSelector}
    <div class="group-selector">
      <div class="group-section">
        <h4>Can Read</h4>
        <select multiple bind:value={readGroups}>
          {#each availableGroups as group}
            <option value={group.id}>{group.name}</option>
          {/each}
        </select>
      </div>

      <div class="group-section">
        <h4>Can Edit</h4>
        <select multiple bind:value={writeGroups}>
          {#each availableGroups as group}
            <option value={group.id}>{group.name}</option>
          {/each}
        </select>
      </div>
    </div>
  {/if}
</div>

<style>
  .permissions-section {
    padding: 1.5rem;
    background: #f9fafb;
    border-radius: 8px;
    margin: 1rem 0;
  }

  .visibility-options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 1rem 0;
  }

  .visibility-options label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .visibility-options label:has(input:checked) {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .group-selector {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 1rem;
  }

  .group-section h4 {
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    color: #6b7280;
  }

  select[multiple] {
    width: 100%;
    height: 150px;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
  }
</style>
```

**Usage in Blog Editor:**

```svelte
<!-- src/routes/blog/+page.svelte -->
<script>
  import PostPermissions from '$lib/components/PostPermissions.svelte';

  let editingPost = {
    title: '',
    content: '',
    visibility: 'public',
    readGroups: [],
    writeGroups: []
  };

  let availableGroups = []; // Load from API

  onMount(async () => {
    // Load user's groups
    const response = await fetch('/api/groups');
    const data = await response.json();
    availableGroups = data.groups;
  });

  async function savePost() {
    const response = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editingPost,
        readGroupIds: editingPost.readGroups,
        writeGroupIds: editingPost.writeGroups
      })
    });
    // Handle response...
  }
</script>

<!-- In the editor form -->
<PostPermissions
  bind:visibility={editingPost.visibility}
  bind:readGroups={editingPost.readGroups}
  bind:writeGroups={editingPost.writeGroups}
  {availableGroups}
/>
```

### Phase 4: API Endpoints

```javascript
// src/routes/api/posts/+server.js

import { canEditPost, setPostGroups } from '$lib/server/permissions.js';

export async function POST({ request, locals }) {
  if (!locals.user) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const postData = await request.json();

  // Create post
  const post = await blogDB.createPost(postData, locals.user.id);

  // Set permissions
  if (postData.visibility === 'groups') {
    await setPostGroups(
      post.id,
      postData.readGroupIds || [],
      postData.writeGroupIds || []
    );
  }

  return json({ success: true, post });
}
```

---

## Security Considerations

### 1. Permission Checks in Every Query

```javascript
// BAD: Don't assume permissions
const post = await db.query('SELECT * FROM posts WHERE id = $1', [postId]);

// GOOD: Include permission check
const post = await db.query(`
  SELECT p.*
  FROM posts p
  LEFT JOIN post_read_groups prg ON p.id = prg.post_id
  LEFT JOIN user_groups ug ON prg.group_id = ug.group_id
  WHERE p.id = $1
    AND (p.visibility = 'public' OR ug.user_id = $2)
`, [postId, userId]);
```

### 2. Always Verify on Server

```javascript
// Client-side checks are for UX only
// Always verify on server
export async function PUT({ params, request, locals }) {
  const canEdit = await canEditPost(params.id, locals.user.id, locals.user.role);

  if (!canEdit) {
    return json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  // Proceed with update...
}
```

### 3. Prevent Information Leakage

```javascript
// Don't reveal if post exists when user lacks permission
const post = await getPost(postId, userId);

if (!post) {
  // Don't say "forbidden" - could leak that post exists
  return json({ success: false, error: 'Not found' }, { status: 404 });
}
```

---

## Questions to Consider

Before implementing, please clarify:

1. **Default Behavior**: When creating a post, should it default to public or private?

2. **Author Override**: Can the author always edit their posts, or should group permissions override?

3. **Multiple Groups**: Can a post be shared with multiple groups for reading?

4. **Inheritance**: Should child posts inherit parent post permissions?

5. **Path Permissions**: Should paths also have group permissions that cascade to posts?

6. **Admin Override**: Should admins bypass all group permissions?

7. **Group Discovery**: Can users see which groups a post is shared with?

8. **Write Group Auto-Read**: Should write groups automatically get read permission?

9. **Explorer View**: How should the tree show group-restricted posts?

10. **Notification**: Should group members be notified when posts are shared?

---

## Next Steps

1. **Decide** which option fits your use case
2. **Review** the migration plan
3. **Test** with a development database
4. **Implement** in phases (database → API → UI)
5. **Migrate** existing posts (set all to public initially)

Let me know which option you prefer, or if you need a hybrid approach!
