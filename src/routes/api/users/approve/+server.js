import { json } from '@sveltejs/kit';
import { pool } from '$lib/db.js';

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
    console.log(`✅ Approving user ${userId} by admin ${locals.user.id}`);
    
    const result = await pool.query(
      `UPDATE users 
       SET status = 'approved', approved_at = NOW(), approved_by = $1
       WHERE id = $2
       RETURNING id, email, display_name`,
      [locals.user.id, userId]
    );
    
    if (result.rowCount === 0) {
      return json({ error: 'User not found' }, { status: 404 });
    }
    
    console.log(`✅ User approved: ${result.rows[0].email}`);
    return json({ success: true });
  } catch (error) {
    console.error('❌ Error approving user:', error.message);
    return json({ error: 'Failed to approve user' }, { status: 500 });
  }
}