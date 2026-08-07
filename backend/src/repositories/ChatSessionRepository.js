// backend/src/repositories/ChatSessionRepository.js
import { query, getClient } from '../config/db.js';

export class ChatSessionRepository {
  /**
   * Create a new chat session.
   * @param {string} userId
   * @param {string} title
   */
  async create(userId, title = 'New Chat') {
    const { rows } = await query(
      `INSERT INTO chat_sessions (user_id, title)
       VALUES ($1, $2)
       RETURNING id, user_id, title, created_at, updated_at`,
      [userId, title]
    );
    return rows[0];
  }

  /**
   * List all sessions for a user, newest first.
   * @param {string} userId
   */
  async list(userId) {
    const { rows } = await query(
      `SELECT id, user_id, title, created_at, updated_at
       FROM chat_sessions
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Get a single session by ID.
   * @param {string} id
   */
  async getById(id) {
    const { rows } = await query(
      `SELECT id, user_id, title, created_at, updated_at
       FROM chat_sessions WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  /**
   * Rename a session.
   * @param {string} id
   * @param {string} title
   */
  async rename(id, title) {
    const { rows } = await query(
      `UPDATE chat_sessions SET title = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, title, updated_at`,
      [title, id]
    );
    return rows[0] ?? null;
  }

  /**
   * Delete a session (cascade deletes messages).
   * @param {string} id
   */
  async deleteById(id) {
    const { rowCount } = await query(
      'DELETE FROM chat_sessions WHERE id = $1',
      [id]
    );
    return rowCount > 0;
  }

  /**
   * Touch updated_at — called after a new message is inserted.
   * @param {string} id
   */
  async touch(id) {
    await query(
      'UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1',
      [id]
    );
  }
}

export const chatSessionRepository = new ChatSessionRepository();
