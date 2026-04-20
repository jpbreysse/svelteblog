# Step 2: Database Abstraction Layer Migration - Detailed Guide

## 🎯 What is Step 2?

Step 2 is about converting your **entire database layer from synchronous (SQLite) to asynchronous (PostgreSQL)**.

This is the **biggest and most critical step** because if done incorrectly, nothing will work.

---

## 📊 What Needs to Change

You need to refactor **3 main database files**:

1. **`src/lib/db.js`** - Main database abstraction (biggest: ~500 lines)
   - `blogDB` object with ~15 methods
   - `userDB` object with ~10 methods
   
2. **`src/lib/paths.js`** - Hierarchical path management (~600 lines)
   - `pathsDB` object with ~15 methods
   - Most complex due to recursive queries

3. **Connection pooling setup** - New file or section in db.js
   - Create PostgreSQL connection pool
   - Replace SQLite database connection

---

## 🔄 The Transformation Pattern

Every single function follows this pattern:

### BEFORE (Synchronous SQLite)
```javascript
export const blogDB = {
  // ❌ SYNC - No async keyword
  // ❌ No await needed
  // ❌ Results are immediate
  getPostById(id) {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    return post ? { ...post, created_at: new Date(post.created_at) } : null;
  }
};
```

### AFTER (Asynchronous PostgreSQL)
```javascript
export const blogDB = {
  // ✅ ASYNC - Must add async keyword
  // ✅ Awaits the database call
  // ✅ Results come from promises
  async getPostById(id) {
    const result = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
    const post = result.rows[0];
    return post ? { ...post, created_at: new Date(post.created_at) } : null;
  }
};
```

**Key differences:**
1. Add `async` keyword to function
2. Change `db.prepare()` to `await pool.query()`
3. Change `?` to `$1, $2, $3` (parameter placeholders)
4. Change `.get()` to `result.rows[0]`
5. Change `.all()` to `result.rows`

---

## 📋 Detailed Step 2 Plan

### Phase 2.1: Create PostgreSQL Connection Pool (1-2 hours)

**File:** `src/lib/db.js` (beginning of file)

**Current code (SQLite):**
```javascript
import Database from 'better-sqlite3';
import { dev } from '$app/environment';
import bcrypt from 'bcrypt';

const db = new Database(dev ? 'dev.db' : 'prod.db');
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
```

**New code (PostgreSQL):**
```javascript
import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DATABASE_POOL_SIZE || '10'),
  idleTimeoutMillis: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT || '30000'),
});

// Test the connection
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL');
});

console.log('🔄 Initializing PostgreSQL connection pool...');
```

**What this does:**
- Replaces SQLite's single database connection with a connection pool
- Pool manages multiple connections (up to 10)
- Each connection can handle one request
- Connections are recycled after use

**Test it works:**
```bash
npm run dev
# Should see: ✅ Connected to PostgreSQL
```

---

### Phase 2.2: Refactor `userDB` Object (2-3 hours)

**File:** `src/lib/db.js` - The `userDB` object

This is the simplest object to start with (only ~10 methods).

#### Method 1: `getUserById`

**BEFORE (SQLite - Synchronous):**
```javascript
export const userDB = {
  getUserById(id) {
    return db.prepare('SELECT id, email, display_name, role, status, created_at FROM users WHERE id = ?').get(id);
  }
};
```

**AFTER (PostgreSQL - Asynchronous):**
```javascript
export const userDB = {
  async getUserById(id) {
    const result = await pool.query(
      'SELECT id, email, display_name, role, status, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }
};
```

**Changes:**
- ✅ Add `async` keyword
- ✅ Add `await` to `pool.query()`
- ✅ Change `?` to `$1`
- ✅ Change `.get()` to `result.rows[0]`
- ✅ Handle no-results case with `|| null`

---

#### All `userDB` Methods to Convert

1. `getUserById` - Simple GET
2. `verifyPassword` - Already async, update queries
3. `changePassword` - Already async, update queries
4. `completeAccountDeletion` - Has transaction, needs refactor
5. `getPendingDeletions` - Simple SELECT multiple
6. `createContentReport` - INSERT
7. `getAllContentReports` - SELECT multiple with JOINs
8. `getContentReportById` - SELECT single with JOINs
9. `updateContentReportStatus` - UPDATE
10. `resetUserPassword` - UPDATE

---

### Phase 2.3: Refactor `blogDB` Object (3-4 hours)

**File:** `src/lib/db.js` - The `blogDB` object

This object has ~15 methods, mostly straightforward but some use GROUP_CONCAT (SQLite).

#### Key SQLite → PostgreSQL Changes for `blogDB`

**Issue 1: GROUP_CONCAT doesn't exist in PostgreSQL**

