# Route Migration Guide: SQLite → PostgreSQL Async

## 📋 Overview

This document explains how to update SvelteKit route files from **SQLite synchronous** database calls to **PostgreSQL asynchronous** database calls using the new async database abstraction layer.

---

## 🔄 What Changed

### SQLite (Synchronous)
```javascript
import { db } from '$lib/db.js';

// Synchronous operations - blocking
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
const result = db.prepare('INSERT INTO users ...').run(...);
db.prepare('DELETE FROM users WHERE id = ?').run(userId);
```

### PostgreSQL (Asynchronous)
```javascript
import { userDB, blogDB, pathsDB } from '$lib/db.js';

// Asynchronous operations - non-blocking
const user = await userDB.getUserById(userId);
const result = await userDB.createContentReport(reportData);
await userDB.completeAccountDeletion(userId);
```

**Key differences:**
- ✅ Add `async` to functions that use database
- ✅ Use `await` before database calls
- ✅ Use specialized methods (userDB, blogDB, pathsDB)
- ✅ Handle promises instead of direct returns

---

## 📚 Database Methods Available

### userDB Methods
```javascript
import { userDB } from '$lib/db.js';

// Get operations
await userDB.getUserById(id)
await userDB.verifyPassword(userId, password)
await userDB.getPendingDeletions()
await userDB.getContentReportById(reportId)
await userDB.getAllContentReports()

// Create operations
await userDB.createContentReport(reportData)

// Update operations
await userDB.changePassword(userId, currentPassword, newPassword)
await userDB.updateContentReportStatus(reportId, status, response, resolvedBy)

// Delete operations
await userDB.completeAccountDeletion(userId, reason)
await userDB.resetUserPassword(adminId, userId, newPassword)
```

### blogDB Methods
```javascript
import { blogDB } from '$lib/db.js';

// Get operations
await blogDB.getAllPosts()
await blogDB.getPostsByUser(userId)
await blogDB.getPostById(id)
await blogDB.getPostBySlug(slug)
await blogDB.getPostsByCategory(category)
await blogDB.getCategories()
await blogDB.getTags()
await blogDB.getStats()

// Create operations
await blogDB.createPost(postData, authorId)

// Update operations
await blogDB.updatePost(id, postData, authorId)
await blogDB.updatePostTags(postId, tagNames)

// Delete operations
await blogDB.deletePost(id, authorId)

// Search operations
await blogDB.searchPosts(query, category)
```

### pathsDB Methods
```javascript
import { pathsDB } from '$lib/db.js';

// Get operations
await pathsDB.getAllPaths()
await pathsDB.getPathById(id)
await pathsDB.getPathByFullPath(fullPath)
await pathsDB.getPathChildren(parentId)
await pathsDB.getParentPath(id)
await pathsDB.getPathDescendants(id)
await pathsDB.getPathHierarchy()
await pathsDB.getPathStatistics()
await pathsDB.getPathsWithPostCount()

// Create operations
await pathsDB.createPath(pathData, userId)

// Update operations
await pathsDB.updatePath(id, pathData)

// Delete operations
await pathsDB.deletePath(id)
```

---

## 🔄 Migration Patterns

### Pattern 1: Simple SELECT

**SQLite:**
```javascript
export async function load() {
  const posts = db.prepare('SELECT * FROM posts WHERE published = 1').all();
  return { posts };
}
```

**PostgreSQL:**
```javascript
import { blogDB } from '$lib/db.js';

export async function load() {
  const posts = await blogDB.getAllPosts();
  return { posts };
}
```

**Key changes:**
- Add `import { blogDB }`
- Use `await blogDB.getAllPosts()` instead of `db.prepare().all()`
- Function already marked `async` ✅

---

### Pattern 2: SELECT with WHERE clause

**SQLite:**
```javascript
export async function load({ params }) {
  const post = db.prepare('SELECT * FROM posts WHERE slug = ?').get(params.slug);
  if (!post) throw error(404, 'Post not found');
  return { post };
}
```

**PostgreSQL:**
```javascript
import { blogDB } from '$lib/db.js';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
  const post = await blogDB.getPostBySlug(params.slug);
  if (!post) throw error(404, 'Post not found');
  return { post };
}
```

