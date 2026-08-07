// backend/src/config/env.js — Load and validate environment variables
import { config } from 'dotenv';
config();

export const env = {
  PORT: parseInt(process.env.PORT ?? '5000', 10),
  NODE_ENV: process.env.NODE_ENV ?? 'development',

  // PostgreSQL
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/hospital_rag',
  DB_SSL: process.env.DB_SSL === 'true',
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX ?? '10', 10),
  DB_POOL_IDLE_TIMEOUT: parseInt(process.env.DB_POOL_IDLE_TIMEOUT ?? '30000', 10),
  DB_POOL_CONNECTION_TIMEOUT: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT ?? '2000', 10),

  // Ollama
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? 'llama3.2',

  // Knowledge base
  KB_DATA_DIR: process.env.KB_DATA_DIR ?? '../data',
  MAX_RESULTS: parseInt(process.env.MAX_RESULTS ?? '5', 10),

  // Dev defaults
  DEFAULT_USER_ID: process.env.DEFAULT_USER_ID ?? '00000000-0000-0000-0000-000000000001',
};