**BEFORE (SQLite):**
```javascript
const posts = db.prepare(`
  SELECT 
    p.*,
    u.display_name,
    GROUP_CONCAT(t.name) as tags  // ← SQLite specific
  FROM posts p
  INNER JOIN users u ON p.author_id = u.id
  LEFT JOIN post_tags pt ON p.id = pt.post_id
  LEFT JOIN tags t ON pt.tag_id = t.id
  WHERE p.published = 1
  GROUP BY p.id
  ORDER BY p.created_at DESC
`).all();
```

**AFTER (PostgreSQL):**
```javascript
const result = await pool.query(`
  SELECT 
    p.*,
    u.display_name,
    array_agg(t.name) as tags  // ← PostgreSQL equivalent
  FROM posts p
  INNER JOIN users u ON p.author_id = u.id
  LEFT JOIN post_tags pt ON p.id = pt.post_id
  LEFT JOIN tags t ON pt.tag_id = t.id
  WHERE p.published = 1
  GROUP BY p.id
  ORDER BY p.created_at DESC
`);

const posts = result.rows;
// Note: tags will be an array, not comma-separated string
// Return: tags = ['tag1', 'tag2', 'tag3']
```

**Changes:**
- ✅ `GROUP_CONCAT(t.name)` → `array_agg(t.name)`
- ✅ Result is a PostgreSQL array `['tag1', 'tag2']` instead of `'tag1,tag2'`
- ✅ No need to `.split(',')` in JavaScript anymore
- ✅ Add `await pool.query()`

---

#### Example `blogDB` Methods:

**Method 1: `getAllPosts`**

