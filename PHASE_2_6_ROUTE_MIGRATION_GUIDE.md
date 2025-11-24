# Phase 2.6: Route Migration Guide - SQLite to PostgreSQL

## 🎯 Overview

All route files need to be updated from **SQLite synchronous** to **PostgreSQL asynchronous** database calls.

**Current State:** ❌ Routes using old `db.prepare()` (SQLite)  
**Target State:** ✅ Routes using new `userDB`, `blogDB`, `pathsDB` (PostgreSQL async)

---

## 📊 Routes That Need Updates

| File | Purpose | Status | Priority |
|------|---------|--------|----------|
| `register/+page.server.js` | User registration | ❌ Needs update | 🔴 CRITICAL |
| `login/+page.server.js` | User login | ❌ Needs update | 🔴 CRITICAL |
| `blog/+page.server.js` | Blog list page | ❌ Needs update | 🔴 CRITICAL |
| `blog/[slug]/+page.server.js` | Single post page | ❌ Needs update | 🔴 CRITICAL |
| `profile/+page.server.js` | User profile | ❌ Needs update | 🟠 HIGH |
| `admin/+page.server.js` | Admin dashboard | ❌ Needs update | 🟠 HIGH |
| `admin/posts/+page.server.js` | Admin posts page | ❌ Needs update | 🟠 HIGH |
| `admin/reports/+page.server.js` | Admin reports page | ❌ Needs update | 🟠 HIGH |

---

## 🔄 Migration Patterns

### Pattern 1: Simple SELECT (Get Data)

#### ❌ OLD - SQLite Synchronous
```javascript
import { db } from '$lib/db.js';

export async function load({ params }) {
  const post = db.prepare(`
    SELECT * FROM posts WHERE slug = ?
  `).get(params.slug);
  
  return { post };
}
```

**Problems:**
- Synchronous call blocks event loop
- Uses `db.prepare().get()`
- Uses `?` for parameters

#### ✅ NEW - PostgreSQL Asynchronous
```javascript
import { blogDB } from '$lib/db.js';

export async function load({ params }) {
  const post = await blogDB.getPostBySlug(params.slug);
  
  return { post };
}
```

**Improvements:**
- Uses `await` (non-blocking)
- Calls pre-built `blogDB` method
- No raw SQL needed
- Better error handling

---

### Pattern 2: INSERT (Create Data)

#### ❌ OLD - SQLite Synchronous
```javascript
import { db } from '$lib/db.js';

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    
    try {
      const result = db.prepare(`
        INSERT INTO users (email, display_name, password_hash)
        VALUES (?, ?, ?)
      `).run(
        data.get('email'),
        data.get('display_name'),
        data.get('password_hash')
      );
      
      return { success: true, userId: result.lastInsertRowid };
    } catch (error) {
      return fail(400, { error: error.message });
    }
  }
};
```

**Problems:**
- Synchronous database operations
- Uses `.run()` with `lastInsertRowid`
- Raw SQL in routes

#### ✅ NEW - PostgreSQL Asynchronous
```javascript
import { userDB } from '$lib/db.js';

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    
    try {
      // Prepare report data
      const reportData = {
        issue_type: data.get('issue_type'),
        description: data.get('description'),
        reporter_email: data.get('reporter_email'),
        // ... other fields
      };
      
      // Use abstracted database method
      const result = await userDB.createContentReport(reportData);
      
      return { success: true, reportId: result.reportId };
    } catch (error) {
      return fail(400, { error: error.message });
    }
  }
};
```

**Improvements:**
- Uses `await` for non-blocking
- Calls abstracted method (`userDB.createContentReport`)
- No raw SQL in routes
- Cleaner error handling
- Result already contains what we need

---

### Pattern 3: UPDATE (Modify Data)

#### ❌ OLD - SQLite Synchronous
```javascript
import { db } from '$lib/db.js';

export const actions = {
  updatePost: async ({ request }) => {
    const data = await request.formData();
    
    try {
      const result = db.prepare(`
        UPDATE posts 
        SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        data.get('title'),
        data.get('content'),
        data.get('id')
      );
      
      if (result.changes === 0) {
        throw new Error('Post not found');
      }
      
      return { success: true };
    } catch (error) {
      return fail(400, { error: error.message });
    }
  }
};
```

**Problems:**
- Synchronous update
- Uses `.changes` property (SQLite specific)
- Raw SQL in route

#### ✅ NEW - PostgreSQL Asynchronous
```javascript
import { blogDB } from '$lib/db.js';

