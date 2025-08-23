<script>
    import { page } from '$app/stores';
  </script>
  
  <svelte:head>
    <title>Post Not Found - Blog</title>
  </svelte:head>
  
  <div class="error-container">
    <div class="error-content">
      <div class="error-icon">📝</div>
      <h1>Post Not Found</h1>
      <p>
        {$page.error?.message || 'The blog post you are looking for could not be found.'}
      </p>
      
      {#if $page.error?.hint}
        <p class="error-hint">{$page.error.hint}</p>
      {/if}
      
      <div class="error-actions">
        <a href="/blog" class="btn btn-primary">← Back to Blog</a>
        <a href="/" class="btn btn-secondary">Go Home</a>
      </div>
    </div>
  </div>
  
  <style>
    .error-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 70vh;
      padding: 2rem;
    }
    
    .error-content {
      text-align: center;
      max-width: 500px;
    }
    
    .error-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    
    h1 {
      color: #1f2937;
      font-size: 2rem;
      margin-bottom: 1rem;
    }
    
    p {
      color: #6b7280;
      margin-bottom: 1rem;
      line-height: 1.6;
    }
    
    .error-hint {
      font-size: 0.875rem;
      font-style: italic;
    }
    
    .error-actions {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-top: 2rem;
      flex-wrap: wrap;
    }
    
    .btn {
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 500;
      transition: all 0.2s;
    }
    
    .btn-primary {
      background: #2563eb;
      color: white;
    }
    
    .btn-primary:hover {
      background: #1d4ed8;
    }
    
    .btn-secondary {
      background: #6b7280;
      color: white;
    }
    
    .btn-secondary:hover {
      background: #5b6470;
    }
    
    @media (max-width: 480px) {
      .error-actions {
        flex-direction: column;
      }
    }
  </style>