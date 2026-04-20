-- Migration: Add chunk review metadata columns
-- Stage 2: Chunk Review with Mistral 7B

-- Add review metadata columns to document_chunks
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS quality_score FLOAT;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS doc_type VARCHAR(50);  -- 'technicaldoc' or 'meetingsummary'
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS auto_tags TEXT[];
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS keywords TEXT[];
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS redundant_of INTEGER REFERENCES document_chunks(id);
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- Index for finding unreviewed chunks
CREATE INDEX IF NOT EXISTS idx_chunks_unreviewed
  ON document_chunks(id) WHERE reviewed_at IS NULL;

-- Index for finding low-quality chunks
CREATE INDEX IF NOT EXISTS idx_chunks_low_quality
  ON document_chunks(quality_score) WHERE quality_score < 0.5;

-- Index for document type filtering
CREATE INDEX IF NOT EXISTS idx_chunks_doc_type
  ON document_chunks(doc_type) WHERE doc_type IS NOT NULL;

-- Comments
COMMENT ON COLUMN document_chunks.quality_score IS 'Mistral-assigned quality score 0.0-1.0, <0.5 is low quality';
COMMENT ON COLUMN document_chunks.doc_type IS 'Document type: technicaldoc or meetingsummary';
COMMENT ON COLUMN document_chunks.auto_tags IS 'Mistral-extracted tags for the chunk';
COMMENT ON COLUMN document_chunks.summary IS 'One-line summary of the chunk';
COMMENT ON COLUMN document_chunks.keywords IS 'Extracted keywords for search';
COMMENT ON COLUMN document_chunks.redundant_of IS 'If this chunk is redundant, references the original chunk';
COMMENT ON COLUMN document_chunks.reviewed_at IS 'When Mistral reviewed this chunk';
