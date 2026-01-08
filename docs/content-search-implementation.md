# Content Search Implementation Guide

## Problem Statement

Currently, the search feature only searches:
- Post **titles**
- Post **categories**
- Path **names** and **full paths**

It does NOT search the actual post **content/body**. This document outlines different approaches to implement content search.

## Current Architecture

The explorer currently loads only post metadata:

```javascript
// From /api/paths/hierarchy
posts = [
  {
    id: 1,
    title: "Getting Started",
    category: "tutorial",
    path_id: 5,
    // NO content field here!
  }
]
```

Post content is loaded separately only when viewing:

```javascript
// From /api/posts/${postId}/content
const response = await fetch(`/api/posts/${postId}/content`);
const data = await response.json();
// data.post.content contains the full HTML
```

## Implementation Options

### Option 1: Client-Side Search (Load All Content)

**Approach:** Load full post content upfront and search in browser.

**Pros:**
- Instant search results (no network latency)
- Works offline
- Simple to implement
- Can highlight matches in content

**Cons:**
- Slow initial page load
- High memory usage (all HTML content in memory)
- Not scalable for 100+ posts
- Large network transfer

**When to use:** Small knowledge bases (<50 posts with short content)

#### Implementation

**Step 1: Modify API to include content**

Edit `/api/paths/hierarchy` endpoint to include content:

```javascript
// src/routes/api/paths/hierarchy/+server.js
const posts = await db.query(`
  SELECT
    p.id,
    p.title,
    p.content,  -- ADD THIS
    p.category,
    p.path_id,
    p.author_id,
    p.created_at,
    u.username as author
  FROM posts p
  LEFT JOIN users u ON p.author_id = u.id
  WHERE p.published = true
  ORDER BY p.created_at DESC
`);
```

**Step 2: Update filter function**

```javascript
// src/lib/components/ConfluenceExplorer.svelte

function filterBySearch(pathsData, postsData, query) {
  if (!query || query.trim() === '') {
    return {
      filteredPaths: pathsData,
      filteredPosts: postsData,
      expandedPathIds: []
    };
  }

  const searchLower = query.toLowerCase().trim();
  const pathsToExpand = new Set();

  // Filter posts by title, category, AND content
  const filteredPosts = postsData.filter(post => {
    // Strip HTML tags from content for searching
    const textContent = post.content
      ? post.content.replace(/<[^>]*>/g, ' ').toLowerCase()
      : '';

    const matches =
      post.title.toLowerCase().includes(searchLower) ||
      (post.category && post.category.toLowerCase().includes(searchLower)) ||
      textContent.includes(searchLower);  // NEW: Search in content

    if (matches && post.path_id) {
      const ancestors = getPathAncestors(post.path_id, pathsData);
      ancestors.forEach(id => pathsToExpand.add(id));
    }

    return matches;
  });

  // ... rest of function
}
```

**Step 3: (Optional) Add content preview**

Show where in the content the match was found:

```javascript
function getContentPreview(content, query, contextWords = 10) {
  if (!content || !query) return '';

  // Remove HTML tags
  const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  const matchIndex = lowerText.indexOf(lowerQuery);
  if (matchIndex === -1) return '';

  // Find word boundaries around match
  const words = text.split(' ');
  let charCount = 0;
  let matchWordIndex = 0;

  for (let i = 0; i < words.length; i++) {
    if (charCount >= matchIndex) {
      matchWordIndex = i;
      break;
    }
    charCount += words[i].length + 1;
  }

  // Get context words before and after
  const start = Math.max(0, matchWordIndex - contextWords);
  const end = Math.min(words.length, matchWordIndex + contextWords);
  const preview = words.slice(start, end).join(' ');

  return (start > 0 ? '...' : '') + preview + (end < words.length ? '...' : '');
}
```

---

### Option 2: Server-Side Search API

**Approach:** Create a dedicated search API endpoint that queries the database.

**Pros:**
- Fast initial page load
- Low memory usage
- Scalable for large datasets
- Can use database indexes
- Can search unpublished drafts (with permissions)

**Cons:**
- Network latency for each search
- Requires typing debounce
- Server load for complex searches

**When to use:** Medium to large knowledge bases (50+ posts)

#### Implementation

**Step 1: Create search API endpoint**

