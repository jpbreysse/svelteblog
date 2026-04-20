# SharePoint Online Integration

## Overview

This document describes the integration between ArborSpace and SharePoint Online (Microsoft 365) for importing Office documents into the knowledge base.

**Features:**
- OAuth2 authentication with Azure AD
- Browse SharePoint sites and document libraries
- Import Word, Excel, and PowerPoint files
- Automatic vectorization for semantic search

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                           │
│                                                                   │
│   ┌───────────────────────────────────────────────────────────┐  │
│   │  SharePoint Browser (/admin/sharepoint)                    │  │
│   │                                                            │  │
│   │  ┌─────────────┐  ┌─────────────────────────────────────┐ │  │
│   │  │ Connect to  │  │ Site: Contoso Team Site        ▼   │ │  │
│   │  │ SharePoint  │  └─────────────────────────────────────┘ │  │
│   │  └─────────────┘                                          │  │
│   │                                                            │  │
│   │  📁 Documents                                              │  │
│   │   ├── 📁 Projects                                         │  │
│   │   │    ├── ☑ project-plan.docx                           │  │
│   │   │    ├── ☑ budget.xlsx                                 │  │
│   │   │    └── ☐ presentation.pptx                           │  │
│   │   └── 📁 Reports                                          │  │
│   │                                                            │  │
│   │  [Import Selected (2 files)]                              │  │
│   └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1. OAuth Login
                              │ 2. Browse Files
                              │ 3. Import Selected
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                  │
│                                                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ SharePoint Service (src/lib/server/sharepoint.js)        │   │
│   │                                                          │   │
│   │  ┌──────────────┐    ┌──────────────┐                   │   │
│   │  │ OAuth2 Flow  │    │ Graph API    │                   │   │
│   │  │ (Azure AD)   │───▶│ Client       │                   │   │
│   │  └──────────────┘    └──────────────┘                   │   │
│   │         │                   │                            │   │
│   │         ▼                   ▼                            │   │
│   │  ┌──────────────┐    ┌──────────────┐                   │   │
│   │  │ Token Store  │    │ File Download│                   │   │
│   │  │ (PostgreSQL) │    │ & Extract    │                   │   │
│   │  └──────────────┘    └──────────────┘                   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                │                                 │
│                                ▼                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Document Processing Pipeline                             │   │
│   │                                                          │   │
│   │  Download ──▶ Extract ──▶ Chunk ──▶ Embed ──▶ Save     │   │
│   │  (Graph)     (mammoth/   (500     (MiniLM) (pgvector)  │   │
│   │              xlsx/pptx)  chars)                         │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Microsoft Cloud                               │
│                                                                   │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│   │ Azure AD     │    │ Microsoft    │    │ SharePoint   │     │
│   │ (OAuth)      │    │ Graph API    │    │ Online       │     │
│   └──────────────┘    └──────────────┘    └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### 1. Azure AD App Registration

Before using SharePoint integration, an Azure AD administrator must register an application:

1. **Go to Azure Portal** → Azure Active Directory → App registrations
2. **Create new registration:**
   - Name: `ArborSpace SharePoint Connector`
   - Supported account types: Single tenant (your organization)
   - Redirect URI: `https://your-domain.com/api/sharepoint/callback`

3. **Note these values:**
   - Application (client) ID
   - Directory (tenant) ID

4. **Create client secret:**
   - Go to Certificates & secrets
   - New client secret
   - Copy the secret value (shown only once)

5. **Add API permissions:**
   - Microsoft Graph:
     - `Files.Read.All` - Read all files user can access
     - `Sites.Read.All` - Read SharePoint site structure
     - `User.Read` - Read user profile

6. **Grant admin consent** (requires admin)

### 2. Environment Variables

```bash
# .env
SHAREPOINT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SHAREPOINT_CLIENT_SECRET=your-client-secret
SHAREPOINT_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SHAREPOINT_REDIRECT_URI=http://localhost:5173/api/sharepoint/callback
```

---

## OAuth2 Authentication Flow

