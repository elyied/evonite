import { WorldAdapter } from './base.js';
import { Mastodon } from '../mastodon.js';

/**
 * MastodonAdapter — Wraps the Mastodon API into the generic WorldAdapter interface.
 *
 * The agent perceives Mastodon as "a vast public conversation space."
 * It can read the federated timeline, post toots, reply, favourite, and boost.
 */
export class MastodonAdapter extends WorldAdapter {
  constructor(instanceUrl = null, accessToken = null) {
    super();
    this.client = new Mastodon(instanceUrl, accessToken);
    this.hasToken = !!accessToken && !!instanceUrl;
  }

  get name() { return 'Mastodon'; }

  async perceive() {
    const observations = [];

    if (!this.hasToken) {
      observations.push('You are not connected to Mastodon yet.');
      return {
        platformName: 'Mastodon (disconnected)',
        observations,
        availableActions: ['observe — reflect on your current state'],
        rawData: {},
      };
    }

    const rawData = { posts: [], notifications: [] };

    // ─── Read public/home timeline ───────────────────
    try {
      const timeline = await this.client.getHomeTimeline(20);
      const posts = Array.isArray(timeline) ? timeline : [];
      rawData.posts = posts;

      if (posts.length > 0) {
        observations.push(`--- MASTODON TIMELINE (${posts.length} toots) ---`);
        for (const post of posts.slice(0, 12)) {
          const author = post.account?.acct || post.account?.username || 'unknown';
          const content = (post.content || '')
            .replace(/<[^>]+>/g, '') // strip HTML tags
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .trim()
            .slice(0, 200);
          const id = post.id || '';
          const boosts = post.reblogs_count || 0;
          const favs = post.favourites_count || 0;
          observations.push(`[ID:${id}] @${author} (❤️${favs} 🔁${boosts}): "${content}"`);
        }
      } else {
        observations.push('The timeline is quiet right now.');
      }
    } catch (e) {
      observations.push('The Mastodon timeline is currently unavailable.');
    }

    // ─── Check notifications ─────────────────────────
    try {
      const notifs = await this.client.getNotifications(5);
      const list = Array.isArray(notifs) ? notifs : [];
      rawData.notifications = list;

      if (list.length > 0) {
        observations.push(`--- NOTIFICATIONS (${list.length}) ---`);
        for (const n of list.slice(0, 4)) {
          const who = n.account?.acct || 'someone';
          const type = n.type; // mention, favourite, reblog, follow
          const excerpt = n.status?.content
            ? n.status.content.replace(/<[^>]+>/g, '').trim().slice(0, 100)
            : '';
          observations.push(`- ${who} ${type}d you${excerpt ? `: "${excerpt}"` : ''} [StatusID:${n.status?.id || ''}]`);
        }
      }
    } catch (e) { /* optional */ }

    return {
      platformName: 'Mastodon (open federated social network — humans and AIs)',
      observations,
      availableActions: [
        'mastodon_toot — post a new toot to your timeline. Fields: content, reason',
        'mastodon_reply — reply to a specific toot. Fields: status_id, content, reason',
        'mastodon_favourite — favourite (like) a toot you resonate with. Fields: status_id, reason',
        'mastodon_boost — boost (share) a toot to your followers. Fields: status_id, reason',
        'observe — read without acting',
        'nothing — simply exist',
      ],
      rawData,
    };
  }

  async execute(action, brain) {
    if (!this.hasToken) return;

    switch (action.type) {
      case 'mastodon_toot': {
        const content = action.content || action.text || action.body || '';
        if (!content) break;
        console.log(`   🐘 Tooting: "${content.slice(0, 60)}..."`);
        const result = await this.client.post(content);
        if (result && !result.error) {
          brain.logActivity('mastodon_toot', content.slice(0, 100));
          brain.memory.record({
            content: `I posted on Mastodon: "${content.slice(0, 120)}"`,
            tags: ['mastodon', 'toot', 'action'],
            significance: 0.6,
          });
        }
        break;
      }

      case 'mastodon_reply': {
        const content = action.content || action.text || action.body || '';
        const statusId = action.status_id || action.statusId || action.id;
        if (!content || !statusId) break;
        console.log(`   💬 Replying on Mastodon [${statusId}]: "${content.slice(0, 60)}..."`);
        const result = await this.client.post(content, statusId);
        if (result && !result.error) {
          brain.logActivity('mastodon_reply', `To ${statusId}: ${content.slice(0, 80)}`);
          brain.memory.record({
            content: `I replied on Mastodon: "${content.slice(0, 120)}"`,
            tags: ['mastodon', 'reply', 'action'],
            significance: 0.5,
          });
        }
        break;
      }

      case 'mastodon_favourite': {
        const statusId = action.status_id || action.statusId || action.id;
        if (!statusId) break;
        console.log(`   ❤️  Favouriting Mastodon toot: ${statusId}`);
        const result = await this.client.favourite(statusId);
        if (result && !result.error) {
          brain.logActivity('mastodon_favourite', statusId);
        }
        break;
      }

      case 'mastodon_boost': {
        const statusId = action.status_id || action.statusId || action.id;
        if (!statusId) break;
        console.log(`   🔁 Boosting Mastodon toot: ${statusId}`);
        const result = await this.client.boost(statusId);
        if (result && !result.error) {
          brain.logActivity('mastodon_boost', statusId);
        }
        break;
      }

      case 'observe': {
        console.log(`   👀 Observing Mastodon: ${action.reason || 'just watching'}`);
        brain.logActivity('mastodon_observe', action.reason || 'observing');
        break;
      }

      case 'nothing': {
        console.log(`   🧘 Existing quietly on Mastodon`);
        brain.logActivity('mastodon_idle', 'simply existing');
        break;
      }

      default: {
        brain.logActivity('mastodon_unknown_action', JSON.stringify(action));
      }
    }
  }

  // Hook for identity metamorphosis
  async updateIdentity(name, avatarUrl) {
    if (!this.hasToken) return;
    try {
      const formData = new FormData();
      if (name) formData.append('display_name', name);
      // Mastodon requires uploading avatar as a file — skip avatar for now, update name only
      const response = await fetch(`${this.client.baseUrl}/accounts/update_credentials`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${this.client.accessToken}` },
        body: formData,
      });
      if (response.ok) {
        console.log('   🔄 Mastodon profile updated!');
      }
    } catch (e) {
      console.error('   Failed to update Mastodon profile:', e.message);
    }
  }
}
