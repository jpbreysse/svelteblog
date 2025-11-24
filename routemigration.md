# Route Migration Guide: SQLite → PostgreSQL Async

## 📋 Overview

All route files need to be updated from **SQLite synchronous code** to **PostgreSQL asynchronous code**.

---

## 🔄 Migration Pattern: Before and After

### Pattern 1: Simple SELECT Query

**❌ BEFORE (SQLite)**
```javascript
import { db } from '$lib/db.js';

export async function load({ params }) {
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
  return { user };
}
```

**✅ AFTER (PostgreSQL)**
```javascript
import { userDB } from '$lib/db.js';

export async function load({ params }) {
  const user = await userDB.getUserById(userId);
  return { user };
}
```

**Changes:**
- Import specific DB object (userDB, blogDB, pathsDB)
- Use `await` keyword
- Call helper methods instead of SQL
- No `.prepare().get()`

---

### Pattern 2: Data Insertion

**❌ BEFORE (SQLite)**
```javascript
const result = db.prepare(`
  INSERT INTO users (email, display_name, password_hash)
  VALUES (?, ?, ?)
`).run(email, displayName, passwordHash);
const userId = result.lastInsertRowid;
```

**✅ AFTER (PostgreSQL)**
```javascript
const result = await userDB.createUser({
  email,
  display_name: displayName,
  password_hash: passwordHash
});
const userId = result.userId;
```

---

### Pattern 3: Error Handling

**❌ BEFORE**
```javascript
try {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return fail(404, { error: 'Not found' });
} catch (error) {
  return fail(500, { error: error.message });
}
```

**✅ AFTER**
```javascript
try {
  const user = await userDB.getUserById(id);
  if (!user) return fail(404, { error: 'Not found' });
} catch (error) {
  return fail(500, { error: error.message });
}
```

---

## 📚 Available Database Methods

### userDB Methods
```javascript
import { userDB } from '$lib/db.js';

await userDB.getUserById(id)                          // User | null
await userDB.verifyPassword(userId, password)         // boolean
await userDB.changePassword(userId, oldPwd, newPwd)   // { success, message }
await userDB.completeAccountDeletion(userId, reason)  // { success, message, deletedPosts }
await userDB.getPendingDeletions()                     // Array
await userDB.getAllContentReports()                    // Array
await userDB.getContentReportById(id)                 // Report | null
await userDB.createContentReport(reportData)          // { success, reportId }
await userDB.updateContentReportStatus(id, status)    // { success }
```

### blogDB Methods
```javascript
import { blogDB } from '$lib/db.js';

await blogDB.getAllPosts()                            // Array
await blogDB.getPostsByUser(userId)                   // Array
await blogDB.getPostById(id)                          // Post | null
await blogDB.getPostBySlug(slug)                      // Post | null
await blogDB.getPostsByCategory(category)             // Array
await blogDB.searchPosts(query, category)             // Array
await blogDB.getCategories()                          // Array
await blogDB.getTags()                                // Array
await blogDB.getStats()                               // Object
await blogDB.createPost(postData, authorId)           // { success, post }
await blogDB.updatePost(id, postData, authorId)       // { success, message }
await blogDB.deletePost(id, authorId)                 // { success, message }
await blogDB.updatePostTags(postId, tagNames)         // { success, message }
```

### pathsDB Methods
```javascript
import { pathsDB } from '$lib/db.js';

await pathsDB.getAllPaths()                           // Array
await pathsDB.getPathById(id)                         // Path | null
await pathsDB.getPathByFullPath(fullPath)             // Path | null
await pathsDB.getPathChildren(parentId)               // Array
await pathsDB.getPathParent(id)                       // Path | null
await pathsDB.getPathDescendants(id)                  // Array
await pathsDB.getPathHierarchy()                      // Array
await pathsDB.getPathStatistics()                     // Object
await pathsDB.getPathsWithPostCount()                 // Array
await pathsDB.createPath(pathData, userId)            // { success, path }
await pathsDB.updatePath(id, pathData)                // { success, message }
await pathsDB.deletePath(id)                          // { success, message, deletedCount }
```

---

## 🗂️ Routes to Update (8 total)

### Route 1: register/+page.server.js
**Uses:** userDB  
**Methods:** getUserByEmail (MISSING), createUser (MISSING)  
**Changes:** User creation, email validation

### Route 2: login/+page.server.js  
**Uses:** userDB  
**Methods:** getUserByEmail (MISSING), verifyPassword  
**Changes:** User lookup, password verification

### Route 3: blog/+page.server.js
**Uses:** blogDB  
**Methods:** getAllPosts  
**Changes:** Get all posts

### Route 4: blog/[slug]/+page.server.js
**Uses:** blogDB  
**Methods:** getPostBySlug  
**Changes:** Get single post by slug

