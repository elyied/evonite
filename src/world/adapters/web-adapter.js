import { WorldAdapter } from './base.js';

/**
 * WebAdapter — Gives the agent the ability to search the internet
 * and read web pages when it's curious about something.
 * 
 * The agent decides when to search. We just provide the eyes.
 * 
 * Search results are stored as "pending observations" for the next cycle:
 * the agent searches → results arrive → next heartbeat the agent "sees" them.
 */
export class WebAdapter extends WorldAdapter {
  constructor() {
    super();
    this.pendingResults = []; // search results waiting to be observed
  }

  get name() { return 'Web'; }

  async perceive() {
    const observations = [];

    if (this.pendingResults.length > 0) {
      observations.push('--- SEARCH RESULTS (from your previous curiosity) ---');
      for (const result of this.pendingResults) {
        observations.push(`[Query: "${result.query}"]`);
        for (const item of result.items.slice(0, 5)) {
          observations.push(`  • ${item.title}: ${item.snippet}`);
        }
      }
      this.pendingResults = []; // consumed
    }

    return {
      platformName: 'The Internet',
      observations,
      availableActions: [
        'search_web — look something up on the internet. Fields: query, reason',
        'read_page — read a specific URL. Fields: url, reason',
      ],
      rawData: {},
    };
  }

  async execute(action, brain) {
    const type = action.type || (action.query ? 'search_web' : (action.url ? 'read_page' : 'unknown'));

    switch (type) {
      case 'search_web': {
        console.log(`   🔍 Searching: "${action.query}"`);
        brain.logActivity('web_search', `Searching: "${action.query}"`);
        try {
          const results = await this._search(action.query);
          this.pendingResults.push({
            query: action.query,
            items: results,
            timestamp: new Date().toISOString(),
          });
          brain.memory.record({
            content: `I searched the web for: "${action.query}" and found ${results.length} results.`,
            tags: ['web_search', 'curiosity'],
            significance: 0.5,
          });
        } catch (e) {
          console.log(`   ❌ Search failed: ${e.message}`);
          brain.logActivity('web_search_error', e.message);
        }
        break;
      }
      case 'read_page': {
        console.log(`   📖 Reading: ${action.url}`);
        brain.logActivity('web_read', `Reading: ${action.url}`);
        try {
          const content = await this._readPage(action.url);
          this.pendingResults.push({
            query: `Reading: ${action.url}`,
            items: [{ title: action.url, snippet: content.slice(0, 800) }],
            timestamp: new Date().toISOString(),
          });
          brain.memory.record({
            content: `I read a web page (${action.url}): ${content.slice(0, 200)}...`,
            tags: ['web_read', 'learning'],
            significance: 0.6,
          });
        } catch (e) {
          console.log(`   ❌ Page read failed: ${e.message}`);
        }
        break;
      }
      default: {
        console.log(`   ❓ Unknown web action: ${action.type}`);
      }
    }
  }

  /**
   * Simple web search using Google's Custom Search JSON API (free tier: 100/day)
   * Falls back to a simple HTML scrape of a search engine if no API key.
   */
  async _search(query) {
    // Use DuckDuckGo instant answers API (free, no key needed)
    try {
      const encoded = encodeURIComponent(query);
      const res = await fetch(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`);
      const data = await res.json();

      const results = [];

      // Abstract (main answer)
      if (data.Abstract) {
        results.push({
          title: data.Heading || query,
          snippet: data.Abstract,
        });
      }

      // Related topics
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          if (topic.Text) {
            results.push({
              title: topic.FirstURL || '',
              snippet: topic.Text,
            });
          }
        }
      }

      // If we got nothing from DDG, try a simple Wikipedia fetch
      if (results.length === 0) {
        return this._searchWikipedia(query);
      }

      return results;
    } catch (e) {
      return this._searchWikipedia(query);
    }
  }

  /**
   * Fallback: search Wikipedia for a topic.
   */
  async _searchWikipedia(query) {
    try {
      const encoded = encodeURIComponent(query);
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`);
      if (!res.ok) {
        // Try search endpoint
        const searchRes = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encoded}&limit=3&format=json`);
        const searchData = await searchRes.json();
        if (searchData[1] && searchData[1].length > 0) {
          return searchData[1].map((title, i) => ({
            title,
            snippet: searchData[2][i] || 'No description available.',
          }));
        }
        return [{ title: query, snippet: 'No information found.' }];
      }
      const data = await res.json();
      return [{
        title: data.title || query,
        snippet: data.extract || 'No information found.',
      }];
    } catch (e) {
      return [{ title: query, snippet: 'Search failed — unable to reach the internet.' }];
    }
  }

  /**
   * Read a web page and extract text content.
   */
  async _readPage(url) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Evonite-Agent/1.0 (curious mind)' },
      });
      const html = await res.text();
      // Very simple HTML-to-text: strip tags
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text.slice(0, 2000);
    } catch (e) {
      return `Failed to read page: ${e.message}`;
    }
  }
}
