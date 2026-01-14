<!-- src/routes/blog/+page.svelte -->
<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { invalidateAll, invalidate } from '$app/navigation';
    import { page } from '$app/stores';
    import { browser } from '$app/environment';
    import { PUBLIC_APP_NAME, PUBLIC_APP_DESCRIPTION } from '$env/static/public';
    import ReportModal from '$lib/components/ReportModal.svelte';
    import PostPermissions from '$lib/components/PostPermissions.svelte';
    import { getCategories, getDefaultCategory } from '$lib/categories';
    
    export let data;
    
    // Use server-loaded data - these will be reactive to data changes
    $: posts = data.posts || [];
    $: categories = data.categories || [];
    $: authors = data.authors || [];
    $: stats = data.stats || { posts: 0, categories: 0, tags: 0 };
    $: searchQuery = data.searchQuery || '';
    $: selectedCategory = data.categoryFilter || 'all';
    $: selectedAuthor = data.authorFilter || 'all';
    $: paths = data.paths || [];
    
    // Handle edit post from URL parameter
    $: if (data.editPost && !showEditor && !closingEditor) {
      editPost(data.editPost);
    }
    
    // Get available categories from environment
    const availableCategories = getCategories();
    const defaultCategory = getDefaultCategory();
    
    // Debug reactive updates
    $: console.log('🔄 Posts updated, count:', posts.length);

    let showEditor = false;
    let editingPost = null;
    let quill = null;
    let editorContainer;
    let loading = false;
    let closingEditor = false; // Flag to prevent reactive reopening after save/cancel
    let userGroups = []; // User's groups for permissions
    let hasOpenedNewPost = false; // Track if we've already opened the new post editor for this URL

    // Watch for ?new=true in URL and open editor (works for client-side navigation)
    $: if (browser && $page.url.searchParams.get('new') === 'true' && data.user && !showEditor && !closingEditor && !hasOpenedNewPost) {
        hasOpenedNewPost = true;
        openNewPostEditor();
    }

    // Reset the flag when URL changes away from new=true
    $: if (browser && $page.url.searchParams.get('new') !== 'true') {
        hasOpenedNewPost = false;
    }

    function openNewPostEditor() {
        const pathId = $page.url.searchParams.get('path_id');
        const selectedPathId = pathId ? parseInt(pathId) : null;

        editingPost = {
            id: null,
            title: '',
            content: '',
            excerpt: '',
            category: defaultCategory,
            tags: [],
            path_id: selectedPathId,
            published: false,
            visibility: 'public',
            readGroupIds: [],
            writeGroupIds: []
        };
        showEditor = true;
        setTimeout(initEditor, 100);

        // Clear the new=true parameter from URL
        const newUrl = new URL(window.location);
        newUrl.searchParams.delete('new');
        window.history.replaceState({}, '', newUrl);
    }

    // Compute which posts the user can edit (reactive to userGroups changes)
    $: editablePosts = new Set(
      posts
        .filter(post => {
          if (!data.user) return false;
          if (post.author_id === data.user.id || data.user.role === 'admin') return true;
          if (post.visibility === 'groups' && userGroups.length > 0) return true;
          return false;
        })
        .map(post => post.id)
    );

    // Log when editablePosts changes
    $: console.log('🔄 Editable posts updated:', editablePosts.size, 'posts can be edited');

    // Report modal state
    let showReportModal = false;
    let reportPostData = {};
    
    // Validation constants
    const VALIDATION_LIMITS = {
      title: { max: 200, warning: 180 },
      content: { max: 50000, warning: 45000 },
      tags: { max: 10, tagLength: 30 },
      excerpt: { max: 500 }
    };
    
    // Validation state
    let validationErrors = [];
    let validationWarnings = [];
    
    // Reactive validation
    $: if (editingPost) {
      validatePost();
    }
    
    onMount(async () => {
      // Note: New post creation is now handled by the reactive $page statement above
      // This allows it to work with client-side navigation too

      // Load all groups for permissions (users can assign any group)
      if (data.user) {
        try {
          console.log('📡 Fetching all groups');
          const groupsResponse = await fetch('/api/groups');
          console.log('📡 Response status:', groupsResponse.status);
          const groupsData = await groupsResponse.json();
          console.log('📡 Response data:', groupsData);
          if (groupsData.success) {
            userGroups = groupsData.groups || [];
            console.log('✅ Loaded groups:', userGroups);
          } else {
            console.error('❌ API returned error:', groupsData.error);
          }
        } catch (error) {
          console.error('❌ Failed to load groups:', error);
        }
      }
    });
    
    // Function to handle search form submission
    function handleSearch() {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (selectedAuthor !== 'all') params.set('author', selectedAuthor);

      const url = `/blog${params.toString() ? '?' + params.toString() : ''}`;
      goto(url);
    }
    
    // Debounced search
    let searchTimeout;
    function debounceSearch() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(handleSearch, 500);
    }
    
    // Validation function
    function validatePost() {
      if (!editingPost) return;
      
      validationErrors = [];
      validationWarnings = [];
      
      // Title validation
      if (editingPost.title) {
        if (editingPost.title.length > VALIDATION_LIMITS.title.max) {
          validationErrors.push(`Title must be ${VALIDATION_LIMITS.title.max} characters or less`);
        } else if (editingPost.title.length > VALIDATION_LIMITS.title.warning) {
          validationWarnings.push(`Title is getting long (${editingPost.title.length}/${VALIDATION_LIMITS.title.max})`);
        }
      }
      
      // Content validation
      if (editingPost.content && quill) {
        const textContent = quill.getText().trim();
        if (textContent.length > VALIDATION_LIMITS.content.max) {
          validationErrors.push(`Content must be ${VALIDATION_LIMITS.content.max} characters or less`);
        } else if (textContent.length > VALIDATION_LIMITS.content.warning) {
          validationWarnings.push(`Content is getting very long (${textContent.length.toLocaleString()}/${VALIDATION_LIMITS.content.max.toLocaleString()})`);
        }
      }
      
      // Tags validation
      if (editingPost.tags && editingPost.tags.length > 0) {
        if (editingPost.tags.length > VALIDATION_LIMITS.tags.max) {
          validationErrors.push(`Maximum ${VALIDATION_LIMITS.tags.max} tags allowed`);
        }
        
        editingPost.tags.forEach((tag, index) => {
          if (tag.length > VALIDATION_LIMITS.tags.tagLength) {
            validationErrors.push(`Tag "${tag}" is too long (max ${VALIDATION_LIMITS.tags.tagLength} characters)`);
          }
        });
        
        if (editingPost.tags.length > 7) {
          validationWarnings.push(`Consider using fewer tags for better organization`);
        }
      }
    }
    
    // Get content length for display
    function getContentLength() {
      if (!quill) return 0;
      return quill.getText().trim().length;
    }
    
    async function savePost() {
      if (!data.user) {
        alert('You must be logged in to write posts');
        goto('/login');
        return;
      }
      
      // Basic validation
      if (!editingPost.title?.trim()) {
        alert('Please add a title for your post');
        return;
      }
      
      // Get latest content from Quill
      if (quill) {
        editingPost.content = quill.root.innerHTML;
      }
      
      if (!editingPost.content?.trim()) {
        alert('Please add some content to your post');
        return;
      }
      
      // Check for validation errors
      validatePost();
      if (validationErrors.length > 0) {
        alert(`Please fix the following issues:\n• ${validationErrors.join('\n• ')}`);
        return;
      }
      
      // Show warnings but allow saving
      if (validationWarnings.length > 0) {
        const proceed = confirm(`Warning:\n• ${validationWarnings.join('\n• ')}\n\nDo you want to continue saving?`);
        if (!proceed) return;
      }
      
      loading = true;
      try {
        const postData = {
          title: editingPost.title,
          content: editingPost.content,
          category: editingPost.category,
          tags: editingPost.tags || [],
          path_id: editingPost.path_id || null,  // Use null if no path selected
          visibility: editingPost.visibility || 'public',
          readGroupIds: editingPost.readGroupIds || [],
          writeGroupIds: editingPost.writeGroupIds || []
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
          console.log('✅ Post saved successfully:', result);
          // Set flag to prevent reactive statement from reopening editor
          closingEditor = true;
          // Properly clean up editor
          if (editorContainer) {
            editorContainer.innerHTML = '';
          }
          showEditor = false;
          editingPost = null;
          quill = null;
          // Check if there's a return URL parameter to go back to where user came from
          const urlParams = new URLSearchParams(window.location.search);
          const returnUrl = urlParams.get('return');
          const destination = returnUrl || '/blog';
          console.log('🔄 Navigating to:', destination);
          await goto(destination, { replaceState: true });
          // Invalidate to refresh the post list
          await invalidateAll();
          // Reset flag after navigation completes
          closingEditor = false;
          console.log('✅ Post saved and page refreshed');
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
          // Invalidate all data and reload current page
          await invalidateAll();
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
        
        // Update content as user types and validate
        quill.on('text-change', () => {
          editingPost.content = quill.root.innerHTML;
          // Debounce validation to avoid excessive checks
          clearTimeout(window.validationTimeout);
          window.validationTimeout = setTimeout(validatePost, 300);
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

      // Reset closing flag when opening editor
      closingEditor = false;

      editingPost = {
        id: null,
        title: '',
        content: '',
        category: defaultCategory,
        tags: [],
        path_id: paths.length > 0 ? paths[0].id : null,  // Use first available path or null
        visibility: 'public',
        readGroupIds: [],
        writeGroupIds: []
      };
      showEditor = true;
      setTimeout(initEditor, 100);
    }
    
    async function editPost(post) {
      if (!data.user) {
        alert('You must be logged in to edit posts');
        goto('/login');
        return;
      }

      // Permission check removed - server will validate using group permissions
      // For group-based posts, users in write groups can edit

      // Reset closing flag when opening editor
      closingEditor = false;

      // Load post permissions
      let readGroupIds = [];
      let writeGroupIds = [];

      if (post.id) {
        try {
          console.log('📡 Loading permissions for post:', post.id);
          const permResponse = await fetch(`/api/posts/${post.id}/permissions`);
          const permData = await permResponse.json();
          console.log('📡 Permissions data:', permData);

          if (permData.success) {
            readGroupIds = permData.readGroups || [];
            writeGroupIds = permData.writeGroups || [];
            console.log('✅ Loaded permissions - read:', readGroupIds, 'write:', writeGroupIds);
          }
        } catch (error) {
          console.error('❌ Failed to load permissions:', error);
        }
      }

      editingPost = {
        ...post,
        tags: post.tags || [],
        visibility: post.visibility || 'public',
        readGroupIds,
        writeGroupIds
      };
      showEditor = true;
      setTimeout(initEditor, 100);
    }
    
    function cancelEdit() {
      // Set flag to prevent reactive statement from reopening editor
      closingEditor = true;

      // Properly destroy Quill editor to prevent conflicts on next initialization
      if (quill) {
        quill = null;
      }

      // Clear the editor container's content
      if (editorContainer) {
        editorContainer.innerHTML = '';
      }

      showEditor = false;
      editingPost = null;

      // Check if there's a return URL parameter to go back to where user came from
      const urlParams = new URLSearchParams(window.location.search);
      const returnUrl = urlParams.get('return');

      // Clear edit parameter from URL to prevent editor from reopening on refresh
      if (window.location.search.includes('edit=') || returnUrl) {
        const destination = returnUrl || '/blog';
        goto(destination, { replaceState: true }).then(() => {
          // Reset flag after navigation
          closingEditor = false;
        });
      } else {
        // Reset flag immediately if no navigation needed
        closingEditor = false;
      }
    }
    
    // Reactive search and filtering - remove this old code
    // $: {
    //   if (searchQuery !== undefined || selectedCategory !== undefined) {
    //     const debounceTimer = setTimeout(loadPosts, 300);
    //   }
    // }
    
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
      // Use the reactive editablePosts Set
      const canEdit = editablePosts.has(post.id);
      if (!canEdit && post.visibility === 'groups') {
        console.log('Cannot edit group post:', post.id, 'userGroups:', userGroups.length);
      }
      return canEdit;
    }
    
    // Format path for display with hierarchy
    function formatPathDisplay(path) {
      if (!path) return '📁 Root';
      
      // Show indentation for nested paths
      const indent = path.level > 1 ? '—'.repeat(path.level - 1) + ' ' : '';
      return `${indent}📁 ${path.name}`;
    }
    
    // Report modal functions
    function openReportModal(post = null) {
      reportPostData = {
        postId: post?.id || '',
        postTitle: post?.title || 'General Content Issue',
        postUrl: post ? `${window.location.origin}/blog/${post.slug}` : window.location.href
      };
      showReportModal = true;
    }
  </script>
  
  <svelte:head>
    <title>Blog - {PUBLIC_APP_NAME}</title>
    <meta name="description" content={PUBLIC_APP_DESCRIPTION}>
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

        <div class="editor-layout">
          <!-- Left Sidebar: Permissions -->
          <aside class="editor-sidebar">
            <PostPermissions
              bind:visibility={editingPost.visibility}
              bind:readGroupIds={editingPost.readGroupIds}
              bind:writeGroupIds={editingPost.writeGroupIds}
              availableGroups={userGroups}
            />
          </aside>

          <!-- Main Content Area -->
          <div class="editor-main">
            <div class="post-meta-form">
              <div class="input-group">
                <input
                  bind:value={editingPost.title}
                  placeholder="Your post title..."
                  class="title-input"
                  class:warning={editingPost.title && editingPost.title.length > VALIDATION_LIMITS.title.warning}
                  class:error={editingPost.title && editingPost.title.length > VALIDATION_LIMITS.title.max}
                  maxlength={VALIDATION_LIMITS.title.max + 50}
                  disabled={loading}
                />
                <div class="char-counter" class:warning={editingPost.title && editingPost.title.length > VALIDATION_LIMITS.title.warning}>
                  {editingPost.title ? editingPost.title.length : 0}/{VALIDATION_LIMITS.title.max}
                </div>
              </div>

              <div class="meta-row">
                <div class="input-group">
                  <select bind:value={editingPost.category} class="category-select" disabled={loading}>
                    {#each availableCategories as category}
                      <option value={category.value}>{category.label}</option>
                    {/each}
                  </select>
                  <div class="category-label">Category</div>
                </div>

                <div class="input-group">
                  <input
                    value={editingPost.tags ? editingPost.tags.join(', ') : ''}
                    on:blur={handleTagsInput}
                    placeholder="Tags (comma separated, max 10)"
                    class="tags-input"
                    class:error={editingPost.tags && editingPost.tags.length > VALIDATION_LIMITS.tags.max}
                    disabled={loading}
                  />
                  <div class="tag-counter" class:warning={editingPost.tags && editingPost.tags.length > 7}>
                    {editingPost.tags ? editingPost.tags.length : 0}/{VALIDATION_LIMITS.tags.max} tags
                  </div>
                </div>
              </div>

              <div class="input-group">
                <select bind:value={editingPost.path_id} class="path-select" disabled={loading}>
                  <option value={null}>📂 No folder (root level)</option>
                  {#each paths as path}
                    <option value={path.id}>
                      📁 {path.full_path || path.name}
                    </option>
                  {/each}
                </select>
                <div class="path-label">Folder</div>
              </div>
            </div>

            <div class="editor-wrapper">
              <div class="editor-header-info">
                <span class="content-counter" class:warning={getContentLength() > VALIDATION_LIMITS.content.warning}>
                  📝 {getContentLength().toLocaleString()}/{VALIDATION_LIMITS.content.max.toLocaleString()} characters
                </span>
              </div>
              <div bind:this={editorContainer} id="blog-editor" class="quill-editor-container"></div>
            </div>

            <!-- Validation Messages -->
            {#if validationErrors.length > 0 || validationWarnings.length > 0}
              <div class="validation-messages">
                {#each validationErrors as error}
                  <div class="validation-error">
                    ❌ {error}
                  </div>
                {/each}
                {#each validationWarnings as warning}
                  <div class="validation-warning">
                    ⚠️ {warning}
                  </div>
                {/each}
              </div>
            {/if}

            <div class="editor-footer">
              <button class="btn btn-primary" on:click={savePost} disabled={loading || !editingPost.title?.trim()}>
                {loading ? '⏳ Saving...' : '📝 Save Post'}
              </button>
              <button class="btn btn-secondary" on:click={cancelEdit} disabled={loading}>
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <!-- Blog View -->
      <header class="blog-header">
        <div class="header-content">
          <div class="blog-info">
            <h1 class="blog-title">📝 {PUBLIC_APP_NAME}</h1>
            <p class="blog-description">{PUBLIC_APP_DESCRIPTION}</p>
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
              on:input={debounceSearch}
              placeholder="Search posts..."
              class="search-input"
              disabled={loading}
            />
            <span class="search-icon">🔍</span>
          </div>
          
          <select bind:value={selectedCategory} on:change={handleSearch} class="category-filter" disabled={loading}>
            <option value="all">All Categories</option>
            {#each categories as category}
              <option value={category.category}>
                {category.category.charAt(0).toUpperCase() + category.category.slice(1)} ({category.post_count})
              </option>
            {/each}
          </select>

          <select bind:value={selectedAuthor} on:change={handleSearch} class="author-filter" disabled={loading}>
            <option value="all">All Authors</option>
            {#if authors && authors.length > 0}
              {#each authors as author}
                <option value={String(author.id)}>
                  {author.display_name} ({author.post_count})
                </option>
              {/each}
            {:else}
              <option disabled>No authors available</option>
            {/if}
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
              {searchQuery || selectedCategory !== 'all' || selectedAuthor !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Be the first to share your thoughts with the community!'}
            </p>
            {#if !searchQuery && selectedCategory === 'all' && selectedAuthor === 'all' && data.user}
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
                  <h2 class="post-title">
                    {#if post.category_post_number}
                      <span class="title-prefix">{post.category.substring(0, 3).toUpperCase()} #{post.category_post_number}:</span>
                    {/if}
                    {post.title}
                  </h2>
                  <div class="post-actions">
                    {#if editablePosts.has(post.id)}
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
                  <button class="report-link" on:click={() => openReportModal(post)} title="Report content issue">
                    ⚠️ Report
                  </button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </main>
      
      <!-- Blog Footer with General Report Link -->
      <footer class="blog-footer">
        <div class="footer-content">
          <p>© 2025 {PUBLIC_APP_NAME}. Help us maintain a safe community.</p>
          <button class="general-report-link" on:click={() => openReportModal()}>
            ⚠️ Report Content Issue
          </button>
        </div>
      </footer>
    {/if}
  </div>

<!-- Report Modal - placed outside blog-container for proper fixed positioning -->
<ReportModal 
  isOpen={showReportModal}
  postTitle={reportPostData.postTitle}
  postUrl={reportPostData.postUrl}
  postId={reportPostData.postId}
  on:close={() => showReportModal = false}
/>
  
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

    .author-filter {
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

    .title-prefix {
      color: #2563eb;
      font-weight: 700;
      font-size: 0.9em;
      margin-right: 0.5rem;
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

    .post-number {
      font-weight: 600;
      color: #2563eb;
      margin-left: 0.25rem;
    }

    .post-excerpt {
      color: #4b5563;
      line-height: 1.6;
      margin-bottom: 1rem;
    }
    
    /* Ensure lists display in post excerpts - handle Quill's data-list attributes */
    .post-excerpt :global(ul),
    .post-excerpt :global(ol) {
      padding-left: 1.5em;
      margin: 0.5rem 0;
      list-style-type: none;
    }
    
    .post-excerpt :global(li) {
      list-style-type: none;
      display: list-item;
      position: relative;
      padding-left: 1.5em;
    }
    
    /* Bullet lists */
    .post-excerpt :global(li[data-list="bullet"]::before) {
      content: '\2022';
      position: absolute;
      left: 0;
      color: inherit;
      font-weight: bold;
    }
    
    /* Numbered lists */
    .post-excerpt :global(ol) {
      counter-reset: list-0 list-1 list-2 list-3 list-4 list-5;
    }
    
    .post-excerpt :global(li[data-list="ordered"]) {
      counter-increment: list-0;
    }
    
    .post-excerpt :global(li[data-list="ordered"]::before) {
      content: counter(list-0, decimal) ".";
      position: absolute;
      left: 0;
      color: inherit;
      font-weight: bold;
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
      display: flex;
      justify-content: space-between;
      align-items: center;
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
    
    .report-link {
      background: none;
      border: none;
      color: #6b7280;
      font-size: 0.75rem;
      cursor: pointer;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      transition: all 0.2s;
    }
    
    .report-link:hover {
      background: #f3f4f6;
      color: #dc2626;
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

    .editor-layout {
      display: flex;
      gap: 2rem;
    }

    .editor-sidebar {
      flex: 0 0 280px;
      position: sticky;
      top: 1rem;
      align-self: flex-start;
    }

    .editor-main {
      flex: 1;
      min-width: 0;
    }

    .post-meta-form {
      margin-bottom: 2rem;
    }
    
    .input-group {
      position: relative;
      margin-bottom: 1rem;
    }
    
    .title-input {
      width: 100%;
      padding: 1rem;
      font-size: 1.5rem;
      font-weight: 600;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      box-sizing: border-box;
      transition: border-color 0.2s;
    }
    
    .title-input.warning {
      border-color: #f59e0b;
    }
    
    .title-input.error {
      border-color: #dc2626;
    }
    
    .char-counter, .tag-counter, .content-counter {
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 0.25rem;
      display: block;
    }
    
    .char-counter.warning, .tag-counter.warning, .content-counter.warning {
      color: #f59e0b;
      font-weight: 500;
    }
    
    .meta-row {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
    }
    
    .meta-row .input-group {
      flex: 1;
    }
    
    .meta-row .input-group:first-child {
      flex: 0 0 200px;
    }
    
    .category-select, .tags-input, .path-select {
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
      transition: border-color 0.2s;
      width: 100%;
      box-sizing: border-box;
      height: 48px;
      display: flex;
      align-items: center;
    }
    
    .category-label, .tag-counter, .path-label {
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 0.25rem;
      display: block;
      min-height: 16px;
      line-height: 16px;
    }
    
    .tags-input.error {
      border-color: #dc2626;
    }
    
    .editor-header-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    
    .validation-messages {
      background: #fef7f0;
      border: 1px solid #fed7aa;
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    
    .validation-error {
      color: #dc2626;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .validation-error:last-child {
      margin-bottom: 0;
    }
    
    .validation-warning {
      color: #f59e0b;
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .validation-warning:last-child {
      margin-bottom: 0;
    }
    
    .editor-wrapper {
      margin-bottom: 2rem;
    }
    
    .quill-editor-container {
      min-height: 300px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
    }
    
    /* Quill list styles - Quill uses data-list attributes */
    .quill-editor-container :global(.ql-editor ol),
    .quill-editor-container :global(.ql-editor ul) {
      padding-left: 1.5em;
      list-style-type: none;
    }
    
    .quill-editor-container :global(.ql-editor li) {
      list-style-type: none;
      position: relative;
      padding-left: 1.5em;
    }
    
    /* Bullet lists - Quill uses data-list="bullet" */
    .quill-editor-container :global(.ql-editor li[data-list="bullet"]::before) {
      content: '\2022';
      position: absolute;
      left: 0;
      color: inherit;
      font-weight: bold;
    }
    
    /* Numbered lists - Quill uses data-list="ordered" with counters */
    .quill-editor-container :global(.ql-editor ol) {
      counter-reset: list-0 list-1 list-2 list-3 list-4 list-5 list-6 list-7 list-8 list-9;
    }
    
    .quill-editor-container :global(.ql-editor li[data-list="ordered"]) {
      counter-increment: list-0;
    }
    
    .quill-editor-container :global(.ql-editor li[data-list="ordered"]::before) {
      content: counter(list-0, decimal) ".";
      position: absolute;
      left: 0;
      color: inherit;
      font-weight: bold;
    }
    
    /* Handle nested lists */
    .quill-editor-container :global(.ql-editor li[data-list="ordered"].ql-indent-1) {
      counter-increment: list-1;
    }
    
    .quill-editor-container :global(.ql-editor li[data-list="ordered"].ql-indent-1::before) {
      content: counter(list-1, decimal) ".";
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
    
    /* Blog Footer */
    .blog-footer {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 2rem;
      margin-top: 3rem;
      border-radius: 8px;
    }
    
    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    
    .footer-content p {
      color: #6b7280;
      margin: 0;
      font-size: 0.875rem;
    }
    
    .general-report-link {
      background: none;
      border: 1px solid #d1d5db;
      color: #6b7280;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .general-report-link:hover {
      background: #fee2e2;
      border-color: #fca5a5;
      color: #dc2626;
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

      .editor-layout {
        flex-direction: column;
      }

      .editor-sidebar {
        flex: none;
        width: 100%;
        position: static;
      }
    }
  </style>