/* ============================================================
   BRAINROT BLOCKS — движок блока-пазла + фабрика карточек
   ============================================================ */
'use strict';

const BlockEngine = (function () {
  const N = CONFIG.GRID;

  const SHAPES = [
    [[1]],
    [[1, 1]],
    [[1], [1]],
    [[1, 1, 1]],
    [[1], [1], [1]],
    [[1, 1, 1, 1]],
    [[1], [1], [1], [1]],
    [[1, 1], [1, 1]],
    [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
    [[1, 0], [1, 0], [1, 1]],
    [[0, 1], [0, 1], [1, 1]],
    [[1, 1], [1, 0], [1, 0]],
    [[1, 1], [0, 1], [0, 1]],
    [[1, 1, 0], [0, 1, 1]],
    [[0, 1, 1], [1, 1, 0]],
    [[1, 1, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 1, 1]],
    [[1, 1, 1], [1, 0, 0]],
    [[1, 1, 1], [0, 0, 1]],
    [[1, 0, 0], [1, 1, 1]],
    [[0, 0, 1], [1, 1, 1]],
    [[1], [1], [1], [1], [1]],
  ];

  function emptyGrid() { return Array.from({ length: N }, () => Array(N).fill(0)); }
  function shapeSize(m) { return { h: m.length, w: m[0].length }; }
  function shapeCells(m) {
    const cells = [];
    for (let r = 0; r < m.length; r++)
      for (let c = 0; c < m[r].length; c++)
        if (m[r][c]) cells.push([r, c]);
    return cells;
  }
  function randomShape() {
    return SHAPES[Math.floor(Math.random() * SHAPES.length)].map(row => row.slice());
  }
  function randomPiece() {
    return {
      m: randomShape(),
      color: PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)],
    };
  }

  // фигура, у которой гарантированно есть куда встать (или 1x1 в крайнем случае)
  function randomPlaceablePiece(grid) {
    for (let i = 0; i < 80; i++) {
      const p = randomPiece();
      if (anyPlacement(grid, p.m)) return p;
    }
    return { m: [[1]], color: PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)] };
  }

  function canPlace(grid, m, r0, c0) {
    const sz = shapeSize(m);
    if (r0 < 0 || c0 < 0 || r0 + sz.h > N || c0 + sz.w > N) return false;
    for (let r = 0; r < sz.h; r++)
      for (let c = 0; c < sz.w; c++)
        if (m[r][c] && grid[r0 + r][c0 + c]) return false;
    return true;
  }

  function anyPlacement(grid, m) {
    const sz = shapeSize(m);
    for (let r0 = 0; r0 <= N - sz.h; r0++)
      for (let c0 = 0; c0 <= N - sz.w; c0++)
        if (canPlace(grid, m, r0, c0)) return { r0, c0 };
    return null;
  }

  function hasMoves(state) {
    return state.tray.some(p => p && anyPlacement(state.grid, p.m));
  }

  function pickColor() { return PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)]; }

  // Каждая фигура в лотке гарантированно может быть поставлена на текущее поле
  function refillTray(state) {
    state.tray = [
      randomPlaceablePiece(state.grid),
      randomPlaceablePiece(state.grid),
      randomPlaceablePiece(state.grid),
    ];
  }

  // «Беспроигрышная» пачка: только мелкие фигуры — их можно поставить почти на любое поле
  function safePack(state) {
    const shapes = [[[1]], [[1, 1]], [[1], [1]]];
    state.tray = shapes.map(function (m) {
      const piece = { m: m.map(function (r) { return r.slice(); }), color: pickColor() };
      return anyPlacement(state.grid, piece.m) ? piece : randomPlaceablePiece(state.grid);
    });
  }

  function newGame(invites) {
    const state = {
      grid: emptyGrid(),
      tray: [],
      score: 0,
      combo: 0,
      batchClears: 0,
      bestCombo: 0,
      placedCells: 0,
      linesCleared: 0,
      nextRollAt: CONFIG.CARD_ROLL_STEP,
      pity: 0,
      rolls: 0,
      cardsEarned: 0,
      invites: invites || 0,
      gameOver: false,
      revives: 0,
    };
    refillTray(state);
    let guard = 0;
    while (!hasMoves(state) && guard++ < 20) refillTray(state);
    return state;
  }

  function clearLines(state) {
    const grid = state.grid;
    const fullRows = [], fullCols = [];
    for (let r = 0; r < N; r++) if (grid[r].every(v => v)) fullRows.push(r);
    for (let c = 0; c < N; c++) {
      let full = true;
      for (let r = 0; r < N; r++) if (!grid[r][c]) { full = false; break; }
      if (full) fullCols.push(c);
    }
    fullRows.forEach(r => { for (let c = 0; c < N; c++) grid[r][c] = 0; });
    fullCols.forEach(c => { for (let r = 0; r < N; r++) grid[r][c] = 0; });
    return { rows: fullRows.length, cols: fullCols.length };
  }

  function tryCardRolls(state) {
    const cards = [];
    let guard = 0;
    while (state.score >= state.nextRollAt && guard++ < 50) {
      state.nextRollAt += CONFIG.CARD_ROLL_STEP;
      state.rolls++;
      const chance = Math.min(1, CONFIG.BASE_CARD_CHANCE + state.invites * CONFIG.INVITE_BONUS);
      const pityHit = state.pity >= CONFIG.PITY_ROLLS - 1;
      const success = pityHit || Math.random() < chance;
      if (success) {
        state.pity = 0;
        const card = CardFactory.makeCard(state.invites);
        cards.push(card);
        state.cardsEarned++;
      } else {
        state.pity++;
      }
    }
    return cards;
  }

  function place(state, trayIndex, r0, c0) {
    if (state.gameOver) return { ok: false, reason: 'over' };
    const piece = state.tray[trayIndex];
    if (!piece) return { ok: false, reason: 'empty' };
    if (!canPlace(state.grid, piece.m, r0, c0)) return { ok: false, reason: 'invalid' };

    const cells = shapeCells(piece.m);
    cells.forEach(function (dc) { state.grid[r0 + dc[0]][c0 + dc[1]] = piece.color; });
    state.placedCells += cells.length;

    let pointsGained = cells.length * CONFIG.CELL_POINTS;
    const cleared = clearLines(state);
    const lines = cleared.rows + cleared.cols;
    let comboMult = 1;

    if (lines > 0) {
      state.combo += 1;
      state.batchClears = (state.batchClears || 0) + 1;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      comboMult = Math.min(CONFIG.COMBO_MAX, 1 + state.combo * CONFIG.COMBO_STEP);
      pointsGained += Math.round(lines * CONFIG.LINE_BASE * comboMult);
      if (lines > 1) pointsGained += (lines - 1) * 50;
      state.linesCleared += lines;
    } else {
      // промах внутри пачки НЕ сбрасывает комбо — оно сохраняется
      comboMult = Math.min(CONFIG.COMBO_MAX, 1 + state.combo * CONFIG.COMBO_STEP);
    }

    state.score += pointsGained;
    state.tray[trayIndex] = null;

    const newCards = tryCardRolls(state);

    // конец пачки (все 3 фигуры поставлены): если за пачку не собрали ни одной линии — комбо сбрасывается
    if (state.tray.every(p => !p)) {
      if ((state.batchClears || 0) === 0) state.combo = 0;
      state.batchClears = 0;
      refillTray(state);
      // сейв от тупика — только с шансом CONFIG.SAVE_CHANCE
      if (!hasMoves(state) && Math.random() < CONFIG.SAVE_CHANCE) {
        let g = 0;
        while (!hasMoves(state) && g++ < 30) refillTray(state);
      }
    } else if (!hasMoves(state)) {
      // анти-тупик: остались фигуры, но ни одна не влезает — с шансом CONFIG.SAVE_CHANCE заменяем неподходящие
      if (Math.random() < CONFIG.SAVE_CHANCE) {
        for (let i = 0; i < state.tray.length; i++) {
          if (state.tray[i] && !anyPlacement(state.grid, state.tray[i].m)) {
            state.tray[i] = randomPlaceablePiece(state.grid);
          }
        }
      }
    }
    if (!hasMoves(state)) state.gameOver = true;

    return {
      ok: true,
      pointsGained,
      lines,
      comboMult,
      combo: state.combo,
      newCards,
      gameOver: state.gameOver,
    };
  }

  function shuffleTray(state) {
    state.tray = state.tray.map(p => (p ? randomPiece() : null));
    let guard = 0;
    while (!hasMoves(state) && guard++ < 20) refillTray(state);
  }

  function hint(state) {
    for (let i = 0; i < state.tray.length; i++) {
      const piece = state.tray[i];
      if (!piece) continue;
      const pos = anyPlacement(state.grid, piece.m);
      if (pos) return { trayIndex: i, r0: pos.r0, c0: pos.c0, m: piece.m, color: piece.color };
    }
    return null;
  }

  // opts.easy (возрождение за рекламу) — чистим больше клеток и даём мелкую пачку
  function revive(state, opts) {
    const N = CONFIG.GRID;
    const easy = !!(opts && opts.easy);
    const filled = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (state.grid[r][c]) filled.push([r, c]);
    const wipeCount = Math.min(easy ? 16 : 10, filled.length);
    for (let i = 0; i < wipeCount; i++) {
      const idx = Math.floor(Math.random() * filled.length);
      const cell = filled.splice(idx, 1)[0];
      state.grid[cell[0]][cell[1]] = 0;
    }
    state.gameOver = false;
    state.combo = 0;
    state.batchClears = 0;
    state.tray = [null, null, null];
    if (easy) safePack(state); else refillTray(state);
    let g = 0;
    while (!hasMoves(state) && g++ < 30) refillTray(state);
    return true;
  }

  return { newGame, place, shuffleTray, hint, hasMoves, refillTray, safePack, revive, canPlace, shapeSize, shapeCells, SHAPES, N };
})();

