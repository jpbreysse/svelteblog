import { json } from '@sveltejs/kit';
import { pathsDB } from '$lib/paths.js';

// GET /api/paths/[id] - Get specific path with details
export async function GET({ params, locals }) {
  try {
    const pathId = parseInt(params.id);

    if (isNaN(pathId)) {
      return json({ error: 'Invalid path ID' }, { status: 400 });
    }

    const path = await pathsDB.getPathById(pathId);

    if (!path) {
      return json({ error: 'Path not found' }, { status: 404 });
    }

    // Get children
    const children = await pathsDB.getPathChildren(pathId);

    // Get statistics  
    const stats = await pathsDB.getPathStatistics();

    return json({
      success: true,
      path: {
        ...path,
        children_count: children.length,
        children
      }
    });

  } catch (error) {
    console.error('❌ Error fetching path:', error);
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

    // Update the path - MUST AWAIT
    const result = await pathsDB.updatePath(pathId, pathData);

    // Return updated path details
    const updatedPath = await pathsDB.getPathById(pathId);

    return json({
      success: true,
      path: updatedPath,
      message: `Path updated successfully`
    });

  } catch (error) {
    console.error('❌ Error updating path:', error.message);
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

    // Get path name before deleting
    const pathToDelete = await pathsDB.getPathById(pathId);
    
    if (!pathToDelete) {
      return json({ error: 'Path not found' }, { status: 404 });
    }

    // Delete the path - MUST AWAIT
    const result = await pathsDB.deletePath(pathId);

    return json({
      success: true,
      message: `Path "${pathToDelete.full_path}" deleted successfully`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('❌ Error deleting path:', error.message);
    return json({ error: error.message }, { status: 400 });
  }
}