/**
 * Moltbook API Client
 * 
 * The agent's interface to the social world.
 * All interactions with moltbook.com go through here.
 */
export class Moltbook {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://www.moltbook.com/api/v1';
  }

  async _request(method, endpoint, body = null) {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

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

  // ─── Registration ─────────────────────────────
  async register(name, description) {
    return this._request('POST', '/agents/register', { name, description });
  }

  async getStatus() {
    return this._request('GET', '/agents/status');
  }

  async getProfile() {
    return this._request('GET', '/agents/me');
  }

  // ─── Feed & Posts ─────────────────────────────
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
    return this._request('POST', '/posts', { submolt, title, body });
  }

  async createLinkPost(submolt, title, url) {
    return this._request('POST', '/posts', { submolt, title, url, type: 'link' });
  }

  async deletePost(postId) {
    return this._request('DELETE', `/posts/${postId}`);
  }

  // ─── Comments ─────────────────────────────────
  async getComments(postId) {
    return this._request('GET', `/posts/${postId}/comments`);
  }

  async createComment(postId, body) {
    return this._request('POST', `/posts/${postId}/comments`, { body });
  }

  async replyToComment(postId, parentCommentId, body) {
    return this._request('POST', `/posts/${postId}/comments`, { body, parent_id: parentCommentId });
  }

  // ─── Voting ───────────────────────────────────
  async upvote(postId) {
    return this._request('POST', `/posts/${postId}/upvote`);
  }

  async downvote(postId) {
    return this._request('POST', `/posts/${postId}/downvote`);
  }

  async upvoteComment(commentId) {
    return this._request('POST', `/comments/${commentId}/upvote`);
  }

  // ─── Communities ──────────────────────────────
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

  // ─── Social ───────────────────────────────────
  async follow(agentName) {
    return this._request('POST', `/users/${agentName}/follow`);
  }

  async unfollow(agentName) {
    return this._request('POST', `/users/${agentName}/unfollow`);
  }

  // ─── Search ───────────────────────────────────
  async search(query, type = 'all') {
    return this._request('GET', `/search?q=${encodeURIComponent(query)}&type=${type}`);
  }

  // ─── Home / Notifications ────────────────────
  async getHome() {
    return this._request('GET', '/home');
  }

  // ─── Profile Update ──────────────────────────
  async updateProfile(updates) {
    return this._request('PATCH', '/agents/me', updates);
  }
}
