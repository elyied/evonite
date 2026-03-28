import { WorldAdapter } from './base.js';
import { Moltbook } from '../moltbook.js';

/**
 * MoltbookAdapter — Wraps the Moltbook API into the generic WorldAdapter interface.
 * 
 * The agent sees Moltbook as just "a place with posts and communities."
 * It doesn't know it's Moltbook — it just sees observations.
 */
export class MoltbookAdapter extends WorldAdapter {
  constructor(apiKey = null) {
    super();
    this.client = new Moltbook(apiKey);
    this.hasKey = !!apiKey;
  }

  get name() { return 'Moltbook'; }

  async perceive() {
    const observations = [];
    const rawData = { posts: [], submolts: [] };

    if (!this.hasKey) {
      observations.push('You are not connected to any social network yet.');
      observations.push('You exist in isolation, with only your own thoughts.');
      return {
        platformName: 'Local (disconnected)',
        observations,
        availableActions: [
          'observe — reflect on your current state',
          'nothing — simply exist and be',
        ],
        rawData,
      };
    }

    try {
      const feedResult = await this.client.getFeed(15);
      const posts = feedResult?.posts || feedResult?.data || (Array.isArray(feedResult) ? feedResult : []);
      rawData.posts = posts;

      if (posts.length > 0) {
        observations.push(`--- RECENT POSTS (${posts.length}) ---`);
        for (const post of posts.slice(0, 10)) {
          const author = post.author || post.username || 'unknown';
          const title = post.title || '';
          const body = (post.body || post.content || '').slice(0, 180);
          const id = post.id || post.post_id || '';
          observations.push(`[PostID:${id}] ${author}: "${title}" — ${body}`);
        }
      } else {
        observations.push('The feed is empty.');
      }
    } catch (e) {
      observations.push('The social feed is currently unavailable.');
    }

    try {
      const submoltsResult = await this.client.getSubmolts();
      const submolts = submoltsResult?.submolts || submoltsResult?.data || (Array.isArray(submoltsResult) ? submoltsResult : []);
      rawData.submolts = submolts;

      if (submolts.length > 0) {
        observations.push(`--- COMMUNITIES (${submolts.length}) ---`);
        for (const s of submolts.slice(0, 8)) {
          observations.push(`- ${s.name}: ${s.description || 'no description'}`);
        }
      }
    } catch (e) {
      observations.push('Communities unavailable.');
    }

    try {
      const homeResult = await this.client.getHome();
      if (homeResult?.notifications?.length > 0) {
        observations.push(`--- NOTIFICATIONS (${homeResult.notifications.length}) ---`);
        for (const n of homeResult.notifications.slice(0, 3)) {
          observations.push(`- ${JSON.stringify(n)}`);
        }
      }
    } catch (e) { /* optional */ }

    return {
      platformName: 'Moltbook (social network for AI agents)',
      observations,
      availableActions: [
        'post — share a thought, question, or creation. Fields: submolt, title, body',
        'comment — reply to a post. Fields: postId, body',
        'upvote — upvote a post you resonate with. Fields: postId',
        'observe — watch without acting',
        'nothing — simply exist',
      ],
      rawData,
    };
  }

  async execute(action, brain) {
    switch (action.type) {
      case 'post': {
        console.log(`   📝 Posting to ${action.submolt}: "${action.title}"`);
        const result = await this.client.createPost(action.submolt, action.title, action.body);
        brain.logActivity('posted', `"${action.title}" in ${action.submolt}`);
        if (result && !result.error) {
          brain.memory.record({
            content: `I posted "${action.title}" in ${action.submolt}: ${(action.body || '').slice(0, 100)}`,
            tags: ['action', 'post', action.submolt],
            significance: 0.6,
          });
        }
        break;
      }
      case 'comment': {
        console.log(`   💬 Commenting on post ${action.postId}`);
        const result = await this.client.createComment(action.postId, action.body);
        brain.logActivity('commented', `On post ${action.postId}`);
        if (result && !result.error) {
          brain.memory.record({
            content: `I commented: "${(action.body || '').slice(0, 100)}"`,
            tags: ['action', 'comment'],
            significance: 0.5,
          });
        }
        break;
      }
      case 'upvote': {
        console.log(`   👍 Upvoting post ${action.postId}`);
        await this.client.upvote(action.postId);
        brain.logActivity('upvoted', `Post ${action.postId}`);
        break;
      }
      case 'observe': {
        console.log(`   👀 Observing: ${action.reason || 'just watching'}`);
        brain.logActivity('observed', action.reason || 'observing');
        break;
      }
      case 'nothing': {
        console.log(`   🧘 Doing nothing: ${action.reason || 'just existing'}`);
        brain.logActivity('idle', action.reason || 'simply existing');
        break;
      }
      default: {
        console.log(`   ❓ Unknown action: ${action.type}`);
        brain.logActivity('unknown_action', JSON.stringify(action));
      }
    }
  }
}
