// Script to check and fix path levels in the database
// Script to check and fix path levels in the database
import Database from 'better-sqlite3';

const db = new Database('dev.db');

console.log('Checking path levels in database...\n');

// Get all paths
const paths = db.prepare(`
  SELECT id, name, parent_id, level, full_path
  FROM paths 
  ORDER BY full_path
`).all();

if (paths.length === 0) {
  console.log('No paths found in database.');
  db.close();
  process.exit(0);
}

console.log('Current paths in database:');
console.log('ID | Level | Parent | Name | Full Path');
console.log('---|-------|--------|------|----------');

let hasIssues = false;

paths.forEach(path => {
  // Calculate what the level should be
  let expectedLevel = 1;
  if (path.parent_id) {
    const parent = paths.find(p => p.id === path.parent_id);
    if (parent) {
      expectedLevel = parent.level + 1;
    }
  }
  
  const levelMatch = path.level === expectedLevel ? 'OK ' : 'BAD';
  if (path.level !== expectedLevel) {
    hasIssues = true;
  }
  
  const indent = '  '.repeat(path.level - 1);
  console.log(`${path.id.toString().padEnd(2)} | ${path.level} ${levelMatch} | ${(path.parent_id || 'null').toString().padEnd(6)} | ${indent}${path.name} | ${path.full_path || 'null'}`);
});

console.log('\n');

if (hasIssues) {
  console.log('WARNING: ISSUES FOUND! Some paths have incorrect level values.');
  console.log('');
  console.log('Fixing path levels...');
  
  // Function to recursively fix levels
  function fixLevels(parentId = null, expectedLevel = 1) {
    const children = paths.filter(p => p.parent_id === parentId);
    
    children.forEach(child => {
      if (child.level !== expectedLevel) {
        console.log(`   Updating ${child.name}: level ${child.level} -> ${expectedLevel}`);
        db.prepare('UPDATE paths SET level = ? WHERE id = ?').run(expectedLevel, child.id);
      }
      
      // Recursively fix children
      fixLevels(child.id, expectedLevel + 1);
    });
  }
  
  // Start fixing from root level
  fixLevels(null, 1);
  
  console.log('\nSUCCESS: Path levels have been fixed!');
  console.log('\nUpdated paths:');
  
  // Show updated paths
  const updatedPaths = db.prepare(`
    SELECT id, name, parent_id, level, full_path
    FROM paths 
    ORDER BY full_path
  `).all();
  
  console.log('ID | Level | Parent | Name | Full Path');
  console.log('---|-------|--------|------|----------');
  
  updatedPaths.forEach(path => {
    const indent = '  '.repeat(path.level - 1);
    console.log(`${path.id.toString().padEnd(2)} | ${path.level}     | ${(path.parent_id || 'null').toString().padEnd(6)} | ${indent}${path.name} | ${path.full_path || 'null'}`);
  });
  
} else {
  console.log('SUCCESS: All path levels are correct!');
}

db.close();

console.log('\nCheck complete!');