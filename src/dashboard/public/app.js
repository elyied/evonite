/**
 * Tabula Dashboard — Client-side JS
 * Renders brain state + powers chat + voice + drives + imagination
 */

const API = '';
let voiceEnabled = false;

// ─── Utilities ────────────────────────────────
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function el(id) { return document.getElementById(id); }
function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Voice (TTS) ──────────────────────────────
function speak(text) {
  if (!voiceEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  utter.pitch = 1.0;
  // Try to pick a good voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                    voices.find(v => v.lang.startsWith('en'));
  if (preferred) utter.voice = preferred;
  window.speechSynthesis.speak(utter);
}

// ─── Brain State Rendering ────────────────────
async function fetchAndRender() {
  try {
    const [stateRes, actRes, imgRes] = await Promise.all([
      fetch(`${API}/api/state`),
      fetch(`${API}/api/activity`),
      fetch(`${API}/api/images`),
    ]);
    const state = await stateRes.json();
    const activity = await actRes.json();
    const images = await imgRes.json();
    renderState(state, activity, images);
    el('pulseText').textContent = 'Connected';
    el('pulseIndicator').querySelector('.pulse-dot').style.background = 'var(--green)';
  } catch (e) {
    el('pulseText').textContent = 'Disconnected';
    el('pulseIndicator').querySelector('.pulse-dot').style.background = 'var(--red)';
  }
}

function renderState(state, activity, images) {
  const p = state.personality || {};

  // Identity banner
  const name = p.name || p.chosenName || p.identity?.name;
  el('identityName').textContent = name || 'Unknown Mind';
  el('identityAvatar').textContent = name ? name[0].toUpperCase() : '?';
  el('identityConcept').textContent =
    p.self_concept || p.selfConcept || p.identity?.description ||
    p.description || 'This mind hasn\'t formed a self-concept yet...';
  el('statCycles').textContent = state.cycleCount || 0;
  el('statMemories').textContent = state.memoryCount || 0;
  el('statDrives').textContent = state.driveCount || 0;
  el('statEvolutions').textContent = state.evolutionLevel || 0;

  el('personalityAge').textContent = `Evo: ${state.evolutionLevel || 0}`;
  renderPersonality(p);
  renderDrives(state.drives || {});
  renderInnerWorld(activity);
  el('memoryCount').textContent = `${state.memoryCount || 0} memories`;
  renderMemories(state.recentMemories || []);
  renderActivity(activity || []);
  renderEvolution(p.evolutionLog || []);
  renderImagination(images || []);
}

// ─── Trait Value Formatter (recursive) ────────
function formatTraitValue(val) {
  if (typeof val !== 'object' || val === null) return esc(String(val));
  if (Array.isArray(val)) {
    if (val.length === 0) return '<span class="empty-state">—</span>';
    return `<ul style="margin-left:14px;list-style:disc;color:var(--text2);padding:4px 0;">` +
           val.map(v => `<li style="margin-bottom:2px;">${formatTraitValue(v)}</li>`).join('') +
           `</ul>`;
  }
  const entries = Object.entries(val);
  if (entries.length === 0) return '<span class="empty-state">—</span>';
  return `<div style="margin-left:6px;margin-top:4px;border-left:2px solid var(--border);padding-left:10px;display:flex;flex-direction:column;gap:4px;">` +
         entries.map(([k, v]) => `<div><span style="color:var(--text3);font-size:11px;font-family:'JetBrains Mono',monospace;">${esc(k)}</span><div style="margin-top:2px;">${formatTraitValue(v)}</div></div>`).join('') +
         `</div>`;
}

// ─── Panel Renderers ──────────────────────────
function renderPersonality(p) {
  const container = el('personalityContent');
  const skip = new Set(['evolutionLog', 'age', 'initialized', '_v']);
  const entries = Object.entries(p).filter(([k]) => !skip.has(k));

  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-state">A blank canvas. No traits formed yet.</p>';
    return;
  }

  container.innerHTML = entries.map(([key, val]) =>
    `<div class="trait-item" style="flex-direction:column;gap:4px;">
      <span class="trait-key" style="font-size:12px;color:var(--accent2);">${esc(key)}</span>
      <span class="trait-val" style="width:100%;">${formatTraitValue(val)}</span>
    </div>`
  ).join('');
}

function renderDrives(drives) {
  const container = el('drivesContent');
  const entries = Object.entries(drives);
  el('driveCount').textContent = `${entries.length} drives`;

  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-state">No drives discovered yet. The mind hasn\'t felt anything strong enough to name.</p>';
    return;
  }

  container.innerHTML = entries.map(([name, val]) => {
    const pct = Math.round(val * 100);
    const hue = val > 0.5 ? 120 + (val - 0.5) * 240 : val * 240; // color gradient
    return `<div class="drive-item">
      <span class="drive-name">${esc(name)}</span>
      <div class="drive-bar-bg">
        <div class="drive-bar-fill" style="width:${pct}%;background:hsl(${hue},70%,55%);"></div>
      </div>
      <span class="drive-value">${val.toFixed(2)}</span>
    </div>`;
  }).join('');
}