export const actions = {
  updatePost: async ({ request, locals }) => {
    const data = await request.formData();
    
    try {
      const postData = {
        title: data.get('title'),
        content: data.get('content'),
        category: data.get('category'),
        path_id: data.get('path_id')
      };
      
      // Abstracted method handles authorization + update
      const result = await blogDB.updatePost(
        data.get('id'),
        postData,
        locals.user.id  // For authorization check
      );
      
      return { success: true };
    } catch (error) {
      return fail(400, { error: error.message });
    }
  }
};
```

**Improvements:**
- Uses `await` for async operation
- Authorization check built into method
- No raw SQL needed
- Cleaner error handling
- Business logic in database layer

---

### Pattern 4: DELETE (Remove Data)

#### ❌ OLD - SQLite Synchronous
```javascript
import { db } from '$lib/db.js';

export const actions = {
  delete: async ({ request }) => {
    const data = await request.formData();
    
    try {
      const result = db.prepare(
        'DELETE FROM posts WHERE id = ?'
      ).run(data.get('id'));
      
      if (result.changes === 0) {
        throw new Error('Post not found');
      }
      
      return { success: true };
    } catch (error) {
      return fail(400, { error: error.message });
    }
  }
};
```

#### ✅ NEW - PostgreSQL Asynchronous
```javascript
import { blogDB } from '$lib/db.js';

export const actions = {
  delete: async ({ request, locals }) => {
    const data = await request.formData();
    
    try {
      // Authorization check included
      const result = await blogDB.deletePost(
        data.get('id'),
        locals.user.id
      );
      
      return { success: true };
    } catch (error) {
      return fail(400, { error: error.message });
    }
  }
};
```

---

### Pattern 5: Query with Filter/Search

#### ❌ OLD - SQLite Synchronous
```javascript
import { db } from '$lib/db.js';

export async function load({ url }) {
  const category = url.searchParams.get('category');
  
  let query = 'SELECT * FROM posts WHERE published = 1';
  const params = [];
  
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  
  const posts = db.prepare(query).all(...params);
  
  return { posts };
}
```

**Problems:**
- Manual SQL building
- Synchronous
- Error-prone parameter handling

#### ✅ NEW - PostgreSQL Asynchronous
```javascript
import { blogDB } from '$lib/db.js';

export async function load({ url }) {
  const category = url.searchParams.get('category');
  
  try {
    let posts;
    
    if (category) {
      posts = await blogDB.getPostsByCategory(category);
    } else {
      posts = await blogDB.getAllPosts();
    }
    
    return { posts };
  } catch (error) {
    console.error('Error loading posts:', error);
    return { posts: [], error: 'Failed to load posts' };
  }
}
```

**Improvements:**
- No raw SQL needed
- Uses pre-built methods
- Better error handling
- Cleaner logic flow

---

### Pattern 6: Transaction (Multiple Operations)

#### ❌ OLD - SQLite Synchronous
```javascript
import { db } from '$lib/db.js';

export const actions = {
  deleteAccount: async ({ request, locals }) => {
    try {
      // SQLite transaction
      const transaction = db.transaction(() => {
        // Delete posts
        db.prepare('DELETE FROM posts WHERE author_id = ?')
          .run(locals.user.id);
        
        // Delete user
        db.prepare('DELETE FROM users WHERE id = ?')
          .run(locals.user.id);
      });
      
      transaction();
      return { success: true };
    } catch (error) {
      return fail(500, { error: error.message });
    }
  }
};
```

#### ✅ NEW - PostgreSQL Asynchronous
```javascript
import { userDB } from '$lib/db.js';

export const actions = {
  deleteAccount: async ({ request, locals }) => {
    try {
      // Transaction handled in database layer
      const result = await userDB.completeAccountDeletion(
        locals.user.id,
        'User requested deletion'
      );
      
      // User successfully deleted
      throw redirect(303, '/goodbye');
    } catch (error) {
      if (error.status === 303) throw error;
      return fail(500, { error: error.message });
    }
  }
};
```

**Improvements:**
- Transaction handled in database layer
- No manual transaction code in routes
- Better error handling
- Logging included

---

## 📋 Import Changes

### ❌ OLD Imports
```javascript
import { db } from '$lib/db.js';

