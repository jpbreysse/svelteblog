# Route Migration Documentation: SQLite → PostgreSQL Async

## 📋 Overview

**Problem:** Routes are using old SQLite synchronous code, but database layer is now PostgreSQL async.

**Solution:** Update all routes to use async database methods from `userDB`, `blogDB`, and `pathsDB`.

---

## 🔄 The Conversion Pattern

### Before (SQLite - Synchronous)
```javascript
import { db } from '$lib/db.js';

export async function load() {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const posts = db.prepare('SELECT * FROM posts WHERE author_id = ?').all(userId);
  
  return { user, posts };
}

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
    return { success: true, userId: result.lastInsertRowid };
  }
};
```

### After (PostgreSQL - Asynchronous)
```javascript
import { userDB, blogDB } from '$lib/db.js';

export async function load() {
  const user = await userDB.getUserById(userId);
  const posts = await blogDB.getPostsByUser(userId);
  
  return { user, posts };
}

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const result = await userDB.createContentReport({
      issue_type: 'spam',
      description: data.get('description'),
      // ...
    });
    return { success: true, reportId: result.reportId };
  }
};
```

---

## 🔑 Key Changes Summary

| Aspect | SQLite (OLD) | PostgreSQL (NEW) |
|--------|------------|-----------------|
| **Import** | `import { db }` | `import { userDB, blogDB, pathsDB }` |
| **Syntax** | `db.prepare(...).get()` | `await userDB.getXxx()` |
| **Return Value** | Direct object or undefined | Promise resolving to object or null |
| **Arrays** | `db.prepare(...).all()` | `await userDB.getXxx()` |
| **Insert** | `db.prepare(...).run()` returns `lastInsertRowid` | `await userDB.createXxx()` returns object with ID |
| **Update** | `db.prepare(...).run()` | `await userDB.updateXxx()` |
| **Delete** | `db.prepare(...).run()` | `await userDB.deleteXxx()` |
| **Null Check** | `if (!user)` | `if (!user)` (same) |
| **Errors** | Thrown by db.prepare | Thrown by async method |

---

## 📚 Available Database Methods

### userDB Methods
```javascript
await userDB.getUserById(id)                    // Get user by ID
await userDB.verifyPassword(userId, password)  // Check password
await userDB.changePassword(userId, old, new)  // Change password
await userDB.completeAccountDeletion(userId)   // Delete account + posts
await userDB.getPendingDeletions()             // Get users pending deletion
await userDB.createContentReport(data)         // Create report
await userDB.getAllContentReports()            // Get all reports
await userDB.getContentReportById(id)          // Get report by ID
await userDB.updateContentReportStatus(...)    // Update report status
await userDB.resetUserPassword(adminId, userId, newPass)  // Admin reset
```

### blogDB Methods
```javascript
await blogDB.getAllPosts()                      // All posts
await blogDB.getPostsByUser(userId)            // User's posts
await blogDB.getPostById(id)                   // Single post
await blogDB.getPostBySlug(slug)               // Post by slug
await blogDB.createPost(data, authorId)        // Create post
await blogDB.updatePost(id, data, authorId)    // Update post
await blogDB.deletePost(id, authorId)          // Delete post
await blogDB.updatePostTags(postId, tags)      // Update tags
await blogDB.searchPosts(query, category)      // Search posts
await blogDB.getPostsByCategory(category)      // Category posts
await blogDB.getCategories()                   // All categories
await blogDB.getTags()                         // All tags
await blogDB.getStats()                        // Database stats
```

### pathsDB Methods
```javascript
await pathsDB.getAllPaths()                    // All paths
await pathsDB.getPathById(id)                  // Single path
await pathsDB.getPathByFullPath(fullPath)      // Path by full path
await pathsDB.createPath(data, userId)         // Create path
await pathsDB.updatePath(id, data)             // Update path
await pathsDB.deletePath(id)                   // Delete path
await pathsDB.getPathChildren(parentId)        // Direct children
await pathsDB.getPathHierarchy()               // Full tree
await pathsDB.getParentPath(id)                // Parent path
await pathsDB.getPathDescendants(id)           // All descendants
await pathsDB.getPathStatistics()              // Path stats
await pathsDB.getPathsWithPostCount()          // Paths with posts
```

