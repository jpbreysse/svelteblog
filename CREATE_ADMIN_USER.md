# Creating Admin User for PostgreSQL

## Quick Option 1: Direct SQL Command (Easiest)

### Step 1: Generate a Password Hash

Use Node.js to create a bcrypt hash:

```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your_password_here', 10).then(hash => console.log(hash));"
```

**Example:**
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('admin123', 10).then(hash => console.log(hash));"
```

This will output something like:
```
$2b$10$abcdefghijklmnopqrstuvwxyz1234567890...
```

Copy that entire hash - you'll use it in the next step.

### Step 2: Create Admin User in Database

```bash
docker exec -it postgres-pgvector psql -U supportuser -d support_system
```

Then paste this SQL command (replace `PASTE_HASH_HERE` with the hash you copied):

```sql
INSERT INTO users (email, display_name, password_hash, role, status, created_at)
VALUES (
  'admin@example.com',
  'Administrator',
  'PASTE_HASH_HERE',
  'admin',
  'approved',
  NOW()
);
```

**Full example:**
```sql
INSERT INTO users (email, display_name, password_hash, role, status, created_at)
VALUES (
  'admin@example.com',
  'Administrator',
  '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890...',
  'admin',
  'approved',
  NOW()
);
```

### Step 3: Verify It Worked

```sql
SELECT id, email, role, status FROM users WHERE role = 'admin';
```

You should see your admin user listed.

### Step 4: Exit psql

```sql
\q
```

---

## Option 2: Automatic Script (Better)

Create a file called `create-admin.js` in your project root:

```javascript
import pg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function createAdmin() {
  const email = 'admin@example.com';
  const displayName = 'Administrator';
  const password = 'admin123';  // CHANGE THIS!

  try {
    // Hash password
    console.log('🔐 Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);

    // Check if admin already exists
    const existingAdmin = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingAdmin.rows.length > 0) {
      console.log('⚠️ Admin user already exists!');
      process.exit(0);
    }

    // Create admin user
    console.log('👤 Creating admin user...');
    const result = await pool.query(`
      INSERT INTO users (email, display_name, password_hash, role, status, created_at)
      VALUES ($1, $2, $3, 'admin', 'approved', NOW())
      RETURNING id, email, role
    `, [email, displayName, passwordHash]);

    console.log('✅ Admin user created successfully!');
    console.log('📋 Details:');
    console.log(`   Email: ${result.rows[0].email}`);
    console.log(`   Role: ${result.rows[0].role}`);
    console.log(`   ID: ${result.rows[0].id}`);
    console.log('\n🚀 You can now login at http://localhost:5173/login');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
}

createAdmin();
```

**Run it:**
```bash
node create-admin.js
```

---

## Option 3: Using Docker Direct Command (One-liner)

```bash
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "
INSERT INTO users (email, display_name, password_hash, role, status, created_at)
VALUES (
  'admin@example.com',
  'Administrator',
  '\$2b\$10\$abcdefghijklmnopqrstuvwxyz1234567890...',
  'admin',
  'approved',
  NOW()
);"
```

(Replace the hash with your own)

---

## Verify Admin User Was Created

```bash
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "SELECT id, email, role, status FROM users WHERE role = 'admin';"
```

Should show:
```
 id |      email       | role  | status
----+------------------+-------+---------
  1 | admin@example.com | admin | approved
```

---

## Login as Admin

1. Start dev server: `npm run dev`
2. Go to http://localhost:5173/login
3. Enter:
   - **Email:** admin@example.com
   - **Password:** (whatever you set - admin123 in example)
4. Expected: Redirect to `/admin` dashboard

---

## If Something Goes Wrong

### "User already exists"
```bash
# Delete the existing admin user first
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "DELETE FROM users WHERE email = 'admin@example.com';"

# Then create again
```

### Can't login
```bash
# Check user exists and is approved
docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "SELECT id, email, role, status FROM users WHERE email = 'admin@example.com';"

# Should show: status = 'approved', role = 'admin'
```

### Wrong password
```bash
# Reset admin password
# First, generate new hash (see step 1 above)
# Then run:
docker exec -it postgres-pgvector psql -U supportuser -d support_system
```

```sql
UPDATE users 
SET password_hash = 'PASTE_NEW_HASH_HERE'
WHERE email = 'admin@example.com';
```

---

## Security Notes

⚠️ **For Development Only:**
- The password `admin123` is just an example
- Change to something strong for production
- Don't commit passwords to git
- Use environment variables for admin credentials

✅ **Better Approach:**
```bash
# Use environment variable
ADMIN_PASSWORD=super_secure_password_here node create-admin.js
```

Then update `create-admin.js`:
```javascript
const password = process.env.ADMIN_PASSWORD || 'admin123';
```

---

## Complete Workflow

1. **Generate hash:**
   ```bash
   node -e "const bcrypt = require('bcrypt'); bcrypt.hash('your_strong_password', 10).then(hash => console.log(hash));"
   ```

2. **Create admin** (pick one method above)

3. **Verify created:**
   ```bash
   docker exec -it postgres-pgvector psql -U supportuser -d support_system -c "SELECT * FROM users WHERE role = 'admin';"
   ```

4. **Test login:**
   ```bash
   npm run dev
   # http://localhost:5173/login
   # Enter admin email and password
   # Should redirect to /admin
   ```

5. **Check admin routes work:**
   - Dashboard: http://localhost:5173/admin
   - Posts: http://localhost:5173/admin/posts (if exists)
   - Reports: http://localhost:5173/admin/reports (if exists)

---

## Admin User Template

Here's what gets created:

```javascript
{
  id: 1,                    // Auto-generated
  email: 'admin@example.com',
  display_name: 'Administrator',
  password_hash: '$2b$10$...',  // bcrypt hash
  role: 'admin',            // Important!
  status: 'approved',       // Must be approved to login
  created_at: '2025-01-15T10:30:00Z'
}
```

The important parts:
- `role = 'admin'` - Allows access to admin routes
- `status = 'approved'` - Required to login
- `password_hash` - bcrypt hash of password

---

Done! Your admin user is ready. 🎉