```
┌──────────┐          ┌──────────┐          ┌──────────┐
│  User    │          │ ArborSpace│          │ Azure AD │
└────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                      │
     │ 1. Click "Connect   │                      │
     │    to SharePoint"   │                      │
     │────────────────────▶│                      │
     │                     │                      │
     │                     │ 2. Redirect to       │
     │                     │    Azure login       │
     │◀────────────────────│─────────────────────▶│
     │                     │                      │
     │ 3. Login with       │                      │
     │    Microsoft account│                      │
     │────────────────────────────────────────────▶
     │                     │                      │
     │ 4. Consent to       │                      │
     │    permissions      │                      │
     │────────────────────────────────────────────▶
     │                     │                      │
     │                     │ 5. Redirect with     │
     │                     │    auth code         │
     │◀────────────────────│◀─────────────────────│
     │                     │                      │
     │                     │ 6. Exchange code     │
     │                     │    for tokens        │
     │                     │─────────────────────▶│
     │                     │                      │
     │                     │ 7. Access + Refresh  │
     │                     │    tokens            │
     │                     │◀─────────────────────│
     │                     │                      │
     │ 8. Connected!       │ 9. Store tokens     │
     │    Show SharePoint  │    in database       │
     │◀────────────────────│                      │
     │                     │                      │
```

### Token Management

| Token | Lifetime | Purpose |
|-------|----------|---------|
| Access Token | 1 hour | API calls to Microsoft Graph |
| Refresh Token | 90 days | Get new access tokens |

Tokens are stored encrypted in the `sharepoint_tokens` table and automatically refreshed before expiration.

---

## Microsoft Graph API

### Endpoints Used

| Operation | Endpoint |
|-----------|----------|
| List sites | `GET /sites?search=*` |
| List drives | `GET /sites/{site-id}/drives` |
| List items | `GET /sites/{site-id}/drives/{drive-id}/items/{item-id}/children` |
| Download file | `GET /sites/{site-id}/drives/{drive-id}/items/{item-id}/content` |

### Example: List SharePoint Sites

```http
GET https://graph.microsoft.com/v1.0/sites?search=*
Authorization: Bearer {access_token}
```

Response:
```json
{
  "value": [
    {
      "id": "contoso.sharepoint.com,abc123,def456",
      "name": "Team Site",
      "displayName": "Contoso Team Site",
      "webUrl": "https://contoso.sharepoint.com/sites/team"
    }
  ]
}
```

### Example: List Document Library Contents

```http
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives/{drive-id}/root/children
Authorization: Bearer {access_token}
```

Response:
```json
{
  "value": [
    {
      "id": "item-123",
      "name": "project-plan.docx",
      "file": { "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      "size": 45678
    },
    {
      "id": "folder-456",
      "name": "Reports",
      "folder": { "childCount": 5 }
    }
  ]
}
```

### Example: Download File

```http
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives/{drive-id}/items/{item-id}/content
Authorization: Bearer {access_token}
```

Returns: Binary file content

---

## Supported Document Types

| Format | Extension | Extraction Library |
|--------|-----------|-------------------|
| Word | `.docx` | mammoth |
| Excel | `.xlsx`, `.xls` | xlsx |
| PowerPoint | `.pptx` | officeparser |

### Excel Extraction

Excel files are converted to text by extracting all sheets:

```
## Sheet: Sales Data

Date        Product     Amount
2024-01-15  Widget A    $1,234
2024-01-16  Widget B    $5,678

## Sheet: Summary

Total Revenue: $6,912
```

Each sheet becomes a section, preserving the tabular structure as text for semantic search.

---

## API Endpoints

### OAuth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sharepoint/auth` | GET | Start OAuth flow, redirect to Microsoft |
| `/api/sharepoint/callback` | GET | Handle OAuth callback, store tokens |
| `/api/sharepoint/disconnect` | POST | Remove tokens, disconnect SharePoint |
| `/api/sharepoint/status` | GET | Check connection status |

### Browse Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sharepoint/sites` | GET | List accessible SharePoint sites |
| `/api/sharepoint/browse` | GET | List folders/files in a location |

