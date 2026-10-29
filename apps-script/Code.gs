/**
 * TRIALS OF OLYMPUS — Apps Script server (all-in-one)
 * Paste this WHOLE file into Code.gs in Apps Script (replace everything), Save, then
 * Deploy > Manage deployments > Edit > Version: New version > Deploy.
 * Generated from server/*.js by tools/build-apps-script.js — edit those files, not this one.
 */

// ===================== Config =====================
/**
 * SERVER SETTINGS  (Apps Script)
 * ---------------------------------------------------------------
 * Change values here, then redeploy:
 *   Deploy > Manage deployments > (pencil) Edit > Version: New version > Deploy
 * The teacher password and fluency cut-offs live in the "Settings" sheet,
 * not here, so they can be changed without redeploying.
 */
var CONFIG = {
  // Which version of the server code this is. js/config.js has the matching SERVER_VERSION; if they differ,
  // the teacher page shows a warning that Apps Script is running old code. Change BOTH when the server changes.
  SERVER_VERSION: 9,

  // Number of levels per operation. Must match js/levels.js.
  LEVEL_COUNTS: { mul: 18, div: 18, add: 13, sub: 11 },
  OPS: ['add', 'sub', 'mul', 'div'],

  // ---- Fluency rules ----
  RECENT_ATTEMPTS: 3,          // fluency = average of this many most recent attempts at a level
  MIN_ATTEMPTS_FOR_FLUENCY: 1, // attempts needed at a level before it can count as fluent (<= RECENT_ATTEMPTS). 1 = one fast try is enough
  DUST_PER_WEEK: 0.5,          // seconds of "dust" added for each new week since the level was last played
  TZ_OFFSET_HOURS: 8,          // Perth (WA has no daylight saving). A new week starts Monday 00:00 local time.
  DEFAULT_CUTOFF: 3.0,         // seconds per correct answer; used until the teacher saves cut-offs
  MIN_ATTEMPT_SECONDS: 20,     // games shorter than this (e.g. joined very late) are not saved to profiles
  MIN_PASSWORD_LENGTH: 4,      // students choose their own password on first log-in

  // ---- Scoring ----
  // Time per correct answer = (seconds played + WRONG_PENALTY_SEC for every wrong answer) / correct answers.
  // Used for winning a class round AND for fluency levels. Lower is better. There are no points.
  WRONG_PENALTY_SEC: 1,

  // ---- Team balancing ----
  // Each student's expected seconds-per-correct = their average time at THEIR current level for the chosen operation.
  // Teams are formed so the teams' average expected times are as close as possible (lowest standard deviation).
  // If a student has never played their current level, expected = cut-off + UNKNOWN_EXTRA.
  UNKNOWN_EXTRA: 1.5,
  BALANCE_ADD_DUST: false,     // false = balance on the real average of recent attempts; true = average + dust (the "fluency time")
  BALANCE_RESTARTS: 40,        // how many different starting line-ups the balancer tries (more = more even, slightly slower)

  // ---- Trophy cabinet ----
  // Every player on the winning team of a class round gets the same trophy (picked at random from this list).
  // Straight after winning they choose: put it in the cabinet, or re-roll it (see REROLL_*).
  // Each week they keep ONE trophy: at Sunday 00:00 Perth time the one they chose is locked into their cabinet
  // for good and the rest of that week's trophies are cleared. If they didn't choose, their best one is kept
  // (platinum first, then the newest).
  // The emoji are shown gold (or platinum) on screen by CSS filters in css/style.css, so any emoji works here.
  TROPHIES: [
    ['🏆', 'Golden Cup'], ['👑', 'Crown of Olympus'], ['🦉', 'Owl of Athena'], ['⚡', 'Thunderbolt of Zeus'],
    ['🔱', 'Trident of Poseidon'], ['🏺', 'Golden Amphora'], ['🐎', 'Golden Pegasus'], ['🦁', 'Nemean Lion'],
    ['🛡️', 'Shield of Achilles'], ['⚔️', 'Sword of Perseus'], ['🏛️', 'Golden Temple'], ['🌿', 'Laurel Wreath'],
    ['🐉', 'Golden Hydra'], ['🦅', 'Eagle of Zeus'], ['🐂', 'Golden Bull'], ['🐑', 'Golden Fleece'],
    ['🍎', 'Golden Apple'], ['☀️', 'Sun of Helios'], ['🔥', 'Flame of Olympus'], ['🏹', 'Bow of Artemis'],
    ['🎭', 'Mask of Dionysus'], ['🐍', 'Serpent of Medusa'], ['⛵', 'Ship of the Argonauts'], ['🦚', 'Peacock of Hera'],
    ['🥇', 'Olympic Gold'], ['🌟', 'Star of Olympus'], ['🐬', 'Dolphin of Apollo'], ['🗿', 'Head of the Titan']
  ],
  TROPHY_SHELF_MAX: 60,        // most trophies held in one week before the weekly keep (oldest drop off first)
  REROLL_PLATINUM_CHANCE: 0.05, // re-roll: chance the trophy becomes platinum
  REROLL_LOSE_CHANCE: 0.95,     // re-roll: chance the trophy is lost. Anything left over (1 - both) = stays gold and can be re-rolled again

  // ---- Timing / traffic ----
  START_DELAY_MS: 8000,        // countdown before a class game starts. Must be longer than the student lobby poll (js/config.js)
  PLAY_AGAIN_DELAY_MS: 10000,  // countdown when the teacher presses Play again on the results screen
                               // (students on the results screen check every 4–5 s, so this is a little longer)
  SUBMIT_GRACE_MS: 15000,      // after the game ends, wait this long for late results before finishing anyway
  PRESENCE_TTL_SEC: 30,        // a student stops counting as "in the room" if their class-game screen hasn't checked in for this long
                               // (screens check in every 3–4 s; must stay well above the slowest student poll in js/config.js)
  SESSION_TTL_SEC: 21600,      // login lasts 6 hours (CacheService maximum)
  ROOM_TTL_SEC: 21600,         // a room lasts 6 hours (CacheService maximum)
  LIST_CACHE_SEC: 300,         // Students/Settings sheets are re-read at most every 5 minutes

  // Team / player code names (students never see each other's real names). Colour + creature of Greek myth.
  TEAM_NAMES: [
    ['Titans', '🗿'], ['Spartans', '🛡️'], ['Cyclopes', '👁️'], ['Minotaurs', '🐂'], ['Centaurs', '🏹'], ['Pegasi', '🐎'],
    ['Griffins', '🦅'], ['Hydras', '🐉'], ['Krakens', '🐙'], ['Sphinxes', '🦁'], ['Harpies', '🪶'], ['Gorgons', '🐍'],
    ['Phoenixes', '🔥'], ['Argonauts', '⛵'], ['Olympians', '⚡'], ['Sirens', '🧜'], ['Satyrs', '🐐'], ['Furies', '🌪️'],
    ['Heroes', '⚔️'], ['Oracles', '🔮'], ['Nymphs', '🌿'], ['Giants', '⛰️'], ['Owls of Athena', '🦉'], ['Tridents', '🔱'],
    ['Thunderbolts', '🌩️'], ['Chariots', '🏺'], ['Lions of Nemea', '🦁'], ['Boars of Erymanthus', '🐗'], ['Stymphalian Birds', '🐦'], ['Fleece Hunters', '🐑'],
    ['Labyrinth Runners', '🌀'], ['Trojan Horses', '🐴'], ['Laurel Crowns', '👑'], ['Torchbearers', '🔦'], ['Sea Serpents', '🌊'], ['Sun Chariots', '☀️']
  ],
  TEAM_COLOURS: ['Crimson', 'Azure', 'Emerald', 'Golden', 'Violet', 'Bronze', 'Silver', 'Coral', 'Teal', 'Obsidian', 'Olive', 'Indigo'],
  TEAM_HEX: {
    Crimson: '#c0313f', Azure: '#2f6fd6', Emerald: '#1f8f5c', Golden: '#c9971c', Violet: '#7d4cc4', Bronze: '#a5672d',
    Silver: '#7c8494', Coral: '#e2614f', Teal: '#138a84', Obsidian: '#2b2d3a', Olive: '#6b7a22', Indigo: '#3b3fa8'
  }
};


// ===================== Store =====================
/**
 * STORAGE  (Google Sheet + CacheService)
 * ---------------------------------------------------------------
 * All sheet reads/writes live in this file. Everything else calls these helpers.
 *
 * Traffic strategy:
 *  - Students / Settings / Profiles are cached in CacheService, so most requests never touch the sheet.
 *  - Rooms live ONLY in CacheService (never in the sheet).
 *  - A class game writes to the sheet ONCE, when the teacher's screen finishes the round.
 */
