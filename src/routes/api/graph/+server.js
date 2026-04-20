/**
 * GET /api/graph
 * Returns nodes (posts) and edges (connections) for knowledge graph visualization
 *
 * Query params:
 * - limit: Max number of posts (default: 100)
 * - min_similarity: Minimum semantic similarity threshold (default: 0.65)
 * - category: Filter by category (optional)
 * - center: Post ID to center graph on (optional)
 */

import { json } from '@sveltejs/kit';
import { pool } from '$lib/db.js';

export async function GET({ url, locals }) {
  // Require authentication
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 200);
  const minSimilarity = parseFloat(url.searchParams.get('min_similarity') || '0.65');
  const category = url.searchParams.get('category');
  const centerPostId = url.searchParams.get('center');

  try {
    // Build category filter
    const categoryFilter = category && category !== 'all' ? 'AND p.category = $2' : '';
    const categoryParams = category && category !== 'all' ? [limit, category] : [limit];

    // Get posts (nodes) with vectorization and tags
    const postsQuery = `
      SELECT
        p.id,
        p.title,
        p.slug,
        p.category,
        p.chunk_count,
        p.created_at,
        p.visibility,
        p.source_type,
        pa.full_path as path,
        COALESCE(AVG(dc.quality_score), 0) as avg_quality,
        COUNT(DISTINCT dc.id) as actual_chunks,
        ARRAY_AGG(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as tags
      FROM posts p
      LEFT JOIN paths pa ON p.path_id = pa.id
      LEFT JOIN document_chunks dc ON p.id = dc.post_id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.published = true
        AND p.chunk_count > 0
        ${categoryFilter}
      GROUP BY p.id, pa.full_path
      ORDER BY p.chunk_count DESC, p.created_at DESC
      LIMIT $1
    `;

    const postsResult = await pool.query(postsQuery, categoryParams);
    const posts = postsResult.rows;

    if (posts.length === 0) {
      return json({
        success: true,
        nodes: [],
        edges: [],
        stats: { nodeCount: 0, edgeCount: 0 }
      });
    }

    const postIds = posts.map(p => p.id);

    // Get semantic connections using average embeddings per post
    // This compares the centroid of each post's chunks
    const edgesQuery = `
      WITH post_centroids AS (
        SELECT
          post_id,
          AVG(embedding)::vector as centroid
        FROM document_chunks
        WHERE post_id = ANY($1)
        GROUP BY post_id
      )
      SELECT
        a.post_id as source,
        b.post_id as target,
        1 - (a.centroid <=> b.centroid) as similarity
      FROM post_centroids a
      CROSS JOIN post_centroids b
      WHERE a.post_id < b.post_id
        AND 1 - (a.centroid <=> b.centroid) > $2
      ORDER BY similarity DESC
      LIMIT 500
    `;

    const edgesResult = await pool.query(edgesQuery, [postIds, minSimilarity]);

    // Calculate tag-based connections
    const tagEdges = calculateTagConnections(posts, minSimilarity);

    // Merge edges, keeping strongest connection between any two nodes
    const edgeMap = new Map();

    for (const edge of edgesResult.rows) {
      const key = `${edge.source}-${edge.target}`;
      edgeMap.set(key, {
        source: edge.source,
        target: edge.target,
        similarity: parseFloat(edge.similarity),
        type: 'semantic'
      });
    }

    for (const edge of tagEdges) {
      const key = `${Math.min(edge.source, edge.target)}-${Math.max(edge.source, edge.target)}`;
      const existing = edgeMap.get(key);
      if (!existing) {
        edgeMap.set(key, edge);
      } else if (edge.weight > existing.similarity) {
        // Keep semantic but note tag connection
        existing.sharedTags = edge.sharedTags;
      }
    }

    const edges = Array.from(edgeMap.values());

    // If center is specified, filter to only connected nodes
    let filteredNodes = posts;
    let filteredEdges = edges;

    if (centerPostId) {
      const centerId = parseInt(centerPostId);
      const connectedIds = new Set([centerId]);

      for (const edge of edges) {
        if (edge.source === centerId) connectedIds.add(edge.target);
        if (edge.target === centerId) connectedIds.add(edge.source);
      }

      filteredNodes = posts.filter(p => connectedIds.has(p.id));
      filteredEdges = edges.filter(e =>
        connectedIds.has(e.source) && connectedIds.has(e.target)
      );
    }

    // Format nodes for visualization
    const nodes = filteredNodes.map(post => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      category: post.category,
      tags: post.tags || [],
      chunkCount: post.chunk_count || post.actual_chunks,
      quality: parseFloat(post.avg_quality) || 0,
      path: post.path,
      sourceType: post.source_type,
      createdAt: post.created_at
    }));

    console.log(`📊 Graph: ${nodes.length} nodes, ${filteredEdges.length} edges (min similarity: ${minSimilarity})`);

    return json({
      success: true,
      nodes,
      edges: filteredEdges,
      stats: {
        nodeCount: nodes.length,
        edgeCount: filteredEdges.length,
        avgSimilarity: filteredEdges.length > 0
          ? filteredEdges.reduce((sum, e) => sum + (e.similarity || e.weight), 0) / filteredEdges.length
          : 0
      }
    });

  } catch (error) {
    console.error('❌ Graph API error:', error);
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * Calculate connections based on shared tags
 */
function calculateTagConnections(posts, minWeight = 0.3) {
  const edges = [];

  for (let i = 0; i < posts.length; i++) {
    const postA = posts[i];
    const tagsA = postA.tags || [];

    if (tagsA.length === 0) continue;

    for (let j = i + 1; j < posts.length; j++) {
      const postB = posts[j];
      const tagsB = postB.tags || [];

      if (tagsB.length === 0) continue;

      // Find shared tags
      const sharedTags = tagsA.filter(t => tagsB.includes(t));

      if (sharedTags.length > 0) {
        // Weight based on Jaccard similarity
        const union = new Set([...tagsA, ...tagsB]).size;
        const weight = sharedTags.length / union;

        if (weight >= minWeight) {
          edges.push({
            source: postA.id,
            target: postB.id,
            weight,
            type: 'tag',
            sharedTags
          });
        }
      }
    }
  }

  return edges;
}
