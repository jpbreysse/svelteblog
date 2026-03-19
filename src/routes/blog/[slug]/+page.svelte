<script>
    import ReportModal from '$lib/components/ReportModal.svelte';
    
    export let data;
    
    // Report modal state
    let showReportModal = false;
    let reportPostData = {};
    
    function formatDate(date) {
      return new Date(date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
    
    function openReportModal() {
      reportPostData = {
        postId: data.post.id,
        postTitle: data.post.title,
        postUrl: window.location.href
      };
      showReportModal = true;
    }
  </script>
  
  <svelte:head>
    <title>{data.post.title} - Blog</title>
    <meta name="description" content={data.post.excerpt}>
  </svelte:head>
  
  <div class="post-container">
    <article class="post-article">
      <header class="post-header">
        <h1 class="post-title">
          {#if data.post.category_post_number}
            <span class="title-prefix">{data.post.category.substring(0, 3).toUpperCase()} #{data.post.category_post_number}:</span>
          {/if}
          {data.post.title}
        </h1>

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

        {#if data.post.chunk_count > 0}
          <div class="header-actions">
            <a href="/chat?post={data.post.id}" class="chat-link" title="Chat about this document">
              💬 Chat About This
            </a>
          </div>
        {/if}
      </header>
      
      <div class="post-content">
        {@html data.post.content}
      </div>
      
      <footer class="post-footer">
        <div class="footer-content">
          <a href="/blog" class="back-link">← Back to Blog</a>
          <div class="footer-actions">
            <button class="report-link" on:click={openReportModal} title="Report content issue">
              ⚠️ Report Issue
            </button>
          </div>
        </div>
      </footer>
    </article>
  </div>
  
  <!-- Report Modal -->
  <ReportModal 
    isOpen={showReportModal}
    postTitle={reportPostData.postTitle}
    postUrl={reportPostData.postUrl}
    postId={reportPostData.postId}
    on:close={() => showReportModal = false}
  />
  
  <style>
    .post-container {
      max-width: 1400px;
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

    .title-prefix {
      color: #2563eb;
      font-weight: 700;
      font-size: 0.7em;
      margin-right: 0.5rem;
      display: inline-block;
    }

    .post-meta {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
      font-size: 1rem;
      color: #6b7280;
      margin-bottom: 1rem;
    }

    .post-number {
      font-weight: 600;
      color: #2563eb;
      margin-left: 0.25rem;
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

    .header-actions {
      margin-top: 1rem;
    }

    .header-actions .chat-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: #dbeafe;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      text-decoration: none;
      transition: all 0.2s;
    }

    .header-actions .chat-link:hover {
      background: #bfdbfe;
      border-color: #93c5fd;
      color: #1e40af;
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
      margin: 0 0 1rem 0;
    }

    /* Collapse empty paragraphs (Quill creates <p><br></p> for blank lines) */
    .post-content :global(p:empty) {
      display: none;
    }

    .post-content :global(p > br:only-child) {
      display: none;
    }

    .post-content :global(br + br) {
      display: none;
    }
    
    .post-content :global(ul),
    .post-content :global(ol) {
      margin: 1rem 0;
      padding-left: 2rem;
      list-style-type: none;
    }
    
    .post-content :global(li) {
      list-style-type: none;
      position: relative;
      padding-left: 1.5em;
      margin: 0.5rem 0;
    }
    
    /* Bullet lists - Quill uses data-list="bullet" */
    .post-content :global(li[data-list="bullet"]::before) {
      content: '\2022';
      position: absolute;
      left: 0;
      color: inherit;
      font-weight: bold;
    }
    
    /* Numbered lists - Quill uses data-list="ordered" */
    .post-content :global(ol) {
      counter-reset: list-0 list-1 list-2 list-3 list-4 list-5;
    }
    
    .post-content :global(li[data-list="ordered"]) {
      counter-increment: list-0;
    }
    
    .post-content :global(li[data-list="ordered"]::before) {
      content: counter(list-0, decimal) ".";
      position: absolute;
      left: 0;
      color: inherit;
      font-weight: bold;
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

    .post-content :global(table) {
      border-collapse: collapse;
      width: 100%;
      margin: 1.5rem 0;
    }

    .post-content :global(th),
    .post-content :global(td) {
      border: 1px solid #d1d5db;
      padding: 0.75rem 1rem;
      text-align: left;
    }

    .post-content :global(th) {
      background: #f3f4f6;
      font-weight: 600;
    }

    .post-content :global(tr:hover) {
      background: #f9fafb;
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
      justify-content: space-between;
      align-items: center;
      padding-top: 2rem;
      border-top: 1px solid #e5e7eb;
    }
    
    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
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
    
    .footer-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .chat-link {
      background: #dbeafe;
      border: 1px solid #bfdbfe;
      color: #1d4ed8;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      text-decoration: none;
      transition: all 0.2s;
    }

    .chat-link:hover {
      background: #bfdbfe;
      border-color: #93c5fd;
      color: #1e40af;
    }

    .report-link {
      background: none;
      border: 1px solid #d1d5db;
      color: #6b7280;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .report-link:hover {
      background: #fee2e2;
      border-color: #fca5a5;
      color: #dc2626;
    }
    
    @media (max-width: 768px) {
      .post-container {
        padding: 0.5rem;
      }

      .post-article {
        padding: 1.5rem 1rem;
        border-radius: 8px;
      }

      .post-title {
        font-size: 1.75rem;
      }

      .post-meta {
        font-size: 0.875rem;
        gap: 0.75rem;
      }

      .post-content {
        font-size: 1rem;
      }

      .footer-content {
        flex-direction: column;
        gap: 1rem;
        align-items: stretch;
      }

      .back-link, .report-link, .chat-link {
        text-align: center;
        justify-content: center;
      }

      .footer-actions {
        flex-wrap: wrap;
      }
    }

    @media (max-width: 480px) {
      .post-container {
        padding: 0;
      }

      .post-article {
        padding: 1rem;
        border-radius: 0;
      }

      .post-title {
        font-size: 1.5rem;
      }

      .post-meta {
        font-size: 0.75rem;
        gap: 0.5rem;
      }
    }
  </style>