var SHEETS = {
  Students: ['id', 'name', 'password', 'active'],
  Profiles: ['id', 'profileJson', 'updated'],
  Attempts: ['timestamp', 'id', 'name', 'mode', 'op', 'level', 'correct', 'wrong', 'seconds', 'avgTime', 'unused', 'room'],
  Settings: ['key', 'value']
};

function ss_() { return SpreadsheetApp.getActive(); }
function sheet_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) throw new Error('Missing sheet "' + name + '". Run setup() from the Apps Script editor first.');
  return s;
}
function cache_() { return CacheService.getScriptCache(); }
function cacheGetJSON_(key) { var v = cache_().get(key); return v ? JSON.parse(v) : null; }
function cachePutJSON_(key, obj, ttl) { cache_().put(key, JSON.stringify(obj), ttl); }

/** Run fn while holding the script lock (serialises all writes). */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function isActive_(v) {
  if (v === '' || v === null || v === undefined) return true;
  return !(v === false || String(v).toLowerCase() === 'false' || String(v).toLowerCase() === 'no');
}

/** [{id, name, password, active}] */
function getStudents_() {
  var c = cacheGetJSON_('students');
  if (c) return c;
  var vals = sheet_('Students').getDataRange().getValues();
  var list = [];
  for (var i = 1; i < vals.length; i++) {
    var id = String(vals[i][0]).trim();
    if (!id) continue;
    list.push({ id: id, name: String(vals[i][1]).trim(), password: String(vals[i][2]).trim(), active: isActive_(vals[i][3]) });
  }
  cachePutJSON_('students', list, CONFIG.LIST_CACHE_SEC);
  return list;
}
function findStudent_(id) {
  var list = getStudents_();
  for (var i = 0; i < list.length; i++) if (list[i].id === String(id)) return list[i];
  return null;
}

/** Reads the Students sheet directly (skips the cache) — used before changing a password. */
function findStudentFresh_(id) {
  cache_().remove('students');
  return findStudent_(id);
}

/** Writes one student's password into the Students sheet (column C). Call inside withLock_. */
function setStudentPassword_(id, password) {
  var sh = sheet_('Students');
  var last = sh.getLastRow();
  if (last < 2) throw new Error('Student not found');
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id)) {
      sh.getRange(i + 2, 3, 1, 1).setValues([[password]]);
      cache_().remove('students');
      return;
    }
  }
  throw new Error('Student not found');
}

/** {key: value} from the Settings sheet */
function getSettings_() {
  var c = cacheGetJSON_('settings');
  if (c) return c;
  var vals = sheet_('Settings').getDataRange().getValues();
  var out = {};
  for (var i = 1; i < vals.length; i++) if (vals[i][0] !== '') out[String(vals[i][0]).trim()] = vals[i][1];
  cachePutJSON_('settings', out, CONFIG.LIST_CACHE_SEC);
  return out;
}
function saveSettings_(updates) {
  var sh = sheet_('Settings');
  var vals = sh.getDataRange().getValues();
  var rowOf = {};
  for (var i = 1; i < vals.length; i++) rowOf[String(vals[i][0]).trim()] = i;
  var extra = [];
  Object.keys(updates).forEach(function (k) {
    if (rowOf[k] !== undefined) vals[rowOf[k]][1] = updates[k];
    else extra.push([k, updates[k]]);
  });
  sh.getRange(1, 1, vals.length, 2).setValues(vals.map(function (r) { return [r[0], r[1]]; }));
  if (extra.length) sh.getRange(vals.length + 1, 1, extra.length, 2).setValues(extra);
  cache_().remove('settings');
}

/* ---------- Profiles: one JSON blob per student ---------- */

function loadAllProfiles_() {
  var sh = sheet_('Profiles');
  var last = sh.getLastRow();
  var map = {};
  if (last > 1) {
    var vals = sh.getRange(2, 1, last - 1, 2).getValues();
    vals.forEach(function (r) { if (r[0] !== '') map[String(r[0])] = r[1] ? JSON.parse(r[1]) : {}; });
  }
  var put = {};
  getStudents_().forEach(function (s) { put['prof:' + s.id] = JSON.stringify(map[s.id] || {}); });
  if (Object.keys(put).length) cache_().putAll(put, CONFIG.ROOM_TTL_SEC);
  return map;
}
/** {id: profile} for the given ids. One sheet read at most. */
function getProfiles_(ids) {
  var keys = ids.map(function (id) { return 'prof:' + id; });
  var got = cache_().getAll(keys) || {};
  var out = {}, missing = false;
  ids.forEach(function (id) {
    var v = got['prof:' + id];
    if (v) out[id] = JSON.parse(v); else missing = true;
  });
  if (missing) {
    var all = loadAllProfiles_();
    ids.forEach(function (id) { if (!out[id]) out[id] = all[id] || {}; });
  }
  return out;
}
function getProfile_(id) { return getProfiles_([id])[id]; }

/** updates = {id: profileObject}. Call inside withLock_. One read + one write. */
function saveProfiles_(updates) {
  var ids = Object.keys(updates);
  if (!ids.length) return;
  var sh = sheet_('Profiles');
  var last = sh.getLastRow();
  var vals = last > 1 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
  var rowOf = {};
  vals.forEach(function (r, i) { rowOf[String(r[0])] = i; });
  var now = new Date(), add = [], put = {};
  ids.forEach(function (id) {
    var json = JSON.stringify(updates[id]);
    put['prof:' + id] = json;
    if (rowOf[id] !== undefined) { vals[rowOf[id]][1] = json; vals[rowOf[id]][2] = now; }
    else add.push([id, json, now]);
  });
  if (vals.length) sh.getRange(2, 1, vals.length, 3).setValues(vals);
  if (add.length) sh.getRange(vals.length + 2, 1, add.length, 3).setValues(add);
  cache_().putAll(put, CONFIG.ROOM_TTL_SEC);
}

/** rows = arrays matching SHEETS.Attempts. One write. */
function appendAttempts_(rows) {
  if (!rows.length) return;
  var sh = sheet_('Attempts');
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

/* ---------- Setup & maintenance (run from the Apps Script editor / sheet menu) ---------- */

/** Creates the four sheets with headers and starter rows. Safe to run more than once. */
function setup() {
  var ss = ss_();
  Object.keys(SHEETS).forEach(function (name) {
    var s = ss.getSheetByName(name);
    if (!s) {
      s = ss.insertSheet(name);
      s.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]);
      s.setFrozenRows(1);
    }
  });
  var st = sheet_('Settings');
  if (st.getLastRow() < 2) {
    st.getRange(2, 1, 5, 2).setValues([
      ['teacherPassword', 'changeme'],
      ['cutoff_mul', CONFIG.DEFAULT_CUTOFF], ['cutoff_div', CONFIG.DEFAULT_CUTOFF],
      ['cutoff_add', CONFIG.DEFAULT_CUTOFF], ['cutoff_sub', CONFIG.DEFAULT_CUTOFF]
    ]);
  }
  var stu = sheet_('Students');
  if (stu.getLastRow() < 2) {
    // Leave password blank: students create their own the first time they log in.
    stu.getRange(2, 1, 2, 4).setValues([['s01', 'Example Student A', '', true], ['s02', 'Example Student B', '', true]]);
  }
  clearCache();
}

/** Clears cached sheet data. Run after editing Students, Settings or Profiles by hand. */
function clearCache() {
  var keys = ['students', 'settings'];
  try { getStudents_().forEach(function (s) { keys.push('prof:' + s.id); }); } catch (e) { /* sheets not set up yet */ }
  cache_().removeAll(keys);
}

