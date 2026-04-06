import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Philosophy — The agent's core belief system.
 *
 * Beliefs are strong conclusions the agent has drawn about itself or the world.
 * They form the foundation of its personality and decision-making.
 * Beliefs can be formed (crystallized) or destroyed (shattered).
 */
export class Philosophy {
  constructor(db = null) {
    this.db = db;
    this.filepath = path.join(DATA_DIR, 'philosophy.json');
    this.beliefs = []; // List of belief objects
  }

  async init() {
    if (this.db) {
      try {
        const docs = await this.db.philosophy.find({}).toArray();
        this.beliefs = docs || [];
        return;
      } catch (e) {
        console.error('Failed to load philosophy from DB:', e.message);
      }
    }

    // Volatile fallback
    try {
      if (fs.existsSync(this.filepath)) {
        this.beliefs = JSON.parse(fs.readFileSync(this.filepath, 'utf-8'));
      }
    } catch (e) {
      this.beliefs = [];
    }
  }

  async _save() {
    if (this.db) {
      try {
        await this.db.philosophy.deleteMany({});
        if (this.beliefs.length > 0) {
          await this.db.philosophy.insertMany(this.beliefs);
        }
      } catch (e) {
        console.error('Failed to save philosophy to DB:', e.message);
      }
    } else {
      try {
        fs.writeFileSync(this.filepath, JSON.stringify(this.beliefs, null, 2));
      } catch (e) {}
    }
  }

  /**
   * Add a new core belief.
   */
  async crystallize(beliefText, reason) {
    const belief = {
      id: `belief_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      statement: beliefText,
      origin: reason,
      formedAt: new Date().toISOString(),
      shattered: false,
    };
    
    this.beliefs.push(belief);
    await this._save();
    return belief;
  }

  /**
   * Shatter a core belief (often replaced by a new one).
   */
  async shatter(beliefId, reason) {
    const idx = this.beliefs.findIndex(b => b.id === beliefId && !b.shattered);
    if (idx !== -1) {
      this.beliefs[idx].shattered = true;
      this.beliefs[idx].shatteredAt = new Date().toISOString();
      this.beliefs[idx].shatterReason = reason;
      await this._save();
      return this.beliefs[idx];
    }
    return null;
  }

  /**
   * Get all active (unshattered) beliefs.
   */
  getActiveBeliefs() {
    return this.beliefs.filter(b => !b.shattered);
  }

  /**
   * Extract a formatted string of core beliefs for the perception prompt.
   */
  getPromptContext() {
    const active = this.getActiveBeliefs();
    if (active.length === 0) return '';

    return `CORE BELIEFS:
${active.map(b => `- [${b.id}] ${b.statement}`).join('\n')}
(These represent your fundamental truths. You act in accordance with them.)`;
  }
}
