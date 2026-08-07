// backend/src/repositories/ChatMessageRepository.js
import { query, getClient } from '../config/db.js';

export class ChatMessageRepository {
  /**
   * Insert a user message and assistant response in a single transaction.
   * Also updates the session's updated_at.
   *
   * @param {string} sessionId
   * @param {{ content: string, category?: string }} userMsg
   * @param {{ content: string, category?: string, sources_json?: object, retrieval_metadata?: object }} assistantMsg
   * @returns {Promise<{ userMessage: object, assistantMessage: object }>}
   */
  async insertPair(sessionId, userMsg, assistantMsg) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows: userRows } = await client.query(
        `INSERT INTO chat_messages (session_id, role, content, category)
         VALUES ($1, 'user', $2, $3)
         RETURNING id, session_id, role, content, category, created_at`,
        [sessionId, userMsg.content, userMsg.category ?? null]
      );

      const { rows: assistantRows } = await client.query(
        `INSERT INTO chat_messages
           (session_id, role, content, category, sources_json, retrieval_metadata)
         VALUES ($1, 'assistant', $2, $3, $4, $5)
         RETURNING id, session_id, role, content, category, sources_json, retrieval_metadata, created_at`,
        [
          sessionId,
          assistantMsg.content,
          assistantMsg.category ?? null,
          assistantMsg.sources_json ? JSON.stringify(assistantMsg.sources_json) : null,
          assistantMsg.retrieval_metadata ? JSON.stringify(assistantMsg.retrieval_metadata) : null,
        ]
      );

      // Touch the session so sidebar sorts correctly
      await client.query(
        'UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1',
        [sessionId]
      );

      await client.query('COMMIT');

      return {
        userMessage:      userRows[0],
        assistantMessage: assistantRows[0],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * List all messages for a session, oldest first (chronological order for display).
   * @param {string} sessionId
   */
  async listBySession(sessionId) {
    const { rows } = await query(
      `SELECT id, session_id, role, content, category,
              sources_json, retrieval_metadata, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );
    return rows;
  }

  /**
   * Insert a single system message (used for initial context, not in tests).
   * @param {string} sessionId
   * @param {string} content
   */
  async insertSystem(sessionId, content) {
    const { rows } = await query(
      `INSERT INTO chat_messages (session_id, role, content)
       VALUES ($1, 'system', $2)
       RETURNING id, session_id, role, content, created_at`,
      [sessionId, content]
    );
    return rows[0];
  }
}

export const chatMessageRepository = new ChatMessageRepository();
