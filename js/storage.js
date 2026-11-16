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

  /* ---------- Детерминированный ГПСЧ ---------- */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const BOT_NAMES = [
    'СигмаКот', 'ТапокБог', 'МемныйДед', 'ГигаЖаба', 'КапитанКастрюля',
    'СкибидиПельмень', 'ЛягушкаБосс', 'ХлебныйМаг', 'НосочныйКороль', 'ОгурецХаос',
    'КвакКвакыч', 'Пельмень228', 'ТоксичныйКот', 'Абобус', 'МозгоЕд',
    'ШрекНаВолне', 'ЖабаНиндзя', 'ТапокСудьбы', 'КринжМастер', 'ПузырьТишины',
    'СырныйДух', 'БанановыйБог', 'КринжКринжыч', 'УлиткаСпид', 'МоржМемов',
    'ГрибнойШторм', 'КотШредингера', 'СкуфВолшебник', 'ЧиллГай', 'МемнаяПыль',
  ];

  /* Фейковый лидерборд (демо). В реальном VK — сервер/VK Bridge. */
  function leaderboard(p, kind, period) {
    const key = period + '|' + (kind || 'points');
    // период-ключ, чтобы боты «менялись» в новый день/неделю/месяц
    const now = Date.now();
    const periodKey = period === 'day'
      ? new Date(now).toISOString().slice(0, 10)
      : period === 'week'
        ? 'w' + Math.floor((startOf('week', now)) / 86400000)
        : 'm' + new Date(now).getFullYear() + '-' + (new Date(now).getMonth() + 1);
    const rng = mulberry32(hashStr(key + periodKey));

    const scale = period === 'day' ? 1 : period === 'week' ? 6 : 24;
    const entries = [];
    const used = new Set();
    for (let i = 0; i < 19; i++) {
      let name = BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)];
      let guard = 0;
      while (used.has(name) && guard++ < 50) name = BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)];
      used.add(name);

      if (kind === 'cards') {
        const cards = Math.round((4 + rng() * 40) * scale * (0.6 + rng() * 0.9));
        entries.push({ name, value: cards, isPlayer: false });
      } else {
        const pts = Math.round((300 + rng() * 2600) * scale * (0.6 + rng() * 0.9));
        entries.push({ name, value: pts, isPlayer: false });
      }
    }

    const agg = aggregate(p, period);
    const playerValue = kind === 'cards' ? agg.cards : agg.points;
    entries.push({ name: 'Ты', value: playerValue, isPlayer: true });

    entries.sort((a, b) => b.value - a.value);
    const place = entries.findIndex(e => e.isPlayer) + 1;
    return { entries: entries.slice(0, 20), place, total: entries.length };
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
    addCards, recordRun, aggregate, leaderboard, checkDaily,
    startOf, BOT_NAMES,
  };
})();
