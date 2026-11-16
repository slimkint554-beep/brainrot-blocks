/* ============================================================
   BRAINROT BLOCKS — приложение (UI + игровой цикл)
   ============================================================ */
(function () {
  'use strict';

  let profile = Store.load();
  let game = null;
  let drag = null;
  let endShown = false;
  let revealOpen = false;
  let revealQueue = [];
  let runCards = [];
  let runCardsRevealed = 0;
  let runFinalized = false;
  let lastScoreShown = -1;
  let lbState = { kind: 'points', period: 'week' };
  let colFilter = 'all';
  let wheelTier = 0;
  let craftRarity = null;
  let craftSel = [];
  let closeTimer = null;

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const fmt = n => Number(n || 0).toLocaleString('ru-RU');
  const escapeHtml = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  function save() { Store.save(profile); }

  function oddsOf(rar) { return Math.round(1 / rar.chance); }
  function sellPrice(card) { return Math.max(1, Math.round((card.rap || 0) / 100)); }
  function isSpecial(card) { const ch = brainrotById(card.charId); return !!(ch && ch.tag && COLLECTIONS[ch.tag]); }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ---------------- звук ---------------- */
  let actx = null;
  function beep(freq, dur, type) {
    if (!profile.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  }

  function tone(freq, dur, type, vol, delay) {
    if (!profile.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = actx.currentTime + (delay || 0);
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { }
  }
  function arp(freqs, step, dur, type, vol) {
    freqs.forEach(function (f, i) { tone(f, dur, type, vol, i * step); });
  }
  const SFX = {
    click: function () { tone(520, 0.04, 'square', 0.05); },
    pickup: function () { tone(400, 0.05, 'triangle', 0.08); },
    place: function () { tone(300, 0.07, 'triangle', 0.1); },
    invalid: function () { tone(150, 0.14, 'sawtooth', 0.09); },
    line: function (combo) { const b = 520 + Math.min(combo, 10) * 45; arp([b, b * 1.25, b * 1.5], 0.055, 0.1, 'sine', 0.11); },
    card: function () { arp([640, 860, 1040], 0.08, 0.14, 'sine', 0.11); },
    rarity: function (order) { const b = 520 + (order || 0) * 90; arp([b, b * 1.2, b * 1.5, b * 2], 0.07, 0.16, 'sine', 0.12); },
    coins: function () { arp([900, 1200], 0.05, 0.09, 'square', 0.07); },
    over: function () { arp([420, 320, 210], 0.13, 0.22, 'sine', 0.12); },
    tick: function () { tone(1400, 0.02, 'square', 0.035); },
    spin: function () { tone(280, 0.5, 'sawtooth', 0.05); }
  };

  function floatCoins(amount) {
    const el = document.getElementById('game-coins') || document.getElementById('home-coins');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'coin-pop';
    d.textContent = '+' + fmt(amount) + ' 🪙';
    d.style.left = (r.left + r.width / 2) + 'px';
    d.style.top = r.top + 'px';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 900);
  }

  /* ---------------- тосты и модалки ---------------- */
  function toast(msg, type) {
    const c = $('#toast-container');
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  function openModal(html, opts) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    const root = $('#modal-root');
    root.innerHTML = '<div class="overlay"><div class="modal ' + ((opts && opts.cls) || '') + '">' + html + '</div></div>';
    root.classList.add('open');
    const ov = root.querySelector('.overlay');
    requestAnimationFrame(() => ov.classList.add('show'));
    return root;
  }
  function closeModal() {
    const root = $('#modal-root');
    const ov = root.querySelector('.overlay');
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (ov) {
      ov.classList.remove('show');
      closeTimer = setTimeout(function () {
        root.innerHTML = ''; root.classList.remove('open'); closeTimer = null;
      }, 200);
    } else {
      root.innerHTML = ''; root.classList.remove('open');
    }
  }

  /* ---------------- навигация ---------------- */
  function show(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('active');
    if (id === 'home') renderHome();
    if (id === 'collection') renderCollection();
    if (id === 'leaderboard') renderLeaderboard();
    if (id === 'invite') renderInvite();
    if (id === 'cases') renderCases();
    if (id === 'upgrades') renderUpgrades();
    if (id === 'craft') renderCraftScreen();
    if (id === 'settings') renderSettings();
  }

  function refreshActive() {
    const id = (document.querySelector('.screen.active') || {}).id;
    if (id === 'screen-cases') renderCases();
    else if (id === 'screen-craft') renderCraftScreen();
    else if (id === 'screen-collection') renderCollection();
    else if (id === 'screen-home') renderHome();
  }

  /* ---------------- РЕКЛАМА (заглушка, заменить на VK/AdMob/RuStore) ---------------- */
  let adBusy = false;
  function showRewardedAd(onDone) {
    if (adBusy) return;
    adBusy = true;
    // На VK — реальная реклама через VK Bridge
    if (typeof Platform !== 'undefined' && Platform.isAvailable()) {
      Platform.showRewarded(function (ok) { adBusy = false; onDone && onDone(ok); });
      return;
    }
    // Демо-режим вне VK: имитация рекламы
    const layer = document.createElement('div');
    layer.className = 'ad-overlay';
    layer.innerHTML = '<div class="ad-box"><div class="ad-badge">Реклама</div><div class="ad-text">Награда начислится после просмотра</div><div class="ad-timer" id="ad-timer">3</div></div>';
    document.body.appendChild(layer);
    let t = 3;
    const timerEl = layer.querySelector('#ad-timer');
    const iv = setInterval(function () {
      t--;
      if (timerEl) timerEl.textContent = Math.max(0, t);
      if (t <= 0) {
        clearInterval(iv);
        layer.remove();
        adBusy = false;
        onDone && onDone(true);
      }
    }, 700);
  }

  function ensureAdCoin() {
    const now = Date.now();
    if (!profile.adCoin) profile.adCoin = { used: 0, resetAt: 0 };
    if (now >= profile.adCoin.resetAt) {
      profile.adCoin.used = 0;
      profile.adCoin.resetAt = now + CONFIG.AD_COIN_PERIOD_MS;
      save();
    }
  }
  function claimAdCoins() {
    ensureAdCoin();
    if (profile.adCoin.used >= CONFIG.AD_COIN_LIMIT) { toast('Лимит просмотров — попробуйте позже'); return; }
    showRewardedAd(function () {
      ensureAdCoin();
      if (profile.adCoin.used >= CONFIG.AD_COIN_LIMIT) { renderHome(); return; }
      profile.adCoin.used++;
      profile.coins += CONFIG.AD_COIN_REWARD;
      save();
      SFX.coins();
      floatCoins(CONFIG.AD_COIN_REWARD);
      toast('+' + CONFIG.AD_COIN_REWARD + ' 🪙 за рекламу', 'good');
      renderHome();
      refreshActive();
    });
  }

  /* предложение посмотреть рекламу при нехватке монет */
  function offerAdCoins() {
    ensureAdCoin();
    const left = CONFIG.AD_COIN_LIMIT - profile.adCoin.used;
    if (left <= 0) { toast('Не хватает монет — лимит рекламы исчерпан'); return; }
    openModal(
      '<div class="ad-offer">' +
        '<div class="ad-offer-emoji">🪙</div>' +
        '<h3>Не хватает монет</h3>' +
        '<p>Посмотрите рекламу и получите +' + CONFIG.AD_COIN_REWARD + ' 🪙<br><small>Осталось просмотров: ' + left + '/' + CONFIG.AD_COIN_LIMIT + '</small></p>' +
        '<button class="btn btn-primary btn-block" id="ad-offer-watch">▶ Смотреть рекламу</button>' +
        '<button class="btn btn-ghost btn-block" id="ad-offer-cancel">Закрыть</button>' +
      '</div>', { cls: 'ad-offer-modal' }
    );
    const root = $('#modal-root');
    root.querySelector('#ad-offer-cancel').onclick = closeModal;
    root.querySelector('#ad-offer-watch').onclick = function () {
      closeModal();
      showRewardedAd(function (ok) {
        if (!ok) { toast('Реклама недоступна'); return; }
        ensureAdCoin();
        if (profile.adCoin.used >= CONFIG.AD_COIN_LIMIT) { renderHome(); return; }
        profile.adCoin.used++;
        profile.coins += CONFIG.AD_COIN_REWARD;
        save();
        SFX.coins(); floatCoins(CONFIG.AD_COIN_REWARD);
        toast('+' + CONFIG.AD_COIN_REWARD + ' 🪙', 'good');
        renderHome(); refreshActive();
      });
    };
  }

  /* ---------------- HOME ---------------- */
  function renderHome() {
    $('#home-coins').textContent = fmt(profile.coins);
    $('#home-invites').textContent = profile.invites;
    $('#home-stats').innerHTML =
      '<div class="stat"><b>' + fmt(profile.stats.bestScore) + '</b><span>рекорд</span></div>' +
      '<div class="stat"><b>' + fmt(profile.stats.cardsFound) + '</b><span>карточек собрано</span></div>' +
      '<div class="stat"><b>' + profile.stats.games + '</b><span>игр</span></div>';
    updateBadge();
  }

  function updateBadge() {
    const b = $('#notif-badge');
    if (!b) return;
    const c = Store.unreadCount(profile);
    b.textContent = c;
    b.style.display = c ? 'flex' : 'none';
  }

  /* ---------------- GAME ---------------- */
  const boardEl = () => document.getElementById('board');
  const trayEl = () => document.getElementById('tray');

  function startGame() {
    endShown = false;
    runCards = [];
    runCardsRevealed = 0;
    runFinalized = false;
    lastScoreShown = -1;
    closeModal();
    game = BlockEngine.newGame(profile.invites);
    show('game');
    renderBoard();
    renderTray();
    updateGameHud();
  }

  function renderBoard() {
    const b = boardEl();
    b.innerHTML = '';
    for (let r = 0; r < CONFIG.GRID; r++) {
      for (let c = 0; c < CONFIG.GRID; c++) {
        const v = game.grid[r][c];
        const d = document.createElement('div');
        d.className = 'cell' + (v ? ' filled' : '');
        if (v) d.style.setProperty('--c', v);
        d.dataset.r = r; d.dataset.c = c;
        b.appendChild(d);
      }
    }
    fitBoard();
  }

  // подгоняем поле под доступную область (важно для фолдов и необычных пропорций)
  function fitBoard() {
    const wrap = document.querySelector('.board-wrap');
    const b = boardEl();
    if (!wrap || !b) return;
    const landscape = window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
    if (!landscape) {
      b.style.width = '';
      b.style.height = '';
      return;
    }
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    const pad = 20;
    const s = Math.max(80, Math.floor(Math.min(w - pad, h - pad)));
    b.style.width = s + 'px';
    b.style.height = s + 'px';
  }

  function cellEl(r, c) {
    if (r < 0 || c < 0 || r >= CONFIG.GRID || c >= CONFIG.GRID) return null;
    return boardEl().children[r * CONFIG.GRID + c] || null;
  }

  function pieceCellPx(maxDim) {
    if (maxDim >= 5) return 13;
    if (maxDim === 4) return 15;
    if (maxDim === 3) return 18;
    return 22;
  }
  function ghostCellPx(maxDim) {
    if (maxDim >= 5) return 16;
    if (maxDim === 4) return 19;
    if (maxDim === 3) return 23;
    return 27;
  }

  function makePieceEl(m, cellPx, ghost, color) {
    const size = BlockEngine.shapeSize(m);
    const el = document.createElement('div');
    el.className = ghost ? 'drag-ghost' : 'piece';
    el.style.setProperty(ghost ? '--gpc' : '--pc', cellPx + 'px');
    if (color) el.style.setProperty('--pcol', color);
    el.style.gridTemplateColumns = 'repeat(' + size.w + ', ' + cellPx + 'px)';
    el.style.gridTemplateRows = 'repeat(' + size.h + ', ' + cellPx + 'px)';
    for (let r = 0; r < size.h; r++) {
      for (let c = 0; c < size.w; c++) {
        const cell = document.createElement('div');
        cell.className = 'pcell' + (m[r][c] ? ' on' : '');
        el.appendChild(cell);
      }
    }
    return el;
  }

  function renderTray() {
    const tray = trayEl();
    tray.innerHTML = '';
    game.tray.forEach(function (p, i) {
      const slot = document.createElement('div');
      slot.className = 'pieceslot' + (p ? '' : ' used');
      slot.dataset.idx = i;
      if (p) {
        const size = BlockEngine.shapeSize(p.m);
        const el = makePieceEl(p.m, pieceCellPx(Math.max(size.h, size.w)), false, p.color);
        el.dataset.idx = i;
        slot.appendChild(el);
      }
      tray.appendChild(slot);
    });
  }

  function updateGameHud() {
    if (!game) return;
    const scoreEl = document.getElementById('game-score');
    if (scoreEl) {
      scoreEl.textContent = fmt(game.score);
      if (game.score !== lastScoreShown) {
        lastScoreShown = game.score;
        scoreEl.classList.remove('pop'); void scoreEl.offsetWidth; scoreEl.classList.add('pop');
      }
    }
    const cb = document.getElementById('game-combo');
    if (cb) {
      cb.textContent = String(game.combo > 0 ? game.combo : 1);
      const box = cb.closest('.combobox');
      if (box) {
        box.classList.toggle('hot', game.combo >= 4 && game.combo < 8);
        box.classList.toggle('max', game.combo >= 8);
      }
    }
    $('#game-coins').textContent = fmt(profile.coins);
    const into = game.score % CONFIG.CARD_ROLL_STEP;
    $('#card-progress-fill').style.width = (into / CONFIG.CARD_ROLL_STEP * 100) + '%';
    const chance = Math.round(Math.min(1, CONFIG.BASE_CARD_CHANCE + profile.invites * CONFIG.INVITE_BONUS) * 100);
    $('#card-progress-text').textContent = 'До карточки: ' + (CONFIG.CARD_ROLL_STEP - into) + ' очков · шанс ' + chance + '%';
  }

  function boardMetrics() {
    const b = boardEl();
    const rect = b.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(b).gap) || 6;
    const cell = (rect.width - gap * (CONFIG.GRID - 1)) / CONFIG.GRID;
    return { rect: rect, gap: gap, cell: cell, step: cell + gap };
  }
  function pointToCell(x, y) {
    const m = boardMetrics();
    const pad = m.step * 1.15; // увеличенный допуск за краем — блок легче «прилипает»
    if (x < m.rect.left - pad || x > m.rect.right + pad || y < m.rect.top - pad || y > m.rect.bottom + pad) return null;
    let c = Math.floor((x - m.rect.left) / m.step);
    let r = Math.floor((y - m.rect.top) / m.step);
    c = Math.max(0, Math.min(CONFIG.GRID - 1, c));
    r = Math.max(0, Math.min(CONFIG.GRID - 1, r));
    return { r: r, c: c };
  }

  function adjacencyScore(grid, m, r0, c0) {
    const size = BlockEngine.shapeSize(m);
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let n = 0;
    for (let r = 0; r < size.h; r++) {
      for (let c = 0; c < size.w; c++) {
        if (!m[r][c]) continue;
        for (let d = 0; d < dirs.length; d++) {
          const rr = r0 + r + dirs[d][0], cc = c0 + c + dirs[d][1];
          if (rr < 0 || cc < 0 || rr >= CONFIG.GRID || cc >= CONFIG.GRID) n += 0.5;
          else if (grid[rr][cc]) n += 1;
        }
      }
    }
    return n;
  }

  // Подгонка: прижимаем к краям и ищем ближайшее валидное место (в т.ч. вплотную к блокам)
  function resolvePlacement(cell, m, grabR, grabC) {
    const size = BlockEngine.shapeSize(m);
    const N = CONFIG.GRID;
    let r0 = Math.max(0, Math.min(N - size.h, cell.r - grabR));
    let c0 = Math.max(0, Math.min(N - size.w, cell.c - grabC));
    if (BlockEngine.canPlace(game.grid, m, r0, c0)) return { r0: r0, c0: c0, ok: true };

    let best = null;
    const R = 2;
    for (let dr = -R; dr <= R; dr++) {
      for (let dc = -R; dc <= R; dc++) {
        const rr = r0 + dr, cc = c0 + dc;
        if (rr < 0 || cc < 0 || rr + size.h > N || cc + size.w > N) continue;
        if (!BlockEngine.canPlace(game.grid, m, rr, cc)) continue;
        const dist = Math.abs(dr) + Math.abs(dc);
        const edge = (rr === 0 || rr + size.h === N || cc === 0 || cc + size.w === N) ? 0.35 : 0;
        const adj = adjacencyScore(game.grid, m, rr, cc);
        const score = dist - edge - adj * 0.18;
        if (!best || score < best.score) best = { r0: rr, c0: cc, ok: true, score: score };
      }
    }
    return best ? { r0: best.r0, c0: best.c0, ok: true } : { r0: r0, c0: c0, ok: false };
  }

  function clearPreview() {
    $$('#board .cell.preview-ok, #board .cell.preview-bad').forEach(function (el) {
      el.classList.remove('preview-ok', 'preview-bad');
    });
  }
  function previewPlacement(r0, c0, m, ok) {
    const size = BlockEngine.shapeSize(m);
    for (let r = 0; r < size.h; r++) {
      for (let c = 0; c < size.w; c++) {
        if (!m[r][c]) continue;
        const el = cellEl(r0 + r, c0 + c);
        if (el) el.classList.add(ok ? 'preview-ok' : 'preview-bad');
      }
    }
  }

  /* ---- drag & drop ---- */
  function positionGhost(x, y) {
    if (!drag) return;
    const gap = 3;
    const ox = drag.grabC * (drag.gpc + gap) + drag.gpc / 2;
    const oy = drag.grabR * (drag.gpc + gap) + drag.gpc / 2;
    drag.ghost.style.left = (x - ox) + 'px';
    drag.ghost.style.top = (y - oy) + 'px';
  }

  function onPiecePointerDown(e) {
    if (!game) return;
    // хватаем за всю ячейку лотка, а не только за сами блоки
    const slot = e.target.closest('.pieceslot');
    if (!slot || slot.classList.contains('used')) return;
    const idx = Number(slot.dataset.idx);
    const piece = game.tray[idx];
    if (!piece) return;

    e.preventDefault();
    SFX.pickup();
    const size = BlockEngine.shapeSize(piece.m);
    const gpc = ghostCellPx(Math.max(size.h, size.w));

    const pieceEl = slot.querySelector('.piece') || slot;
    const rect = pieceEl.getBoundingClientRect();
    let fx = (e.clientX - rect.left) / rect.width;
    let fy = (e.clientY - rect.top) / rect.height;
    fx = Math.max(0, Math.min(0.999, fx));
    fy = Math.max(0, Math.min(0.999, fy));
    const grabC = Math.min(size.w - 1, Math.floor(fx * size.w));
    const grabR = Math.min(size.h - 1, Math.floor(fy * size.h));

    const ghost = makePieceEl(piece.m, gpc, true, piece.color);
    document.body.appendChild(ghost);
    document.body.classList.add('dragging');

    drag = { idx: idx, m: piece.m, ghost: ghost, gpc: gpc, grabR: grabR, grabC: grabC, target: null };
    positionGhost(e.clientX, e.clientY);

    window.addEventListener('pointermove', onDragMove, { passive: false });
    window.addEventListener('pointerup', onDragUp);
    window.addEventListener('pointercancel', onDragUp);
  }

  function onDragMove(e) {
    if (!drag) return;
    e.preventDefault();
    positionGhost(e.clientX, e.clientY);

    clearPreview();
    const cell = pointToCell(e.clientX, e.clientY);
    if (!cell) { drag.target = null; return; }
    const res = resolvePlacement(cell, drag.m, drag.grabR, drag.grabC);
    drag.target = { r0: res.r0, c0: res.c0, ok: res.ok };
    previewPlacement(res.r0, res.c0, drag.m, res.ok);
  }

  function onDragUp() {
    if (!drag) return;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointercancel', onDragUp);
    const g = drag.ghost;
    if (g) g.remove();
    clearPreview();
    const target = drag.target;
    const idx = drag.idx;
    drag = null;
    document.body.classList.remove('dragging');
    if (target && target.ok) doPlace(idx, target.r0, target.c0);
    else if (target) SFX.invalid();
  }

  function comboFx(comboCount) {
    const tier = Math.min(comboCount, 10); // 11 и 12 используют эффект 10-го уровня
    const layer = document.getElementById('fx-layer');
    if (!layer) return;
    layer.innerHTML = '';
    const board = boardEl();
    const wrap = document.querySelector('.board-wrap');

    if (board) { board.classList.remove('flash'); void board.offsetWidth; board.classList.add('flash'); }
    if (wrap) {
      wrap.classList.remove('shake'); void wrap.offsetWidth;
      wrap.style.setProperty('--shake', (tier * 0.6 + 1) + 'px');
      wrap.classList.add('shake');
    }

    const palette = tier >= 7
      ? ['#ff2e88', '#ffd166', '#39d98a', '#3b9dff', '#b06bff', '#00ffbf']
      : tier >= 4 ? ['#5b8cff', '#b06bff', '#4cd6ff'] : ['#5b8cff'];

    const pop = document.createElement('div');
    pop.className = 'combo-pop t' + tier;
    pop.textContent = 'КОМБО ×' + comboCount;
    layer.appendChild(pop);

    if (tier >= 5) {
      const ring = document.createElement('div');
      ring.className = 'combo-ring';
      ring.style.borderColor = palette[palette.length - 1];
      layer.appendChild(ring);
    }

    const count = Math.min(60, 6 + tier * 5);
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.className = 'fx-particle';
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * (60 + tier * 14);
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      p.style.setProperty('--pc', palette[Math.floor(Math.random() * palette.length)]);
      p.style.setProperty('--ps', (3 + Math.random() * 5).toFixed(1) + 'px');
      p.style.setProperty('--pd', (0.5 + Math.random() * 0.5).toFixed(2) + 's');
      layer.appendChild(p);
    }

    clearTimeout(comboFx._t);
    comboFx._t = setTimeout(function () { layer.innerHTML = ''; }, 950);
    if (wrap) setTimeout(function () { wrap.classList.remove('shake'); }, 400);
    if (board) setTimeout(function () { board.classList.remove('flash'); }, 400);
  }

  function floatText(r, c, text, color) {
    const wrap = document.querySelector('.board-wrap');
    const el = cellEl(r, c);
    if (!wrap || !el) return;
    const er = el.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'float-text';
    d.textContent = text;
    d.style.left = (er.left - wr.left + er.width / 2) + 'px';
    d.style.top = (er.top - wr.top + er.height / 2) + 'px';
    if (color) d.style.color = color;
    wrap.appendChild(d);
    setTimeout(function () { d.remove(); }, 720);
  }

  function doPlace(idx, r0, c0) {
    const piece = game.tray[idx];
    const placedCells = piece ? BlockEngine.shapeCells(piece.m).map(function (p) { return [r0 + p[0], c0 + p[1]]; }) : [];
    const pieceColor = piece ? piece.color : '#8fb6ff';

    const res = BlockEngine.place(game, idx, r0, c0);
    if (!res.ok) { renderTray(); return; }
    renderBoard();
    renderTray();
    updateGameHud();

    // Анимация постановки + всплывающие очки
    placedCells.forEach(function (p) {
      if (!game.grid[p[0]][p[1]]) return; // клетку уже убрало линией
      const el = cellEl(p[0], p[1]);
      if (el) {
        el.classList.add('placed');
        (function (node) { setTimeout(function () { node.classList.remove('placed'); }, 420); })(el);
      }
    });
    if (placedCells.length) {
      floatText(placedCells[0][0], placedCells[0][1], '+' + res.pointsGained, pieceColor);
    }

    // Микро-отдача от постановки
    const wrap = document.querySelector('.board-wrap');
    if (wrap) {
      wrap.classList.remove('shake'); void wrap.offsetWidth;
      wrap.style.setProperty('--shake', '1px');
      wrap.classList.add('shake');
      setTimeout(function () { wrap.classList.remove('shake'); }, 220);
    }

    if (res.lines > 0) {
      SFX.line(res.combo);
      toast('Комбо ×' + res.combo, 'good');
      comboFx(res.combo);
    } else {
      SFX.place();
    }

    // Карточки копятся за забег и открываются ПОСЛЕ игры
    if (res.newCards && res.newCards.length) {
      SFX.card();
      Store.addCards(profile, res.newCards);
      res.newCards.forEach(function (c) { runCards.push(c); });
      save();
      toast('Карточка! +' + res.newCards.length + ' · откроется после игры', 'good');
    }

    if (res.gameOver) setTimeout(endGame, 400);
  }

  function flashHint(h) {
    const size = BlockEngine.shapeSize(h.m);
    for (let r = 0; r < size.h; r++) {
      for (let c = 0; c < size.w; c++) {
        if (!h.m[r][c]) continue;
        const el = cellEl(h.r0 + r, h.c0 + c);
        if (el) {
          el.classList.add('hint');
          setTimeout(function () { el.classList.remove('hint'); }, 1200);
        }
      }
    }
  }

  /* ---- карточки ---- */
  function queueCards(cards) {
    revealQueue = revealQueue.concat(cards);
    if (!revealOpen) nextReveal();
  }
  function nextReveal() {
    if (!revealQueue.length) { revealOpen = false; return; }
    revealOpen = true;
    const card = revealQueue.shift();
    Store.addCards(profile, [card]);
    save();
    showCardReveal(card, function () {
      closeModal();
      setTimeout(nextReveal, 160);
    });
  }

  function revealRunCards(cards, onDone) {
    let i = 0;
    function step() {
      if (i >= cards.length) { onDone && onDone(); return; }
      const card = cards[i++];
      showCardReveal(card, function () { closeModal(); setTimeout(step, 150); });
    }
    step();
  }

  function sparksHTML(n, color) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = (5 + Math.random() * 90).toFixed(1);
      const y = (5 + Math.random() * 90).toFixed(1);
      const d = (Math.random() * 2.4).toFixed(2);
      const sz = (2 + Math.random() * 4).toFixed(1);
      s += '<i class="spark" style="--sx:' + x + '%;--sy:' + y + '%;--sd:' + d + 's;--ss:' + sz + 'px;--sc:' + color + '"></i>';
    }
    return s;
  }

  function cardHTML(card) {
    const rar = rarityById(card.rarity);
    const ch = brainrotById(card.charId);
    const buffs = (card.buffs || []).map(buffById).filter(Boolean);
    const bg = 'linear-gradient(180deg,' + hexA(rar.color, 0.22) + ',' + hexA(rar.color, 0.04) + ')';
    let fxClass = '';
    let fxColor = rar.color;
    if (buffs.length) {
      const f = BUFF_FX[buffs[0].id] || { c: rar.color, fx: 'pulse' };
      fxClass = ' has-fx fx-' + f.fx;
      fxColor = f.c;
    }
    const col = ch && ch.tag && COLLECTIONS[ch.tag] ? COLLECTIONS[ch.tag] : null;
    const colBadge = col ? '<span class="col-badge" style="background:' + col.color + '">' + col.short + '</span>' : '';
    const fxLayer = (buffs.length ? '<div class="card-fx"></div>' + sparksHTML(6, fxColor) : '') + colBadge;
    const chips = buffs.map(function (b) {
      const f = BUFF_FX[b.id] || { c: '#cfe0ff' };
      return '<span class="buffchip" style="background:' + hexA(f.c, 0.22) + ';border-color:' + hexA(f.c, 0.7) + ';color:#fff">' + b.name + '</span>';
    }).join('');
    const colClass = col ? ' has-col' : '';
    return '<div class="card' + fxClass + colClass + '" style="--rc:' + rar.color + ';--fx:' + fxColor + ';--col:' + (col ? col.color : 'transparent') + ';background:' + bg + '">' +
      fxLayer +
      '<div class="card-rarity">' + rar.name + '</div>' +
      '<div class="card-emoji">' + (ch ? ch.emoji : '❓') + '</div>' +
      '<div class="card-name">' + escapeHtml(ch ? ch.name : '???') + '</div>' +
      '<div class="card-buffs">' + chips + '</div>' +
      '<div class="card-rap">RAP ' + fmt(card.rap) + '</div>' +
      '</div>';
  }

  function dropFxHTML(card) {
    const rar = rarityById(card.rarity);
    const tier = rar.order;
    let parts = '';
    const pcount = Math.min(70, 8 + tier * 12);
    for (let i = 0; i < pcount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * (120 + tier * 45);
      const sz = (3 + Math.random() * 6).toFixed(1);
      const d = (0.6 + Math.random() * 0.6).toFixed(2);
      parts += '<i class="dp" style="--dx:' + Math.cos(ang) * dist + 'px;--dy:' + Math.sin(ang) * dist + 'px;--s:' + sz + 'px;--d:' + d + 's;--c:' + rar.color + '"></i>';
    }
    let rings = '';
    const rn = Math.min(3, 1 + Math.floor(tier / 2));
    for (let i = 0; i < rn; i++) rings += '<span class="dr" style="--dd:' + (i * 0.12) + 's;--c:' + rar.color + '"></span>';
    let themed = '';
    if (card.buffs && card.buffs.length) {
      const f = BUFF_FX[card.buffs[0].id] || { fx: 'pulse', c: rar.color };
      themed = '<div class="drop-theme fx-' + f.fx + '" style="--fx:' + f.c + '"></div>';
    }
    return '<div class="drop-flash" style="--c:' + rar.color + '"></div>' + themed + rings + parts;
  }

  function showCardReveal(card, onClose, opts) {
    opts = opts || {};
    const ch = brainrotById(card.charId);
    const rar = rarityById(card.rarity);
    const buffs = (card.buffs || []).map(buffById).filter(Boolean);
    const isBig = rar.order >= 4;
    const fx = opts.celebrate ? '<div class="reveal-fx tier-' + rar.order + '">' + dropFxHTML(card) + '</div>' : '';
    const sellBtn = opts.sell ? '<button class="btn btn-ghost btn-block" id="reveal-sell">Продать за ' + fmt(sellPrice(card)) + ' 🪙</button>' : '';
    openModal(
      '<div class="reveal' + (opts.celebrate ? ' celebrating' : '') + '">' +
        fx +
        '<div class="reveal-label">' + (isBig ? 'Невероятная удача!' : 'Новая карточка!') + '</div>' +
        '<div class="reveal-odds">' + rar.name + ' · шанс 1 / ' + fmt(oddsOf(rar)) + '</div>' +
        '<div class="pop">' + cardHTML(card) + '</div>' +
        '<div class="reveal-desc">' + escapeHtml(ch ? ch.desc : '') + '</div>' +
        (buffs.length
          ? '<div class="reveal-buffs">' + buffs.map(function (b) {
              return '<div class="buffline"><b>' + b.name + '</b> ×' + b.rapMult + ' — ' + escapeHtml(b.desc) + '</div>';
            }).join('') + '</div>'
          : '') +
        '<button class="btn btn-primary btn-block" id="reveal-ok">Забрать</button>' +
        sellBtn +
      '</div>',
      { cls: 'reveal-modal' }
    );
    const root = $('#modal-root');
    if (opts.celebrate) SFX.rarity(rar.order);
    root.querySelector('#reveal-ok').onclick = function () { onClose && onClose(); };
    const sellEl = root.querySelector('#reveal-sell');
    if (sellEl) sellEl.onclick = function () {
      sellCard(card.uid);
      closeModal();
      refreshActive();
    };
  }

  function makeCardOfRarity(rarityId) {
    const rar = rarityById(rarityId);
    const pool = normalBrainrotsByRarity(rarityId);
    const ch = pool.length ? pool[Math.floor(Math.random() * pool.length)] : normalBrainrotsByRarity('common')[0];
    const buffs = [];
    if (Math.random() < CONFIG.BUFF_CHANCE) {
      buffs.push(BUFFS[Math.floor(Math.random() * BUFFS.length)].id);
      while (buffs.length < CONFIG.MAX_BUFFS && Math.random() < CONFIG.BUFF_STACK_CHANCE) {
        const b = BUFFS[Math.floor(Math.random() * BUFFS.length)];
        if (!buffs.includes(b.id)) buffs.push(b.id); else break;
      }
    }
    const mult = buffs.reduce(function (m, id) { return m * (buffById(id) ? buffById(id).rapMult : 1); }, 1);
    return {
      uid: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      charId: ch.id, rarity: rarityId, buffs: buffs, up: 0,
      rap: Math.round(rar.rap * mult), ts: Date.now()
    };
  }

  function makeCardFromChar(rar, ch) {
    const buffs = [];
    if (Math.random() < CONFIG.BUFF_CHANCE) {
      buffs.push(BUFFS[Math.floor(Math.random() * BUFFS.length)].id);
      while (buffs.length < CONFIG.MAX_BUFFS && Math.random() < CONFIG.BUFF_STACK_CHANCE) {
        const b = BUFFS[Math.floor(Math.random() * BUFFS.length)];
        if (!buffs.includes(b.id)) buffs.push(b.id); else break;
      }
    }
    const mult = buffs.reduce(function (m, id) { return m * (buffById(id) ? buffById(id).rapMult : 1); }, 1);
    return {
      uid: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      charId: ch.id, rarity: rar.id, buffs: buffs, up: 0,
      rap: Math.round(rar.rap * mult), ts: Date.now()
    };
  }

  function makeCardFromRates(rates) {
    const r = Math.random();
    let acc = 0, chosen = 'common';
    for (const id in rates) { acc += rates[id]; if (r < acc) { chosen = id; break; } }
    return makeCardOfRarity(chosen);
  }

  /* ---------------- КЕЙСЫ ---------------- */
  function renderCases() {
    const coinsEl = $('#cases-coins'); if (coinsEl) coinsEl.textContent = fmt(profile.coins);
    const list = $('#cases-list'); if (!list) return;
    list.innerHTML = CASES.map(function (cs) {
      const canBuy = profile.coins >= cs.price;
      return '<button class="case-tile' + (canBuy ? '' : ' off') + '" data-open="' + cs.id + '" style="--cc:' + cs.color + '">' +
        '<span class="ct-icon">' + cs.icon + '</span>' +
        '<span class="ct-name">' + cs.name + '</span>' +
        '<span class="ct-price">🪙 ' + fmt(cs.price) + '</span>' +
        '</button>';
    }).join('');
    $$('#cases-list .case-tile').forEach(function (b) {
      b.onclick = function () { openCaseModal(b.dataset.open); };
    });
  }

  function openCaseModal(id) {
    const cs = CASES.find(function (c) { return c.id === id; });
    if (!cs) return;
    const odds = Object.keys(cs.rates).map(function (rid) {
      const r = rarityById(rid);
      return '<div class="odd-row"><i style="background:' + r.color + '"></i><span>' + r.short + '</span><b>' + Math.round(cs.rates[rid] * 100) + '%</b></div>';
    }).join('');
    const sp = cs.special > 0 ? '<div class="odd-row special"><i style="background:#39d98a"></i><span>Особые</span><b>' + Math.round(cs.special * 100) + '%</b></div>' : '';
    const missRow = cs.miss > 0 ? '<div class="odd-row miss"><i style="background:#ff3b4d"></i><span>Пусто (без карточки)</span><b>' + Math.round(cs.miss * 100) + '%</b></div>' : '';
    const canBuy = profile.coins >= cs.price;
    openModal(
      '<div class="case-modal">' +
        '<div class="cm-head"><span class="cm-icon">' + cs.icon + '</span><h3>' + cs.name + ' кейс</h3></div>' +
        '<div class="cm-odds">' + missRow + odds + sp + '</div>' +
        '<button class="btn btn-primary btn-block" id="case-open">Открыть за ' + fmt(cs.price) + ' 🪙</button>' +
        '<button class="btn btn-ghost btn-block" id="case-cancel">Отмена</button>' +
      '</div>',
      { cls: 'case-modal-wrap' }
    );
    const root = $('#modal-root');
    root.querySelector('#case-cancel').onclick = closeModal;
    const ob = root.querySelector('#case-open');
    if (ob) ob.onclick = function () { closeModal(); openCase(id); };
  }

  function showMissPop(onDone) {
    SFX.invalid();
    const layer = document.createElement('div');
    layer.className = 'miss-layer';
    layer.innerHTML = '<div class="miss-pop"><span class="miss-x">✖</span><span class="miss-txt">Пусто</span></div>';
    document.body.appendChild(layer);
    setTimeout(function () { layer.remove(); onDone && onDone(); }, 1000);
  }

  function playCaseReel(cs, wonCard, onDone) {
    const N = 52, winIndex = 46;
    let strip = '';
    for (let i = 0; i < N; i++) {
      if (i === winIndex && !wonCard) {
        strip += '<div class="reel-item empty"><span class="ri-emoji">✖</span><span class="ri-rap">пусто</span></div>';
        continue;
      }
      const card = (i === winIndex) ? wonCard : makeCardFromRates(cs.rates);
      const rar = rarityById(card.rarity);
      const ch = brainrotById(card.charId);
      const dispRap = (i === winIndex) ? card.rap : Math.round(card.rap * (cs.rapMult || 1));
      strip += '<div class="reel-item' + (i === winIndex ? ' win' : '') + '" style="--rc:' + rar.color + '">' +
        '<span class="ri-emoji">' + (ch ? ch.emoji : '❓') + '</span>' +
        '<span class="ri-rap">' + fmt(dispRap) + '</span></div>';
    }
    openModal(
      '<div class="reel"><div class="reel-marker"></div><div class="reel-track" id="reel-track">' + strip + '</div></div>',
      { cls: 'reel-modal' }
    );
    const track = document.getElementById('reel-track');
    if (track) {
      requestAnimationFrame(function () {
        const first = track.children[0];
        const itemW = first ? first.offsetWidth : 72;
        const step = itemW + 10;
        const wrapW = track.parentElement.offsetWidth;
        const jitter = (Math.random() * 0.5 - 0.25) * itemW;
        const target = winIndex * step + itemW / 2 - wrapW / 2 + jitter;
        track.style.transition = 'transform 3.4s cubic-bezier(.12,.85,.25,1)';
        track.style.transform = 'translateX(' + (-target) + 'px)';
      });
    }
    let ticks = 0;
    const tickIv = setInterval(function () { SFX.tick(); if (++ticks > 16) clearInterval(tickIv); }, 170);
    setTimeout(function () { clearInterval(tickIv); }, 3200);
    setTimeout(function () {
      closeModal();
      setTimeout(function () {
        if (!wonCard) showMissPop(onDone);
        else if (onDone) onDone();
      }, 260);
    }, 3650);
  }

  function celebrateDrop(card) {
    const rar = rarityById(card.rarity);
    const tier = rar.order; // 0..5 — чем выше, тем «круче» эффект
    const layer = document.createElement('div');
    layer.className = 'drop-fx tier-' + tier;
    let parts = '';
    const pcount = Math.min(70, 8 + tier * 12);
    for (let i = 0; i < pcount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * (120 + tier * 45);
      const sz = (3 + Math.random() * 6).toFixed(1);
      const d = (0.6 + Math.random() * 0.6).toFixed(2);
      parts += '<i class="dp" style="--dx:' + Math.cos(ang) * dist + 'px;--dy:' + Math.sin(ang) * dist + 'px;--s:' + sz + 'px;--d:' + d + 's;--c:' + rar.color + '"></i>';
    }
    let rings = '';
    const rn = Math.min(3, 1 + Math.floor(tier / 2));
    for (let i = 0; i < rn; i++) rings += '<span class="dr" style="--dd:' + (i * 0.12) + 's;--c:' + rar.color + '"></span>';
    let themed = '';
    if (card.buffs && card.buffs.length) {
      const f = BUFF_FX[card.buffs[0].id] || { fx: 'pulse', c: rar.color };
      themed = '<div class="drop-theme fx-' + f.fx + '" style="--fx:' + f.c + '"></div>';
    }
    layer.innerHTML = '<div class="drop-flash" style="--c:' + rar.color + '"></div>' + themed + rings + parts;
    document.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 1500 + tier * 150);
  }

  function openCase(id) {
    const cs = CASES.find(function (c) { return c.id === id; });
    if (!cs) return;
    if (profile.coins < cs.price) { offerAdCoins(); return; }
    profile.coins -= cs.price;
    save();
    if (cs.miss && Math.random() < cs.miss) {
      renderCases();
      playCaseReel(cs, null, function () {});
      return;
    }
    let card;
    if (cs.special > 0 && Math.random() < cs.special) {
      const ids = Object.keys(COLLECTIONS);
      let total = 0; ids.forEach(function (k) { total += COLLECTIONS[k].chance; });
      let r = Math.random() * total, acc = 0, chosen = ids[0];
      for (let i = 0; i < ids.length; i++) { acc += COLLECTIONS[ids[i]].chance; if (r < acc) { chosen = ids[i]; break; } }
      const pool = brainrotsByTag(chosen);
      const ch = pool[Math.floor(Math.random() * pool.length)];
      card = makeCardFromChar(rarityById(ch.rarity), ch);
    } else {
      card = makeCardFromRates(cs.rates);
    }
    if (cs.rapMult) card.rap = Math.round(card.rap * cs.rapMult);
    Store.addCards(profile, [card]);
    save();
    updateBadge();
    renderCases();
    beep(880, 0.18);
    playCaseReel(cs, card, function () {
      showCardReveal(card, closeModal, { celebrate: true, sell: true });
    });
  }

  /* ---------------- АПГРЕЙД ПО RAP (честный рандом) ---------------- */
  function buffMult(card) { return (card.buffs || []).reduce(function (m, id) { return m * (buffById(id) ? buffById(id).rapMult : 1); }, 1); }
  function recomputeRap(card) {
    const rar = rarityById(card.rarity);
    card.rap = Math.round(rar.rap * buffMult(card) * (1 + (card.up || 0) * UPGRADE.rapStep));
    return card.rap;
  }
  function upgradeCost(card) { const base = UPGRADE.baseCost[card.rarity] || 150; return Math.round(base * (1 + (card.up || 0) * UPGRADE.costStep)); }
  function upgradeChance(card) { return Math.max(UPGRADE.minChance, UPGRADE.baseChance * Math.pow(UPGRADE.chanceDecay, card.up || 0)); }

  function doUpgrade(uid) {
    const card = profile.cards.find(function (c) { return c.uid === uid; });
    if (!card) return;
    if ((card.up || 0) >= UPGRADE.maxLevel) { toast('Максимальный уровень'); return; }
    const cost = upgradeCost(card);
    if (profile.coins < cost) { offerAdCoins(); return; }
    profile.coins -= cost;
    const chance = upgradeChance(card);
    if (Math.random() < chance) {
      card.up = (card.up || 0) + 1;
      recomputeRap(card);
      save();
      beep(820, 0.16);
      toast('Успех! RAP ' + fmt(card.rap), 'good');
    } else {
      save();
      beep(240, 0.16, 'sawtooth');
      toast('Неудача — попробуйте ещё');
    }
    const colScreen = document.getElementById('screen-collection');
    if (colScreen && colScreen.classList.contains('active')) renderCollection();
    openCardDetail(uid);
  }

  /* ---------------- КОЛЕСО АПГРЕЙДОВ (ставка картой → шанс) ---------------- */
  let spinning = false;
  let upStakeUid = null;
  let upChance = null;
  const UP_CHANCES = [0.75, 0.55, 0.35, 0.15];

  function nearestRarity(rap) {
    let best = RARITIES[0], bd = Infinity;
    RARITIES.forEach(function (r) { const d = Math.abs(r.rap - rap); if (d < bd) { bd = d; best = r; } });
    return best;
  }
  function effectiveStake(stake) { return stake ? Math.min(stake.rap, UPGRADE.maxStake) : 0; }
  function targetRapFor(stake, chance) { const s = effectiveStake(stake); return s ? Math.min(UPGRADE.rapCap, Math.round(s / chance)) : 0; }
  function chanceColor(chance) { return 'hsl(' + Math.round(120 * Math.pow(chance, 0.6)) + ',85%,55%)'; }

  function renderUpgrades() {
    const countEl = $('#up-count'); if (countEl) countEl.textContent = profile.cards.length;
    const stake = profile.cards.find(function (c) { return c.uid === upStakeUid; });

    const slot = $('#up-stake-slot');
    if (slot) {
      if (stake) {
        const ch = brainrotById(stake.charId);
        const rar = rarityById(stake.rarity);
        slot.className = 'up-stake-slot filled';
        slot.style.setProperty('--rc', rar.color);
        const capNote = stake.rap > UPGRADE.maxStake ? ' · ставка макс ' + fmt(UPGRADE.maxStake) : '';
        slot.innerHTML = '<span class="uss-emoji">' + (ch ? ch.emoji : '❓') + '</span>' +
          '<span class="uss-info"><b>' + escapeHtml(ch ? ch.name : '') + '</b><small>' + rar.short + ' · ' + fmt(stake.rap) + ' RAP' + capNote + '</small></span>' +
          '<span class="uss-change">Заменить</span>';
      } else {
        slot.className = 'up-stake-slot';
        slot.style.removeProperty('--rc');
        slot.innerHTML = '<span class="uss-emoji">➕</span><span class="uss-info"><b>Выбрать карточку</b><small>из инвентаря</small></span>';
      }
      slot.onclick = function () { openCardPicker(); };
    }

    const tiles = $('#up-tiles');
    if (tiles) {
      tiles.innerHTML = UP_CHANCES.map(function (c) {
        const col = chanceColor(c);
        const sel = (upChance === c) ? ' sel' : '';
        let target = '—';
        if (stake) {
          const raw = effectiveStake(stake) / c;
          const capped = Math.min(UPGRADE.rapCap, Math.round(raw));
          target = fmt(capped) + ' RAP' + (raw > UPGRADE.rapCap ? ' · макс' : '');
        }
        return '<button class="tile' + sel + '" data-chance="' + c + '" style="--tcl:' + col + '"' + (stake ? '' : ' disabled') + '>' +
          '<b class="tile-chance">' + Math.round(c * 100) + '%</b>' +
          '<small class="tile-target">' + target + '</small></button>';
      }).join('');
      $$('#up-tiles .tile').forEach(function (b) {
        b.onclick = function () { upChance = Number(b.dataset.chance); renderUpgrades(); };
      });
    }

    updateWheelView(stake);
    const spin = $('#btn-spin');
    if (spin) {
      const ready = stake && upChance;
      spin.disabled = !ready || spinning;
      spin.textContent = ready ? ('Крутить · шанс ' + Math.round(upChance * 100) + '%') : 'Крутить';
    }
  }

  function updateWheelView(stake) {
    const disc = $('#wheel-disc'); if (!disc) return;
    const chance = (stake && upChance) ? upChance : 0.5;
    const deg = chance * 360;
    disc.style.background = 'conic-gradient(from 0deg, ' + chanceColor(chance) + ' 0deg ' + deg + 'deg, #3a1420 ' + deg + 'deg 360deg)';
    const c = $('#wheel-chance'); if (c) c.textContent = Math.round(chance * 100) + '%';
    const arrow = $('#wheel-arrow');
    if (arrow && !spinning) arrow.style.transform = 'translateX(-50%) rotate(0deg)';
  }

  function openCardPicker() {
    const cards = profile.cards.slice().sort(function (a, b) { return b.rap - a.rap; });
    openModal(
      '<div class="picker">' +
        '<div class="picker-head"><h3>Выберите карточку</h3><button class="iconbtn" id="picker-close">✕</button></div>' +
        '<div class="picker-grid">' +
          (cards.length ? cards.map(function (c) {
            return '<button class="cardwrap" data-uid="' + c.uid + '">' + cardHTML(c) + '</button>';
          }).join('') : '<div class="empty">Нет карточек</div>') +
        '</div>' +
      '</div>',
      { cls: 'picker-modal' }
    );
    const root = $('#modal-root');
    root.querySelector('#picker-close').onclick = closeModal;
    $$('#modal-root .picker-grid .cardwrap').forEach(function (el) {
      el.onclick = function () { upStakeUid = el.dataset.uid; upChance = null; closeModal(); renderUpgrades(); };
    });
  }

  function doSpin() {
    if (spinning) return;
    const stake = profile.cards.find(function (c) { return c.uid === upStakeUid; });
    if (!stake || !upChance) return;
    const chance = upChance;
    const targetRap = targetRapFor(stake, chance);

    spinning = true;
    SFX.spin();
    const spin = $('#btn-spin'); if (spin) spin.disabled = true;

    const rand = Math.random() * 360;
    const success = rand < chance * 360;
    const arrow = $('#wheel-arrow');
    if (arrow) {
      arrow.style.transition = 'transform 2s cubic-bezier(.15,.9,.2,1)';
      arrow.style.transform = 'translateX(-50%) rotate(' + (360 * 4 + rand) + 'deg)';
    }

    setTimeout(function () {
      if (arrow) { arrow.style.transition = 'none'; arrow.style.transform = 'translateX(-50%) rotate(' + rand + 'deg)'; }
      const idx = profile.cards.findIndex(function (c) { return c.uid === stake.uid; });
      if (idx >= 0) profile.cards.splice(idx, 1);

      if (success && idx >= 0) {
        // особый эффект: с шансом карточка получает баффы (каждый добавляет ценность)
        const special = Math.random() < UPGRADE.specialChance;
        const buffs = [];
        if (special) {
          buffs.push(BUFFS[Math.floor(Math.random() * BUFFS.length)].id);
          while (buffs.length < CONFIG.MAX_BUFFS && Math.random() < UPGRADE.specialStackChance) {
            const b = BUFFS[Math.floor(Math.random() * BUFFS.length)];
            if (!buffs.includes(b.id)) buffs.push(b.id); else break;
          }
        }
        const mult = buffs.reduce(function (m, id) { return m * (buffById(id) ? buffById(id).rapMult : 1); }, 1);
        const finalRap = Math.round(targetRap * mult);
        const rar = nearestRarity(finalRap);
        const pool = normalBrainrotsByRarity(rar.id);
        const ch = pool[Math.floor(Math.random() * pool.length)];
        const won = {
          uid: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          charId: ch.id, rarity: rar.id, buffs: buffs, up: 0,
          rap: finalRap, ts: Date.now()
        };
profile.cards.push(won);
        save();
        SFX.rarity(rar.order);
        toast(special
          ? ('Победа! Особый эффект ×' + buffs.length + ' · +' + fmt(finalRap) + ' RAP')
          : ('Победа! +' + fmt(finalRap) + ' RAP'), 'good');
        upStakeUid = null; upChance = null;
        spinning = false;
        renderUpgrades();
        showCardReveal(won, closeModal, { celebrate: true, sell: true });
      } else {
        save();
        beep(220, 0.18, 'sawtooth');
        toast('Не повезло — карточка сгорела');
        upStakeUid = null; upChance = null;
        spinning = false;
        renderUpgrades();
      }
      const colScreen = document.getElementById('screen-collection');
      if (colScreen && colScreen.classList.contains('active')) renderCollection();
    }, 2100);
  }

  /* ---- конец игры ---- */
  function finalizeRun() {
    if (runFinalized || !game) return;
    runFinalized = true;
    Store.recordRun(profile, { score: game.score, cards: game.cardsEarned });
    profile.stats.bestCombo = Math.max(profile.stats.bestCombo, game.bestCombo);
    save();
  }

  function endGame() {
    if (endShown) return;
    endShown = true;
    SFX.over();
    const isRecord = game.score > profile.stats.bestScore && game.score > 0;
    const pending = runCards.slice(runCardsRevealed);
    if (pending.length) {
      // сначала автоматически показываем карточки по очереди, потом меню
      revealRunCards(pending, function () {
        runCardsRevealed = runCards.length;
        showGameOver(isRecord);
      });
    } else {
      showGameOver(isRecord);
    }
  }

  function showGameOver(isRecord) {
    const revCosts = [250, 500, 1000];
    const canRevive = (game.revives || 0) < revCosts.length;
    const revCost = canRevive ? revCosts[game.revives || 0] : 0;
    const revBtn = canRevive
      ? '<button class="btn btn-primary btn-block" id="go-revive">♻️ Продолжить за ' + fmt(revCost) + ' 🪙</button>'
      : '';
    openModal(
      '<div class="gameover">' +
        '<div class="go-emoji">' + (isRecord ? '🏆' : '💀') + '</div>' +
        '<h3>' + (isRecord ? 'Новый рекорд!' : 'Игра окончена') + '</h3>' +
        '<div class="go-stats">' +
          '<div><span>Очки</span><b>' + fmt(game.score) + '</b></div>' +
          '<div><span>Карточки</span><b>' + runCards.length + '</b></div>' +
          '<div><span>Макс. комбо</span><b>×' + game.bestCombo + '</b></div>' +
        '</div>' +
        revBtn +
        '<button class="btn btn-ghost btn-block" id="go-revive-ad">▶ Возродиться за рекламу</button>' +
        '<button class="btn ' + (canRevive ? 'btn-ghost' : 'btn-primary') + ' btn-block" id="go-again">Играть снова</button>' +
        '<button class="btn btn-ghost btn-block" id="go-home">Домой</button>' +
      '</div>',
      { cls: 'go-modal' }
    );
    const root = $('#modal-root');
    if (canRevive) {
      root.querySelector('#go-revive').onclick = function () {
        if (profile.coins < revCost) { offerAdCoins(); return; }
        profile.coins -= revCost;
        save();
        game.revives = (game.revives || 0) + 1;
        BlockEngine.revive(game);
        endShown = false;
        closeModal();
        renderBoard();
        renderTray();
        updateGameHud();
        SFX.rarity(2);
        toast('Продолжаем!', 'good');
      };
    }
    const adRev = root.querySelector('#go-revive-ad');
    if (adRev) adRev.onclick = function () {
      closeModal();
      showRewardedAd(function (ok) {
        if (!ok) { toast('Реклама недоступна'); return; }
        BlockEngine.revive(game);
        endShown = false;
        renderBoard();
        renderTray();
        updateGameHud();
        SFX.rarity(2);
        toast('Продолжаем!', 'good');
      });
    };
    root.querySelector('#go-again').onclick = function () { finalizeRun(); closeModal(); startGame(); };
    root.querySelector('#go-home').onclick = function () { finalizeRun(); closeModal(); show('home'); };
  }

  /* ---------------- COLLECTION ---------------- */
  function renderCollection() {
    $('#col-coins').textContent = fmt(profile.coins);
    const total = profile.cards.length;
    const unique = new Set(profile.cards.map(function (c) { return c.charId; })).size;
    const rap = profile.cards.reduce(function (s, c) { return s + (c.rap || 0); }, 0);

    $('#col-summary').innerHTML =
      '<div class="sum"><b>' + total + '</b><span>карточек</span></div>' +
      '<div class="sum"><b>' + unique + '</b><span>уникальных</span></div>' +
      '<div class="sum"><b>' + fmt(rap) + '</b><span>суммарный RAP</span></div>';

    const collectionChips = Object.keys(COLLECTIONS).map(function (id) {
      const cnt = profile.cards.filter(function (c) {
        const ch = brainrotById(c.charId);
        return ch && ch.tag === id;
      }).length;
      return [id, COLLECTIONS[id].name, cnt];
    });
    const filters = [['all', 'Все', total]].concat(RARITIES.map(function (r) {
      return [r.id, r.name, profile.cards.filter(function (c) { return c.rarity === r.id; }).length];
    })).concat(collectionChips);
    $('#col-filters').innerHTML = filters.map(function (f) {
      return '<button class="chip ' + (colFilter === f[0] ? 'active' : '') + '" data-filter="' + f[0] + '">' +
        f[1] + ' <b>' + f[2] + '</b></button>';
    }).join('');
    $$('#col-filters .chip').forEach(function (b) {
      b.onclick = function () { colFilter = b.dataset.filter; renderCollection(); };
    });

    const legend = $('#rarity-legend');
    if (legend) {
      legend.innerHTML = RARITIES.map(function (r) {
        return '<span class="rleg"><i style="background:' + r.color + '"></i>' + r.short + ' 1/' + fmt(oddsOf(r)) + '</span>';
      }).join('');
    }

    let cards = profile.cards.slice().sort(function (a, b) {
      return (rarityById(b.rarity).order - rarityById(a.rarity).order) || (b.ts - a.ts);
    });
    if (colFilter !== 'all') {
      cards = cards.filter(function (c) {
        if (COLLECTIONS[colFilter]) {
          const ch = brainrotById(c.charId);
          return ch && ch.tag === colFilter;
        }
        return c.rarity === colFilter;
      });
    }

    const grid = $('#cards-grid');
    if (!cards.length) {
      grid.innerHTML = '<div class="empty">Карточек пока нет. Играй и собирай!</div>';
    } else {
      grid.innerHTML = cards.map(function (c) {
        return '<button class="cardwrap" data-uid="' + c.uid + '">' + cardHTML(c) + '</button>';
      }).join('');
      $$('#cards-grid .cardwrap').forEach(function (el) {
        el.onclick = function () { openCardDetail(el.dataset.uid); };
      });
    }
  }

  function countDuplicates() {
    const groups = {};
    profile.cards.forEach(function (c) { groups[c.charId] = (groups[c.charId] || 0) + 1; });
    let n = 0;
    Object.keys(groups).forEach(function (k) { if (groups[k] > 1) n += groups[k] - 1; });
    return n;
  }

  function renderCraft() {
    const rows = [];
    RARITIES.forEach(function (r) {
      const next = RARITIES.find(function (x) { return x.order === r.order + 1; });
      if (!next) return;
      const cnt = profile.cards.filter(function (c) { return c.rarity === r.id && !isSpecial(c); }).length;
      rows.push(
        '<div class="craft-row">' +
          '<div class="craft-info"><span style="color:' + r.color + '">' + r.name + '</span> → <span style="color:' + next.color + '">' + next.name + '</span></div>' +
          '<button class="btn btn-small ' + (cnt >= 3 ? 'btn-primary' : 'btn-disabled') + '" data-craft="' + r.id + '" ' + (cnt < 3 ? 'disabled' : '') + '>3 → 1 (' + cnt + '/3)</button>' +
        '</div>'
      );
    });
    const dups = countDuplicates();
    rows.push(
      '<div class="craft-row">' +
        '<div class="craft-info">Дубликаты: <b>' + dups + '</b></div>' +
        '<button class="btn btn-small" id="btn-sell-dups" ' + (dups ? '' : 'disabled') + '>Продать дубликаты</button>' +
      '</div>'
    );
    $('#craft-panel').innerHTML = '<h3 class="section-title">Крафт и обмен</h3>' +
      '<div class="craft-note">3 карточки одной редкости → 1 выше. Эффекты суммируются; доп. эффекты: 10% → +1, 5% → +2, 2% → +3.</div>' +
      rows.join('');
    $$('#craft-panel [data-craft]').forEach(function (b) {
      b.onclick = function () { craft(b.dataset.craft); };
    });
    const sd = $('#btn-sell-dups');
    if (sd) sd.onclick = sellDuplicates;
  }

  function makeCardWithBuffs(rarityId, buffs) {
    const rar = rarityById(rarityId);
    const pool = normalBrainrotsByRarity(rarityId);
    const ch = pool[Math.floor(Math.random() * pool.length)];
    const mult = buffs.reduce(function (m, id) { return m * (buffById(id) ? buffById(id).rapMult : 1); }, 1);
    return {
      uid: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      charId: ch.id, rarity: rarityId, buffs: buffs.slice(), up: 0,
      rap: Math.round(rar.rap * mult), ts: Date.now()
    };
  }

  function craft(rarityId) {
    const rar = rarityById(rarityId);
    const next = RARITIES.find(function (r) { return r.order === rar.order + 1; });
    if (!next) { toast('Это максимальная редкость'); return; }
    const pool = profile.cards.filter(function (c) { return c.rarity === rarityId && !isSpecial(c); });
    if (pool.length < 3) { toast('Нужно 3 карточки'); return; }
    pool.sort(function (a, b) { return a.rap - b.rap; });
    const consume = pool.slice(0, 3);
    const consumeSet = {};
    consume.forEach(function (c) { consumeSet[c.uid] = true; });
    profile.cards = profile.cards.filter(function (c) { return !consumeSet[c.uid]; });

    // эффекты трёх карточек суммируются
    const buffs = [];
    consume.forEach(function (c) {
      (c.buffs || []).forEach(function (b) { if (!buffs.includes(b)) buffs.push(b); });
    });
    // шанс на дополнительные эффекты: 10% → +1, 5% → +2, 2% → +3
    const roll = Math.random();
    let extra = 0;
    if (roll < 0.02) extra = 3; else if (roll < 0.07) extra = 2; else if (roll < 0.17) extra = 1;
    let guard = 0;
    while (extra > 0 && buffs.length < 6 && guard++ < 30) {
      const b = BUFFS[Math.floor(Math.random() * BUFFS.length)].id;
      if (!buffs.includes(b)) { buffs.push(b); extra--; }
    }

    const card = makeCardWithBuffs(next.id, buffs);
    profile.cards.push(card);
    save();
    SFX.rarity(next.order);
    toast('Крафт: ' + next.name + (buffs.length ? ' · эффектов ' + buffs.length : '') + '!', 'good');
    renderCollection();
    openCardDetail(card.uid, true);
  }

  function sellCard(uid) {
    const idx = profile.cards.findIndex(function (c) { return c.uid === uid; });
    if (idx < 0) return;
    const card = profile.cards[idx];
    const price = sellPrice(card);
    profile.coins += price;
    profile.cards.splice(idx, 1);
    save();
    toast('Продано: +' + fmt(price) + ' 🪙', 'good');
    SFX.coins();
    floatCoins(price);
    renderCollection();
  }

  function sellDuplicates() {
    const groups = {};
    profile.cards.forEach(function (c) { (groups[c.charId] = groups[c.charId] || []).push(c); });
    const remove = {};
    let sold = 0, coins = 0;
    Object.keys(groups).forEach(function (k) {
      const arr = groups[k];
      if (arr.length <= 1) return;
      arr.sort(function (a, b) { return b.rap - a.rap; });
      arr.slice(1).forEach(function (c) { remove[c.uid] = true; sold++; coins += sellPrice(c); });
    });
    if (!sold) { toast('Дубликатов нет'); return; }
    profile.cards = profile.cards.filter(function (c) { return !remove[c.uid]; });
    profile.coins += coins;
    save();
    toast('Продано ' + sold + ' дубликатов: +' + fmt(coins) + ' 🪙', 'good');
    renderCollection();
  }

  function countNonSpecial(rarityId) {
    return profile.cards.filter(function (c) { return c.rarity === rarityId && !isSpecial(c); }).length;
  }

  function renderCraftScreen() {
    const countEl = $('#craft-count'); if (countEl) countEl.textContent = profile.cards.length;
    const rarities = RARITIES.filter(function (r) { return r.order < RARITIES.length - 1; });
    if (!craftRarity || !rarities.some(function (r) { return r.id === craftRarity; })) {
      const withEnough = rarities.find(function (r) { return countNonSpecial(r.id) >= 3; });
      craftRarity = (withEnough || rarities[0]).id;
    }

    const chips = $('#craft-rarities');
    if (chips) {
      chips.innerHTML = rarities.map(function (r) {
        return '<button class="chip ' + (craftRarity === r.id ? 'active' : '') + '" data-crar="' + r.id + '">' + r.name + ' <b>' + countNonSpecial(r.id) + '</b></button>';
      }).join('');
      $$('#craft-rarities .chip').forEach(function (b) {
        b.onclick = function () { craftRarity = b.dataset.crar; craftSel = []; renderCraftScreen(); };
      });
    }

    const pool = profile.cards.filter(function (c) { return c.rarity === craftRarity && !isSpecial(c); }).sort(function (a, b) { return a.rap - b.rap; });
    const grid = $('#craft-grid');
    if (grid) {
      grid.innerHTML = pool.length
        ? pool.map(function (c) {
            const sel = craftSel.indexOf(c.uid) >= 0 ? ' sel' : '';
            const ch = brainrotById(c.charId);
            const rar = rarityById(c.rarity);
            const bn = (c.buffs || []).length;
            return '<button class="ctile' + sel + '" data-uid="' + c.uid + '" style="--rc:' + rar.color + '">' +
              '<span class="ctile-emoji">' + (ch ? ch.emoji : '❓') + '</span>' +
              '<span class="ctile-rap">' + fmt(c.rap) + '</span>' +
              (bn ? '<span class="ctile-buffs">' + bn + '✦</span>' : '') +
              '</button>';
          }).join('')
        : '<div class="empty">Нет карточек этой редкости</div>';
      $$('#craft-grid .ctile').forEach(function (el) {
        el.onclick = function () {
          const uid = el.dataset.uid;
          const i = craftSel.indexOf(uid);
          if (i >= 0) craftSel.splice(i, 1);
          else if (craftSel.length < 3) craftSel.push(uid);
          renderCraftScreen();
        };
      });
    }

    const slots = $('#craft-slots');
    if (slots) {
      let html = '';
      for (let i = 0; i < 3; i++) {
        const c = craftSel[i] ? profile.cards.find(function (x) { return x.uid === craftSel[i]; }) : null;
        const ch = c ? brainrotById(c.charId) : null;
        html += c
          ? '<div class="cslot filled" style="--rc:' + rarityById(c.rarity).color + '"><span>' + (ch ? ch.emoji : '❓') + '</span><small>' + fmt(c.rap) + '</small></div>'
          : '<div class="cslot">+</div>';
      }
      slots.innerHTML = html;
    }

    const next = RARITIES.find(function (r) { return r.order === rarityById(craftRarity).order + 1; });
    const resEl = $('#craft-result');
    if (resEl) {
      if (!next) { resEl.innerHTML = ''; }
      else {
        const selCards = craftSel.map(function (uid) { return profile.cards.find(function (x) { return x.uid === uid; }); }).filter(Boolean);
        const buffs = [];
        selCards.forEach(function (c) { (c.buffs || []).forEach(function (b) { if (buffs.indexOf(b) < 0) buffs.push(b); }); });
        const chipsHtml = buffs.map(function (b) { return '<span class="buffchip">' + b + '</span>'; }).join('');
        resEl.innerHTML = '<div class="cres">Результат: <b style="color:' + next.color + '">' + next.name + '</b>' +
          '<div class="cres-buffs">' + (buffs.length ? 'Унаследует эффекты: ' + chipsHtml : 'Эффектов пока нет — выберите карточки с баффами') + '</div>' +
          '<div class="cres-note">+ шанс доп. эффектов: 10% → +1, 5% → +2, 2% → +3</div></div>';
      }
    }

    const btn = $('#btn-craft');
    if (btn) { btn.disabled = craftSel.length !== 3; btn.textContent = craftSel.length === 3 ? 'Скрафтить' : ('Выбрано ' + craftSel.length + '/3'); }
    const sd = $('#btn-sell-dups');
    if (sd) sd.onclick = sellDuplicates;
  }

  function doCraft() {
    if (craftSel.length !== 3) return;
    const next = RARITIES.find(function (r) { return r.order === rarityById(craftRarity).order + 1; });
    if (!next) { toast('Это максимальная редкость'); return; }
    const consume = craftSel.map(function (uid) { return profile.cards.find(function (c) { return c.uid === uid; }); }).filter(Boolean);
    if (consume.length !== 3) return;
    const consumeSet = {};
    consume.forEach(function (c) { consumeSet[c.uid] = true; });
    profile.cards = profile.cards.filter(function (c) { return !consumeSet[c.uid]; });

    const buffs = [];
    consume.forEach(function (c) { (c.buffs || []).forEach(function (b) { if (buffs.indexOf(b) < 0) buffs.push(b); }); });
    const roll = Math.random();
    let extra = 0;
    if (roll < 0.02) extra = 3; else if (roll < 0.07) extra = 2; else if (roll < 0.17) extra = 1;
    let guard = 0;
    while (extra > 0 && buffs.length < 6 && guard++ < 30) {
      const b = BUFFS[Math.floor(Math.random() * BUFFS.length)].id;
      if (buffs.indexOf(b) < 0) { buffs.push(b); extra--; }
    }
    const card = makeCardWithBuffs(next.id, buffs);
    profile.cards.push(card);
    save();
    SFX.rarity(next.order);
    toast('Крафт: ' + next.name + (buffs.length ? ' · эффектов ' + buffs.length : '') + '!', 'good');
    craftSel = [];
    renderCraftScreen();
    showCardReveal(card, closeModal, { celebrate: true, sell: true });
  }

  function openCardDetail(uid, hideUpgrade) {
    const card = profile.cards.find(function (c) { return c.uid === uid; });
    if (!card) return;
    const ch = brainrotById(card.charId);
    const rar = rarityById(card.rarity);
    const buffs = (card.buffs || []).map(buffById).filter(Boolean);
    const lvl = card.up || 0;
    const canUp = lvl < UPGRADE.maxLevel;
    const cost = upgradeCost(card);
    const chance = Math.round(upgradeChance(card) * 100);
    const upgradeBox =
      '<div class="upgrade-box">' +
        '<div class="up-head">Апгрейд <span>· по ценности RAP</span></div>' +
        '<div class="up-row"><span>Уровень</span><b>+' + lvl + ' (+' + Math.round(lvl * UPGRADE.rapStep * 100) + '% RAP)</b></div>' +
        (canUp
          ? '<div class="up-row"><span>Шанс успеха</span><b class="up-chance">' + chance + '%</b></div>' +
            '<div class="up-row"><span>Стоимость</span><b>' + fmt(cost) + ' 🪙</b></div>' +
            '<button class="btn btn-primary btn-block" id="detail-up">Улучшить · ' + chance + '% · ' + fmt(cost) + ' 🪙</button>'
          : '<div class="up-row"><span>Максимум</span><b>+10</b></div>') +
      '</div>';
    openModal(
      '<div class="detail">' +
        cardHTML(card) +
        '<div class="reveal-odds">' + rar.name + ' · шанс 1 / ' + fmt(oddsOf(rar)) + '</div>' +
        '<p class="detail-desc">' + escapeHtml(ch ? ch.desc : '') + '</p>' +
        '<div class="detail-rap">RAP: <b>' + fmt(card.rap) + '</b></div>' +
        '<div class="detail-buffs ' + (buffs.length ? '' : 'empty') + '">' +
          (buffs.length
            ? buffs.map(function (b) {
                return '<div class="buffline"><b>' + b.name + '</b> ×' + b.rapMult + ' — ' + escapeHtml(b.desc) + '</div>';
              }).join('')
            : 'Без баффов') +
        '</div>' +
        (hideUpgrade ? '' : upgradeBox) +
        '<button class="btn btn-primary btn-block" id="detail-sell">Продать за ' + fmt(sellPrice(card)) + ' 🪙</button>' +
        '<button class="btn btn-ghost btn-block" id="detail-close">Закрыть</button>' +
      '</div>',
      { cls: 'detail-modal' }
    );
    const root = $('#modal-root');
    const upBtn = root.querySelector('#detail-up');
    if (upBtn) upBtn.onclick = function () { doUpgrade(uid); };
    root.querySelector('#detail-sell').onclick = function () { closeModal(); sellCard(uid); };
    root.querySelector('#detail-close').onclick = closeModal;
  }

  /* ---------------- LEADERBOARD ---------------- */
  function renderLeaderboard() {
    const res = Store.leaderboard(profile, lbState.kind, lbState.period);
    $('#lb-place').innerHTML = 'Твоё место: <b>' + res.place + '</b> из ' + res.total;
    $('#lb-list').innerHTML = res.entries.map(function (e, i) {
      const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      return '<div class="lb-row ' + (e.isPlayer ? 'me' : '') + '">' +
        '<div class="lb-rank">' + rank + '</div>' +
        '<div class="lb-name">' + escapeHtml(e.name) + '</div>' +
        '<div class="lb-value">' + fmt(e.value) + '</div>' +
        '</div>';
    }).join('');
    $$('#lb-kind .segbtn').forEach(function (b) { b.classList.toggle('active', b.dataset.kind === lbState.kind); });
    $$('#lb-period .segbtn').forEach(function (b) { b.classList.toggle('active', b.dataset.period === lbState.period); });
  }

  /* ---------------- INVITE ---------------- */
  function renderInvite() {
    $('#invite-count').textContent = profile.invites;
    $('#invite-bonus').textContent = '+' + (profile.invites * Math.round(CONFIG.INVITE_BONUS * 100)) + '% к шансу карточки';
    const btn = $('#btn-invite');
    if (profile.invites >= CONFIG.MAX_INVITES) {
      btn.disabled = true; btn.textContent = 'Максимум друзей';
    } else {
      btn.disabled = false; btn.textContent = 'Пригласить друга';
    }
  }

  function doInvite() {
    if (profile.invites >= CONFIG.MAX_INVITES) { toast('Достигнут максимум приглашений'); return; }
    function grant() {
      profile.invites++;
      Store.pushNotification(profile, 'Друг приглашён! Теперь +' + (profile.invites * 10) + '% к шансу карточки.', 'invite');
      save();
      renderInvite();
      updateBadge();
      toast('+10% к шансу карточки', 'good');
      SFX.rarity(3);
    }
    if (typeof Platform !== 'undefined' && Platform.isAvailable()) {
      Platform.invite().then(grant).catch(grant);
    } else {
      grant();
    }
  }

  /* ---------------- SETTINGS ---------------- */
  function renderSettings() {
    $('#sound-state').textContent = profile.settings.sound ? 'вкл' : 'выкл';
  }

  /* ---------------- NOTIFICATIONS ---------------- */
  function timeAgo(ts) {
    const d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60) return 'только что';
    if (d < 3600) return Math.floor(d / 60) + ' мин назад';
    if (d < 86400) return Math.floor(d / 3600) + ' ч назад';
    return Math.floor(d / 86400) + ' дн назад';
  }

  function openNotifications() {
    const items = profile.notifications;
    openModal(
      '<div class="notif-head"><h3>Уведомления</h3><button class="iconbtn" id="notif-close">✕</button></div>' +
      '<div class="notif-list">' +
        (items.length
          ? items.map(function (n) {
              return '<div class="notif ' + (n.read ? '' : 'unread') + '">' +
                '<div class="notif-dot"></div>' +
                '<div class="notif-text">' + escapeHtml(n.text) + '</div>' +
                '<div class="notif-time">' + timeAgo(n.ts) + '</div>' +
                '</div>';
            }).join('')
          : '<div class="empty">Пока пусто</div>') +
      '</div>',
      { cls: 'notif-modal' }
    );
    profile.notifications.forEach(function (n) { n.read = true; });
    save();
    updateBadge();
    $('#notif-close').onclick = closeModal;
  }

  /* ---------------- TUTORIAL ---------------- */
  const TUTORIAL = [
    { emoji: '🧩', title: 'Перетаскивай фигуры', text: 'Тащи фигуру из лотка на поле 8×8. Заполняй целые строки и столбцы — они исчезают и приносят очки.' },
    { emoji: '⚡', title: 'Комбо по пачкам', text: 'Фигуры идут пачками по 3. Каждая собранная линия повышает комбо (до ×10), а промах внутри пачки его НЕ сбрасывает. Если за всю пачку не собрано ни одной линии — комбо сбрасывается. Комбо переносится в следующую пачку.' },
    { emoji: '🎴', title: 'Карточки после игры', text: 'Каждые 150 очков — шанс получить карточку брейнрота. Все карточки открываются в конце забега.' },
    { emoji: '🌈', title: 'Редкости и баффы', text: 'Common 1/3 … Legendary 1/50, Unusual — 1/10 000. У карточек бывают баффы (Glow, Fire…), они стакаются и повышают RAP.' },
    { emoji: '🪙', title: 'Крафт и обмен', text: '3 карточки одной редкости → 1 карточка выше. Ненужные продавай за монеты по их RAP.' },
  ];

  function openTutorial(onDone) {
    let step = 0;
    function renderStep() {
      const t = TUTORIAL[step];
      openModal(
        '<div class="tut">' +
          '<div class="tut-emoji">' + t.emoji + '</div>' +
          '<div class="tut-step">Шаг ' + (step + 1) + ' из ' + TUTORIAL.length + '</div>' +
          '<h3>' + t.title + '</h3>' +
          '<p>' + t.text + '</p>' +
          '<div class="tut-actions">' +
            (step < TUTORIAL.length - 1
              ? '<button class="btn btn-primary btn-block" id="tut-next">Далее</button>'
              : '<button class="btn btn-primary btn-block" id="tut-done">Начать играть</button>') +
            '<button class="btn btn-ghost btn-block" id="tut-skip">Пропустить</button>' +
          '</div>' +
        '</div>',
        { cls: 'tut-modal' }
      );
      const root = $('#modal-root');
      root.querySelector('#tut-skip').onclick = function () {
        profile.settings.tutorialDone = true; save(); closeModal(); onDone && onDone();
      };
      const next = root.querySelector('#tut-next');
      if (next) next.onclick = function () { step++; renderStep(); };
      const done = root.querySelector('#tut-done');
      if (done) done.onclick = function () {
        profile.settings.tutorialDone = true; save(); closeModal(); onDone && onDone();
      };
    }
    renderStep();
  }

  /* ---------------- INIT ---------------- */
  function init() {
    const daily = Store.checkDaily(profile);
    save();

    $('#btn-play').onclick = function () {
      if (!profile.settings.tutorialDone) openTutorial(startGame);
      else startGame();
    };
    const casesBtn = $('#btn-cases');
    if (casesBtn) casesBtn.onclick = function () { show('cases'); };
    const upBtn2 = $('#btn-upgrades');
    if (upBtn2) upBtn2.onclick = function () { show('upgrades'); };
    const craftNav = $('#btn-craft-nav');
    if (craftNav) craftNav.onclick = function () { show('craft'); };
    const craftBtn = $('#btn-craft');
    if (craftBtn) craftBtn.onclick = doCraft;
    const craftFromCol = $('#btn-craft-from-col');
    if (craftFromCol) craftFromCol.onclick = function () { show('craft'); };
    // в релизной сборке (CONFIG.DEV = false) убираем отладочные функции
    const testCardBtn = $('#btn-testcard');
    if (testCardBtn) {
      if (CONFIG.DEV) {
        testCardBtn.onclick = function () {
          const c = CardFactory.makeCard();
          queueCards([c]);
          toast('Тестовая карточка получена', 'good');
          save(); updateBadge();
        };
      } else {
        testCardBtn.remove();
      }
    }
    const spinBtn = $('#btn-spin');
    if (spinBtn) spinBtn.onclick = doSpin;

    $$('[data-nav]').forEach(function (b) {
      b.onclick = function () { show(b.dataset.nav); };
    });
    $$('[data-back]').forEach(function (b) {
      b.onclick = function () { show('home'); };
    });

    $('#btn-game-back').onclick = function () {
      if (game && game.score > 0 && !confirm('Выйти из игры? Очки забега не сохранятся.')) return;
      show('home');
    };

    $('#btn-notifications').onclick = openNotifications;

    $('#btn-shuffle').onclick = function () {
      if (!game) return;
      if (profile.coins < 50) { offerAdCoins(); return; }
      profile.coins -= 50; save();
      BlockEngine.shuffleTray(game);
      renderTray(); updateGameHud();
      beep(420, 0.08);
    };
    $('#btn-hint').onclick = function () {
      if (!game) return;
      const h = BlockEngine.hint(game);
      if (!h) { toast('Ходов нет'); return; }
      if (profile.coins < 30) { offerAdCoins(); return; }
      profile.coins -= 30; save();
      flashHint(h); updateGameHud();
      beep(600, 0.08);
    };

    const tray = trayEl();
    tray.addEventListener('pointerdown', onPiecePointerDown);
    boardEl().addEventListener('contextmenu', function (e) { e.preventDefault(); });

    $$('#lb-kind .segbtn').forEach(function (b) {
      b.onclick = function () { lbState.kind = b.dataset.kind; renderLeaderboard(); };
    });
    $$('#lb-period .segbtn').forEach(function (b) {
      b.onclick = function () { lbState.period = b.dataset.period; renderLeaderboard(); };
    });

    $('#btn-invite').onclick = doInvite;

    $('#btn-sound').onclick = function () {
      profile.settings.sound = !profile.settings.sound;
      save(); renderSettings();
    };
    // VK Bridge: инициализация и «на главный экран»
    if (typeof Platform !== 'undefined') {
      const addHome = $('#btn-add-home');
      if (addHome) {
        addHome.style.display = 'none';
        addHome.onclick = function () {
          if (Platform.isAvailable()) {
            Platform.addToHomeScreen()
              .then(function () { toast('Добавлено на главный экран', 'good'); })
              .catch(function () { toast('Недоступно на этом устройстве'); });
          }
        };
      }
      Platform.init().then(function (vk) {
        if (vk && addHome) addHome.style.display = '';
      });
    }
    $('#btn-tutorial2').onclick = function () { openTutorial(null); };
    $('#btn-reset').onclick = function () {
      if (confirm('Сбросить весь прогресс? Это нельзя отменить.')) {
        Store.reset();
        profile = Store.load();
        save();
        show('home');
        toast('Прогресс сброшен');
      }
    };

    const tutHomeBtn = $('#btn-tutorial');
    if (tutHomeBtn) tutHomeBtn.onclick = function () { openTutorial(null); };

    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.btn,.navbtn,.iconbtn,.chip,.tile,.ctile,.case-tile,.segbtn,.powerbtn')) SFX.click();
    }, true);

    window.addEventListener('resize', fitBoard);
    window.addEventListener('orientationchange', function () { setTimeout(fitBoard, 220); });

    show('home');

    if (CONFIG.DEV) window.__bb = {
      revealRandom: function () { queueCards([CardFactory.makeCard()]); },
      revealRarity: function (r) { queueCards([makeCardOfRarity(r)]); },
      addRandomCards: function (n) { n = n || 1; for (let i = 0; i < n; i++) profile.cards.push(CardFactory.makeCard()); save(); },
      addCardsOfRarity: function (r, n) { n = n || 1; for (let i = 0; i < n; i++) profile.cards.push(makeCardOfRarity(r)); save(); },
      addCoins: function (n) { profile.coins += n; save(); },
      comboFx: comboFx,
      addRunCard: function (r) { const c = makeCardOfRarity(r || 'epic'); Store.addCards(profile, [c]); runCards.push(c); save(); },
      addBuffed: function (r, buffs) {
        const c = makeCardOfRarity(r || 'epic');
        c.buffs = buffs || ['fire'];
        const rr = rarityById(c.rarity);
        c.rap = Math.round(rr.rap * c.buffs.reduce(function (m, id) { return m * (buffById(id) ? buffById(id).rapMult : 1); }, 1));
        Store.addCards(profile, [c]); save(); return c;
      },
      addChar: function (id, buffs) {
        const ch = brainrotById(id);
        if (!ch) return null;
        const rar = rarityById(ch.rarity);
        const bs = buffs || [];
        const mult = bs.reduce(function (m, bid) { return m * (buffById(bid) ? buffById(bid).rapMult : 1); }, 1);
        const card = {
          uid: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          charId: id, rarity: ch.rarity, buffs: bs, rap: Math.round(rar.rap * mult), ts: Date.now()
        };
        Store.addCards(profile, [card]); save(); return card;
      },
      endGameNow: function () { if (game) endGame(); },
      openCase: openCase, upgrade: doUpgrade,
      save: save
    };

    if (daily.granted) {
      setTimeout(function () { toast('Ежедневная награда: +' + daily.coins + ' 🪙', 'good'); }, 700);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
