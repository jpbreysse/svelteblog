import { json } from '@sveltejs/kit';
import { pathsDB } from '$lib/paths.js';

// POST /api/paths/[id]/move - Move path to new parent
export async function POST({ params, request, locals }) {
  try {
    // Check if user is authenticated
    if (!locals.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const pathId = parseInt(params.id);

    if (isNaN(pathId)) {
      return json({ error: 'Invalid path ID' }, { status: 400 });
    }

    const { new_parent_id } = await request.json();

    // Validate new_parent_id (can be null for moving to root)
    const newParentId = new_parent_id === null ? null : parseInt(new_parent_id);

    if (new_parent_id !== null && isNaN(newParentId)) {
      return json({ error: 'Invalid new parent ID' }, { status: 400 });
    }

    // Move the path
    const movedPath = pathsDB.movePath(pathId, newParentId);

    return json({
      success: true,
      path: movedPath,
      message: `Path moved to "${movedPath.full_path}" successfully`
    });

  } catch (error) {
    console.error('Error moving path:', error);
    return json({ error: error.message }, { status: 400 });
  }
}