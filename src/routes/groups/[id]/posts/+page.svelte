<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';

  export let data;

  $: group = data.group;
  $: posts = data.posts || [];
  $: allGroups = data.allGroups || [];
  $: virtualGroups = data.virtualGroups || [];
  $: error = data.error;
  $: userIsMember = data.userIsMember;

  let searchQuery = '';

  // Expandable tree state
  let expandedGroups = {};
  let groupPosts = {}; // Cache of posts per group
  let loadingGroups = {}; // Loading state per group

  // Selected post state (for inline viewing)
  let selectedPost = null;
  let selectedPostId = null;
  let loadingPost = false;
  let postError = null;

  // History panel state
  let showHistoryPanel = true;
  let postHistory = [];
  let loadingHistory = false;

  // Assign dropdown state
  let showAssignDropdown = false;

  // Panel resize state
  let leftPanelWidth = 280;
  let rightPanelWidth = 280;
  let isResizingLeft = false;
  let isResizingRight = false;
  let containerRef;

  // Min/max panel widths
  const MIN_LEFT_WIDTH = 200;
  const MAX_LEFT_WIDTH = 500;
  const MIN_RIGHT_WIDTH = 200;
  const MAX_RIGHT_WIDTH = 400;

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

  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);

      // Check URL for initial post selection
      const urlParams = new URLSearchParams(window.location.search);
      const postId = urlParams.get('post');
      if (postId) {
        viewPost({ id: parseInt(postId) });
      }
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    }
  });

  // Auto-expand current group
  $: if (group && group.id) {
    expandedGroups[group.id] = true;
    groupPosts[group.id] = posts;
  }

  async function toggleGroup(groupId) {
    if (expandedGroups[groupId]) {
      // Collapse
      expandedGroups[groupId] = false;
      expandedGroups = expandedGroups;
    } else {
      // Expand - load posts if not cached
      expandedGroups[groupId] = true;
      expandedGroups = expandedGroups;

      if (!groupPosts[groupId]) {
        await loadGroupPosts(groupId);
      }
    }
  }

  async function loadGroupPosts(groupId) {
    loadingGroups[groupId] = true;
    loadingGroups = loadingGroups;

    try {
      const response = await fetch(`/api/groups/${groupId}/posts`);
      const result = await response.json();

      if (result.success) {
        groupPosts[groupId] = result.posts;
        groupPosts = groupPosts;
      }
    } catch (err) {
      console.error('Error loading group posts:', err);
    } finally {
      loadingGroups[groupId] = false;
      loadingGroups = loadingGroups;
    }
  }

  async function viewPost(post) {
    selectedPostId = post.id;
    loadingPost = true;
    postError = null;
    postHistory = [];

    try {
      const response = await fetch(`/api/posts/${post.id}/content`);
      const result = await response.json();

      if (result.success) {
        selectedPost = result.post;
        // Load history
        loadPostHistory(post.id);

        // Update URL with post ID
        if (typeof window !== 'undefined') {
          const url = new URL(window.location);
          url.searchParams.set('post', post.id);
          window.history.pushState({}, '', url);
        }
      } else {
        postError = result.error || 'Failed to load post';
      }
    } catch (err) {
      console.error('Error loading post:', err);
      postError = 'Failed to load post';
    } finally {
      loadingPost = false;
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

  function closePost() {
    selectedPost = null;
    selectedPostId = null;
    postError = null;
    postHistory = [];
    showAssignDropdown = false;

    // Remove post ID from URL
    if (typeof window !== 'undefined') {
      const url = new URL(window.location);
      url.searchParams.delete('post');
      window.history.pushState({}, '', url);
    }
  }

  function formatHistoryDate(date) {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  // Filter posts by search
  $: filteredPosts = filterPosts(posts, searchQuery);

  // Separate posts by access type (for real groups)
  $: writePosts = filteredPosts.filter(p => p.access_type === 'write');
  $: readPosts = filteredPosts.filter(p => p.access_type === 'read' || !p.access_type);

  function filterPosts(posts, query) {
    if (!query.trim()) return posts;
    const q = query.toLowerCase();
    return posts.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.author?.toLowerCase().includes(q)
    );
  }

  function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function canEditPost(post) {
    // Closed posts cannot be edited (except by admin)
    if (post.closed_at && data.user?.role !== 'admin') return false;
    if (!data.user) return false;
    if (data.user.role === 'admin') return true;
    if (post.author_id === data.user.id) return true;
    if (post.access_type === 'write') return true;
    return false;
  }

  function editPost(post) {
    const returnUrl = `/groups/${group.id}/posts`;
    goto(`/blog?edit=${post.id}&return=${encodeURIComponent(returnUrl)}`);
  }

  // Delete functionality
  async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE'
      });
      const result = await response.json();

      if (result.success) {
        // Clear selected post and reload
        selectedPost = null;
        selectedPostId = null;
        postHistory = [];
        // Reload group posts
        await loadGroupPosts(group.id);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post');
    }
  }

  // Close/Reopen functionality
  async function closePostAction(postId) {
    try {
      const response = await fetch(`/api/posts/${postId}/close`, {
        method: 'POST'
      });
      const result = await response.json();

      if (result.success) {
        // Reload post to get updated state
        await viewPost({ id: postId });
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error closing post:', error);
      alert('Failed to close post');
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
        await viewPost({ id: postId });
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error reopening post:', error);
      alert('Failed to reopen post');
    }
  }

  // Copy link functionality
  let linkCopied = false;

  async function copyPostLink(postId) {
    const url = `${window.location.origin}/explorer?post=${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      linkCopied = true;
      setTimeout(() => linkCopied = false, 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
      alert('Failed to copy link');
    }
  }

  // PDF export functionality
  let exportingPdf = false;

  async function exportToPdf(post) {
    if (exportingPdf) return;
    exportingPdf = true;

    try {
      // Dynamically load html2pdf.js from CDN
      if (!window.html2pdf) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // Create a container with the post content for PDF
      const container = document.createElement('div');
      container.innerHTML = `
        <div style="font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; max-width: 800px;">
          <h1 style="font-size: 24px; color: #1f2937; margin-bottom: 10px;">
            ${post.category_post_number && post.category
              ? `<span style="color: #2563eb; font-size: 0.7em; margin-right: 8px;">${post.category.substring(0, 3).toUpperCase()} #${post.category_post_number}:</span>`
              : ''}
            ${post.title}
          </h1>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 20px;">
            <span>Author: ${post.author}</span> |
            <span>Date: ${formatDate(post.created_at)}</span> |
            <span>Category: ${post.category}</span>
          </div>
          ${post.tags && post.tags.length > 0
            ? `<div style="margin-bottom: 20px;">${post.tags.map(tag => `<span style="background: #f3f4f6; padding: 4px 10px; border-radius: 12px; font-size: 11px; margin-right: 5px;">${tag}</span>`).join('')}</div>`
            : ''}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <div style="font-size: 14px; line-height: 1.8; color: #374151;">
            ${post.content}
          </div>
        </div>
      `;

      // Generate filename from title
      const filename = `${post.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}.pdf`;

      // PDF options
      const options = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // Generate and download PDF
      await window.html2pdf().set(options).from(container).save();

    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Failed to export PDF. Please try again.');
    } finally {
      exportingPdf = false;
    }
  }

  // Assignment functionality
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
        await viewPost({ id: postId });
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error assigning post:', error);
      alert('Failed to assign post');
    }
  }

  function claimPost(postId) {
    if (data.user) {
      assignPost(postId, data.user.id);
    }
  }

  function unassignPost(postId) {
    assignPost(postId, null);
  }
</script>

<svelte:head>
  <title>{group?.name || 'Group'} Posts</title>
</svelte:head>

<svelte:window on:click={() => { if (showAssignDropdown) showAssignDropdown = false; }} />

<div
  class="group-posts-explorer"
  class:resizing={isResizingLeft || isResizingRight}
  bind:this={containerRef}
  style="--left-panel-width: {leftPanelWidth}px; --right-panel-width: {rightPanelWidth}px;"
>
  <!-- Left Sidebar: Groups List -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <h3>Content</h3>
    </div>

    <div class="groups-list">
      <!-- Virtual groups (Public, Private) -->
      {#each virtualGroups as vg}
        <div class="tree-item">
          <div
            class="tree-node group-node"
            class:active={group && group.id === vg.id}
            class:expanded={expandedGroups[vg.id]}
          >
            <button
              class="expand-btn"
              on:click|stopPropagation={() => toggleGroup(vg.id)}
            >
              {expandedGroups[vg.id] ? '▼' : '▶'}
            </button>
            <a href="/groups/{vg.id}/posts" class="group-link">
              <span class="group-icon">{vg.icon}</span>
              <span class="group-name">{vg.name}</span>
              <span class="post-count">{vg.post_count}</span>
            </a>
          </div>

          {#if expandedGroups[vg.id]}
            <ul class="posts-tree">
              {#if loadingGroups[vg.id]}
                <li class="loading-item">Loading...</li>
              {:else if groupPosts[vg.id]?.length > 0}
                {#each groupPosts[vg.id] as post}
                  <li class="post-item">
                    <button
                      class="post-link"
                      class:selected={selectedPostId === post.id}
                      on:click={() => viewPost(post)}
                    >
                      <span class="post-icon">📄</span>
                      <span class="post-title-text">
                        {#if post.category_post_number && post.category}
                          <span class="post-prefix">{post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}:</span>
                        {/if}
                        {post.title}
                      </span>
                    </button>
                  </li>
                {/each}
              {:else}
                <li class="empty-item">No posts</li>
              {/if}
            </ul>
          {/if}
        </div>
      {/each}

      <!-- Separator -->
      {#if allGroups.length > 0}
        <div class="sidebar-divider">
          <span>My Groups</span>
        </div>
      {/if}

      <!-- Real groups -->
      {#each allGroups as g}
        <div class="tree-item">
          <div
            class="tree-node group-node"
            class:active={group && group.id === g.id}
            class:expanded={expandedGroups[g.id]}
          >
            <button
              class="expand-btn"
              on:click|stopPropagation={() => toggleGroup(g.id)}
            >
              {expandedGroups[g.id] ? '▼' : '▶'}
            </button>
            <a href="/groups/{g.id}/posts" class="group-link">
              <span class="group-icon">{g.icon}</span>
              <span class="group-name">{g.name}</span>
              <span class="post-count">{g.post_count}</span>
            </a>
          </div>

          {#if expandedGroups[g.id]}
            <ul class="posts-tree">
              {#if loadingGroups[g.id]}
                <li class="loading-item">Loading...</li>
              {:else if groupPosts[g.id]?.length > 0}
                {#each groupPosts[g.id] as post}
                  <li class="post-item">
                    <button
                      class="post-link"
                      class:selected={selectedPostId === post.id}
                      on:click={() => viewPost(post)}
                    >
                      <span class="post-icon">📄</span>
                      <span class="post-title-text">
                        {#if post.category_post_number && post.category}
                          <span class="post-prefix">{post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}:</span>
                        {/if}
                        {post.title}
                      </span>
                    </button>
                  </li>
                {/each}
              {:else}
                <li class="empty-item">No posts</li>
              {/if}
            </ul>
          {/if}
        </div>
      {/each}

      {#if virtualGroups.length === 0 && allGroups.length === 0}
        <div class="empty-groups">No groups available</div>
      {/if}
    </div>
  </aside>

  <!-- Left Resize Handle -->
  <div
    class="resize-handle left"
    on:mousedown={startResizeLeft}
    on:touchstart={startResizeLeft}
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
  ></div>

  <!-- Main Content Area -->
  <main class="content-area">
    {#if error}
      <div class="error-state">
        <div class="error-icon">🚫</div>
        <h3>{error}</h3>
        <p>You can only view posts from groups you are a member of.</p>
        <a href="/groups/public/posts" class="btn-back">View Public Posts</a>
      </div>
    {:else if !group}
      <div class="welcome-state">
        <div class="welcome-icon">📂</div>
        <h2>Select a Category</h2>
        <p>Choose a category from the sidebar to view posts</p>
      </div>
    {:else if loadingPost}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading post...</p>
      </div>
    {:else if postError}
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Error Loading Post</h3>
        <p>{postError}</p>
        <button class="btn-back" on:click={closePost}>← Back to list</button>
      </div>
    {:else if selectedPost}
      <!-- Post View -->
      <div class="post-view">
        <header class="post-view-header">
          <button class="btn-back-link" on:click={closePost}>← Back to list</button>

          <div class="post-status-badges">
            {#if selectedPost.closed_at}
              <span class="status-badge closed">🔒 Closed</span>
            {/if}
            {#if selectedPost.assigned_user}
              <span class="status-badge assigned">👤 {selectedPost.assigned_user.name}</span>
            {/if}
          </div>

          <h1 class="post-view-title">
            {#if selectedPost.category_post_number && selectedPost.category}
              <span class="title-prefix">{selectedPost.category.substring(0, 3).toUpperCase()} #{selectedPost.category_post_number}:</span>
            {/if}
            {selectedPost.title}
          </h1>

          <div class="post-view-meta">
            <span>👤 {selectedPost.author}</span>
            <span>📅 {formatDate(selectedPost.created_at)}</span>
            <span>⏱️ {selectedPost.read_time}</span>
          </div>

          <div class="post-view-actions">
            <button class="btn-action link" on:click={() => copyPostLink(selectedPost.id)}>
              {linkCopied ? '✅ Copied!' : '🔗 Copy link'}
            </button>
            <button class="btn-action pdf" on:click={() => exportToPdf(selectedPost)} disabled={exportingPdf}>
              {exportingPdf ? '⏳ Exporting...' : '📄 Export PDF'}
            </button>
            {#if selectedPost.can_write}
              <button class="btn-action edit" on:click={() => editPost(selectedPost)}>
                Edit
              </button>
              <button class="btn-action delete" on:click={() => deletePost(selectedPost.id)}>
                Delete
              </button>
            {/if}

            <!-- Close/Reopen button -->
            {#if selectedPost.can_close}
              {#if selectedPost.closed_at}
                <button class="btn-action reopen" on:click={() => reopenPost(selectedPost.id)}>
                  Reopen
                </button>
              {:else}
                <button class="btn-action close" on:click={() => closePostAction(selectedPost.id)}>
                  Close
                </button>
              {/if}
            {/if}

            <!-- Assign dropdown -->
            {#if selectedPost.can_assign}
              <div class="assign-dropdown-container">
                {#if !selectedPost.assigned_user}
                  <button class="btn-action claim" on:click={() => claimPost(selectedPost.id)}>
                    Claim
                  </button>
                {/if}
                <button
                  class="btn-action assign"
                  on:click|stopPropagation={() => showAssignDropdown = !showAssignDropdown}
                >
                  {selectedPost.assigned_user ? 'Reassign' : 'Assign'}
                </button>

                {#if showAssignDropdown}
                  <div class="assign-dropdown" on:click|stopPropagation>
                    {#if selectedPost.assigned_user}
                      <button class="dropdown-item unassign" on:click={() => unassignPost(selectedPost.id)}>
                        Unassign
                      </button>
                    {/if}
                    {#each selectedPost.assignable_users || [] as assignee}
                      <button
                        class="dropdown-item"
                        class:current={selectedPost.assigned_user?.id === assignee.id}
                        on:click={() => assignPost(selectedPost.id, assignee.id)}
                      >
                        {assignee.display_name}
                        {#if selectedPost.assigned_user?.id === assignee.id}
                          (current)
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

        <div class="post-view-body">
          {@html selectedPost.content}
        </div>
      </div>
    {:else}
      <!-- Group Header -->
      <header class="group-header">
        <div class="group-info">
          <h1>{group.icon} {group.name}</h1>
          {#if group.description}
            <p class="group-description">{group.description}</p>
          {/if}
          <div class="group-stats">
            {#if group.memberCount !== undefined}
              <span class="stat">👥 {group.memberCount} members</span>
            {/if}
            <span class="stat">📄 {posts.length} posts</span>
          </div>
        </div>

        <!-- Search -->
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search posts..."
            bind:value={searchQuery}
            class="search-input"
          />
        </div>
      </header>

      <!-- Posts Lists -->
      <div class="posts-container">
        {#if group.isVirtual}
          <!-- For virtual groups (Public/Private), show all posts in one list -->
          {#if filteredPosts.length > 0}
            <div class="posts-grid">
              {#each filteredPosts as post}
                <article class="post-card">
                  <div class="post-card-header">
                    <h3 class="post-title">
                      {#if post.category_post_number && post.category}
                        <span class="title-prefix">{post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}:</span>
                      {/if}
                      {post.title}
                    </h3>
                    {#if post.closed_at}
                      <span class="status-badge closed">🔒 Closed</span>
                    {/if}
                  </div>

                  <div class="post-meta">
                    <span class="author">👤 {post.author}</span>
                    <span class="date">📅 {formatDate(post.created_at)}</span>
                    <span class="category">📂 {post.category}</span>
                  </div>

                  {#if post.excerpt}
                    <p class="post-excerpt">{@html post.excerpt}</p>
                  {/if}

                  <div class="post-actions">
                    <a href="/blog/{post.slug}" class="btn-action">Read →</a>
                    {#if canEditPost(post)}
                      <button class="btn-action edit" on:click={() => editPost(post)}>✏️ Edit</button>
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
                {#if searchQuery}
                  No posts match your search. Try a different query.
                {:else}
                  No posts in this category yet.
                {/if}
              </p>
            </div>
          {/if}
        {:else}
          <!-- For real groups, separate by access type -->
          {#if writePosts.length > 0}
            <section class="posts-section">
              <h2 class="section-title">✏️ Can Edit ({writePosts.length})</h2>
              <div class="posts-grid">
                {#each writePosts as post}
                  <article class="post-card write-access" class:closed={post.closed_at}>
                    <div class="post-card-header">
                      <h3 class="post-title">
                        {#if post.category_post_number && post.category}
                          <span class="title-prefix">{post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}:</span>
                        {/if}
                        {post.title}
                      </h3>
                      <div class="badges">
                        {#if post.closed_at}
                          <span class="status-badge closed">🔒 Closed</span>
                        {/if}
                        <span class="access-badge write">Edit</span>
                      </div>
                    </div>

                    <div class="post-meta">
                      <span class="author">👤 {post.author}</span>
                      <span class="date">📅 {formatDate(post.created_at)}</span>
                      <span class="category">📂 {post.category}</span>
                    </div>

                    {#if post.excerpt}
                      <p class="post-excerpt">{@html post.excerpt}</p>
                    {/if}

                    <div class="post-actions">
                      <a href="/blog/{post.slug}" class="btn-action">Read →</a>
                      {#if canEditPost(post)}
                        <button class="btn-action edit" on:click={() => editPost(post)}>✏️ Edit</button>
                      {/if}
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {/if}

          {#if readPosts.length > 0}
            <section class="posts-section">
              <h2 class="section-title">👁️ Can Read ({readPosts.length})</h2>
              <div class="posts-grid">
                {#each readPosts as post}
                  <article class="post-card read-access" class:closed={post.closed_at}>
                    <div class="post-card-header">
                      <h3 class="post-title">
                        {#if post.category_post_number && post.category}
                          <span class="title-prefix">{post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}:</span>
                        {/if}
                        {post.title}
                      </h3>
                      <div class="badges">
                        {#if post.closed_at}
                          <span class="status-badge closed">🔒 Closed</span>
                        {/if}
                        <span class="access-badge read">Read</span>
                      </div>
                    </div>

                    <div class="post-meta">
                      <span class="author">👤 {post.author}</span>
                      <span class="date">📅 {formatDate(post.created_at)}</span>
                      <span class="category">📂 {post.category}</span>
                    </div>

                    {#if post.excerpt}
                      <p class="post-excerpt">{@html post.excerpt}</p>
                    {/if}

                    <div class="post-actions">
                      <a href="/blog/{post.slug}" class="btn-action">Read →</a>
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {/if}

          {#if writePosts.length === 0 && readPosts.length === 0}
            <div class="empty-state">
              <div class="empty-icon">📭</div>
              <h3>No posts found</h3>
              <p>
                {#if searchQuery}
                  No posts match your search. Try a different query.
                {:else}
                  This group doesn't have access to any posts yet.
                {/if}
              </p>
            </div>
          {/if}
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
        <button class="btn-close-panel" on:click={() => showHistoryPanel = false} title="Close panel">
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
  .group-posts-explorer {
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

  .group-posts-explorer.resizing {
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

  .sidebar-header {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .sidebar-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
  }

  .groups-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .sidebar-divider {
    display: flex;
    align-items: center;
    margin: 1rem 0.5rem 0.5rem;
    font-size: 0.75rem;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .sidebar-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #e5e7eb;
    margin-left: 0.5rem;
  }

  /* Tree View Styles */
  .tree-item {
    margin-bottom: 0.125rem;
  }

  .tree-node {
    display: flex;
    align-items: center;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .tree-node:hover {
    background: #f3f4f6;
  }

  .tree-node.active {
    background: #eff6ff;
  }

  .expand-btn {
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.625rem;
    color: #6b7280;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
    transition: color 0.2s;
  }

  .expand-btn:hover {
    color: #2563eb;
  }

  .group-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem 0.5rem 0;
    text-decoration: none;
    color: #374151;
    flex: 1;
    min-width: 0;
  }

  .tree-node.active .group-link {
    color: #2563eb;
    font-weight: 500;
  }

  .group-icon {
    flex-shrink: 0;
  }

  .group-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
  }

  .post-count {
    background: #e5e7eb;
    color: #6b7280;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .tree-node.active .post-count {
    background: #dbeafe;
    color: #2563eb;
  }

  /* Posts Tree (inside expanded group) */
  .posts-tree {
    list-style: none;
    margin: 0;
    padding: 0 0 0 1.5rem;
  }

  .post-item {
    margin: 0;
  }

  .post-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
    border-radius: 4px;
    transition: all 0.2s;
    color: #374151;
  }

  .post-link:hover {
    background: #f3f4f6;
  }

  .post-link.selected {
    background: #dbeafe;
    color: #1e40af;
    font-weight: 500;
  }

  .post-icon {
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .post-title-text {
    flex: 1;
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .post-prefix {
    color: #2563eb;
    font-weight: 600;
    font-size: 0.7rem;
    margin-right: 0.25rem;
  }

  .loading-item,
  .empty-item {
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    color: #9ca3af;
    font-style: italic;
  }

  .empty-groups {
    padding: 2rem 1rem;
    text-align: center;
    color: #9ca3af;
    font-size: 0.875rem;
  }

  /* Content Area */
  .content-area {
    background: white;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  /* States */
  .error-state,
  .welcome-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 3rem;
    text-align: center;
    color: #6b7280;
  }

  .error-icon,
  .welcome-icon,
  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .welcome-state h2,
  .empty-state h3 {
    color: #374151;
    margin-bottom: 0.5rem;
  }

  .btn-back {
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background: #2563eb;
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 500;
    transition: background 0.2s;
  }

  .btn-back:hover {
    background: #1d4ed8;
  }

  /* Group Header */
  .group-header {
    padding: 2rem;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .group-info h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.75rem;
    color: #1f2937;
  }

  .group-description {
    margin: 0 0 1rem 0;
    color: #6b7280;
  }

  .group-stats {
    display: flex;
    gap: 1.5rem;
  }

  .stat {
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Search */
  .search-box {
    display: flex;
    align-items: center;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    min-width: 250px;
  }

  .search-icon {
    color: #9ca3af;
    margin-right: 0.5rem;
    font-size: 0.875rem;
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 0.875rem;
  }

  /* Posts Container */
  .posts-container {
    padding: 2rem;
    flex: 1;
  }

  .posts-section {
    margin-bottom: 2rem;
  }

  .section-title {
    font-size: 1.125rem;
    color: #374151;
    margin: 0 0 1rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .posts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }

  /* Post Card */
  .post-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1.25rem;
    transition: all 0.2s;
  }

  .post-card:hover {
    border-color: #d1d5db;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  }

  .post-card.write-access {
    border-left: 3px solid #10b981;
  }

  .post-card.read-access {
    border-left: 3px solid #3b82f6;
  }

  .post-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .post-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
    flex: 1;
  }

  .title-prefix {
    color: #2563eb;
    font-size: 0.875em;
    margin-right: 0.25rem;
  }

  .access-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .access-badge.write {
    background: #d1fae5;
    color: #059669;
  }

  .access-badge.read {
    background: #dbeafe;
    color: #2563eb;
  }

  .badges {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .status-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.625rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .status-badge.closed {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  }

  .post-card.closed {
    opacity: 0.7;
  }

  .post-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    color: #6b7280;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .post-excerpt {
    font-size: 0.875rem;
    color: #4b5563;
    margin: 0 0 1rem 0;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .post-actions {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
  }

  .btn-action {
    padding: 0.5rem 1rem;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 6px;
    font-size: 0.75rem;
    text-decoration: none;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-action:hover {
    background: #f3f4f6;
  }

  .btn-action.link {
    background: #f0fdf4;
    border-color: #86efac;
    color: #166534;
  }

  .btn-action.link:hover {
    background: #dcfce7;
    border-color: #22c55e;
  }

  .btn-action.pdf {
    background: #fef3c7;
    border-color: #fcd34d;
    color: #92400e;
  }

  .btn-action.pdf:hover:not(:disabled) {
    background: #fde68a;
    border-color: #f59e0b;
  }

  .btn-action.pdf:disabled {
    opacity: 0.7;
    cursor: wait;
  }

  .btn-action.edit {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #2563eb;
  }

  .btn-action.edit:hover {
    background: #dbeafe;
  }

  /* Loading State */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 3rem;
    color: #6b7280;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Post View */
  .post-view {
    padding: 2rem 3rem;
    width: 100%;
    box-sizing: border-box;
  }

  .post-view-header {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .btn-back-link {
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0;
    margin-bottom: 1rem;
    display: inline-block;
    transition: color 0.2s;
  }

  .btn-back-link:hover {
    color: #2563eb;
  }

  .post-status-badges {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-badge.closed {
    background: #fef2f2;
    color: #dc2626;
  }

  .status-badge.assigned {
    background: #eff6ff;
    color: #2563eb;
  }

  .post-view-title {
    font-size: 1.75rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 1rem 0;
    line-height: 1.3;
  }

  .post-view-title .title-prefix {
    color: #2563eb;
    font-size: 0.8em;
    margin-right: 0.25rem;
  }

  .post-view-meta {
    display: flex;
    gap: 1.5rem;
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .post-view-actions {
    margin-top: 1rem;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .btn-action.delete {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }

  .btn-action.delete:hover {
    background: #fee2e2;
  }

  .btn-action.close {
    background: #fef3c7;
    border-color: #fcd34d;
    color: #92400e;
  }

  .btn-action.close:hover {
    background: #fde68a;
  }

  .btn-action.reopen {
    background: #d1fae5;
    border-color: #6ee7b7;
    color: #059669;
  }

  .btn-action.reopen:hover {
    background: #a7f3d0;
  }

  .btn-action.claim {
    background: #ede9fe;
    border-color: #c4b5fd;
    color: #7c3aed;
  }

  .btn-action.claim:hover {
    background: #ddd6fe;
  }

  .btn-action.assign {
    background: #e0e7ff;
    border-color: #a5b4fc;
    color: #4f46e5;
  }

  .btn-action.assign:hover {
    background: #c7d2fe;
  }

  /* Assign Dropdown */
  .assign-dropdown-container {
    position: relative;
    display: flex;
    gap: 0.5rem;
  }

  .assign-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.25rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
    min-width: 180px;
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
  }

  .dropdown-item {
    display: block;
    width: 100%;
    padding: 0.625rem 1rem;
    text-align: left;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.875rem;
    color: #374151;
    transition: background 0.2s;
  }

  .dropdown-item:hover {
    background: #f3f4f6;
  }

  .dropdown-item.current {
    background: #eff6ff;
    color: #2563eb;
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
    padding: 1rem;
    text-align: center;
    color: #9ca3af;
    font-size: 0.875rem;
  }

  .post-view-body {
    font-size: 1rem;
    line-height: 1.7;
    color: #374151;
    word-wrap: break-word;
    overflow-wrap: break-word;
    max-width: 100%;
  }

  .post-view-body h1,
  .post-view-body h2,
  .post-view-body h3 {
    color: #1f2937;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
  }

  .post-view-body p {
    margin: 0 0 1rem 0;
  }

  /* Collapse empty paragraphs (Quill creates <p><br></p> for blank lines) */
  .post-view-body p:empty {
    display: none;
  }

  .post-view-body p > br:only-child {
    display: none;
  }

  .post-view-body br + br {
    display: none;
  }

  .post-view-body ul,
  .post-view-body ol {
    margin-bottom: 1rem;
    padding-left: 1.5rem;
  }

  .post-view-body code {
    background: #f3f4f6;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.875em;
    word-break: break-all;
  }

  .post-view-body img {
    max-width: 100%;
    height: auto;
  }

  .post-view-body pre {
    background: #1f2937;
    color: #f9fafb;
    padding: 1rem;
    border-radius: 8px;
    overflow-x: auto;
    margin-bottom: 1rem;
    max-width: 100%;
  }

  .post-view-body pre code {
    background: none;
    padding: 0;
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
    background: #e5e7eb;
    color: #1f2937;
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
    padding: 0;
    margin: 0;
  }

  .history-entry {
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 0.5rem;
    background: #f9fafb;
    transition: background 0.2s;
  }

  .history-entry:hover {
    background: #f3f4f6;
  }

  .history-action {
    font-size: 0.75rem;
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
    color: #059669;
  }

  .history-action.assigned {
    color: #7c3aed;
  }

  .history-action.unassigned {
    color: #6b7280;
  }

  .history-user {
    font-size: 0.8rem;
    color: #374151;
    margin-bottom: 0.125rem;
  }

  .history-user.secondary {
    color: #9ca3af;
    font-size: 0.75rem;
  }

  .history-date {
    font-size: 0.7rem;
    color: #9ca3af;
    margin-top: 0.25rem;
  }

  .btn-show-history {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 40px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 50%;
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

  /* Responsive */
  @media (max-width: 768px) {
    .group-posts-explorer {
      position: relative;
      top: auto;
      left: auto;
      right: auto;
      bottom: auto;
      height: auto;
      min-height: calc(100vh - 56px);
      flex-direction: column;
    }

    .sidebar {
      display: none;
    }

    .resize-handle {
      display: none;
    }

    .history-panel {
      display: none;
    }

    .btn-show-history {
      display: none;
    }

    .group-header {
      flex-direction: column;
    }

    .search-box {
      width: 100%;
    }

    .posts-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
