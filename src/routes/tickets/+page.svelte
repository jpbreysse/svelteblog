<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  export let data;

  $: posts = data.posts || [];
  $: stats = data.stats || {};
  $: availableGroups = data.availableGroups || [];
  $: filters = data.filters || { closed: 'all', assigned: 'all', group: 'all', search: '' };
  $: error = data.error;

  // Local filter state - initialize from data
  let closedFilter = 'all';
  let assignedFilter = 'all';
  let groupFilter = 'all';
  let searchQuery = '';

  // Sync from server filters on load
  $: if (data.filters) {
    closedFilter = data.filters.closed || 'all';
    assignedFilter = data.filters.assigned || 'all';
    groupFilter = data.filters.group || 'all';
    searchQuery = data.filters.search || '';
  }

  // Apply filters client-side for immediate feedback
  $: filteredPosts = applyFilters(posts, closedFilter, assignedFilter, groupFilter, searchQuery);

  function applyFilters(posts, closed, assigned, group, search) {
    let result = posts;

    // Closed filter
    if (closed === 'open') {
      result = result.filter(p => !p.closed_at);
    } else if (closed === 'closed') {
      result = result.filter(p => p.closed_at);
    }

    // Assigned filter
    if (assigned === 'assigned') {
      result = result.filter(p => p.assigned_to);
    } else if (assigned === 'unassigned') {
      result = result.filter(p => !p.assigned_to);
    } else if (assigned === 'mine') {
      result = result.filter(p => p.assigned_to === data.user?.id);
    }

    // Group filter
    if (group && group !== 'all') {
      result = result.filter(p => {
        const allGroups = [...(p.read_groups || []), ...(p.write_groups || [])];
        return allGroups.some(g => g === group);
      });
    }

    // Search filter
    if (search && search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.author_name?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.assignee_name?.toLowerCase().includes(q)
      );
    }

    return result;
  }

  function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatShortDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  function viewPost(post) {
    goto(`/explorer?post=${post.id}`);
  }

  function editPost(post) {
    goto(`/blog?edit=${post.id}&return=/tickets`);
  }

  function clearFilters() {
    closedFilter = 'all';
    assignedFilter = 'all';
    groupFilter = 'all';
    searchQuery = '';
  }

  $: hasActiveFilters = closedFilter !== 'all' || assignedFilter !== 'all' || groupFilter !== 'all' || searchQuery;
</script>

<svelte:head>
  <title>Tickets</title>
</svelte:head>

