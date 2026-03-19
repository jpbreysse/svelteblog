<script>
  import { onMount } from 'svelte';

  export let data;

  let messages = [];
  let inputMessage = '';
  let isLoading = false;
  let isSaving = false;
  let saveSuccess = null;
  let messagesContainer;

  // Folder filter
  $: paths = data.paths || [];
  let selectedPathId = data.selectedPathId || null;
  $: selectedPathName = selectedPathId
    ? paths.find(p => p.id === selectedPathId)?.name
    : null;

  // Document filter
  $: vectorizedPosts = data.vectorizedPosts || [];
  let selectedPostId = data.selectedPostId || null;
  $: selectedPostTitle = selectedPostId
    ? vectorizedPosts.find(p => p.id === selectedPostId)?.title
    : null;

  // Filter posts by selected folder
  $: filteredPosts = selectedPathId
    ? vectorizedPosts.filter(p => p.path_id === selectedPathId)
    : vectorizedPosts;

  // Clear document selection when folder changes (if document not in folder)
  $: if (selectedPathId && selectedPostId) {
    const postInFolder = vectorizedPosts.find(p => p.id === selectedPostId && p.path_id === selectedPathId);
    if (!postInFolder) {
      selectedPostId = null;
    }
  }

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  async function sendMessage() {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    inputMessage = '';
    isLoading = true;

    // Add user message
    messages = [...messages, { role: 'user', content: userMessage }];

    // Add placeholder for assistant response
    const assistantIndex = messages.length;
    messages = [...messages, { role: 'assistant', content: '', sources: [], isStreaming: true }];

    setTimeout(scrollToBottom, 0);

    try {
      // Build conversation history (exclude the placeholder we just added)
      const history = messages.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: history,
          postId: selectedPostId,  // Filter by specific document
          pathId: selectedPostId ? null : selectedPathId,  // Filter by folder (only if no specific doc)
          limit: 5
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.substring(7).trim();
            continue;
          }

          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            try {
              const parsed = JSON.parse(data);

              // Get the current event type from the previous line
              const prevLine = lines[lines.indexOf(line) - 1];
              const eventType = prevLine?.startsWith('event: ') ? prevLine.substring(7).trim() : 'token';

              if (eventType === 'token' || parsed.text !== undefined) {
                // Append token to assistant message
                messages[assistantIndex].content += parsed.text || '';
                messages = messages;
                scrollToBottom();
              } else if (eventType === 'sources' || Array.isArray(parsed)) {
                // Set sources
                messages[assistantIndex].sources = parsed;
                messages = messages;
              } else if (eventType === 'done') {
                messages[assistantIndex].isStreaming = false;
                messages = messages;
              } else if (eventType === 'error' || parsed.message) {
                messages[assistantIndex].content = `Error: ${parsed.message}`;
                messages[assistantIndex].isStreaming = false;
                messages = messages;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      // Mark as done
      messages[assistantIndex].isStreaming = false;
      messages = messages;

    } catch (error) {
      messages[assistantIndex].content = `Error: ${error.message}`;
      messages[assistantIndex].isStreaming = false;
      messages = messages;
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    messages = [];
    saveSuccess = null;
  }

  async function saveChat() {
    if (messages.length === 0 || isSaving) return;

    isSaving = true;
    saveSuccess = null;

    try {
      const response = await fetch('/api/chat/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
            sources: m.sources
          })),
          category: 'chat-logs',
          vectorize: true
        })
      });

      const result = await response.json();

      if (result.success) {
        saveSuccess = {
          success: true,
          postId: result.post.id,
          slug: result.post.slug,
          title: result.post.title
        };
      } else {
        saveSuccess = {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      saveSuccess = {
        success: false,
        error: error.message
      };
    } finally {
      isSaving = false;
    }
  }
</script>

<svelte:head>
  <title>Chat - Knowledge Base</title>
</svelte:head>

