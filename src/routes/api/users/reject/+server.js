import { json } from '@sveltejs/kit';
import { db } from '$lib/db.js';

export async function POST({ request, locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }
  
  const data = await request.formData();
  const userId = data.get('userId');
  
  if (!userId) {
    return json({ error: 'User ID required' }, { status: 400 });
  }
  
  try {
    db.prepare(`
      UPDATE users 
      SET status = 'rejected', approved_at = NULL, approved_by = ?
      WHERE id = ?
    `).run(locals.user.id, userId);
    
    return json({ success: true });
  } catch (error) {
    return json({ error: 'Failed to reject user' }, { status: 500 });
  }
}