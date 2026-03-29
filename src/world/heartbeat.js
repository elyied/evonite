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
    this._beat();
    this.timer = setInterval(() => this._beat(), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.isRunning = false;
    console.log('\n💤 Heartbeat stopped.\n');
  }

  async pulse() {
    return this._beat();
  }

  async _beat() {
    const beatStart = Date.now();
    this.lastBeat = new Date().toISOString();

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`💓 HEARTBEAT — ${this.lastBeat}`);
    console.log(`   Cycle: ${this.brain.cycleCount + 1} | Memories: ${this.brain.memory.count} | Age: ${this.brain.personality.age}`);
    console.log(`${'═'.repeat(60)}\n`);

    try {
      // Run a cycle for EACH adapter — the agent perceives all its worlds
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
                // Agent wants to proactively reach out to the human
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
              } else if (action.type === 'change_identity') {
                // Agent autonomously requested an identity change!
                console.log(`\n   🪞 Metamorphosis triggered. Adopting new identity: ${action.new_name || '?'}`);
                
                const updates = {};
                if (action.new_name) updates.name = action.new_name;

                if (this.brain.imagination && action.avatar_prompt) {
                  console.log(`   🎨 Imagining new physical form: "${action.avatar_prompt}"`);
                  const filename = await this.brain.imagination.imagine(action.avatar_prompt);
                  if (filename) {
                    updates.avatarUrl = `/images/${filename}`;
                  }
                }

                if (Object.keys(updates).length > 0) {
                  this.brain.personality.evolve(updates);
                  this.brain.memory.record({
                    content: `I chose to evolve my identity ${action.new_name ? `to the name "${action.new_name}"` : ''} because: ${action.reason || 'I felt it was time.'}`,
                    tags: ['identity', 'metamorphosis'],
                    significance: 1.0,
                  });
                  this.brain.logActivity('metamorphosis', `New identity assumed: ${action.new_name || 'avatar update'}`);

                  // Attempt to push the new identity out to the connected world!
                  const pState = this.brain.personality.getState();
                  if (adapter.updateIdentity) {
                     await adapter.updateIdentity(
                       pState.name, 
                       pState.avatarUrl ? `https://evonite.onrender.com${pState.avatarUrl}` : null
                     );
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
