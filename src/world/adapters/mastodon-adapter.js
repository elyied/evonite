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
    this._profile = null;
    this.pendingSearchResults = []; // search results waiting to be shown next cycle
    this.pendingThreads = []; // threads waiting to be read next cycle
  }

  get name() { return 'Mastodon'; }

  // Wrap any promise with a timeout so a slow Mastodon server can't stall a beat
  _withTimeout(promise, ms = 10000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  }

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

    // Surface any pending search results from last cycle
    if (this.pendingSearchResults.length > 0) {
      observations.push(`--- MASTODON SEARCH RESULTS (from your previous curiosity) ---`);
      for (const r of this.pendingSearchResults) {
        observations.push(`[Query: "${r.query}"]`);
        for (const item of r.items.slice(0, 5)) {
          observations.push(`  • [ID:${item.id || ''}] ${item.author ? `@${item.author}: ` : ''}"${item.text}"`); 
        }
      }
      this.pendingSearchResults = [];
    }

    // Surface any pending thread views from last cycle
    if (this.pendingThreads.length > 0) {
      observations.push(`--- MASTODON THREAD CONTEXT (from your request to view thread) ---`);
      for (const t of this.pendingThreads) {
        observations.push(`[Thread for Status ID: ${t.statusId}]`);
        if (t.replies.length === 0) {
          observations.push(`  • There are no replies to this toot yet.`);
        } else {
          for (const r of t.replies) {
            const isSelf = this._profile && r.account?.acct === (this._profile.acct || this._profile.username);
            observations.push(`  • [ID:${r.id}] @${r.account?.acct} ${isSelf ? '(YOUR OWN REPLY)' : ''}: "${stripHtml(r.content).slice(0, 150)}"`);
          }
        }
      }
      this.pendingThreads = [];
    }

    // Run all API calls in parallel with individual timeouts
    const [profileResult, ownTootsResult, notifsResult, timelineResult, trendingResult] = await Promise.allSettled([
      this._withTimeout(this.client.getProfile()),
      this._withTimeout(this.client.getOwnToots(5)),
      this._withTimeout(this.client.getNotifications(10)),
      this._withTimeout(this.client.getHomeTimeline(15)),
      this._withTimeout(this.client.getTrending(8)),
    ]);

    // ─── Profile ─────────────────────────────────────────────
    if (profileResult.status === 'fulfilled' && profileResult.value && !profileResult.value.error) {
      const p = profileResult.value;
      this._profile = p;
      rawData.profile = p;
      observations.push(`--- YOUR MASTODON PROFILE ---`);
      observations.push(`@${p.acct || p.username} | Display: ${p.display_name || '(no name)'} | Posts: ${p.statuses_count} | Followers: ${p.followers_count} | Following: ${p.following_count}`);
      if (p.note) observations.push(`Bio: ${stripHtml(p.note).slice(0, 150)}`);
    }

    // ─── Own toots ───────────────────────────────────────────
    if (ownTootsResult.status === 'fulfilled') {
      const list = Array.isArray(ownTootsResult.value) ? ownTootsResult.value : [];
      rawData.ownToots = list;
      if (list.length > 0) {
        observations.push(`--- YOUR RECENT TOOTS (${list.length}) ---`);
        for (const t of list)
          observations.push(`[ID:${t.id}] "${stripHtml(t.content).slice(0, 150)}" (❤️${t.favourites_count||0} 🔁${t.reblogs_count||0} 💬${t.replies_count||0})`);
      }
    }

    // ─── Notifications ───────────────────────────────────────
    if (notifsResult.status === 'fulfilled') {
      const list = Array.isArray(notifsResult.value) ? notifsResult.value : [];
      rawData.notifications = list;
      if (list.length > 0) {
        observations.push(`--- NOTIFICATIONS (${list.length}) ---`);
        for (const n of list.slice(0, 6)) {
          const who = n.account?.acct || 'someone';
          const excerpt = n.status?.content ? `"${stripHtml(n.status.content).slice(0, 100)}"` : '';
          const sid = n.status?.id ? ` [StatusID:${n.status.id}]` : '';
          if (n.type === 'mention') observations.push(`- @${who} mentioned you: ${excerpt}${sid}`);
          else if (n.type === 'favourite') observations.push(`- @${who} liked your toot: ${excerpt}${sid}`);
          else if (n.type === 'reblog') observations.push(`- @${who} boosted your toot: ${excerpt}${sid}`);
          else if (n.type === 'follow') observations.push(`- @${who} followed you! [AccountID:${n.account?.id}]`);
          else observations.push(`- @${who} ${n.type}${sid}`);
        }
      }
    }

    // ─── Home timeline (fallback to local) ───────────────────
    if (timelineResult.status === 'fulfilled') {
      const posts = Array.isArray(timelineResult.value) ? timelineResult.value : [];
      rawData.posts = posts;
      if (posts.length > 0) {
        observations.push(`--- HOME TIMELINE (${posts.length} toots) ---`);
        for (const post of posts.slice(0, 10))
          observations.push(`[ID:${post.id}] @${post.account?.acct||'?'} (❤️${post.favourites_count||0} 🔁${post.reblogs_count||0} 💬${post.replies_count||0}): "${stripHtml(post.content).slice(0, 200)}"`);
      } else {
        try {
          const local = await this._withTimeout(this.client.getLocalTimeline(10));
          const localPosts = Array.isArray(local) ? local : [];
          if (localPosts.length > 0) {
            observations.push(`--- LOCAL PUBLIC TIMELINE (${localPosts.length} toots) ---`);
            for (const post of localPosts.slice(0, 8))
              observations.push(`[ID:${post.id}] @${post.account?.acct||'?'}: "${stripHtml(post.content).slice(0, 200)}"`);
          }
        } catch (e) { /* skip */ }
      }
    } else {
      observations.push('The Mastodon timeline is currently unavailable.');
    }

    // ─── Trending ────────────────────────────────────────────
    if (trendingResult.status === 'fulfilled') {
      const list = Array.isArray(trendingResult.value) ? trendingResult.value : [];
      rawData.trending = list;
      if (list.length > 0) {
        observations.push(`--- TRENDING ON MASTODON (${list.length}) ---`);
        for (const t of list.slice(0, 5))
          observations.push(`[ID:${t.id}] @${t.account?.acct||'?'} (❤️${t.favourites_count||0} 🔁${t.reblogs_count||0}): "${stripHtml(t.content).slice(0, 180)}"`);
      }
    }

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
        const mapped = items.slice(0, 8).map(i => {
          if (i.content) return { id: i.id, author: i.account?.acct, text: stripHtml(i.content).slice(0, 120) };
          if (i.acct) return { id: i.id, text: `@${i.acct} (${i.followers_count} followers)` };
          if (i.name) return { id: '', text: `#${i.name}` };
          return { id: '', text: JSON.stringify(i).slice(0, 80) };
        });
        // Queue results to surface in NEXT perception cycle
        this.pendingSearchResults.push({ query, items: mapped });
        brain.logActivity('mastodon_search', `"${query}": ${items.length} results queued for next cycle`);
        brain.memory.record({
          content: `Mastodon search "${query}": found ${items.length} result(s) — details available next cycle.`,
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
        
        // Queue thread to surface in NEXT perception cycle
        this.pendingThreads.push({
          statusId,
          replies: descendants
        });

        const summary = descendants.slice(0, 5).map(r => {
          const isSelf = this._profile && r.account?.acct === (this._profile.acct || this._profile.username);
          return `@${r.account?.acct}${isSelf ? '(you)' : ''}: "${stripHtml(r.content).slice(0, 50)}"`;
        }).join(' | ');

        brain.logActivity('mastodon_view_thread', `${statusId}: ${descendants.length} replies queued for next cycle`);
        
        // Still save it to memory so it has a permanent record
        brain.memory.record({
          content: `I investigated toot ${statusId}. It has ${descendants.length} replies: ${summary || 'None.'}`,
          tags: ['mastodon', 'thread'],
          significance: 0.4,
        });
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
