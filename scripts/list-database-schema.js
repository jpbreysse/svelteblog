// Script to list all tables and columns in the database
import Database from 'better-sqlite3';

const db = new Database('dev.db');

console.log('Database Schema Overview\n');
console.log('========================\n');

// Get all tables
const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' 
  ORDER BY name
`).all();

console.log(`Found ${tables.length} tables:\n`);

tables.forEach((table, index) => {
  console.log(`${index + 1}. ${table.name}`);
  console.log('   ' + '='.repeat(table.name.length));
  
  // Get columns for this table
  const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
  
  console.log('   Columns:');
  columns.forEach(col => {
    const nullable = col.notnull === 0 ? 'NULL' : 'NOT NULL';
    const pk = col.pk > 0 ? ' PRIMARY KEY' : '';
    const defVal = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
    
    console.log(`   - ${col.name.padEnd(20)} ${col.type.padEnd(15)} ${nullable}${pk}${defVal}`);
  });
  
  // Get row count
  try {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
    console.log(`   Rows: ${count.count}`);
  } catch (e) {
    console.log(`   Rows: Error counting`);
  }
  
  console.log('');
});

// Get indexes
console.log('Indexes:');
console.log('========\n');

const indexes = db.prepare(`
  SELECT name, tbl_name 
  FROM sqlite_master 
  WHERE type='index' AND name NOT LIKE 'sqlite_%'
  ORDER BY tbl_name, name
`).all();

if (indexes.length > 0) {
  let currentTable = '';
  indexes.forEach(idx => {
    if (idx.tbl_name !== currentTable) {
      currentTable = idx.tbl_name;
      console.log(`\n${currentTable}:`);
    }
    console.log(`  - ${idx.name}`);
  });
} else {
  console.log('No custom indexes found.');
}

console.log('\n');

db.close();

console.log('Schema listing complete!');