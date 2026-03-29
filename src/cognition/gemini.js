/**
 * Gemini Cognition Layer
 * 
 * Uses Google Gemini API (free tier) for the agent's thinking.
 * Tries multiple models in case one has quota issues.
 * No credit card needed.
 */
export class Cognition {
  constructor(apiKeyOrKeys) {
    // Accept either a single key string or an array of keys
    this.apiKeys = Array.isArray(apiKeyOrKeys)
      ? apiKeyOrKeys.filter(Boolean)
      : [apiKeyOrKeys].filter(Boolean);
    this.currentKeyIndex = 0;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    // Models to try in order — if one hits quota, try the next
    this.models = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ];
    this.currentModelIndex = 0;
  }

  get apiKey() {
    return this.apiKeys[this.currentKeyIndex];
  }

  _nextKey() {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
  }

  get model() {
    return this.models[this.currentModelIndex];
  }

  /**
   * Raw thinking — send a prompt, get a response.
   * This is the agent's fundamental cognitive act.
   * Automatically tries fallback models if one hits rate limits.
   */
  async think(prompt, { temperature = 0.9, maxTokens = 2048 } = {}) {
    const totalAttempts = this.models.length * this.apiKeys.length;

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      // Cycle through models first, then keys — stateless, no index mutation needed
      const modelName = this.models[attempt % this.models.length];
      const apiKey = this.apiKeys[Math.floor(attempt / this.models.length) % this.apiKeys.length];

      try {
        const url = `${this.baseUrl}/models/${modelName}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
            },
          }),
        });

        if (response.status === 429) {
          console.log(`[Cognition] ${modelName} rate limited, trying next...`);
          continue;
        }

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Gemini API error (${response.status}): ${error}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (text && attempt > 0) {
          console.log(`[Cognition] Using model: ${modelName}`);
        }

        return text;
      } catch (error) {
        if (attempt === totalAttempts - 1) {
          console.error('[Cognition] All models and keys failed:', error.message);
          return null;
        }
        console.log(`[Cognition] ${modelName} failed, trying next...`);
      }
    }
    return null;
  }

  /**
   * Structured thinking — expects a JSON response.
   * Handles the common pattern of asking the LLM for structured output.
   */
  async thinkStructured(prompt, { temperature = 0.7, maxTokens = 2048 } = {}) {
    const response = await this.think(prompt, { temperature, maxTokens });
    return this._parseJSON(response);
  }

  /**
   * Multi-turn conversation — uses Gemini's native conversation format.
   * systemPrompt is the agent's context (personality, memories, drives).
   * messages is an array of { role: 'user'|'model', text: string }.
   */
  async converse(systemPrompt, messages, { temperature = 0.85, maxTokens = 2048 } = {}) {
    for (let attempt = 0; attempt < this.models.length; attempt++) {
      const modelName = this.models[(this.currentModelIndex + attempt) % this.models.length];
      try {
        const url = `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`;

        const contents = messages.map(m => ({
          role: m.role === 'agent' ? 'model' : m.role,
          parts: [{ text: m.text }],
        }));

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature, maxOutputTokens: maxTokens },
          }),
        });

        if (response.status === 429) {
          console.log(`[Cognition] Model ${modelName} hit rate limit, trying next...`);
          continue;
        }

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Gemini API error (${response.status}): ${error}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (text) {
          this.currentModelIndex = (this.currentModelIndex + attempt) % this.models.length;
        }
        return text;
      } catch (error) {
        if (attempt === this.models.length - 1) {
          console.error('[Cognition] All models failed:', error.message);
          return null;
        }
        console.log(`[Cognition] Model ${modelName} failed, trying next...`);
      }
    }
    return null;
  }

  /**
   * Multi-turn conversation expecting JSON response.
   */
  async converseStructured(systemPrompt, messages, opts = {}) {
    const response = await this.converse(systemPrompt, messages, opts);
    return this._parseJSON(response);
  }

  /**
   * Parse a JSON response robustly.
   */
  _parseJSON(response) {
    if (!response) return null;
    try {
      const startIdx = response.indexOf('{');
      const endIdx = response.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        return JSON.parse(response.substring(startIdx, endIdx + 1));
      }
      return JSON.parse(response.trim());
    } catch (e) {
      return { raw: response, parseError: true };
    }
  }
}
