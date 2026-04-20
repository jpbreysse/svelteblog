/**
 * Workflow Parser
 * Parse markdown workflow definitions into structured steps
 */

/**
 * Parse workflow markdown into steps
 * @param {string} markdown - Workflow definition with ## Step N: Title markers
 * @returns {Array<{stepNumber: number, title: string, content: string}>}
 */
export function parseWorkflow(markdown) {
  const steps = [];

  // Handle null/undefined content
  if (!markdown) {
    return steps;
  }

  // Split by step markers
  const stepPattern = /^##\s+Step\s+(\d+):\s*(.+)$/gm;
  const matches = [...markdown.matchAll(stepPattern)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const stepNumber = parseInt(match[1], 10);
    const title = match[2].trim();

    // Get content between this step and the next (or end)
    const startIndex = match.index + match[0].length;
    const endIndex = matches[i + 1] ? matches[i + 1].index : markdown.length;
    const content = markdown.substring(startIndex, endIndex).trim();

    steps.push({ stepNumber, title, content });
  }

  // Sort by step number
  return steps.sort((a, b) => a.stepNumber - b.stepNumber);
}

/**
 * Replace variables in step content
 * @param {string} content - Step content with {{variable}} placeholders
 * @param {Object} variables - Variable values { input, step1, step2, context, all }
 * @returns {string} - Content with variables replaced
 *
 * Variables:
 * - {{input}} - Original input document
 * - {{step1}}, {{step2}}, etc. - Previous step outputs
 * - {{context}} - RAG context from knowledge base
 * - {{all}} - All previous step outputs combined
 */
export function interpolateVariables(content, variables) {
  return content.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    if (name === 'all') {
      // Combine all step outputs
      const stepOutputs = Object.entries(variables)
        .filter(([key]) => key.match(/^step\d+$/))
        .sort(([a], [b]) => {
          const numA = parseInt(a.replace('step', ''), 10);
          const numB = parseInt(b.replace('step', ''), 10);
          return numA - numB;
        })
        .map(([key, value]) => {
          const stepNum = key.replace('step', '');
          return `**Step ${stepNum} Output:**\n${value}`;
        })
        .join('\n\n');
      return stepOutputs || match;
    }
    return variables[name] !== undefined ? variables[name] : match;
  });
}

/**
 * Validate workflow structure
 * @param {Array} steps - Parsed steps
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateWorkflow(steps) {
  const errors = [];

  if (steps.length === 0) {
    errors.push('No steps found. Use "## Step N: Title" format.');
    return { valid: false, errors };
  }

  // Check for sequential numbering
  const stepNumbers = steps.map(s => s.stepNumber);
  for (let i = 0; i < stepNumbers.length; i++) {
    if (stepNumbers[i] !== i + 1) {
      errors.push(`Step numbering should be sequential. Found step ${stepNumbers[i]} but expected ${i + 1}.`);
    }
  }

  // Check for empty content
  for (const step of steps) {
    if (!step.content || step.content.length < 10) {
      errors.push(`Step ${step.stepNumber} has insufficient content.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Extract metadata from workflow markdown (title, description)
 * @param {string} markdown - Full workflow markdown
 * @returns {{title: string, description: string}}
 */
export function extractWorkflowMetadata(markdown) {
  // Handle null/undefined content
  if (!markdown) {
    return { title: 'Untitled Workflow', description: '' };
  }

  // Extract title from first H1
  const titleMatch = markdown.match(/^#\s+(.+?)[\r\n]/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled Workflow';

  // Extract description (text between title and first step)
  const descMatch = markdown.match(/^#\s+.+?[\r\n]+([\s\S]*?)(?=^##\s+Step\s+\d+:)/m);
  const description = descMatch ? descMatch[1].trim() : '';

  return { title, description };
}
