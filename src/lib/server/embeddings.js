/**
 * Embedding Service
 * Generates vector embeddings using nomic-embed-text-v2-moe via Ollama
 *
 * Model: nomic-embed-text-v2-moe
 * Output: 768-dimensional normalized vectors
 * Max sequence length: 8192 tokens
 * Languages: ~100 (multilingual)
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text-v2-moe';

let modelVerified = false;

/**
 * Verify the embedding model is available in Ollama
 * @returns {Promise<boolean>}
 */
async function verifyModel() {
  if (modelVerified) return true;

  try {
    console.log(`🔄 Checking embedding model (${EMBEDDING_MODEL})...`);

    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama not responding: ${response.status}`);
    }

    const data = await response.json();
    const models = data.models || [];
    const hasModel = models.some(m => m.name.startsWith(EMBEDDING_MODEL));

    if (!hasModel) {
      console.warn(`⚠️ Model ${EMBEDDING_MODEL} not found. Available models:`, models.map(m => m.name));
      console.log(`   Run: ollama pull ${EMBEDDING_MODEL}`);
      return false;
    }

    console.log(`✅ Embedding model ${EMBEDDING_MODEL} is available`);
    modelVerified = true;
    return true;
  } catch (error) {
    console.error('❌ Failed to verify embedding model:', error.message);
    return false;
  }
}

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} 768-dimensional vector
 */
export async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  // Verify model on first call
  if (!modelVerified) {
    const available = await verifyModel();
    if (!available) {
      throw new Error(`Embedding model ${EMBEDDING_MODEL} not available. Run: ollama pull ${EMBEDDING_MODEL}`);
    }
  }

  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: text
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama embedding failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding response from Ollama');
    }

    return data.embedding;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Ollama is not running. Start it with: ollama serve');
    }
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts
 * @param {string[]} texts - Array of texts to embed
 * @param {object} options - Options
 * @param {function} options.onProgress - Progress callback (index, total)
 * @returns {Promise<number[][]>} Array of 768-dimensional vectors
 */
export async function generateEmbeddings(texts, options = {}) {
  if (!texts || texts.length === 0) {
    return [];
  }

  const { onProgress } = options;
  const embeddings = [];

  console.log(`🔢 Generating embeddings for ${texts.length} chunks...`);

  for (let i = 0; i < texts.length; i++) {
    const embedding = await generateEmbedding(texts[i]);
    embeddings.push(embedding);

    if (onProgress) {
      onProgress(i + 1, texts.length);
    }

    // Log progress every 10 chunks
    if ((i + 1) % 10 === 0 || i === texts.length - 1) {
      console.log(`   Progress: ${i + 1}/${texts.length} chunks`);
    }
  }

  console.log(`✅ Generated ${embeddings.length} embeddings`);

  return embeddings;
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Cosine similarity (0-1, higher is more similar)
 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Find most similar texts from a list
 * @param {number[]} queryEmbedding - Query vector
 * @param {Array<{embedding: number[], text: string, id: any}>} candidates - Candidate items
 * @param {number} topK - Number of results to return
 * @returns {Array<{text: string, id: any, similarity: number}>}
 */
export function findMostSimilar(queryEmbedding, candidates, topK = 5) {
  const results = candidates.map(candidate => ({
    ...candidate,
    similarity: cosineSimilarity(queryEmbedding, candidate.embedding)
  }));

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  // Return top K
  return results.slice(0, topK);
}

/**
 * Check if the embedding model is available
 * @returns {Promise<boolean>}
 */
export async function isModelLoaded() {
  return verifyModel();
}

/**
 * Preload/verify the embedding model
 * Call this during app startup to check availability
 * @returns {Promise<void>}
 */
export async function preloadModel() {
  const available = await verifyModel();
  if (!available) {
    console.warn('⚠️ Embedding model not available - vectorization will fail');
  }
}

/**
 * Get embedding dimension
 * @returns {number}
 */
export function getEmbeddingDimension() {
  return 768; // nomic-embed-text-v2-moe output dimension
}

/**
 * Get current embedding model name
 * @returns {string}
 */
export function getEmbeddingModel() {
  return EMBEDDING_MODEL;
}
