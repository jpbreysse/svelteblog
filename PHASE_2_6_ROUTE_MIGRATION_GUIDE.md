# Step 2 Phase 2.6: Route Migration Documentation
## From SQLite Sync to PostgreSQL Async

---

## 📋 Overview

Your routes are currently using **SQLite synchronous database calls** but the database layer has been converted to **PostgreSQL async calls**.

**This document explains:**
1. What changed in the database layer
2. How to update each route
3. Common patterns and how to convert them
4. Before/after examples
5. Testing strategy

---

## 🔄 The Migration

### What Changed in Database Layer

```javascript
// ❌ OLD PATTERN (SQLite - Synchronous)
import { db } from '$lib/db.js';

const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const result = db.prepare('INSERT INTO users ...').run(...);
db.exec('DELETE FROM posts WHERE id = ?');

// ✅ NEW PATTERN (PostgreSQL - Asynchronous)
import { userDB, blogDB, pathsDB } from '$lib/db.js';

const user = await userDB.getUserById(id);
const result = await blogDB.createPost(postData, authorId);
await blogDB.deletePost(postId, authorId);
```

### Key Differences

| Aspect | SQLite | PostgreSQL |
|--------|--------|-----------|
| **Module** | `import { db }` | `import { userDB, blogDB, pathsDB }` |
| **Execution** | Synchronous (blocks) | Asynchronous (await required) |
| **Query Method** | `db.prepare().get/all/run()` | `await module.method()` |
| **Error Handling** | try/catch | try/catch (same) |
| **Load Functions** | Can be sync | MUST be async |
| **Actions** | Can be sync | MUST be async |

---

## 🔑 Conversion Patterns

### Pattern 1: Simple SELECT (Get Single Item)

**❌ SQLite (Old)**
```javascript
import { db } from '$lib/db.js';

const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
if (!user) {
  return { error: 'User not found' };
}
console.log(user.email);
```

**✅ PostgreSQL (New)**
```javascript
import { userDB } from '$lib/db.js';

const user = await userDB.getUserById(userId);
if (!user) {
  return { error: 'User not found' };
}
console.log(user.email);
```

**Changes:**
- Remove `db.prepare().get()` wrapper
- Use `await userDB.getUserById()`
- Rest of logic stays the same

---

### Pattern 2: SELECT Multiple (Get List)

**❌ SQLite (Old)**
```javascript
import { db } from '$lib/db.js';

const posts = db.prepare(`
  SELECT p.*, u.display_name FROM posts p
  JOIN users u ON p.author_id = u.id
  WHERE p.published = true
  ORDER BY p.created_at DESC
`).all();

console.log(`Found ${posts.length} posts`);
```

**✅ PostgreSQL (New)**
```javascript
import { blogDB } from '$lib/db.js';

const posts = await blogDB.getAllPosts();

console.log(`Found ${posts.length} posts`);
```

**Changes:**
- Use `await blogDB.getAllPosts()` instead of raw SQL
- Already joins author info
- Returns same data structure

---

### Pattern 3: INSERT (Create New)

**❌ SQLite (Old)**
```javascript
import { db } from '$lib/db.js';

const hashedPassword = await hashPassword(password);
const result = db.prepare(`
  INSERT INTO users (email, display_name, password_hash)
  VALUES (?, ?, ?)
`).run(email, displayName, hashedPassword);

const newUserId = result.lastInsertRowid;
```

**✅ PostgreSQL (New)**
```javascript
import { userDB } from '$lib/db.js';

// userDB methods handle the INSERT
// They return success with data
const createUserResult = {
  success: true,
  userId: newUser.id,
  email: newUser.email
};
```

**Note:** PostgreSQL methods may work differently. Check what they return!

---

### Pattern 4: UPDATE (Modify Existing)

**❌ SQLite (Old)**
```javascript
import { db } from '$lib/db.js';

const result = db.prepare(`
  UPDATE posts 
  SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND author_id = ?
`).run(newTitle, newContent, postId, userId);

if (result.changes === 0) {
  return { error: 'Post not found or not yours' };
}
```

**✅ PostgreSQL (New)**
```javascript
import { blogDB } from '$lib/db.js';

try {
  await blogDB.updatePost(postId, 
    { title: newTitle, content: newContent }, 
    userId
  );
  // Success - userDB already checked authorization
} catch (error) {
  if (error.message.includes('own posts')) {
    return { error: 'Post not yours' };
  }
  return { error: error.message };
}
```

**Changes:**
- Use `await blogDB.updatePost()` - handles auth check internally
- Error messages instead of rowCount
- Cleaner error handling

---

### Pattern 5: DELETE (Remove)

**❌ SQLite (Old)**
```javascript
import { db } from '$lib/db.js';

// Check authorization
const post = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(postId);
if (post.author_id !== userId) {
  return { error: 'Not your post' };
}

// Delete
const result = db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
if (result.changes === 0) {
  return { error: 'Failed to delete' };
}
```

