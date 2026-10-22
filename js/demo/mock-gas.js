/**
 * OFFLINE DEMO / TEST SHIM — NOT part of the Apps Script project. Do not paste into Apps Script.
 *
 * Imitates the small parts of SpreadsheetApp, CacheService, LockService and Utilities that the
 * server code uses, so the real server files (server/*.js) can run inside a browser (demo mode)
 * or Node (tests). In a browser, data is kept in localStorage, so a teacher tab and several
 * student tabs in the same browser share one fake "sheet".
 */
(function (root) {
  var KEY = 'fg_mock_db';
  var memory = { sheets: {}, cache: {} };
  var hasLS = typeof localStorage !== 'undefined';

  function load() {
    if (!hasLS) return memory;
    try { return JSON.parse(localStorage.getItem(KEY)) || { sheets: {}, cache: {} }; } catch (e) { return { sheets: {}, cache: {} }; }
  }
  function save(db) { if (hasLS) localStorage.setItem(KEY, JSON.stringify(db)); else memory = db; }
  function tx(fn) { var db = load(); var out = fn(db); save(db); return out; }

  function Range(name, r, c, nr, nc) {
    this.getValues = function () {
      var db = load(), data = db.sheets[name] || [], out = [];
      for (var i = 0; i < nr; i++) {
        var row = [];
        for (var j = 0; j < nc; j++) { var v = (data[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined || v === null ? '' : v); }
        out.push(row);
      }
      return out;
    };
    this.setValues = function (vals) {
      if (vals.length !== nr || vals[0].length !== nc) throw new Error('Range size mismatch');
      tx(function (db) {
        var data = db.sheets[name];
        for (var i = 0; i < nr; i++) {
          data[r - 1 + i] = data[r - 1 + i] || [];
          for (var j = 0; j < nc; j++) {
            var v = vals[i][j];
            data[r - 1 + i][c - 1 + j] = v instanceof Date ? v.toISOString() : v;
          }
        }
      });
      return this;
    };
  }
  function Sheet(name) {
    this.getName = function () { return name; };
    this.getLastRow = function () {
      var d = load().sheets[name] || [];
      for (var i = d.length - 1; i >= 0; i--) if (d[i] && d[i].some(function (v) { return v !== '' && v !== null && v !== undefined; })) return i + 1;
      return 0;
    };
    this.getLastColumn = function () { return (load().sheets[name] || []).reduce(function (m, r) { return Math.max(m, r ? r.length : 0); }, 0); };
    this.getRange = function (r, c, nr, nc) { return new Range(name, r, c, nr || 1, nc || 1); };
    this.getDataRange = function () { return new Range(name, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); };
    this.setFrozenRows = function () {};
  }
  var Spreadsheet = {
    getSheetByName: function (n) { return load().sheets[n] ? new Sheet(n) : null; },
    insertSheet: function (n) { tx(function (db) { db.sheets[n] = []; }); return new Sheet(n); }
  };
  root.SpreadsheetApp = { getActive: function () { return Spreadsheet; }, getActiveSpreadsheet: function () { return Spreadsheet; },
    getUi: function () { throw new Error('No UI in demo'); } };

  var Cache = {
    get: function (k) {
      var e = load().cache[k];
      if (!e) return null;
      if (e.exp < Date.now()) { tx(function (db) { delete db.cache[k]; }); return null; }
      return e.v;
    },
    getAll: function (keys) { var o = {}; keys.forEach(function (k) { var v = Cache.get(k); if (v !== null) o[k] = v; }); return o; },
    put: function (k, v, ttl) {
      if (String(v).length > 100 * 1024) throw new Error('Cache value too large (100KB limit): ' + k);
      tx(function (db) { db.cache[k] = { v: String(v), exp: Date.now() + (ttl || 600) * 1000 }; });
    },
    putAll: function (obj, ttl) { Object.keys(obj).forEach(function (k) { Cache.put(k, obj[k], ttl); }); },
    remove: function (k) { tx(function (db) { delete db.cache[k]; }); },
    removeAll: function (keys) { tx(function (db) { keys.forEach(function (k) { delete db.cache[k]; }); }); }
  };
  root.CacheService = { getScriptCache: function () { return Cache; } };
  root.LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
  root.Utilities = { getUuid: function () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  } };

  /** Creates demo sheets with sample students (no passwords yet, so each creates one; teacher password "changeme"). */
  root.MockGas = {
    reset: function () { save({ sheets: {}, cache: {} }); },
    seedDemo: function () {
      if (Spreadsheet.getSheetByName('Settings')) return;
      root.setup();
      var names = ['Ava', 'Ben', 'Chloe', 'Daniel', 'Ella', 'Finn', 'Grace', 'Harry', 'Isla', 'Jack', 'Kiara', 'Leo'];
      var sh = Spreadsheet.getSheetByName('Students');
      sh.getRange(2, 1, names.length, 4).setValues(names.map(function (n, i) { return ['d' + (i + 1), n, '', true]; }));
      root.clearCache();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
