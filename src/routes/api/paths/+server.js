import { json } from '@sveltejs/kit';
import { pathsDB } from '$lib/paths.js';

// GET /api/paths - List all paths
// Query params: ?format=tree (default) | flat
//               ?parent_id=X (filter by parent)
export async function GET({ url, locals }) {
  try {
    const format = url.searchParams.get('format') || 'tree';
    const parentId = url.searchParams.get('parent_id');

    let paths;

    if (format === 'tree') {
      // Return hierarchical tree structure
      paths = await pathsDB.getPathHierarchy(parentId ? parseInt(parentId) : null);
    } else if (format === 'flat') {
      // Return flat list
      paths = await pathsDB.getAllPaths();
    } else if (format === 'children') {
      // Return only direct children of parent
      paths = await pathsDB.getPathChildren(parentId ? parseInt(parentId) : null);
    } else {
      return json({ error: 'Invalid format parameter' }, { status: 400 });
    }

    return json({
      success: true,
      paths,
      format
    });

  } catch (error) {
    console.error('❌ Error fetching paths:', error);
    return json({ error: error.message }, { status: 500 });
  }
}

// POST /api/paths - Create new path
export async function POST({ request, locals }) {
  try {
    // Check if user is authenticated
    if (!locals.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const pathData = await request.json();

    // Validate required fields
    if (!pathData.name || pathData.name.trim().length === 0) {
      return json({ error: 'Path name is required' }, { status: 400 });
    }

    console.log('📁 Creating path:', pathData.name);

    // Create the path - slug will be auto-generated from name
    const result = await pathsDB.createPath(pathData, locals.user.id);

    return json({
      success: true,
      path: result.path,
      message: `Path "${result.path.full_path}" created successfully`
    }, { status: 201 });

  } catch (error) {
    console.error('❌ Error creating path:', error.message);
    return json({ error: error.message }, { status: 400 });
  }
}