/** Adds a "Fluency Game" menu to the spreadsheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Fluency Game')
    .addItem('Set up sheets', 'setup')
    .addItem('Refresh cached data (after editing sheets)', 'clearCache')
    .addToUi();
}


// ===================== Fluency =====================
/**
 * FLUENCY RULES  (levels, dust, profiles)
 * ---------------------------------------------------------------
 * Stored profile shape (one JSON blob per student in the Profiles sheet):
 *   { mul: { "4": { r: [3.1, 2.8, 2.9], n: 7, t: 1729500000000 } }, add: {...}, ... }
 *     r = seconds-per-correct for the most recent attempts (max CONFIG.RECENT_ATTEMPTS)
 *     n = total attempts ever at this level
 *     t = time of the last attempt (ms) — dust is counted from here
 *
 * Rules:
 *   attempt time   = (seconds played + WRONG_PENALTY_SEC (1 s) per wrong answer) / correct answers
 *   fluency time   = average of the last 3 attempts (or fewer, if fewer have been played) + dust
 *   dust           = 0.5 s for every new week (Monday) since the level was last played
 *   fluent         = at least MIN_ATTEMPTS_FOR_FLUENCY attempts (currently 1) AND fluency time <= cut-off
 *   current level  = the LOWEST level that is not fluent, counting levels never tried as not fluent
 *                    (e.g. L1 1.2 s, L2 1.1 s, nothing else tried, cut-off 3 s -> Level 3).
 *                    Dusty levels still pull a student back to revise them.
 */

function round2_(x) { return Math.round(x * 100) / 100; }

/** Monday-based week number in local time. */
function weekIndex_(ms) {
  var day = Math.floor((ms + CONFIG.TZ_OFFSET_HOURS * 3600000) / 86400000); // days since 1 Jan 1970 (a Thursday)
  return Math.floor((day + 3) / 7);
}
function dustFor_(lastMs, nowMs) {
  if (!lastMs) return 0;
  return Math.max(0, weekIndex_(nowMs) - weekIndex_(lastMs)) * CONFIG.DUST_PER_WEEK;
}

function cutoffs_() {
  var s = getSettings_(), out = {};
  CONFIG.OPS.forEach(function (op) { out[op] = Number(s['cutoff_' + op]) || CONFIG.DEFAULT_CUTOFF; });
  return out;
}

/** Seconds per correct answer, with WRONG_PENALTY_SEC added for every wrong answer. Unrounded. */
function rawTime_(seconds, correct, wrong) {
  return (Number(seconds) + (Number(wrong) || 0) * CONFIG.WRONG_PENALTY_SEC) / Math.max(Number(correct) || 0, 1);
}
function attemptTime_(seconds, correct, wrong) { return round2_(rawTime_(seconds, correct, wrong)); }

function levelStats_(entry, cutoff, now) {
  if (!entry || !entry.r || !entry.r.length) return { attempts: 0, avg: null, dust: 0, time: null, fluent: false, last: null };
  var r = entry.r.slice(-CONFIG.RECENT_ATTEMPTS);
  var avg = r.reduce(function (a, b) { return a + b; }, 0) / r.length;
  var dust = dustFor_(entry.t, now);
  var time = avg + dust;
  var need = Math.min(CONFIG.MIN_ATTEMPTS_FOR_FLUENCY, CONFIG.RECENT_ATTEMPTS);
  return {
    attempts: entry.n || r.length,
    recent: r,
    avg: round2_(avg),
    dust: dust,
    time: round2_(time),
    fluent: r.length >= need && time <= cutoff,
    last: entry.t || null
  };
}

/** Summary of one operation: {current, mastered, cutoff, levels:[{level, attempts, avg, dust, time, fluent}]} */
function opSummary_(profile, op, cutoff, now) {
  var n = CONFIG.LEVEL_COUNTS[op], levels = [], current = null;
  var data = (profile && profile[op]) || {};
  for (var L = 1; L <= n; L++) {
    var st = levelStats_(data[L], cutoff, now);
    st.level = L;
    levels.push(st);
    if (current === null && !st.fluent) current = L;
  }
  return { current: current === null ? n : current, mastered: current === null, cutoff: cutoff, levels: levels };
}

/** What the student app displays. */
function profileView_(profile) {
  var now = Date.now(), cut = cutoffs_(), out = {};
  CONFIG.OPS.forEach(function (op) { out[op] = opSummary_(profile, op, cut[op], now); });
  return out;
}

/** Adds one attempt to a profile object (mutates it). */
function recordAttempt_(profile, op, level, time, now) {
  profile[op] = profile[op] || {};
  var e = profile[op][level] || { r: [], n: 0 };
  e.r.push(round2_(time));
  if (e.r.length > CONFIG.RECENT_ATTEMPTS) e.r = e.r.slice(-CONFIG.RECENT_ATTEMPTS);
  e.n = (e.n || 0) + 1;
  e.t = now;
  profile[op][level] = e;
}

/**
 * Expected seconds-per-correct at the student's current level for this operation (used to balance teams).
 * = average of their recent attempts at that level (+ dust only if CONFIG.BALANCE_ADD_DUST).
 * Never played that level: cut-off + UNKNOWN_EXTRA (an estimate, not a measurement).
 */
function expectedTime_(summary) {
  var st = summary.levels[summary.current - 1];
  if (st.avg === null) return round2_(summary.cutoff + CONFIG.UNKNOWN_EXTRA);
  return CONFIG.BALANCE_ADD_DUST ? st.time : st.avg;
}

function validOpLevel_(op, level) {
  return CONFIG.LEVEL_COUNTS.hasOwnProperty(op) && level >= 1 && level <= CONFIG.LEVEL_COUNTS[op] && Math.floor(level) === level;
}


// ===================== Trophies =====================
/**
 * TROPHY CABINET
 * ---------------------------------------------------------------
 * Each student's cabinet is stored inside their profile JSON (Profiles sheet), so no new sheet is needed:
 *   profile.cab = { wk, items: [trophy, ...newest first], keep: id | null, locked: [trophy + {wk}, ...newest first] }
 *   trophy      = { id, e: '🦉', n: 'Owl of Athena', op: 'mul', team: 'Azure Krakens', t: 1729500000000,
 *                   plat: true (platinum) | absent, open: true (not decided yet: keep or re-roll) | absent }
 *
 * Rules:
 *  - Every player on the winning team of a class round (who sent in a result) gets the same trophy. It goes
 *    into this week's trophies straight away, "open" (undecided).
 *  - Undecided trophy: the student either puts it in the cabinet as it is (decides it), or re-rolls it:
 *    REROLL_PLATINUM_CHANCE (5%) it becomes platinum, REROLL_LOSE_CHANCE (95%) it is lost, otherwise it stays
 *    gold and undecided. They can choose on the win screen or later in the cabinet. Platinum can't be re-rolled.
 *  - One trophy per week is kept: the student taps the one to keep. At the start of the next trophy week
 *    (Sunday 00:00 Perth) that trophy is LOCKED into the cabinet for good and the week's other trophies are cleared.
 *    If they didn't choose, their best trophy is kept: platinum first, then the newest.
 *  - Locking happens whenever the cabinet is next read or changed, so no timed trigger is needed.
 *  - Older cabinets (v6/v7) had a "favourite": it is locked in (or, if it was won this week, kept as this week's choice).
 */

var DAY_MS_ = 86400000;

/** Sunday-based week number in local time (day 0 = Thursday 1 Jan 1970, so day 3 is a Sunday). */
function trophyWeek_(ms) {
  var day = Math.floor((ms + CONFIG.TZ_OFFSET_HOURS * 3600000) / DAY_MS_);
  return Math.floor((day + 4) / 7);
}
/** Time (ms) the given trophy week ends, i.e. the next Sunday 00:00 local time. */
function trophyWeekEnds_(wk) {
  return ((wk + 1) * 7 - 4) * DAY_MS_ - CONFIG.TZ_OFFSET_HOURS * 3600000;
}
/** Time (ms) the given trophy week starts (Sunday 00:00 local time). */
function trophyWeekStarts_(wk) { return trophyWeekEnds_(wk) - 7 * DAY_MS_; }

function copyTrophy_(t) { var c = {}; Object.keys(t).forEach(function (k) { c[k] = t[k]; }); return c; }

/** The trophy that will be locked in this week: the chosen one, else platinum first, then newest. */
function weekKeeper_(cab) {
  var items = cab.items || [], i;
  if (cab.keep) for (i = 0; i < items.length; i++) if (items[i].id === cab.keep) return items[i];
  var best = null;
  items.forEach(function (t) {
    if (!best || (!!t.plat !== !!best.plat ? !!t.plat : t.t > best.t)) best = t;
  });
  return best;
}

/** Locks the week's keeper into the cabinet and clears the week. */
function lockWeek_(cab) {
  var k = weekKeeper_(cab);
  if (k) {
    var lockedT = copyTrophy_(k);
    delete lockedT.open;
    lockedT.wk = cab.wk;
    cab.locked.unshift(lockedT);
  }
  cab.items = []; cab.keep = null;
}

