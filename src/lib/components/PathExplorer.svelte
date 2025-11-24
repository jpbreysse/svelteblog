<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { invalidateAll } from '$app/navigation';
    import PathTree from './PathTree.svelte';
    import PathBreadcrumb from './PathBreadcrumb.svelte';

    export let showPostsList = true;
    export let allowFileUpload = false;
    export let user = null;
    
    let treeData = [];
    let currentPath = null;
    let currentPathDetails = null;
    let posts = [];
    let loading = false;
    let view = 'grid'; // 'grid' or 'list'
    let searchQuery = '';
    let sortBy = 'name'; // 'name', 'date', 'size'
    let sortOrder = 'asc'; // 'asc' or 'desc'
    
    onMount(() => {
      loadTree();
      loadPosts();
    });
    
    async function loadTree() {
      try {
        const response = await fetch('/api/paths/tree');
        const data = await response.json();
        if (data.success) {
          treeData = data.tree;
        }
      } catch (error) {
        console.error('Error loading tree:', error);
      }
    }
    
    async function loadPosts(pathId = null) {
  if (!showPostsList) return;
  
  loading = true;
  try {
    // Build URL with path filter
    let url = '/api/posts';
    if (pathId !== null) {
      url += `?path_id=${pathId}`;
    }
    
    console.log('Loading posts from:', url); // Debug log
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.success || data.posts) {
      posts = data.posts || [];
      console.log(`Loaded ${posts.length} posts for path ${pathId}`); // Debug log
    }
  } catch (error) {
    console.error('Error loading posts:', error);
    posts = [];
  } finally {
    loading = false;
  }
}

