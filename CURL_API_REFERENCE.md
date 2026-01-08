# Complete curl API Reference Guide

Comprehensive guide for using curl to interact with the SvelteKit Blog API.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [Posts API](#posts-api)
4. [Search & Filter](#search--filter)
5. [Users API](#users-api)
6. [Paths/Folders API](#pathsfolders-api)
7. [Admin API](#admin-api)
8. [Error Handling](#error-handling)
9. [Tips & Tricks](#tips--tricks)

---

## Getting Started

### Base URL

**Local Development:**
```bash
http://localhost:5173
```

**Production (Scalingo):**
```bash
https://your-app-name.osc-fr1.scalingo.io
```

### Prerequisites

- `curl` installed (comes with macOS/Linux)
- `jq` for JSON formatting (optional but recommended)
  ```bash
  brew install jq
  ```

### Testing the API

Check if the API is running:
```bash
curl http://localhost:5173/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-24T12:00:00.000Z"
}
```

---

## Authentication

### 1. Login (Get Authentication Cookie)

```bash
curl -X POST http://localhost:5173/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"oracle"}' \
  -c cookies.txt \
  -v
```

**Parameters:**
- `-X POST`: HTTP POST method
- `-H`: Set Content-Type header
- `-d`: Request body (JSON)
- `-c cookies.txt`: Save cookies to file
- `-v`: Verbose output (optional, shows headers)

**Response (Success - 200):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "display_name": "Administrator",
    "role": "admin",
    "status": "approved"
  }
}
```

**Response (Error - 401):**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

**Response (Account Pending - 403):**
```json
{
  "success": false,
  "error": "Account pending approval"
}
```

### 2. Using Authentication in Requests

After login, include the cookie file in all authenticated requests:

```bash
curl http://localhost:5173/api/posts \
  -b cookies.txt
```

**Parameters:**
- `-b cookies.txt`: Send cookies from file

---

## Posts API

### 1. Get All Posts

```bash
curl "http://localhost:5173/api/posts" | jq
```

**Response:**
```json
{
  "success": true,
  "posts": [
    {
      "id": 8,
      "title": "Post Title",
      "excerpt": "Short preview...",
      "category": "technology",
      "slug": "post-title",
      "created_at": "2025-11-24T12:00:00.000Z",
      "updated_at": "2025-11-24T12:00:00.000Z",
      "published": true,
      "read_time": "5 min read",
      "author_id": 1,
      "author": "Administrator",
      "tags": ["javascript", "api"],
      "path": "/dev/prod"
    }
  ],
  "count": 1
}
```

### 2. Get Single Post by ID

**Get HTML content (default):**
```bash
curl "http://localhost:5173/api/posts/8" | jq
```

**Get plain text content:**
```bash
curl "http://localhost:5173/api/posts/8?format=text" | jq
```

**Get only the content:**
```bash
# HTML version
curl -s "http://localhost:5173/api/posts/8" | jq -r '.post.content'

# Text version
curl -s "http://localhost:5173/api/posts/8?format=text" | jq -r '.post.content'
```

**Response:**
```json
{
  "success": true,
  "post": {
    "id": 8,
    "title": "Post Title",
    "content": "<p>Full HTML content...</p>",
    "content_text": "Plain text version...",  // Only with ?format=text
    "content_html": "<p>Full HTML...</p>",    // Only with ?format=text
    "excerpt": "Short preview...",
    "category": "technology",
    "slug": "post-title",
    "read_time": "5 min read",
    "author_id": 1,
    "author": "Administrator",
    "author_email": "admin@example.com",
    "tags": ["javascript", "api"],
    "path": "/dev/prod",
    "created_at": "2025-11-24T12:00:00.000Z",
    "updated_at": "2025-11-24T12:00:00.000Z",
    "published": true
  },
  "format": "text"
}
```

### 3. Create New Post

**Requires authentication** (must login first)

```bash
curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "My New Post",
    "content": "<p>This is the content of my post.</p>",
    "category": "technology",
    "path_id": 5,
    "tags": ["api", "test", "curl"]
  }' | jq
```

**Required Fields:**
- `title` (string, max 500 chars)
- `content` (string, max 100,000 chars, can include HTML)

**Optional Fields:**
- `category` (string, max 50 chars, defaults to "thoughts")
- `path_id` (integer, folder ID - nullable)
- `tags` (array of strings, max 15 tags, each max 50 chars)

**Auto-Generated Fields:**
- `slug`: Generated from title
- `excerpt`: First 120 chars of content (plain text)
- `read_time`: Calculated from word count
- `author_id`: From authenticated user
- `published`: Set to `true` by default

**Response (Success - 201):**
```json
{
  "success": true,
  "post": {
    "id": 123,
    "title": "My New Post",
    "slug": "my-new-post",
    "created_at": "2025-11-24T12:00:00.000Z"
  },
  "message": "Post created successfully"
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "error": "Validation failed: Title is required",
  "validationErrors": ["Title is required"]
}
```

### 4. Update Post

**Requires authentication** (must be post author or admin)

```bash
curl -X PUT http://localhost:5173/api/posts/123 \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "Updated Title",
    "content": "<p>Updated content...</p>",
    "category": "documentation",
    "tags": ["updated", "api"]
  }' | jq
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Post updated successfully"
}
```

**Response (Error - 403):**
```json
{
  "success": false,
  "error": "You can only edit your own posts"
}
```

### 5. Delete Post

**Requires authentication** (must be post author or admin)

```bash
curl -X DELETE http://localhost:5173/api/posts/123 \
  -b cookies.txt | jq
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Post deleted successfully"
}
```

---

## Search & Filter

### 1. Search by Keyword

Search in title, content, excerpt, category, author, and tags:

```bash
curl "http://localhost:5173/api/posts?search=javascript" | jq
```

### 2. Filter by Category

```bash
curl "http://localhost:5173/api/posts?category=technology" | jq
```

Available categories depend on your setup. Common ones:
- `technology`
- `documentation`
- `reflexions`
- `politique`
- `thoughts`

### 3. Filter by Author (User ID)

```bash
curl "http://localhost:5173/api/posts?user=1" | jq
```

### 4. Filter by Path/Folder

```bash
curl "http://localhost:5173/api/posts?path_id=5" | jq
```

### 5. Combined Filters

Search for "API" in "technology" category:
```bash
curl "http://localhost:5173/api/posts?search=API&category=technology" | jq
```

### 6. Filter Priority

When multiple parameters are provided, this priority applies:
1. `path_id` (folder filter)
2. `user` (author filter)
3. `search` (with optional category)
4. `category` (alone)
5. All posts (no filters)

---

## Users API

### 1. Register New User

**No authentication required**

```bash
curl -X POST http://localhost:5173/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "displayName": "New User",
    "password": "securepassword123"
  }' | jq
