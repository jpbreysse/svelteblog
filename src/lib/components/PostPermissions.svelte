<script>
  export let visibility = 'public';
  export let readGroupIds = [];
  export let writeGroupIds = [];
  export let availableGroups = [];

  $: showGroupSelector = visibility === 'groups';
</script>

<div class="permissions-panel">
  <h3>🔒 Post Permissions</h3>

  <div class="visibility-options">
    <label class="visibility-option">
      <input type="radio" bind:group={visibility} value="public" />
      <div class="option-content">
        <span class="option-icon">🌍</span>
        <div class="option-text">
          <strong>Public</strong>
          <p>Everyone can read this post</p>
        </div>
      </div>
    </label>

    <label class="visibility-option">
      <input type="radio" bind:group={visibility} value="groups" />
      <div class="option-content">
        <span class="option-icon">👥</span>
        <div class="option-text">
          <strong>Groups Only</strong>
          <p>Only specific groups can read</p>
        </div>
      </div>
    </label>

    <label class="visibility-option">
      <input type="radio" bind:group={visibility} value="private" />
      <div class="option-content">
        <span class="option-icon">🔒</span>
        <div class="option-text">
          <strong>Private</strong>
          <p>Only you can read this post</p>
        </div>
      </div>
    </label>
  </div>

  {#if showGroupSelector}
    <div class="group-permissions">
      <div class="permission-section">
        <h4>👁️ Can Read</h4>
        <p class="help-text">Select groups that can view this post</p>
        {#if availableGroups.length === 0}
          <p class="no-groups">No groups available. You need to be a member of at least one group.</p>
        {:else}
          <div class="group-list">
            {#each availableGroups as group}
              <label class="group-checkbox">
                <input
                  type="checkbox"
                  value={group.id}
                  bind:group={readGroupIds}
                />
                <span>{group.name}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <div class="permission-section">
        <h4>✏️ Can Edit</h4>
        <p class="help-text">Select groups that can edit this post</p>
        {#if availableGroups.length === 0}
          <p class="no-groups">No groups available.</p>
        {:else}
          <div class="group-list">
            {#each availableGroups as group}
              <label class="group-checkbox">
                <input
                  type="checkbox"
                  value={group.id}
                  bind:group={writeGroupIds}
                />
                <span>{group.name}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="permission-summary">
      <strong>Summary:</strong>
      {#if writeGroupIds.length > 0}
        <span class="summary-item">
          ✏️ {writeGroupIds.length} group(s) can edit
        </span>
      {/if}
      {#if readGroupIds.length > 0}
        <span class="summary-item">
          👁️ {readGroupIds.length} group(s) can read
        </span>
      {:else if visibility === 'groups'}
        <span class="warning">⚠️ No read groups selected - only you can see this post!</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .permissions-panel {
    padding: 1.5rem;
    background: #f9fafb;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    margin-bottom: 1rem;
  }

  .permissions-panel h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: #1f2937;
  }

  .visibility-options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .visibility-option {
    cursor: pointer;
    display: block;
  }

  .visibility-option input[type="radio"] {
    position: absolute;
    opacity: 0;
  }

  .option-content {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .visibility-option:has(input:checked) .option-content {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .option-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .option-text {
    flex: 1;
  }

  .option-text strong {
    display: block;
    color: #1f2937;
    margin-bottom: 0.25rem;
    font-size: 0.875rem;
  }

  .option-text p {
    margin: 0;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .group-permissions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-top: 1rem;
    padding: 1rem;
    background: white;
    border-radius: 6px;
  }

  .permission-section h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: #1f2937;
  }

  .help-text {
    margin: 0 0 0.75rem 0;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .no-groups {
    font-size: 0.75rem;
    color: #9ca3af;
    font-style: italic;
    margin: 0.5rem 0;
  }

  .group-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .group-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .group-checkbox:hover {
    background: #f3f4f6;
  }

  .group-checkbox input[type="checkbox"] {
    cursor: pointer;
  }

  .permission-summary {
    margin-top: 1rem;
    padding: 1rem;
    background: #eff6ff;
    border-radius: 6px;
    border-left: 3px solid #2563eb;
    font-size: 0.875rem;
  }

  .permission-summary strong {
    display: block;
    margin-bottom: 0.5rem;
    color: #1f2937;
  }

  .summary-item {
    display: inline-block;
    margin-right: 1rem;
    color: #1f2937;
  }

  .warning {
    color: #d97706;
    font-weight: 500;
  }

  @media (max-width: 768px) {
    .group-permissions {
      grid-template-columns: 1fr;
    }
  }
</style>
