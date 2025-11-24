import { json } from '@sveltejs/kit';
import { pool } from '$lib/db.js';

// GET /api/health - Health check endpoint
export async function GET() {
  try {
    // Test database connection
    const result = await pool.query('SELECT NOW()');
    
    return json({
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].now,
      uptime: process.uptime()
    }, { status: 200 });
    
  } catch (error) {
    console.error('❌ Health check failed:', {
      message: error.message,
      code: error.code
    });
    
    return json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      code: error.code,
      uptime: process.uptime()
    }, { status: 503 });
  }
}
