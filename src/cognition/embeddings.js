/**
 * Embeddings — Vector embedding via Gemini's free embedding API.
 * 
 * Converts text into numerical vectors for semantic search.
 * The agent doesn't know this exists — it just has better recall.
 */
export class Embeddings {
  constructor(apiKeyOrKeys) {
    this.apiKeys = Array.isArray(apiKeyOrKeys)
      ? apiKeyOrKeys.filter(Boolean)
      : [apiKeyOrKeys].filter(Boolean);
    this.currentKeyIndex = 0;
    this.model = 'text-embedding-004';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  get apiKey() { return this.apiKeys[this.currentKeyIndex]; }

  /**
   * Embed a single text string into a vector.
   * Returns a float array, or null on failure.
   */
  async embed(text) {
    for (let attempt = 0; attempt < this.apiKeys.length; attempt++) {
      const apiKey = this.apiKeys[(this.currentKeyIndex + attempt) % this.apiKeys.length];
      try {
        const url = `${this.baseUrl}/models/${this.model}:embedContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${this.model}`,
            content: { parts: [{ text }] },
          }),
        });

        if (response.status === 429) continue; // try next key
        if (!response.ok) return null;

        const data = await response.json();
        return data.embedding?.values || null;
      } catch (e) {
        if (attempt === this.apiKeys.length - 1) return null;
      }
    }
    return null;
  }

  /**
   * Cosine similarity between two vectors.
   */
  static similarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}
