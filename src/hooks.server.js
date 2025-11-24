import { verifyToken } from '$lib/auth.js';
import { userDB } from '$lib/db.js';

export async function handle({ event, resolve }) {
  const token = event.cookies.get('auth_token');
  
  console.log('🍪 Hook - Token found:', token ? 'Yes' : 'No');
  
  if (token) {
    const payload = verifyToken(token);
    console.log('🔑 Hook - Token payload:', payload);
    
    if (payload) {
      try {
        // ✅ FIXED: Use async userDB method instead of db.prepare()
        const user = await userDB.getUserById(payload.id);
        console.log('👤 Hook - User from DB:', user ? `${user.email} (${user.role})` : 'Not found');
        
        // Check if user is approved
        if (user && user.status === 'approved') {
          event.locals.user = {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            role: user.role,
            status: user.status
          };
          console.log('✅ Hook - User set in locals:', event.locals.user.email, event.locals.user.role);
        } else if (user) {
          console.log('⚠️ Hook - User found but not approved, status:', user.status);
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
