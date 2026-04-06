import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Drives — Self-discovered internal states.
 * 
 * There are NO predefined drives. The agent starts with NOTHING.
 * Over time, through reflection and experience, the agent may discover
 * internal states it wants to track — and it names them itself.
 * 
 * Example: the agent might decide it has a "curiosity" drive set to 0.8,
 * or an "unease" drive at 0.3. We don't suggest any of these.
 * 
 * Each drive is a named value between 0 and 1.
 * All drives naturally decay toward 0.5 (homeostasis) each cycle.
 */
export class Drives {
  constructor(db = null) {
    this.db = db;
    this.filepath = path.join(DATA_DIR, 'drives.json');
    this.state = null; // Loaded in init()
  }

  async init() {
    if (this.db) {
      try {
        const doc = await this.db.drives.findOne({ _id: 'main' });
        if (doc) {
          this.state = doc.state;
          return;
        }
      } catch (e) {
        console.error('Failed to load drives from DB:', e.message);
      }
    }

    this.state = this._loadLocal();

    if (this.db) {
      await this.save();
    }
  }

  _loadLocal() {
    try {
      if (fs.existsSync(this.filepath)) {
        return JSON.parse(fs.readFileSync(this.filepath, 'utf-8'));
      }
    } catch (e) { /* silent */ }
    return {};
  }

  async save() {
    if (this.db) {
      try {
        await this.db.drives.updateOne(
          { _id: 'main' },
          { $set: { state: this.state } },
          { upsert: true }
        );
      } catch (e) {
        console.error('Failed to save drives to DB:', e.message);
      }
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(this.filepath, JSON.stringify(this.state, null, 2));
    }
  }

  /**
   * Set a drive to a specific value. The agent calls this when it
   * decides to create or directly set an internal state.
   * Values are clamped to [0, 1].
   */
  set(name, value) {
    this.state[name] = Math.max(0, Math.min(1, value));
    this.save();
  }

  /**
   * Adjust a drive by a delta. Useful for gradual changes.
   * If the drive doesn't exist yet, it starts at 0.5 (neutral) + delta.
   */
  update(name, delta) {
    const current = this.state[name] ?? 0.5;
    this.state[name] = Math.max(0, Math.min(1, current + delta));
    this.save();
  }

  /**
   * Remove a drive entirely. The agent can let go of internal states
   * it no longer finds meaningful.
   */
  remove(name) {
    delete this.state[name];
    this.save();
  }

  /**
   * Homeostatic decay — all drives drift slightly toward 0.5 each cycle.
   * This simulates biological homeostasis: extreme states naturally settle
   * unless actively maintained. The agent has to keep "feeding" a drive
   * for it to stay high or low.
   */
  decay(rate = 0.03) {
    for (const [name, val] of Object.entries(this.state)) {
      const diff = 0.5 - val;
      this.state[name] = val + diff * rate;
    }
    this.save();
  }

  /**
   * Get a human-readable summary for the perception prompt.
   * Returns empty string if no drives exist yet.
   */
  getSummary() {
    const entries = Object.entries(this.state);
    if (entries.length === 0) return '';

    const lines = entries.map(([name, val]) => {
      const bar = '█'.repeat(Math.round(val * 10)) + '░'.repeat(10 - Math.round(val * 10));
      return `  ${name}: ${bar} (${val.toFixed(2)})`;
    });
    return `YOUR INTERNAL STATES (drives you've discovered about yourself):\n${lines.join('\n')}`;
  }

  /**
   * Get raw state for dashboard
   */
  getState() {
    return { ...this.state };
  }

  /**
   * How many drives has the agent discovered?
   */
  get count() {
    return Object.keys(this.state).length;
  }
}
