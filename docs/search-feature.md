# Search Feature Documentation

## Overview

The Content Explorer includes a powerful search feature that allows users to filter paths and posts in real-time. The search is implemented as a live tree filter that maintains the hierarchical structure while showing only relevant results.

## Features

### 1. Real-Time Filtering
- Searches as you type with no delay
- Updates the tree instantly to show matching results
- Clear button (×) appears when search text is entered

### 2. Comprehensive Search Scope
The search queries multiple fields:
- **Post titles**: Searches through all post titles
- **Post categories**: Matches against post category names
- **Path names**: Searches path/folder names
- **Full path**: Searches the complete path hierarchy (e.g., "documentation/business")

### 3. Intelligent Path Expansion
- Automatically expands paths containing matching posts
- Keeps ancestor paths visible to maintain context
- Shows the full hierarchy leading to matches

### 4. Visual Highlighting
- Matching text is highlighted with a yellow background
- Uses brown text color for contrast
- Highlights appear in both path names and post titles

## User Interface

### Search Box Location
The search input is positioned in the left sidebar:
```
┌─────────────────────┐
│   Sidebar Header    │
├─────────────────────┤
│   🔍 Search Box     │  ← Search input here
├─────────────────────┤
│   📁 Path Tree      │
│   └─ 📄 Posts       │
└─────────────────────┘
```

### Search Box Components
- **Search icon** (🔍): Visual indicator on the left
- **Input field**: Placeholder text "Search posts..."
- **Clear button** (×): Appears when text is entered, clears search on click

## Technical Implementation

### Architecture Overview

The search feature is implemented across two main components:

1. **ConfluenceExplorer.svelte** - Main search logic and state management
2. **PathPostTree.svelte** - Highlighting and display of search results

### Data Flow

```
User Input
    ↓
searchQuery (reactive variable)
    ↓
filterBySearch() function
    ↓
{filteredPaths, filteredPosts, expandedPathIds}
    ↓
PathPostTree component (with highlighting)
    ↓
Rendered tree with highlights
```

### Key Components

#### 1. Search Input (ConfluenceExplorer.svelte)

```svelte
<div class="search-container">
  <div class="search-box">
    <span class="search-icon">🔍</span>
    <input
      type="text"
      placeholder="Search posts..."
      bind:value={searchQuery}
      class="search-input"
    />
    {#if searchQuery}
      <button class="clear-search" on:click={() => searchQuery = ''}>
        ×
      </button>
    {/if}
  </div>
</div>
```

**State Variable:**
```javascript
let searchQuery = '';
```

#### 2. Filter Logic (ConfluenceExplorer.svelte)

The `filterBySearch()` function handles all filtering logic:

```javascript
function filterBySearch(pathsData, postsData, query) {
  // Return all data if no search query
  if (!query || query.trim() === '') {
    return {
      filteredPaths: pathsData,
      filteredPosts: postsData,
      expandedPathIds: []
    };
  }

  const searchLower = query.toLowerCase().trim();
  const pathsToExpand = new Set();

  // Filter posts by title and category
  const filteredPosts = postsData.filter(post => {
    const matches =
      post.title.toLowerCase().includes(searchLower) ||
      (post.category && post.category.toLowerCase().includes(searchLower));

    // If post matches and has a path, expand all ancestor paths
    if (matches && post.path_id) {
      const ancestors = getPathAncestors(post.path_id, pathsData);
      ancestors.forEach(id => pathsToExpand.add(id));
    }

    return matches;
  });

  // Get IDs of paths containing matching posts
  const pathIdsWithPosts = new Set(
    filteredPosts.map(p => p.path_id).filter(id => id !== null)
  );

  // Filter paths: keep if name/path matches OR contains matching posts
  const filteredPaths = pathsData.filter(path => {
    const nameMatches =
      path.name.toLowerCase().includes(searchLower) ||
      (path.full_path && path.full_path.toLowerCase().includes(searchLower));

    const hasMatchingPosts = pathIdsWithPosts.has(path.id);

    // If this path or its posts match, expand ancestors
    if (nameMatches || hasMatchingPosts) {
      const ancestors = getPathAncestors(path.id, pathsData);
      ancestors.forEach(id => pathsToExpand.add(id));
    }

    return nameMatches || hasMatchingPosts;
  });

  // Keep ancestor paths visible
  const allRelevantPathIds = new Set([
    ...filteredPaths.map(p => p.id),
    ...pathsToExpand
  ]);

  const finalPaths = pathsData.filter(p => allRelevantPathIds.has(p.id));

  return {
    filteredPaths: finalPaths,
    filteredPosts: filteredPosts,
    expandedPathIds: Array.from(pathsToExpand)
  };
}
```

**Helper Function - Get Path Ancestors:**
```javascript
function getPathAncestors(pathId, pathsData) {
  const ancestors = [];
  let currentPath = pathsData.find(p => p.id === pathId);

  while (currentPath) {
    ancestors.push(currentPath.id);
    currentPath = pathsData.find(p => p.id === currentPath.parent_id);
  }

  return ancestors;
}
```

#### 3. Reactive Statements (ConfluenceExplorer.svelte)

Svelte's reactivity automatically updates the tree when search changes:

```javascript
// Run filter when search query or data changes
$: searchResults = filterBySearch(paths, posts, searchQuery);

// Extract filtered data
$: filteredPaths = searchResults.filteredPaths;
$: filteredPosts = searchResults.filteredPosts;
$: searchExpandPaths = searchResults.expandedPathIds;

// Merge search expansion with manual expansion
$: allExpandPathIds = searchQuery ? searchExpandPaths : expandPathIds;
```