**✅ PostgreSQL (New)**
```javascript
import { blogDB } from '$lib/db.js';

try {
  await blogDB.deletePost(postId, userId);
  // Authorization checked inside method
  return { success: true };
} catch (error) {
  return { error: error.message };
}
```

**Changes:**
- Auth check built into method
- Simpler code
- Same error handling

---

### Pattern 6: Transaction (Multiple Operations)

**❌ SQLite (Old)**
```javascript
import { db } from '$lib/db.js';

const transaction = db.transaction(() => {
  db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(postId);
  db.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)').run(postId, tagId1);
  db.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)').run(postId, tagId2);
});

transaction();
```

**✅ PostgreSQL (New)**
```javascript
import { blogDB } from '$lib/db.js';

await blogDB.updatePostTags(postId, ['tag1', 'tag2']);
// Transaction handled inside method
```

**Changes:**
- Methods handle transactions internally
- Much simpler code
- No manual BEGIN/COMMIT needed

---

## 📊 Available Database Methods

### userDB Methods
```javascript
// Get user
const user = await userDB.getUserById(id);

// Verify password
const isCorrect = await userDB.verifyPassword(userId, password);

// Change password
await userDB.changePassword(userId, currentPassword, newPassword);

// Delete account
await userDB.completeAccountDeletion(userId, reason);

// Content reports
await userDB.createContentReport(reportData);
const reports = await userDB.getAllContentReports();
const report = await userDB.getContentReportById(reportId);
await userDB.updateContentReportStatus(reportId, status, response, resolvedBy);
```

### blogDB Methods
```javascript
// Read
const posts = await blogDB.getAllPosts();
const post = await blogDB.getPostById(id);
const post = await blogDB.getPostBySlug(slug);
const posts = await blogDB.getPostsByUser(userId);
const posts = await blogDB.getPostsByCategory(category);
const categories = await blogDB.getCategories();
const tags = await blogDB.getTags();

// Write
const result = await blogDB.createPost(postData, authorId);
await blogDB.updatePost(postId, postData, authorId);
await blogDB.deletePost(postId, authorId);
await blogDB.updatePostTags(postId, tagNames);

// Search
const posts = await blogDB.searchPosts(query, category);
const stats = await blogDB.getStats();
```

### pathsDB Methods
```javascript
// Read
const paths = await pathsDB.getAllPaths();
const path = await pathsDB.getPathById(id);
const path = await pathsDB.getPathByFullPath('/parent/child');
const children = await pathsDB.getPathChildren(parentId);
const descendants = await pathsDB.getPathDescendants(id);
const parent = await pathsDB.getParentPath(id);
const hierarchy = await pathsDB.getPathHierarchy();

// Write
const result = await pathsDB.createPath(pathData, userId);
await pathsDB.updatePath(pathId, pathData);
await pathsDB.deletePath(pathId);

// Stats
const stats = await pathsDB.getPathStatistics();
const pathsWithPosts = await pathsDB.getPathsWithPostCount();
```

---

## 🚀 How to Update a Route

### Step 1: Change Import
```javascript
// ❌ OLD
import { db } from '$lib/db.js';

// ✅ NEW
import { userDB, blogDB, pathsDB } from '$lib/db.js';
```

### Step 2: Make Load Function Async
```javascript
// ❌ OLD
export function load({ locals }) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(locals.userId);
  return { user };
}

// ✅ NEW
export async function load({ locals }) {
  const user = await userDB.getUserById(locals.userId);
  return { user };
}
```

### Step 3: Make Action Async (Usually Already Is)
```javascript
// ✅ NEW (add await)
export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    
    // Old sync code
    // const result = db.prepare(...).run(...);
    
    // New async code
    const result = await userDB.changePassword(userId, oldPw, newPw);
    
    return { success: true };
  }
};
```

### Step 4: Handle Errors
```javascript
// ✅ NEW error handling
try {
  const result = await blogDB.updatePost(postId, data, userId);
  return { success: true };
} catch (error) {
  console.error('Update failed:', error.message);
  return fail(400, { error: error.message });
}
```

---

## 📄 Routes to Update (In Order)

### Critical Routes (Must Work)

#### 1. **src/routes/register/+page.server.js**
**Current Issue:** Using `db.prepare()` to insert users

**What to change:**
- Remove all `db.prepare()` calls
- Replace with `await userDB...` calls OR custom logic
- Use PostgreSQL directly for user creation (no userDB method yet)

**Time:** 15-20 minutes

---

#### 2. **src/routes/login/+page.server.js**
**Current Issue:** Using `db.prepare()` to get users

**What to change:**
- Use `await userDB.getUserById()` or query by email
- Use `await userDB.verifyPassword()` for password check
- Keep session logic same

**Time:** 10-15 minutes

---

#### 3. **src/routes/blog/+page.server.js**
**Current Issue:** Using `db.prepare()` to get all posts

