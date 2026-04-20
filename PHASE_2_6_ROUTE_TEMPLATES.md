# Phase 2.6: Route Migration - Specific Templates

## 📄 Route-Specific Migration Templates

### 1. Authentication Routes

#### register/+page.server.js

**Key changes:**
- Remove SQLite database checks (PRAGMA, etc.)
- Use `userDB` for user creation (once we add the method)
- Use PostgreSQL connection for registration
- Handle async/await properly

**Template:**
```javascript
import { fail, redirect } from '@sveltejs/kit';
import { pool } from '$lib/db.js';
import { hashPassword, validateEmail } from '$lib/auth.js';

export async function load({ locals }) {
  return { user: locals.user || null };
}

export const actions = {
  default: async ({ request }) => {
    try {
      const data = await request.formData();
      const email = data.get('email')?.trim().toLowerCase();
      const displayName = data.get('display_name')?.trim();
      const password = data.get('password');
      const confirmPassword = data.get('confirm_password');

      // Validate inputs
      const errors = {};
      if (!email || !validateEmail(email)) {
        errors.email = 'Invalid email address';
      }
      if (!displayName || displayName.length < 2) {
        errors.displayName = 'Display name must be at least 2 characters';
      }
      if (!password || password.length < 6) {
        errors.password = 'Password must be at least 6 characters';
      }
      if (password !== confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }

      if (Object.keys(errors).length > 0) {
        return fail(400, { errors });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user in database
      try {
        const result = await pool.query(
          `INSERT INTO users (email, display_name, password_hash, status, role) 
           VALUES ($1, $2, $3, $4, $5) 
           RETURNING id`,
          [email, displayName, passwordHash, 'pending', 'user']
        );

        console.log('✅ User registered:', result.rows[0].id);
        throw redirect(303, '/register/success');
      } catch (dbError) {
        // Handle unique constraint violation
        if (dbError.code === '23505') {  // PostgreSQL unique violation
          return fail(400, { 
            errors: { email: 'Email already registered' } 
          });
        }
        throw dbError;
      }
    } catch (error) {
      if (error.status === 303) throw error;
      console.error('Registration error:', error);
      return fail(500, { error: 'Registration failed' });
    }
  }
};
```

---

#### login/+page.server.js

**Key changes:**
- Use `userDB.getUserById()` with email lookup
- Use `userDB.verifyPassword()` for password verification
- Handle async authentication flow

**Template:**
```javascript
import { fail, redirect } from '@sveltejs/kit';
import { pool } from '$lib/db.js';
import { userDB } from '$lib/db.js';

export async function load({ locals }) {
  if (locals.user) {
    throw redirect(303, '/dashboard');
  }
  return {};
}

export const actions = {
  default: async ({ request, cookies }) => {
    try {
      const data = await request.formData();
      const email = data.get('email')?.trim().toLowerCase();
      const password = data.get('password');

      if (!email || !password) {
        return fail(400, { error: 'Email and password required' });
      }

      // Get user by email
      const userResult = await pool.query(
        'SELECT id, email, password_hash, role, status FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        return fail(401, { error: 'Invalid credentials' });
      }

      const user = userResult.rows[0];

      // Check if user is approved
      if (user.status !== 'approved') {
        return fail(403, { 
          error: `Account ${user.status}. Please contact support.` 
        });
      }

      // Verify password
      const isValid = await userDB.verifyPassword(user.id, password);
      if (!isValid) {
        return fail(401, { error: 'Invalid credentials' });
      }

      // Set session/cookie
      // TODO: Implement session management
      
      throw redirect(303, '/dashboard');
    } catch (error) {
      if (error.status === 303) throw error;
      console.error('Login error:', error);
      return fail(500, { error: 'Login failed' });
    }
  }
};
```

---

### 2. Blog Routes

#### blog/+page.server.js

**Key changes:**
- Use `blogDB.getAllPosts()` instead of `db.prepare().all()`
- Handle async loading
- Use `blogDB.getCategories()` for filtering

**Template:**
```javascript
import { blogDB } from '$lib/db.js';

export async function load({ url }) {
  try {
    const category = url.searchParams.get('category');
    const search = url.searchParams.get('search');

    let posts;

    if (search) {
      // Search posts
      posts = await blogDB.searchPosts(search, category || null);
    } else if (category) {
      // Filter by category
      posts = await blogDB.getPostsByCategory(category);
    } else {
      // Get all posts
      posts = await blogDB.getAllPosts();
    }

    // Get categories for sidebar
    const categories = await blogDB.getCategories();
    
    // Get stats
    const stats = await blogDB.getStats();

    return {
      posts: posts || [],
      categories: categories || [],
      stats,
      currentCategory: category,
      searchQuery: search
    };
  } catch (error) {
    console.error('Error loading blog:', error);
    return {
      posts: [],
      categories: [],
      error: 'Failed to load blog posts'
    };
  }
}
```

