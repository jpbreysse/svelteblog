import { json } from '@sveltejs/kit';
import { pool } from '$lib/db.js';

export async function POST({ request, locals }) {
  try {
    // Check if user is authenticated and is admin
    if (!locals.user) {
      return json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    if (locals.user.role !== 'admin') {
      return json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const { postId, published } = await request.json();

    if (!postId || published === undefined) {
      return json({ success: false, error: 'Post ID and published status are required' }, { status: 400 });
    }

    // Update post status using PostgreSQL
    const result = await pool.query(
      `UPDATE posts
       SET published = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [published, postId]
    );

    if (result.rowCount === 0) {
      return json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    console.log(`📝 Admin ${locals.user.email} ${published ? 'published' : 'unpublished'} post ID ${postId}`);

    return json({
      success: true,
      message: `Post ${published ? 'published' : 'unpublished'} successfully`,
      published
    });

  } catch (error) {
    console.error('❌ Error toggling post status:', error);
    return json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
