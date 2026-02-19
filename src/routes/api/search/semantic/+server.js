/**
 * GET /api/search/semantic
 * Semantic search across vectorized posts
 *
 * Query params:
 * - q: Search query (required)
 * - limit: Maximum results (default: 10, max: 50)
 */

import { json } from '@sveltejs/kit';
import { chunksDB } from '$lib/db.js';
import { generateEmbedding } from '$lib/server/embeddings.js';

export async function GET({ url }) {
  const query = url.searchParams.get('q');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);

  if (!query || query.trim().length === 0) {
    return json({
      success: false,
      error: 'Search query is required'
    }, { status: 400 });
  }

  if (query.length > 500) {
    return json({
      success: false,
      error: 'Search query too long (max 500 characters)'
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Semantic search: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    console.log(`   Embedding generated, length: ${queryEmbedding.length}, first 3: ${queryEmbedding.slice(0,3).join(', ')}`);

    // Search for similar chunks
    const results = await chunksDB.searchSimilar(queryEmbedding, limit);

    console.log(`   Found ${results.length} results`);

    // Group results by post and take the best match per post
    const postResults = new Map();

    for (const result of results) {
      const existing = postResults.get(result.post_id);

      if (!existing || result.similarity > existing.similarity) {
        postResults.set(result.post_id, {
          postId: result.post_id,
          title: result.title,
          slug: result.slug,
          category: result.category,
          sourceUrl: result.source_url,
          sourceType: result.source_type,
          similarity: result.similarity,
          matchedChunk: result.chunk_text,
          chunkIndex: result.chunk_index
        });
      }
    }

    // Convert to array and sort by similarity
    const posts = Array.from(postResults.values())
      .sort((a, b) => b.similarity - a.similarity);

    return json({
      success: true,
      query,
      results: posts,
      totalMatches: results.length,
      uniquePosts: posts.length
    });

  } catch (error) {
    console.error('❌ Semantic search error:', error);

    return json({
      success: false,
      error: error.message || 'Search failed'
    }, { status: 500 });
  }
}

/**
 * POST /api/search/semantic
 * Alternative endpoint for longer queries (body instead of query param)
 *
 * Body:
 * - query: Search query (required)
 * - limit: Maximum results (default: 10, max: 50)
 */
export async function POST({ request }) {
  try {
    const body = await request.json();
    const query = body.query;
    const limit = Math.min(parseInt(body.limit || '10'), 50);

    if (!query || query.trim().length === 0) {
      return json({
        success: false,
        error: 'Search query is required'
      }, { status: 400 });
    }

    if (query.length > 2000) {
      return json({
        success: false,
        error: 'Search query too long (max 2000 characters)'
      }, { status: 400 });
    }

    console.log(`🔍 Semantic search (POST): "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Search for similar chunks
    const results = await chunksDB.searchSimilar(queryEmbedding, limit);

    console.log(`   Found ${results.length} results`);

    // Group results by post and take the best match per post
    const postResults = new Map();

    for (const result of results) {
      const existing = postResults.get(result.post_id);

      if (!existing || result.similarity > existing.similarity) {
        postResults.set(result.post_id, {
          postId: result.post_id,
          title: result.title,
          slug: result.slug,
          category: result.category,
          sourceUrl: result.source_url,
          sourceType: result.source_type,
          similarity: result.similarity,
          matchedChunk: result.chunk_text,
          chunkIndex: result.chunk_index
        });
      }
    }

    // Convert to array and sort by similarity
    const posts = Array.from(postResults.values())
      .sort((a, b) => b.similarity - a.similarity);

    return json({
      success: true,
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      results: posts,
      totalMatches: results.length,
      uniquePosts: posts.length
    });

  } catch (error) {
    console.error('❌ Semantic search error:', error);

    return json({
      success: false,
      error: error.message || 'Search failed'
    }, { status: 500 });
  }
}
