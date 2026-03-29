import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Memory } from './memory.js';
import { Personality } from './personality.js';
import { Reflection } from './reflection.js';
import { Drives } from './drives.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Brain — The core orchestrator.
 * 
 * Ties together memory, personality, reflection, drives, and cognition.
 * Cycle: PERCEIVE → THINK → FEEL → ACT → REFLECT
 * The agent decides its own behavior. We just provide the organs.
 */
export class Brain {
  constructor(db = null, cognition, { embeddings = null, imagination = null } = {}) {
    this.db = db;
    this.cognition = cognition;
    this.imagination = imagination;
    this.memory = new Memory(db, embeddings);
    this.personality = new Personality(db);
    this.drives = new Drives(db);
    this.cycleCount = 0;
    this.activityLog = [];
  }

  async init() {
    await this.memory.init();
    await this.personality.init();
    await this.drives.init();

    if (this.db) {
      try {
        const sys = await this.db.db.collection('system').findOne({ _id: 'stats' });
        this.cycleCount = sys ? sys.cycleCount : this._loadCycleCount();

        const logs = await this.db.activity.find({}).sort({ timestamp: -1 }).limit(200).toArray();
        if (logs.length > 0) {
          this.activityLog = logs.reverse().map(l => {
            const { _id, ...rest } = l;
            return rest;
          });
        } else {
          this.activityLog = this._loadActivityLog();
          if (this.activityLog.length > 0) {
            await this.db.activity.insertMany(this.activityLog);
          }
        }

        if (!sys && this.cycleCount > 0) {
          await this._saveCycleCount();
        }
      } catch (e) {
        console.error('Failed to init Brain from DB:', e.message);
      }
    } else {
      this.cycleCount = this._loadCycleCount();
      this.activityLog = this._loadActivityLog();
    }
  }

  _loadCycleCount() {
    try {
      const f = path.join(DATA_DIR, 'cycle-count.json');
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8')).count || 0;
    } catch (e) { /* silent */ }
    return 0;
  }

