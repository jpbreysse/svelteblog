/**
 * Document Fetcher Service
 * Handles fetching and extracting text from various document types:
 * - HTML web pages
 * - PDF files
 * - Word documents (.docx)
 */

import * as cheerio from 'cheerio';

// Lazy-load heavy dependencies
let mammoth = null;
let pdfParse = null;
let officeParser = null;

/**
 * Detect document type from URL or content-type
 * @param {string} url - The URL to analyze
 * @param {string} contentType - Optional content-type header
 * @returns {'html' | 'pdf' | 'docx' | 'pptx' | 'unknown'}
 */
export function detectDocumentType(url, contentType = '') {
  const lowerUrl = url.toLowerCase();
  const lowerContentType = contentType.toLowerCase();

  // Check content-type header first
  if (lowerContentType.includes('application/pdf')) return 'pdf';
  if (lowerContentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml')) return 'docx';
  if (lowerContentType.includes('application/vnd.openxmlformats-officedocument.presentationml')) return 'pptx';
  if (lowerContentType.includes('application/msword')) return 'docx';
  if (lowerContentType.includes('application/vnd.ms-powerpoint')) return 'pptx';
  if (lowerContentType.includes('text/html')) return 'html';

  // Fall back to URL extension
  if (lowerUrl.endsWith('.pdf')) return 'pdf';
  if (lowerUrl.endsWith('.docx')) return 'docx';
  if (lowerUrl.endsWith('.doc')) return 'docx';
  if (lowerUrl.endsWith('.pptx')) return 'pptx';
  if (lowerUrl.endsWith('.ppt')) return 'pptx';
  if (lowerUrl.endsWith('.html') || lowerUrl.endsWith('.htm')) return 'html';

  // Default to HTML for web URLs
  return 'html';
}

/**
 * Fetch and extract text from a URL
 * @param {string} url - The URL to fetch
 * @returns {Promise<{text: string, type: string, title: string}>}
 */
export async function fetchAndExtractText(url) {
  console.log(`📥 Fetching document from: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DocumentFetcher/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const docType = detectDocumentType(url, contentType);

  console.log(`📄 Detected document type: ${docType}`);

  let text = '';
  let title = '';

  switch (docType) {
    case 'html':
      const html = await response.text();
      const result = extractTextFromHtml(html);
      text = result.text;
      title = result.title;
      break;

    case 'pdf':
      const pdfBuffer = await response.arrayBuffer();
      text = await extractTextFromPdf(Buffer.from(pdfBuffer));
      title = extractTitleFromUrl(url);
      break;

    case 'docx':
      const docxBuffer = await response.arrayBuffer();
      text = await extractTextFromDocx(Buffer.from(docxBuffer));
      title = extractTitleFromUrl(url);
      break;

    case 'pptx':
      const pptxBuffer = await response.arrayBuffer();
      text = await extractTextFromPptx(Buffer.from(pptxBuffer));
      title = extractTitleFromUrl(url);
      break;

    default:
      throw new Error(`Unsupported document type: ${docType}`);
  }

  // Clean up text
  text = cleanText(text);

  console.log(`✅ Extracted ${text.length} characters`);

  return { text, type: docType, title };
}

/**
 * Extract text from HTML content
 * @param {string} html - HTML content
 * @returns {{text: string, title: string}}
 */
export function extractTextFromHtml(html) {
  const $ = cheerio.load(html);

  // Get title
  const title = $('title').text().trim() || $('h1').first().text().trim() || '';

  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, noscript, iframe, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();

  // Get main content (try common content selectors)
  let mainContent = $('main, article, [role="main"], .content, .post-content, .article-content, #content').first();

  if (mainContent.length === 0) {
    mainContent = $('body');
  }

  // Extract text
  const text = mainContent.text();

  return { text, title };
}

/**
 * Extract text from PDF buffer
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<string>}
 */
export async function extractTextFromPdf(buffer) {
  // Lazy load pdf-parse
  if (!pdfParse) {
    pdfParse = (await import('pdf-parse')).default;
  }

  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Extract text from Word document buffer
 * @param {Buffer} buffer - DOCX file buffer
 * @returns {Promise<string>}
 */
export async function extractTextFromDocx(buffer) {
  // Lazy load mammoth
  if (!mammoth) {
    mammoth = await import('mammoth');
  }

  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Extract text from PowerPoint buffer
 * @param {Buffer} buffer - PPTX file buffer
 * @returns {Promise<string>}
 */
export async function extractTextFromPptx(buffer) {
  // Lazy load officeparser
  if (!officeParser) {
    officeParser = await import('officeparser');
  }

  // v6.0.0 API: parseOffice returns AST, use .toText() for plain text
  const ast = await officeParser.parseOffice(buffer);
  return ast.toText();
}

/**
 * Extract text from post HTML content (for regular posts)
 * Preserves document structure for better chunking and embeddings
 * @param {string} html - Post HTML content
 * @returns {string}
 */
export function extractTextFromPostContent(html) {
  if (!html) return '';

  const $ = cheerio.load(html);

  // Remove dangerous/unwanted elements
  $('script, style, noscript').remove();

  // Preserve image alt text (important for charts, diagrams)
  $('img[alt]').each((i, el) => {
    const alt = $(el).attr('alt');
    if (alt && alt.trim()) {
      $(el).replaceWith(`[Image: ${alt.trim()}] `);
    } else {
      $(el).remove();
    }
  });

  // Preserve external link URLs for context
  $('a[href^="http"]').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (text && href) {
      $(el).replaceWith(`${text} (${href}) `);
    }
  });

  // Mark headings with ## prefix for structure
  $('h1').each((i, el) => {
    $(el).prepend('\n\n# ');
    $(el).append('\n');
  });
  $('h2').each((i, el) => {
    $(el).prepend('\n\n## ');
    $(el).append('\n');
  });
  $('h3').each((i, el) => {
    $(el).prepend('\n\n### ');
    $(el).append('\n');
  });
  $('h4, h5, h6').each((i, el) => {
    $(el).prepend('\n\n#### ');
    $(el).append('\n');
  });

  // Add bullets for list items
  $('li').each((i, el) => {
    $(el).prepend('• ');
    $(el).append('\n');
  });

  // Add separators for table cells
  $('th').each((i, el) => {
    $(el).append(' | ');
  });
  $('td').each((i, el) => {
    $(el).append(' | ');
  });
  $('tr').each((i, el) => {
    $(el).append('\n');
  });

  // Add newlines for block elements
  $('p').each((i, el) => {
    $(el).append('\n\n');
  });
  $('div').each((i, el) => {
    $(el).append('\n');
  });
  $('br').each((i, el) => {
    $(el).replaceWith('\n');
  });
  $('blockquote').each((i, el) => {
    $(el).prepend('\n> ');
    $(el).append('\n');
  });

  // Add markers for code blocks
  $('pre, code').each((i, el) => {
    $(el).prepend('\n```\n');
    $(el).append('\n```\n');
  });

  // Get text
  const text = $.text();

  return cleanTextPreserveStructure(text);
}