```

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "Registration successful. Please wait for admin approval.",
  "user": {
    "id": 10,
    "email": "newuser@example.com",
    "display_name": "New User",
    "status": "pending"
  }
}
```

**Note:** New users have `status: "pending"` and must be approved by admin before they can login.

---

## Paths/Folders API

### 1. Get All Paths (Flat List)

```bash
curl "http://localhost:5173/api/paths" | jq
```

**Response:**
```json
{
  "success": true,
  "paths": [
    {
      "id": 1,
      "name": "Development",
      "slug": "development",
      "description": "Dev docs",
      "parent_id": null,
      "level": 1,
      "full_path": "/development",
      "icon": "💻",
      "color": "#3b82f6",
      "position": 0,
      "created_at": "2025-11-24T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

### 2. Get Hierarchical Tree

```bash
curl "http://localhost:5173/api/paths/tree" | jq
```

**Response (Nested Structure):**
```json
{
  "success": true,
  "tree": [
    {
      "id": 1,
      "name": "Development",
      "slug": "development",
      "level": 1,
      "children": [
        {
          "id": 2,
          "name": "Frontend",
          "slug": "frontend",
          "level": 2,
          "children": []
        }
      ]
    }
  ]
}
```

### 3. Get Single Path

```bash
curl "http://localhost:5173/api/paths/5" | jq
```

**Response:**
```json
{
  "success": true,
  "path": {
    "id": 5,
    "name": "API Documentation",
    "slug": "api-documentation",
    "description": "REST API docs",
    "parent_id": 1,
    "level": 2,
    "full_path": "/development/api-documentation",
    "child_count": 3,
    "post_count": 12,
    "children": [...]
  }
}
```

### 4. Create New Path

**Requires authentication**

```bash
curl -X POST http://localhost:5173/api/paths \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "New Folder",
    "description": "Folder description",
    "parent_id": 1,
    "icon": "📁",
    "color": "#10b981"
  }' | jq
