// backend/src/utils/logger.js — Structured logger using morgan/console
export const logger = {
  info: (msg, meta) => {
    const ts = new Date().toISOString();
    if (meta) console.log(`[${ts}] INFO  ${msg}`, meta);
    else console.log(`[${ts}] INFO  ${msg}`);
  },
  warn: (msg, meta) => {
    const ts = new Date().toISOString();
    if (meta) console.warn(`[${ts}] WARN  ${msg}`, meta);
    else console.warn(`[${ts}] WARN  ${msg}`);
  },
  error: (msg, meta) => {
    const ts = new Date().toISOString();
    if (meta) console.error(`[${ts}] ERROR ${msg}`, meta);
    else console.error(`[${ts}] ERROR ${msg}`);
  },
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') {
      const ts = new Date().toISOString();
      if (meta) console.debug(`[${ts}] DEBUG ${msg}`, meta);
      else console.debug(`[${ts}] DEBUG ${msg}`);
    }
  },
};