/** The student's cabinet, after locking any finished week. Mutates the profile. */
function cabinet_(profile, now) {
  var wk = trophyWeek_(now);
  var cab = profile.cab || { wk: wk, items: [], keep: null, locked: [] };
  if (!cab.items) cab.items = [];
  if (!cab.locked) cab.locked = [];
  if (cab.keep === undefined) cab.keep = null;
  if (cab.wk === undefined) cab.wk = wk;
  if (cab.fav) { // v6/v7 favourite
    var fav = cab.fav; delete cab.fav;
    var favWk = trophyWeek_(fav.t);
    if (favWk === cab.wk) { cab.items.unshift(fav); cab.items.sort(function (a, b) { return b.t - a.t; }); cab.keep = fav.id; }
    else { var lf = copyTrophy_(fav); lf.wk = favWk; cab.locked.unshift(lf); cab.locked.sort(function (a, b) { return b.wk - a.wk; }); }
  }
  if (cab.wk !== wk) { lockWeek_(cab); cab.wk = wk; }
  profile.cab = cab;
  return cab;
}

/** A random trophy, avoiding `notEmoji` (e.g. the previous round's) when possible. */
function pickTrophy_(notEmoji) {
  var list = CONFIG.TROPHIES.filter(function (t) { return t[0] !== notEmoji; });
  if (!list.length) list = CONFIG.TROPHIES;
  var t = list[Math.floor(Math.random() * list.length)];
  return { e: t[0], n: t[1] };
}

/** Adds a won trophy to this week's trophies, undecided (mutates the profile). Returns the stored trophy. */
function awardTrophy_(profile, trophy, op, teamName, now) {
  var cab = cabinet_(profile, now);
  var item = { id: now.toString(36) + Math.random().toString(36).slice(2, 7), e: trophy.e, n: trophy.n, op: op, team: teamName, t: now, open: true };
  cab.items.unshift(item);
  while (cab.items.length > CONFIG.TROPHY_SHELF_MAX) {
    var drop = cab.items.pop();
    if (drop.id === cab.keep) { cab.items.splice(cab.items.length - 1, 1, drop); } // never drop the chosen one
  }
  return item;
}

function findItem_(cab, id) {
  for (var i = 0; i < cab.items.length; i++) if (cab.items[i].id === id) return i;
  return -1;
}

/**
 * The student decides what to do with an undecided trophy.
 * choice 'keep'   -> it goes in the cabinet as it is.          outcome 'kept'
 * choice 'reroll' -> platinum (outcome 'platinum'), lost (outcome 'lost'), or stays gold and undecided ('gold').
 * rnd: optional random number 0..1 (tests); the server always uses Math.random.
 */
function decideTrophy_(profile, id, choice, now, rnd) {
  var cab = cabinet_(profile, now);
  var i = findItem_(cab, id);
  if (i < 0) throw new Error('That trophy isn\'t in your cabinet any more.');
  var t = cab.items[i];
  if (!t.open) throw new Error('You\'ve already decided about this trophy.');
  if (choice === 'keep') { delete t.open; return { outcome: 'kept', trophy: t }; }
  if (choice !== 'reroll') throw new Error('Unknown choice');
  var r = rnd === undefined ? Math.random() : rnd;
  if (r < CONFIG.REROLL_PLATINUM_CHANCE) { t.plat = true; delete t.open; return { outcome: 'platinum', trophy: t }; }
  if (r < CONFIG.REROLL_PLATINUM_CHANCE + CONFIG.REROLL_LOSE_CHANCE) {
    cab.items.splice(i, 1);
    if (cab.keep === id) cab.keep = null;
    return { outcome: 'lost', trophy: null };
  }
  return { outcome: 'gold', trophy: t };
}

/** The student picks which of this week's trophies to keep. */
function setKeeper_(profile, id, now) {
  var cab = cabinet_(profile, now);
  if (findItem_(cab, id) < 0) throw new Error('That trophy isn\'t in your cabinet any more.');
  cab.keep = id;
  return cab;
}

/** What the student app displays. */
function cabinetView_(profile, now) {
  var cab = cabinet_(profile, now);
  var k = weekKeeper_(cab);
  return {
    week: { items: cab.items, keeper: k ? k.id : null, chosen: !!cab.keep, locksAt: trophyWeekEnds_(cab.wk) },
    locked: cab.locked.map(function (t) { var c = copyTrophy_(t); c.from = trophyWeekStarts_(t.wk); return c; }),
    odds: { platinum: CONFIG.REROLL_PLATINUM_CHANCE, lose: CONFIG.REROLL_LOSE_CHANCE }
  };
}


// ===================== Rooms =====================
/**
 * ROOMS & TEAMS  (class multiplayer)
 * ---------------------------------------------------------------
 * A room lives only in CacheService (key "room:CODE"). There is one active room at a time
 * (key "activeRoom"), so students just press Multiplayer — no code to type.
 *
 * Room shape:
 * { code, status: 'lobby'|'playing'|'results', round, created, lastTrophy,
 *   players: { id: {name, joined} },
 *   game:    { op, seconds, teamCount, individual, balanceSd, startAt, endAt,
 *              teams: [{name, emoji, colour, hex, members:[id], exp}],
 *              assign: { id: {team, level, exp, est} } },
 *   subs:    { id: {c, w, s} },          // submitted results this round
 *   results: { teams:[...], personal:{ id:{...} } } }
 *
 *   exp  = expected seconds per correct answer (player: at their own level for this operation; team: average of its players)
 *   est  = true if the player has never played that level, so exp is an estimate (cut-off + UNKNOWN_EXTRA)
 *   balanceSd = standard deviation of the teams' exp values when the round started (lower = more even)
 *
 * Presence: while a student's class-game screen is open it checks in every few seconds (lobby, results,
 * waiting screens). Each check-in refreshes a short-lived cache key "seen:CODE:id". Only students whose key
 * still exists count as "in the room", so anyone who reloaded, closed the app, logged out, let the iPad
 * sleep or went to Practice drops off the teacher's list by themselves and is NOT put into the next round.
 *
 * Request pattern per class game (approx. 25 students):
 *   lobby polling (cache only) -> 1 start -> 0 requests while playing -> 25 small submits
 *   -> 1 finish (the only sheet write) -> results polling (cache only) -> 1 play again (or back to lobby)
 */

function newCode_() {
  var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ', s = '';
  for (var i = 0; i < 4; i++) s += A.charAt(Math.floor(Math.random() * A.length));
  return s;
}
function getRoom_(code) {
  var r = code ? cacheGetJSON_('room:' + code) : null;
  if (!r) throw new Error('ROOM_CLOSED');
  return r;
}
function saveRoom_(room) { cachePutJSON_('room:' + room.code, room, CONFIG.ROOM_TTL_SEC); }
function activeCode_() { return cache_().get('activeRoom'); }

