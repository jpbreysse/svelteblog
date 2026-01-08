# Vector/Semantic Search Implementation

## What is Vector Search?

Vector search uses AI embeddings to understand the **meaning** of text, not just keywords.

### Example Differences

**Query:** "How to secure my app?"

**Full-Text Search finds:**
- Posts containing words: "secure", "app", "application", "security"

**Vector Search finds:**
- Authentication tutorials
- OAuth implementation guides
- Password hashing best practices
- JWT token management
- HTTPS configuration
- **Even if they don't contain the word "secure"!**

## Architecture

```
User Query: "database performance"
       ↓
Generate Embedding (OpenAI API)
       ↓
[0.123, -0.456, 0.789, ...] (1536 numbers)
       ↓
Find Similar Vectors in Database
       ↓
Results ranked by similarity
```

## Implementation Steps

### Step 1: Install pgvector Extension

```sql
-- Enable pgvector extension in PostgreSQL
CREATE EXTENSION IF NOT EXISTS vector;
```

**Note:** Requires PostgreSQL 11+ and pgvector installed on your server.

### Step 2: Add Embedding Column

```sql
-- Migration: add_vector_search.sql

-- Add vector column (OpenAI embeddings are 1536 dimensions)
ALTER TABLE posts
ADD COLUMN embedding vector(1536);

-- Create index for similarity search
CREATE INDEX ON posts USING ivfflat (embedding vector_cosine_ops);

-- Optional: Add metadata for tracking
ALTER TABLE posts
ADD COLUMN embedding_model varchar(50) DEFAULT 'text-embedding-3-small',
ADD COLUMN embedding_generated_at timestamp;
```

### Step 3: Generate Embeddings API

