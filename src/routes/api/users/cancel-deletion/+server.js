import { json } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';

export async function POST({ locals }) {
  try {
    if (!locals.user) {
      return json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const result = await userDB.cancelAccountDeletion(locals.user.id);

    return json({
      success: true,
      message: 'Account deletion request cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel deletion error:', error);
    return json({ 
      success: false, 
      error: error.message || 'Failed to cancel deletion request' 
    }, { status: 500 });
  }
}