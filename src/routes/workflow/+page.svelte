<script>
  export let data;

  let selectedWorkflow = null;
  let inputText = '';
  let isRunning = false;
  let currentStep = 0;
  let steps = [];
  let outputs = {};
  let savedResult = null;
  let error = null;

  $: if (selectedWorkflow) {
    // Reset state when workflow changes
    steps = selectedWorkflow.steps || [];
    outputs = {};
    currentStep = 0;
    savedResult = null;
    error = null;
  }

  async function runWorkflow() {
    if (!selectedWorkflow || !inputText.trim() || isRunning) return;

    isRunning = true;
    currentStep = 0;
    outputs = {};
    savedResult = null;
    error = null;

    try {
      const response = await fetch('/api/workflow/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: selectedWorkflow.id,
          input: inputText,
          saveResult: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.substring(7).trim();
            continue;
          }

          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            try {
              const parsed = JSON.parse(data);
              handleEvent(currentEventType, parsed);
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

    } catch (err) {
      error = err.message;
    } finally {
      isRunning = false;
    }
  }

  function handleEvent(type, data) {
    switch (type) {
      case 'step_start':
        currentStep = data.step;
        outputs[`step${data.step}`] = '';
        outputs = outputs; // Trigger reactivity
        break;

      case 'token':
        outputs[`step${data.step}`] = (outputs[`step${data.step}`] || '') + data.text;
        outputs = outputs;
        break;

      case 'step_complete':
        outputs[`step${data.step}`] = data.output;
        outputs = outputs;
        break;

      case 'step_error':
        error = `Step ${data.step} error: ${data.error}`;
        break;

      case 'result_saved':
        savedResult = data;
        break;

      case 'save_error':
        error = `Failed to save result: ${data.message}`;
        break;

      case 'error':
        error = data.message;
        break;

      case 'workflow_complete':
        // Workflow finished
        break;
    }
  }

  function getStepStatus(stepNumber) {
    if (currentStep === stepNumber && isRunning) return 'running';
    if (outputs[`step${stepNumber}`]) return 'complete';
    return 'pending';
  }

  function reset() {
    outputs = {};
    currentStep = 0;
    savedResult = null;
    error = null;
    inputText = '';
  }
</script>

<svelte:head>
  <title>Run Workflow</title>
</svelte:head>

<div class="workflow-container">
  <div class="workflow-header">
    <h1>Run Workflow</h1>
    <p class="subtitle">Execute multi-step document analysis</p>
  </div>

  <div class="workflow-setup">
    <div class="form-group">
      <label for="workflow-select">Select Workflow</label>
      <select id="workflow-select" bind:value={selectedWorkflow} disabled={isRunning}>
        <option value={null}>-- Choose a workflow --</option>
        {#each data.workflows as workflow}
          <option value={workflow}>
            {workflow.title} ({workflow.stepCount} steps)
          </option>
        {/each}
      </select>
    </div>

    {#if selectedWorkflow}
      <div class="workflow-info">
        <p class="description">{selectedWorkflow.description || 'No description'}</p>
        <div class="step-preview">
          <strong>Steps:</strong>
          {#each selectedWorkflow.steps as step}
            <span class="step-badge">Step {step.number}: {step.title}</span>
          {/each}
        </div>
      </div>
    {/if}

    <div class="form-group">
      <label for="input-text">Input Document</label>
      <textarea
        id="input-text"
        bind:value={inputText}
        placeholder="Paste your document or text here to analyze..."
        rows="8"
        disabled={isRunning}
      ></textarea>
    </div>

    <div class="actions">
      <button
        class="run-btn"
        on:click={runWorkflow}
        disabled={!selectedWorkflow || !inputText.trim() || isRunning}
      >
        {#if isRunning}
          Running...
        {:else}
          Run Workflow
        {/if}
      </button>

      {#if Object.keys(outputs).length > 0}
        <button class="reset-btn" on:click={reset} disabled={isRunning}>
          Reset
        </button>
      {/if}
    </div>
  </div>

  {#if error}
    <div class="error-banner">
      {error}
    </div>
  {/if}

  {#if selectedWorkflow && (isRunning || Object.keys(outputs).length > 0)}
    <div class="workflow-progress">
      <h2>Execution Progress</h2>

      {#each steps as step}
        {@const status = getStepStatus(step.number)}
        <div class="step-card {status}">
          <div class="step-header">
            <span class="step-status">
              {#if status === 'complete'}
                <span class="icon">&#10003;</span>
              {:else if status === 'running'}
                <span class="icon spinning">&#8635;</span>
              {:else}
                <span class="icon">&#9675;</span>
              {/if}
            </span>
            <h3>Step {step.number}: {step.title}</h3>
            <span class="status-label">{status}</span>
          </div>

          {#if outputs[`step${step.number}`]}
            <div class="step-output">
              <pre>{outputs[`step${step.number}`]}</pre>
            </div>
          {/if}
        </div>
      {/each}

      {#if savedResult}
        <div class="result-banner">
          <strong>Result saved!</strong>
          <a href="/blog/{savedResult.slug}" target="_blank">
            View: {savedResult.title}
          </a>
        </div>
      {/if}
    </div>
  {/if}

  {#if data.workflows.length === 0}
    <div class="empty-state">
      <h3>No Workflows Available</h3>
      <p>Create a post with category "prompt-template" or "workflow" to define a workflow.</p>
      <p>Use the format:</p>
      <pre>
# Workflow Title

## Step 1: First Step
Your prompt for step 1...
&#123;&#123;input&#125;&#125;

## Step 2: Second Step
Your prompt for step 2...
&#123;&#123;step1&#125;&#125;
      </pre>
    </div>
  {/if}
</div>

<style>
  .workflow-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 1rem;
  }

  .workflow-header {
    margin-bottom: 2rem;
  }

  .workflow-header h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #1f2937;
  }

  .subtitle {
    margin: 0.25rem 0 0;
    color: #6b7280;
    font-size: 0.875rem;
  }

  .workflow-setup {
    background: #f9fafb;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.5rem;
  }

  select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 1rem;
    background: white;
  }

  select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.5;
    resize: vertical;
  }

  textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  textarea:disabled, select:disabled {
    background: #f3f4f6;
    color: #9ca3af;
  }

  .workflow-info {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .workflow-info .description {
    margin: 0 0 0.75rem;
    color: #6b7280;
  }

  .step-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .step-badge {
    background: #e5e7eb;
    color: #374151;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .actions {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }

  .run-btn {
    flex: 1;
    padding: 0.75rem 1.5rem;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .run-btn:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .run-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .reset-btn {
    padding: 0.75rem 1.5rem;
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .reset-btn:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .error-banner {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .workflow-progress {
    margin-top: 2rem;
  }

  .workflow-progress h2 {
    font-size: 1.25rem;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .step-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    margin-bottom: 1rem;
    overflow: hidden;
  }

  .step-card.complete {
    border-color: #86efac;
  }

  .step-card.running {
    border-color: #93c5fd;
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .step-card.complete .step-header {
    background: #f0fdf4;
  }

  .step-card.running .step-header {
    background: #eff6ff;
  }

  .step-status .icon {
    font-size: 1.25rem;
  }

  .step-card.complete .icon {
    color: #16a34a;
  }

  .step-card.running .icon {
    color: #2563eb;
  }

  .step-card.pending .icon {
    color: #9ca3af;
  }

  .spinning {
    display: inline-block;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .step-header h3 {
    margin: 0;
    flex: 1;
    font-size: 1rem;
    color: #1f2937;
  }

  .status-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #6b7280;
    font-weight: 500;
  }

  .step-output {
    padding: 1rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .step-output pre {
    margin: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: inherit;
    font-size: 0.875rem;
    line-height: 1.6;
    color: #374151;
  }

  .result-banner {
    background: #f0fdf4;
    border: 1px solid #86efac;
    color: #166534;
    padding: 1rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .result-banner a {
    color: #2563eb;
    text-decoration: none;
  }

  .result-banner a:hover {
    text-decoration: underline;
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    background: #f9fafb;
    border-radius: 12px;
    color: #6b7280;
  }

  .empty-state h3 {
    color: #374151;
    margin-bottom: 0.5rem;
  }

  .empty-state pre {
    text-align: left;
    background: #1f2937;
    color: #f9fafb;
    padding: 1rem;
    border-radius: 8px;
    font-size: 0.875rem;
    overflow-x: auto;
    margin-top: 1rem;
  }

  @media (max-width: 768px) {
    .actions {
      flex-direction: column;
    }

    .step-header {
      flex-wrap: wrap;
    }

    .status-label {
      width: 100%;
      text-align: right;
    }
  }
</style>
