// export-sql.js - Export SQLite database to SQL dump
import Database from 'better-sqlite3';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const dbFile = process.argv[2] || 'prod.db';
const outputFile = process.argv[3] || `backup-${Date.now()}.sql`;

console.log(`📦 Exporting ${dbFile} to SQL dump...`);

async function exportSQL() {
  try {
    // Check if sqlite3 command is available
    try {
      await execAsync('sqlite3 --version');
    } catch {
      console.error('❌ sqlite3 command not found!');
      console.log('\n💡 Install it with:');
      console.log('  - macOS: brew install sqlite3');
      console.log('  - Linux: sudo apt-get install sqlite3');
      console.log('  - Windows: Download from https://www.sqlite.org/download.html');
      process.exit(1);
    }

    // Export using sqlite3 .dump command
    const command = `sqlite3 ${dbFile} .dump > ${outputFile}`;
    console.log(`⏳ Running: ${command}`);
    
    await execAsync(command);
    
    const stats = fs.statSync(outputFile);
    console.log(`\n✅ Export complete!`);
    console.log(`📄 File: ${outputFile}`);
    console.log(`📊 Size: ${(stats.size / 1024).toFixed(2)} KB`);
    
    // Show first few lines
    const content = fs.readFileSync(outputFile, 'utf8');
    const lines = content.split('\n').slice(0, 10);
    console.log(`\n📋 Preview (first 10 lines):`);
    lines.forEach(line => console.log(`  ${line}`));
    
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
  }
}

exportSQL();
