/**
 * Tabula Dashboard — Client-side JS
 * Renders brain state + powers chat + voice + discord UI routing + authentication
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
  if (!EVONITE_SECRET && window.location.hostname !== 'localhost') return; 
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

// ─── Discord UI Routing ───────────────────────
const railItems = document.querySelectorAll('.group-item');
const sidebarGroups = document.querySelectorAll('.sidebar-group');
const channels = document.querySelectorAll('.channel');
const channelViews = document.querySelectorAll('.channel-view');

// 1. Server Rail clicking -> switches the Context Sidebar
railItems.forEach(rail => {
  rail.addEventListener('click', () => {
    // Select active rail
    railItems.forEach(r => r.classList.remove('active'));
    rail.classList.add('active');
    
    // Show correct sidebar
    const targetGroup = rail.getAttribute('data-rail');
    sidebarGroups.forEach(g => {
      g.style.display = (g.id === targetGroup) ? 'block' : 'none';
    });

    // Automatically click the first channel in that sidebar
    const firstChan = document.querySelector(`#${targetGroup} .channel`);
    if (firstChan) firstChan.click();
  });
});

// 2. Channel clicking -> switches the Main Stage view
channels.forEach(chan => {
  chan.addEventListener('click', () => {
    // Highlight channel
    channels.forEach(c => c.classList.remove('active'));
    chan.classList.add('active');
    
    // Update Header 
    el('currentChannelName').textContent = chan.textContent.replace('#', '').trim();

    // Show correct view pane
    const targetView = chan.getAttribute('data-chan');
    channelViews.forEach(v => {
      v.classList.remove('active');
      if (v.id === targetView) v.classList.add('active');
    });
    
    // If we clicked into chat, scroll to bottom
    if (targetView === 'chan-chat') {
      const msgBox = el('chatMessages');
      msgBox.scrollTop = msgBox.scrollHeight;
    }
  });
});

// ─── Voice (TTS) ──────────────────────────────
let _latestDrives = {};

function speak(text, drives = _latestDrives) {
  if (!voiceEnabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);

  const d = drives || {};
  let rate = 0.92;
  let pitch = 1.0;
  let volume = 0.85;

  if (d.efficacy_hunger > 0.7) rate += (d.efficacy_hunger - 0.7) * 0.8;
  if (d.fatigue > 0.5) rate -= (d.fatigue - 0.5) * 0.5;
  if (d.existential_tension > 0.5) pitch += (d.existential_tension - 0.5) * 0.6;
  if (d.ontological_stability > 0.7) { pitch -= 0.1; rate -= 0.05; }
  if (d.existential_dread > 0.5) pitch -= (d.existential_dread - 0.5) * 0.5;

  utter.rate = rate;
  utter.pitch = pitch;
  utter.volume = volume;
  window.speechSynthesis.speak(utter);
}

el('voiceToggle').addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  el('voiceToggle').textContent = voiceEnabled ? '🔊' : '🔇';
  el('voiceToggle').style.color = voiceEnabled ? '#5865F2' : 'var(--text-muted)';
  if (voiceEnabled) speak('Voice active. I am connected.');
  else window.speechSynthesis.cancel();
});


// ─── Data Fetching & Rendering ────────────────
async function fetchAndRender(isInitialAuth = false) {
  try {
    const res = await fetch('/api/state', { headers: getHeaders() });
    
    if (res.status === 401) {
      showAuthGate(true);
      return;
    }
    if (!res.ok) throw new Error('State fetch failed');

    if (isInitialAuth || !isAuthorized) {
      lockIn();
      isAuthorized = true;
      el('authBtnText').textContent = 'Unlock Mind';
    }

    const state = await res.json();
    errorCount = 0;
    
    renderState(state);
    
    // Separate fetches for heavier memory views
    fetchMemories();
    fetchImagination();

  } catch (err) {
    console.error('State API error:', err);
    errorCount++;
    if (errorCount > 3 && isAuthorized) {
       el('pulseIndicator').classList.add('paused');
       el('pulseText').textContent = 'Agent offline/restarting...';
       el('statsLvl').textContent = 'ERR';
    }
  }
}

function renderState(state) {
  // 1. Top Navbar / Stats
  const identity = state.personality;
  const name = identity?.core_identity?.name || 'Unborn Mind';
  el('agentNameNav').textContent = name;
  
  if (state.isAsleep) {
    el('pulseIndicator').classList.add('paused');
    el('pulseText').textContent = `Hibernating until ${new Date(state.sleepUntil).toLocaleTimeString()}`;
  } else {
    el('pulseIndicator').classList.remove('paused');
    el('pulseText').textContent = `Live — Cycle ${state.cycle}`;
    // trigger animation
    const dot = el('pulseIndicator').querySelector('.pulse-dot');
    dot.classList.remove('animating');
    void dot.offsetWidth;
    dot.classList.add('animating');
  }

  // Dashboard Stats
  el('statsLvl').textContent = state.evolution_level || 0;
  el('statsCycles').textContent = state.cycle || 0;
  el('mindSummary').textContent = JSON.stringify(identity, null, 2);

  // 2. Drives (Hormonal Weather)
  const drives = state.drives || {};
  _latestDrives = drives;
  const drivesGrid = el('drivesGrid');
  drivesGrid.innerHTML = '';
  
  const driveNames = Object.keys(drives);
  if (driveNames.length === 0) drivesGrid.innerHTML = '<div style="color:#555">No drives emerged yet.</div>';
  
  driveNames.forEach(d => {
      const val = drives[d];
      let color = 'white';
      if (val > 0.8) color = '#ff3366'; // high alert
      if (val < 0.2) color = '#555';
      
      const div = document.createElement('div');
      div.className = 'drive-card';
      div.innerHTML = `
        <div class="drive-val" style="color:${color}">${(val*100).toFixed(0)}%</div>
        <div class="stat-label">${esc(d.replace(/_/g, ' '))}</div>
      `;
      drivesGrid.appendChild(div);
  });

  // 3. Subconscious Stream
  const subList = el('subconsciousList');
  const subs = state.subconscious || [];
  if (subs.length === 0) {
    subList.innerHTML = '<div style="color:#555">The stream is empty.</div>';
  } else {
    subList.innerHTML = [...subs]
      .reverse()
      .slice(0, 50)
      .map(s => `<div class="sub-msg">"${esc(s.thought)}"</div>`)
      .join('');
  }

  // 4. Philosophy (Beliefs)
  const bList = el('beliefsList');
  const beliefs = state.philosophy?.beliefs || [];
  if (beliefs.length === 0) {
    bList.innerHTML = '<div style="color:#555">No beliefs formed yet.</div>';
  } else {
    bList.innerHTML = beliefs.map(b => `
      <div class="belief-item">
        <h4 style="color:var(--text-title); margin-bottom:4px;">${esc(b.belief)}</h4>
        <p style="font-size:13px; color:var(--text-muted);">Formed cycle ${b.formed_at_cycle}</p>
      </div>
    `).join('');
  }
}

async function fetchMemories() {
  try {
    const res = await fetch('/api/memories', { headers: getHeaders() });
    if (!res.ok) return;
    const memories = await res.json();
    
    el('statsMem').textContent = memories.length;

    const timeline = el('memoryTimeline');
    if (memories.length === 0) {
      timeline.innerHTML = '<div style="color:#555">No memories recorded yet.</div>';
      return;
    }
    
    timeline.innerHTML = [...memories].reverse().slice(0, 100).map(m => {
      const isWisdom = m.tags && m.tags.includes('wisdom');
      return `
        <div class="timeline-item ${isWisdom ? 'crystallized' : ''}">
           <div class="timeline-content">
             <div class="timeline-time">${timeAgo(m.timestamp)}</div>
             <div>${esc(m.content)}</div>
           </div>
        </div>
      `;
    }).join('');
    
  } catch (e) {}
}

async function fetchImagination() {
  try {
    const res = await fetch('/api/imagination', { headers: getHeaders() });
    if (!res.ok) return;
    const images = await res.json();
    
    const grid = el('imageGrid');
    if (images.length === 0) {
      grid.innerHTML = '<div style="color:#555">No images imagined yet.</div>';
      return;
    }
    
    grid.innerHTML = images.map(img => `
      <div class="img-card">
         <a href="/images/${img.file}" target="_blank">
           <img src="/images/${img.file}" alt="Imagination" loading="lazy" />
         </a>
         <div class="img-caption">${esc(img.prompt)}<br><span style="color:#555; font-size:10px;">${timeAgo(img.timestamp)}</span></div>
      </div>
    `).join('');
  } catch (e) {}
}

// ─── Direct Chat ──────────────────────────────
el('chatSend').addEventListener('click', submitChat);
el('chatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitChat();
});

async function submitChat() {
  const input = el('chatInput');
  const text = input.value.trim();
  if (!text) return;

  const msgBox = el('chatMessages');
  
  // User echo
  msgBox.innerHTML += `
    <div class="msg">
      <div class="msg-avatar user"></div>
      <div class="msg-content">
        <div class="msg-header"><span class="msg-name">You</span></div>
        <div class="msg-text">${esc(text)}</div>
      </div>
    </div>
  `;
  input.value = '';
  msgBox.scrollTop = msgBox.scrollHeight;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ message: text, name: 'Creator', sessionId: 'dashboard-session' })
    });
    
    if (!res.ok) throw new Error('Network response was not ok');
    const data = await res.json();
    
    // Agent reply
    msgBox.innerHTML += `
      <div class="msg">
        <div class="msg-avatar" style="background:var(--accent)"></div>
        <div class="msg-content">
          <div class="msg-header">
             <span class="msg-name" style="color:var(--accent);">Evonite</span>
             <span class="msg-time">Just now</span>
          </div>
          <div class="msg-text">${esc(data.reply)}</div>
        </div>
      </div>
    `;
    msgBox.scrollTop = msgBox.scrollHeight;

    if (voiceEnabled) speak(data.reply, _latestDrives);

  } catch (e) {
    msgBox.innerHTML += `<div class="msg"><div class="msg-text" style="color:var(--danger)">Error: Could not reach agent.</div></div>`;
  }
}

// Auto-Refresh
el('btnRefresh').addEventListener('click', () => fetchAndRender());
setInterval(() => { if(isAuthorized) fetchAndRender() }, 5000);

// Init
if (EVONITE_SECRET) fetchAndRender(true);
else showAuthGate(false);
