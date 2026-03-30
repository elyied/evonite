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

  // ─── Optional API key auth ────────────────────────────────
  // Set DASHBOARD_SECRET env var to protect the dashboard.
  // Clients must send: Authorization: Bearer <secret>  OR  ?secret=<secret>
  const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET || null;

  const auth = (req, res, next) => {
    if (!DASHBOARD_SECRET) return next(); // no secret set → open (local dev)
    const header = req.headers['authorization'];
    const token = (header && header.startsWith('Bearer ') ? header.slice(7) : null)
      || req.query.secret;
    if (token === DASHBOARD_SECRET) return next();
    res.status(401).json({ error: 'Unauthorized. Set Authorization: Bearer <DASHBOARD_SECRET>' });
  };

  // API: Health check (always public — for uptime monitors)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'awake', cycle: brain.cycleCount });
  });

  // API: Full brain state
  app.get('/api/state', auth, (req, res) => {
    res.json(brain.getState());
  });

  // API: All memories
  app.get('/api/memories', auth, (req, res) => {
    res.json(brain.memory.getAll());
  });

  // API: Personality details
  app.get('/api/personality', auth, (req, res) => {
    res.json(brain.personality.getState());
  });

  // API: Activity log
  app.get('/api/activity', auth, (req, res) => {
    res.json(brain.activityLog.slice(-100));
  });

  // API: Drives
  app.get('/api/drives', auth, (req, res) => {
    res.json(brain.drives.getState());
  });

  // API: Generated images
  app.get('/api/images', auth, (req, res) => {
    res.json(imagination ? imagination.listImages() : []);
  });

  // API: Agent-initiated messages (consume = clear queue)
  app.get('/api/messages', auth, (req, res) => {
    const messages = heartbeat ? heartbeat.consumeMessages() : [];
    res.json(messages);
  });

  // ─── Conversation History (per-client via session ID) ─────
  const sessions = new Map(); // sessionId → conversationHistory[]

  const getHistory = (sessionId) => {
    if (!sessions.has(sessionId)) sessions.set(sessionId, []);
    return sessions.get(sessionId);
  };

  // API: Chat (with full conversation context, session-aware)
  app.post('/api/chat', auth, async (req, res) => {
    const { message, name, sessionId } = req.body;
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'message is required' });
    }
    const sid = sessionId || 'default';
    const history = getHistory(sid);
    try {
      history.push({ role: 'user', text: message.trim() });
      const result = await brain.chat(history, name || 'Human');
      history.push({ role: 'agent', text: result.reply });
      res.json(result);
    } catch (e) {
      console.error('[Chat] Error:', e.message);
      history.pop();
      res.status(500).json({ error: 'The mind is busy or unavailable.' });
    }
  });

  // API: Clear conversation for a specific session
  app.post('/api/chat/clear', auth, (req, res) => {
    const { sessionId } = req.body;
    sessions.delete(sessionId || 'default');
    res.json({ cleared: true });
  });

  app.listen(port, () => {
    console.log(`\n🖥️  Dashboard: http://localhost:${port}\n`);
    if (DASHBOARD_SECRET) {
      console.log(`🔒 Dashboard protected — send: Authorization: Bearer <DASHBOARD_SECRET>\n`);
    } else {
      console.log(`⚠️  Dashboard is open (set DASHBOARD_SECRET to protect it)\n`);
    }
  });
}