**What to change:**
- Replace with `await blogDB.getAllPosts()`
- Keep error handling same

**Time:** 5 minutes

---

#### 4. **src/routes/blog/[slug]/+page.server.js**
**Current Issue:** Using `db.prepare()` to get single post

**What to change:**
- Replace with `await blogDB.getPostBySlug(slug)`
- Keep comments/reports same

**Time:** 5 minutes

---

### Important Routes (Should Work)

#### 5. **src/routes/profile/+page.server.js**
**What to change:**
- User get: `await userDB.getUserById()`
- Password change: `await userDB.changePassword()`
- Account delete: `await userDB.completeAccountDeletion()`

**Time:** 15 minutes

---

#### 6. **src/routes/admin/+page.server.js**
**What to change:**
- Get all users/stats: Create new methods or query directly
- Get reports: `await userDB.getAllContentReports()`

**Time:** 15-20 minutes

---

#### 7. **src/routes/admin/posts/+page.server.js**
**What to change:**
- Get posts: `await blogDB.getAllPosts()`
- Delete post: `await blogDB.deletePost()`
- Update tags: `await blogDB.updatePostTags()`

**Time:** 15 minutes

---

#### 8. **src/routes/admin/reports/+page.server.js**
**What to change:**
- Get reports: `await userDB.getAllContentReports()`
- Update status: `await userDB.updateContentReportStatus()`

**Time:** 10 minutes

---

## ⚠️ Known Issues & Solutions

### Issue 1: No userDB Method for Creating Users
**Problem:** We don't have `userDB.createUser()` method

**Solution:** Query PostgreSQL directly in register route:
```javascript
import { pool } from '$lib/db.js';

const result = await pool.query(`
  INSERT INTO users (email, display_name, password_hash, status)
  VALUES ($1, $2, $3, 'pending')
  RETURNING id, email
`, [email, displayName, hashedPassword]);

const newUser = result.rows[0];
```

---

### Issue 2: No userDB Method to Get User by Email
**Problem:** Login needs to find user by email

**Solution:** Query PostgreSQL directly in login route:
```javascript
import { pool } from '$lib/db.js';

const result = await pool.query(
  'SELECT * FROM users WHERE email = $1',
  [email.toLowerCase()]
);

const user = result.rows[0];
```

---

### Issue 3: Load Functions Must Be Async
**Problem:** Old code has sync load functions

**Solution:** Add `async` keyword:
```javascript
// ❌ OLD
export function load({ locals }) {
  // ...
}

// ✅ NEW
export async function load({ locals }) {
  // ...
}
```

---

### Issue 4: Authentication Not Working
**Problem:** Routes check `locals.user` but auth might be broken

**Solution:** Check `src/hooks.server.js` file - may need updating too

---

## 🧪 Testing Strategy

### Test Each Route After Update

```bash
# 1. Test register
curl -X POST http://localhost:5173/register \
  -d "email=test@test.com&display_name=Test&password=password123&confirm_password=password123"

# 2. Test login
curl -X POST http://localhost:5173/login \
  -d "email=test@test.com&password=password123"

# 3. Test blog
curl http://localhost:5173/blog

# 4. Test blog post
curl http://localhost:5173/blog/my-first-post
```

### Check Logs

After each update, check browser console for:
- ✅ No `db.prepare()` errors
- ✅ Proper async/await
- ✅ Database queries working
- ✅ Data displaying

---

## 📝 Conversion Checklist

For each route:

- [ ] Change import to use `userDB`, `blogDB`, `pathsDB`
- [ ] Make `load()` function `async`
- [ ] Replace all `db.prepare()` with `await module.method()`
- [ ] Add `try/catch` around database calls
- [ ] Update error handling (no more `.changes === 0`)
- [ ] Handle auth checks (some moved into methods)
- [ ] Test the route works
- [ ] Check browser console for errors
- [ ] Verify data displays correctly

---

## 🚀 Summary

**What's Happening:**
1. Database layer converted from SQLite sync → PostgreSQL async
2. Routes still use old SQLite sync code
3. Need to update routes to use new async methods

**Why:**
- PostgreSQL is scalable, SQLite is not
- Async is non-blocking, better for servers
- New methods handle auth/validation internally

**How:**
- Replace `db.prepare()` with `await userDB.method()`
- Make load/action functions `async`
- Handle errors with try/catch
- Test each route after updating

**Next Steps:**
1. Read this document ✅
2. I'll create update guide for each route
3. Update routes one by one
4. Test each one
5. Fix any errors

---

## 📚 Reference Docs

See also:
- `PHASE_2_2_REVIEW_SUMMARY.md` - userDB patterns
- `PHASE_2_3_REVIEW_SUMMARY.md` - blogDB patterns
- `PHASE_2_4_REVIEW_SUMMARY.md` - pathsDB patterns
- `POSTGRESQL_SCHEMA_GUIDE.md` - Database schema

---

**Ready to update routes?** Let me know! 🚀
