import { error } from '@sveltejs/kit';
import { blogDB } from '$lib/db.js';

export async function load({ params, locals }) {
  // ✅ FIXED: Added await to blogDB.getPostBySlug
  const post = await blogDB.getPostBySlug(params.slug);
  
  if (!post) {
    throw error(404, {
      message: 'Post not found',
      hint: 'The post you are looking for might have been moved or deleted.'
    });
  }
  
  return {
    post,
    user: locals.user || null
  };
}
