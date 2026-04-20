<script>
    import { onMount } from 'svelte';
    import PathTree from '$lib/components/PathTree.svelte';
    import PathBreadcrumb from '$lib/components/PathBreadcrumb.svelte';
    import PathPicker from '$lib/components/PathPicker.svelte';
    
    let treeData = [];
    let selectedPath = null;
    let selectedPathDetails = null;
    
    onMount(async () => {
      const response = await fetch('/api/paths/tree');
      const data = await response.json();
      if (data.success) {
        treeData = data.tree;
      }
    });
    
    async function handlePathSelect(event) {
      const path = event.detail;
      console.log('Selected path:', path);
      
      // Load full path details
      const response = await fetch(`/api/paths/${path.id}`);
      const data = await response.json();
      if (data.success) {
        selectedPathDetails = data.path;
      }
    }
    
    function handlePickerChange(event) {
      console.log('Picker selected path ID:', event.detail);
    }
  </script>
  
  <div class="container">
    <h1>Path Components Test</h1>
    
    <div class="section">
      <h2>1. Path Tree Component</h2>
      <div class="tree-container">
        <PathTree 
          paths={treeData} 
          on:select={handlePathSelect}
          showCounts={true}
          collapsible={true}
        />
      </div>
    </div>
    
    {#if selectedPathDetails}
      <div class="section">
        <h2>2. Breadcrumb Component</h2>
        <PathBreadcrumb breadcrumbs={selectedPathDetails.breadcrumbs} />
        
        <div class="path-details">
          <h3>{selectedPathDetails.icon} {selectedPathDetails.name}</h3>
          <p>{selectedPathDetails.description || 'No description'}</p>
          <p><strong>Full Path:</strong> {selectedPathDetails.full_path}</p>
          <p><strong>Children:</strong> {selectedPathDetails.child_count}</p>
          <p><strong>Posts:</strong> {selectedPathDetails.post_count}</p>
        </div>
      </div>
    {/if}
    
    <div class="section">
      <h2>3. Path Picker Component</h2>
      <PathPicker on:change={handlePickerChange} />
    </div>
  </div>
  
  <style>
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    h1 {
      font-size: 2rem;
      margin-bottom: 2rem;
    }
    
    .section {
      margin-bottom: 3rem;
    }
    
    h2 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: #374151;
    }
    
    .tree-container {
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1rem;
      background-color: #f9fafb;
    }
    
    .path-details {
      margin-top: 1rem;
      padding: 1rem;
      background-color: #f3f4f6;
      border-radius: 0.5rem;
    }
    
    .path-details h3 {
      margin-top: 0;
    }
  </style>