function shuffle_(a) {
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* ---------- Presence (who is actually on the class-game screen) ---------- */

function seenKey_(code, id) { return 'seen:' + code + ':' + id; }
/** Called on every request from a student's class-game screen. No lock needed (one small cache write). */
function touch_(code, id) { if (code) cache_().put(seenKey_(code, id), '1', CONFIG.PRESENCE_TTL_SEC); }
function forget_(code, id) { cache_().remove(seenKey_(code, id)); }
/** ids of players whose class-game screen has checked in recently. */
function presentIds_(room) {
  var ids = Object.keys(room.players);
  if (!ids.length) return [];
  var got = cache_().getAll(ids.map(function (id) { return seenKey_(room.code, id); })) || {};
  return ids.filter(function (id) { return !!got[seenKey_(room.code, id)]; });
}
/** Removes players who have stopped checking in. Call inside withLock_. If they come back, their screen re-joins by itself. */
function pruneAbsent_(room) {
  var here = {};
  presentIds_(room).forEach(function (id) { here[id] = true; });
  Object.keys(room.players).forEach(function (id) { if (!here[id]) delete room.players[id]; });
}

/* ---------- Team forming ---------- */
/*
 * Goal (Haydn's rule): every team's AVERAGE expected time per correct answer should be as close as possible,
 * i.e. the standard deviation of the team averages is as low as possible. Each player's expected time is their
 * average at their OWN current level for the chosen operation, so students on different levels mix freely.
 *   e.g. A: L7 4.5 s, B: L3 7.2 s, C: L14 3.7 s  ->  team average (4.5 + 7.2 + 3.7) / 3 = 5.13 s
 *
 * Method: several starting line-ups (a snake draft, then random deals). From each one, keep making the single
 * best change — swap two players between teams, or move one player from a bigger team to a smaller one —
 * until no change lowers the spread. The most even result wins. Team sizes always differ by at most 1.
 */

/** Seconds per correct for an entry. Accepts {time} (current) or {rate} = 1/time (older callers). */
function entryTime_(e) { return e.time !== undefined && e.time !== null ? Number(e.time) : 1 / Number(e.rate); }

function sumT_(tm) { return tm.reduce(function (a, e) { return a + e.t; }, 0); }
function teamMean_(tm) { return sumT_(tm) / tm.length; }
/** Population variance of a list of team averages. */
function variance_(means) {
  var avg = means.reduce(function (a, b) { return a + b; }, 0) / means.length;
  return means.reduce(function (a, m) { return a + (m - avg) * (m - avg); }, 0) / means.length;
}
/** Standard deviation of the team averages. teams = arrays of {t}. */
function teamSpreadSd_(teams) { return Math.sqrt(variance_(teams.map(teamMean_))); }

/**
 * entries: [{id, time}] (time = expected seconds per correct answer).
 * numTeams: how many teams the teacher asked for (clamped to 1..number of students).
 * Returns arrays of ids. Team sizes differ by at most 1.
 */
function formTeams_(entries, numTeams) {
  var n = entries.length;
  numTeams = Math.max(1, Math.min(n, Math.floor(Number(numTeams) || 1)));
  var items = entries.map(function (e) { return { id: e.id, t: entryTime_(e) }; });
  var ids = function (tm) { return tm.map(function (e) { return e.id; }); };
  if (numTeams <= 1) return [ids(items)];
  if (numTeams >= n) return shuffle_(items).map(function (e) { return [e.id]; });

  var best = null, restarts = Math.max(1, CONFIG.BALANCE_RESTARTS || 1);
  for (var r = 0; r < restarts; r++) {
    var teams = r === 0 ? snakeDraft_(items, numTeams) : randomDeal_(items, numTeams);
    improveTeams_(teams);
    var sd = teamSpreadSd_(teams);
    if (!best || sd < best.sd - 1e-12) best = { teams: teams, sd: sd };
    if (best.sd < 1e-9) break; // can't do better than perfectly even
  }
  return shuffle_(best.teams).map(ids);
}

/** Fastest first, dealt 1..k then k..1 (so the fastest and slowest end up together). */
function snakeDraft_(items, k) {
  var sorted = shuffle_(items.slice()).sort(function (a, b) { return a.t - b.t; });
  var teams = [];
  for (var t = 0; t < k; t++) teams.push([]);
  sorted.forEach(function (e, i) {
    var round = Math.floor(i / k), pos = i % k;
    teams[round % 2 === 0 ? pos : k - 1 - pos].push(e);
  });
  return teams;
}
function randomDeal_(items, k) {
  var teams = [];
  for (var t = 0; t < k; t++) teams.push([]);
  shuffle_(items.slice()).forEach(function (e, i) { teams[i % k].push(e); });
  return teams;
}

/** Repeatedly makes the single swap or move that most lowers the spread of team averages. Sizes stay within 1. */
function improveTeams_(teams) {
  var k = teams.length;
  for (var iter = 0; iter < 1000; iter++) {
    var sums = teams.map(sumT_), sizes = teams.map(function (tm) { return tm.length; });
    var means = sums.map(function (s, i) { return s / sizes[i]; });
    var current = variance_(means), best = null;
    for (var i = 0; i < k; i++) {
      for (var j = 0; j < k; j++) {
        if (i === j) continue;
        // Swap a (in i) with b (in j). Only check i < j once.
        if (i < j) {
          for (var a = 0; a < teams[i].length; a++) {
            for (var b = 0; b < teams[j].length; b++) {
              var d = teams[j][b].t - teams[i][a].t;
              if (d === 0) continue;
              var trial = means.slice();
              trial[i] = (sums[i] + d) / sizes[i]; trial[j] = (sums[j] - d) / sizes[j];
              var v = variance_(trial);
              if (v < current - 1e-12 && (!best || v < best.v)) best = { kind: 'swap', i: i, j: j, a: a, b: b, v: v };
            }
          }
        }
        // Move a player from a bigger team (i) to a smaller one (j). Sizes still differ by at most 1 afterwards.
        if (sizes[i] === sizes[j] + 1) {
          for (var m = 0; m < teams[i].length; m++) {
            var x = teams[i][m].t, tr = means.slice();
            tr[i] = (sums[i] - x) / (sizes[i] - 1); tr[j] = (sums[j] + x) / (sizes[j] + 1);
            var v2 = variance_(tr);
            if (v2 < current - 1e-12 && (!best || v2 < best.v)) best = { kind: 'move', i: i, j: j, a: m, v: v2 };
          }
        }
      }
    }
    if (!best) return;
    if (best.kind === 'swap') {
      var tmp = teams[best.i][best.a]; teams[best.i][best.a] = teams[best.j][best.b]; teams[best.j][best.b] = tmp;
    } else {
      teams[best.j].push(teams[best.i].splice(best.a, 1)[0]);
    }
  }
}

/** Same teams again: each newcomer joins one of the smallest teams, whichever keeps the team averages most even. */
function placeNewcomers_(teams, newcomers) {
  shuffle_(newcomers.slice()).sort(function (a, b) { return a.t - b.t; }).forEach(function (e) {
    var minSize = Math.min.apply(null, teams.map(function (tm) { return tm.length; }));
    var best = -1, bestV = Infinity, means = teams.map(teamMean_);
    teams.forEach(function (tm, i) {
      if (tm.length !== minSize) return;
      var trial = means.slice();
      trial[i] = (sumT_(tm) + e.t) / (tm.length + 1);
      var v = variance_(trial);
      if (v < bestV - 1e-12) { bestV = v; best = i; }
    });
    teams[best].push(e);
  });
}

/** `count` team labels (colour + creature), skipping any full name in `avoid` ({name: true}). */
function teamLabels_(count, avoid) {
  avoid = avoid || {};
  var extra = Object.keys(avoid).length;
  var names = shuffle_(CONFIG.TEAM_NAMES.slice());
  var colours = shuffle_(CONFIG.TEAM_COLOURS.slice());
  var out = [];
  for (var i = 0; out.length < count && i < count + extra + names.length * colours.length; i++) {
    var nm = names[i % names.length], col = colours[i % colours.length];
    var name = col + ' ' + nm[0] + (i >= names.length ? ' ' + (Math.floor(i / names.length) + 1) : '');
    if (avoid[name]) continue;
    out.push({ name: name, emoji: nm[1], colour: col, hex: CONFIG.TEAM_HEX[col] });
  }
  return out;
}

/* ---------- Room actions ---------- */

function openRoom_() {
  return withLock_(function () {
    var code = newCode_();
    var room = { code: code, status: 'lobby', round: 0, created: Date.now(), players: {}, game: null, subs: {}, results: null };
    saveRoom_(room);
    cache_().put('activeRoom', code, CONFIG.ROOM_TTL_SEC);
    return room;
  });
}

function closeRoom_(code) {
  withLock_(function () {
    cache_().remove('room:' + code);
    if (activeCode_() === code) cache_().remove('activeRoom');
  });
}

/** Only ever called when a student presses Class game (or their class-game screen re-joins). */
function joinRoom_(student) {
  var code = activeCode_();
  if (!code) throw new Error('NO_ROOM');
  touch_(code, student.id);
  return withLock_(function () {
    var room = getRoom_(code);
    if (!room.players[student.id]) {
      room.players[student.id] = { name: student.name, joined: Date.now() };
      saveRoom_(room);
    }
    return room;
  });
}

/** Removes a student from the room. If they leave mid-round without a result, they drop out of that round too,
 *  so the teacher's screen isn't left waiting for them. */
function removePlayer_(code, id) {
  forget_(code, id);
  return withLock_(function () {
    var room = getRoom_(code);
    delete room.players[id];
    var g = room.game;
    if (room.status === 'playing' && g && g.assign[id] && !room.subs[id]) {
      g.teams[g.assign[id].team].members = g.teams[g.assign[id].team].members.filter(function (m) { return m !== id; });
      delete g.assign[id];
    }
    saveRoom_(room);
    return room;
  });
}
function leaveRoom_(code, id) {
  try { return removePlayer_(code, id); } catch (e) { return null; } // room already closed: nothing to do
}

/** Each player's current level and expected seconds per correct answer for this operation. */
function playerStats_(ids, op) {
  var profiles = getProfiles_(ids), cutoff = cutoffs_()[op], now = Date.now(), out = {};
  ids.forEach(function (id) {
    var sum = opSummary_(profiles[id], op, cutoff, now);
    out[id] = { level: sum.current, exp: expectedTime_(sum), est: sum.levels[sum.current - 1].avg === null };
  });
  return out;
}

function checkOp_(op) { if (!CONFIG.LEVEL_COUNTS[op]) throw new Error('Unknown operation'); }
function clampSeconds_(s) { return Math.max(15, Math.min(900, Number(s) || 60)); }

/** Starts a round with the given groups of ids (one group per team). Call inside withLock_. */
function launchRound_(room, op, seconds, groups, labels, stats, delayMs) {
  var assign = {}, n = 0, rawMeans = [];
  var teams = groups.map(function (members, t) {
    var tot = 0;
    members.forEach(function (id) {
      var st = stats[id];
      assign[id] = { team: t, level: st.level, exp: st.exp, est: st.est };
      tot += st.exp; n++;
    });
    rawMeans.push(tot / members.length);
    var l = labels[t];
    return { name: l.name, emoji: l.emoji, colour: l.colour, hex: l.hex, members: members, exp: round2_(tot / members.length) };
  });
  var individual = groups.length >= n;
  var startAt = Date.now() + delayMs;
  room.game = { op: op, seconds: seconds, teamCount: groups.length, individual: individual,
                balanceSd: individual ? null : Math.round(Math.sqrt(variance_(rawMeans)) * 1000) / 1000,
                startAt: startAt, endAt: startAt + seconds * 1000, teams: teams, assign: assign };
  room.status = 'playing';
  room.round = (room.round || 0) + 1;
  room.subs = {};
  room.results = null;
}

/** Number of teams for n students. teamCount 0 or 1 = individual play. legacyTeamSize = old "x per team" pages. */
function numTeamsFor_(n, teamCount, legacyTeamSize) {
  if (teamCount === undefined || teamCount === null || teamCount === '') {
    var size = Math.max(1, Math.floor(Number(legacyTeamSize) || 1));
    return size <= 1 ? n : Math.max(1, Math.round(n / size));
  }
  var tc = Math.floor(Number(teamCount) || 0);
  return tc <= 1 ? n : Math.min(tc, n);
}

/** New, balanced teams from everyone in the room. */
function newTeams_(ids, stats, numTeams) {
  var groups = formTeams_(ids.map(function (id) { return { id: id, time: stats[id].exp }; }), numTeams);
  return { groups: groups, labels: teamLabels_(groups.length) };
}

/**
 * teamCount: number of teams the teacher chose (0 or 1 = individual play).
 * legacyTeamSize: only sent by an old cached teacher page ("x per team"); used if teamCount is missing.
 */
function startGame_(code, op, teamCount, seconds, legacyTeamSize) {
  checkOp_(op);
  seconds = clampSeconds_(seconds);
  return withLock_(function () {
    var room = getRoom_(code);
    pruneAbsent_(room); // only students whose class-game screen is open right now
    var ids = Object.keys(room.players);
    if (!ids.length) { saveRoom_(room); throw new Error('No students are in the room right now.'); }
    var stats = playerStats_(ids, op);
    var t = newTeams_(ids, stats, numTeamsFor_(ids.length, teamCount, legacyTeamSize));
    launchRound_(room, op, seconds, t.groups, t.labels, stats, CONFIG.START_DELAY_MS);
    saveRoom_(room);
    return room;
  });
}

/**
 * From the results screen: start the next round straight away, with everyone still on the class-game screen
 * (students don't re-enter anything; their screens pick the new round up by themselves).
 * teams: 'same' = keep last round's teams (anyone who has left drops out; anyone new joins the smallest team,
 *        or plays solo if last round was individual), or a number of teams (0 = individual) for new balanced teams.
 */
function playAgain_(code, op, seconds, teams) {
  checkOp_(op);
  seconds = clampSeconds_(seconds);
  return withLock_(function () {
    var room = getRoom_(code);
    if (room.status === 'playing') return room; // already started (e.g. the button was pressed twice)
    if (room.status !== 'results' || !room.game) throw new Error('Play again works from the results screen. Use Start instead.');
    var prev = room.game;
    pruneAbsent_(room);
    var ids = Object.keys(room.players);
    if (!ids.length) { saveRoom_(room); throw new Error('No students are in the room right now.'); }
    var stats = playerStats_(ids, op), plan = null;

    if (String(teams) === 'same') {
      var here = {}, placed = {}, kept = [];
      ids.forEach(function (id) { here[id] = true; });
      prev.teams.forEach(function (tm) {
        var members = tm.members.filter(function (id) { return here[id] && !placed[id]; });
        members.forEach(function (id) { placed[id] = true; });
        if (members.length) kept.push({ label: { name: tm.name, emoji: tm.emoji, colour: tm.colour, hex: tm.hex },
                                        items: members.map(function (id) { return { id: id, t: stats[id].exp }; }) });
      });
      var newcomers = ids.filter(function (id) { return !placed[id]; }).map(function (id) { return { id: id, t: stats[id].exp }; });
      if (kept.length) {
        var labels = kept.map(function (k) { return k.label; }), groups;
        if (prev.individual) {
          var used = {}; labels.forEach(function (l) { used[l.name] = true; });
          groups = kept.map(function (k) { return k.items.map(function (e) { return e.id; }); })
            .concat(newcomers.map(function (e) { return [e.id]; }));
          labels = labels.concat(teamLabels_(newcomers.length, used));
        } else {
          var lists = kept.map(function (k) { return k.items; });
          if (newcomers.length) placeNewcomers_(lists, newcomers);
          groups = lists.map(function (tm) { return tm.map(function (e) { return e.id; }); });
        }
        plan = { groups: groups, labels: labels };
      } else {
        // Nobody from last round is still here: make new teams of the same kind.
        plan = newTeams_(ids, stats, prev.individual ? ids.length : prev.teamCount);
      }
    } else {
      plan = newTeams_(ids, stats, numTeamsFor_(ids.length, teams));
    }
    launchRound_(room, op, seconds, plan.groups, plan.labels, stats, CONFIG.PLAY_AGAIN_DELAY_MS);
    saveRoom_(room);
    return room;
  });
}

function submitResult_(student, round, correct, wrong, seconds) {
  var code = activeCode_();
  if (!code) throw new Error('ROOM_CLOSED');
  touch_(code, student.id);
  return withLock_(function () {
    var room = getRoom_(code);
    var g = room.game;
    if (room.status !== 'playing' || !g || !g.assign[student.id] || Number(round) !== room.round) return { accepted: false, room: room };
    room.subs[student.id] = {
      c: Math.max(0, Math.floor(Number(correct) || 0)),
      w: Math.max(0, Math.floor(Number(wrong) || 0)),
      s: Math.max(0, Math.min(g.seconds, Number(seconds) || 0))
    };
    saveRoom_(room);
    return { accepted: true, room: room };
  });
}

/**
 * Ranks teams, saves every result to the sheet (one write), updates profiles, hands out trophies. Idempotent.
 * Ranking rules:
 *  - Time per correct answer = (seconds played + WRONG_PENALTY_SEC per wrong answer) / correct answers. Lower wins.
 *  - A team with no correct answers (or no results at all) has no result: it gets no place (rank null) and is listed last.
 *  - Times are compared unrounded (avgRaw), so two teams that both show 4.37 s still get the right places.
 *    The screens show extra decimal places where needed.
 *  - Teams with exactly the same time share the place. If that place is 1st, every team on it gets the trophy.
 *  - Nobody with a result -> no trophy at all.
 */
function finishGame_(code) {
  return withLock_(function () {
    var room = getRoom_(code);
    if (room.status !== 'playing') return room;
    var g = room.game, now = Date.now();
    var ids = Object.keys(room.subs);
    var profiles = getProfiles_(ids.length ? ids : []);
    var cutoff = cutoffs_()[g.op];
    var rows = [], updates = {}, personal = {};

    ids.forEach(function (id) {
      var sub = room.subs[id], a = g.assign[id];
      var t = attemptTime_(sub.s, sub.c, sub.w);
      var saved = sub.s >= CONFIG.MIN_ATTEMPT_SECONDS;
      var p = profiles[id] = profiles[id] || {};
      var before = opSummary_(p, g.op, cutoff, now).current;
      if (saved) {
        recordAttempt_(p, g.op, a.level, t, now);
        updates[id] = p;
        var name = room.players[id] ? room.players[id].name : '';
        // The last-but-one column used to hold points; it is left blank now (kept so older rows still line up).
        rows.push([new Date(now), id, name, 'class', g.op, a.level, sub.c, sub.w, round2_(sub.s), t, '', room.code]);
      }
      var after = opSummary_(p, g.op, cutoff, now);
      personal[id] = { correct: sub.c, wrong: sub.w, penalty: sub.w * CONFIG.WRONG_PENALTY_SEC, avgTime: sub.c > 0 ? t : null,
                       level: a.level, saved: saved, newLevel: after.current, levelUp: after.current > before, mastered: after.mastered };
    });

    var teams = g.teams.map(function (tm, i) {
      var c = 0, w = 0, s = 0, played = 0;
      tm.members.forEach(function (id) {
        var sub = room.subs[id];
        if (!sub) return;
        played++; c += sub.c; w += sub.w; s += sub.s;
      });
      var raw = c > 0 ? rawTime_(s, c, w) : null;
      return { index: i, name: tm.name, emoji: tm.emoji, hex: tm.hex, size: tm.members.length, played: played,
               correct: c, wrong: w, exp: tm.exp !== undefined ? tm.exp : null,
               avgRaw: raw, avgTime: raw === null ? null : round2_(raw) };
    });
    teams = teams.filter(function (t) { return t.size > 0; }); // everyone on this team left
    teams.sort(function (a, b) {
      var ra = hasResult_(a), rb = hasResult_(b);
      if (ra !== rb) return ra ? -1 : 1;
      return cmpTime_(a, b);
    });
    var prev = null;
    teams.forEach(function (t, i) {
      if (!hasResult_(t)) { t.rank = null; return; }
      t.rank = prev && cmpTime_(prev, t) === 0 ? prev.rank : i + 1;
      prev = t;
    });

    // Trophy: every player on the winning team(s) who sent in a result gets the same one. No result -> no trophy.
    // Each player's copy is undecided until they put it in their cabinet or re-roll it.
    var winners = teams.filter(function (t) { return t.rank === 1; });
    if (winners.length) {
      var trophy = pickTrophy_(room.lastTrophy);
      room.lastTrophy = trophy.e;
      winners.forEach(function (win) {
        win.trophy = trophy;
        g.teams[win.index].members.forEach(function (id) {
          if (!room.subs[id]) return;
          var item = awardTrophy_(profiles[id], trophy, g.op, win.name, now);
          updates[id] = profiles[id];
          personal[id].trophy = { id: item.id, e: item.e, n: item.n };
        });
      });
    }

    saveProfiles_(updates);
    appendAttempts_(rows);
    room.status = 'results';
    room.results = { teams: teams, personal: personal, finished: now };
    saveRoom_(room);
    return room;
  });
}
/** A team has a result when it answered at least one question correctly. */
function hasResult_(t) { return t.correct > 0 && t.played > 0; }
function teamTime_(t) { return t.avgRaw !== undefined && t.avgRaw !== null ? t.avgRaw : t.avgTime; }
function cmpTime_(a, b) {
  var x = teamTime_(a), y = teamTime_(b);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return Math.abs(x - y) < 1e-9 ? 0 : x - y;
}

function newRound_(code) {
  return withLock_(function () {
    var room = getRoom_(code);
    room.status = 'lobby'; room.game = null; room.subs = {}; room.results = null;
    pruneAbsent_(room);
    saveRoom_(room);
    return room;
  });
}

/* ---------- What each screen is allowed to see ---------- */

/** In the lobby, only students whose class-game screen is open count. During a round nobody polls, so everyone counts. */
function visiblePlayerIds_(room) {
  return room.status === 'lobby' ? presentIds_(room) : Object.keys(room.players);
}

/** Students never receive other students' names. */
function studentView_(room, id) {
  var g = room.game, a = g ? g.assign[id] : null;
  var view = { code: room.code, status: room.status, round: room.round, playerCount: visiblePlayerIds_(room).length,
               joined: !!room.players[id], game: null, submitted: !!room.subs[id], results: null };
  if (g) {
    var tm = a ? g.teams[a.team] : null;
    view.game = { op: g.op, seconds: g.seconds, startAt: g.startAt, endAt: g.endAt, inGame: !!a, level: a ? a.level : null,
                  individual: g.individual !== undefined ? g.individual : g.teamSize <= 1,
                  team: tm ? { name: tm.name, emoji: tm.emoji, hex: tm.hex, size: tm.members.length } : null };
  }
  if (room.results) {
    view.results = { teams: room.results.teams, me: room.results.personal[id] || null, myTeam: a ? a.team : null };
  }
  return view;
}

function teacherView_(room) {
  var players = visiblePlayerIds_(room).map(function (id) { return { id: id, name: room.players[id].name }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  var view = { code: room.code, status: room.status, round: room.round, players: players, game: null,
               submitted: Object.keys(room.subs).length, results: null };
  var nameOf = function (id) { return room.players[id] ? room.players[id].name : id; };
  if (room.game) {
    var g = room.game;
    view.game = { op: g.op, seconds: g.seconds, teamCount: g.teamCount, individual: g.individual, startAt: g.startAt, endAt: g.endAt,
                  balanceSd: g.balanceSd !== undefined ? g.balanceSd : null,
                  expected: Object.keys(g.assign).length,
                  teams: g.teams.map(function (tm) {
                    return { name: tm.name, emoji: tm.emoji, hex: tm.hex, exp: tm.exp !== undefined ? tm.exp : null,
                             members: tm.members.map(function (id) {
                               var a = g.assign[id];
                               return { name: nameOf(id), level: a.level, exp: a.exp, est: !!a.est, submitted: !!room.subs[id] };
                             }) };
                  }) };
  }
  if (room.results) {
    view.results = { teams: room.results.teams.map(function (t) {
      var copy = JSON.parse(JSON.stringify(t));
      copy.members = room.game.teams[t.index].members.map(function (id) {
        var p = room.results.personal[id];
        return { name: nameOf(id), level: room.game.assign[id].level, correct: p ? p.correct : null, wrong: p ? p.wrong : null,
                 avgTime: p ? p.avgTime : null, levelUp: p ? p.levelUp : false };
      });
      return copy;
    }) };
  }
  return view;
}


// ===================== Code =====================
/**
 * API ROUTER  (Apps Script web app entry point)
 * ---------------------------------------------------------------
 * Every request is a POST with a JSON body {action, ...}. Sent as text/plain so the
 * browser makes no CORS preflight. Response: {ok:true, now, ...} or {ok:false, error}.
 * `now` is the server clock, which the browsers use to start games in sync.
 *
 * To add a feature: add an entry to ACTIONS, then call it from js/api.js with API.call('name', {...}).
 */
function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  return json_(handleRequest(req));
}
/** Open the /exec URL in a browser to see which version of the code Google is running. */
function doGet() {
  return json_({ ok: true, message: 'Fluency game API is running.', serverVersion: CONFIG.SERVER_VERSION,
                 playAgainInstalled: typeof playAgain_ === 'function', now: Date.now() });
}
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/** Pure function (also used by the offline demo and tests). */
function handleRequest(req) {
  var fn = ACTIONS[req && req.action];
  if (!fn) return { ok: false, error: 'Unknown action', now: Date.now() };
  try {
    var out = fn(req) || {};
    out.ok = true; out.now = Date.now();
    return out;
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err), now: Date.now() };
  }
}