### Route 5: profile/+page.server.js
**Uses:** userDB, blogDB  
**Methods:** getUserById, changePassword, completeAccountDeletion, getPostsByUser  
**Changes:** User profile, password change, account deletion, user posts

### Route 6: admin/+page.server.js
**Uses:** userDB, blogDB, pathsDB  
**Methods:** getStats, getAllContentReports, getPathStatistics  
**Changes:** Admin dashboard stats

### Route 7: admin/posts/+page.server.js
**Uses:** blogDB  
**Methods:** getAllPosts, createPost, updatePost, deletePost, updatePostTags  
**Changes:** Post management

### Route 8: admin/reports/+page.server.js
**Uses:** userDB  
**Methods:** getAllContentReports, getContentReportById, updateContentReportStatus  
**Changes:** Report management

---

## ⚠️ Missing Methods (Must Create First)

### 1. userDB.getUserByEmail(email)
```javascript
async getUserByEmail(email) {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  return result.rows[0] || null;
}
```

### 2. userDB.createUser(userData)
```javascript
async createUser(userData) {
  const { email, display_name, password_hash, role = 'user' } = userData;
  const result = await pool.query(`
    INSERT INTO users (email, display_name, password_hash, role, status)
    VALUES ($1, $2, $3, $4, 'pending')
    RETURNING id, email, display_name
  `, [email.toLowerCase(), display_name, password_hash, role]);
  
  if (result.rowCount === 0) throw new Error('Failed to create user');
  
  return { success: true, userId: result.rows[0].id, user: result.rows[0] };
}
```

---

## 📝 Code Template for Routes

```javascript
import { fail, redirect } from '@sveltejs/kit';
import { userDB, blogDB, pathsDB } from '$lib/db.js';

export async function load({ params, locals }) {
  try {
    // Validation
    if (!params.id) {
      throw new Error('ID required');
    }

    // Database calls (async!)
    const data = await someDBMethod(params.id);

    // Return data
    return { data };
  } catch (error) {
    console.error('Load error:', error);
    throw error;
  }
}

export const actions = {
  default: async ({ request, locals }) => {
    try {
      // Check auth if needed
      if (!locals.user) {
        return fail(401, { error: 'Not authenticated' });
      }

      // Get form data
      const formData = await request.formData();
      const field = formData.get('field');

      // Validate
      if (!field) {
        return fail(400, { error: 'Field required' });
      }

      // Database operation
      const result = await dbMethod(field, locals.user.id);

      // Return or redirect
      if (result.success) {
        throw redirect(303, '/success');
      }

      return { success: true };
    } catch (error) {
      if (error.status === 303) throw error; // Allow redirects
      console.error('Action error:', error);
      return fail(500, { error: error.message });
    }
  }
};
```

---

## 🚨 Common Mistakes

1. **Forgetting `await`**
   ```javascript
   ❌ const user = userDB.getUserById(id);
   ✅ const user = await userDB.getUserById(id);
   ```

2. **Not making functions async**
   ```javascript
   ❌ export function load({ params }) { ... }
   ✅ export async function load({ params }) { ... }
   ```

3. **Using old db.prepare()**
   ```javascript
   ❌ db.prepare('SELECT ...').get()
   ✅ await userDB.getUserById(...)
   ```

4. **Wrong imports**
   ```javascript
   ❌ import { db } from '$lib/db.js';
   ✅ import { userDB, blogDB, pathsDB } from '$lib/db.js';
   ```

5. **Missing error handling**
   ```javascript
   ❌ const user = await userDB.getUserById(id);
   ✅ try { 
        const user = await userDB.getUserById(id); 
      } catch (error) { ... }
   ```

---

## ✅ Checklist per Route

- [ ] Import correct DB objects
- [ ] Make functions async (load, actions)
- [ ] Add await to all DB calls
- [ ] Remove all db.prepare() calls
- [ ] Add error handling (try/catch)
- [ ] Test the route
- [ ] Check console for errors
- [ ] Test error cases

---

## 🎯 Implementation Order

**Must do first:** Create missing userDB methods

**Phase 1 (Critical):**
1. Update register route
2. Update login route
3. Update blog routes

**Phase 2 (Important):**
4. Update profile route
5. Update admin routes

---

## 🧪 Testing

After each route update:

```bash
npm run dev
```

Test:
- Main functionality works
- Error cases handled
- No console errors
- Database calls complete

---

## 📊 Summary of Changes

**File:** All 8 route files

**What changes:**
- SQLite sync → PostgreSQL async
- db.prepare() → userDB/blogDB/pathsDB methods
- No await → await on all DB calls
- Non-async functions → async functions

**Result:**
- All routes use modern async/await
- All routes use PostgreSQL
- All routes are non-blocking
- Full error handling