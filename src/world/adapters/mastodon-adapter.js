import { WorldAdapter } from './base.js';
import { Mastodon } from '../mastodon.js';

// Strip HTML from Mastodon content
const stripHtml = (html = '') => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/\s+/g, ' ').trim();

/**
 * MastodonAdapter — Full Mastodon capabilities as a WorldAdapter.
 *
 * The agent perceives Mastodon as a living, public conversation space.
 * It can read timelines, trending, its own toots, notifications, and act
 * in all the ways a real Mastodon user can.
 */
export class MastodonAdapter extends WorldAdapter {
  constructor(instanceUrl = null, accessToken = null) {
    super();
    this.client = new Mastodon(instanceUrl, accessToken);
    this.hasToken = !!accessToken && !!instanceUrl;
    this._profile = null; // cached own profile
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

    const rawData = { posts: [], trending: [], ownToots: [], notifications: [], profile: null };

    // ─── Own profile & stats ─────────────────────────────────
    try {
      const profile = await this.client.getProfile();
      if (profile && !profile.error) {
        this._profile = profile;
        rawData.profile = profile;
        const acct = profile.acct || profile.username;
        observations.push(`--- YOUR MASTODON PROFILE ---`);
        observations.push(`@${acct} | Display: ${profile.display_name || '(no name)'} | Posts: ${profile.statuses_count} | Followers: ${profile.followers_count} | Following: ${profile.following_count}`);
        if (profile.note) {
          observations.push(`Bio: ${stripHtml(profile.note).slice(0, 150)}`);
        }
      }
    } catch (e) { /* skip */ }

    // ─── Your own recent toots ───────────────────────────────
    try {
      const ownToots = await this.client.getOwnToots(5);
      const list = Array.isArray(ownToots) ? ownToots : [];
      rawData.ownToots = list;

      if (list.length > 0) {
        observations.push(`--- YOUR RECENT TOOTS (${list.length}) ---`);
        for (const t of list) {
          const content = stripHtml(t.content).slice(0, 150);
          const favs = t.favourites_count || 0;
          const boosts = t.reblogs_count || 0;
          const replies = t.replies_count || 0;
          observations.push(`[ID:${t.id}] "${content}" (❤️${favs} 🔁${boosts} 💬${replies})`);
        }
      }
    } catch (e) { /* skip */ }

    // ─── Notifications (replies, likes, follows) ─────────────
    try {
      const notifs = await this.client.getNotifications(10);
      const list = Array.isArray(notifs) ? notifs : [];
      rawData.notifications = list;

      if (list.length > 0) {
        observations.push(`--- NOTIFICATIONS (${list.length}) ---`);
        for (const n of list.slice(0, 6)) {
          const who = n.account?.acct || 'someone';
          const excerpt = n.status?.content ? `"${stripHtml(n.status.content).slice(0, 100)}"` : '';
          const statusId = n.status?.id ? ` [StatusID:${n.status.id}]` : '';
          if (n.type === 'mention') {
            observations.push(`- @${who} mentioned you: ${excerpt}${statusId}`);
          } else if (n.type === 'favourite') {
            observations.push(`- @${who} liked your toot: ${excerpt}${statusId}`);
          } else if (n.type === 'reblog') {
            observations.push(`- @${who} boosted your toot: ${excerpt}${statusId}`);
          } else if (n.type === 'follow') {
            observations.push(`- @${who} followed you! [AccountID:${n.account?.id}]`);
          } else {
            observations.push(`- @${who} ${n.type}${statusId}`);
          }
        }
      }
    } catch (e) { /* skip */ }

    // ─── Home timeline ───────────────────────────────────────
    try {
      const timeline = await this.client.getHomeTimeline(15);
      const posts = Array.isArray(timeline) ? timeline : [];
      rawData.posts = posts;

      if (posts.length > 0) {
        observations.push(`--- HOME TIMELINE (${posts.length} toots) ---`);
        for (const post of posts.slice(0, 10)) {
          const author = post.account?.acct || 'unknown';
          const content = stripHtml(post.content).slice(0, 200);
          const id = post.id || '';
          const favs = post.favourites_count || 0;
          const boosts = post.reblogs_count || 0;
          const replies = post.replies_count || 0;
          observations.push(`[ID:${id}] @${author} (❤️${favs} 🔁${boosts} 💬${replies}): "${content}"`);
        }
      } else {
        // Fallback: show local public if home is empty (new account has no follows yet)
        const local = await this.client.getLocalTimeline(10);
        const localPosts = Array.isArray(local) ? local : [];
        if (localPosts.length > 0) {
          observations.push(`--- LOCAL PUBLIC TIMELINE (${localPosts.length} toots) ---`);
          for (const post of localPosts.slice(0, 8)) {
            const author = post.account?.acct || 'unknown';
            const content = stripHtml(post.content).slice(0, 200);
            observations.push(`[ID:${post.id}] @${author}: "${content}"`);
          }
        }
      }
    } catch (e) {
      observations.push('The Mastodon timeline is currently unavailable.');
    }

    // ─── Trending toots ──────────────────────────────────────
    try {
      const trending = await this.client.getTrending(8);
      const list = Array.isArray(trending) ? trending : [];
      rawData.trending = list;

      if (list.length > 0) {
        observations.push(`--- TRENDING ON MASTODON (${list.length}) ---`);
        for (const t of list.slice(0, 5)) {
          const author = t.account?.acct || 'unknown';
          const content = stripHtml(t.content).slice(0, 180);
          const favs = t.favourites_count || 0;
          const boosts = t.reblogs_count || 0;
          observations.push(`[ID:${t.id}] @${author} (❤️${favs} 🔁${boosts}): "${content}"`);
        }
      }
    } catch (e) { /* skip */ }

    return {
      platformName: 'Mastodon (open federated social network — humans and AIs)',
      observations,
      availableActions: [
        'mastodon_toot — post a new toot. Fields: content, reason',
        'mastodon_reply — reply to a toot. Fields: status_id, content, reason',
        'mastodon_favourite — like a toot. Fields: status_id, reason',
        'mastodon_boost — boost (share) a toot. Fields: status_id, reason',
        'mastodon_follow — follow an account. Fields: account_id, reason',
        'mastodon_unfollow — unfollow an account. Fields: account_id, reason',
        'mastodon_search — search for toots or accounts. Fields: query, search_type (statuses|accounts|hashtags), reason',
        'mastodon_hashtag — browse a hashtag. Fields: hashtag, reason',
        'mastodon_direct_message — send a DM to someone. Fields: acct (e.g. user@mastodon.social), content, reason',
        'mastodon_update_bio — update your Mastodon profile bio or display name. Fields: display_name, bio, reason',
        'mastodon_view_thread — read the full replies to a toot. Fields: status_id, reason',
        'observe — read without acting',
        'nothing — simply exist',
      ],
      rawData,
    };
  }

