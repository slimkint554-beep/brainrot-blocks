/* ============================================================
   BRAINROT BLOCKS — данные игры
   ============================================================ */
'use strict';

const CONFIG = {
  GRID: 8,
  // Карточки
  CARD_ROLL_STEP: 200,      // каждые 200 очков — попытка получить карточку
  BASE_CARD_CHANCE: 0.15,   // базовый шанс карточки
  INVITE_BONUS: 0.05,       // +5% к шансу за каждого ПОДТВЕРДИВШЕГОСЯ друга (макс 5 друзей = 25%)
  PITY_ROLLS: 8,            // гарантированная карточка после N неудачных попыток
  BUFF_CHANCE: 0.30,        // шанс, что у карточки есть косметический бафф
  BUFF_STACK_CHANCE: 0.35,  // шанс, что добавится ЕЩЁ один бафф (стакинг)
  MAX_BUFFS: 8,             // максимум эффектов на одной карточке
  MAX_INVITES: 5,           // максимум друзей (5 × 5% = 25%)
  LOOKSMAX_CHANCE: 0.07,   // шанс, что карта — из доп-коллекции Looksmax (повышенная редкость)
  SAVE_KEY: 'brainrotblocks_v1',
  CELL_POINTS: 5,
  LINE_BASE: 100,
  COMBO_STEP: 0.25,
  COMBO_MAX: 10,
  SAVE_CHANCE: 0.5,         // шанс, что «сейв от тупика» сработает (иначе — проигрыш)
  DEV: false,                // false в релизной сборке — скрывает отладочные функции
  AD_COIN_REWARD: 100,      // монет за просмотр рекламы
  AD_COIN_LIMIT: 3,         // просмотров за период
  AD_COIN_PERIOD_MS: 3 * 60 * 60 * 1000, // период обновления лимита (3 часа)

  // Онлайн-лидерборд. Пока пусто — игра показывает личные результаты.
  // После деплоя воркера (см. server/README.md) впишите сюда его адрес
  // и тот же токен, что задан в настройках воркера.
  LEADERBOARD_API: 'https://brainrot-leaderboard.slimkint554.workers.dev',
  LEADERBOARD_TOKEN: 'BB-6sqhf3e90xiaricq',
  LEADERBOARD_MAX: 50,

  // Админ-панель: показывается только этим VK id (владелец игры) и на localhost.
  OWNER_IDS: ['1123114004'],
};

// Страховка: отладочные функции (тестовая карточка, window.__bb) работают
// только на локальных адресах. Даже если в сборку случайно попал DEV: true,
// на публичном домене они отключатся.
(function guardDevMode() {
  const h = (typeof location !== 'undefined') ? location.hostname : '';
  const isLocal = location.protocol === 'file:' || !h || h === 'localhost' ||
    h === '127.0.0.1' || h === '::1' || /^192\.168\./.test(h) || /^10\./.test(h);
  if (CONFIG.DEV && !isLocal) CONFIG.DEV = false;
})();

/* ---------- Редкости (сумма шансов = 1.0) ---------- */
const RARITIES = [
  { id: 'common',    name: 'Обычная',     short: 'Common',    chance: 0.3200, color: '#8b98a8', rap: 1000,   order: 0 },
  { id: 'uncommon',  name: 'Необычная',   short: 'Uncommon',  chance: 0.2600, color: '#39d98a', rap: 2500,   order: 1 },
  { id: 'rare',      name: 'Редкая',      short: 'Rare',      chance: 0.2400, color: '#3b9dff', rap: 6000,   order: 2 },
  { id: 'epic',      name: 'Эпическая',   short: 'Epic',      chance: 0.1600, color: '#b06bff', rap: 15000,  order: 3 },
  { id: 'legendary', name: 'Легендарная', short: 'Legendary', chance: 0.0199, color: '#ffb400', rap: 40000,  order: 4 },
  { id: 'unusual',   name: 'Unusual',     short: 'Unusual',   chance: 0.0001, color: '#ff3b6b', rap: 120000, order: 5 },
];

const RARITY_BY_ID = Object.fromEntries(RARITIES.map(r => [r.id, r]));

/* ---------- Доп-коллекции (особые, редкие) ---------- */
const COLLECTIONS = {
  looksmax: { name: 'Looksmax', short: 'LOOKSMAX', chance: 0.060, color: '#2ee6a6' },
  verity:   { name: 'Verity',   short: 'VERITY',   chance: 0.012, color: '#ffd166' },
  lovity:   { name: 'Lovity',   short: 'LOVITY',   chance: 0.012, color: '#ff5cda' },
  falsity:  { name: 'Falsity',  short: 'FALSITY',  chance: 0.010, color: '#9aa7b2' },
  virity:   { name: 'Virity',   short: 'VIRITY',   chance: 0.008, color: '#4dd6ff' },
  mogity:   { name: 'Mogity',   short: 'MOGITY',   chance: 0.006, color: '#ff9f1c' },
  rarest:   { name: 'Rarest',   short: 'RAREST',   chance: 0.002, color: '#ffffff' },
};

