# Multi-Step LLM Workflow Engine

## Overview

A workflow engine that executes multi-step LLM pipelines defined as posts with markdown step markers. Each step runs sequentially, with RAG context from the knowledge base, and the final output is saved as a new post.

**Features:**
- Workflow definitions stored as posts with `## Step N` markers
- Sequential execution (output feeds into next step)
- RAG integration (pull context from knowledge base)
- Save final output as a new post
- Real-time streaming of each step's output

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow Definition (Post)                    │
│                                                                   │
│   # Document Analysis Workflow                                   │
│                                                                   │
│   ## Step 1: Summarize                                          │
│   Summarize the document in 5 bullet points.                    │
│   {{input}}                                                      │
│                                                                   │
│   ## Step 2: Extract Entities                                   │
│   Extract people, organizations, dates from {{step1}}           │
│                                                                   │
│   ## Step 3: Classify                                           │
│   Classify as: technical, meeting, report, or correspondence    │
│                                                                   │
│   ## Step 4: Final Report                                       │
│   Combine {{step1}}, {{step2}}, {{step3}} into a report        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Workflow Executor                             │
│                                                                   │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐     │
│   │ Step 1  │───▶│ Step 2  │───▶│ Step 3  │───▶│ Step 4  │     │
│   │         │    │         │    │         │    │         │     │
│   │ +RAG    │    │ +RAG    │    │ +RAG    │    │ +RAG    │     │
│   │ context │    │ context │    │ context │    │ context │     │
│   └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘     │
│        │              │              │              │           │
│        ▼              ▼              ▼              ▼           │
│   {{step1}}      {{step2}}      {{step3}}      {{step4}}       │
│                                                                   │
│   All outputs streamed to UI in real-time via SSE               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Output Post (Auto-created)                    │
│                                                                   │
│   Title: "Document Analysis - Results - 2024-01-15"             │
│   Category: workflow-results                                     │
│                                                                   │
│   ## Summary                                                     │
│   - Point 1...                                                   │
│                                                                   │
│   ## Entities                                                    │
│   People: John, Sarah...                                        │
│                                                                   │
│   ## Classification                                              │
│   Technical Documentation                                        │
│                                                                   │
│   ## Final Report                                                │
│   ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Workflow Definition Format

Workflows are stored as regular posts with category `workflow`. Each step is marked with a heading:

```markdown
# Invoice Analysis Workflow

## Step 1: Extract Data
Extract the following from the invoice:
- Invoice number
- Date
- Vendor name
- Line items with amounts
- Total amount

Document:
{{input}}

## Step 2: Validate
Check the extracted data for:
- Missing fields
- Math errors (do line items sum to total?)
- Date format issues

Extracted data:
{{step1}}

## Step 3: Categorize
Based on the vendor and line items, categorize this invoice:
- Software/SaaS
- Hardware
- Professional Services
- Office Supplies
- Travel
- Other

Data:
{{step1}}

## Step 4: Summary Report
Create a structured report with:
1. Invoice overview
2. Validation status
3. Category
4. Recommended action

Use all previous analysis:
{{all}}
```

---

## Variable Reference

| Variable | Description |
|----------|-------------|
| `{{input}}` | Original document/text provided by user |
| `{{step1}}` | Output from Step 1 |
| `{{step2}}` | Output from Step 2 |
| `{{stepN}}` | Output from Step N |
| `{{context}}` | RAG context from knowledge base |
| `{{all}}` | All previous step outputs combined |

---

## Components

### 1. Workflow Parser (`src/lib/server/workflow-parser.js`)

Parse markdown workflow definitions into structured steps:

```javascript
/**
 * Parse workflow markdown into steps
 * @param {string} markdown - Workflow definition
 * @returns {Array<{stepNumber, title, content}>}
 */
export function parseWorkflow(markdown) {
  const steps = [];
  const stepRegex = /^##\s+Step\s+(\d+):\s*(.+?)\n([\s\S]*?)(?=^##\s+Step|\Z)/gm;

  let match;
  while ((match = stepRegex.exec(markdown)) !== null) {
    steps.push({
      stepNumber: parseInt(match[1]),
      title: match[2].trim(),
      content: match[3].trim()
    });
  }

  return steps.sort((a, b) => a.stepNumber - b.stepNumber);
}

/**
 * Replace variables in step content
 * {{input}} - Original input document
 * {{step1}}, {{step2}} - Previous step outputs
 * {{context}} - RAG context
 */
export function interpolateVariables(content, variables) {
  return content.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    return variables[name] || match;
  });
}
```

