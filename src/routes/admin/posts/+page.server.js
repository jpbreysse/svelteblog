import { redirect, error, fail } from '@sveltejs/kit';
import { blogDB } from '$lib/db.js';

export async function load({ locals, url }) {
  console.log('🗂️  Admin posts page load - User:', locals.user?.email);
  
  // Check if user exists
  if (!locals.user) {
    console.log('❌ No user in locals - redirecting to home');
    throw redirect(303, '/');
  }
  
  // Check if user is admin
  if (locals.user.role !== 'admin') {
    console.log('❌ User is not admin:', locals.user.role);
    throw error(403, 'Admin access required');
  }
  
  console.log('✅ Admin posts access granted');
  
  try {
    // ✅ FIXED: Get all posts using async blogDB
    const allPosts = await blogDB.getAllPosts();
    
    // Get filters from URL
    const searchQuery = url.searchParams.get('search') || '';
    const categoryFilter = url.searchParams.get('category') || '';
    const statusFilter = url.searchParams.get('status') || '';
    
    // Filter posts in memory
    let filteredPosts = allPosts;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredPosts = filteredPosts.filter(p => 
        p.title.toLowerCase().includes(query) ||
        p.content.toLowerCase().includes(query) ||
        p.excerpt.toLowerCase().includes(query)
      );
    }
    
    if (categoryFilter) {
      filteredPosts = filteredPosts.filter(p => p.category === categoryFilter);
    }
    
    if (statusFilter) {
      if (statusFilter === 'published') {
        filteredPosts = filteredPosts.filter(p => p.published);
      } else if (statusFilter === 'draft') {
        filteredPosts = filteredPosts.filter(p => !p.published);
      }
    }
    
    // ✅ FIXED: Get categories with await
    const categories = await blogDB.getCategories();
    
    // Get unique authors from posts
    const authors = Array.from(
      new Map(
        allPosts.map(p => [p.author_id, { id: p.author_id, name: p.author_name }])
      ).values()
    );
    
    // Calculate statistics
    const stats = {
      total: allPosts.length,
      published: allPosts.filter(p => p.published).length,
      drafts: allPosts.filter(p => !p.published).length,
      filtered: filteredPosts.length
    };
    
    console.log('📊 Posts loaded:', {
      total: stats.total,
      published: stats.published,
      drafts: stats.drafts,
      filtered: stats.filtered
    });
    
    return {
      posts: filteredPosts,
      authors,
      categories,
      stats,
      filters: {
        search: searchQuery,
        category: categoryFilter,
        status: statusFilter
      }
    };
  } catch (error) {
    console.error('❌ Error loading admin posts data:', error.message);
    throw error(500, 'Failed to load posts');
  }
}

export const actions = {
  // Update post status (publish/unpublish)
  updateStatus: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') {
      return fail(403, { error: 'Admin access required' });
    }

    try {
      const data = await request.formData();
      const postId = parseInt(data.get('post_id'));
      const published = data.get('published') === 'true';

      console.log('📝 Updating post status:', postId, 'published:', published);

      // Get post first
      const post = await blogDB.getPostById(postId);
      if (!post) {
        return fail(404, { error: 'Post not found' });
      }

      // Update post (as the original author)
      await blogDB.updatePost(postId, {
        title: post.title,
        content: post.content,
        category: post.category,
        path_id: post.path_id,
        published
      }, post.author_id);

      console.log('✅ Post status updated');

      return { success: true, message: 'Post status updated' };
    } catch (error) {
      console.error('❌ Error updating post status:', error.message);
      return fail(500, { error: error.message });
    }
  },

  // Delete post
  delete: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') {
      return fail(403, { error: 'Admin access required' });
    }

    try {
      const data = await request.formData();
      const postId = parseInt(data.get('post_id'));

      console.log('🗑️  Deleting post:', postId);

      // Get post first
      const post = await blogDB.getPostById(postId);
      if (!post) {
        return fail(404, { error: 'Post not found' });
      }

      // Delete post (as the original author)
      await blogDB.deletePost(postId, post.author_id);

      console.log('✅ Post deleted');

      return { success: true, message: 'Post deleted successfully' };
    } catch (error) {
      console.error('❌ Error deleting post:', error.message);
      return fail(500, { error: error.message });
    }
  }
};