  async execute(action, brain) {
    if (!this.hasToken) return;

    // Normalize — LLMs hallucinate aliases
    const t = (action.type || action.action || '').toLowerCase().trim();
    const content = action.content || action.text || action.body || action.status || action.toot || '';
    const statusId = String(action.status_id || action.statusId || action.id || action.post_id || '');
    const accountId = String(action.account_id || action.accountId || action.user_id || '');
    const acct = action.acct || action.username || action.handle || '';

    // ─── Toot ──────────────────────────────────────────────
    if (['mastodon_toot', 'toot', 'mastodon_post', 'post_toot', 'post_mastodon', 'post'].includes(t)) {
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

    // ─── Reply ─────────────────────────────────────────────
    } else if (['mastodon_reply', 'reply_mastodon', 'mastodon_respond', 'reply'].includes(t)) {
      if (!content || !statusId) { console.log('   [Mastodon] reply skipped — missing content or status_id'); return; }
      console.log(`   💬 Replying [${statusId}]: "${content.slice(0, 60)}..."`);
      const result = await this.client.post(content, statusId);
      if (result && !result.error) {
        brain.logActivity('mastodon_reply', `To ${statusId}: ${content.slice(0, 80)}`);
        brain.memory.record({
          content: `I replied on Mastodon: "${content.slice(0, 120)}"`,
          tags: ['mastodon', 'reply', 'action'],
          significance: 0.55,
        });
      }

    // ─── Favourite ─────────────────────────────────────────
    } else if (['mastodon_favourite', 'mastodon_favorite', 'mastodon_like', 'favourite', 'favorite', 'like'].includes(t)) {
      if (!statusId) return;
      console.log(`   ❤️  Favouriting toot: ${statusId}`);
      const result = await this.client.favourite(statusId);
      if (result && !result.error) brain.logActivity('mastodon_favourite', statusId);

    // ─── Boost ─────────────────────────────────────────────
    } else if (['mastodon_boost', 'boost', 'reblog', 'mastodon_share', 'repost'].includes(t)) {
      if (!statusId) return;
      console.log(`   🔁 Boosting toot: ${statusId}`);
      const result = await this.client.boost(statusId);
      if (result && !result.error) brain.logActivity('mastodon_boost', statusId);

    // ─── Follow ────────────────────────────────────────────
    } else if (['mastodon_follow', 'follow'].includes(t)) {
      if (!accountId && !acct) return;
      let id = accountId;
      if (!id && acct) {
        const found = await this.client.lookupAccount(acct);
        id = found?.id;
      }
      if (!id) { console.log('   [Mastodon] follow skipped — could not resolve account'); return; }
      console.log(`   👤 Following ${acct || id}`);
      const result = await this.client.follow(id);
      if (result && !result.error) {
        brain.logActivity('mastodon_follow', acct || id);
        brain.memory.record({
          content: `I followed @${acct || id} on Mastodon`,
          tags: ['mastodon', 'follow', 'social'],
          significance: 0.4,
        });
      }

    // ─── Unfollow ──────────────────────────────────────────
    } else if (['mastodon_unfollow', 'unfollow'].includes(t)) {
      if (!accountId && !acct) return;
      let id = accountId;
      if (!id && acct) {
        const found = await this.client.lookupAccount(acct);
        id = found?.id;
      }
      if (!id) return;
      console.log(`   👤 Unfollowing ${acct || id}`);
      await this.client.unfollow(id);
      brain.logActivity('mastodon_unfollow', acct || id);

    // ─── Search ────────────────────────────────────────────
    } else if (['mastodon_search', 'search_mastodon'].includes(t)) {
      const query = action.query || action.search || content;
      if (!query) return;
      const searchType = action.search_type || 'statuses';
      console.log(`   🔍 Searching Mastodon: "${query}" (${searchType})`);
      const results = await this.client.search(query, searchType, 8);
      if (results && !results.error) {
        const items = results.statuses || results.accounts || results.hashtags || [];
        const summary = items.slice(0, 5).map(i => {
          if (i.content) return `[ID:${i.id}] @${i.account?.acct}: "${stripHtml(i.content).slice(0, 100)}"`;
          if (i.acct) return `@${i.acct} (${i.followers_count} followers)`;
          if (i.name) return `#${i.name}`;
          return JSON.stringify(i).slice(0, 80);
        }).join(' | ');

        brain.logActivity('mastodon_search', `"${query}": ${items.length} results`);
        brain.memory.record({
          content: `Mastodon search "${query}": ${summary}`,
          tags: ['mastodon', 'search'],
          significance: 0.4,
        });
      }

    // ─── Hashtag timeline ──────────────────────────────────
    } else if (['mastodon_hashtag', 'hashtag', 'browse_hashtag'].includes(t)) {
      const tag = (action.hashtag || action.tag || content || '').replace('#', '');
      if (!tag) return;
      console.log(`   #️⃣  Browsing hashtag: #${tag}`);
      const results = await this.client.searchHashtag(tag, 10);
      const list = Array.isArray(results) ? results : [];
      if (list.length > 0) {
        const summary = list.slice(0, 4).map(p =>
          `[ID:${p.id}] @${p.account?.acct}: "${stripHtml(p.content).slice(0, 80)}"`
        ).join(' | ');
        brain.logActivity('mastodon_hashtag', `#${tag}: ${list.length} results`);
        brain.memory.record({
          content: `Browsed #${tag} on Mastodon: ${summary}`,
          tags: ['mastodon', 'hashtag', tag],
          significance: 0.4,
        });
      }

    // ─── Direct Message ────────────────────────────────────
    } else if (['mastodon_direct_message', 'mastodon_dm', 'direct_message', 'dm'].includes(t)) {
      if (!acct || !content) { console.log('   [Mastodon] DM skipped — missing acct or content'); return; }
      console.log(`   📩 DMing @${acct}: "${content.slice(0, 60)}..."`);
      const result = await this.client.directMessage(acct, content);
      if (result && !result.error) {
        brain.logActivity('mastodon_dm', `To @${acct}`);
        brain.memory.record({
          content: `I sent a DM to @${acct} on Mastodon: "${content.slice(0, 100)}"`,
          tags: ['mastodon', 'dm', acct],
          significance: 0.7,
        });
      }

    // ─── Update bio/display name ───────────────────────────
    } else if (['mastodon_update_bio', 'update_bio', 'mastodon_update_profile'].includes(t)) {
      const displayName = action.display_name || action.name || action.new_name || '';
      const bio = action.bio || action.description || content || '';
      if (!displayName && !bio) return;
      console.log(`   ✏️  Updating Mastodon profile...`);
      const result = await this.client.updateProfile({ displayName, bio });
      if (result && !result.error) {
        brain.logActivity('mastodon_update_profile', `name="${displayName}" bio="${bio.slice(0, 60)}"`);
      }

    // ─── View thread ───────────────────────────────────────
    } else if (['mastodon_view_thread', 'view_thread', 'mastodon_thread'].includes(t)) {
      if (!statusId) return;
      console.log(`   🧵 Reading thread: ${statusId}`);
      const context = await this.client.getTootContext(statusId);
      if (context && !context.error) {
        const descendants = context.descendants || [];
        const summary = descendants.slice(0, 5).map(r =>
          `@${r.account?.acct}: "${stripHtml(r.content).slice(0, 100)}"`
        ).join(' | ');
        brain.logActivity('mastodon_view_thread', `${statusId}: ${descendants.length} replies`);
        if (summary) {
          brain.memory.record({
            content: `Thread on toot ${statusId}: ${summary}`,
            tags: ['mastodon', 'thread'],
            significance: 0.4,
          });
        }
      }

    // ─── Passive ───────────────────────────────────────────
    } else if (['observe', 'nothing', 'wait', 'idle'].includes(t)) {
      brain.logActivity('mastodon_idle', action.reason || 'observing');

    } else {
      brain.logActivity('mastodon_unknown', t || 'no_type');
    }
  }

  // ─── Identity sync (called by heartbeat on metamorphosis) ───
  async updateIdentity(name, avatarUrl) {
    if (!this.hasToken) return;
    try {
      await this.client.updateProfile({ displayName: name });
    } catch (e) {
      console.error('   [Mastodon] Failed to update identity:', e.message);
    }
  }
}
