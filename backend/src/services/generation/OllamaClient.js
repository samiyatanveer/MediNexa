// backend/src/services/generation/OllamaClient.js
// Calls the local Ollama /api/generate endpoint. No external LLM APIs used.

import axios from 'axios';
import { env } from '../../config/env.js';

const GENERATE_TIMEOUT_MS = 120_000; // 2 minutes

export class OllamaClient {
  constructor(baseUrl, model) {
    this.baseUrl = (baseUrl ?? env.OLLAMA_BASE_URL).replace(/\/$/, '');
    this.model   = model ?? env.OLLAMA_MODEL;
  }

  /**
   * Send a prompt to Ollama and return the full response string.
   * @param {string} prompt  Full prompt text
   * @param {{ temperature?: number, num_predict?: number }} [options]
   * @returns {Promise<{ text: string, done: boolean, model: string }>}
   */
  async generate(prompt, options = {}) {
    const payload = {
      model:  this.model,
      prompt,
      stream: false,
      options: {
        temperature:  options.temperature  ?? 0.3,
        num_predict:  options.num_predict  ?? 1024,
      },
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/generate`,
        payload,
        { timeout: GENERATE_TIMEOUT_MS }
      );

      const data = response.data;
      return {
        text:  (data.response ?? '').trim(),
        done:  data.done ?? true,
        model: data.model ?? this.model,
      };
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        throw new OllamaUnavailableError(
          `Ollama is not running at ${this.baseUrl}. Start Ollama and ensure model '${this.model}' is loaded.`
        );
      }
      if (err.response?.status === 404) {
        throw new OllamaUnavailableError(
          `Ollama model '${this.model}' not found. Run: ollama pull ${this.model}`
        );
      }
      throw new Error(`Ollama generation failed: ${err.message}`);
    }
  }

  /**
   * Check if Ollama is reachable.
   * @returns {Promise<{ ok: boolean, models?: string[], message?: string }>}
   */
  async healthCheck() {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
      return {
        ok:     true,
        models: (data.models ?? []).map(m => m.name),
      };
    } catch {
      return { ok: false, message: `Ollama unreachable at ${this.baseUrl}` };
    }
  }
}

export class OllamaUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OllamaUnavailableError';
    this.status = 503;
  }
}

export const ollamaClient = new OllamaClient();
export default OllamaClient;
