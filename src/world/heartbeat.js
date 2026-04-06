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

  _scheduleBeat() {
    // Run first beat immediately, then schedule next ONLY after completion
    this._beat().finally(() => {
      if (this.isRunning) {
        this.timer = setTimeout(() => this._scheduleBeat(), this.intervalMs);
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

