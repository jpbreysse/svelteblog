# PostgreSQL Schema Guide

## 📋 What is the Schema File?

The schema file (`init-scripts/01-schema.sql`) contains all the SQL commands to create your database tables in PostgreSQL.

**What it does:**
- Creates all 6 tables (users, posts, tags, post_tags, paths, content_reports)
- Creates indexes for better query performance
- Sets up relationships (foreign keys) between tables
- Adds constraints to ensure data integrity
- Creates views for common queries
- Enables pgvector extension for future semantic search

---

## 📁 File Location

```
/dev/node/sevlte/framework/
  └── init-scripts/
      └── 01-schema.sql   ← Database schema file
```

---

## 🔄 How Docker Uses This File

When you start PostgreSQL with docker-compose, it automatically runs this file:

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16
    volumes:
      - ./init-scripts:/docker-entrypoint-initdb.d  # ← Docker runs SQL files here
```

**Process:**
1. Docker starts PostgreSQL container
2. Looks for `.sql` files in `/docker-entrypoint-initdb.d`
3. Runs `01-schema.sql` automatically
4. All tables are created
5. Database is ready to use

---

## 🗂️ Tables in the Schema

### 1. **users** - User accounts
```sql
id (primary key)
email (unique)
display_name
password_hash
status (pending/approved/rejected/deletion_requested)
role (user/admin)
created_at, approved_at, deletion_requested_at
approved_by, deletion_reason
```

### 2. **posts** - Blog posts
```sql
id (primary key)
title, content, excerpt
category, slug
read_time
author_id (foreign key → users)
path_id (foreign key → paths)
created_at, updated_at
published (boolean)
```

### 3. **tags** - Post tags
```sql
id (primary key)
name (unique)
created_at
```

### 4. **post_tags** - Links posts to tags (junction table)
```sql
post_id (foreign key → posts)
tag_id (foreign key → tags)
PRIMARY KEY (post_id, tag_id)
```

### 5. **paths** - Hierarchical organization
```sql
id (primary key)
name, slug
description
parent_id (foreign key → paths, self-referencing for hierarchy)
level (1-5, prevents deep nesting)
full_path (unique, like /parent/child/grandchild)
icon, color, position
created_by (foreign key → users)
created_at, updated_at
```

### 6. **content_reports** - Moderation reports
```sql
id (primary key)
issue_type (inappropriate/copyright/gdpr_removal/privacy/spam/misinformation/harassment/other)
description
reporter_email
post_id (foreign key → posts)
post_title, post_url
reporter_ip, user_agent
status (pending/reviewed/resolved/dismissed)
admin_response
resolved_by (foreign key → users)
resolved_at
created_at
```

### 7. **app_info** - Release version tracking ⭐ NEW
```sql
id (primary key)
version (unique, like "1.0.0", "1.1.0", etc.)
release_date
description
changelog
is_current (boolean - which version is currently active)
created_at, updated_at
```

**Use case:**
```javascript
// Get current app version
SELECT * FROM app_info WHERE is_current = true;

// Get release history
SELECT * FROM app_info ORDER BY release_date DESC;
```

### 8. **app_features** - Features list ⭐ NEW
```sql
id (primary key)
app_info_id (foreign key → app_info)
feature_name
description
category (like "user", "blog", "admin", "moderation", etc.)
status (planned/in_progress/released/deprecated)
priority (for sorting)
created_at, updated_at
```

**Use case:**
```javascript
// Get all features in current release
SELECT 
  f.* 
FROM app_features f
JOIN app_info a ON f.app_info_id = a.id
WHERE a.is_current = true AND f.status = 'released'
ORDER BY f.priority;

