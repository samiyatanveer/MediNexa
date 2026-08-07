// frontend/src/services/api.js
// Typed API helpers for all backend endpoints.

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

const http = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120_000,
});

// ── Error normalisation ────────────────────────────────────────────────────────
function apiError(err) {
  const msg =
    err?.response?.data?.error?.message ??
    err?.response?.data?.message ??
    err?.message ??
    'Unknown error';
  const status = err?.response?.status ?? 0;
  const error = new Error(msg);
  error.status = status;
  return error;
}

// ── Health ────────────────────────────────────────────────────────────────────
export async function healthCheck() {
  try {
    const { data } = await http.get('/api/health');
    return data;
  } catch (err) { throw apiError(err); }
}

// ── Chat sessions ─────────────────────────────────────────────────────────────
export async function listChats() {
  try {
    const { data } = await http.get('/api/chats');
    return data; // { sessions, count }
  } catch (err) { throw apiError(err); }
}

export async function createChat(firstQuery) {
  try {
    const body = firstQuery ? { firstQuery } : {};
    const { data } = await http.post('/api/chats', body);
    return data; // { session }
  } catch (err) { throw apiError(err); }
}

export async function getChat(chatId) {
  try {
    const { data } = await http.get(`/api/chats/${chatId}`);
    return data; // { session }
  } catch (err) { throw apiError(err); }
}

export async function renameChat(chatId, title) {
  try {
    const { data } = await http.patch(`/api/chats/${chatId}`, { title });
    return data; // { session }
  } catch (err) { throw apiError(err); }
}

export async function deleteChat(chatId) {
  try {
    await http.delete(`/api/chats/${chatId}`);
    return true;
  } catch (err) { throw apiError(err); }
}

// ── Chat messages ─────────────────────────────────────────────────────────────
export async function sendMessage(chatId, content, category = 'auto') {
  try {
    const { data } = await http.post(`/api/chats/${chatId}/messages`, { content, category });
    return data; // { userMessage, assistantMessage, formatted, retrieval, ollamaAvailable }
  } catch (err) { throw apiError(err); }
}

export async function getMessages(chatId) {
  try {
    const { data } = await http.get(`/api/chats/${chatId}/messages`);
    return data; // { session, messages, count }
  } catch (err) { throw apiError(err); }
}

// ── KB Browse ─────────────────────────────────────────────────────────────────
export async function browseKB(category, page = 1, limit = 20) {
  try {
    const { data } = await http.get(`/api/kb/${category}`, { params: { page, limit } });
    return data; // { category, total, page, totalPages, limit, count, records }
  } catch (err) { throw apiError(err); }
}

export async function searchKB(category, q, limit = 20) {
  try {
    const { data } = await http.get(`/api/kb/${category}`, { params: { q, limit } });
    return data; // { category, query, results, noResults, count }
  } catch (err) { throw apiError(err); }
}

export async function getKBSummary() {
  try {
    const { data } = await http.get('/api/kb');
    return data; // { categories, total }
  } catch (err) { throw apiError(err); }
}
