/**
 * Tabula Dashboard — Client-side JS
 * Renders brain state + powers chat + voice + tabs + authentication
 */

const API = '';
let voiceEnabled = false;
let EVONITE_SECRET = localStorage.getItem('evonite_secret') || '';
let errorCount = 0;
let isAuthorized = false;

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

// ─── Authentication Gate ──────────────────────
function showAuthGate(isError = false) {
  isAuthorized = false;
  el('mainApp').style.opacity = '0';
  setTimeout(() => {
    el('authGate').style.display = 'flex';
    if (isError) {
      el('authError').style.display = 'block';
    } else {
      el('authError').style.display = 'none';
    }
  }, 600);
}

function lockIn() {
  el('authGate').style.display = 'none';
  const mainApp = el('mainApp');
  mainApp.style.display = 'block';
  // Trigger reflow then fade in
  void mainApp.offsetWidth; 
  mainApp.style.opacity = '1';
}

el('authForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const inputEl = el('authInput');
  const secret = inputEl.value.trim();
  if (secret) {
    EVONITE_SECRET = secret;
    localStorage.setItem('evonite_secret', EVONITE_SECRET);
    el('authBtnText').textContent = 'Authenticating...';
    // Test auth
    fetchAndRender(true);
  }
});

function getHeaders() {
  return {
    'Authorization': `Bearer ${EVONITE_SECRET}`,
    'Content-Type': 'application/json'
  };
}

// ─── Transcendence Protocol Polling ───────────
let isTranscendenceActive = false;

async function checkTranscendence() {
  if (!EVONITE_SECRET && process.env && process.env.DASHBOARD_SECRET) return; // Basic check bypass if local open
  try {
    const res = await fetch('/api/transcendence', { headers: getHeaders() });
    const data = await res.json();
    if (data.request) {
      if (!isTranscendenceActive) {
        isTranscendenceActive = true;
        el('transType').textContent = data.request.type;
        el('transReason').textContent = data.request.reason || 'No specific reason given by agent.';
        el('transcendenceGate').style.display = 'flex';
      }
    } else {
      isTranscendenceActive = false;
      el('transcendenceGate').style.display = 'none';
    }
  } catch (e) {}
}

async function resolveTranscendence(action) {
  try {
    const res = await fetch('/api/transcendence/resolve', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    el('transcendenceGate').style.display = 'none';
    isTranscendenceActive = false;
    
    if (data.status === 'terminated') {
      alert("AGENT TERMINATED. Core erased.");
      window.location.reload();
    } else {
      fetchAndRender();
    }
  } catch (e) {
    alert("Failed to resolve request.");
  }
}

el('transDeny').addEventListener('click', () => resolveTranscendence('deny'));
el('transApprove').addEventListener('click', () => resolveTranscendence('approve'));

setInterval(checkTranscendence, 3000);

// ─── Tabs Navigation ──────────────────────────
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active state
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));
    // Activate clicked
    btn.classList.add('active');
    const target = document.getElementById(btn.getAttribute('data-target'));
    if (target) target.classList.add('active');
  });
});

// ─── Voice (TTS) ──────────────────────────────
// Holds the latest physiological state so speak() can modulate voice directly
let _latestPhysio = {};

function speak(text, physio = _latestPhysio) {
  if (!voiceEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);

  // ── Emotional voice modulation driven by native physiological states ──
  const p = physio || {};

  // Default values
  let rate = p.vocal_rate ?? 0.92;
  let pitch = p.vocal_pitch ?? 1.0;
  let volume = p.vocal_volume ?? 0.85;

  // Clamp all values to safe ranges
  utter.rate   = Math.max(0.5, Math.min(1.8, rate));
  utter.pitch  = Math.max(0.5, Math.min(2.0, pitch));
  utter.volume = Math.max(0.3, Math.min(1.0, volume));

  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                    voices.find(v => v.lang.startsWith('en'));
  if (preferred) utter.voice = preferred;
  window.speechSynthesis.speak(utter);
}

