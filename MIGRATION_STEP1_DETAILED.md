# Step 1 Detailed: PostgreSQL Driver Setup & Environment Configuration

## Overview
This step involves:
1. **Adding PostgreSQL driver to package.json**
2. **Updating environment variables for PostgreSQL connection**
3. **Understanding the sync → async impact on your codebase**

---

## 1. PostgreSQL Driver Options & Impact Comparison

### Current Situation: `better-sqlite3` (Synchronous)
```javascript
// CURRENT - Synchronous, blocking
const db = new Database('dev.db');
const result = db.prepare('SELECT * FROM posts').all(); // Blocks execution
console.log('Done');  // Runs after query completes
```

**Characteristics:**
- ✅ Easy to read/write
- ✅ No callbacks or promises
- ❌ Blocks event loop - bad for production
- ❌ Can't handle multiple concurrent requests well
- ❌ No connection pooling

---

### Option A: `pg` driver (Recommended for your case - closest migration)

```bash
npm install pg dotenv
npm install --save-dev @types/pg  # If using TypeScript
```

**Impact on code:**
```javascript
// NEW - Async, non-blocking
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Must be async
const result = await pool.query('SELECT * FROM posts');
console.log('Done');  // Runs after query completes
```

**Characteristics:**
- ✅ Minimal syntax changes from current
- ✅ Direct SQL control (like current)
- ✅ Built-in connection pooling
- ✅ Standard PostgreSQL driver
- ⚠️ You manage transactions manually
- ⚠️ Every database method becomes async

**Size:** ~9 MB (moderate)
**Learning curve:** Low (you keep SQL control)
**Migration effort:** ~50-60 hours

---

### Option B: `postgres` (Simpler syntax, newer)

```bash
npm install postgres
```

**Impact on code:**
```javascript
// NEW - More elegant async syntax
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);

const result = await sql`SELECT * FROM posts`;
console.log('Done');
```

**Characteristics:**
- ✅ Cleaner syntax (template literals)
- ✅ Automatic connection pooling
- ✅ Built-in transaction support
- ✅ Slightly smaller bundle
- ⚠️ Less mature than `pg`
- ⚠️ Less StackOverflow resources

**Size:** ~2 MB (smaller)
**Learning curve:** Low-Medium
**Migration effort:** ~50-60 hours (similar)

---

### Option C: Prisma ORM

```bash
npm install @prisma/client
npm install -D prisma
npx prisma init
```

**Impact on code:**
```javascript
// NEW - Type-safe, abstracted
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const result = await prisma.posts.findMany();
console.log('Done');
```

**Characteristics:**
- ✅ Automatic migrations
- ✅ Type safety (schema-driven)
- ✅ Best transaction handling
- ✅ Migration management
- ❌ Larger learning curve
- ❌ Less direct SQL control
- ❌ Requires schema.prisma file rewrite

**Size:** ~15 MB
**Learning curve:** Medium-High
**Migration effort:** ~70-90 hours

---

## 2. What Changes in Your Code - Detailed Impact

### The Core Problem: Sync → Async

Your current `db.js` looks like this:
```javascript
// CURRENT - Synchronous
export const blogDB = {
  getAllPosts() {
    const posts = db.prepare(`SELECT ...`).all();  // ← Blocks here
    return posts.map(post => ({ ...post }));
  },

  createPost(postData, authorId) {
    const transaction = db.transaction(() => {
      // ← Sync transaction
      const result = db.prepare(`INSERT ...`).run(...);
      const postId = result.lastInsertRowid;
      this.updatePostTags(postId, tags);
      return postId;
    });
    return transaction();
  }
};
```

With PostgreSQL, **you cannot write code like this anymore** because:
1. Queries are async (return promises)
2. You can't call `.map()` immediately on a promise
3. Transactions must be async
4. Every method that touches the database must be `async`

### The Required Changes

