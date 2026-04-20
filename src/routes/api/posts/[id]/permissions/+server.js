import { json } from '@sveltejs/kit';
import { getPostPermissions } from '$lib/server/permissions.js';

/**
 * GET /api/posts/[id]/permissions
 * Get permissions for a specific post
 */
export async function GET({ params, locals }) {
  if (!locals.user) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const postId = parseInt(params.id);
    const permissions = await getPostPermissions(postId);

    return json({
      success: true,
      readGroups: permissions.readGroups.map(g => g.id),
      writeGroups: permissions.writeGroups.map(g => g.id)
    });
  } catch (error) {
    console.error('Error fetching post permissions:', error);
    return json({
      success: false,
      error: 'Failed to fetch permissions'
    }, { status: 500 });
  }
}
