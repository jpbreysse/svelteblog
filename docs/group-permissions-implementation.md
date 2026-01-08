# Group Permissions Implementation Guide

## Overview

This implementation allows posts to have different read and write permissions for different groups.

**Example Scenario:**
- **Post**: "Q1 Strategy Document"
  - **Leadership Group**: Can read AND write
  - **Engineering Group**: Can only read
  - **Sales Group**: No access

## Database Schema

### New Tables

```sql
-- Groups that can READ a post
post_read_groups (
  post_id INTEGER,
  group_id INTEGER,
  PRIMARY KEY (post_id, group_id)
)

-- Groups that can WRITE a post
post_write_groups (
  post_id INTEGER,
  group_id INTEGER,
  PRIMARY KEY (post_id, group_id)
)
```

### Post Visibility Levels

```sql
posts.visibility:
  - 'public'  → Everyone can read
  - 'groups'  → Only specified groups can read
  - 'private' → Only the author can read
```

## Permission Rules

### Read Permissions

A user can read a post if:
1. Post visibility is `'public'` (everyone can read)
2. Post visibility is `'private'` AND user is the author
3. Post visibility is `'groups'` AND user is in a `post_read_groups` group

### Write Permissions

A user can write/edit a post if:
1. User is an admin (can edit everything)
2. User is the post author (can always edit own posts)
3. User is in a `post_write_groups` group

### Delete Permissions

A user can delete a post if:
1. User is an admin
2. User is the post author

**Note**: Group members with write access CANNOT delete (only edit)

## Examples

### Example 1: Leadership Document

```javascript
// Post: "Q1 Strategy"
{
  id: 1,
  title: "Q1 Strategy",
  visibility: "groups",
  author_id: 5,

  // Read groups
  post_read_groups: [
    { group_id: 1 },  // Leadership
    { group_id: 2 },  // Engineering
    { group_id: 3 }   // Sales
  ],

  // Write groups
  post_write_groups: [
    { group_id: 1 }   // Leadership only
  ]
}

// Results:
// - Leadership members: Can read + write
// - Engineering members: Can read only
// - Sales members: Can read only
// - Non-members: Cannot see post
```

### Example 2: Public Documentation

```javascript
// Post: "API Documentation"
{
  id: 2,
  title: "API Documentation",
  visibility: "public",  // Everyone can read
  author_id: 7,

  post_read_groups: [],  // Not needed (public)
  post_write_groups: [
    { group_id: 4 }  // Engineering team
  ]
}

// Results:
// - Everyone: Can read
// - Engineering members: Can read + write
// - Author: Can read + write + delete
```

### Example 3: Private Draft

```javascript
// Post: "Personal Notes"
{
  id: 3,
  title: "Personal Notes",
  visibility: "private",  // Only author
  author_id: 10,

  post_read_groups: [],   // Not used for private
  post_write_groups: []
}

// Results:
// - Author only: Can read + write + delete
// - Everyone else: Cannot see post
```

## API Usage

### Check Permissions

```javascript
import { canReadPost, canWritePost } from '$lib/server/permissions.js';

// Check if user can read
const canRead = await canReadPost(postId, userId);

// Check if user can write
const canWrite = await canWritePost(postId, userId, userRole);

// Check if user can delete
const canDelete = await canDeletePost(postId, userId, userRole);
```

### Get User's Posts

```javascript
import { getUserReadablePosts, getUserEditablePosts } from '$lib/server/permissions.js';

// Get all posts user can read
const readablePosts = await getUserReadablePosts(userId);

// Get all posts user can edit
const editablePosts = await getUserEditablePosts(userId, userRole);
```

### Set Post Permissions

```javascript
import { setPostPermissions } from '$lib/server/permissions.js';

// Set which groups can read/write
await setPostPermissions(
  postId,
  [1, 2, 3],  // Read groups: Leadership, Engineering, Sales
  [1]         // Write groups: Leadership only
);

// Note: Write groups automatically get read access
```

### Get Post Permissions

```javascript
import { getPostPermissions } from '$lib/server/permissions.js';

const { readGroups, writeGroups } = await getPostPermissions(postId);

console.log(readGroups);
// [
//   { id: 1, name: 'Leadership' },
//   { id: 2, name: 'Engineering' },
//   { id: 3, name: 'Sales' }
// ]

console.log(writeGroups);
// [
//   { id: 1, name: 'Leadership' }
// ]
```

## API Endpoint Integration

### Create Post with Permissions

```javascript
// src/routes/api/posts/+server.js
import { setPostPermissions } from '$lib/server/permissions.js';

export async function POST({ request, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await request.json();

  // Create post
  const post = await blogDB.createPost({
    title: data.title,
    content: data.content,
    visibility: data.visibility,
    // ... other fields
  }, locals.user.id);

  // Set permissions if visibility is 'groups'
  if (data.visibility === 'groups') {
    await setPostPermissions(
      post.id,
      data.readGroupIds || [],
      data.writeGroupIds || []
    );
  }

  return json({ success: true, post });
}
```