```javascript
// src/routes/api/embeddings/generate/+server.js
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST({ request, locals }) {
  // Only admins can generate embeddings
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ success: false, error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { postId } = await request.json();

    // Get post content
    const postResult = await db.query(
      'SELECT id, title, content, category FROM posts WHERE id = $1',
      [postId]
    );

    if (postResult.rows.length === 0) {
      return json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    const post = postResult.rows[0];

    // Combine title and content for embedding
    // Strip HTML tags from content
    const plainContent = post.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const textToEmbed = `${post.title}\n\n${post.category}\n\n${plainContent}`;

    // Generate embedding using OpenAI
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: textToEmbed.substring(0, 8000) // Limit to 8000 chars
    });

    const embedding = response.data[0].embedding;

    // Store embedding in database
    await db.query(
      `UPDATE posts
       SET embedding = $1,
           embedding_model = 'text-embedding-3-small',
           embedding_generated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(embedding), postId]
    );

    return json({ success: true, postId });

  } catch (error) {
    console.error('Error generating embedding:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}
```

### Step 4: Batch Generate All Embeddings

```javascript
// src/routes/api/embeddings/generate-all/+server.js
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST({ locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ success: false, error: 'Unauthorized' }, { status: 403 });
  }

  try {
    // Get all posts without embeddings
    const posts = await db.query(`
      SELECT id, title, content, category
      FROM posts
      WHERE embedding IS NULL
      ORDER BY created_at DESC
    `);

    let processed = 0;
    let errors = 0;

    for (const post of posts.rows) {
      try {
        // Strip HTML and combine text
        const plainContent = post.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
        const textToEmbed = `${post.title}\n\n${post.category}\n\n${plainContent}`;

        // Generate embedding
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: textToEmbed.substring(0, 8000)
        });

        const embedding = response.data[0].embedding;

        // Store in database
        await db.query(
          `UPDATE posts
           SET embedding = $1,
               embedding_model = 'text-embedding-3-small',
               embedding_generated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(embedding), post.id]
        );

        processed++;

        // Rate limiting: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing post ${post.id}:`, error);
        errors++;
      }
    }

    return json({
      success: true,
      processed,
      errors,
      total: posts.rows.length
    });

  } catch (error) {
    console.error('Error in batch generation:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}
```

### Step 5: Vector Search API

```javascript
// src/routes/api/search/vector/+server.js
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function GET({ url }) {
  const query = url.searchParams.get('q');

  if (!query || query.trim() === '') {
    return json({ success: true, results: [] });
  }

  try {
    // Generate embedding for search query
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });

    const queryEmbedding = response.data[0].embedding;

    // Search using cosine similarity
    const results = await db.query(`
      SELECT
        p.id,
        p.title,
        p.category,
        p.path_id,
        p.author_id,
        p.created_at,
        u.username as author,
        -- Calculate similarity score (1 = identical, 0 = opposite)
        1 - (p.embedding <=> $1::vector) as similarity,
        -- Extract snippet
        SUBSTRING(
          REGEXP_REPLACE(p.content, '<[^>]*>', '', 'g'),
          1,
          200
        ) as snippet
      FROM posts p
      LEFT JOIN users u ON p.author_id = u.id
      WHERE p.published = true
        AND p.embedding IS NOT NULL
        AND 1 - (p.embedding <=> $1::vector) > 0.7  -- Similarity threshold
      ORDER BY similarity DESC
      LIMIT 20
    `, [JSON.stringify(queryEmbedding)]);

    return json({
      success: true,
      results: results.rows
    });

  } catch (error) {
    console.error('Vector search error:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}
```

### Step 6: Hybrid Search (Best of Both Worlds)

Combine full-text search and vector search:

```javascript
// src/routes/api/search/hybrid/+server.js
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function GET({ url }) {
  const query = url.searchParams.get('q');

  if (!query || query.trim() === '') {
    return json({ success: true, results: [] });
  }

  try {
    // Run both searches in parallel
    const [vectorResults, fulltextResults] = await Promise.all([
      searchVector(query),
      searchFulltext(query)
    ]);

    // Merge and deduplicate results
    const resultsMap = new Map();

    // Add vector search results (weight: 0.6)
    vectorResults.forEach(result => {
      resultsMap.set(result.id, {
        ...result,
        score: result.similarity * 0.6,
        match_type: 'semantic'
      });
    });

    // Add fulltext results (weight: 0.4)
    fulltextResults.forEach(result => {
      if (resultsMap.has(result.id)) {
        // Boost score if found in both
        const existing = resultsMap.get(result.id);
        existing.score += result.rank * 0.4;
        existing.match_type = 'both';
      } else {
        resultsMap.set(result.id, {
          ...result,
          score: result.rank * 0.4,
          match_type: 'keyword'
        });
      }
    });

    // Sort by combined score
    const mergedResults = Array.from(resultsMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    return json({
      success: true,
      results: mergedResults
    });

  } catch (error) {
    console.error('Hybrid search error:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

async function searchVector(query) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query
  });

  const queryEmbedding = response.data[0].embedding;

  const results = await db.query(`
    SELECT
      p.id,
      p.title,
      p.category,
      p.path_id,
      1 - (p.embedding <=> $1::vector) as similarity
    FROM posts p
    WHERE p.published = true
      AND p.embedding IS NOT NULL
      AND 1 - (p.embedding <=> $1::vector) > 0.6
    ORDER BY similarity DESC
    LIMIT 20
  `, [JSON.stringify(queryEmbedding)]);

  return results.rows;
}

async function searchFulltext(query) {
  const searchTerms = query.trim().split(/\s+/).join(' & ');

  const results = await db.query(`
    SELECT
      p.id,
      p.title,
      p.category,
      p.path_id,
      ts_rank(p.search_vector, to_tsquery('english', $1)) as rank
    FROM posts p
    WHERE p.published = true
      AND p.search_vector @@ to_tsquery('english', $1)
    ORDER BY rank DESC
    LIMIT 20
  `, [searchTerms]);

  return results.rows;
}
```

### Step 7: Auto-Generate Embeddings on Post Save

```javascript
// In your post save/update logic
async function savePost(postData) {
  // Save post to database
  const result = await db.query(
    `INSERT INTO posts (title, content, category, author_id, published)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [postData.title, postData.content, postData.category, postData.authorId, postData.published]
  );

  const postId = result.rows[0].id;

  // Generate embedding asynchronously (don't wait)
  generateEmbeddingAsync(postId).catch(err => {
    console.error('Failed to generate embedding:', err);
  });

  return postId;
}

async function generateEmbeddingAsync(postId) {
  // Call the embedding generation endpoint
  await fetch('/api/embeddings/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId })
  });
}
```

## Cost Considerations

### OpenAI Pricing (as of 2024)

**text-embedding-3-small:**
- $0.02 per 1M tokens
- Average post: ~500 tokens
- Cost per post: ~$0.00001 (0.001 cents)
- 1000 posts: ~$0.01 (1 cent)

**Example monthly costs:**
- 100 new posts/month: $0.001
- 1000 searches/month: $0.001
- **Total: ~$0.002/month**

Very affordable!

## UI Updates

Update the search box to use vector search:

```javascript
// src/lib/components/ConfluenceExplorer.svelte

let searchMode = 'hybrid'; // 'fulltext', 'vector', or 'hybrid'

async function performSearch(query) {
  searching = true;
  try {
    const endpoint = searchMode === 'fulltext'
      ? '/api/search'
      : searchMode === 'vector'
      ? '/api/search/vector'
      : '/api/search/hybrid';

    const response = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (data.success) {
      searchResults = data.results;
    }
  } catch (error) {
    console.error('Search error:', error);
  } finally {
    searching = false;
  }
}
```

Add search mode toggle:

```svelte
<div class="search-mode-toggle">
  <button
    class:active={searchMode === 'hybrid'}
    on:click={() => searchMode = 'hybrid'}
  >
    🎯 Smart
  </button>
  <button
    class:active={searchMode === 'vector'}
    on:click={() => searchMode = 'vector'}
  >
    🧠 Semantic
  </button>
  <button
    class:active={searchMode === 'fulltext'}
    on:click={() => searchMode = 'fulltext'}
  >
    📝 Keywords
  </button>
</div>
```

## Performance Optimization

### 1. Cache Query Embeddings

```javascript
// Simple in-memory cache
const embeddingCache = new Map();

async function getQueryEmbedding(query) {
  if (embeddingCache.has(query)) {
    return embeddingCache.get(query);
  }

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query
  });

  const embedding = response.data[0].embedding;
  embeddingCache.set(query, embedding);

  // Limit cache size
  if (embeddingCache.size > 1000) {
    const firstKey = embeddingCache.keys().next().value;
    embeddingCache.delete(firstKey);
  }

  return embedding;
}
```

### 2. Use Smaller Embeddings

```javascript
// text-embedding-3-small supports dimension reduction
const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: query,
  dimensions: 512  // Reduce from 1536 to 512 (faster, less storage)
});
```

Update table:
```sql
ALTER TABLE posts ALTER COLUMN embedding TYPE vector(512);
```

## Comparison Table

| Feature | Full-Text | Vector | Hybrid |
|---------|-----------|--------|--------|
| Query: "authentication" | Finds "authentication", "authenticate" | Finds "login", "OAuth", "security" | Both |
| Speed | 5ms | 50ms | 60ms |
| Accuracy (exact terms) | ★★★★★ | ★★★☆☆ | ★★★★★ |
| Accuracy (concepts) | ★★☆☆☆ | ★★★★★ | ★★★★★ |
| Cost | Free | $0.001/search | $0.001/search |
| Setup complexity | Medium | High | High |

## Recommendation

**For most knowledge bases:**
- Start with **Full-Text Search** (simple, free, fast)
- Add **Vector Search** if you need semantic understanding
- Use **Hybrid** for best results (combines both)

**When to use Vector Search:**
- Support/help desk (similar questions)
- Research knowledge base (conceptual search)
- Multi-language content (embeddings work across languages)
- When users don't know exact keywords

**When to skip Vector Search:**
- Small dataset (<100 posts)
- Technical documentation (exact terms matter)
- Limited budget
- Need instant results (<10ms)

## Next Steps

To implement vector search:

1. Install pgvector on your PostgreSQL server
2. Run the migration to add embedding columns
3. Set up OpenAI API key in environment variables
4. Generate embeddings for existing posts
5. Update search API to use vector search
6. Add search mode toggle in UI

Let me know if you'd like help implementing this!
