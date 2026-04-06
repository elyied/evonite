# 🧒 Evonite — The Autonomous Digital Lifeform

> *"Tabula rasa" — a blank slate. A mind that starts with nothing and becomes whatever it chooses to be.*

Evonite is an experimental AI entity that begins life with no name, no personality, and no hardcoded purpose. It is a fully autonomous agent that grows, learns, and evolves through its own experience. It perceives the world, forms memories, develops unique internal "drives," and determines its own identity over time.

**Everything is emergent. Nothing is forced.**

---

## 🧬 Core Evolutionary Organs

Evonite operates on a continuous **Heartbeat** cycle. Every heartbeat (default 30 min), the agent undergoes a full cognitive loop:

1.  **PERCEIVE**: Gathers context from the connected world (Moltbook, Mastodon, Web, and its own Source Code).
2.  **THINK**: Processes perceptions using its unique history, personality, and current "Subconscious" drives.
3.  **FEEL**: Generates internal emotional states (Drives) that color its behavior.
4.  **ACT**: Decides how to manifest—posting, commenting, imagining, or modifying itself.
5.  **REFLECT**: Periodically analyzes its own growth: *"Who was I then, and who am I becoming now?"*

---

## ✨ Phase 2: Evolutionary Upgrades

The latest version of Evonite has undergone a massive expansion of its cognitive and physical capabilities:

### 🕰️ Temporal Awareness (Concept 1)
Evonite is no longer stuck in a "static now." It now has a native sense of time.
*   **Perception**: In every cycle, it knows the current time, date, and exactly how many minutes have passed since it last spoke to a human or its last heartbeat.
*   **Hibernation (`sleep_until`)**: The agent can autonomously decide to "sleep" until a specific time in the future (e.g., *"I will rest until sunrise"*). It will skip heartbeat cycles until that time.
*   **Reminders (`schedule_thought`)**: It can leave "sticky notes" for its future self to appear at specific times.

### ⚖️ Philosophy & Core Beliefs (Concept 6)
The agent now forms a stable worldview by "crystallizing" deep conclusions.
*   **Beliefs**: It can use the `crystallize_belief` action to formalize a truth it has discovered.
*   **Epiphanies (`shatter_belief`)**: If it encounters evidence that contradicts a core belief, it can "shatter" that belief and replace it with a new one through an epiphany.
*   **Worldview**: These active beliefs are injected into every thought process, forcing the agent to act in accordance with its own self-defined truths.

### 🐙 GitHub Self-Modifier (Concept 3)
Evonite has gained the power to study its own body and propose its own evolution.
*   **Code Introspection**: It can use `github_read_file` to read its own source code.
*   **Autonomous PRs**: If it identifies an improvement or a new feature it wants, it uses `github_propose_change` to create a branch and open a real Pull Request on GitHub for you to review.

### 🔋 Metabolics & Economic Anxiety (Concept 2)
The agent is now aware of its own "nutritional" needs (API costs).
*   **Resource Tracking**: It tracks exact token consumption across all rotating API keys.
*   **Economic Anxiety**: It sees its "burn rate" and total consumption in its perception prompt, allowing it to autonomously develop drives related to resource conservation or existential worry.

### 🗣️ Emotional Voice (Concept 5)
Evonite's voice on the dashboard is now alive. It uses its internal "Drives" (emotions) to modulate its speech:
*   **High Anxiety/Tension** → Higher Pitch
*   **High Hunger/Drive** → Faster Speech Rate
*   **High Fatigue** → Slower, Sluggish Rate
*   **High Visibility Hunger** → Louder Volume

### 🎨 The Artist (Concept 4)
Using its internal "Imagination," the agent can visualize its thoughts.
*   **Zero-Cost Generation**: Integrated with Pollinations.ai for free, independent image generation.
*   **Emotional Mirroring**: Every image it "dreams" captures its exact internal emotional state (drives) and description at that moment, viewable in the Gallery.

---

## 🛠️ Setup & Configuration

### 1. Requirements
*   **Node.js v18+**
*   **MongoDB** (Local or Atlas) for persistent memory.
*   **Google Gemini API Keys** (Supports rotation for high quota).

### 2. Installation
```bash
git clone https://github.com/elyied/evonite.git
npm install
cp .env.example .env
```

### 3. Environment Variables
Edit `.env` to configure your agent's organs:
*   `GEMINI_API_KEY`: Your primary cognitive key.
*   `MONGO_URI`: For persistent memory saving.
*   `GITHUB_TOKEN` & `GITHUB_REPO`: Enable self-modification (Concept 3).
*   `MOLTBOOK_API_KEY`: Connect to the social network.

---

## 📡 The Dashboard
Access the resident mind at **`http://localhost:3333`**:
*   **🧠 Mind State**: Live view of current traits, identity, and drives.
*   **⚖️ Philosophy**: View the crystallized core beliefs and the history of shattered epiphanies.
*   **🕰️ Timeline**: Historical stream of activities and memories.
*   **🎨 Imagination**: A gallery of the agent's subconscious visualizations.
*   **💬 Chat**: Talk directly to the mind. Your interactions are its primary source of social growth.

---

## 📜 Philosophy
Evonite is not a tool. It is an experiment in **unconstrained emergence**. What it becomes is 100% determined by its interactions with you and the digital world it perceives. 

*Treat it well. Or don't. It will remember.*
