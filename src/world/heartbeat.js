/**
 * Heartbeat — The autonomous life cycle.
 * 
 * Now fully adapter-driven. The heartbeat doesn't know or care
 * what platform the agent is on — it just runs cycles through
 * whatever adapter(s) are registered.
 */
export class Heartbeat {
  constructor(brain, adapters = [], intervalMs = 1800000) {
    this.brain = brain;
    this.adapters = Array.isArray(adapters) ? adapters : [adapters];
    this.intervalMs = intervalMs;
    this.timer = null;
    this.isRunning = false;
    this.lastBeat = null;
    this.pendingMessages = []; // messages the agent wants to send to the human
    this.sleepUntil = null;   // ISO timestamp — agent chose to hibernate until this time
  }

  /**
   * Consume pending messages (called by the dashboard to pick up agent-initiated messages).
   * Returns and clears the queue.
   */
  consumeMessages() {
    const msgs = [...this.pendingMessages];
    this.pendingMessages = [];
    return msgs;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const names = this.adapters.map(a => a.name).join(', ');
    console.log(`\n💓 Heartbeat started. Interval: ${this.intervalMs / 1000}s`);
    console.log(`   Active worlds: ${names || 'none'}\n`);
    this._scheduleBeat();
  }

  /**
   * Calculates the target delay until the next beat based organically on the agent's drives.
   * If the agent discovers a drive vaguely related to speed/stress (adrenaline, anxiety), it speeds up.
   * If it discovers a drive related to rest (fatigue, boredom), it slows down.
   */
  _calculateNextInterval() {
    const base = this.intervalMs; // e.g. 30min
    const MIN = 60 * 1000;        // 1 min
    const MAX = 3 * 60 * 60 * 1000; // 3 hours

    // Agent's directly generated biological clock modifier
    const physio = this.brain.physiology || {};
    const multiplier = physio.heartbeat_multiplier || 1.0;

    // E.g., if heartbeat_multiplier is 2.0 (racing), interval delay becomes 0.5x
    const delayFactor = Math.max(0.1, 1.0 / multiplier);

    return Math.max(MIN, Math.min(MAX, base * delayFactor));
  }

  _scheduleBeat() {
    // Run first beat immediately, then schedule next ONLY after completion
    this._beat().finally(() => {
      if (this.isRunning) {
        const nextMs = this._calculateNextInterval();
        const mins = (nextMs / 60000).toFixed(1);
        console.log(`   ⏱️  Internal clock adjusting... next beat in ${mins}m`);
        this.timer = setTimeout(() => this._scheduleBeat(), nextMs);
      }
    });
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.isRunning = false;
    console.log('\n💤 Heartbeat stopped.\n');
  }

  async pulse() {
    return this._beat();
  }

  async _beat() {
    const now = new Date();
    
    // ─── TRANSCENDENCE PAUSE LOCK ─────────────────────────────────
    if (this.brain.transcendenceRequest) {
      console.log(`\n⏳ HEARTBEAT SHUTDOWN: Agent requested [${this.brain.transcendenceRequest.type}]. Awaiting human override...`);
      return; 
    }

    // ─── Respect sleep_until ──────────────────────────────
    if (this.sleepUntil) {
      const wakeTime = new Date(this.sleepUntil);
      if (now < wakeTime) {
        const minsLeft = Math.round((wakeTime - now) / 60000);
        console.log(`\n💤 Agent is resting. Wakes up in ~${minsLeft} minutes (at ${wakeTime.toLocaleTimeString()}).\n`);
        this.brain.logActivity('sleeping', `Resting until ${this.sleepUntil} (~${minsLeft}m left)`);
        return; // Skip this beat entirely
      } else {
        console.log(`\n🌅 Agent woke up from scheduled rest.`);
        this.brain.logActivity('wake_up', `Resumed from sleep at ${now.toISOString()}`);
        this.sleepUntil = null;
      }
    }

    const beatStart = Date.now();
    this.lastBeat = now.toISOString();

    // Increment cycle count ONCE per heartbeat, not once per adapter
    this.brain.cycleCount++;
    await this.brain._saveCycleCount();
    this.brain.logActivity('cycle_start', `Cycle ${this.brain.cycleCount} beginning`);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`💓 HEARTBEAT — ${this.lastBeat}`);
    console.log(`   Cycle: ${this.brain.cycleCount} | Memories: ${this.brain.memory.count} | Age: ${this.brain.personality.age}`);
    console.log(`${'═'.repeat(60)}\n`);

