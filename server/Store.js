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
