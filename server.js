// RoV Broadcast Overlay — server
// Express serves the pages, ws is the realtime hub, state is persisted to data/state.json
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const TEAMS_FILE = path.join(ROOT, 'teams.json');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const SCENES = ['starting', 'matchup', 'scoreboard', 'break', 'winner'];
const BEST_OF = [1, 3, 5];

/* ---------------- teams ---------------- */
let teams = [];

function loadTeams() {
  try {
    const raw = JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.teams;
    if (!Array.isArray(list)) throw new Error('teams.json ต้องมี "teams": [ ... ]');
    const seen = new Set();
    teams = list
      .filter((t) => t && t.tag)
      .map((t) => ({
        name: String(t.name || t.tag),
        tag: String(t.tag).toUpperCase().slice(0, 4),
        color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#8A94A8',
        logo: t.logo ? String(t.logo) : '',
      }))
      .filter((t) => (seen.has(t.tag) ? false : seen.add(t.tag)));
    console.log(`[teams] โหลด ${teams.length} ทีม: ${teams.map((t) => t.tag).join(', ')}`);
  } catch (err) {
    console.error('[teams] อ่าน teams.json ไม่ได้ (ใช้ค่าเดิม):', err.message);
  }
}

/* ---------------- state ---------------- */
const MIN = 60 * 1000;

function defaultState() {
  return {
    eventName: 'ROV SPORTS DAY',
    roundName: 'รอบชิงชนะเลิศ',
    gameNumber: 1,
    bestOf: 3,
    left: { tag: teams[0] ? teams[0].tag : 'SKT', score: 0 },
    right: { tag: teams[1] ? teams[1].tag : 'CSN', score: 0 },
    scene: 'starting',
    winnerSide: 'left',
    scoreboardVisible: true,
    gapWidth: 620,
    countdown: { durationMs: 10 * MIN, remainingMs: 10 * MIN, endsAt: null },
  };
}

let state = defaultState();

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const d = defaultState();
    state = {
      ...d,
      ...saved,
      left: { ...d.left, ...saved.left },
      right: { ...d.right, ...saved.right },
      countdown: { ...d.countdown, ...saved.countdown },
    };
    console.log('[state] โหลด state เดิมจาก data/state.json');
  } catch {
    console.log('[state] เริ่ม state ใหม่');
  }
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = STATE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, STATE_FILE);
    } catch (err) {
      console.error('[state] บันทึกไม่สำเร็จ:', err.message);
    }
  }, 150);
}

/* ---------------- actions ---------------- */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const winsNeeded = () => Math.ceil(state.bestOf / 2);
const sideOf = (s) => (s === 'right' ? 'right' : 'left');
const cleanText = (v, max) => String(v == null ? '' : v).slice(0, max);

function countdownRemaining(cd) {
  return cd.endsAt ? Math.max(0, cd.endsAt - Date.now()) : cd.remainingMs;
}

const actions = {
  setTeam({ side, tag }) {
    if (!teams.some((t) => t.tag === tag)) return;
    state[sideOf(side)].tag = tag;
  },
  swapSides() {
    [state.left, state.right] = [state.right, state.left];
    state.winnerSide = state.winnerSide === 'left' ? 'right' : 'left';
  },
  score({ side, delta }) {
    const s = state[sideOf(side)];
    s.score = clamp(s.score + (Number(delta) || 0), 0, winsNeeded());
  },
  resetScore() {
    state.left.score = 0;
    state.right.score = 0;
    state.gameNumber = 1;
  },
  setBestOf({ n }) {
    n = Number(n);
    if (!BEST_OF.includes(n)) return;
    state.bestOf = n;
    state.left.score = clamp(state.left.score, 0, winsNeeded());
    state.right.score = clamp(state.right.score, 0, winsNeeded());
    state.gameNumber = clamp(state.gameNumber, 1, n);
  },
  setRound({ text }) {
    state.roundName = cleanText(text, 60);
  },
  setEvent({ text }) {
    state.eventName = cleanText(text, 60);
  },
  setGame({ n }) {
    state.gameNumber = clamp(Math.round(Number(n) || 1), 1, 9);
  },
  setScene({ scene, winnerSide }) {
    if (!SCENES.includes(scene)) return;
    if (scene === 'winner') {
      state.winnerSide = winnerSide
        ? sideOf(winnerSide)
        : state.right.score > state.left.score ? 'right' : 'left';
    }
    state.scene = scene;
  },
  setScoreboardVisible({ visible }) {
    state.scoreboardVisible = !!visible;
  },
  setGap({ px }) {
    state.gapWidth = clamp(Math.round(Number(px) || 0), 0, 1400);
  },
  countdownSet({ seconds }) {
    const ms = clamp(Math.round(Number(seconds) || 0), 0, 99 * 60) * 1000;
    state.countdown = { durationMs: ms, remainingMs: ms, endsAt: null };
  },
  countdownStart() {
    const cd = state.countdown;
    if (cd.endsAt) return;
    const rem = cd.remainingMs > 0 ? cd.remainingMs : cd.durationMs;
    state.countdown = { ...cd, remainingMs: rem, endsAt: Date.now() + rem };
  },
  countdownStop() {
    const cd = state.countdown;
    state.countdown = { ...cd, remainingMs: countdownRemaining(cd), endsAt: null };
  },
  countdownReset() {
    const cd = state.countdown;
    state.countdown = { ...cd, remainingMs: cd.durationMs, endsAt: null };
  },
};

/* ---------------- http + ws ---------------- */
const app = express();
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'] }));
app.get('/', (_req, res) => res.redirect('/control.html'));
app.get('/api/state', (_req, res) => res.json({ state, teams, serverTime: Date.now() }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function snapshot() {
  return JSON.stringify({ type: 'state', state, teams, serverTime: Date.now() });
}

function broadcast() {
  const msg = snapshot();
  for (const client of wss.clients) if (client.readyState === 1) client.send(msg);
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.send(snapshot());
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }));
    const fn = msg.type === 'action' && actions[msg.action];
    if (!fn) return;
    fn(msg.payload || {});
    saveState();
    broadcast();
  });
});

// drop dead connections so clients reconnect cleanly
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 10000);

// reload teams.json when it is edited
let teamsTimer = null;
fs.watchFile(TEAMS_FILE, { interval: 1000 }, () => {
  clearTimeout(teamsTimer);
  teamsTimer = setTimeout(() => {
    loadTeams();
    broadcast();
  }, 200);
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

loadTeams();
loadState();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nพอร์ต ${PORT} ถูกใช้อยู่ — ปิดโปรแกรมเดิมก่อน หรือรันด้วย PORT อื่น เช่น  set PORT=3001 && npm start\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  const line = '='.repeat(60);
  console.log(`\n${line}\n  RoV Broadcast Overlay พร้อมใช้งาน\n${line}`);
  console.log(`  Overlay (OBS / จอใหญ่): http://localhost:${PORT}/overlay.html`);
  console.log(`  Control (เครื่องนี้)  : http://localhost:${PORT}/control.html`);
  if (ips.length) {
    console.log('\n  >> เปิดบนมือถือ (ต่อ Wi-Fi วงเดียวกัน):');
    for (const ip of ips) console.log(`     http://${ip}:${PORT}/control.html`);
  } else {
    console.log('\n  (ไม่พบ IP ในวง LAN — ตรวจว่าต่อ Wi-Fi/LAN อยู่)');
  }
  console.log(`${line}\n  กด Ctrl+C เพื่อปิด\n`);
});
