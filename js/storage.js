/* ============================================================
   BRAINROT BLOCKS — хранилище профиля и лидерборды (локально)
   ============================================================ */
'use strict';

const Store = (function () {
  function newProfile() {
    return {
      coins: 150,
      scale3: true,
      cards: [],            // {uid, charId, rarity, buffs, rap, ts}
      invites: 0,
      notifications: [],    // {id, text, type, ts, read}
      history: [],          // {ts, score, cards}
      stats: { games: 0, bestScore: 0, totalScore: 0, cardsFound: 0, bestCombo: 0, totalLines: 0 },
      daily: { last: null, streak: 0 },
      settings: { sound: true, tutorialDone: false },
      adCoin: { used: 0, resetAt: 0 },
      createdAt: Date.now(),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(CONFIG.SAVE_KEY);
      if (!raw) return newProfile();
      const p = JSON.parse(raw);
      const needsFix = !p.scale3;
      // мягкая миграция / защита от битых данных
      const base = newProfile();
      const merged = Object.assign(base, p, {
        stats: Object.assign(base.stats, p.stats || {}),
        daily: Object.assign(base.daily, p.daily || {}),
        settings: Object.assign(base.settings, p.settings || {}),
        cards: Array.isArray(p.cards) ? p.cards : [],
        notifications: Array.isArray(p.notifications) ? p.notifications : [],
        history: Array.isArray(p.history) ? p.history : [],
      });
      if (needsFix) {
        if (p.scale2) {
          // монеты ранее были умножены на 100 — возвращаем прежний масштаб валюты
          merged.coins = Math.round((merged.coins || 0) / 100);
        } else {
          // старые карточки — доводим RAP до крупного масштаба
          merged.cards = (merged.cards || []).map(function (c) {
            c.rap = Math.round((c.rap || 0) * 100);
            return c;
          });
        }
        merged.scale3 = true;
        try { save(merged); } catch (e) { }
      }
      return merged;
    } catch (e) {
      return newProfile();
    }
  }

  function save(p) {
    try { localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(p)); } catch (e) {}
  }

  function reset() {
    try { localStorage.removeItem(CONFIG.SAVE_KEY); } catch (e) {}
  }

  function uid() {
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function pushNotification(p, text, type) {
    p.notifications.unshift({ id: uid(), text, type: type || 'info', ts: Date.now(), read: false });
    p.notifications = p.notifications.slice(0, 60);
  }

  function unreadCount(p) { return p.notifications.filter(n => !n.read).length; }

  function addCards(p, cards) {
    if (!cards || !cards.length) return;
    cards.forEach(c => p.cards.push(c));
    p.stats.cardsFound += cards.length;
  }

  function recordRun(p, run) {
    // run: {score, cards}
    p.history.unshift({ ts: Date.now(), score: run.score, cards: run.cards });
    p.history = p.history.slice(0, 400);
    p.stats.games += 1;
    p.stats.totalScore += run.score;
    p.stats.bestScore = Math.max(p.stats.bestScore, run.score);
  }

  /* ---------- Даты/периоды ---------- */
  function startOf(period, now) {
    const d = new Date(now || Date.now());
    d.setHours(0, 0, 0, 0);
    if (period === 'day') return d.getTime();
    if (period === 'week') {
      const day = (d.getDay() + 6) % 7; // понедельник = 0
      d.setDate(d.getDate() - day);
      return d.getTime();
    }
    if (period === 'month') { d.setDate(1); return d.getTime(); }
    return 0;
  }

  function aggregate(p, period) {
    const from = startOf(period);
    let points = 0, cards = 0, games = 0;
    p.history.forEach(h => {
      if (h.ts >= from) { points += h.score || 0; cards += h.cards || 0; games += 1; }
    });
    return { points, cards, games };
  }

  /* ---------- Личные результаты за период ----------
     Раньше здесь был «лидерборд» с придуманными соперниками. Настоящую
     таблицу даёт онлайн-лидерборд (js/online.js), а пока он не подключён,
     честно показываем лучшие забеги игрока за этот период. */
  function personalBoard(p, kind, period) {
    const from = startOf(period);
    const field = kind === 'cards' ? 'cards' : 'score';
    const runs = p.history
      .filter(h => h.ts >= from && (h[field] || 0) > 0)
      .map(h => ({ ts: h.ts, value: h[field] || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const agg = aggregate(p, period);
    const entries = runs.map((r, i) => ({
      name: 'Забег ' + (i + 1),
      value: r.value,
      isPlayer: true,
      ts: r.ts,
    }));

    return {
      entries: entries,
      place: 0,
      total: entries.length,
      sum: kind === 'cards' ? agg.cards : agg.points,
      personal: true,
      kind: kind,
      period: period,
    };
  }

  /* ---------- Ежедневная награда ---------- */
  function checkDaily(p) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayKey = today.getTime();
    const last = p.daily.last ? new Date(p.daily.last).setHours(0, 0, 0, 0) : null;
    if (last === todayKey) return { granted: false };
    const isConsecutive = last === (todayKey - 86400000);
    p.daily.streak = isConsecutive ? (p.daily.streak + 1) : 1;
    p.daily.last = todayKey;
    const coins = 100 + (p.daily.streak - 1) * 25;
    p.coins += coins;
    pushNotification(p, `Ежедневная награда: +${coins} монет (серия ${p.daily.streak} дн.)`, 'reward');
    return { granted: true, coins, streak: p.daily.streak };
  }

  return {
    load, save, reset, uid, pushNotification, unreadCount,
    addCards, recordRun, aggregate, personalBoard, checkDaily,
    startOf,
  };
})();