function norm_(s) { return String(s === undefined || s === null ? '' : s).trim().toLowerCase(); }

function authStudent_(req) {
  var id = req.token ? cache_().get('tok:' + req.token) : null;
  if (!id) throw new Error('SESSION_EXPIRED');
  var s = findStudent_(id);
  if (!s || !s.active) throw new Error('SESSION_EXPIRED');
  return s;
}
function authTeacher_(req) {
  if (!req.teacherToken || !cache_().get('ttok:' + req.teacherToken)) throw new Error('SESSION_EXPIRED');
}
function startSession_(s) {
  var token = Utilities.getUuid();
  cache_().put('tok:' + token, s.id, CONFIG.SESSION_TTL_SEC);
  return { token: token, student: { id: s.id, name: s.name }, profile: profileView_(getProfile_(s.id)), rules: rules_() };
}

function rules_() {
  return { serverVersion: CONFIG.SERVER_VERSION, wrongPenaltySec: CONFIG.WRONG_PENALTY_SEC,
           reroll: { platinum: CONFIG.REROLL_PLATINUM_CHANCE, lose: CONFIG.REROLL_LOSE_CHANCE },
           minAttemptSeconds: CONFIG.MIN_ATTEMPT_SECONDS, submitGraceMs: CONFIG.SUBMIT_GRACE_MS, levelCounts: CONFIG.LEVEL_COUNTS };
}

