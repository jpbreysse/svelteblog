<!-- src/routes/blog/+page.svelte -->
<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    
    export let data;
    
    let posts = [];
    let showEditor = false;
    let editingPost = null;
    let searchQuery = '';
    let selectedCategory = 'all';
    let quill = null;
    let editorContainer;
    let loading = false;
    let categories = [];
    let stats = { posts: 0, categories: 0, tags: 0 };
    
    onMount(async () => {
      await loadPosts();
      await loadCategories();
      await loadStats();
    });
    
    // API functions
    async function loadPosts() {
      loading = true;
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.set('search', searchQuery);
        if (selectedCategory !== 'all') params.set('category', selectedCategory);
        
        const response = await fetch(`/api/posts?${params}`);
        const result = await response.json();
        
        if (result.success) {
          posts = result.posts.map(post => ({
            ...post,
            created_at: new Date(post.created_at),
            updated_at: new Date(post.updated_at)
          }));
        } else {
          console.error('Failed to load posts:', result.error);
          posts = [];
        }
      } catch (error) {
        console.error('Error loading posts:', error);
        posts = [];
      } finally {
        loading = false;
      }
    }
    
    async function loadCategories() {
      try {
        const response = await fetch('/api/categories');
        const result = await response.json();
        
        if (result.success) {
          categories = result.categories;
        }
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    }
    
    async function loadStats() {
      try {
        const response = await fetch('/api/stats');
        const result = await response.json();
        
        if (result.success) {
          stats = result.stats;
        }
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    }
    
    async function savePost() {
      if (!data.user) {
        alert('You must be logged in to write posts');
        goto('/login');
        return;
      }
      
      if (!editingPost.title.trim()) {
        alert('Please add a title for your post');
        return;
      }
      
      // Get latest content from Quill
      if (quill) {
        editingPost.content = quill.root.innerHTML;
      }
      
      if (!editingPost.content.trim()) {
        alert('Please add some content to your post');
        return;
      }
      
      loading = true;
      try {
        const postData = {
          title: editingPost.title,
          content: editingPost.content,
          category: editingPost.category,
          tags: editingPost.tags || []
        };
        
        let response;
        if (editingPost.id) {
          // Update existing post
          response = await fetch(`/api/posts/${editingPost.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postData)
          });
        } else {
          // Create new post
          response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postData)
          });
        }
        
        const result = await response.json();
        
        if (result.success) {
          alert('✅ Post saved successfully!');
          showEditor = false;
          editingPost = null;
          quill = null;
          await loadPosts();
          await loadStats();
        } else {
          alert(`❌ Error saving post: ${result.error}`);
        }
      } catch (error) {
        console.error('Error saving post:', error);
        alert('❌ Failed to save post. Please try again.');
      } finally {
        loading = false;
      }
    }
    
    async function deletePost(postId) {
      if (!confirm('Are you sure you want to delete this post?')) return;
      
      loading = true;
      try {
        const response = await fetch(`/api/posts/${postId}`, {
          method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
          alert('✅ Post deleted successfully!');
          await loadPosts();
          await loadStats();
        } else {
          alert(`❌ Error deleting post: ${result.error}`);
        }
      } catch (error) {
        console.error('Error deleting post:', error);
        alert('❌ Failed to delete post. Please try again.');
      } finally {
        loading = false;
      }
    }
    
    // Initialize Quill when editor is shown
    async function initEditor() {
      if (!editorContainer) return;
      
      try {
        const QuillModule = await import('quill');
        const Quill = QuillModule.default;
        
        quill = new Quill(editorContainer, {
          theme: 'snow',
          placeholder: 'Share your thoughts...',
          modules: {
            toolbar: [
              [{ 'header': [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ 'color': [] }, { 'background': [] }],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              [{ 'align': [] }],
              ['blockquote', 'code-block'],
              ['link'],
              ['clean']
            ]
          }
        });
        
        // Set initial content if editing
        if (editingPost.content) {
          quill.root.innerHTML = editingPost.content;
        }
        
        // Update content as user types
        quill.on('text-change', () => {
          editingPost.content = quill.root.innerHTML;
        });
        
      } catch (error) {
        console.error('Failed to initialize editor:', error);
      }
    }
    
    function createNewPost() {
      if (!data.user) {
        alert('You must be logged in to write posts');
        goto('/login');
        return;
      }
      
      editingPost = {
        id: null,
        title: '',
        content: '',
        category: 'thoughts',
        tags: []
      };
      showEditor = true;
      setTimeout(initEditor, 100);
    }
    
    function editPost(post) {
      if (!data.user) {
        alert('You must be logged in to edit posts');
        goto('/login');
        return;
      }
      
      // Check if user can edit this post
      if (post.author_id !== data.user.id && data.user.role !== 'admin') {
        alert('You can only edit your own posts');
        return;
      }
      
      editingPost = { 
        ...post,
        tags: post.tags || []
      };
      showEditor = true;
      setTimeout(initEditor, 100);
    }
    
    function cancelEdit() {
      showEditor = false;
      editingPost = null;
      quill = null;
    }
    
    // Reactive search and filtering
    $: {
      if (searchQuery !== undefined || selectedCategory !== undefined) {
        const debounceTimer = setTimeout(loadPosts, 300);
      }
    }
    
    function formatDate(date) {
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
    
    function handleTagsInput(event) {
      const value = event.target.value;
      if (typeof value === 'string') {
        editingPost.tags = value.split(',').map(tag => tag.trim()).filter(tag => tag);
      }
    }
    
    function canEditPost(post) {
      return data.user && (post.author_id === data.user.id || data.user.role === 'admin');
    }
  </script>
  
  <svelte:head>
    <title>Blog - UserApp - Version1</title>
    <meta name="description" content="Share your thoughts and stories">
    <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
  </svelte:head>
  
  <div class="blog-container">
    {#if showEditor}
      <!-- Editor View -->
      <div class="editor-section">
        <div class="editor-header">
          <h1>✍️ {editingPost.id ? 'Edit Post' : 'New Post'}</h1>
          <div class="editor-actions">
            <button class="btn btn-secondary" on:click={cancelEdit} disabled={loading}>
              Cancel
            </button>
          </div>
        </div>
        
        <div class="post-meta-form">
          <input 
            bind:value={editingPost.title}
            placeholder="Your post title..."
            class="title-input"
            disabled={loading}
          />
          
          <div class="meta-row">
            <select bind:value={editingPost.category} class="category-select" disabled={loading}>
              <option value="thoughts">Thoughts</option>
              <option value="reflections">Reflections</option>
              <option value="lifestyle">Lifestyle</option>
              <option value="creative">Creative</option>
              <option value="personal">Personal</option>
              <option value="tech">Technology</option>
              <option value="tutorial">Tutorial</option>
              <option value="politics">Politics</option>
            </select>
            
            <input 
              value={editingPost.tags ? editingPost.tags.join(', ') : ''}
              on:blur={handleTagsInput}
              placeholder="Tags (comma separated)"
              class="tags-input"
              disabled={loading}
            />
          </div>
        </div>
        
        <div class="editor-wrapper">
          <div bind:this={editorContainer} id="blog-editor" class="quill-editor-container"></div>
        </div>
        
        <div class="editor-footer">
          <button class="btn btn-primary" on:click={savePost} disabled={loading || !editingPost.title?.trim()}>
            {loading ? '⏳ Saving...' : '📝 Save Post'}
          </button>
          <button class="btn btn-secondary" on:click={cancelEdit} disabled={loading}>
            ❌ Cancel
          </button>
        </div>
      </div>
    {:else}
      <!-- Blog View -->
      <header class="blog-header">
        <div class="header-content">
          <div class="blog-info">
            <h1 class="blog-title">📝 Community Blog</h1>
            <p class="blog-description">Share your thoughts, stories, and insights with the community</p>
            <div class="blog-stats">
              <span class="stat">📝 {stats.posts} posts</span>
              <span class="stat">📂 {stats.categories} categories</span>
              <span class="stat">🏷️ {stats.tags} tags</span>
            </div>
          </div>
          
          {#if data.user}
            <button class="btn btn-primary write-btn" on:click={createNewPost} disabled={loading}>
              ✍️ Write New Post
            </button>
          {:else}
            <div class="auth-prompt">
              <p>Want to share your thoughts?</p>
              <a href="/login" class="btn btn-primary">Sign In to Write</a>
            </div>
          {/if}
        </div>
      </header>
      
      <!-- Search and Filter -->
      <div class="search-section">
        <div class="search-controls">
          <div class="search-bar">
            <input 
              bind:value={searchQuery}
              placeholder="Search posts..."
              class="search-input"
              disabled={loading}
            />
            <span class="search-icon">🔍</span>
          </div>
          
          <select bind:value={selectedCategory} class="category-filter" disabled={loading}>
            <option value="all">All Categories</option>
            {#each categories as category}
              <option value={category.category}>
                {category.category.charAt(0).toUpperCase() + category.category.slice(1)} ({category.count})
              </option>
            {/each}
          </select>
        </div>
      </div>
      
      <!-- Posts Section -->
      <main class="posts-section">
        {#if loading}
          <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading posts...</p>
          </div>
        {:else if posts.length === 0}
          <div class="empty-state">
            <div class="empty-icon">📝</div>
            <h2>No posts found</h2>
            <p>
              {searchQuery || selectedCategory !== 'all' 
                ? 'Try adjusting your search or filter' 
                : 'Be the first to share your thoughts with the community!'}
            </p>
            {#if !searchQuery && selectedCategory === 'all' && data.user}
              <button class="btn btn-primary" on:click={createNewPost}>
                Write the First Post
              </button>
            {/if}
          </div>
        {:else}
          <div class="posts-grid">
            {#each posts as post (post.id)}
              <article class="post-card">
                <div class="post-header">
                  <h2 class="post-title">{post.title}</h2>
                  <div class="post-actions">
                    {#if canEditPost(post)}
                      <button class="action-btn" on:click={() => editPost(post)} title="Edit" disabled={loading}>
                        ✏️
                      </button>
                      <button class="action-btn delete-btn" on:click={() => deletePost(post.id)} title="Delete" disabled={loading}>
                        🗑️
                      </button>
                    {/if}
                  </div>
                </div>
                
                <div class="post-meta">
                  <span class="author">👤 {post.author}</span>
                  <span class="date">{formatDate(post.created_at)}</span>
                  <span class="read-time">⏱️ {post.read_time}</span>
                  <span class="category">📂 {post.category}</span>
                </div>
                
                <div class="post-excerpt">
                  {@html post.excerpt}
                </div>
                
                {#if post.tags && post.tags.length > 0}
                  <div class="post-tags">
                    {#each post.tags as tag}
                      <span class="tag">🏷️ {tag}</span>
                    {/each}
                  </div>
                {/if}
                
                <div class="post-footer">
                  <a href="/blog/{post.slug}" class="read-more">Read More →</a>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </main>
    {/if}
  </div>
  
  <style>
    .blog-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    /* Header Styles */
    .blog-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 3rem 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
    }
    
    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 2rem;
    }
    
    .blog-title {
      font-size: 2.5rem;
      margin: 0 0 0.5rem 0;
      font-weight: 700;
    }
    
    .blog-description {
      font-size: 1.125rem;
      margin: 0 0 1rem 0;
      opacity: 0.9;
    }
    
    .blog-stats {
      display: flex;
      gap: 2rem;
      flex-wrap: wrap;
    }
    
    .stat {
      font-size: 0.875rem;
      opacity: 0.8;
    }
    
    .auth-prompt {
      text-align: center;
    }
    
    .auth-prompt p {
      margin: 0 0 1rem 0;
      font-size: 1rem;
    }
    
    /* Search Section */
    .search-section {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      margin-bottom: 2rem;
    }
    
    .search-controls {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
    
    .search-bar {
      position: relative;
      flex: 1;
      min-width: 300px;
    }
    
    .search-input {
      width: 100%;
      padding: 0.75rem 2.5rem 0.75rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
      box-sizing: border-box;
    }
    
    .search-icon {
      position: absolute;
      right: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      color: #6b7280;
    }
    
    .category-filter {
      padding: 0.75rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
      min-width: 200px;
    }
    
    /* Button Styles */
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
    
    /* Posts Grid */
    .posts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      gap: 2rem;
    }
    
    .post-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .post-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 15px rgba(0, 0, 0, 0.15);
    }
    
    .post-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }
    
    .post-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
      margin: 0;
      flex: 1;
    }
    
    .post-actions {
      display: flex;
      gap: 0.5rem;
    }
    
    .action-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 4px;
      transition: background-color 0.2s;
    }
    
    .action-btn:hover:not(:disabled) {
      background: #f3f4f6;
    }
    
    .delete-btn:hover:not(:disabled) {
      background: #fee2e2;
    }
    
    .post-meta {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 1rem;
    }
    
    .post-excerpt {
      color: #4b5563;
      line-height: 1.6;
      margin-bottom: 1rem;
    }
    
    .post-tags {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    
    .tag {
      background: #f3f4f6;
      color: #374151;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
    }
    
    .post-footer {
      border-top: 1px solid #e5e7eb;
      padding-top: 1rem;
    }
    
    .read-more {
      color: #2563eb;
      text-decoration: none;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .read-more:hover {
      text-decoration: underline;
    }
    
    /* Editor Styles */
    .editor-section {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .editor-header h1 {
      margin: 0;
      color: #1f2937;
    }
    
    .post-meta-form {
      margin-bottom: 2rem;
    }
    
    .title-input {
      width: 100%;
      padding: 1rem;
      font-size: 1.5rem;
      font-weight: 600;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      margin-bottom: 1rem;
      box-sizing: border-box;
    }
    
    .meta-row {
      display: grid;
      grid-template-columns: 200px 1fr;
      gap: 1rem;
    }
    
    .category-select, .tags-input {
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
    }
    
    .editor-wrapper {
      margin-bottom: 2rem;
    }
    
    .quill-editor-container {
      min-height: 300px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
    }
    
    .editor-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
    }
    
    /* Loading and Empty States */
    .loading-state, .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: #6b7280;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f4f6;
      border-top: 4px solid #2563eb;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    
    .empty-state h2 {
      color: #374151;
      margin-bottom: 0.5rem;
    }
    
    /* Responsive Design */
    @media (max-width: 768px) {
      .blog-container {
        padding: 1rem;
      }
      
      .header-content {
        flex-direction: column;
        text-align: center;
      }
      
      .blog-title {
        font-size: 2rem;
      }
      
      .search-controls {
        flex-direction: column;
      }
      
      .search-bar {
        min-width: auto;
      }
      
      .posts-grid {
        grid-template-columns: 1fr;
      }
      
      .meta-row {
        grid-template-columns: 1fr;
      }
      
      .post-meta {
        font-size: 0.8rem;
      }
      
      .editor-footer {
        flex-direction: column;
        gap: 1rem;
      }
    }
  </style>