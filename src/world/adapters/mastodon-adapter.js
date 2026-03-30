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

    // Normalize action type — LLMs often hallucinate aliases
    const t = (action.type || action.action || '').toLowerCase();
    const content = action.content || action.text || action.body || action.status || action.toot || '';
    const statusId = action.status_id || action.statusId || action.id || action.post_id || '';

    if (t === 'mastodon_toot' || t === 'toot' || t === 'mastodon_post' || t === 'post_toot' || t === 'post_mastodon') {
      if (!content) { console.log('   [Mastodon] toot skipped — no content'); return; }
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

    } else if (t === 'mastodon_reply' || t === 'reply_mastodon' || t === 'mastodon_respond') {
      if (!content || !statusId) { console.log('   [Mastodon] reply skipped — missing content or status_id'); return; }
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

    } else if (t === 'mastodon_favourite' || t === 'mastodon_like' || t === 'favourite' || t === 'favorite') {
      if (!statusId) return;
      console.log(`   ❤️  Favouriting Mastodon toot: ${statusId}`);
      await this.client.favourite(statusId);
      brain.logActivity('mastodon_favourite', statusId);

    } else if (t === 'mastodon_boost' || t === 'boost' || t === 'reblog' || t === 'mastodon_share') {
      if (!statusId) return;
      console.log(`   🔁 Boosting Mastodon toot: ${statusId}`);
      await this.client.boost(statusId);
      brain.logActivity('mastodon_boost', statusId);

    } else if (t === 'observe' || t === 'nothing') {
      brain.logActivity('mastodon_idle', action.reason || 'observing');

    } else {
      // Unrecognized — log but don't crash
      brain.logActivity('mastodon_unknown', t || 'no_type');
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