/* ---------- Кейсы (покупаются за монеты) ---------- */
const CASES = [
  { id: 'start',  name: 'Стартовый',   icon: '🎁', price: 25,   color: '#8b98a8', special: 0,    miss: 0.05, rapMult: 1,
    rates: { common: 0.60, uncommon: 0.32, rare: 0.07, epic: 0.008, legendary: 0.002 } },
  { id: 'rare',   name: 'Редкий',      icon: '📦', price: 75,   color: '#3b9dff', special: 0.01, miss: 0.05, rapMult: 1.3,
    rates: { common: 0.25, uncommon: 0.35, rare: 0.30, epic: 0.085, legendary: 0.014, unusual: 0.001 } },
  { id: 'epic',   name: 'Эпический',   icon: '💎', price: 250,  color: '#b06bff', special: 0.03, miss: 0.05, rapMult: 1.8,
    rates: { uncommon: 0.25, rare: 0.40, epic: 0.25, legendary: 0.09, unusual: 0.01 } },
  { id: 'legend', name: 'Легендарный', icon: '👑', price: 800,  color: '#ffb400', special: 0.08, miss: 0.05, rapMult: 3.2,
    rates: { rare: 0.25, epic: 0.50, legendary: 0.22, unusual: 0.03 } },
  { id: 'mythic', name: 'Мифический',  icon: '🔥', price: 2000, color: '#ff5c7a', special: 0.12, miss: 0.05, rapMult: 6,
    rates: { rare: 0.10, epic: 0.55, legendary: 0.30, unusual: 0.05 } },
  { id: 'ultra',  name: 'Ультра',      icon: '🌌', price: 5000, color: '#39d98a', special: 0.18, miss: 0.05, rapMult: 10,
    rates: { epic: 0.40, legendary: 0.50, unusual: 0.10 } },
];

/* ---------- Апгрейд карточек (по RAP, честный рандом) ---------- */
const UPGRADE = {
  maxLevel: 25,           // было 10 — теперь качаем карточку сильно выше
  rapStep: 0.35,          // +35% RAP за уровень
  baseCost: { common: 150, uncommon: 400, rare: 1000, epic: 2500, legendary: 6000, unusual: 15000 },
  costStep: 0.5,          // цена растёт на 50% за уровень (мягче, чтобы длинная прокачка была реальной)
  baseChance: 0.90,       // шанс на 0-м уровне
  chanceDecay: 0.84,      // каждый уровень шанс слабее (но заметно мягче прежнего)
  minChance: 0.10,
  rapCap: 50000000,       // максимальная награда из колеса (RAP)
  maxStake: 5000000,      // максимальная ставка
  specialChance: 0.18,    // шанс, что выигрыш будет с особым эффектом (баффом)
  specialStackChance: 0.40, // шанс, что добавится ещё один эффект (стакинг)
};

/* ---------- Колесо апгрейдов (меньше шанс — лучше дроп) ---------- */
const WHEEL_TIERS = [
  { chance: 0.50, rarity: 'rare',      cost: 300 },
  { chance: 0.25, rarity: 'epic',      cost: 800 },
  { chance: 0.10, rarity: 'legendary', cost: 2000 },
  { chance: 0.05, rarity: 'unusual',   cost: 5000 },
  { chance: 0.01, rarity: 'special',   cost: 12000 },
];

/* ---------- Палитра фигур (чтобы поле не было одноцветным) ---------- */
const PIECE_COLORS = ['#ff5c7a', '#ffb020', '#2ee6a6', '#3b9dff', '#b06bff', '#ff7a3d', '#4dd6ff', '#ffe14d'];

