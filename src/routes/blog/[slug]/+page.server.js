import { error } from '@sveltejs/kit';
import { blogDB } from '$lib/db.js';
import { canReadPost } from '$lib/server/permissions.js';

export async function load({ params, locals }) {
  // ✅ FIXED: Added await to blogDB.getPostBySlug
  const post = await blogDB.getPostBySlug(params.slug);

  if (!post) {
    throw error(404, {
      message: 'Post not found',
      hint: 'The post you are looking for might have been moved or deleted.'
    });
  }

  // Check if user has permission to read this post
  const userId = locals.user?.id || null;
  const userRole = locals.user?.role || 'user';
  const canRead = await canReadPost(post.id, userId, userRole);

  if (!canRead) {
    throw error(403, {
      message: 'Access denied',
      hint: 'You do not have permission to view this post.'
    });
  }

  return {
    post,
    user: locals.user || null
  };
}
