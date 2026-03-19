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
    import { getDefaultCategory } from '$lib/categories';
    
    export let data;
    
    // Use server-loaded data - these will be reactive to data changes
    $: posts = data.posts || [];
    $: categories = data.categories || [];
    $: authors = data.authors || [];
    $: stats = data.stats || { posts: 0, categories: 0, tags: 0 };
    $: searchQuery = data.searchQuery || '';
    $: selectedCategory = data.categoryFilter || 'all';
    $: selectedAuthor = data.authorFilter || 'all';
    $: selectedTag = data.tagFilter || 'all';
    $: tags = data.tags || [];
    $: paths = data.paths || [];
    
    // Handle edit post from URL parameter
    $: if (data.editPost && !showEditor && !closingEditor) {
      editPost(data.editPost);
    }
    
    // Get available categories from server (loaded from database)
    $: availableCategories = data.availableCategories || [];
    $: defaultCategory = getDefaultCategory(availableCategories);
    
    // Debug reactive updates
    $: console.log('🔄 Posts updated, count:', posts.length);

    let showEditor = false;
    let editingPost = null;
    let editor = null; // TipTap editor instance
    let editorContainer;
    let loading = false;
    let closingEditor = false; // Flag to prevent reactive reopening after save/cancel
    let userGroups = []; // User's groups for permissions
    let hasOpenedNewPost = false; // Track if we've already opened the new post editor for this URL
    let tiptapLoaded = false; // Track if TipTap modules are loaded
    let showTableControls = false; // Show table editing controls
    let showLinkInput = false; // Show link URL input
    let linkUrl = ''; // Link URL value

    // Vectorization state
    let vectorizingPostId = null; // Post currently being vectorized
    let vectorizationStatus = {}; // Map of postId -> { isVectorized, chunkCount }
    let uploadingPostId = null; // Post currently uploading file for
    let extractingUrl = false; // Loading state for URL content extraction

    // Semantic search state
    let searchMode = 'keyword'; // 'keyword', 'semantic', 'hybrid'
    let semanticResults = [];
    let isSemanticSearching = false;

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
            writeGroupIds: [],
            source_url: ''
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
      content: { max: 500000, warning: 450000 },
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

      // Load vectorization status for all posts
      await loadVectorizationStatuses();
    });
    
    // Function to handle search form submission
    function handleSearch() {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (selectedAuthor !== 'all') params.set('author', selectedAuthor);
      if (selectedTag !== 'all') params.set('tag', selectedTag);

      const url = `/blog${params.toString() ? '?' + params.toString() : ''}`;
      goto(url);
    }

    // Function to filter by tag (called when clicking a tag)
    function filterByTag(tag) {
      selectedTag = tag;
      handleSearch();
    }
    
    // Debounced search - wait 800ms after user stops typing
    let searchTimeout;
    function debounceSearch() {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(handleSearch, 800);
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
      if (editingPost.content && editor) {
        const textContent = editor.getText().trim();
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
      if (!editor) return 0;
      return editor.getText().trim().length;
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
      
      // Get latest content from TipTap
      if (editor) {
        editingPost.content = editor.getHTML();
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
          writeGroupIds: editingPost.writeGroupIds || [],
          source_url: editingPost.source_url || null  // External URL for link posts
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
          // Properly clean up TipTap editor
          if (editor) {
            editor.destroy();
            editor = null;
          }
          showEditor = false;
          editingPost = null;
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
    
    // Editor loading error state
    let editorLoadError = null;

    // Initialize TipTap when editor is shown
    async function initEditor() {
      if (!editorContainer) {
        console.error('❌ Editor container not found');
        return;
      }

      editorLoadError = null;

      try {
        // Dynamically load TipTap from CDN
        if (!tiptapLoaded) {
          console.log('📦 Loading TipTap modules from esm.sh...');
          const modules = await Promise.all([
            import('https://esm.sh/@tiptap/core@2.1.13'),
            import('https://esm.sh/@tiptap/starter-kit@2.1.13'),
            import('https://esm.sh/@tiptap/extension-table@2.1.13'),
            import('https://esm.sh/@tiptap/extension-table-row@2.1.13'),
            import('https://esm.sh/@tiptap/extension-table-cell@2.1.13'),
            import('https://esm.sh/@tiptap/extension-table-header@2.1.13'),
            import('https://esm.sh/@tiptap/extension-link@2.1.13'),
            import('https://esm.sh/@tiptap/extension-image@2.1.13'),
            import('https://esm.sh/@tiptap/extension-underline@2.1.13'),
            import('https://esm.sh/@tiptap/extension-text-align@2.1.13'),
            import('https://esm.sh/@tiptap/extension-highlight@2.1.13'),
            import('https://esm.sh/@tiptap/extension-color@2.1.13'),
            import('https://esm.sh/@tiptap/extension-text-style@2.1.13'),
            import('https://esm.sh/@tiptap/extension-placeholder@2.1.13'),
          ]);
          console.log('✅ TipTap modules loaded successfully');

          window.TipTapModules = {
            Editor: modules[0].Editor,
            StarterKit: modules[1].default,
            Table: modules[2].default,
            TableRow: modules[3].default,
            TableCell: modules[4].default,
            TableHeader: modules[5].default,
            Link: modules[6].default,
            Image: modules[7].default,
            Underline: modules[8].default,
            TextAlign: modules[9].default,
            Highlight: modules[10].default,
            Color: modules[11].default,
            TextStyle: modules[12].default,
            Placeholder: modules[13].default,
          };
          tiptapLoaded = true;
        }

        const { Editor, StarterKit, Table, TableRow, TableCell, TableHeader,
                Link, Image, Underline, TextAlign, Highlight, Color, TextStyle, Placeholder } = window.TipTapModules;

        // Create ResizableImage extension
        const ResizableImage = Image.extend({
          name: 'resizableImage',

          addAttributes() {
            return {
              ...this.parent?.(),
              width: {
                default: null,
                parseHTML: element => element.getAttribute('width') || element.style.width?.replace('px', '') || null,
                renderHTML: attributes => {
                  if (!attributes.width) return {};
                  return { width: attributes.width, style: `width: ${attributes.width}px` };
                },
              },
              height: {
                default: null,
                parseHTML: element => element.getAttribute('height') || element.style.height?.replace('px', '') || null,
                renderHTML: attributes => {
                  if (!attributes.height) return {};
                  return { height: attributes.height };
                },
              },
            };
          },

          addNodeView() {
            return ({ node, getPos, editor: nodeEditor }) => {
              // Store current attrs (will be updated on each update call)
              let currentAttrs = { ...node.attrs };

              const container = document.createElement('div');
              container.classList.add('resizable-image-container');

              const img = document.createElement('img');
              img.src = node.attrs.src;
              img.alt = node.attrs.alt || '';
              if (node.attrs.width) {
                img.style.width = `${node.attrs.width}px`;
              }
              img.classList.add('resizable-image');

              // Resize handle
              const handle = document.createElement('div');
              handle.classList.add('resize-handle');

              container.appendChild(img);
              container.appendChild(handle);

              // Resize logic
              let isResizing = false;
              let startX, startWidth;

              handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                isResizing = true;
                startX = e.clientX;
                startWidth = img.offsetWidth;
                container.classList.add('resizing');
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
              });

              const onMouseMove = (e) => {
                if (!isResizing) return;
                const diff = e.clientX - startX;
                const newWidth = Math.max(50, startWidth + diff);
                img.style.width = `${newWidth}px`;
              };

              const onMouseUp = (e) => {
                if (!isResizing) return;
                isResizing = false;
                container.classList.remove('resizing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                // Update node attributes using transaction
                const newWidth = img.offsetWidth;
                if (typeof getPos === 'function') {
                  const pos = getPos();
                  try {
                    const { tr } = nodeEditor.state;
                    tr.setNodeMarkup(pos, undefined, {
                      ...currentAttrs,
                      width: newWidth,
                    });
                    nodeEditor.view.dispatch(tr);
                    // Update local attrs reference
                    currentAttrs.width = newWidth;
                  } catch (err) {
                    console.error('Failed to update image size:', err);
                  }
                }
              };

              // Select image on click
              img.addEventListener('click', () => {
                if (typeof getPos === 'function') {
                  nodeEditor.commands.setNodeSelection(getPos());
                }
              });

              return {
                dom: container,
                update: (updatedNode) => {
                  if (updatedNode.type.name !== 'resizableImage') return false;
                  // Update our local reference
                  currentAttrs = { ...updatedNode.attrs };
                  img.src = updatedNode.attrs.src;
                  img.alt = updatedNode.attrs.alt || '';
                  if (updatedNode.attrs.width) {
                    img.style.width = `${updatedNode.attrs.width}px`;
                  }
                  return true;
                },
                destroy: () => {
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                },
              };
            };
          },
        });

        // Debug: Log content being loaded
        console.log('🔍 TipTap loading content:');
        console.log('   - Content length:', editingPost.content?.length || 0);
        console.log('   - Has img tag:', editingPost.content?.includes('<img') || false);

        editor = new Editor({
          element: editorContainer,
          extensions: [
            StarterKit,
            Underline,
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Link.configure({ openOnClick: false }),
            ResizableImage.configure({
              allowBase64: true,
              inline: false,
            }),
            Table.configure({ resizable: true }),
            TableRow,
            TableCell,
            TableHeader,
            Placeholder.configure({ placeholder: 'Share your thoughts...' }),
          ],
          content: editingPost.content || '',
          onUpdate: ({ editor: e }) => {
            editingPost.content = e.getHTML();
            showTableControls = e.isActive('table');
            // Debounce validation
            clearTimeout(window.validationTimeout);
            window.validationTimeout = setTimeout(validatePost, 300);
          },
          onSelectionUpdate: ({ editor: e }) => {
            showTableControls = e.isActive('table');
          },
        });

        // Setup paste handler for images
        editorContainer.addEventListener('paste', handleImagePaste);
        editorContainer.addEventListener('drop', handleImageDrop);
        editorContainer.addEventListener('dragover', (e) => e.preventDefault());

      } catch (error) {
        console.error('❌ Failed to initialize editor:', error);
        editorLoadError = `Failed to load editor: ${error.message}. This may be caused by browser security settings blocking esm.sh CDN. Try: 1) Clear browser cache, 2) Disable enhanced security mode, 3) Try a different browser.`;
      }
    }

    // Handle image paste
    function handleImagePaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) convertAndInsertImage(file);
          break;
        }
      }
    }

    // Handle image drop
    function handleImageDrop(e) {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            convertAndInsertImage(file);
            break;
          }
        }
      }
    }

    // Convert image to Base64 and insert
    function convertAndInsertImage(file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Image is too large. Maximum size is 5MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        editor?.chain().focus().setImage({ src: e.target.result }).run();
      };
      reader.readAsDataURL(file);
    }

    // Trigger file upload
    function triggerImageUpload() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) convertAndInsertImage(file);
      };
      input.click();
    }

    // Insert image from URL
    function insertImageFromUrl() {
      const url = prompt('Enter image URL:');
      if (url) {
        editor?.chain().focus().setImage({ src: url }).run();
      }
    }

    // Import PDF - extract text and insert into editor
    let pdfJsLoaded = false;
    let importingPdf = false;

    async function loadPdfJs() {
      if (pdfJsLoaded) return;

      // Load pdf.js from CDN
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      document.head.appendChild(script);

      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });

      // Set worker
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      pdfJsLoaded = true;
    }

    async function importDocument() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.docx,.pptx,.xlsx,.xls,.txt,.html,.htm';

      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 20 * 1024 * 1024) {
          alert('File is too large. Maximum size is 20MB.');
          return;
        }

        importingPdf = true;

        try {
          // Use server-side extraction for all document types
          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('/api/documents/extract', {
            method: 'POST',
            body: formData
          });

          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error);
          }

          // Convert text to HTML paragraphs
          const paragraphs = result.text
            .split(/\n\n+/)
            .filter(p => p.trim())
            .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
            .join('');

          // Insert into editor
          editor?.chain().focus().insertContent(paragraphs).run();

          console.log(`Imported ${result.charCount} characters from ${result.fileName}`);

        } catch (error) {
          console.error('Document import error:', error);
          alert('Failed to import document: ' + error.message);
        } finally {
          importingPdf = false;
        }
      };

      input.click();
    }

    // Fetch content from external URL (for imported documents)
    async function fetchUrlContent() {
      if (!editingPost?.source_url?.trim()) {
        alert('Please enter a URL first');
        return;
      }

      extractingUrl = true;

      try {
        const response = await fetch('/api/posts/extract-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: editingPost.source_url })
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error);
        }

        // Update title if empty
        if (!editingPost.title?.trim() && result.title) {
          editingPost.title = result.title;
        }

        // Switch to 'imported' category so vectorization uses post content (not URL)
        editingPost.category = 'imported';

        // Convert text to HTML paragraphs and insert into editor
        const paragraphs = result.content
          .split(/\n\n+/)
          .filter(p => p.trim())
          .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
          .join('');

        editor?.chain().focus().setContent(paragraphs).run();

        console.log(`✅ Imported ${result.stats.textLength} characters from ${result.sourceType.toUpperCase()}`);
        alert(`Imported ${result.stats.textLength.toLocaleString()} characters from ${result.sourceType.toUpperCase()}. Category set to "Imported Document".`);

      } catch (error) {
        console.error('URL extraction error:', error);
        alert('Failed to fetch content: ' + error.message);
      } finally {
        extractingUrl = false;
      }
    }

    // Keep old PDF import for backward compatibility (client-side)
    async function importPdfClientSide() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,application/pdf';

      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 20 * 1024 * 1024) {
          alert('PDF is too large. Maximum size is 20MB.');
          return;
        }

        importingPdf = true;

        try {
          // Load pdf.js if not already loaded
          await loadPdfJs();

          // Read file as ArrayBuffer
          const arrayBuffer = await file.arrayBuffer();

          // Load PDF document
          const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

          let fullText = '';
          const totalPages = pdf.numPages;

          // Extract text from each page
          for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Combine text items
            const pageText = textContent.items
              .map(item => item.str)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();

            if (pageText) {
              if (totalPages > 1) {
                fullText += `<h3>Page ${pageNum}</h3>\n`;
              }
              // Split into paragraphs (double newlines or long gaps)
              const paragraphs = pageText.split(/\.\s+/).filter(p => p.trim());
              paragraphs.forEach(p => {
                fullText += `<p>${p.trim()}.</p>\n`;
              });
              fullText += '\n';
            }
          }

          if (fullText.trim()) {
            // Insert at cursor position
            editor?.chain().focus().insertContent(fullText).run();
            console.log(`✅ Imported ${totalPages} page(s) from PDF`);
          } else {
            alert('Could not extract text from this PDF. It may be image-based or protected.');
          }

        } catch (error) {
          console.error('Failed to import PDF:', error);
          alert('Failed to import PDF: ' + error.message);
        } finally {
          importingPdf = false;
        }
      };

      input.click();
    }

    // Set link
    function setLink() {
      if (linkUrl) {
        editor?.chain().focus().setLink({ href: linkUrl }).run();
      }
      showLinkInput = false;
      linkUrl = '';
    }

    // Unset link
    function unsetLink() {
      editor?.chain().focus().unsetLink().run();
      showLinkInput = false;
      linkUrl = '';
    }

    // Vectorization functions
    async function vectorizePost(postId) {
      if (vectorizingPostId) return; // Already vectorizing another post

      vectorizingPostId = postId;

      try {
        const response = await fetch(`/api/posts/${postId}/vectorize`, {
          method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
          console.log('Vectorization complete:', result.stats);
          // Update status
          vectorizationStatus[postId] = {
            isVectorized: true,
            chunkCount: result.stats.chunkCount
          };
          vectorizationStatus = vectorizationStatus; // Trigger reactivity
        } else {
          console.error('Vectorization failed:', result.error);
          alert(`Vectorization failed: ${result.error}`);
        }
      } catch (error) {
        console.error('Vectorization error:', error);
        alert('Failed to vectorize post');
      } finally {
        vectorizingPostId = null;
      }
    }

    async function checkVectorizationStatus(postId) {
      try {
        const response = await fetch(`/api/posts/${postId}/vectorize`);
        const result = await response.json();

        if (result.success) {
          vectorizationStatus[postId] = {
            isVectorized: result.isVectorized,
            chunkCount: result.chunkCount
          };
          vectorizationStatus = vectorizationStatus; // Trigger reactivity
        }
      } catch (error) {
        console.error('Failed to check vectorization status:', error);
      }
    }

    // File upload for vectorization
    async function uploadAndVectorize(postId, file) {
      if (uploadingPostId) return;

      uploadingPostId = postId;

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`/api/posts/${postId}/upload-vectorize`, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (result.success) {
          console.log('Upload and vectorization complete:', result.stats);
          vectorizationStatus[postId] = {
            isVectorized: true,
            chunkCount: result.stats.chunkCount
          };
          vectorizationStatus = vectorizationStatus;
          alert(`File vectorized: ${result.stats.chunkCount} chunks created from ${result.stats.fileName}`);
        } else {
          console.error('Upload failed:', result.error);
          alert(`Upload failed: ${result.error}`);
        }
      } catch (error) {
        console.error('Upload error:', error);
        alert('Failed to upload file');
      } finally {
        uploadingPostId = null;
      }
    }

    // Trigger file input for a post
    function triggerFileUpload(postId) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.docx,.pptx,.xlsx,.xls,.txt,.html,.htm';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
          uploadAndVectorize(postId, file);
        }
      };
      input.click();
    }

    // Semantic/Hybrid search function
    async function performSemanticSearch() {
      if (!searchQuery.trim()) {
        semanticResults = [];
        return;
      }

      isSemanticSearching = true;

      try {
        // Use hybrid or semantic endpoint based on mode
        const endpoint = searchMode === 'hybrid' ? 'hybrid' : 'semantic';
        const response = await fetch(`/api/search/${endpoint}?q=${encodeURIComponent(searchQuery)}&limit=20`);
        const result = await response.json();

        if (result.success) {
          semanticResults = result.results.map(r => ({
            ...r,
            // Normalize score field name
            similarity: r.hybridScore || r.similarity
          }));
          console.log(`${searchMode} search found ${semanticResults.length} results`);
        } else {
          console.error(`${searchMode} search failed:`, result.error);
          semanticResults = [];
        }
      } catch (error) {
        console.error(`${searchMode} search error:`, error);
        semanticResults = [];
      } finally {
        isSemanticSearching = false;
      }
    }

    // Cycle through search modes: keyword -> hybrid -> semantic -> keyword
    function cycleSearchMode() {
      if (searchMode === 'keyword') {
        searchMode = 'hybrid';
      } else if (searchMode === 'hybrid') {
        searchMode = 'semantic';
      } else {
        searchMode = 'keyword';
      }

      if (searchMode !== 'keyword' && searchQuery.trim()) {
        performSemanticSearch();
      } else {
        semanticResults = [];
        handleSearch();
      }
    }

    // Debounced semantic/hybrid search - wait 800ms after user stops typing
    let semanticSearchTimeout;
    function debounceSemanticSearch() {
      if (searchMode !== 'keyword') {
        clearTimeout(semanticSearchTimeout);
        semanticSearchTimeout = setTimeout(performSemanticSearch, 800);
      } else {
        debounceSearch();
      }
    }

    // Load vectorization status for all posts
    async function loadVectorizationStatuses() {
      if (!browser) return;

      try {
        const response = await fetch('/api/posts/vectorization-status');
        const result = await response.json();

        if (result.success) {
          // Build status map from response
          const newStatus = {};
          for (const status of result.statuses) {
            newStatus[status.postId] = {
              isVectorized: status.isVectorized,
              chunkCount: status.chunkCount
            };
          }
          vectorizationStatus = newStatus;
          console.log('✅ Loaded vectorization statuses for', result.statuses.length, 'posts');
        }
      } catch (error) {
        console.error('Failed to load vectorization statuses:', error);
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
        writeGroupIds: [],
        source_url: ''
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
      let fullPost = post;

      if (post.id) {
        try {
          // Fetch full post content from API (list data may not include large images)
          console.log('📡 Fetching full post content for:', post.id);
          const postResponse = await fetch(`/api/posts/${post.id}`);
          const postData = await postResponse.json();

          if (postData.success && postData.post) {
            fullPost = postData.post;
            console.log('✅ Loaded full post content:');
            console.log('   - Length:', fullPost.content?.length || 0);
            console.log('   - Has img tag:', fullPost.content?.includes('<img') || false);
            console.log('   - Has base64:', fullPost.content?.includes('data:image') || false);
          } else {
            console.warn('⚠️ Could not fetch full post, using list data');
            console.log('   - postData:', postData);
          }

          // Load permissions
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
          console.error('❌ Failed to load post data:', error);
        }
      }

      editingPost = {
        ...fullPost,
        tags: fullPost.tags || [],
        visibility: fullPost.visibility || 'public',
        readGroupIds,
        writeGroupIds,
        source_url: fullPost.source_url || ''
      };
      showEditor = true;
      setTimeout(initEditor, 100);
    }
    
    function cancelEdit() {
      // Set flag to prevent reactive statement from reopening editor
      closingEditor = true;

      // Properly destroy TipTap editor
      if (editor) {
        editor.destroy();
        editor = null;
      }

      showEditor = false;
      editingPost = null;
      showTableControls = false;
      showLinkInput = false;

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
          <!-- Left Sidebar: Permissions & Vectorization -->
          <aside class="editor-sidebar">
            <PostPermissions
              bind:visibility={editingPost.visibility}
              bind:readGroupIds={editingPost.readGroupIds}
              bind:writeGroupIds={editingPost.writeGroupIds}
              availableGroups={userGroups}
            />

            <!-- Vectorization Panel -->
            <div class="vectorization-panel">
              <h4>Vectorization</h4>
              {#if editingPost.id}
                <div class="vector-status">
                  {#if vectorizationStatus[editingPost.id]?.isVectorized}
                    <span class="status-badge vectorized">
                      🧠 Vectorized ({vectorizationStatus[editingPost.id]?.chunkCount} chunks)
                    </span>
                  {:else}
                    <span class="status-badge not-vectorized">
                      Not vectorized
                    </span>
                  {/if}
                </div>
                <div class="vector-actions">
                  <button
                    type="button"
                    class="vector-btn"
                    on:click={() => vectorizePost(editingPost.id)}
                    disabled={vectorizingPostId === editingPost.id}
                  >
                    {#if vectorizingPostId === editingPost.id}
                      ⏳ Vectorizing...
                    {:else if vectorizationStatus[editingPost.id]?.isVectorized}
                      🔄 Re-vectorize
                    {:else}
                      🧠 Vectorize Post
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="vector-btn upload"
                    on:click={() => triggerFileUpload(editingPost.id)}
                    disabled={uploadingPostId === editingPost.id}
                  >
                    {#if uploadingPostId === editingPost.id}
                      ⏳ Uploading...
                    {:else}
                      📤 Upload & Vectorize
                    {/if}
                  </button>
                </div>
                <p class="vector-hint">
                  Vectorize to enable semantic search. Upload a file (PDF, Word, PowerPoint, TXT) to vectorize external content.
                </p>
              {:else}
                <p class="vector-hint">
                  Save the post first to enable vectorization.
                </p>
              {/if}
            </div>
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

              {#if editingPost.category === 'link' || editingPost.category === 'word-doc' || editingPost.category === 'pdf-doc' || editingPost.category === 'excel-doc'}
                <div class="input-group source-url-group">
                  <input
                    bind:value={editingPost.source_url}
                    placeholder={
                      editingPost.category === 'link' ? 'External URL (HTML pages only)' :
                      editingPost.category === 'word-doc' ? 'Word document URL (.docx)' :
                      editingPost.category === 'pdf-doc' ? 'PDF document URL (.pdf)' :
                      'Excel document URL (.xlsx)'
                    }
                    class="source-url-input"
                    type="url"
                    disabled={loading}
                  />
                  <div class="source-url-label">
                    {#if editingPost.category === 'link'}
                      External URL for vectorization (HTML only)
                    {:else}
                      Document URL - content will be extracted when vectorizing
                    {/if}
                  </div>
                </div>
              {/if}

              {#if editingPost.category === 'imported'}
                <div class="input-group source-url-group imported-group">
                  <div class="source-url-row">
                    <input
                      bind:value={editingPost.source_url}
                      placeholder="Document URL (PDF, Word, PowerPoint, HTML)"
                      class="source-url-input"
                      type="url"
                      disabled={loading || extractingUrl}
                    />
                    <button
                      type="button"
                      class="btn btn-secondary fetch-url-btn"
                      on:click={fetchUrlContent}
                      disabled={loading || extractingUrl || !editingPost.source_url?.trim()}
                      title="Fetch and import content from URL"
                    >
                      {#if extractingUrl}
                        ⏳ Fetching...
                      {:else}
                        📥 Fetch
                      {/if}
                    </button>
                  </div>
                  <div class="source-url-label">Enter URL and click Fetch to import content</div>
                </div>
              {/if}
            </div>

            <div class="editor-wrapper">
              <div class="editor-header-info">
                <span class="content-counter" class:warning={getContentLength() > VALIDATION_LIMITS.content.warning}>
                  📝 {getContentLength().toLocaleString()}/{VALIDATION_LIMITS.content.max.toLocaleString()} characters
                </span>
              </div>

              <!-- TipTap Toolbar -->
              {#if editor}
                <div class="tiptap-toolbar">
                  <div class="toolbar-group">
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('heading', { level: 1 })}
                      on:click={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                      title="Heading 1"
                    >H1</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('heading', { level: 2 })}
                      on:click={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                      title="Heading 2"
                    >H2</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('heading', { level: 3 })}
                      on:click={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                      title="Heading 3"
                    >H3</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      on:click={() => editor?.chain().focus().setParagraph().run()}
                      title="Paragraph"
                    >P</button>
                  </div>

                  <div class="toolbar-group">
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('bold')}
                      on:click={() => editor?.chain().focus().toggleBold().run()}
                      title="Bold"
                    ><b>B</b></button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('italic')}
                      on:click={() => editor?.chain().focus().toggleItalic().run()}
                      title="Italic"
                    ><i>I</i></button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('underline')}
                      on:click={() => editor?.chain().focus().toggleUnderline().run()}
                      title="Underline"
                    ><u>U</u></button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('strike')}
                      on:click={() => editor?.chain().focus().toggleStrike().run()}
                      title="Strikethrough"
                    ><s>S</s></button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('code')}
                      on:click={() => editor?.chain().focus().toggleCode().run()}
                      title="Inline Code"
                    >&lt;&gt;</button>
                    <label class="toolbar-btn color-picker-btn" title="Text Color">
                      <span class="color-icon">A</span>
                      <input
                        type="color"
                        class="color-input"
                        value="#000000"
                        on:input={(e) => editor?.chain().focus().setColor(e.target.value).run()}
                      />
                    </label>
                    <button
                      type="button"
                      class="toolbar-btn"
                      on:click={() => editor?.chain().focus().unsetColor().run()}
                      title="Remove Color"
                    >⊘</button>
                  </div>

                  <div class="toolbar-group">
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('bulletList')}
                      on:click={() => editor?.chain().focus().toggleBulletList().run()}
                      title="Bullet List"
                    >• List</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('orderedList')}
                      on:click={() => editor?.chain().focus().toggleOrderedList().run()}
                      title="Numbered List"
                    >1. List</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('blockquote')}
                      on:click={() => editor?.chain().focus().toggleBlockquote().run()}
                      title="Quote"
                    >"</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      on:click={() => editor?.chain().focus().setHorizontalRule().run()}
                      title="Horizontal Rule"
                    >—</button>
                  </div>

                  <div class="toolbar-group">
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive({ textAlign: 'left' })}
                      on:click={() => editor?.chain().focus().setTextAlign('left').run()}
                      title="Align Left"
                    >⫷</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive({ textAlign: 'center' })}
                      on:click={() => editor?.chain().focus().setTextAlign('center').run()}
                      title="Align Center"
                    >☰</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive({ textAlign: 'right' })}
                      on:click={() => editor?.chain().focus().setTextAlign('right').run()}
                      title="Align Right"
                    >⫸</button>
                  </div>

                  <div class="toolbar-group">
                    <button
                      type="button"
                      class="toolbar-btn"
                      class:is-active={editor?.isActive('link')}
                      on:click={() => showLinkInput = !showLinkInput}
                      title="Link"
                    >🔗</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      on:click={triggerImageUpload}
                      title="Upload Image"
                    >🖼️</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      on:click={insertImageFromUrl}
                      title="Image from URL"
                    >🌐</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      on:click={importDocument}
                      disabled={importingPdf}
                      title="Import document (PDF, Word, PowerPoint, TXT, HTML)"
                    >{importingPdf ? '⏳' : '📥'}</button>
                  </div>

                  <div class="toolbar-group">
                    <button
                      type="button"
                      class="toolbar-btn"
                      on:click={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                      title="Insert Table"
                    >▦</button>
                  </div>

                  <div class="toolbar-group">
                    <button
                      type="button"
                      class="toolbar-btn"
                      on:click={() => editor?.chain().focus().undo().run()}
                      disabled={!editor?.can().undo()}
                      title="Undo"
                    >↩</button>
                    <button
                      type="button"
                      class="toolbar-btn"
                      on:click={() => editor?.chain().focus().redo().run()}
                      disabled={!editor?.can().redo()}
                      title="Redo"
                    >↪</button>
                  </div>
                </div>

                <!-- Link Input -->
                {#if showLinkInput}
                  <div class="link-input-bar">
                    <input
                      type="url"
                      bind:value={linkUrl}
                      placeholder="Enter URL..."
                      class="link-input"
                      on:keydown={(e) => e.key === 'Enter' && setLink()}
                    />
                    <button type="button" class="link-btn" on:click={setLink}>Set Link</button>
                    {#if editor?.isActive('link')}
                      <button type="button" class="link-btn danger" on:click={unsetLink}>Remove</button>
                    {/if}
                    <button type="button" class="link-btn secondary" on:click={() => { showLinkInput = false; linkUrl = ''; }}>Cancel</button>
                  </div>
                {/if}

                <!-- Table Controls -->
                {#if showTableControls}
                  <div class="table-controls-bar">
                    <span class="table-label">Table:</span>
                    <button type="button" class="table-btn" on:click={() => editor?.chain().focus().addRowBefore().run()}>+ Row Above</button>
                    <button type="button" class="table-btn" on:click={() => editor?.chain().focus().addRowAfter().run()}>+ Row Below</button>
                    <button type="button" class="table-btn" on:click={() => editor?.chain().focus().addColumnBefore().run()}>+ Col Left</button>
                    <button type="button" class="table-btn" on:click={() => editor?.chain().focus().addColumnAfter().run()}>+ Col Right</button>
                    <button type="button" class="table-btn danger" on:click={() => editor?.chain().focus().deleteRow().run()}>Delete Row</button>
                    <button type="button" class="table-btn danger" on:click={() => editor?.chain().focus().deleteColumn().run()}>Delete Col</button>
                    <button type="button" class="table-btn danger" on:click={() => editor?.chain().focus().deleteTable().run()}>Delete Table</button>
                    <button type="button" class="table-btn" on:click={() => editor?.chain().focus().toggleHeaderRow().run()}>Toggle Header</button>
                  </div>
                {/if}
              {/if}

              {#if editorLoadError}
                <div class="editor-error">
                  <strong>Editor Loading Error</strong>
                  <p>{editorLoadError}</p>
                  <button class="btn btn-small" on:click={initEditor}>Retry</button>
                </div>
              {:else}
                <div bind:this={editorContainer} id="blog-editor" class="tiptap-editor-container" class:has-toolbar={editor}></div>
              {/if}
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
              on:input={debounceSemanticSearch}
              placeholder={searchMode === 'keyword' ? "Search posts..." : searchMode === 'hybrid' ? "Hybrid search..." : "Semantic search..."}
              class="search-input"
              class:semantic-active={searchMode === 'semantic'}
              class:hybrid-active={searchMode === 'hybrid'}
              disabled={loading || isSemanticSearching}
            />
            <span class="search-icon">{isSemanticSearching ? '...' : '🔍'}</span>
          </div>

          <button
            class="semantic-toggle"
            class:active={searchMode !== 'keyword'}
            class:hybrid={searchMode === 'hybrid'}
            on:click={cycleSearchMode}
            title={searchMode === 'keyword' ? 'Click for Hybrid (keyword + semantic)' : searchMode === 'hybrid' ? 'Click for Semantic only' : 'Click for Keyword only'}
          >
            {#if searchMode === 'keyword'}
              🔤 Keyword
            {:else if searchMode === 'hybrid'}
              🔀 Hybrid
            {:else}
              🧠 Semantic
            {/if}
          </button>

          <select bind:value={selectedCategory} on:change={handleSearch} class="category-filter" disabled={loading || searchMode !== 'keyword'}>
            <option value="all">All Categories</option>
            {#each categories as category}
              <option value={category.category}>
                {category.category.charAt(0).toUpperCase() + category.category.slice(1)} ({category.post_count})
              </option>
            {/each}
          </select>

          <select bind:value={selectedAuthor} on:change={handleSearch} class="author-filter" disabled={loading || searchMode !== 'keyword'}>
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

          <select bind:value={selectedTag} on:change={handleSearch} class="tag-filter" disabled={loading || searchMode !== 'keyword'}>
            <option value="all">All Tags</option>
            {#if tags && tags.length > 0}
              {#each tags as tag}
                <option value={tag.name}>
                  🏷️ {tag.name} ({tag.post_count})
                </option>
              {/each}
            {:else}
              <option disabled>No tags available</option>
            {/if}
          </select>
        </div>
      </div>
      
      <!-- Posts Section -->
      <main class="posts-section">
        {#if loading || isSemanticSearching}
          <div class="loading-state">
            <div class="spinner"></div>
            <p>{isSemanticSearching ? 'Searching with AI...' : 'Loading posts...'}</p>
          </div>
        {:else if searchMode !== 'keyword' && searchQuery.trim()}
          <!-- Semantic/Hybrid Search Results -->
          {#if semanticResults.length === 0}
            <div class="empty-state">
              <div class="empty-icon">🔍</div>
              <h2>No {searchMode} matches found</h2>
              <p>Try different keywords or switch to regular search</p>
            </div>
          {:else}
            <div class="semantic-results-header" class:hybrid-header={searchMode === 'hybrid'}>
              <span>
                {#if searchMode === 'hybrid'}
                  🔀 Found {semanticResults.length} hybrid matches (keyword + semantic)
                {:else}
                  🧠 Found {semanticResults.length} semantic matches
                {/if}
              </span>
            </div>
            <div class="posts-grid">
              {#each semanticResults as result (result.postId)}
                <article class="post-card semantic-result" class:keyword-match={result.keywordMatch}>
                  <div class="post-header">
                    <h2 class="post-title">{result.title}</h2>
                    <div class="score-badges">
                      {#if result.keywordMatch}
                        <div class="keyword-badge" title="Contains search keywords">
                          🔤
                        </div>
                      {/if}
                      <div class="similarity-badge" class:hybrid-badge={searchMode === 'hybrid'} title="{searchMode === 'hybrid' ? 'Hybrid score' : 'Semantic similarity'}">
                        {Math.round(result.similarity * 100)}%
                      </div>
                    </div>
                  </div>

                  <div class="post-meta">
                    <span class="category">📂 {result.category}</span>
                    {#if result.sourceType && result.sourceType !== 'post'}
                      <span class="source-type">📄 {result.sourceType.toUpperCase()}</span>
                    {/if}
                  </div>

                  <div class="matched-chunk">
                    <span class="chunk-label">Matched content:</span>
                    <p>{result.matchedChunk?.substring(0, 200)}{result.matchedChunk?.length > 200 ? '...' : ''}</p>
                  </div>

                  <div class="post-footer">
                    <a href="/blog/{result.slug}" class="read-more">Read More →</a>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        {:else if posts.length === 0}
          <div class="empty-state">
            <div class="empty-icon">📝</div>
            <h2>No posts found</h2>
            <p>
              {searchQuery || selectedCategory !== 'all' || selectedAuthor !== 'all' || selectedTag !== 'all'
                ? 'Try adjusting your search or filter'
                : 'Be the first to share your thoughts with the community!'}
            </p>
            {#if !searchQuery && selectedCategory === 'all' && selectedAuthor === 'all' && selectedTag === 'all' && data.user}
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
                      <button
                        class="action-btn vectorize-btn"
                        class:vectorized={vectorizationStatus[post.id]?.isVectorized}
                        on:click={() => vectorizePost(post.id)}
                        title={vectorizationStatus[post.id]?.isVectorized
                          ? `Vectorized (${vectorizationStatus[post.id]?.chunkCount} chunks) - Click to re-vectorize`
                          : 'Vectorize post content'}
                        disabled={loading || vectorizingPostId === post.id}
                      >
                        {#if vectorizingPostId === post.id}
                          ⏳
                        {:else if vectorizationStatus[post.id]?.isVectorized}
                          🧠
                        {:else}
                          📊
                        {/if}
                      </button>
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

                {#if post.source_url && ['link', 'word-doc', 'pdf-doc', 'excel-doc'].includes(post.category)}
                  <div class="external-link">
                    <a href={post.source_url} target="_blank" rel="noopener noreferrer" class="source-link">
                      {#if post.category === 'word-doc'}📄{:else if post.category === 'pdf-doc'}📕{:else if post.category === 'excel-doc'}📊{:else}🔗{/if}
                      {post.source_url}
                    </a>
                  </div>
                {/if}

                <div class="post-excerpt">
                  {@html post.excerpt}
                </div>
                
                {#if post.tags && post.tags.length > 0}
                  <div class="post-tags">
                    {#each post.tags as tag}
                      <a href="/blog?tag={encodeURIComponent(tag)}" class="tag tag-clickable" title="Filter by tag: {tag}">🏷️ {tag}</a>
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

    .tag-filter {
      padding: 0.75rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
      min-width: 180px;
    }

    /* Semantic Search Toggle */
    .semantic-toggle {
      padding: 0.75rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: white;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .semantic-toggle:hover {
      background: #f3f4f6;
    }

    .semantic-toggle.active {
      background: #8b5cf6;
      color: white;
      border-color: #8b5cf6;
    }

    .semantic-toggle.hybrid {
      background: #10b981;
      border-color: #10b981;
    }

    .search-input.semantic-active {
      border-color: #8b5cf6;
    }

    .search-input.hybrid-active {
      border-color: #10b981;
    }

    .search-input.semantic-active:focus {
      outline-color: #8b5cf6;
    }

    .search-input.hybrid-active:focus {
      outline-color: #10b981;
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

    .vectorize-btn {
      transition: all 0.2s;
    }

    .vectorize-btn.vectorized {
      background: #f0fdf4;
    }

    .vectorize-btn:hover:not(:disabled) {
      background: #ede9fe;
    }

    .vectorize-btn.vectorized:hover:not(:disabled) {
      background: #dcfce7;
    }

    .upload-btn {
      transition: all 0.2s;
    }

    .upload-btn:hover:not(:disabled) {
      background: #fef3c7;
    }

    /* Vectorization Panel in Editor */
    .vectorization-panel {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #f9fafb;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }

    .vectorization-panel h4 {
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
    }

    .vector-status {
      margin-bottom: 0.75rem;
    }

    .status-badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .status-badge.vectorized {
      background: #d1fae5;
      color: #065f46;
    }

    .status-badge.not-vectorized {
      background: #f3f4f6;
      color: #6b7280;
    }

    .vector-actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .vector-btn {
      padding: 0.5rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: white;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
    }

    .vector-btn:hover:not(:disabled) {
      background: #f3f4f6;
    }

    .vector-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .vector-btn.upload {
      background: #fef3c7;
      border-color: #fcd34d;
    }

    .vector-btn.upload:hover:not(:disabled) {
      background: #fde68a;
    }

    .vector-hint {
      margin: 0.75rem 0 0 0;
      font-size: 0.7rem;
      color: #6b7280;
      line-height: 1.4;
    }
    
    .post-meta {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 1rem;
    }

    .external-link {
      margin-bottom: 1rem;
      padding: 0.5rem 0.75rem;
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 6px;
    }

    .source-link {
      color: #166534;
      text-decoration: none;
      font-size: 0.875rem;
      word-break: break-all;
    }

    .source-link:hover {
      text-decoration: underline;
      color: #15803d;
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

    .tag-clickable {
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s;
    }

    .tag-clickable:hover {
      background: #e5e7eb;
      color: #1f2937;
      transform: translateY(-1px);
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

    /* Semantic Search Results */
    .semantic-results-header {
      background: #f5f3ff;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      color: #7c3aed;
      font-weight: 500;
    }

    .semantic-results-header.hybrid-header {
      background: #ecfdf5;
      color: #059669;
    }

    .post-card.semantic-result {
      border-left: 4px solid #8b5cf6;
    }

    .post-card.semantic-result.keyword-match {
      border-left: 4px solid #10b981;
    }

    .score-badges {
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }

    .similarity-badge {
      background: #8b5cf6;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .similarity-badge.hybrid-badge {
      background: #10b981;
    }

    .keyword-badge {
      background: #fef3c7;
      padding: 0.25rem 0.4rem;
      border-radius: 12px;
      font-size: 0.7rem;
    }

    .source-type {
      background: #fef3c7;
      color: #92400e;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .matched-chunk {
      background: #faf5ff;
      padding: 0.75rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      color: #4b5563;
    }

    .matched-chunk .chunk-label {
      display: block;
      font-size: 0.7rem;
      color: #7c3aed;
      font-weight: 600;
      margin-bottom: 0.25rem;
      text-transform: uppercase;
    }

    .matched-chunk p {
      margin: 0;
      line-height: 1.5;
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
    
    .category-label, .tag-counter, .path-label, .source-url-label {
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 0.25rem;
      display: block;
      min-height: 16px;
      line-height: 16px;
    }

    /* Source URL Input for Link Posts */
    .source-url-group {
      margin-top: 1rem;
      padding: 1rem;
      background: #fef3c7;
      border-radius: 8px;
      border: 1px solid #fcd34d;
    }

    .source-url-input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 1rem;
      box-sizing: border-box;
    }

    .source-url-input:focus {
      border-color: #f59e0b;
      outline: none;
    }

    .source-url-label {
      color: #92400e;
    }

    .source-url-row {
      display: flex;
      gap: 0.5rem;
      align-items: stretch;
    }

    .source-url-row .source-url-input {
      flex: 1;
    }

    .fetch-url-btn {
      white-space: nowrap;
      padding: 0.75rem 1rem;
      font-size: 0.9rem;
    }

    .fetch-url-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
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
    
    /* TipTap Toolbar Styles */
    .tiptap-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 12px;
      background: #f9fafb;
      border: 1px solid #d1d5db;
      border-bottom: none;
      border-radius: 8px 8px 0 0;
    }

    .toolbar-group {
      display: flex;
      gap: 2px;
      padding-right: 8px;
      border-right: 1px solid #e5e7eb;
      margin-right: 8px;
    }

    .toolbar-group:last-child {
      border-right: none;
      margin-right: 0;
      padding-right: 0;
    }

    .toolbar-btn {
      padding: 6px 10px;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
      min-width: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .toolbar-btn:hover:not(:disabled) {
      background: #f3f4f6;
      border-color: #9ca3af;
    }

    .toolbar-btn.is-active {
      background: #2563eb;
      color: white;
      border-color: #2563eb;
    }

    .toolbar-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Color Picker Button */
    .color-picker-btn {
      position: relative;
      overflow: hidden;
    }

    .color-picker-btn .color-icon {
      font-weight: bold;
      background: linear-gradient(to right, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .color-picker-btn .color-input {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 4px;
      padding: 0;
      border: none;
      cursor: pointer;
      opacity: 0.8;
    }

    .color-picker-btn .color-input::-webkit-color-swatch-wrapper {
      padding: 0;
    }

    .color-picker-btn .color-input::-webkit-color-swatch {
      border: none;
      border-radius: 0;
    }

    /* Link Input Bar */
    .link-input-bar {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      background: #eef2ff;
      border: 1px solid #d1d5db;
      border-top: 1px solid #c7d2fe;
      align-items: center;
    }

    .link-input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 14px;
    }

    .link-btn {
      padding: 6px 12px;
      border: 1px solid #2563eb;
      background: #2563eb;
      color: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }

    .link-btn:hover {
      background: #1d4ed8;
    }

    .link-btn.secondary {
      background: #6b7280;
      border-color: #6b7280;
    }

    .link-btn.secondary:hover {
      background: #5b6470;
    }

    .link-btn.danger {
      background: #dc2626;
      border-color: #dc2626;
    }

    .link-btn.danger:hover {
      background: #b91c1c;
    }

    /* Table Controls Bar */
    .table-controls-bar {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      background: #fef3c7;
      border: 1px solid #d1d5db;
      border-top: 1px solid #fcd34d;
      flex-wrap: wrap;
      align-items: center;
    }

    .table-label {
      font-weight: 600;
      color: #92400e;
      font-size: 13px;
    }

    .table-btn {
      padding: 4px 10px;
      border: 1px solid #f59e0b;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }

    .table-btn:hover {
      background: #fde68a;
    }

    .table-btn.danger {
      border-color: #ef4444;
      color: #dc2626;
    }

    .table-btn.danger:hover {
      background: #fee2e2;
    }

    /* Editor Error Message */
    .editor-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 1.5rem;
      text-align: center;
      color: #991b1b;
    }

    .editor-error strong {
      display: block;
      margin-bottom: 0.5rem;
      font-size: 1.1rem;
    }

    .editor-error p {
      margin: 0 0 1rem 0;
      font-size: 0.9rem;
      color: #7f1d1d;
    }

    /* TipTap Editor Container */
    .tiptap-editor-container {
      min-height: 300px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 1rem;
      background: white;
      outline: none;
    }

    /* When toolbar is present, adjust border-radius */
    .tiptap-editor-container.has-toolbar {
      border-radius: 0 0 8px 8px;
      border-top: none;
    }

    .tiptap-editor-container:focus-within {
      border-color: #2563eb;
    }

    /* TipTap Editor Content Styles */
    .tiptap-editor-container :global(.ProseMirror) {
      outline: none;
      min-height: 280px;
    }

    .tiptap-editor-container :global(.ProseMirror p) {
      margin: 0.5em 0;
      line-height: 1.6;
    }

    .tiptap-editor-container :global(.ProseMirror h1) {
      font-size: 2em;
      font-weight: 700;
      margin: 0.5em 0;
    }

    .tiptap-editor-container :global(.ProseMirror h2) {
      font-size: 1.5em;
      font-weight: 600;
      margin: 0.5em 0;
    }

    .tiptap-editor-container :global(.ProseMirror h3) {
      font-size: 1.25em;
      font-weight: 600;
      margin: 0.5em 0;
    }

    .tiptap-editor-container :global(.ProseMirror ul),
    .tiptap-editor-container :global(.ProseMirror ol) {
      padding-left: 1.5em;
      margin: 0.5em 0;
    }

    .tiptap-editor-container :global(.ProseMirror ul) {
      list-style-type: disc;
    }

    .tiptap-editor-container :global(.ProseMirror ol) {
      list-style-type: decimal;
    }

    .tiptap-editor-container :global(.ProseMirror li) {
      margin: 0.25em 0;
    }

    .tiptap-editor-container :global(.ProseMirror blockquote) {
      border-left: 4px solid #2563eb;
      padding-left: 1em;
      margin: 1em 0;
      color: #6b7280;
      font-style: italic;
    }

    .tiptap-editor-container :global(.ProseMirror code) {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.9em;
    }

    .tiptap-editor-container :global(.ProseMirror pre) {
      background: #1f2937;
      color: #f9fafb;
      padding: 1em;
      border-radius: 8px;
      overflow-x: auto;
      font-family: monospace;
    }

    .tiptap-editor-container :global(.ProseMirror pre code) {
      background: none;
      padding: 0;
      color: inherit;
    }

    .tiptap-editor-container :global(.ProseMirror img) {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }

    .tiptap-editor-container :global(.ProseMirror a) {
      color: #2563eb;
      text-decoration: underline;
    }

    .tiptap-editor-container :global(.ProseMirror hr) {
      border: none;
      border-top: 2px solid #e5e7eb;
      margin: 1.5em 0;
    }

    /* Table Styles */
    .tiptap-editor-container :global(.ProseMirror table) {
      border-collapse: collapse;
      width: 100%;
      margin: 1rem 0;
      table-layout: fixed;
    }

    .tiptap-editor-container :global(.ProseMirror th),
    .tiptap-editor-container :global(.ProseMirror td) {
      border: 2px solid #d1d5db;
      padding: 8px 12px;
      text-align: left;
      position: relative;
      min-width: 100px;
    }

    .tiptap-editor-container :global(.ProseMirror th) {
      background: #f3f4f6;
      font-weight: 600;
    }

    .tiptap-editor-container :global(.ProseMirror tr:hover td) {
      background: #f9fafb;
    }

    .tiptap-editor-container :global(.ProseMirror .selectedCell) {
      background: #dbeafe !important;
    }

    .tiptap-editor-container :global(.ProseMirror .column-resize-handle) {
      position: absolute;
      right: -2px;
      top: 0;
      bottom: 0;
      width: 4px;
      background: #2563eb;
      cursor: col-resize;
    }

    /* Placeholder */
    .tiptap-editor-container :global(.ProseMirror p.is-editor-empty:first-child::before) {
      content: attr(data-placeholder);
      float: left;
      color: #9ca3af;
      pointer-events: none;
      height: 0;
    }

    /* Resizable Image Styles */
    .tiptap-editor-container :global(.resizable-image-container) {
      display: inline-block;
      position: relative;
      margin: 0.5em 0;
      line-height: 0;
    }

    .tiptap-editor-container :global(.resizable-image) {
      display: block;
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      cursor: pointer;
    }

    .tiptap-editor-container :global(.resizable-image-container:hover .resize-handle),
    .tiptap-editor-container :global(.resizable-image-container.resizing .resize-handle) {
      opacity: 1;
    }

    .tiptap-editor-container :global(.resize-handle) {
      position: absolute;
      right: -6px;
      bottom: -6px;
      width: 16px;
      height: 16px;
      background: #2563eb;
      border: 2px solid white;
      border-radius: 4px;
      cursor: se-resize;
      opacity: 0;
      transition: opacity 0.2s;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .tiptap-editor-container :global(.resize-handle::after) {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 6px;
      height: 6px;
      border-right: 2px solid white;
      border-bottom: 2px solid white;
    }

    .tiptap-editor-container :global(.resizable-image-container.resizing) {
      user-select: none;
    }

    .tiptap-editor-container :global(.ProseMirror-selectednode .resizable-image-container) {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
      border-radius: 4px;
    }

    .tiptap-editor-container :global(.ProseMirror-selectednode .resize-handle) {
      opacity: 1;
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