/* ============================================================
   Фабрика карточек
   ============================================================ */
const CardFactory = (function () {
  function rollRarity() {
    const r = Math.random();
    let acc = 0;
    for (const rar of RARITIES) {
      acc += rar.chance;
      if (r < acc) return rar;
    }
    return RARITIES[0];
  }

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function rollBuffs() {
    const buffs = [];
    if (Math.random() >= CONFIG.BUFF_CHANCE) return buffs;
    buffs.push(pickRandom(BUFFS).id);
    while (buffs.length < CONFIG.MAX_BUFFS && Math.random() < CONFIG.BUFF_STACK_CHANCE) {
      const candidate = pickRandom(BUFFS);
      if (!buffs.includes(candidate.id)) buffs.push(candidate.id);
      else break;
    }
    return buffs;
  }

  function build(rar, forcedChar) {
    const pool = normalBrainrotsByRarity(rar.id);
    const char = forcedChar || (pool.length ? pickRandom(pool) : (normalBrainrotsByRarity('common')[0] || BRAINROTS[0]));
    const buffs = rollBuffs();
    const mult = buffs.reduce((m, id) => m * (buffById(id) ? buffById(id).rapMult : 1), 1);
    return {
      uid: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      charId: char.id,
      rarity: rar.id,
      buffs: buffs,
      rap: Math.round(rar.rap * mult),
      ts: Date.now(),
    };
  }

  function rollSpecial() {
    const r = Math.random();
    let acc = 0;
    for (const id in COLLECTIONS) {
      acc += COLLECTIONS[id].chance;
      if (r < acc) return id;
    }
    return null;
  }

  function makeCard() {
    const special = rollSpecial();
    if (special) {
      const pool = brainrotsByTag(special);
      if (pool.length) {
        const char = pickRandom(pool);
        return build(rarityById(char.rarity), char);
      }
    }
    return build(rollRarity());
  }

  return { makeCard, rollRarity };
})();