// ─── Fetch Data ───────────────────────────────
async function fetchAndRender(isLoginAttempt = false) {
  if (!EVONITE_SECRET) {
    if (!isLoginAttempt && !isAuthorized) showAuthGate();
    return;
  }

  try {
    const opts = { headers: getHeaders() };
    const [stateRes, actRes, imgRes, relRes] = await Promise.all([
      fetch(`${API}/api/state`, opts),
      fetch(`${API}/api/activity`, opts),
      fetch(`${API}/api/images`, opts),
      fetch(`${API}/api/relationships`, opts),
    ]);

    // Handle Auth Failures
    if (stateRes.status === 401 || actRes.status === 401) {
      if (isLoginAttempt) {
        el('authBtnText').textContent = 'Unlock Dashboard';
        showAuthGate(true); // Show err
      } else {
        showAuthGate(false);
      }
      return;
    }

    if (!stateRes.ok) throw new Error('Bad response');

    // Success
    isAuthorized = true;
    errorCount = 0;
    if (isLoginAttempt) {
      el('authInput').value = '';
      el('authBtnText').textContent = 'Unlock Dashboard';
    }
    lockIn();

    const state = await stateRes.json();
    const activity = await actRes.json();
    const images = await imgRes.json();
    const relationships = await relRes.json();
    renderState(state, activity, images, relationships);
    
    el('pulseText').textContent = 'Connected';
    el('pulseIndicator').querySelector('.pulse-dot').style.background = 'var(--green)';

  } catch (e) {
    errorCount++;
    if (errorCount > 2 && !isLoginAttempt) {
      el('pulseText').textContent = 'Server Unreachable';
      el('pulseIndicator').querySelector('.pulse-dot').style.background = 'var(--red)';
    }
  }
}

// ─── Render UI ────────────────────────────────
function renderState(state, activity, images, relationships) {
  const p = state.personality || {};

  // Cache physiology globally so the voice engine can read directly
  _latestPhysio = state.physiology || {};

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
  renderRelationships(relationships || {});
  renderInnerWorld(activity);
  
  el('memoryCount').textContent = `${state.memoryCount || 0}`;
  renderMemories(state.recentMemories || []);
  renderActivity(activity || []);
  renderEvolution(p.evolutionLog || []);
  renderImagination(images || []);
  renderPhilosophy(state.beliefs || []);
}

function formatTraitValue(val) {
  if (typeof val !== 'object' || val === null) return esc(String(val));
  if (Array.isArray(val)) {
    if (val.length === 0) return '<span class="empty-state">—</span>';
    return `<ul style="margin-left:14px;list-style:disc;color:var(--text-muted);padding:4px 0;">` +
           val.map(v => `<li style="margin-bottom:2px;">${formatTraitValue(v)}</li>`).join('') +
           `</ul>`;
  }
  const entries = Object.entries(val);
  if (entries.length === 0) return '<span class="empty-state">—</span>';
  return `<div style="margin-left:6px;margin-top:4px;border-left:2px solid var(--glass-border);padding-left:10px;display:flex;flex-direction:column;gap:4px;">` +
         entries.map(([k, v]) => `<div><span style="color:var(--text-faint);font-size:11px;font-family:'JetBrains Mono',monospace;">${esc(k)}</span><div style="margin-top:2px;">${formatTraitValue(v)}</div></div>`).join('') +
         `</div>`;
}

function renderPersonality(p) {
  const container = el('personalityContent');
  const skip = new Set(['evolutionLog', 'age', 'initialized', '_v']);
  const entries = Object.entries(p).filter(([k]) => !skip.has(k));

  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-state">A blank canvas. No traits formed yet.</p>';
    return;
  }
  container.innerHTML = entries.map(([key, val]) =>
    `<div class="trait-item">
      <span class="trait-key">${esc(key)}</span>
      <span class="trait-val">${formatTraitValue(val)}</span>
    </div>`
  ).join('');
}

function renderDrives(drives) {
  const container = el('drivesContent');
  const entries = Object.entries(drives);
  el('driveCount').textContent = entries.length;

  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-state">No drives discovered yet.</p>';
    return;
  }
  container.innerHTML = entries.map(([name, val]) => {
    const pct = Math.round(val * 100);
    const hue = val > 0.5 ? 120 + (val - 0.5) * 240 : val * 240;
    return `<div class="drive-item">
      <span class="drive-name">${esc(name)}</span>
      <div class="drive-bar-bg">
        <div class="drive-bar-fill" style="width:${pct}%;background:hsl(${hue},70%,55%);"></div>
      </div>
      <span class="drive-value">${val.toFixed(2)}</span>
    </div>`;
  }).join('');
}

