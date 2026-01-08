<script>
  import { createEventDispatcher } from 'svelte';

  export let paths = [];
  export let posts = [];
  export let selectedPostId = null;
  export let level = 0;
  export let autoExpandPathIds = [];
  export let searchQuery = '';
  export let editablePosts = new Set();

  const dispatch = createEventDispatcher();

  let expandedItems = {};

  // Check if a path should be auto-expanded
  function shouldAutoExpand(pathId) {
    return autoExpandPathIds && autoExpandPathIds.includes(pathId);
  }

  // Auto-expand paths if provided (all ancestors)
  $: if (autoExpandPathIds && autoExpandPathIds.length > 0) {
    autoExpandPathIds.forEach(pathId => {
      expandedItems['path-' + pathId] = true;
    });
    expandedItems = expandedItems; // Trigger reactivity

    // Scroll to the deepest expanded path after a short delay (only at root level)
    if (level === 0) {
      setTimeout(() => {
        const deepestPathId = autoExpandPathIds[0]; // First in array is the deepest
        const element = document.querySelector(`[data-path-id="${deepestPathId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }

  // Build combined tree structure
  function buildTree() {
    if (level > 0) {
      // For recursive calls, paths/posts are already in the right structure
      return { paths, posts };
    }

    // Build path hierarchy at root level
    const pathMap = new Map();
    const rootPaths = [];

    // Create all path nodes
    paths.forEach(path => {
      pathMap.set(path.id, { ...path, children: [], pathPosts: [] });
    });

    // Build hierarchy and associate posts
    paths.forEach(path => {
      const node = pathMap.get(path.id);

      // Add posts to this path
      const pathPosts = posts.filter(p => p.path_id === path.id);
      node.pathPosts = pathPosts;

      // Build tree structure
      if (path.parent_id === null) {
        rootPaths.push(node);
      } else if (pathMap.has(path.parent_id)) {
        pathMap.get(path.parent_id).children.push(node);
      }
    });

    // Get root posts (no path)
    const rootPosts = posts.filter(p => !p.path_id);

    return { paths: rootPaths, posts: rootPosts };
  }

  $: tree = buildTree();

  function toggleExpand(itemId) {
    expandedItems[itemId] = !expandedItems[itemId];
    expandedItems = expandedItems; // Trigger reactivity
  }

  function handlePathClick(path, event) {
    event.stopPropagation();
    toggleExpand('path-' + path.id);
    // Notify parent that this path was selected
    dispatch('pathselect', { pathId: path.id, pathName: path.name });
  }

  function handlePostClick(post) {
    dispatch('select', post);
  }

  // Highlight matching text
  function highlightMatch(text, query) {
    if (!query || !text) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }
</script>

{#if tree.paths.length === 0 && tree.posts.length === 0}
  <div class="empty-tree">
    <p>No content available</p>
  </div>
{:else}
  <ul class="tree-level" style="--level: {level}">
    <!-- Render paths (folders) -->
    {#each tree.paths as path}
      <li class="tree-item">
        <div
          class="tree-node path-node"
          class:expanded={expandedItems['path-' + path.id] || shouldAutoExpand(path.id)}
          data-path-id={path.id}
          on:click={(e) => handlePathClick(path, e)}
          on:keypress={(e) => e.key === 'Enter' && handlePathClick(path, e)}
          role="button"
          tabindex="0"
        >
          <button
            class="expand-btn"
            on:click={(e) => { e.stopPropagation(); toggleExpand('path-' + path.id); }}
            aria-label={(expandedItems['path-' + path.id] || shouldAutoExpand(path.id)) ? 'Collapse' : 'Expand'}
          >
            {(expandedItems['path-' + path.id] || shouldAutoExpand(path.id)) ? '▼' : '▶'}
          </button>

          <span class="item-icon">{path.icon || '📁'}</span>

          <span class="item-title">{@html highlightMatch(path.name, searchQuery)}</span>

          {#if (path.pathPosts && path.pathPosts.length > 0) || path.child_count > 0}
            <span class="item-count">{(path.pathPosts?.length || 0) + (parseInt(path.child_count) || 0)}</span>
          {/if}
        </div>

        {#if expandedItems['path-' + path.id] || shouldAutoExpand(path.id)}
          <!-- Show posts in this path -->
          {#if path.pathPosts && path.pathPosts.length > 0}
            <ul class="tree-level" style="--level: {level + 1}">
              {#each path.pathPosts as post}
                <li class="tree-item">
                  <div
                    class="tree-node post-node"
                    class:selected={post.id === selectedPostId}
                  >
                    <div
                      class="post-content"
                      on:click={() => handlePostClick(post)}
                      on:keypress={(e) => e.key === 'Enter' && handlePostClick(post)}
                      role="button"
                      tabindex="0"
                    >
                      <span class="expand-spacer"></span>
                      <span class="item-icon">📄</span>
                      <span class="post-info">
                        {#if post.category_post_number && post.category}
                          <span class="post-prefix">{post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}:</span>
                        {/if}
                        <span class="item-title">{@html highlightMatch(post.title, searchQuery)}</span>
                      </span>
                    </div>
                    {#if editablePosts.has(post.id)}
                      <div class="post-actions">
                        <button
                          class="action-btn edit-btn"
                          on:click|stopPropagation={() => dispatch('edit', post)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          class="action-btn delete-btn"
                          on:click|stopPropagation={() => dispatch('delete', post.id)}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          {/if}

          <!-- Show child paths recursively -->
          {#if path.children && path.children.length > 0}
            <svelte:self
              paths={path.children}
              posts={[]}
              {selectedPostId}
              {autoExpandPathIds}
              {searchQuery}
              {editablePosts}
              level={level + 1}
              on:select
              on:pathselect
              on:edit
              on:delete
            />
          {/if}
        {/if}
      </li>
    {/each}

    <!-- Render root-level posts (no path) -->
    {#each tree.posts as post}
      <li class="tree-item">
        <div
          class="tree-node post-node"
          class:selected={post.id === selectedPostId}
        >
          <div
            class="post-content"
            on:click={() => handlePostClick(post)}
            on:keypress={(e) => e.key === 'Enter' && handlePostClick(post)}
            role="button"
            tabindex="0"
          >
            <span class="expand-spacer"></span>
            <span class="item-icon">📄</span>
            <span class="post-info">
              {#if post.category_post_number && post.category}
                <span class="post-prefix">{post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}:</span>
              {/if}
              <span class="item-title">{@html highlightMatch(post.title, searchQuery)}</span>
            </span>
          </div>
          {#if editablePosts.has(post.id)}
            <div class="post-actions">
              <button
                class="action-btn edit-btn"
                on:click|stopPropagation={() => dispatch('edit', post)}
                title="Edit"
              >
                ✏️
              </button>
              <button
                class="action-btn delete-btn"
                on:click|stopPropagation={() => dispatch('delete', post.id)}
                title="Delete"
              >
                🗑️
              </button>
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .empty-tree {
    padding: 2rem;
    text-align: center;
    color: #9ca3af;
  }

  .tree-level {
    list-style: none;
    padding-left: calc(var(--level, 0) * 1rem);
    margin: 0;
  }

  .tree-item {
    margin: 0;
  }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    transition: all 0.2s;
    user-select: none;
  }

  .tree-node:hover {
    background: #f3f4f6;
  }

  .path-node {
    font-weight: 500;
    cursor: pointer;
  }

  .post-node {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .post-node.selected {
    background: #dbeafe;
    border-left: 3px solid #2563eb;
    font-weight: 500;
  }

  .post-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
    cursor: pointer;
  }

  .post-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
    margin-left: auto;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .post-node:hover .post-actions,
  .tree-node:hover .post-actions {
    opacity: 1;
  }

  .action-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .action-btn:hover {
    background: rgba(0, 0, 0, 0.1);
  }

  .delete-btn:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .expand-btn {
    width: 20px;
    height: 20px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.75rem;
    color: #6b7280;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: color 0.2s;
  }

  .expand-btn:hover {
    color: #2563eb;
  }

  .expand-spacer {
    width: 20px;
  }

  .item-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .item-title {
    color: #374151;
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .post-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .post-prefix {
    color: #2563eb;
    font-weight: 600;
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .tree-node.selected .item-title {
    color: #1f2937;
  }

  .item-count {
    background: #e5e7eb;
    color: #6b7280;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .path-node .item-count {
    background: #fef3c7;
    color: #92400e;
  }

  .tree-node.selected .item-count {
    background: #93c5fd;
    color: #1e40af;
  }

  /* Search highlighting */
  :global(.item-title mark) {
    background: #fef08a;
    color: #713f12;
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-weight: 600;
  }
</style>
