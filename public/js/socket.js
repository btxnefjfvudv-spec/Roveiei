// Shared WebSocket client with auto-reconnect + server clock sync
(function () {
  'use strict';

  function connect(onState, onStatus) {
    let ws = null;
    let retry = 0;
    let lastMsg = 0;
    const api = { offset: 0, send };

    function url() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${location.host}/ws`;
    }

    function open() {
      onStatus && onStatus('connecting');
      try {
        ws = new WebSocket(url());
      } catch {
        return schedule();
      }
      ws.onopen = () => {
        retry = 0;
        lastMsg = Date.now();
        onStatus && onStatus('online');
      };
      ws.onmessage = (ev) => {
        lastMsg = Date.now();
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.serverTime) api.offset = msg.serverTime - Date.now();
        if (msg.type === 'state') onState(msg.state, msg.teams);
      };
      ws.onclose = () => {
        onStatus && onStatus('offline');
        schedule();
      };
      ws.onerror = () => ws && ws.close();
    }

    function schedule() {
      const wait = Math.min(5000, 500 * 2 ** retry++);
      setTimeout(open, wait);
    }

    function send(action, payload) {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'action', action, payload: payload || {} }));
        return true;
      }
      return false;
    }

    // heartbeat: if nothing heard for a while, force reconnect
    setInterval(() => {
      if (!ws || ws.readyState !== 1) return;
      if (Date.now() - lastMsg > 25000) ws.close();
      else ws.send(JSON.stringify({ type: 'ping' }));
    }, 8000);

    open();
    return api;
  }

  function formatClock(ms) {
    const total = Math.ceil(Math.max(0, ms) / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // pick black/white ink with best contrast on a team color
  function inkFor(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    const vsWhite = 1.05 / (L + 0.05);
    const vsBlack = (L + 0.05) / 0.055;
    return vsBlack >= vsWhite ? '#0A0B10' : '#FFFFFF';
  }

  window.RovLink = { connect, formatClock, inkFor };
})();
