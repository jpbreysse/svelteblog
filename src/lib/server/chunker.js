/**
 * Text Chunking Service
 * Splits text into overlapping chunks suitable for embedding
 *
 * nomic-embed-text-v2-moe has a max sequence length of 8192 tokens
 * We target ~500 characters per chunk (roughly 100-125 tokens)
 * with 50 character overlap for context continuity
 *
 * Note: Chunk size can be increased for better context, but smaller
 * chunks provide more precise retrieval for RAG applications.
 */

// Configuration
const DEFAULT_CHUNK_SIZE = 500;      // Target characters per chunk
const DEFAULT_OVERLAP = 50;          // Overlap characters between chunks
const MIN_CHUNK_SIZE = 100;          // Minimum chunk size to keep

/**
 * Split text into overlapping chunks
 * @param {string} text - The text to chunk
 * @param {object} options - Chunking options
 * @param {number} options.chunkSize - Target chunk size in characters
 * @param {number} options.overlap - Overlap between chunks in characters
 * @returns {string[]} Array of text chunks
 */
export function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap || DEFAULT_OVERLAP;

  if (!text || text.length === 0) {
    return [];
  }

  // If text is shorter than chunk size, return as single chunk
  if (text.length <= chunkSize) {
    return [text.trim()].filter(chunk => chunk.length >= MIN_CHUNK_SIZE);
  }

  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;

    // If we're not at the end, try to break at a sentence boundary
    if (endIndex < text.length) {
      endIndex = findBreakPoint(text, startIndex, endIndex);
    } else {
      endIndex = text.length;
    }

    // Extract chunk
    const chunk = text.slice(startIndex, endIndex).trim();

    // Only add non-empty chunks that meet minimum size
    if (chunk.length >= MIN_CHUNK_SIZE) {
      chunks.push(chunk);
    }

    // Move start index, accounting for overlap
    startIndex = endIndex - overlap;

    // Prevent infinite loop
    if (startIndex >= text.length - MIN_CHUNK_SIZE) {
      break;
    }
  }

  return chunks;
}

/**
 * Find a good break point near the target end index
 * Prefers sentence boundaries, then paragraph boundaries, then word boundaries
 * @param {string} text - The full text
 * @param {number} startIndex - Start of the current chunk
 * @param {number} targetEnd - Target end index
 * @returns {number} Adjusted end index
 */
function findBreakPoint(text, startIndex, targetEnd) {
  // Look backwards from target end to find a good break point
  const searchStart = Math.max(startIndex + MIN_CHUNK_SIZE, targetEnd - 100);
  const searchText = text.slice(searchStart, targetEnd + 50);

  // Try to find sentence boundary (. ! ?)
  const sentenceMatch = searchText.match(/[.!?]\s+/g);
  if (sentenceMatch) {
    // Find the last sentence boundary in the search range
    let lastSentenceEnd = -1;
    let currentPos = 0;
    for (const match of searchText.matchAll(/[.!?]\s+/g)) {
      if (match.index !== undefined) {
        lastSentenceEnd = match.index + match[0].length;
      }
    }
    if (lastSentenceEnd > 0) {
      return searchStart + lastSentenceEnd;
    }
  }

  // Try to find paragraph boundary
  const paragraphMatch = searchText.lastIndexOf('\n\n');
  if (paragraphMatch > 0) {
    return searchStart + paragraphMatch + 2;
  }

  // Try to find newline
  const newlineMatch = searchText.lastIndexOf('\n');
  if (newlineMatch > 0) {
    return searchStart + newlineMatch + 1;
  }

  // Fall back to word boundary
  const spaceMatch = searchText.lastIndexOf(' ');
  if (spaceMatch > 0) {
    return searchStart + spaceMatch + 1;
  }

  // No good break point found, use target end
  return targetEnd;
}

/**
 * Chunk text by sentences
 * @param {string} text - The text to chunk
 * @param {number} maxChunkSize - Maximum characters per chunk
 * @returns {string[]} Array of text chunks
 */
export function chunkBySentences(text, maxChunkSize = DEFAULT_CHUNK_SIZE) {
  if (!text || text.length === 0) {
    return [];
  }

  // Split by sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];

  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    // If adding this sentence exceeds max size, start a new chunk
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }

    currentChunk += sentence;
  }

  // Add the last chunk
  if (currentChunk.trim().length >= MIN_CHUNK_SIZE) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Chunk text by paragraphs
 * @param {string} text - The text to chunk
 * @param {number} maxChunkSize - Maximum characters per chunk
 * @returns {string[]} Array of text chunks
 */
export function chunkByParagraphs(text, maxChunkSize = DEFAULT_CHUNK_SIZE) {
  if (!text || text.length === 0) {
    return [];
  }

  // Split by paragraph boundaries
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());

  const chunks = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // If adding this paragraph exceeds max size
    if (currentChunk.length + paragraph.length + 2 > maxChunkSize) {
      // If current chunk is not empty, save it
      if (currentChunk.length >= MIN_CHUNK_SIZE) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // If paragraph itself is too long, chunk it
      if (paragraph.length > maxChunkSize) {
        const subChunks = chunkText(paragraph, { chunkSize: maxChunkSize, overlap: DEFAULT_OVERLAP });
        chunks.push(...subChunks);
      } else {
        currentChunk = paragraph;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  // Add the last chunk
  if (currentChunk.trim().length >= MIN_CHUNK_SIZE) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Get statistics about chunks
 * @param {string[]} chunks - Array of chunks
 * @returns {{count: number, avgLength: number, minLength: number, maxLength: number}}
 */
export function getChunkStats(chunks) {
  if (chunks.length === 0) {
    return { count: 0, avgLength: 0, minLength: 0, maxLength: 0 };
  }

  const lengths = chunks.map(c => c.length);
  return {
    count: chunks.length,
    avgLength: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths)
  };
}
