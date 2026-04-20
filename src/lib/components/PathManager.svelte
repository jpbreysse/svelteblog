<script>
    import { onMount } from 'svelte';
    import PathTree from './PathTree.svelte';
    
    let treeData = [];
    let selectedPath = null;
    let selectedPathDetails = null;
    let isCreating = false;
    let isEditing = false;
    let loading = false;
    let error = null;
    let success = null;
    
    // Form data
    let formData = {
      name: '',
      description: '',
      parent_id: null,
      icon: '📁',
      color: '#6366f1',
      position: 0
    };
    
    onMount(() => {
      loadTree();
    });
    
    async function loadTree() {
      try {
        const response = await fetch('/api/paths/tree');
        const data = await response.json();
        if (data.success) {
          treeData = data.tree;
        }
      } catch (err) {
        console.error('Error loading tree:', err);
      }
    }
    
    async function handlePathSelect(event) {
      const path = event.detail;
      selectedPath = path.id;
      
      // Load full details
      try {
        const response = await fetch(`/api/paths/${path.id}`);
        const data = await response.json();
        if (data.success) {
          selectedPathDetails = data.path;
        }
      } catch (err) {
        console.error('Error loading path details:', err);
      }
    }
    
    function startCreate(parentPath = null) {
      isCreating = true;
      isEditing = false;
      error = null;
      success = null;
      formData = {
        name: '',
        description: '',
        parent_id: parentPath?.id || null,
        icon: '📁',
        color: '#6366f1',
        position: 0
      };
    }
    
    function startEdit() {
      if (!selectedPathDetails) return;
      
      isEditing = true;
      isCreating = false;
      error = null;
      success = null;
      formData = {
        name: selectedPathDetails.name,
        description: selectedPathDetails.description || '',
        parent_id: selectedPathDetails.parent_id,
        icon: selectedPathDetails.icon || '📁',
        color: selectedPathDetails.color || '#6366f1',
        position: selectedPathDetails.position || 0
      };
    }
    
    function cancelForm() {
      isCreating = false;
      isEditing = false;
      error = null;
      success = null;
    }
    
    // Helper function to generate slug from name
    function generateSlug(name) {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, '')      // Remove leading/trailing hyphens
        .substring(0, 50);             // Limit to 50 chars
    }
    
    async function handleSubmit() {
      loading = true;
      error = null;
      success = null;
      
      try {
        // Generate slug from name if creating new path
        const submitData = {
          ...formData,
          slug: generateSlug(formData.name)
        };

        const url = isEditing 
          ? `/api/paths/${selectedPath}`
          : '/api/paths';
        
        const method = isEditing ? 'PUT' : 'POST';
        
        console.log('📤 Submitting path data:', submitData);

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submitData)
        });
        
        const data = await response.json();
        
        if (data.success) {
          success = data.message;
          cancelForm();
          await loadTree();
          
          // Select the newly created/updated path
          if (data.path) {
            selectedPath = data.path.id;
            selectedPathDetails = data.path;
          }
        } else {
          error = data.error;
        }
      } catch (err) {
        error = err.message;
      } finally {
        loading = false;
      }
    }
    
    async function handleDelete() {
      if (!selectedPath) return;
      
      const confirmed = confirm(
        `Are you sure you want to delete "${selectedPathDetails.name}"?\n\n` +
        `This will also delete ${selectedPathDetails.child_count} child paths ` +
        `and unlink ${selectedPathDetails.post_count} posts.`
      );
      
      if (!confirmed) return;
      
      loading = true;
      error = null;
      success = null;
      
      try {
        const response = await fetch(
          `/api/paths/${selectedPath}?cascade=true`,
          { method: 'DELETE' }
        );
        
        const data = await response.json();
        
        if (data.success) {
          success = data.message;
          selectedPath = null;
          selectedPathDetails = null;
          await loadTree();
        } else {
          error = data.error;
        }
      } catch (err) {
        error = err.message;
      } finally {
        loading = false;
      }
    }
    
    // Common icon options
    const iconOptions = [
      '📁', '📂', '📝', '💻', '🚀', '📚', '🎨', '⚙️', '🐍', 
      '🎸', '📊', '🔧', '🎯', '💡', '🌟', '🔥', '⭐', '🎉'
    ];
  </script>
  
  <div class="path-manager">
    <div class="layout">
      <!-- Left Sidebar: Tree -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h2>Folder Structure</h2>
          <button class="btn btn-primary btn-sm" on:click={() => startCreate()}>
            + New Root Folder
          </button>
        </div>
        
        <div class="tree-container">
          <PathTree 
            paths={treeData}
            selectedPath={selectedPath}
            on:select={handlePathSelect}
            showCounts={true}
            collapsible={true}
          />
        </div>
      </aside>
      
      <!-- Right Panel: Details/Form -->
      <main class="main-content">
        {#if error}
          <div class="alert alert-error">
            ❌ {error}
          </div>
        {/if}
        
        {#if success}
          <div class="alert alert-success">
            ✅ {success}
          </div>
        {/if}
        
        {#if isCreating || isEditing}
          <!-- Create/Edit Form -->
          <div class="form-container">
            <h3>{isEditing ? 'Edit Folder' : 'Create New Folder'}</h3>
            
            <form on:submit|preventDefault={handleSubmit}>
              <div class="form-group">
                <label for="name">Folder Name *</label>
                <input
                  id="name"
                  type="text"
                  bind:value={formData.name}
                  placeholder="e.g., Backend Development"
                  required
                />
              </div>
              
              <div class="form-group">
                <label for="description">Description</label>
                <textarea
                  id="description"
                  bind:value={formData.description}
                  placeholder="Optional description"
                  rows="3"
                />
              </div>
              
              <div class="form-row">
                <div class="form-group">
                  <label for="icon">Icon</label>
                  <div class="icon-picker">
                    <input
                      id="icon"
                      type="text"
                      bind:value={formData.icon}
                      maxlength="2"
                    />
                    <div class="icon-options">
                      {#each iconOptions as icon}
                        <button
                          type="button"
                          class="icon-option"
                          class:selected={formData.icon === icon}
                          on:click={() => formData.icon = icon}
                        >
                          {icon}
                        </button>
                      {/each}
                    </div>
                  </div>
                </div>
                
                <div class="form-group">
                  <label for="color">Color</label>
                  <input
                    id="color"
                    type="color"
                    bind:value={formData.color}
                  />
                </div>
              </div>
              
              {#if !isEditing}
                <div class="form-group">
                  <label for="parent">Parent Folder</label>
                  <select id="parent" bind:value={formData.parent_id}>
                    <option value={null}>Root Level</option>
                    <!-- We'd need to populate this with available paths -->
                  </select>
                  <small>Leave as "Root Level" to create a top-level folder</small>
                </div>
              {/if}
              
              <div class="form-actions">
                <button 
                  type="submit" 
                  class="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : (isEditing ? 'Update' : 'Create')}
                </button>
                
                <button 
                  type="button" 
                  class="btn btn-secondary"
                  on:click={cancelForm}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        {:else if selectedPathDetails}
          <!-- Path Details View -->
          <div class="details-container">
            <div class="details-header">
              <h3>
                <span class="icon" style="color: {selectedPathDetails.color}">
                  {selectedPathDetails.icon}
                </span>
                {selectedPathDetails.name}
              </h3>
              
              <div class="actions">
                <button class="btn btn-sm btn-secondary" on:click={startEdit}>
                  ✏️ Edit
                </button>
                <button class="btn btn-sm btn-primary" on:click={() => startCreate(selectedPathDetails)}>
                  + Add Child
                </button>
                <button class="btn btn-sm btn-danger" on:click={handleDelete}>
                  🗑️ Delete
                </button>
              </div>
            </div>
            
            <div class="details-body">
              <div class="detail-item">
                <strong>Full Path:</strong>
                <code>{selectedPathDetails.full_path}</code>
              </div>
              
              {#if selectedPathDetails.description}
                <div class="detail-item">
                  <strong>Description:</strong>
                  <p>{selectedPathDetails.description}</p>
                </div>
              {/if}
              
              <div class="detail-item">
                <strong>Level:</strong>
                {selectedPathDetails.level} / 5
              </div>
              
              <div class="detail-item">
                <strong>Children:</strong>
                {selectedPathDetails.child_count} subfolders
              </div>
              
              <div class="detail-item">
                <strong>Posts:</strong>
                {selectedPathDetails.post_count} posts in this folder
              </div>
              
              <div class="detail-item">
                <strong>Created:</strong>
                {new Date(selectedPathDetails.created_at).toLocaleString()}
              </div>
              
              {#if selectedPathDetails.breadcrumbs && selectedPathDetails.breadcrumbs.length > 0}
                <div class="detail-item">
                  <strong>Path:</strong>
                  <div class="breadcrumb-display">
                    {#each selectedPathDetails.breadcrumbs as crumb, i}
                      {#if i > 0}<span class="separator">/</span>{/if}
                      <span>{crumb.name}</span>
                    {/each}
                  </div>
                </div>
              {/if}
              
              {#if selectedPathDetails.children && selectedPathDetails.children.length > 0}
                <div class="detail-item">
                  <strong>Subfolders:</strong>
                  <ul class="children-list">
                    {#each selectedPathDetails.children as child}
                      <li>
                        {child.icon} {child.name}
                        <span class="count">({child.post_count} posts)</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <!-- Empty State -->
          <div class="empty-state">
            <div class="empty-icon">📁</div>
            <h3>No folder selected</h3>
            <p>Select a folder from the tree to view details, or create a new one.</p>
            <button class="btn btn-primary" on:click={() => startCreate()}>
              + Create Root Folder
            </button>
          </div>
        {/if}
      </main>
    </div>
  </div>
  
  <style>
    .path-manager {
      height: 100%;
      width: 100%;
    }
    
    .layout {
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 1.5rem;
      height: 100%;
    }
    
    .sidebar {
      border-right: 1px solid #e5e7eb;
      padding-right: 1.5rem;
      overflow-y: auto;
    }
    
    .sidebar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    
    .sidebar-header h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
    }
    
    .tree-container {
      background-color: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1rem;
    }
    
    .main-content {
      overflow-y: auto;
      padding: 0 1rem;
    }
    
    .alert {
      padding: 0.75rem 1rem;
      border-radius: 0.375rem;
      margin-bottom: 1rem;
    }
    
    .alert-error {
      background-color: #fee;
      color: #c00;
      border: 1px solid #fcc;
    }
    
    .alert-success {
      background-color: #efe;
      color: #080;
      border: 1px solid #cfc;
    }
    
    .form-container, .details-container {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 1.5rem;
    }
    
    .form-container h3, .details-header h3 {
      margin-top: 0;
      font-size: 1.5rem;
    }
    
    .form-group {
      margin-bottom: 1rem;
    }
    
    .form-group label {
      display: block;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: #374151;
    }
    
    .form-group input[type="text"],
    .form-group input[type="color"],
    .form-group textarea,
    .form-group select {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }
    
    .form-group textarea {
      resize: vertical;
      font-family: inherit;
    }
    
    .form-group small {
      display: block;
      margin-top: 0.25rem;
      color: #6b7280;
      font-size: 0.75rem;
    }
    
    .form-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1rem;
    }
    
    .icon-picker {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    
    .icon-picker input {
      width: 4rem;
      text-align: center;
      font-size: 1.5rem;
    }
    
    .icon-options {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    
    .icon-option {
      width: 2rem;
      height: 2rem;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 0.25rem;
      cursor: pointer;
      font-size: 1.25rem;
      transition: all 0.15s ease;
    }
    
    .icon-option:hover {
      border-color: #6366f1;
      transform: scale(1.1);
    }
    
    .icon-option.selected {
      border-color: #6366f1;
      background-color: #eef2ff;
    }
    
    .form-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1.5rem;
    }
    
    .btn {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .btn-primary {
      background-color: #6366f1;
      color: white;
    }
    
    .btn-primary:hover:not(:disabled) {
      background-color: #4f46e5;
    }
    
    .btn-secondary {
      background-color: #e5e7eb;
      color: #374151;
    }
    
    .btn-secondary:hover:not(:disabled) {
      background-color: #d1d5db;
    }
    
    .btn-danger {
      background-color: #ef4444;
      color: white;
    }
    
    .btn-danger:hover:not(:disabled) {
      background-color: #dc2626;
    }
    
    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.8125rem;
    }
    
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .details-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }
    
    .details-header .icon {
      font-size: 1.5rem;
      margin-right: 0.5rem;
    }
    
    .actions {
      display: flex;
      gap: 0.5rem;
    }
    
    .details-body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    
    .detail-item strong {
      display: block;
      color: #6b7280;
      font-size: 0.875rem;
      margin-bottom: 0.25rem;
    }
    
    .detail-item code {
      background-color: #f3f4f6;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.875rem;
    }
    
    .breadcrumb-display {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }
    
    .breadcrumb-display .separator {
      color: #d1d5db;
    }
    
    .children-list {
      list-style: none;
      padding: 0;
      margin: 0.5rem 0 0 0;
    }
    
    .children-list li {
      padding: 0.5rem;
      background-color: #f9fafb;
      border-radius: 0.25rem;
      margin-bottom: 0.25rem;
    }
    
    .children-list .count {
      color: #6b7280;
      font-size: 0.875rem;
    }
    
    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
    }
    
    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    
    .empty-state h3 {
      font-size: 1.5rem;
      color: #374151;
      margin-bottom: 0.5rem;
    }
    
    .empty-state p {
      color: #6b7280;
      margin-bottom: 1.5rem;
    }
  </style>