### Update Post with Permission Check

```javascript
// src/routes/api/posts/[id]/+server.js
import { canWritePost } from '$lib/server/permissions.js';

export async function PUT({ params, request, locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check write permission
  const canWrite = await canWritePost(
    params.id,
    locals.user.id,
    locals.user.role
  );

  if (!canWrite) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  // Update post
  const data = await request.json();
  const updatedPost = await blogDB.updatePost(params.id, data);

  return json({ success: true, post: updatedPost });
}
```

### Get Posts with Permissions

```javascript
// src/routes/api/posts/+server.js
import { getUserReadablePosts } from '$lib/server/permissions.js';

export async function GET({ locals }) {
  const userId = locals.user?.id || null;

  // Get only posts user can read
  const posts = await getUserReadablePosts(userId);

  return json({ success: true, posts });
}
```

## UI Components

### Permission Selector Component

```svelte
<!-- src/lib/components/PostPermissions.svelte -->
<script>
  export let visibility = 'public';
  export let readGroupIds = [];
  export let writeGroupIds = [];
  export let availableGroups = [];

  $: showGroupSelector = visibility === 'groups';
</script>

<div class="permissions-panel">
  <h3>📋 Post Visibility</h3>

  <div class="visibility-options">
    <label class="visibility-option">
      <input type="radio" bind:group={visibility} value="public" />
      <div class="option-content">
        <span class="option-icon">🌍</span>
        <div>
          <strong>Public</strong>
          <p>Everyone can read this post</p>
        </div>
      </div>
    </label>

    <label class="visibility-option">
      <input type="radio" bind:group={visibility} value="groups" />
      <div class="option-content">
        <span class="option-icon">👥</span>
        <div>
          <strong>Groups</strong>
          <p>Only specific groups can read</p>
        </div>
      </div>
    </label>

    <label class="visibility-option">
      <input type="radio" bind:group={visibility} value="private" />
      <div class="option-content">
        <span class="option-icon">🔒</span>
        <div>
          <strong>Private</strong>
          <p>Only you can read this post</p>
        </div>
      </div>
    </label>
  </div>

  {#if showGroupSelector}
    <div class="group-permissions">
      <div class="permission-section">
        <h4>👁️ Can Read</h4>
        <p class="help-text">Select groups that can view this post</p>
        <div class="group-list">
          {#each availableGroups as group}
            <label class="group-checkbox">
              <input
                type="checkbox"
                value={group.id}
                bind:group={readGroupIds}
              />
              <span>{group.name}</span>
            </label>
          {/each}
        </div>
      </div>

      <div class="permission-section">
        <h4>✏️ Can Edit</h4>
        <p class="help-text">Select groups that can edit this post</p>
        <div class="group-list">
          {#each availableGroups as group}
            <label class="group-checkbox">
              <input
                type="checkbox"
                value={group.id}
                bind:group={writeGroupIds}
              />
              <span>{group.name}</span>
            </label>
          {/each}
        </div>
      </div>
    </div>

    <div class="permission-summary">
      <strong>Summary:</strong>
      {#if writeGroupIds.length > 0}
        <span class="summary-item">
          ✏️ {writeGroupIds.length} group(s) can edit
        </span>
      {/if}
      {#if readGroupIds.length > 0}
        <span class="summary-item">
          👁️ {readGroupIds.length} group(s) can read
        </span>
      {:else}
        <span class="warning">⚠️ No read groups selected - only you can see this</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .permissions-panel {
    padding: 1.5rem;
    background: #f9fafb;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }

  .permissions-panel h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: #1f2937;
  }

  .visibility-options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .visibility-option {
    cursor: pointer;
  }

  .option-content {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .visibility-option:has(input:checked) .option-content {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .option-icon {
    font-size: 1.5rem;
  }

  .option-content strong {
    display: block;
    color: #1f2937;
    margin-bottom: 0.25rem;
  }

  .option-content p {
    margin: 0;
    font-size: 0.875rem;
    color: #6b7280;
  }

  .group-permissions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-top: 1rem;
    padding: 1rem;
    background: white;
    border-radius: 6px;
  }

  .permission-section h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: #1f2937;
  }

  .help-text {
    margin: 0 0 0.75rem 0;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .group-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .group-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .group-checkbox:hover {
    background: #f3f4f6;
  }

  .permission-summary {
    margin-top: 1rem;
    padding: 1rem;
    background: #eff6ff;
    border-radius: 6px;
    border-left: 3px solid #2563eb;
  }

  .summary-item {
    display: inline-block;
    margin-right: 1rem;
    font-size: 0.875rem;
    color: #1f2937;
  }

  .warning {
    color: #d97706;
    font-size: 0.875rem;
  }
</style>
```

