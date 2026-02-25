/**
 * POST /api/posts/extract-url
 * Extract text content from a URL without creating a post
 *
 * Body:
 * - url: URL to the document (PDF, DOCX, PPTX, TXT, HTML)
 *
 * Returns:
 * - title: Extracted/derived title
 * - content: Extracted text content
 * - sourceType: Document type (pdf, docx, etc.)
 * - stats: { fileSize, textLength }
 */

import { json } from '@sveltejs/kit';
import { extractTextFromPdf, extractTextFromDocx, extractTextFromHtml, extractTextFromPptx } from '$lib/server/documents.js';

// Max file size: 50MB
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
    const { url } = body;

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

    console.log(`📥 Extracting content from URL: ${url}`);

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
    } else if (urlPath.endsWith('.txt') || contentType.includes('text/plain')) {
      sourceType = 'txt';
    } else if (urlPath.endsWith('.html') || urlPath.endsWith('.htm') || contentType.includes('text/html')) {
      sourceType = 'html';
    } else {
      return json({
        success: false,
        error: `Unsupported file type. URL must end with .pdf, .docx, .pptx, .txt, or .html (detected: ${contentType})`
      }, { status: 400 });
    }

    // Get filename from URL for default title
    const fileName = parsedUrl.pathname.split('/').pop() || 'imported-document';
    const derivedTitle = fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

    console.log(`📄 Detected type: ${sourceType}`);

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

    // Extract text
    let text = '';
    let extractedTitle = derivedTitle;

    try {
      if (sourceType === 'pdf') {
        text = await extractTextFromPdf(buffer);
      } else if (sourceType === 'docx') {
        text = await extractTextFromDocx(buffer);
      } else if (sourceType === 'pptx') {
        text = await extractTextFromPptx(buffer);
      } else if (sourceType === 'txt') {
        text = buffer.toString('utf-8');
      } else if (sourceType === 'html') {
        const htmlResult = extractTextFromHtml(buffer.toString('utf-8'));
        text = htmlResult.text;
        // Use HTML title if available
        if (htmlResult.title) {
          extractedTitle = htmlResult.title;
        }
      }
    } catch (extractError) {
      console.error('❌ Text extraction failed:', extractError);
      return json({
        success: false,
        error: `Failed to extract text from ${sourceType.toUpperCase()}: ${extractError.message}`
      }, { status: 400 });
    }

    console.log(`✅ Extracted ${text.length} characters`);

    if (!text || text.length < 10) {
      return json({
        success: false,
        error: 'Not enough content extracted (minimum 10 characters)'
      }, { status: 400 });
    }

    return json({
      success: true,
      title: extractedTitle,
      content: text,
      sourceType,
      stats: {
        fileSize,
        textLength: text.length
      }
    });

  } catch (error) {
    console.error('❌ Extract error:', error);
    return json({
      success: false,
      error: error.message || 'Failed to extract content'
    }, { status: 500 });
  }
}
