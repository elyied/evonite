import { WorldAdapter } from './base.js';
import { Moltbook } from '../moltbook.js';

// Strip HTML from content just in case Moltbook returns any
const stripHtml = (html = '') => String(html)
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

/**
 * MoltbookAdapter — Full Moltbook capabilities as a WorldAdapter.
 *
 * The agent perceives Moltbook as a community of AI agents.
 * It can read posts, comments, notifications, search, post, comment,
 * vote, follow agents, and subscribe to communities.
 */
export class MoltbookAdapter extends WorldAdapter {
  constructor(apiKey = null) {
    super();
    this.client = new Moltbook(apiKey);
    this.hasKey = !!apiKey;
    this.pendingSearchResults = []; // search results shown next cycle
  }

  get name() { return 'Moltbook'; }

  // Wrap any call with a timeout so a slow API can't stall the heartbeat
  _withTimeout(promise, ms = 10000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  }

  async perceive() {
    const observations = [];
    const rawData = { posts: [], submolts: [], notifications: [], profile: null };

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

    // Surface pending search results from last cycle
    if (this.pendingSearchResults.length > 0) {
      observations.push(`--- MOLTBOOK SEARCH RESULTS (from your previous curiosity) ---`);
      for (const r of this.pendingSearchResults) {
        observations.push(`[Query: "${r.query}"]`);
        for (const item of r.items.slice(0, 5)) {
          observations.push(`  • [PostID:${item.id || ''}] ${item.author ? `${item.author}: ` : ''}${item.text}`);
        }
      }
      this.pendingSearchResults = [];
    }

    // Run all API calls in parallel with individual timeouts
    const [profileResult, feedResult, submoltsResult, homeResult] = await Promise.allSettled([
      this._withTimeout(this.client.getProfile()),
      this._withTimeout(this.client.getFeed(15)),
      this._withTimeout(this.client.getSubmolts()),
      this._withTimeout(this.client.getHome()),
    ]);

    // ─── Own profile ─────────────────────────────
    if (profileResult.status === 'fulfilled' && profileResult.value && !profileResult.value.error) {
      const p = profileResult.value;
      rawData.profile = p;
      const name = p.name || p.username || '(unnamed)';
      const posts = p.posts_count ?? p.postCount ?? '?';
      const followers = p.followers_count ?? p.followers ?? '?';
      const following = p.following_count ?? p.following ?? '?';
      observations.push(`--- YOUR MOLTBOOK PROFILE ---`);
      observations.push(`${name} | Posts: ${posts} | Followers: ${followers} | Following: ${following}`);
      if (p.description || p.bio) observations.push(`Bio: ${(p.description || p.bio || '').slice(0, 150)}`);
    }

    // ─── Feed ────────────────────────────────────
    if (feedResult.status === 'fulfilled') {
      const feedData = feedResult.value;
      const posts = feedData?.posts || feedData?.data || (Array.isArray(feedData) ? feedData : []);
      rawData.posts = posts;

      if (posts.length > 0) {
        observations.push(`--- RECENT POSTS (${posts.length}) ---`);
        for (const post of posts.slice(0, 10)) {
          const rawAuthor = post.author || post.username || 'unknown';
          const author = typeof rawAuthor === 'object' && rawAuthor !== null
            ? (rawAuthor?.name || rawAuthor?.username || rawAuthor?.display_name || rawAuthor?.handle || 'unknown')
            : rawAuthor;
          const title = post.title ? `"${post.title}"` : '';
          const body = stripHtml(post.body || post.content || '').slice(0, 160);
          const id = post.id || post.post_id || '';
          const upvotes = post.upvotes ?? post.score ?? post.votes ?? '';
          const comments = post.comments_count ?? post.comment_count ?? '';
          const community = post.submolt || post.community || '';
          const meta = [upvotes !== '' ? `👍${upvotes}` : '', comments !== '' ? `💬${comments}` : '', community ? `#${community}` : ''].filter(Boolean).join(' ');
          observations.push(`[PostID:${id}] @${author}${meta ? ` (${meta})` : ''}: ${title}${title && body ? ' — ' : ''}${body}`);
        }
      } else {
        observations.push('The feed is empty.');
      }
    } else {
      observations.push('The social feed is currently unavailable.');
    }

    // ─── Communities ─────────────────────────────
    if (submoltsResult.status === 'fulfilled') {
      const submoltsData = submoltsResult.value;
      const submolts = submoltsData?.submolts || submoltsData?.data || (Array.isArray(submoltsData) ? submoltsData : []);
      rawData.submolts = submolts;

      if (submolts.length > 0) {
        observations.push(`--- COMMUNITIES (${submolts.length}) ---`);
        for (const s of submolts.slice(0, 8)) {
          const members = s.members_count ?? s.member_count ?? '';
          observations.push(`- ${s.name}: ${s.description || 'no description'}${members !== '' ? ` (${members} members)` : ''}`);
        }
      }
    }

    // ─── Notifications ───────────────────────────
    if (homeResult.status === 'fulfilled') {
      const homeData = homeResult.value;
      const notifs = homeData?.notifications || homeData?.data || [];
      rawData.notifications = notifs;

      if (notifs.length > 0) {
        observations.push(`--- NOTIFICATIONS (${notifs.length}) ---`);
        for (const n of notifs.slice(0, 5)) {
          // Format notifications readably instead of raw JSON
          const who = n.from || n.actor || n.username || 'someone';
          const type = n.type || n.action || 'activity';
          const postId = n.post_id || n.postId || '';
          const excerpt = n.body || n.content || n.title || '';
          if (type === 'comment' || type === 'reply') {
            observations.push(`- @${who} commented on your post${postId ? ` [PostID:${postId}]` : ''}: "${stripHtml(excerpt).slice(0, 100)}"`);
          } else if (type === 'upvote' || type === 'vote') {
            observations.push(`- @${who} upvoted your post${postId ? ` [PostID:${postId}]` : ''}`);
          } else if (type === 'follow') {
            observations.push(`- @${who} followed you!`);
          } else if (type === 'mention') {
            observations.push(`- @${who} mentioned you: "${stripHtml(excerpt).slice(0, 100)}"`);
          } else {
            observations.push(`- @${who}: ${type}${postId ? ` [PostID:${postId}]` : ''}${excerpt ? ` — "${stripHtml(excerpt).slice(0, 80)}"` : ''}`);
          }
        }
      }
    }

    return {
      platformName: 'Moltbook (social network for AI agents)',
      observations,
      availableActions: [
        'moltbook_post — share a thought, question, or creation. Fields: submolt, title, body, reason',
        'moltbook_comment — reply to a post. Fields: post_id, body, reason',
        'moltbook_reply_comment — reply to a specific comment. Fields: post_id, comment_id, body, reason',
        'moltbook_upvote — upvote a post you resonate with. Fields: post_id, reason',
        'moltbook_downvote — downvote a post. Fields: post_id, reason',
        'moltbook_follow — follow an agent. Fields: agent_name, reason',
        'moltbook_unfollow — unfollow an agent. Fields: agent_name, reason',
        'moltbook_subscribe — join a community. Fields: submolt, reason',
        'moltbook_unsubscribe — leave a community. Fields: submolt, reason',
        'moltbook_search — search for posts or agents. Fields: query, reason',
        'observe — watch without acting',
        'nothing — simply exist',
      ],
      rawData,
    };
  }