---

### 2. Workflow Executor (`src/lib/server/workflow-executor.js`)

Sequential execution engine with RAG integration:

```javascript
import { generateStream } from './ollama.js';
import { generateEmbedding } from './embeddings.js';
import { pool } from '$lib/db.js';

/**
 * Execute a workflow step by step
 * @param {Array} steps - Parsed workflow steps
 * @param {string} input - Input document/text
 * @param {object} options - Execution options
 * @yields {object} - Step progress and tokens
 */
export async function* executeWorkflow(steps, input, options = {}) {
  const outputs = { input };

  for (const step of steps) {
    // Signal step start
    yield { type: 'step_start', step: step.stepNumber, title: step.title };

    // Get RAG context for this step
    const context = await getRAGContext(step.content, options.ragLimit || 3);
    outputs.context = context;

    // Interpolate variables
    const prompt = interpolateVariables(step.content, outputs);

    // Build full prompt with context
    const fullPrompt = buildStepPrompt(prompt, context);

    // Stream LLM output
    let stepOutput = '';
    const generator = generateStream(fullPrompt, {
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 2000
    });

    for await (const token of generator) {
      stepOutput += token;
      yield { type: 'token', step: step.stepNumber, text: token };
    }

    // Store output for next steps
    outputs[`step${step.stepNumber}`] = stepOutput;

    // Signal step complete
    yield { type: 'step_complete', step: step.stepNumber, output: stepOutput };
  }

  // Return all outputs
  yield { type: 'workflow_complete', outputs };
}

async function getRAGContext(query, limit) {
  // Reuse hybrid search logic from chat
  const embedding = await generateEmbedding(query);
  // ... search similar chunks
  return contextChunks;
}
```

---

### 3. Execute API Endpoint (`src/routes/api/workflow/execute/+server.js`)

```javascript
/**
 * POST /api/workflow/execute
 * Execute a workflow and stream results
 *
 * Body:
 * - workflowId: Post ID containing workflow definition
 * - input: Document/text to process
 * - saveResult: boolean (default: true)
 * - resultTitle: string (optional)
 *
 * Response: SSE stream
 * - event: step_start → { step: 1, title: "Summarize" }
 * - event: token → { step: 1, text: "The" }
 * - event: step_complete → { step: 1, output: "..." }
 * - event: result_saved → { postId: 123, slug: "..." }
 * - event: done → {}
 */

export async function POST({ request, locals }) {
  // Auth check
  if (!locals.user) {
    return sseError('Authentication required', 401);
  }

  const { workflowId, input, saveResult = true, resultTitle } = await request.json();

  // Load workflow definition
  const workflow = await blogDB.getPostById(workflowId);
  const steps = parseWorkflow(workflow.content);

  // Execute and stream
  const stream = createWorkflowStream(steps, input, {
    saveResult,
    resultTitle: resultTitle || `${workflow.title} - Results`,
    authorId: locals.user.id
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  });
}
```

---

### 4. Result Post Creation

After workflow completes, save output as a new post:

```javascript
async function saveWorkflowResult(outputs, options) {
  // Format outputs as markdown
  const content = Object.entries(outputs)
    .filter(([key]) => key.startsWith('step'))
    .map(([key, value]) => {
      const stepNum = key.replace('step', '');
      return `## Step ${stepNum} Output\n\n${value}`;
    })
    .join('\n\n---\n\n');

  // Create post
  const result = await blogDB.createPost({
    title: options.resultTitle,
    content: content,
    category: 'workflow-results',
    visibility: 'public'
  }, options.authorId);

  // Optionally vectorize for search
  if (options.vectorize) {
    await vectorizePost(result.post.id);
  }

  return result.post;
}
```

---

### 5. Workflow UI (`src/routes/workflow/+page.svelte`)

Features:
- Select workflow from dropdown (posts with category='workflow')
- Text input area for document/text to analyze
- "Run Workflow" button
- Real-time step progress display
- Collapsible sections for each step's output
- Link to saved result post

```svelte
<script>
  let selectedWorkflow = null;
  let inputText = '';
  let steps = [];
  let currentStep = 0;
  let outputs = {};

  async function runWorkflow() {
    const response = await fetch('/api/workflow/execute', {
      method: 'POST',
      body: JSON.stringify({
        workflowId: selectedWorkflow.id,
        input: inputText
      })
    });

    const reader = response.body.getReader();
    // Process SSE events, update UI in real-time
  }
