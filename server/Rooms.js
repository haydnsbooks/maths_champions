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
 *  - A team with no correct answers (or no results at all) has no result: it gets no place (rank null) and is listed last.
 *  - Times are compared unrounded (avgRaw), so two teams that both show 4.37 s still get the right places.
 *    The screens show extra decimal places where needed.
 *  - Teams equal on time AND points share the place. If that place is 1st, every team on it gets the trophy.
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
      var pts = sub.c * CONFIG.POINTS_CORRECT + sub.w * CONFIG.POINTS_WRONG;
      var t = attemptTime_(sub.s, sub.c);
      var saved = sub.s >= CONFIG.MIN_ATTEMPT_SECONDS;
      var p = profiles[id] = profiles[id] || {};
      var before = opSummary_(p, g.op, cutoff, now).current;
      if (saved) {
        recordAttempt_(p, g.op, a.level, t, now);
        updates[id] = p;
        var name = room.players[id] ? room.players[id].name : '';
        rows.push([new Date(now), id, name, 'class', g.op, a.level, sub.c, sub.w, round2_(sub.s), t, pts, room.code]);
      }
      var after = opSummary_(p, g.op, cutoff, now);
      personal[id] = { correct: sub.c, wrong: sub.w, points: pts, avgTime: sub.c > 0 ? t : null, level: a.level, saved: saved,
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
               correct: c, wrong: w, points: pts, exp: tm.exp !== undefined ? tm.exp : null,
               avgRaw: c > 0 ? s / c : null, avgTime: c > 0 ? round2_(s / c) : null };
    });
    teams = teams.filter(function (t) { return t.size > 0; }); // everyone on this team left
    teams.sort(function (a, b) {
      var ra = hasResult_(a), rb = hasResult_(b);
      if (ra !== rb) return ra ? -1 : 1;
      if (CONFIG.RANK_BY === 'points') return b.points - a.points || cmpTime_(a, b);
      return cmpTime_(a, b) || b.points - a.points;
    });
    var prev = null;
    teams.forEach(function (t, i) {
      if (!hasResult_(t)) { t.rank = null; return; }
      t.rank = prev && sameResult_(prev, t) ? prev.rank : i + 1;
      prev = t;
    });

    // Trophy: every player on the winning team(s) who sent in a result gets the same one. No result -> no trophy.
    var winners = teams.filter(function (t) { return t.rank === 1; });
    if (winners.length) {
      var trophy = pickTrophy_(room.lastTrophy);
      room.lastTrophy = trophy.e;
      winners.forEach(function (win) {
        win.trophy = trophy;
        g.teams[win.index].members.forEach(function (id) {
          if (!room.subs[id]) return;
          awardTrophy_(profiles[id], trophy, g.op, win.name, now);
          updates[id] = profiles[id];
          personal[id].trophy = trophy;
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
function rawTime_(t) { return t.avgRaw !== undefined && t.avgRaw !== null ? t.avgRaw : t.avgTime; }
function cmpTime_(a, b) {
  var x = rawTime_(a), y = rawTime_(b);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return Math.abs(x - y) < 1e-9 ? 0 : x - y;
}
function sameResult_(a, b) { return cmpTime_(a, b) === 0 && a.points === b.points; }

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