**Pass to Tree Component:**
```svelte
<PathPostTree
  paths={filteredPaths}
  posts={filteredPosts}
  selectedPostId={selectedPost?.id}
  autoExpandPathIds={allExpandPathIds}
  searchQuery={searchQuery}
  on:select={handlePostSelect}
  on:pathselect={handlePathSelect}
/>
```

#### 4. Highlighting (PathPostTree.svelte)

**Highlight Function:**
```javascript
function highlightMatch(text, query) {
  if (!query || !text) return text;

  // Escape special regex characters
  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
    'gi'
  );

  return text.replace(regex, '<mark>$1</mark>');
}
```

**Usage in Template:**
```svelte
<!-- Path name with highlighting -->
<span class="item-title">
  {@html highlightMatch(path.name, searchQuery)}
</span>

<!-- Post title with highlighting -->
<span class="item-title">
  {@html highlightMatch(post.title, searchQuery)}
</span>
```

**Note:** The `{@html}` directive renders the `<mark>` tags as HTML.

#### 5. Highlight Styling (PathPostTree.svelte)

```css
/* Search highlighting */
:global(.item-title mark) {
  background: #fef08a;     /* Yellow background */
  color: #713f12;          /* Brown text */
  padding: 0.125rem 0.25rem;
  border-radius: 3px;
  font-weight: 600;
}
```

**Note:** `:global()` is used because the `<mark>` tag is injected via `{@html}`.

### Search Box Styling (ConfluenceExplorer.svelte)

```css
.search-container {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e5e7eb;
  background: white;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  transition: all 0.2s;
}

.search-box:focus-within {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.search-icon {
  font-size: 1rem;
  color: #6b7280;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 0.875rem;
  color: #374151;
  background: transparent;
}

.search-input::placeholder {
  color: #9ca3af;
}

.clear-search {
  width: 20px;
  height: 20px;
  border: none;
  background: #e5e7eb;
  color: #6b7280;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.clear-search:hover {
  background: #d1d5db;
  color: #374151;
}
```

## Search Behavior

### Case Insensitivity
All searches are case-insensitive. "Business", "business", and "BUSINESS" all match the same results.

### Partial Matching
The search uses substring matching, so:
- "doc" matches "documentation"
- "bus" matches "business"
- "API" matches "API Reference Guide"

### Special Characters
Special regex characters are automatically escaped, so you can safely search for:
- Parentheses: `(example)`
- Brackets: `[test]`
- Periods: `file.name`
- Other special chars: `$`, `^`, `*`, etc.

### Empty Search
When the search box is empty or only contains whitespace:
- All paths and posts are displayed
- The tree returns to its normal state
- Previously expanded paths remain expanded

### No Results
When a search returns no results:
- The tree shows "No content available"
- The search box remains functional
- Clearing the search restores all content

## Performance Considerations

### Efficiency
- **Filtering**: O(n) where n is the number of posts + paths
- **Ancestor lookup**: O(d) where d is the depth of the tree
- **Highlighting**: O(m) where m is the text length

### Optimization Tips
1. The filter runs on every keystroke (reactive)
2. For very large datasets (1000+ items), consider debouncing
3. Highlighting uses escaped regex for safety

## Integration with Other Features

### Path Expansion
Search expansion works alongside manual path expansion:
- Manual expansions are preserved when search is cleared
- Search expansions override manual state while active
- URL-based expansion (`?expand=11,8`) is preserved

### Path Selection
- Selected post highlighting is maintained during search
- Path selection still works with filtered results
- Creating new posts respects the selected path

### Auto-Scroll
- Search does not trigger auto-scroll
- Auto-scroll only activates for URL-based expansion
- This prevents jarring movement while typing

## Future Enhancements

Potential improvements for the search feature:

1. **Debouncing**: Add delay before filtering for large datasets
2. **Search Filters**: Add dropdowns for category, author, date
3. **Result Count**: Display "X results found"
4. **Keyboard Navigation**: Arrow keys to navigate results
5. **Search History**: Remember recent searches
6. **Advanced Syntax**: Support for "AND", "OR", exclusions
7. **Fuzzy Matching**: Tolerate typos (Levenshtein distance)
8. **Search in Content**: Search post content, not just titles

## Troubleshooting

### Highlights Not Showing
- Check that `searchQuery` is being passed to PathPostTree
- Verify the `:global()` CSS selector is present
- Ensure `{@html}` is used, not regular `{}`

### No Results When Expected
- Check the `filterBySearch()` logic
- Verify data is loaded (check `paths` and `posts` arrays)
- Console log the search query to check formatting

### Paths Not Expanding
- Verify `getPathAncestors()` is returning correct IDs
- Check that `autoExpandPathIds` is being passed through recursion
- Ensure `shouldAutoExpand()` is called in expansion checks

## Example Usage

### Simple Title Search
Search: `"API"`
Results: All posts with "API" in the title
- API Reference Guide
- REST API Documentation
- API Best Practices

### Path Search
Search: `"documentation"`
Results: All paths with "documentation" in name/full_path
- documentation/
- documentation/business/
- documentation/technical/

### Category Search
Search: `"tutorial"`
Results: All posts in "tutorial" category
- TUT #1: Getting Started
- TUT #2: Advanced Features

### Combined Results
Search: `"business"`
Results:
- Paths: documentation/business/
- Posts in business path
- Posts with "business" in title
- Posts in "business" category

## Code References

- Main search logic: `src/lib/components/ConfluenceExplorer.svelte:105-200`
- Highlight function: `src/lib/components/PathPostTree.svelte:96-101`
- Search UI: `src/lib/components/ConfluenceExplorer.svelte:50-65`
- Styling: Both component `<style>` sections
