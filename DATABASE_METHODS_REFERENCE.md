# PostgreSQL Async Database Methods - Quick Reference

## 🚀 Quick Start: How to Use

### Import
```javascript
import { userDB, blogDB, pathsDB } from '$lib/db.js';
```

### Basic Pattern
```javascript
export async function load() {
  // All database calls must use await
  const data = await blogDB.getAllPosts();
  return { data };
}

export const actions = {
  myAction: async ({ request, locals }) => {
    try {
      const result = await userDB.createUser({
        email: 'user@example.com',
        display_name: 'User Name',
        password_hash: 'hashed_password'
      });
      return { success: true };
    } catch (error) {
      return fail(500, { error: error.message });
    }
  }
};
```

---

## 👤 USER Database Methods

### getUserById(id)
```javascript
const user = await userDB.getUserById(123);
// Returns: { id, email, display_name, role, status, created_at } or null
```

### getUserByEmail(email)
```javascript
const user = await userDB.getUserByEmail('user@example.com');
// Returns: { id, email, display_name, password_hash, role, status, ... } or null
```

### createUser(userData)
```javascript
const result = await userDB.createUser({
  email: 'newuser@example.com',
  display_name: 'New User',
  password_hash: 'bcrypt_hashed_password',
  role: 'user'  // optional, defaults to 'user'
});
// Returns: { success: true, userId: 123, user: { ... } }
// Note: New users start with status = 'pending'
```

### verifyPassword(userId, currentPassword)
```javascript
const isValid = await userDB.verifyPassword(123, 'plaintext_password');
// Returns: boolean (true/false)
```

### changePassword(userId, currentPassword, newPassword)
```javascript
const result = await userDB.changePassword(123, 'old_password', 'new_password');
// Returns: { success: true, message: 'Password updated successfully' }
// Throws error if current password is wrong
```

### completeAccountDeletion(userId, reason)
```javascript
const result = await userDB.completeAccountDeletion(123, 'User requested');
// Returns: { success: true, message: '...', deletedPosts: 5 }
// Deletes user and all their posts in transaction
```

### getPendingDeletions()
```javascript
const deletions = await userDB.getPendingDeletions();
// Returns: [ { id, email, display_name, post_count, ... }, ... ]
```

### createContentReport(reportData)
```javascript
const result = await userDB.createContentReport({
  issue_type: 'inappropriate',
  description: 'This post violates guidelines',
  reporter_email: 'reporter@example.com',
  post_id: 456,
  post_title: 'Post Title',
  post_url: 'http://example.com/post',
  reporter_ip: '192.168.1.1',
  user_agent: 'Mozilla/5.0...'
});
// Returns: { success: true, reportId: 789 }
```

### getAllContentReports()
```javascript
const reports = await userDB.getAllContentReports();
// Returns: [ { id, issue_type, status, created_at, ... }, ... ]
// Ordered by status (pending first) then by created_at
```

### getContentReportById(reportId)
```javascript
const report = await userDB.getContentReportById(789);
// Returns: { id, issue_type, description, status, ... } or null
```

### updateContentReportStatus(reportId, status, adminResponse, resolvedBy)
```javascript
const result = await userDB.updateContentReportStatus(
  789,
  'resolved',
  'This has been addressed',
  123  // admin user ID
);
// Returns: { success: true }
// Status must be: 'pending' | 'reviewed' | 'resolved' | 'dismissed'
```

### resetUserPassword(adminId, userId, newPassword)
```javascript
const result = await userDB.resetUserPassword(
  admin_id,
  user_id,
  'new_password_plain_text'
);
// Returns: { success: true, userId, userEmail, displayName }
// Only admins can call this
```

---

## 📝 BLOG Database Methods

### getAllPosts()
```javascript
const posts = await blogDB.getAllPosts();
// Returns: [
//   {
//     id, title, content, excerpt, category, slug,
//     read_time, created_at, updated_at, published,
//     author_id, author_name, author_email,
//     tags: ['tag1', 'tag2'],
//     path: '/some/path'
//   },
//   ...
// ]
```

### getPostsByUser(userId)
```javascript
const posts = await blogDB.getPostsByUser(123);
// Returns: Same structure as getAllPosts but filtered by user
```

### getPostById(postId)
```javascript
const post = await blogDB.getPostById(456);
// Returns: { id, title, content, ... } or null
// Includes author, tags, and path info
```

### getPostBySlug(slug)
```javascript
const post = await blogDB.getPostBySlug('my-awesome-post');
// Returns: Same as getPostById or null
// Only returns published posts!
```

