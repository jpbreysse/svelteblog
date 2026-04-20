<script>
    import { createEventDispatcher } from 'svelte';
    
    export let paths = [];
    export let selectedPath = null;
    export let showCounts = true;
    export let collapsible = true;
    export let initiallyExpanded = true;
    export let depth = 0;
    export let expandedPaths = new Set(); // Shared state passed from parent
    
    const dispatch = createEventDispatcher();
    
    // Recursively add all descendant IDs to expandedPaths
    function addAllDescendants(node) {
      if (node.children && node.children.length > 0) {
        expandedPaths.add(node.id);
        console.log('Auto-expanding path:', node.name, node.id, 'depth:', depth);
        node.children.forEach(child => addAllDescendants(child));
      }
    }
    
    // Initialize expanded paths - only at root level (depth 0)
    $: {
      if (depth === 0 && initiallyExpanded && paths && paths.length > 0) {
        paths.forEach(path => addAllDescendants(path));
        expandedPaths = expandedPaths; // Trigger reactivity
      }
    }
    
    function toggleExpand(pathId) {
      if (expandedPaths.has(pathId)) {
        expandedPaths.delete(pathId);
      } else {
        expandedPaths.add(pathId);
      }
      expandedPaths = expandedPaths; // Trigger reactivity
    }
    
    function selectPath(path) {
      selectedPath = path.id;
      dispatch('select', path);
    }
    
    function getIndentStyle(depth) {
      const padding = `padding-left: ${depth * 1.5}rem !important`;
      console.log(`Depth ${depth}: ${padding}`);
      return padding;
    }
  </script>
  
  <div class="path-tree">
    {#each paths as path}
      <div class="path-item" data-level={path.level}>
        <button
          class="path-button"
          class:selected={selectedPath === path.id}
          class:has-children={path.child_count > 0}
          style={getIndentStyle(depth)}
          data-depth={depth}
          data-name={path.name}
          on:click={() => selectPath(path)}
        >
          {#if collapsible && path.child_count > 0}
            <span 
              class="expand-icon"
              on:click|stopPropagation={() => toggleExpand(path.id)}
            >
              {expandedPaths.has(path.id) ? '▼' : '▶'}
            </span>
          {/if}
          
          <span class="path-icon">{path.icon || '📁'}</span>
          
          <span class="path-name">{path.name}</span>
          
          {#if showCounts && path.post_count > 0}
            <span class="post-count">{path.post_count}</span>
          {/if}
          
          {#if showCounts && path.child_count > 0}
            <span class="child-count">({path.child_count})</span>
          {/if}
        </button>
        
        {#if path.children && path.children.length > 0 && (!collapsible || expandedPaths.has(path.id))}
          <svelte:self 
            paths={path.children} 
            {selectedPath}
            {showCounts}
            {collapsible}
            {expandedPaths}
            initiallyExpanded={true}
            depth={depth + 1}
            on:select
          />
        {/if}
      </div>
    {/each}
  </div>
  
  <style>
    .path-tree {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      user-select: none;
    }
    
    .path-item {
      position: relative;
    }
    
    .path-button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: none;
      background: transparent;
      text-align: left;
      cursor: pointer;
      border-radius: 0.375rem;
      transition: background-color 0.15s ease;
      font-size: 0.9rem;
      min-height: 2rem;
    }
    
    .path-button:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }
    
    .path-button.selected {
      background-color: rgba(99, 102, 241, 0.1);
      color: #4f46e5;
      font-weight: 500;
    }
    
    .expand-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1rem;
      height: 1rem;
      font-size: 0.7rem;
      color: #6b7280;
      transition: transform 0.15s ease;
    }
    
    .expand-icon:hover {
      color: #374151;
    }
    
    .path-icon {
      font-size: 1.1rem;
      line-height: 1;
    }
    
    .path-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 60px;
      margin-right: 0.5rem;
    }
    
    .post-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.5rem;
      padding: 0.125rem 0.375rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: white;
      background-color: #3b82f6;
      border-radius: 9999px;
      flex-shrink: 0;
    }
    
    .child-count {
      font-size: 0.75rem;
      color: #9ca3af;
      font-weight: normal;
      flex-shrink: 0;
      white-space: nowrap;
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .path-button:hover {
        background-color: rgba(255, 255, 255, 0.05);
      }
      
      .path-button.selected {
        background-color: rgba(99, 102, 241, 0.2);
        color: #818cf8;
      }
    }
  </style>