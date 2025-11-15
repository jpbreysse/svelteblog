# Quick Reference: Sync (SQLite) vs Async (PostgreSQL) Code Patterns

## Pattern 1: Simple Query

### Current (better-sqlite3) - Synchronous
```javascript
const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(1);
console.log('Post loaded:', post.title);  // ← Runs immediately
```

### New (pg driver) - Asynchronous
```javascript
const result = await pool.query('SELECT * FROM posts WHERE id = $1', [1]);
const post = result.rows[0];
console.log('Post loaded:', post.title);  // ← Runs after query completes
```

**Key Changes:**
- Add `await` keyword
- Function must be `async`
- Use `$1, $2` instead of `?`
- Access data via `result.rows[0]` instead of direct return
- `.get()` becomes `query()` with `result.rows[0]`

---

## Pattern 2: Multiple Results

### Current (better-sqlite3) - Synchronous
```javascript
export const blogDB = {
  getAllPosts() {
    const posts = db.prepare(`
      SELECT p.*, u.display_name
      FROM posts p
      JOIN users u ON p.author_id = u.id
      ORDER BY p.created_at DESC
    `).all();
    
    return posts.map(post => ({
      ...post,
      created_at: new Date(post.created_at)
    }));
  }
};
```

### New (pg driver) - Asynchronous
```javascript
export const blogDB = {
  async getAllPosts() {  // ← Add 'async'
    const result = await pool.query(`  // ← Add 'await'
      SELECT p.*, u.display_name
      FROM posts p
      JOIN users u ON p.author_id = u.id
      ORDER BY p.created_at DESC
    `);
    
    return result.rows.map(post => ({  // ← Use result.rows
      ...post,
      created_at: new Date(post.created_at)
    }));
  }
};
```

**Key Changes:**
- Add `async` to function
- Add `await` to query
- Use `result.rows` instead of direct return
- Everything else stays the same

---

## Pattern 3: Insert with Returning ID

### Current (better-sqlite3) - Synchronous
```javascript
const result = db.prepare(`
  INSERT INTO posts (title, content, author_id)
  VALUES (?, ?, ?)
`).run(title, content, authorId);

const postId = result.lastInsertRowid;
```

### New (pg driver) - Asynchronous
```javascript
const result = await pool.query(`
  INSERT INTO posts (title, content, author_id)
  VALUES ($1, $2, $3)
  RETURNING id  // ← Add this
`, [title, content, authorId]);

const postId = result.rows[0].id;
```

**Key Changes:**
- Add `RETURNING id` to the SQL
- Use `result.rows[0].id` instead of `lastInsertRowid`
- Add `await`
- Add `async` to function

---

## Pattern 4: Transactions (Most Complex Change)

### Current (better-sqlite3) - Synchronous
```javascript
async createPostWithTags(postData, authorId, tags) {
  const transaction = db.transaction(() => {
    // Start transaction
    const result = db.prepare(`
      INSERT INTO posts (title, content, author_id)
      VALUES (?, ?, ?)
    `).run(postData.title, postData.content, authorId);
    
    const postId = result.lastInsertRowid;
    
    // Inside same transaction
    for (const tag of tags) {
      db.prepare(`
        INSERT INTO tags (name)
        VALUES (?)
      `).run(tag);
    }
    
    return postId;
    // Auto-commits if no error
    // Auto-rollbacks if error thrown
  });
  
  return transaction();  // Execute transaction
}
```

