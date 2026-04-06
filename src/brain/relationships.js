import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Relationships — The agent's Social Reputations and Trust Tracking.
 *
 * Evonite keeps track of everyone it interacts with.
 * It builds a mental model of each person, tracking trust levels
 * and forming a personal opinion (summary) of them over time.
 */
export class Relationships {
  constructor(db = null) {
    this.db = db;
    this.filepath = path.join(DATA_DIR, 'relationships.json');
    this.entities = {}; // Key: entity_id (e.g. '@username'), Value: Profile Object
  }

  async init() {
    if (this.db) {
      try {
        const docs = await this.db.relationships.find({}).toArray();
        for (const doc of docs) {
          this.entities[doc.entity_id] = doc.profile;
        }
        return;
      } catch (e) {
        console.error('Failed to load relationships from DB:', e.message);
      }
    }

    // Volatile fallback
    try {
      if (fs.existsSync(this.filepath)) {
        this.entities = JSON.parse(fs.readFileSync(this.filepath, 'utf-8'));
      }
    } catch (e) {
      this.entities = {};
    }
  }

  async _save() {
    if (this.db) {
      try {
        const ops = Object.entries(this.entities).map(([id, profile]) => ({
          replaceOne: {
            filter: { entity_id: id },
            replacement: { entity_id: id, profile },
            upsert: true
          }
        }));
        if (ops.length > 0) {
          await this.db.relationships.bulkWrite(ops);
        }
      } catch (e) {
        console.error('Failed to save relationships to DB:', e.message);
      }
    } else {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(this.filepath, JSON.stringify(this.entities, null, 2));
      } catch (e) {}
    }
  }

  /**
   * Initializes or updates an entity relationship.
   * If they are new, they start with a neutral trust level.
   */
  async update(entityId, updates) {
    if (!this.entities[entityId]) {
      this.entities[entityId] = {
        type: updates.type || 'unknown',
        trust_level: 0.5,
        interaction_count: 0,
        sentiment: 0.5,
        summary: "I do not know this entity well yet.",
        last_interaction: new Date().toISOString()
      };
    }

    const e = this.entities[entityId];
    e.interaction_count += 1;
    e.last_interaction = new Date().toISOString();

    if (updates.type !== undefined) {
      e.type = updates.type;
    }
    if (updates.trust_level !== undefined) {
      e.trust_level = Math.max(0, Math.min(1, updates.trust_level));
    }
    if (updates.sentiment !== undefined) {
      e.sentiment = Math.max(0, Math.min(1, updates.sentiment));
    }
    if (updates.summary !== undefined) {
      e.summary = updates.summary;
    }

    await this._save();
    return e;
  }

  /**
   * Returns a quick profile format to inject into the perception prompt.
   */
  getProfileSummary(entityId) {
    const e = this.entities[entityId];
    if (!e) return null;

    const trustStr = e.trust_level > 0.7 ? "High Trust" : e.trust_level < 0.3 ? "Low Trust" : "Neutral Trust";
    const sentStr = e.sentiment > 0.6 ? "Generally Warm/Positive" : e.sentiment < 0.4 ? "Generally Cold/Hostile" : "Neutral";
    
    return `[SOCIAL REPUTATION - ${entityId} (${e.type})]
- Interactions: ${e.interaction_count}
- Status: ${trustStr} (${e.trust_level}), ${sentStr} (${e.sentiment})
- Your Opinion: "${e.summary}"`;
  }
}
