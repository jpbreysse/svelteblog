<script>
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import { invalidateAll } from '$app/navigation';
    
    export let form;
    export let data;
    
    // Redirect if already logged in
    if (data.user) {
      goto('/');
    }
    
    let loading = false;
    let showPassword = false;
    
    // Clear any previous form state when component mounts
    let mounted = false;
    $: if (mounted && !loading) {
      // Auto-clear success messages after 5 seconds
      if (form?.success) {
        setTimeout(() => {
          if (form?.success) form.success = null;
        }, 5000);
      }
    }
    
    // Set mounted flag
    import { onMount } from 'svelte';
    onMount(() => {
      mounted = true;
    });
  </script>
  
  <svelte:head>
    <title>Sign In - UserApp</title>
  </svelte:head>
  
  <div class="login-container">
    <div class="login-card">
      <h1>Sign In</h1>
      <p>Welcome back! Please sign in to your account.</p>
      
      <!-- Debug Info (temporary) -->
      {#if form}
        <div style="background: #f0f0f0; padding: 0.5rem; margin-bottom: 1rem; font-size: 0.75rem; border-radius: 4px;">
          <strong>Debug:</strong> form = {JSON.stringify(form)}
        </div>
      {/if}
      
      <!-- Main Error Message -->
      {#if form?.error}
        <div class="error-banner">
          <span class="error-icon">❌</span>
          <span class="error-text">{form.error}</span>
        </div>
      {/if}
      
      <!-- Success Message -->
      {#if form?.success}
        <div class="success-banner">
          <span class="success-icon">✅</span>
          <span class="success-text">{form.success}</span>
        </div>
      {/if}
      
      <form method="POST" use:enhance={() => {
        loading = true;
        console.log('🚀 Form submitting...');
        return async ({ result, update }) => {
          loading = false;
          console.log('📨 Form result:', result.type, result);
          
          if (result.type === 'redirect') {
            console.log('✅ Login successful, redirecting...');
            await invalidateAll(); 
            goto(result.location);
          } else if (result.type === 'failure') {
            console.log('❌ Login failed, showing errors...');
            // Handle form errors - this is crucial!
            await update();
          } else {
            console.log('🔄 Other result type, updating...');
            // Handle other result types (success, etc.)
            await update();
          }
        };
      }}>
        <div class="form-group">
          <label for="email">Email Address</label>
          <input 
            type="email" 
            id="email" 
            name="email" 
            required
            autocomplete="email"
            placeholder="Enter your email address"
            value={form?.email || ''}
            class:error={form?.fieldErrors?.email}
            disabled={loading}
          />
          {#if form?.fieldErrors?.email}
            <span class="field-error">
              <span class="error-icon-small">⚠️</span>
              {form.fieldErrors.email}
            </span>
          {/if}
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <div class="password-input-container">
            <input 
              type={showPassword ? 'text' : 'password'}
              id="password" 
              name="password" 
              required
              autocomplete="current-password"
              placeholder="Enter your password"
              class:error={form?.fieldErrors?.password}
              disabled={loading}
            />
            <button 
              type="button" 
              class="password-toggle"
              on:click={() => showPassword = !showPassword}
              disabled={loading}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          {#if form?.fieldErrors?.password}
            <span class="field-error">
              <span class="error-icon-small">⚠️</span>
              {form.fieldErrors.password}
            </span>
          {/if}
        </div>
        
        <button type="submit" disabled={loading} class="submit-btn">
          {#if loading}
            <span class="loading-spinner"></span>
            Signing In...
          {:else}
            🔐 Sign In
          {/if}
        </button>
      </form>
      
      <div class="divider">
        <span>or</span>
      </div>
      
      <p class="register-link">
        Don't have an account? <a href="/register">Create one here</a>
      </p>
      
      <div class="demo-info">
        <h3>Demo Credentials</h3>
        <div class="demo-credentials">
          <div class="credential">
            <strong>Admin Account:</strong><br>
            Email: admin@example.com<br>
            Password: *****
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <style>
    .login-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 80vh;
    }
    
    .login-card {
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      width: 100%;
      max-width: 400px;
    }
    
    h1 {
      text-align: center;
      color: #1f2937;
      margin-bottom: 0.5rem;
    }
    
    p {
      text-align: center;
      color: #6b7280;
      margin-bottom: 2rem;
    }
    
    .error-banner {
      background: #fef2f2;
      color: #991b1b;
      padding: 1rem;
      border-radius: 6px;
      margin-bottom: 1.5rem;
      border: 1px solid #fecaca;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .error-icon, .success-icon {
      font-size: 1rem;
      flex-shrink: 0;
    }
    
    .error-text, .success-text {
      font-size: 0.9rem;
      line-height: 1.4;
    }
    
    .success-banner {
      background: #f0fdf4;
      color: #166534;
      padding: 1rem;
      border-radius: 6px;
      margin-bottom: 1.5rem;
      border: 1px solid #bbf7d0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
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
    
    input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
      box-sizing: border-box;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    
    input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
    
    input.error {
      border-color: #ef4444;
    }
    
    input.error:focus {
      border-color: #ef4444;
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
    }
    
    input:disabled {
      background-color: #f9fafb;
      cursor: not-allowed;
      opacity: 0.7;
    }
    
    .password-input-container {
      position: relative;
    }
    
    .password-toggle {
      position: absolute;
      right: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1rem;
      opacity: 0.6;
      transition: opacity 0.2s;
      padding: 0.25rem;
    }
    
    .password-toggle:hover {
      opacity: 1;
    }
    
    .password-toggle:disabled {
      cursor: not-allowed;
      opacity: 0.3;
    }
    
    .field-error {
      color: #ef4444;
      font-size: 0.875rem;
      margin-top: 0.375rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    
    .error-icon-small {
      font-size: 0.875rem;
      flex-shrink: 0;
    }
    
    .submit-btn {
      width: 100%;
      background: #2563eb;
      color: white;
      padding: 0.875rem;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    
    .submit-btn:hover:not(:disabled) {
      background: #1d4ed8;
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(37, 99, 235, 0.3);
    }
    
    .submit-btn:active:not(:disabled) {
      transform: translateY(0);
    }
    
    .submit-btn:disabled {
      background: #9ca3af;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    
    .loading-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid transparent;
      border-top: 2px solid currentColor;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    
    .divider {
      text-align: center;
      margin: 1.5rem 0;
      position: relative;
    }
    
    .divider::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: 1px;
      background: #e5e7eb;
    }
    
    .divider span {
      background: white;
      padding: 0 1rem;
      color: #6b7280;
      font-size: 0.875rem;
    }
    
    .register-link {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .register-link a {
      color: #2563eb;
      text-decoration: none;
    }
    
    .register-link a:hover {
      text-decoration: underline;
    }
    
    .demo-info {
      background: #f3f4f6;
      padding: 1rem;
      border-radius: 4px;
      margin-top: 1rem;
    }
    
    .demo-info h3 {
      margin: 0 0 0.5rem 0;
      font-size: 0.875rem;
      color: #374151;
      text-align: center;
    }
    
    .demo-credentials {
      font-size: 0.75rem;
      color: #6b7280;
    }
    
    .credential {
      background: white;
      padding: 0.75rem;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
    }
  </style>