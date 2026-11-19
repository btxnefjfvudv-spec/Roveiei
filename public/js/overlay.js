// Overlay renderer: receives state over WebSocket and drives scenes / animations
(function () {
  'use strict';

  const { connect, formatClock, inkFor } = window.RovLink;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const root = document.documentElement;
  const stage = $('#stage');
  const sb = $('#sb');
  const stinger = $('#stinger');

  const FALLBACK = { name: 'TBD', tag: 'TBD', color: '#8A94A8', logo: '' };
  const STINGER_MS = parseFloat(getComputedStyle(root).getPropertyValue('--t-stinger')) || 1150;
  const STINGER_LAG = 110; // delay of the dark cover layer (matches CSS)

  let S = null;
  let teamMap = {};
  let shown = null;
  let busy = false;
  let queued = null;
  let prevScore = null;
  let prevBo = null;
  let link = null;

  if (new URLSearchParams(location.search).has('preview')) document.body.classList.add('preview');

  /* ---------- stage scaling (OBS 1920x1080 → scale 1) ---------- */
  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
  }
  addEventListener('resize', fit);
  fit();

  /* ---------- helpers ---------- */
  const team = (tag) => teamMap[tag] || { ...FALLBACK, tag: tag || 'TBD' };
  const winsNeeded = () => Math.ceil(S.bestOf / 2);
  const rgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function crestHTML(t, variant) {
    const text = variant === 'initial' ? t.tag.charAt(0) : t.tag;
    const style = `--c:${t.color};--ink:${inkFor(t.color)}`;
    if (t.logo) {
      return `<div class="crest" style="${style}"><img src="${esc(t.logo)}" alt="" onerror="this.parentNode.classList.add('nologo');this.replaceWith(Object.assign(document.createElement('i'),{className:'cs'}),Object.assign(document.createElement('span'),{textContent:${esc(JSON.stringify(text))}}))"></div>`;
    }
    return `<div class="crest ${variant === 'initial' ? 'initial' : ''}" style="${style}"><i class="cs"></i><span>${esc(text)}</span></div>`;
  }

  function setText(key, value) {
    const v = String(value);
    for (const el of $$(`[data-text="${key}"]`)) if (el.textContent !== v) el.textContent = v;
  }

  /* ---------- render ---------- */
  function render(state, teams) {
    S = state;
    teamMap = Object.fromEntries((teams || []).map((t) => [t.tag, t]));
    const L = team(S.left.tag);
    const R = team(S.right.tag);
    const winRight = S.winnerSide === 'right';
    const W = winRight ? R : L;
    const Lo = winRight ? L : R;

    const vars = {
      '--team-l': L.color, '--team-l-rgb': rgb(L.color), '--ink-l': inkFor(L.color),
      '--team-r': R.color, '--team-r-rgb': rgb(R.color), '--ink-r': inkFor(R.color),
      '--win': W.color, '--win-rgb': rgb(W.color), '--win-ink': inkFor(W.color),
      '--sb-gap': `${S.gapWidth}px`,
    };
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);

    setText('left.tag', L.tag);
    setText('right.tag', R.tag);
    setText('left.name', L.name);
    setText('right.name', R.name);
    setText('left.score', S.left.score);
    setText('right.score', S.right.score);
    setText('winner.name', W.name);
    setText('winner.tag', W.tag);
    setText('loser.tag', Lo.tag);
    setText('winner.score', (winRight ? S.right : S.left).score);
    setText('loser.score', (winRight ? S.left : S.right).score);
    setText('roundName', S.roundName);
    setText('eventName', S.eventName);
    setText('gameNumber', S.gameNumber);
    setText('boLabel', `BO${S.bestOf}`);

    for (const el of $$('[data-crest]')) {
      const side = el.dataset.crest;
      const t = side === 'winner' ? W : side === 'right' ? R : L;
      const sig = `${t.tag}|${t.color}|${t.logo}`;
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.innerHTML = crestHTML(t, el.dataset.variant);
      }
    }

    renderPips();
    updateScene();
    tickClock();
  }

  function renderPips() {
    const need = winsNeeded();
    const score = { left: S.left.score, right: S.right.score };
    for (const side of ['left', 'right']) {
      const box = $(`[data-dots="${side}"]`);
      if (box.children.length !== need) box.innerHTML = '<i class="dot"></i>'.repeat(need);
      Array.from(box.children).forEach((d, i) => d.classList.toggle('on', i < score[side]));
      if (prevScore && prevBo === S.bestOf && score[side] > prevScore[side]) restartClass($(`.sb-${side}`), 'bump');
    }
    prevScore = score;
    prevBo = S.bestOf;
  }

  function restartClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // reflow so the animation restarts
    el.classList.add(cls);
  }

  /* ---------- scenes + stinger ---------- */
  function updateScene() {
    if (shown === null) applyScene(S.scene);
    else if (S.scene !== shown) transition(S.scene);
    sb.classList.toggle('is-in', shown === 'scoreboard' && S.scoreboardVisible);
  }

  function applyScene(scene) {
    shown = scene;
    for (const el of $$('.scene')) {
      if (el.dataset.scene === scene) restartClass(el, 'active');
      else el.classList.remove('active');
    }
    sb.classList.toggle('is-in', scene === 'scoreboard' && S.scoreboardVisible);
  }

  function transition(scene) {
    if (busy) {
      queued = scene;
      return;
    }
    busy = true;
    const toWinner = scene === 'winner';
    stinger.style.setProperty('--st-a', toWinner ? 'var(--win)' : 'var(--team-l)');
    stinger.style.setProperty('--st-b', toWinner ? 'var(--win)' : 'var(--team-r)');
    restartClass(stinger, 'play');
    setTimeout(() => applyScene(scene), STINGER_LAG + STINGER_MS * 0.5);
    setTimeout(() => {
      busy = false;
      stinger.classList.remove('play');
      const next = queued || S.scene;
      queued = null;
      if (next !== shown) transition(next);
    }, STINGER_LAG + STINGER_MS + 40);
  }

  /* ---------- countdown ---------- */
  let lastClock = '';
  function tickClock() {
    if (!S) return;
    const cd = S.countdown;
    const now = Date.now() + (link ? link.offset : 0);
    const ms = cd.endsAt ? Math.max(0, cd.endsAt - now) : cd.remainingMs;
    const txt = formatClock(ms);
    if (txt !== lastClock) {
      lastClock = txt;
      for (const el of $$('[data-clock]')) el.textContent = txt;
    }
    const frac = cd.durationMs > 0 ? Math.min(1, ms / cd.durationMs) : 0;
    for (const el of $$('[data-progress]')) el.style.transform = `scaleX(${frac})`;
    for (const el of $$('.st-clock')) el.classList.toggle('done', ms <= 0 && cd.durationMs > 0);
    for (const el of $$('[data-when-clock]')) el.classList.toggle('hidden', ms <= 0);
  }
  setInterval(tickClock, 200);

  /* ---------- connection ---------- */
  const conn = $('#conn');
  let offlineTimer = null;
  link = connect(render, (status) => {
    clearTimeout(offlineTimer);
    if (status === 'online') conn.classList.remove('show');
    else offlineTimer = setTimeout(() => conn.classList.add('show'), 3000);
  });
})();
