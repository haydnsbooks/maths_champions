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
