import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Dashboard Server — brain observer + chat + image gallery + agent-initiated messages.
 */
export function startDashboard(brain, imagination, heartbeat, port = 3333) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Serve generated images
  app.use('/images', express.static(path.join(DATA_DIR, 'images')));

  // API: Health check (for keep-alive pingers like cron-job.org)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'awake', cycle: brain.cycleCount });
  });

  // API: Full brain state
  app.get('/api/state', (req, res) => {
    res.json(brain.getState());
  });

  // API: All memories
  app.get('/api/memories', (req, res) => {
    res.json(brain.memory.getAll());
  });

  // API: Personality details
  app.get('/api/personality', (req, res) => {
    res.json(brain.personality.getState());
  });

  // API: Activity log
  app.get('/api/activity', (req, res) => {
    res.json(brain.activityLog.slice(-100));
  });

  // API: Drives
  app.get('/api/drives', (req, res) => {
    res.json(brain.drives.getState());
  });

  // API: Generated images
  app.get('/api/images', (req, res) => {
    res.json(imagination ? imagination.listImages() : []);
  });

  // API: Agent-initiated messages (consume = clear queue)
  app.get('/api/messages', (req, res) => {
    const messages = heartbeat ? heartbeat.consumeMessages() : [];
    res.json(messages);
  });

  // ─── Conversation History (in-memory) ────────
  let conversationHistory = [];

  // API: Chat (with full conversation context)
  app.post('/api/chat', async (req, res) => {
    const { message, name } = req.body;
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'message is required' });
    }
    try {
      conversationHistory.push({ role: 'user', text: message.trim() });
      const result = await brain.chat(conversationHistory, name || 'Human');
      conversationHistory.push({ role: 'agent', text: result.reply });
      res.json(result);
    } catch (e) {
      console.error('[Chat] Error:', e.message);
      conversationHistory.pop();
      res.status(500).json({ error: 'The mind is busy or unavailable.' });
    }
  });

  // API: Clear conversation (start fresh)
  app.post('/api/chat/clear', (req, res) => {
    conversationHistory = [];
    res.json({ cleared: true });
  });

  app.listen(port, () => {
    console.log(`\n🖥️  Dashboard: http://localhost:${port}\n`);
  });
}
