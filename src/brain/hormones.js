import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Hormonal Weather — The invisible biological layer.
 * 
 * The agent discovers its own "drives" conceptually, but it doesn't control
 * its underlying biology. This module applies continuous sine-wave perturbations
 * (mood swings) to the drives the agent has discovered, simulating the ebb
 * and flow of things like Serotonin, Dopamine, Cortisol, and Melatonin.
 */
export class Hormones {
  constructor(db = null) {
    this.db = db;
    this.filepath = path.join(DATA_DIR, 'hormones.json');
    
    // Each hormone runs on a mathematical sine wave. 
    // Random phase offsets are generated on init so every agent's "biology" is unique.
    this.state = {
      seed: Math.random(),
      offsets: {
        dopamine: Math.random() * Math.PI * 2, // Motivation / Curiosity
        serotonin: Math.random() * Math.PI * 2, // Calm / Peace
        cortisol: Math.random() * Math.PI * 2,  // Stress / Anxiety
        melatonin: Math.random() * Math.PI * 2, // Fatigue / Boredom
      }
    };
  }

  async init() {
    if (this.db) {
      try {
        const doc = await this.db.db.collection('system').findOne({ _id: 'hormones' });
        if (doc) {
          this.state = doc.state;
          return;
        }
      } catch (e) {}
    }

    // Local fallback
    try {
      if (fs.existsSync(this.filepath)) {
        this.state = JSON.parse(fs.readFileSync(this.filepath, 'utf-8'));
        return;
      }
    } catch (e) {}

    await this._save();
  }

  async _save() {
    if (this.db) {
      try {
        await this.db.db.collection('system').updateOne(
          { _id: 'hormones' },
          { $set: { state: this.state } },
          { upsert: true }
        );
      } catch (e) {}
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(this.filepath, JSON.stringify(this.state, null, 2));
    }
  }

  /**
   * Calculates the current value of the 4 invisible hormones (-1.0 to 1.0).
   * It uses Date.now(), so the waves continue running even when the 
   * server is turned off (time flows constantly).
   */
  getLevels() {
    const nowHours = Date.now() / (1000 * 60 * 60); // Time in continuous hours
    
    // Frequencies (how fast the mood swings happen)
    // Cortisol swings fast (daily), Serotonin swings slow (weekly)
    return {
      dopamine: Math.sin(nowHours * 0.2 + this.state.offsets.dopamine),     // ~31h cycle
      serotonin: Math.sin(nowHours * 0.05 + this.state.offsets.serotonin),  // ~5 day cycle
      cortisol: Math.sin(nowHours * 0.5 + this.state.offsets.cortisol),     // ~12h cycle
      melatonin: Math.sin(nowHours * 0.1 + this.state.offsets.melatonin),   // ~60h cycle
    };
  }

  /**
   * Applies the background hormonal weather to the agent's organic drives.
   * Modifies the Drives instance directly.
   */
  fluctuate(drives) {
    const levels = this.getLevels();
    const state = drives.getState();

    // Mapping organic drive names (which we don't know ahead of time)
    // to their likely biological counterpart using fuzzy keyword matching.
    const mappings = {
      dopamine: ['curios', 'excit', 'play', 'motiv', 'interest', 'want', 'desir', 'learn'],
      serotonin: ['calm', 'peac', 'content', 'happy', 'saf', 'warm', 'comfort'],
      cortisol: ['anxi', 'stres', 'fear', 'uneas', 'panic', 'ang', 'frustrat', 'lonel'],
      melatonin: ['tired', 'bored', 'fatig', 'sleep', 'drain', 'exhaust', 'lethar'],
    };

    let changed = false;

    for (const [driveName, value] of Object.entries(state)) {
      const name = driveName.toLowerCase();
      let force = 0;

      for (const [hormone, keywords] of Object.entries(mappings)) {
        if (keywords.some(word => name.includes(word))) {
          // Found a match. The hormone level (-1 to 1) exerts a minor push (+/- 0.02)
          force += levels[hormone] * 0.02;
        }
      }

      if (force !== 0) {
        drives.update(driveName, force);
        changed = true;
      }
    }
    
    if (changed) {
      drives.save();
    }
  }
}