<div class="tickets-page">
  <!-- Header -->
  <header class="page-header">
    <div class="header-content">
      <h1>Tickets</h1>
      <p class="subtitle">All posts you have access to</p>
    </div>

    <!-- Stats -->
    <div class="stats-bar">
      <button
        class="stat-item"
        class:active={closedFilter === 'all' && assignedFilter === 'all'}
        on:click={() => { closedFilter = 'all'; assignedFilter = 'all'; }}
      >
        <span class="stat-value">{stats.total}</span>
        <span class="stat-label">Total</span>
      </button>
      <button
        class="stat-item open"
        class:active={closedFilter === 'open'}
        on:click={() => closedFilter = closedFilter === 'open' ? 'all' : 'open'}
      >
        <span class="stat-value">{stats.open}</span>
        <span class="stat-label">Open</span>
      </button>
      <button
        class="stat-item closed"
        class:active={closedFilter === 'closed'}
        on:click={() => closedFilter = closedFilter === 'closed' ? 'all' : 'closed'}
      >
        <span class="stat-value">{stats.closed}</span>
        <span class="stat-label">Closed</span>
      </button>
      <button
        class="stat-item assigned"
        class:active={assignedFilter === 'assigned'}
        on:click={() => assignedFilter = assignedFilter === 'assigned' ? 'all' : 'assigned'}
      >
        <span class="stat-value">{stats.assigned}</span>
        <span class="stat-label">Assigned</span>
      </button>
      <button
        class="stat-item unassigned"
        class:active={assignedFilter === 'unassigned'}
        on:click={() => assignedFilter = assignedFilter === 'unassigned' ? 'all' : 'unassigned'}
      >
        <span class="stat-value">{stats.unassigned}</span>
        <span class="stat-label">Unassigned</span>
      </button>
      {#if data.user}
        <button
          class="stat-item mine"
          class:active={assignedFilter === 'mine'}
          on:click={() => assignedFilter = assignedFilter === 'mine' ? 'all' : 'mine'}
        >
          <span class="stat-value">{stats.myTickets}</span>
          <span class="stat-label">My Tickets</span>
        </button>
      {/if}
    </div>
  </header>

  <!-- Filters Bar -->
  <div class="filters-bar">
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input
        type="text"
        placeholder="Search tickets..."
        bind:value={searchQuery}
        class="search-input"
      />
      {#if searchQuery}
        <button class="clear-btn" on:click={() => searchQuery = ''}>×</button>
      {/if}
    </div>

    <div class="filter-group">
      <label for="group-filter">Group:</label>
      <select id="group-filter" bind:value={groupFilter}>
        <option value="all">All Groups</option>
        {#each availableGroups as group}
          <option value={group.name}>{group.name}</option>
        {/each}
      </select>
    </div>

    {#if hasActiveFilters}
      <button class="clear-filters-btn" on:click={clearFilters}>
        Clear Filters
      </button>
    {/if}

    <div class="results-count">
      {filteredPosts.length} of {posts.length} tickets
    </div>
  </div>

  <!-- Tickets Table -->
  {#if error}
    <div class="error-state">
      <div class="error-icon">❌</div>
      <h3>{error}</h3>
    </div>
  {:else if filteredPosts.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📭</div>
      <h3>No tickets found</h3>
      <p>
        {#if hasActiveFilters}
          Try adjusting your filters
        {:else}
          No posts available
        {/if}
      </p>
    </div>
  {:else}
    <div class="table-container">
      <table class="tickets-table">
        <thead>
          <tr>
            <th class="col-status">Status</th>
            <th class="col-title">Title</th>
            <th class="col-author">Author</th>
            <th class="col-assigned">Assigned</th>
            <th class="col-groups">Groups</th>
            <th class="col-updated">Updated</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredPosts as post}
            <tr class:closed={post.closed_at}>
              <td class="col-status">
                <div class="status-badges">
                  {#if post.closed_at}
                    <span class="badge closed" title="Closed on {formatDate(post.closed_at)}">🔒</span>
                  {:else}
                    <span class="badge open">🟢</span>
                  {/if}
                  <span class="badge visibility {post.visibility}" title={post.visibility}>
                    {#if post.visibility === 'public'}🌍
                    {:else if post.visibility === 'private'}🔐
                    {:else}👥
                    {/if}
                  </span>
                </div>
              </td>
              <td class="col-title">
                <button class="title-link" on:click={() => viewPost(post)}>
                  {#if post.category_post_number && post.category}
                    <span class="title-prefix">{post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}</span>
                  {/if}
                  {post.title}
                </button>
              </td>
              <td class="col-author">
                <span class="author-name">{post.author_name}</span>
              </td>
              <td class="col-assigned">
                {#if post.assignee_name}
                  <span class="assignee-badge">👤 {post.assignee_name}</span>
                {:else}
                  <span class="unassigned-badge">—</span>
                {/if}
              </td>
              <td class="col-groups">
                <div class="groups-list">
                  {#if post.visibility === 'public'}
                    <span class="group-badge public">Public</span>
                  {:else if post.visibility === 'private'}
                    <span class="group-badge private">Private</span>
                  {:else}
                    {#each (post.write_groups || []) as group}
                      <span class="group-badge write" title="Write access">{group}</span>
                    {/each}
                    {#each (post.read_groups || []).filter(g => !(post.write_groups || []).includes(g)) as group}
                      <span class="group-badge read" title="Read access">{group}</span>
                    {/each}
                  {/if}
                </div>
              </td>
              <td class="col-updated">
                <span class="date" title={formatDate(post.updated_at)}>
                  {formatShortDate(post.updated_at)}
                </span>
              </td>
              <td class="col-actions">
                <button class="action-btn view" on:click={() => viewPost(post)} title="View">
                  👁️
                </button>
                {#if (post.can_write || data.user?.role === 'admin') && !post.closed_at}
                  <button class="action-btn edit" on:click={() => editPost(post)} title="Edit">
                    ✏️
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .tickets-page {
    min-height: calc(100vh - 120px);
    background: #f9fafb;
  }

  /* Header */
  .page-header {
    background: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 1.5rem 2rem;
  }

  .header-content h1 {
    margin: 0;
    font-size: 1.75rem;
    color: #1f2937;
  }

  .subtitle {
    margin: 0.25rem 0 0;
    color: #6b7280;
    font-size: 0.875rem;
  }

  /* Stats Bar */
  .stats-bar {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 1rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 80px;
  }

  .stat-item:hover {
    background: #e5e7eb;
  }

  .stat-item.active {
    background: #2563eb;
    border-color: #2563eb;
    color: white;
  }

  .stat-item.open.active { background: #10b981; border-color: #10b981; }
  .stat-item.closed.active { background: #ef4444; border-color: #ef4444; }
  .stat-item.assigned.active { background: #8b5cf6; border-color: #8b5cf6; }
  .stat-item.unassigned.active { background: #f59e0b; border-color: #f59e0b; }
  .stat-item.mine.active { background: #06b6d4; border-color: #06b6d4; }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .stat-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    opacity: 0.8;
  }

  /* Filters Bar */
  .filters-bar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 2rem;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    flex-wrap: wrap;
  }

  .search-box {
    display: flex;
    align-items: center;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    flex: 1;
    max-width: 300px;
  }

  .search-icon {
    color: #9ca3af;
    margin-right: 0.5rem;
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 0.875rem;
  }

  .clear-btn {
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    font-size: 1.25rem;
    line-height: 1;
  }

  .clear-btn:hover {
    color: #ef4444;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-group label {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .filter-group select {
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.875rem;
    background: white;
  }

  .clear-filters-btn {
    padding: 0.5rem 1rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    border-radius: 6px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .clear-filters-btn:hover {
    background: #fee2e2;
  }

  .results-count {
    margin-left: auto;
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* States */
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    color: #6b7280;
  }

  .error-icon,
  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  /* Table */
  .table-container {
    padding: 1rem 2rem 2rem;
    overflow-x: auto;
  }

  .tickets-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .tickets-table th {
    text-align: left;
    padding: 0.75rem 1rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
  }

  .tickets-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #f3f4f6;
    font-size: 0.875rem;
    vertical-align: middle;
  }

  .tickets-table tr:hover {
    background: #f9fafb;
  }

  .tickets-table tr.closed {
    opacity: 0.7;
  }

  .col-status { width: 60px; }
  .col-title { min-width: 200px; }
  .col-author { width: 120px; }
  .col-assigned { width: 130px; }
  .col-groups { width: 150px; }
  .col-updated { width: 100px; }
  .col-actions { width: 80px; }

  /* Status badges */
  .status-badges {
    display: flex;
    gap: 0.25rem;
  }

  .badge {
    font-size: 0.875rem;
  }

  /* Title */
  .title-link {
    background: none;
    border: none;
    color: #2563eb;
    text-align: left;
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0;
    transition: color 0.2s;
  }

  .title-link:hover {
    color: #1d4ed8;
    text-decoration: underline;
  }

  .title-prefix {
    color: #6b7280;
    font-size: 0.75rem;
    margin-right: 0.25rem;
  }

  /* Author */
  .author-name {
    color: #374151;
  }

  /* Assignee */
  .assignee-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: #eff6ff;
    color: #2563eb;
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .unassigned-badge {
    color: #9ca3af;
  }

  /* Groups */
  .groups-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .group-badge {
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    font-size: 0.625rem;
    font-weight: 500;
  }

  .group-badge.public {
    background: #d1fae5;
    color: #059669;
  }

  .group-badge.private {
    background: #fee2e2;
    color: #dc2626;
  }

  .group-badge.write {
    background: #dbeafe;
    color: #2563eb;
  }

  .group-badge.read {
    background: #f3f4f6;
    color: #6b7280;
  }

  /* Date */
  .date {
    color: #6b7280;
    font-size: 0.75rem;
  }

  /* Actions */
  .action-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    font-size: 1rem;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .action-btn:hover {
    opacity: 1;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .page-header,
    .filters-bar,
    .table-container {
      padding-left: 1rem;
      padding-right: 1rem;
    }

    .stats-bar {
      overflow-x: auto;
      flex-wrap: nowrap;
      padding-bottom: 0.5rem;
    }

    .stat-item {
      min-width: 70px;
      flex-shrink: 0;
    }

    .col-groups,
    .col-updated {
      display: none;
    }
  }
</style>
