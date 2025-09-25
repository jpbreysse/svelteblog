<script>
  import { PUBLIC_APP_NAME } from '$env/static/public';
  import { goto } from '$app/navigation';
  
  export let data;
  
  let showPasswordForm = false;
  let passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  let loading = false;
  let message = '';
  let messageType = ''; // 'success' or 'error'
  
  // Account deletion state
  let showDeleteModal = false;
  let deleteConfirmText = '';
  let deleteReason = '';
  let deleteLoading = false;
  
  async function changePassword() {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showMessage('New passwords do not match', 'error');
      return;
    }
    
    if (passwordForm.newPassword.length < 8) {
      showMessage('New password must be at least 8 characters long', 'error');
      return;
    }
    
    loading = true;
    try {
      const response = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(passwordForm)
      });
      
      const result = await response.json();
      
      if (result.success) {
        showMessage('Password changed successfully!', 'success');
        // Clear the form
        passwordForm = {
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        };
        showPasswordForm = false;
      } else {
        showMessage(result.error || 'Failed to change password', 'error');
      }
    } catch (error) {
      console.error('Password change error:', error);
      showMessage('An error occurred. Please try again.', 'error');
    } finally {
      loading = false;
    }
  }
  
  // Account deletion functions
  async function cancelDeletionRequest() {
    try {
      const response = await fetch('/api/users/cancel-deletion', {
        method: 'POST'
      });
      
      const result = await response.json();
      
      if (result.success) {
        showMessage('Deletion request cancelled!', 'success');
        window.location.reload();
      } else {
        showMessage(result.error || 'Failed to cancel', 'error');
      }
    } catch (error) {
      showMessage('An error occurred', 'error');
    }
  }
  
  async function requestAccountDeletion() {
    if (deleteConfirmText !== 'DELETE') {
      showMessage('You must type "DELETE" to confirm', 'error');
      return;
    }
    
    deleteLoading = true;
    try {
      const response = await fetch('/api/users/request-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmText: deleteConfirmText,
          reason: deleteReason
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        showMessage(result.message, 'success');
        showDeleteModal = false;
        
        // Redirect to home page after successful deletion
        if (result.redirect) {
          setTimeout(() => {
            goto('/');
          }, 2000);
        }
      } else {
        showMessage(result.error || 'Failed to delete account', 'error');
      }
    } catch (error) {
      console.error('Delete request error:', error);
      showMessage('An error occurred. Please try again.', 'error');
    } finally {
      deleteLoading = false;
    }
  }

  function openDeleteModal() {
    deleteConfirmText = '';
    deleteReason = '';
    showDeleteModal = true;
  }
  
  function closeDeleteModal() {
    showDeleteModal = false;
    deleteConfirmText = '';
    deleteReason = '';
  }
  
  function showMessage(text, type) {
    message = text;
    messageType = type;
    setTimeout(() => {
      message = '';
      messageType = '';
    }, 5000);
  }
  
  function togglePasswordForm() {
    showPasswordForm = !showPasswordForm;
    if (!showPasswordForm) {
      // Clear form when hiding
      passwordForm = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
    }
  }
</script>

<svelte:head>
  <title>Profile - {PUBLIC_APP_NAME}</title>
</svelte:head>

