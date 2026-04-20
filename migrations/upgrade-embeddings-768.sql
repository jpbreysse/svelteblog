-- Migration: Upgrade embedding dimension from 384 to 768
-- Model: nomic-embed-text-v2-moe (multilingual, 8192 token context)
--
-- WARNING: This migration will DELETE all existing embeddings!
-- You must re-vectorize all posts after running this migration.
--
-- Run with: psql -d your_database -f migrations/upgrade-embeddings-768.sql

-- Step 1: Drop the existing index (required before altering column)
DROP INDEX IF EXISTS idx_document_chunks_embedding;

-- Step 2: Drop the old embedding column
ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;

-- Step 3: Add new embedding column with 768 dimensions
ALTER TABLE document_chunks ADD COLUMN embedding vector(768);

-- Step 4: Recreate the HNSW index for similarity search
-- Using cosine distance (<=>), optimized for retrieval
CREATE INDEX idx_document_chunks_embedding ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Step 5: Update column comment
COMMENT ON COLUMN document_chunks.embedding IS '768-dimensional vector from nomic-embed-text-v2-moe model';

-- Step 6: Reset vectorization status on all posts (they need re-vectorization)
UPDATE posts SET vectorized_at = NULL, chunk_count = 0 WHERE vectorized_at IS NOT NULL;

-- Step 7: Clear chunk review status (old reviews are invalid with new embeddings)
UPDATE document_chunks SET reviewed_at = NULL, quality_score = NULL, summary = NULL, doc_type = NULL, topics = NULL;

-- Output status
DO $$
DECLARE
  chunk_count INTEGER;
  post_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO chunk_count FROM document_chunks;
  SELECT COUNT(*) INTO post_count FROM posts WHERE vectorized_at IS NULL;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Migration complete!';
  RAISE NOTICE '   - Embedding dimension upgraded to 768';
  RAISE NOTICE '   - % chunks need new embeddings', chunk_count;
  RAISE NOTICE '   - % posts need re-vectorization', post_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '   1. Pull the embedding model: ollama pull nomic-embed-text-v2-moe';
  RAISE NOTICE '   2. Re-vectorize posts from Admin > Vectorization';
END $$;
