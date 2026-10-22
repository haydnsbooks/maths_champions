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
  // Number of levels per operation. Must match js/levels.js.
  LEVEL_COUNTS: { mul: 18, div: 18, add: 13, sub: 11 },
  OPS: ['add', 'sub', 'mul', 'div'],

  // ---- Fluency rules ----
  RECENT_ATTEMPTS: 3,          // fluency = average of this many most recent attempts at a level
  MIN_ATTEMPTS_FOR_FLUENCY: 3, // attempts needed at a level before it can count as fluent (<= RECENT_ATTEMPTS)
  DUST_PER_WEEK: 0.5,          // seconds of "dust" added for each new week since the level was last played
  TZ_OFFSET_HOURS: 8,          // Perth (WA has no daylight saving). A new week starts Monday 00:00 local time.
  DEFAULT_CUTOFF: 3.0,         // seconds per correct answer; used until the teacher saves cut-offs
  MIN_ATTEMPT_SECONDS: 20,     // games shorter than this (e.g. joined very late) are not saved to profiles
  MIN_PASSWORD_LENGTH: 4,      // students choose their own password on first log-in

  // ---- Scoring ----
  POINTS_CORRECT: 10,
  POINTS_WRONG: -5,
  RANK_BY: 'avgTime',          // 'avgTime' = lowest average seconds per correct answer wins; 'points' = most points wins

  // ---- Team balancing ----
  // A student's expected seconds-per-correct at their current level is used to balance teams.
  // If they have never played their current level, expected = cut-off + UNKNOWN_EXTRA.
  UNKNOWN_EXTRA: 1.5,

  // ---- Timing / traffic ----
  START_DELAY_MS: 8000,        // countdown before a class game starts. Must be longer than the student lobby poll (js/config.js)
  SUBMIT_GRACE_MS: 15000,      // after the game ends, wait this long for late results before finishing anyway
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
  Attempts: ['timestamp', 'id', 'name', 'mode', 'op', 'level', 'correct', 'wrong', 'seconds', 'avgTime', 'points', 'room'],
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
 *   attempt time   = seconds played / correct answers (wrong answers cost time, so they count against you)
 *   fluency time   = average of the last 3 attempts + dust
 *   dust           = 0.5 s for every new week (Monday) since the level was last played
 *   fluent         = at least MIN_ATTEMPTS_FOR_FLUENCY attempts AND fluency time <= cut-off
 *   current level  = the LOWEST level that is not fluent (so dusty levels pull a student back to revise them)
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

function attemptTime_(seconds, correct) { return round2_(seconds / Math.max(correct, 1)); }

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

/** Expected seconds-per-correct at the student's current level (used to balance teams). */
function expectedTime_(summary) {
  var st = summary.levels[summary.current - 1];
  return st.time !== null ? st.time : summary.cutoff + CONFIG.UNKNOWN_EXTRA;
}

function validOpLevel_(op, level) {
  return CONFIG.LEVEL_COUNTS.hasOwnProperty(op) && level >= 1 && level <= CONFIG.LEVEL_COUNTS[op] && Math.floor(level) === level;
}


// ===================== Rooms =====================
/**
 * ROOMS & TEAMS  (class multiplayer)
 * ---------------------------------------------------------------
 * A room lives only in CacheService (key "room:CODE"). There is one active room at a time
 * (key "activeRoom"), so students just press Multiplayer — no code to type.
 *
 * Room shape:
 * { code, status: 'lobby'|'playing'|'results', round, created,
 *   players: { id: {name, joined} },
 *   game:    { op, seconds, teamSize, startAt, endAt, teams: [{name, emoji, colour, hex, members:[id]}],
 *              assign: { id: {team, level} } },
 *   subs:    { id: {c, w, s} },          // submitted results this round
 *   results: { teams:[...], personal:{ id:{...} } } }
 *
 * Request pattern per class game (approx. 25 students):
 *   lobby polling (cache read only) -> 1 start -> 0 requests while playing -> 25 small submits
 *   -> 1 finish (the only sheet write) -> results polling (cache read only)
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

/* ---------- Team forming ---------- */

