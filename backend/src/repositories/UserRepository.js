// backend/src/repositories/UserRepository.js
import { query } from '../config/db.js';
import { env } from '../config/env.js';

export class UserRepository {
  /**
   * Return the default development user, creating it if absent.
   * @returns {Promise<{id:string, display_name:string, email:string}>}
   */
  async getOrCreateDefault() {
    const id = env.DEFAULT_USER_ID;
    const { rows } = await query(
      `INSERT INTO users (id, display_name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
       RETURNING id, display_name, email, created_at`,
      [id, 'Hospital Staff', 'staff@houston-hospital.local']
    );
    return rows[0];
  }

  /** @param {string} id */
  async getById(id) {
    const { rows } = await query(
      'SELECT id, display_name, email, created_at FROM users WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  }
}

export const userRepository = new UserRepository();
