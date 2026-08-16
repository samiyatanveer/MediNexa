// backend/src/routes/health.js — Health check endpoint
import { Router } from 'express';
import { checkHealth } from '../config/db.js';
import { groqClient } from '../services/generation/GroqClient.js';

const router = Router();

router.get('/', async (req, res) => {
  const dbHealth = await checkHealth();

  const groqHealth = await groqClient.healthCheck();

  const allOk = dbHealth.ok; // Groq is non-fatal because retrieval fallback is preserved
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      postgresql: dbHealth,
      groq: groqHealth,
    },
  });
});

export default router;
