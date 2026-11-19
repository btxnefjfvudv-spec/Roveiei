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
  const STINGER_MS = parseFloat(getComputedStyle(root).getPropertyValue('--t-stinger')) || 1300;

  let S = null;            // latest state
  let teamMap = {};
  let shown = null;        // scene currently on screen
  let busy = false;        // stinger playing
  let queued = null;
  let prevScore = null;
  let prevBo = null;
  let link = null;

  if (new URLSearchParams(location.search).has('preview')) document.body.classList.add('preview');

  /* ---------- stage scaling (OBS = 1920x1080 → scale 1) ---------- */
  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    const x = (innerWidth - 1920 * s) / 2;
    const y = (innerHeight - 1080 * s) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }
  addEventListener('resize', fit);
  fit();

  /* ---------- helpers ---------- */
  const team = (tag) => teamMap[tag] || { ...FALLBACK, tag: tag || 'TBD' };
  const winsNeeded = () => Math.ceil(S.bestOf / 2);

  function monoHTML(t, variant) {
    const onColor = variant === 'on-color';
    const style = [
      `--mo:${onColor ? 'var(--c-void)' : t.color}`,
      `--mf:var(--c-panel)`,
      `--mt:${t.color}`,
    ].join(';');
    const inner = t.logo
      ? `<img src="${encodeURI(t.logo)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${t.tag}'}))">`
      : `<span>${escapeHTML(t.tag)}</span>`;
    return `<div class="mono" style="${style}">${inner}</div>`;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setText(key, value) {
    for (const el of $$(`[data-text="${key}"]`)) {
      const v = String(value);
      if (el.textContent !== v) el.textContent = v;
    }
  }

  /* ---------- render ---------- */
  function render(state, teams) {
    S = state;
    teamMap = Object.fromEntries((teams || []).map((t) => [t.tag, t]));
    const L = team(S.left.tag);
    const R = team(S.right.tag);
    const W = S.winnerSide === 'right' ? R : L;
    const ws = S.winnerSide === 'right' ? S.right : S.left;
    const ls = S.winnerSide === 'right' ? S.left : S.right;

    root.style.setProperty('--team-l', L.color);
    root.style.setProperty('--team-r', R.color);
    root.style.setProperty('--ink-l', inkFor(L.color));
    root.style.setProperty('--ink-r', inkFor(R.color));
    root.style.setProperty('--win', W.color);
    root.style.setProperty('--win-ink', inkFor(W.color));
    root.style.setProperty('--sb-gap', `${S.gapWidth}px`);

    setText('left.tag', L.tag);
    setText('right.tag', R.tag);
    setText('left.name', L.name);
    setText('right.name', R.name);
    setText('left.score', S.left.score);
    setText('right.score', S.right.score);
    setText('winner.name', W.name);
    setText('finalScore', `${ws.score} – ${ls.score}`);
    setText('roundName', S.roundName);
    setText('eventName', S.eventName);
    setText('gameNumber', S.gameNumber);
    setText('boLabel', `BO${S.bestOf}`);

    const monoKey = (side) => (side === 'winner' ? W : side === 'right' ? R : L);
    for (const el of $$('[data-mono]')) {
      const t = monoKey(el.dataset.mono);
      const sig = `${t.tag}|${t.color}|${t.logo}`;
      if (el.dataset.sig !== sig) {
        el.dataset.sig = sig;
        el.innerHTML = monoHTML(t, el.dataset.variant);
      }
    }

    renderDots();
    updateScene();
    tickClock();
  }

  function renderDots() {
    const need = winsNeeded();
    const score = { left: S.left.score, right: S.right.score };
    for (const side of ['left', 'right']) {
      const box = $(`[data-dots="${side}"]`);
      if (prevBo !== S.bestOf || box.children.length !== need) {
        box.innerHTML = '<i class="dot"></i>'.repeat(need);
      }
      const dots = Array.from(box.children);
      dots.forEach((d, i) => d.classList.toggle('on', i < score[side]));
      if (prevScore && prevBo === S.bestOf && score[side] > prevScore[side]) {
        const d = dots[score[side] - 1];
        if (d) restartClass(d, 'pop');
        restartClass($(`.sb-${side}`), 'bump');
      }
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
    if (shown === null) {
      applyScene(S.scene);
    } else if (S.scene !== shown) {
      transition(S.scene);
    }
    sb.classList.toggle('is-in', shown === 'scoreboard' && S.scoreboardVisible);
  }

  function applyScene(scene) {
    shown = scene;
    for (const el of $$('.scene')) {
      const on = el.dataset.scene === scene;
      if (on) restartClass(el, 'active');
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
    const band = $('.st-band');
    const toWinner = scene === 'winner';
    band.style.setProperty('--st-a', toWinner ? 'var(--win)' : 'var(--team-l)');
    band.style.setProperty('--st-b', toWinner ? 'var(--win)' : 'var(--team-r)');
    restartClass(stinger, 'play');
    setTimeout(() => applyScene(scene), STINGER_MS * 0.5);
    setTimeout(() => {
      busy = false;
      stinger.classList.remove('play');
      const next = queued || S.scene;
      queued = null;
      if (next !== shown) transition(next);
    }, STINGER_MS + 30);
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
    const done = ms <= 0;
    for (const el of $$('.clock-box')) el.classList.toggle('done', done && cd.durationMs > 0);
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
