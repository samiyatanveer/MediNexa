// backend/src/routes/chats.js — Full chat session + message routes (Account 3)
import { Router } from 'express';
import { chatSessionRepository } from '../repositories/ChatSessionRepository.js';
import { chatMessageRepository }  from '../repositories/ChatMessageRepository.js';
import { userRepository }         from '../repositories/UserRepository.js';
import { ChatService, generateTitle } from '../services/chat/ChatService.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const router = Router();
const chatService = new ChatService();

// ── Auth middleware (single-user dev mode) ────────────────────────────────────
// Resolves the current user from the default env UUID (single-user development mode).
// Replace with JWT/session auth for multi-user production deployment.
async function resolveUser(req, res, next) {
  try {
    req.user = await userRepository.getOrCreateDefault();
    next();
  } catch (err) {
    logger.error('Failed to resolve user', err.message);
    res.status(503).json({ error: { message: 'Database unavailable — cannot resolve user', status: 503 } });
  }
}

router.use(resolveUser);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chats — Create a new chat session
// Body: { title?: string, firstQuery?: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { title, firstQuery } = req.body ?? {};
    const resolvedTitle = title?.trim()
      || (firstQuery ? generateTitle(firstQuery) : 'New Chat');

    const session = await chatSessionRepository.create(req.user.id, resolvedTitle);
    res.status(201).json({ session });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chats — List all chat sessions for user (newest first)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const sessions = await chatSessionRepository.list(req.user.id);
    res.json({ sessions, count: sessions.length });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chats/:chatId — Get a single session
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:chatId', async (req, res, next) => {
  try {
    const session = await chatSessionRepository.getById(req.params.chatId);
    if (!session) return res.status(404).json({ error: { message: 'Chat session not found', status: 404 } });
    res.json({ session });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/chats/:chatId — Rename a chat session
// Body: { title: string }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:chatId', async (req, res, next) => {
  try {
    const { title } = req.body ?? {};
    if (!title?.trim()) {
      return res.status(400).json({ error: { message: "'title' is required", status: 400 } });
    }
    const session = await chatSessionRepository.rename(req.params.chatId, title.trim());
    if (!session) return res.status(404).json({ error: { message: 'Chat session not found', status: 404 } });
    res.json({ session });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/chats/:chatId — Delete a session (cascade deletes messages)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:chatId', async (req, res, next) => {
  try {
    const deleted = await chatSessionRepository.deleteById(req.params.chatId);
    if (!deleted) return res.status(404).json({ error: { message: 'Chat session not found', status: 404 } });
    res.status(204).send();
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chats/:chatId/messages — Full RAG pipeline: user message → response
// Body: { content: string, category?: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:chatId/messages', async (req, res, next) => {
  try {
    const { content, category } = req.body ?? {};
    if (!content?.trim()) {
      return res.status(400).json({ error: { message: "'content' is required", status: 400 } });
    }

    const result = await chatService.processMessage(
      req.params.chatId,
      content.trim(),
      category ?? 'auto'
    );

    res.status(201).json({
      userMessage:    result.userMessage,
      assistantMessage: result.assistantMessage,
      formatted:      result.formatted,
      retrieval:      result.retrieval,
      ollamaAvailable: result.ollamaAvailable,
    });
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: { message: err.message, status: 404 } });
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chats/:chatId/messages — List messages (history restore)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:chatId/messages', async (req, res, next) => {
  try {
    const session = await chatSessionRepository.getById(req.params.chatId);
    if (!session) return res.status(404).json({ error: { message: 'Chat session not found', status: 404 } });

    const messages = await chatMessageRepository.listBySession(req.params.chatId);
    res.json({ session, messages, count: messages.length });
  } catch (err) { next(err); }
});

export default router;
