import { json } from '@sveltejs/kit';
import { categoryDB } from '$lib/db.js';

// GET /api/admin/categories/[id] - Get single category
export async function GET({ params, locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ success: false, error: 'Admin access required' }, { status: 403 });
  }

  const id = parseInt(params.id);

  if (isNaN(id)) {
    return json({ success: false, error: 'Invalid category ID' }, { status: 400 });
  }

  try {
    const category = await categoryDB.getCategoryById(id);

    if (!category) {
      return json({ success: false, error: 'Category not found' }, { status: 404 });
    }

    return json({ success: true, category });
  } catch (error) {
    console.error('Error fetching category:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT /api/admin/categories/[id] - Update category
export async function PUT({ params, request, locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ success: false, error: 'Admin access required' }, { status: 403 });
  }

  const id = parseInt(params.id);

  if (isNaN(id)) {
    return json({ success: false, error: 'Invalid category ID' }, { status: 400 });
  }

  try {
    const { value, label, position } = await request.json();

    if (!value || !label) {
      return json({ success: false, error: 'Value and label are required' }, { status: 400 });
    }

    const result = await categoryDB.updateCategory(id, { value, label, position });
    return json(result);
  } catch (error) {
    console.error('Error updating category:', error);

    // Handle duplicate key error
    if (error.code === '23505') {
      return json({ success: false, error: 'A category with this value already exists' }, { status: 409 });
    }

    return json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/admin/categories/[id] - Delete category
export async function DELETE({ params, locals }) {
  // Require admin authentication
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ success: false, error: 'Admin access required' }, { status: 403 });
  }

  const id = parseInt(params.id);

  if (isNaN(id)) {
    return json({ success: false, error: 'Invalid category ID' }, { status: 400 });
  }

  try {
    const result = await categoryDB.deleteCategory(id);
    return json(result);
  } catch (error) {
    console.error('Error deleting category:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}
