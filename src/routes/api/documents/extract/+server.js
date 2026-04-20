/**
 * POST /api/documents/extract
 * Extract text from an uploaded document file
 *
 * Accepts: PDF, Word (.docx), Excel (.xlsx, .xls), PowerPoint (.pptx), Text (.txt), HTML (.html)
 * Returns: Extracted text content
 */

import { json } from '@sveltejs/kit';
import { extractTextFromPdf, extractTextFromDocx, extractHtmlFromDocx, extractTextFromHtml, extractTextFromPptx, extractTextFromXlsx, extractHtmlFromXlsx } from '$lib/server/documents.js';

// Max file size: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST({ request }) {
  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return json({
        success: false,
        error: 'No file uploaded'
      }, { status: 400 });
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return json({
        success: false,
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      }, { status: 400 });
    }

    // Determine file type
    const fileName = file.name.toLowerCase();
    const mimeType = file.type.toLowerCase();

    let fileType = 'unknown';
    if (fileName.endsWith('.pdf') || mimeType === 'application/pdf') {
      fileType = 'pdf';
    } else if (fileName.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      fileType = 'docx';
    } else if (fileName.endsWith('.pptx') || mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      fileType = 'pptx';
    } else if (fileName.endsWith('.xlsx') || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      fileType = 'xlsx';
    } else if (fileName.endsWith('.xls') || mimeType === 'application/vnd.ms-excel') {
      fileType = 'xlsx';
    } else if (fileName.endsWith('.doc') || mimeType === 'application/msword') {
      return json({
        success: false,
        error: 'Old .doc format not supported. Please convert to .docx'
      }, { status: 400 });
    } else if (fileName.endsWith('.ppt') || mimeType === 'application/vnd.ms-powerpoint') {
      return json({
        success: false,
        error: 'Old .ppt format not supported. Please convert to .pptx'
      }, { status: 400 });
    } else if (fileName.endsWith('.txt') || mimeType === 'text/plain') {
      fileType = 'txt';
    } else if (fileName.endsWith('.html') || fileName.endsWith('.htm') || mimeType === 'text/html') {
      fileType = 'html';
    } else {
      return json({
        success: false,
        error: 'Unsupported file type. Supported: PDF, DOCX, XLSX, XLS, PPTX, TXT, HTML'
      }, { status: 400 });
    }

    console.log(`📤 Extracting text from: ${file.name} (${fileType}, ${(file.size / 1024).toFixed(1)}KB)`);

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text based on file type
    let text = '';
    let html = '';
    let title = '';

    try {
      if (fileType === 'pdf') {
        text = await extractTextFromPdf(buffer);
      } else if (fileType === 'docx') {
        // Extract both plain text (for preview) and HTML (for TipTap editor)
        text = await extractTextFromDocx(buffer);
        const htmlResult = await extractHtmlFromDocx(buffer);
        html = htmlResult.html;
        if (htmlResult.messages.length > 0) {
          console.log(`   DOCX conversion warnings: ${htmlResult.messages.map(m => m.message).join(', ')}`);
        }
      } else if (fileType === 'pptx') {
        text = await extractTextFromPptx(buffer);
      } else if (fileType === 'xlsx') {
        // Extract both plain text and HTML table for TipTap editor
        text = await extractTextFromXlsx(buffer);
        const htmlResult = await extractHtmlFromXlsx(buffer);
        html = htmlResult.html;
        console.log(`   Excel: ${htmlResult.sheetCount} sheets`);
      } else if (fileType === 'txt') {
        text = buffer.toString('utf-8');
      } else if (fileType === 'html') {
        const htmlResult = extractTextFromHtml(buffer.toString('utf-8'));
        text = htmlResult.text;
        title = htmlResult.title;
        html = buffer.toString('utf-8'); // Keep original HTML
      }
    } catch (extractError) {
      console.error('❌ Text extraction failed:', extractError);
      return json({
        success: false,
        error: `Failed to extract text: ${extractError.message}`
      }, { status: 400 });
    }

    // Clean up text - normalize whitespace but preserve paragraphs
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n /g, '\n')
      .replace(/ \n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    console.log(`✅ Extracted ${text.length} characters from ${fileType}`);

    return json({
      success: true,
      text,
      html: html || null, // HTML version for TipTap (DOCX, HTML files)
      title: title || file.name.replace(/\.[^/.]+$/, ''),
      fileType,
      fileName: file.name,
      fileSize: file.size,
      charCount: text.length
    });

  } catch (error) {
    console.error('❌ Document extraction error:', error);

    return json({
      success: false,
      error: error.message || 'Failed to extract text'
    }, { status: 500 });
  }
}
