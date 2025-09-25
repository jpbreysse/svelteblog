import { redirect } from '@sveltejs/kit';
import { db, blogDB } from '$lib/db.js';

export async function load({ locals, url }) {
  console.log('🗂️  Admin posts page load - User:', locals.user);
  
  // Check if user exists
  if (!locals.user) {
    console.log('❌ No user in locals - redirecting to home');
    throw redirect(303, '/');
  }
  
  // Check if user is admin
  if (locals.user.role !== 'admin') {
    console.log('❌ User is not admin:', locals.user.role);
    throw redirect(303, '/');
  }
  
  console.log('✅ Admin posts access granted');
  
  try {
    // Get search and filter parameters
    const searchQuery = url.searchParams.get('search') || '';
    const authorFilter = url.searchParams.get('author') || '';
    const categoryFilter = url.searchParams.get('category') || '';
    const statusFilter = url.searchParams.get('status') || '';
    
    // Build the query with filters
    let sql = `
      SELECT 
        p.*,
        u.display_name, u.email,
        GROUP_CONCAT(t.name) as tags,
        COUNT(DISTINCT cr.id) as report_count
      FROM posts p
      INNER JOIN users u ON p.author_id = u.id
      LEFT JOIN post_tags pt ON p.id = pt.post_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      LEFT JOIN content_reports cr ON cr.post_id = p.id AND cr.status = 'pending'
      WHERE 1=1
    `;
    
    const params = [];
    
    // Add search filter
    if (searchQuery) {
      sql += ' AND (p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ?)';
      params.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
    }
    
    // Add author filter
    if (authorFilter) {
      sql += ' AND u.display_name LIKE ?';
      params.push(`%${authorFilter}%`);
    }
    
    // Add category filter
    if (categoryFilter) {
      sql += ' AND p.category = ?';
      params.push(categoryFilter);
    }
    
    // Add status filter
    if (statusFilter) {
      if (statusFilter === 'published') {
        sql += ' AND p.published = 1';
      } else if (statusFilter === 'draft') {
        sql += ' AND p.published = 0';
      }
    }
    
    sql += ' GROUP BY p.id ORDER BY p.created_at DESC';
    
    const posts = db.prepare(sql).all(...params);
    
    // Transform the data
    const transformedPosts = posts.map(post => ({
      ...post,
      author: post.display_name,
      tags: post.tags ? post.tags.split(',') : [],
      created_at: new Date(post.created_at),
      updated_at: new Date(post.updated_at),
      has_reports: post.report_count > 0
    }));
    
    // Get all authors for filter dropdown
    const authors = db.prepare(`
      SELECT DISTINCT u.display_name, u.id
      FROM users u
      INNER JOIN posts p ON u.id = p.author_id
      ORDER BY u.display_name
    `).all();
    
    // Get all categories for filter dropdown
    const categories = blogDB.getCategories();
    
    // Get statistics
    const stats = {
      total: transformedPosts.length,
      published: transformedPosts.filter(p => p.published).length,
      drafts: transformedPosts.filter(p => !p.published).length,
      withReports: transformedPosts.filter(p => p.has_reports).length
    };
    
    console.log('📊 Posts loaded:', {
      total: stats.total,
      published: stats.published,
      drafts: stats.drafts,
      withReports: stats.withReports
    });
    
    return {
      posts: transformedPosts,
      authors,
      categories,
      stats,
      filters: {
        search: searchQuery,
        author: authorFilter,
        category: categoryFilter,
        status: statusFilter
      }
    };
  } catch (error) {
    console.error('❌ Error loading admin posts data:', error);
    return {
      posts: [],
      authors: [],
      categories: [],
      stats: { total: 0, published: 0, drafts: 0, withReports: 0 },
      filters: {
        search: '',
        author: '',
        category: '',
        status: ''
      }
    };
  }
}
