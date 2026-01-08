<script>
  import { goto } from '$app/navigation';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  
  export let data;
  
  // Filter states
  let searchQuery = data.filters.search;
  let selectedAuthor = data.filters.author;
  let selectedCategory = data.filters.category;
  let selectedStatus = data.filters.status || 'all';
  
  // Selection states
  let selectedPosts = new Set();
  let selectAll = false;
  let showDeleteModal = false;
  let deletingPost = null;
  let bulkDeleting = false;
  
  // Reactive data
  $: posts = data.posts || [];
  $: authors = data.authors || [];
  $: categories = data.categories || [];
  $: stats = data.stats || { total: 0, published: 0, drafts: 0, withReports: 0 };
  
  // Handle search with debouncing
  let searchTimeout;
  function handleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      updateFilters();
    }, 500);
  }
  
  function updateFilters() {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (selectedAuthor) params.set('author', selectedAuthor);
    if (selectedCategory) params.set('category', selectedCategory);
    if (selectedStatus !== 'all') params.set('status', selectedStatus);
    
    const url = `/admin/posts${params.toString() ? '?' + params.toString() : ''}`;
    goto(url);
  }
  
  function formatDate(date) {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  function formatExcerpt(content, maxLength = 100) {
    const text = content.replace(/<[^>]*>/g, '');
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }
  
  // Selection handlers
  function toggleSelectAll() {
    if (selectAll) {
      selectedPosts = new Set(posts.map(p => p.id));
    } else {
      selectedPosts = new Set();
    }
  }
  
  function togglePostSelection(postId) {
    if (selectedPosts.has(postId)) {
      selectedPosts.delete(postId);
    } else {
      selectedPosts.add(postId);
    }
    selectedPosts = selectedPosts; // Trigger reactivity
    selectAll = selectedPosts.size === posts.length;
  }
  
  // Post actions
  function confirmDeletePost(post) {
    deletingPost = post;
    showDeleteModal = true;
  }
  
  async function deletePost(postId) {
    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        await invalidateAll();
        showDeleteModal = false;
        deletingPost = null;
      } else {
        alert(`Error deleting post: ${result.error}`);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      alert('Failed to delete post. Please try again.');
    }
  }
  
  async function bulkDeletePosts() {
    if (selectedPosts.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedPosts.size} selected posts? This action cannot be undone.`)) {
      return;
    }
    
    bulkDeleting = true;
    try {
      const deletePromises = Array.from(selectedPosts).map(postId =>
        fetch(`/api/posts/${postId}`, { method: 'DELETE' })
      );
      
      const responses = await Promise.all(deletePromises);
      const results = await Promise.all(responses.map(r => r.json()));
      
      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;
      
      if (failed > 0) {
        alert(`${successful} posts deleted successfully. ${failed} failed to delete.`);
      } else {
        alert(`${successful} posts deleted successfully.`);
      }
      
      selectedPosts = new Set();
      selectAll = false;
      await invalidateAll();
    } catch (error) {
      console.error('Error bulk deleting posts:', error);
      alert('Failed to delete posts. Please try again.');
    } finally {
      bulkDeleting = false;
    }
  }
  
  async function togglePostStatus(postId, currentStatus) {
    try {
      const response = await fetch(`/api/admin/posts/toggle-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, published: !currentStatus })
      });
      
      const result = await response.json();
      
      if (result.success) {
        await invalidateAll();
      } else {
        alert(`Error updating post: ${result.error}`);
      }
    } catch (error) {
      console.error('Error updating post status:', error);
      alert('Failed to update post status. Please try again.');
    }
  }
  
  function viewPost(post) {
    window.open(`/blog/${post.slug}`, '_blank');
  }
  
  function editPost(post) {
    goto(`/blog?edit=${post.id}`);
  }
</script>

<svelte:head>
  <title>Posts Management - Admin Panel</title>
</svelte:head>