```javascript
// NEW - Asynchronous
export const blogDB = {
  async getAllPosts() {  // ← Must be async
    const result = await pool.query('SELECT ...');  // ← Must await
    const posts = result.rows;
    return posts.map(post => ({ ...post }));
  },

  async createPost(postData, authorId) {  // ← Must be async
    const client = await pool.connect();  // ← Get dedicated connection
    try {
      await client.query('BEGIN');  // ← Start transaction
      
      const result = await client.query('INSERT ...');  // ← Await insert
      const postId = result.rows[0].id;
      
      await this.updatePostTags(postId, tags);  // ← Await nested call
      
      await client.query('COMMIT');  // ← Commit transaction
      return postId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};
```

### Cascade Impact - Everything Becomes Async

```javascript
// API ROUTE - Must also be async
export async function POST({ request, locals }) {
  try {
    const postData = await request.json();
    
    // This now MUST be await
    const post = await blogDB.createPost(postData, locals.user.id);  // ← AWAIT
    
    return json({ success: true, post }, { status: 201 });
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 400 });
  }
}
```

```javascript
// SERVER ROUTE - Must also be async
export async function load({ params }) {
  try {
    const post = await blogDB.getPostBySlug(params.slug);  // ← AWAIT
    if (!post) throw error(404);
    return { post };
  } catch (err) {
    throw error(500);
  }
}
```

---

## 3. Step 1 Tasks - What You Need to Do

### Task 1.1: Update `.env.example`
Add database connection configuration:

```bash
# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-that-is-at-least-32-characters-long-and-secure

# App Configuration
PUBLIC_APP_NAME=Community Blog
PUBLIC_APP_DESCRIPTION=Share your thoughts...

# PostgreSQL Connection (add these lines)
DATABASE_URL=postgresql://supportuser:your_secure_password_here@localhost:5432/support_system
DATABASE_POOL_SIZE=10
DATABASE_POOL_IDLE_TIMEOUT=30000
```

**Why these variables?**
- `DATABASE_URL`: Connection string for the database
- `DATABASE_POOL_SIZE`: How many connections to keep in the pool (10 is good for dev)
- `DATABASE_POOL_IDLE_TIMEOUT`: Close idle connections after 30 seconds (optional, for dev)

---

### Task 1.2: Update your `.env` file
Replace with PostgreSQL connection:

```bash
JWT_SECRET=your-super-secret-jwt-key-that-is-at-least-32-characters-long-and-secure

PUBLIC_APP_NAME=Collectif TheFrenchAgora
PUBLIC_APP_DESCRIPTION=Partage tes idées avec le collectif

PUBLIC_BLOG_CATEGORIES=reflexions:Réflexions,ecologie:Écologie,politique:Politique,démocratie:Démocratie,autres:Autres

# PostgreSQL Connection
DATABASE_URL=postgresql://supportuser:your_secure_password_here@localhost:5432/support_system
DATABASE_POOL_SIZE=10
DATABASE_POOL_IDLE_TIMEOUT=30000
```

**Note:** Replace password with the one you set in your docker-compose.yml

---

### Task 1.3: Choose & Install PostgreSQL Driver

**Recommended: Use `pg` driver** (closest to your current pattern)

```bash
cd /Users/jean-philippebreysse/dev/node/sevlte/framework

npm install pg dotenv
npm install --save-dev @types/pg
```

**Your updated `package.json` dependencies will be:**
```json
{
  "dependencies": {
    "@sveltejs/adapter-node": "^5.3.1",
    "bcrypt": "^6.0.0",
    "dotenv": "^17.2.1",
    "jsonwebtoken": "^9.0.2",
    "quill": "^2.0.3",
    "pg": "^8.11.0"  // ← NEW
  },
  "devDependencies": {
    "@types/pg": "^8.11.0",  // ← NEW (for TypeScript support)
    // ... rest of dependencies
  }
}
```

**Why `pg`?**
- Direct drop-in replacement in terms of SQL control
- You keep using `db.prepare(...).all()` style mentally, just async
- Minimal learning curve
- Most documentation available
- Battle-tested in production

---

### Task 1.4: Create Schema Initialization File

You don't need to do this now, but understand what it is:

