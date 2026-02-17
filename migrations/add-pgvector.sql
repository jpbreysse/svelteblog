-- Migration: Add pgvector support for document vectorization
-- Run this migration to enable semantic search capabilities

-- Enable pgvector extension (requires PostgreSQL with pgvector installed)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add columns to posts table for link posts and vectorization tracking
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_type VARCHAR(20);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS vectorized_at TIMESTAMP;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN posts.source_url IS 'External URL for link category posts';
COMMENT ON COLUMN posts.source_type IS 'Content type: html, pdf, docx, or post (for regular posts)';
COMMENT ON COLUMN posts.vectorized_at IS 'Timestamp when content was last vectorized';
COMMENT ON COLUMN posts.chunk_count IS 'Number of text chunks created during vectorization';

-- Document chunks table for storing vectorized content
CREATE TABLE IF NOT EXISTS document_chunks (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(384), -- all-MiniLM-L6-v2 produces 384-dimensional vectors
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, chunk_index)
);

-- Index for fast vector similarity search using IVFFlat
-- lists=100 is good for up to ~100k vectors, adjust as collection grows
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index for looking up chunks by post
CREATE INDEX IF NOT EXISTS idx_chunks_post_id ON document_chunks(post_id);

-- Index for finding vectorized posts
CREATE INDEX IF NOT EXISTS idx_posts_vectorized ON posts(vectorized_at) WHERE vectorized_at IS NOT NULL;

-- Add comment for the chunks table
COMMENT ON TABLE document_chunks IS 'Stores text chunks with vector embeddings for semantic search';
COMMENT ON COLUMN document_chunks.embedding IS '384-dimensional vector from all-MiniLM-L6-v2 model';