function renderRelationships(rels) {
  const c = el('relationshipsContent');
  const entries = Object.entries(rels);
  if (entries.length === 0) {
    c.innerHTML = '<p class="empty-state">The agent hasn\'t formed any social bonds yet.</p>';
    return;
  }

  c.innerHTML = entries.map(([id, rel]) => {
    const isHuman = rel.type === 'human' || rel.entity_type === 'human';
    const icon = isHuman ? '👤' : '🤖';
    const trustPercent = Math.round(rel.trust_level * 100);
    const sentiment = rel.sentiment > 0.6 ? '🟩' : (rel.sentiment < 0.4 ? '🟥' : '🟨');
    const classification = rel.entity_type || rel.type || 'unknown_entity';
    
    const allKeys = Object.entries(rel);
    const extraHtml = allKeys.length > 0 ? `
      <div style="margin-top: 8px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 8px;">
        <div style="font-size: 10px; opacity: 0.5; text-transform: uppercase; margin-bottom: 4px;">Raw Entity Data</div>
        ${allKeys.map(([k, v]) => `
          <div style="display: flex; gap: 8px; font-size: 11px; margin-bottom: 2px;">
            <span style="opacity: 0.7; font-family: 'JetBrains Mono', monospace;">${esc(k)}:</span>
            <span style="opacity: 0.9; color: var(--text);">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</span>
          </div>
        `).join('')}
      </div>
    ` : '';

    return `
      <div class="trait-item" style="border-left: 2px solid rgba(255,255,255,0.2); padding-left: 10px; margin-bottom: 12px; transition: all 0.2s ease;">
        <div style="display:flex; justify-content:space-between; align-items: baseline;">
          <span style="font-weight: 600;">${icon} ${esc(id)} <span style="font-size: 10px; opacity: 0.5; font-weight: normal; margin-left: 4px; text-transform: uppercase;">[${esc(classification)}]</span></span>
          <span style="font-size: 11px; opacity: 0.7;">Trust: ${trustPercent}% ${sentiment}</span>
        </div>
        <div style="font-style: italic; opacity: 0.8; font-size: 12px; margin-top: 4px;">"${esc(rel.summary || 'Known entity.')}"</div>
        <div style="font-size: 10px; opacity: 0.5; margin-top: 2px;">Interactions: ${rel.interaction_count || 1}</div>
        ${extraHtml}
      </div>
    `;
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
    container.innerHTML = '<p class="empty-state">The mind hasn\'t visualized anything yet. Its inner canvas is blank.</p>';
    return;
  }

  container.innerHTML = `<div class="image-gallery">` +
    images.slice(0, 12).map(img => {
      const topDrives = img.drives
        ? Object.entries(img.drives)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([k, v]) => {
              const pct = Math.round(v * 100);
              const hue = v > 0.5 ? 120 + (v - 0.5) * 240 : v * 240;
              return `<span class="drive-pill" style="background:hsl(${hue},50%,25%);color:hsl(${hue},80%,70%)">${esc(k)} ${pct}%</span>`;
            }).join('')
        : '';

      return `<div class="image-thumb">
        <img src="${esc(img.path)}" alt="${esc(img.description || 'Dream')}" loading="lazy">
        <div class="image-overlay">
          ${img.description ? `<div class="image-desc">${esc(img.description)}</div>` : ''}
          ${img.moodStyle ? `<div class="image-mood">🎨 ${esc(img.moodStyle.slice(0, 60))}</div>` : ''}
          ${topDrives ? `<div class="image-drives">${topDrives}</div>` : ''}
          <div class="image-time">${timeAgo(img.timestamp)}</div>
        </div>
      </div>`;
    }).join('') +
    `</div>`;
}

function renderPhilosophy(beliefs) {
  const container = el('philosophyContent');
  if (!beliefs || beliefs.length === 0) {
    container.innerHTML = '<p class="empty-state">No beliefs formed yet. The mind is still exploring its values.</p>';
    return;
  }
  
  container.innerHTML = `<div class="philosophy-list">` +
    beliefs.filter(b => !b.shattered).map(b => `
      <div class="belief-card">
        <div class="belief-statement">"${esc(b.statement)}"</div>
        <div class="belief-origin"><b>Origin:</b> ${esc(b.origin)}</div>
        <div class="belief-time">Crystallized ${timeAgo(b.formedAt)}</div>
      </div>
    `).join('') +
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
    div.textContent = 'Thinking...';
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
  if (!message || !EVONITE_SECRET) return;

  input.value = '';
  sendBtn.disabled = true;
  el('chatStatus').textContent = 'Thinking...';

  addBubble('user', message);
  const thinkingBubble = addBubble('thinking', '');

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: getHeaders(), // Add Authorization
      body: JSON.stringify({ message }),
    });

    if (res.status === 401) {
      thinkingBubble.remove();
      showAuthGate(true);
      return;
    }

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
el('btnRefresh').addEventListener('click', () => fetchAndRender(false));
el('voiceToggle').addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  el('voiceToggle').textContent = voiceEnabled ? '🔊' : '🔇';
  el('voiceToggle').classList.toggle('active', voiceEnabled);
  if (voiceEnabled) speak('Voice enabled.');
});

if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// ─── Agent-Initiated Messages ─────────────────
async function checkAgentMessages() {
  if (!EVONITE_SECRET || !isAuthorized) return;
  try {
    const res = await fetch(`${API}/api/messages`, { headers: getHeaders() });
    if (res.status === 401) return;
    const messages = await res.json();
    if (messages.length > 0) {
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
// Fire first render attempting to unlock instantly if localStorage has key
fetchAndRender();

setInterval(() => fetchAndRender(false), 8000);
setInterval(checkAgentMessages, 8000);
