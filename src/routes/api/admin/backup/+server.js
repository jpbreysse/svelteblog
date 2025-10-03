import { json } from '@sveltejs/kit';
import { db } from '$lib/db.js';
import { dev } from '$app/environment';

export async function GET({ locals, url }) {
  try {
    // Check if user is authenticated and is admin
    if (!locals.user || locals.user.role !== 'admin') {
      return json({ 
        success: false, 
        error: 'Admin access required' 
      }, { status: 403 });
    }

    const format = url.searchParams.get('format') || 'json';

    // Get all table names
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();

    const exportData = {
      exportDate: new Date().toISOString(),
      database: dev ? 'dev.db' : 'prod.db',
      environment: dev ? 'development' : 'production',
      version: '1.0',
      data: {}
    };

    // Export each table
    for (const table of tables) {
      const tableName = table.name;
      try {
        const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
        exportData.data[tableName] = rows;
      } catch (error) {
        console.error(`Error exporting ${tableName}:`, error.message);
        exportData.data[tableName] = { error: error.message };
      }
    }

    if (format === 'json') {
      // Return as JSON file download
      const filename = `backup-${Date.now()}.json`;
      
      return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`,
        }
      });
    } else {
      // Return summary info
      const summary = {
        exportDate: exportData.exportDate,
        database: exportData.database,
        environment: exportData.environment,
        tables: Object.keys(exportData.data).map(tableName => ({
          name: tableName,
          recordCount: Array.isArray(exportData.data[tableName]) 
            ? exportData.data[tableName].length 
            : 0
        }))
      };

      return json({
        success: true,
        summary
      });
    }

  } catch (error) {
    console.error('Backup error:', error);
    
    return json({ 
      success: false, 
      error: error.message || 'Failed to create backup' 
    }, { status: 500 });
  }
}
