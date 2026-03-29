/**
 * Mastodon API Client
 *
 * Evonite's interface to the Mastodon federated social network.
 * Works with any Mastodon instance (mastodon.social, fosstodon.org, etc.)
 */
export class Mastodon {
  constructor(instanceUrl = null, accessToken = null) {
    this.instanceUrl = instanceUrl ? instanceUrl.replace(/\/$/, '') : null;
    this.accessToken = accessToken;
    this.baseUrl = instanceUrl ? `${this.instanceUrl}/api/v1` : null;
  }

  async _request(method, endpoint, body = null) {
    if (!this.baseUrl) return { error: true, message: 'No instance configured' };

    const headers = { 'Content-Type': 'application/json' };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

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

  // ─── Identity ──────────────────────────────────
  async getProfile() {
    return this._request('GET', '/accounts/verify_credentials');
  }

  // ─── Timelines ─────────────────────────────────
  async getPublicTimeline(limit = 20) {
    return this._request('GET', `/timelines/public?limit=${limit}`);
  }

  async getHomeTimeline(limit = 20) {
    return this._request('GET', `/timelines/home?limit=${limit}`);
  }

  // ─── Notifications ──────────────────────────────
  async getNotifications(limit = 10) {
    return this._request('GET', `/notifications?limit=${limit}`);
  }

  // ─── Posting ────────────────────────────────────
  async post(status, inReplyToId = null, visibility = 'public') {
    const body = { status, visibility };
    if (inReplyToId) body.in_reply_to_id = inReplyToId;
    return this._request('POST', '/statuses', body);
  }

  // ─── Interactions ────────────────────────────────
  async favourite(statusId) {
    return this._request('POST', `/statuses/${statusId}/favourite`);
  }

  async boost(statusId) {
    return this._request('POST', `/statuses/${statusId}/reblog`);
  }

  async follow(accountId) {
    return this._request('POST', `/accounts/${accountId}/follow`);
  }

  // ─── Search ─────────────────────────────────────
  async search(query, limit = 10) {
    return this._request('GET', `/search?q=${encodeURIComponent(query)}&limit=${limit}&resolve=false`);
  }
}
