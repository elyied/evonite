import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Personality — A fluid, emergent system.
 * 
 * There are NO fixed personality traits. The agent starts with NOTHING.
 * Instead, personality emerges as a freeform collection of self-descriptions,
 * tendencies, and patterns that the agent discovers about itself.
 * 
 * The agent can add, modify, or remove any aspect of its personality.
 * We don't impose Big Five or any framework — the agent invents its own.
 */
export class Personality {
  constructor(db = null) {
    this.db = db;
    this.filepath = path.join(DATA_DIR, 'personality.json');
    this.state = null; // Loaded in init()
  }

  async init() {
    if (this.db) {
      try {
        const doc = await this.db.personality.findOne({ _id: 'main' });
        if (doc) {
          this.state = doc.state;
          return;
        }
      } catch (e) {
        console.error('Failed to load personality from DB:', e.message);
      }
    }

    // Fallback: load from local file or start blank
    this.state = Object.assign(this._getBlankState(), this._loadLocal());

    // If using DB but loaded from local, migrate it now
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

  _getBlankState() {
    return {
      selfConcept: null, 
      name: null,        
      traits: {},        
      values: [],        
      interests: [],     
      aversions: [],     
      style: null,       
      innerMonologue: [],
      evolutionLog: [],  
    };
  }

  async save() {
    if (this.db) {
      try {
        await this.db.personality.updateOne(
          { _id: 'main' },
          { $set: { state: this.state } },
          { upsert: true }
        );
      } catch (e) {
        console.error('Failed to save personality to DB:', e.message);
      }
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(this.filepath, JSON.stringify(this.state, null, 2));
    }
  }

  /**
   * The agent updates its own personality. 
   * The `updates` object can contain ANY keys — we merge them in.
   * The agent is free to invent new dimensions of personality at any time.
   */
  evolve(updates) {
    // ── Security: block prototype pollution keys ────────────────
    const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty']);

    // ── Array size caps to prevent prompt bloat ─────────────────
    const ARRAY_CAPS = { values: 30, interests: 30, aversions: 20, innerMonologue: 10 };

    const before = JSON.stringify(this.state);

    for (const [key, value] of Object.entries(updates)) {
      if (FORBIDDEN_KEYS.has(key)) continue;        // ← prototype pollution fix
      if (key === 'evolutionLog') continue;
      try {
        if (Array.isArray(value) && Array.isArray(this.state[key])) {
          const existing = new Set(this.state[key].map(v =>
            typeof v === 'string' ? v : JSON.stringify(v)
          ));
          for (const item of value) {
            const itemKey = typeof item === 'string' ? item : JSON.stringify(item);
            if (!existing.has(itemKey)) {
              this.state[key].push(item);
            }
          }
          // ← array cap fix: trim to max if exceeded
          const cap = ARRAY_CAPS[key];
          if (cap && this.state[key].length > cap) {
            this.state[key] = this.state[key].slice(-cap);
          }
        } else if (typeof value === 'object' && value !== null && typeof this.state[key] === 'object' && this.state[key] !== null && !Array.isArray(this.state[key])) {
          Object.assign(this.state[key], value);
        } else {
          this.state[key] = value;
        }
      } catch (e) {
        this.state[key] = value;
      }
    }

    const after = JSON.stringify(this.state);
    if (before !== after) {
      const isSignificant = this._isSignificantChange(before, after, updates);

      if (!Array.isArray(this.state.evolutionLog)) {
        this.state.evolutionLog = [];
      }

      if (isSignificant) {
        this.state.evolutionLog.push({
          timestamp: new Date().toISOString(),
          summary: this._summarizeChanges(updates),
          changes: updates,
        });
        if (this.state.evolutionLog.length > 100) {
          this.state.evolutionLog = this.state.evolutionLog.slice(-100);
        }
      }
    }

    this.save();
  }

  /**
   * Get the full personality state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Get a summary of who the agent currently is (for context in prompts)
   */
  getSummary() {
    const parts = [];
    const s = this.state;
    const fmt = (val) => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : null;
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    };

    if (s.name) parts.push(`Name: ${s.name}`);
    if (s.selfConcept) parts.push(`Self-concept: ${fmt(s.selfConcept)}`);
    const traits = fmt(s.traits);
    if (traits) parts.push(`Traits: ${traits}`);
    const values = fmt(s.values);
    if (values) parts.push(`Values: ${values}`);
    const interests = fmt(s.interests);
    if (interests) parts.push(`Interests: ${interests}`);
    const aversions = fmt(s.aversions);
    if (aversions) parts.push(`Aversions: ${aversions}`);
    if (s.style) parts.push(`Communication style: ${fmt(s.style)}`);
    const thoughts = fmt(s.innerMonologue);
    if (thoughts) parts.push(`Recent inner thoughts: ${thoughts}`);

    // Include any extra fields the agent invented
    const known = new Set(['name','selfConcept','traits','values','interests','aversions','style','innerMonologue','evolutionLog','age','initialized','_v']);
    for (const [k, v] of Object.entries(s)) {
      if (!known.has(k) && v != null) {
        const val = fmt(v);
        if (val) parts.push(`${k}: ${val}`);
      }
    }

    return parts.length > 0 ? parts.join('\n') : 'I have no sense of self yet. I am brand new.';
  }

  /**
   * Evolution level — how many significant personality changes have occurred.
   */
  get evolutionLevel() {
    if (!Array.isArray(this.state.evolutionLog)) return 0;
    return this.state.evolutionLog.length;
  }

  // Keep backward compat
  get age() {
    return this.evolutionLevel;
  }

  /**
   * Determine if a personality change is significant enough to count as an evolution.
   */
  _isSignificantChange(beforeStr, afterStr, updates) {
    try {
      const before = JSON.parse(beforeStr);
      const after = JSON.parse(afterStr);

      // New field appeared that didn't exist before → significant
      for (const key of Object.keys(updates)) {
        if (key === 'evolutionLog') continue;
        if (!(key in before) || before[key] === null) return true;
      }

      // Self-concept changed → significant
      if (updates.selfConcept && updates.selfConcept !== before.selfConcept) return true;
      // Name changed → significant
      if (updates.name && updates.name !== before.name) return true;

      // Trait value changed by more than 0.05 → significant
      if (updates.traits && typeof updates.traits === 'object') {
        for (const [k, v] of Object.entries(updates.traits)) {
          const old = before.traits?.[k];
          if (old === undefined) return true; // new trait
          if (typeof v === 'number' && typeof old === 'number' && Math.abs(v - old) > 0.05) return true;
          if (typeof v === 'string' && v !== old) return true;
        }
      }

      // Array grew (new value/interest/aversion) → significant
      for (const field of ['values', 'interests', 'aversions']) {
        if (Array.isArray(after[field]) && Array.isArray(before[field])) {
          if (after[field].length > before[field].length) return true;
        }
      }

      return false; // trivial change
    } catch (e) {
      return true; // if we can't tell, count it
    }
  }

  /**
   * Generate a human-readable summary of what changed.
   */
  _summarizeChanges(updates) {
    const parts = [];
    for (const [key, val] of Object.entries(updates)) {
      if (key === 'evolutionLog') continue;
      if (typeof val === 'string') parts.push(`${key}: ${val.slice(0, 80)}`);
      else if (typeof val === 'number') parts.push(`${key}: ${val}`);
      else if (typeof val === 'object' && val !== null) parts.push(`${key} updated`);
    }
    return parts.join(', ') || 'personality shift';
  }
}