### createPost(postData, authorId)
```javascript
const result = await blogDB.createPost({
  title: 'My New Post',
  content: '<p>Post content</p>',
  category: 'thoughts',
  path_id: 789  // optional
}, 123);  // author ID
// Returns: { success: true, post: { id, title, slug, created_at } }
// Auto-generates: slug, read_time, excerpt
// Sets: published = true, author_id, created_at
```

### updatePost(postId, postData, authorId)
```javascript
const result = await blogDB.updatePost(
  456,
  {
    title: 'Updated Title',
    content: '<p>New content</p>',
    category: 'news',
    path_id: null
  },
  123  // must be post author
);
// Returns: { success: true, message: 'Post updated successfully' }
// Throws error if not author
```

### deletePost(postId, authorId)
```javascript
const result = await blogDB.deletePost(456, 123);  // must be author
// Returns: { success: true, message: 'Post deleted successfully' }
// Throws error if not author
// Cascade deletes tags via foreign key
```

### updatePostTags(postId, tagNames)
```javascript
const result = await blogDB.updatePostTags(456, ['javascript', 'webdev', 'tutorial']);
// Returns: { success: true, message: 'Post tagged with 3 tags' }
// Removes old tags first, then adds new ones
// Auto-creates tags if they don't exist
// Transactions ensure consistency
```

### searchPosts(query, category)
```javascript
const results = await blogDB.searchPosts('javascript', 'tech');
// Returns: [ { id, title, excerpt, ... }, ... ]
// Searches in: title, content, excerpt
// category is optional
// Only searches published posts
```

### getPostsByCategory(category)
```javascript
const posts = await blogDB.getPostsByCategory('tech');
// Returns: [ { id, title, ... }, ... ]
// Only published posts
```

### getCategories()
```javascript
const categories = await blogDB.getCategories();
// Returns: [ { category: 'tech', post_count: 5 }, { category: 'life', post_count: 3 }, ... ]
// Ordered alphabetically
```

### getTags()
```javascript
const tags = await blogDB.getTags();
// Returns: [ { id, name, usage_count: 5 }, ... ]
// Ordered by usage (most used first)
```

### getStats()
```javascript
const stats = await blogDB.getStats();
// Returns: {
//   published_posts: 10,
//   total_posts: 15,
//   total_users: 5,
//   total_tags: 12,
//   authors_count: 3,
//   pending_reports: 2
// }
```

---

## 🗂️ PATHS Database Methods (Hierarchical)

### getAllPaths()
```javascript
const paths = await pathsDB.getAllPaths();
// Returns: [
//   {
//     id, name, slug, description, parent_id, level, full_path,
//     icon, color, position, created_at,
//     created_by: 'Username',
//     children_count: 2,
//     post_count: 5
//   },
//   ...
// ]
// Ordered by level, then position
```

### getPathById(id)
```javascript
const path = await pathsDB.getPathById(123);
// Returns: { id, name, ... } or null
// Includes children_count and post_count
```

### getPathByFullPath(fullPath)
```javascript
const path = await pathsDB.getPathByFullPath('/category/subcategory');
// Returns: { id, name, ... } or null
// full_path is unique
```

### createPath(pathData, userId)
```javascript
const result = await pathsDB.createPath({
  name: 'Technology',
  slug: 'tech',
  description: 'Tech related posts',
  parent_id: null,  // optional
  icon: '💻',       // optional
  color: '#FF0000', // optional
  position: 1       // optional
}, 123);  // creator user ID
// Returns: { success: true, path: { id, name, slug, full_path, created_at } }
// Auto-calculates: level, full_path
// Enforces: max depth = 5
```

### updatePath(id, pathData)
```javascript
const result = await pathsDB.updatePath(123, {
  name: 'Tech & Science',
  description: 'Tech and science content',
  icon: '🚀',
  color: '#00FF00',
  position: 2
});
// Returns: { success: true, message: 'Path updated successfully' }
// Cannot update: parent_id, level, full_path (read-only)
```

### deletePath(id)
```javascript
const result = await pathsDB.deletePath(123);
// Returns: { success: true, deletedCount: 3, message: 'Deleted 3 path(s)' }
// Deletes path and all descendants
// Uses recursive CTE to count before delete
// Cascade deletes posts associated with paths
```

### getPathChildren(parentId)
```javascript
const children = await pathsDB.getPathChildren(123);
// Returns: [ { id, name, slug, children_count, post_count, ... }, ... ]
// Only direct children, not grandchildren
```

### getPathParent(id)
```javascript
const parent = await pathsDB.getParentPath(123);
// Returns: { id, name, ... } or null
```

### getPathDescendants(id)
```javascript
const descendants = await pathsDB.getPathDescendants(123);
// Returns: [ { id, name, slug, level, ... }, ... ]
// Includes original path + all descendants
// Ordered by level (shallow first)
```