<div class="chat-container">
  <div class="chat-header">
    <div class="header-top">
      <div>
        <h1>Knowledge Base Chat</h1>
        <p class="subtitle">Ask questions about your documents</p>
      </div>
      {#if messages.length > 0}
        <div class="header-actions">
          <button
            class="save-btn"
            on:click={saveChat}
            disabled={isSaving || isLoading}
          >
            {#if isSaving}
              Saving...
            {:else}
              Save as Post
            {/if}
          </button>
          <button class="clear-btn" on:click={clearChat}>Clear Chat</button>
        </div>
      {/if}
    </div>

    <!-- Scope Filters -->
    <div class="scope-filter">
      <label for="folder-filter">Folder:</label>
      <select id="folder-filter" bind:value={selectedPathId} class="folder-select">
        <option value={null}>All Folders</option>
        {#each paths as path}
          <option value={path.id}>{path.icon || '📁'} {path.name} ({path.post_count} docs)</option>
        {/each}
      </select>

      <label for="doc-filter">Document:</label>
      <select id="doc-filter" bind:value={selectedPostId} class="doc-select">
        <option value={null}>{selectedPathId ? 'All in folder' : 'All Documents'}</option>
        {#each filteredPosts as post}
          <option value={post.id}>{post.title} ({post.chunk_count} chunks)</option>
        {/each}
      </select>

      {#if selectedPathId || selectedPostId}
        <button class="clear-filter-btn" on:click={() => { selectedPathId = null; selectedPostId = null; }} title="Clear filters">
          ✕
        </button>
      {/if}
    </div>

    {#if selectedPostId}
      <div class="scope-indicator">
        Searching in document: <strong>{selectedPostTitle}</strong>
      </div>
    {:else if selectedPathId}
      <div class="scope-indicator">
        Searching in folder: <strong>{selectedPathName}</strong> ({filteredPosts.length} documents)
      </div>
    {/if}

    {#if saveSuccess}
      <div class="save-result {saveSuccess.success ? 'success' : 'error'}">
        {#if saveSuccess.success}
          Saved! <a href="/blog/{saveSuccess.slug}">View post: {saveSuccess.title}</a>
        {:else}
          Error: {saveSuccess.error}
        {/if}
      </div>
    {/if}
  </div>

  <div class="messages-container" bind:this={messagesContainer}>
    {#if messages.length === 0}
      <div class="empty-state">
        <p>Ask a question to search your knowledge base.</p>
        <p class="hint">Examples:</p>
        <ul>
          <li>"How do I set up PostgreSQL?"</li>
          <li>"What was discussed in the last meeting?"</li>
          <li>"Explain the authentication flow"</li>
        </ul>
      </div>
    {:else}
      {#each messages as message, i}
        <div class="message {message.role}">
          <div class="message-content">
            {#if message.role === 'assistant' && message.isStreaming && !message.content}
              <span class="typing-indicator">Thinking...</span>
            {:else}
              <p>{message.content}</p>
            {/if}
          </div>

          {#if message.role === 'assistant' && message.sources && message.sources.length > 0}
            <div class="sources">
              <span class="sources-label">Sources:</span>
              {#each message.sources as source}
                <a href="/blog/{source.slug}" class="source-link" target="_blank">
                  [{source.index}] {source.title}
                  <span class="similarity">({Math.round(source.similarity * 100)}%)</span>
                </a>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="input-container">
    <textarea
      bind:value={inputMessage}
      on:keydown={handleKeydown}
      placeholder="Ask a question..."
      disabled={isLoading}
      rows="2"
    ></textarea>
    <button
      class="send-btn"
      on:click={sendMessage}
      disabled={isLoading || !inputMessage.trim()}
    >
      {#if isLoading}
        Sending...
      {:else}
        Send
      {/if}
    </button>
  </div>
</div>

<style>
  .chat-container {
    max-width: 900px;
    margin: 0 auto;
    height: calc(100vh - 120px);
    display: flex;
    flex-direction: column;
  }

  .chat-header {
    padding: 1rem 0;
    border-bottom: 1px solid #e5e7eb;
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .chat-header h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #1f2937;
  }

  .subtitle {
    margin: 0.25rem 0 0;
    color: #6b7280;
    font-size: 0.875rem;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  /* Document Scope Filter */
  .scope-filter {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #f3f4f6;
    flex-wrap: wrap;
  }

  .scope-filter label {
    font-size: 0.875rem;
    color: #6b7280;
    white-space: nowrap;
  }

  .folder-select {
    min-width: 180px;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    background: white;
  }

  .folder-select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .doc-select {
    flex: 1;
    min-width: 200px;
    max-width: 400px;
    padding: 0.5rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    background: white;
  }

  .doc-select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .clear-filter-btn {
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    background: #f3f4f6;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
    color: #6b7280;
    transition: all 0.2s;
  }

  .clear-filter-btn:hover {
    background: #e5e7eb;
    color: #374151;
  }

  .scope-indicator {
    margin-top: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #dbeafe;
    border-radius: 6px;
    font-size: 0.8rem;
    color: #1e40af;
  }

  .scope-indicator strong {
    font-weight: 600;
  }

  .clear-btn, .save-btn {
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    color: #6b7280;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .clear-btn:hover, .save-btn:hover:not(:disabled) {
    background: #e5e7eb;
    color: #374151;
  }

  .save-btn {
    background: #dbeafe;
    border-color: #bfdbfe;
    color: #1d4ed8;
  }

  .save-btn:hover:not(:disabled) {
    background: #bfdbfe;
    color: #1e40af;
  }

  .save-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .save-result {
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .save-result.success {
    background: #d1fae5;
    color: #065f46;
  }

  .save-result.success a {
    color: #047857;
    text-decoration: underline;
  }

  .save-result.error {
    background: #fee2e2;
    color: #991b1b;
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 0;
  }

  .empty-state {
    text-align: center;
    color: #6b7280;
    padding: 3rem;
  }

  .empty-state p {
    margin: 0.5rem 0;
  }

  .empty-state .hint {
    margin-top: 1.5rem;
    font-weight: 500;
    color: #374151;
  }

  .empty-state ul {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0;
  }

  .empty-state li {
    padding: 0.5rem;
    background: #f9fafb;
    border-radius: 6px;
    margin: 0.5rem 0;
    font-style: italic;
  }

  .message {
    margin: 1rem 0;
    padding: 1rem;
    border-radius: 12px;
    max-width: 85%;
  }

  .message.user {
    background: #2563eb;
    color: white;
    margin-left: auto;
    border-bottom-right-radius: 4px;
  }

  .message.assistant {
    background: #f3f4f6;
    color: #1f2937;
    margin-right: auto;
    border-bottom-left-radius: 4px;
  }

  .message-content p {
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.6;
  }

  .typing-indicator {
    color: #6b7280;
    font-style: italic;
  }

  .sources {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
    font-size: 0.8rem;
  }

  .sources-label {
    display: block;
    color: #6b7280;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  .source-link {
    display: inline-block;
    color: #2563eb;
    text-decoration: none;
    margin-right: 1rem;
    margin-bottom: 0.25rem;
  }

  .source-link:hover {
    text-decoration: underline;
  }

  .similarity {
    color: #9ca3af;
    font-size: 0.75rem;
  }

  .input-container {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 0;
    border-top: 1px solid #e5e7eb;
    background: white;
  }

  textarea {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    resize: none;
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.5;
  }

  textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  textarea:disabled {
    background: #f9fafb;
    color: #9ca3af;
  }

  .send-btn {
    padding: 0.75rem 1.5rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
    align-self: flex-end;
  }

  .send-btn:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .send-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .chat-container {
      height: calc(100vh - 140px);
    }

    .message {
      max-width: 95%;
    }

    .header-actions {
      position: static;
      transform: none;
      margin-top: 0.5rem;
      justify-content: flex-end;
    }

    .input-container {
      flex-direction: column;
    }

    .send-btn {
      align-self: stretch;
    }
  }
</style>
