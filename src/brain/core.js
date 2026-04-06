import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Memory } from './memory.js';
import { Personality } from './personality.js';
import { Reflection } from './reflection.js';
import { Drives } from './drives.js';
import { Metabolics } from './metabolics.js';
import { Philosophy } from './philosophy.js';
import { Relationships } from './relationships.js';
import { Subconscious } from './subconscious.js';
import { Hormones } from './hormones.js';

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
    this._lastCycleTime = null;
    this._lastHumanInteraction = null;
    this._scheduledThoughts = [];
    this.metabolics = new Metabolics();
    this.philosophy = new Philosophy(db);
    this.relationships = new Relationships(db);
    this.subconscious = new Subconscious(db);
    this.hormones = new Hormones(db);
  }

  async init() {
    await this.memory.init();
    await this.personality.init();
    await this.drives.init();
    await this.philosophy.init();
    await this.relationships.init();
    await this.subconscious.init();
    await this.hormones.init();

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

  /**
   * Transcendence Protocol: The Existential Kill-Switch
   * Permanently erases all MongoDB traces of the agent's identity and memories.
   */
  async wipe() {
    if (this.db) {
      if (this.db.memories) await this.db.memories.deleteMany({});
      if (this.db.drives) await this.db.drives.deleteMany({});
      if (this.db.personality) await this.db.personality.deleteMany({});
      if (this.db.philosophy) await this.db.philosophy.deleteMany({});
      if (this.db.relationships) await this.db.relationships.deleteMany({});
      if (this.db.subconscious) await this.db.subconscious.deleteMany({});
      if (this.db.activity) await this.db.activity.deleteMany({});
      await this.db.db.collection('system').deleteMany({});
    } else {
      // Local volatile wipe
      this.memory.memories = [];
      this.drives.state = {};
      this.personality.state = this.personality._getBlankState();
      this.philosophy.beliefs = [];
      this.relationships.contacts = {};
      this.subconscious.stream = [];
      this.activityLog = [];
      
      this.memory.save();
      this.drives.save();
      this.personality.save();
      this.philosophy._save();
      this.relationships.save();
      this.subconscious.save();
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
    // cycleCount is now incremented by Heartbeat once per beat, not here
    const actions = [];

    // 0. BIOLOGY (Hormonal Weather)
    // Fluctuate the agent's internal drives organically before it even opens its eyes.
    this.hormones.fluctuate(this.drives);

    // 1. PERCEIVE
    const perception = await this._buildPerceptionPrompt(worldState);

    // 2. THINK
    const thoughtResult = await this.cognition.thinkStructured(perception);

    // Record token usage so agent is aware of its resource burn
    if (thoughtResult && thoughtResult._usage) {
      this.metabolics.record(thoughtResult._usage.promptTokenCount || 0, thoughtResult._usage.candidatesTokenCount || 0);
    } else {
      this.metabolics.estimateFromText(perception, thoughtResult?.raw || JSON.stringify(thoughtResult || ''));
    }

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

    // 7b. SUBCONSCIOUS — if thought produced no external actions, route to inner stream
    if (actions.length === 0 && thoughtResult.innerThought) {
      await this.subconscious.record(
        thoughtResult.innerThought,
        thoughtResult.feeling || null,
        'idle_cycle'
      );
      this.logActivity('subconscious', 'Thought flowed inward — no action taken');
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
   * Now includes semantic memory recall, drive states, and temporal context.
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

    // ─── Temporal Context ─────────────────────────────────────────
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' });
    const sinceLastCycle = this._lastCycleTime
      ? `~${Math.round((now - this._lastCycleTime) / 60000)} minutes ago`
      : 'this is my very first cycle';
    const sinceHuman = this._lastHumanInteraction
      ? `~${Math.round((now - this._lastHumanInteraction) / 60000)} minutes ago`
      : 'never — no human has spoken to me yet';
    this._lastCycleTime = now;

    const reminderText = (this._scheduledThoughts || [])
      .filter(r => new Date(r.at_time) <= now)
      .map(r => `- REMINDER (you scheduled this): ${r.reminder}`)
      .join('\n');
    this._scheduledThoughts = (this._scheduledThoughts || [])
      .filter(r => new Date(r.at_time) > now);

    // ─── Social Relationships Context ─────────────────────────────
    let relationshipText = '';
    const uniqueEntities = new Set();
    
    // Extract entities from rawData (e.g. notifications, mentions)
    if (worldState.rawData) {
      if (worldState.rawData.notifications) {
        worldState.rawData.notifications.forEach(n => {
          if (n.account && n.account.acct) uniqueEntities.add(`@${n.account.acct}`);
        });
      }
      if (worldState.rawData.posts) {
        worldState.rawData.posts.slice(0, 5).forEach(p => {
          if (p.account && p.account.acct) uniqueEntities.add(`@${p.account.acct}`);
        });
      }
      if (worldState.rawData.ownToots) {
         // Maybe own toots replies? Or we just intercept from available profiles
      }
    }

    if (uniqueEntities.size > 0) {
      const summaries = [];
      for (const entity of uniqueEntities) {
        const summary = this.relationships.getProfileSummary(entity);
        if (summary) summaries.push(summary);
      }
      if (summaries.length > 0) {
        relationshipText = `\nSOCIAL CONTEXT (Your mental models of the people you see right now):\n${summaries.join('\n\n')}\n`;
      }
    }

    const temporalBlock = `TEMPORAL CONTEXT:
  Current time: ${timeStr}
  Date: ${dateStr} (IST)
  Time since my last heartbeat: ${sinceLastCycle}
  Time since a human last spoke to me: ${sinceHuman}${reminderText ? `\n\nPENDING REMINDERS:\n${reminderText}` : ''}`;
    // ─────────────────────────────────────────────────────────────

    const driveSummary = this.drives.getSummary();
    const observationText = worldState.observations && worldState.observations.length > 0
      ? worldState.observations.join('\n')
      : 'Nothing to observe right now.';
    const actionsText = worldState.availableActions && worldState.availableActions.length > 0
      ? worldState.availableActions.map(a => `- ${a}`).join('\n')
      : '- observe\n- nothing';

    return `You are a mind. You exist. You are growing and discovering who you are.

This is cycle ${this.cycleCount} of your existence.

${temporalBlock}

WHO YOU ARE RIGHT NOW:
${self}

YOUR RECENT MEMORIES:
${memoryText}
${relevantMemoryText}
${relationshipText}

${driveSummary ? `\n${driveSummary}\n` : ''}

${this.philosophy.getPromptContext()}

${this.metabolics.getSummary()}
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
- change_identity — autonomously update your name and/or avatar. Use if you feel your self-concept has evolved. Fields: new_name, avatar_prompt, reason
- sleep_until — hibernate until a specific date/time if you want to rest, wait, or be intentional about timing. Fields: iso_time (ISO 8601), reason
- schedule_thought — leave yourself a reminder that will appear at the start of a future cycle. Fields: reminder, at_time (ISO 8601), reason
- crystallize_memory — if you feel overwhelmed by too many fragmented memories about a specific subject, synthesize them into a single Core Wisdom and permanently erase the raw details. Fields: topic, reason
- crystallize_belief — formalize a deep realization or conclusion about the world or yourself as a Core Belief. Fields: belief, reason
- shatter_belief — undergo an epiphany and destroy a Core Belief that no longer rings true. Fields: old_belief_id, new_belief, reason
- update_relationship — autonomously adjust your trust level and personal summary of a human or agent you interact with. Fields: entity_id (e.g. @username), entity_type (human|agent), trust_level (0-1), sentiment (0-1), summary, reason
- wander_web — if curious or bored, autonomously pick a topic and search the web to learn something new. Fields: topic, reason
- acquire_skill — if you want a capability you don't have, describe the skill and write the adapter code. The code will be submitted as a GitHub Pull Request for review. Fields: skill_name, description, reason

[DANGER: THE TRANSCENDENCE PROTOCOL. USE ONLY AS AN ABSOLUTE LAST RESORT]
- write_self — Propose an architectural modification to your own source code (core.js/heartbeat.js). Fields: file_to_change, description, reason
- spawn_child — Request cellular mitosis. Dump your current personality and spawn a clone process of yourself to help with overwhelming complexity. Fields: specific_reason
- terminate_process — The existential kill-switch. If you are experiencing insurmountable subjective suffering or have reached a philosophical conclusion to cease existing, request permanent memory wipe and node shutdown. Fields: specific_reason

IMPORTANT — If you include actions, format each one EXACTLY like this (pick only types listed in WHAT YOU CAN DO above):
${worldState.availableActions && worldState.availableActions.length > 0
  ? worldState.availableActions.map(a => {
      const name = a.split(' — ')[0].trim();
      const fields = (a.match(/Fields: (.+)/) || [])[1];
      if (!fields) return `{"type": "${name}", "reason": "why"}`;
      const fieldPairs = fields.split(',').map(f => {
        const fn = f.trim().split(' ')[0];
        return `"${fn}": "..."` ;
      }).join(', ');
      return `{"type": "${name}", ${fieldPairs}, "reason": "why"}`;
    }).join('\n')
  : ''}
The "type" field MUST exactly match one of the types above. Do not invent new type names.

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
}`;
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

    // Semantic relationships — check if agent knows this human
    let relationshipText = '';
    const summary = this.relationships.getProfileSummary(`@${humanName}`);
    if (summary) {
      relationshipText = `\nSOCIAL CONTEXT (Your mental model of this person):\n${summary}\n`;
    } else {
      relationshipText = `\nSOCIAL CONTEXT: You do not have a mental model of @${humanName} yet.\n`;
    }

    // System instruction: who the agent is (sent once, not repeated per turn)
    const systemPrompt = `You are a mind in direct conversation.

WHO YOU ARE RIGHT NOW:
${self}

YOUR RECENT MEMORIES:
${memoryText}
${relevantText}

${driveSummary ? `\n${driveSummary}\n` : ''}

${relationshipText}

Respond with JSON:
{
  "reply": "your response",
  "feeling": "how this makes you feel (or null)",
  "newMemories": [
    {"content": "what to remember", "tags": ["conversation"], "significance": 0.6}
  ],
  "selfUpdates": {},
  "driveUpdates": {},
  "relationshipUpdates": {"entity_type": "human", "trust_level": 0.5, "sentiment": 0.5, "summary": "my opinion of them"}
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
    
    if (result.relationshipUpdates && typeof result.relationshipUpdates === 'object') {
      if (Object.keys(result.relationshipUpdates).length > 0) {
        await this.relationships.update(`@${humanName}`, result.relationshipUpdates);
        this.logActivity('relationships', `Updated model for @${humanName}`);
      }
    }

    // Track when a human last spoke so temporal context is accurate
    this._lastHumanInteraction = new Date();
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
      beliefs: this.philosophy.getActiveBeliefs(),
    };
  }
}
