import { hashPassword } from './src/lib/auth.js';

async function generateHash() {
  const password = 'oracle';
  const hash = await hashPassword(password);
  console.log('Password hash for "oracle":');
  console.log(hash);
  process.exit(0);
}

generateHash();
