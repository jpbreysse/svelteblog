# Step 1: PostgreSQL Setup - Action Checklist

## Quick Summary
You're replacing SQLite (`better-sqlite3`) with PostgreSQL (`pg` driver). This requires:
1. Adding the driver to `package.json`
2. Configuring environment variables
3. Understanding that your code will need to become **async** (this is Step 2)

**Estimated Time: 15-20 minutes**

---

## ✅ Actions to Take

### [ ] 1. Install PostgreSQL Driver
```bash
cd /Users/jean-philippebreysse/dev/node/sevlte/framework

npm install pg dotenv
npm install --save-dev @types/pg
```

**What this does:**
- `pg` - PostgreSQL client for Node.js
- `dotenv` - Load environment variables from .env file
- `@types/pg` - TypeScript type definitions for pg

**Check it worked:**
```bash
npm list pg
# Should show: pg@8.x.x (or higher)
```

---

### [ ] 2. Update `.env.example`

Open `.env.example` and add these lines at the end:

```bash
# PostgreSQL Connection
DATABASE_URL=postgresql://supportuser:your_secure_password_here@localhost:5432/support_system
DATABASE_POOL_SIZE=10
DATABASE_POOL_IDLE_TIMEOUT=30000
```

---

### [ ] 3. Update `.env` for Local Development

Open `.env` and add these lines at the end:

```bash
# PostgreSQL Connection
DATABASE_URL=postgresql://supportuser:your_secure_password_here@localhost:5432/support_system
DATABASE_POOL_SIZE=10
DATABASE_POOL_IDLE_TIMEOUT=30000
```

**Important:** The password and database name MUST match what's in your `docker-compose.yml`

---

### [ ] 4. Verify Your Docker Compose Setup

Open your `docker-compose.yml` and confirm it has:

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

**Note the three values:**
- `POSTGRES_USER=supportuser` → matches `.env` username
- `POSTGRES_PASSWORD=your_secure_password_here` → matches `.env` password
- `POSTGRES_DB=support_system` → matches `.env` database name
- `5432:5432` → port is 5432

---

### [ ] 5. Start PostgreSQL Container

```bash
# From your project directory
docker-compose up -d

# Verify it's running
docker-compose ps
# Should show: postgres-pgvector (or similar) as UP
```

---

### [ ] 6. Verify Connection Works (Optional but Recommended)

Create a test file to verify the database connection:

```bash
# From your project directory, create this file:
cat > test-pg-connection.js << 'EOF'
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testConnection() {
  try {
    console.log('Testing PostgreSQL connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Connection successful!');
    console.log('Current timestamp:', result.rows[0].now);
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed:');
    console.error(error.message);
    process.exit(1);
  }
}

testConnection();
EOF
```

Then run it:
```bash
node test-pg-connection.js

# Expected output:
# Testing PostgreSQL connection...
# ✅ Connection successful!
# Current timestamp: 2025-11-15T14:30:45.123456Z
```

If you get an error, check:
- Docker is running: `docker-compose ps`
- Credentials match in `.env` and `docker-compose.yml`
- Port 5432 is not blocked

---

## 📋 What You Should Understand Before Moving to Step 2

These are the **key differences** that will affect your Step 2 work:

### Current (SQLite - Synchronous)
```javascript
// Runs immediately, blocks execution
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(1);
console.log('User loaded'); // Runs right after
```

### New (PostgreSQL - Asynchronous)
```javascript
// Returns a promise, doesn't block execution
const result = await pool.query('SELECT * FROM users WHERE id = $1', [1]);
const user = result.rows[0];
console.log('User loaded'); // Runs only after query completes
```

**What changes:**
1. Every database function must be `async`
2. Every database call must use `await`
3. Parameter style changes from `?` to `$1, $2, $3`
4. Results accessed via `.rows[0]` or `.rows` instead of direct return

---

## ⚠️ Common Mistakes to Avoid

### ❌ Mistake 1: Wrong Password
```javascript
// WRONG - Copy-pasted placeholder
DATABASE_URL=postgresql://supportuser:your_secure_password_here@localhost:5432/support_system

// RIGHT - Use actual password
DATABASE_URL=postgresql://supportuser:password123@localhost:5432/support_system
```

### ❌ Mistake 2: Missing Environment Variable Reload
After updating `.env`, you might need to:
```bash
# Restart your dev server
npm run dev

# Or in a new terminal
node test-pg-connection.js
```

### ❌ Mistake 3: Port Conflicts
If you get "port 5432 already in use":
```bash
# Find what's using port 5432
lsof -i :5432

# Or just use Docker's port mapping
# In docker-compose.yml: "5433:5432" to use external port 5433
```

### ❌ Mistake 4: Forgetting `.finally()` or `client.release()`
In transactions, always release the connection:
```javascript
const client = await pool.connect();
try {
  // ... do stuff
} finally {
  client.release();  // ← Don't forget this!
}
```

---

## ✅ You're Done with Step 1 When:

- [ ] `npm list pg` shows pg installed
- [ ] `.env` contains DATABASE_URL
- [ ] `.env.example` is updated
- [ ] `docker-compose ps` shows postgres running
- [ ] `node test-pg-connection.js` returns ✅ Connection successful
- [ ] You understand the difference between sync and async

---

## Next Step: Step 2

Once Step 1 is complete, you'll be ready for **Step 2: Database Abstraction Layer Migration**

In Step 2 you'll:
1. Create new `db.js` that uses the `pg` driver
2. Convert all functions to be `async`
3. Update all queries to use `$1, $2` syntax
4. Test the database layer

See: `MIGRATION_SYNC_ASYNC_REFERENCE.md` for code examples when you get there.

---

## Questions?

Before moving to Step 2, make sure you can answer:

1. **Q: Why are we switching from SQLite to PostgreSQL?**
   - A: PostgreSQL supports pgvector for semantic search, better concurrency handling, and is more production-ready

2. **Q: What is `pg` driver?**
   - A: It's the PostgreSQL client library for Node.js, similar to how `better-sqlite3` was the SQLite client

3. **Q: Why does the code need to be async?**
   - A: PostgreSQL operations are network-based, so they return promises. SQLite was file-based and synchronous.

4. **Q: When do I use `await`?**
   - A: Every time you call a database operation (queries, inserts, updates, deletes)

5. **Q: What happens to my current SQL queries?**
   - A: They stay almost the same, just minor syntax changes (`?` → `$1, $2` and `RETURNING id` for inserts)

If you can answer these, you're ready for Step 2!
