-- Migration: Add Categories Table
-- Allows managing blog categories from the admin UI instead of environment variables

-- ============================================
-- STEP 1: Create categories table
-- ============================================

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  value VARCHAR(100) NOT NULL UNIQUE,
  label VARCHAR(200) NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_value ON categories(value);
CREATE INDEX IF NOT EXISTS idx_categories_position ON categories(position);

COMMENT ON TABLE categories IS
  'Blog post categories managed from admin UI';

-- ============================================
-- STEP 2: Insert default categories
-- ============================================

INSERT INTO categories (value, label, position) VALUES
  ('thoughts', 'Thoughts', 1),
  ('reflections', 'Reflections', 2),
  ('lifestyle', 'Lifestyle', 3),
  ('creative', 'Creative', 4),
  ('personal', 'Personal', 5),
  ('tech', 'Technology', 6),
  ('tutorial', 'Tutorial', 7),
  ('politics', 'Politics', 8)
ON CONFLICT (value) DO NOTHING;

-- ============================================
-- STEP 3: Verification
-- ============================================

SELECT * FROM categories ORDER BY position;
