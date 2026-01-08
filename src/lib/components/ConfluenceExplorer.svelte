<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PathPostTree from './PathPostTree.svelte';

  export let user = null;

  let paths = [];
  let posts = [];
  let selectedPost = null;
  let breadcrumbs = [];
  let loading = false;
  let error = null;
  let currentPostId = null;
  let selectedPathId = null;
  let expandPathIds = [];
  let searchQuery = '';
  let userGroups = [];

  // Compute which posts the user can edit (reactive to userGroups changes)
  $: editablePosts = new Set(
    posts
      .filter(post => {
        if (!user) return false;
        if (post.author_id === user.id || user.role === 'admin') return true;
        if (post.visibility === 'groups' && userGroups.length > 0) return true;
        return false;
      })
      .map(post => post.id)
  );

  // Reactive filtered data based on search
  $: searchResults = filterBySearch(paths, posts, searchQuery);
  $: filteredPaths = searchResults.filteredPaths;
  $: filteredPosts = searchResults.filteredPosts;
  $: searchExpandPaths = searchResults.expandedPathIds;

  // Combine manual expand and search expand
  $: allExpandPathIds = searchQuery ? searchExpandPaths : expandPathIds;

  onMount(async () => {
    loadHierarchy();

    // Load user's groups for permissions
    if (user) {
      try {
        const groupsResponse = await fetch('/api/groups/my-groups');
        const groupsData = await groupsResponse.json();
        if (groupsData.success) {
          userGroups = groupsData.groups || [];
        }
      } catch (error) {
        console.error('Failed to load groups:', error);
      }
    }

    // Check URL for initial post selection
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('post');
    if (postId) {
      loadPostContent(parseInt(postId));
    }

    // Check URL for paths to auto-expand (comma-separated)
    const expandParam = urlParams.get('expand');
    if (expandParam) {
      expandPathIds = expandParam.split(',').map(id => parseInt(id));
      // Set the last (deepest) path as selected
      selectedPathId = expandPathIds[0];
    }
  });

  async function loadHierarchy() {
    try {
      const response = await fetch('/api/paths/hierarchy');
      const data = await response.json();

      if (data.success) {
        paths = data.paths;
        posts = data.posts;
      } else {
        error = data.error;
      }
    } catch (err) {
      console.error('Error loading hierarchy:', err);
      error = 'Failed to load content';
    }
  }

  async function loadPostContent(postId) {
    loading = true;
    error = null;
    currentPostId = postId;

    try {
      const response = await fetch(`/api/posts/${postId}/content`);
      const data = await response.json();

      if (data.success) {
        selectedPost = data.post;
        breadcrumbs = data.breadcrumbs;

        // Update URL without navigation
        const url = new URL(window.location);
        url.searchParams.set('post', postId);
        window.history.pushState({}, '', url);
      } else {
        error = data.error;
        selectedPost = null;
      }
    } catch (err) {
      console.error('Error loading post content:', err);
      error = 'Failed to load post content';
      selectedPost = null;
    } finally {
      loading = false;
    }
  }

  function handlePostSelect(event) {
    const post = event.detail;
    loadPostContent(post.id);
  }

  function handlePathSelect(event) {
    selectedPathId = event.detail.pathId;
  }

  async function handleEditPost(event) {
    const post = event.detail;
    // Redirect to blog editor with this post
    goto(`/blog?edit=${post.id}`);
  }

  async function handleDeletePost(event) {
    const postId = event.detail;

    if (!confirm('Are you sure you want to delete this post?')) {
      return;
    }

    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        alert('✅ Post deleted successfully!');
        // Reload hierarchy
        await loadHierarchy();
        // Clear selected post if it was the deleted one
        if (currentPostId === postId) {
          selectedPost = null;
          currentPostId = null;
        }
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('❌ Failed to delete post');
    }
  }

  // Search filtering logic
  function filterBySearch(pathsData, postsData, query) {
    if (!query || query.trim() === '') {
      return {
        filteredPaths: pathsData,
        filteredPosts: postsData,
        expandedPathIds: []
      };
    }

    const searchLower = query.toLowerCase().trim();
    const matchedPostIds = new Set();
    const matchedPathIds = new Set();
    const pathsToExpand = new Set();

    // Filter posts by title
    const filteredPosts = postsData.filter(post => {
      const matches = post.title.toLowerCase().includes(searchLower) ||
                     (post.category && post.category.toLowerCase().includes(searchLower));
      if (matches) {
        matchedPostIds.add(post.id);
        // Mark the post's path and all ancestors for expansion
        if (post.path_id) {
          const ancestors = getPathAncestors(post.path_id, pathsData);
          ancestors.forEach(id => pathsToExpand.add(id));
        }
      }
      return matches;
    });

    // Filter paths by name
    const filteredPaths = pathsData.filter(path => {
      const matches = path.name.toLowerCase().includes(searchLower) ||
                     (path.full_path && path.full_path.toLowerCase().includes(searchLower));
      if (matches) {
        matchedPathIds.add(path.id);
        // Expand matched path and ancestors
        const ancestors = getPathAncestors(path.id, pathsData);
        ancestors.forEach(id => pathsToExpand.add(id));
      }
      return matches;
    });

    // Keep all paths if they have matching posts or are ancestors of matches
    const relevantPaths = pathsData.filter(path => {
      // Keep if path itself matches
      if (matchedPathIds.has(path.id)) return true;

      // Keep if path has matching posts
      const hasMatchingPosts = filteredPosts.some(post => post.path_id === path.id);
      if (hasMatchingPosts) {
        pathsToExpand.add(path.id);
        return true;
      }

      // Keep if path is an ancestor of a match
      if (pathsToExpand.has(path.id)) return true;

      return false;
    });

    return {
      filteredPaths: relevantPaths,
      filteredPosts: filteredPosts,
      expandedPathIds: Array.from(pathsToExpand)
    };
  }

  // Get all ancestor path IDs for a given path
  function getPathAncestors(pathId, pathsData = paths) {
    const ancestors = [];
    let currentPath = pathsData.find(p => p.id === pathId);

    while (currentPath) {
      ancestors.push(currentPath.id);
      if (currentPath.parent_id) {
        currentPath = pathsData.find(p => p.id === currentPath.parent_id);
      } else {
        break;
      }
    }

    return ancestors;
  }

  function handleBreadcrumbClick(crumb) {
    if (crumb.id !== currentPostId) {
      loadPostContent(crumb.id);
    }
  }

  function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function canEditPost(post) {
    return user && (post.author_id === user.id || user.role === 'admin');
  }

  function editPost(post) {
    goto(`/blog?edit=${post.id}&return=/explorer?post=${post.id}`);
  }

  async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        alert('✅ Post deleted successfully!');
        selectedPost = null;
        currentPostId = null;
        const url = new URL(window.location);
        url.searchParams.delete('post');
        window.history.pushState({}, '', url);
        await loadHierarchy();
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('❌ Failed to delete post');
    }
  }
