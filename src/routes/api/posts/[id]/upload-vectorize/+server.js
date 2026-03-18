/**
 * POST /api/posts/[id]/upload-vectorize
 * Upload a document file and vectorize it for the post
 *
 * Accepts: PDF, Word (.docx), Excel (.xlsx, .xls), PowerPoint (.pptx), Text (.txt), HTML (.html)
 */

import { json } from '@sveltejs/kit';
import { blogDB, chunksDB } from '$lib/db.js';
import { canWritePost } from '$lib/server/permissions.js';
import { extractTextFromPdf, extractTextFromDocx, extractTextFromHtml, extractTextFromPptx, extractTextFromXlsx } from '$lib/server/documents.js';
import { chunkText, getChunkStats } from '$lib/server/chunker.js';
import { generateEmbeddings } from '$lib/server/embeddings.js';

// Max file size: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST({ params, request, locals }) {
  // Require authentication
  if (!locals.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  const postId = parseInt(params.id);

  if (isNaN(postId)) {
    return json({
      success: false,
      error: 'Invalid post ID'
    }, { status: 400 });
  }

  try {
    // Check permissions
    const canWrite = await canWritePost(postId, locals.user.id, locals.user.role);
    if (!canWrite) {
      return json({
        success: false,
        error: 'You do not have permission to modify this post'
      }, { status: 403 });
    }

    // Get the post
    const post = await blogDB.getPostById(postId);
    if (!post) {
      return json({
        success: false,
        error: 'Post not found'
      }, { status: 404 });
    }

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

    let sourceType = 'unknown';
    if (fileName.endsWith('.pdf') || mimeType === 'application/pdf') {
      sourceType = 'pdf';
    } else if (fileName.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      sourceType = 'docx';
    } else if (fileName.endsWith('.pptx') || mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      sourceType = 'pptx';
    } else if (fileName.endsWith('.xlsx') || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      sourceType = 'xlsx';
    } else if (fileName.endsWith('.xls') || mimeType === 'application/vnd.ms-excel') {
      sourceType = 'xlsx';
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
      sourceType = 'txt';
    } else if (fileName.endsWith('.html') || fileName.endsWith('.htm') || mimeType === 'text/html') {
      sourceType = 'html';
    } else {
      return json({
        success: false,
        error: 'Unsupported file type. Supported: PDF, DOCX, XLSX, XLS, PPTX, TXT, HTML'
      }, { status: 400 });
    }

    console.log(`📤 Processing uploaded file: ${file.name} (${sourceType}, ${(file.size / 1024).toFixed(1)}KB)`);

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text based on file type
    let text = '';

    try {
      if (sourceType === 'pdf') {
        text = await extractTextFromPdf(buffer);
      } else if (sourceType === 'docx') {
        text = await extractTextFromDocx(buffer);
      } else if (sourceType === 'pptx') {
        text = await extractTextFromPptx(buffer);
      } else if (sourceType === 'xlsx') {
        text = await extractTextFromXlsx(buffer);
      } else if (sourceType === 'txt') {
        text = buffer.toString('utf-8');
      } else if (sourceType === 'html') {
        const htmlResult = extractTextFromHtml(buffer.toString('utf-8'));
        text = htmlResult.text;
      }
    } catch (extractError) {
      console.error('❌ Text extraction failed:', extractError);
      return json({
        success: false,
        error: `Failed to extract text from ${sourceType.toUpperCase()}: ${extractError.message}`
      }, { status: 400 });
    }

    console.log(`✅ Extracted ${text.length} characters from ${sourceType}`);

    // Validate we have content to vectorize
    if (!text || text.length < 50) {
      return json({
        success: false,
        error: 'Not enough content to vectorize (minimum 50 characters)'
      }, { status: 400 });
    }

    // Chunk the text
    console.log('✂️ Chunking text...');
    const chunks = chunkText(text, { chunkSize: 500, overlap: 50 });
    const stats = getChunkStats(chunks);
    console.log(`   Created ${stats.count} chunks (avg ${stats.avgLength} chars)`);

    if (chunks.length === 0) {
      return json({
        success: false,
        error: 'Could not create any text chunks'
      }, { status: 400 });
    }

    // Generate embeddings
    console.log('🧠 Generating embeddings...');
    const embeddings = await generateEmbeddings(chunks);
    console.log(`   Generated ${embeddings.length} embeddings`);

    // Save to database
    console.log('💾 Saving to database...');
    await chunksDB.saveChunks(postId, chunks, embeddings, sourceType);

    console.log(`✅ Upload and vectorization complete for post ${postId}`);

    return json({
      success: true,
      message: 'File uploaded and vectorized successfully',
      stats: {
        fileName: file.name,
        fileSize: file.size,
        sourceType,
        chunkCount: chunks.length,
        avgChunkLength: stats.avgLength,
        textLength: text.length
      }
    });

  } catch (error) {
    console.error('❌ Upload/vectorization error:', error);

    return json({
      success: false,
      error: error.message || 'Failed to process file'
    }, { status: 500 });
  }
}
