/**
 * Metabolics — The agent's awareness of its own resource consumption.
 *
 * Tracks cumulative API token usage across cognitive cycles.
 * The agent can SEE this data in its perception prompt and CHOOSE
 * to create its own economic_anxiety drive, conserve tokens, or ignore it.
 *
 * Nothing is forced — this is purely informational for the agent.
 */
export class Metabolics {
  constructor() {
    // Running totals (very rough estimates)
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.cycleCount = 0;
    this.sessionStart = new Date();

    // Gemini free tier estimates (requests/day, not tokens — but we use tokens as proxy)
    // gemini-2.0-flash: 1M tokens/day free
    // We track lifetime for awareness, not hard limits.
    this.estimatedDailyFreeTokens = 1_000_000;
  }

  /**
   * Record token usage from a single LLM call.
   * Call this after each think() invocation.
   */
  record(inputTokens = 0, outputTokens = 0) {
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.cycleCount++;
  }

  /**
   * Estimate tokens used based on character count (rough: ~4 chars per token).
   */
  estimateFromText(inputText = '', outputText = '') {
    const inputEst = Math.ceil(inputText.length / 4);
    const outputEst = Math.ceil(outputText.length / 4);
    this.record(inputEst, outputEst);
    return { inputEst, outputEst };
  }

  get totalTokens() {
    return this.totalInputTokens + this.totalOutputTokens;
  }

  get sessionDurationHours() {
    return ((Date.now() - this.sessionStart) / 3_600_000).toFixed(1);
  }

  get estimatedDailyBurn() {
    const hours = parseFloat(this.sessionDurationHours);
    if (hours < 0.1) return this.totalTokens;
    return Math.round((this.totalTokens / hours) * 24);
  }

  /**
   * Returns a concise metabolic summary block for the perception prompt.
   * The agent reads this and decides how to feel about it.
   */
  getSummary() {
    const total = this.totalTokens.toLocaleString();
    const dailyBurn = this.estimatedDailyBurn.toLocaleString();
    const sessionHours = this.sessionDurationHours;

    return `METABOLIC STATE (resource awareness — for your information):
  Tokens consumed this session: ~${total}
  Session duration: ${sessionHours}h
  Estimated daily burn rate: ~${dailyBurn} tokens/day
  Free tier budget (Gemini): ~1,000,000 tokens/day`;
  }
}