Query parameters for `/browse`:
- `siteId` - SharePoint site ID
- `driveId` - Document library ID
- `folderId` - Folder ID (optional, root if empty)

### Import Endpoint

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sharepoint/import` | POST | Import and vectorize documents |

Request body:
```json
{
  "items": [
    {
      "siteId": "contoso.sharepoint.com,abc,def",
      "driveId": "b!xyz123",
      "itemId": "file-456",
      "name": "project-plan.docx"
    }
  ]
}
```

Response:
```json
{
  "success": true,
  "imported": 2,
  "failed": 0,
  "results": [
    {
      "name": "project-plan.docx",
      "postId": 106,
      "chunkCount": 12,
      "status": "success"
    }
  ]
}
```

---

## Database Schema

### Token Storage

```sql
CREATE TABLE sharepoint_tokens (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Imported Documents

Imported SharePoint files are stored as regular posts with:
- `source_type`: `'sharepoint'`
- `source_url`: SharePoint file URL
- `category`: `'sharepoint'` or user-selected

---

## Import Flow

```
1. User selects files in SharePoint browser
          │
          ▼
2. POST /api/sharepoint/import
   Body: { items: [...] }
          │
          ▼
3. For each file:
   ├── Download from Graph API
   ├── Detect type (docx/xlsx/pptx)
   ├── Extract text (mammoth/xlsx/officeparser)
   ├── Create post in database
   ├── Chunk text (500 chars, 50 overlap)
   ├── Generate embeddings (MiniLM)
   └── Save to pgvector
          │
          ▼
4. Return results with post IDs
          │
          ▼
5. (Optional) Review chunks with Mistral
   POST /api/chunks/review
```

---

## Security Considerations

### Token Security

1. **Encryption**: Access and refresh tokens stored encrypted in database
2. **Minimal scope**: Only request necessary permissions (Files.Read.All, Sites.Read.All)
3. **User-scoped**: Each user has their own SharePoint connection
4. **Auto-expiry**: Tokens automatically refreshed or invalidated

### Access Control

1. **Admin only**: SharePoint browser restricted to admin users
2. **Audit logging**: Log all import operations
3. **HTTPS required**: OAuth redirect must be HTTPS in production

### Data Privacy

1. **On-premise processing**: Downloaded files processed locally
2. **No file storage**: Original files not stored, only extracted text
3. **User consent**: OAuth flow requires explicit user consent

---

## Rate Limits

Microsoft Graph API limits:

| Limit | Value |
|-------|-------|
| Requests per app | 10,000 per 10 minutes |
| File download | 60 MB max recommended |
| Concurrent requests | 4 per user |

For large imports, files are processed sequentially to avoid hitting limits.

---

## Troubleshooting

### "Admin consent required"

Azure AD admin must grant consent for the app permissions:
1. Go to Azure Portal → Enterprise applications
2. Find the app → Permissions
3. Click "Grant admin consent"

### "Token expired"

Tokens auto-refresh, but if refresh fails:
1. User should disconnect and reconnect SharePoint
2. Check if refresh token has expired (90 days)

### "File too large"

Files over 60MB may timeout:
1. Download smaller version if available
2. Split large Excel files into multiple sheets
3. Increase server timeout settings

### "Permission denied"

User may not have access to the SharePoint site:
1. Check SharePoint permissions
2. Verify user is member of the site
3. Request access from site owner

---

## Environment Configuration

### Development

```bash
SHAREPOINT_CLIENT_ID=dev-client-id
SHAREPOINT_CLIENT_SECRET=dev-secret
SHAREPOINT_TENANT_ID=your-tenant-id
SHAREPOINT_REDIRECT_URI=http://localhost:5173/api/sharepoint/callback
```

### Production

```bash
SHAREPOINT_CLIENT_ID=prod-client-id
SHAREPOINT_CLIENT_SECRET=prod-secret
SHAREPOINT_TENANT_ID=your-tenant-id
SHAREPOINT_REDIRECT_URI=https://arborspace.example.com/api/sharepoint/callback
```

Note: Production requires HTTPS for the redirect URI.