---

#### blog/[slug]/+page.server.js

**Key changes:**
- Use `blogDB.getPostBySlug()` for fetching
- Use `userDB` methods for comment/report functionality
- Handle missing posts gracefully

**Template:**
```javascript
import { blogDB, userDB } from '$lib/db.js';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
  try {
    const post = await blogDB.getPostBySlug(params.slug);

    if (!post) {
      throw error(404, 'Post not found');
    }

    return { post };
  } catch (err) {
    if (err.status === 404) throw err;
    console.error('Error loading post:', err);
    throw error(500, 'Failed to load post');
  }
}

export const actions = {
  report: async ({ request }) => {
    try {
      const data = await request.formData();
      
      const reportData = {
        issue_type: data.get('issue_type'),
        description: data.get('description'),
        reporter_email: data.get('reporter_email'),
        post_id: parseInt(data.get('post_id')),
        post_title: data.get('post_title'),
        post_url: data.get('post_url'),
        reporter_ip: request.headers.get('x-forwarded-for') || 'unknown',
        user_agent: request.headers.get('user-agent') || 'unknown'
      };

      const result = await userDB.createContentReport(reportData);
      
      return { success: true, message: 'Report submitted successfully' };
    } catch (err) {
      console.error('Report error:', err);
      return { 
        success: false, 
        error: 'Failed to submit report' 
      };
    }
  }
};
```

---

### 3. User Profile Route

#### profile/+page.server.js

**Key changes:**
- Use `userDB.getUserById()` for fetching user data
- Use `userDB.changePassword()` for password updates
- Use `userDB.verifyPassword()` for verification
- Use `blogDB.getPostsByUser()` for user's posts

**Template:**
```javascript
import { fail, redirect } from '@sveltejs/kit';
import { userDB, blogDB } from '$lib/db.js';

export async function load({ locals }) {
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  try {
    const user = await userDB.getUserById(locals.user.id);
    const userPosts = await blogDB.getPostsByUser(locals.user.id);

    return {
      user,
      userPosts: userPosts || []
    };
  } catch (error) {
    console.error('Error loading profile:', error);
    return {
      user: locals.user,
      userPosts: [],
      error: 'Failed to load profile'
    };
  }
}

export const actions = {
  changePassword: async ({ request, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'Not authenticated' });
    }

    try {
      const data = await request.formData();
      const currentPassword = data.get('current_password');
      const newPassword = data.get('new_password');
      const confirmPassword = data.get('confirm_password');

      if (newPassword !== confirmPassword) {
        return fail(400, { error: 'Passwords do not match' });
      }

      if (newPassword.length < 6) {
        return fail(400, { error: 'Password must be at least 6 characters' });
      }

      const result = await userDB.changePassword(
        locals.user.id,
        currentPassword,
        newPassword
      );

      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      if (error.message === 'Current password is incorrect') {
        return fail(401, { error: error.message });
      }
      console.error('Password change error:', error);
      return fail(500, { error: 'Failed to change password' });
    }
  },

  deleteAccount: async ({ request, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'Not authenticated' });
    }

    try {
      const data = await request.formData();
      const reason = data.get('deletion_reason') || '';

      const result = await userDB.completeAccountDeletion(
        locals.user.id,
        reason
      );

      throw redirect(303, '/goodbye');
    } catch (error) {
      if (error.status === 303) throw error;
      console.error('Account deletion error:', error);
      return fail(500, { error: 'Failed to delete account' });
    }
  }
};
```

---

### 4. Admin Routes

#### admin/+page.server.js

**Key changes:**
- Use `blogDB.getStats()` for statistics
- Use `userDB.getAllContentReports()` for reports
- Check admin authorization

**Template:**
```javascript
import { redirect, fail } from '@sveltejs/kit';
import { blogDB, userDB } from '$lib/db.js';

export async function load({ locals }) {
  // Check if user is admin
  if (!locals.user || locals.user.role !== 'admin') {
    throw redirect(303, '/');
  }

  try {
    const stats = await blogDB.getStats();
    const pendingReports = await userDB.getAllContentReports();
    const pendingDeletions = await userDB.getPendingDeletions();

    return {
      stats,
      pendingReports: pendingReports.filter(r => r.status === 'pending'),
      pendingDeletions: pendingDeletions || []
    };
  } catch (error) {
    console.error('Error loading admin dashboard:', error);
    return {
      stats: null,
      pendingReports: [],
      pendingDeletions: [],
      error: 'Failed to load dashboard'
    };
  }
}
```