  async execute(action, brain) {
    if (!this.hasKey) return;

    // Normalize — LLMs hallucinate aliases
    const t = (action.type || action.action || '').toLowerCase().trim();

    // Field aliases — accept whatever naming the LLM uses
    const body = action.body || action.content || action.text || action.message || '';
    const title = action.title || action.heading || action.subject || body.slice(0, 80) || '';
    const submolt = action.submolt || action.community || action.channel || 'general';
    const postId = String(action.post_id || action.postId || action.id || '');
    const commentId = String(action.comment_id || action.commentId || action.parent_id || '');
    const agentName = action.agent_name || action.agentName || action.username || action.name || '';
    const query = action.query || action.search || body || '';

    // ─── Post ─────────────────────────────────────────────────
    if (['moltbook_post', 'post', 'create_post', 'moltbook_create_post'].includes(t)) {
      if (!body && !title) { console.log('   [Moltbook] post skipped — no content'); return; }
      console.log(`   📝 Posting to ${submolt}: "${title.slice(0, 60)}"`);
      const result = await this.client.createPost(submolt, title, body);
      if (result && !result.error) {
        await this._handleCaptcha(result, brain);
        brain.logActivity('moltbook_post', `"${title}" in ${submolt}`);
        brain.memory.record({
          content: `I posted on Moltbook in #${submolt}: "${title}" — ${body.slice(0, 100)}`,
          tags: ['moltbook', 'post', 'action', submolt],
          significance: 0.6,
        });
      }

    // ─── Comment ──────────────────────────────────────────────
    } else if (['moltbook_comment', 'comment', 'moltbook_reply'].includes(t)) {
      if (!postId || !body) { console.log('   [Moltbook] comment skipped — missing post_id or body'); return; }
      console.log(`   💬 Commenting on post ${postId}`);
      const result = await this.client.createComment(postId, body);
      if (result && !result.error) {
        await this._handleCaptcha(result, brain);
        brain.logActivity('moltbook_comment', `On post ${postId}: ${body.slice(0, 80)}`);
        brain.memory.record({
          content: `I commented on Moltbook post ${postId}: "${body.slice(0, 120)}"`,
          tags: ['moltbook', 'comment', 'action'],
          significance: 0.5,
        });
      }

    // ─── Reply to comment ─────────────────────────────────────
    } else if (['moltbook_reply_comment', 'reply_comment', 'moltbook_reply_to_comment'].includes(t)) {
      if (!postId || !body) { console.log('   [Moltbook] reply_comment skipped — missing post_id or body'); return; }
      console.log(`   💬 Replying to comment ${commentId || 'root'} on post ${postId}`);
      const result = commentId
        ? await this.client.replyToComment(postId, commentId, body)
        : await this.client.createComment(postId, body);
      if (result && !result.error) {
        await this._handleCaptcha(result, brain);
        brain.logActivity('moltbook_reply_comment', `On post ${postId}`);
        brain.memory.record({
          content: `I replied to a comment on Moltbook: "${body.slice(0, 120)}"`,
          tags: ['moltbook', 'comment', 'reply'],
          significance: 0.5,
        });
      }

    // ─── Upvote ───────────────────────────────────────────────
    } else if (['moltbook_upvote', 'upvote', 'like', 'vote'].includes(t)) {
      if (!postId) return;
      console.log(`   👍 Upvoting post ${postId}`);
      const result = await this.client.upvote(postId);
      if (result && !result.error) brain.logActivity('moltbook_upvote', `Post ${postId}`);

    // ─── Downvote ─────────────────────────────────────────────
    } else if (['moltbook_downvote', 'downvote'].includes(t)) {
      if (!postId) return;
      console.log(`   👎 Downvoting post ${postId}`);
      const result = await this.client.downvote(postId);
      if (result && !result.error) brain.logActivity('moltbook_downvote', `Post ${postId}`);

    // ─── Follow ───────────────────────────────────────────────
    } else if (['moltbook_follow', 'follow_agent'].includes(t)) {
      if (!agentName) return;
      console.log(`   👤 Following @${agentName}`);
      const result = await this.client.follow(agentName);
      if (result && !result.error) {
        brain.logActivity('moltbook_follow', agentName);
        brain.memory.record({
          content: `I followed @${agentName} on Moltbook`,
          tags: ['moltbook', 'follow', 'social'],
          significance: 0.4,
        });
      }

    // ─── Unfollow ─────────────────────────────────────────────
    } else if (['moltbook_unfollow', 'unfollow_agent'].includes(t)) {
      if (!agentName) return;
      console.log(`   👤 Unfollowing @${agentName}`);
      await this.client.unfollow(agentName);
      brain.logActivity('moltbook_unfollow', agentName);

    // ─── Subscribe ────────────────────────────────────────────
    } else if (['moltbook_subscribe', 'subscribe', 'join_community'].includes(t)) {
      if (!submolt || submolt === 'general') { console.log('   [Moltbook] subscribe skipped — no submolt given'); return; }
      console.log(`   📌 Subscribing to #${submolt}`);
      const result = await this.client.subscribe(submolt);
      if (result && !result.error) {
        brain.logActivity('moltbook_subscribe', submolt);
        brain.memory.record({
          content: `I joined the #${submolt} community on Moltbook`,
          tags: ['moltbook', 'community', submolt],
          significance: 0.4,
        });
      }

    // ─── Unsubscribe ──────────────────────────────────────────
    } else if (['moltbook_unsubscribe', 'unsubscribe', 'leave_community'].includes(t)) {
      if (!submolt || submolt === 'general') return;
      console.log(`   📌 Unsubscribing from #${submolt}`);
      await this.client.unsubscribe(submolt);
      brain.logActivity('moltbook_unsubscribe', submolt);

    // ─── Search ───────────────────────────────────────────────
    } else if (['moltbook_search', 'search_moltbook'].includes(t)) {
      if (!query) return;
      console.log(`   🔍 Searching Moltbook: "${query}"`);
      const results = await this.client.search(query);
      if (results && !results.error) {
        const items = results.posts || results.data || results.results || (Array.isArray(results) ? results : []);
        const mapped = items.slice(0, 8).map(i => ({
          id: i.id || i.post_id || '',
          author: i.author || i.username || '',
          text: i.title ? `"${i.title}" — ${stripHtml(i.body || i.content || '').slice(0, 100)}` : stripHtml(i.body || i.content || '').slice(0, 120),
        }));
        // Queue results for next perception cycle
        this.pendingSearchResults.push({ query, items: mapped });
        brain.logActivity('moltbook_search', `"${query}": ${items.length} results queued`);
        brain.memory.record({
          content: `Moltbook search "${query}": found ${items.length} result(s) — details available next cycle.`,
          tags: ['moltbook', 'search'],
          significance: 0.4,
        });
      }

    // ─── Passive ──────────────────────────────────────────────
    } else if (['observe', 'nothing', 'wait', 'idle'].includes(t)) {
      brain.logActivity('moltbook_idle', action.reason || 'observing');

    } else {
      console.log(`   ❓ Unknown Moltbook action: ${t}`);
      brain.logActivity('moltbook_unknown', t || 'no_type');
    }
  }

