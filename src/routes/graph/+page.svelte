<script>
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';

  export let data;

  let container;
  let network;
  let loading = true;
  let error = null;
  let graphData = { nodes: [], edges: [], stats: {} };

  // Filters
  let minSimilarity = 0.65;
  let selectedCategory = 'all';
  let searchQuery = '';
  let highlightedNodes = new Set();

  // Info panel
  let selectedNode = null;
  let connectedNodes = [];

  // Categories for coloring
  const categoryColors = {
    reports: { background: '#3b82f6', border: '#2563eb' },
    articles: { background: '#10b981', border: '#059669' },
    documentation: { background: '#f59e0b', border: '#d97706' },
    imported: { background: '#8b5cf6', border: '#7c3aed' },
    tutorials: { background: '#ec4899', border: '#db2777' },
    'prompt-template': { background: '#06b6d4', border: '#0891b2' },
    default: { background: '#6b7280', border: '#4b5563' }
  };

  onMount(async () => {
    await loadGraph();
  });

  onDestroy(() => {
    if (network) {
      network.destroy();
      network = null;
    }
  });

  async function loadGraph() {
    if (!browser) return;

    loading = true;
    error = null;

    try {
      const params = new URLSearchParams({
        min_similarity: minSimilarity.toString(),
        limit: '100'
      });

      if (selectedCategory !== 'all') {
        params.set('category', selectedCategory);
      }

      const response = await fetch(`/api/graph?${params}`);
      const result = await response.json();

      if (result.success) {
        graphData = result;
        await renderGraph();
      } else {
        error = result.error;
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function renderGraph() {
    if (!browser || !container || graphData.nodes.length === 0) return;

    // Dynamically import vis-network from CDN
    const vis = await import('https://esm.sh/vis-network@9.1.9/standalone/esm/vis-network.min.js');
    console.log('✅ vis-network loaded');

    // Destroy existing network
    if (network) {
      network.destroy();
    }

    // Transform nodes for vis.js
    const nodes = new vis.DataSet(
      graphData.nodes.map(node => {
        const colors = categoryColors[node.category] || categoryColors.default;
        return {
          id: node.id,
          label: truncate(node.title, 25),
          title: createTooltip(node),
          group: node.category,
          size: Math.min(40, 15 + (node.chunkCount || 0) / 3),
          color: {
            background: colors.background,
            border: colors.border,
            highlight: { background: '#fbbf24', border: '#f59e0b' },
            hover: { background: colors.background, border: '#1f2937' }
          },
          font: {
            size: 11,
            color: '#1f2937',
            face: 'system-ui, sans-serif'
          },
          borderWidth: 2,
          shadow: true,
          // Store original data
          originalData: node
        };
      })
    );

    // Transform edges for vis.js
    const edges = new vis.DataSet(
      graphData.edges.map((edge, i) => ({
        id: i,
        from: edge.source,
        to: edge.target,
        value: (edge.similarity || edge.weight) * 10,
        title: createEdgeTooltip(edge),
        color: {
          color: edge.type === 'semantic' ? '#3b82f6' : '#10b981',
          opacity: 0.6,
          highlight: '#f59e0b',
          hover: '#1f2937'
        },
        smooth: {
          type: 'continuous',
          roundness: 0.5
        }
      }))
    );

    const options = {
      nodes: {
        shape: 'dot',
        scaling: {
          min: 15,
          max: 40
        }
      },
      edges: {
        width: 1,
        selectionWidth: 3
      },
      physics: {
        enabled: true,
        stabilization: {
          enabled: true,
          iterations: 200,
          updateInterval: 25
        },
        barnesHut: {
          gravitationalConstant: -4000,
          centralGravity: 0.3,
          springLength: 120,
          springConstant: 0.04,
          damping: 0.09
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        hideEdgesOnDrag: true,
        multiselect: false
      }
    };

    network = new vis.Network(container, { nodes, edges }, options);

    // Event handlers
    network.on('click', handleClick);
    network.on('doubleClick', handleDoubleClick);
    network.on('stabilizationProgress', (params) => {
      const progress = Math.round((params.iterations / params.total) * 100);
      if (progress % 20 === 0) {
        console.log(`Stabilizing: ${progress}%`);
      }
    });
    network.on('stabilizationIterationsDone', () => {
      console.log('Graph stabilized');
      network.setOptions({ physics: { enabled: false } });
    });
  }

  function handleClick(params) {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      const node = graphData.nodes.find(n => n.id === nodeId);
      selectedNode = node;

      // Find connected nodes
      connectedNodes = graphData.edges
        .filter(e => e.source === nodeId || e.target === nodeId)
        .map(e => {
          const connectedId = e.source === nodeId ? e.target : e.source;
          const connectedNode = graphData.nodes.find(n => n.id === connectedId);
          return {
            ...connectedNode,
            similarity: e.similarity || e.weight,
            connectionType: e.type
          };
        })
        .sort((a, b) => b.similarity - a.similarity);
    } else {
      selectedNode = null;
      connectedNodes = [];
    }
  }

  function handleDoubleClick(params) {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      const node = graphData.nodes.find(n => n.id === nodeId);
      if (node) {
        window.open(`/blog/${node.slug}`, '_blank');
      }
    }
  }

  function createTooltip(node) {
    return `
      <div style="max-width: 250px; padding: 8px;">
        <strong>${node.title}</strong><br/>
        <small style="color: #6b7280;">
          ${node.category} | ${node.chunkCount || 0} chunks<br/>
          ${node.tags?.length ? 'Tags: ' + node.tags.slice(0, 3).join(', ') : ''}
          ${node.sourceType ? '<br/>Source: ' + node.sourceType.toUpperCase() : ''}
        </small>
      </div>
    `;
  }

  function createEdgeTooltip(edge) {
    const percent = ((edge.similarity || edge.weight) * 100).toFixed(0);
    const type = edge.type === 'semantic' ? 'Semantic' : 'Shared tags';
    let tooltip = `${type}: ${percent}% similar`;
    if (edge.sharedTags?.length) {
      tooltip += `\nTags: ${edge.sharedTags.join(', ')}`;
    }
    return tooltip;
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  }

  function handleSearch() {
    if (!network || !searchQuery.trim()) {
      highlightedNodes = new Set();
      return;
    }

    const query = searchQuery.toLowerCase();
    const matches = graphData.nodes.filter(n =>
      n.title.toLowerCase().includes(query) ||
      n.tags?.some(t => t.toLowerCase().includes(query))
    );

    highlightedNodes = new Set(matches.map(n => n.id));

    if (matches.length > 0) {
      network.selectNodes(matches.map(n => n.id));
      if (matches.length === 1) {
        network.focus(matches[0].id, { scale: 1.2, animation: true });
      }
    }
  }

  function resetView() {
    if (network) {
      network.fit({ animation: true });
    }
    selectedNode = null;
    connectedNodes = [];
    searchQuery = '';
    highlightedNodes = new Set();
  }

  function focusNode(nodeId) {
    if (network) {
      network.focus(nodeId, { scale: 1.5, animation: true });
      network.selectNodes([nodeId]);
      handleClick({ nodes: [nodeId] });
    }
  }

  function togglePhysics() {
    if (network) {
      const currentPhysics = network.physics.options.enabled;
      network.setOptions({ physics: { enabled: !currentPhysics } });
    }
  }
</script>

<svelte:head>
  <title>Knowledge Graph</title>
</svelte:head>

<div class="graph-page">
  <header class="graph-header">
    <div class="header-left">
      <h1>Knowledge Graph</h1>
      {#if graphData.stats.nodeCount}
        <span class="stats-badge">
          {graphData.stats.nodeCount} documents | {graphData.stats.edgeCount} connections
        </span>
      {/if}
    </div>

    <div class="header-controls">
      <div class="search-box">
        <input
          type="text"
          placeholder="Search nodes..."
          bind:value={searchQuery}
          on:input={handleSearch}
        />
      </div>

      <div class="filter-group">
        <label>
          Similarity: {(minSimilarity * 100).toFixed(0)}%
          <input
            type="range"
            min="0.4"
            max="0.9"
            step="0.05"
            bind:value={minSimilarity}
            on:change={loadGraph}
          />
        </label>
      </div>

      <select bind:value={selectedCategory} on:change={loadGraph}>
        <option value="all">All Categories</option>
        {#each data.categories as cat}
          <option value={cat.value}>{cat.label}</option>
        {/each}
      </select>

      <button class="btn btn-small" on:click={resetView} title="Reset view">
        Reset
      </button>

      <button class="btn btn-small" on:click={togglePhysics} title="Toggle physics">
        Physics
      </button>
    </div>
  </header>

  <div class="graph-body">
    <div class="graph-container" bind:this={container}>
      {#if loading}
        <div class="loading-overlay">
          <div class="spinner"></div>
          <p>Loading knowledge graph...</p>
        </div>
      {/if}

      {#if error}
        <div class="error-overlay">
          <p>Error: {error}</p>
          <button class="btn" on:click={loadGraph}>Retry</button>
        </div>
      {/if}

      {#if !loading && !error && graphData.nodes.length === 0}
        <div class="empty-overlay">
          <p>No vectorized documents found.</p>
          <p class="hint">Import and vectorize documents to see the knowledge graph.</p>
        </div>
      {/if}
    </div>

    <!-- Info Panel -->
    {#if selectedNode}
      <aside class="info-panel">
        <div class="panel-header">
          <h3>{selectedNode.title}</h3>
          <button class="close-btn" on:click={() => selectedNode = null}>×</button>
        </div>

        <div class="panel-body">
          <div class="node-meta">
            <span class="category-badge" style="background: {categoryColors[selectedNode.category]?.background || '#6b7280'}">
              {selectedNode.category}
            </span>
            <span class="chunk-count">{selectedNode.chunkCount} chunks</span>
            {#if selectedNode.sourceType}
              <span class="source-type">{selectedNode.sourceType.toUpperCase()}</span>
            {/if}
          </div>

          {#if selectedNode.tags?.length > 0}
            <div class="tags-section">
              {#each selectedNode.tags as tag}
                <span class="tag">{tag}</span>
              {/each}
            </div>
          {/if}

          <div class="actions">
            <a href="/blog/{selectedNode.slug}" target="_blank" class="btn btn-primary btn-small">
              Open Document
            </a>
          </div>

          {#if connectedNodes.length > 0}
            <div class="connections-section">
              <h4>Connected Documents ({connectedNodes.length})</h4>
              <ul class="connections-list">
                {#each connectedNodes.slice(0, 10) as conn}
                  <li class="connection-item" on:click={() => focusNode(conn.id)}>
                    <span class="conn-title">{truncate(conn.title, 35)}</span>
                    <span class="conn-similarity" class:semantic={conn.connectionType === 'semantic'} class:tag={conn.connectionType === 'tag'}>
                      {(conn.similarity * 100).toFixed(0)}%
                    </span>
                  </li>
                {/each}
                {#if connectedNodes.length > 10}
                  <li class="more-connections">+{connectedNodes.length - 10} more</li>
                {/if}
              </ul>
            </div>
          {/if}
        </div>
      </aside>
    {/if}

    <!-- Legend -->
    <div class="legend">
      <h4>Legend</h4>
      <div class="legend-section">
        <span class="legend-title">Connection Type:</span>
        <div class="legend-item">
          <span class="edge-line semantic"></span>
          <span>Semantic similarity</span>
        </div>
        <div class="legend-item">
          <span class="edge-line tag"></span>
          <span>Shared tags</span>
        </div>
      </div>
      <div class="legend-section">
        <span class="legend-title">Categories:</span>
        {#each Object.entries(categoryColors).filter(([k]) => k !== 'default') as [cat, colors]}
          <div class="legend-item">
            <span class="dot" style="background: {colors.background}"></span>
            <span>{cat}</span>
          </div>
        {/each}
      </div>
      <div class="legend-section">
        <span class="legend-title">Interactions:</span>
        <div class="legend-hint">Click: Select node</div>
        <div class="legend-hint">Double-click: Open document</div>
        <div class="legend-hint">Scroll: Zoom</div>
        <div class="legend-hint">Drag: Pan / Move node</div>
      </div>
    </div>
  </div>
</div>

<style>
  .graph-page {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f8fafc;
  }

  .graph-header {
    padding: 1rem 1.5rem;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .graph-header h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #1f2937;
  }

  .stats-badge {
    background: #e5e7eb;
    color: #4b5563;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .search-box input {
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    width: 180px;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .filter-group label {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .filter-group input[type="range"] {
    width: 100px;
  }

  select {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-small {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover {
    background: #1d4ed8;
  }

  .graph-body {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .graph-container {
    width: 100%;
    height: 100%;
    background: #f8fafc;
  }

  .loading-overlay,
  .error-overlay,
  .empty-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: #6b7280;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-overlay {
    color: #dc2626;
  }

  .hint {
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  /* Info Panel */
  .info-panel {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 320px;
    max-height: calc(100% - 2rem);
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    padding: 1rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1rem;
    color: #1f2937;
    line-height: 1.4;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #6b7280;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: #1f2937;
  }

  .panel-body {
    padding: 1rem;
    overflow-y: auto;
    flex: 1;
  }

  .node-meta {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .category-badge {
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .chunk-count,
  .source-type {
    background: #e5e7eb;
    color: #4b5563;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .tags-section {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 1rem;
  }

  .tag {
    background: #dbeafe;
    color: #1e40af;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.7rem;
  }

  .actions {
    margin-bottom: 1rem;
  }

  .connections-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    color: #374151;
  }

  .connections-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .connection-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .connection-item:hover {
    background: #f3f4f6;
  }

  .conn-title {
    font-size: 0.8rem;
    color: #1f2937;
  }

  .conn-similarity {
    font-size: 0.7rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-weight: 500;
  }

  .conn-similarity.semantic {
    background: #dbeafe;
    color: #1e40af;
  }

  .conn-similarity.tag {
    background: #d1fae5;
    color: #065f46;
  }

  .more-connections {
    text-align: center;
    color: #6b7280;
    font-size: 0.75rem;
    padding: 0.5rem;
  }

  /* Legend */
  .legend {
    position: absolute;
    bottom: 1rem;
    left: 1rem;
    background: white;
    padding: 1rem;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    font-size: 0.75rem;
    max-width: 180px;
  }

  .legend h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    color: #1f2937;
  }

  .legend-section {
    margin-bottom: 0.75rem;
  }

  .legend-section:last-child {
    margin-bottom: 0;
  }

  .legend-title {
    display: block;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.375rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.25rem 0;
    color: #4b5563;
  }

  .edge-line {
    width: 20px;
    height: 3px;
    border-radius: 2px;
  }

  .edge-line.semantic {
    background: #3b82f6;
  }

  .edge-line.tag {
    background: #10b981;
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .legend-hint {
    color: #6b7280;
    margin: 0.125rem 0;
  }

  @media (max-width: 768px) {
    .graph-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-controls {
      width: 100%;
    }

    .info-panel {
      width: calc(100% - 2rem);
      max-height: 50%;
      bottom: 1rem;
      top: auto;
    }

    .legend {
      display: none;
    }
  }
</style>
