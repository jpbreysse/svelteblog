# Using curl to Publish Posts via API

This guide shows you how to create blog posts using curl commands to interact with the API.

## Authentication

The API uses cookie-based authentication with the `auth_token` cookie. You need to login first to get the authentication token.

### Step 1: Login and Get Auth Token

```bash
# Login and save cookies to a file
curl -X POST http://localhost:5173/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }' \
  -c cookies.txt \
  -v
```

**Parameters:**
- `-X POST` - HTTP POST method
- `-H "Content-Type: application/json"` - Set content type
- `-d '{...}'` - JSON body with credentials
- `-c cookies.txt` - Save cookies to file
- `-v` - Verbose output to see the response

**Successful Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "your-email@example.com",
    "display_name": "Your Name",
    "role": "user",
    "status": "approved"
  }
}
```

The `auth_token` cookie will be saved in `cookies.txt`.

## Creating a New Post

### Basic Example

```bash
curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "My First Post via API",
    "content": "<p>This is the content of my post.</p>",
    "category": "Technology"
  }'
```

**Parameters:**
- `-b cookies.txt` - Use cookies from file (includes auth_token)
- `-d '{...}'` - JSON body with post data

**Successful Response:**
```json
{
  "success": true,
  "post": {
    "id": 123,
    "title": "My First Post via API",
    "slug": "my-first-post-via-api",
    "excerpt": "This is the content of my post.",
    "category": "Technology",
    "author_id": 1,
    "published": true,
    "created_at": "2025-01-21T10:30:00.000Z"
  },
  "message": "Post created successfully"
}
```

### Complete Example with All Fields

```bash
curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "Complete Post Example",
    "content": "<h1>Introduction</h1><p>This is a comprehensive post with all fields.</p><p>It includes multiple paragraphs and <strong>formatting</strong>.</p>",
    "category": "Technology",
    "tags": ["javascript", "api", "tutorial"],
    "path_id": 5
  }'
```

### Using curl with a JSON File

For longer posts, it's easier to store the JSON in a file:

**post.json:**
```json
{
  "title": "My Detailed Post",
  "content": "<h1>Introduction</h1><p>This is a longer post with detailed content...</p><h2>Section 1</h2><p>More content here...</p>",
  "category": "Technology",
  "tags": ["javascript", "svelte", "web-development"],
  "path_id": null
}
```

**Command:**
```bash
curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d @post.json
```

## Post Data Fields

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `title` | string | Post title (max 200 chars) | `"My Blog Post"` |
| `content` | string | Post content in HTML (max 50,000 chars) | `"<p>Content here</p>"` |
| `category` | string | Post category (max 50 chars) | `"Technology"` |

### Optional Fields

| Field | Type | Description | Example | Default |
|-------|------|-------------|---------|---------|
| `tags` | array | Array of tag strings (max 10 tags, 30 chars each) | `["javascript", "api"]` | `[]` |
| `path_id` | number/null | ID of folder/path to organize post | `5` or `null` | `null` |

## Validation Rules

The API performs server-side validation:

1. **Title:**
   - Required, cannot be empty
   - Maximum 500 characters (server safety limit)
   - Warning at 180+ characters (client-side)

2. **Content:**
   - Required, cannot be empty
   - Maximum 100,000 characters (server safety limit)
   - Warning at 45,000+ characters (client-side)

3. **Category:**
   - Optional
   - Maximum 50 characters

4. **Tags:**
   - Optional array
   - Maximum 15 tags (server limit)
   - Each tag maximum 50 characters (server limit)
   - Client recommends max 10 tags, 30 chars each

5. **Path ID:**
   - Optional
   - Must reference an existing path if provided
   - Use `null` for no path organization

## Error Responses

### 401 Unauthorized (No Authentication)
```json
{
  "success": false,
  "error": "Authentication required"
}
```

**Solution:** Login first and use cookies.

### 400 Bad Request (Validation Error)
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

**Solution:** Fix the validation errors in your request.

### 400 Bad Request (Invalid Path)
```json
{
  "success": false,
  "error": "Invalid reference: insert or update on table \"posts\" violates foreign key constraint \"posts_path_id_fkey\". Make sure the path exists before creating a post."
}
```

**Solution:** Use a valid `path_id` or set it to `null`.

## Complete Workflow Example

```bash
# 1. Login and save auth token
curl -X POST http://localhost:5173/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your-password"
  }' \
  -c cookies.txt

# 2. Create a post
curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "Getting Started with APIs",
    "content": "<h1>Introduction</h1><p>APIs are powerful tools for automation...</p>",
    "category": "Tutorial",
    "tags": ["api", "automation", "beginner"]
  }'

# 3. Create another post from a file
echo '{
  "title": "Advanced API Techniques",
  "content": "<h1>Advanced Topics</h1><p>Learn advanced API usage...</p>",
  "category": "Advanced",
  "tags": ["api", "advanced"],
  "path_id": 3
}' > advanced-post.json

curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d @advanced-post.json
```

## Updating Existing Posts

You can also update posts using PUT:

```bash
curl -X PUT http://localhost:5173/api/posts/123 \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "Updated Post Title",
    "content": "<p>Updated content...</p>",
    "category": "Technology",
    "tags": ["updated", "api"]
  }'
```

**Requirements:**
- Must be the post author OR admin
- Post ID in URL (e.g., `/api/posts/123`)

## Deleting Posts

```bash
curl -X DELETE http://localhost:5173/api/posts/123 \
  -b cookies.txt
```

**Requirements:**
- Must be the post author OR admin
- Returns 200 on success

## Getting Posts

### Get all posts
```bash
curl http://localhost:5173/api/posts
```

### Get posts by category
```bash
curl "http://localhost:5173/api/posts?category=Technology"
```

### Search posts
```bash
curl "http://localhost:5173/api/posts?search=javascript"
```

### Get posts in a specific path/folder
```bash
curl "http://localhost:5173/api/posts?path_id=5"
```

### Get a specific post
```bash
curl http://localhost:5173/api/posts/123
```

## Tips and Best Practices

### 1. **Pretty Print JSON Responses**
```bash
curl http://localhost:5173/api/posts/123 | jq
```
Requires `jq` to be installed.

### 2. **Save Response to File**
```bash
curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d @post.json \
  -o response.json
```

### 3. **Check HTTP Status Code**
```bash
curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d @post.json \
  -w "\nHTTP Status: %{http_code}\n"
```

### 4. **Escape HTML in Bash**
When embedding HTML in JSON on the command line, be careful with quotes:

```bash
# Good - use single quotes for JSON, escape inner quotes
curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"title":"Test","content":"<p>Hello</p>","category":"Tech"}'

# Better - use a file for complex content
cat > post.json <<'EOF'
{
  "title": "My Post",
  "content": "<p>Content with \"quotes\" and <strong>tags</strong></p>",
  "category": "Technology"
}
EOF

curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d @post.json
```

### 5. **Batch Create Posts with a Script**

**create-posts.sh:**
```bash
#!/bin/bash

# Login once
curl -X POST http://localhost:5173/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your-password"
  }' \
  -c cookies.txt \
  -s > /dev/null

# Create multiple posts
for i in {1..5}; do
  echo "Creating post $i..."
  curl -X POST http://localhost:5173/api/posts \
    -H "Content-Type: application/json" \
    -b cookies.txt \
    -d "{
      \"title\": \"Post Number $i\",
      \"content\": \"<p>This is post number $i created via API</p>\",
      \"category\": \"Automated\",
      \"tags\": [\"automation\", \"post-$i\"]
    }" \
    -s | jq '.success, .post.id'

  echo "---"
done

echo "Done! Created 5 posts."
```

Make executable and run:
```bash
chmod +x create-posts.sh
./create-posts.sh
```

## Security Considerations

1. **Keep cookies.txt secure** - It contains your authentication token
2. **Use HTTPS in production** - Don't send credentials over HTTP
3. **Don't commit cookies.txt to git** - Add to `.gitignore`
4. **Rotate passwords regularly** - Especially for admin accounts
5. **Validate input** - The API does server-side validation, but validate on your end too

## Troubleshooting

### "Authentication required" error
- Make sure you've logged in and saved cookies: `-c cookies.txt`
- Make sure you're sending cookies: `-b cookies.txt`
- Check cookies.txt exists and has content
- Your session may have expired - login again

### "Validation failed" error
- Check that `title` and `content` are not empty
- Verify field lengths are within limits
- Make sure `tags` is an array, not a string

### "Invalid reference" error
- The `path_id` doesn't exist in the database
- Set `path_id` to `null` or use a valid path ID
- Query available paths: `curl http://localhost:5173/api/paths`

### Posts not appearing
- Check that user status is "approved"
- Verify the response shows `"success": true`
- Posts may be in draft mode (check `published` field)

## Related API Endpoints

- `POST /api/login` - Login and get auth token
- `POST /api/logout` - Logout (clears auth token)
- `GET /api/posts` - List all posts
- `GET /api/posts/:id` - Get single post
- `POST /api/posts` - Create new post
- `PUT /api/posts/:id` - Update existing post
- `PATCH /api/posts/:id` - Partially update post
- `DELETE /api/posts/:id` - Delete post
- `GET /api/paths` - List all paths/folders
- `GET /api/paths/tree` - Get hierarchical path tree

## References

- **API Documentation**: See `src/routes/api/posts/+server.js`
- **Authentication**: See `src/hooks.server.js`
- **Database Schema**: See `POSTGRESQL_SCHEMA_GUIDE.md`
- **curl Manual**: https://curl.se/docs/manual.html