</script>

<div class="confluence-explorer">
  <!-- Left Sidebar: Path & Post Tree -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <h3>📁 Content</h3>
      <button
        class="btn-new-post"
        on:click={() => {
          let returnUrl = '/explorer';
          if (selectedPathId) {
            // Get all ancestors to expand the full path
            const ancestorIds = getPathAncestors(selectedPathId);
            returnUrl = `/explorer?expand=${ancestorIds.join(',')}`;
          }
          const url = selectedPathId
            ? `/blog?new=true&path_id=${selectedPathId}&return=${encodeURIComponent(returnUrl)}`
            : `/blog?new=true&return=${encodeURIComponent(returnUrl)}`;
          goto(url);
        }}
        title={selectedPathId ? 'Create new post in selected path' : 'Create new post'}
      >
        ➕
      </button>
    </div>

    <!-- Search Box -->
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
          <button class="clear-search" on:click={() => searchQuery = ''} title="Clear search">
            ×
          </button>
        {/if}
      </div>
    </div>

    <div class="tree-container">
      {#key paths.length + posts.length + searchQuery}
        <PathPostTree
          paths={filteredPaths}
          posts={filteredPosts}
          selectedPostId={currentPostId}
          autoExpandPathIds={allExpandPathIds}
          {searchQuery}
          {editablePosts}
          on:select={handlePostSelect}
          on:pathselect={handlePathSelect}
          on:edit={handleEditPost}
          on:delete={handleDeletePost}
        />
      {/key}
    </div>
  </aside>

  <!-- Right Content Area -->
  <main class="content-area">
    {#if loading}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading post...</p>
      </div>
    {:else if error}
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Error Loading Post</h3>
        <p>{error}</p>
      </div>
    {:else if selectedPost}
      <!-- Breadcrumbs -->
      <nav class="breadcrumbs">
        <button class="breadcrumb-item" on:click={() => {
          selectedPost = null;
          currentPostId = null;
          const url = new URL(window.location);
          url.searchParams.delete('post');
          window.history.pushState({}, '', url);
        }}>
          🏠 Home
        </button>

        {#each breadcrumbs as crumb, i}
          <span class="separator">›</span>
          <button
            class="breadcrumb-item"
            class:current={i === breadcrumbs.length - 1}
            on:click={() => handleBreadcrumbClick(crumb)}
          >
            {crumb.title}
          </button>
        {/each}
      </nav>

      <!-- Post Content -->
      <article class="post-content">
        <header class="post-header">
          <h1 class="post-title">
            {#if selectedPost.category_post_number && selectedPost.category}
              <span class="title-prefix">{selectedPost.category.substring(0, 3).toUpperCase()} #{selectedPost.category_post_number}:</span>
            {/if}
            {selectedPost.title}
          </h1>

          <div class="post-meta">
            <span class="meta-item">👤 {selectedPost.author}</span>
            <span class="meta-item">📅 {formatDate(selectedPost.created_at)}</span>
            <span class="meta-item">⏱️ {selectedPost.read_time}</span>
            <span class="meta-item">📂 {selectedPost.category}</span>
          </div>

          {#if selectedPost.tags && selectedPost.tags.length > 0}
            <div class="post-tags">
              {#each selectedPost.tags as tag}
                <span class="tag">🏷️ {tag}</span>
              {/each}
            </div>
          {/if}

          {#if canEditPost(selectedPost)}
            <div class="post-actions">
              <button class="btn-action edit-btn" on:click={() => editPost(selectedPost)}>
                ✏️ Edit
              </button>
              <button class="btn-action delete-btn" on:click={() => deletePost(selectedPost.id)}>
                🗑️ Delete
              </button>
            </div>
          {/if}
        </header>

        <div class="post-body">
          {@html selectedPost.content}
        </div>

        <!-- Child Pages Section -->
        {#if selectedPost.children && selectedPost.children.length > 0}
          <section class="child-pages">
            <h2>📑 Child Pages</h2>
            <div class="child-pages-grid">
              {#each selectedPost.children as child}
                <button
                  class="child-page-card"
                  on:click={() => loadPostContent(child.id)}
                >
                  <div class="child-page-icon">📄</div>
                  <div class="child-page-content">
                    <h3 class="child-page-title">
                      {#if child.category_post_number && child.category}
                        <span class="prefix">{child.category.substring(0, 3).toUpperCase()} #{child.category_post_number}:</span>
                      {/if}
                      {child.title}
                    </h3>
                    {#if child.excerpt}
                      <p class="child-page-excerpt">{child.excerpt}</p>
                    {/if}
                  </div>
                  {#if child.child_count > 0}
                    <span class="child-badge">{child.child_count} sub-pages</span>
                  {/if}
                </button>
              {/each}
            </div>
          </section>
        {/if}
      </article>
    {:else}
      <div class="welcome-state">
        <div class="welcome-icon">📚</div>
        <h2>Welcome to the Content Explorer</h2>
        <p>Select a post from the sidebar to view its content</p>
      </div>
    {/if}
  </main>
</div>

<style>
  .confluence-explorer {
    display: grid;
    grid-template-columns: 400px 1fr;
    height: calc(100vh - 120px);
    background: #f9fafb;
  }

  /* Sidebar */
  .sidebar {
    background: white;
    border-right: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .sidebar-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
  }

  .btn-new-post {
    width: 32px;
    height: 32px;
    border: none;
    background: #2563eb;
    color: white;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .btn-new-post:hover {
    background: #1d4ed8;
  }

  /* Search Box */
  .search-container {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    background: white;
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    transition: all 0.2s;
  }

  .search-box:focus-within {
    background: white;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .search-icon {
    font-size: 1rem;
    margin-right: 0.5rem;
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 0.875rem;
    color: #374151;
  }

  .search-input::placeholder {
    color: #9ca3af;
  }

  .clear-search {
    background: none;
    border: none;
    color: #6b7280;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.25rem;
    margin-left: 0.25rem;
    transition: color 0.2s;
  }

  .clear-search:hover {
    color: #ef4444;
  }

  .tree-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
    padding: 0.5rem 0.5rem 0.5rem 0;
    min-width: 0; /* Allow content to shrink */
  }

  /* Content Area */
  .content-area {
    background: white;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  /* States */
  .loading-state,
  .error-state,
  .welcome-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 3rem;
    text-align: center;
    color: #6b7280;
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-icon,
  .welcome-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .welcome-state h2 {
    color: #374151;
    margin-bottom: 0.5rem;
  }

  /* Breadcrumbs */
  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    flex-wrap: wrap;
  }

  .breadcrumb-item {
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .breadcrumb-item:hover {
    color: #2563eb;
    background: #eff6ff;
  }

  .breadcrumb-item.current {
    color: #1f2937;
    font-weight: 600;
  }

  .separator {
    color: #d1d5db;
  }

  /* Post Content */
  .post-content {
    padding: 2rem;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }

  .post-header {
    margin-bottom: 2rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .post-title {
    font-size: 2.5rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 1rem 0;
    line-height: 1.2;
  }

  .title-prefix {
    color: #2563eb;
    font-size: 0.7em;
    margin-right: 0.5rem;
  }

  .post-meta {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 1rem;
  }

  .post-tags {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .tag {
    background: #f3f4f6;
    color: #374151;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
  }

  .post-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .btn-action {
    padding: 0.5rem 1rem;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .edit-btn:hover {
    background: #dbeafe;
    border-color: #2563eb;
  }

  .delete-btn:hover {
    background: #fee2e2;
    border-color: #ef4444;
  }

  .post-body {
    font-size: 1.125rem;
    line-height: 1.8;
    color: #374151;
    margin-bottom: 3rem;
  }

  /* Child Pages */
  .child-pages {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid #e5e7eb;
  }

  .child-pages h2 {
    font-size: 1.5rem;
    margin-bottom: 1.5rem;
    color: #1f2937;
  }

  .child-pages-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .child-page-card {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: all 0.2s;
  }

  .child-page-card:hover {
    background: #eff6ff;
    border-color: #2563eb;
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .child-page-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .child-page-content {
    flex: 1;
    min-width: 0;
  }

  .child-page-title {
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.5rem 0;
  }

  .prefix {
    color: #2563eb;
    font-size: 0.875rem;
  }

  .child-page-excerpt {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .child-badge {
    background: #e0e7ff;
    color: #4f46e5;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: 500;
    white-space: nowrap;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .confluence-explorer {
      grid-template-columns: 1fr;
    }

    .sidebar {
      display: none;
    }

    .post-content {
      padding: 1rem;
    }

    .post-title {
      font-size: 1.75rem;
    }

    .child-pages-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