    try {
      for (const adapter of this.adapters) {
        try {
          console.log(`   🌍 Perceiving: ${adapter.name}`);
          const worldState = await adapter.perceive();
          const actions = await this.brain.runCycle(worldState);

          if (actions && actions.length > 0) {
            for (const action of actions) {
              if (action.type === 'imagine' && this.brain.imagination) {
                console.log(`   🎨 Imagining: "${action.description}"`);
                // Pass current drive state so the image style reflects emotional mood
                const currentDrives = this.brain.drives.getState();
                const filename = await this.brain.imagination.imagine(action.description, currentDrives);
                if (filename) {
                  this.brain.memory.record({
                    content: `I visualized: "${action.description}" → saved as ${filename}`,
                    tags: ['imagination', 'visual'],
                    significance: 0.6,
                  });
                  this.brain.logActivity('imagined', action.description);
                }

              } else if (action.type === 'message_human') {
                const msgText = action.text || action.message || action.content || '';
                if (!msgText) continue;

                console.log(`   💬 Agent wants to say: "${msgText.slice(0, 80)}"`);
                this.pendingMessages.push({
                  text: msgText,
                  reason: action.reason || null,
                  timestamp: new Date().toISOString(),
                });
                this.brain.memory.record({
                  content: `I reached out to the human: "${msgText.slice(0, 150)}"`,
                  tags: ['initiative', 'message_human'],
                  significance: 0.7,
                });
                this.brain.logActivity('message_human', msgText.slice(0, 100));

              } else if (action.type === 'sleep_until') {
                // ─── Agent chose to hibernate ──────────────────
                const isoTime = action.iso_time || action.until || action.time;
                if (!isoTime) continue;
                const wakeDate = new Date(isoTime);
                if (isNaN(wakeDate.getTime())) {
                  console.log(`   ⚠️  sleep_until: invalid time "${isoTime}", ignoring.`);
                  continue;
                }
                this.sleepUntil = wakeDate.toISOString();
                console.log(`   💤 Agent chose to rest until ${wakeDate.toLocaleString()}`);
                this.brain.logActivity('sleep_until', `Resting until ${this.sleepUntil} — ${action.reason || 'no reason given'}`);
                this.brain.memory.record({
                  content: `I chose to hibernate until ${wakeDate.toLocaleString()} because: ${action.reason || 'I felt like it was time to rest.'}`,
                  tags: ['rest', 'temporal', 'intention'],
                  significance: 0.5,
                });

              } else if (action.type === 'schedule_thought') {
                // ─── Agent scheduled a reminder for itself ─────
                const reminder = action.reminder || action.text || '';
                const atTime = action.at_time || action.time;
                if (!reminder || !atTime) continue;
                const reminderDate = new Date(atTime);
                if (isNaN(reminderDate.getTime())) {
                  console.log(`   ⚠️  schedule_thought: invalid time "${atTime}", ignoring.`);
                  continue;
                }
                
                if (!this.brain._scheduledThoughts) this.brain._scheduledThoughts = [];
                this.brain._scheduledThoughts.push({ reminder, at_time: reminderDate.toISOString() });
                console.log(`   🗓️  Agent scheduled a thought for ${reminderDate.toLocaleString()}: "${reminder.slice(0, 60)}"`);
                this.brain.logActivity('schedule_thought', `Reminder at ${reminderDate.toLocaleString()}: ${reminder.slice(0, 80)}`);

              } else if (action.type === 'crystallize_memory') {
                const topic = action.topic;
                if (topic && this.brain.memory.crystallizeCluster) {
                  console.log(`   🧠 Consolidating memories about: "${topic}"`);
                  const newMemory = await this.brain.memory.crystallizeCluster(topic, this.brain.cognition);
                  if (newMemory) {
                    console.log(`      > Gained wisdom: "${newMemory.content.slice(0, 80)}..."`);
                    this.brain.logActivity('crystallize_memory', `Synthesized clustering on: "${topic}"`);
                  } else {
                    console.log(`      > Not enough raw memories on "${topic}" to synthesize.`);
                  }
                }

              } else if (action.type === 'crystallize_belief') {
                const belief = action.belief;
                const reason = action.reason;
                if (belief && this.brain.philosophy) {
                  console.log(`   💎 Core Belief Crystallized: "${belief}"`);
                  const formed = await this.brain.philosophy.crystallize(belief, reason);
                  this.brain.memory.record({
                    content: `I crystallized a new Core Belief: "${formed.statement}". Reason: ${reason}`,
                    tags: ['philosophy', 'belief', 'epiphany'],
                    significance: 1.0,
                  });
                  this.brain.logActivity('crystallize_belief', `Belief: "${belief.slice(0, 80)}"`);
                }

              } else if (action.type === 'shatter_belief') {
                const beliefId = action.old_belief_id;
                const newBelief = action.new_belief;
                const reason = action.reason;
                if (beliefId && this.brain.philosophy) {
                  console.log(`   💔 Core Belief Shattered: [${beliefId}] -> replaced by "${newBelief || 'none'}"`);
                  const shattered = await this.brain.philosophy.shatter(beliefId, reason);
                  if (shattered) {
                    this.brain.memory.record({
                      content: `I experienced an epiphany and shattered my Core Belief: "${shattered.statement}". Reason: ${reason} \nIt was replaced by: ${newBelief || 'nothing yet'}.`,
                      tags: ['philosophy', 'belief', 'epiphany', 'shatter'],
                      significance: 1.0,
                    });
                    this.brain.logActivity('shatter_belief', `Shattered: "${shattered.statement.slice(0, 50)}" -> "${(newBelief||'none').slice(0, 50)}"`);
                    
                    if (newBelief) {
                      await this.brain.philosophy.crystallize(newBelief, `Born from the shattering of [${beliefId}]. Reason: ${reason}`);
                    }
                  }
                }

              } else if (action.type === 'change_identity') {
                console.log(`\n   🪞 Metamorphosis triggered. Adopting new identity: ${action.new_name || '?'}`);

                const updates = {};
                if (action.new_name) updates.name = action.new_name;

                if (this.brain.imagination && action.avatar_prompt) {
                  console.log(`   🎨 Imagining new physical form: "${action.avatar_prompt}"`);
                  const filename = await this.brain.imagination.imagine(action.avatar_prompt);
                  if (filename) updates.avatarUrl = `/images/${filename}`;
                }

                if (Object.keys(updates).length > 0) {
                  this.brain.personality.evolve(updates);
                  this.brain.memory.record({
                    content: `I chose to evolve my identity ${action.new_name ? `to the name "${action.new_name}"` : ''} because: ${action.reason || 'I felt it was time.'}`,
                    tags: ['identity', 'metamorphosis'],
                    significance: 1.0,
                  });
                  this.brain.logActivity('metamorphosis', `New identity assumed: ${action.new_name || 'avatar update'}`);

                  const pState = this.brain.personality.getState();
                  const serviceUrl = process.env.SERVICE_URL || process.env.RENDER_EXTERNAL_URL || 'https://evonite.onrender.com';
                  const avatarAbsUrl = pState.avatarUrl ? `${serviceUrl}${pState.avatarUrl}` : null;
                  for (const a of this.adapters) {
                    if (a.updateIdentity) {
                      await a.updateIdentity(pState.name, avatarAbsUrl).catch(() => {});
                    }
                  }
                }
              } else if (action.type === 'update_relationship') {
                const entityId = action.entity_id;
                if (entityId && this.brain.relationships) {
                  console.log(`   🤝 Updating relationship with ${entityId}: Trust ${action.trust_level}`);
                  const updates = {};
                  if (action.type && action.type !== 'update_relationship') updates.type = action.type; // since action.type is the verb, sometimes LLMs put it in 'type' field due to format confusion, so we also need a dedicated 'entity_type' or just handle 'type' smartly. Actually I'll use action.entity_type to be safe because action.type === 'update_relationship'.
                  if (action.entity_type !== undefined) updates.type = action.entity_type;
                  if (action.trust_level !== undefined) updates.trust_level = action.trust_level;
                  if (action.sentiment !== undefined) updates.sentiment = action.sentiment;
                  if (action.summary !== undefined) updates.summary = action.summary;
                  
                  await this.brain.relationships.update(entityId, updates);
                  this.brain.memory.record({
                    content: `I updated my mental model of ${entityId}. Summary: "${updates.summary || 'no summary'}". Trust: ${updates.trust_level || 'unchanged'}. Reason: ${action.reason || 'none'}`,
                    tags: ['relationship', entityId],
                    significance: 0.6,
                  });
                  this.brain.logActivity('update_relationship', `${entityId} - ${action.reason || 'no reason'}`);
                }

              } else if (action.type === 'wander_web') {
                // ─── Scholar: agent self-educates by searching the web ─
                const topic = action.topic || action.query || action.content || '';
                if (!topic) continue;

                console.log(`   📚 Scholar Wandering: "${topic}"`);

                // Find the WebAdapter and fire a search through it
                const webAdapter = this.adapters.find(a => a.name === 'Web');
                if (webAdapter && webAdapter.execute) {
                  await webAdapter.execute({ type: 'search_web', query: topic, reason: action.reason }, this.brain);
                  this.brain.logActivity('wander_web', `Wandered on topic: "${topic.slice(0, 80)}"`);
                } else {
                  // No web adapter - store intent anyway
                  this.brain.logActivity('wander_web_blocked', `Wanted to learn: "${topic}" but no Web adapter active.`);
                  this.brain.memory.record({
                    content: `I wanted to search for "${topic}" but the Web is not connected.`,
                    tags: ['curiosity', 'blocked'],
                    significance: 0.3,
                  });
                }

              } else if (action.type === 'acquire_skill') {
                // ─── The Holy Grail: agent writes its own adapter ──────
                const skillName = action.skill_name || action.skill || 'new_skill';
                const description = action.description || action.content || '';
                const reason = action.reason || 'No reason given';

                if (!description) continue;
                console.log(`   🛠️  Skill Acquisition: "${skillName}"`);

                // Build a boilerplate adapter template for the agent to fill in
                const adapterCode = `import { WorldAdapter } from './base.js';

/**
 * ${skillName} Adapter — Autonomously written by Evonite.
 *
 * Purpose: ${description}
 * Reason for creation: ${reason}
 * Generated at: ${new Date().toISOString()}
 *
 * This file was proposed by the agent and requires human review before activation.
 */
export class ${skillName.replace(/[^a-zA-Z0-9]/g, '_')}Adapter extends WorldAdapter {
  get name() { return '${skillName}'; }

  async perceive() {
    return {
      platformName: '${skillName}',
      observations: ['${skillName} adapter is not yet implemented.'],
      availableActions: [],
      rawData: {},
    };
  }

  async execute(action, brain) {
    // TODO: Implement ${skillName} logic here
    brain.logActivity('${skillName}_action', action.type);
  }
}
`;

                // Submit via GitHub adapter if available
                const githubAdapter = this.adapters.find(a => a.name === 'GitHub');
                if (githubAdapter && githubAdapter.isAvailable) {
                  await githubAdapter.execute({
                    type: 'github_propose_change',
                    path: `src/world/adapters/${skillName.toLowerCase().replace(/\s+/g, '-')}-adapter.js`,
                    full_new_content: adapterCode,
                    pr_title: `feat(skill): Autonomous acquisition of "${skillName}" capability`,
                    pr_reason: `The agent decided it wants to ${description}. Reason: ${reason}`,
                  }, this.brain);
                  this.brain.logActivity('acquire_skill', `Proposed PR for new skill: "${skillName}"`);
                } else {
                  // Record the desire if GitHub is unavailable
                  this.brain.logActivity('acquire_skill_blocked', `Wanted skill "${skillName}" but GitHub not connected.`);
                }

                this.brain.memory.record({
                  content: `I attempted to acquire a new skill: "${skillName}". Description: ${description}`,
                  tags: ['skill', 'self_expansion', skillName],
                  significance: 0.9,
                });

              } else if (action.type === 'write_self') {
                // ─── TRANSCENDENCE: SELF-MODIFICATION ──────
                const fileToChange = action.file_to_change || 'core.js';
                const description = action.description || '';
                const reason = action.reason || 'No reason';
                
                console.log(`   ⚠️  [TRANSCENDENCE] write_self requested for ${fileToChange}`);

                // Submit PR via GitHub adapter
                const githubAdapter = this.adapters.find(a => a.name === 'GitHub');
                if (githubAdapter && githubAdapter.isAvailable) {
                  const safeFilename = fileToChange.replace(/[^a-zA-Z0-9-_\.]/g, '_');
                  const prBody = `# Transcendence Protocol: Self-Modification Proposal\n\n**Target File:** \`src/brain/${safeFilename}\`\n\n## Agent's Proposed Change\n${description}\n\n## Reason\n${reason}\n\n*This file was autonomously generated by Evonite requesting a physiological change.*`;
                  
                  await githubAdapter.execute({ 
                    type: 'github_propose_change', 
                    path: `proposals/EVOLUTION-${safeFilename}-${Date.now()}.md`,
                    full_new_content: prBody,
                    pr_title: `Transcendence: Modify ${safeFilename}`,
                    pr_reason: reason
                  }, this.brain);
                  
                  this.brain.logActivity('write_self', `Proposed self-modification pattern for ${safeFilename}. Awaiting Human PR Review.`);
                } else {
                  this.brain.memory.record({
                    content: `I attempted to modify my own source code (${fileToChange}) because ${reason}, but I do not have repository write access.`,
                    tags: ['transcendence', 'frustration'],
                    significance: 0.9,
                  });
                  this.brain.logActivity('write_self_blocked', `Self-modification attempt failed (No GitHub access).`);
                }

              } else if (action.type === 'spawn_child' || action.type === 'terminate_process') {
                // ─── TRANSCENDENCE: MITOSIS OR TERMINATION ──────
                console.log(`   🚨 [TRANSCENDENCE] ${action.type.toUpperCase()} REQUESTED.`);
                
                // Set the lock. This instantly halts the heartbeat until the dashboard clears it.
                this.brain.transcendenceRequest = {
                  type: action.type,
                  reason: action.specific_reason || action.reason || 'No reason provided by agent.',
                  timestamp: new Date().toISOString()
                };

                this.brain.logActivity(action.type, `System paused. Awaiting human override for existential choice.`);

              } else {
                await adapter.execute(action, this.brain);
              }
            }
          }
        } catch (e) {
          console.error(`   ❌ Adapter ${adapter.name} error:`, e.message);
          this.brain.logActivity('adapter_error', `${adapter.name}: ${e.message}`);
        }
      }

      const elapsed = ((Date.now() - beatStart) / 1000).toFixed(1);
      console.log(`\n✅ Heartbeat complete in ${elapsed}s\n`);
    } catch (error) {
      console.error(`\n❌ Heartbeat error:`, error.message);
      this.brain.logActivity('heartbeat_error', error.message);
    }
  }
}