```

**Required Fields:**
- `name` (string)

**Optional Fields:**
- `description` (string)
- `parent_id` (integer, null for root level)
- `icon` (emoji string)
- `color` (hex color)

**Auto-Generated:**
- `slug`: Generated from name
- `level`: Calculated from parent
- `full_path`: Built from hierarchy

**Response (Success - 201):**
```json
{
  "success": true,
  "path": {
    "id": 15,
    "name": "New Folder",
    "slug": "new-folder",
    "full_path": "/development/new-folder"
  }
}
```

### 5. Move Path

**Requires authentication**

```bash
curl -X POST http://localhost:5173/api/paths/15/move \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "new_parent_id": 2
  }' | jq
```

---

## Admin API

**All admin endpoints require authentication with admin role**

### 1. Approve User

```bash
curl -X POST http://localhost:5173/api/users/approve \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "userId": 10
  }' | jq
```

**Response (Success):**
```json
{
  "success": true,
  "message": "User approved successfully"
}
```

### 2. Reject User

```bash
curl -X POST http://localhost:5173/api/users/reject \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "userId": 10
  }' | jq
```

### 3. Reset User Password

```bash
curl -X POST http://localhost:5173/api/admin/reset-password \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "userId": 10,
    "newPassword": "temporarypass123"
  }' | jq
```

### 4. Toggle Post Publication Status

```bash
curl -X POST http://localhost:5173/api/admin/posts/toggle-status \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "postId": 123,
    "published": false
  }' | jq
```

---

## Error Handling

### Common HTTP Status Codes

- **200 OK**: Request succeeded
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid input/validation error
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource doesn't exist
- **500 Internal Server Error**: Server error

### Error Response Format

All errors follow this format:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

With validation errors:

```json
{
  "success": false,
  "error": "Validation failed: Title is required, Content is required",
  "validationErrors": [
    "Title is required",
    "Content is required"
  ]
}
```

---

## Tips & Tricks

### 1. Pretty Print JSON

Always use `jq` for readable output:

```bash
curl http://localhost:5173/api/posts | jq
```

### 2. Silent Mode (Hide Progress)

Use `-s` to hide curl's progress bar:

```bash
curl -s http://localhost:5173/api/posts | jq
```

### 3. Extract Specific Fields

Get only titles and IDs:

```bash
curl -s "http://localhost:5173/api/posts" | jq '.posts[] | {id, title}'
```

Get just the content:

```bash
curl -s "http://localhost:5173/api/posts/8?format=text" | jq -r '.post.content'
```

Count results:

```bash
curl -s "http://localhost:5173/api/posts?search=test" | jq '.count'
```

### 4. Save Response to File

```bash
curl "http://localhost:5173/api/posts/8" > post-8.json
```

Save just the content:

```bash
curl -s "http://localhost:5173/api/posts/8?format=text" | jq -r '.post.content' > post-8.txt
```

### 5. Check Response Headers

```bash
curl -i http://localhost:5173/api/posts/8
```

### 6. Follow Redirects

```bash
curl -L http://localhost:5173/api/posts/8
```

### 7. Set Custom Headers

```bash
curl -H "Accept: application/json" \
     -H "User-Agent: MyApp/1.0" \
     http://localhost:5173/api/posts
```

### 8. Timeout Settings

```bash
curl --connect-timeout 5 \
     --max-time 10 \
     http://localhost:5173/api/posts
```

### 9. Verbose Debug Output

```bash
curl -v http://localhost:5173/api/posts
```

### 10. Using Variables in Shell Scripts

```bash
#!/bin/bash

# Login and get cookie
curl -X POST http://localhost:5173/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"oracle"}' \
  -c cookies.txt \
  -s > /dev/null

# Create post
TITLE="Automated Post"
CONTENT="<p>Created via script</p>"

curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d "{
    \"title\": \"$TITLE\",
    \"content\": \"$CONTENT\",
    \"category\": \"automation\"
  }" | jq

