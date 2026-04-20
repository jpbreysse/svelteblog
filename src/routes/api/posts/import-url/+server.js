/**
 * POST /api/posts/import-url
 * Import a document from URL, create post, and vectorize
 *
 * Body:
 * - url: URL to the document (PDF, DOCX, XLSX, etc.)
 * - title: Post title (optional, defaults to filename)
 * - category: Post category (optional, defaults to 'imported')
 * - vectorize: Whether to vectorize (default: true)
 *
 * Supports: PDF, DOCX, XLSX, XLS, PPTX, TXT, HTML
 */

import { json } from '@sveltejs/kit';
import { blogDB, chunksDB } from '$lib/db.js';
import { extractTextFromPdf, extractTextFromDocx, extractHtmlFromDocx, extractTextFromHtml, extractTextFromPptx, extractTextFromXlsx, extractHtmlFromXlsx } from '$lib/server/documents.js';
import { chunkText, getChunkStats } from '$lib/server/chunker.js';
import { generateEmbeddings } from '$lib/server/embeddings.js';

// Max file size: 50MB for URL imports
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Timeout for fetch: 60 seconds
const FETCH_TIMEOUT = 60000;

export async function POST({ request, locals }) {
  // Require authentication
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      url,
      title,
      category = 'imported',
      vectorize = true
    } = body;

    // Validate URL
    if (!url || typeof url !== 'string') {
      return json({
        success: false,
        error: 'URL is required'
      }, { status: 400 });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      return json({
        success: false,
        error: 'Invalid URL format'
      }, { status: 400 });
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return json({
        success: false,
        error: 'Only HTTP/HTTPS URLs are supported'
      }, { status: 400 });
    }

    console.log(`📥 Importing document from URL: ${url}`);

    // Fetch the document with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        redirect: 'follow'
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return json({
          success: false,
          error: 'Request timed out (60 seconds)'
        }, { status: 408 });
      }
      return json({
        success: false,
        error: `Failed to fetch URL: ${fetchError.message}`
      }, { status: 400 });
    }

    if (response.status === 403) {
      return json({
        success: false,
        error: 'Access denied (403). The server blocks automated downloads. Try downloading the file manually and uploading it instead.'
      }, { status: 403 });
    }

    if (response.status === 401) {
      return json({
        success: false,
        error: 'Authentication required (401). This URL requires login. Download the file manually and upload it instead.'
      }, { status: 401 });
    }

    if (!response.ok) {
      return json({
        success: false,
        error: `Failed to fetch URL: HTTP ${response.status}`
      }, { status: 400 });
    }

    // Check content length
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    if (contentLength > MAX_FILE_SIZE) {
      return json({
        success: false,
        error: `File too large (${(contentLength / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      }, { status: 400 });
    }

    // Determine file type from URL or content-type
    const contentType = response.headers.get('content-type') || '';
    const urlPath = parsedUrl.pathname.toLowerCase();

    let sourceType = 'unknown';
    if (urlPath.endsWith('.pdf') || contentType.includes('application/pdf')) {
      sourceType = 'pdf';
    } else if (urlPath.endsWith('.docx') || contentType.includes('officedocument.wordprocessingml')) {
      sourceType = 'docx';
    } else if (urlPath.endsWith('.pptx') || contentType.includes('officedocument.presentationml')) {
      sourceType = 'pptx';
    } else if (urlPath.endsWith('.xlsx') || contentType.includes('officedocument.spreadsheetml')) {
      sourceType = 'xlsx';
    } else if (urlPath.endsWith('.xls') || contentType.includes('vnd.ms-excel')) {
      sourceType = 'xlsx';
    } else if (urlPath.endsWith('.txt') || contentType.includes('text/plain')) {
      sourceType = 'txt';
    } else if (urlPath.endsWith('.html') || urlPath.endsWith('.htm') || contentType.includes('text/html')) {
      sourceType = 'html';
    } else {
      return json({
        success: false,
        error: `Unsupported file type. URL must end with .pdf, .docx, .xlsx, .xls, .pptx, .txt, or .html (detected: ${contentType})`
      }, { status: 400 });
    }

    // Get filename from URL for default title
    const fileName = parsedUrl.pathname.split('/').pop() || 'imported-document';
    const postTitle = title || fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

    console.log(`📄 Detected type: ${sourceType}, Title: "${postTitle}"`);

    // Download content
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileSize = buffer.length;

    console.log(`📦 Downloaded ${(fileSize / 1024).toFixed(1)}KB`);

    if (fileSize > MAX_FILE_SIZE) {
      return json({
        success: false,
        error: `File too large (${(fileSize / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      }, { status: 400 });
    }

    // Extract text and HTML
    let text = '';
    let postContent = ''; // HTML for TipTap editor
    try {
      if (sourceType === 'pdf') {
        text = await extractTextFromPdf(buffer);
        // Wrap PDF text in paragraphs for TipTap
        postContent = text.split(/\n\n+/).map(p => `<p>${p.trim()}</p>`).join('');
      } else if (sourceType === 'docx') {
        // Extract both plain text (for vectorization) and HTML (for TipTap)
        text = await extractTextFromDocx(buffer);
        const htmlResult = await extractHtmlFromDocx(buffer);
        postContent = htmlResult.html;
        if (htmlResult.messages.length > 0) {
          console.log(`   DOCX conversion warnings: ${htmlResult.messages.map(m => m.message).join(', ')}`);
        }
      } else if (sourceType === 'pptx') {
        text = await extractTextFromPptx(buffer);
        postContent = text.split(/\n\n+/).map(p => `<p>${p.trim()}</p>`).join('');
      } else if (sourceType === 'xlsx') {
        // Extract both plain text (for vectorization) and HTML tables (for TipTap)
        text = await extractTextFromXlsx(buffer);
        const htmlResult = await extractHtmlFromXlsx(buffer);
        postContent = htmlResult.html;
        console.log(`   Excel: ${htmlResult.sheetCount} sheets`);
      } else if (sourceType === 'txt') {
        text = buffer.toString('utf-8');
        postContent = text.split(/\n\n+/).map(p => `<p>${p.trim()}</p>`).join('');
      } else if (sourceType === 'html') {
        const htmlResult = extractTextFromHtml(buffer.toString('utf-8'));
        text = htmlResult.text;
        postContent = buffer.toString('utf-8'); // Keep original HTML
      }
    } catch (extractError) {
      console.error('❌ Text extraction failed:', extractError);
      return json({
        success: false,
        error: `Failed to extract text from ${sourceType.toUpperCase()}: ${extractError.message}`
      }, { status: 400 });
    }

    console.log(`✅ Extracted ${text.length} characters`);

    if (!text || text.length < 50) {
      return json({
        success: false,
        error: 'Not enough content extracted (minimum 50 characters)'
      }, { status: 400 });
    }

    // Create the post with HTML content for TipTap
    console.log('📝 Creating post...');
    const postResult = await blogDB.createPost({
      title: postTitle,
      content: postContent.substring(0, 100000), // HTML content for TipTap
      category: category,
      visibility: 'private',
      source_url: url,
      source_type: sourceType
    }, locals.user.id);

    const post = postResult.post;
    console.log(`✅ Created post ${post.id}: "${postTitle}"`);

    // Vectorize if requested
    let vectorStats = null;
    if (vectorize) {
      console.log('✂️ Chunking text...');
      const chunks = chunkText(text, { chunkSize: 500, overlap: 50 });
      const stats = getChunkStats(chunks);
      console.log(`   Created ${stats.count} chunks (avg ${stats.avgLength} chars)`);

      if (chunks.length > 0) {
        console.log('🧠 Generating embeddings...');
        const embeddings = await generateEmbeddings(chunks);
        console.log(`   Generated ${embeddings.length} embeddings`);

        console.log('💾 Saving chunks...');
        await chunksDB.saveChunks(post.id, chunks, embeddings, sourceType);

        vectorStats = {
          chunkCount: chunks.length,
          avgChunkLength: stats.avgLength
        };
      }
    }

    console.log(`✅ Import complete for "${postTitle}"`);

    return json({
      success: true,
      message: 'Document imported and vectorized successfully',
      post: {
        id: post.id,
        title: post.title,
        slug: post.slug,
        category: post.category
      },
      stats: {
        sourceType,
        fileSize,
        textLength: text.length,
        ...vectorStats
      }
    });

  } catch (error) {
    console.error('❌ Import error:', error);
    return json({
      success: false,
      error: error.message || 'Failed to import document'
    }, { status: 500 });
  }
}
