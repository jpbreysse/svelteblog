/**
 * Fix Missing Embeddings
 * Generates embeddings for chunks that don't have them
 */

import pg from 'pg';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = 'nomic-embed-text-v2-moe';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vectordb'
});

async function generateEmbedding(text) {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding;
}

async function main() {
  console.log('🔍 Finding chunks without embeddings...');

  // Get chunks without embeddings
  const result = await pool.query(`
    SELECT id, post_id, chunk_text
    FROM document_chunks
    WHERE embedding IS NULL
    ORDER BY post_id, chunk_index
  `);

  console.log(`📊 Found ${result.rows.length} chunks without embeddings`);

  if (result.rows.length === 0) {
    console.log('✅ All chunks have embeddings!');
    await pool.end();
    return;
  }

  // Group by post for progress tracking
  const postIds = [...new Set(result.rows.map(r => r.post_id))];
  console.log(`📝 Across ${postIds.length} posts: ${postIds.join(', ')}`);

  let processed = 0;
  let failed = 0;

  for (const chunk of result.rows) {
    try {
      const embedding = await generateEmbedding(chunk.chunk_text);

      await pool.query(
        'UPDATE document_chunks SET embedding = $1 WHERE id = $2',
        [`[${embedding.join(',')}]`, chunk.id]
      );

      processed++;

      if (processed % 10 === 0 || processed === result.rows.length) {
        console.log(`   Progress: ${processed}/${result.rows.length} chunks`);
      }
    } catch (error) {
      console.error(`❌ Failed chunk ${chunk.id}: ${error.message}`);
      failed++;
    }
  }

  // Update post chunk counts
  console.log('📊 Updating post chunk counts...');
  await pool.query(`
    UPDATE posts p SET
      chunk_count = (SELECT COUNT(*) FROM document_chunks dc WHERE dc.post_id = p.id AND dc.embedding IS NOT NULL),
      vectorized_at = NOW()
    WHERE id IN (SELECT DISTINCT post_id FROM document_chunks WHERE embedding IS NOT NULL)
  `);

  console.log(`\n✅ Done! Processed: ${processed}, Failed: ${failed}`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
