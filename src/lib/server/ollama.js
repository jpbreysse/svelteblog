/**
 * Ollama Service
 * Wrapper for calling local Mistral 7B via Ollama API
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = 'mistral-nemo';

/**
 * Generate a response from Mistral with JSON output
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Parsed JSON response
 */
export async function generateJSON(prompt, options = {}) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || DEFAULT_MODEL,
      prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: options.temperature ?? 0.1,
        num_predict: options.maxTokens ?? 500,
        ...options.modelOptions
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${error}`);
  }

  const result = await response.json();

  try {
    return JSON.parse(result.response);
  } catch (e) {
    console.error('Failed to parse Ollama JSON response:', result.response);
    throw new Error('Ollama returned invalid JSON');
  }
}

/**
 * Generate a text response from Mistral
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options
 * @returns {Promise<string>} Text response
 */
export async function generateText(prompt, options = {}) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || DEFAULT_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 500,
        ...options.modelOptions
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.response;
}

/**
 * Generate streaming text response from Ollama
 * @param {string} prompt - The prompt to send
 * @param {object} options - Options (temperature, maxTokens, etc.)
 * @returns {AsyncGenerator<string>} Yields text chunks
 */
export async function* generateStream(prompt, options = {}) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || DEFAULT_MODEL,
      prompt,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 1000,
        ...options.modelOptions
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${error}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    // Ollama sends newline-delimited JSON
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.response) {
          yield parsed.response;
        }
      } catch (e) {
        // Skip malformed lines
      }
    }
  }
}

/**
 * Check if Ollama is running and Mistral model is available
 * @returns {Promise<{available: boolean, models: string[]}>}
 */
export async function checkOllama() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) {
      return { available: false, models: [], error: 'Ollama not responding' };
    }

    const data = await response.json();
    const models = data.models?.map(m => m.name) || [];
    const hasMistral = models.some(m => m.includes('mistral'));

    return {
      available: true,
      hasMistral,
      models
    };
  } catch (error) {
    return {
      available: false,
      models: [],
      error: error.message
    };
  }
}
