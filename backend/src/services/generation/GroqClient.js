// Backend-only Groq generation client. The API key is read exclusively from env.
import Groq from 'groq-sdk';
import { env } from '../../config/env.js';

const GENERATE_TIMEOUT_MS = 120_000;

export class GroqClient {
  constructor(apiKey, model, client) {
    this.apiKey = apiKey ?? env.GROQ_API_KEY;
    this.model = model ?? env.GROQ_MODEL;
    this.client = client ?? (this.apiKey ? new Groq({ apiKey: this.apiKey, timeout: GENERATE_TIMEOUT_MS }) : null);
  }

  async generate(prompt, options = {}) {
    if (!this.client) throw new GroqUnavailableError('Groq is not configured. Set GROQ_API_KEY in the backend environment.');
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.3,
        max_completion_tokens: options.num_predict ?? 1024,
      });
      const text = completion.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('Groq returned an empty response');
      return { text, done: true, model: completion.model ?? this.model };
    } catch (err) {
      if (err instanceof GroqUnavailableError) throw err;
      throw new GroqUnavailableError(`Groq generation failed: ${err.message}`);
    }
  }

  async healthCheck() {
    if (!this.client) return { ok: false, message: 'Groq API key is not configured' };
    try {
      await this.client.models.list();
      return { ok: true, message: 'Groq connected', model: this.model };
    } catch (err) {
      return { ok: false, message: `Groq unavailable: ${err.message}` };
    }
  }
}

export class GroqUnavailableError extends Error {
  constructor(message) { super(message); this.name = 'GroqUnavailableError'; this.status = 503; }
}

export const groqClient = new GroqClient();
export default GroqClient;