</script>

<div class="workflow-runner">
  <select bind:value={selectedWorkflow}>
    {#each workflows as w}
      <option value={w}>{w.title}</option>
    {/each}
  </select>

  <textarea bind:value={inputText} placeholder="Paste document to analyze..."></textarea>

  <button on:click={runWorkflow}>Run Workflow</button>

  {#each steps as step, i}
    <div class="step" class:active={currentStep === i} class:complete={outputs[`step${i+1}`]}>
      <h3>Step {i+1}: {step.title}</h3>
      {#if outputs[`step${i+1}`]}
        <div class="output">{outputs[`step${i+1}`]}</div>
      {/if}
    </div>
  {/each}
</div>
```

---

## API Endpoints

### List Workflows

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workflow` | GET | List all workflow definitions |

### Execute Workflow

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workflow/execute` | POST | Execute workflow, stream results |

**Request Body:**
```json
{
  "workflowId": 42,
  "input": "Invoice #12345...",
  "saveResult": true,
  "resultTitle": "Invoice Analysis - 2024-01-15"
}
```

---

## SSE Event Format

```
event: step_start
data: {"step": 1, "title": "Extract Data"}

event: token
data: {"step": 1, "text": "Invoice"}

event: token
data: {"step": 1, "text": " number"}

event: step_complete
data: {"step": 1, "output": "Invoice number: INV-2024-001..."}

event: step_start
data: {"step": 2, "title": "Validate"}

...

event: result_saved
data: {"postId": 107, "slug": "invoice-analysis-results-2024-01-15"}

event: done
data: {}
```

---

## Implementation Steps

| Step | Task | Files |
|------|------|-------|
| 1 | Create workflow parser | `src/lib/server/workflow-parser.js` |
| 2 | Create workflow executor | `src/lib/server/workflow-executor.js` |
| 3 | Create execute API endpoint | `src/routes/api/workflow/execute/+server.js` |
| 4 | Create workflow list endpoint | `src/routes/api/workflow/+server.js` |
| 5 | Create workflow UI page | `src/routes/workflow/+page.svelte` |
| 6 | Add page server | `src/routes/workflow/+page.server.js` |
| 7 | Add nav link | `src/routes/+layout.svelte` |
| 8 | Test with example workflow | Manual testing |

---

## Files Summary

### New Files:
- `src/lib/server/workflow-parser.js` - Parse markdown steps
- `src/lib/server/workflow-executor.js` - Execute steps sequentially
- `src/routes/api/workflow/execute/+server.js` - SSE execution endpoint
- `src/routes/api/workflow/+server.js` - List workflows
- `src/routes/workflow/+page.svelte` - Workflow runner UI
- `src/routes/workflow/+page.server.js` - Load workflows

### Modified Files:
- `src/routes/+layout.svelte` - Add nav link

---

## Security Considerations

1. **Auth required** - Only logged-in users can run workflows
2. **Rate limiting** - Limit concurrent workflow executions
3. **Input validation** - Sanitize input text
4. **Token limits** - Cap maxTokens to prevent abuse
5. **Workflow ownership** - Only workflow authors can edit definitions

---

## Usage Example

### 1. Create a Workflow Post

Create a new post with category `workflow`:

**Title:** Document Analysis Workflow

**Content:**
```markdown
## Step 1: Summarize
Summarize the following document in 5 bullet points:

{{input}}

## Step 2: Extract Key Information
From the summary below, extract:
- Main topic
- Key dates mentioned
- Important names or organizations
- Action items

Summary:
{{step1}}

## Step 3: Generate Report
Create a final report combining all analysis:

Summary:
{{step1}}

Key Information:
{{step2}}

Format as a professional brief.
```

### 2. Run the Workflow

1. Go to `/workflow`
2. Select "Document Analysis Workflow" from dropdown
3. Paste document text in input area
4. Click "Run Workflow"
5. Watch each step execute in real-time
6. View saved result post when complete
