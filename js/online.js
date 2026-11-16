/* ============================================================
   Онлайн-лидерборд: тонкий клиент к воркеру (server/leaderboard-worker.js)
   Пока CONFIG.LEADERBOARD_API пуст, онлайн выключен и игра показывает
   личные результаты — без выдуманных соперников.
   ============================================================ */
'use strict';

const Online = (function () {
  const api = (typeof CONFIG !== 'undefined' && CONFIG.LEADERBOARD_API ? String(CONFIG.LEADERBOARD_API) : '').replace(/\/+$/, '');
  const token = (typeof CONFIG !== 'undefined' && CONFIG.LEADERBOARD_TOKEN) ? String(CONFIG.LEADERBOARD_TOKEN) : '';
  const TIMEOUT_MS = 6000;
  const CACHE_MS = 20000;
  const LOCAL_ID_KEY = 'bb_player_id';

  let me = null;
  const cache = Object.create(null);

  function enabled() { return !!api; }

  function fetchJson(url, opts, ms) {
    return new Promise(function (resolve, reject) {
      let settled = false;
      const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (ctl) { try { ctl.abort(); } catch (e) { } }
        reject(new Error('timeout'));
      }, ms || TIMEOUT_MS);

      const options = Object.assign({}, opts || {});
      if (ctl) options.signal = ctl.signal;

      fetch(url, options).then(function (r) {
        return r.text().then(function (text) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (!r.ok) { reject(new Error('http ' + r.status)); return; }
          let data = null;
          try { data = JSON.parse(text); } catch (e) { reject(new Error('bad json')); return; }
          resolve(data);
        });
      }).catch(function (e) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  function localId() {
    try {
      let v = localStorage.getItem(LOCAL_ID_KEY);
      if (!v) {
        v = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem(LOCAL_ID_KEY, v);
      }
      return v;
    } catch (e) {
      return 'p' + Math.random().toString(36).slice(2, 10);
    }
  }

  // Кто играет: имя и id берём у VK, вне VK остаёмся анонимными
  async function identify() {
    if (me) return me;
    let name = 'Игрок';
    let id = null;
    if (typeof Platform !== 'undefined' && Platform.isAvailable && Platform.isAvailable()) {
      try {
        const u = await Platform.getUserInfo();
        if (u) {
          if (u.id) id = String(u.id);
          const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
          if (full) name = full;
        }
      } catch (e) { /* без VK — анонимно */ }
    }
    me = { id: id || localId(), name: name };
    return me;
  }

  function headers(extra) {
    const h = Object.assign({}, extra || {});
    if (token) h['x-bb-token'] = token;
    return h;
  }

  // top(kind, period) -> { entries: [{id,name,value}], updated } | null
  async function top(kind, period, force) {
    if (!enabled()) return null;
    const key = kind + '|' + period;
    const hit = cache[key];
    if (!force && hit && (Date.now() - hit.at) < CACHE_MS) return hit.data;
    const url = api + '/top?kind=' + encodeURIComponent(kind) +
      '&period=' + encodeURIComponent(period) +
      '&limit=' + (CONFIG.LEADERBOARD_MAX || 50);
    const data = await fetchJson(url, { headers: headers() });
    cache[key] = { at: Date.now(), data: data };
    return data;
  }

  // submit({ entries: [{ kind, period, value }] })
  async function submit(payload) {
    if (!enabled()) return false;
    try {
      const who = await identify();
      const body = JSON.stringify({
        id: who.id,
        name: who.name,
        entries: (payload.entries || []).map(function (e) {
          return { kind: e.kind, period: e.period, value: Math.max(0, Math.round(e.value || 0)) };
        }),
      });
      const res = await fetchJson(api + '/submit', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: body,
      });
      Object.keys(cache).forEach(function (k) { delete cache[k]; });
      return !!(res && res.ok);
    } catch (e) {
      return false;
    }
  }

  return {
    enabled: enabled,
    top: top,
    submit: submit,
    identify: identify,
    myId: function () { return me ? me.id : null; },
    endpoint: api,
  };
})();
