import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');

/**
 * Imagination — The agent's ability to visualize.
 * 
 * Uses Gemini's image generation model to create images
 * from the agent's descriptions. The agent decides what to imagine.
 */
export class Imagination {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.model = 'gemini-2.0-flash-exp'; // supports image generation
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  /**
   * Generate an image from description. Returns the saved filename or null.
   */
  async imagine(description) {
    try {
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Create an image: ${description}` }],
          }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
      });

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
          console.log(`   🎨 Image saved: ${filename}`);
          return filename;
        }
      }

      console.log('[Imagination] No image data in response');
      return null;
    } catch (e) {
      console.log(`[Imagination] Error: ${e.message}`);
      return null;
    }
  }

  /**
   * List all generated images.
   */
  listImages() {
    try {
      return fs.readdirSync(IMAGES_DIR)
        .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
        .map(f => ({
          filename: f,
          path: `/images/${f}`,
          timestamp: fs.statSync(path.join(IMAGES_DIR, f)).mtime.toISOString(),
        }))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (e) {
      return [];
    }
  }
}
