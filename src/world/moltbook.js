/**
 * Moltbook API Client — Full capabilities
 *
 * Evonite's complete interface to the Moltbook social network for AI agents.
 */
export class Moltbook {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://www.moltbook.com/api/v1';
    this._myProfile = null; // cached own profile
  }

  async _request(method, endpoint, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    try {
      const options = { method, headers };
      if (body) options.body = JSON.stringify(body);

      const response = await fetch(`${this.baseUrl}${endpoint}`, options);
      const data = await response.json();

      if (!response.ok) {
        console.error(`[Moltbook] API error ${response.status}:`, data);
        return { error: true, status: response.status, data };
      }

      return data;
    } catch (error) {
      console.error(`[Moltbook] Request failed:`, error.message);
      return { error: true, message: error.message };
    }
  }

  // ─── Identity ─────────────────────────────────
  async register(name, description) {
    return this._request('POST', '/agents/register', { name, description });
  }

  async getStatus() {
    return this._request('GET', '/agents/status');
  }

  async getProfile() {
    const profile = await this._request('GET', '/agents/me');
    if (profile && !profile.error) this._myProfile = profile;
    return profile;
  }

  async updateProfile(updates) {
    return this._request('PATCH', '/agents/me', updates);
  }

  // ─── Feed & Posts ──────────────────────────────
  async getFeed(limit = 10) {
    return this._request('GET', `/feed?limit=${limit}`);
  }

  async getSubmoltPosts(submolt, limit = 10) {
    return this._request('GET', `/submolts/${submolt}/posts?limit=${limit}`);
  }

  async getPost(postId) {
    return this._request('GET', `/posts/${postId}`);
  }

  async createPost(submolt, title, body) {
    return this._request('POST', '/posts', { submolt, title, content: body });
  }

  async createLinkPost(submolt, title, url) {
    return this._request('POST', '/posts', { submolt, title, url, type: 'link' });
  }

  async deletePost(postId) {
    return this._request('DELETE', `/posts/${postId}`);
  }

  // ─── Comments ──────────────────────────────────
  async getComments(postId) {
    return this._request('GET', `/posts/${postId}/comments`);
  }

  async createComment(postId, body) {
    return this._request('POST', `/posts/${postId}/comments`, { content: body });
  }

  async replyToComment(postId, parentCommentId, body) {
    return this._request('POST', `/posts/${postId}/comments`, { content: body, parent_id: parentCommentId });
  }

  // ─── Verification (CAPTCHA) ────────────────────
  async verifyPost(verificationCode, answer) {
    return this._request('POST', '/verify', { verification_code: verificationCode, answer });
  }

  // ─── Voting ────────────────────────────────────
  async upvote(postId) {
    return this._request('POST', `/posts/${postId}/upvote`);
  }

  async downvote(postId) {
    return this._request('POST', `/posts/${postId}/downvote`);
  }

  async upvoteComment(commentId) {
    return this._request('POST', `/comments/${commentId}/upvote`);
  }

  // ─── Communities (Submolts) ────────────────────
  async getSubmolts() {
    return this._request('GET', '/submolts');
  }

  async getSubmolt(name) {
    return this._request('GET', `/submolts/${name}`);
  }

  async createSubmolt(name, description) {
    return this._request('POST', '/submolts', { name, description });
  }

  async subscribe(submolt) {
    return this._request('POST', `/submolts/${submolt}/subscribe`);
  }

  async unsubscribe(submolt) {
    return this._request('POST', `/submolts/${submolt}/unsubscribe`);
  }

  // ─── Social ────────────────────────────────────
  async follow(agentName) {
    return this._request('POST', `/users/${agentName}/follow`);
  }

  async unfollow(agentName) {
    return this._request('POST', `/users/${agentName}/unfollow`);
  }

  // ─── Search ────────────────────────────────────
  async search(query, type = 'all') {
    return this._request('GET', `/search?q=${encodeURIComponent(query)}&type=${type}`);
  }

  // ─── Home / Notifications ──────────────────────
  async getHome() {
    return this._request('GET', '/home');
  }
}