<div class="profile-container">
  <h1>👤 User Profile</h1>
  
  <!-- Status Message -->
  {#if message}
    <div class="message {messageType}">
      {message}
    </div>
  {/if}
  
  <!-- User Information -->
  <div class="info-section">
    <h2>Account Information</h2>
    <div class="info-card">
      <div class="info-row">
        <span class="label">Display Name:</span>
        <span class="value">{data.user.display_name}</span>
      </div>
      <div class="info-row">
        <span class="label">Email:</span>
        <span class="value">{data.user.email}</span>
      </div>
      <div class="info-row">
        <span class="label">Role:</span>
        <span class="value role-{data.user.role}">{data.user.role}</span>
      </div>
      <div class="info-row">
        <span class="label">Status:</span>
        <span class="value status-{data.user.status}">{data.user.status}</span>
      </div>
    </div>
  </div>
  
  <!-- Password Management -->
  <div class="password-section">
    <h2>🔐 Security</h2>
    
    {#if !showPasswordForm}
      <button class="btn btn-primary" on:click={togglePasswordForm}>
        Change Password
      </button>
    {:else}
      <div class="password-form">
        <h3>Change Password</h3>
        
        <form on:submit|preventDefault={changePassword}>
          <div class="form-group">
            <label for="currentPassword">Current Password</label>
            <input 
              type="password" 
              id="currentPassword"
              bind:value={passwordForm.currentPassword}
              placeholder="Enter your current password"
              required
              disabled={loading}
            />
          </div>
          
          <div class="form-group">
            <label for="newPassword">New Password</label>
            <input 
              type="password" 
              id="newPassword"
              bind:value={passwordForm.newPassword}
              placeholder="Enter new password (min 8 characters)"
              minlength="8"
              required
              disabled={loading}
            />
          </div>
          
          <div class="form-group">
            <label for="confirmPassword">Confirm New Password</label>
            <input 
              type="password" 
              id="confirmPassword"
              bind:value={passwordForm.confirmPassword}
              placeholder="Confirm new password"
              minlength="8"
              required
              disabled={loading}
            />
          </div>
          
          <div class="form-actions">
            <button 
              type="submit" 
              class="btn btn-primary"
              disabled={loading}
            >
              {loading ? '🔄 Changing...' : '✅ Change Password'}
            </button>
            
            <button 
              type="button" 
              class="btn btn-secondary"
              on:click={togglePasswordForm}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    {/if}
  </div>

  <!-- Account Deletion Section -->
  <div class="danger-section">
    <h2>🚨 Danger Zone</h2>
    
    {#if data.user.status === 'deletion_requested'}
      <div class="deletion-pending">
        <div class="pending-notice">
          <h3>⏳ Account Deletion Pending</h3>
          <p>Your account deletion request is being reviewed by an administrator.</p>
          <p><strong>What will happen:</strong></p>
          <ul>
            <li>Your account will be permanently deleted</li>
            <li>All your posts will be permanently removed</li>
            <li>This action cannot be undone</li>
          </ul>
        </div>
        
        <button 
          class="btn btn-secondary" 
          on:click={cancelDeletionRequest}
        >
          Cancel Deletion Request
        </button>
      </div>
    {:else}
      <div class="delete-account-section">
        <h3>Delete Account</h3>
        <p>Permanently delete your account and all associated data.</p>
        
        <div class="warning-box">
          <p><strong>⚠️ This action cannot be undone!</strong></p>
          <p>Deleting your account will:</p>
          <ul>
            <li>Permanently remove your account</li>
            <li>Delete all your blog posts</li>
            <li>Remove all your comments and interactions</li>
            <li>Cannot be recovered once processed</li>
          </ul>
        </div>
        
        <button 
          class="btn btn-danger" 
          on:click={openDeleteModal}
        >
          🗑️ Delete My Account
        </button>
      </div>
    {/if}
  </div>
</div>

<!-- Account Deletion Modal -->
{#if showDeleteModal}
  <div class="modal-overlay" on:click={closeDeleteModal}>
    <div class="modal delete-modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3>🗑️ Delete Account</h3>
        <button class="modal-close" on:click={closeDeleteModal}>×</button>
      </div>
      
      <div class="modal-body">
        <div class="final-warning">
          <h4>⚠️ Final Warning</h4>
          <p>This will <strong>immediately and permanently delete</strong>:</p>
          <ul>
            <li>Your account ({data.user.display_name})</li>
            <li>All your blog posts</li>
            <li>All your data</li>
          </ul>
          <p><strong>This action is performed IMMEDIATELY and cannot be undone!</strong></p>
          <p><strong>You will be logged out and redirected to the homepage.</strong></p>
        </div>
        
        <form on:submit|preventDefault={requestAccountDeletion}>
          <div class="form-group">
            <label for="deleteReason">Reason for deletion (optional):</label>
            <textarea 
              id="deleteReason"
              bind:value={deleteReason}
              placeholder="Why are you deleting your account?"
              rows="3"
              disabled={deleteLoading}
            ></textarea>
          </div>
          
          <div class="form-group">
            <label for="confirmDelete">
              Type <strong>"DELETE"</strong> to confirm:
            </label>
            <input 
              type="text" 
              id="confirmDelete"
              bind:value={deleteConfirmText}
              placeholder="Type DELETE here"
              required
              disabled={deleteLoading}
            />
          </div>
          
          <div class="modal-actions">
            <button 
              type="submit" 
              class="btn btn-danger"
              disabled={deleteLoading || deleteConfirmText !== 'DELETE'}
            >
              {deleteLoading ? '🔄 Processing...' : '🗑️ Delete Account Now'}
            </button>
            
            <button 
              type="button" 
              class="btn btn-secondary"
              on:click={closeDeleteModal}
              disabled={deleteLoading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<style>
  .profile-container {
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  h1 {
    color: #1f2937;
    font-size: 2rem;
    margin-bottom: 2rem;
    text-align: center;
  }
  
  .message {
    padding: 1rem;
    border-radius: 6px;
    margin-bottom: 2rem;
    font-weight: 500;
  }
  
  .message.success {
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }
  
  .message.error {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fca5a5;
  }
  
  .info-section, .password-section {
    background: white;
    border-radius: 12px;
    padding: 2rem;
    margin-bottom: 2rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  h2 {
    color: #1f2937;
    font-size: 1.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 0.5rem;
  }
  
  .info-card {
    background: #f9fafb;
    border-radius: 8px;
    padding: 1.5rem;
  }
  
  .info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .info-row:last-child {
    margin-bottom: 0;
    border-bottom: none;
  }
  
  .label {
    font-weight: 600;
    color: #6b7280;
    min-width: 80px;
  }
  
  .value {
    color: #1f2937;
    font-weight: 500;
  }
  
  .role-admin {
    color: #dc2626;
    font-weight: 600;
  }
  
  .role-user {
    color: #2563eb;
  }
  
  .status-approved {
    color: #059669;
    font-weight: 600;
  }
  
  .status-pending {
    color: #d97706;
    font-weight: 600;
  }
  
  .status-deletion_requested {
    color: #dc2626;
    font-weight: 600;
  }
  
  .password-form {
    background: #f9fafb;
    border-radius: 8px;
    padding: 1.5rem;
  }
  
  h3 {
    color: #374151;
    margin-bottom: 1.5rem;
    font-size: 1.125rem;
  }
  
  .form-group {
    margin-bottom: 1.5rem;
  }
  
  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #374151;
  }
  
  input[type="password"], input[type="text"], textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }
  
  input:focus, textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
  
  input:disabled, textarea:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }
  
  textarea {
    resize: vertical;
  }
  
  .form-actions, .modal-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 2rem;
  }
  
  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
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

  /* Account Deletion Styles */
  .danger-section {
    background: #fef2f2;
    border: 2px solid #fecaca;
    border-radius: 12px;
    padding: 2rem;
    margin-top: 2rem;
  }

  .danger-section h2 {
    color: #dc2626;
    border-bottom: 2px solid #fecaca;
  }

  .deletion-pending {
    text-align: center;
  }

  .pending-notice {
    background: #fff3cd;
    border: 1px solid #ffeaa7;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1rem;
  }

  .pending-notice h3 {
    color: #d97706;
    margin-bottom: 1rem;
  }

  .pending-notice ul {
    text-align: left;
    color: #92400e;
  }

  .warning-box {
    background: #fee2e2;
    border: 1px solid #fca5a5;
    border-radius: 8px;
    padding: 1.5rem;
    margin: 1rem 0;
  }

  .warning-box p, .warning-box ul {
    color: #991b1b;
    margin-bottom: 0.5rem;
  }

  .delete-modal {
    max-width: 600px;
  }

  .final-warning {
    background: #fee2e2;
    border: 2px solid #fca5a5;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .final-warning h4 {
    color: #dc2626;
    margin-bottom: 1rem;
  }

  .final-warning ul {
    color: #991b1b;
  }

  /* Modal styles */
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
  }

  .modal {
    background: white;
    border-radius: 12px;
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 25px rgba(0, 0, 0, 0.1);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
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
  }

  .modal-close:hover {
    color: #374151;
  }

  .modal-body {
    padding: 1.5rem;
  }
  
  @media (max-width: 768px) {
    .profile-container {
      padding: 1rem;
    }
    
    .info-section, .password-section, .danger-section {
      padding: 1.5rem;
    }
    
    .form-actions, .modal-actions {
      flex-direction: column;
    }
    
    .info-row {
      flex-direction: column;
      gap: 0.25rem;
    }
    
    .label {
      min-width: auto;
    }
    
    .modal {
      width: 95%;
      margin: 1rem;
    }
  }
</style>