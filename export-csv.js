// export-csv.js - Export SQLite tables to CSV files
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbFile = process.argv[2] || 'prod.db';
const outputDir = process.argv[3] || `backup-csv-${Date.now()}`;

console.log(`📦 Exporting ${dbFile} to CSV files...`);

try {
  const db = new Database(dbFile);
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log(`📁 Output directory: ${outputDir}`);

  // Get all table names
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  console.log(`📋 Found ${tables.length} tables to export\n`);

  // Export each table to CSV
  for (const table of tables) {
    const tableName = table.name;
    console.log(`  ↳ Exporting ${tableName}...`);
    
    try {
      const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
      
      if (rows.length === 0) {
        console.log(`    ⚠️  Table is empty, skipping`);
        continue;
      }
      
      // Get column names
      const columns = Object.keys(rows[0]);
      
      // Create CSV content
      let csv = columns.join(',') + '\n';
      
      for (const row of rows) {
        const values = columns.map(col => {
          let value = row[col];
          
          // Handle null/undefined
          if (value === null || value === undefined) {
            return '';
          }
          
          // Convert to string
          value = String(value);
          
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            value = '"' + value.replace(/"/g, '""') + '"';
          }
          
          return value;
        });
        
        csv += values.join(',') + '\n';
      }
      
      // Write to file
      const outputFile = path.join(outputDir, `${tableName}.csv`);
      fs.writeFileSync(outputFile, csv);
      
      console.log(`    ✅ Exported ${rows.length} rows (${columns.length} columns)`);
      
    } catch (error) {
      console.error(`    ❌ Error exporting ${tableName}:`, error.message);
    }
  }

  db.close();
  
  console.log(`\n✅ Export complete!`);
  console.log(`📁 Files saved to: ${outputDir}/`);
  
  // List created files
  const files = fs.readdirSync(outputDir);
  console.log(`\n📄 Created ${files.length} CSV files:`);
  files.forEach(file => {
    const stats = fs.statSync(path.join(outputDir, file));
    console.log(`  - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
  });
  
} catch (error) {
  console.error('❌ Export failed:', error.message);
  process.exit(1);
}
