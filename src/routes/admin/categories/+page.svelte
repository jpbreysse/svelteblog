<script>
  import { invalidateAll } from '$app/navigation';

  export let data;

  $: categories = data.categories || [];

  let showCreateModal = false;
  let showEditModal = false;
  let showDeleteModal = false;
  let editingCategory = null;
  let newCategory = { value: '', label: '' };
  let loading = false;
  let draggedItem = null;

  function openCreateModal() {
    newCategory = { value: '', label: '' };
    showCreateModal = true;
  }

  function openEditModal(category) {
    editingCategory = { ...category };
    showEditModal = true;
  }

  function openDeleteModal(category) {
    editingCategory = category;
    showDeleteModal = true;
  }

  // Auto-generate value from label
  function handleLabelInput(e, isNew = true) {
    const label = e.target.value;
    if (isNew) {
      newCategory.label = label;
      // Auto-generate value if empty or matches previous auto-generated value
      if (!newCategory.value || newCategory.value === slugify(newCategory.label.slice(0, -1))) {
        newCategory.value = slugify(label);
      }
    } else {
      editingCategory.label = label;
    }
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async function createCategory() {
    if (!newCategory.value.trim() || !newCategory.label.trim()) {
      alert('Please enter both value and label');
      return;
    }

    loading = true;
    try {
      const response = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCategory)
      });

      const result = await response.json();

      if (result.success) {
        showCreateModal = false;
        await invalidateAll();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Failed to create category');
    } finally {
      loading = false;
    }
  }

  async function updateCategory() {
    if (!editingCategory.value.trim() || !editingCategory.label.trim()) {
      alert('Please enter both value and label');
      return;
    }

    loading = true;
    try {
      const response = await fetch(`/api/admin/categories/${editingCategory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: editingCategory.value,
          label: editingCategory.label,
          position: editingCategory.position
        })
      });

      const result = await response.json();

      if (result.success) {
        showEditModal = false;
        await invalidateAll();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error updating category:', error);
      alert('Failed to update category');
    } finally {
      loading = false;
    }
  }

  async function deleteCategory() {
    loading = true;
    try {
      const response = await fetch(`/api/admin/categories/${editingCategory.id}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        showDeleteModal = false;
        await invalidateAll();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Failed to delete category');
    } finally {
      loading = false;
    }
  }

  // Drag and drop reordering
  function handleDragStart(e, category) {
    draggedItem = category;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  async function handleDrop(e, targetCategory) {
    e.preventDefault();
    if (!draggedItem || draggedItem.id === targetCategory.id) return;

    // Reorder locally first for immediate feedback
    const newOrder = [...categories];
    const draggedIndex = newOrder.findIndex(c => c.id === draggedItem.id);
    const targetIndex = newOrder.findIndex(c => c.id === targetCategory.id);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedItem);

    // Update on server
    try {
      const response = await fetch('/api/admin/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: newOrder.map(c => c.id) })
      });

      const result = await response.json();

      if (result.success) {
        await invalidateAll();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error reordering categories:', error);
    }

    draggedItem = null;
  }

  function handleDragEnd() {
    draggedItem = null;
  }
</script>

<svelte:head>
  <title>Categories Management - Admin Panel</title>
</svelte:head>

<div class="admin-container">
  <div class="page-header">
    <h1>Categories Management</h1>
    <div class="header-actions">
      <a href="/admin" class="back-link">← Back to Admin</a>
      <button class="btn btn-primary" on:click={openCreateModal}>
        + Create New Category
      </button>
    </div>
  </div>

  <p class="page-description">
    Manage blog post categories. Drag and drop to reorder. Categories in use cannot be deleted.
  </p>

  <!-- Categories Table -->
  <div class="categories-table">
    {#if categories.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <h3>No categories created yet</h3>
        <p>Create your first category to organize posts</p>
        <button class="btn btn-primary" on:click={openCreateModal}>
          Create First Category
        </button>
      </div>
    {:else}
      <table>
        <thead>
          <tr>
            <th class="drag-handle-col"></th>
            <th>Label</th>
            <th>Value</th>
            <th>Position</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each categories as category (category.id)}
            <tr
              draggable="true"
              on:dragstart={(e) => handleDragStart(e, category)}
              on:dragover={handleDragOver}
              on:drop={(e) => handleDrop(e, category)}
              on:dragend={handleDragEnd}
              class:dragging={draggedItem?.id === category.id}
            >
              <td class="drag-handle">
                <span class="drag-icon">⋮⋮</span>
              </td>
              <td class="category-label">{category.label}</td>
              <td class="category-value">
                <code>{category.value}</code>
              </td>
              <td class="position">{category.position}</td>
              <td class="actions">
                <button
                  class="action-btn edit-btn"
                  on:click={() => openEditModal(category)}
                  title="Edit category"
                >
                  Edit
                </button>
                <button
                  class="action-btn delete-btn"
                  on:click={() => openDeleteModal(category)}
                  title="Delete category"
                >
                  Delete
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<!-- Create Category Modal -->
{#if showCreateModal}
  <div class="modal-overlay" on:click={() => showCreateModal = false}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>Create New Category</h3>
        <button class="modal-close" on:click={() => showCreateModal = false}>×</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="new-category-label">Label *</label>
          <input
            id="new-category-label"
            type="text"
            bind:value={newCategory.label}
            on:input={(e) => handleLabelInput(e, true)}
            placeholder="e.g., Technology"
            maxlength="200"
            disabled={loading}
          />
          <span class="help-text">Display name shown to users</span>
        </div>

        <div class="form-group">
          <label for="new-category-value">Value *</label>
          <input
            id="new-category-value"
            type="text"
            bind:value={newCategory.value}
            placeholder="e.g., tech"
            maxlength="100"
            disabled={loading}
          />
          <span class="help-text">URL-friendly identifier (auto-generated from label)</span>
        </div>
      </div>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          on:click={createCategory}
          disabled={loading || !newCategory.value.trim() || !newCategory.label.trim()}
        >
          {loading ? 'Creating...' : 'Create Category'}
        </button>
        <button
          class="btn btn-secondary"
          on:click={() => showCreateModal = false}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Category Modal -->
{#if showEditModal && editingCategory}
  <div class="modal-overlay" on:click={() => showEditModal = false}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>Edit Category</h3>
        <button class="modal-close" on:click={() => showEditModal = false}>×</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="edit-category-label">Label *</label>
          <input
            id="edit-category-label"
            type="text"
            bind:value={editingCategory.label}
            placeholder="e.g., Technology"
            maxlength="200"
            disabled={loading}
          />
        </div>

        <div class="form-group">
          <label for="edit-category-value">Value *</label>
          <input
            id="edit-category-value"
            type="text"
            bind:value={editingCategory.value}
            placeholder="e.g., tech"
            maxlength="100"
            disabled={loading}
          />
          <span class="help-text warning">Warning: Changing the value may break existing posts using this category</span>
        </div>
      </div>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          on:click={updateCategory}
          disabled={loading || !editingCategory.value.trim() || !editingCategory.label.trim()}
        >
          {loading ? 'Updating...' : 'Update Category'}
        </button>
        <button
          class="btn btn-secondary"
          on:click={() => showEditModal = false}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if showDeleteModal && editingCategory}
  <div class="modal-overlay" on:click={() => showDeleteModal = false}>
    <div class="modal delete-modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>Confirm Deletion</h3>
        <button class="modal-close" on:click={() => showDeleteModal = false}>×</button>
      </div>

      <div class="modal-body">
        <p>Are you sure you want to delete the category <strong>{editingCategory.label}</strong>?</p>
        <p class="warning">This action cannot be undone. Categories in use by posts cannot be deleted.</p>
      </div>

      <div class="modal-actions">
        <button
          class="btn btn-danger"
          on:click={deleteCategory}
          disabled={loading}
        >
          {loading ? 'Deleting...' : 'Delete Category'}
        </button>
        <button
          class="btn btn-secondary"
          on:click={() => showDeleteModal = false}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .admin-container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 2rem;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .page-header h1 {
    color: #1f2937;
    margin: 0;
  }

  .page-description {
    color: #6b7280;
    margin-bottom: 2rem;
  }

  .header-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
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

  .categories-table {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
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

  td {
    padding: 1rem;
    border-bottom: 1px solid #f3f4f6;
  }

  tr:hover {
    background: #f9fafb;
  }

  tr.dragging {
    opacity: 0.5;
    background: #dbeafe;
  }

  .drag-handle-col {
    width: 40px;
  }

  .drag-handle {
    cursor: grab;
    text-align: center;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .drag-icon {
    color: #9ca3af;
    font-size: 1rem;
    user-select: none;
  }

  .category-label {
    font-weight: 500;
  }

  .category-value code {
    background: #f3f4f6;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.875rem;
    color: #6b7280;
  }

  .position {
    color: #9ca3af;
    text-align: center;
    width: 80px;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
    background: white;
  }

  .action-btn:hover {
    background: #f3f4f6;
  }

  .edit-btn {
    color: #2563eb;
    border-color: #2563eb;
  }

  .edit-btn:hover {
    background: #eff6ff;
  }

  .delete-btn {
    color: #dc2626;
    border-color: #dc2626;
  }

  .delete-btn:hover {
    background: #fee2e2;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: #6b7280;
  }

  .empty-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .empty-state h3 {
    color: #374151;
    margin-bottom: 0.5rem;
  }

  /* Button Styles */
  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-secondary {
    background: #6b7280;
    color: white;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #5b6470;
  }

  .btn-danger {
    background: #dc2626;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: #b91c1c;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Modal Styles */
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

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #374151;
  }

  .form-group input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    box-sizing: border-box;
  }

  .form-group input:focus {
    outline: none;
    border-color: #2563eb;
  }

  .help-text {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .help-text.warning {
    color: #d97706;
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

  @media (max-width: 768px) {
    .admin-container {
      padding: 1rem;
    }

    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-actions {
      width: 100%;
      flex-direction: column;
    }

    .categories-table {
      overflow-x: auto;
    }

    table {
      min-width: 500px;
    }

    .modal-actions {
      flex-direction: column;
    }
  }
</style>