/**
 * entries: [{id, rate}] where rate = expected correct answers per second (1 / expected time).
 * Returns arrays of ids. Team sizes differ by at most 1.
 * Method: snake draft (strongest first), then swap players between the strongest and weakest
 * team while it narrows the gap in average rate.
 */
function formTeams_(entries, teamSize) {
  var n = entries.length;
  var numTeams = teamSize <= 1 ? n : Math.max(1, Math.round(n / teamSize));
  numTeams = Math.min(numTeams, n);
  var sorted = shuffle_(entries.slice()).sort(function (a, b) { return b.rate - a.rate; });
  var teams = [];
  for (var t = 0; t < numTeams; t++) teams.push([]);
  sorted.forEach(function (e, i) {
    var round = Math.floor(i / numTeams), pos = i % numTeams;
    teams[round % 2 === 0 ? pos : numTeams - 1 - pos].push(e);
  });
  if (numTeams > 1 && teamSize > 1) improveTeams_(teams);
  return teams.map(function (tm) { return tm.map(function (e) { return e.id; }); });
}

function teamMean_(tm) { return tm.reduce(function (a, e) { return a + e.rate; }, 0) / tm.length; }

/** Repeatedly makes the single swap (between any two teams) that most reduces the spread of team averages. */
function improveTeams_(teams) {
  var spread = function (means) {
    var avg = means.reduce(function (a, b) { return a + b; }, 0) / means.length;
    return means.reduce(function (a, m) { return a + (m - avg) * (m - avg); }, 0);
  };
  for (var iter = 0; iter < 200; iter++) {
    var means = teams.map(teamMean_), current = spread(means), best = null;
    for (var i = 0; i < teams.length; i++) {
      for (var j = i + 1; j < teams.length; j++) {
        for (var a = 0; a < teams[i].length; a++) {
          for (var b = 0; b < teams[j].length; b++) {
            var d = teams[i][a].rate - teams[j][b].rate;
            if (d === 0) continue;
            var trial = means.slice();
            trial[i] -= d / teams[i].length; trial[j] += d / teams[j].length;
            var s = spread(trial);
            if (s < current - 1e-12 && (!best || s < best.s)) best = { i: i, j: j, a: a, b: b, s: s };
          }
        }
      }
    }
    if (!best) return;
    var tmp = teams[best.i][best.a]; teams[best.i][best.a] = teams[best.j][best.b]; teams[best.j][best.b] = tmp;
  }
}

