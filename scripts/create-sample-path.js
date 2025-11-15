import Database from 'better-sqlite3';
import fs from 'fs';

const dbFile = fs.existsSync('dev.db') ? 'dev.db' : 'prod.db';
const db = new Database(dbFile);
db.pragma('foreign_keys = ON');

console.log(`📦 Using database: ${dbFile}`);
console.log('🔨 Creating sample path hierarchy...\n');

// Helper function
function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
}

function buildFullPath(slug, parentPath = null) {
  return parentPath ? `${parentPath}/${slug}` : `/${slug}`;
}

try {
  // Get the Technical path
  const technicalPath = db.prepare('SELECT * FROM paths WHERE full_path = ?').get('/technical');
  console.log(`Found Technical path: ID ${technicalPath.id}`);

  // Create Backend subfolder
  const backendSlug = generateSlug('Backend Development');
  const backendFullPath = buildFullPath(backendSlug, technicalPath.full_path);
  
  const backend = db.prepare(`
    INSERT INTO paths (name, slug, description, parent_id, level, full_path, icon, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Backend Development',
    backendSlug,
    'Server-side programming and APIs',
    technicalPath.id,
    2,
    backendFullPath,
    '⚙️',
    '#8b5cf6'
  );
  console.log(`✅ Created: ${backendFullPath} (ID: ${backend.lastInsertRowid})`);

  // Create Python subfolder under Backend
  const pythonSlug = generateSlug('Python');
  const pythonFullPath = buildFullPath(pythonSlug, backendFullPath);
  
  const python = db.prepare(`
    INSERT INTO paths (name, slug, description, parent_id, level, full_path, icon, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Python',
    pythonSlug,
    'Python programming language',
    backend.lastInsertRowid,
    3,
    pythonFullPath,
    '🐍',
    '#3776ab'
  );
  console.log(`✅ Created: ${pythonFullPath} (ID: ${python.lastInsertRowid})`);

  // Create Frontend subfolder
  const frontendSlug = generateSlug('Frontend Development');
  const frontendFullPath = buildFullPath(frontendSlug, technicalPath.full_path);
  
  const frontend = db.prepare(`
    INSERT INTO paths (name, slug, description, parent_id, level, full_path, icon, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Frontend Development',
    frontendSlug,
    'Client-side programming and UI',
    technicalPath.id,
    2,
    frontendFullPath,
    '🎨',
    '#06b6d4'
  );
  console.log(`✅ Created: ${frontendFullPath} (ID: ${frontend.lastInsertRowid})`);

  // Show all paths
  console.log('\n🌳 Current Path Structure:');
  const allPaths = db.prepare(`
    SELECT id, name, full_path, level
    FROM paths
    ORDER BY full_path ASC
  `).all();

  allPaths.forEach(path => {
    const indent = '  '.repeat(path.level - 1);
    console.log(`${indent}└─ ${path.name} (${path.full_path})`);
  });

  console.log('\n✨ Sample paths created successfully!');

} catch (error) {
  console.error('❌ Error:', error.message);
} finally {
  db.close();
}