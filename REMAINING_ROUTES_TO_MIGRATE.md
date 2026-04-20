# Remaining Routes to Migrate (Phase 2.6)

## Summary
- ✅ Completed: 2 routes (register, login)
- ⏳ Remaining: 6 routes
- Total: 8 routes

---

## Route: 3/8 - Blog: List Posts
**File:** `src/routes/blog/+page.server.js`
**Purpose:** Display all published blog posts
**Status:** ⏳ NOT YET MIGRATED

### Current Issues
- Likely uses old SQLite `db.prepare()`
- Needs conversion to `blogDB.getAllPosts()`

### Migration Steps
1. Replace `import { db }` with `import { blogDB }`
2. Replace `db.prepare('SELECT ...').all()` with `await blogDB.getAllPosts()`
3. Add `async` to load function
4. Test on `/blog` route

### What to Check After
```javascript
// After migration, should look like:
export async function load() {
  const posts = await blogDB.getAllPosts();
  return { posts };
}
```

---

## Route: 4/8 - Blog: View Single Post
**File:** `src/routes/blog/[slug]/+page.server.js`
**Purpose:** Display a single blog post by slug
**Status:** ⏳ NOT YET MIGRATED

### Current Issues
- Uses old SQLite pattern
- Needs conversion to `blogDB.getPostBySlug()`

### Migration Steps
1. Replace `import { db }` with `import { blogDB }`
2. Find where post is loaded by slug
3. Replace with `await blogDB.getPostBySlug(slug)`
4. Add `async` to load function
5. Test on `/blog/some-slug` route

### What to Check After
```javascript
// After migration:
export async function load({ params }) {
  const post = await blogDB.getPostBySlug(params.slug);
  if (!post) throw error(404, 'Post not found');
  return { post };
}
```

---

## Route: 5/8 - Profile
**File:** `src/routes/profile/+page.server.js`
**Purpose:** User profile, password change, account deletion
**Status:** ⏳ NOT YET MIGRATED

### Current Issues
- Uses old SQLite pattern
- Needs `userDB` methods for password change and deletion
- Needs `blogDB` for user's posts

### Migration Steps
1. Replace `import { db }` with `import { userDB, blogDB }`
2. Replace user lookup with `await userDB.getUserById()`
3. Replace password change with `await userDB.changePassword()`
4. Replace account deletion with `await userDB.completeAccountDeletion()`
5. Replace posts lookup with `await blogDB.getPostsByUser()`
6. Add `async` to all functions that need it
7. Test on `/profile` route (while logged in)

### Methods Needed
- `userDB.getUserById(id)` - get profile
- `userDB.changePassword(userId, oldPwd, newPwd)` - change password
- `userDB.completeAccountDeletion(userId, reason)` - delete account
- `blogDB.getPostsByUser(userId)` - get user's posts

### What to Check After
```javascript
export async function load({ locals }) {
  const user = await userDB.getUserById(locals.user.id);
  const posts = await blogDB.getPostsByUser(locals.user.id);
  return { user, posts };
}

export const actions = {
  changePassword: async ({ request, locals }) => {
    const data = await request.formData();
    await userDB.changePassword(
      locals.user.id,
      data.get('old_password'),
      data.get('new_password')
    );
    return { success: true };
  },
  
  deleteAccount: async ({ request, locals }) => {
    await userDB.completeAccountDeletion(locals.user.id, 'User requested');
    throw redirect(303, '/');
  }
};
```

---

## Route: 6/8 - Admin: Dashboard
**File:** `src/routes/admin/+page.server.js`
**Purpose:** Admin dashboard with statistics
**Status:** ⏳ NOT YET MIGRATED

### Current Issues
- Uses old SQLite pattern for stats
- Needs `userDB`, `blogDB`, `pathsDB` for different stats

### Migration Steps
1. Replace imports with async methods
2. Replace stat queries with:
   - `await userDB.getAllContentReports()` - for reports count
   - `await blogDB.getStats()` - for post/user stats
   - `await pathsDB.getPathStatistics()` - for path stats
3. Add `async` to load function
4. Test on `/admin` route (as admin only)

### Methods Needed
- `blogDB.getStats()` - gets published_posts, total_posts, total_users, etc.
- `userDB.getAllContentReports()` - get reports for pending count
- `pathsDB.getPathStatistics()` - get path stats

### What to Check After
```javascript
export async function load({ locals }) {
  // Check admin
  if (locals.user?.role !== 'admin') {
    throw error(403, 'Admin access required');
  }

  const stats = await blogDB.getStats();
  const reports = await userDB.getAllContentReports();
  const pathStats = await pathsDB.getPathStatistics();
  
  return { stats, reports, pathStats };
}
```

---

## Route: 7/8 - Admin: Blog Posts Management
**File:** `src/routes/admin/posts/+page.server.js` (or similar)
**Purpose:** Admin post management (CRUD)
**Status:** ⏳ NOT YET MIGRATED

### Current Issues
- Uses old SQLite pattern
- Needs all `blogDB` CRUD methods

