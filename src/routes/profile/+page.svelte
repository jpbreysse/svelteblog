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
        <span class="label">Name:</span>
        <span class="value">{data.user.first_name} {data.user.last_name}</span>
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
</div>

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
  
  input[type=\"password\"] {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }
  
  input[type=\"password\"]:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
  
  input[type=\"password\"]:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }
  
  .form-actions {
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
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  @media (max-width: 768px) {
    .profile-container {
      padding: 1rem;
    }
    
    .info-section, .password-section {
      padding: 1.5rem;
    }
    
    .form-actions {
      flex-direction: column;
    }
    
    .info-row {
      flex-direction: column;
      gap: 0.25rem;
    }
    
    .label {
      min-width: auto;
    }
  }
</style>