# Get all posts
curl -s "http://localhost:5173/api/posts" | jq '.posts[] | {id, title}'
```

### 11. Pipe Multiple Commands

Search, then get full content of first result:

```bash
POST_ID=$(curl -s "http://localhost:5173/api/posts?search=test" | jq -r '.posts[0].id')
curl -s "http://localhost:5173/api/posts/$POST_ID?format=text" | jq -r '.post.content'
```

### 12. Using Environment Variables

```bash
export API_URL="http://localhost:5173"
export COOKIES_FILE="./cookies.txt"

# Login
curl -X POST $API_URL/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"oracle"}' \
  -c $COOKIES_FILE

# Get posts
curl "$API_URL/api/posts" -b $COOKIES_FILE | jq
```

### 13. Quote URLs in zsh

In zsh, always quote URLs with query parameters:

```bash
# ❌ Wrong (zsh error)
curl http://localhost:5173/api/posts?search=test

# ✅ Correct
curl "http://localhost:5173/api/posts?search=test"
```

---

## Complete Workflow Example

Here's a complete workflow showing common operations:

```bash
#!/bin/bash

API="http://localhost:5173"

# 1. Login
echo "🔐 Logging in..."
curl -X POST $API/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"oracle"}' \
  -c cookies.txt \
  -s | jq

# 2. Search for posts
echo -e "\n🔍 Searching for posts..."
curl -s "$API/api/posts?search=test" | jq '.posts[] | {id, title, author}'

# 3. Create a new post
echo -e "\n📝 Creating new post..."
POST_RESPONSE=$(curl -X POST $API/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -s \
  -d '{
    "title": "Test Post via curl",
    "content": "<h1>Hello</h1><p>This is a test post created via curl.</p>",
    "category": "technology",
    "tags": ["curl", "api", "test"]
  }')

echo $POST_RESPONSE | jq

# Extract the new post ID
POST_ID=$(echo $POST_RESPONSE | jq -r '.post.id')
echo "✅ Created post with ID: $POST_ID"

# 4. Get the post (plain text)
echo -e "\n📄 Getting post content (plain text)..."
curl -s "$API/api/posts/$POST_ID?format=text" | jq -r '.post.content'

# 5. Update the post
echo -e "\n✏️ Updating post..."
curl -X PUT $API/api/posts/$POST_ID \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -s \
  -d '{
    "title": "Updated Test Post",
    "content": "<h1>Updated!</h1><p>This post has been updated.</p>",
    "category": "documentation"
  }' | jq

# 6. Get all posts in a category
echo -e "\n📂 Getting all documentation posts..."
curl -s "$API/api/posts?category=documentation" | jq '.posts[] | {id, title}'

# 7. Delete the post (commented out for safety)
# echo -e "\n🗑️ Deleting post..."
# curl -X DELETE $API/api/posts/$POST_ID -b cookies.txt | jq

echo -e "\n✅ Workflow complete!"
```

Save this as `test-api.sh`, make it executable (`chmod +x test-api.sh`), and run it (`./test-api.sh`).

---

## Production Deployment (Scalingo)

When using the API on Scalingo, replace `localhost:5173` with your production URL:

```bash
export API_URL="https://your-app-name.osc-fr1.scalingo.io"

curl "$API_URL/api/posts" | jq
```

**Important for production:**
- Use HTTPS (secure)
- Keep your authentication tokens secure
- Don't commit `cookies.txt` to git
- Use environment variables for sensitive data

---

## Summary

### Most Common Commands

```bash
# Login
curl -X POST http://localhost:5173/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"oracle"}' \
  -c cookies.txt

# Get all posts
curl "http://localhost:5173/api/posts" | jq

# Search posts
curl "http://localhost:5173/api/posts?search=keyword" | jq

# Get single post (HTML)
curl "http://localhost:5173/api/posts/8" | jq

# Get single post (plain text)
curl "http://localhost:5173/api/posts/8?format=text" | jq

# Create post
curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"title":"Title","content":"<p>Content</p>"}' | jq

# Update post
curl -X PUT http://localhost:5173/api/posts/123 \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"title":"Updated","content":"<p>Updated</p>"}' | jq

# Delete post
curl -X DELETE http://localhost:5173/api/posts/123 \
  -b cookies.txt | jq
```

---

## Support & Resources

- **API Documentation**: This file
- **Original curl guide**: `API_CURL_USAGE.md`
- **Database reference**: `DATABASE_METHODS_REFERENCE.md`
- **curl manual**: `man curl` or https://curl.se/docs/

---

**Generated:** 2025-11-24
**Version:** 1.0
