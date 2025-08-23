import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the project root directory (one level up from scripts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const dbPath = path.join(projectRoot, 'dev.db');

console.log('🗑️  Resetting database...');
console.log('📍 Database path:', dbPath);

// Remove existing database
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('📄 Removed old database file');
}

// Create new database in the correct location
const db = new Database(dbPath);

// Create table
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    approved_by INTEGER,
    FOREIGN KEY (approved_by) REFERENCES users(id)
  )
`);

// Create admin user
const hashedPassword = await bcrypt.hash('admin123', 10);
db.prepare(`
  INSERT INTO users (email, first_name, last_name, password_hash, status, role)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('admin@example.com', 'Admin', 'User', hashedPassword, 'approved', 'admin');

console.log('✅ Database reset complete!');
console.log('👑 Admin user: admin@example.com / admin123');
console.log('📍 Database created at:', dbPath);

db.close();