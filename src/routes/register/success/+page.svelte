<svelte:head>
  <title>Registration Successful - UserApp</title>
</svelte:head>

<div class="success-container">
  <div class="success-card">
    <div class="success-icon">✅</div>
    <h1>Registration Successful!</h1>
    <p>Your account has been created successfully. However, you'll need to wait for an administrator to approve your account before you can sign in.</p>
    
    <div class="next-steps">
      <h2>What happens next?</h2>
      <ol>
        <li>An administrator will review your registration</li>
        <li>You'll be notified once your account is approved</li>
        <li>You can then sign in using your credentials</li>
      </ol>
    </div>
    
    <div class="actions">
      <a href="/" class="primary-btn">Return Home</a>
      <a href="/login" class="secondary-btn">Try Signing In</a>
    </div>
  </div>
</div>

<style>
  .success-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 70vh;
  }
  
  .success-card {
    background: white;
    padding: 3rem 2rem;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    max-width: 500px;
    text-align: center;
  }
  
  .success-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }
  
  h1 {
    color: #059669;
    margin-bottom: 1rem;
  }
  
  p {
    color: #6b7280;
    margin-bottom: 2rem;
    line-height: 1.6;
  }
  
  .next-steps {
    background: #f0fdf4;
    padding: 1.5rem;
    border-radius: 6px;
    margin-bottom: 2rem;
    text-align: left;
  }
  
  .next-steps h2 {
    color: #059669;
    font-size: 1.125rem;
    margin-bottom: 1rem;
  }
  
  .next-steps ol {
    color: #374151;
    margin: 0;
    padding-left: 1.5rem;
  }
  
  .next-steps li {
    margin-bottom: 0.5rem;
  }
  
  .actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }
  
  .primary-btn, .secondary-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
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
    color: #6b7280;
    border: 1px solid #d1d5db;
  }
  
  .secondary-btn:hover {
    background: #f9fafb;
    color: #374151;
  }
</style>