<div class="admin-container">
  <div class="page-header">
    <h1>📝 Posts Management</h1>
    <a href="/admin" class="back-link">← Back to Admin</a>
  </div>
  
  <!-- Statistics -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-number">{stats.total}</div>
      <div class="stat-label">Total Posts</div>
    </div>
    <div class="stat-card published">
      <div class="stat-number">{stats.published}</div>
      <div class="stat-label">Published</div>
    </div>
    <div class="stat-card drafts">
      <div class="stat-number">{stats.drafts}</div>
      <div class="stat-label">Drafts</div>
    </div>
    <div class="stat-card reports">
      <div class="stat-number">{stats.withReports}</div>
      <div class="stat-label">With Reports</div>
    </div>
  </div>
  
  <!-- Filters -->
  <div class="filters-section">
    <div class="search-bar">
      <input 
        bind:value={searchQuery}
        on:input={handleSearch}
        placeholder="Search posts by title or content..."
        class="search-input"
      />
      <span class="search-icon">🔍</span>
    </div>
    
    <div class="filter-controls">
      <select bind:value={selectedAuthor} on:change={updateFilters} class="filter-select">
        <option value="">All Authors</option>
        {#each authors as author}
          <option value={author.display_name}>{author.display_name}</option>
        {/each}
      </select>
      
      <select bind:value={selectedCategory} on:change={updateFilters} class="filter-select">
        <option value="">All Categories</option>
        {#each categories as category}
          <option value={category.category}>
            {category.category.charAt(0).toUpperCase() + category.category.slice(1)} ({category.count})
          </option>
        {/each}
      </select>
      
      <select bind:value={selectedStatus} on:change={updateFilters} class="filter-select">
        <option value="all">All Status</option>
        <option value="published">Published</option>
        <option value="draft">Drafts</option>
      </select>
    </div>
  </div>
  
  <!-- Bulk Actions -->
  {#if selectedPosts.size > 0}
    <div class="bulk-actions">
      <span class="selection-info">
        {selectedPosts.size} post{selectedPosts.size !== 1 ? 's' : ''} selected
      </span>
      <button 
        class="btn btn-danger"
        on:click={bulkDeletePosts}
        disabled={bulkDeleting}
      >
        {bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedPosts.size})`}
      </button>
    </div>
  {/if}
  
  <!-- Posts Table -->
  <div class="posts-table">
    {#if posts.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <h3>No posts found</h3>
        <p>
          {searchQuery || selectedAuthor || selectedCategory || selectedStatus !== 'all'
            ? 'No posts match the selected filters.'
            : 'No posts have been created yet.'}
        </p>
      </div>
    {:else}
      <table>
        <thead>
          <tr>
            <th class="checkbox-column">
              <input 
                type="checkbox" 
                bind:checked={selectAll}
                on:change={toggleSelectAll}
              />
            </th>
            <th>Title</th>
            <th>Author</th>
            <th>Category</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each posts as post (post.id)}
            <tr class="post-row" class:has-reports={post.has_reports}>
              <td class="checkbox-column">
                <input 
                  type="checkbox" 
                  checked={selectedPosts.has(post.id)}
                  on:change={() => togglePostSelection(post.id)}
                />
              </td>
              
              <td class="title-cell">
                <div class="post-title">
                  {post.title}
                  {#if post.has_reports}
                    <span class="report-indicator" title="Has pending reports">⚠️</span>
                  {/if}
                </div>
                <div class="post-excerpt">
                  {formatExcerpt(post.excerpt || post.content)}
                </div>
                {#if post.tags && post.tags.length > 0}
                  <div class="post-tags">
                    {#each post.tags.slice(0, 3) as tag}
                      <span class="tag">🏷️ {tag}</span>
                    {/each}
                    {#if post.tags.length > 3}
                      <span class="tag-more">+{post.tags.length - 3} more</span>
                    {/if}
                  </div>
                {/if}
              </td>
              
              <td class="author-cell">
                <div class="author-info">
                  <div class="author-name">{post.author}</div>
                  <div class="author-email">{post.email}</div>
                </div>
              </td>
              
              <td class="category-cell">
                <span class="category-badge">
                  {#if post.category_post_number}
                    <span class="category-prefix">{post.category.substring(0, 3).toUpperCase()}</span>
                    #{post.category_post_number}
                  {:else}
                    {post.category.charAt(0).toUpperCase() + post.category.slice(1)}
                  {/if}
                </span>
              </td>
              
              <td class="status-cell">
                <button 
                  class="status-toggle {post.published ? 'published' : 'draft'}"
                  on:click={() => togglePostStatus(post.id, post.published)}
                  title="Click to toggle status"
                >
                  {post.published ? '✅ Published' : '📝 Draft'}
                </button>
              </td>
              
              <td class="date-cell">
                <div class="date-info">
                  <div class="created-date">{formatDate(post.created_at)}</div>
                  {#if post.updated_at.getTime() !== post.created_at.getTime()}
                    <div class="updated-date">Updated: {formatDate(post.updated_at)}</div>
                  {/if}
                </div>
              </td>
              
              <td class="actions-cell">
                <div class="action-buttons">
                  <button 
                    class="action-btn view-btn"
                    on:click={() => viewPost(post)}
                    title="View post"
                  >
                    👁️
                  </button>
                  <button 
                    class="action-btn edit-btn"
                    on:click={() => editPost(post)}
                    title="Edit post"
                  >
                    ✏️
                  </button>
                  <button 
                    class="action-btn delete-btn"
                    on:click={() => confirmDeletePost(post)}
                    title="Delete post"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteModal && deletingPost}
  <div class="modal-overlay" on:click={() => showDeleteModal = false}>
    <div class="modal delete-modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>🗑️ Confirm Deletion</h3>
        <button class="modal-close" on:click={() => showDeleteModal = false}>×</button>
      </div>
      
      <div class="modal-body">
        <p>Are you sure you want to delete this post?</p>
        <div class="post-preview">
          <strong>{deletingPost.title}</strong>
          <div class="post-meta">
            By {deletingPost.author} • {formatDate(deletingPost.created_at)}
          </div>
        </div>
        <p class="warning">⚠️ This action cannot be undone.</p>
      </div>
      
      <div class="modal-actions">
        <button 
          class="btn btn-danger"
          on:click={() => deletePost(deletingPost.id)}
        >
          Delete Post
        </button>
        <button 
          class="btn btn-secondary"
          on:click={() => showDeleteModal = false}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .admin-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }
  
  .page-header h1 {
    color: #1f2937;
    margin: 0;
  }
  
  .back-link {
    color: #2563eb;
    text-decoration: none;
    font-weight: 500;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    transition: background-color 0.2s;
  }
  
  .back-link:hover {
    background: #eff6ff;
  }
  
  /* Statistics */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .stat-card {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    text-align: center;
  }
  
  .stat-card.published {
    border-left: 4px solid #10b981;
  }
  
  .stat-card.drafts {
    border-left: 4px solid #f59e0b;
  }
  
  .stat-card.reports {
    border-left: 4px solid #dc2626;
  }
  
  .stat-number {
    font-size: 2rem;
    font-weight: 700;
    color: #1f2937;
  }
  
  .stat-label {
    color: #6b7280;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
  
  /* Filters */
  .filters-section {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
  }
  
  .search-bar {
    position: relative;
    margin-bottom: 1rem;
  }
  
  .search-input {
    width: 100%;
    padding: 0.75rem 2.5rem 0.75rem 1rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    box-sizing: border-box;
  }
  
  .search-icon {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: #6b7280;
  }
  
  .filter-controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }
  
  .filter-select {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.875rem;
  }
  
  /* Bulk Actions */
  .bulk-actions {
    background: #1f2937;
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .selection-info {
    font-weight: 500;
  }
  
  /* Table */
  .posts-table {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }
  
  .empty-state {
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
    margin-bottom: 0.5rem;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
  }
  
  th {
    background: #f9fafb;
    padding: 1rem;
    text-align: left;
    font-weight: 600;
    color: #374151;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .checkbox-column {
    width: 40px;
    text-align: center;
  }
  
  td {
    padding: 1rem;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: top;
  }
  
  .post-row:hover {
    background: #f9fafb;
  }
  
  .post-row.has-reports {
    border-left: 4px solid #dc2626;
  }
  
  .title-cell {
    max-width: 300px;
  }
  
  .post-title {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .report-indicator {
    color: #dc2626;
  }
  
  .post-excerpt {
    color: #6b7280;
    font-size: 0.875rem;
    line-height: 1.4;
    margin-bottom: 0.5rem;
  }
  
  .post-tags {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }
  
  .tag {
    background: #f3f4f6;
    color: #374151;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-size: 0.75rem;
  }
  
  .tag-more {
    color: #6b7280;
    font-size: 0.75rem;
  }
  
  .author-cell {
    min-width: 150px;
  }
  
  .author-name {
    font-weight: 500;
    color: #1f2937;
  }
  
  .author-email {
    font-size: 0.875rem;
    color: #6b7280;
  }
  
  .category-badge {
    background: #ddd6fe;
    color: #5b21b6;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .category-prefix {
    font-weight: 700;
    color: #3730a3;
    margin-right: 0.15rem;
  }

  .status-toggle {
    border: none;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .status-toggle.published {
    background: #d1fae5;
    color: #065f46;
  }
  
  .status-toggle.draft {
    background: #fef3c7;
    color: #92400e;
  }
  
  .status-toggle:hover {
    opacity: 0.8;
  }
  
  .date-cell {
    min-width: 120px;
  }
  
  .created-date {
    font-size: 0.875rem;
    color: #1f2937;
  }
  
  .updated-date {
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .action-buttons {
    display: flex;
    gap: 0.5rem;
  }
  
  .action-btn {
    background: none;
    border: 1px solid #d1d5db;
    padding: 0.375rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
  }
  
  .action-btn:hover {
    background: #f3f4f6;
  }
  
  .delete-btn:hover {
    background: #fee2e2;
    border-color: #fca5a5;
  }
  
  /* Buttons */
  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  
  .btn-danger {
    background: #dc2626;
    color: white;
  }
  
  .btn-danger:hover:not(:disabled) {
    background: #b91c1c;
  }
  
  .btn-secondary {
    background: #6b7280;
    color: white;
  }
  
  .btn-secondary:hover:not(:disabled) {
    background: #5b6470;
  }
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }
  
  .modal {
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 500px;
    box-shadow: 0 20px 25px rgba(0, 0, 0, 0.1);
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .modal-header h3 {
    margin: 0;
    color: #1f2937;
  }
  
  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6b7280;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }
  
  .modal-close:hover {
    color: #374151;
    background: #f3f4f6;
  }
  
  .modal-body {
    padding: 1.5rem;
  }
  
  .post-preview {
    background: #f8fafc;
    padding: 1rem;
    border-radius: 6px;
    margin: 1rem 0;
    border-left: 4px solid #2563eb;
  }
  
  .post-meta {
    color: #6b7280;
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }
  
  .warning {
    color: #dc2626;
    font-weight: 500;
    margin: 1rem 0 0 0;
  }
  
  .modal-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }
  
  @media (max-width: 1200px) {
    .admin-container {
      padding: 1rem;
    }
    
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    
    .filter-controls {
      grid-template-columns: 1fr;
    }
    
    .bulk-actions {
      flex-direction: column;
      gap: 1rem;
      text-align: center;
    }
  }
  
  @media (max-width: 768px) {
    .page-header {
      flex-direction: column;
      gap: 1rem;
      align-items: flex-start;
    }
    
    .stats-grid {
      grid-template-columns: 1fr;
    }
    
    .posts-table {
      overflow-x: auto;
    }
    
    table {
      min-width: 800px;
    }
    
    .modal {
      margin: 1rem;
      width: calc(100% - 2rem);
    }
    
    .modal-actions {
      flex-direction: column;
    }
  }
</style>
