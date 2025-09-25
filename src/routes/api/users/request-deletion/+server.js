import { json } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';

export async function POST({ request, locals, cookies }) {
  try {
    // Check authentication
    if (!locals.user) {
      return json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const { confirmText, reason } = await request.json();

    // Validate confirmation
    if (confirmText !== 'DELETE') {
      return json({ 
        success: false, 
        error: 'You must type "DELETE" to confirm account deletion' 
      }, { status: 400 });
    }

    // IMMEDIATELY delete account completely
    const result = await userDB.completeAccountDeletion(locals.user.id, reason || '');

    // Clear user session
    cookies.delete('session', { path: '/' });

    return json({
      success: true,
      message: `Account deleted successfully! ${result.deletedPosts} posts were removed.`,
      redirect: true
    });

  } catch (error) {
    console.error('Account deletion error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Failed to delete account' 
    }, { status: 500 });
  }
}