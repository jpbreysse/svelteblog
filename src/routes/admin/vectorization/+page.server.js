import { redirect } from '@sveltejs/kit';
import { pool } from '$lib/db.js';

export async function load({ locals }) {
  // Require admin
  if (!locals.user || locals.user.role !== 'admin') {
    throw redirect(302, '/');
  }

  // Get all posts with vectorization info and per-post enrichment stats
  const postsResult = await pool.query(`
    SELECT
      p.id,
      p.title,
      p.slug,
      p.category,
      p.source_type,
      p.source_url,
      p.chunk_count,
      p.vectorized_at,
      p.published,
      p.visibility,
      p.created_at,
      u.display_name as author,
      LENGTH(p.content) as content_length,
      COALESCE(e.total_chunks, 0) as enrichment_total,
      COALESCE(e.reviewed_chunks, 0) as enrichment_reviewed,
      COALESCE(e.low_quality, 0) as enrichment_low_quality,
      COALESCE(e.avg_quality, 0) as enrichment_avg_quality
    FROM posts p
    LEFT JOIN users u ON p.author_id = u.id
    LEFT JOIN (
      SELECT
        post_id,
        COUNT(*) as total_chunks,
        COUNT(reviewed_at) as reviewed_chunks,
        COUNT(*) FILTER (WHERE quality_score < 0.5) as low_quality,
        AVG(quality_score) FILTER (WHERE quality_score IS NOT NULL) as avg_quality
      FROM document_chunks
      GROUP BY post_id
    ) e ON p.id = e.post_id
    ORDER BY p.vectorized_at DESC NULLS LAST, p.created_at DESC
  `);

  // Get global stats
  const statsResult = await pool.query(`
    SELECT
      COUNT(*) as total_posts,
      COUNT(vectorized_at) as vectorized_posts,
      SUM(COALESCE(chunk_count, 0)) as total_chunks,
      COUNT(*) FILTER (WHERE published = true) as published_posts
    FROM posts
  `);

  // Get chunk stats by source type
  const chunkStatsResult = await pool.query(`
    SELECT
      COALESCE(source_type, 'post') as source_type,
      COUNT(*) as post_count,
      SUM(COALESCE(chunk_count, 0)) as chunk_count
    FROM posts
    WHERE vectorized_at IS NOT NULL
    GROUP BY source_type
    ORDER BY chunk_count DESC
  `);

  // Get enrichment/review stats
  const enrichmentResult = await pool.query(`
    SELECT
      COUNT(*) as total_chunks,
      COUNT(reviewed_at) as reviewed_chunks,
      COUNT(*) FILTER (WHERE quality_score < 0.5) as low_quality,
      COUNT(redundant_of) as redundant,
      COUNT(*) FILTER (WHERE doc_type = 'technicaldoc') as technicaldoc_count,
      COUNT(*) FILTER (WHERE doc_type = 'meetingsummary') as meetingsummary_count
    FROM document_chunks
  `);

  return {
    posts: postsResult.rows,
    stats: statsResult.rows[0],
    chunkStats: chunkStatsResult.rows,
    enrichmentStats: enrichmentResult.rows[0]
  };
}
