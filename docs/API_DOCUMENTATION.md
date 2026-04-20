# API Documentation

## Overview

This document describes the REST API endpoints and authentication system for the ArborSpace application.

**Base URL:** `http://localhost:5173` (development) or your production domain

---

## Authentication

### How It Works

The application uses **JWT-based authentication** with HTTP-only cookies:

1. User submits credentials to `/api/login`
2. Server validates credentials and returns a JWT token as an HTTP-only cookie (`auth_token`)
3. Browser automatically sends this cookie with every request
4. Server validates the token on each request via hooks
5. If valid, `locals.user` is populated with user data

### Token Details

| Property | Value |
|----------|-------|
| Cookie Name | `auth_token` |
| Expiration | 7 days |
| HTTP-Only | Yes (not accessible via JavaScript) |
| Secure | Yes (in production) |
| SameSite | Strict |

### User Roles

| Role | Description |
|------|-------------|
| `user` | Standard user, can create/edit own posts |
| `admin` | Full access, can manage users, categories, and all posts |

### User Status

| Status | Can Login? | Description |
|--------|------------|-------------|
| `approved` | Yes | Active user |
| `pending` | No | Awaiting admin approval |
| `rejected` | No | Registration rejected |
| `deletion_requested` | No | Scheduled for deletion |

---

## Authentication Endpoints

### Login

```http
POST /api/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "display_name": "John Doe",
    "role": "user",
    "status": "approved"
  }
}
```

**Error Responses:**
| Status | Error |
|--------|-------|
| 400 | Missing email/password or invalid format |
| 401 | Invalid credentials |
| 403 | Account not approved |

**cURL Example:**
```bash
curl -X POST http://localhost:5173/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' \
  -c cookies.txt
```

### Logout

```http
POST /api/logout
```

**Response:**
```json
{
  "success": true
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:5173/api/logout -b cookies.txt
```

---

## Posts API

### List Posts

```http
GET /api/posts
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search in title/content |
| `category` | string | Filter by category |
| `user` | number | Filter by author ID |
| `path_id` | number | Filter by folder/path |

**Response:**
```json
{
  "success": true,
  "posts": [
    {
      "id": 1,
      "title": "My Post",
      "excerpt": "First 200 chars...",
      "category": "articles",
      "slug": "my-post",
      "published": true,
      "author": "John Doe",
      "author_id": 1,
      "created_at": "2024-01-15T10:30:00Z",
      "tags": ["tag1", "tag2"]
    }
  ],
  "count": 1
}
```

### Create Post

```http
POST /api/posts
Content-Type: application/json
Cookie: auth_token=...

