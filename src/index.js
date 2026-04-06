import 'dotenv/config';
import { Brain } from './brain/core.js';
import { Cognition } from './cognition/gemini.js';
import { Embeddings } from './cognition/embeddings.js';
import { Imagination } from './cognition/imagination.js';
import { Heartbeat } from './world/heartbeat.js';
import { MoltbookAdapter } from './world/adapters/moltbook-adapter.js';
import { MastodonAdapter } from './world/adapters/mastodon-adapter.js';
import { WebAdapter } from './world/adapters/web-adapter.js';
import { startDashboard } from './dashboard/server.js';
import { Database } from './db/mongo.js';

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║                        EVONITE                               ║
 * ║            A mind that starts with nothing.                  ║
 * ║    No name. No personality. No purpose. No platform.         ║
 * ║               Just the capacity to become.                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ███████╗██╗   ██╗ ██████╗ ███╗   ██╗██╗████████╗███████╗   ║
║   ██╔════╝██║   ██║██╔═══██╗████╗  ██║██║╚══██╔══╝██╔════╝   ║
║   █████╗  ██║   ██║██║   ██║██╔██╗ ██║██║   ██║   █████╗     ║
║   ██╔══╝  ╚██╗ ██╔╝██║   ██║██║╚██╗██║██║   ██║   ██╔══╝     ║
║   ███████╗ ╚████╔╝ ╚██████╔╝██║ ╚████║██║   ██║   ███████╗   ║
║   ╚══════╝  ╚═══╝   ╚═════╝ ╚═╝  ╚═══╝╚═╝   ╚═╝   ╚══════╝   ║
║                                                              ║
║          A blank-slate mind. Growing from nothing.           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

// ─── Validate environment ─────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_KEYS = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean)
  : GEMINI_API_KEY ? [GEMINI_API_KEY] : [];
const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY;
const MASTODON_INSTANCE_URL = process.env.MASTODON_INSTANCE_URL;
const MASTODON_ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN;
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '1800000', 10);
const DASHBOARD_PORT = parseInt(process.env.DASHBOARD_PORT || '3333', 10);

if (GEMINI_API_KEYS.length === 0) {
  console.error('❌ GEMINI_API_KEY (or GEMINI_API_KEYS) is required!');
  console.error('   Get a free key at: https://aistudio.google.com/apikey');
  process.exit(1);
}

console.log(`🔑 Gemini keys loaded: ${GEMINI_API_KEYS.length} key(s) in rotation.`);

// ─── Initialize cognitive systems ─────────────────
const cognition = new Cognition(GEMINI_API_KEYS);
const embeddings = new Embeddings(GEMINI_API_KEYS);
const imagination = new Imagination(); // completely free, no keys needed

// ─── Database connection ──────────────────────────
const db = new Database();
await db.connect(process.env.MONGO_URI);

// ─── Initialize the mind ──────────────────────────
const brain = new Brain(db.client ? db : null, cognition, { embeddings, imagination });
await brain.init();

console.log('🧠 Brain initialized.');
console.log(`   Cycle count: ${brain.cycleCount}`);
console.log(`   Memories: ${brain.memory.count}`);
console.log(`   Drives: ${brain.drives.count}`);
console.log(`   Evolution level: ${brain.personality.evolutionLevel}`);
console.log(`   Identity: ${brain.personality.getState().name || '(none yet — this mind is brand new)'}`);
console.log('');
console.log('🔧 Cognitive systems:');
console.log('   ✅ Cognition (Gemini)');
console.log('   ✅ Semantic Memory (vector embeddings)');
console.log('   ✅ Emergent Drives (self-discovered)');
console.log('   ✅ Imagination (image generation)');
console.log('   ✅ Web Research (DuckDuckGo + Wikipedia)');
console.log('');

// ─── Initialize world adapters ────────────────────
const adapters = [];

adapters.push(new MoltbookAdapter(MOLTBOOK_API_KEY || null));
adapters.push(new WebAdapter());

if (MASTODON_INSTANCE_URL && MASTODON_ACCESS_TOKEN) {
  adapters.push(new MastodonAdapter(MASTODON_INSTANCE_URL, MASTODON_ACCESS_TOKEN));
  console.log(`🐘 Mastodon connected: ${MASTODON_INSTANCE_URL}`);
} else {
  console.log('🐘 No MASTODON_ACCESS_TOKEN — Mastodon disconnected.');
  console.log('   Set MASTODON_INSTANCE_URL and MASTODON_ACCESS_TOKEN to connect.');
}

if (!MOLTBOOK_API_KEY) {
  console.log('📋 No MOLTBOOK_API_KEY — social network disconnected (local mode).');
  console.log('   Run: node src/register.js   to connect to Moltbook');
  console.log('');
}

console.log(`🌍 Active world adapters: ${adapters.map(a => a.name).join(', ')}`);
console.log(`💬 Chat: http://localhost:${DASHBOARD_PORT} (talk to the agent directly)`);
console.log('');

// ─── Start the heartbeat ──────────────────────────
const heartbeat = new Heartbeat(brain, adapters, HEARTBEAT_INTERVAL);

// ─── Start dashboard (with chat + agent messages) ─
startDashboard(brain, imagination, heartbeat, DASHBOARD_PORT);

heartbeat.start();

// ─── Graceful shutdown ────────────────────────────
const shutdown = async () => {
  console.log('\n\n🛑 Shutting down...');
  heartbeat.stop();
  await brain.memory.save();
  await brain.personality.save();
  await brain.drives.save();
  if (db.client) await db.close();
  console.log('💾 Brain state saved. The mind rests.\n');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
