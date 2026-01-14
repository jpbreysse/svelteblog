<script>
  import { goto } from '$app/navigation';

  export let data;

  $: group = data.group;
  $: posts = data.posts || [];
  $: allGroups = data.allGroups || [];
  $: virtualGroups = data.virtualGroups || [];
  $: error = data.error;
  $: userIsMember = data.userIsMember;

  let searchQuery = '';

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
</script>

<svelte:head>
  <title>{group?.name || 'Group'} Posts</title>
</svelte:head>

<div class="group-posts-explorer">
  <!-- Left Sidebar: Groups List -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <h3>Content</h3>
    </div>

    <div class="groups-list">
      <!-- Virtual groups (Public, Private) -->
      {#each virtualGroups as vg}
        <a
          href="/groups/{vg.id}/posts"
          class="group-item"
          class:active={group && group.id === vg.id}
        >
          <span class="group-icon">{vg.icon}</span>
          <span class="group-name">{vg.name}</span>
          <span class="post-count">{vg.post_count}</span>
        </a>
      {/each}

      <!-- Separator -->
      {#if allGroups.length > 0}
        <div class="sidebar-divider">
          <span>My Groups</span>
        </div>
      {/if}

      <!-- Real groups -->
      {#each allGroups as g}
        <a
          href="/groups/{g.id}/posts"
          class="group-item"
          class:active={group && group.id === g.id}
        >
          <span class="group-icon">{g.icon}</span>
          <span class="group-name">{g.name}</span>
          <span class="post-count">{g.post_count}</span>
        </a>
      {/each}

      {#if virtualGroups.length === 0 && allGroups.length === 0}
        <div class="empty-groups">No groups available</div>
      {/if}
    </div>
  </aside>

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
</div>

<style>
  .group-posts-explorer {
    display: grid;
    grid-template-columns: 280px 1fr;
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

  .group-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    text-decoration: none;
    color: #374151;
    transition: all 0.2s;
    margin-bottom: 0.25rem;
  }

  .group-item:hover {
    background: #f3f4f6;
  }

  .group-item.active {
    background: #eff6ff;
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
  }

  .post-count {
    background: #e5e7eb;
    color: #6b7280;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .group-item.active .post-count {
    background: #dbeafe;
    color: #2563eb;
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
    display: flex;
    flex-direction: column;
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

  .btn-action.edit {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #2563eb;
  }

  .btn-action.edit:hover {
    background: #dbeafe;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .group-posts-explorer {
      grid-template-columns: 1fr;
    }

    .sidebar {
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
