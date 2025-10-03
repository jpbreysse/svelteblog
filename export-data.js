// export-data.js - Export SQLite database to JSON
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Choose which database to export
const dbFile = process.argv[2] || 'prod.db';
const outputFile = process.argv[3] || `backup-${Date.now()}.json`;

console.log(`📦 Exporting data from ${dbFile}...`);

try {
  const db = new Database(dbFile);
  
  const exportData = {
    exportDate: new Date().toISOString(),
    database: dbFile,
    data: {}
  };

  // Get all table names
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  console.log(`📋 Found ${tables.length} tables to export`);

  // Export each table
  for (const table of tables) {
    const tableName = table.name;
    console.log(`  ↳ Exporting ${tableName}...`);
    
    try {
      const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
      exportData.data[tableName] = rows;
      console.log(`    ✅ Exported ${rows.length} rows from ${tableName}`);
    } catch (error) {
      console.error(`    ❌ Error exporting ${tableName}:`, error.message);
      exportData.data[tableName] = { error: error.message };
    }
  }

  // Write to file
  fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2));
  
  console.log(`\n✅ Export complete!`);
  console.log(`📄 File: ${outputFile}`);
  console.log(`📊 Size: ${(fs.statSync(outputFile).size / 1024).toFixed(2)} KB`);
  
  // Show summary
  console.log(`\n📈 Summary:`);
  Object.keys(exportData.data).forEach(tableName => {
    const count = Array.isArray(exportData.data[tableName]) 
      ? exportData.data[tableName].length 
      : 'error';
    console.log(`  - ${tableName}: ${count} records`);
  });

  db.close();
  
} catch (error) {
  console.error('❌ Export failed:', error.message);
  process.exit(1);
}