---

#### admin/posts/+page.server.js

**Key changes:**
- Use `blogDB` methods for post management
- Use `blogDB.getPostsByUser()` for filtering
- Handle async delete/update operations

**Template:**
```javascript
import { redirect, fail } from '@sveltejs/kit';
import { blogDB, pathsDB } from '$lib/db.js';

export async function load({ locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    throw redirect(303, '/');
  }

  try {
    const allPosts = await blogDB.getAllPosts();
    const categories = await blogDB.getCategories();
    const paths = await pathsDB.getAllPaths();

    return {
      posts: allPosts || [],
      categories,
      paths
    };
  } catch (error) {
    console.error('Error loading posts:', error);
    return { posts: [], categories: [], paths: [], error: error.message };
  }
}

export const actions = {
  delete: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') {
      return fail(403, { error: 'Not authorized' });
    }

    try {
      const data = await request.formData();
      const postId = parseInt(data.get('post_id'));
      
      // Admin can delete any post
      await blogDB.deletePost(postId, locals.user.id);
      
      return { success: true };
    } catch (error) {
      console.error('Delete error:', error);
      return fail(400, { error: error.message });
    }
  },

  update: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') {
      return fail(403, { error: 'Not authorized' });
    }

    try {
      const data = await request.formData();
      const postId = parseInt(data.get('post_id'));
      
      const postData = {
        title: data.get('title'),
        content: data.get('content'),
        category: data.get('category'),
        path_id: data.get('path_id') ? parseInt(data.get('path_id')) : null
      };

      await blogDB.updatePost(postId, postData, locals.user.id);
      
      return { success: true };
    } catch (error) {
      console.error('Update error:', error);
      return fail(400, { error: error.message });
    }
  }
};
```

---

#### admin/reports/+page.server.js

**Key changes:**
- Use `userDB.getAllContentReports()` for listing
- Use `userDB.updateContentReportStatus()` for updating
- Handle admin actions

**Template:**
```javascript
import { redirect, fail } from '@sveltejs/kit';
import { userDB } from '$lib/db.js';

export async function load({ locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    throw redirect(303, '/');
  }

  try {
    const reports = await userDB.getAllContentReports();

    return {
      reports: reports || [],
      pending: reports?.filter(r => r.status === 'pending') || [],
      reviewed: reports?.filter(r => r.status === 'reviewed') || []
    };
  } catch (error) {
    console.error('Error loading reports:', error);
    return {
      reports: [],
      pending: [],
      reviewed: [],
      error: error.message
    };
  }
}

export const actions = {
  updateStatus: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') {
      return fail(403, { error: 'Not authorized' });
    }

    try {
      const data = await request.formData();
      const reportId = parseInt(data.get('report_id'));
      const status = data.get('status');
      const response = data.get('admin_response');

      await userDB.updateContentReportStatus(
        reportId,
        status,
        response,
        locals.user.id
      );

      return { success: true };
    } catch (error) {
      console.error('Update error:', error);
      return fail(400, { error: error.message });
    }
  }
};
```

---

## ✅ Migration Verification Checklist

For each route file, verify:

### Imports
- [ ] Removed `import { db } from '$lib/db.js'`
- [ ] Added `import { userDB } from '$lib/db.js'` (if using user functions)
- [ ] Added `import { blogDB } from '$lib/db.js'` (if using blog functions)
- [ ] Added `import { pathsDB } from '$lib/db.js'` (if using path functions)
- [ ] Added `import { pool } from '$lib/db.js'` (only if custom queries needed)

### Database Calls
- [ ] No `db.prepare()` calls remaining
- [ ] No raw SQL queries (except in specific templates)
- [ ] All database calls use `await`
- [ ] All database calls use method calls (not `.get()`, `.all()`, `.run()`)

### Authorization
- [ ] Admin routes check `locals.user.role === 'admin'`
- [ ] User routes check `locals.user` exists
- [ ] Authorization checks before database operations
- [ ] User ID passed to database methods when needed

### Error Handling
- [ ] Try/catch blocks around database operations
- [ ] Redirect exceptions re-thrown (if used)
- [ ] Errors logged to console
- [ ] User-friendly error messages returned

### Response Handling
- [ ] No `.lastInsertRowid` usage
- [ ] No `.changes` property usage
- [ ] Response objects properly structured
- [ ] Data passed to templates matches expected format

---

## 🎯 Summary

**Before Migration:**
- Routes contain raw SQL
- Synchronous database calls
- Error handling at route level
- Authorization mixed with SQL

**After Migration:**
- Routes use database methods
- Asynchronous database calls (async/await)
- Business logic in database layer
- Clean separation of concerns

Ready to start migrating? 🚀
