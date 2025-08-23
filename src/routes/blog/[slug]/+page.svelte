<script>
    export let data;
    
    function formatDate(date) {
      return new Date(date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  </script>
  
  <svelte:head>
    <title>{data.post.title} - Blog</title>
    <meta name="description" content={data.post.excerpt}>
  </svelte:head>
  
  <div class="post-container">
    <article class="post-article">
      <header class="post-header">
        <h1 class="post-title">{data.post.title}</h1>
        
        <div class="post-meta">
          <span class="author">👤 {data.post.author}</span>
          <span class="date">📅 {formatDate(data.post.created_at)}</span>
          <span class="read-time">⏱️ {data.post.read_time}</span>
          <span class="category">📂 {data.post.category}</span>
        </div>
        
        {#if data.post.tags && data.post.tags.length > 0}
          <div class="post-tags">
            {#each data.post.tags as tag}
              <span class="tag">🏷️ {tag}</span>
            {/each}
          </div>
        {/if}
      </header>
      
      <div class="post-content">
        {@html data.post.content}
      </div>
      
      <footer class="post-footer">
        <a href="/blog" class="back-link">← Back to Blog</a>
      </footer>
    </article>
  </div>
  
  <style>
    .post-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    .post-article {
      background: white;
      border-radius: 12px;
      padding: 3rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .post-header {
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .post-title {
      font-size: 2.5rem;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 1.5rem 0;
      line-height: 1.2;
    }
    
    .post-meta {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
      font-size: 1rem;
      color: #6b7280;
      margin-bottom: 1rem;
    }
    
    .post-tags {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    
    .tag {
      background: #f3f4f6;
      color: #374151;
      padding: 0.375rem 0.75rem;
      border-radius: 6px;
      font-size: 0.875rem;
    }
    
    .post-content {
      font-size: 1.125rem;
      line-height: 1.8;
      color: #374151;
      margin-bottom: 3rem;
    }
    
    .post-content :global(h1),
    .post-content :global(h2),
    .post-content :global(h3) {
      color: #1f2937;
      margin: 2rem 0 1rem 0;
    }
    
    .post-content :global(h1) {
      font-size: 2rem;
    }
    
    .post-content :global(h2) {
      font-size: 1.5rem;
    }
    
    .post-content :global(h3) {
      font-size: 1.25rem;
    }
    
    .post-content :global(p) {
      margin: 1rem 0;
    }
    
    .post-content :global(ul),
    .post-content :global(ol) {
      margin: 1rem 0;
      padding-left: 2rem;
    }
    
    .post-content :global(li) {
      margin: 0.5rem 0;
    }
    
    .post-content :global(blockquote) {
      border-left: 4px solid #2563eb;
      padding-left: 1rem;
      margin: 1.5rem 0;
      font-style: italic;
      color: #6b7280;
      background: #f8fafc;
      padding: 1rem;
      border-radius: 0 6px 6px 0;
    }
    
    .post-content :global(code) {
      background: #f3f4f6;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
    }
    
    .post-content :global(pre) {
      background: #1f2937;
      color: #f9fafb;
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
      margin: 1.5rem 0;
    }
    
    .post-content :global(pre code) {
      background: transparent;
      padding: 0;
      color: inherit;
    }
    
    .post-content :global(img) {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 1.5rem 0;
    }
    
    .post-content :global(a) {
      color: #2563eb;
      text-decoration: underline;
    }
    
    .post-content :global(a:hover) {
      color: #1d4ed8;
    }
    
    .post-footer {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      padding-top: 2rem;
      border-top: 1px solid #e5e7eb;
    }
    
    .back-link {
      color: #2563eb;
      text-decoration: none;
      font-weight: 500;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      transition: background-color 0.2s;
    }
    
    .back-link:hover {
      background: #eff6ff;
      text-decoration: none;
    }
    
    @media (max-width: 768px) {
      .post-container {
        padding: 1rem;
      }
      
      .post-article {
        padding: 2rem 1.5rem;
      }
      
      .post-title {
        font-size: 2rem;
      }
      
      .post-meta {
        font-size: 0.875rem;
        gap: 1rem;
      }
      
      .post-content {
        font-size: 1rem;
      }
    }
  </style>