/**
 * Clean text while preserving document structure markers
 * @param {string} text - Raw text with structure markers
 * @returns {string}
 */
function cleanTextPreserveStructure(text) {
  return text
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    // Replace tabs with spaces
    .replace(/\t/g, ' ')
    // Collapse multiple spaces (but not newlines) into single space
    .replace(/ +/g, ' ')
    // Collapse more than 3 consecutive newlines into 2
    .replace(/\n{4,}/g, '\n\n\n')
    // Remove spaces at start/end of lines
    .replace(/^ +/gm, '')
    .replace(/ +$/gm, '')
    // Remove leading/trailing whitespace
    .trim();
}

/**
 * Clean extracted text
 * @param {string} text - Raw text
 * @returns {string}
 */
function cleanText(text) {
  return text
    // Replace multiple whitespace with single space
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim();
}

/**
 * Extract a title from URL
 * @param {string} url - The URL
 * @returns {string}
 */
function extractTitleFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split('/').pop() || '';
    // Remove extension and clean up
    return filename.replace(/\.(pdf|docx|doc|html|htm)$/i, '').replace(/[-_]/g, ' ');
  } catch {
    return '';
  }
}

/**
 * Process uploaded file buffer
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Original filename
 * @returns {Promise<{text: string, type: string}>}
 */
export async function extractTextFromBuffer(buffer, filename) {
  const lowerFilename = filename.toLowerCase();

  let type = 'unknown';
  let text = '';

  if (lowerFilename.endsWith('.pdf')) {
    type = 'pdf';
    text = await extractTextFromPdf(buffer);
  } else if (lowerFilename.endsWith('.docx')) {
    type = 'docx';
    text = await extractTextFromDocx(buffer);
  } else if (lowerFilename.endsWith('.doc')) {
    type = 'docx';
    text = await extractTextFromDocx(buffer);
  } else if (lowerFilename.endsWith('.txt')) {
    type = 'text';
    text = buffer.toString('utf-8');
  } else {
    throw new Error(`Unsupported file type: ${filename}`);
  }

  return { text: cleanText(text), type };
}