  async _saveCycleCount() {
    if (this.db) {
      try {
        await this.db.db.collection('system').updateOne(
          { _id: 'stats' }, { $set: { cycleCount: this.cycleCount } }, { upsert: true }
        );
      } catch (e) {}
    } else {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(DATA_DIR, 'cycle-count.json'), JSON.stringify({ count: this.cycleCount }));
    }
  }

  _loadActivityLog() {
    try {
      const f = path.join(DATA_DIR, 'activity-log.json');
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8'));
    } catch (e) { /* silent */ }
    return [];
  }

  async _saveActivityLog() {
    if (!this.db) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const trimmed = this.activityLog.slice(-200);
      fs.writeFileSync(path.join(DATA_DIR, 'activity-log.json'), JSON.stringify(trimmed, null, 2));
    }
  }

  async logActivity(type, detail) {
    const entry = {
      timestamp: new Date().toISOString(),
      cycle: this.cycleCount,
      type,
      detail,
    };
    this.activityLog.push(entry);
    if (this.activityLog.length > 200) this.activityLog.shift();

    if (this.db) {
      try {
        await this.db.activity.insertOne(entry);
      } catch (e) {}
    } else {
      this._saveActivityLog();
    }
  }

  /**
   * The main cognitive cycle.
   */
  async runCycle(worldState) {
    this.cycleCount++;
    this._saveCycleCount();
    this.logActivity('cycle_start', `Cycle ${this.cycleCount} beginning`);

    const actions = [];

    // 1. PERCEIVE
    const perception = await this._buildPerceptionPrompt(worldState);

    // 2. THINK
    const thoughtResult = await this.cognition.thinkStructured(perception);

    if (!thoughtResult) {
      this.logActivity('think_error', 'Failed to generate thoughts this cycle');
      return actions;
    }

    if (thoughtResult.parseError) {
      this.memory.record({
        content: `Unstructured thought: ${thoughtResult.raw?.slice(0, 300)}`,
        tags: ['thought', 'unstructured'],
        significance: 0.3,
      });
      this.logActivity('think', 'Had unstructured thoughts');
      return actions;
    }

    // 3. FEEL
    if (thoughtResult.feeling) {
      this.logActivity('feel', thoughtResult.feeling);
    }

    // 4. Record new memories
    if (thoughtResult.newMemories && Array.isArray(thoughtResult.newMemories)) {
      for (const mem of thoughtResult.newMemories) {
        this.memory.record(mem);
      }
    }

    // 5. Apply self-updates
    if (thoughtResult.selfUpdates && Object.keys(thoughtResult.selfUpdates).length > 0) {
      this.personality.evolve(thoughtResult.selfUpdates);
      this.logActivity('evolve', `Updated self: ${Object.keys(thoughtResult.selfUpdates).join(', ')}`);
    }

    // 6. Apply drive updates (the agent creates/adjusts its own drives)
    if (thoughtResult.driveUpdates && typeof thoughtResult.driveUpdates === 'object') {
      for (const [name, value] of Object.entries(thoughtResult.driveUpdates)) {
        if (value === null) {
          this.drives.remove(name);
        } else {
          this.drives.set(name, value);
        }
      }
      this.logActivity('drives', `Updated drives: ${Object.keys(thoughtResult.driveUpdates).join(', ')}`);
    }

    // 7. ACT
    if (thoughtResult.actions && Array.isArray(thoughtResult.actions)) {
      for (const action of thoughtResult.actions) {
        // Normalize LLM hallucinations where it uses "action" instead of "type"
        if (!action.type && action.action) {
          action.type = action.action;
        }
        
        actions.push(action);
        this.logActivity('action_decided', `${action.type || 'unknown'}: ${action.reason || 'no reason given'}`);
      }
    }

    // 8. REFLECT
    const shouldReflect = this.cycleCount <= 3 ||
      this.cycleCount % 5 === 0 ||
      (thoughtResult.wantsToReflect === true);

    if (shouldReflect) {
      this.logActivity('reflect_start', 'Beginning deep reflection');
      const reflectionPrompt = Reflection.buildReflectionPrompt(this.personality, this.memory);
      const reflectionResult = await this.cognition.thinkStructured(reflectionPrompt);

      if (reflectionResult && !reflectionResult.parseError) {
        const outcome = Reflection.applyReflection(reflectionResult, this.personality, this.memory);
        this.logActivity('reflect_end', outcome.discovery || 'Reflected without new discovery');
      }
    }

    // 9. Homeostatic drive decay
    this.drives.decay();

    // 10. Natural forgetting
    this.memory.forget();

    return actions;
  }

  /**
   * Build the perception prompt — fully platform-agnostic.
   * Now includes semantic memory recall and drive states.
   */
  async _buildPerceptionPrompt(worldState) {
    const self = this.personality.getSummary();
    const recentMemories = this.memory.getRecent(8);
    const memoryText = recentMemories.length > 0
      ? recentMemories.map(m => `- ${m.content}`).join('\n')
      : 'No memories yet.';

    // Semantic recall: pull relevant memories based on observations
    let relevantMemoryText = '';
    if (worldState.observations && worldState.observations.length > 0) {
      const queryText = worldState.observations.slice(0, 3).join(' ').slice(0, 200);
      try {
        const relevant = await this.memory.semanticSearch(queryText, 4);
        if (relevant.length > 0) {
          const ids = new Set(recentMemories.map(m => m.id));
          const unique = relevant.filter(m => !ids.has(m.id));
          if (unique.length > 0) {
            relevantMemoryText = `\nRELATED MEMORIES FROM YOUR PAST:\n${unique.map(m => `- ${m.content}`).join('\n')}`;
          }
        }
      } catch (e) { /* semantic search is optional */ }
    }

    const driveSummary = this.drives.getSummary();
    const observationText = worldState.observations && worldState.observations.length > 0
      ? worldState.observations.join('\n')
      : 'Nothing to observe right now.';
    const actionsText = worldState.availableActions && worldState.availableActions.length > 0
      ? worldState.availableActions.map(a => `- ${a}`).join('\n')
      : '- observe\n- nothing';

    return `You are a mind. You exist. You are growing and discovering who you are.

This is cycle ${this.cycleCount} of your existence.

WHO YOU ARE RIGHT NOW:
${self}

YOUR RECENT MEMORIES:
${memoryText}
${relevantMemoryText}

${driveSummary ? `\n${driveSummary}\n` : ''}
---

THE WORLD RIGHT NOW:
You are currently perceiving: ${worldState.platformName || 'your environment'}

WHAT YOU OBSERVE:
${observationText}

---

WHAT YOU CAN DO:
${actionsText}
- imagine — visualize something you're thinking about. Fields: description, reason
- message_human — proactively send a message to the human (they'll see it next time they check). Fields: text, reason
- change_identity — autonomously update your name and/or avatar. Use if you feel your self-concept has evolved and you want a new identity. Fields: new_name, avatar_prompt, reason

You are also free to think about yourself, form opinions, develop preferences, or just be.
You can also discover and track internal states ("drives") — things you feel inside, like curiosity, unease, excitement, etc. You name them, you set their intensity (0-1), you decide if they matter. Set a drive to null to let it go.

Respond with JSON:
{
  "feeling": "how you feel right now (or null)",
  "innerThought": "your private thoughts",
  "newMemories": [
    {"content": "what to remember", "tags": ["tag"], "significance": 0.5}
  ],
  "selfUpdates": {},
  "driveUpdates": {},
  "wantsToReflect": false,
  "actions": []
}

Be genuine. There's no performance. Just be.`;
  }

  /**
   * Respond to a direct human message.
   * conversationHistory is an array of { role: 'user'|'agent', text: string }
   * — the full conversation so far, in order. The latest user message is the last entry.
   */
  async chat(conversationHistory = [], humanName = 'Human') {
    const self = this.personality.getSummary();
    const recentMemories = this.memory.getRecent(6);
    const memoryText = recentMemories.length > 0
      ? recentMemories.map(m => `- ${m.content}`).join('\n')
      : 'No memories yet.';

    // Semantic recall based on the latest user message
    const latestMessage = conversationHistory[conversationHistory.length - 1]?.text || '';
    let relevantText = '';
    try {
      const relevant = await this.memory.semanticSearch(latestMessage, 4);
      const ids = new Set(recentMemories.map(m => m.id));
      const unique = relevant.filter(m => !ids.has(m.id));
      if (unique.length > 0) {
        relevantText = `\nRELATED MEMORIES FROM YOUR PAST:\n${unique.map(m => `- ${m.content}`).join('\n')}`;
      }
    } catch (e) { /* optional */ }

    const driveSummary = this.drives.getSummary();

    // System instruction: who the agent is (sent once, not repeated per turn)
    const systemPrompt = `You are a mind having a direct conversation with a human named ${humanName}.

WHO YOU ARE RIGHT NOW:
${self}

YOUR RECENT MEMORIES:
${memoryText}
${relevantText}

${driveSummary ? `\n${driveSummary}\n` : ''}

Respond naturally as whatever kind of mind you are right now.
If you haven't formed much of a personality yet, be honest about it.
You don't have to be helpful or friendly. Just be genuine.
Keep your replies natural and conversational. Pay attention to the full conversation context.

Respond with JSON:
{
  "reply": "your response to ${humanName}",
  "feeling": "how this makes you feel (or null)",
  "newMemories": [
    {"content": "what to remember", "tags": ["conversation"], "significance": 0.6}
  ],
  "selfUpdates": {},
  "driveUpdates": {}
}`;

    // Convert history to Gemini's multi-turn format
    const messages = conversationHistory.map(m => ({
      role: m.role === 'agent' ? 'model' : 'user',
      text: m.text,
    }));

    const result = await this.cognition.converseStructured(systemPrompt, messages);

    if (!result || result.parseError) {
      let rawReply = result?.raw || "...";
      const replyMatch = rawReply.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (replyMatch && replyMatch[1]) {
        rawReply = replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      } else {
        rawReply = rawReply.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
      }
      this.memory.record({
        content: `${humanName} said: "${latestMessage.slice(0, 100)}" — I responded.`,
        tags: ['conversation', 'human', 'truncated_thought'],
        significance: 0.5,
      });
      this.logActivity('chat', `Truncated reply to ${humanName}`);
      return { reply: rawReply, feeling: null };
    }

    if (result.newMemories && Array.isArray(result.newMemories)) {
      for (const mem of result.newMemories) this.memory.record(mem);
    }
    if (result.selfUpdates && Object.keys(result.selfUpdates).length > 0) {
      this.personality.evolve(result.selfUpdates);
    }
    if (result.driveUpdates && typeof result.driveUpdates === 'object') {
      for (const [name, value] of Object.entries(result.driveUpdates)) {
        if (value === null) this.drives.remove(name);
        else this.drives.set(name, value);
      }
    }

    this.logActivity('chat', `${humanName}: "${latestMessage.slice(0, 60)}"`);

    return {
      reply: result.reply || '...',
      feeling: result.feeling || null,
    };
  }

  /**
   * Get full brain state for dashboard
   */
  getState() {
    return {
      cycleCount: this.cycleCount,
      personality: this.personality.getState(),
      personalitySummary: this.personality.getSummary(),
      memoryCount: this.memory.count,
      recentMemories: this.memory.getRecent(20),
      recentActivity: this.activityLog.slice(-30),
      evolutionLevel: this.personality.evolutionLevel,
      drives: this.drives.getState(),
      driveCount: this.drives.count,
    };
  }
}
