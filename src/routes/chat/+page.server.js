import { redirect } from '@sveltejs/kit';
import { pool } from '$lib/db.js';

export async function load({ locals, url }) {
  // Redirect to login if not authenticated
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  // Get post ID and path ID from URL if present
  const postId = url.searchParams.get('post');
  const pathId = url.searchParams.get('path');

  // Load vectorized posts for the document filter dropdown (include path_id)
  const postsResult = await pool.query(`
    SELECT p.id, p.title, p.slug, p.category, p.chunk_count, p.path_id
    FROM posts p
    WHERE p.published = true AND p.chunk_count > 0
    ORDER BY p.title ASC
  `);

  // Load folders/paths that have vectorized posts
  const pathsResult = await pool.query(`
    SELECT DISTINCT pa.id, pa.name, pa.full_path, pa.icon, pa.color,
      (SELECT COUNT(*) FROM posts p WHERE p.path_id = pa.id AND p.published = true AND p.chunk_count > 0) as post_count
    FROM paths pa
    WHERE EXISTS (
      SELECT 1 FROM posts p
      WHERE p.path_id = pa.id AND p.published = true AND p.chunk_count > 0
    )
    ORDER BY pa.full_path ASC
  `);

  // If a specific post is requested, get its details
  let selectedPost = null;
  if (postId) {
    selectedPost = postsResult.rows.find(p => p.id === parseInt(postId)) || null;
  }

  // If a specific path is requested, validate it exists
  let selectedPath = null;
  if (pathId) {
    selectedPath = pathsResult.rows.find(p => p.id === parseInt(pathId)) || null;
  }

  return {
    user: locals.user,
    vectorizedPosts: postsResult.rows,
    paths: pathsResult.rows,
    selectedPostId: selectedPost ? selectedPost.id : null,
    selectedPostTitle: selectedPost ? selectedPost.title : null,
    selectedPathId: selectedPath ? selectedPath.id : null
  };
}
