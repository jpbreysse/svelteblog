import { json } from '@sveltejs/kit';
import { blogDB, pool } from '$lib/db.js';
import { setPostPermissions } from '$lib/server/permissions.js';

// GET /api/posts - Get all posts, search, or filter by path
export async function GET({ url, locals }) {
  try {
    const searchQuery = url.searchParams.get('search');
    const category = url.searchParams.get('category');
    const userId = url.searchParams.get('user');
    const pathId = url.searchParams.get('path_id');

    let posts;
    
    // Priority order: path_id > userId > search > category > all
    if (pathId) {
      // Filter by path - use async PostgreSQL query
      const result = await pool.query(`
        SELECT p.id, p.title, p.excerpt, p.category, p.slug,
          p.created_at, p.updated_at, p.published, p.read_time,
          u.id as author_id, u.display_name as author,
          array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags
        FROM posts p
        INNER JOIN users u ON p.author_id = u.id
        LEFT JOIN post_tags pt ON p.id = pt.post_id
        LEFT JOIN tags t ON pt.tag_id = t.id
        WHERE p.path_id = $1 AND p.published = true
        GROUP BY p.id, u.id
        ORDER BY p.created_at DESC
      `, [parseInt(pathId)]);

      posts = result.rows;

    } else if (userId) {
      // Get posts by specific user (public access allowed for filtering)
      posts = await blogDB.getPostsByUser(parseInt(userId));
    } else if (searchQuery) {
      posts = await blogDB.searchPosts(searchQuery, category);
    } else if (category && category !== 'all') {
      posts = await blogDB.getPostsByCategory(category);
    } else {
      posts = await blogDB.getAllPosts();
    }

    return json({
      success: true,
      posts,
      count: posts.length
    });
  } catch (error) {
    console.error('❌ Error fetching posts:', error);
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

// Validation constants (server-side safety limits)
const VALIDATION_LIMITS = {
  title: { max: 500 },        // Generous server limit
  content: { max: 1000000 },  // 1MB limit for image support
  category: { max: 50 },
  tags: { max: 15, tagLength: 50 } // Generous server limits
};

// Server-side validation function
function validatePostData(postData) {
  const errors = [];
  
  if (!postData.title?.trim()) {
    errors.push('Title is required');
  } else if (postData.title.length > VALIDATION_LIMITS.title.max) {
    errors.push(`Title is extremely long (max ${VALIDATION_LIMITS.title.max} characters)`);
  }
  
  if (!postData.content?.trim()) {
    errors.push('Content is required');
  } else if (postData.content.length > VALIDATION_LIMITS.content.max) {
    errors.push(`Content is extremely long (max ${VALIDATION_LIMITS.content.max} characters)`);
  }
  
  if (postData.category && postData.category.length > VALIDATION_LIMITS.category.max) {
    errors.push(`Category name too long (max ${VALIDATION_LIMITS.category.max} characters)`);
  }
  
  if (postData.tags && Array.isArray(postData.tags)) {
    if (postData.tags.length > VALIDATION_LIMITS.tags.max) {
      errors.push(`Too many tags (max ${VALIDATION_LIMITS.tags.max})`);
    }
    
    postData.tags.forEach((tag, index) => {
      if (typeof tag === 'string' && tag.length > VALIDATION_LIMITS.tags.tagLength) {
        errors.push(`Tag "${tag.substring(0, 20)}..." is too long (max ${VALIDATION_LIMITS.tags.tagLength} characters)`);
      }
    });
  }
  
  return errors;
}

// POST /api/posts - Create new post (authenticated users only)
export async function POST({ request, locals }) {
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  try {
    const postData = await request.json();
    
    // Server-side validation (basic safety checks)
    const validationErrors = validatePostData(postData);
    if (validationErrors.length > 0) {
      console.log('⚠️ Post validation failed:', validationErrors);
      return json({
        success: false,
        error: `Validation failed: ${validationErrors.join(', ')}`,
        validationErrors
      }, { status: 400 });
    }
    
    console.log('🔄 Creating post:', postData.title, 'for user:', locals.user.id);
    console.log('   path_id:', postData.path_id || 'null (no path)');
    
    const result = await blogDB.createPost(postData, locals.user.id);
    console.log('✅ Post created with ID:', result.post.id);

    // Record creation in history
    await pool.query(
      'INSERT INTO post_history (post_id, user_id, action) VALUES ($1, $2, $3)',
      [result.post.id, locals.user.id, 'created']
    );
    console.log('✅ History recorded for post:', result.post.id);

    // Update tags if provided
    if (postData.tags && Array.isArray(postData.tags) && postData.tags.length > 0) {
      await blogDB.updatePostTags(result.post.id, postData.tags);
      console.log('✅ Tags updated for post:', result.post.id);
    }

    // Set permissions if visibility is 'groups'
    if (postData.visibility === 'groups') {
      await setPostPermissions(
        result.post.id,
        postData.readGroupIds || [],
        postData.writeGroupIds || []
      );
      console.log('✅ Permissions set for post:', result.post.id);
    }

    return json({
      success: true,
      post: result.post,
      message: 'Post created successfully'
    }, { status: 201 });
  } catch (error) {
    console.error('❌ Error creating post:', error.message);
    
    // Check if it's a foreign key constraint error
    if (error.code === '23503') {
      return json({
        success: false,
        error: `Invalid reference: ${error.detail}. Make sure the path exists before creating a post.`
      }, { status: 400 });
    }
    
    return json({
      success: false,
      error: error.message
    }, { status: 400 });
  }
}