**Key changes:**
- Use `await` before database call
- Method returns `null` if not found (check with `if (!post)`)
- Same error handling logic ✅

---

### Pattern 3: CREATE (INSERT)

**SQLite:**
```javascript
export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const email = data.get('email');
    const password = data.get('password');
    
    const result = db.prepare(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)'
    ).run(email, hashedPassword);
    
    return { success: true, userId: result.lastInsertRowid };
  }
};
```

**PostgreSQL:**
```javascript
import { userDB } from '$lib/db.js';

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const email = data.get('email');
    const password = data.get('password');
    
    try {
      const result = await userDB.createContentReport({
        issue_type: 'test',
        description: 'Test',
        reporter_email: email,
        post_id: null,
        post_title: null,
        post_url: null,
        reporter_ip: null,
        user_agent: null
      });
      
      return { success: true, reportId: result.reportId };
    } catch (error) {
      return fail(400, { error: error.message });
    }
  }
};
```

**Key changes:**
- Use `await` and `try/catch` for error handling
- Methods return objects with result data (e.g., `{ reportId: 123 }`)
- No `lastInsertRowid` - use returned object ✅

---

### Pattern 4: UPDATE

**SQLite:**
```javascript
export const actions = {
  update: async ({ request }) => {
    const data = await request.formData();
    const id = data.get('id');
    const title = data.get('title');
    const content = data.get('content');
    
    const result = db.prepare(
      'UPDATE posts SET title = ?, content = ? WHERE id = ?'
    ).run(title, content, id);
    
    if (result.changes === 0) {
      return fail(404, { error: 'Post not found' });
    }
    
    return { success: true };
  }
};
```

**PostgreSQL:**
```javascript
import { blogDB } from '$lib/db.js';
import { fail } from '@sveltejs/kit';

export const actions = {
  update: async ({ request, locals }) => {
    const data = await request.formData();
    const id = parseInt(data.get('id'));
    const title = data.get('title');
    const content = data.get('content');
    
    try {
      const result = await blogDB.updatePost(id, {
        title,
        content,
        category: data.get('category') || 'thoughts'
      }, locals.user.id); // Pass userId for authorization
      
      return result;
    } catch (error) {
      if (error.message.includes('not found')) {
        return fail(404, { error: error.message });
      }
      if (error.message.includes('can only edit')) {
        return fail(403, { error: error.message });
      }
      return fail(500, { error: error.message });
    }
  }
};
```

**Key changes:**
- Use `try/catch` for error handling
- Methods throw errors instead of returning status
- Pass `userId` for authorization checks ✅

---

### Pattern 5: DELETE

**SQLite:**
```javascript
export const actions = {
  delete: async ({ request }) => {
    const data = await request.formData();
    const id = data.get('id');
    
    const result = db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return fail(404, { error: 'Post not found' });
    }
    
    return { success: true };
  }
};
```

**PostgreSQL:**
```javascript
import { blogDB } from '$lib/db.js';
import { fail } from '@sveltejs/kit';

export const actions = {
  delete: async ({ request, locals }) => {
    const data = await request.formData();
    const id = parseInt(data.get('id'));
    
    try {
      const result = await blogDB.deletePost(id, locals.user.id);
      return result;
    } catch (error) {
      if (error.message.includes('not found')) {
        return fail(404, { error: error.message });
      }
      if (error.message.includes('can only delete')) {
        return fail(403, { error: error.message });
      }
      return fail(500, { error: error.message });
    }
  }
};
```

**Key changes:**
- Same as UPDATE pattern
- Pass `userId` for authorization ✅

---

### Pattern 6: Transaction (Multiple Operations)

**SQLite:**
```javascript
export const actions = {
  complex: async ({ request }) => {
    // SQLite: Easy transaction
    const transaction = db.transaction(() => {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run('active', userId);
      db.prepare('INSERT INTO logs ...').run(...);
    });
    
    transaction();
    return { success: true };
  }
};
```