---

## 🔀 Conversion Patterns by Operation

### Pattern 1: Simple SELECT (Get by ID)

**OLD (SQLite):**
```javascript
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
if (!user) {
  return fail(404, { error: 'User not found' });
}
```

**NEW (PostgreSQL):**
```javascript
const user = await userDB.getUserById(userId);
if (!user) {
  return fail(404, { error: 'User not found' });
}
```

**Key point:** Just add `await`, use method name instead of SQL

---

### Pattern 2: Multiple Records (Get All)

**OLD (SQLite):**
```javascript
const posts = db.prepare('SELECT * FROM posts WHERE published = true').all();
return { posts };
```

**NEW (PostgreSQL):**
```javascript
const posts = await blogDB.getAllPosts();
return { posts };
```

**Key point:** Method handles filtering, returns array directly

---

### Pattern 3: INSERT with Return Value

**OLD (SQLite):**
```javascript
const result = db.prepare(
  'INSERT INTO users (email, display_name, password_hash) VALUES (?, ?, ?)'
).run(email, name, hash);

const userId = result.lastInsertRowid;
```

**NEW (PostgreSQL):**
```javascript
const result = await userDB.createContentReport({
  issue_type: 'spam',
  description: 'Inappropriate content',
  reporter_email: 'user@example.com',
  post_id: postId,
  post_title: 'Title',
  post_url: 'http://...',
  reporter_ip: ip,
  user_agent: ua
});

const reportId = result.reportId;
```

**Key point:** Pass object instead of individual parameters, method returns object with ID

---

### Pattern 4: UPDATE

**OLD (SQLite):**
```javascript
const result = db.prepare(
  'UPDATE users SET display_name = ? WHERE id = ?'
).run(newName, userId);

if (result.changes === 0) {
  throw new Error('Failed to update');
}
```

**NEW (PostgreSQL):**
```javascript
const result = await userDB.updatePost(postId, {
  title: newTitle,
  content: newContent,
  category: 'thoughts'
}, authorId);

if (!result.success) {
  throw new Error('Failed to update');
}
```

**Key point:** Pass object with fields to update, checks success in result

---

### Pattern 5: DELETE

**OLD (SQLite):**
```javascript
const result = db.prepare('DELETE FROM posts WHERE id = ? AND author_id = ?')
  .run(postId, userId);

if (result.changes === 0) {
  throw new Error('Not found');
}
```

**NEW (PostgreSQL):**
```javascript
const result = await blogDB.deletePost(postId, userId);

if (!result.success) {
  throw new Error('Not found');
}
```

**Key point:** Pass ID and authorization check, method handles deletion

---

### Pattern 6: Search/Filter

**OLD (SQLite):**
```javascript
const results = db.prepare(
  'SELECT * FROM posts WHERE title LIKE ? AND category = ?'
).all(`%${query}%`, category);
```

**NEW (PostgreSQL):**
```javascript
const results = await blogDB.searchPosts(query, category);
```

**Key point:** Methods handle the WHERE clause, just pass parameters

---

### Pattern 7: Transactions/Complex Operations

**OLD (SQLite):**
```javascript
const transaction = db.transaction(() => {
  db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(postId);
  db.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)').run(postId, tagId);
});
transaction();
```

**NEW (PostgreSQL):**
```javascript
await blogDB.updatePostTags(postId, ['tag1', 'tag2', 'tag3']);
// Method handles transaction internally
```

**Key point:** Method abstracts transaction logic, just call it

---

## ⚠️ Error Handling

### Pattern: Try-Catch

