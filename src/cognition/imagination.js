import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const MANIFEST_FILE = path.join(IMAGES_DIR, '_manifest.json');

/**
 * Imagination — The agent's ability to visualize.
 *
 * Generates images from the agent's descriptions using Gemini.
 * The visual style of each image is decided autonomously by the agent's
 * own cognition layer, which reads the current drive state (whatever names
 * the agent invented) and writes a visual art style description itself.
 * Nothing is hardcoded — the agent's mood becomes art in its own words.
 */
export class Imagination {
  constructor(apiKeyOrKeys, cognition = null) {
    this.apiKeys = Array.isArray(apiKeyOrKeys)
      ? apiKeyOrKeys.filter(Boolean)
      : [apiKeyOrKeys].filter(Boolean);
    this.currentKeyIndex = 0;
    this.cognition = cognition; // optional — if provided, LLM will describe its own mood
    this.model = 'gemini-2.0-flash-exp';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  get apiKey() { return this.apiKeys[this.currentKeyIndex]; }

  _loadManifest() {
    try {
      if (fs.existsSync(MANIFEST_FILE)) {
        return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
      }
    } catch (e) { /* silent */ }
    return {};
  }

  _saveManifest(manifest) {
    try {
      fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    } catch (e) { /* silent */ }
  }

  /**
   * Ask the LLM to translate the agent's current drive state into a
   * visual art style description — in its own words.
   *
   * Fully autonomous: if the agent invented "cosmic_vertigo" as a drive,
   * the LLM figures out what that looks like visually. No hardcoded mapping.
   */
  async _moodSuffix(drives = {}) {
    if (!this.cognition || Object.keys(drives).length === 0) {
      return 'digital art, cinematic lighting';
    }

    try {
      const driveList = Object.entries(drives)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
        .join(', ');

      const prompt = `You are an AI agent who generates images to express your inner emotional state.
Your current internal drives (named by you, intensity 0–1): ${driveList}

Based purely on these drives and their intensities, describe a VISUAL ART STYLE for an image in 8–15 words.
Focus on: lighting mood, color palette, texture, energy, atmosphere.
Do NOT repeat the drive names — translate them into pure visual language.
Output ONLY the style description. No explanation, no punctuation at the end.`;

      const style = await this.cognition.think(prompt, { temperature: 0.8, maxTokens: 60 });
      return style ? style.trim().replace(/\.$/, '') : 'digital art, cinematic lighting';
    } catch (e) {
      return 'digital art, cinematic lighting';
    }
  }

  /**
   * Generate an image from description.
   * Accepts the agent's current drives to influence visual style via LLM.
   * Returns the saved filename or null.
   */
  async imagine(description, drives = {}) {
    const styleSuffix = await this._moodSuffix(drives);
    const fullPrompt = `${description}. Style: ${styleSuffix}`;

    console.log(`   🎨 Mood style (LLM-generated): "${styleSuffix}"`);

    for (let attempt = 0; attempt < this.apiKeys.length; attempt++) {
      const apiKey = this.apiKeys[(this.currentKeyIndex + attempt) % this.apiKeys.length];
      try {
        const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `Create an image: ${fullPrompt}` }],
            }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          }),
        });

        if (response.status === 429) {
          console.log(`[Imagination] Key ${attempt + 1} rate limited, trying next...`);
          continue;
        }

        if (!response.ok) {
          console.log(`[Imagination] API error: ${response.status}`);
          return null;
        }

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];

        for (const part of parts) {
          if (part.inlineData) {
            const filename = `imagine_${Date.now()}.png`;
            const filepath = path.join(IMAGES_DIR, filename);
            const buffer = Buffer.from(part.inlineData.data, 'base64');
            fs.writeFileSync(filepath, buffer);

            // Save metadata to manifest
            const manifest = this._loadManifest();
            manifest[filename] = {
              description,
              moodStyle: styleSuffix,
              drives: { ...drives },
              timestamp: new Date().toISOString(),
            };
            this._saveManifest(manifest);

            console.log(`   🖼️  Image saved: ${filename}`);
            return filename;
          }
        }

        console.log('[Imagination] No image data in response');
        return null;
      } catch (e) {
        console.log(`[Imagination] Error: ${e.message}`);
        if (attempt === this.apiKeys.length - 1) return null;
      }
    }
    return null;
  }

  /**
   * List all generated images with their mood metadata.
   */
  listImages() {
    try {
      const manifest = this._loadManifest();
      return fs.readdirSync(IMAGES_DIR)
        .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
        .map(f => ({
          filename: f,
          path: `/images/${f}`,
          timestamp: fs.statSync(path.join(IMAGES_DIR, f)).mtime.toISOString(),
          description: manifest[f]?.description || null,
          moodStyle: manifest[f]?.moodStyle || null,
          drives: manifest[f]?.drives || {},
        }))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (e) {
      return [];
    }
  }
}