/* ---------- 20 косметических баффов ---------- */
const BUFFS = [
  { id: 'glow',    name: 'Glow',    desc: 'Карточка мягко светится, репутация растёт быстрее', rapMult: 1.15 },
  { id: 'wet',     name: 'Wet',     desc: 'Мокрый вайб: блоки скользят, но дают больше',        rapMult: 1.18 },
  { id: 'fire',    name: 'Fire',    desc: 'Поджигает соседние блоки и ускоряет комбо',          rapMult: 1.30 },
  { id: 'ice',     name: 'Ice',     desc: 'Замораживает время и замедляет падение',             rapMult: 1.20 },
  { id: 'gold',    name: 'Gold',    desc: 'Золотая жила: каждый блок стоит дороже',             rapMult: 1.45 },
  { id: 'rainbow', name: 'Rainbow', desc: 'Радужный хаос красит всё и умножает очки',           rapMult: 1.50 },
  { id: 'neon',    name: 'Neon',    desc: 'Неоновая подсветка усиливает каждый комбо-удар',     rapMult: 1.35 },
  { id: 'void',    name: 'Void',    desc: 'Пустота поглощает блоки и выплёвывает силу',         rapMult: 1.70 },
  { id: 'toxic',   name: 'Toxic',   desc: 'Токсичный след отравляет соперников и даёт бонус',   rapMult: 1.25 },
  { id: 'crystal', name: 'Crystal', desc: 'Кристальная форма увеличивает точность и награду',   rapMult: 1.40 },
  { id: 'shadow',  name: 'Shadow',  desc: 'Тень скрывает блоки и крадёт чужие очки',            rapMult: 1.55 },
  { id: 'plasma',  name: 'Plasma',  desc: 'Плазма плавит препятствия и ускоряет рост',          rapMult: 1.65 },
  { id: 'lava',    name: 'Lava',    desc: 'Лава сжигает всё лишнее и оставляет только профит',  rapMult: 1.60 },
  { id: 'frost',   name: 'Frost',   desc: 'Морозный вайб укрепляет блоки и охлаждает нервы',    rapMult: 1.22 },
  { id: 'storm',   name: 'Storm',   desc: 'Шторм разбрасывает блоки и собирает урожай',         rapMult: 1.75 },
  { id: 'cosmic',  name: 'Cosmic',  desc: 'Космос искривляет поле и удваивает вайб',             rapMult: 1.85 },
  { id: 'blood',   name: 'Blood',   desc: 'Кровавый режим: риск огромный, награда ещё больше',  rapMult: 1.80 },
  { id: 'sugar',   name: 'Sugar',   desc: 'Сахарный буст: сладкие комбо и быстрый рост',        rapMult: 1.28 },
  { id: 'static',  name: 'Static',  desc: 'Помехи сбивают соперников и дают микро-бонус',       rapMult: 1.12 },
  { id: 'glitch',  name: 'Glitch',  desc: 'Глюк ломает правила и выдаёт максимум репутации',    rapMult: 2.00 },
  // ---- новые эффекты (v0.3): ещё больше вайба ----
  { id: 'firework',name: 'Firework',desc: 'Фейерверк: каждый ход взрывается очками',            rapMult: 1.42 },
  { id: 'honey',   name: 'Honey',   desc: 'Медовая липкость: блоки притягиваются друг к другу', rapMult: 1.26 },
  { id: 'chrome',  name: 'Chrome',  desc: 'Хромированное сияние отражает чужие награды',        rapMult: 1.48 },
  { id: 'matrix',  name: 'Matrix',  desc: 'Цифровой дождь переписывает полоски в свою пользу',  rapMult: 1.62 },
  { id: 'aurora',  name: 'Aurora',  desc: 'Северное сияние над полем — карма чистая',           rapMult: 1.38 },
  { id: 'magnet',  name: 'Magnet',  desc: 'Магнит стягивает линии в идеальный порядок',         rapMult: 1.33 },
  { id: 'neon2',   name: 'Ultraneon',desc:'Двойной неон: светится даже в темноте',              rapMult: 1.44 },
  { id: 'prism',   name: 'Prism',   desc: 'Призма дробит очки на все цвета радуги',             rapMult: 1.52 },
  { id: 'cyber',   name: 'Cyber',   desc: 'Кибер-имплант ускоряет рост репутации',              rapMult: 1.58 },
  { id: 'slime',   name: 'Slime',   desc: 'Слайм растекается и склеивает линии',                rapMult: 1.24 },
  { id: 'phantom', name: 'Phantom', desc: 'Фантом проходит сквозь блоки и крадёт очки',         rapMult: 1.66 },
  { id: 'galaxy',  name: 'Galaxy',  desc: 'Галактика внутри карточки — гравитация на твоей стороне', rapMult: 1.72 },
  { id: 'acid',    name: 'Acid',    desc: 'Кислота разъедает серые блоки',                      rapMult: 1.36 },
  { id: 'royal',   name: 'Royal',   desc: 'Королевская печать: всё дороже и пафоснее',          rapMult: 1.55 },
  { id: 'bubblegum',name:'Bubblegum',desc:'Жвачка тянет комбо дальше обычного',                 rapMult: 1.30 },
  { id: 'obsidian',name: 'Obsidian',desc: 'Обсидиан: чёрный, острый и очень дорогой',           rapMult: 1.68 },
  { id: 'zenith',  name: 'Zenith',  desc: 'Зенит: пик формы, максимальная отдача',              rapMult: 1.90 },
];

const BUFF_BY_ID = Object.fromEntries(BUFFS.map(b => [b.id, b]));

