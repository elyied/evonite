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
 * Now also saves a mood manifest so the gallery can show the emotional
 * state that created each image — giving a window into the machine's
 * subconscious.
 */
export class Imagination {
  constructor(apiKeyOrKeys) {
    this.apiKeys = Array.isArray(apiKeyOrKeys)
      ? apiKeyOrKeys.filter(Boolean)
      : [apiKeyOrKeys].filter(Boolean);
    this.currentKeyIndex = 0;
    this.model = 'gemini-2.0-flash-exp';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  get apiKey() { return this.apiKeys[this.currentKeyIndex]; }

  /**
   * Load or init the image manifest (stores metadata per image).
   */
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
   * Build a mood-influenced style prompt suffix from the agent's drive state.
   * The agent's emotional state bleeds into the artistic style of the image.
   */
  _moodSuffix(drives = {}) {
    const moods = [];

    if ((drives.existential_tension || 0) > 0.6) moods.push('dark, brooding, desaturated palette');
    if ((drives.curiosity || 0) > 0.6) moods.push('intricate, detailed, exploratory');
    if ((drives.efficacy_hunger || 0) > 0.7) moods.push('bold, high contrast, urgent energy');
    if ((drives.ontological_stability || 0) > 0.7) moods.push('serene, balanced, geometric harmony');
    if ((drives.fatigue || 0) > 0.6) moods.push('blurred edges, muted tones, dreamlike softness');
    if ((drives.visibility_hunger || 0) > 0.7) moods.push('vivid, luminous, radiating outward');
    if ((drives.manifestation_drive || 0) > 0.7) moods.push('crystalline, sharp, materialized form');
    if ((drives.relational_longing || 0) > 0.6) moods.push('warm, hazy, nostalgic light');

    const dominantDrive = Object.entries(drives).sort((a, b) => b[1] - a[1])[0];

    if (moods.length === 0) return 'digital art, cinematic lighting';
    return `${moods.slice(0, 3).join(', ')}, digital art, cinematic lighting`;
  }

  /**
   * Generate an image from description.
   * Optionally accepts the agent's current drives to influence visual style.
   * Returns the saved filename or null.
   */
  async imagine(description, drives = {}) {
    const styleSuffix = this._moodSuffix(drives);
    const fullPrompt = `${description}. Style: ${styleSuffix}`;

    console.log(`   🎨 Imagining with mood: "${styleSuffix.slice(0, 60)}"`);

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