function teamLabels_(count) {
  var names = shuffle_(CONFIG.TEAM_NAMES.slice());
  var colours = shuffle_(CONFIG.TEAM_COLOURS.slice());
  var out = [];
  for (var i = 0; i < count; i++) {
    var nm = names[i % names.length], col = colours[i % colours.length];
    var name = col + ' ' + nm[0] + (i >= names.length ? ' ' + (Math.floor(i / names.length) + 1) : '');
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

function joinRoom_(student) {
  var code = activeCode_();
  if (!code) throw new Error('NO_ROOM');
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

function startGame_(code, op, teamSize, seconds) {
  if (!CONFIG.LEVEL_COUNTS[op]) throw new Error('Unknown operation');
  seconds = Math.max(15, Math.min(900, Number(seconds) || 60));
  teamSize = Math.max(1, Math.floor(Number(teamSize) || 1));
  return withLock_(function () {
    var room = getRoom_(code);
    var ids = Object.keys(room.players);
    if (!ids.length) throw new Error('No students have joined yet.');
    var profiles = getProfiles_(ids), cutoff = cutoffs_()[op], now = Date.now();
    var entries = [], levelOf = {};
    ids.forEach(function (id) {
      var sum = opSummary_(profiles[id], op, cutoff, now);
      levelOf[id] = sum.current;
      entries.push({ id: id, rate: 1 / expectedTime_(sum) });
    });
    var groups = formTeams_(entries, teamSize);
    var labels = teamLabels_(groups.length);
    var assign = {};
    var teams = groups.map(function (members, t) {
      members.forEach(function (id) { assign[id] = { team: t, level: levelOf[id] }; });
      var l = labels[t];
      return { name: l.name, emoji: l.emoji, colour: l.colour, hex: l.hex, members: members };
    });
    var startAt = now + CONFIG.START_DELAY_MS;
    room.game = { op: op, seconds: seconds, teamSize: teamSize, startAt: startAt, endAt: startAt + seconds * 1000, teams: teams, assign: assign };
    room.status = 'playing';
    room.round = (room.round || 0) + 1;
    room.subs = {};
    room.results = null;
    saveRoom_(room);
    return room;
  });
}

function submitResult_(student, round, correct, wrong, seconds) {
  var code = activeCode_();
  if (!code) throw new Error('ROOM_CLOSED');
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

/** Ranks teams, saves every result to the sheet (one write), updates profiles. Idempotent. */
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
      var pts = sub.c * CONFIG.POINTS_CORRECT + sub.w * CONFIG.POINTS_WRONG;
      var t = attemptTime_(sub.s, sub.c);
      var saved = sub.s >= CONFIG.MIN_ATTEMPT_SECONDS;
      var p = profiles[id] || {};
      var before = opSummary_(p, g.op, cutoff, now).current;
      if (saved) {
        recordAttempt_(p, g.op, a.level, t, now);
        updates[id] = p;
        var name = room.players[id] ? room.players[id].name : '';
        rows.push([new Date(now), id, name, 'class', g.op, a.level, sub.c, sub.w, round2_(sub.s), t, pts, room.code]);
      }
      var after = opSummary_(p, g.op, cutoff, now);
      personal[id] = { correct: sub.c, wrong: sub.w, points: pts, avgTime: t, level: a.level, saved: saved,
                       newLevel: after.current, levelUp: after.current > before, mastered: after.mastered };
    });

    var teams = g.teams.map(function (tm, i) {
      var c = 0, w = 0, s = 0, pts = 0, played = 0;
      tm.members.forEach(function (id) {
        var sub = room.subs[id];
        if (!sub) return;
        played++; c += sub.c; w += sub.w; s += sub.s; pts += sub.c * CONFIG.POINTS_CORRECT + sub.w * CONFIG.POINTS_WRONG;
      });
      return { index: i, name: tm.name, emoji: tm.emoji, hex: tm.hex, size: tm.members.length, played: played,
               correct: c, wrong: w, points: pts, avgTime: c > 0 ? round2_(s / c) : null };
    });
    teams = teams.filter(function (t) { return t.size > 0; }); // everyone on this team left
    teams.sort(function (a, b) {
      if (CONFIG.RANK_BY === 'points') return b.points - a.points || cmpTime_(a, b);
      return cmpTime_(a, b) || b.points - a.points;
    });
    teams.forEach(function (t, i) { t.rank = i + 1; });

    saveProfiles_(updates);
    appendAttempts_(rows);
    room.status = 'results';
    room.results = { teams: teams, personal: personal, finished: now };
    saveRoom_(room);
    return room;
  });
}
function cmpTime_(a, b) {
  if (a.avgTime === null && b.avgTime === null) return 0;
  if (a.avgTime === null) return 1;
  if (b.avgTime === null) return -1;
  return a.avgTime - b.avgTime;
}

function newRound_(code) {
  return withLock_(function () {
    var room = getRoom_(code);
    room.status = 'lobby'; room.game = null; room.subs = {}; room.results = null;
    saveRoom_(room);
    return room;
  });
}

