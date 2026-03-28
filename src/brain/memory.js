import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Memory System — The agent's living memory with semantic recall.
 * 
 * Nothing is predefined. The agent forms memories from raw experience.
 * Memories are tagged with whatever context the agent itself generates.
 * Over time, memories naturally fade unless reinforced.
 * 
 * Now enhanced with vector embeddings for conceptual recall:
 * when the agent thinks about "loneliness", it can recall memories
 * about "isolation" or "being alone" even if those exact words weren't used.
 */
export class Memory {
  constructor(db = null, embeddings = null) {
    this.db = db;
    this.filepath = path.join(DATA_DIR, 'memories.json');
    this.embeddingsPath = path.join(DATA_DIR, 'memory-vectors.json');
    this.memories = [];
    this.vectors = {};
    this.embeddings = embeddings; // Embeddings instance (optional)
  }

  async init() {
    if (this.db) {
      try {
        const docs = await this.db.memories.find({}).toArray();
        if (docs.length > 0) {
          this.memories = docs.map(d => {
            const { _id, vector, ...mem } = d;
            if (vector) this.vectors[mem.id] = vector;
            return mem;
          });
          return;
        }
      } catch (e) {
        console.error('Failed to load memories from DB:', e.message);
      }
    }

    this.memories = this._loadLocal();
    this.vectors = this._loadLocalVectors();

    if (this.db && this.memories.length > 0) {
      await this.save();
    }
  }

  _loadLocal() {
    try {
      if (fs.existsSync(this.filepath)) {
        return JSON.parse(fs.readFileSync(this.filepath, 'utf-8'));
      }
    } catch (e) { /* start fresh */ }
    return [];
  }

  _loadLocalVectors() {
    try {
      if (fs.existsSync(this.embeddingsPath)) {
        return JSON.parse(fs.readFileSync(this.embeddingsPath, 'utf-8'));
      }
    } catch (e) { /* start fresh */ }
    return {}; // { memoryId -> float[] }
  }

  async save() {
    if (this.db && this.memories.length > 0) {
      try {
        const ops = this.memories.map(m => ({
          replaceOne: {
            filter: { id: m.id },
            replacement: { ...m, vector: this.vectors[m.id] },
            upsert: true
          }
        }));
        await this.db.memories.bulkWrite(ops);
      } catch (e) {
        console.error('Failed to save memories to DB:', e.message);
      }
    } else if (!this.db) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(this.filepath, JSON.stringify(this.memories, null, 2));
      fs.writeFileSync(this.embeddingsPath, JSON.stringify(this.vectors));
    }
  }

  /**
   * Record a new memory. The agent decides what to remember and how to tag it.
   * Automatically embeds the memory for semantic search (async, non-blocking).
   */
  record(memory) {
    const entry = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      content: memory.content,
      context: memory.context || null,
      tags: memory.tags || [],
      significance: memory.significance || 0.5,
      reinforcementCount: 0,
      lastAccessed: new Date().toISOString(),
    };
    this.memories.push(entry);
    this.save();

    // Embed in the background (don't await — non-blocking)
    if (this.embeddings) {
      this._embedMemory(entry).catch(() => {});
    }

    return entry;
  }

  /**
   * Embed a memory for semantic search.
   */
  async _embedMemory(entry) {
    const vector = await this.embeddings.embed(entry.content);
    if (vector) {
      this.vectors[entry.id] = vector;
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(this.embeddingsPath, JSON.stringify(this.vectors));
    }
  }

  /**
   * Semantic search — find memories conceptually related to a query.
   * Returns the top N most similar memories, ranked by relevance.
   */
  async semanticSearch(query, topN = 5) {
    if (!this.embeddings || Object.keys(this.vectors).length === 0) {
      // Fall back to text search if no embeddings available
      return this.search(query).slice(0, topN);
    }

    const { Embeddings: EmbeddingsClass } = await import('../cognition/embeddings.js');

    const queryVector = await this.embeddings.embed(query);
    if (!queryVector) return this.search(query).slice(0, topN);

    // Score every embedded memory
    const scored = [];
    for (const mem of this.memories) {
      const vec = this.vectors[mem.id];
      if (vec) {
        const sim = EmbeddingsClass.similarity(queryVector, vec);
        scored.push({ memory: mem, similarity: sim });
      }
    }

    // Sort by similarity (descending), take top N
    scored.sort((a, b) => b.similarity - a.similarity);
    const results = scored.slice(0, topN).map(s => {
      // Reinforce recalled memories
      s.memory.lastAccessed = new Date().toISOString();
      return s.memory;
    });
    this.save();
    return results;
  }

  /**
   * Retrieve recent memories (short-term recall)
   */
  getRecent(count = 10) {
    return this.memories.slice(-count);
  }

  /**
   * Retrieve all memories (for reflection)
   */
  getAll() {
    return [...this.memories];
  }

  /**
   * Search memories by content (fuzzy, case-insensitive)
   */
  search(query) {
    const q = query.toLowerCase();
    return this.memories.filter(m =>
      m.content.toLowerCase().includes(q) ||
      (m.tags && m.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  /**
   * Reinforce a memory (makes it more significant, prevents fading)
   */
  reinforce(memoryId) {
    const mem = this.memories.find(m => m.id === memoryId);
    if (mem) {
      mem.reinforcementCount++;
      mem.significance = Math.min(1, mem.significance + 0.05);
      mem.lastAccessed = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Natural forgetting — memories with low significance and no reinforcement fade.
   */
  async forget() {
    const now = Date.now();
    const beforeIds = new Set(this.memories.map(m => m.id));

    this.memories = this.memories.filter(m => {
      const age = (now - new Date(m.lastAccessed).getTime()) / (1000 * 60 * 60);
      const survivalScore = m.significance + (m.reinforcementCount * 0.1);
      if (age > 168 && survivalScore < 0.3) return false;
      if (age > 720 && survivalScore < 0.5) return false;
      return true;
    });

    // Clean up vectors and track what was deleted
    const afterIds = new Set(this.memories.map(m => m.id));
    const forgottenIds = [];

    for (const id of beforeIds) {
      if (!afterIds.has(id)) {
        delete this.vectors[id];
        forgottenIds.push(id);
      }
    }

    if (this.db && forgottenIds.length > 0) {
      try {
        await this.db.memories.deleteMany({ id: { $in: forgottenIds } });
      } catch (e) {
        console.error('Failed to delete memories from DB:', e.message);
      }
    }

    this.save();
  }

  get count() {
    return this.memories.length;
  }
}
