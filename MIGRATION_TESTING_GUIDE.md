# PostgreSQL Migration Testing Guide

## 🎯 Overview

You're in the final phase of migrating from SQLite (sync) to PostgreSQL (async). The database layer is complete, but routes need updating.

**Status:**
- ✅ Phase 2.1: Connection pool
- ✅ Phase 2.2: userDB async (10 methods)
- ✅ Phase 2.3: blogDB async (13 methods)
- ✅ Phase 2.4: pathsDB async (12+ methods)
- ✅ Phase 2.5: Added missing userDB methods (getUserByEmail, createUser)
- ✅ Phase 2.6.1: Migrated register route
- ✅ Phase 2.6.2: Migrated login route
- ⏳ Phase 2.6.3-2.6.8: Remaining 6 routes

---

## 🧪 Testing Strategy

### Test Level 1: Database Layer (Fast)
- ✅ Connection pool initializes
- ✅ Each database method returns correct type
- ✅ Async/await properly used
- ✅ Error handling works

### Test Level 2: Route Level (Important)
- ✅ Register: Create user, duplicate check
- ✅ Login: Valid/invalid credentials
- ✅ Profile: Password change, account deletion
- ✅ Blog routes: List, create, read, update, delete
- ✅ Admin routes: Statistics, reports

### Test Level 3: Integration (Complete)
- ✅ Full user flow: Register → Login → Create Post
- ✅ Multi-step operations: Create post with tags and paths
- ✅ Error scenarios: Duplicate emails, unauthorized access
- ✅ Data consistency: Tags/posts properly linked

---

## 🚀 Quick Start: Test What You Just Updated

### Step 1: Verify Database Connection

```bash
npm run dev
```

**Look for in console:**
```
🔄 Initializing PostgreSQL connection pool...
✅ PostgreSQL connection pool initialized
✅ PostgreSQL connection successful!
   Current database time: 2025-01-15 10:30:45.123456+00
```

If you see errors:
- Check `.env` file has `DATABASE_URL`
- Verify PostgreSQL is running: `docker-compose ps`
- Check credentials match docker-compose.yml

### Step 2: Test Register Route

**Manual test:**

1. Open `http://localhost:5173/register`
2. Fill form with:
   - Email: `testuser@example.com`
   - Display Name: `Test User`
   - Password: `password123`
   - Confirm: `password123`
3. Click Submit

**Expected behavior:**
- ✅ Form validates correctly
- ✅ Redirects to `/register/success`
- ✅ No console errors
- ✅ User created in database

**Check database:**
```bash
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "SELECT id, email, display_name, status FROM users ORDER BY created_at DESC LIMIT 1;"
```

Should show your new user with status `pending`.

### Step 3: Test Login Route

**Manual test:**

1. First, approve the test user in database:
```bash
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "UPDATE users SET status = 'approved' WHERE email = 'testuser@example.com';"
```

2. Open `http://localhost:5173/login`
3. Enter:
   - Email: `testuser@example.com`
   - Password: `password123`
4. Click Sign In

**Expected behavior:**
- ✅ Redirects to `/blog`
- ✅ No console errors
- ✅ Auth cookie set
- ✅ Can see authenticated content

---

## 🔍 Debugging Common Issues

### Issue 1: "Cannot find module 'pg'"
```
Error: Cannot find module 'pg'
```

**Fix:**
```bash
npm install pg
npm run dev
```

### Issue 2: "DATABASE_URL environment variable not set"
```
Error: DATABASE_URL environment variable is not set
```

**Fix:**
1. Check `.env` file exists
2. Contains: `DATABASE_URL=postgresql://...`
3. Credentials match `docker-compose.yml`:

```bash
# Get the correct URL format
cat .env | grep DATABASE_URL

# Should look like:
# DATABASE_URL=postgresql://supportuser:password@localhost:5432/support_system
```

### Issue 3: "ECONNREFUSED - Connection refused"
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix:**
```bash
# Start PostgreSQL
docker-compose up -d

# Verify it's running
docker-compose ps
# Should show postgres-pgvector as "Up"

# Check it accepts connections
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "SELECT NOW();"
```

### Issue 4: "relation 'users' does not exist"
```
Error: relation "users" does not exist
```

**Fix:**
```bash
# Schema not initialized. Run init scripts:
docker exec -it postgres-pgvector psql -U supportuser -d support_system -f /docker-entrypoint-initdb.d/01-schema.sql

# Or reinitialize fresh database:
docker-compose down -v
docker-compose up -d
```

### Issue 5: "TypeError: Cannot read property 'rows' of undefined"
This means a database method returned undefined instead of a result object.

**Likely cause:** Forgot `await` on database call

**Fix:** Check your route/code:
```javascript
// ❌ WRONG
const user = userDB.getUserByEmail(email);  // Missing await!

// ✅ CORRECT
const user = await userDB.getUserByEmail(email);
```

---

## 📝 Testing Checklist

Copy this checklist and mark items as you test:

### Phase 2.6: Route Migration

#### 1. Register Route (/register/+page.server.js) ✅
- [ ] Valid registration creates user
- [ ] Duplicate email rejected
- [ ] Duplicate display_name rejected
- [ ] Short password rejected
- [ ] Invalid email rejected
- [ ] Passwords must match
- [ ] User created with `pending` status
- [ ] Redirects to `/register/success`

