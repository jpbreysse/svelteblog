-- Migration: Add 'link' category for external document references
-- This category is used for posts that reference external URLs (HTML, PDF, Word docs)

INSERT INTO categories (value, label, position)
VALUES ('link', 'External Link', 99)
ON CONFLICT (value) DO NOTHING;
