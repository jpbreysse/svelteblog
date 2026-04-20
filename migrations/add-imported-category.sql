-- Migration: Add 'imported' category for documents imported from URL
-- This category is used for posts where content was fetched from external URL (PDF, Word, etc.)
-- Unlike 'link', vectorization uses the post content (not re-fetching the URL)

INSERT INTO categories (value, label, position)
VALUES ('imported', 'Imported Document', 98)
ON CONFLICT (value) DO NOTHING;