```javascript
// src/routes/api/search/+server.js
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function GET({ url, locals }) {
  const query = url.searchParams.get('q');

  if (!query || query.trim() === '') {
    return json({ success: true, results: [] });
  }

  const searchTerm = `%${query.toLowerCase()}%`;

  try {
    // Search posts
    const posts = await db.query(`
      SELECT
        p.id,
        p.title,
        p.category,
        p.path_id,
        p.author_id,
        p.created_at,
        -- Extract snippet around match
        SUBSTRING(p.content,
          GREATEST(1, POSITION($1 IN LOWER(p.content)) - 100),
          200
        ) as snippet,
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
        -- Rank: title matches first, then category, then content
        CASE
          WHEN LOWER(p.title) LIKE $1 THEN 1
          WHEN LOWER(p.category) LIKE $1 THEN 2
          ELSE 3
        END,
        p.created_at DESC
      LIMIT 50
    `, [searchTerm]);

    // Search paths
    const paths = await db.query(`
      SELECT id, name, full_path, parent_id, icon
      FROM paths
      WHERE LOWER(name) LIKE $1
        OR LOWER(full_path) LIKE $1
      ORDER BY full_path
    `, [searchTerm]);

    return json({
      success: true,
      results: {
        posts: posts.rows,
        paths: paths.rows
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    return json({ success: false, error: 'Search failed' }, { status: 500 });
  }
}
```

**Step 2: Create search function with debounce**

```javascript
// src/lib/components/ConfluenceExplorer.svelte

let searchQuery = '';
let searchResults = { posts: [], paths: [] };
let searching = false;
let searchTimeout;

// Debounced search function
async function performSearch(query) {
  if (!query || query.trim() === '') {
    searchResults = { posts: [], paths: [] };
    return;
  }

  searching = true;

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (data.success) {
      searchResults = data.results;

      // Auto-expand paths containing results
      const pathsToExpand = new Set();
      data.results.posts.forEach(post => {
        if (post.path_id) {
          const ancestors = getPathAncestors(post.path_id, paths);
          ancestors.forEach(id => pathsToExpand.add(id));
        }
      });
      expandPathIds = Array.from(pathsToExpand);
    }
  } catch (error) {
    console.error('Search error:', error);
  } finally {
    searching = false;
  }
}

// Reactive search with debounce
$: {
  clearTimeout(searchTimeout);
  if (searchQuery) {
    searchTimeout = setTimeout(() => performSearch(searchQuery), 300);
  } else {
    searchResults = { posts: [], paths: [] };
  }
}

// Use search results when available, otherwise show all
$: displayPosts = searchQuery ? searchResults.posts : posts;
$: displayPaths = searchQuery ? searchResults.paths : paths;
```

**Step 3: Update UI to show search state**

```svelte
<!-- Search Box with loading indicator -->
<div class="search-box">
  <span class="search-icon">{searching ? '⏳' : '🔍'}</span>
  <input
    type="text"
    placeholder="Search titles and content..."
    bind:value={searchQuery}
    class="search-input"
  />
  {#if searchQuery}
    <button class="clear-search" on:click={() => searchQuery = ''}>
      ×
    </button>
  {/if}
</div>

{#if searching}
  <div class="search-status">Searching...</div>
{/if}
```

---

### Option 3: PostgreSQL Full-Text Search (Recommended)

**Approach:** Use PostgreSQL's built-in full-text search capabilities.

**Pros:**
- Very fast (optimized for text search)
- Advanced features (ranking, stemming, phrase matching)
- Low memory usage
- Scalable to millions of posts
- Handles language-specific search

**Cons:**
- Requires database schema changes
- More complex setup
- PostgreSQL specific (not portable)

**When to use:** Production applications with 100+ posts

#### Implementation

**Step 1: Add full-text search column to database**

```sql
-- Migration: add_fulltext_search.sql

-- Add tsvector column for full-text search
ALTER TABLE posts
ADD COLUMN search_vector tsvector;

-- Create index for fast searching
CREATE INDEX posts_search_idx ON posts USING GIN(search_vector);

-- Function to update search vector
CREATE OR REPLACE FUNCTION posts_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update search vector
CREATE TRIGGER posts_search_vector_trigger
BEFORE INSERT OR UPDATE ON posts
FOR EACH ROW
EXECUTE FUNCTION posts_search_vector_update();

-- Update existing posts
UPDATE posts SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(category, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(content, '')), 'C');
```

**Explanation:**
- `tsvector`: Stores processed text tokens
- `setweight()`: Gives title matches higher rank than content
- Weights: A (title) > B (category) > C (content)
- Trigger: Automatically updates vector when post changes

**Step 2: Create search API with ranking**

