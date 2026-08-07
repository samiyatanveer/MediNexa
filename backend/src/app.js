// backend/src/app.js — Express application entry point
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import chatsRouter from './routes/chats.js';
import kbRouter from './routes/kb.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { checkHealth } from './config/db.js';

const app = express();

// ── Security & parsing ─────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ── Routes ─────────────────────────────────────────────────
app.use('/api/health', healthRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/kb', kbRouter);

// ── 404 / Error ────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Boot ───────────────────────────────────────────────────
const PORT = env.PORT;

async function start() {
  const db = await checkHealth();
  if (!db.ok) {
    logger.warn('PostgreSQL not reachable at startup — ensure DB is running before using chat features.');
  } else {
    logger.info('PostgreSQL connected successfully.');
  }

  app.listen(PORT, () => {
    logger.info(`Hospital RAG backend listening on http://localhost:${PORT}`);
    logger.info(`Health: http://localhost:${PORT}/api/health`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});

export default app;