function renderInnerWorld(activity) {
  const container = el('innerContent');
  const thinkEvents = (activity || [])
    .filter(a => a.type === 'feel' || a.type === 'reflect_end' || a.type === 'think')
    .slice(-3);

  if (thinkEvents.length === 0) {
    container.innerHTML = '<p class="empty-state">No inner monologue yet. The mind is silent.</p>';
    return;
  }
  container.innerHTML = thinkEvents.reverse().map(e => `<div class="inner-thought">${esc(e.detail)}</div>`).join('');
}

function renderMemories(memories) {
  const container = el('memoriesContent');
  if (!memories || memories.length === 0) {
    container.innerHTML = '<p class="empty-state">No memories formed yet.</p>';
    return;
  }
  container.innerHTML = memories.slice(0, 15).map(m => {
    const tags = (m.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    return `<div class="memory-item">${esc(m.content)}<div style="margin-top:5px">${tags}</div></div>`;
  }).join('');
}

function renderActivity(activity) {
  const container = el('activityContent');
  if (!activity || activity.length === 0) {
    container.innerHTML = '<p class="empty-state">Waiting for first heartbeat...</p>';
    return;
  }
  container.innerHTML = activity.slice().reverse().slice(0, 20).map(a =>
    `<div class="log-item">
      <span class="log-type">${esc(a.type)}</span>
      <span class="log-detail">${esc(a.detail || '')}</span>
      <span class="log-time">${timeAgo(a.timestamp)}</span>
    </div>`
  ).join('');
}

function renderEvolution(log) {
  const container = el('evolutionContent');
  if (!log || log.length === 0) {
    container.innerHTML = '<p class="empty-state">No growth events yet. Life is just beginning.</p>';
    return;
  }
  container.innerHTML = log.slice().reverse().slice(0, 10).map(e =>
    `<div class="evolution-item">
      ${esc(e.summary || JSON.stringify(e.changes || e))}
      <div class="evo-time">${timeAgo(e.timestamp)}</div>
    </div>`
  ).join('');
}

function renderImagination(images) {
  const container = el('imaginationContent');
  if (!images || images.length === 0) {
    container.innerHTML = '<p class="empty-state">The mind hasn\'t visualized anything yet.</p>';
    return;
  }
  container.innerHTML = `<div class="image-gallery">` +
    images.slice(0, 8).map(img =>
      `<div class="image-thumb">
        <img src="${img.path}" alt="Imagined" loading="lazy">
        <div class="image-time">${timeAgo(img.timestamp)}</div>
      </div>`
    ).join('') +
    `</div>`;
}

// ─── Chat Logic ───────────────────────────────
function addBubble(role, text, feeling) {
  const container = el('chatMessages');
  const intro = container.querySelector('.chat-intro');
  if (intro) intro.remove();

  const div = document.createElement('div');
  div.className = `chat-bubble ${role}`;

  if (role === 'thinking') {
    div.textContent = 'Thinking';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  div.innerHTML = esc(text).replace(/\n/g, '<br>');
  if (feeling) {
    const f = document.createElement('div');
    f.className = 'bubble-feeling';
    f.textContent = `feeling: ${feeling}`;
    div.appendChild(f);
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

async function sendChat() {
  const input = el('chatInput');
  const sendBtn = el('chatSend');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  sendBtn.disabled = true;
  el('chatStatus').textContent = 'Thinking...';

  addBubble('user', message);
  const thinkingBubble = addBubble('thinking', '');

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    const data = await res.json();
    thinkingBubble.remove();

    if (res.ok) {
      addBubble('agent', data.reply || '...', data.feeling);
      speak(data.reply || '');
      fetchAndRender();
    } else {
      addBubble('agent', data.error || 'Something went wrong.');
    }
  } catch (e) {
    thinkingBubble.remove();
    addBubble('agent', 'Connection error. Is the agent running?');
  } finally {
    sendBtn.disabled = false;
    el('chatStatus').textContent = 'Ready';
    input.focus();
  }
}

// ─── Event Listeners ──────────────────────────
el('chatSend').addEventListener('click', sendChat);
el('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
el('btnRefresh').addEventListener('click', fetchAndRender);
el('voiceToggle').addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  el('voiceToggle').textContent = voiceEnabled ? '🔊' : '🔇';
  el('voiceToggle').classList.toggle('active', voiceEnabled);
  if (voiceEnabled) speak('Voice enabled.');
});

// Load voices (some browsers need this)
if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// ─── Agent-Initiated Messages ─────────────────
async function checkAgentMessages() {
  try {
    const res = await fetch(`${API}/api/messages`);
    const messages = await res.json();
    if (messages.length > 0) {
      // Remove the intro if it's still there
      const intro = el('chatMessages').querySelector('.chat-intro');
      if (intro) intro.remove();

      for (const msg of messages) {
        const div = document.createElement('div');
        div.className = 'chat-bubble agent initiative';
        div.innerHTML = `<div class="initiative-label">💡 Unprompted thought</div>${esc(msg.text).replace(/\n/g, '<br>')}`;
        el('chatMessages').appendChild(div);
        el('chatMessages').scrollTop = el('chatMessages').scrollHeight;
        speak(msg.text);
      }
    }
  } catch (e) { /* silent */ }
}

// ─── Init ─────────────────────────────────────
fetchAndRender();
setInterval(fetchAndRender, 8000);
setInterval(checkAgentMessages, 8000);
