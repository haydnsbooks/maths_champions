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
