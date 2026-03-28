/**
 * Base WorldAdapter interface.
 * 
 * Every platform the agent can interact with implements this interface.
 * The agent doesn't know or care which platform it's on —
 * it just receives observations and can take actions.
 */
export class WorldAdapter {
  get name() { return 'Unknown'; }

  /**
   * Gather what the agent currently observes on this platform.
   * Returns a standardized worldState:
   * {
   *   platformName: string,
   *   observations: string[],     // what the agent sees (free-form strings)
   *   availableActions: string[], // what it can do
   *   rawData: any,               // raw data for action execution
   * }
   */
  async perceive() {
    throw new Error('WorldAdapter.perceive() must be implemented');
  }

  /**
   * Execute an action the agent decided to take.
   * action: { type: string, ...rest }
   */
  async execute(action, brain) {
    throw new Error('WorldAdapter.execute() must be implemented');
  }
}