// Get planned features for next release
SELECT * FROM app_features WHERE status = 'planned' ORDER BY priority;
```

### 9. **app_metadata** - Configuration storage ⭐ NEW
```sql
id (primary key)
key (unique, like "max_file_upload_size", "maintenance_mode", etc.)
value (the actual value)
value_type (string/integer/boolean/json)
description
created_at, updated_at
```

**Use case:**
```javascript
// Store and retrieve config values
INSERT INTO app_metadata (key, value, value_type, description)
VALUES ('maintenance_mode', 'false', 'boolean', 'Is the app in maintenance mode?');

SELECT * FROM app_metadata WHERE key = 'maintenance_mode';
```

---

## 🔑 Key Differences: SQLite → PostgreSQL

### 1. **Auto-incrementing IDs**

**SQLite:**
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT
```

**PostgreSQL:**
```sql
id SERIAL PRIMARY KEY
```

### 2. **Text Fields**

**SQLite:**
```sql
email TEXT UNIQUE NOT NULL
name TEXT NOT NULL
```

**PostgreSQL:**
```sql
email VARCHAR(255) UNIQUE NOT NULL
name VARCHAR(255) NOT NULL
```

**Why?** PostgreSQL is more explicit about field sizes. This helps with optimization.

### 3. **Check Constraints**

**SQLite:**
```sql
status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected'))
```

**PostgreSQL:**
```sql
status VARCHAR(50) DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected'))
-- Exactly the same!
```

### 4. **Timestamps**

**SQLite:**
```sql
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
```

**PostgreSQL:**
```sql
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### 5. **Boolean Values**

**SQLite:**
```sql
published BOOLEAN DEFAULT 1  -- 1 = true, 0 = false
```

**PostgreSQL:**
```sql
published BOOLEAN DEFAULT true  -- Use actual boolean
```

---

## 📊 Indexes (Performance)

The schema creates indexes on frequently queried columns:

```sql
-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

-- Posts indexes
CREATE INDEX idx_posts_category ON posts(category);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_author_id ON posts(author_id);

-- Paths indexes
CREATE INDEX idx_paths_full_path ON paths(full_path);
CREATE INDEX idx_paths_parent_id ON paths(parent_id);
```

**What these do:**
- Make searches faster
- Make filtering faster
- Trade: use more disk space
- PostgreSQL decides whether to use them automatically

---

## 🔗 Foreign Keys (Relationships)

Foreign keys ensure data integrity:

```sql
-- Posts belong to Users
author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
-- If user deleted, their posts are also deleted

-- Posts can have a path
path_id INTEGER REFERENCES paths(id) ON DELETE SET NULL
-- If path deleted, posts keep existing but path_id becomes NULL

-- post_tags links posts and tags
post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE
-- If post deleted, the link is deleted too
```

**ON DELETE options:**
- `CASCADE` - Delete related rows too
- `SET NULL` - Set the foreign key to NULL
- `RESTRICT` - Prevent deletion if related rows exist (not used here)

---

## 📈 Views (Convenience Queries)

The schema creates 2 views for common queries:

### View 1: `posts_with_details`
```sql
SELECT 
  p.*,                              -- All post fields
  u.display_name as author_name,    -- Author info
  u.email as author_email,
  array_agg(t.name) as tags,        -- All tags as array
  COUNT(pending reports) as ...     -- Pending reports
FROM posts p
JOIN users u ON ...
LEFT JOIN post_tags pt ON ...
LEFT JOIN tags t ON ...
```

**Use it:**
```sql
SELECT * FROM posts_with_details WHERE published = true;
-- Gets all posts WITH their authors and tags in one query
```

### View 2: `path_statistics`
```sql
SELECT 
  p.id, p.name, p.full_path,
  COUNT(children) as direct_children,
  COUNT(posts) as direct_posts,
  u.display_name as created_by
FROM paths p
LEFT JOIN ...
```

---

## 🚀 How to Use This Schema

### Option 1: Docker Automatically (Recommended)

```bash
# Schema is automatically run when container starts
docker-compose up -d