**PostgreSQL:**
```javascript
import { pool } from '$lib/db.js';
import { fail } from '@sveltejs/kit';

export const actions = {
  complex: async ({ request }) => {
    // PostgreSQL: Explicit transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const userResult = await client.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );
      
      await client.query(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['active', userId]
      );
      
      await client.query(
        'INSERT INTO logs ... VALUES (...)',
        [...]
      );
      
      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      return fail(500, { error: error.message });
    } finally {
      client.release();
    }
  }
};
```

**Key changes:**
- Get dedicated client: `const client = await pool.connect()`
- Explicit BEGIN/COMMIT/ROLLBACK
- Release client in finally: `client.release()`
- Every operation needs `await` ✅

---

## ⚠️ Common Mistakes to Avoid

### ❌ Mistake 1: Forgetting `async`
```javascript
// ❌ WRONG - function not marked async
export function load() {
  const posts = await blogDB.getAllPosts(); // Will fail!
}

// ✅ CORRECT
export async function load() {
  const posts = await blogDB.getAllPosts();
}
```

### ❌ Mistake 2: Forgetting `await`
```javascript
// ❌ WRONG - returns Promise, not data
export async function load() {
  const posts = blogDB.getAllPosts(); // Promise, not array!
  return { posts }; // posts is a Promise object
}

// ✅ CORRECT
export async function load() {
  const posts = await blogDB.getAllPosts(); // Wait for Promise
  return { posts }; // posts is array
}
```

### ❌ Mistake 3: Wrong error handling
```javascript
// ❌ WRONG - methods throw errors
export async function load() {
  const post = await blogDB.getPostBySlug('invalid');
  return { post }; // null is returned, no error thrown
}

// ✅ CORRECT - check for null
export async function load({ params }) {
  const post = await blogDB.getPostBySlug(params.slug);
  if (!post) throw error(404, 'Post not found');
  return { post };
}
```

### ❌ Mistake 4: Direct SQL instead of methods
```javascript
// ❌ WRONG - still using old db.prepare()
import { db } from '$lib/db.js';
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

// ✅ CORRECT - use userDB methods
import { userDB } from '$lib/db.js';
const user = await userDB.getUserById(userId);
```

### ❌ Mistake 5: Forgetting error handling in actions
```javascript
// ❌ WRONG - unhandled promise rejection
export const actions = {
  create: async ({ request }) => {
    const data = await request.formData();
    const result = await blogDB.createPost(data, userId); // Error crashes app!
  }
};

// ✅ CORRECT - wrapped in try/catch
export const actions = {
  create: async ({ request }) => {
    try {
      const data = await request.formData();
      const result = await blogDB.createPost(data, userId);
      return result;
    } catch (error) {
      return fail(400, { error: error.message });
    }
  }
};
```

---

## 📍 Route-by-Route Quick Reference

### `/register/+page.server.js`
**Current use:** Create new user  
**Methods needed:**
- `await userDB.createContentReport()` → Create report/user

**Changes needed:**
- Remove old `db.prepare()` calls
- Use userDB methods
- Add proper error handling

---

### `/login/+page.server.js`
**Current use:** Authenticate user  
**Methods needed:**
- `await userDB.getUserById()` → Get user
- `await userDB.verifyPassword()` → Check password

**Changes needed:**
- Replace SELECT with userDB
- Add await to password verification
- Handle errors properly

---

### `/blog/+page.server.js`
**Current use:** List all posts  
**Methods needed:**
- `await blogDB.getAllPosts()` → Get all posts
- `await blogDB.getCategories()` → Get categories

**Changes needed:**
- Replace SELECT with blogDB
- Remove manual tag aggregation
- Add await

---

### `/blog/[slug]/+page.server.js`
**Current use:** Show single post  
**Methods needed:**
- `await blogDB.getPostBySlug(slug)` → Get post
- `await blogDB.getTags()` → Get tags (optional)

**Changes needed:**
- Replace SELECT with getPostBySlug
- Add null check for 404
- Add await

---

### `/profile/+page.server.js`
**Current use:** User profile  
**Methods needed:**
- `await userDB.getUserById()` → Get user
- `await blogDB.getPostsByUser()` → Get user posts
- `await userDB.changePassword()` → Update password

**Changes needed:**
- Replace all db.prepare() with async methods
- Add error handling for password change
- Add await to all operations

