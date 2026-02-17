/**
 * Embedding Service
 * Generates vector embeddings using all-MiniLM-L6-v2 via Transformers.js
 *
 * Model: Xenova/all-MiniLM-L6-v2
 * Output: 384-dimensional normalized vectors
 * Max sequence length: 256 tokens
 */

let pipeline = null;
let embedder = null;
let isLoading = false;
let loadPromise = null;

/**
 * Initialize the embedding pipeline
 * Lazy loads the model on first use
 * @returns {Promise<Function>}
 */
async function getEmbedder() {
  // If already loaded, return it
  if (embedder) {
    return embedder;
  }

  // If currently loading, wait for it
  if (isLoading && loadPromise) {
    return loadPromise;
  }

  // Start loading
  isLoading = true;
  console.log('🔄 Loading embedding model (all-MiniLM-L6-v2)...');
  console.log('   This may take 10-30 seconds on first run as the model downloads (~90MB)');

  loadPromise = (async () => {
    try {
      // Dynamic import of transformers.js
      const transformers = await import('@xenova/transformers');
      pipeline = transformers.pipeline;

      // Load the feature extraction pipeline
      embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        // Use quantized model for faster inference
        quantized: true
      });

      console.log('✅ Embedding model loaded successfully');
      return embedder;
    } catch (error) {
      console.error('❌ Failed to load embedding model:', error);
      isLoading = false;
      loadPromise = null;
      throw error;
    }
  })();

  return loadPromise;
}

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} 384-dimensional vector
 */
export async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  const extractor = await getEmbedder();

  // Generate embedding with mean pooling and normalization
  const output = await extractor(text, {
    pooling: 'mean',
    normalize: true
  });

  // Convert to regular array
  return Array.from(output.data);
}

/**
 * Generate embeddings for multiple texts
 * @param {string[]} texts - Array of texts to embed
 * @param {object} options - Options
 * @param {function} options.onProgress - Progress callback (index, total)
 * @returns {Promise<number[][]>} Array of 384-dimensional vectors
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
 * Check if the embedding model is loaded
 * @returns {boolean}
 */
export function isModelLoaded() {
  return embedder !== null;
}

/**
 * Preload the embedding model
 * Call this during app startup to avoid delay on first use
 * @returns {Promise<void>}
 */
export async function preloadModel() {
  await getEmbedder();
}

/**
 * Get embedding dimension
 * @returns {number}
 */
export function getEmbeddingDimension() {
  return 384; // all-MiniLM-L6-v2 output dimension
}