function keeperAction_(req) {
  var s = authStudent_(req);
  return withLock_(function () {
    var now = Date.now(), p = getProfile_(s.id);
    setKeeper_(p, String(req.id || ''), now);
    var upd = {}; upd[s.id] = p;
    saveProfiles_(upd);
    return { cabinet: cabinetView_(p, now) };
  });
}

var ACTIONS = {
  /* ----- Student ----- */
  classList: function () {
    return { students: getStudents_().filter(function (s) { return s.active; })
      .map(function (s) { return { id: s.id, name: s.name, isNew: !s.password }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); }) };
  },

  login: function (req) {
    var s = findStudent_(req.studentId);
    if (s && s.active && !s.password) throw new Error('NEEDS_PASSWORD');
    if (!s || !s.active || norm_(s.password) !== norm_(req.password)) throw new Error('That password is not right. Try again.');
    return startSession_(s);
  },

  /** First log-in: the student chooses their own password. Only works while their password is blank. */
  setPassword: function (req) {
    var pw = String(req.password || '').trim();
    if (pw.length < CONFIG.MIN_PASSWORD_LENGTH) throw new Error('Your password needs at least ' + CONFIG.MIN_PASSWORD_LENGTH + ' letters or numbers.');
    if (pw.length > 30) throw new Error('That password is too long (30 characters at most).');
    var s = withLock_(function () {
      var cur = findStudentFresh_(req.studentId);
      if (!cur || !cur.active) throw new Error('Choose your name first.');
      if (cur.password) throw new Error('This name already has a password. Ask your teacher if you\'ve forgotten it.');
      setStudentPassword_(cur.id, pw);
      cur.password = pw;
      return cur;
    });
    return startSession_(s);
  },

  profile: function (req) {
    var s = authStudent_(req);
    return { profile: profileView_(getProfile_(s.id)), rules: rules_() };
  },

  /** The student's trophy cabinet: this week's trophies (one will be kept) and the locked ones from past weeks. */
  cabinet: function (req) {
    var s = authStudent_(req);
    return withLock_(function () {
      var now = Date.now(), p = getProfile_(s.id), before = JSON.stringify(p.cab || null);
      var view = cabinetView_(p, now);
      if (JSON.stringify(p.cab) !== before) { var upd = {}; upd[s.id] = p; saveProfiles_(upd); } // a week was just locked in
      return { cabinet: view };
    });
  },

  /** An undecided trophy: req.choice 'keep' (put it in the cabinet as it is) or 'reroll' (platinum / lost / stays gold). */
  trophyDecision: function (req) {
    var s = authStudent_(req);
    return withLock_(function () {
      var now = Date.now(), p = getProfile_(s.id);
      var r = decideTrophy_(p, String(req.id || ''), String(req.choice || ''), now);
      var upd = {}; upd[s.id] = p;
      saveProfiles_(upd);
      return { outcome: r.outcome, trophy: r.trophy, cabinet: cabinetView_(p, now) };
    });
  },

  /** Picks which of this week's trophies will be locked into the cabinet. (setFavourite = old name, for cached pages.) */
  setKeeper: function (req) { return keeperAction_(req); },
  setFavourite: function (req) { return keeperAction_(req); },

  practiceSubmit: function (req) {
    var s = authStudent_(req);
    var level = Number(req.level);
    if (!validOpLevel_(req.op, level)) throw new Error('Unknown level');
    var correct = Math.max(0, Math.floor(Number(req.correct) || 0));
    var wrong = Math.max(0, Math.floor(Number(req.wrong) || 0));
    var seconds = Math.max(0, Math.min(900, Number(req.seconds) || 0));
    if (seconds < CONFIG.MIN_ATTEMPT_SECONDS) return { saved: false, profile: profileView_(getProfile_(s.id)) };
    return withLock_(function () {
      var now = Date.now(), p = getProfile_(s.id), t = attemptTime_(seconds, correct, wrong);
      recordAttempt_(p, req.op, level, t, now);
      var upd = {}; upd[s.id] = p;
      saveProfiles_(upd);
      appendAttempts_([[new Date(now), s.id, s.name, 'practice', req.op, level, correct, wrong, round2_(seconds), t, '', '']]);
      return { saved: true, avgTime: t, profile: profileView_(p) };
    });
  },

  joinRoom: function (req) {
    var s = authStudent_(req);
    return { room: studentView_(joinRoom_(s), s.id) };
  },

  roomState: function (req) {
    if (req.teacherToken) { authTeacher_(req); return { room: teacherView_(getRoom_(req.code)) }; }
    var s = authStudent_(req);
    var code = activeCode_();
    var room = getRoom_(code);
    touch_(code, s.id); // this student's class-game screen is open
    return { room: studentView_(room, s.id) };
  },

  leaveRoom: function (req) {
    var s = authStudent_(req);
    var code = activeCode_();
    if (code) leaveRoom_(code, s.id);
    return {};
  },

  submitResult: function (req) {
    var s = authStudent_(req);
    var r = submitResult_(s, req.round, req.correct, req.wrong, req.seconds);
    return { accepted: r.accepted, room: studentView_(r.room, s.id) };
  },

  /* ----- Teacher ----- */
  teacherLogin: function (req) {
    var pw = getSettings_().teacherPassword;
    if (!pw || String(req.password || '') !== String(pw)) throw new Error('Wrong teacher password.');
    var t = Utilities.getUuid();
    cache_().put('ttok:' + t, '1', CONFIG.SESSION_TTL_SEC);
    return { teacherToken: t, cutoffs: cutoffs_(), rules: rules_(), activeRoom: activeCode_() };
  },
  teacherInfo: function (req) { authTeacher_(req); return { cutoffs: cutoffs_(), rules: rules_(), activeRoom: activeCode_() }; },
  openRoom: function (req) { authTeacher_(req); return { room: teacherView_(openRoom_()) }; },
  closeRoom: function (req) { authTeacher_(req); closeRoom_(req.code); return {}; },
  removePlayer: function (req) { authTeacher_(req); return { room: teacherView_(removePlayer_(req.code, req.id)) }; },
  /** req.teams = number of teams (0 = individual play). req.teamSize is only sent by an old cached teacher page. */
  startGame: function (req) { authTeacher_(req); return { room: teacherView_(startGame_(req.code, req.op, req.teams, req.seconds, req.teamSize)) }; },
  /** From the results screen: next round straight away. req.teams = 'same' or a number of teams (0 = individual). */
  playAgain: function (req) { authTeacher_(req); return { room: teacherView_(playAgain_(req.code, req.op, req.seconds, req.teams)) }; },
  finishGame: function (req) { authTeacher_(req); return { room: teacherView_(finishGame_(req.code)) }; },
  newRound: function (req) { authTeacher_(req); return { room: teacherView_(newRound_(req.code)) }; },

  /** Every student (active or not) and whether they have a password yet. Used by the teacher's Passwords page.
   *  Reads the sheet directly, so it is up to date straight after a reset. */
  studentPasswords: function (req) {
    authTeacher_(req);
    cache_().remove('students');
    return { students: getStudents_().filter(function (s) { return s.active; })
      .map(function (s) { return { id: s.id, name: s.name, hasPassword: !!s.password }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); }) };
  },

  /** Clears a student's password so they create a new one next time they log in. */
  resetPassword: function (req) {
    authTeacher_(req);
    withLock_(function () { setStudentPassword_(String(req.id), ''); });
    return {};
  },

  saveSettings: function (req) {
    authTeacher_(req);
    var upd = {};
    CONFIG.OPS.forEach(function (op) {
      var v = Number(req.cutoffs && req.cutoffs[op]);
      if (v > 0 && v < 120) upd['cutoff_' + op] = v;
    });
    withLock_(function () { saveSettings_(upd); });
    return { cutoffs: cutoffs_() };
  },

  classOverview: function (req) {
    authTeacher_(req);
    var students = getStudents_().filter(function (s) { return s.active; });
    var profiles = getProfiles_(students.map(function (s) { return s.id; }));
    var cut = cutoffs_(), now = Date.now();
    var rows = students.map(function (s) {
      var row = { id: s.id, name: s.name };
      CONFIG.OPS.forEach(function (op) {
        var sum = opSummary_(profiles[s.id], op, cut[op], now);
        var cur = sum.levels[sum.current - 1];
        row.hasPassword = !!s.password;
        row[op] = { level: sum.current, mastered: sum.mastered, time: cur.time, dust: cur.dust };
      });
      return row;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    return { rows: rows, cutoffs: cut };
  }
};