// Then use:
db.prepare('...').get()
db.prepare('...').all()
db.prepare('...').run()
```

### ✅ NEW Imports
```javascript
// Import the database modules you need
import { userDB } from '$lib/db.js';
import { blogDB } from '$lib/db.js';
import { pathsDB } from '$lib/db.js';

// Then use:
await userDB.getUserById(id);
await blogDB.getAllPosts();
await pathsDB.getPathById(id);
```

---

## 🔑 Key Differences Summary

| Aspect | SQLite | PostgreSQL |
|--------|--------|-----------|
| **Syntax** | `db.prepare().get()` | `await userDB.getUser()` |
| **Async** | Synchronous | Asynchronous (await) |
| **Parameters** | `?` | Built into methods |
| **Error Handling** | Try/catch | Try/catch (same) |
| **Transactions** | `db.transaction()` | Handled in methods |
| **Authorization** | Route-level | Database method level |
| **Returns** | Raw objects | Structured responses |

---

## ✅ Migration Checklist

For each route file, check:

- [ ] Changed imports from `db` to `userDB`/`blogDB`/`pathsDB`
- [ ] All database calls use `await`
- [ ] Removed all `db.prepare()` calls
- [ ] Removed all `?` parameter placeholders
- [ ] Updated `.get()` to method calls
- [ ] Updated `.all()` to method calls
- [ ] Updated `.run()` to method calls
- [ ] Changed `.lastInsertRowid` to response from method
- [ ] Changed `.changes` to `rowCount` (or method handles it)
- [ ] Error handling in place
- [ ] Authorization checks passed to methods (where needed)
- [ ] No raw SQL in route files
- [ ] Tests pass locally

---

## 🚀 Route-by-Route Migration Order

### Phase 1: Authentication (CRITICAL) 🔴
1. **register/+page.server.js** - User registration
2. **login/+page.server.js** - User login

**Why first:** These unblock the app, required for everything else

### Phase 2: Blog (CRITICAL) 🔴
3. **blog/+page.server.js** - Blog list
4. **blog/[slug]/+page.server.js** - Single post

**Why second:** Core content viewing

### Phase 3: User Features (HIGH) 🟠
5. **profile/+page.server.js** - User profile

**Why third:** User management

### Phase 4: Admin (HIGH) 🟠
6. **admin/+page.server.js** - Admin dashboard
7. **admin/posts/+page.server.js** - Admin posts
8. **admin/reports/+page.server.js** - Admin reports

**Why last:** Admin features, lower priority

---

## 📝 Available Database Methods

### userDB Methods
```javascript
await userDB.getUserById(id)
await userDB.verifyPassword(userId, password)
await userDB.changePassword(userId, currentPassword, newPassword)
await userDB.completeAccountDeletion(userId, reason)
await userDB.getPendingDeletions()
await userDB.createContentReport(reportData)
await userDB.getAllContentReports()
await userDB.getContentReportById(id)
await userDB.updateContentReportStatus(reportId, status, response, resolvedBy)
await userDB.resetUserPassword(adminId, userId, newPassword)
```

### blogDB Methods
```javascript
await blogDB.getAllPosts()
await blogDB.getPostsByUser(userId)
await blogDB.getPostById(id)
await blogDB.getPostBySlug(slug)
await blogDB.createPost(postData, authorId)
await blogDB.updatePost(id, postData, authorId)
await blogDB.deletePost(id, authorId)
await blogDB.updatePostTags(postId, tagNames)
await blogDB.searchPosts(query, category)
await blogDB.getPostsByCategory(category)
await blogDB.getCategories()
await blogDB.getTags()
await blogDB.getStats()
```

### pathsDB Methods
```javascript
await pathsDB.getAllPaths()
await pathsDB.getPathById(id)
await pathsDB.getPathByFullPath(fullPath)
await pathsDB.createPath(pathData, userId)
await pathsDB.updatePath(id, pathData)
await pathsDB.deletePath(id)
await pathsDB.getPathChildren(parentId)
await pathsDB.getPathHierarchy()
await pathsDB.getParentPath(id)
await pathsDB.getPathDescendants(id)
await pathsDB.getPathStatistics()
await pathsDB.getPathsWithPostCount()
```

---

## ⚠️ Common Migration Mistakes

### ❌ Mistake 1: Forgetting `await`
```javascript
// WRONG - won't work
const post = blogDB.getPostById(1);