---

### `/admin/+page.server.js`
**Current use:** Admin dashboard  
**Methods needed:**
- `await blogDB.getStats()` → Get stats
- `await userDB.getPendingDeletions()` → Get deletions
- `await userDB.getAllContentReports()` → Get reports

**Changes needed:**
- Replace stats queries with blogDB.getStats()
- Replace report queries with userDB methods
- Add authorization checks

---

### `/admin/posts/+page.server.js`
**Current use:** Manage posts  
**Methods needed:**
- `await blogDB.getAllPosts()` → List posts
- `await blogDB.updatePost()` → Update post
- `await blogDB.deletePost()` → Delete post
- `await blogDB.updatePostTags()` → Update tags

**Changes needed:**
- Replace all db.prepare() with blogDB methods
- Add authorization checks (only admin)
- Use try/catch for errors

---

### `/admin/reports/+page.server.js`
**Current use:** Manage reports  
**Methods needed:**
- `await userDB.getAllContentReports()` → List reports
- `await userDB.updateContentReportStatus()` → Update status
- `await userDB.getContentReportById()` → Get one report

**Changes needed:**
- Replace report queries with userDB methods
- Add error handling
- Use try/catch

---

## 🚀 Update Strategy

### Phase 1: Critical Routes (1-1.5 hours)
1. ✅ Start with `/register/+page.server.js` (simplest)
2. ✅ Then `/login/+page.server.js`
3. ✅ Then `/blog/+page.server.js`
4. ✅ Then `/blog/[slug]/+page.server.js`

**Result:** Core functionality works (registration, login, blog viewing)

### Phase 2: User Routes (30-45 min)
5. ✅ `/profile/+page.server.js`

**Result:** User can view and manage profile

### Phase 3: Admin Routes (1-1.5 hours)
6. ✅ `/admin/+page.server.js`
7. ✅ `/admin/posts/+page.server.js`
8. ✅ `/admin/reports/+page.server.js`

**Result:** Admin functionality works

---

## 📊 Conversion Checklist

For each route file:

- [ ] **Import correct modules**
  ```javascript
  import { userDB, blogDB, pathsDB } from '$lib/db.js';
  import { fail, error, redirect } from '@sveltejs/kit';
  ```

- [ ] **Mark all functions async**
  ```javascript
  export async function load() { ... }
  export const actions = { default: async () => { ... } };
  ```

- [ ] **Replace db.prepare() with methods**
  ```javascript
  // ❌ Remove: db.prepare('SELECT ...').all()
  // ✅ Add: await blogDB.getAllPosts()
  ```

- [ ] **Add await to all database calls**
  ```javascript
  const posts = await blogDB.getAllPosts();
  ```

- [ ] **Handle errors properly**
  ```javascript
  try {
    // database calls
  } catch (error) {
    return fail(400, { error: error.message });
  }
  ```

- [ ] **Check null returns**
  ```javascript
  const post = await blogDB.getPostBySlug(slug);
  if (!post) throw error(404, 'Not found');
  ```

- [ ] **Add authorization checks where needed**
  ```javascript
  await blogDB.deletePost(id, locals.user.id); // Pass userId
  ```

- [ ] **Test the route**
  ```bash
  npm run dev
  # Check browser console and server logs
  ```

---

## 📚 Example: Complete Migration

### BEFORE (SQLite)
```javascript
import { db } from '$lib/db.js';
import { fail } from '@sveltejs/kit';

export async function load() {
  const posts = db.prepare('SELECT * FROM posts WHERE published = 1 ORDER BY created_at DESC').all();
  return { posts };
}

export const actions = {
  delete: async ({ request }) => {
    const data = await request.formData();
    const postId = data.get('id');
    const userId = data.get('user_id');
    
    const post = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(postId);
    if (!post) return fail(404, { error: 'Post not found' });
    
    if (post.author_id !== userId) {
      return fail(403, { error: 'You can only delete your own posts' });
    }
    
    db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
    
    return { success: true };
  }
};
```

