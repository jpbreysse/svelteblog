import { redirect } from '@sveltejs/kit';
import { pool } from '$lib/db.js';

export async function load({ locals, url }) {
  // Redirect to login if not authenticated
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  // Get post ID from URL if present (for "Chat About This" feature)
  const postId = url.searchParams.get('post');

  // Load vectorized posts for the document filter dropdown
  const result = await pool.query(`
    SELECT p.id, p.title, p.slug, p.category, p.chunk_count
    FROM posts p
    WHERE p.published = true AND p.chunk_count > 0
    ORDER BY p.title ASC
  `);

  // If a specific post is requested, get its details
  let selectedPost = null;
  if (postId) {
    selectedPost = result.rows.find(p => p.id === parseInt(postId)) || null;
  }

  return {
    user: locals.user,
    vectorizedPosts: result.rows,
    selectedPostId: selectedPost ? selectedPost.id : null,
    selectedPostTitle: selectedPost ? selectedPost.title : null
  };
}
