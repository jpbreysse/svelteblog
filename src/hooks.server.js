import { verifyToken } from '$lib/auth.js';
import { db } from '$lib/db.js';

export async function handle({ event, resolve }) {
  const token = event.cookies.get('auth_token');
  
  console.log('🍪 Hook - Token found:', token ? 'Yes' : 'No');
  
  if (token) {
    const payload = verifyToken(token);
    console.log('🔑 Hook - Token payload:', payload);
    
    if (payload) {
      try {
        const user = db.prepare('SELECT * FROM users WHERE id = ? AND status = ?').get(payload.id, 'approved');
        console.log('👤 Hook - User from DB:', user ? `${user.email} (${user.role})` : 'Not found');
        
        if (user) {
          event.locals.user = {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role
          };
          console.log('✅ Hook - User set in locals:', event.locals.user.email, event.locals.user.role);
        }
      } catch (error) {
        console.error('❌ Hook - Database error:', error);
      }
    } else {
      console.log('❌ Hook - Invalid token');
    }
  }
  
  return resolve(event);
}