# Schema is already created!
# Test it:
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "\dt"
# Should list all 6 tables
```

### Option 2: Manual Execution

```bash
# If you need to run it manually:
docker exec -it postgres-pgvector psql -U supportuser -d support_system -f /init-scripts/01-schema.sql
```

### Option 3: Connect and Run

```bash
# Connect to PostgreSQL
psql postgresql://supportuser:password@localhost:5432/support_system

# Then paste the contents of 01-schema.sql
\i init-scripts/01-schema.sql

# Or use a terminal shortcut
psql postgresql://... < init-scripts/01-schema.sql
```

---

## ✅ Verify Schema is Created

**Check all tables exist:**
```bash
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "\dt"
```

Should show:
```
 public | users            | table
 public | posts            | table
 public | tags             | table
 public | post_tags        | table
 public | paths            | table
 public | content_reports  | table
```

**Check indexes:**
```bash
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "\di"
```

Should show ~20+ indexes

**Check views:**
```bash
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "\dv"
```

Should show:
```
 public | path_statistics    | view
 public | posts_with_details | view
```

---

## 🔄 Schema Changes After Creation

If you need to modify the schema later:

```bash
# Add a new column
ALTER TABLE posts ADD COLUMN featured BOOLEAN DEFAULT false;

# Add an index
CREATE INDEX idx_posts_featured ON posts(featured);

# Modify a column
ALTER TABLE users ALTER COLUMN display_name TYPE VARCHAR(500);

# Drop a column
ALTER TABLE posts DROP COLUMN featured;
```

**Important:** These changes need to be made in both:
1. The running database
2. The schema file (for next time you create the database)

---

## 📝 Important Notes

### pgvector Extension

The schema enables pgvector:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

This allows vector columns for embeddings:
```sql
-- Future: Add embeddings to posts
ALTER TABLE posts ADD COLUMN embedding vector(1536);
CREATE INDEX ON posts USING hnsw (embedding vector_cosine_ops);
```

### Default Admin User

The schema has a commented-out section to create a default admin:
```sql
-- INSERT INTO users (email, display_name, password_hash, status, role)
-- VALUES ('admin@example.com', 'Admin User', 'bcrypt_hash_here', 'approved', 'admin')
```

**To use it:**
1. Uncomment the INSERT statement
2. Generate a bcrypt hash of the password
3. Replace `admin_password_hash_here` with the hash

---

## 🐛 Common Schema Issues

### Issue 1: "relation already exists"
```
ERROR: relation "users" already exists
```

**Solution:** Schema already created. Skip or drop old database first:
```bash
docker-compose down -v  # -v removes volumes
docker-compose up -d    # Fresh database
```

### Issue 2: "foreign key constraint violated"
When trying to delete users/posts/paths:
```
ERROR: update or delete on table "users" violates foreign key constraint
```

**Solution:** Delete in correct order:
1. Delete content_reports → posts → users
2. Or: Use CASCADE in schema (already done)

### Issue 3: "unique constraint violated"
```
ERROR: duplicate key value violates unique constraint
```

**Solution:** This is correct behavior - schema prevents duplicates.
Check your data for duplicates.

---

## 🔍 Schema Diagram (Relationships)

```
users (id) ──┬──► posts (author_id)
             ├──► paths (created_by)
             ├──► content_reports (resolved_by, approved_by)
             └──► posts (approved_by)

posts (id) ──┬──► post_tags (post_id)
             ├──► content_reports (post_id)
             └──► paths (path_id)

tags (id) ───► post_tags (tag_id)

paths (id) ──┬──► posts (path_id)
             ├──► paths (parent_id) [self-reference]
             └──► content_reports [implicit]
```

---

## ✨ Next Steps

Once schema is created:

1. **Phase 2.1-2.4:** Refactor database layer code
2. **Phase 2.6:** Test all operations
3. **Step 3:** Update API endpoints
4. **Future:** Add pgvector embeddings for semantic search

The schema is ready when you see all tables in `\dt` output!
