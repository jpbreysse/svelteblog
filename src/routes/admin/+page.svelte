<script>
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    
    export let data;
    
    let selectedStatus = 'all';
    
    $: filteredUsers = selectedStatus === 'all' 
      ? data.users 
      : data.users.filter(user => user.status === selectedStatus);
      
    async function handleAction(action, userId) {
      const formData = new FormData();
      formData.append('userId', userId);
      
      const response = await fetch(`/api/users/${action}`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        invalidateAll();
      }
    }
  </script>
  
  <svelte:head>
    <title>Admin Panel - UserApp</title>
  </svelte:head>
  
  <div class="admin-container">
    <h1>User Management</h1>
    
    <div class="controls">
      <div class="filter-group">
        <label for="status-filter">Filter by Status:</label>
        <select id="status-filter" bind:value={selectedStatus}>
          <option value="all">All Users</option>
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      
      <div class="stats">
        <span class="stat">
          <strong>{data.users.filter(u => u.status === 'pending').length}</strong> Pending
        </span>
        <span class="stat">
          <strong>{data.users.filter(u => u.status === 'approved').length}</strong> Approved
        </span>
        <span class="stat">
          <strong>{data.users.filter(u => u.status === 'rejected').length}</strong> Rejected
        </span>
      </div>
    </div>
    
    <div class="users-table">
      {#if filteredUsers.length === 0}
        <div class="empty-state">
          <p>No users found matching the selected filter.</p>
        </div>
      {:else}
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredUsers as user}
              <tr class="user-row" class:pending={user.status === 'pending'}>
                <td class="name-cell">
                  {user.first_name} {user.last_name}
                  {#if user.role === 'admin'}
                    <span class="admin-badge">Admin</span>
                  {/if}
                </td>
                <td>{user.email}</td>
                <td>
                  <span class="status-badge status-{user.status}">
                    {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                  </span>
                </td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td class="actions-cell">
                  {#if user.status === 'pending'}
                    <button 
                      class="action-btn approve-btn"
                      on:click={() => handleAction('approve', user.id)}
                    >
                      Approve
                    </button>
                    <button 
                      class="action-btn reject-btn"
                      on:click={() => handleAction('reject', user.id)}
                    >
                      Reject
                    </button>
                  {:else if user.status === 'rejected'}
                    <button 
                      class="action-btn approve-btn"
                      on:click={() => handleAction('approve', user.id)}
                    >
                      Approve
                    </button>
                  {:else if user.status === 'approved' && user.role !== 'admin'}
                    <button 
                      class="action-btn reject-btn"
                      on:click={() => handleAction('reject', user.id)}
                    >
                      Revoke
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>
  
  <style>
    .admin-container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    h1 {
      color: #1f2937;
      margin-bottom: 2rem;
    }
    
    .controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
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
      border-radius: 4px;
      font-size: 0.875rem;
    }
    
    .stats {
      display: flex;
      gap: 2rem;
    }
    
    .stat {
      font-size: 0.875rem;
      color: #6b7280;
    }
    
    .users-table {
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    
    .empty-state {
      padding: 3rem;
      text-align: center;
      color: #6b7280;
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
    
    .user-row:hover {
      background: #f9fafb;
    }
    
    .user-row.pending {
      background: #fef3c7;
    }
    
    .user-row.pending:hover {
      background: #fde68a;
    }
    
    .name-cell {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .admin-badge {
      background: #3b82f6;
      color: white;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    
    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    
    .status-pending {
      background: #fef3c7;
      color: #92400e;
    }
    
    .status-approved {
      background: #d1fae5;
      color: #065f46;
    }
    
    .status-rejected {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .actions-cell {
      display: flex;
      gap: 0.5rem;
    }
    
    .action-btn {
      padding: 0.375rem 0.75rem;
      border: none;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .approve-btn {
      background: #10b981;
      color: white;
    }
    
    .approve-btn:hover {
      background: #059669;
    }
    
    .reject-btn {
      background: #ef4444;
      color: white;
    }
    
    .reject-btn:hover {
      background: #dc2626;
    }
  </style>