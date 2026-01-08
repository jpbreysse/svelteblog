<script>
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';

  export let data;

  $: group = data.group;
  $: members = data.members || [];
  $: availableUsers = data.availableUsers || [];

  let showAddMemberModal = false;
  let showRemoveMemberModal = false;
  let selectedUserId = '';
  let removingMember = null;
  let loading = false;

  function openAddMemberModal() {
    selectedUserId = '';
    showAddMemberModal = true;
  }

  function openRemoveMemberModal(member) {
    removingMember = member;
    showRemoveMemberModal = true;
  }

  async function addMember() {
    if (!selectedUserId) {
      alert('Please select a user');
      return;
    }

    loading = true;
    try {
      const response = await fetch(`/api/groups/${group.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: parseInt(selectedUserId) })
      });

      const result = await response.json();

      if (result.success) {
        showAddMemberModal = false;
        await invalidateAll();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error adding member:', error);
      alert('Failed to add member');
    } finally {
      loading = false;
    }
  }

  async function removeMember() {
    loading = true;
    try {
      const response = await fetch(`/api/groups/${group.id}/members/${removingMember.id}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        showRemoveMemberModal = false;
        await invalidateAll();
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove member');
    } finally {
      loading = false;
    }
  }

  function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'approved': return 'status-approved';
      case 'pending': return 'status-pending';
      case 'rejected': return 'status-rejected';
      default: return '';
    }
  }

  function getRoleBadgeClass(role) {
    return role === 'admin' ? 'role-admin' : 'role-user';
  }
</script>

<svelte:head>
  <title>{group.name} - Groups Management</title>
</svelte:head>

<div class="admin-container">
  <div class="page-header">
    <div class="header-info">
      <a href="/admin/groups" class="back-link">← Back to Groups</a>
      <h1>👥 {group.name}</h1>
      {#if group.description}
        <p class="group-description">{group.description}</p>
      {/if}
    </div>
    <button class="btn btn-primary" on:click={openAddMemberModal}>
      ➕ Add Member
    </button>
  </div>

  <div class="stats-bar">
    <div class="stat-item">
      <span class="stat-label">Total Members</span>
      <span class="stat-value">{members.length}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Created</span>
      <span class="stat-value">{formatDate(group.created_at)}</span>
    </div>
  </div>

  <!-- Members Table -->
  <div class="members-table">
    {#if members.length === 0}
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <h3>No members yet</h3>
        <p>Add users to this group to get started</p>
        <button class="btn btn-primary" on:click={openAddMemberModal}>
          Add First Member
        </button>
      </div>
    {:else}
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Joined</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each members as member (member.id)}
            <tr>
              <td class="user-name">{member.display_name}</td>
              <td class="user-email">{member.email}</td>
              <td>
                <span class="badge {getRoleBadgeClass(member.role)}">
                  {member.role}
                </span>
              </td>
              <td>
                <span class="badge {getStatusBadgeClass(member.status)}">
                  {member.status}
                </span>
              </td>
              <td class="date">{formatDate(member.joined_at)}</td>
              <td class="actions">
                <button
                  class="action-btn delete-btn"
                  on:click={() => openRemoveMemberModal(member)}
                  title="Remove from group"
                >
                  🗑️ Remove
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<!-- Add Member Modal -->
{#if showAddMemberModal}
  <div class="modal-overlay" on:click={() => showAddMemberModal = false}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>➕ Add Member to {group.name}</h3>
        <button class="modal-close" on:click={() => showAddMemberModal = false}>×</button>
      </div>

      <div class="modal-body">
        {#if availableUsers.length === 0}
          <p class="info-message">All users are already members of this group.</p>
        {:else}
          <div class="form-group">
            <label for="user-select">Select User *</label>
            <select
              id="user-select"
              bind:value={selectedUserId}
              disabled={loading}
            >
              <option value="">-- Select a user --</option>
              {#each availableUsers as user}
                <option value={user.id}>
                  {user.display_name} ({user.email})
                </option>
              {/each}
            </select>
          </div>
        {/if}
      </div>

      <div class="modal-actions">
        {#if availableUsers.length > 0}
          <button
            class="btn btn-primary"
            on:click={addMember}
            disabled={loading || !selectedUserId}
          >
            {loading ? 'Adding...' : 'Add Member'}
          </button>
        {/if}
        <button
          class="btn btn-secondary"
          on:click={() => showAddMemberModal = false}
          disabled={loading}
        >
          {availableUsers.length === 0 ? 'Close' : 'Cancel'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Remove Member Modal -->
{#if showRemoveMemberModal && removingMember}
  <div class="modal-overlay" on:click={() => showRemoveMemberModal = false}>
    <div class="modal delete-modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>🗑️ Remove Member</h3>
        <button class="modal-close" on:click={() => showRemoveMemberModal = false}>×</button>
      </div>

      <div class="modal-body">
        <p>
          Are you sure you want to remove <strong>{removingMember.display_name}</strong>
          from the group <strong>{group.name}</strong>?
        </p>
        <p class="warning">⚠️ This action cannot be undone.</p>
      </div>

      <div class="modal-actions">
        <button
          class="btn btn-danger"
          on:click={removeMember}
          disabled={loading}
        >
          {loading ? 'Removing...' : 'Remove Member'}
        </button>
        <button
          class="btn btn-secondary"
          on:click={() => showRemoveMemberModal = false}
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
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: 1rem;
  }

  .header-info {
    flex: 1;
  }

  .back-link {
    color: #2563eb;
    text-decoration: none;
    font-weight: 500;
    display: inline-block;
    margin-bottom: 0.5rem;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .page-header h1 {
    color: #1f2937;
    margin: 0 0 0.5rem 0;
  }

  .group-description {
    color: #6b7280;
    margin: 0;
  }

  .stats-bar {
    display: flex;
    gap: 2rem;
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .stat-label {
    color: #6b7280;
    font-size: 0.875rem;
  }

  .stat-value {
    color: #1f2937;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .members-table {
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

  .user-name {
    font-weight: 500;
    color: #1f2937;
  }

  .user-email {
    color: #6b7280;
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .role-admin {
    background: #fef3c7;
    color: #92400e;
  }

  .role-user {
    background: #dbeafe;
    color: #1e40af;
  }

  .status-approved {
    background: #d1fae5;
    color: #065f46;
  }

  .status-pending {
    background: #fef3c7;
    color: #92400e;
  }

  .status-rejected {
    background: #fee2e2;
    color: #991b1b;
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
    padding: 0.375rem 0.75rem;
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

  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    box-sizing: border-box;
  }

  .form-group select:focus {
    outline: none;
    border-color: #2563eb;
  }

  .info-message {
    color: #6b7280;
    text-align: center;
    padding: 1rem;
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
    }

    .stats-bar {
      flex-direction: column;
      gap: 1rem;
    }

    .members-table {
      overflow-x: auto;
    }

    table {
      min-width: 700px;
    }

    .modal-actions {
      flex-direction: column;
    }
  }
</style>