### Migration Steps
1. Replace imports with `blogDB`
2. List posts: `await blogDB.getAllPosts()`
3. Create: `await blogDB.createPost(data, adminId)`
4. Update: `await blogDB.updatePost(id, data, adminId)`
5. Delete: `await blogDB.deletePost(id, adminId)`
6. Update tags: `await blogDB.updatePostTags(postId, tagNames)`
7. Add `async` to all functions
8. Test CRUD operations

### Methods Needed
- `blogDB.getAllPosts()` - list all posts
- `blogDB.createPost(postData, authorId)` - create post
- `blogDB.updatePost(id, postData, authorId)` - update post
- `blogDB.deletePost(id, authorId)` - delete post
- `blogDB.updatePostTags(postId, tagNames)` - update tags

### What to Check After
```javascript
export async function load() {
  const posts = await blogDB.getAllPosts();
  return { posts };
}

export const actions = {
  create: async ({ request, locals }) => {
    const data = await request.formData();
    return await blogDB.createPost({
      title: data.get('title'),
      content: data.get('content'),
      category: data.get('category')
    }, locals.user.id);
  },
  
  update: async ({ request, locals }) => {
    const data = await request.formData();
    return await blogDB.updatePost(
      data.get('id'),
      { /* ... */ },
      locals.user.id
    );
  },
  
  delete: async ({ request, locals }) => {
    const data = await request.formData();
    return await blogDB.deletePost(data.get('id'), locals.user.id);
  }
};
```

---

## Route: 8/8 - Admin: Content Reports
**File:** `src/routes/admin/reports/+page.server.js` (or similar)
**Purpose:** Admin moderation of content reports
**Status:** ⏳ NOT YET MIGRATED

### Current Issues
- Uses old SQLite pattern
- Needs `userDB` report management methods

### Migration Steps
1. Replace imports with `userDB`
2. List reports: `await userDB.getAllContentReports()`
3. Get single: `await userDB.getContentReportById(id)`
4. Update status: `await userDB.updateContentReportStatus(id, status, response, resolvedBy)`
5. Add `async` to all functions
6. Test on `/admin/reports` route (as admin only)

### Methods Needed
- `userDB.getAllContentReports()` - list all reports
- `userDB.getContentReportById(id)` - get specific report
- `userDB.updateContentReportStatus(reportId, status, adminResponse, resolvedBy)` - update status

### What to Check After
```javascript
export async function load() {
  const reports = await userDB.getAllContentReports();
  return { reports };
}

export const actions = {
  updateStatus: async ({ request, locals }) => {
    const data = await request.formData();
    return await userDB.updateContentReportStatus(
      data.get('report_id'),
      data.get('status'),
      data.get('response'),
      locals.user.id
    );
  }
};
```

---

## Quick Migration Checklist

For each remaining route:

```
Route: [name]
File: [path]

Pre-migration:
- [ ] Read current code
- [ ] Identify all database calls
- [ ] Find which database object they use (userDB, blogDB, pathsDB)

Migration:
- [ ] Add/update imports
- [ ] Change all db.prepare() to await dbObject.method()
- [ ] Add async keyword to functions
- [ ] Add await to all database calls
- [ ] Update error handling if needed

Testing:
- [ ] Function loads without errors
- [ ] Data displays correctly
- [ ] Create/update/delete operations work
- [ ] Error cases handled properly
- [ ] No console errors
- [ ] Authentication checks working

Documentation:
- [ ] Note any issues found
- [ ] Document changes made
```

---

## Priority Order for Migration

**Priority 1 (Critical - User-facing):**
1. Blog: List Posts
2. Blog: View Single Post
3. Profile

**Priority 2 (Important - Admin-facing):**
4. Admin: Dashboard
5. Admin: Blog Posts
6. Admin: Reports

---

## Pattern to Follow for All Routes

```javascript
// ❌ OLD (SQLite)
import { db } from '$lib/db.js';

export function load() {
  const data = db.prepare('SELECT ...').all();
  return { data };
}

export const actions = {
  default: async ({ request }) => {
    const result = db.prepare('INSERT ...').run(...);
    return { success: true };
  }
};

// ✅ NEW (PostgreSQL)
import { userDB, blogDB, pathsDB } from '$lib/db.js';

export async function load() {
  const data = await blogDB.getAllPosts();
  return { data };
}

export const actions = {
  default: async ({ request, locals }) => {
    try {
      const result = await blogDB.createPost(postData, locals.user.id);
      return { success: true };
    } catch (error) {
      return fail(500, { error: error.message });
    }
  }
};
```

---

## Testing Commands

After each route migration, verify:

```bash
# 1. Check syntax
npm run check

# 2. Build
npm run build

# 3. Start dev server
npm run dev

# 4. Check browser console for errors
# Open DevTools (F12) while testing the route

# 5. Check server console for errors
# Look for ❌ or 💥 messages

# 6. Verify database operations
docker exec -it postgres-pgvector psql -U supportuser -d support_system
# Then check tables were modified as expected
```

---

## Help if Stuck

If a route isn't working after migration:

1. **Check the error message** - copy full error text
2. **Verify it's async** - all functions with database calls need `async`
3. **Verify await** - all `.query()` calls need `await`
4. **Check imports** - make sure `userDB`, `blogDB`, `pathsDB` imported
5. **Check method name** - ensure method exists in db.js
6. **Check parameters** - ensure parameters match expected types

Good luck with the remaining migrations! You've got this! 🚀