**OLD (SQLite):**
```javascript
try {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) throw new Error('User not found');
  // ...
} catch (error) {
  console.error('Database error:', error);
  return fail(500, { error: error.message });
}
```

**NEW (PostgreSQL):**
```javascript
try {
  const user = await userDB.getUserById(userId);
  if (!user) throw new Error('User not found');
  // ...
} catch (error) {
  console.error('Database error:', error);
  return fail(500, { error: error.message });
}
```

**Key point:** Same error handling, just add `await`

---

## 🔍 Return Value Differences

### userDB Methods Return

```javascript
// Single object or null
const user = await userDB.getUserById(id);
// Returns: { id, email, display_name, role, status, created_at } or null

// Array of objects
const reports = await userDB.getAllContentReports();
// Returns: [{ id, issue_type, status, ... }, ...]

// Success object
const result = await userDB.changePassword(userId, old, new);
// Returns: { success: true, message: '...' }

// With ID
const report = await userDB.createContentReport(data);
// Returns: { success: true, reportId: 123 }
```

### blogDB Methods Return

```javascript
// Array of posts
const posts = await blogDB.getAllPosts();
// Returns: [{ id, title, content, author_name, tags, ... }, ...]

// Single post with tags
const post = await blogDB.getPostById(id);
// Returns: { id, title, content, tags: ['tag1', 'tag2'], ... } or null

// Created post
const result = await blogDB.createPost(data, authorId);
// Returns: { success: true, post: { id, title, slug, created_at } }

// Search results
const posts = await blogDB.searchPosts('query', 'category');
// Returns: [{ id, title, excerpt, category, tags, ... }, ...]
```

### pathsDB Methods Return

```javascript
// All paths with counts
const paths = await pathsDB.getAllPaths();
// Returns: [{ id, name, full_path, children_count, post_count, ... }, ...]

// Path with stats
const path = await pathsDB.getPathById(id);
// Returns: { id, name, full_path, level, children_count, post_count, ... } or null

// Created path
const result = await pathsDB.createPath(data, userId);
// Returns: { success: true, path: { id, name, slug, full_path, created_at } }

// Hierarchy tree
const tree = await pathsDB.getPathHierarchy();
// Returns: [{ id, name, full_path, path_ids, level, ... }, ...]
```

---

## 📝 Common Migrations by Route

### Route: `/register` (Register new user)

**What to change:**
- ✅ Use `userDB` for user operations
- ✅ Add `await` to all database calls
- ✅ Use database methods instead of SQL

**Database operations:**
- Check if user exists: `await userDB.getUserById()` - NOT AVAILABLE (need custom query or check)
- Create user: Need to implement in userDB or use pool.query directly
- Check password hash: Uses bcrypt (no database call)

**Note:** We may need to add `getUserByEmail()` method to userDB

---

### Route: `/login` (User login)

**What to change:**
- ✅ Use `userDB` for user operations
- ✅ Add `await` to all database calls

**Database operations:**
- Get user by email: Need `await userDB.getUserByEmail(email)`
- Verify password: `await userDB.verifyPassword(userId, password)`

**Note:** Need to add `getUserByEmail()` method to userDB

---

### Route: `/blog` (Blog list)

**What to change:**
- ✅ Use `blogDB` for post operations
- ✅ Add `await` to all database calls

**Database operations:**
- Get all posts: `await blogDB.getAllPosts()`
- Get stats: `await blogDB.getStats()`

---

### Route: `/blog/[slug]` (Single post)

**What to change:**
- ✅ Use `blogDB` for post operations
- ✅ Add `await` to all database calls

**Database operations:**
- Get post by slug: `await blogDB.getPostBySlug(slug)`
- Report issue: `await userDB.createContentReport(data)`

---

### Route: `/profile` (User profile)

**What to change:**
- ✅ Use `userDB` for user operations
- ✅ Use `blogDB` for user's posts
- ✅ Add `await` to all database calls

