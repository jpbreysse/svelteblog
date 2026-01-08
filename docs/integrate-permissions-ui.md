# Integration Guide: Add Permissions UI to Blog Editor

## Step 1: Import the Component

At the top of `src/routes/blog/+page.svelte`, add the import:

```javascript
// Add this line after line 7 (after ReportModal import)
import PostPermissions from '$lib/components/PostPermissions.svelte';
```

## Step 2: Add State Variables

In the `<script>` section, add these variables after line 36:

```javascript
// Add after: let editorContainer;
let userGroups = [];  // Store user's groups for permissions
```

## Step 3: Update editingPost Initialization

Find the `createNewPost()` function (around line 340) and update it:

```javascript
function createNewPost() {
  if (!data.user) {
    alert('You must be logged in to write posts');
    goto('/login');
    return;
  }

  closingEditor = false;

  editingPost = {
    id: null,
    title: '',
    content: '',
    category: defaultCategory,
    tags: [],
    path_id: paths.length > 0 ? paths[0].id : null,
    // ADD THESE THREE LINES:
    visibility: 'public',
    readGroupIds: [],
    writeGroupIds: []
  };
  showEditor = true;
  setTimeout(initEditor, 100);
}
```

## Step 4: Update onMount to Load Groups

Find the `onMount` function (around line 62) and add this at the end, before the closing `});`:

```javascript
onMount(async () => {
  // ... existing code ...

  // ADD THIS BLOCK:
  // Load user's groups for permissions
  if (data.user) {
    try {
      const groupsResponse = await fetch('/api/groups/my-groups');
      const groupsData = await groupsResponse.json();
      if (groupsData.success) {
        userGroups = groupsData.groups || [];
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  }
});
```

## Step 5: Update savePost Function

Find the `savePost()` function (around line 163) and update the `postData` object:

```javascript
const postData = {
  title: editingPost.title,
  content: editingPost.content,
  category: editingPost.category,
  tags: editingPost.tags || [],
  path_id: editingPost.path_id || null,
  // ADD THESE THREE LINES:
  visibility: editingPost.visibility || 'public',
  readGroupIds: editingPost.readGroupIds || [],
  writeGroupIds: editingPost.writeGroupIds || []
};
```

## Step 6: Update editPost Function

Find the `editPost()` function (around line 352) and update it to load existing permissions:

```javascript
function editPost(post) {
  if (!data.user) {
    alert('You must be logged in to edit posts');
    goto('/login');
    return;
  }

  if (post.author_id !== data.user.id && data.user.role !== 'admin') {
    alert('You can only edit your own posts');
    return;
  }

  closingEditor = false;

  editingPost = {
    ...post,
    tags: post.tags || [],
    // ADD THESE THREE LINES:
    visibility: post.visibility || 'public',
    readGroupIds: post.readGroupIds || [],
    writeGroupIds: post.writeGroupIds || []
  };
  showEditor = true;
  setTimeout(initEditor, 100);
}
```

## Step 7: Add Component to Editor UI

Find the editor section in the template (around line 526) and add the component after the path selector:

```svelte
<!-- Around line 526, after the path selector -->
<div class="input-group">
  <select bind:value={editingPost.path_id} class="path-select" disabled={loading}>
    <option value={null}>📂 No folder (root level)</option>
    {#each paths as path}
      <option value={path.id}>
        📁 {path.full_path || path.name}
      </option>
    {/each}
  </select>
  <div class="path-label">Folder</div>
</div>

<!-- ADD THIS COMPONENT HERE: -->
<PostPermissions
  bind:visibility={editingPost.visibility}
  bind:readGroupIds={editingPost.readGroupIds}
  bind:writeGroupIds={editingPost.writeGroupIds}
  availableGroups={userGroups}
/>
```

## Step 8: Create API Endpoint for User Groups

Create a new file: `src/routes/api/groups/my-groups/+server.js`

```javascript
import { json } from '@sveltejs/kit';
import { getUserGroups } from '$lib/server/permissions.js';

export async function GET({ locals }) {
  if (!locals.user) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const groups = await getUserGroups(locals.user.id);

    return json({
      success: true,
      groups
    });
  } catch (error) {
    console.error('Error fetching user groups:', error);
    return json({
      success: false,
      error: 'Failed to fetch groups'
    }, { status: 500 });
  }
}
```

## Step 9: Update Posts API to Handle Permissions

Update `src/routes/api/posts/+server.js` to save permissions:

```javascript
// Add import at the top
import { setPostPermissions } from '$lib/server/permissions.js';

// In the POST handler, after creating the post:
export async function POST({ request, locals }) {
  // ... existing code to create post ...

  const post = await blogDB.createPost({
    title: data.title,
    content: data.content,
    visibility: data.visibility || 'public',  // ADD THIS
    // ... other fields
  }, locals.user.id);

  // ADD THIS BLOCK:
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

## Step 10: Test It!

1. **Restart your dev server**
2. **Go to blog editor** (`/blog` and click "Write New Post")
3. **You should now see the Permissions section** with:
   - Radio buttons for Public/Groups/Private
   - If you select "Groups", checkboxes for read/write groups

## Troubleshooting

### "No groups available"
- You need to create groups first
- Add yourself to at least one group
- Check the database: `SELECT * FROM groups;`

### Component doesn't appear
- Make sure you imported it: `import PostPermissions from '$lib/components/PostPermissions.svelte';`
- Check browser console for errors
- Verify the component file exists at `src/lib/components/PostPermissions.svelte`

### Groups not loading
- Check the API endpoint works: Visit `/api/groups/my-groups` in browser
- Check browser console for fetch errors
- Verify you're logged in

## Quick Test

To create a test group and add yourself:

```sql
-- Create a test group
INSERT INTO groups (name, description)
VALUES ('Engineering', 'Engineering team members');

-- Add yourself to the group (replace user ID)
INSERT INTO user_groups (user_id, group_id)
SELECT 1, id FROM groups WHERE name = 'Engineering';

-- Verify
SELECT u.display_name, g.name
FROM users u
JOIN user_groups ug ON u.id = ug.user_id
JOIN groups g ON ug.group_id = g.id;
```

Then refresh your blog editor page!
