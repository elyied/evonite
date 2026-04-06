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
                const filename = await this.brain.imagination.imagine(action.description);
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