```javascript
// src/routes/api/search/+server.js
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function GET({ url }) {
  const query = url.searchParams.get('q');

  if (!query || query.trim() === '') {
    return json({ success: true, results: { posts: [], paths: [] } });
  }

  try {
    // Full-text search with ranking
    const posts = await db.query(`
      SELECT
        p.id,
        p.title,
        p.category,
        p.path_id,
        p.author_id,
        p.created_at,
        u.username as author,
        -- Rank by relevance
        ts_rank(p.search_vector, query) as rank,
        -- Extract headline (snippet with highlighted matches)
        ts_headline('english', p.content, query,
          'MaxWords=30, MinWords=20, ShortWord=3'
        ) as snippet
      FROM posts p
      LEFT JOIN users u ON p.author_id = u.id,
      -- Parse search query
      to_tsquery('english', $1) as query
      WHERE p.published = true
        AND p.search_vector @@ query
      ORDER BY rank DESC, p.created_at DESC
      LIMIT 50
    `, [query.trim().split(/\s+/).join(' & ')]);  // Convert "foo bar" to "foo & bar"

    // Search paths (simple LIKE for now)
    const searchTerm = `%${query.toLowerCase()}%`;
    const paths = await db.query(`
      SELECT id, name, full_path, parent_id, icon
      FROM paths
      WHERE LOWER(name) LIKE $1
        OR LOWER(full_path) LIKE $1
      ORDER BY full_path
    `, [searchTerm]);

    return json({
      success: true,
      results: {
        posts: posts.rows,
        paths: paths.rows
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    return json({ success: false, error: 'Search failed' }, { status: 500 });
  }
}
```

**Step 3: Display snippets in UI**

Modify PathPostTree to show content snippets for search results:

```svelte
<!-- In PathPostTree.svelte -->
<div class="tree-node post-node" class:selected={post.id === selectedPostId}>
  <span class="expand-spacer"></span>
  <span class="item-icon">📄</span>
  <span class="post-info">
    {#if post.category_post_number && post.category}
      <span class="post-prefix">
        {post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}:
      </span>
    {/if}
    <span class="item-title">{@html highlightMatch(post.title, searchQuery)}</span>

    <!-- NEW: Show snippet if searching -->
    {#if searchQuery && post.snippet}
      <div class="post-snippet">{@html post.snippet}</div>
    {/if}
  </span>
</div>
```

```css
/* Add to PathPostTree.svelte styles */
.post-snippet {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
  line-height: 1.4;
  font-style: italic;
}

.post-snippet :global(b) {
  background: #fef08a;
  color: #713f12;
  font-weight: 600;
  padding: 0.125rem 0.25rem;
  border-radius: 2px;
}
```

---

### Option 4: Hybrid Approach (Load Excerpts)

**Approach:** Load short excerpts (first 200 chars) instead of full content.

**Pros:**
- Reasonable initial load time
- Enables preview in search results
- Moderate memory usage

**Cons:**
- Won't find matches deep in content
- Partial search accuracy

**When to use:** When you want basic content search without full infrastructure

#### Implementation

```javascript
// In /api/paths/hierarchy endpoint
const posts = await db.query(`
  SELECT
    p.id,
    p.title,
    p.category,
    p.path_id,
    -- Load first 200 characters as excerpt
    SUBSTRING(
      REGEXP_REPLACE(p.content, '<[^>]*>', '', 'g'),  -- Strip HTML
      1,
      200
    ) as excerpt,
    u.username as author
  FROM posts p
  LEFT JOIN users u ON p.author_id = u.id
  WHERE p.published = true
  ORDER BY p.created_at DESC
`);
```

Then search the excerpt field:

```javascript
const filteredPosts = postsData.filter(post => {
  const matches =
    post.title.toLowerCase().includes(searchLower) ||
    (post.category && post.category.toLowerCase().includes(searchLower)) ||
    (post.excerpt && post.excerpt.toLowerCase().includes(searchLower));
  return matches;
});
```

---

## Recommendation

Based on your use case:

| Posts Count | Recommendation | Reason |
|-------------|---------------|---------|
| < 50 | Option 1 (Client-side) | Simple, instant results |
| 50-500 | Option 2 (Server API) | Good balance |
| 500+ | Option 3 (Full-text) | Best performance |
| Unsure | Option 4 (Excerpts) | Easy to implement first |

**For most cases, I recommend Option 3 (PostgreSQL Full-Text Search)** because:
- It's the most scalable
- Built into PostgreSQL (no external dependencies)
- Excellent performance
- Advanced features (ranking, stemming)
- Easy to maintain

Start with Option 4 (excerpts) if you want to test the UX first, then migrate to Option 3 for production.

## Next Steps

Which approach would you like to implement? I can help you:

1. Set up the database migration for full-text search
2. Create the search API endpoint
3. Update the UI to display search results with snippets
4. Add advanced features (filters, result counts, etc.)

Let me know which option works best for your needs!
