// scripts/check-auth.jsimport Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Use the same JWT secret as your app
const JWT_SECRET = 'consistent-development-jwt-secret-key-123456789'; // Use your actual secret

console.log('🔑 JWT Token Checker');
console.log('==================');

// Method 1: Check a specific token
function checkSpecificToken() {
  // PASTE YOUR TOKEN HERE (copy from browser cookies)
  const testToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwNTE1MzIwMCwiZXhwIjoxNzA1NzU4MDAwfQ.example-signature";
  
  if (!testToken || testToken === "paste-your-token-here") {
    console.log('❌ Please paste a real token in the script');
    return;
  }
  
  try {
    // Verify the token
    const payload = jwt.verify(testToken, JWT_SECRET);
    
    console.log('✅ Token is VALID');
    console.log('📋 Token contents:');
    console.log('   - User ID:', payload.id);
    console.log('   - Email:', payload.email);
    console.log('   - Role:', payload.role);
    console.log('   - Issued at:', new Date(payload.iat * 1000).toLocaleString());
    console.log('   - Expires at:', new Date(payload.exp * 1000).toLocaleString());
    
    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      console.log('⚠️  Token is EXPIRED');
    } else {
      console.log('✅ Token is still valid');
    }
    
    // Check if user exists in database
    const dbPath = path.join(projectRoot, 'dev.db');
    const db = new Database(dbPath);
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND status = "approved"').get(payload.id);
    
    if (user) {
      console.log('✅ User exists in database and is approved');
      console.log('👤 User details:');
      console.log('   - Name:', user.first_name, user.last_name);
      console.log('   - Status:', user.status);
      console.log('   - Role:', user.role);
    } else {
      console.log('❌ User not found or not approved in database');
    }
    
    db.close();
    
  } catch (error) {
    console.log('❌ Token is INVALID');
    console.log('💥 Error:', error.message);
    
    if (error.message.includes('expired')) {
      console.log('🕒 Token has expired - user needs to login again');
    } else if (error.message.includes('signature')) {
      console.log('🔐 Token signature invalid - wrong secret key or corrupted token');
    } else {
      console.log('🔧 Token format is invalid');
    }
  }
}

// Method 2: Interactive token checker
function interactiveCheck() {
  import('readline').then(readline => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\n🔍 Interactive Token Checker');
    console.log('Copy your auth_token from browser cookies and paste it here:');
    console.log('(To get token: F12 → Application → Cookies → auth_token value)\n');
    
    rl.question('Paste token: ', (token) => {
      if (!token.trim()) {
        console.log('❌ No token provided');
        rl.close();
        return;
      }
      
      try {
        const payload = jwt.verify(token.trim(), JWT_SECRET);
        
        console.log('\n✅ Token is VALID');
        console.log('📋 Token payload:', JSON.stringify(payload, null, 2));
        
        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        const timeLeft = payload.exp - now;
        
        if (timeLeft > 0) {
          const daysLeft = Math.floor(timeLeft / 86400);
          const hoursLeft = Math.floor((timeLeft % 86400) / 3600);
          console.log(`⏰ Token expires in: ${daysLeft} days, ${hoursLeft} hours`);
        } else {
          console.log('⚠️  Token EXPIRED');
        }
        
      } catch (error) {
        console.log('\n❌ Token is INVALID');
        console.log('💥 Reason:', error.message);
      }
      
      rl.close();
    });
  });
}

// Method 3: Check current browser cookies (if you can access them)
function checkBrowserCookies() {
  console.log('\n🍪 Browser Cookie Instructions:');
  console.log('1. Open your app in browser');
  console.log('2. Press F12 → Application tab → Cookies');
  console.log('3. Look for "auth_token" cookie');
  console.log('4. Copy the value and run this script again');
  console.log('\nOr open browser console and run:');
  console.log('  document.cookie.split(";").find(c => c.includes("auth_token"))');
}

// Main execution
console.log('Choose an option:');
console.log('1. Check hardcoded token (edit script first)');
console.log('2. Interactive token check');
console.log('3. Show browser cookie instructions');

const option = process.argv[2];

switch(option) {
  case '1':
    checkSpecificToken();
    break;
  case '2':
    interactiveCheck();
    break;
  case '3':
    checkBrowserCookies();
    break;
  default:
    console.log('\nUsage:');
    console.log('  node scripts/check-auth.js 1    # Check hardcoded token');
    console.log('  node scripts/check-auth.js 2    # Interactive check');
    console.log('  node scripts/check-auth.js 3    # Show instructions');
    console.log('\nOr just run: node scripts/check-auth.js 2');
}