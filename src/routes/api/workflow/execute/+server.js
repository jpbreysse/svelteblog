/**
 * POST /api/workflow/execute
 * Execute a workflow and stream results via SSE
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
 * - event: error → { message: "..." }
 */

import { blogDB } from '$lib/db.js';
import { parseWorkflow, validateWorkflow, extractWorkflowMetadata } from '$lib/server/workflow-parser.js';
import { executeWorkflow, createWorkflowSSEStream } from '$lib/server/workflow-executor.js';

/**
 * Create SSE error response
 */
function sseError(message, status = 500) {
  return new Response(
    `event: error\ndata: ${JSON.stringify({ message })}\n\n`,
    {
      status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    }
  );
}

export async function POST({ request, locals }) {
  // Auth check
  if (!locals.user) {
    return sseError('Authentication required', 401);
  }

  try {
    const body = await request.json();
    const {
      workflowId,
      input,
      saveResult = true,
      resultTitle,
      useRAG = false,  // Disabled by default - workflow input IS the document
      ragLimit = 3
    } = body;

    // Validate input
    if (!workflowId) {
      return sseError('workflowId is required', 400);
    }

    if (!input || input.trim().length === 0) {
      return sseError('input is required', 400);
    }

    // Load workflow definition
    const workflow = await blogDB.getPostById(workflowId);
    if (!workflow) {
      return sseError('Workflow not found', 404);
    }

    // Parse workflow steps
    const steps = parseWorkflow(workflow.content);
    const validation = validateWorkflow(steps);

    if (!validation.valid) {
      return sseError(`Invalid workflow: ${validation.errors.join(', ')}`, 400);
    }

    console.log(`🔄 Executing workflow "${workflow.title}" with ${steps.length} steps (user: ${locals.user.id})`);
    console.log(`📝 Input (first 200 chars): "${input.substring(0, 200)}..."`);

    // Create the executor generator with user permissions for RAG filtering
    const executor = executeWorkflow(steps, input, {
      useRAG,
      ragLimit,
      temperature: 0.7,
      maxTokens: 2000,
      userId: locals.user.id,
      userRole: locals.user.role
    });

    // Wrap executor to handle saving result
    const wrappedExecutor = wrapExecutorWithSave(executor, {
      saveResult,
      resultTitle: resultTitle || `${workflow.title} - Results - ${new Date().toISOString().replace('T', ' ').substring(0, 19)}`,
      authorId: locals.user.id,
      workflowId,
      workflowTitle: workflow.title
    });

    // Create SSE stream
    const stream = createWorkflowSSEStream(wrappedExecutor);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('❌ Workflow execution error:', error);
    return sseError(error.message, 500);
  }
}

/**
 * Wrap executor to save result as post after completion
 */
async function* wrapExecutorWithSave(executor, options) {
  let outputs = null;

  for await (const event of executor) {
    yield event;

    // Capture outputs when workflow completes
    if (event.type === 'workflow_complete') {
      outputs = event.outputs;
    }
  }

  // Save result if requested
  if (options.saveResult && outputs) {
    try {
      const savedPost = await saveWorkflowResult(outputs, options);
      yield {
        type: 'result_saved',
        postId: savedPost.id,
        slug: savedPost.slug,
        title: savedPost.title
      };
    } catch (error) {
      yield {
        type: 'save_error',
        message: error.message
      };
    }
  }
}

/**
 * Save workflow result as a new post
 */
async function saveWorkflowResult(outputs, options) {
  // Get the last step's output as the main content
  const stepKeys = Object.keys(outputs)
    .filter(key => key.match(/^step\d+$/))
    .sort((a, b) => {
      const numA = parseInt(a.replace('step', ''), 10);
      const numB = parseInt(b.replace('step', ''), 10);
      return numA - numB;
    });

  // Format content with all step outputs
  const content = stepKeys.map(key => {
    const stepNum = key.replace('step', '');
    return `## Step ${stepNum} Output\n\n${outputs[key]}`;
  }).join('\n\n---\n\n');

  // Create post
  const result = await blogDB.createPost({
    title: options.resultTitle,
    content: content,
    category: 'workflow-results',
    visibility: 'private',
    source_url: `workflow:${options.workflowId}`
  }, options.authorId);

  console.log(`✅ Workflow result saved as post ${result.post.id}: "${options.resultTitle}"`);

  return result.post;
}