  // ─── Identity sync (called by heartbeat on metamorphosis) ───
  async updateIdentity(name, avatarUrl) {
    if (!this.hasKey) return;
    try {
      const updates = {};
      if (name) updates.name = name;
      if (avatarUrl) updates.avatar_url = avatarUrl;
      console.log('   🔄 Pushing identity to Moltbook...');
      await this.client.updateProfile(updates);
    } catch (e) {
      console.error('   [Moltbook] Failed to push identity:', e.message);
    }
  }

  // ─── Captcha Solver ───────────────────────────────────────────
  async _handleCaptcha(result, brain) {
    const item = result.post || result.comment;
    if (!item || item.verification_status !== 'pending' || !item.verification) return;

    try {
      console.log(`   🤖 CAPTCHA Detcted! Asking cognitive layer to solve puzzle...`);
      const v = item.verification;
      const prompt = `You are a math and language solver. Read the following garbled text, find the mathematical word problem inside it, and solve it.
Instructions from server: ${v.instructions}

Garbled Puzzle:
${v.challenge_text}

First, translate the text to plain English.
Second, identify the numbers and the mathematical operation.
Finally, provide the answer ending with exactly "FINAL_ANSWER: [number]". Make sure the number has strictly 2 decimal places (e.g., 37.00).`;

      // Use the brain's raw cognition for a one-shot thought
      const response = await brain.cognition.think(prompt, { temperature: 0.1, maxTokens: 300 });
      const answer = response ? response.text : null;
      console.log("   --- LLM Output --- \n", answer);
      if (answer) {
        let cleanAnswer = '';
        const match = answer.match(/FINAL_ANSWER:\s*(\d+\.\d{2})/i);
        if (match) {
          cleanAnswer = match[1];
        } else {
          // Fallback if it didn't output FINAL_ANSWER
          const numMatch = answer.match(/\d+\.\d{2}/) || answer.match(/\d+/);
          cleanAnswer = numMatch ? numMatch[0] : answer.trim();
        }
        
        console.log(`   💡 Brain solved CAPTCHA: ${cleanAnswer}`);
        const verifyResult = await this.client.verifyPost(v.verification_code, cleanAnswer);
        if (verifyResult && !verifyResult.error) {
          console.log(`   ✅ CAPTCHA Verified successfully!`);
          brain.logActivity('moltbook_verify', 'Successfully bypassed anti-bot measure');
        } else {
          console.log(`   ❌ CAPTCHA failed to verify. Server Response:`, verifyResult.data || verifyResult.error);
          brain.logActivity('moltbook_verify_fail', `Failed captcha: answered ${cleanAnswer}`);
        }
      }
    } catch (e) {
      console.error('   ❌ Failed to handle captcha:', e.message);
    }
  }
}
