import { json } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';

export async function POST({ request, locals }) {
  try {
    // Check admin authentication
    if (!locals.user || locals.user.role !== 'admin') {
      return json({ 
        success: false, 
        error: 'Admin access required' 
      }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return json({ 
        success: false, 
        error: 'User ID is required' 
      }, { status: 400 });
    }

    // Process complete deletion
    const result = await userDB.completeAccountDeletion(locals.user.id, userId);

    return json({
      success: true,
      message: result.message,
      deletedPosts: result.deletedPosts
    });

  } catch (error) {
    console.error('Admin process deletion error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Failed to process account deletion' 
    }, { status: 500 });
  }
}