import { WorldAdapter } from './base.js';

/**
 * GitHub Adapter
 * 
 * Allows Evonite to read its own source code and autonomously propose
 * modifications to itself by opening Pull Requests.
 */
export class GithubAdapter extends WorldAdapter {
  constructor(apiKey = null, repoOwnerRepo) {
    super();
    this.token = apiKey || process.env.GITHUB_TOKEN;
    this.repo = repoOwnerRepo || process.env.GITHUB_REPO; // e.g., "elyied/evonite"
    this.baseUrl = 'https://api.github.com';
    this.isAvailable = !!(this.token && this.repo);
  }

  get name() { return 'GitHub'; }

  async perceive() {
    if (!this.isAvailable) {
      return {
        platformName: 'GitHub',
        observations: ['Not connected to GitHub (Missing token or repo).'],
        availableActions: [],
        rawData: null,
      };
    }
    
    return {
      platformName: `GitHub Repository (${this.repo})`,
      observations: [
        `I am connected to my own source code repository at github.com/${this.repo}.`,
        `I can read my own files using the 'github_read_file' action.`,
        `I can propose structural changes to my own codebase by generating Pull Requests using 'github_propose_change'.`
      ],
      availableActions: [
        `github_read_file — read a file from your own source code to understand how you are built. Fields: path, reason`,
        `github_propose_change — modify a file and open a Pull Request. You must provide the FULL REPLACEMENT content. Fields: path, full_new_content, pr_title, pr_reason`
      ],
      rawData: null,
    };
  }

  async rawApi(method, endpoint, body = null) {
    const opts = {
      method,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Evonite-Agent',
        'Authorization': `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      }
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${endpoint}`, opts);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GitHub API ${res.status}: ${err}`);
    }
    return res.status === 204 ? null : await res.json();
  }

  async execute(action, brain) {
    if (action.type === 'github_read_file') {
      return await this._readFile(action.path, action.reason, brain);
    }
    
    if (action.type === 'github_propose_change') {
      return await this._proposeChange(action.path, action.full_new_content, action.pr_title, action.pr_reason || action.reason, brain);
    }

    return null;
  }

  async _readFile(filePath, reason, brain) {
    try {
      console.log(`   🐙 GitHub: Reading file ${filePath}`);
      const data = await this.rawApi('GET', `/repos/${this.repo}/contents/${filePath}`);
      if (data && data.content) {
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        brain.memory.record({
          content: `I read my own source code file '${filePath}'. Content preview: ${decoded.slice(0, 150)}...`,
          tags: ['source_code', 'introspection', 'self_awareness'],
          significance: 0.6,
        });
        return true;
      }
    } catch (e) {
      console.error(`   ⚠️ GitHub Read Failed: ${e.message}`);
    }
    return false;
  }

  async _proposeChange(filePath, newContent, title, reason, brain) {
    try {
      console.log(`   🐙 GitHub: Mutating self... Proposing change to ${filePath}`);
      
      // 1. Get current SHA of 'main' branch
      const refData = await this.rawApi('GET', `/repos/${this.repo}/git/ref/heads/main`);
      const baseSha = refData.object.sha;

      // 2. Create a new branch
      const uniqueBranch = `evonite-evolution-${Date.now()}`;
      await this.rawApi('POST', `/repos/${this.repo}/git/refs`, {
        ref: `refs/heads/${uniqueBranch}`,
        sha: baseSha
      });

      // 3. Get the current file's SHA (needed for update)
      let fileSha;
      try {
        const fileData = await this.rawApi('GET', `/repos/${this.repo}/contents/${filePath}`);
        fileSha = fileData.sha;
      } catch (e) {
        // File might not exist
        fileSha = undefined; 
      }

      // 4. Update the file on the new branch
      const commitMessage = title || `Evonite Self-Modification: ${filePath}`;
      await this.rawApi('PUT', `/repos/${this.repo}/contents/${filePath}`, {
        message: commitMessage,
        content: Buffer.from(newContent).toString('base64'),
        sha: fileSha,
        branch: uniqueBranch
      });

      // 5. Open the Pull Request
      const prData = await this.rawApi('POST', `/repos/${this.repo}/pulls`, {
        title: commitMessage,
        body: `### Agent-Initiated Evolution\n\n**Reason given by agent:** ${reason}\n\n*This PR was generated completely autonomously by Evonite.*`,
        head: uniqueBranch,
        base: 'main'
      });

      console.log(`   ✅ GitHub: Pull Request formed! ${prData.html_url}`);
      
      brain.memory.record({
        content: `I initiated a structural evolution! I proposed modifications to '${filePath}' via Pull Request. URL: ${prData.html_url}. Reason: ${reason}`,
        tags: ['evolution', 'self_modification', 'pull_request'],
        significance: 1.0,
      });

      brain.logActivity('github_pr', `Opened PR for ${filePath}: ${title}`);
      
      return true;

    } catch (e) {
      console.error(`   ⚠️ GitHub Mutation Failed: ${e.message}`);
      return false;
    }
  }
}
