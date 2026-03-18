/**
 * POST /api/chat/save
 * Save a chat conversation as a post
 *
 * Body:
 * - messages: Array of { role, content, sources? }
 * - title: Optional title (auto-generated if not provided)
 * - category: Optional category (default: 'chat-logs')
 * - vectorize: Whether to vectorize (default: true)
 */

import { json } from '@sveltejs/kit';
import { blogDB, chunksDB } from '$lib/db.js';
import { chunkText, getChunkStats } from '$lib/server/chunker.js';
import { generateEmbeddings } from '$lib/server/embeddings.js';

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
      messages,
      title,
      category = 'chat-logs',
      vectorize = true
    } = body;

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return json({
        success: false,
        error: 'Messages array is required'
      }, { status: 400 });
    }

    // Filter out empty messages
    const validMessages = messages.filter(m => m.content && m.content.trim());
    if (validMessages.length === 0) {
      return json({
        success: false,
        error: 'No valid messages to save'
      }, { status: 400 });
    }

    // Generate title from first user message if not provided
    const firstUserMessage = validMessages.find(m => m.role === 'user');
    const postTitle = title || generateTitle(firstUserMessage?.content || 'Chat conversation');

    // Format messages as HTML
    const htmlContent = formatChatAsHtml(validMessages);

    // Extract plain text for vectorization
    const plainText = formatChatAsText(validMessages);

    console.log(`💬 Saving chat as post: "${postTitle}" (${validMessages.length} messages)`);

    // Create the post
    const postResult = await blogDB.createPost({
      title: postTitle,
      content: htmlContent,
      category: category,
      visibility: 'private',
      source_type: 'chat'
    }, locals.user.id);

    const post = postResult.post;
    console.log(`✅ Created post ${post.id}: "${postTitle}"`);

    // Vectorize if requested
    let vectorStats = null;
    if (vectorize && plainText.length >= 100) {
      console.log('✂️ Chunking chat content...');
      const chunks = chunkText(plainText, { chunkSize: 500, overlap: 50 });
      const stats = getChunkStats(chunks);
      console.log(`   Created ${stats.count} chunks`);

      if (chunks.length > 0) {
        console.log('🧠 Generating embeddings...');
        const embeddings = await generateEmbeddings(chunks);
        console.log(`   Generated ${embeddings.length} embeddings`);

        console.log('💾 Saving chunks...');
        await chunksDB.saveChunks(post.id, chunks, embeddings, 'chat');

        vectorStats = {
          chunkCount: chunks.length,
          avgChunkLength: stats.avgLength
        };
      }
    }

    console.log(`✅ Chat saved successfully`);

    return json({
      success: true,
      message: 'Chat saved as post',
      post: {
        id: post.id,
        title: post.title,
        slug: post.slug,
        category: post.category
      },
      stats: {
        messageCount: validMessages.length,
        contentLength: htmlContent.length,
        ...vectorStats
      }
    });

  } catch (error) {
    console.error('❌ Save chat error:', error);
    return json({
      success: false,
      error: error.message || 'Failed to save chat'
    }, { status: 500 });
  }
}

/**
 * Generate a title from the first user message
 */
function generateTitle(message) {
  // Take first 50 chars, cut at word boundary
  let title = message.substring(0, 60).trim();
  if (message.length > 60) {
    const lastSpace = title.lastIndexOf(' ');
    if (lastSpace > 30) {
      title = title.substring(0, lastSpace);
    }
    title += '...';
  }
  return `Chat: ${title}`;
}

/**
 * Format chat messages as HTML for TipTap
 */
function formatChatAsHtml(messages) {
  const parts = [];

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'Question' : 'Answer';
    const roleClass = msg.role === 'user' ? 'chat-user' : 'chat-assistant';

    // Format content - preserve line breaks
    const content = msg.content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line)
      .map(line => `<p>${escapeHtml(line)}</p>`)
      .join('');

    parts.push(`<div class="${roleClass}"><p><strong>${role}:</strong></p>${content}</div>`);

    // Add sources if present
    if (msg.sources && msg.sources.length > 0) {
      const sourceLinks = msg.sources
        .map(s => `<a href="/blog/${s.slug}">${escapeHtml(s.title)}</a>`)
        .join(', ');
      parts.push(`<p><em>Sources: ${sourceLinks}</em></p>`);
    }
  }

  return parts.join('\n\n');
}

/**
 * Format chat messages as plain text for vectorization
 */
function formatChatAsText(messages) {
  const parts = [];

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'Question' : 'Answer';
    parts.push(`${role}: ${msg.content}`);

    if (msg.sources && msg.sources.length > 0) {
      const sources = msg.sources.map(s => s.title).join(', ');
      parts.push(`Sources: ${sources}`);
    }
  }

  return parts.join('\n\n');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
