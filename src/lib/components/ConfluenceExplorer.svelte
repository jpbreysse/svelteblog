<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import PathPostTree from './PathPostTree.svelte';

  export let user = null;

  // Panel resize state
  let leftPanelWidth = 400;
  let rightPanelWidth = 280;
  let isResizingLeft = false;
  let isResizingRight = false;
  let containerRef;

  // Min/max panel widths
  const MIN_LEFT_WIDTH = 200;
  const MAX_LEFT_WIDTH = 600;
  const MIN_RIGHT_WIDTH = 200;
  const MAX_RIGHT_WIDTH = 400;

  // Collapsed states
  let leftPanelCollapsed = false;
  let rightPanelCollapsed = false;

  // History panel state
  let showHistoryPanel = true;
  let postHistory = [];
  let loadingHistory = false;

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
  let returnUrl = null;

  // Reactive filtered data based on search
  $: searchResults = filterBySearch(paths, posts, searchQuery);
  $: filteredPaths = searchResults.filteredPaths;
  $: filteredPosts = searchResults.filteredPosts;
  $: searchExpandPaths = searchResults.expandedPathIds;

  // Combine manual expand and search expand
  $: allExpandPathIds = searchQuery ? searchExpandPaths : expandPathIds;

  onMount(async () => {
    loadHierarchy();

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

    // Check for return URL
    returnUrl = urlParams.get('return');

    // Setup resize handlers (mouse and touch)
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
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

        // Load history for this post
        loadPostHistory(postId);
      } else {
        error = data.error;
        selectedPost = null;
        postHistory = [];
      }
    } catch (err) {
      console.error('Error loading post content:', err);
      error = 'Failed to load post content';
      selectedPost = null;
      postHistory = [];
    } finally {
      loading = false;
    }
  }

  async function loadPostHistory(postId) {
    loadingHistory = true;
    try {
      const response = await fetch(`/api/posts/${postId}/history`);
      const data = await response.json();
      if (data.success) {
        postHistory = data.history;
      } else {
        postHistory = [];
      }
    } catch (err) {
      console.error('Error loading post history:', err);
      postHistory = [];
    } finally {
      loadingHistory = false;
    }
  }

  function formatHistoryDate(date) {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function handlePostSelect(event) {
    const post = event.detail;
    loadPostContent(post.id);
  }

  function handlePathSelect(event) {
    selectedPathId = event.detail.pathId;
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
    // Use server-provided can_write if available (includes group permissions)
    if (post.can_write !== undefined) {
      return post.can_write;
    }
    // Fallback to basic check
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

  // Close/Reopen functionality
  async function closePost(postId) {
    try {
      const response = await fetch(`/api/posts/${postId}/close`, {
        method: 'POST'
      });
      const result = await response.json();

      if (result.success) {
        // Reload post to get updated state
        await loadPostContent(postId);
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error closing post:', error);
      alert('❌ Failed to close post');
    }
  }

  async function reopenPost(postId) {
    try {
      const response = await fetch(`/api/posts/${postId}/close`, {
        method: 'DELETE'
      });
      const result = await response.json();

      if (result.success) {
        // Reload post to get updated state
        await loadPostContent(postId);
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error reopening post:', error);
      alert('❌ Failed to reopen post');
    }
  }

  // Assignment functionality
  let showAssignDropdown = false;

  async function assignPost(postId, userId) {
    try {
      const response = await fetch(`/api/posts/${postId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const result = await response.json();

      if (result.success) {
        showAssignDropdown = false;
        // Reload post to get updated state
        await loadPostContent(postId);
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error assigning post:', error);
      alert('❌ Failed to assign post');
    }
  }

  function claimPost(postId) {
    if (user) {
      assignPost(postId, user.id);
    }
  }

  function unassignPost(postId) {
    assignPost(postId, null);
  }

  function getHistoryActionLabel(action) {
    switch (action) {
      case 'created': return '✨ Created';
      case 'updated': return '✏️ Updated';
      case 'closed': return '🔒 Closed';
      case 'reopened': return '🔓 Reopened';
      case 'assigned': return '📥 Assigned';
      case 'unassigned': return '📤 Unassigned';
      default: return action;
    }
  }

  // Panel resize handlers
  function startResizeLeft(e) {
    isResizingLeft = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function startResizeRight(e) {
    isResizingRight = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  // Get clientX from mouse or touch event
  function getClientX(e) {
    if (e.touches && e.touches.length > 0) {
      return e.touches[0].clientX;
    }
    return e.clientX;
  }

  function handleMouseMove(e) {
    handleResize(getClientX(e));
  }

  function handleTouchMove(e) {
    if (isResizingLeft || isResizingRight) {
      e.preventDefault(); // Prevent scrolling while resizing
      handleResize(getClientX(e));
    }
  }

  function handleResize(clientX) {
    if (!containerRef) return;

    if (isResizingLeft) {
      const containerRect = containerRef.getBoundingClientRect();
      let newWidth = clientX - containerRect.left;
      newWidth = Math.max(MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, newWidth));
      leftPanelWidth = newWidth;
    }

    if (isResizingRight) {
      const containerRect = containerRef.getBoundingClientRect();
      let newWidth = containerRect.right - clientX;
      newWidth = Math.max(MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, newWidth));
      rightPanelWidth = newWidth;
    }
  }

  function handleMouseUp() {
    stopResize();
  }

  function handleTouchEnd() {
    stopResize();
  }

  function stopResize() {
    isResizingLeft = false;
    isResizingRight = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function toggleLeftPanel() {
    leftPanelCollapsed = !leftPanelCollapsed;
  }

  function toggleRightPanel() {
    rightPanelCollapsed = !rightPanelCollapsed;
  }

  // Cleanup resize handlers
  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    }
  });
</script>

<div
  class="confluence-explorer"
  class:resizing={isResizingLeft || isResizingRight}
  bind:this={containerRef}
  style="--left-panel-width: {leftPanelCollapsed ? 0 : leftPanelWidth}px; --right-panel-width: {rightPanelCollapsed ? 0 : rightPanelWidth}px;"
>
  <!-- Left Panel Collapse Toggle (when collapsed) -->
  {#if leftPanelCollapsed}
    <button class="panel-expand-btn left" on:click={toggleLeftPanel} title="Show sidebar">
      ▶
    </button>
  {/if}

  <!-- Left Sidebar: Path & Post Tree -->
  <aside class="sidebar" class:collapsed={leftPanelCollapsed}>
    <div class="sidebar-header">
      <button class="btn-collapse" on:click={toggleLeftPanel} title="Collapse sidebar">
        ◀
      </button>
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
          on:select={handlePostSelect}
          on:pathselect={handlePathSelect}
        />
      {/key}
    </div>
  </aside>

  <!-- Left Resize Handle -->
  {#if !leftPanelCollapsed}
    <div
      class="resize-handle left"
      on:mousedown={startResizeLeft}
      on:touchstart={startResizeLeft}
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
    ></div>
  {/if}

  <!-- Main Content Area -->
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
      <!-- Back button and Breadcrumbs -->
      <nav class="breadcrumbs">
        {#if returnUrl}
          <button class="back-btn" on:click={() => goto(returnUrl)}>
            ← Back
          </button>
          <span class="separator">|</span>
        {/if}
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
          <!-- Status badges -->
          <div class="post-status-badges">
            {#if selectedPost.closed_at}
              <span class="status-badge closed">🔒 Closed</span>
            {/if}
            {#if selectedPost.assigned_user}
              <span class="status-badge assigned">👤 {selectedPost.assigned_user.name}</span>
            {:else if selectedPost.visibility === 'groups'}
              <span class="status-badge unassigned">📭 Unassigned</span>
            {/if}
          </div>

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

          <!-- Action buttons -->
          <div class="post-actions">
            {#if canEditPost(selectedPost)}
              <button class="btn-action edit-btn" on:click={() => editPost(selectedPost)}>
                ✏️ Edit
              </button>
              <button class="btn-action delete-btn" on:click={() => deletePost(selectedPost.id)}>
                🗑️ Delete
              </button>
            {/if}

            <!-- Close/Reopen button -->
            {#if selectedPost.can_close}
              {#if selectedPost.closed_at}
                <button class="btn-action reopen-btn" on:click={() => reopenPost(selectedPost.id)}>
                  🔓 Reopen
                </button>
              {:else}
                <button class="btn-action close-btn" on:click={() => closePost(selectedPost.id)}>
                  🔒 Close
                </button>
              {/if}
            {/if}

            <!-- Assign dropdown -->
            {#if selectedPost.can_assign}
              <div class="assign-dropdown-container">
                {#if !selectedPost.assigned_user}
                  <button class="btn-action claim-btn" on:click={() => claimPost(selectedPost.id)}>
                    🙋 Claim
                  </button>
                {/if}
                <button
                  class="btn-action assign-btn"
                  on:click={() => showAssignDropdown = !showAssignDropdown}
                >
                  📋 {selectedPost.assigned_user ? 'Reassign' : 'Assign'}
                </button>

                {#if showAssignDropdown}
                  <div class="assign-dropdown">
                    {#if selectedPost.assigned_user}
                      <button class="dropdown-item unassign" on:click={() => unassignPost(selectedPost.id)}>
                        ❌ Unassign
                      </button>
                    {/if}
                    {#each selectedPost.assignable_users || [] as assignee}
                      <button
                        class="dropdown-item"
                        class:current={selectedPost.assigned_user?.id === assignee.id}
                        on:click={() => assignPost(selectedPost.id, assignee.id)}
                      >
                        👤 {assignee.display_name}
                        {#if selectedPost.assigned_user?.id === assignee.id}
                          ✓
                        {/if}
                      </button>
                    {/each}
                    {#if !selectedPost.assignable_users?.length}
                      <div class="dropdown-empty">No assignable users</div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
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
      <!-- Posts Grid View -->
      {@const displayPosts = selectedPathId
        ? filteredPosts.filter(p => p.path_id === selectedPathId)
        : filteredPosts}
      {@const selectedPathInfo = paths.find(p => p.id === selectedPathId)}
      <div class="posts-grid-view">
        <header class="grid-header">
          <div class="header-info">
            <h1>
              {#if selectedPathInfo}
                {selectedPathInfo.icon || '📁'} {selectedPathInfo.name}
              {:else}
                📚 All Content
              {/if}
            </h1>
            <p class="header-stats">
              {displayPosts.length} {displayPosts.length === 1 ? 'post' : 'posts'}{selectedPathId ? ' in this folder' : ' total'}
            </p>
          </div>
        </header>

        {#if displayPosts.length > 0}
          <div class="posts-grid">
            {#each displayPosts as post}
              <article class="post-card" on:click={() => loadPostContent(post.id)}>
                <div class="post-card-header">
                  <h3 class="post-title">
                    {#if post.category_post_number && post.category}
                      <span class="title-prefix">{post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}:</span>
                    {/if}
                    {post.title}
                  </h3>
                </div>

                <div class="post-meta">
                  <span class="author">👤 {post.author}</span>
                  <span class="date">📅 {formatDate(post.created_at)}</span>
                  <span class="category">📂 {post.category}</span>
                </div>

                <div class="post-card-actions">
                  <button class="btn-card-action" on:click|stopPropagation={() => loadPostContent(post.id)}>
                    Read →
                  </button>
                  {#if canEditPost(post)}
                    <button class="btn-card-action edit" on:click|stopPropagation={() => editPost(post)}>
                      ✏️ Edit
                    </button>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>No posts found</h3>
            <p>
              {#if selectedPathId}
                This folder doesn't have any posts yet.
              {:else}
                No content available. Create your first post!
              {/if}
            </p>
            <button
              class="btn-create-post"
              on:click={() => {
                const url = selectedPathId
                  ? `/blog?new=true&path_id=${selectedPathId}&return=${encodeURIComponent('/explorer')}`
                  : `/blog?new=true&return=${encodeURIComponent('/explorer')}`;
                goto(url);
              }}
            >
              ➕ Create Post
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </main>

  <!-- Right Resize Handle -->
  {#if selectedPost && showHistoryPanel}
    <div
      class="resize-handle right"
      on:mousedown={startResizeRight}
      on:touchstart={startResizeRight}
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
    ></div>
  {/if}

  <!-- Right Panel: History -->
  {#if selectedPost && showHistoryPanel}
    <aside class="history-panel">
      <div class="panel-header">
        <h3>📜 History</h3>
        <button class="btn-close-panel" on:click={() => showHistoryPanel = false} title="Collapse panel">
          ✕
        </button>
      </div>

      <div class="history-content">
        {#if loadingHistory}
          <div class="history-loading">Loading history...</div>
        {:else if postHistory.length === 0}
          <div class="history-empty">No history available</div>
        {:else}
          <ul class="history-list">
            {#each postHistory as entry}
              <li class="history-entry">
                <div class="history-action {entry.action}">
                  {getHistoryActionLabel(entry.action)}
                </div>
                {#if entry.action === 'assigned' && entry.target_user_name}
                  <div class="history-user">📥 To: {entry.target_user_name}</div>
                  <div class="history-user secondary">By: {entry.user_name}</div>
                {:else if entry.action === 'unassigned' && entry.target_user_name}
                  <div class="history-user">📤 Was: {entry.target_user_name}</div>
                  <div class="history-user secondary">By: {entry.user_name}</div>
                {:else}
                  <div class="history-user">👤 {entry.user_name}</div>
                {/if}
                <div class="history-date">{formatHistoryDate(entry.created_at)}</div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </aside>
  {/if}

  <!-- Toggle button when panel is hidden -->
  {#if selectedPost && !showHistoryPanel}
    <button class="btn-show-history" on:click={() => showHistoryPanel = true} title="Show history">
      📜
    </button>
  {/if}
</div>

<style>
  .confluence-explorer {
    display: flex;
    height: calc(100vh - 56px);
    background: #f9fafb;
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
  }

  .confluence-explorer.resizing {
    cursor: col-resize;
    user-select: none;
  }

  /* Resize Handles */
  .resize-handle {
    width: 6px;
    background: #e5e7eb;
    cursor: col-resize;
    transition: background 0.2s;
    position: relative;
    flex-shrink: 0;
  }

  .resize-handle:hover,
  .resize-handle:active {
    background: #2563eb;
  }

  .resize-handle::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 40px;
    background: #9ca3af;
    border-radius: 1px;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .resize-handle:hover::after {
    opacity: 1;
    background: white;
  }

  /* Panel Expand Buttons */
  .panel-expand-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 48px;
    background: white;
    border: 1px solid #e5e7eb;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    color: #6b7280;
    transition: all 0.2s;
    z-index: 20;
  }

  .panel-expand-btn.left {
    left: 0;
    border-left: none;
    border-radius: 0 6px 6px 0;
  }

  .panel-expand-btn:hover {
    background: #f3f4f6;
    color: #2563eb;
  }

  /* Sidebar */
  .sidebar {
    background: white;
    border-right: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    width: var(--left-panel-width);
    flex-shrink: 0;
  }

  .sidebar.collapsed {
    width: 0;
    min-width: 0;
    border: none;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
    gap: 0.5rem;
  }

  .sidebar-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
    flex: 1;
  }

  .btn-collapse {
    width: 28px;
    height: 28px;
    border: none;
    background: #f3f4f6;
    color: #6b7280;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .btn-collapse:hover {
    background: #e5e7eb;
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
    flex: 1;
    min-width: 0;
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

  .back-btn {
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    color: #374151;
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    transition: all 0.2s;
    font-weight: 500;
  }

  .back-btn:hover {
    background: #e5e7eb;
    color: #1f2937;
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
    width: 100%;
  }

  .post-header {
    margin-bottom: 2rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .post-title {
    font-size: 1.75rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.75rem 0;
    line-height: 1.3;
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

  .close-btn:hover {
    background: #fef3c7;
    border-color: #f59e0b;
  }

  .reopen-btn:hover {
    background: #d1fae5;
    border-color: #10b981;
  }

  .claim-btn:hover {
    background: #e0e7ff;
    border-color: #6366f1;
  }

  .assign-btn:hover {
    background: #f3f4f6;
    border-color: #6b7280;
  }

  /* Status badges */
  .post-status-badges {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .status-badge.closed {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  }

  .status-badge.assigned {
    background: #eff6ff;
    color: #2563eb;
    border: 1px solid #bfdbfe;
  }

  .status-badge.unassigned {
    background: #fefce8;
    color: #ca8a04;
    border: 1px solid #fef08a;
  }

  /* Assign dropdown */
  .assign-dropdown-container {
    position: relative;
    display: inline-flex;
    gap: 0.25rem;
  }

  .assign-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.25rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    min-width: 180px;
    z-index: 100;
    overflow: hidden;
  }

  .dropdown-item {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background 0.2s;
  }

  .dropdown-item:hover {
    background: #f3f4f6;
  }

  .dropdown-item.current {
    background: #eff6ff;
    font-weight: 500;
  }

  .dropdown-item.unassign {
    color: #dc2626;
    border-bottom: 1px solid #e5e7eb;
  }

  .dropdown-item.unassign:hover {
    background: #fef2f2;
  }

  .dropdown-empty {
    padding: 0.75rem;
    text-align: center;
    color: #9ca3af;
    font-size: 0.875rem;
  }

  .post-body {
    font-size: 1.125rem;
    line-height: 1.8;
    color: #374151;
    margin-bottom: 3rem;
  }

  .post-body :global(p) {
    margin: 0 0 1rem 0;
  }

  /* Collapse empty paragraphs (Quill creates <p><br></p> for blank lines) */
  .post-body :global(p:empty) {
    display: none;
  }

  .post-body :global(p > br:only-child) {
    display: none;
  }

  .post-body :global(br + br) {
    display: none;
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

  /* History Panel */
  .history-panel {
    width: var(--right-panel-width);
    background: white;
    border-left: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #1f2937;
  }

  .btn-close-panel {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: #6b7280;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .btn-close-panel:hover {
    background: #fee2e2;
    color: #ef4444;
  }

  .history-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .history-loading,
  .history-empty {
    padding: 2rem 1rem;
    text-align: center;
    color: #9ca3af;
    font-size: 0.875rem;
  }

  .history-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .history-entry {
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 0.5rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
  }

  .history-entry:hover {
    background: #f3f4f6;
  }

  .history-action {
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .history-action.created {
    color: #059669;
  }

  .history-action.updated {
    color: #2563eb;
  }

  .history-action.closed {
    color: #dc2626;
  }

  .history-action.reopened {
    color: #10b981;
  }

  .history-action.assigned {
    color: #7c3aed;
  }

  .history-action.unassigned {
    color: #f59e0b;
  }

  .history-user {
    font-size: 0.8rem;
    color: #374151;
    margin-bottom: 0.25rem;
  }

  .history-user.secondary {
    font-size: 0.7rem;
    color: #9ca3af;
  }

  .history-date {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  /* Show History Button (when panel is hidden) */
  .btn-show-history {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 40px;
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 8px;
    cursor: pointer;
    font-size: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
    z-index: 10;
  }

  .btn-show-history:hover {
    background: #f3f4f6;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
  }

  /* Posts Grid View */
  .posts-grid-view {
    padding: 2rem;
    overflow-y: auto;
    height: 100%;
  }

  .grid-header {
    margin-bottom: 2rem;
  }

  .grid-header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.75rem;
    color: #1f2937;
  }

  .header-stats {
    margin: 0;
    color: #6b7280;
    font-size: 0.875rem;
  }

  .posts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
  }

  .post-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1.25rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .post-card:hover {
    border-color: #2563eb;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    transform: translateY(-2px);
  }

  .post-card-header {
    margin-bottom: 0.75rem;
  }

  .post-card .post-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
    line-height: 1.4;
  }

  .post-card .title-prefix {
    color: #2563eb;
    font-size: 0.875em;
    margin-right: 0.25rem;
  }

  .post-card .post-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    color: #6b7280;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .post-card-actions {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
  }

  .btn-card-action {
    padding: 0.5rem 1rem;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 6px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
    color: #374151;
  }

  .btn-card-action:hover {
    background: #f3f4f6;
  }

  .btn-card-action.edit {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #2563eb;
  }

  .btn-card-action.edit:hover {
    background: #dbeafe;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    color: #6b7280;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .empty-state h3 {
    color: #374151;
    margin: 0 0 0.5rem 0;
  }

  .empty-state p {
    margin: 0 0 1.5rem 0;
  }

  .btn-create-post {
    padding: 0.75rem 1.5rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-create-post:hover {
    background: #1d4ed8;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .confluence-explorer {
      flex-direction: column;
    }

    .sidebar {
      display: none;
    }

    .resize-handle {
      display: none;
    }

    .panel-expand-btn {
      display: none;
    }

    .history-panel {
      display: none;
    }

    .btn-show-history {
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

    .posts-grid-view {
      padding: 1rem;
    }

    .posts-grid {
      grid-template-columns: 1fr;
    }

    .grid-header h1 {
      font-size: 1.5rem;
    }
  }
</style>
