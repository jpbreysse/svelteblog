import { json } from '@sveltejs/kit';
import { blogDB } from '$lib/db.js';

export async function GET() {
  try {
    const stats = blogDB.getStats();
    return json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}