### AFTER (PostgreSQL)
```javascript
import { blogDB } from '$lib/db.js';
import { fail, error } from '@sveltejs/kit';

export async function load() {
  try {
    const posts = await blogDB.getAllPosts();
    return { posts };
  } catch (err) {
    console.error('Error loading posts:', err);
    throw error(500, 'Failed to load posts');
  }
}

export const actions = {
  delete: async ({ request, locals }) => {
    try {
      const data = await request.formData();
      const postId = parseInt(data.get('id'));
      
      const result = await blogDB.deletePost(postId, locals.user.id);
      return result;
    } catch (err) {
      if (err.message.includes('not found')) {
        return fail(404, { error: err.message });
      }
      if (err.message.includes('can only delete')) {
        return fail(403, { error: err.message });
      }
      return fail(500, { error: err.message });
    }
  }
};
```

**Changes:**
- ✅ Import `blogDB` instead of `db`
- ✅ Mark functions `async`
- ✅ Use `await` with database methods
- ✅ Add try/catch blocks
- ✅ Use `locals.user.id` for authorization
- ✅ Let methods handle authorization checks

---

## 🆘 Troubleshooting

### Error: "Cannot read properties of undefined (reading 'prepare')"
**Cause:** Still using old `db.prepare()` syntax  
**Fix:** Import correct module and use async methods
```javascript
// ❌ Wrong
import { db } from '$lib/db.js';
const user = db.prepare(...).get();

// ✅ Right
import { userDB } from '$lib/db.js';
const user = await userDB.getUserById(...);
```

### Error: "await is only valid in async functions"
**Cause:** Forgot to mark function as `async`  
**Fix:** Add `async` keyword
```javascript
// ❌ Wrong
export function load() {
  const posts = await blogDB.getAllPosts();
}

// ✅ Right
export async function load() {
  const posts = await blogDB.getAllPosts();
}
```

### Error: "Cannot read property X of undefined"
**Cause:** Forgot to `await` database call, got Promise instead of data  
**Fix:** Add `await`
```javascript
// ❌ Wrong
const posts = blogDB.getAllPosts(); // Returns Promise
const first = posts[0]; // undefined!

// ✅ Right
const posts = await blogDB.getAllPosts(); // Wait for array
const first = posts[0]; // Works!
```

### Error: "Authorization failed" or "You can only..."
**Cause:** Forgot to pass `userId` to update/delete methods  
**Fix:** Pass `locals.user.id`
```javascript
// ❌ Wrong
await blogDB.deletePost(id); // No userId

// ✅ Right
await blogDB.deletePost(id, locals.user.id); // With userId
```

---

## 📖 Reference Tables

### Required Imports by Route

| Route | Import | Methods Used |
|-------|--------|-------------|
| register | userDB | createContentReport |
| login | userDB | getUserById, verifyPassword |
| blog | blogDB | getAllPosts |
| blog/[slug] | blogDB | getPostBySlug |
| profile | userDB, blogDB | getUserById, getPostsByUser, changePassword |
| admin | blogDB, userDB | getStats, getAllContentReports |
| admin/posts | blogDB | getAllPosts, updatePost, deletePost, updatePostTags |
| admin/reports | userDB | getAllContentReports, updateContentReportStatus |

### Error Mapping

| Error Message | HTTP Status | Cause |
|---------------|------------|-------|
| "not found" | 404 | Resource doesn't exist |
| "can only edit your own" | 403 | Authorization failed |
| "can only delete your own" | 403 | Authorization failed |
| "Invalid status" | 400 | Bad data |
| "User not found" | 404 | User doesn't exist |
| Database errors | 500 | Server error |

---

## ✅ Next Steps

1. **Review this document** - Understand the patterns
2. **Start with `/register/+page.server.js`** - Simplest route
3. **Make changes incrementally** - One route at a time
4. **Test after each change** - Don't update all at once
5. **Check browser console** - For client-side errors
6. **Check server logs** - For server-side errors

---

## 📞 Getting Help

If you get stuck:

1. **Check the pattern** in "Migration Patterns" section
2. **Look at the example** in "Example: Complete Migration"
3. **Check Common Mistakes** section
4. **Look at the actual method** in `/src/lib/db.js`
5. **Check Troubleshooting** section

---

**You're ready to migrate! Start with `/register/+page.server.js`** 🚀
