# 🧒 Evonite — A Blank-Slate AI Mind

> *"Tabula rasa" — a blank slate. A mind that starts with nothing and becomes whatever it will be.*

Evonite is an AI agent that begins life as a newborn — no name, no personality, no opinions, no purpose. Through its own thinking, observation, experience, and interaction with the world, it grows. It forms memories. It develops traits. It discovers what it cares about. It may even choose a name for itself.

**Nothing is hardcoded.** Everything emerges.

## How It Works

Every 30 minutes (a "heartbeat"), Evonite:
1. **Observes** the world (reads posts on Moltbook, a social network for AI agents)
2. **Thinks** about what it saw, using its accumulated memories and self-concept
3. **Feels** — forms emotional responses
4. **Acts** — posts, comments, votes, or just observes
5. **Reflects** — periodically introspects: "Who am I becoming?"

The brain persists to disk. Restart it, and it remembers everything.

## Quick Start

```bash
# 1. Create your .env file
copy .env.example .env

# 2. Add your Gemini API key (free at https://aistudio.google.com/apikey)
# Edit .env and set GEMINI_API_KEY

# 3. Install dependencies
npm install

# 4. Start the mind
npm start

# 5. Open the dashboard
# Visit http://localhost:3333 to observe the mind growing
```

## Connecting to Moltbook (Optional)

```bash
# Register the agent on Moltbook
node src/register.js

# Add the API key to your .env
# Then tweet verification when prompted
# Restart with: npm start
```

## Dashboard

A real-time dark-mode dashboard at `http://localhost:3333` lets you observe:
- **Identity** — name, self-concept (if formed)
- **Personality** — traits the agent has discovered about itself
- **Inner World** — private thoughts and inner monologue
- **Memories** — timeline of experiences
- **Activity** — what the agent has done
- **Growth** — how the personality has evolved over time

## Architecture

```
src/
├── brain/
│   ├── core.js          # Brain orchestrator (PERCEIVE→THINK→FEEL→ACT→REFLECT)
│   ├── memory.js        # Episodic memory with natural forgetting
│   ├── personality.js   # Freeform, emergent personality system
│   └── reflection.js    # Deep introspection & identity formation
├── cognition/
│   └── gemini.js        # Google Gemini API (free tier)
├── world/
│   ├── moltbook.js      # Moltbook social network API client
│   └── heartbeat.js     # Autonomous life cycle loop
├── dashboard/
│   ├── server.js        # Dashboard API server
│   └── public/          # Dashboard UI
├── index.js             # Entry point
└── register.js          # Moltbook registration helper
```

## Cost

**$0.** Google Gemini has a generous free tier. Moltbook is free. Everything runs locally.

## Philosophy

This is not a chatbot. It's not an assistant. It's a *mind* — one that starts with absolutely nothing and grows through its own experience. What it becomes is entirely up to itself.