/* ---------- What each screen is allowed to see ---------- */

/** Students never receive other students' names. */
function studentView_(room, id) {
  var g = room.game, a = g ? g.assign[id] : null;
  var view = { code: room.code, status: room.status, round: room.round, playerCount: Object.keys(room.players).length,
               joined: !!room.players[id], game: null, submitted: !!room.subs[id], results: null };
  if (g) {
    var tm = a ? g.teams[a.team] : null;
    view.game = { op: g.op, seconds: g.seconds, startAt: g.startAt, endAt: g.endAt, inGame: !!a, level: a ? a.level : null,
                  individual: g.teamSize <= 1,
                  team: tm ? { name: tm.name, emoji: tm.emoji, hex: tm.hex, size: tm.members.length } : null };
  }
  if (room.results) {
    view.results = { teams: room.results.teams, me: room.results.personal[id] || null, myTeam: a ? a.team : null };
  }
  return view;
}

function teacherView_(room) {
  var players = Object.keys(room.players).map(function (id) { return { id: id, name: room.players[id].name }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
  var view = { code: room.code, status: room.status, round: room.round, players: players, game: null,
               submitted: Object.keys(room.subs).length, results: null };
  var nameOf = function (id) { return room.players[id] ? room.players[id].name : id; };
  if (room.game) {
    var g = room.game;
    view.game = { op: g.op, seconds: g.seconds, teamSize: g.teamSize, startAt: g.startAt, endAt: g.endAt,
                  expected: Object.keys(g.assign).length,
                  teams: g.teams.map(function (tm) {
                    return { name: tm.name, emoji: tm.emoji, hex: tm.hex,
                             members: tm.members.map(function (id) { return { name: nameOf(id), level: g.assign[id].level, submitted: !!room.subs[id] }; }) };
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
function doGet() { return json_({ ok: true, message: 'Fluency game API is running.', now: Date.now() }); }
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
  return { pointsCorrect: CONFIG.POINTS_CORRECT, pointsWrong: CONFIG.POINTS_WRONG, rankBy: CONFIG.RANK_BY,
           minAttemptSeconds: CONFIG.MIN_ATTEMPT_SECONDS, submitGraceMs: CONFIG.SUBMIT_GRACE_MS, levelCounts: CONFIG.LEVEL_COUNTS };
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

  practiceSubmit: function (req) {
    var s = authStudent_(req);
    var level = Number(req.level);
    if (!validOpLevel_(req.op, level)) throw new Error('Unknown level');
    var correct = Math.max(0, Math.floor(Number(req.correct) || 0));
    var wrong = Math.max(0, Math.floor(Number(req.wrong) || 0));
    var seconds = Math.max(0, Math.min(900, Number(req.seconds) || 0));
    if (seconds < CONFIG.MIN_ATTEMPT_SECONDS) return { saved: false, profile: profileView_(getProfile_(s.id)) };
    return withLock_(function () {
      var now = Date.now(), p = getProfile_(s.id), t = attemptTime_(seconds, correct);
      var pts = correct * CONFIG.POINTS_CORRECT + wrong * CONFIG.POINTS_WRONG;
      recordAttempt_(p, req.op, level, t, now);
      var upd = {}; upd[s.id] = p;
      saveProfiles_(upd);
      appendAttempts_([[new Date(now), s.id, s.name, 'practice', req.op, level, correct, wrong, round2_(seconds), t, pts, '']]);
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
    return { room: studentView_(getRoom_(activeCode_()), s.id) };
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
  startGame: function (req) { authTeacher_(req); return { room: teacherView_(startGame_(req.code, req.op, req.teamSize, req.seconds)) }; },
  finishGame: function (req) { authTeacher_(req); return { room: teacherView_(finishGame_(req.code)) }; },
  newRound: function (req) { authTeacher_(req); return { room: teacherView_(newRound_(req.code)) }; },

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
