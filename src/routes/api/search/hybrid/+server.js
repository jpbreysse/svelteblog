/**
 * GET /api/search/hybrid
 * Hybrid search combining semantic similarity with keyword matching
 *
 * Query params:
 * - q: Search query (required)
 * - limit: Maximum results (default: 10, max: 50)
 * - keywordWeight: Weight for keyword matches (default: 0.3, range 0-1)
 */

import { json } from '@sveltejs/kit';
import { pool } from '$lib/db.js';
import { generateEmbedding } from '$lib/server/embeddings.js';

export async function GET({ url, locals }) {
  // Require authentication
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  const query = url.searchParams.get('q');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
  const keywordWeight = Math.min(Math.max(parseFloat(url.searchParams.get('keywordWeight') || '0.3'), 0), 1);

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
    console.log(`🔍 Hybrid search: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}" (user: ${locals.user.id})`);

    // Generate embedding for semantic search
    const queryEmbedding = await generateEmbedding(query);
    const embeddingStr = '[' + queryEmbedding.join(',') + ']';

    // Extract keywords for matching (remove common words)
    const stopWords = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'qui', 'que', 'quoi', 'the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'were', 'to', 'for', 'in', 'on', 'at', 'with']);
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    console.log(`   Keywords: ${keywords.join(', ')}`);

    // Build keyword matching SQL (case-insensitive)
    // Params: $1=embedding, $2=userId, $3=isAdmin, $4+=keywords
    const keywordConditions = keywords.map((_, i) => `LOWER(dc.chunk_text) LIKE $${i + 4}`);
    const keywordParams = keywords.map(k => `%${k}%`);

    const isAdmin = locals.user.role === 'admin';

    // Hybrid query: semantic similarity + keyword bonus + permission filtering
    const result = await pool.query(
      `WITH ranked_chunks AS (
        SELECT
          dc.id as chunk_id,
          dc.post_id,
          dc.chunk_index,
          dc.chunk_text,
          p.title,
          p.slug,
          p.category,
          p.source_url,
          p.source_type,
          1 - (dc.embedding <=> $1::vector) as semantic_similarity,
          CASE
            WHEN ${keywordConditions.length > 0 ? keywordConditions.join(' OR ') : 'FALSE'}
            THEN 1.0
            ELSE 0.0
          END as keyword_match,
          (
            ${keywords.map((_, i) => `CASE WHEN LOWER(dc.chunk_text) LIKE $${i + 4} THEN 1 ELSE 0 END`).join(' + ') || '0'}
          ) as keyword_count
        FROM document_chunks dc
        JOIN posts p ON dc.post_id = p.id
        LEFT JOIN post_read_groups prg ON p.id = prg.post_id
        LEFT JOIN user_groups ug ON prg.group_id = ug.group_id AND ug.user_id = $2
        WHERE p.published = true
          AND (
            -- Admins can see everything
            $3 = true
            -- Public posts
            OR p.visibility = 'public'
            -- User's own posts
            OR p.author_id = $2
            -- Group posts where user is a member
            OR (p.visibility = 'groups' AND ug.user_id IS NOT NULL)
          )
      )
      SELECT DISTINCT ON (chunk_id)
        *,
        (semantic_similarity * ${1 - keywordWeight}) + (keyword_match * ${keywordWeight}) + (keyword_count * 0.05) as hybrid_score
      FROM ranked_chunks
      ORDER BY chunk_id, hybrid_score DESC`,
      [embeddingStr, locals.user.id, isAdmin, ...keywordParams]
    );

    // Re-sort by hybrid score after DISTINCT ON
    const sortedRows = result.rows.sort((a, b) => b.hybrid_score - a.hybrid_score);

    console.log(`   Found ${sortedRows.length} chunks (filtered by permissions)`);

    // Group results by post and take the best match per post
    const postResults = new Map();

    for (const row of sortedRows) {
      const existing = postResults.get(row.post_id);

      if (!existing || row.hybrid_score > existing.hybridScore) {
        postResults.set(row.post_id, {
          postId: row.post_id,
          title: row.title,
          slug: row.slug,
          category: row.category,
          sourceUrl: row.source_url,
          sourceType: row.source_type,
          semanticSimilarity: row.semantic_similarity,
          keywordMatch: row.keyword_match > 0,
          keywordCount: row.keyword_count,
          hybridScore: row.hybrid_score,
          matchedChunk: row.chunk_text,
          chunkIndex: row.chunk_index
        });
      }
    }

    // Convert to array and sort by hybrid score
    const posts = Array.from(postResults.values())
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, limit);

    console.log(`   Returning ${posts.length} unique posts`);

    return json({
      success: true,
      query,
      keywords,
      keywordWeight,
      results: posts,
      totalChunks: sortedRows.length,
      uniquePosts: posts.length
    });

  } catch (error) {
    console.error('❌ Hybrid search error:', error);

    return json({
      success: false,
      error: error.message || 'Search failed'
    }, { status: 500 });
  }
}
