import { json } from '@sveltejs/kit';
import { getUserGroups } from '$lib/server/permissions.js';

/**
 * GET /api/groups/my-groups
 * Get all groups the current user belongs to
 */
export async function GET({ locals }) {
  console.log('🔍 GET /api/groups/my-groups');
  console.log('   User:', locals.user);

  if (!locals.user) {
    console.log('   ❌ No user in locals');
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('   Fetching groups for user ID:', locals.user.id);
    const groups = await getUserGroups(locals.user.id);
    console.log('   ✅ Found groups:', groups);

    return json({
      success: true,
      groups
    });
  } catch (error) {
    console.error('   ❌ Error fetching user groups:', error);
    return json({
      success: false,
      error: 'Failed to fetch groups'
    }, { status: 500 });
  }
}