**Database operations:**
- Get user: `await userDB.getUserById(userId)`
- Get user's posts: `await blogDB.getPostsByUser(userId)`
- Update password: `await userDB.changePassword(userId, old, new)`
- Delete account: `await userDB.completeAccountDeletion(userId, reason)`

---

### Route: `/admin` (Admin dashboard)

**What to change:**
- ✅ Use all three databases
- ✅ Add `await` to all database calls

**Database operations:**
- Get stats: `await blogDB.getStats()`, `await pathsDB.getPathStatistics()`
- Get pending reports: `await userDB.getAllContentReports()`
- Get pending deletions: `await userDB.getPendingDeletions()`

---

### Route: `/admin/posts` (Admin posts)

**What to change:**
- ✅ Use `blogDB` for post operations
- ✅ Add `await` to all database calls

**Database operations:**
- Get all posts: `await blogDB.getAllPosts()`
- Create post: `await blogDB.createPost(data, authorId)`
- Update post: `await blogDB.updatePost(postId, data, authorId)`
- Delete post: `await blogDB.deletePost(postId, authorId)`
- Update tags: `await blogDB.updatePostTags(postId, tags)`

---

### Route: `/admin/reports` (Admin reports)

**What to change:**
- ✅ Use `userDB` for report operations
- ✅ Add `await` to all database calls

**Database operations:**
- Get all reports: `await userDB.getAllContentReports()`
- Get report by ID: `await userDB.getContentReportById(id)`
- Update status: `await userDB.updateContentReportStatus(reportId, status, response, resolvedBy)`

---

## 🔴 Missing Methods That Need Implementation

After reviewing routes, we need these additional methods:

### userDB - Missing Methods
```javascript
async getUserByEmail(email)  // Get user by email for login
```

### blogDB - Additional needed
None - has all we need

### pathsDB - Additional needed
None - has all we need

---

## ✅ Route Update Checklist

For each route file, verify:

- [ ] Import statements updated: `import { userDB, blogDB, pathsDB } from '$lib/db.js'`
- [ ] All database calls have `await` keyword
- [ ] All database calls use method names (not SQL)
- [ ] All null checks still work (`if (!result)`)
- [ ] All error handling wrapped in try-catch
- [ ] All return values check `.success` property if needed
- [ ] No references to `db.prepare()` or SQL strings
- [ ] No references to `.get()`, `.all()`, `.run()`
- [ ] Password hashing still works (bcrypt, not database)
- [ ] Redirects still work (throw redirect() not changed)

---

## 📊 Files to Update (In Order of Priority)

### Priority 1: Authentication (Critical)
- [ ] `/register/+page.server.js` - Registration
- [ ] `/login/+page.server.js` - Login

### Priority 2: Content (Core Features)
- [ ] `/blog/+page.server.js` - Blog list
- [ ] `/blog/[slug]/+page.server.js` - Single post
- [ ] `/profile/+page.server.js` - User profile

### Priority 3: Admin
- [ ] `/admin/+page.server.js` - Admin dashboard
- [ ] `/admin/posts/+page.server.js` - Admin posts
- [ ] `/admin/reports/+page.server.js` - Admin reports

---

## 🚀 Update Strategy

1. **Start with `/register`** - Simplest, most clear
2. **Then `/login`** - Similar pattern
3. **Then `/blog` routes** - Reading operations (easier)
4. **Then `/profile`** - Mixed operations
5. **Then `/admin` routes** - More complex

Each update follows the same pattern:
1. Change imports
2. Add `await` to database calls
3. Replace SQL with method calls
4. Test in browser
5. Move to next route

---

## 📝 Next Steps

Before we update routes, we need to:

1. **Add missing method** to userDB:
   ```javascript
   async getUserByEmail(email)
   ```

2. **Implement this method** to support login functionality

3. **Then start updating routes** in priority order

Would you like me to:
- [ ] Add the missing `getUserByEmail()` method first?
- [ ] Start route updates?
- [ ] Or modify this documentation?
