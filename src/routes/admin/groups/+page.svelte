<script>
  import { invalidateAll } from '$app/navigation';

  export let data;

  $: groups = data.groups || [];

  let showCreateModal = false;
  let showEditModal = false;
  let showDeleteModal = false;
  let editingGroup = null;
  let newGroup = { name: '', description: '' };
  let loading = false;

  function openCreateModal() {
    newGroup = { name: '', description: '' };
    showCreateModal = true;
  }

  function openEditModal(group) {
    editingGroup = { ...group };
    showEditModal = true;
  }

  function openDeleteModal(group) {
    editingGroup = group;
    showDeleteModal = true;
  }

  async function createGroup() {
    if (!newGroup.name.trim()) {
      alert('Please enter a group name');
      return;
    }

    loading = true;
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGroup)
      });

      const result = await response.json();

      if (result.success) {
        showCreateModal = false;
        await invalidateAll();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Failed to create group');
    } finally {
      loading = false;
    }
  }

  async function updateGroup() {
    if (!editingGroup.name.trim()) {
      alert('Please enter a group name');
      return;
    }

    loading = true;
    try {
      const response = await fetch(`/api/groups/${editingGroup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingGroup.name,
          description: editingGroup.description
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
      console.error('Error updating group:', error);
      alert('Failed to update group');
    } finally {
      loading = false;
    }
  }

  async function deleteGroup() {
    loading = true;
    try {
      const response = await fetch(`/api/groups/${editingGroup.id}`, {
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
      console.error('Error deleting group:', error);
      alert('Failed to delete group');
    } finally {
      loading = false;
    }
  }

  function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
</script>

<svelte:head>
  <title>Groups Management - Admin Panel</title>
</svelte:head>

<div class="admin-container">
  <div class="page-header">
    <h1>👥 Groups Management</h1>
    <div class="header-actions">
      <a href="/admin" class="back-link">← Back to Admin</a>
      <button class="btn btn-primary" on:click={openCreateModal}>
        ➕ Create New Group
      </button>
    </div>
  </div>

  <!-- Groups Table -->
  <div class="groups-table">
    {#if groups.length === 0}
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <h3>No groups created yet</h3>
        <p>Create your first group to start organizing users</p>
        <button class="btn btn-primary" on:click={openCreateModal}>
          Create First Group
        </button>
      </div>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Members</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each groups as group (group.id)}
            <tr>
              <td class="group-name">
                <a href="/admin/groups/{group.id}">
                  {group.name}
                </a>
              </td>
              <td class="description">{group.description || '—'}</td>
              <td class="members-count">
                <span class="badge">{group.member_count || 0} members</span>
              </td>
              <td class="date">{formatDate(group.created_at)}</td>
              <td class="actions">
                <button
                  class="action-btn view-btn"
                  on:click={() => window.location.href = `/admin/groups/${group.id}`}
                  title="View members"
                >
                  👁️
                </button>
                <button
                  class="action-btn edit-btn"
                  on:click={() => openEditModal(group)}
                  title="Edit group"
                >
                  ✏️
                </button>
                <button
                  class="action-btn delete-btn"
                  on:click={() => openDeleteModal(group)}
                  title="Delete group"
                >
                  🗑️
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<!-- Create Group Modal -->
{#if showCreateModal}
  <div class="modal-overlay" on:click={() => showCreateModal = false}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>➕ Create New Group</h3>
        <button class="modal-close" on:click={() => showCreateModal = false}>×</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="new-group-name">Group Name *</label>
          <input
            id="new-group-name"
            type="text"
            bind:value={newGroup.name}
            placeholder="Enter group name"
            maxlength="100"
            disabled={loading}
          />
        </div>

        <div class="form-group">
          <label for="new-group-description">Description</label>
          <textarea
            id="new-group-description"
            bind:value={newGroup.description}
            placeholder="Enter group description (optional)"
            rows="3"
            disabled={loading}
          ></textarea>
        </div>
      </div>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          on:click={createGroup}
          disabled={loading || !newGroup.name.trim()}
        >
          {loading ? 'Creating...' : 'Create Group'}
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

<!-- Edit Group Modal -->
{#if showEditModal && editingGroup}
  <div class="modal-overlay" on:click={() => showEditModal = false}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>✏️ Edit Group</h3>
        <button class="modal-close" on:click={() => showEditModal = false}>×</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="edit-group-name">Group Name *</label>
          <input
            id="edit-group-name"
            type="text"
            bind:value={editingGroup.name}
            placeholder="Enter group name"
            maxlength="100"
            disabled={loading}
          />
        </div>

        <div class="form-group">
          <label for="edit-group-description">Description</label>
          <textarea
            id="edit-group-description"
            bind:value={editingGroup.description}
            placeholder="Enter group description (optional)"
            rows="3"
            disabled={loading}
          ></textarea>
        </div>
      </div>

      <div class="modal-actions">
        <button
          class="btn btn-primary"
          on:click={updateGroup}
          disabled={loading || !editingGroup.name.trim()}
        >
          {loading ? 'Updating...' : 'Update Group'}
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
{#if showDeleteModal && editingGroup}
  <div class="modal-overlay" on:click={() => showDeleteModal = false}>
    <div class="modal delete-modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>🗑️ Confirm Deletion</h3>
        <button class="modal-close" on:click={() => showDeleteModal = false}>×</button>
      </div>

      <div class="modal-body">
        <p>Are you sure you want to delete the group <strong>{editingGroup.name}</strong>?</p>
        <p class="warning">⚠️ This will remove all user associations with this group. This action cannot be undone.</p>
      </div>

      <div class="modal-actions">
        <button
          class="btn btn-danger"
          on:click={deleteGroup}
          disabled={loading}
        >
          {loading ? 'Deleting...' : 'Delete Group'}
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
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .page-header h1 {
    color: #1f2937;
    margin: 0;
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

  .groups-table {
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

  .group-name a {
    color: #2563eb;
    text-decoration: none;
    font-weight: 500;
  }

  .group-name a:hover {
    text-decoration: underline;
  }

  .description {
    color: #6b7280;
    max-width: 400px;
  }

  .members-count {
    text-align: center;
  }

  .badge {
    background: #dbeafe;
    color: #1e40af;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .date {
    color: #6b7280;
    font-size: 0.875rem;
  }

  .actions {
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

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #2563eb;
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

    .groups-table {
      overflow-x: auto;
    }

    table {
      min-width: 600px;
    }

    .modal-actions {
      flex-direction: column;
    }
  }
</style>
