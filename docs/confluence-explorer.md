# Confluence-Style Explorer Documentation

## Overview

The Confluence-style explorer is a hierarchical content navigation system that combines **virtual paths** (folders) and **posts** in a tree structure, similar to Confluence's page hierarchy. Users can browse content through an expandable/collapsible tree on the left, with post content dynamically loaded on the right side without page navigation.

## Architecture

### Database Schema

The system uses two main tables:

#### 1. `paths` Table (Virtual Folders)
```sql
CREATE TABLE paths (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  parent_id INTEGER REFERENCES paths(id) ON DELETE CASCADE,
  level INTEGER DEFAULT 1 CHECK(level >= 1 AND level <= 5),
  full_path VARCHAR(500) NOT NULL UNIQUE,
  icon VARCHAR(50),
  color VARCHAR(50),
  position INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Key Features:**
- Self-referential hierarchy using `parent_id`
- `full_path` for unique path identification (e.g., `/documentation/business`)
- `level` constraint (max 5 levels deep)
- Cascading deletes to maintain referential integrity

#### 2. `posts` Table (Extended)
```sql
ALTER TABLE posts ADD COLUMN path_id INTEGER REFERENCES paths(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN parent_id INTEGER REFERENCES posts(id) ON DELETE CASCADE;
ALTER TABLE posts ADD COLUMN position INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN level INTEGER DEFAULT 1 CHECK(level >= 1 AND level <= 5);
ALTER TABLE posts ADD COLUMN category_post_number INTEGER;
```

**Relationships:**
- `path_id`: Associates post with a virtual path/folder
- `parent_id`: Allows posts to have child posts (for nested pages)
- `category_post_number`: Sequential numbering per category

### File Structure

```
src/
├── routes/
│   ├── api/
│   │   ├── paths/
│   │   │   └── hierarchy/
│   │   │       └── +server.js          # Combined paths + posts API
│   │   └── posts/
│   │       ├── hierarchy/
│   │       │   └── +server.js          # Post-only hierarchy API
│   │       └── [id]/
│   │           └── content/
│   │               └── +server.js      # Individual post content API
│   └── explorer/
│       └── +page.svelte                # Explorer page entry point
└── lib/
    └── components/
        ├── ConfluenceExplorer.svelte   # Main explorer component
        ├── PathPostTree.svelte         # Tree rendering component
        └── PostHierarchyTree.svelte    # Legacy post-only tree
```

## Component Architecture

### 1. ConfluenceExplorer.svelte

**Purpose:** Main container component that manages state and data loading.

**Key Responsibilities:**
- Fetch paths and posts data from API
- Manage selected post state
- Load post content dynamically
- Handle breadcrumbs and navigation
- Render split-view layout (tree + content)

**State Variables:**
```javascript
let paths = [];          // All paths from database
let posts = [];          // All posts from database
let selectedPost = null; // Currently displayed post
let breadcrumbs = [];    // Navigation breadcrumbs
let loading = false;     // Loading indicator
let error = null;        // Error state
let currentPostId = null; // Selected post ID
```

**Data Flow:**
```
onMount()
  → loadHierarchy()
    → fetch('/api/paths/hierarchy')
      → paths = data.paths, posts = data.posts
        → PathPostTree receives data via props
```

### 2. PathPostTree.svelte

**Purpose:** Recursive tree component that renders paths and posts hierarchically.

**Key Features:**
- Builds tree structure from flat arrays
- Manages expand/collapse state per path
- Handles recursive rendering for nested paths
- Dispatches 'select' event when post is clicked

**Tree Building Algorithm:**
```javascript
function buildTree() {
  if (level > 0) {
    // Recursive calls: data already filtered
    return { paths, posts };
  }

  // Root level: build complete hierarchy
  const pathMap = new Map();
  const rootPaths = [];

  // 1. Create all path nodes
  paths.forEach(path => {
    pathMap.set(path.id, { ...path, children: [], pathPosts: [] });
  });

  // 2. Build hierarchy and associate posts
  paths.forEach(path => {
    const node = pathMap.get(path.id);

    // Filter posts belonging to this path
    const pathPosts = posts.filter(p => p.path_id === path.id);
    node.pathPosts = pathPosts;

    // Build parent-child relationships
    if (path.parent_id === null) {
      rootPaths.push(node);
    } else if (pathMap.has(path.parent_id)) {
      pathMap.get(path.parent_id).children.push(node);
    }
  });

  // 3. Get root-level posts (no path)
  const rootPosts = posts.filter(p => !p.path_id);

  return { paths: rootPaths, posts: rootPosts };
}
```

**Recursive Rendering:**
```svelte
{#each tree.paths as path}
  <li class="tree-item">
    <!-- Path node with expand/collapse -->
    <div class="tree-node path-node" on:click={handlePathClick}>
      <button class="expand-btn">{expanded ? '▼' : '▶'}</button>
      <span class="item-icon">{path.icon || '📁'}</span>
      <span class="item-title">{path.name}</span>
    </div>

    {#if expandedItems['path-' + path.id]}
      <!-- Show posts in this path -->
      {#if path.pathPosts && path.pathPosts.length > 0}
        <ul class="tree-level">
          {#each path.pathPosts as post}
            <div class="tree-node post-node" on:click={() => handlePostClick(post)}>
              <span class="item-icon">📄</span>
              <span class="item-title">{post.title}</span>
            </div>
          {/each}
        </ul>
      {/if}

      <!-- Recursively render child paths -->
      {#if path.children && path.children.length > 0}
        <svelte:self
          paths={path.children}
          posts={[]}
          level={level + 1}
          on:select
        />
      {/if}
    {/if}
  </li>
{/each}
```

### 3. API Endpoints

#### `/api/paths/hierarchy` (GET)
Returns combined hierarchical data of paths and posts.

**Response:**
```json
{
  "success": true,
  "paths": [
    {
      "id": 3,
      "name": "dev",
      "slug": "dev",
      "parent_id": null,
      "level": 1,
      "full_path": "/dev",
      "icon": "📁",
      "child_count": "1"
    }
  ],
  "posts": [
    {
      "id": 13,
      "title": "test100",
      "slug": "test100",
      "path_id": 3,
      "category": "Others",
      "category_post_number": 1,
      "author": "Administrator",
      "child_count": "0"
    }
  ]
}
```

**SQL Query:**
Uses recursive CTE (Common Table Expression) to build path hierarchy:
```sql
WITH RECURSIVE path_tree AS (
  -- Root paths (no parent)
  SELECT p.*, 0 as depth,
         (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as child_count
  FROM paths p
  WHERE p.parent_id IS NULL

  UNION ALL

  -- Child paths (recursive)
  SELECT p.*, pt.depth + 1,
         (SELECT COUNT(*) FROM paths WHERE parent_id = p.id) as child_count
  FROM paths p
  INNER JOIN path_tree pt ON p.parent_id = pt.id
  WHERE pt.depth < 4  -- Max depth limit
)
SELECT * FROM path_tree
ORDER BY depth, position, name
```

#### `/api/posts/[id]/content` (GET)
Returns detailed post content with children and breadcrumbs.

**Response:**
```json
{
  "success": true,
  "post": {
    "id": 21,
    "title": "Start the server",
    "content": "<p>HTML content...</p>",
    "author": "Administrator",
    "children": [
      { "id": 22, "title": "Child Post" }
    ]
  },
  "breadcrumbs": [
    { "id": 8, "title": "documentation" },
    { "id": 10, "title": "production" },
    { "id": 21, "title": "Start the server" }
  ]
}
```

## Issues Faced & Solutions

### Issue 1: Svelte Reactivity Not Triggering

**Problem:**
When the component first loaded, `paths` and `posts` arrays were empty. After the API call completed and the arrays were populated, the tree component (`PathPostTree`) didn't re-render. The component showed "No content available" even though data was loaded.

**Root Cause:**
Svelte's reactivity system wasn't detecting the array assignment as a change. The component was created with empty arrays, and when the parent updated the props, the reactive statement `$: tree = buildTree()` didn't re-run.

**Debugging:**
```javascript
// Console logs showed:
ConfluenceExplorer: ASSIGNED paths/posts: { pathsCount: 8, postsCount: 15 }  ✓
PathPostTree: Building tree with paths: Array []                              ✗
```

**Solution:**
Used Svelte's `{#key}` block to force component recreation when data loads:

```svelte
{#key paths.length + posts.length}
  <PathPostTree
    {paths}
    {posts}
    selectedPostId={currentPostId}
    on:select={handlePostSelect}
  />
{/key}
```

**How it works:**
- When `paths.length + posts.length` changes from `0` to `23`, the key value changes
- Svelte destroys the old component instance and creates a new one
- New instance receives fresh data with populated arrays

### Issue 2: Shared State Causing Expand/Collapse Bugs

**Problem:**
Initial implementation used a shared `Set` for tracking expanded items across all component instances. This caused:
- Expand state persisting incorrectly between page loads
- Sometimes tree appeared empty after page refresh
- Expand/collapse not working reliably

**Original Code:**
```javascript
// Parent component
let expandedItems = new Set();

// Passed to child via bind:
<PathPostTree bind:expandedItems />

// Recursive child:
<svelte:self bind:expandedItems />
```

**Issues:**
1. `Set` objects don't trigger Svelte reactivity properly
2. Binding the same Set reference across recursive components created shared mutable state
3. State mutations in child components didn't propagate correctly

**Solution:**
Made each component instance manage its own expand state locally:

```javascript
// Each component instance has own state
let expandedItems = {};  // Object instead of Set

function toggleExpand(itemId) {
  expandedItems[itemId] = !expandedItems[itemId];
  expandedItems = expandedItems; // Trigger reactivity
}
```

**Benefits:**
- Each tree level manages its own expand/collapse state
- Plain objects trigger Svelte reactivity reliably
- No shared mutable state between instances
- Simpler code without bind: directives

### Issue 3: Missing `created_at` Column in Hierarchy Query

**Problem:**
SQL error when loading post hierarchy:
```
Error: column "created_at" does not exist
```

**Root Cause:**
The recursive CTE query used `created_at` in the `ORDER BY` clause but didn't select it in the SELECT statement:

```sql
WITH RECURSIVE post_tree AS (
  SELECT p.id, p.title, p.slug, ...  -- created_at missing
  ...
)
SELECT * FROM post_tree
ORDER BY depth, position, created_at  -- Error: column doesn't exist
```

**Solution:**
Added `p.created_at` to the SELECT clause in both parts of the recursive query:

```sql
WITH RECURSIVE post_tree AS (
  -- Root posts
  SELECT p.id, p.title, p.slug, p.created_at, ...
  FROM posts p
  WHERE p.parent_id IS NULL

  UNION ALL

  -- Child posts
  SELECT p.id, p.title, p.slug, p.created_at, ...
  FROM posts p
  INNER JOIN post_tree pt ON p.parent_id = pt.id
)
SELECT * FROM post_tree
ORDER BY depth, position, created_at  -- Now works
```

### Issue 4: Database Connection Configuration

**Problem:**
Initially tried to use different database credentials than what was configured in the application.

**Root Cause:**
The application uses environment variables from `.env` file:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vectordb
```

But API endpoint was trying to use a different connection string hardcoded in the file.

**Solution:**
Ensured all database operations use the shared `pool` object from `src/lib/db.js`:

```javascript
// src/routes/api/paths/hierarchy/+server.js
import { pool } from '$lib/db.js';  // Use shared pool

export async function GET() {
  const result = await pool.query(`SELECT ...`);
  // ...
}
```

**Benefits:**
- Single connection pool configuration
- Consistent across all API endpoints
- Proper connection pooling and error handling

## How It Works: Complete Flow

### 1. Page Load
```
User navigates to /explorer
  ↓
+page.svelte loads ConfluenceExplorer component
  ↓
onMount() triggers
  ↓
loadHierarchy() called
```

### 2. Data Fetching
```
fetch('/api/paths/hierarchy')
  ↓
Server: WITH RECURSIVE query gets all paths
  ↓
Server: SELECT query gets all posts with path_id
  ↓
Response: { success: true, paths: [...], posts: [...] }
  ↓
paths = data.paths (8 items)
posts = data.posts (15 items)
```

### 3. Component Rendering
```
{#key paths.length + posts.length} changes from 0 → 23
  ↓
PathPostTree component recreated with fresh data
  ↓
buildTree() function runs
  ↓
Tree structure built:
  - Root paths identified (parent_id = null)
  - Posts associated with each path
  - Child paths nested under parents
  ↓
Template renders tree with {#each tree.paths}
```

### 4. User Interaction
```
User clicks folder "📁 documentation"
  ↓
handlePathClick(path, event) triggered
  ↓
toggleExpand('path-8') called
  ↓
expandedItems['path-8'] = true
  ↓
Svelte reactivity: {#if expandedItems['path-8']} becomes true
  ↓
Posts in path rendered
Child paths rendered recursively
```

### 5. Post Selection
```
User clicks post "📄 DOC #1: Start the server"
  ↓
handlePostClick(post) in PathPostTree
  ↓
dispatch('select', post) event
  ↓
handlePostSelect(event) in ConfluenceExplorer
  ↓
loadPostContent(post.id) called
  ↓
fetch(`/api/posts/${postId}/content`)
  ↓
selectedPost = data.post
breadcrumbs = data.breadcrumbs
  ↓
Right panel updates with post content
URL updates: /explorer?post=21
```

## Key Design Decisions

### 1. Why Separate paths and posts Arrays?

**Decision:** Keep paths and posts as separate arrays, merge them in the tree building function.

**Rationale:**
- Database schema separates them (different tables)
- Allows posts without paths (root-level posts)
- Easier to query and maintain
- Flexible: can show posts in multiple paths if needed

**Alternative Considered:**
Nested JSON structure from database. **Rejected** because:
- Complex SQL queries
- Less flexible
- Harder to cache and optimize

### 2. Why Recursive Component Instead of Nested Data?

**Decision:** Use `<svelte:self>` for recursion with flat data structure.

**Rationale:**
- Cleaner API responses (no deeply nested JSON)
- Better performance (build tree on client once)
- Easier to debug
- Svelte handles recursion efficiently

### 3. Why Local Expand State?

**Decision:** Each component instance manages its own `expandedItems` object.

**Rationale:**
- Avoids shared mutable state bugs
- Simpler mental model
- Better Svelte reactivity
- No need for complex state management

**Trade-off:**
Expand state resets on component unmount. This is acceptable because:
- Users typically navigate by clicking posts (which keeps state)
- Fresh view on page reload is expected behavior
- Can add localStorage persistence later if needed

## Performance Considerations

### Database Queries
- **Recursive CTEs**: Limit depth to 4 levels to prevent infinite loops
- **Indexes**: Created on `parent_id`, `position`, `level` for fast traversal
- **Single Query**: Fetch all paths/posts in one query (avoid N+1 problem)

### Client-Side Rendering
- **Tree Building**: O(n) complexity, runs once on data load
- **Component Reuse**: Svelte efficiently updates only changed nodes
- **Lazy Loading**: Child paths rendered only when expanded

### Future Optimizations
1. **Pagination**: Load posts on-demand for large folders
2. **Virtual Scrolling**: For very long lists
3. **Caching**: Cache tree structure in localStorage
4. **Server-Side Rendering**: Pre-render tree for faster initial load

## Testing Scenarios

### Manual Testing Checklist
- [ ] Load /explorer page → See paths and posts
- [ ] Click folder icon → Expand to show contents
- [ ] Click post → Content loads on right side
- [ ] Click breadcrumb → Navigate to parent
- [ ] Refresh page → Tree loads consistently
- [ ] Multiple refreshes → No empty state bugs
- [ ] Navigate away and back → Fresh load works
- [ ] Deep nesting (4+ levels) → All levels render
- [ ] Empty folder → Shows folder but no posts
- [ ] Post without path → Shows at root level

### Known Limitations
1. **Max Depth**: Limited to 4-5 levels (database constraint)
2. **No Drag-and-Drop**: Cannot reorder or move items via UI
3. **No Search**: No filter/search within tree
4. **No Icons Customization**: Path icons hardcoded to 📁

## Future Enhancements

### Planned Features
1. **Create Sub-Page Button**: Add child posts from parent post view
2. **Drag-and-Drop**: Reorder posts and move between paths
3. **Path Management UI**: Create/edit/delete paths from explorer
4. **Search & Filter**: Search posts within tree
5. **Keyboard Navigation**: Arrow keys to navigate tree
6. **Breadcrumb Path Selection**: Click path in breadcrumb to load path view
7. **Recent Items**: Show recently viewed posts
8. **Favorites/Bookmarks**: Star important posts

### Technical Improvements
1. **TypeScript**: Add type definitions
2. **Error Boundaries**: Better error handling UI
3. **Loading States**: Skeleton screens during load
4. **Optimistic Updates**: Update UI before server confirms
5. **Accessibility**: Full ARIA support, screen reader testing
6. **Mobile Responsive**: Better mobile tree navigation

## Troubleshooting

### Tree Not Showing After Refresh

**Symptom:** Explorer shows "No content available" after page refresh.

**Check:**
1. Browser console for errors
2. Network tab: Is `/api/paths/hierarchy` returning data?
3. Console logs: Are paths/posts arrays populated?

**Fix:**
Ensure `{#key}` block is present in ConfluenceExplorer:
```svelte
{#key paths.length + posts.length}
  <PathPostTree ... />
{/key}
```

### Expand/Collapse Not Working

**Symptom:** Clicking folder icons doesn't expand paths.

**Check:**
1. Are there actually posts in the path?
2. Check `expandedItems` state in component

**Fix:**
Ensure `toggleExpand` creates new object reference:
```javascript
expandedItems[itemId] = !expandedItems[itemId];
expandedItems = expandedItems; // Required for reactivity
```

### Posts Not Associated with Paths

**Symptom:** Posts appear at root level instead of inside folders.

**Check:**
Database query: `SELECT id, title, path_id FROM posts;`

**Fix:**
Update posts to have correct `path_id`:
```sql
UPDATE posts SET path_id = 3 WHERE id = 13;
```

## References

- [Svelte Reactivity Guide](https://svelte.dev/docs#component-format-script-3-$-marks-a-statement-as-reactive)
- [Recursive Components in Svelte](https://svelte.dev/docs#template-syntax-svelte-self)
- [PostgreSQL Recursive Queries](https://www.postgresql.org/docs/current/queries-with.html)
- [SvelteKit Routing](https://kit.svelte.dev/docs/routing)
