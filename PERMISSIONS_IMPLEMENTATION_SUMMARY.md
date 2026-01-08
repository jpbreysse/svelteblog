# Group Permissions Implementation - Complete

## Overview
The group-based permissions system is now fully implemented. Posts can have different read/write permissions for different groups.

## What's Been Implemented

### 1. Database Schema
- **Migration file**: `migrations/add-group-permissions.sql`
- Added `visibility` column to posts table (public/groups/private)
- Created `post_read_groups` junction table
- Created `post_write_groups` junction table

### 2. Backend Permissions System
- **File**: `src/lib/server/permissions.js`
- Functions:
  - `canReadPost(postId, userId)` - Check if user can read a post
  - `canWritePost(postId, userId, userRole)` - Check if user can edit a post
  - `setPostPermissions(postId, readGroupIds, writeGroupIds)` - Set permissions
  - `getPostPermissions(postId)` - Get current permissions
  - `getUserGroups(userId)` - Get all groups a user belongs to

### 3. API Endpoints

#### Created:
- `GET /api/groups/my-groups` - Get current user's groups
- `GET /api/posts/[id]/permissions` - Get permissions for a post

#### Updated:
- `POST /api/posts` - Now saves visibility and permissions when creating posts
- `PUT /api/posts/[id]` - Now updates visibility and permissions when editing posts

### 4. Database Methods Updated
- **File**: `src/lib/db.js`
- `createPost()` - Now handles `visibility` field
- `updatePost()` - Now handles `visibility` field

### 5. UI Component
- **File**: `src/lib/components/PostPermissions.svelte`
- Radio buttons for visibility (Public/Groups/Private)
- Checkboxes for selecting read groups
- Checkboxes for selecting write groups
- Summary display showing selected permissions

### 6. Blog Editor Integration
- **File**: `src/routes/blog/+page.svelte`
- Imports PostPermissions component
- Loads user's groups on mount
- Sends permissions when creating/editing posts
- Loads existing permissions when editing a post

## How It Works

### Creating a Post with Permissions
1. User selects visibility (Public/Groups/Private)
2. If "Groups" is selected, user picks read and write groups
3. On save:
   - Post is created with visibility field
   - If visibility is 'groups', permissions are saved to junction tables
   - Write groups automatically get read access

### Editing a Post
1. When opening editor, permissions are loaded from database
2. Checkboxes show currently selected groups
3. On save:
   - Post visibility is updated
   - Permissions are updated (or cleared if not 'groups')

### Permission Checking
- **Public posts**: Everyone can read
- **Private posts**: Only author can read
- **Groups posts**: Only members of specified groups can read
- **Write permissions**: Author, admins, or members of write groups

## Next Steps

### 1. Run the Migration
**IMPORTANT**: You must run the migration to add the database tables:

```bash
# Start PostgreSQL if not running
# Then run:
psql -U postgres -d sevlte -f migrations/add-group-permissions.sql
```

### 2. Add Test User to a Group
Currently test3 user has no groups. Add them to a group:

```sql
-- View existing groups
SELECT * FROM groups;

-- Add test3 (user id: 5) to a group
INSERT INTO user_groups (user_id, group_id) VALUES (5, 1);

-- Or create a new group first
INSERT INTO groups (name, description)
VALUES ('Engineering', 'Engineering team members')
RETURNING id;

-- Then add user to it
INSERT INTO user_groups (user_id, group_id)
VALUES (5, <group_id_from_above>);
```

### 3. Test the Complete Flow

1. **Login as test user** (or user with groups)
2. **Create a new post**:
   - Select "Groups Only" visibility
   - You should see checkboxes for your groups
   - Select some read groups and write groups
   - Save the post
3. **Edit the post**:
   - Click edit on the post
   - The permissions should be pre-selected
   - Change the permissions
   - Save
4. **Test visibility**:
   - Login as different users
   - Verify only users in the selected groups can see the post

### 4. Future Enhancements

- **Filter posts in explorer**: Update the posts list to respect read permissions
- **Permission indicators**: Show lock icons on posts with restricted access
- **Bulk permission updates**: Allow changing permissions on multiple posts
- **Group management UI**: Allow creating/editing groups from the UI
- **Audit log**: Track permission changes

## Files Modified

### Created:
1. `migrations/add-group-permissions.sql`
2. `src/lib/server/permissions.js`
3. `src/lib/components/PostPermissions.svelte`
4. `src/routes/api/groups/my-groups/+server.js`
5. `src/routes/api/posts/[id]/permissions/+server.js`
6. `docs/integrate-permissions-ui.md`

### Modified:
1. `src/lib/db.js` - Added visibility field handling
2. `src/routes/api/posts/+server.js` - Added permission saving on create
3. `src/routes/api/posts/[id]/+server.js` - Added permission updating on edit
4. `src/routes/blog/+page.svelte` - Integrated permissions UI

## Troubleshooting

### "No groups available" message
- User is not a member of any groups
- Add user to groups using SQL above

### Permissions not saving
- Check browser console for errors
- Verify migration has been run
- Check server logs for database errors

### Checkboxes not appearing
- Verify groups are loading: Check console for "Loaded user groups"
- Verify "Groups Only" is selected
- Check that availableGroups array is not empty

### Permissions not showing when editing
- Verify the `/api/posts/[id]/permissions` endpoint is working
- Check browser console for fetch errors
- Verify post has permissions in database:
  ```sql
  SELECT * FROM post_read_groups WHERE post_id = <id>;
  SELECT * FROM post_write_groups WHERE post_id = <id>;
  ```

## Database Schema Reference

```sql
-- Posts table (visibility column added)
ALTER TABLE posts
ADD COLUMN visibility VARCHAR(50) DEFAULT 'public'
  CHECK(visibility IN ('public', 'groups', 'private'));

-- Read permissions
CREATE TABLE post_read_groups (
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, group_id)
);

-- Write permissions
CREATE TABLE post_write_groups (
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, group_id)
);
```
