// backend/src/routes/health.js — Health check endpoint
import { Router } from 'express';
import { checkHealth } from '../config/db.js';
import { env } from '../config/env.js';
import axios from 'axios';

const router = Router();

router.get('/', async (req, res) => {
  const dbHealth = await checkHealth();

  let ollamaHealth = { ok: false, message: 'Ollama unreachable' };
  try {
    const resp = await axios.get(`${env.OLLAMA_BASE_URL}/api/tags`, { timeout: 3000 });
    const models = resp.data?.models ?? [];
    ollamaHealth = {
      ok: true,
      message: 'Ollama connected',
      model: env.OLLAMA_MODEL,
      availableModels: models.map((m) => m.name),
    };
  } catch {
    // Ollama not running — non-fatal for health check
  }

  const allOk = dbHealth.ok; // Ollama optional at boot
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      postgresql: dbHealth,
      ollama: ollamaHealth,
    },
  });
});

export default router;
