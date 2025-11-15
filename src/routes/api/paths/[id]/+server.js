import { json } from '@sveltejs/kit';
import { pathsDB } from '$lib/paths.js';

// GET /api/paths/[id] - Get specific path with details
export async function GET({ params, locals }) {
  try {
    const pathId = parseInt(params.id);

    if (isNaN(pathId)) {
      return json({ error: 'Invalid path ID' }, { status: 400 });
    }

    const path = pathsDB.getPathById(pathId);

    if (!path) {
      return json({ error: 'Path not found' }, { status: 404 });
    }

    // Get children
    const children = pathsDB.getChildPaths(pathId);

    // Get statistics
    const stats = pathsDB.getPathStats(pathId);

    return json({
      success: true,
      path: {
        ...path,
        children,
        stats
      }
    });

  } catch (error) {
    console.error('Error fetching path:', error);
    return json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/paths/[id] - Update path
export async function PUT({ params, request, locals }) {
  try {
    // Check if user is authenticated
    if (!locals.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const pathId = parseInt(params.id);

    if (isNaN(pathId)) {
      return json({ error: 'Invalid path ID' }, { status: 400 });
    }

    const pathData = await request.json();

    // Update the path
    const updatedPath = pathsDB.updatePath(pathId, pathData, locals.user.id);

    return json({
      success: true,
      path: updatedPath,
      message: `Path updated successfully`
    });

  } catch (error) {
    console.error('Error updating path:', error);
    return json({ error: error.message }, { status: 400 });
  }
}

// DELETE /api/paths/[id] - Delete path
export async function DELETE({ params, url, locals }) {
  try {
    // Check if user is authenticated
    if (!locals.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const pathId = parseInt(params.id);

    if (isNaN(pathId)) {
      return json({ error: 'Invalid path ID' }, { status: 400 });
    }

    // Check for cascade parameter
    const cascade = url.searchParams.get('cascade') === 'true';

    // Delete the path
    const result = pathsDB.deletePath(pathId, cascade);

    return json({
      success: true,
      message: `Path "${result.deleted}" deleted successfully`,
      cascade
    });

  } catch (error) {
    console.error('Error deleting path:', error);
    return json({ error: error.message }, { status: 400 });
  }
}