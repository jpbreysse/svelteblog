import { json } from '@sveltejs/kit';
import { pathsDB } from '$lib/paths.js';

// GET /api/paths/by-path?path=/technical/backend - Get path by full_path
export async function GET({ url, locals }) {
  try {
    const fullPath = url.searchParams.get('path');

    if (!fullPath) {
      return json({ error: 'Path parameter is required' }, { status: 400 });
    }

    const path = pathsDB.getPathByFullPath(fullPath);

    if (!path) {
      return json({ error: 'Path not found' }, { status: 404 });
    }

    // Get children
    const children = pathsDB.getChildPaths(path.id);

    return json({
      success: true,
      path: {
        ...path,
        children
      }
    });

  } catch (error) {
    console.error('Error fetching path:', error);
    return json({ error: error.message }, { status: 500 });
  }
}