import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testConnection() {
  try {
    console.log('Testing PostgreSQL connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Connection successful!');
    console.log('Current timestamp:', result.rows[0].now);
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed:');
    console.error(error.message);
    process.exit(1);
  }
}

testConnection();