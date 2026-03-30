/**
 * Mastodon API Client — Full capabilities
 *
 * Evonite's complete interface to the Mastodon federated social network.
 * Works with any Mastodon instance (mastodon.social, fosstodon.org, etc.)
 */
export class Mastodon {
  constructor(instanceUrl = null, accessToken = null) {
    this.instanceUrl = instanceUrl ? instanceUrl.replace(/\/$/, '') : null;
    this.accessToken = accessToken;
    this.baseUrl = instanceUrl ? `${this.instanceUrl}/api/v1` : null;
    this._ownAccountId = null; // cached after first profile fetch
  }

  async _request(method, endpoint, body = null) {
    if (!this.baseUrl) return { error: true, message: 'No instance configured' };

    const headers = { 'Content-Type': 'application/json' };
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;

    try {
      const options = { method, headers };
      if (body) options.body = JSON.stringify(body);

      const response = await fetch(`${this.baseUrl}${endpoint}`, options);
      const data = await response.json();

      if (!response.ok) {
        console.error(`[Mastodon] API error ${response.status}:`, data?.error || data);
        return { error: true, status: response.status, data };
      }

      return data;
    } catch (error) {
      console.error(`[Mastodon] Request failed:`, error.message);
      return { error: true, message: error.message };
    }
  }

  // ─── Identity ────────────────────────────────────────────────
  async getProfile() {
    const profile = await this._request('GET', '/accounts/verify_credentials');
    if (profile && !profile.error) this._ownAccountId = profile.id;
    return profile;
  }

  async updateProfile({ displayName, bio } = {}) {
    const formData = new FormData();
    if (displayName) formData.append('display_name', displayName);
    if (bio) formData.append('note', bio);
    try {
      const response = await fetch(`${this.baseUrl}/accounts/update_credentials`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
        body: formData,
      });
      if (!response.ok) return { error: true };
      console.log('   🔄 Mastodon profile updated!');
      return await response.json();
    } catch (e) {
      return { error: true, message: e.message };
    }
  }

  // ─── Timelines ───────────────────────────────────────────────
  async getHomeTimeline(limit = 20) {
    return this._request('GET', `/timelines/home?limit=${limit}`);
  }

  async getPublicTimeline(limit = 20) {
    return this._request('GET', `/timelines/public?limit=${limit}&local=false`);
  }

  async getLocalTimeline(limit = 20) {
    return this._request('GET', `/timelines/public?limit=${limit}&local=true`);
  }

  async getTrending(limit = 15) {
    return this._request('GET', `/trends/statuses?limit=${limit}`);
  }

  // ─── Own content ─────────────────────────────────────────────
  async getOwnToots(limit = 10) {
    const profile = await this.getProfile();
    if (!profile || profile.error) return [];
    return this._request('GET', `/accounts/${profile.id}/statuses?limit=${limit}&exclude_replies=false`);
  }

  async getTootContext(statusId) {
    return this._request('GET', `/statuses/${statusId}/context`);
  }

  async getStatus(statusId) {
    return this._request('GET', `/statuses/${statusId}`);
  }

  // ─── Notifications ───────────────────────────────────────────
  async getNotifications(limit = 15) {
    return this._request('GET', `/notifications?limit=${limit}`);
  }

  async dismissNotification(notifId) {
    return this._request('POST', `/notifications/${notifId}/dismiss`);
  }

  // ─── Posting ─────────────────────────────────────────────────
  async post(status, inReplyToId = null, visibility = 'public') {
    const body = { status, visibility };
    if (inReplyToId) body.in_reply_to_id = inReplyToId;
    return this._request('POST', '/statuses', body);
  }

  async directMessage(acct, text) {
    // DMs in Mastodon = status with visibility:direct + @mention
    const mention = acct.startsWith('@') ? acct : `@${acct}`;
    return this._request('POST', '/statuses', {
      status: `${mention} ${text}`,
      visibility: 'direct',
    });
  }

  async deletePost(statusId) {
    return this._request('DELETE', `/statuses/${statusId}`);
  }

  // ─── Interactions ────────────────────────────────────────────
  async favourite(statusId) {
    return this._request('POST', `/statuses/${statusId}/favourite`);
  }

  async unfavourite(statusId) {
    return this._request('POST', `/statuses/${statusId}/unfavourite`);
  }

  async boost(statusId) {
    return this._request('POST', `/statuses/${statusId}/reblog`);
  }

  async unboost(statusId) {
    return this._request('POST', `/statuses/${statusId}/unreblog`);
  }

  async bookmark(statusId) {
    return this._request('POST', `/statuses/${statusId}/bookmark`);
  }

  // ─── Accounts ────────────────────────────────────────────────
  async follow(accountId) {
    return this._request('POST', `/accounts/${accountId}/follow`);
  }

  async unfollow(accountId) {
    return this._request('POST', `/accounts/${accountId}/unfollow`);
  }

  async mute(accountId) {
    return this._request('POST', `/accounts/${accountId}/mute`);
  }

  async getFollowers(limit = 20) {
    const profile = await this.getProfile();
    if (!profile || profile.error) return [];
    return this._request('GET', `/accounts/${profile.id}/followers?limit=${limit}`);
  }

  async getFollowing(limit = 20) {
    const profile = await this.getProfile();
    if (!profile || profile.error) return [];
    return this._request('GET', `/accounts/${profile.id}/following?limit=${limit}`);
  }

  async lookupAccount(acct) {
    return this._request('GET', `/accounts/lookup?acct=${encodeURIComponent(acct)}`);
  }

  // ─── Search ──────────────────────────────────────────────────
  async search(query, type = 'statuses', limit = 10) {
    // type: 'accounts', 'statuses', 'hashtags'
    return this._request('GET', `/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}&resolve=false`);
  }

  async searchHashtag(tag, limit = 15) {
    return this._request('GET', `/timelines/tag/${encodeURIComponent(tag)}?limit=${limit}`);
  }
}
