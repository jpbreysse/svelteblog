<script>
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    
    export let data;
    
    let selectedStatus = 'all';
    let showPasswordModal = false;
    let resetPasswordData = null;
    
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
    
    async function handleResetPassword(userId) {
      try {
        const response = await fetch('/api/admin/reset-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userId })
        });
        
        const result = await response.json();
        
        if (result.success) {
          resetPasswordData = {
            tempPassword: result.tempPassword,
            userEmail: result.userEmail,
            displayName: result.displayName
          };
          showPasswordModal = true;
        } else {
          alert('Error: ' + result.error);
        }
      } catch (error) {
        alert('Failed to reset password: ' + error.message);
      }
    }
    
    function closeModal() {
      showPasswordModal = false;
      resetPasswordData = null;
    }
    
    function copyToClipboard() {
      if (resetPasswordData) {
        navigator.clipboard.writeText(resetPasswordData.tempPassword);
        alert('Password copied to clipboard!');
      }
    }
    
    async function downloadBackup() {
      try {
        const response = await fetch('/api/admin/backup?format=json');
        
        if (!response.ok) {
          throw new Error('Failed to create backup');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        alert('✅ Backup downloaded successfully!');
      } catch (error) {
        alert('❌ Failed to download backup: ' + error.message);
      }
    }
  </script>
  
  <svelte:head>
    <title>Admin Panel - UserApp</title>
  </svelte:head>
  
  <div class="admin-container">
    <h1>User Management</h1>
    
    <!-- Admin Navigation -->
    <div class="admin-nav">
      <a href="/admin/posts" class="nav-link posts-link">
        📝 Posts Management
        <span class="info-badge">{data.postStats?.total || 0} posts</span>
      </a>
      <a href="/admin/reports" class="nav-link reports-link">
        📝 Content Reports
        {#if data.reportStats && data.reportStats.pending > 0}
          <span class="badge">{data.reportStats.pending}</span>
        {/if}
      </a>
      <button class="nav-link backup-link" on:click={downloadBackup}>
        💾 Download Backup
      </button>
    </div>
    
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
              <th>Display Name</th>
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
                  {user.display_name}
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
                  {:else if user.status === 'approved'}
                    {#if user.role !== 'admin'}
                      <button 
                        class="action-btn reject-btn"
                        on:click={() => handleAction('reject', user.id)}
                      >
                        Revoke
                      </button>
                    {/if}
                    <button 
                      class="action-btn reset-btn"
                      on:click={() => handleResetPassword(user.id)}
                      title="Reset password for this user"
                    >
                      🔑 Reset Password
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
  
  <!-- Password Reset Modal -->
  {#if showPasswordModal && resetPasswordData}
    <div class="modal-overlay" on:click={closeModal}>
      <div class="modal-content" on:click|stopPropagation>
        <div class="modal-header">
          <h2>🔑 Password Reset Successful</h2>
          <button class="close-btn" on:click={closeModal}>×</button>
        </div>
        <div class="modal-body">
          <p class="user-info">
            Password reset for: <strong>{resetPasswordData.displayName}</strong> 
            ({resetPasswordData.userEmail})
          </p>
          
          <div class="password-display">
            <label>Temporary Password:</label>
            <div class="password-box">
              <code>{resetPasswordData.tempPassword}</code>
              <button class="copy-btn" on:click={copyToClipboard} title="Copy to clipboard">
                📋 Copy
              </button>
            </div>
          </div>
          
          <div class="warning-box">
            <strong>⚠️ Important:</strong>
            <ul>
              <li>This password will only be shown once</li>
              <li>Please provide this password to the user securely</li>
              <li>The user can change it after logging in</li>
            </ul>
          </div>
        </div>
        <div class="modal-footer">
          <button class="action-btn close-modal-btn" on:click={closeModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  {/if}
  
  <style>
    .admin-container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    h1 {
      color: #1f2937;
      margin-bottom: 2rem;
    }
    
    .admin-nav {
    background: white;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 2rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
    
    .nav-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: #2563eb;
    color: white;
    text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      transition: all 0.2s;
    }
    
  .nav-link:hover {
    background: #1d4ed8;
  }
  
  .nav-link.posts-link {
    background: #059669;
  }
  
  .nav-link.posts-link:hover {
    background: #047857;
  }
  
  .nav-link.backup-link {
    background: #8b5cf6;
    border: none;
    cursor: pointer;
  }
  
  .nav-link.backup-link:hover {
    background: #7c3aed;
  }
    
    .badge {
    background: #dc2626;
    color: white;
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-weight: 600;
    }
  
  .info-badge {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-weight: 500;
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
      flex-wrap: wrap;
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
    
    .reset-btn {
      background: #f59e0b;
      color: white;
    }
    
    .reset-btn:hover {
      background: #d97706;
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
      animation: fadeIn 0.2s ease-out;
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    
    .modal-content {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      animation: slideUp 0.3s ease-out;
    }
    
    @keyframes slideUp {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .modal-header h2 {
      margin: 0;
      font-size: 1.5rem;
      color: #1f2937;
    }
    
    .close-btn {
      background: none;
      border: none;
      font-size: 2rem;
      color: #6b7280;
      cursor: pointer;
      line-height: 1;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    }
    
    .close-btn:hover {
      background: #f3f4f6;
      color: #1f2937;
    }
    
    .modal-body {
      padding: 1.5rem;
    }
    
    .user-info {
      margin-bottom: 1.5rem;
      color: #4b5563;
    }
    
    .password-display {
      margin-bottom: 1.5rem;
    }
    
    .password-display label {
      display: block;
      font-weight: 600;
      color: #374151;
      margin-bottom: 0.5rem;
    }
    
    .password-box {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      padding: 1rem;
      background: #f9fafb;
      border: 2px solid #d1d5db;
      border-radius: 8px;
    }
    
    .password-box code {
      flex: 1;
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
      font-family: 'Courier New', monospace;
      letter-spacing: 2px;
    }
    
    .copy-btn {
      padding: 0.5rem 1rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    
    .copy-btn:hover {
      background: #2563eb;
    }
    
    .warning-box {
      background: #fef3c7;
      border: 1px solid #fbbf24;
      border-radius: 8px;
      padding: 1rem;
      color: #92400e;
    }
    
    .warning-box strong {
      display: block;
      margin-bottom: 0.5rem;
    }
    
    .warning-box ul {
      margin: 0;
      padding-left: 1.5rem;
    }
    
    .warning-box li {
      margin: 0.25rem 0;
    }
    
    .modal-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: flex-end;
    }
    
    .close-modal-btn {
      background: #6b7280;
      color: white;
    }
    
    .close-modal-btn:hover {
      background: #4b5563;
    }
  </style>
