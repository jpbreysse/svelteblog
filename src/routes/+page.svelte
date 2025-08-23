
<script>
    export let data;
  </script>
  
  <svelte:head>
    <title>UserApp - Home</title>
  </svelte:head>
  
  <div class="home-container">
    {#if data.user}
      <div class="welcome-section">
        <h1>Welcome back, {data.user.first_name}!</h1>
        <p>You are successfully logged in to UserApp.</p>
        
        {#if data.user.role === 'admin'}
          <div class="admin-actions">
            <h2>Admin Actions</h2>
            <a href="/admin" class="action-link">
              <span class="icon">👥</span>
              Manage Users
            </a>
          </div>
        {:else}
          <div class="user-info">
            <h2>Account Information</h2>
            <div class="info-card">
              <p><strong>Name:</strong> {data.user.first_name} {data.user.last_name}</p>
              <p><strong>Email:</strong> {data.user.email}</p>
              <p><strong>Role:</strong> {data.user.role}</p>
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="landing-section">
        <h1>Welcome to UserApp</h1>
        <p>A secure user management system with admin approval workflow.</p>
        
        <div class="auth-actions">
          <a href="/login" class="primary-btn">Sign In</a>
          <a href="/register" class="secondary-btn">Create Account</a>
        </div>
        
        <div class="features">
          <h2>Features</h2>
          <div class="feature-grid">
            <div class="feature">
              <span class="feature-icon">🔐</span>
              <h3>Secure Authentication</h3>
              <p>JWT-based authentication with password hashing</p>
            </div>
            <div class="feature">
              <span class="feature-icon">👨‍💼</span>
              <h3>Admin Approval</h3>
              <p>All new accounts require admin approval before access</p>
            </div>
            <div class="feature">
              <span class="feature-icon">📊</span>
              <h3>User Management</h3>
              <p>Comprehensive admin panel for managing users</p>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
  
  <style>
    .home-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 0;
    }
    
    .welcome-section, .landing-section {
      text-align: center;
    }
    
    h1 {
      color: #1f2937;
      font-size: 2.5rem;
      margin-bottom: 1rem;
    }
    
    .welcome-section p, .landing-section > p {
      color: #6b7280;
      font-size: 1.125rem;
      margin-bottom: 2rem;
    }
    
    .auth-actions {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-bottom: 3rem;
    }
    
    .primary-btn, .secondary-btn {
      padding: 0.75rem 2rem;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 500;
      transition: all 0.2s;
    }
    
    .primary-btn {
      background: #2563eb;
      color: white;
    }
    
    .primary-btn:hover {
      background: #1d4ed8;
    }
    
    .secondary-btn {
      background: white;
      color: #2563eb;
      border: 1px solid #2563eb;
    }
    
    .secondary-btn:hover {
      background: #eff6ff;
    }
    
    .admin-actions, .user-info {
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      margin-top: 2rem;
    }
    
    .admin-actions h2, .user-info h2 {
      color: #1f2937;
      margin-bottom: 1rem;
    }
    
    .action-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem 1.5rem;
      background: #f3f4f6;
      border-radius: 6px;
      text-decoration: none;
      color: #374151;
      transition: background-color 0.2s;
    }
    
    .action-link:hover {
      background: #e5e7eb;
    }
    
    .icon {
      font-size: 1.25rem;
    }
    
    .info-card {
      background: #f9fafb;
      padding: 1.5rem;
      border-radius: 6px;
      text-align: left;
    }
    
    .info-card p {
      margin: 0.5rem 0;
    }
    
    .features {
      margin-top: 3rem;
    }
    
    .features h2 {
      color: #1f2937;
      margin-bottom: 2rem;
    }
    
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 2rem;
      margin-top: 2rem;
    }
    
    .feature {
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    
    .feature-icon {
      font-size: 2rem;
      display: block;
      margin-bottom: 1rem;
    }
    
    .feature h3 {
      color: #1f2937;
      margin-bottom: 0.5rem;
    }
    
    .feature p {
      color: #6b7280;
      font-size: 0.875rem;
    }
  </style>