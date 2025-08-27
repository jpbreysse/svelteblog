<script>
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import { invalidateAll } from '$app/navigation';  // Add this import
    
    export let form;
    export let data;
    
    // Redirect if already logged in
    if (data.user) {
      goto('/');
    }
    
    let loading = false;
  </script>
  
  <svelte:head>
    <title>Sign In - UserApp</title>
  </svelte:head>
  
  <div class="login-container">
    <div class="login-card">
      <h1>Sign In</h1>
      <p>Welcome back! Please sign in to your account.</p>
      
      {#if form?.error}
        <div class="error-banner">
          {form.error}
        </div>
      {/if}
      
      <form method="POST" use:enhance={() => {
        loading = true;
        return async ({ result }) => {
          loading = false;
          if (result.type === 'redirect') {
            await invalidateAll(); 
            goto(result.location);
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
            value={form?.email || ''}
            class:error={form?.fieldErrors?.email}
          />
          {#if form?.fieldErrors?.email}
            <span class="error-message">{form.fieldErrors.email}</span>
          {/if}
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input 
            type="password" 
            id="password" 
            name="password" 
            required
            class:error={form?.fieldErrors?.password}
          />
          {#if form?.fieldErrors?.password}
            <span class="error-message">{form.fieldErrors.password}</span>
          {/if}
        </div>
        
        <button type="submit" disabled={loading} class="submit-btn">
          {loading ? 'Signing In...' : 'Sign In'}
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
      background: #fee2e2;
      color: #991b1b;
      padding: 0.75rem;
      border-radius: 4px;
      margin-bottom: 1.5rem;
      text-align: center;
      font-size: 0.875rem;
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
      border-radius: 4px;
      font-size: 1rem;
      box-sizing: border-box;
    }
    
    input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
    
    input.error {
      border-color: #ef4444;
    }
    
    .error-message {
      color: #ef4444;
      font-size: 0.875rem;
      margin-top: 0.25rem;
      display: block;
    }
    
    .submit-btn {
      width: 100%;
      background: #2563eb;
      color: white;
      padding: 0.75rem;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      transition: background-color 0.2s;
      margin-bottom: 1.5rem;
    }
    
    .submit-btn:hover:not(:disabled) {
      background: #1d4ed8;
    }
    
    .submit-btn:disabled {
      background: #9ca3af;
      cursor: not-allowed;
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