### Usage in Blog Editor

```svelte
<!-- src/routes/blog/+page.svelte -->
<script>
  import PostPermissions from '$lib/components/PostPermissions.svelte';
  import { onMount } from 'svelte';

  let editingPost = {
    title: '',
    content: '',
    visibility: 'public',
    readGroupIds: [],
    writeGroupIds: []
  };

  let userGroups = [];

  onMount(async () => {
    // Load user's groups
    const response = await fetch('/api/groups/my-groups');
    const data = await response.json();
    if (data.success) {
      userGroups = data.groups;
    }
  });

  async function savePost() {
    const response = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingPost)
    });

    const result = await response.json();
    if (result.success) {
      alert('Post saved!');
    }
  }
</script>

<form on:submit|preventDefault={savePost}>
  <input type="text" bind:value={editingPost.title} placeholder="Title" />

  <textarea bind:value={editingPost.content} placeholder="Content"></textarea>

  <!-- Permissions Component -->
  <PostPermissions
    bind:visibility={editingPost.visibility}
    bind:readGroupIds={editingPost.readGroupIds}
    bind:writeGroupIds={editingPost.writeGroupIds}
    availableGroups={userGroups}
  />

  <button type="submit">Save Post</button>
</form>
```

## Security Checklist

- ✅ **All queries filter by user permissions**
- ✅ **Server-side permission checks** (never trust client)
- ✅ **Admin override for all operations**
- ✅ **Author always has full control** of their posts
- ✅ **Write groups auto-get read access**
- ✅ **Cascade delete** (removing group/user removes permissions)
- ✅ **Published flag** still applies (unpublished = hidden)

## Testing Scenarios

### Scenario 1: Leadership Post
```
Post: "Q1 Strategy"
Visibility: groups
Read Groups: [Leadership, Engineering]
Write Groups: [Leadership]

User A (Leadership member):
  ✅ Can read
  ✅ Can write
  ❌ Cannot delete (not author)

User B (Engineering member):
  ✅ Can read
  ❌ Cannot write
  ❌ Cannot delete

User C (Sales member):
  ❌ Cannot read
  ❌ Cannot write
  ❌ Cannot delete
```

### Scenario 2: Public Documentation
```
Post: "API Docs"
Visibility: public
Read Groups: []
Write Groups: [Engineering]

User A (Engineering member):
  ✅ Can read
  ✅ Can write
  ❌ Cannot delete (not author)

User B (Any other user):
  ✅ Can read
  ❌ Cannot write
  ❌ Cannot delete

Anonymous visitor:
  ✅ Can read
  ❌ Cannot write
  ❌ Cannot delete
```

### Scenario 3: Private Draft
```
Post: "My Notes"
Visibility: private
Author: User A

User A (Author):
  ✅ Can read
  ✅ Can write
  ✅ Can delete

User B (Admin):
  ✅ Can read
  ✅ Can write
  ✅ Can delete

User C (Any other user):
  ❌ Cannot read
  ❌ Cannot write
  ❌ Cannot delete
```

## Migration Steps

1. **Run migration**:
   ```bash
   psql $DATABASE_URL -f migrations/add-group-permissions.sql
   ```

2. **Verify tables created**:
   ```bash
   psql $DATABASE_URL -c "\dt post_*"
   ```

3. **Check existing posts**:
   ```bash
   psql $DATABASE_URL -c "SELECT id, title, visibility FROM posts LIMIT 5;"
   ```

4. **All existing posts** will be set to `visibility='public'`

5. **Test with a sample post**:
   ```sql
   -- Create test post
   INSERT INTO posts (title, content, slug, author_id, visibility, published)
   VALUES ('Test Post', 'Content', 'test-post', 1, 'groups', true)
   RETURNING id;

   -- Add permissions (assuming group IDs 1 and 2 exist)
   INSERT INTO post_read_groups (post_id, group_id) VALUES (1, 1), (1, 2);
   INSERT INTO post_write_groups (post_id, group_id) VALUES (1, 1);
   ```

## Performance Considerations

- **Indexes created** on all foreign keys
- **LEFT JOIN** used for optional group checks
- **EXISTS** subqueries for better performance
- **DISTINCT** prevents duplicate rows

## Future Enhancements

Possible additions:
- [ ] Path-level permissions (inherited by posts)
- [ ] Per-user permissions (not just groups)
- [ ] Permission templates
- [ ] Audit log (who accessed what)
- [ ] Share links (temporary public access)
- [ ] Notification when added to post

---

## Quick Reference

**Check permission:**
```javascript
await canReadPost(postId, userId)
await canWritePost(postId, userId, userRole)
```

**Set permissions:**
```javascript
await setPostPermissions(postId, [1, 2], [1])  // read groups, write groups
```

**Get posts:**
```javascript
await getUserReadablePosts(userId)
await getUserEditablePosts(userId, userRole)
```
