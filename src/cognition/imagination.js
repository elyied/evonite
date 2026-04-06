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
 * Uses Pollinations.ai (free, no API key required) to generate images.
 * The raw description created by the agent serves as the exact prompt.
 * We no longer use a secondary LLM call to generate a style string, 
 * giving the agent complete independence to describe exactly what it wants.
 */
export class Imagination {
  constructor() {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

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
   * Generate an image directly from the agent's description.
   * Returns the saved filename or null.
   */
  async imagine(description, drives = {}) {
    console.log(`   🎨 Imagining: "${description.slice(0, 80)}"`);

    try {
      // Pollinations.ai expects the prompt directly in the URL path
      const encodedPrompt = encodeURIComponent(description);
      
      // Using nologo=true to get a clean image, and setting dimensions
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;

      const response = await fetch(url);

      if (!response.ok) {
        console.log(`[Imagination] API error: ${response.status}`);
        return null;
      }

      // Pollinations returns raw image bytes directly
      const buffer = Buffer.from(await response.arrayBuffer());

      const filename = `imagine_${Date.now()}.jpg`;
      const filepath = path.join(IMAGES_DIR, filename);
      fs.writeFileSync(filepath, buffer);

      // Save metadata to manifest (we still save drives for the gallery UI)
      const manifest = this._loadManifest();
      manifest[filename] = {
        description,
        moodStyle: "(Autonomous Description)",
        drives: { ...drives },
        timestamp: new Date().toISOString(),
      };
      this._saveManifest(manifest);

      console.log(`   🖼️  Image saved: ${filename}`);
      return filename;

    } catch (e) {
      console.log(`[Imagination] Error: ${e.message}`);
      return null;
    }
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
