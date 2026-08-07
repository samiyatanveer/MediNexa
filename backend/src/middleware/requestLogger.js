// backend/src/middleware/requestLogger.js — HTTP request logging middleware
import morgan from 'morgan';

const format = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
export const requestLogger = morgan(format);
