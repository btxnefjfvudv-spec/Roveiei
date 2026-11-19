// State shared between index.html (control) and overlay.html (same browser / OBS profile)
const KEY = 'rov-sportday-state-v2';
const DEFAULT_STATE = {
  scene: 'score',            // score | break | winner | hidden
  title: 'SPORTS DAY 2026',
  round: 'ROUND 1',
  bo: 3,
  game: 1,
  a: { name: 'SUKHOTHAI',   abbr: 'SKT', color: '#ec4f93', score: 0 },
  b: { name: 'CHIANG SAEN', abbr: 'CSN', color: '#f5c518', score: 0 },
  breakTitle: 'Starting Soon',
  breakSub: 'การแข่งขันกำลังจะเริ่มขึ้น',
  countdownEnd: 0,
  winner: 'a',
  v: 0
};

const chan = ('BroadcastChannel' in window) ? new BroadcastChannel(KEY) : null;

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) return Object.assign({}, DEFAULT_STATE, s, {
      a: Object.assign({}, DEFAULT_STATE.a, s.a),
      b: Object.assign({}, DEFAULT_STATE.b, s.b)
    });
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState(s) {
  s.v = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  if (chan) chan.postMessage(s);
}

function onState(cb) {
  let last = 0;
  const handle = s => { if (s && s.v !== last) { last = s.v; cb(s); } };
  if (chan) chan.onmessage = e => handle(e.data);
  window.addEventListener('storage', e => { if (e.key === KEY) handle(loadState()); });
  setInterval(() => handle(loadState()), 500); // fallback
  handle(loadState());
}