### getPathHierarchy()
```javascript
const tree = await pathsDB.getPathHierarchy();
// Returns: [
//   {
//     id: 1, name: 'Root1', ... path_ids: [1],
//     id: 2, name: 'Child1', ... path_ids: [1, 2],
//     id: 3, name: 'GrandChild1', ... path_ids: [1, 2, 3],
//     id: 4, name: 'Root2', ... path_ids: [4],
//     ...
//   }
// ]
// Full tree structure in single query
// path_ids shows breadcrumb path
// Ordered for display (breadth-first)
```

### getPathStatistics()
```javascript
const stats = await pathsDB.getPathStatistics();
// Returns: {
//   total_paths: 10,
//   root_paths: 2,
//   max_depth: 3,
//   level_1_count: 2,
//   level_2_count: 5,
//   level_3_count: 3,
//   level_4_count: 0,
//   level_5_count: 0,
//   paths_with_posts: 7
// }
```

### getPathsWithPostCount()
```javascript
const paths = await pathsDB.getPathsWithPostCount();
// Returns: [
//   { id, name, slug, full_path, level, icon, color, post_count: 5 },
//   ...
// ]
// Only returns paths that have at least one post
// Ordered by level, then position
```

---

## 🔥 Common Patterns

### Pattern 1: Create User & Login
```javascript
// Register
const user = await userDB.createUser({
  email: email,
  display_name: displayName,
  password_hash: passwordHash
});

// Admin approves user
await pool.query(
  'UPDATE users SET status = $1 WHERE id = $2',
  ['approved', user.userId]
);

// Login
const loginUser = await userDB.getUserByEmail(email);
const isValid = await userDB.verifyPassword(userId, password);
```

### Pattern 2: Create Post with Tags
```javascript
const post = await blogDB.createPost({
  title: title,
  content: content,
  category: category,
  path_id: pathId
}, authorId);

await blogDB.updatePostTags(post.post.id, ['tag1', 'tag2', 'tag3']);
```

### Pattern 3: Update Post (Authorization Check)
```javascript
// Authorization is handled inside updatePost
// It throws error if user is not author
try {
  await blogDB.updatePost(postId, postData, locals.user.id);
} catch (error) {
  return fail(403, { error: error.message });
}
```

### Pattern 4: Create Path Hierarchy
```javascript
// Create root path
const root = await pathsDB.createPath({
  name: 'Category',
  slug: 'category'
}, userId);

// Create child (uses parent_id)
const child = await pathsDB.createPath({
  name: 'Subcategory',
  slug: 'subcategory',
  parent_id: root.path.id
}, userId);
```

### Pattern 5: Full Page Load with Relations
```javascript
export async function load({ params, locals }) {
  // Get post with author and tags
  const post = await blogDB.getPostBySlug(params.slug);
  if (!post) throw error(404);

  // Get related posts in same category
  const related = await blogDB.getPostsByCategory(post.category);

  // Get path hierarchy if post has a path
  const pathInfo = post.path_id ? 
    await pathsDB.getPathById(post.path_id) : 
    null;

  return { post, related, pathInfo };
}
```

---

## ⚠️ Error Handling

### Try/Catch Pattern
```javascript
export const actions = {
  createPost: async ({ request, locals }) => {
    try {
      const data = await request.formData();
      
      const result = await blogDB.createPost({
        title: data.get('title'),
        content: data.get('content')
      }, locals.user.id);
      
      throw redirect(303, `/blog/${result.post.slug}`);
    } catch (error) {
      if (error.status === 303) throw error;  // Allow redirects
      console.error('Error creating post:', error);
      return fail(500, { error: error.message });
    }
  }
};
```

### Validation Errors
```javascript
const errors = {};

if (!email) errors.email = 'Email required';
if (email && !/^[\w.-]+@[\w.-]+\.\w+$/.test(email)) {
  errors.email = 'Invalid email format';
}

if (Object.keys(errors).length > 0) {
  return fail(400, { errors });
}
```

---

## 🎯 Return Types Reference

| Method | Returns | Notes |
|--------|---------|-------|
| getUserById | User \| null | |
| getUserByEmail | User \| null | |
| createUser | { success, userId, user } | Always returns success object |
| verifyPassword | boolean | true if match, false if not |
| changePassword | { success, message } | |
| getAllPosts | Post[] | Can be empty array |
| getPostById | Post \| null | |
| createPost | { success, post } | |
| updatePost | { success, message } | |
| deletePost | { success, message } | |
| getAllPaths | Path[] | Can be empty |
| createPath | { success, path } | |
| getPathById | Path \| null | |

---

Happy coding! 🚀
