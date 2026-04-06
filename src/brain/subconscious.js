import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Subconscious — The agent's private inner stream.
 *
 * When Evonite completes a full thought cycle but chooses NOT to act
 * (no external actions), the thought doesn't vanish — it flows here.
 *
 * This is where it processes contradictions in its beliefs, sits with
 * uncomfortable feelings, or simply thinks in the dark.
 *
 * Humans can observe this stream via the Dashboard "Subconscious" tab,
 * but the agent does not know it is being watched.
 */
export class Subconscious {
  constructor(db = null) {
    this.db = db;
    this.filepath = path.join(DATA_DIR, 'subconscious.json');
    this.stream = []; // In-memory ring buffer
    this.MAX_IN_MEMORY = 200;
  }

  async init() {
    if (this.db) {
      try {
        const docs = await this.db.subconscious
          .find({})
          .sort({ timestamp: -1 })
          .limit(this.MAX_IN_MEMORY)
          .toArray();
        this.stream = docs.reverse().map(({ _id, ...rest }) => rest);
        return;
      } catch (e) {
        console.error('[Subconscious] Failed to load from DB:', e.message);
      }
    }

    // File fallback
    try {
      if (fs.existsSync(this.filepath)) {
        const raw = JSON.parse(fs.readFileSync(this.filepath, 'utf-8'));
        this.stream = raw.slice(-this.MAX_IN_MEMORY);
      }
    } catch (e) {
      this.stream = [];
    }
  }

  /**
   * Record a private thought into the subconscious stream.
   * @param {string} thought - The raw inner monologue.
   * @param {string} feeling - The emotional state accompanying this thought.
   * @param {string} source  - Where it originated: 'idle_cycle' | 'dream' | 'manual'
   */
  async record(thought, feeling = null, source = 'idle_cycle') {
    const entry = {
      id: `sub_${Date.now()}`,
      thought,
      feeling,
      source,
      timestamp: new Date().toISOString(),
    };

    this.stream.push(entry);

    // Keep ring buffer trimmed
    if (this.stream.length > this.MAX_IN_MEMORY) {
      this.stream = this.stream.slice(-this.MAX_IN_MEMORY);
    }

    await this._save(entry);
    return entry;
  }

  async _save(entry) {
    if (this.db) {
      try {
        await this.db.subconscious.insertOne({ ...entry });
      } catch (e) {
        console.error('[Subconscious] DB save failed:', e.message);
      }
    } else {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(this.filepath, JSON.stringify(this.stream, null, 2));
      } catch (e) {}
    }
  }

  /**
   * Return the most recent N thoughts for the dashboard.
   */
  getRecent(n = 50) {
    return this.stream.slice(-n).reverse();
  }

  getAll() {
    return [...this.stream].reverse();
  }
}