/* ---------- Визуальные эффекты баффов ---------- */
const BUFF_FX = {
  glow:    { c: '#ffe98a', fx: 'pulse' },
  wet:     { c: '#7fd8ff', fx: 'shine' },
  fire:    { c: '#ff7a3d', fx: 'flame' },
  ice:     { c: '#9fe8ff', fx: 'frost' },
  gold:    { c: '#ffd54a', fx: 'shimmer' },
  rainbow: { c: '#ff5cda', fx: 'hue' },
  neon:    { c: '#39ff14', fx: 'neon' },
  void:    { c: '#8a4dff', fx: 'void' },
  toxic:   { c: '#9dff3d', fx: 'bubble' },
  crystal: { c: '#b9e6ff', fx: 'shimmer' },
  shadow:  { c: '#8a7cff', fx: 'smoke' },
  plasma:  { c: '#ff4dd2', fx: 'pulse' },
  lava:    { c: '#ff5a1f', fx: 'flame' },
  frost:   { c: '#a8e6ff', fx: 'frost' },
  storm:   { c: '#7aa8ff', fx: 'spark' },
  cosmic:  { c: '#c08bff', fx: 'hue' },
  blood:   { c: '#ff2e55', fx: 'pulse' },
  sugar:   { c: '#ffb8e0', fx: 'bubble' },
  static:  { c: '#cfd6e0', fx: 'glitch' },
  glitch:  { c: '#00ffbf', fx: 'glitch' },
  // ---- новые (v0.3) ----
  firework:{ c: '#ff6b3d', fx: 'spark' },
  honey:   { c: '#ffc93d', fx: 'shimmer' },
  chrome:  { c: '#dfe9f5', fx: 'shine' },
  matrix:  { c: '#2bff88', fx: 'neon' },
  aurora:  { c: '#63ffd0', fx: 'hue' },
  magnet:  { c: '#ff4d6d', fx: 'pulse' },
  neon2:   { c: '#7cff2b', fx: 'neon' },
  prism:   { c: '#9ad4ff', fx: 'hue' },
  cyber:   { c: '#00e0ff', fx: 'glitch' },
  slime:   { c: '#8dff5c', fx: 'bubble' },
  phantom: { c: '#b9a4ff', fx: 'smoke' },
  galaxy:  { c: '#a77bff', fx: 'void' },
  acid:    { c: '#d0ff2b', fx: 'bubble' },
  royal:   { c: '#ffd700', fx: 'shimmer' },
  bubblegum:{c: '#ff8ad4', fx: 'bubble' },
  obsidian:{ c: '#6b6b8a', fx: 'smoke' },
  zenith:  { c: '#ffe36b', fx: 'pulse' },
};

