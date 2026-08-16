// frontend/src/hooks/useHealth.js
// Polls the backend health endpoint.
import { useState, useEffect } from 'react';
import * as api from '../services/api.js';

export function useHealth(intervalMs = 30_000) {
  const [health, setHealth] = useState({
    db: null,
    groq: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const data = await api.healthCheck();

        if (!cancelled) {
          setHealth({
            db: data?.services?.postgresql ?? { ok: false },
            groq: data?.services?.groq ?? { ok: false },
            loading: false,
          });
        }
      } catch {
        if (!cancelled) {
          setHealth({
            db: { ok: false },
            groq: { ok: false },
            loading: false,
          });
        }
      }
    }

    check();

    const id = setInterval(check, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return health;
}