// CORRECT
const post = await blogDB.getPostById(1);
```

### ❌ Mistake 2: Old import style
```javascript
// WRONG - db object doesn't exist anymore
import { db } from '$lib/db.js';
const user = db.prepare('...').get();

// CORRECT
import { userDB } from '$lib/db.js';
const user = await userDB.getUserById(1);
```

### ❌ Mistake 3: Using `.changes` or `.lastInsertRowid`
```javascript
// WRONG - PostgreSQL doesn't use these
const result = db.prepare('...').run();
console.log(result.changes);      // ❌
console.log(result.lastInsertRowid); // ❌

// CORRECT - methods return structured data
const result = await userDB.createContentReport(data);
console.log(result.reportId);     // ✅
console.log(result.success);      // ✅
```

### ❌ Mistake 4: Not handling authorization in protected routes
```javascript
// WRONG - no authorization check
await blogDB.updatePost(id, postData, null);

// CORRECT - pass user ID for authorization
await blogDB.updatePost(id, postData, locals.user.id);
```

### ❌ Mistake 5: Missing error handling
```javascript
// WRONG - no error handling
const posts = await blogDB.getAllPosts();

// CORRECT
try {
  const posts = await blogDB.getAllPosts();
  return { posts };
} catch (error) {
  console.error('Error loading posts:', error);
  return { posts: [], error: 'Failed to load posts' };
}
```

---

## 📚 Example: Complete Migration

### ❌ BEFORE (SQLite)
```javascript
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/db.js';
import { hashPassword } from '$lib/auth.js';

export async function load({ locals }) {
  return { user: locals.user || null };
}

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const email = data.get('email');
    const displayName = data.get('display_name');
    const password = data.get('password');

    try {
      // Validate
      if (!email || !displayName || !password) {
        return fail(400, { error: 'Missing fields' });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Check if exists
      const existing = db.prepare(
        'SELECT id FROM users WHERE email = ?'
      ).get(email);
      
      if (existing) {
        return fail(400, { error: 'User already exists' });
      }

      // Insert
      const result = db.prepare(`
        INSERT INTO users (email, display_name, password_hash)
        VALUES (?, ?, ?)
      `).run(email, displayName, hashedPassword);

      throw redirect(303, '/login');
    } catch (error) {
      if (error.status === 303) throw error;
      return fail(500, { error: error.message });
    }
  }
};
```

### ✅ AFTER (PostgreSQL)
```javascript
import { fail, redirect } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';
import { hashPassword } from '$lib/auth.js';

export async function load({ locals }) {
  return { user: locals.user || null };
}

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const email = data.get('email')?.trim().toLowerCase();
    const displayName = data.get('display_name')?.trim();
    const password = data.get('password');

    try {
      // Validate
      if (!email || !displayName || !password) {
        return fail(400, { error: 'Missing fields' });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Check if exists (userDB method would handle this, 
      // but for now we can add a query or catch the error)
      try {
        // Insert via userDB
        // Note: We need to add this method or handle at route level
        const result = await pool.query(
          'INSERT INTO users (email, display_name, password_hash, status, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [email, displayName, hashedPassword, 'pending', 'user']
        );

        throw redirect(303, '/login');
      } catch (dbError) {
        if (dbError.constraint === 'users_email_key') {
          return fail(400, { error: 'Email already exists' });
        }
        throw dbError;
      }
    } catch (error) {
      if (error.status === 303) throw error;
      console.error('Registration error:', error);
      return fail(500, { error: 'Registration failed' });
    }
  }
};
```

---

## 🎓 Learning Points

1. **Async/Await** - All database operations are now asynchronous
2. **Abstraction** - Database methods handle business logic
3. **Authorization** - Built into database methods
4. **Error Handling** - Structured responses from methods
5. **No Raw SQL** - Routes don't write SQL anymore
6. **Cleaner Code** - Less boilerplate in routes

---

## 🚀 Ready to Migrate?

Once you've reviewed this documentation:

1. **Do you understand the patterns?**
2. **Do you want me to create migration templates for each route?**
3. **Should we start with Phase 1 (Auth routes)?**

Let me know when you're ready! 🎯
