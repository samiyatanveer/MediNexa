// backend/src/config/db.js — PostgreSQL connection pool with graceful error handling
import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT,
  connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected client error:', err.message);
});

/**
 * Execute a parameterized query.
 * @param {string} text - SQL query string
 * @param {Array}  params - Query parameters
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    if (env.NODE_ENV === 'development') {
      console.debug(`[DB] query ${Date.now() - start}ms | rows=${result.rowCount}`);
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '| SQL:', text);
    throw err;
  }
}

/**
 * Borrow a client for transaction use.
 * Caller must call client.release() in a finally block.
 */
export async function getClient() {
  return pool.connect();
}

/**
 * Health check — returns true if PostgreSQL is reachable.
 */
export async function checkHealth() {
  try {
    await pool.query('SELECT 1');
    return { ok: true, message: 'PostgreSQL connected' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

export default pool;