### New (pg driver) - Asynchronous
```javascript
async createPostWithTags(postData, authorId, tags) {
  const client = await pool.connect();  // ← Get dedicated connection
  try {
    await client.query('BEGIN');  // ← Start transaction
    
    // Insert post
    const result = await client.query(`
      INSERT INTO posts (title, content, author_id)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [postData.title, postData.content, authorId]);
    
    const postId = result.rows[0].id;
    
    // Insert tags (inside same transaction)
    for (const tag of tags) {
      await client.query(`
        INSERT INTO tags (name)
        VALUES ($1)
      `, [tag]);
    }
    
    await client.query('COMMIT');  // ← Commit transaction
    return postId;
    
  } catch (error) {
    await client.query('ROLLBACK');  // ← Rollback on error
    throw error;
  } finally {
    client.release();  // ← Always release connection
  }
}
```

**Key Changes:**
- Get dedicated client from pool
- Explicit `BEGIN` instead of `db.transaction()`
- Explicit `COMMIT` instead of auto-commit
- Explicit `ROLLBACK` in catch block
- Must `release()` connection in finally
- Every operation needs `await`

---

## Pattern 5: API Endpoint

### Current (better-sqlite3) - Synchronous
```javascript
export async function POST({ request, locals }) {
  if (!locals.user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const postData = await request.json();
    
    // This is synchronous!
    const post = blogDB.createPost(postData, locals.user.id);
    
    return json({ success: true, post }, { status: 201 });
  } catch (error) {
    return json({ error: error.message }, { status: 400 });
  }
}
```

### New (pg driver) - Asynchronous
```javascript
export async function POST({ request, locals }) {
  if (!locals.user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const postData = await request.json();
    
    // Now MUST use await
    const post = await blogDB.createPost(postData, locals.user.id);
    
    return json({ success: true, post }, { status: 201 });
  } catch (error) {
    return json({ error: error.message }, { status: 400 });
  }
}
```

**Key Changes:**
- Add `await` when calling async database methods
- Everything else is the same
- Already inside async function, so no function signature change needed

---

## Pattern 6: Server Load Function

### Current (better-sqlite3) - Synchronous
```javascript
export function load({ params }) {
  try {
    const post = blogDB.getPostBySlug(params.slug);  // ← Synchronous
    
    if (!post) {
      throw error(404, 'Post not found');
    }
    
    return { post };
  } catch (err) {
    throw error(500, 'Failed to load post');
  }
}
```

### New (pg driver) - Asynchronous
```javascript
export async function load({ params }) {  // ← Add 'async'
  try {
    const post = await blogDB.getPostBySlug(params.slug);  // ← Add 'await'
    
    if (!post) {
      throw error(404, 'Post not found');
    }
    
    return { post };
  } catch (err) {
    throw error(500, 'Failed to load post');
  }
}
```

**Key Changes:**
- Add `async` to function
- Add `await` to database calls
- Everything else stays the same

---

## Pattern 7: Multiple Sequential Operations

### Current (better-sqlite3) - Synchronous
```javascript
function getUserWithPosts(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const posts = db.prepare('SELECT * FROM posts WHERE author_id = ?').all(userId);
  const stats = db.prepare('SELECT COUNT(*) as count FROM posts WHERE author_id = ?').get(userId);
  
  return {
    user,
    posts,
    stats: stats.count
  };
}
```

### New (pg driver) - Asynchronous
```javascript
async function getUserWithPosts(userId) {  // ← Add 'async'
  const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  const postsResult = await pool.query('SELECT * FROM posts WHERE author_id = $1', [userId]);
  const statsResult = await pool.query('SELECT COUNT(*) as count FROM posts WHERE author_id = $1', [userId]);
  
  return {
    user: userResult.rows[0],
    posts: postsResult.rows,
    stats: parseInt(statsResult.rows[0].count)
  };
}
```

**Key Changes:**
- Add `async` to function
- Add `await` to each query
- Use `result.rows[0]` or `result.rows` to access data

---

## Parameter Binding: `?` vs `$1, $2`

### SQLite Style (Current)
```javascript
db.prepare('INSERT INTO posts (title, content) VALUES (?, ?)').run(title, content);
```

### PostgreSQL Style (New)
```javascript
await pool.query('INSERT INTO posts (title, content) VALUES ($1, $2)', [title, content]);
```

**Rule:**
- SQLite: Use `?` for each parameter in order
- PostgreSQL: Use `$1, $2, $3...` for each parameter in order
- PostgreSQL requires parameters in an array as second argument

---

## Connection Management

### Current: Single Connection
```javascript
const db = new Database('dev.db');
// Single connection for entire app
```

### New: Connection Pool
```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,  // Maximum 10 connections
  idleTimeoutMillis: 30000,  // Close after 30 seconds idle
});

// For regular queries
await pool.query('SELECT * FROM posts');

// For transactions (need dedicated connection)
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... your transaction
  await client.query('COMMIT');
} finally {
  client.release();
}
```

---

## Summary of Required Changes

| Aspect | SQLite | PostgreSQL |
|--------|--------|------------|
| **Function async** | No | Yes - `async` keyword required |
| **Query execution** | Synchronous | Asynchronous - `await` required |
| **Parameter style** | `?` | `$1, $2, $3` |
| **Get single row** | `.get()` returns object | `result.rows[0]` |
| **Get multiple rows** | `.all()` returns array | `result.rows` |
| **Get insert ID** | `result.lastInsertRowid` | Add `RETURNING id`, use `result.rows[0].id` |
| **Row count** | `result.changes` | `result.rowCount` |
| **Transactions** | `db.transaction(() => {})` | `BEGIN/COMMIT/ROLLBACK` or client transactions |
| **Connection** | Single instance | Pool of connections |

This is your reference guide for Step 2!
