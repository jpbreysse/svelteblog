<script>
  import { invalidateAll } from '$app/navigation';

  export let data;

  let filter = 'all'; // 'all', 'vectorized', 'not-vectorized', 'enriched', 'not-enriched', 'partial-enriched'
  let loading = {};
  let expandedPost = null;
  let chunks = [];
  let loadingChunks = false;
  let enriching = false;
  let enrichingPost = null;
  let enrichmentProgress = '';

  $: filteredPosts = data.posts.filter(post => {
    if (filter === 'vectorized') return post.vectorized_at;
    if (filter === 'not-vectorized') return !post.vectorized_at;
    if (filter === 'enriched') return post.enrichment_total > 0 && post.enrichment_reviewed === post.enrichment_total;
    if (filter === 'not-enriched') return post.enrichment_total > 0 && post.enrichment_reviewed === 0;
    if (filter === 'partial-enriched') return post.enrichment_total > 0 && post.enrichment_reviewed > 0 && post.enrichment_reviewed < post.enrichment_total;
    if (filter === 'needs-enrichment') return post.enrichment_total > 0 && post.enrichment_reviewed < post.enrichment_total;
    return true;
  });

  async function vectorizePost(postId) {
    loading[postId] = true;
    try {
      const response = await fetch(`/api/posts/${postId}/vectorize`, {
        method: 'POST'
      });
      const result = await response.json();
      if (result.success) {
        await invalidateAll();
      } else {
        alert('Error: ' + result.error);
      }
    } catch (error) {
      alert('Failed to vectorize: ' + error.message);
    } finally {
      loading[postId] = false;
    }
  }

  async function removeVectorization(postId) {
    if (!confirm('Remove vectorization for this post? This will delete all chunks.')) {
      return;
    }
    loading[postId] = true;
    try {
      const response = await fetch(`/api/posts/${postId}/vectorize`, {
        method: 'DELETE'
      });
      const result = await response.json();
      if (result.success) {
        await invalidateAll();
        if (expandedPost === postId) {
          expandedPost = null;
          chunks = [];
        }
      } else {
        alert('Error: ' + result.error);
      }
    } catch (error) {
      alert('Failed to remove: ' + error.message);
    } finally {
      loading[postId] = false;
    }
  }

  async function toggleChunks(postId) {
    if (expandedPost === postId) {
      expandedPost = null;
      chunks = [];
      return;
    }

    loadingChunks = true;
    expandedPost = postId;

    try {
      const response = await fetch(`/api/posts/${postId}/chunks`);
      const result = await response.json();
      if (result.success) {
        chunks = result.chunks;
      } else {
        chunks = [];
        alert('Error loading chunks: ' + result.error);
      }
    } catch (error) {
      chunks = [];
      alert('Failed to load chunks: ' + error.message);
    } finally {
      loadingChunks = false;
    }
  }

  async function vectorizeAll() {
    if (!confirm('Vectorize all non-vectorized posts? This may take a while.')) {
      return;
    }

    try {
      const response = await fetch('/api/posts/vectorize-all', {
        method: 'POST'
      });
      const result = await response.json();
      if (result.success) {
        alert(`Vectorized ${result.vectorized} posts. ${result.skipped} skipped, ${result.failed} failed.`);
        await invalidateAll();
      } else {
        alert('Error: ' + result.error);
      }
    } catch (error) {
      alert('Failed: ' + error.message);
    }
  }

  async function enrichChunks(limit = 20) {
    enriching = true;
    enrichmentProgress = 'Starting enrichment...';

    try {
      const response = await fetch(`/api/chunks/review?limit=${limit}`, {
        method: 'POST'
      });
      const result = await response.json();

      if (result.success) {
        if (result.processed === 0) {
          enrichmentProgress = 'No unreviewed chunks to process.';
        } else {
          enrichmentProgress = `Enriched ${result.processed} chunks. ${result.lowQuality} low quality, ${result.redundant} redundant.`;
        }
        await invalidateAll();
      } else {
        enrichmentProgress = 'Error: ' + result.error;
      }
    } catch (error) {
      enrichmentProgress = 'Failed: ' + error.message;
    } finally {
      enriching = false;
    }
  }

  async function enrichPost(postId, postTitle) {
    enrichingPost = postId;

    try {
      // Get total unreviewed chunks for this post to process all of them
      const post = data.posts.find(p => p.id === postId);
      const unreviewedCount = (post?.enrichment_total || 0) - (post?.enrichment_reviewed || 0);
      const limit = Math.max(unreviewedCount, 50); // Process all unreviewed or max 50

      const response = await fetch(`/api/chunks/review?limit=${limit}&post_id=${postId}`, {
        method: 'POST'
      });
      const result = await response.json();

      if (result.success) {
        if (result.processed === 0) {
          alert(`No unreviewed chunks for "${postTitle}"`);
        } else {
          alert(`Enriched ${result.processed} chunks for "${postTitle}". ${result.lowQuality} low quality, ${result.redundant} redundant.`);
        }
        await invalidateAll();
      } else {
        alert('Error: ' + result.error);
      }
    } catch (error) {
      alert('Failed: ' + error.message);
    } finally {
      enrichingPost = null;
    }
  }

  function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleString();
  }

  function formatBytes(bytes) {
    if (!bytes) return '0';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }
</script>

<svelte:head>
  <title>Vectorization Management - Admin</title>
</svelte:head>

<div class="admin-container">
  <div class="header">
    <h1>Vectorization Management</h1>
    <a href="/admin" class="back-link">Back to Admin</a>
  </div>

  <!-- Stats Cards -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value">{data.stats.total_posts}</div>
      <div class="stat-label">Total Posts</div>
    </div>
    <div class="stat-card vectorized">
      <div class="stat-value">{data.stats.vectorized_posts}</div>
      <div class="stat-label">Vectorized</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">{data.stats.total_chunks || 0}</div>
      <div class="stat-label">Total Chunks</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">{data.stats.published_posts}</div>
      <div class="stat-label">Published</div>
    </div>
  </div>

  <!-- Chunks by Source Type -->
  {#if data.chunkStats.length > 0}
    <div class="source-stats">
      <h3>Chunks by Source Type</h3>
      <div class="source-badges">
        {#each data.chunkStats as stat}
          <div class="source-badge">
            <span class="source-type">{stat.source_type || 'post'}</span>
            <span class="source-count">{stat.post_count} posts / {stat.chunk_count} chunks</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Enrichment Stats -->
  {#if data.enrichmentStats}
    <div class="enrichment-section">
      <div class="enrichment-header">
        <h3>Chunk Enrichment (Mistral)</h3>
        <div class="enrichment-actions">
          <button
            class="btn btn-primary"
            on:click={() => enrichChunks(20)}
            disabled={enriching}
          >
            {#if enriching}
              Enriching...
            {:else}
              Enrich 20 Chunks
            {/if}
          </button>
          <button
            class="btn btn-secondary"
            on:click={() => enrichChunks(100)}
            disabled={enriching}
          >
            Enrich 100
          </button>
        </div>
      </div>

      {#if enrichmentProgress}
        <div class="enrichment-progress" class:error={enrichmentProgress.includes('Error') || enrichmentProgress.includes('Failed')}>
          {enrichmentProgress}
        </div>
      {/if}

      <div class="enrichment-stats">
        <div class="enrich-stat">
          <span class="enrich-value">{data.enrichmentStats.reviewed_chunks || 0}</span>
          <span class="enrich-label">Reviewed</span>
        </div>
        <div class="enrich-stat pending">
          <span class="enrich-value">{(data.enrichmentStats.total_chunks || 0) - (data.enrichmentStats.reviewed_chunks || 0)}</span>
          <span class="enrich-label">Pending</span>
        </div>
        <div class="enrich-stat warning">
          <span class="enrich-value">{data.enrichmentStats.low_quality || 0}</span>
          <span class="enrich-label">Low Quality</span>
        </div>
        <div class="enrich-stat">
          <span class="enrich-value">{data.enrichmentStats.redundant || 0}</span>
          <span class="enrich-label">Redundant</span>
        </div>
        <div class="enrich-stat">
          <span class="enrich-value">{data.enrichmentStats.technicaldoc_count || 0}</span>
          <span class="enrich-label">Technical</span>
        </div>
        <div class="enrich-stat">
          <span class="enrich-value">{data.enrichmentStats.meetingsummary_count || 0}</span>
          <span class="enrich-label">Meeting</span>
        </div>
      </div>
    </div>
  {/if}

  <!-- Controls -->
  <div class="controls">
    <div class="filter-group">
      <label for="filter">Filter:</label>
      <select id="filter" bind:value={filter}>
        <option value="all">All Posts ({data.posts.length})</option>
        <option value="vectorized">Vectorized ({data.posts.filter(p => p.vectorized_at).length})</option>
        <option value="not-vectorized">Not Vectorized ({data.posts.filter(p => !p.vectorized_at).length})</option>
        <option value="needs-enrichment">Needs Enrichment ({data.posts.filter(p => p.enrichment_total > 0 && p.enrichment_reviewed < p.enrichment_total).length})</option>
        <option value="enriched">Fully Enriched ({data.posts.filter(p => p.enrichment_total > 0 && p.enrichment_reviewed === p.enrichment_total).length})</option>
        <option value="not-enriched">Not Enriched ({data.posts.filter(p => p.enrichment_total > 0 && p.enrichment_reviewed === 0).length})</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={vectorizeAll}>
      Vectorize All Non-Vectorized
    </button>
  </div>

  <!-- Posts Table -->
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Category</th>
          <th>Source</th>
          <th>Content</th>
          <th>Chunks</th>
          <th>Enrichment</th>
          <th>Vectorized</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each filteredPosts as post}
          <tr class:vectorized={post.vectorized_at} class:unpublished={!post.published}>
            <td class="title-cell">
              <a href="/blog/{post.slug}" target="_blank">{post.title}</a>
              {#if !post.published}
                <span class="badge draft">Draft</span>
              {/if}
              {#if post.visibility !== 'public'}
                <span class="badge visibility">{post.visibility}</span>
              {/if}
            </td>
            <td>{post.category}</td>
            <td>
              {#if post.source_type}
                <span class="source-type-badge">{post.source_type}</span>
              {:else}
                <span class="source-type-badge">post</span>
              {/if}
            </td>
            <td>{formatBytes(post.content_length)}</td>
            <td>
              {#if post.chunk_count}
                <button
                  class="chunk-count"
                  on:click={() => toggleChunks(post.id)}
                  class:expanded={expandedPost === post.id}
                >
                  {post.chunk_count} chunks
                </button>
              {:else}
                -
              {/if}
            </td>
            <td class="enrichment-cell">
              {#if post.enrichment_total > 0}
                <div class="enrichment-info">
                  <div class="enrichment-bar">
                    <div
                      class="enrichment-fill"
                      class:complete={post.enrichment_reviewed === post.enrichment_total}
                      class:partial={post.enrichment_reviewed > 0 && post.enrichment_reviewed < post.enrichment_total}
                      style="width: {(post.enrichment_reviewed / post.enrichment_total) * 100}%"
                    ></div>
                  </div>
                  <span class="enrichment-text">
                    {post.enrichment_reviewed}/{post.enrichment_total}
                  </span>
                  {#if post.enrichment_avg_quality}
                    <span
                      class="quality-indicator"
                      class:good={post.enrichment_avg_quality >= 0.7}
                      class:medium={post.enrichment_avg_quality >= 0.5 && post.enrichment_avg_quality < 0.7}
                      class:poor={post.enrichment_avg_quality < 0.5}
                      title="Avg quality: {(post.enrichment_avg_quality * 100).toFixed(0)}%"
                    >
                      {(post.enrichment_avg_quality * 100).toFixed(0)}%
                    </span>
                  {/if}
                  {#if post.enrichment_low_quality > 0}
                    <span class="low-quality-count" title="Low quality chunks">
                      {post.enrichment_low_quality} low
                    </span>
                  {/if}
                  {#if post.enrichment_reviewed < post.enrichment_total}
                    <button
                      class="btn-enrich"
                      on:click={() => enrichPost(post.id, post.title)}
                      disabled={enrichingPost === post.id}
                      title="Enrich {post.enrichment_total - post.enrichment_reviewed} unreviewed chunks"
                    >
                      {#if enrichingPost === post.id}
                        ...
                      {:else}
                        Enrich
                      {/if}
                    </button>
                  {/if}
                </div>
              {:else}
                <span class="no-enrichment">-</span>
              {/if}
            </td>
            <td>
              {#if post.vectorized_at}
                <span class="status vectorized" title={formatDate(post.vectorized_at)}>Yes</span>
              {:else}
                <span class="status not-vectorized">No</span>
              {/if}
            </td>
            <td class="actions">
              {#if loading[post.id]}
                <span class="loading">...</span>
              {:else if post.vectorized_at}
                <button class="btn btn-small btn-warning" on:click={() => vectorizePost(post.id)}>
                  Re-vectorize
                </button>
                <button class="btn btn-small btn-danger" on:click={() => removeVectorization(post.id)}>
                  Remove
                </button>
              {:else}
                <button class="btn btn-small btn-success" on:click={() => vectorizePost(post.id)}>
                  Vectorize
                </button>
              {/if}
            </td>
          </tr>
          {#if expandedPost === post.id}
            <tr class="chunks-row">
              <td colspan="8">
                <div class="chunks-panel">
                  <h4>Chunks for "{post.title}"</h4>
                  {#if loadingChunks}
                    <p>Loading chunks...</p>
                  {:else if chunks.length === 0}
                    <p>No chunks found</p>
                  {:else}
                    <div class="chunks-list">
                      {#each chunks as chunk, i}
                        <div class="chunk-item" class:low-quality={chunk.quality_score && chunk.quality_score < 0.5}>
                          <div class="chunk-header">
                            <span class="chunk-index">#{chunk.chunk_index + 1}</span>
                            <span class="chunk-length">{chunk.chunk_text.length} chars</span>
                            {#if chunk.quality_score !== null}
                              <span class="quality-badge" class:good={chunk.quality_score >= 0.7} class:medium={chunk.quality_score >= 0.5 && chunk.quality_score < 0.7} class:poor={chunk.quality_score < 0.5}>
                                Q: {(chunk.quality_score * 100).toFixed(0)}%
                              </span>
                            {/if}
                            {#if chunk.doc_type}
                              <span class="doc-type-badge">{chunk.doc_type}</span>
                            {/if}
                            {#if chunk.redundant_of}
                              <span class="redundant-badge">Redundant</span>
                            {/if}
                          </div>
                          {#if chunk.summary}
                            <div class="chunk-summary-text">{chunk.summary}</div>
                          {/if}
                          {#if chunk.auto_tags && chunk.auto_tags.length > 0}
                            <div class="chunk-tags">
                              {#each chunk.auto_tags as tag}
                                <span class="tag">{tag}</span>
                              {/each}
                            </div>
                          {/if}
                          <div class="chunk-text">{chunk.chunk_text.substring(0, 300)}{chunk.chunk_text.length > 300 ? '...' : ''}</div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .admin-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0;
    color: #1f2937;
  }

  .back-link {
    color: #2563eb;
    text-decoration: none;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .stat-card.vectorized {
    background: #d1fae5;
    border: 1px solid #10b981;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: #1f2937;
  }

  .stat-label {
    font-size: 0.875rem;
    color: #6b7280;
    margin-top: 0.25rem;
  }

  /* Source Stats */
  .source-stats {
    background: white;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 2rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .source-stats h3 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: #374151;
  }

  .source-badges {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .source-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: #f3f4f6;
    border-radius: 6px;
  }

  .source-type {
    font-weight: 600;
    color: #1f2937;
    text-transform: uppercase;
    font-size: 0.75rem;
  }

  .source-count {
    color: #6b7280;
    font-size: 0.875rem;
  }

  /* Controls */
  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding: 1rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-group label {
    font-weight: 500;
    color: #374151;
  }

  .filter-group select {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  /* Table */
  .table-container {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    background: #f9fafb;
    padding: 0.75rem 1rem;
    text-align: left;
    font-weight: 600;
    color: #374151;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
  }

  td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: middle;
  }

  tr:hover {
    background: #f9fafb;
  }

  tr.vectorized {
    background: #f0fdf4;
  }

  tr.vectorized:hover {
    background: #dcfce7;
  }

  tr.unpublished {
    opacity: 0.7;
  }

  .title-cell {
    max-width: 300px;
  }

  .title-cell a {
    color: #1f2937;
    text-decoration: none;
    font-weight: 500;
  }

  .title-cell a:hover {
    color: #2563eb;
    text-decoration: underline;
  }

  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.7rem;
    font-weight: 500;
    margin-left: 0.5rem;
  }

  .badge.draft {
    background: #fef3c7;
    color: #92400e;
  }

  .badge.visibility {
    background: #e0e7ff;
    color: #3730a3;
  }

  .source-type-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: #e5e7eb;
    border-radius: 4px;
    font-size: 0.75rem;
    text-transform: uppercase;
    font-weight: 500;
  }

  .chunk-count {
    background: #dbeafe;
    color: #1d4ed8;
    border: none;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .chunk-count:hover {
    background: #bfdbfe;
  }

  .chunk-count.expanded {
    background: #1d4ed8;
    color: white;
  }

  .status {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status.vectorized {
    background: #d1fae5;
    color: #065f46;
  }

  .status.not-vectorized {
    background: #fee2e2;
    color: #991b1b;
  }

  .actions {
    white-space: nowrap;
  }

  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-small {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover {
    background: #1d4ed8;
  }

  .btn-success {
    background: #10b981;
    color: white;
  }

  .btn-success:hover {
    background: #059669;
  }

  .btn-warning {
    background: #f59e0b;
    color: white;
  }

  .btn-warning:hover {
    background: #d97706;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }

  .btn-danger:hover {
    background: #dc2626;
  }

  .loading {
    color: #6b7280;
  }

  /* Chunks Panel */
  .chunks-row {
    background: #f8fafc !important;
  }

  .chunks-row:hover {
    background: #f8fafc !important;
  }

  .chunks-panel {
    padding: 1rem;
  }

  .chunks-panel h4 {
    margin: 0 0 1rem 0;
    color: #374151;
  }

  .chunks-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .chunk-item {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 0.75rem;
  }

  .chunk-header {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
  }

  .chunk-index {
    font-weight: 600;
    color: #2563eb;
  }

  .chunk-length {
    color: #6b7280;
  }

  .chunk-summary {
    background: #d1fae5;
    color: #065f46;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
  }

  .chunk-text {
    font-size: 0.875rem;
    color: #4b5563;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Enrichment Section */
  .enrichment-section {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .enrichment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .enrichment-header h3 {
    margin: 0;
    color: #374151;
  }

  .enrichment-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-secondary {
    background: #6b7280;
    color: white;
  }

  .btn-secondary:hover {
    background: #4b5563;
  }

  .enrichment-progress {
    padding: 0.75rem 1rem;
    background: #d1fae5;
    border-radius: 6px;
    margin-bottom: 1rem;
    color: #065f46;
  }

  .enrichment-progress.error {
    background: #fee2e2;
    color: #991b1b;
  }

  .enrichment-stats {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .enrich-stat {
    text-align: center;
    padding: 0.75rem 1rem;
    background: #f3f4f6;
    border-radius: 6px;
    min-width: 80px;
  }

  .enrich-stat.pending {
    background: #fef3c7;
  }

  .enrich-stat.warning {
    background: #fee2e2;
  }

  .enrich-value {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
    color: #1f2937;
  }

  .enrich-label {
    font-size: 0.75rem;
    color: #6b7280;
  }

  /* Quality badges */
  .quality-badge {
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .quality-badge.good {
    background: #d1fae5;
    color: #065f46;
  }

  .quality-badge.medium {
    background: #fef3c7;
    color: #92400e;
  }

  .quality-badge.poor {
    background: #fee2e2;
    color: #991b1b;
  }

  .doc-type-badge {
    padding: 0.125rem 0.375rem;
    background: #e0e7ff;
    color: #3730a3;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .redundant-badge {
    padding: 0.125rem 0.375rem;
    background: #fecaca;
    color: #991b1b;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .chunk-item.low-quality {
    border-color: #fca5a5;
    background: #fef2f2;
  }

  .chunk-summary-text {
    font-size: 0.8rem;
    color: #059669;
    font-style: italic;
    margin-bottom: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: #ecfdf5;
    border-radius: 4px;
  }

  .chunk-tags {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .tag {
    padding: 0.125rem 0.5rem;
    background: #dbeafe;
    color: #1e40af;
    border-radius: 9999px;
    font-size: 0.7rem;
  }

  /* Enrichment Column */
  .enrichment-cell {
    min-width: 120px;
  }

  .enrichment-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .enrichment-bar {
    width: 50px;
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
    overflow: hidden;
  }

  .enrichment-fill {
    height: 100%;
    background: #9ca3af;
    transition: width 0.3s;
  }

  .enrichment-fill.complete {
    background: #10b981;
  }

  .enrichment-fill.partial {
    background: #f59e0b;
  }

  .enrichment-text {
    font-size: 0.75rem;
    color: #6b7280;
    font-variant-numeric: tabular-nums;
  }

  .quality-indicator {
    font-size: 0.7rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .quality-indicator.good {
    background: #d1fae5;
    color: #065f46;
  }

  .quality-indicator.medium {
    background: #fef3c7;
    color: #92400e;
  }

  .quality-indicator.poor {
    background: #fee2e2;
    color: #991b1b;
  }

  .low-quality-count {
    font-size: 0.65rem;
    color: #dc2626;
    background: #fee2e2;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
  }

  .no-enrichment {
    color: #9ca3af;
  }

  .btn-enrich {
    padding: 0.2rem 0.5rem;
    font-size: 0.7rem;
    background: #8b5cf6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.2s;
  }

  .btn-enrich:hover:not(:disabled) {
    background: #7c3aed;
  }

  .btn-enrich:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