async function handlePathSelect(event) {
  const path = event.detail;
  currentPath = path.id;
  
  console.log('Selected path:', path.id, path.name); // Debug log
  
  // Load path details
  try {
    const response = await fetch(`/api/paths/${path.id}`);
    const data = await response.json();
    if (data.success) {
      currentPathDetails = data.path;
    }
  } catch (error) {
    console.error('Error loading path details:', error);
  }
  
  // Load posts in this path - IMPORTANT: pass the path.id here
  await loadPosts(path.id);
}
    
    function handleBreadcrumbNavigate(event) {
      const path = event.detail;
      if (path) {
        currentPath = path.id;
        currentPathDetails = path;
        loadPosts(path.id);
      } else {
        // Navigate to root
        currentPath = null;
        currentPathDetails = null;
        loadPosts();
      }
    }
    
    function toggleView() {
      view = view === 'grid' ? 'list' : 'grid';
    }
    
    function handleSort(newSortBy) {
      if (sortBy === newSortBy) {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        sortBy = newSortBy;
        sortOrder = 'asc';
      }
    }
    
    $: filteredPosts = posts.filter(post => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return post.title.toLowerCase().includes(query) ||
             (post.excerpt && post.excerpt.toLowerCase().includes(query));
    });
    
    $: sortedPosts = [...filteredPosts].sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'name') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortBy === 'date') {
        comparison = new Date(a.created_at) - new Date(b.created_at);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Authorization check for editing posts
    function canEditPost(post) {
      return user && (post.author_id === user.id || user.role === 'admin');
    }

    // Edit post - redirect to blog page with edit mode and return URL
    function editPost(post) {
      goto(`/blog?edit=${post.id}&return=/explorer`);
    }

    // Delete post
    async function deletePost(postId) {
      if (!confirm('Are you sure you want to delete this post?')) return;

      loading = true;
      try {
        const response = await fetch(`/api/posts/${postId}`, {
          method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
          alert('✅ Post deleted successfully!');
          // Reload posts for current path
          await loadPosts(currentPath);
        } else {
          alert(`❌ Error deleting post: ${result.error}`);
        }
      } catch (error) {
        console.error('Error deleting post:', error);
        alert('❌ Failed to delete post. Please try again.');
      } finally {
        loading = false;
      }
    }
  </script>
  
  <div class="path-explorer">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        {#if currentPathDetails}
          <PathBreadcrumb 
            breadcrumbs={currentPathDetails.breadcrumbs}
            on:navigate={handleBreadcrumbNavigate}
          />
        {:else}
          <div class="breadcrumb-home">
            🏠 All Content
          </div>
        {/if}
      </div>
      
      <div class="toolbar-right">
        <div class="search-box">
          <input
            type="search"
            placeholder="Search posts..."
            bind:value={searchQuery}
          />
        </div>
        
        <button class="btn-icon" on:click={toggleView} title="Toggle view">
          {view === 'grid' ? '☰' : '⊞'}
        </button>
      </div>
    </div>
    
    <!-- Main Content Area -->
    <div class="explorer-layout">
      <!-- Left Sidebar: Folder Tree -->
      <aside class="explorer-sidebar">
        <div class="sidebar-header">
          <h3>📁 Folders</h3>
        </div>
        
        <div class="tree-wrapper">
          <PathTree
            paths={treeData}
            selectedPath={currentPath}
            on:select={handlePathSelect}
            showCounts={true}
            collapsible={true}
          />
        </div>
      </aside>
      
      <!-- Right Panel: Content -->
      <main class="explorer-content">
        {#if currentPathDetails}
          <div class="path-header">
            <div class="path-info">
              <span class="path-icon" style="color: {currentPathDetails.color}">
                {currentPathDetails.icon}
              </span>
              <div>
                <h2>{currentPathDetails.name}</h2>
                {#if currentPathDetails.description}
                  <p class="path-description">{currentPathDetails.description}</p>
                {/if}
              </div>
            </div>
            
            <div class="path-stats">
              <div class="stat">
                <span class="stat-value">{currentPathDetails.child_count}</span>
                <span class="stat-label">Subfolders</span>
              </div>
              <div class="stat">
                <span class="stat-value">{currentPathDetails.post_count}</span>
                <span class="stat-label">Posts</span>
              </div>
            </div>
          </div>
        {/if}
        
        <!-- Subfolders Section -->
        {#if currentPathDetails?.children && currentPathDetails.children.length > 0}
          <div class="subfolders-section">
            <h3>📂 Subfolders</h3>
            <div class="subfolders-grid">
              {#each currentPathDetails.children as subfolder}
                <button
                  class="folder-card"
                  on:click={() => handlePathSelect({ detail: subfolder })}
                >
                  <div class="folder-icon" style="color: {subfolder.color}">
                    {subfolder.icon || '📁'}
                  </div>
                  <div class="folder-name">{subfolder.name}</div>
                  <div class="folder-meta">
                    {subfolder.child_count} folders · {subfolder.post_count} posts
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}
        
        <!-- Posts Section -->
        {#if showPostsList}
          <div class="posts-section">
            <div class="posts-header">
              <h3>📝 Posts ({sortedPosts.length})</h3>
              
              <div class="sort-controls">
                <button
                  class="sort-btn"
                  class:active={sortBy === 'name'}
                  on:click={() => handleSort('name')}
                >
                  Name {sortBy === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </button>
                <button
                  class="sort-btn"
                  class:active={sortBy === 'date'}
                  on:click={() => handleSort('date')}
                >
                  Date {sortBy === 'date' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                </button>
              </div>
            </div>
            
            {#if loading}
              <div class="loading">
                <div class="spinner"></div>
                Loading posts...
              </div>
            {:else if sortedPosts.length === 0}
              <div class="empty-posts">
                <div class="empty-icon">📭</div>
                <p>No posts in this folder</p>
                {#if searchQuery}
                  <p class="empty-hint">Try a different search query</p>
                {/if}
              </div>
            {:else}
              <div class="posts-{view}">
                {#each sortedPosts as post}
                  <div class="post-card">
                    <div class="post-header">
                      <div class="post-title-wrapper">
                        <h4 class="post-title">
                          <a href="/blog/{post.slug}">{post.title}</a>
                        </h4>
                      </div>
                      <div class="post-actions">
                        {#if canEditPost(post)}
                          <button class="action-btn edit-btn" on:click={() => editPost(post)} title="Edit post" disabled={loading}>
                            ✏️
                          </button>
                          <button class="action-btn delete-btn" on:click={() => deletePost(post.id)} title="Delete post" disabled={loading}>
                            🗑️
                          </button>
                        {/if}
                        {#if post.category}
                          <span class="post-category">{post.category}</span>
                        {/if}
                      </div>
                    </div>
                    
                    {#if post.excerpt}
                      <p class="post-excerpt">{post.excerpt}</p>
                    {/if}
                    
                    <div class="post-meta">
                      <span class="post-author">👤 {post.author}</span>
                      <span class="post-date">
                        📅 {new Date(post.created_at).toLocaleDateString()}
                      </span>
                      {#if post.read_time}
                        <span class="post-read-time">⏱️ {post.read_time}</span>
                      {/if}
                    </div>
                    
                    {#if post.tags && post.tags.length > 0}
                      <div class="post-tags">
                        {#each post.tags as tag}
                          <span class="tag">{tag}</span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </main>
    </div>
  </div>
  
  <style>
    .path-explorer {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background-color: #f9fafb;
    }
    
    /* Toolbar */
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background: white;
      border-bottom: 1px solid #e5e7eb;
      gap: 1rem;
    }
    
    .toolbar-left {
      flex: 1;
    }
    
    .toolbar-right {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    
    .breadcrumb-home {
      font-size: 1rem;
      font-weight: 500;
      color: #374151;
    }
    
    .search-box {
      position: relative;
    }
    
    .search-box input {
      width: 250px;
      padding: 0.5rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }
    
    .search-box input:focus {
      outline: none;
      border-color: #6366f1;
    }
    
    .btn-icon {
      width: 2.5rem;
      height: 2.5rem;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 0.375rem;
      cursor: pointer;
      font-size: 1.25rem;
      transition: all 0.15s ease;
    }
    
    .btn-icon:hover {
      background: #f3f4f6;
      border-color: #9ca3af;
    }
    
    /* Main Layout */
    .explorer-layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      flex: 1;
      overflow: hidden;
    }
    
    .explorer-sidebar {
      background: white;
      border-right: 1px solid #e5e7eb;
      overflow-y: auto;
    }
    
    .sidebar-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .sidebar-header h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }
    
    .tree-wrapper {
      padding: 1rem;
    }
    
    .explorer-content {
      overflow-y: auto;
      padding: 1.5rem;
    }
    
    /* Path Header */
    .path-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 1.5rem;
      background: white;
      border-radius: 0.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    
    .path-info {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
    }
    
    .path-icon {
      font-size: 3rem;
    }
    
    .path-info h2 {
      margin: 0 0 0.5rem 0;
      font-size: 1.75rem;
    }
    
    .path-description {
      margin: 0;
      color: #6b7280;
    }
    
    .path-stats {
      display: flex;
      gap: 2rem;
    }
    
    .stat {
      text-align: center;
    }
    
    .stat-value {
      display: block;
      font-size: 2rem;
      font-weight: 700;
      color: #6366f1;
    }
    
    .stat-label {
      display: block;
      font-size: 0.75rem;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    /* Subfolders */
    .subfolders-section {
      margin-bottom: 2rem;
    }
    
    .subfolders-section h3 {
      font-size: 1.25rem;
      margin-bottom: 1rem;
    }
    
    .subfolders-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }
    
    .folder-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.5rem;
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: center;
    }
    
    .folder-card:hover {
      border-color: #6366f1;
      transform: translateY(-2px);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .folder-icon {
      font-size: 3rem;
      margin-bottom: 0.5rem;
    }
    
    .folder-name {
      font-weight: 600;
      margin-bottom: 0.25rem;
      color: #111827;
    }
    
    .folder-meta {
      font-size: 0.75rem;
      color: #6b7280;
    }
    
    /* Posts Section */
    .posts-section {
      background: white;
      border-radius: 0.5rem;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    
    .posts-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    
    .posts-header h3 {
      margin: 0;
      font-size: 1.25rem;
    }
    
    .sort-controls {
      display: flex;
      gap: 0.5rem;
    }
    
    .sort-btn {
      padding: 0.375rem 0.75rem;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 0.25rem;
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.15s ease;
    }
    
    .sort-btn:hover {
      border-color: #9ca3af;
    }
    
    .sort-btn.active {
      background-color: #6366f1;
      color: white;
      border-color: #6366f1;
    }
    
    /* Loading */
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      color: #6b7280;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e5e7eb;
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 1rem;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Empty State */
    .empty-posts {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }
    
    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    
    .empty-posts p {
      margin: 0.5rem 0;
    }
    
    .empty-hint {
      font-size: 0.875rem;
      color: #9ca3af;
    }
    
    /* Posts Grid View */
    .posts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
    }
    
    /* Posts List View */
    .posts-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    
    /* Post Card */
    .post-card {
      display: flex;
      flex-direction: column;
      padding: 1.5rem;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      color: inherit;
      transition: all 0.15s ease;
      position: relative;
    }
    
    .post-card:hover {
      border-color: #6366f1;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      transform: translateY(-2px);
    }
    
    .post-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    .post-title-wrapper {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
    }

    .post-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .action-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 4px;
      transition: background-color 0.2s;
      font-size: 1rem;
    }

    .action-btn:hover:not(:disabled) {
      background: #f3f4f6;
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .edit-btn:hover:not(:disabled) {
      background: #dbeafe;
    }

    .delete-btn:hover:not(:disabled) {
      background: #fee2e2;
    }
    
    .post-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      flex: 1;
    }
    
    .post-title a {
      color: #111827;
      text-decoration: none;
      transition: color 0.15s ease;
    }
    
    .post-title a:hover {
      color: #6366f1;
    }
    
    .icon-btn {
      background: transparent;
      border: 1px solid transparent;
      padding: 0.25rem;
      border-radius: 0.25rem;
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.6;
    }
    
    .icon-btn:hover {
      opacity: 1;
      background: #f3f4f6;
      border-color: #d1d5db;
    }
    
    .edit-icon-btn:hover {
      background: #dbeafe;
      border-color: #3b82f6;
    }
    
    .post-category {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 500;
      background-color: #e0e7ff;
      color: #4f46e5;
      border-radius: 0.25rem;
      text-transform: uppercase;
    }
    
    .post-excerpt {
      margin: 0 0 1rem 0;
      color: #6b7280;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    
    .post-meta {
      display: flex;
      gap: 1rem;
      font-size: 0.75rem;
      color: #9ca3af;
      margin-bottom: 0.75rem;
    }
    
    .post-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    
    .tag {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      background-color: #f3f4f6;
      color: #6b7280;
      border-radius: 0.25rem;
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .explorer-layout {
        grid-template-columns: 1fr;
      }
      
      .explorer-sidebar {
        display: none;
      }
      
      .toolbar {
        flex-direction: column;
        align-items: stretch;
      }
      
      .search-box input {
        width: 100%;
      }
      
      .posts-grid {
        grid-template-columns: 1fr;
      }
      
      .subfolders-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>