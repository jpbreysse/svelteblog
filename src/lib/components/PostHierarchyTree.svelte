<script>
  import { createEventDispatcher } from 'svelte';

  export let posts = [];
  export let selectedPostId = null;
  export let level = 0;

  const dispatch = createEventDispatcher();

  let expandedPosts = new Set();

  // Build tree structure from flat array (only at root level)
  function buildTree(flatPosts) {
    if (level > 0) return flatPosts; // Don't rebuild tree for recursive calls

    const postMap = new Map();
    const rootPosts = [];

    // First pass: create map
    flatPosts.forEach(post => {
      postMap.set(post.id, { ...post, children: [] });
    });

    // Second pass: build tree
    flatPosts.forEach(post => {
      const node = postMap.get(post.id);
      if (post.parent_id === null) {
        rootPosts.push(node);
      } else if (postMap.has(post.parent_id)) {
        postMap.get(post.parent_id).children.push(node);
      }
    });

    return rootPosts;
  }

  $: tree = buildTree(posts);

  function toggleExpand(postId, event) {
    event.stopPropagation();
    if (expandedPosts.has(postId)) {
      expandedPosts.delete(postId);
    } else {
      expandedPosts.add(postId);
    }
    expandedPosts = expandedPosts; // Trigger reactivity
  }

  function handlePostClick(post) {
    // Expand post if it has children
    if (post.children && post.children.length > 0 && !expandedPosts.has(post.id)) {
      expandedPosts.add(post.id);
      expandedPosts = expandedPosts;
    }

    dispatch('select', post);
  }
</script>

{#if tree.length === 0}
  <div class="empty-tree">
    <p>No posts available</p>
  </div>
{:else}
  <ul class="tree-level" style="--level: {level}">
    {#each tree as post}
      <li class="tree-item">
        <div
          class="tree-node"
          class:selected={post.id === selectedPostId}
          class:has-children={post.children && post.children.length > 0}
          on:click={() => handlePostClick(post)}
          on:keypress={(e) => e.key === 'Enter' && handlePostClick(post)}
          role="button"
          tabindex="0"
        >
          {#if post.children && post.children.length > 0}
            <button
              class="expand-btn"
              on:click={(e) => toggleExpand(post.id, e)}
              aria-label={expandedPosts.has(post.id) ? 'Collapse' : 'Expand'}
            >
              {expandedPosts.has(post.id) ? '▼' : '▶'}
            </button>
          {:else}
            <span class="expand-spacer"></span>
          {/if}

          <span class="post-icon">📄</span>

          <span class="post-info">
            {#if post.category_post_number && post.category}
              <span class="post-prefix">{post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}:</span>
            {/if}
            <span class="post-title">{post.title}</span>
          </span>

          {#if post.child_count > 0}
            <span class="child-count">{post.child_count}</span>
          {/if}
        </div>

        {#if expandedPosts.has(post.id) && post.children && post.children.length > 0}
          <svelte:self
            posts={post.children}
            {selectedPostId}
            level={level + 1}
            on:select
          />
        {/if}
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
    padding-left: calc(var(--level, 0) * 1.25rem);
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
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    user-select: none;
  }

  .tree-node:hover {
    background: #f3f4f6;
  }

  .tree-node.selected {
    background: #dbeafe;
    border-left: 3px solid #2563eb;
    font-weight: 500;
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

  .post-icon {
    font-size: 1rem;
    flex-shrink: 0;
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

  .post-title {
    color: #374151;
    font-size: 0.875rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tree-node.selected .post-title {
    color: #1f2937;
  }

  .child-count {
    background: #e5e7eb;
    color: #6b7280;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .tree-node.selected .child-count {
    background: #93c5fd;
    color: #1e40af;
  }
</style>