{
  "title": "My New Post",
  "content": "<p>Post content in HTML</p>",
  "category": "articles",
  "tags": ["javascript", "tutorial"],
  "visibility": "public",
  "path_id": null
}
```

**Required Fields:**
- `title` (max 500 chars)
- `content` (max 10MB)

**Optional Fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `category` | string | "general" | Post category |
| `tags` | array | [] | Max 15 tags, 50 chars each |
| `visibility` | string | "public" | "public" or "groups" |
| `path_id` | number | null | Folder to place post in |
| `readGroupIds` | array | [] | Groups with read access |
| `writeGroupIds` | array | [] | Groups with write access |

**Success Response (201):**
```json
{
  "success": true,
  "post": {
    "id": 42,
    "slug": "my-new-post"
  }
}
```

### Get Single Post

```http
GET /api/posts/:id
```

**Query Parameters:**
| Parameter | Value | Description |
|-----------|-------|-------------|
| `format` | `html` | Return HTML content (default) |
| `format` | `text` | Return plain text content |

**Response:**
```json
{
  "success": true,
  "post": {
    "id": 1,
    "title": "My Post",
    "content": "<p>Full content...</p>",
    "category": "articles",
    "slug": "my-post",
    "author": "John Doe",
    "author_id": 1,
    "visibility": "public",
    "published": true,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

### Update Post

```http
PUT /api/posts/:id
Content-Type: application/json
Cookie: auth_token=...

{
  "title": "Updated Title",
  "content": "<p>Updated content</p>",
  "category": "tutorials"
}
```

**Authorization:** Must be post author or admin

### Delete Post

```http
DELETE /api/posts/:id
Cookie: auth_token=...
```

**Authorization:** Must be post author or admin

**Response:**
```json
{
  "success": true,
  "message": "Post deleted successfully"
}
```

---

## Post Permissions

### Get Post Permissions

```http
GET /api/posts/:id/permissions
Cookie: auth_token=...
```

**Response:**
```json
{
  "success": true,
  "readGroups": [1, 2],
  "writeGroups": [1]
}
```

---

## Search API

### Semantic Search

Uses AI embeddings to find semantically similar content.

```http
GET /api/search/semantic?q=your+query&limit=10
Cookie: auth_token=...
```

**Query Parameters:**
| Parameter | Type | Default | Max |
|-----------|------|---------|-----|
| `q` | string | required | 500 chars |
| `limit` | number | 10 | 50 |

**Response:**
```json
{
  "success": true,
  "query": "your query",
  "results": [
    {
      "postId": 1,
      "title": "Relevant Post",
      "slug": "relevant-post",
      "similarity": 0.89,
      "matchedChunk": "The matching text segment..."
    }
  ],
  "totalMatches": 5,
  "uniquePosts": 3
}
```

### Hybrid Search

Combines keyword and semantic search.

```http
GET /api/search/hybrid?q=your+query&limit=10
Cookie: auth_token=...
```

---

## RAG Chat API

### Chat with Knowledge Base

```http
POST /api/chat
Content-Type: application/json
Cookie: auth_token=...

{
  "message": "What is renewable energy?",
  "limit": 5,
  "keywordWeight": 0.3
}
```

**Response:** Server-Sent Events (SSE) stream

```
event: token
data: {"text": "Renewable"}

event: token
data: {"text": " energy"}

event: sources
data: [{"title": "Energy Guide", "slug": "energy-guide", "similarity": 0.85}]

event: done
data: {}
```

---

## Groups API

### List All Groups

```http
GET /api/groups
Cookie: auth_token=...
```

**Response:**
```json
{
  "success": true,
  "groups": [
    {
      "id": 1,
      "name": "Engineering",
      "description": "Engineering team"
    }
  ]
}
```

### Create Group (Admin)

```http
POST /api/groups
Content-Type: application/json
Cookie: auth_token=...

{
  "name": "Marketing",
  "description": "Marketing team"
}
```

### Get Group Members

```http
GET /api/groups/:id/members
Cookie: auth_token=...
```

### Add Member to Group (Admin)

```http
POST /api/groups/:id/members
Content-Type: application/json
Cookie: auth_token=...

{
  "userId": 5
}
```

### Remove Member from Group (Admin)

```http
DELETE /api/groups/:id/members/:userId
Cookie: auth_token=...
```

---

## Document Import API

### Import from URL

```http
POST /api/posts/import-url
Content-Type: application/json
Cookie: auth_token=...

{
  "url": "https://example.com/document.pdf",
  "title": "Optional Custom Title",
  "category": "imported",
  "vectorize": true
}
```

**Supported Formats:** PDF, DOCX, PPTX, TXT, HTML (max 50MB)

**Response:**
```json
{
  "success": true,
  "message": "Document imported and vectorized successfully",
  "post": {
    "id": 125,
    "title": "Document Title",
    "slug": "document-title"
  },
  "stats": {
    "sourceType": "pdf",
    "fileSize": 1048576,
    "textLength": 50000,
    "chunkCount": 48
  }
}
```

### Extract URL Content (without creating post)

```http
POST /api/posts/extract-url
Content-Type: application/json
Cookie: auth_token=...

{
  "url": "https://example.com/document.pdf"
}
```

---

## Vectorization API

### Vectorize a Post

```http
POST /api/posts/:id/vectorize
Cookie: auth_token=...
```

**Response:**
```json
{
  "success": true,
  "message": "Post vectorized successfully",
  "chunks": 25
}
```

### Remove Vectorization

```http
DELETE /api/posts/:id/vectorize
Cookie: auth_token=...
```

### Get Post Chunks

```http
GET /api/posts/:id/chunks
Cookie: auth_token=...
```

**Response:**
```json
{
  "success": true,
  "chunks": [
    {
      "id": 1,
      "chunk_index": 0,
      "chunk_text": "Text content...",
      "quality_score": 0.85,
      "doc_type": "technicaldoc",
      "summary": "Summary of chunk",
      "auto_tags": ["tag1", "tag2"]
    }
  ]
}
```

---

## Chunk Enrichment API (Admin)

### Enrich Chunks with Mistral

```http
POST /api/chunks/review?limit=20
Cookie: auth_token=...
```

**Query Parameters:**
| Parameter | Type | Default | Max |
|-----------|------|---------|-----|
| `limit` | number | 10 | 50 |
| `post_id` | number | null | - |

**Response:**
```json
{
  "success": true,
  "processed": 20,
  "lowQuality": 2,
  "redundant": 1,
  "docTypes": {
    "technicaldoc": 15,
    "meetingsummary": 5
  }
}
```

---

## User Management

### Change Password

```http
POST /api/users/change-password
Content-Type: application/json
Cookie: auth_token=...

{
  "currentPassword": "oldpass123",
  "newPassword": "newpass456",
  "confirmPassword": "newpass456"
}
```

### Request Account Deletion

```http
POST /api/users/request-deletion
Cookie: auth_token=...
```

### Cancel Deletion Request

```http
POST /api/users/cancel-deletion
Cookie: auth_token=...
```

---

## Admin Endpoints

All admin endpoints require `role: "admin"`.

### Approve User

```http
POST /api/users/approve
Content-Type: application/json
Cookie: auth_token=...

{
  "userId": 5
}
```

### Reject User

```http
POST /api/users/reject
Content-Type: application/json
Cookie: auth_token=...

{
  "userId": 5
}
```

### Reset User Password

```http
POST /api/admin/reset-password
Content-Type: application/json
Cookie: auth_token=...

{
  "userId": 5,
  "newPassword": "temporarypass123"
}
```

### Toggle Post Status

```http
POST /api/admin/posts/toggle-status
Content-Type: application/json
Cookie: auth_token=...

{
  "postId": 42,
  "published": true
}
```

### Manage Categories

```http
GET /api/admin/categories
POST /api/admin/categories
DELETE /api/admin/categories/:id
```

---

## Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (not logged in) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## cURL Examples

### Complete Workflow Example

```bash
# 1. Login and save cookies
curl -X POST http://localhost:5173/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}' \
  -c cookies.txt

# 2. Create a post
curl -X POST http://localhost:5173/api/posts \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "My API Post",
    "content": "<p>Created via API</p>",
    "category": "tutorials"
  }'

# 3. Search posts
curl "http://localhost:5173/api/posts?search=API&category=tutorials"

# 4. Semantic search (requires auth)
curl "http://localhost:5173/api/search/semantic?q=how+to+use+API" \
  -b cookies.txt

# 5. Import a PDF
curl -X POST http://localhost:5173/api/posts/import-url \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "url": "https://example.com/report.pdf",
    "category": "reports"
  }'

# 6. Logout
curl -X POST http://localhost:5173/api/logout -b cookies.txt
```

---

## Environment Variables

Required for authentication:

```env
JWT_SECRET=your-secret-key-minimum-32-characters
```

Database connection:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```