**BEFORE:**
```javascript
getAllPosts() {
  const posts = db.prepare(`
    SELECT 
      p.*,
      u.display_name, u.email,
      GROUP_CONCAT(t.name) as tags
    FROM posts p
    INNER JOIN users u ON p.author_id = u.id
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.published = 1
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();

  return posts.map(post => ({
    ...post,
    author: post.display_name,
    tags: post.tags ? post.tags.split(',') : [],
    created_at: new Date(post.created_at),
    updated_at: new Date(post.updated_at)
  }));
}
```

**AFTER:**
```javascript
async getAllPosts() {
  const result = await pool.query(`
    SELECT 
      p.*,
      u.display_name, u.email,
      array_agg(t.name) as tags
    FROM posts p
    INNER JOIN users u ON p.author_id = u.id
    LEFT JOIN post_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.published = 1
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);

  return result.rows.map(post => ({
    ...post,
    author: post.display_name,
    tags: post.tags || [],  // Already an array from PostgreSQL
    created_at: new Date(post.created_at),
    updated_at: new Date(post.updated_at)
  }));
}
```

**Changes:**
- ✅ Add `async` keyword
- ✅ Change `GROUP_CONCAT(t.name)` to `array_agg(t.name)`
- ✅ Add `await pool.query()`
- ✅ Change `.all()` to `result.rows`
- ✅ Remove `.split(',')` - already array from PostgreSQL
- ✅ Change `.split(',') ? ... : []` to just `post.tags || []`

---

### Phase 2.4: Refactor `pathsDB` Object (4-5 hours)

**File:** `src/lib/paths.js` - The `pathsDB` object

This is the **most complex** due to recursive queries and path manipulation.

#### Key Changes for `pathsDB`

**Issue: Recursive queries with LIKE**

The paths system uses recursive logic:

```javascript
// BEFORE - SQLite (synchronous)
getPathTree(parentId = null, maxDepth = 5) {
  const paths = parentId
    ? this.getChildPaths(parentId)
    : this.getRootPaths();

  if (maxDepth <= 0) return paths;

  return paths.map(path => ({
    ...path,
    children: this.getPathTree(path.id, maxDepth - 1)  // ← Recursive
  }));
}
```

**AFTER - PostgreSQL with async recursion**

```javascript
// AFTER - PostgreSQL (asynchronous)
async getPathTree(parentId = null, maxDepth = 5) {
  const paths = parentId
    ? await this.getChildPaths(parentId)  // ← Add await
    : await this.getRootPaths();          // ← Add await

  if (maxDepth <= 0) return paths;

  return await Promise.all(
    paths.map(async (path) => ({
      ...path,
      children: await this.getPathTree(path.id, maxDepth - 1)  // ← Await and async
    }))
  );
}
```

**Changes:**
- ✅ Make function `async`
- ✅ `await` all database calls
- ✅ Use `Promise.all()` for parallel recursive calls
- ✅ Make map callback `async`
- ✅ `await` the recursive call

---

## 📊 Step 2 Work Breakdown

| Phase | Task | Time | Complexity |
|-------|------|------|------------|
| 2.1 | Create connection pool | 1-2h | Low |
| 2.2 | Refactor `userDB` (10 methods) | 2-3h | Low-Med |
| 2.3 | Refactor `blogDB` (13 methods) | 3-4h | Medium |
| 2.4 | Refactor `pathsDB` (14 methods) | 4-5h | Medium-High |
| 2.5 | Create PostgreSQL schema | 1-2h | Low |
| 2.6 | Testing & debugging | 2-3h | High |
| **Total** | **Refactor db layer** | **~13-19h** | **Medium** |

---

## 🎯 Step 2 Success Criteria

After Step 2 is complete, these should all work:

✅ `npm run dev` starts without database errors  
✅ Connection pool logs "Connected to PostgreSQL"  
✅ Can create a new user  
✅ Can create a new post  
✅ Can retrieve posts  
✅ Can search posts  
✅ Can manage paths (create, update, delete)  
✅ Transactions rollback on error  
✅ All 25+ API endpoints return correct responses  

---

## ⚠️ Common Mistakes in Step 2

### Mistake 1: Forgetting `await`
```javascript
// ❌ WRONG - Returns a promise, not data
const posts = pool.query('SELECT * FROM posts');
console.log(posts[0]);  // Undefined!

// ✅ CORRECT
const result = await pool.query('SELECT * FROM posts');
console.log(result.rows[0]);  // Works!
```

### Mistake 2: Not Converting All Callers
If you convert `userDB.getUserById()` to async, you MUST add `await` in all places that call it.

```javascript
// ❌ WRONG
const user = userDB.getUserById(1);  // Returns promise
console.log(user.email);  // Undefined!

// ✅ CORRECT
const user = await userDB.getUserById(1);
console.log(user.email);  // Works!
```

### Mistake 3: Forgetting to Release Connections
```javascript
// ❌ WRONG - Connection leak
async createPost(data) {
  const client = await pool.connect();
  await client.query('BEGIN');
  // ... code ...
  // Never called client.release()!
  // Connection stays open forever
}

// ✅ CORRECT
async createPost(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ... code ...
  } finally {
    client.release();  // Always released
  }
}
```

### Mistake 4: Wrong Parameter Placeholders
```javascript
// ❌ WRONG - SQLite style
await pool.query('SELECT * FROM users WHERE id = ?', [userId]);

// ✅ CORRECT - PostgreSQL style
await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
```

### Mistake 5: GROUP_CONCAT → array_agg
```javascript
// ❌ WRONG - SQLite function
GROUP_CONCAT(t.name) as tags

// ✅ CORRECT - PostgreSQL function
array_agg(t.name) as tags
```

---

## 🚀 How to Execute Step 2

### Recommended Approach: Small Increments

**Day 1: Foundation**
- Phase 2.1: Connection pool (1-2h)
- Test connection works

**Day 2: Simpler Objects**
- Phase 2.2: Refactor `userDB` (2-3h)
- Manually test each function
- Fix any issues

**Day 3: Blog Database**
- Phase 2.3: Refactor `blogDB` (3-4h)
- Test create/read/update posts
- Test search and categories

**Day 4: Complex Paths**
- Phase 2.4: Refactor `pathsDB` (4-5h)
- Test path operations
- Debug recursive queries if needed

**Day 5: Integration Testing**
- Phase 2.5-2.6: Schema and full testing (4-5h)
- Start dev server
- Test all endpoints
- Fix any remaining issues

---

## ✅ Step 2 Checklist

- [ ] Phase 2.1: Connection pool created
- [ ] Phase 2.1: Test connection works with `npm run dev`
- [ ] Phase 2.2: All `userDB` methods converted to async
- [ ] Phase 2.2: `userDB` methods tested
- [ ] Phase 2.3: All `blogDB` methods converted to async
- [ ] Phase 2.3: Blog methods tested (create, read, update, delete)
- [ ] Phase 2.4: All `pathsDB` methods converted to async
- [ ] Phase 2.4: Path methods tested (tree, create, move, delete)
- [ ] Phase 2.5: Schema.sql created
- [ ] Phase 2.6: Dev server starts without errors
- [ ] Phase 2.6: All API endpoints tested
- [ ] Phase 2.6: No connection pool errors

---

## 🔍 Key Files to Modify in Step 2

1. **`src/lib/db.js`** - Add pool, convert `userDB` and `blogDB`
2. **`src/lib/paths.js`** - Convert all `pathsDB` methods
3. **`src/lib/auth.js`** - Check if needs updates (probably minimal)
4. **Create:** `init-scripts/01-schema.sql` - PostgreSQL schema

---

## Next After Step 2

Once Step 2 is complete, you'll move to:

**Step 3:** Update all API endpoints to use `await`  
**Step 4:** Update server load functions to be async  
**Step 5:** Full integration testing  
**Step 6:** Deploy and optimize  

---

Ready to start Step 2?
