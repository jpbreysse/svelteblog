# Database Code for Search Features

This document contains all SQL and database code for implementing different search approaches.

---

## Table of Contents

1. [Full-Text Search (PostgreSQL)](#full-text-search-postgresql)
2. [Vector Search (pgvector + OpenAI)](#vector-search-pgvector--openai)
3. [Basic Content Search](#basic-content-search)
4. [Hybrid Search Queries](#hybrid-search-queries)

---

## Full-Text Search (PostgreSQL)

### Migration: Add Full-Text Search Support

```sql
-- Migration: add_fulltext_search.sql

-- Add tsvector column for full-text search
ALTER TABLE posts
ADD COLUMN search_vector tsvector;

-- Create GIN index for fast searching
CREATE INDEX posts_search_idx ON posts USING GIN(search_vector);

-- Function to automatically update search vector
CREATE OR REPLACE FUNCTION posts_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update search vector on INSERT or UPDATE
CREATE TRIGGER posts_search_vector_trigger
BEFORE INSERT OR UPDATE ON posts
FOR EACH ROW
EXECUTE FUNCTION posts_search_vector_update();

-- Update existing posts with search vectors
UPDATE posts SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(category, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(content, '')), 'C');
```

**Explanation:**
- `tsvector`: Stores indexed, searchable tokens
- `setweight()`: Assigns ranking weights (A=highest, D=lowest)
  - A = Title (highest priority)
  - B = Category (medium priority)
  - C = Content (lower priority)
- `GIN index`: Generalized Inverted Index for fast text search
- Trigger: Automatically updates search_vector when posts change

### Query: Full-Text Search with Ranking

```sql
-- Search posts using full-text search
SELECT
  p.id,
  p.title,
  p.category,
  p.path_id,
  p.author_id,
  p.created_at,
  u.username as author,
  -- Rank by relevance (higher = more relevant)
  ts_rank(p.search_vector, query) as rank,
  -- Extract headline (snippet with highlighted matches)
  ts_headline('english', p.content, query,
    'MaxWords=30, MinWords=20, ShortWord=3'
  ) as snippet
FROM posts p
LEFT JOIN users u ON p.author_id = u.id,
-- Parse search query (converts "foo bar" to "foo & bar")
to_tsquery('english', $1) as query
WHERE p.published = true
  AND p.search_vector @@ query  -- @@ is the full-text match operator
ORDER BY rank DESC, p.created_at DESC
LIMIT 50;
```

**Parameters:**
- `$1`: Search query as string (e.g., "foo & bar" or "foo | bar")

**Query Syntax:**
- `&` = AND: "foo & bar" (both words must appear)
- `|` = OR: "foo | bar" (either word)
- `!` = NOT: "foo & !bar" (foo but not bar)
- `<->` = FOLLOWED BY: "foo <-> bar" (foo directly before bar)

### Query: Extract Content Snippet Around Match

```sql
-- Get content snippet showing where match appears
SELECT
  p.id,
  p.title,
  -- Extract 200 characters around the match position
  SUBSTRING(p.content,
    GREATEST(1, POSITION($1 IN LOWER(p.content)) - 100),
    200
  ) as snippet
FROM posts p
WHERE LOWER(p.content) LIKE $1;
```

**Parameters:**
- `$1`: Search term with wildcards (e.g., "%database%")

### Query: Simple Full-Text Search (Basic)

```sql
-- Simple search without ranking
SELECT
  p.id,
  p.title,
  p.category,
  p.content
FROM posts p
WHERE p.published = true
  AND (
    LOWER(p.title) LIKE $1
    OR LOWER(p.category) LIKE $1
    OR LOWER(p.content) LIKE $1
  )
ORDER BY p.created_at DESC
LIMIT 50;
```

**Parameters:**
- `$1`: Search term with wildcards (e.g., "%search term%")

---

## Vector Search (pgvector + OpenAI)

### Migration: Add Vector Search Support

```sql
-- Migration: add_vector_search.sql

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add vector column for embeddings
-- OpenAI text-embedding-3-small uses 1536 dimensions
ALTER TABLE posts
ADD COLUMN embedding vector(1536);

-- Create IVFFlat index for fast similarity search
-- Note: Only create index AFTER inserting some data (at least 1000 rows recommended)
CREATE INDEX posts_embedding_idx ON posts USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add metadata columns for tracking
ALTER TABLE posts
ADD COLUMN embedding_model varchar(50) DEFAULT 'text-embedding-3-small',
ADD COLUMN embedding_generated_at timestamp;

-- For smaller/faster embeddings, use 512 dimensions instead:
-- ALTER TABLE posts ADD COLUMN embedding vector(512);
```

**Note:** Only create the `ivfflat` index after you have enough data (recommended: 1000+ rows). For smaller datasets, sequential scan may be faster.

### Query: Vector Similarity Search

```sql
-- Search using cosine similarity
SELECT
  p.id,
  p.title,
  p.category,
  p.path_id,
  p.author_id,
  p.created_at,
  u.username as author,
  -- Calculate similarity score (1 = identical, 0 = completely different)
  1 - (p.embedding <=> $1::vector) as similarity,
  -- Extract content snippet
  SUBSTRING(
    REGEXP_REPLACE(p.content, '<[^>]*>', '', 'g'),  -- Strip HTML tags
    1,
    200
  ) as snippet
FROM posts p
LEFT JOIN users u ON p.author_id = u.id
WHERE p.published = true
  AND p.embedding IS NOT NULL
  AND 1 - (p.embedding <=> $1::vector) > 0.7  -- Similarity threshold (0.7 = 70% similar)
ORDER BY similarity DESC
LIMIT 20;
```

**Parameters:**
- `$1`: Query embedding as JSON array (e.g., "[0.123, -0.456, 0.789, ...]")

**Operators:**
- `<=>` = Cosine distance
- `<->` = Euclidean distance (L2)
- `<#>` = Inner product distance

**Similarity Thresholds:**
- 0.9+ = Very similar
- 0.8-0.9 = Similar
- 0.7-0.8 = Somewhat related
- <0.7 = Not very related

### Query: Find Posts Missing Embeddings

```sql
-- Find posts that need embeddings generated
SELECT
  id,
  title,
  category,
  created_at
FROM posts
WHERE embedding IS NULL
  AND published = true
ORDER BY created_at DESC;
```

### Query: Update Embedding for a Post

```sql
-- Store generated embedding for a post
UPDATE posts
SET embedding = $1::vector,
    embedding_model = 'text-embedding-3-small',
    embedding_generated_at = NOW()
WHERE id = $2;
```

**Parameters:**
- `$1`: Embedding array as JSON string
- `$2`: Post ID

### Query: Count Posts with/without Embeddings

```sql
-- Check embedding generation progress
SELECT
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embeddings,
  COUNT(*) FILTER (WHERE embedding IS NULL) as without_embeddings,
  COUNT(*) as total
FROM posts
WHERE published = true;
```

---

## Basic Content Search

### Query: Load Posts with Content (Client-Side Search)

```sql
-- Load all posts with full content for client-side filtering
SELECT
  p.id,
  p.title,
  p.content,  -- Full HTML content
  p.category,
  p.path_id,
  p.author_id,
  p.created_at,
  p.category_post_number,
  u.username as author
FROM posts p
LEFT JOIN users u ON p.author_id = u.id
WHERE p.published = true
ORDER BY p.created_at DESC;
```

**Warning:** Only use for small datasets (<50 posts). Large content can slow down page load.

### Query: Load Posts with Excerpt Only

```sql
-- Load posts with excerpt for partial content search
SELECT
  p.id,
  p.title,
  p.category,
  p.path_id,
  p.author_id,
  p.created_at,
  u.username as author,
  -- Extract first 200 characters as excerpt (HTML stripped)
  SUBSTRING(
    REGEXP_REPLACE(p.content, '<[^>]*>', '', 'g'),  -- Remove HTML tags
    1,
    200
  ) as excerpt
FROM posts p
LEFT JOIN users u ON p.author_id = u.id
WHERE p.published = true
ORDER BY p.created_at DESC;
```

### Query: Search in Content with LIKE

```sql
-- Basic content search using LIKE (slow for large datasets)
SELECT
  p.id,
  p.title,
  p.category,
  p.path_id,
  p.author_id,
  p.created_at,
  u.username as author
FROM posts p
LEFT JOIN users u ON p.author_id = u.id
WHERE p.published = true
  AND (
    LOWER(p.title) LIKE $1
    OR LOWER(p.category) LIKE $1
    OR LOWER(p.content) LIKE $1
  )
ORDER BY
  -- Prioritize title matches
  CASE
    WHEN LOWER(p.title) LIKE $1 THEN 1
    WHEN LOWER(p.category) LIKE $1 THEN 2
    ELSE 3
  END,
  p.created_at DESC
LIMIT 50;
```

**Parameters:**
- `$1`: Search pattern (e.g., "%search term%")

---

## Hybrid Search Queries

### Query: Combined Full-Text and Vector Search

This approach runs both searches and merges results with weighted scores.

#### Step 1: Vector Search Component

```sql
-- Vector search portion (for hybrid)
SELECT
  p.id,
  p.title,
  p.category,
  p.path_id,
  p.author_id,
  p.created_at,
  u.username as author,
  1 - (p.embedding <=> $1::vector) as similarity,
  'vector' as search_type
FROM posts p
LEFT JOIN users u ON p.author_id = u.id
WHERE p.published = true
  AND p.embedding IS NOT NULL
  AND 1 - (p.embedding <=> $1::vector) > 0.6
ORDER BY similarity DESC
LIMIT 20;
```

**Parameters:**
- `$1`: Query embedding vector

#### Step 2: Full-Text Search Component

```sql
-- Full-text search portion (for hybrid)
SELECT
  p.id,
  p.title,
  p.category,
  p.path_id,
  p.author_id,
  p.created_at,
  u.username as author,
  ts_rank(p.search_vector, to_tsquery('english', $1)) as rank,
  'fulltext' as search_type
FROM posts p
LEFT JOIN users u ON p.author_id = u.id
WHERE p.published = true
  AND p.search_vector @@ to_tsquery('english', $1)
ORDER BY rank DESC
LIMIT 20;
```

**Parameters:**
- `$1`: Search query string (e.g., "foo & bar")

#### Combined Query (Union)

```sql
-- Hybrid search: Combine both methods
WITH vector_results AS (
  SELECT
    p.id,
    1 - (p.embedding <=> $1::vector) as score,
    0.6 as weight  -- Vector results weighted 60%
  FROM posts p
  WHERE p.published = true
    AND p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> $1::vector) > 0.6
),
fulltext_results AS (
  SELECT
    p.id,
    ts_rank(p.search_vector, to_tsquery('english', $2)) as score,
    0.4 as weight  -- Fulltext results weighted 40%
  FROM posts p
  WHERE p.published = true
    AND p.search_vector @@ to_tsquery('english', $2)
)
SELECT
  p.id,
  p.title,
  p.category,
  p.path_id,
  p.author_id,
  p.created_at,
  u.username as author,
  COALESCE(v.score * v.weight, 0) + COALESCE(f.score * f.weight, 0) as combined_score,
  CASE
    WHEN v.id IS NOT NULL AND f.id IS NOT NULL THEN 'both'
    WHEN v.id IS NOT NULL THEN 'vector'
    ELSE 'fulltext'
  END as match_type
FROM posts p
LEFT JOIN users u ON p.author_id = u.id
LEFT JOIN vector_results v ON p.id = v.id
LEFT JOIN fulltext_results f ON p.id = f.id
WHERE v.id IS NOT NULL OR f.id IS NOT NULL
ORDER BY combined_score DESC
LIMIT 20;
```

**Parameters:**
- `$1`: Query embedding vector (for vector search)
- `$2`: Search query string (for full-text search)

---

## Path Search Queries

### Query: Search Paths by Name

```sql
-- Search paths/folders
SELECT
  id,
  name,
  full_path,
  parent_id,
  icon,
  child_count
FROM paths
WHERE LOWER(name) LIKE $1
  OR LOWER(full_path) LIKE $1
ORDER BY full_path;
```

**Parameters:**
- `$1`: Search pattern (e.g., "%documentation%")

### Query: Get Path Ancestors

```sql
-- Recursive query to get all ancestor paths
WITH RECURSIVE path_ancestors AS (
  -- Start with the target path
  SELECT id, parent_id, name, 1 as level
  FROM paths
  WHERE id = $1

  UNION ALL

  -- Recursively get parent paths
  SELECT p.id, p.parent_id, p.name, pa.level + 1
  FROM paths p
  INNER JOIN path_ancestors pa ON p.id = pa.parent_id
)
SELECT id, name, level
FROM path_ancestors
ORDER BY level DESC;
```

**Parameters:**
- `$1`: Starting path ID

---

## Utility Queries

### Query: Strip HTML Tags from Content

```sql
-- Remove HTML tags (PostgreSQL 9.1+)
SELECT
  id,
  title,
  REGEXP_REPLACE(content, '<[^>]*>', '', 'g') as plain_text
FROM posts;
```

### Query: Get Post Content with Metadata

```sql
-- Full post data with all metadata
SELECT
  p.id,
  p.title,
  p.content,
  p.category,
  p.category_post_number,
  p.path_id,
  p.author_id,
  p.published,
  p.created_at,
  p.updated_at,
  u.username as author,
  -- Path information
  path.full_path,
  -- Tag array
  ARRAY_AGG(t.name) FILTER (WHERE t.name IS NOT NULL) as tags
FROM posts p
LEFT JOIN users u ON p.author_id = u.id
LEFT JOIN paths path ON p.path_id = path.id
LEFT JOIN post_tags pt ON p.id = pt.post_id
LEFT JOIN tags t ON pt.tag_id = t.id
WHERE p.id = $1
GROUP BY p.id, u.username, path.full_path;
```

**Parameters:**
- `$1`: Post ID

### Query: Search Statistics

```sql
-- Get search statistics
SELECT
  -- Total posts
  COUNT(*) as total_posts,
  -- Posts with full-text search enabled
  COUNT(*) FILTER (WHERE search_vector IS NOT NULL) as with_fulltext,
  -- Posts with vector embeddings
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embeddings,
  -- Average content length
  AVG(LENGTH(content)) as avg_content_length,
  -- Total content size
  pg_size_pretty(SUM(LENGTH(content))::bigint) as total_content_size
FROM posts
WHERE published = true;
```

---

## Index Management

### Create Indexes for Better Performance

```sql
-- Indexes for common queries

-- Basic search on title and category
CREATE INDEX idx_posts_title ON posts (LOWER(title));
CREATE INDEX idx_posts_category ON posts (LOWER(category));

-- Published posts (very common filter)
CREATE INDEX idx_posts_published ON posts (published) WHERE published = true;

-- Path filtering
CREATE INDEX idx_posts_path_id ON posts (path_id);

-- Author filtering
CREATE INDEX idx_posts_author_id ON posts (author_id);

-- Sorting by date
CREATE INDEX idx_posts_created_at ON posts (created_at DESC);

-- Composite index for common query pattern
CREATE INDEX idx_posts_published_created ON posts (published, created_at DESC);
```

### Drop Indexes (if needed)

```sql
-- Remove search indexes
DROP INDEX IF EXISTS posts_search_idx;
DROP INDEX IF EXISTS posts_embedding_idx;
DROP INDEX IF EXISTS idx_posts_title;
DROP INDEX IF EXISTS idx_posts_category;
```

---

## Performance Queries

### Check Index Usage

```sql
-- See which indexes are being used
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'posts'
ORDER BY idx_scan DESC;
```

### Check Table Size

```sql
-- Check storage size of posts table and indexes
SELECT
  pg_size_pretty(pg_total_relation_size('posts')) as total_size,
  pg_size_pretty(pg_relation_size('posts')) as table_size,
  pg_size_pretty(pg_total_relation_size('posts') - pg_relation_size('posts')) as indexes_size;
```

### Analyze Query Performance

```sql
-- Use EXPLAIN ANALYZE to see query execution plan
EXPLAIN ANALYZE
SELECT *
FROM posts p
WHERE p.search_vector @@ to_tsquery('english', 'database & performance')
ORDER BY ts_rank(p.search_vector, to_tsquery('english', 'database & performance')) DESC;
```

---

## Maintenance

### Rebuild Full-Text Search Vectors

```sql
-- Regenerate all search vectors (run after bulk updates)
UPDATE posts
SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(category, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(content, '')), 'C')
WHERE published = true;
```

### Rebuild Vector Index

```sql
-- Rebuild vector index (after bulk embedding updates)
REINDEX INDEX posts_embedding_idx;
```

### Vacuum and Analyze

```sql
-- Optimize table performance
VACUUM ANALYZE posts;
```

---

## Example Parameter Values

### Full-Text Search Query Formats

```sql
-- Simple term
'database'

-- Multiple terms (AND)
'database & performance'

-- Multiple terms (OR)
'database | postgresql'

-- Phrase (words in sequence)
'database <-> performance'

-- Negation
'database & !mysql'

-- Prefix matching
'data:*'  -- Matches "data", "database", "databases", etc.

-- Complex query
'(postgresql | mysql) & performance & !slow'
```

### LIKE Pattern Formats

```sql
-- Contains
'%search%'

-- Starts with
'search%'

-- Ends with
'%search'

-- Single character wildcard
'se_rch'
```

---

## Notes

### Performance Considerations

1. **Full-Text Search**: Very fast (milliseconds) for up to millions of posts
2. **Vector Search**: Slower (10-100ms) but more accurate for semantic search
3. **LIKE queries**: Slow on large tables without proper indexes
4. **Hybrid Search**: Combines both but runs two queries

### When to Use Each

- **Full-Text**: Exact keyword matching, fast, free
- **Vector**: Semantic/conceptual search, requires OpenAI API
- **LIKE**: Simple queries, small datasets only
- **Hybrid**: Best results, combines both approaches

### Database Requirements

- **Full-Text**: PostgreSQL 9.1+ (built-in)
- **Vector**: PostgreSQL 11+ with pgvector extension
- **Basic**: Any PostgreSQL version
