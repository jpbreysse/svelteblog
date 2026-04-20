/**
 * GET /api/workflow
 * List all available workflow definitions
 *
 * Response:
 * - workflows: Array of workflow posts with metadata
 */

import { pool } from '$lib/db.js';
import { parseWorkflow, extractWorkflowMetadata, validateWorkflow } from '$lib/server/workflow-parser.js';

export async function GET({ locals }) {
  // Auth check
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Get all posts with category 'prompt-template' or 'workflow' - include content!
    const result = await pool.query(`
      SELECT
        p.id, p.title, p.content, p.category, p.slug,
        p.created_at, u.display_name as author
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      WHERE p.category IN ('prompt-template', 'workflow')
        AND p.published = true
      ORDER BY p.created_at DESC
    `);

    const uniquePosts = result.rows;

    // Parse each workflow and add metadata
    const workflows = uniquePosts
      .map(post => {
        const steps = parseWorkflow(post.content);
        const validation = validateWorkflow(steps);
        const metadata = extractWorkflowMetadata(post.content);

        return {
          id: post.id,
          title: post.title,
          slug: post.slug,
          description: metadata.description,
          category: post.category,
          stepCount: steps.length,
          steps: steps.map(s => ({ number: s.stepNumber, title: s.title })),
          valid: validation.valid,
          errors: validation.errors,
          createdAt: post.created_at,
          author: post.author
        };
      })
      // Only return valid workflows
      .filter(w => w.valid && w.stepCount > 0);

    return new Response(JSON.stringify({ workflows }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error listing workflows:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