#### 2. Login Route (/login/+page.server.js) ✅
- [ ] Valid credentials allow login
- [ ] Invalid email rejected
- [ ] Invalid password rejected
- [ ] Pending status blocks login
- [ ] Rejected status blocks login
- [ ] Approved status allows login
- [ ] Cookie set correctly
- [ ] Redirects to `/blog` for user
- [ ] Redirects to `/admin` for admin
- [ ] Session persists across page reloads

#### 3. Blog Routes - Create Post (/blog/create)
- [ ] Displays create form for authenticated user
- [ ] Rejects unauthenticated access
- [ ] Creates post with title/content
- [ ] Auto-generates slug
- [ ] Auto-calculates read_time
- [ ] Auto-generates excerpt
- [ ] Sets published = true
- [ ] Links to author
- [ ] Tags are saved (if applicable)
- [ ] Category is saved
- [ ] Redirects to post view

#### 4. Blog Routes - List Posts (/blog/+page.server.js)
- [ ] Shows all published posts
- [ ] Loads in reasonable time
- [ ] Author info included
- [ ] Tags displayed
- [ ] Posts ordered by date (newest first)
- [ ] Category displayed
- [ ] Read time displayed

#### 5. Blog Routes - View Post (/blog/[slug]/+page.server.js)
- [ ] Loads post by slug
- [ ] Shows author name
- [ ] Shows tags
- [ ] Shows category
- [ ] Shows read time
- [ ] Shows created_at
- [ ] Returns 404 for invalid slug
- [ ] Doesn't show unpublished posts to non-authors

#### 6. Profile Route (/profile/+page.server.js)
- [ ] Displays user info
- [ ] Change password works
- [ ] Old password must be correct
- [ ] New passwords must match
- [ ] Account deletion works
- [ ] Shows user's posts
- [ ] Requires authentication

#### 7. Admin - Dashboard (/admin/+page.server.js)
- [ ] Requires admin role
- [ ] Shows statistics
- [ ] Shows post count
- [ ] Shows user count
- [ ] Shows pending reports count
- [ ] Returns 403 for non-admin

#### 8. Admin - Reports (/admin/reports/+page.server.js)
- [ ] Lists all reports
- [ ] Shows pending reports first
- [ ] Filters by status work
- [ ] Can update status
- [ ] Can add response
- [ ] Returns 403 for non-admin

---

## 🧬 Unit Testing Database Methods

### Test a Single Method

Create `test-db-methods.js`:

```javascript
import { userDB, blogDB } from './src/lib/db.js';

async function testUserDB() {
  console.log('Testing userDB...\n');

  try {
    // Test 1: getUserByEmail
    console.log('Test 1: getUserByEmail');
    const user = await userDB.getUserByEmail('test@example.com');
    console.log('Result:', user ? '✅ Found' : '✅ Not found (OK)');

    // Test 2: getUserById
    console.log('\nTest 2: getUserById');
    if (user) {
      const userById = await userDB.getUserById(user.id);
      console.log('Result:', userById ? '✅ Found' : '❌ Not found');
    }

    // Test 3: getAllContentReports
    console.log('\nTest 3: getAllContentReports');
    const reports = await userDB.getAllContentReports();
    console.log('Result: ✅ Got', reports.length, 'reports');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function testBlogDB() {
  console.log('\n\nTesting blogDB...\n');

  try {
    // Test 1: getAllPosts
    console.log('Test 1: getAllPosts');
    const posts = await blogDB.getAllPosts();
    console.log('Result: ✅ Got', posts.length, 'posts');

    // Test 2: getCategories
    console.log('\nTest 2: getCategories');
    const categories = await blogDB.getCategories();
    console.log('Result: ✅ Got', categories.length, 'categories');

    // Test 3: getTags
    console.log('\nTest 3: getTags');
    const tags = await blogDB.getTags();
    console.log('Result: ✅ Got', tags.length, 'tags');

    // Test 4: getStats
    console.log('\nTest 4: getStats');
    const stats = await blogDB.getStats();
    console.log('Result: ✅ Got stats:', stats);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

(async () => {
  await testUserDB();
  await testBlogDB();
  process.exit(0);
})();
```

**Run it:**
```bash
node test-db-methods.js
```

---

## 📊 Testing Summary Template

When you test each route, note the results:

```
Route: [Name]
Date: [When tested]

✅ Passed Tests:
- [What worked]

❌ Failed Tests:
- [What didn't work]

🐛 Bugs Found:
- [Issues to fix]

📝 Notes:
- [Any observations]
```

---

## 🎯 Next Steps

1. **Run register test above** ← Start here
2. **Run login test above**
3. **Check remaining routes** (use REMAINING_ROUTES_TO_MIGRATE.md)
4. **Create test file** for batch testing
5. **Document any issues** you find

---

## 📞 If You Get Stuck

**Save error log:**
```bash
npm run dev 2>&1 | tee debug.log
```

**Check PostgreSQL connection:**
```bash
# List all users
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "SELECT id, email, status FROM users;"

# List all posts
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "SELECT id, title, author_id FROM posts;"

# List connection status
docker compose logs postgres
```

**Verify async/await in routes:**
All `export async function` must have `async` keyword.
All database calls must have `await`.

---

## ✨ Success Criteria

You'll know migration is complete when:

✅ All 8 routes are updated to async
✅ All routes pass manual tests
✅ Database queries execute without errors
✅ Authentication works end-to-end
✅ Data integrity maintained
✅ No console errors on page load
✅ No "undefined" errors on database calls

Good luck! 🚀