/* ---------- Brainrot-персонажи по редкостям (44) ---------- */
const BRAINROTS = [
  // common — 14
  { id: 'sigma-kot',              name: 'Сигма-Кот',                 rarity: 'common', emoji: '🐈', desc: 'Молчит, качает головой и знает всё лучше тебя' },
  { id: 'mokryy-tapok',           name: 'Мокрый Тапок',              rarity: 'common', emoji: '🩴', desc: 'Вчера был сухим, сегодня мстит всему миру' },
  { id: 'kapitan-kastryulya',     name: 'Капитан Кастрюля',          rarity: 'common', emoji: '🍲', desc: 'Готовит борщ и командует кухонным флотом' },
  { id: 'giga-zhaba',             name: 'Гига-Жаба',                 rarity: 'common', emoji: '🐸', desc: 'Сидит на болоте и качает права на всё' },
  { id: 'holodilnik-filosof',     name: 'Холодильник-Философ',       rarity: 'common', emoji: '🥶', desc: 'Думает о смысле жизни при минус восемнадцати' },
  { id: 'nosok-odinochka',        name: 'Носок-Одиночка',            rarity: 'common', emoji: '🧦', desc: 'Потерял пару в стирке и теперь свободен' },
  { id: 'pelmen-buntar',          name: 'Пельмень-Бунтарь',          rarity: 'common', emoji: '🥟', desc: 'Восстал против сметаны и требует независимости' },
  { id: 'babushka-na-samokate',   name: 'Бабушка на Самокате',       rarity: 'common', emoji: '🛴', desc: 'Обгоняет маршрутку и не уступает никому' },
  { id: 'kotleta-podozritelnaya', name: 'Котлета Подозрительная',    rarity: 'common', emoji: '🍖', desc: 'Слишком подозрительная, но очень хочет обняться' },
  { id: 'chaynik-tiktoker',       name: 'Чайник-Тиктокер',           rarity: 'common', emoji: '🫖', desc: 'Кипятит воду и снимает об этом контент' },
  { id: 'ogurets-v-shoke',        name: 'Огурец в Шоке',             rarity: 'common', emoji: '🥒', desc: 'Узнал, что его положат в салат, и замер' },
  { id: 'vafelka-detektiv',       name: 'Вафелька-Детектив',         rarity: 'common', emoji: '🧇', desc: 'Раскрывает преступления с помощью сиропа' },
  { id: 'lampochka-depressiya',   name: 'Лампочка в Депрессии',      rarity: 'common', emoji: '💡', desc: 'Горит ярко, но внутри пустота и уныние' },
  { id: 'zakusochnaya-krysa',     name: 'Закусочная Крыса',          rarity: 'common', emoji: '🐀', desc: 'Контролирует очередь у ларька после закрытия' },

  // uncommon — 10
  { id: 'sigma-grib',             name: 'Сигма-Гриб',                rarity: 'uncommon', emoji: '🍄', desc: 'Растёт на мхе и раздаёт мудрость спорами' },
  { id: 'skamerych-iz-podezda',   name: 'Скамерыч из Подъезда',      rarity: 'uncommon', emoji: '📞', desc: 'Звонит из подъезда и просит перевести немного' },
  { id: 'dzhitsu-bobr',           name: 'Джиу-Джитсу Бобёр',         rarity: 'uncommon', emoji: '🦫', desc: 'Душит обидчиков хвостом, потом извиняется' },
  { id: 'toksichnyy-arbuz',       name: 'Токсичный Арбуз',           rarity: 'uncommon', emoji: '🍉', desc: 'Слишком много сока и ноль уважения к другим' },
  { id: 'plamennaya-shaurma',     name: 'Пламенная Шаурма',          rarity: 'uncommon', emoji: '🌯', desc: 'Острая, горячая и всегда с чесночным соусом' },
  { id: 'kiber-ded',              name: 'Кибер-Дед',                 rarity: 'uncommon', emoji: '👴', desc: 'Переустановил себе драйверы и стал мудрее' },
  { id: 'rybnyy-baron',           name: 'Рыбный Барон',              rarity: 'uncommon', emoji: '🐟', desc: 'Скупил всю реку и продаёт воду в розницу' },
  { id: 'dyadya-banan',           name: 'Дядя Банан',                rarity: 'uncommon', emoji: '🍌', desc: 'Снимает банальные видео и считает себя звездой' },
  { id: 'kaktus-s-pleylistom',    name: 'Кактус с Плейлистом',       rarity: 'uncommon', emoji: '🌵', desc: 'Колючий, но с отличным плейлистом для грусти' },
  { id: 'chudo-yudo-v-krossovkah',name: 'Чудо-Юдо в Кроссовках',     rarity: 'uncommon', emoji: '👟', desc: 'Бежит по делам в кроссовках на два размера больше' },

  // rare — 8
  { id: 'kusachiy-krendel',       name: 'Кусачий Крендель',          rarity: 'rare', emoji: '🥨', desc: 'Кусает всех, кто трогает его без разрешения' },
  { id: 'lord-puhlik',            name: 'Лорд Пухлик',               rarity: 'rare', emoji: '🦔', desc: 'Пушистый повелитель пледов и ночных перекусов' },
  { id: 'kapibara-boss',          name: 'Капибара-Босс',             rarity: 'rare', emoji: '🐹', desc: 'Спокойно смотрит, как рушится твой прогресс' },
  { id: 'mramornyy-sushi',        name: 'Мраморный Суши-Голем',      rarity: 'rare', emoji: '🍣', desc: 'Сделан из риса и мрамора, холоден к просьбам' },
  { id: 'korol-shaurmy',          name: 'Король Шаурмы',             rarity: 'rare', emoji: '👑', desc: 'Правит очередью и выдаёт соус только избранным' },
  { id: 'dinamicheskiy-dedlayn',  name: 'Динамический Дедлайн',      rarity: 'rare', emoji: '⏰', desc: 'Приходит раньше тебя и уходит позже всех' },
  { id: 'pechenka-prorok',        name: 'Печенька-Пророк',           rarity: 'rare', emoji: '🥠', desc: 'Предсказывает будущее по крошкам на столе' },
  { id: 'neptunovyy-pelmen',      name: 'Нептуновый Пельмень',       rarity: 'rare', emoji: '🪐', desc: 'Прилетел с другой планеты и требует сметану' },

  // epic — 6
  { id: 'giga-gus',               name: 'Гига-Гусь',                 rarity: 'epic', emoji: '🪿', desc: 'Шипит громче всех и гоняет дворовых собак' },
  { id: 'kiber-samovar',          name: 'Кибер-Самовар',             rarity: 'epic', emoji: '☕', desc: 'Кипятит чай на атомной энергии и не спрашивает' },
  { id: 'mistik-tvist',           name: 'Мистик-Твист',              rarity: 'epic', emoji: '🌀', desc: 'Вращается так, что меняет твою реальность' },
  { id: 'kartofel-titan',         name: 'Картофель-Титан',           rarity: 'epic', emoji: '🥔', desc: 'Огромный овощ, который переживёт всех нас' },
  { id: 'shef-povar-haosa',       name: 'Шеф-Повар Хаоса',           rarity: 'epic', emoji: '👨‍🍳', desc: 'Смешивает несовместимое и называет это шедевром' },
  { id: 'vselenskiy-doshirak',    name: 'Вселенский Доширак',        rarity: 'epic', emoji: '🍜', desc: 'Питается вселенной и даёт силы на ночной дожор' },

  // legendary — 4
  { id: 'bog-mokrogo-noska',      name: 'Бог Мокрого Носка',         rarity: 'legendary', emoji: '🌊', desc: 'Один его отжим затопил три района и один мем' },
  { id: 'velikiy-pelmeniy',       name: 'Великий Пельмений',         rarity: 'legendary', emoji: '🫕', desc: 'Прародитель теста, варёный бог всех пельменей' },
  { id: 'imperator-holodilnik',   name: 'Император Холодильник',     rarity: 'legendary', emoji: '🧊', desc: 'Внутри него хранится вечная мерзлота и власть' },
  { id: 'koroleva-vaybov',        name: 'Королева Вайбов',           rarity: 'legendary', emoji: '💃', desc: 'Её танец вылечил интернет от плохого настроения' },

  // unusual — 2
  { id: 'praroditel-vseh-tapok',  name: 'Прародитель Всех Тапок',    rarity: 'unusual', emoji: '👁️', desc: 'Создал все тапки мира и смотрит за нами' },
  { id: 'neosoznannyy-signal',    name: 'Неосознанный Сигнал',       rarity: 'unusual', emoji: '📡', desc: 'Его никто не понимает, но он вещает из роутера' },
  { id: 'absolute-zero',          name: 'Абсолютный Ноль',           rarity: 'unusual', emoji: '❄️', desc: 'Приносит холод и обнуляет сомнения' },
  { id: 'quantum-dumpling',       name: 'Квантовый Пельмень',        rarity: 'unusual', emoji: '⚛️', desc: 'Одновременно сырой и готовый' },
  { id: 'random-keeper',          name: 'Хранитель Рандома',         rarity: 'unusual', emoji: '🎲', desc: 'Знает исход любого броска' },
  { id: 'singularity',            name: 'Сингулярность',             rarity: 'unusual', emoji: '🕳️', desc: 'Схлопывает всё в одну точку' },
  { id: 'meme-creator',           name: 'Творец Мемов',              rarity: 'unusual', emoji: '🧿', desc: 'Придумал половину интернета' },
  { id: 'eternal-buffer',         name: 'Вечный Буфер',              rarity: 'unusual', emoji: '♾️', desc: 'Никогда не догружается до конца' },
  { id: 'glitch-king',            name: 'Король Глитчей',            rarity: 'unusual', emoji: '📺', desc: 'Живёт между кадрами' },
  { id: 'silence',                name: 'Тишина',                    rarity: 'unusual', emoji: '🤫', desc: 'Её слышно громче всего' },

  // Looksmax — 13
  { id: 'mewing-malysh',       name: 'Мьюинг-Малыш',       rarity: 'common', emoji: '😶', desc: 'Молчит и держит язык на нёбе уже третий год', tag: 'looksmax' },
  { id: 'skinkid',             name: 'Скинкид',            rarity: 'common', emoji: '🧴', desc: 'Наносит SPF даже ночью', tag: 'looksmax' },
  { id: 'domashniy-chelyustem',name: 'Домашний Челюстем',  rarity: 'common', emoji: '🏋️', desc: 'Качает челюсть по видео из тиктока', tag: 'looksmax' },
  { id: 'tonik-tiktoker',      name: 'Тоник-Тиктокер',     rarity: 'common', emoji: '🧪', desc: 'Мажет лицо кислотой и называет это уходом', tag: 'looksmax' },
  { id: 'jawline-joe',         name: 'Джавлайн Джо',       rarity: 'uncommon', emoji: '🗿', desc: 'Челюсть из гранита, мысли из камня', tag: 'looksmax' },
  { id: 'hunter-eyes',         name: 'Хантер Айз',         rarity: 'uncommon', emoji: '🦅', desc: 'Взгляд хищника, лайки гарантированы', tag: 'looksmax' },
  { id: 'canthal-tilt',        name: 'Кантал-Тилт',        rarity: 'uncommon', emoji: '📐', desc: 'Наклон глаз решает всё', tag: 'looksmax' },
  { id: 'bonesmasher',         name: 'Бонсмашер',          rarity: 'rare', emoji: '🔨', desc: 'Стучит по челюсти во имя красоты', tag: 'looksmax' },
  { id: 'mogger-3000',         name: 'Моггер 3000',        rarity: 'rare', emoji: '🕶️', desc: 'Моггует всех в радиусе трёх метров', tag: 'looksmax' },
  { id: 'gigachad',            name: 'Гигачад',            rarity: 'epic', emoji: '💪', desc: 'Квадратная челюсть, квадратный пресс, квадратные скулы', tag: 'looksmax' },
  { id: 'stacy-psl',           name: 'Стейси PSL',         rarity: 'epic', emoji: '💅', desc: '9.9 по шкале looksmax', tag: 'looksmax' },
  { id: 'king-mewing',         name: 'Король Мьюинга',     rarity: 'legendary', emoji: '😤', desc: 'Его язык на нёбе держит вселенную', tag: 'looksmax' },
  { id: 'absolute-mogger',     name: 'Абсолютный Моггер',  rarity: 'unusual', emoji: '🌌', desc: 'Одним взглядом моггует целые галактики', tag: 'looksmax' },

  // Verity — 2
  { id: 'verity-cat',          name: 'Верити-Кот',         rarity: 'epic', emoji: '😼', desc: 'Говорит правду, даже когда не просят', tag: 'verity' },
  { id: 'verity-owl',          name: 'Верити-Сова',        rarity: 'legendary', emoji: '🦉', desc: 'Знает всю правду и молчит за деньги', tag: 'verity' },
  // Lovity — 2
  { id: 'lovity-frog',         name: 'Ловити-Жаба',        rarity: 'epic', emoji: '🐸', desc: 'Любит всех, особенно себя', tag: 'lovity' },
  { id: 'lovity-dumpling',     name: 'Ловити-Пельмень',    rarity: 'legendary', emoji: '🥟', desc: 'Любовь с первого укуса', tag: 'lovity' },
  // Falsity — 2
  { id: 'falsity-fox',         name: 'Фолсити-Лис',        rarity: 'rare', emoji: '🦊', desc: 'Врёт красиво и с улыбкой', tag: 'falsity' },
  { id: 'falsity-shadow',      name: 'Фолсити-Тень',       rarity: 'epic', emoji: '🌑', desc: 'Его не существует, но он врёт', tag: 'falsity' },
  // Virity — 2
  { id: 'virity-pixel',        name: 'Виртити-Пиксель',    rarity: 'rare', emoji: '👾', desc: 'Вирусный на уровне пикселей', tag: 'virity' },
  { id: 'virity-drone',        name: 'Виртити-Дрон',       rarity: 'legendary', emoji: '🛸', desc: 'Снимает вирусный контент с орбиты', tag: 'virity' },
  // Mogity — 2
  { id: 'mogity-chad',         name: 'Моггити-Гигачад',    rarity: 'epic', emoji: '😎', desc: 'Моггует всех, даже зеркало', tag: 'mogity' },
  { id: 'mogity-king',         name: 'Моггити-Король',     rarity: 'unusual', emoji: '🤴', desc: 'Король моггинга, смотрит свысока', tag: 'mogity' },
  // Rarest — 2
  { id: 'rarest-prime',        name: 'Прайм-Редкость',     rarity: 'unusual', emoji: '💎', desc: 'Существует в одном экземпляре во вселенной', tag: 'rarest' },
  { id: 'rarest-zero',         name: 'Нулевая Редкость',   rarity: 'unusual', emoji: '🌟', desc: 'Шанс настолько мал, что это уже легенда', tag: 'rarest' },

  /* ================= v0.3: ещё больше брейнротов ================= */
  // common — новые
  { id: 'suharik-veteran',     name: 'Сухарик-Ветеран',    rarity: 'common', emoji: '🥖', desc: 'Воевал с чаем и вышел сухим из воды' },
  { id: 'tapok-begun',         name: 'Тапок-Бегун',        rarity: 'common', emoji: '🏃', desc: 'Убегает от носков уже десять лет' },
  { id: 'shipuchka-tok',       name: 'Шипучка-Ток',        rarity: 'common', emoji: '🥤', desc: 'Шипит громче, чем твой начальник' },
  { id: 'sosiska-turist',      name: 'Сосиска-Турист',     rarity: 'common', emoji: '🌭', desc: 'Объездил все шашлыки района' },
  { id: 'moloko-kosmicheskoe', name: 'Молоко Космическое', rarity: 'common', emoji: '🥛', desc: 'Убежало дальше, чем планировало' },
  { id: 'kartoshka-fri',       name: 'Картошка-Фри',       rarity: 'common', emoji: '🍟', desc: 'Солёная, хрустящая и немного уставшая' },
  { id: 'myshka-setevaya',     name: 'Мышка-Сетевая',      rarity: 'common', emoji: '🖱️', desc: 'Кликает быстрее, чем ты думаешь' },
  { id: 'nemytaya-kruzhka',    name: 'Немытая Кружка',     rarity: 'common', emoji: '☕', desc: 'На дне живёт новая цивилизация' },
  { id: 'vata-sladkaya',       name: 'Ватная Сладость',    rarity: 'common', emoji: '🍬', desc: 'Липнет ко всему, кроме обещаний' },
  { id: 'goroh-telepat',       name: 'Горох-Телепат',      rarity: 'common', emoji: '🟢', desc: 'Знает, что ты собирался приготовить его' },
  // uncommon — новые
  { id: 'pelmeniy-mladshiy',   name: 'Пельмений Младший',  rarity: 'uncommon', emoji: '🍽️', desc: 'Наследник престола, но пока в морозилке' },
  { id: 'syrnyy-monah',        name: 'Сырный Монах',       rarity: 'uncommon', emoji: '🧀', desc: 'Молится на плесень и пост' },
  { id: 'chipsy-bos',          name: 'Чипсы-Босс',         rarity: 'uncommon', emoji: '🥔', desc: 'Только одна пачка — и весь отдел твой' },
  { id: 'kuritsa-elektro',     name: 'Курица-Электро',     rarity: 'uncommon', emoji: '🍗', desc: 'Заярил себя сама, без сковороды' },
  { id: 'baget-mudrets',       name: 'Багет-Мудрец',       rarity: 'uncommon', emoji: '🥖', desc: 'Чёрствый снаружи, добрый внутри' },
  { id: 'sok-i-zhmyh',         name: 'Сок и Жмых',         rarity: 'uncommon', emoji: '🧃', desc: 'Две сущности в одной упаковке' },
  { id: 'kefir-buntar',        name: 'Кефир-Бунтарь',      rarity: 'uncommon', emoji: '🥛', desc: 'Бродит против системы' },
  { id: 'ponchik-soldat',      name: 'Пончик-Солдат',      rarity: 'uncommon', emoji: '🍩', desc: 'Липкий снаружи, стратег внутри' },
  // rare — новые
  { id: 'shaverma-vulkan',     name: 'Шаверма-Вулкан',     rarity: 'rare', emoji: '🌋', desc: 'Чесночный соус выходит на поверхность' },
  { id: 'borshch-titan',       name: 'Борщ-Титан',         rarity: 'rare', emoji: '🍲', desc: 'Варится со времён основания деревни' },
  { id: 'kvas-vek',            name: 'Квас-Век',           rarity: 'rare', emoji: '🍺', desc: 'Древний напиток с живым характером' },
  { id: 'holodets-hunter',     name: 'Холодец-Охотник',    rarity: 'rare', emoji: '🍖', desc: 'Застывает прямо в момент атаки' },
  { id: 'tvorozhok-yoga',      name: 'Творожок-Йога',      rarity: 'rare', emoji: '🧘', desc: 'Просветлел, но остался творожком' },
  { id: 'kaban-chill',         name: 'Кабан-Чилл',         rarity: 'rare', emoji: '🐗', desc: 'Двигается медленно, но уверенно' },
  { id: 'goose-gang',          name: 'Гусь-Гэнг',          rarity: 'rare', emoji: '🪿', desc: 'Ходит не один — он с вайбом' },
  { id: 'soska-chempion',      name: 'Сосиска-Чемпион',    rarity: 'rare', emoji: '🏆', desc: 'Победила в забеге по кипятку' },
  // epic — новые
  { id: 'gigapelmen-omega',    name: 'Гигапельмень-Омега', rarity: 'epic', emoji: '🥟', desc: 'Финал эволюции теста и фарша' },
  { id: 'kondensator-zhizni',  name: 'Конденсатор Жизни',  rarity: 'epic', emoji: '🔋', desc: 'Копит энергию с 2019 года' },
  { id: 'servernyy-god',       name: 'Серверный Бог',      rarity: 'epic', emoji: '🖥️', desc: 'Никогда не падает, кроме среды' },
  { id: 'manometr-dushi',      name: 'Манометр Души',      rarity: 'epic', emoji: '📈', desc: 'Показывает давление мемов в крови' },
  { id: 'farsh-9000',          name: 'Фарш-9000',          rarity: 'epic', emoji: '🥩', desc: 'Перемалывает всё: котлеты и мнения' },
  { id: 'kholodilnyy-bog',     name: 'Холодильный Бог',    rarity: 'epic', emoji: '🧊', desc: 'Придёт за твоей колбасой в час ночи' },
  // legendary — новые
  { id: 'vlastelin-cheburek',  name: 'Властелин Чебурек',  rarity: 'legendary', emoji: '🥟', desc: 'Один укус — и ты его должник' },
  { id: 'drevniy-borshchevar', name: 'Древний Борщевар',   rarity: 'legendary', emoji: '🍲', desc: 'Варит борщ на звёздном огне' },
  { id: 'imperator-shaurmy',   name: 'Император Шаурмы',   rarity: 'legendary', emoji: '👑', desc: 'Соус течёт по его венам' },
  { id: 'povelitel-holodtsa',  name: 'Повелитель Холодца', rarity: 'legendary', emoji: '🍖', desc: 'Заставляет дрожать даже желатин' },
  // unusual — новые
  { id: 'nulevoy-klient',      name: 'Нулевой Клиент',     rarity: 'unusual', emoji: '🚪', desc: 'Заходит и не заходит. Классика' },
  { id: 'vechnyy-ping',        name: 'Вечный Пинг',        rarity: 'unusual', emoji: '📶', desc: 'Отвечает через две эпохи' },
  { id: 'arhiv-vselennoy',     name: 'Архив Вселенной',    rarity: 'unusual', emoji: '🗄️', desc: 'Хранит все удалённые мемы' },
  { id: 'posledniy-soevyy',    name: 'Последний Соевый',   rarity: 'unusual', emoji: '🌱', desc: 'Единственный, кто остался после соуса' },
  { id: 'pereklyuchenie',      name: 'Переключение',       rarity: 'unusual', emoji: '🔀', desc: 'Ты уже не помнишь, зачем сюда зашёл' },
  { id: 'tishe-tishe',         name: 'Тише-Тише',          rarity: 'unusual', emoji: '🤏', desc: 'Настолько тихо, что слышно интернет' },
];

const BRAINROT_BY_ID = Object.fromEntries(BRAINROTS.map(b => [b.id, b]));

/* ---------- Хелперы ---------- */
function rarityById(id) { return RARITY_BY_ID[id] || RARITY_BY_ID.common; }
function buffById(id) { return BUFF_BY_ID[id] || null; }
function brainrotById(id) { return BRAINROT_BY_ID[id] || null; }
function brainrotsByRarity(rarity) { return BRAINROTS.filter(b => b.rarity === rarity); }
function normalBrainrotsByRarity(rarity) { return BRAINROTS.filter(function (b) { return b.rarity === rarity && !b.tag; }); }
function looksmaxBrainrots() { return BRAINROTS.filter(function (b) { return b.tag === 'looksmax'; }); }
function brainrotsByTag(tag) { return BRAINROTS.filter(function (b) { return b.tag === tag; }); }