Create `init-scripts/01-enable-pgvector.sql`:
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create all your tables (posts, users, tags, paths, etc.)
-- We'll do this in Step 2
```

---

## 4. Specific Driver Impact on Your Architecture

### Impact on `db.js` Structure

| Current Pattern | PostgreSQL Driver | Impact |
|---|---|---|
| `const db = new Database()` | `const pool = new Pool()` | Connection pooling instead of single connection |
| `db.prepare(...).run()` | `await pool.query(...)` | Synchronous → Asynchronous |
| `db.prepare(...).all()` | `await pool.query(...); result.rows` | Synchronous → Asynchronous |
| `db.prepare(...).get()` | `await pool.query(...); result.rows[0]` | Synchronous → Asynchronous |
| `db.transaction(() => {})` | `BEGIN/COMMIT/ROLLBACK` | Must manage manually or use client |
| `lastInsertRowid` | `RETURNING id` clause | Different way to get inserted ID |
| `result.changes` | `result.rowCount` | Different property name |

### Example: How Query Results Change

**Current (SQLite):**
```javascript
const result = db.prepare('SELECT * FROM posts WHERE id = ?').get(1);
// result = { id: 1, title: 'Post 1', ... }
```

**New (PostgreSQL):**
```javascript
const result = await pool.query('SELECT * FROM posts WHERE id = $1', [1]);
// result = { rows: [{ id: 1, title: 'Post 1', ... }], rowCount: 1, ... }
// To get the row:
const post = result.rows[0];
```

### Example: How Inserts Change

**Current (SQLite):**
```javascript
const result = db.prepare('INSERT INTO posts (...) VALUES (...)').run(...);
const postId = result.lastInsertRowid;
```

**New (PostgreSQL):**
```javascript
const result = await pool.query(
  'INSERT INTO posts (...) VALUES (...) RETURNING id',
  [...]
);
const postId = result.rows[0].id;
```

---

## 5. What Doesn't Change

✅ **Your SQL queries** - They're already standard SQL, just need minor tweaks:
- Use `$1, $2, $3` instead of `?` for parameters
- Use `RETURNING id` instead of `lastInsertRowid`
- Most other queries work as-is

✅ **Your authentication** - bcrypt and JWT work the same way

✅ **Your business logic** - The algorithms stay the same, just async

✅ **Your API endpoints** - Already use SvelteKit which supports async

---

## 6. Docker Compose Connection Check

Assuming your docker-compose.yml looks like:
```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: supportuser
      POSTGRES_PASSWORD: your_secure_password_here
      POSTGRES_DB: support_system
    ports:
      - "5432:5432"
```

Your connection string in `.env` should be:
```
DATABASE_URL=postgresql://supportuser:your_secure_password_here@localhost:5432/support_system
```

**Connection URL formula:**
```
postgresql://username:password@host:port/database
```

---

## Summary - What You Need to Do for Step 1

- [ ] Install `pg` driver: `npm install pg dotenv && npm install --save-dev @types/pg`
- [ ] Update `.env.example` with DATABASE_URL and pool settings
- [ ] Update `.env` with your PostgreSQL connection details
- [ ] Verify your docker-compose.yml is correct
- [ ] **Understand**: Every database method will become `async` and require `await`
- [ ] **Understand**: Query results have different structure (`.rows` array)
- [ ] **Understand**: Parameters use `$1, $2` instead of `?`

---

## Next Steps After Step 1

Once this is done, you'll be ready for **Step 2: Database Abstraction Layer Migration** where you'll:
1. Refactor `db.js` to use the new `pg` driver with async/await
2. Update all database methods to be async
3. Handle transactions properly

---

## Troubleshooting

### "Cannot find module 'pg'"
```bash
npm install pg --save
```

### "Connection refused"
Check:
1. PostgreSQL is running: `docker-compose up -d`
2. Port 5432 is exposed: `docker-compose ps`
3. Credentials match: username, password, database name

### "PASSWORD authentication failed"
The password in DATABASE_URL must match the password in docker-compose.yml
