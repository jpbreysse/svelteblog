import { json } from '@sveltejs/kit';
import { categoryDB } from '$lib/db.js';

// GET /api/admin/categories - Get all categories
export async function GET({ locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ success: false, error: 'Admin access required' }, { status: 403 });
  }

  try {
    const categories = await categoryDB.getAllCategories();
    return json({ success: true, categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/admin/categories - Create new category
export async function POST({ request, locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ success: false, error: 'Admin access required' }, { status: 403 });
  }

  try {
    const { value, label, position } = await request.json();

    if (!value || !label) {
      return json({ success: false, error: 'Value and label are required' }, { status: 400 });
    }

    const result = await categoryDB.createCategory({ value, label, position });
    return json(result);
  } catch (error) {
    console.error('Error creating category:', error);

    // Handle duplicate key error
    if (error.code === '23505') {
      return json({ success: false, error: 'A category with this value already exists' }, { status: 409 });
    }

    return json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT /api/admin/categories - Reorder categories
export async function PUT({ request, locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ success: false, error: 'Admin access required' }, { status: 403 });
  }

  try {
    const { orderedIds } = await request.json();

    if (!Array.isArray(orderedIds)) {
      return json({ success: false, error: 'orderedIds must be an array' }, { status: 400 });
    }

    const result = await categoryDB.reorderCategories(orderedIds);
    return json(result);
  } catch (error) {
    console.error('Error reordering categories:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}
