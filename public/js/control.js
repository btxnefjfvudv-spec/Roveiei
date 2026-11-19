// Control panel logic
(function () {
  'use strict';

  const { connect, formatClock, inkFor } = window.RovLink;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let S = null;
  let teams = [];
  /* ---------- status ---------- */
  const statusEl = $('#status');
  function setStatus(s) {
    statusEl.className = `status ${s}`;
    statusEl.querySelector('span').textContent =
      s === 'online' ? 'เชื่อมต่อแล้ว' : s === 'offline' ? 'หลุด — กำลังต่อใหม่' : 'กำลังเชื่อมต่อ…';
  }
  function flashStatus() {
    statusEl.animate([{ transform: 'scale(1.15)' }, { transform: 'none' }], { duration: 300 });
  }

  const link = connect(render, setStatus);
  const send = (action, payload) => {
    if (!link.send(action, payload)) flashStatus();
  };

  /* ---------- render ---------- */
  const team = (tag) => teams.find((t) => t.tag === tag) || { name: tag, tag, color: '#8A94A8' };

  function render(state, list) {
    S = state;
    teams = list || [];
    const L = team(S.left.tag);
    const R = team(S.right.tag);

    for (const [side, t] of [['left', L], ['right', R]]) {
      for (const el of $$(`[data-side="${side}"], .btn.win[data-win="${side}"]`)) {
        el.style.setProperty('--tc', t.color);
        el.style.setProperty('--tink', inkFor(t.color));
      }
      for (const el of $$(`[data-tag="${side}"]`)) el.textContent = t.tag;
      $(`[data-score="${side}"]`).textContent = S[side].score;
    }

    for (const b of $$('#scenes .btn')) {
      const on = b.dataset.scene === S.scene && (!b.dataset.win || b.dataset.win === S.winnerSide);
      b.classList.toggle('is-on', on);
    }

    const tg = $('#sbToggle');
    tg.textContent = S.scoreboardVisible ? 'Scoreboard: แสดงอยู่ (กดเพื่อซ่อน)' : 'Scoreboard: ซ่อนอยู่ (กดเพื่อแสดง)';
    tg.classList.toggle('off', !S.scoreboardVisible);

    for (const b of $$('#bo .btn')) b.classList.toggle('is-on', Number(b.dataset.bo) === S.bestOf);

    $('#gameNum').textContent = S.gameNumber;
    syncInput($('#roundName'), S.roundName);
    syncInput($('#eventName'), S.eventName);

    fillSelect($('#teamLeft'), S.left.tag);
    fillSelect($('#teamRight'), S.right.tag);

    $('#gapVal').textContent = S.gapWidth;
    if (document.activeElement !== $('#gap')) $('#gap').value = S.gapWidth;

    tick();
  }

  // don't overwrite a field the user is typing in
  function syncInput(el, value) {
    if (document.activeElement !== el && el.dataset.dirty !== '1') el.value = value;
  }

  function fillSelect(sel, current) {
    const sig = teams.map((t) => t.tag + t.name).join('|');
    if (sel.dataset.sig !== sig) {
      sel.dataset.sig = sig;
      sel.innerHTML = teams.map((t) => `<option value="${t.tag}">${t.tag} — ${t.name}</option>`).join('');
    }
    sel.value = current;
  }

  /* ---------- countdown display ---------- */
  function tick() {
    if (!S) return;
    const cd = S.countdown;
    const ms = cd.endsAt ? Math.max(0, cd.endsAt - (Date.now() + link.offset)) : cd.remainingMs;
    const el = $('#clock');
    el.textContent = formatClock(ms);
    el.classList.toggle('running', !!cd.endsAt);
  }
  setInterval(tick, 250);

  /* ---------- wiring ---------- */
  for (const b of $$('#scenes .btn')) {
    b.addEventListener('click', () => send('setScene', { scene: b.dataset.scene, winnerSide: b.dataset.win }));
  }
  $('#sbToggle').addEventListener('click', () => send('setScoreboardVisible', { visible: !S.scoreboardVisible }));

  for (const b of $$('[data-act="score"]')) {
    b.addEventListener('click', () => send('score', { side: b.dataset.side, delta: Number(b.dataset.delta) }));
  }
  for (const b of $$('#bo .btn')) b.addEventListener('click', () => send('setBestOf', { n: Number(b.dataset.bo) }));
  $('#resetScore').addEventListener('click', () => {
    if (confirm('รีเซ็ตคะแนนเป็น 0–0 และ GAME 1 ?')) send('resetScore');
  });

  function bindText(input, button, action) {
    input.addEventListener('input', () => (input.dataset.dirty = '1'));
    const save = () => {
      input.dataset.dirty = '';
      send(action, { text: input.value.trim() });
      input.blur();
    };
    button.addEventListener('click', save);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  }
  bindText($('#roundName'), $('#roundSave'), 'setRound');
  bindText($('#eventName'), $('#eventSave'), 'setEvent');
  for (const c of $$('#roundQuick .chip')) {
    c.addEventListener('click', () => {
      $('#roundName').dataset.dirty = '';
      send('setRound', { text: c.textContent });
    });
  }

  $('#gameMinus').addEventListener('click', () => send('setGame', { n: S.gameNumber - 1 }));
  $('#gamePlus').addEventListener('click', () => send('setGame', { n: S.gameNumber + 1 }));

  for (const b of $$('#presets [data-min]')) {
    b.addEventListener('click', () => send('countdownSet', { seconds: Number(b.dataset.min) * 60 }));
  }
  $('#customSet').addEventListener('click', () => {
    const m = parseFloat($('#customMin').value);
    if (m >= 0) send('countdownSet', { seconds: Math.round(m * 60) });
    $('#customMin').blur();
  });
  $('#cdStart').addEventListener('click', () => send('countdownStart'));
  $('#cdStop').addEventListener('click', () => send('countdownStop'));
  $('#cdReset').addEventListener('click', () => send('countdownReset'));

  $('#teamLeft').addEventListener('change', (e) => send('setTeam', { side: 'left', tag: e.target.value }));
  $('#teamRight').addEventListener('change', (e) => send('setTeam', { side: 'right', tag: e.target.value }));
  $('#swap').addEventListener('click', () => send('swapSides'));

  const gap = $('#gap');
  let gapTimer = null;
  gap.addEventListener('input', () => {
    $('#gapVal').textContent = gap.value;
    clearTimeout(gapTimer);
    gapTimer = setTimeout(() => send('setGap', { px: Number(gap.value) }), 60);
  });
  $('#gapMinus').addEventListener('click', () => send('setGap', { px: S.gapWidth - 20 }));
  $('#gapPlus').addEventListener('click', () => send('setGap', { px: S.gapWidth + 20 }));
})();
