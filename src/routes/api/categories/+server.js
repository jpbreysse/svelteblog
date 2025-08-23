import { json } from '@sveltejs/kit';
import { blogDB } from '$lib/db.js';

export async function GET() {
  try {
    const categories = blogDB.getCategories();
    return json({ success: true, categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

