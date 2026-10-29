/**
 * TEACHER APP (teacher.html)
 * Login -> dashboard: open a room, choose operation / number of teams / time, start, see results, play again.
 * Also: fluency cut-off settings, a class overview of everyone's levels, and a Passwords page to reset a student's password.
 */
(function () {
  var C = window.APP_CONFIG, esc = Game.esc, store = API.storage, KEY = 'fg_teacher';
  var app = document.getElementById('app');
  var T = { token: null, code: null, cutoffs: null, rules: null, timer: null, room: null, showMembers: false, finishing: false,
            choice: { op: 'add', teams: 4, seconds: 120 }, againTeams: 'same', shownResultsRound: null };

  function render(html) { app.innerHTML = html; }
  function on(sel, ev, fn) { var n = app.querySelector(sel); if (n) n.addEventListener(ev, fn); }
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3500); }
  function save() { store.setItem(KEY, JSON.stringify({ token: T.token, code: T.code, choice: T.choice, againTeams: T.againTeams })); }
  function stop() { clearTimeout(T.timer); T.timer = null; }
  function fail(e) {
    if (e && e.code === 'SESSION_EXPIRED') { store.removeItem(KEY); T.token = null; toast('Please log in again.'); return showLogin(); }
    if (e && e.code === 'ROOM_CLOSED') { T.code = null; save(); return showDashboard(); }
    toast(e && e.message ? e.message : 'Something went wrong');
  }
  function call(action, data) { return API.call(action, Object.assign({ teacherToken: T.token, code: T.code }, data || {})); }

  /* ---------- login ---------- */
  function showLogin() {
    stop();
    render('<div class="card temple narrow"><h1 class="title">Teacher</h1>' +
      (API.demo ? '<p class="demo-note">Demo mode — password is <b>changeme</b>. Open <a href="index.html" target="_blank">student tabs</a> to join.</p>' : '') +
      '<label>Teacher password<input id="pw" type="password"></label><button class="btn big primary" id="go">Log in</button>' +
      '<a class="switch-link" href="index.html">← Student login</a></div>');
    var go = function () {
      API.call('teacherLogin', { password: app.querySelector('#pw').value }).then(function (r) {
        T.token = r.teacherToken; T.cutoffs = r.cutoffs; T.rules = r.rules; T.code = r.activeRoom || null; save(); showDashboard();
      }).catch(fail);
    };
    on('#go', 'click', go);
    on('#pw', 'keydown', function (e) { if (e.key === 'Enter') go(); });
  }

  /* ---------- dashboard shell ---------- */
  function showDashboard() {
    stop();
    render('<div class="teacher-layout">' +
      '<header class="t-head"><h1>⚡ Trials of Olympus</h1><nav>' +
        '<button class="btn small" id="nav-overview">📊 Class levels</button>' +
        '<button class="btn small" id="nav-passwords">🔑 Passwords</button>' +
        '<button class="btn small" id="nav-settings">⚙️ Cut-offs</button>' +
        '<button class="btn small ghost" id="nav-out">Log out</button></nav></header>' +
      versionWarning() +
      '<main id="room"></main></div>');
    on('#nav-overview', 'click', showOverview);
    on('#nav-passwords', 'click', function () { showPasswords(); });
    on('#nav-settings', 'click', showSettings);
    on('#nav-out', 'click', function () { stop(); store.removeItem(KEY); T.token = null; showLogin(); });
    if (!T.code) return drawNoRoom();
    refresh();
  }
  function roomEl() { return app.querySelector('#room'); }

  /** Shown when Google's copy of the server code is older (or newer) than this page expects. */
  function versionWarning() {
    var want = C.SERVER_VERSION, have = T.rules && T.rules.serverVersion;
    if (!want || API.demo || have === want) return '';
    return '<div class="card version-warn" role="alert"><b>⚠️ The Apps Script code is out of date.</b> ' +
      'Google is running ' + (have ? 'version ' + esc(String(have)) : 'an older version') + '; this page needs version ' + want + '. ' +
      'Some buttons (like Play again) won\'t work until it\'s updated.' +
      '<ol><li>In Apps Script, open <b>Code.gs</b>, select all (Ctrl+A), delete, paste the whole new Code.gs, press <b>Save</b>.</li>' +
      '<li>Check the file list on the left has no other .gs files.</li>' +
      '<li><b>Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy</b>.</li>' +
      '<li>Reload this page.</li></ol></div>';
  }

  function drawNoRoom() {
    roomEl().innerHTML = '<div class="card narrow center"><div class="big-emoji">🏁</div><h2>Start a class game</h2>' +
      '<p>Open a room, then students log in and press <b>Class game</b>.</p><button class="btn huge primary" id="open">Open room</button></div>';
    on('#open', 'click', function () {
      call('openRoom').then(function (r) { T.code = r.room.code; save(); drawRoom(r.room); }).catch(fail);
    });
  }

  function refresh() {
    stop();
    if (!T.code) return;
    call('roomState').then(function (r) { drawRoom(r.room); }).catch(fail);
  }
  function schedule(ms) { stop(); T.timer = setTimeout(refresh, ms); }

  /* ---------- room states ---------- */
  function drawRoom(room) {
    T.room = room;
    if (room.status !== 'lobby') T.lobbyKey = null;
    if (!roomEl()) return;
    if (room.status === 'lobby') return drawLobby(room);
    if (room.status === 'playing') return drawPlaying(room);
    if (room.status === 'results') return drawResults(room);
  }

  function select(id, options, value) {
    return '<select id="' + id + '">' + options.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
  }
  function opOptions() { return Levels.ORDER.map(function (o) { return [o, Levels.OPS[o].symbol + '  ' + Levels.OPS[o].name]; }); }
  function timeOptions() { return C.GAME_SECONDS.map(function (s) { return [s, s < 60 ? s + ' seconds' : (s / 60) + ' minute' + (s === 60 ? '' : 's')]; }); }

  /** e.g. "25 students → 6 teams of 4–5". Matches how the server splits players (sizes differ by at most 1). */
  function teamHint(players, teams) {
    if (!players) return 'Teams are made when you press Start.';
    if (!teams || teams <= 1 || teams >= players) return players + ' student' + (players === 1 ? '' : 's') + ' → each plays solo';
    var small = Math.floor(players / teams), big = Math.ceil(players / teams);
    return players + ' students → ' + teams + ' teams of ' + (small === big ? small : small + '–' + big);
  }

  function drawLobby(room) {
    var ch = T.choice;
    // Only redraw when the player list changes, so open drop-downs aren't interrupted.
    var key = room.round + '|' + room.players.map(function (p) { return p.id; }).join(',');
    if (T.lobbyKey !== key || !app.querySelector('#start')) {
      T.lobbyKey = key;
      roomEl().innerHTML =
        '<div class="lobby-grid">' +
          '<section class="card"><h2>Students joined: <span class="count">' + room.players.length + '</span></h2>' +
            '<p class="muted">Students log in and press <b>⚔️ Class game</b>. Only students on that screen right now are listed. Click a name to remove it.</p>' +
            '<div class="chips">' + (room.players.length ? room.players.map(function (p) { return '<button class="chip" data-id="' + esc(p.id) + '">' + esc(p.name) + ' ✕</button>'; }).join('') : '<span class="muted">Nobody yet…</span>') + '</div></section>' +
          '<section class="card"><h2>Game settings</h2>' +
            '<label>Operation' + select('op', opOptions(), ch.op) + '</label>' +
            '<label>Teams' + select('teams', C.TEAM_COUNTS.map(function (n) { return [n, n <= 1 ? 'Individual play' : n + ' teams']; }), ch.teams) + '</label>' +
            '<p class="muted small" id="team-hint"></p>' +
            '<label>Time' + select('secs', timeOptions(), ch.seconds) + '</label>' +
            '<p class="muted small">Each student gets questions at their own level for this operation. Teams are balanced so each team\'s average time per correct answer (from everyone\'s own level) is as even as possible.</p>' +
            '<button class="btn huge primary" id="start"' + (room.players.length ? '' : ' disabled') + '>▶ Start round ' + (room.round + 1) + '</button>' +
            '<button class="btn ghost small" id="close">Close room</button>' +
          '</section></div>';
      var hint = function () { var h = app.querySelector('#team-hint'); if (h) h.textContent = teamHint(T.room.players.length, T.choice.teams); };
      hint();
      app.querySelectorAll('[data-id]').forEach(function (b) {
        b.addEventListener('click', function () { call('removePlayer', { id: b.getAttribute('data-id') }).then(function (r) { drawRoom(r.room); }).catch(fail); });
      });
      ['op', 'teams', 'secs'].forEach(function (id) {
        on('#' + id, 'change', function () {
          T.choice = { op: app.querySelector('#op').value, teams: Number(app.querySelector('#teams').value), seconds: Number(app.querySelector('#secs').value) };
          save(); hint();
        });
      });
      on('#start', 'click', function () {
        var b = app.querySelector('#start'); b.disabled = true; b.textContent = 'Forming teams…';
        stop();
        call('startGame', T.choice).then(function (r) { drawRoom(r.room); }).catch(function (e) {
          b.disabled = false; b.textContent = '▶ Start round ' + (room.round + 1); fail(e); schedule(C.TEACHER_POLL_MS);
        });
      });
      on('#close', 'click', closeRoom);
    }
    schedule(C.TEACHER_POLL_MS + Math.random() * 500);
  }

  function closeRoom() {
    if (!confirm('Close the room? Students will go back to their menu.')) return;
    stop();
    call('closeRoom').then(function () { T.code = null; save(); drawNoRoom(); }).catch(fail);
  }

  /** Under the team names: how even the teams were made, so the teacher can see the balancing worked. */
  function balanceNote(g) {
    if (g.individual || g.balanceSd === null || g.balanceSd === undefined) return '';
    var est = 0;
    g.teams.forEach(function (t) { (t.members || []).forEach(function (m) { if (m.est) est++; }); });
    return '<p class="muted small balance-note">Each team\'s expected average time per correct answer, from every player\'s own level for this operation. ' +
      'Spread between teams (standard deviation): <b>' + g.balanceSd.toFixed(3) + ' s</b>.' +
      (est ? '<br>' + est + ' player' + (est === 1 ? ' hasn\'t' : 's haven\'t') + ' played their level yet, so ' + (est === 1 ? 'that time is' : 'those times are') + ' an estimate (cut-off + 1.5 s).' : '') + '</p>';
  }

  function drawPlaying(room) {
    var g = room.game;
    var now = API.now();
    var phase = now < g.startAt ? 'countdown' : now < g.endAt ? 'running' : 'collecting';
    roomEl().innerHTML =
      '<div class="card center playing-card">' +
        '<p class="muted">Round ' + room.round + ' · ' + Levels.OPS[g.op].symbol + ' ' + Levels.OPS[g.op].name + ' · ' + (g.individual ? 'Individual play' : g.teams.length + ' teams') + ' · ' + g.expected + ' players</p>' +
        '<div class="big-timer" data-t></div>' +
        '<p data-msg></p>' +
        '<div class="team-pills">' + g.teams.map(function (t) {
          return '<span class="pill" style="--team:' + t.hex + '">' + t.emoji + ' ' + esc(t.name) +
            (!g.individual && t.exp !== null && t.exp !== undefined ? ' <small>' + t.exp.toFixed(2) + ' s</small>' : '') + '</span>';
        }).join('') + '</div>' +
        balanceNote(g) +
        '<button class="btn" id="finish"' + (phase === 'collecting' ? '' : ' hidden') + '>Show results now</button>' +
      '</div>';
    on('#finish', 'click', finish);
    var tEl = app.querySelector('[data-t]'), msg = app.querySelector('[data-msg]');
    (function tick() {
      if (!T.room || T.room !== room || !app.contains(tEl)) return;
      var n = API.now();
      if (n < g.startAt) { tEl.textContent = 'Starting in ' + Math.ceil((g.startAt - n) / 1000); msg.textContent = 'Students see their team and level now…'; }
      else if (n < g.endAt) { var s = Math.ceil((g.endAt - n) / 1000); tEl.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); msg.textContent = 'Game on! 🔥'; }
      else {
        tEl.textContent = '⏱️ Time\'s up!';
        msg.textContent = 'Collecting results: ' + room.submitted + ' / ' + g.expected;
        var fb = app.querySelector('#finish'); if (fb) fb.hidden = false;
        // Poll for submissions only after the game ends (no traffic during play).
        if (!T.timer && !T.finishing) {
          if (room.submitted >= g.expected || n > g.endAt + (T.rules.submitGraceMs || 15000)) return finish();
          schedule(C.TEACHER_POLL_MS);
        }
        return;
      }
      setTimeout(tick, 200);
    })();
  }

  function finish() {
    if (T.finishing) return;
    T.finishing = true; stop();
    call('finishGame').then(function (r) { T.finishing = false; drawRoom(r.room); }).catch(function (e) { T.finishing = false; fail(e); schedule(3000); });
  }

  /** What the Teams choice on the Play again panel will do. */
  function againHint(value, g) {
    if (value === 'same') {
      return (g.individual ? 'Everyone plays solo again, with the same code names.' : 'The same teams play again.') +
        ' Anyone who has left drops out; anyone new joins ' + (g.individual ? 'with their own code name' : 'the smallest team') + '.';
    }
    if (Number(value) <= 1) return 'Everyone plays solo.';
    return 'New teams, balanced so each team\'s average time per correct answer (from everyone\'s own level for this operation) is as even as possible.';
  }

  function drawResults(room) {
    stop();
    var g = room.game || {};
    var sameLabel = g.individual ? 'Same as last round (individual play)' : 'Same teams (' + (g.teamCount || g.teams.length) + ' teams)';
    var teamOptions = [['same', sameLabel]].concat(C.TEAM_COUNTS.map(function (n) { return [n, n <= 1 ? 'New: individual play' : 'New: ' + n + ' teams']; }));
    var teamsValue = T.againTeams === 'same' || C.TEAM_COUNTS.indexOf(Number(T.againTeams)) >= 0 ? T.againTeams : 'same';
    roomEl().innerHTML = '<div class="card wide" id="res"></div>' +
      '<section class="card wide again-card">' +
        '<h2>⚡ Play again</h2>' +
        '<p class="muted small">Everyone still on the class-game screen plays the next round. Students don\'t need to do anything: their iPads go straight to the countdown.</p>' +
        '<div class="again-grid">' +
          '<label>Operation' + select('a-op', opOptions(), g.op || T.choice.op) + '</label>' +
          '<label>Time' + select('a-secs', timeOptions(), g.seconds || T.choice.seconds) + '</label>' +
          '<label>Teams' + select('a-teams', teamOptions, teamsValue) + '</label>' +
        '</div>' +
        '<p class="muted small" id="a-hint"></p>' +
        '<button class="btn huge primary" id="again">▶ Play round ' + (room.round + 1) + '</button>' +
      '</section>' +
      '<div class="center result-actions">' +
        '<label class="toggle"><input type="checkbox" id="mem"' + (T.showMembers ? ' checked' : '') + '> Show team members</label>' +
        '<button class="btn ghost" id="lobby">Back to lobby</button><button class="btn ghost" id="close">Close room</button></div>';
    var draw = function (party) {
      Celebrate.results(app.querySelector('#res'), { teams: room.results.teams, showMembers: T.showMembers, penalty: T.rules.wrongPenaltySec, big: true, confetti: party });
    };
    draw(T.shownResultsRound !== room.round);
    T.shownResultsRound = room.round;
    var hint = function () { app.querySelector('#a-hint').textContent = againHint(app.querySelector('#a-teams').value, g); };
    hint();
    on('#a-teams', 'change', function () { T.againTeams = app.querySelector('#a-teams').value; save(); hint(); });
    on('#mem', 'change', function (e) { T.showMembers = e.target.checked; draw(false); });
    on('#again', 'click', function () {
      var b = app.querySelector('#again'); b.disabled = true; b.textContent = 'Forming teams…';
      var choice = { op: app.querySelector('#a-op').value, seconds: Number(app.querySelector('#a-secs').value), teams: app.querySelector('#a-teams').value };
      T.choice.op = choice.op; T.choice.seconds = choice.seconds; T.againTeams = choice.teams; save();
      call('playAgain', choice).then(function (r) { drawRoom(r.room); }).catch(function (e) {
        b.disabled = false; b.textContent = '▶ Play round ' + (room.round + 1); fail(e);
      });
    });
    on('#lobby', 'click', function () { call('newRound').then(function (r) { drawRoom(r.room); }).catch(fail); });
    on('#close', 'click', closeRoom);
  }

  /* ---------- settings ---------- */
  function showSettings() {
    stop();
    roomEl().innerHTML = '<div class="card narrow"><h2>⚙️ Fluency cut-offs</h2>' +
      '<p>A student is <b>fluent</b> at a level when (average of their last 3 attempts + dust) is at or below this many seconds per correct answer. Each attempt\'s time includes ' + (T.rules.wrongPenaltySec || 1) + ' s added for every wrong answer.</p>' +
      Levels.ORDER.map(function (op) {
        return '<label>' + Levels.OPS[op].symbol + ' ' + Levels.OPS[op].name + ' (seconds)<input type="number" step="0.1" min="0.5" max="60" id="c-' + op + '" value="' + T.cutoffs[op] + '"></label>';
      }).join('') +
      '<div class="choice-row"><button class="btn primary" id="save">Save</button><button class="btn ghost" id="back">← Back to game</button></div></div>';
    on('#save', 'click', function () {
      var c = {}; Levels.ORDER.forEach(function (op) { c[op] = Number(app.querySelector('#c-' + op).value); });
      call('saveSettings', { cutoffs: c }).then(function (r) { T.cutoffs = r.cutoffs; toast('Saved'); }).catch(fail);
    });
    on('#back', 'click', backToGame);
  }
  function backToGame() { if (T.code) refresh(); else drawNoRoom(); }

  /* ---------- passwords ---------- */
  /** Pick a student, press Reset: their password is cleared and they make a new one at their next log-in. */
  function showPasswords(selectedId, doneMsg) {
    stop();
    roomEl().innerHTML = '<div class="card narrow"><div class="spinner"></div></div>';
    call('studentPasswords').then(function (r) {
      var list = r.students, byId = {};
      list.forEach(function (s) { byId[s.id] = s; });
      roomEl().innerHTML = '<div class="card narrow pw-card"><div class="row-between"><h2>🔑 Reset a password</h2><button class="btn ghost" id="back">← Back to game</button></div>' +
        '<p>Choose a student and press <b>Reset password</b>. Next time they log in, they\'ll be asked to make a new password. Their levels and trophies are kept.</p>' +
        (doneMsg ? '<p class="done-note" role="status">✅ ' + esc(doneMsg) + '</p>' : '') +
        '<label>Student<select id="who"><option value="">Choose a student…</option>' + list.map(function (s) {
          return '<option value="' + esc(s.id) + '"' + (s.id === selectedId ? ' selected' : '') + '>' + esc(s.name) + (s.hasPassword ? '' : ' (no password yet)') + '</option>';
        }).join('') + '</select></label>' +
        '<p class="muted small" id="pw-state"></p>' +
        '<button class="btn big primary" id="reset" disabled>Reset password</button>' +
        '<p class="muted small">To look a password up instead, open the Students sheet (column C).</p></div>';
      var who = app.querySelector('#who'), btn = app.querySelector('#reset'), state = app.querySelector('#pw-state');
      var update = function () {
        var s = byId[who.value];
        btn.disabled = !s || !s.hasPassword;
        state.textContent = !s ? '' : s.hasPassword ? '' : s.name + ' doesn\'t have a password yet. They\'ll create one when they next log in.';
      };
      who.addEventListener('change', update);
      update();
      on('#back', 'click', backToGame);
      on('#reset', 'click', function () {
        var s = byId[who.value];
        if (!s || !confirm('Reset ' + s.name + '\'s password?\n\nThey\'ll create a new one next time they log in. Their levels and trophies are kept.')) return;
        btn.disabled = true; btn.textContent = 'Resetting…';
        call('resetPassword', { id: s.id }).then(function () {
          showPasswords('', s.name + '\'s password has been reset. They\'ll make a new one when they next log in.');
        }).catch(function (e) { btn.disabled = false; btn.textContent = 'Reset password'; fail(e); });
      });
    }).catch(fail);
  }

  /* ---------- class overview ---------- */
  function showOverview() {
    stop();
    roomEl().innerHTML = '<div class="card"><div class="spinner"></div></div>';
    call('classOverview').then(function (r) {
      roomEl().innerHTML = '<div class="card"><div class="row-between"><h2>📊 Class levels</h2><button class="btn ghost" id="back">← Back to game</button></div>' +
        '<p class="muted">Current level (lowest level not yet fluent) and its fluency time. 🧹 = dust included.</p>' +
        '<div class="table-wrap"><table class="lv-table overview"><thead><tr><th>Student</th>' +
        Levels.ORDER.map(function (op) { return '<th>' + Levels.OPS[op].symbol + ' ' + Levels.OPS[op].name + '<small>cut-off ' + r.cutoffs[op] + ' s</small></th>'; }).join('') +
        '</tr></thead><tbody>' + r.rows.map(function (row) {
          return '<tr><td><b>' + esc(row.name) + '</b>' +
            (row.hasPassword ? '<button class="btn small ghost reset-pw" data-id="' + esc(row.id) + '" data-name="' + esc(row.name) + '">Reset password</button>'
                             : '<small>No password yet: they\'ll create one at log-in</small>') + '</td>' + Levels.ORDER.map(function (op) {
            var c = row[op];
            return '<td>' + (c.mastered ? '🏆 All' : '<b>L' + c.level + '</b> ' + esc(Levels.title(op, c.level)) + '<small>' + esc(Levels.info(op, c.level).desc) + '</small>' +
              '<small>' + (c.time !== null ? c.time.toFixed(2) + ' s' + (c.dust ? ' 🧹' : '') : 'not tried') + '</small>') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="muted small">Forgotten passwords: look in the Students sheet, or use 🔑 Passwords (or Reset password here) so they create a new one next time they log in.</p></div>';
      on('#back', 'click', backToGame);
      app.querySelectorAll('.reset-pw').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('Reset ' + b.getAttribute('data-name') + '\'s password? They\'ll create a new one next time they log in. Their levels are kept.')) return;
          call('resetPassword', { id: b.getAttribute('data-id') }).then(function () { toast('Password reset'); showOverview(); }).catch(fail);
        });
      });
    }).catch(fail);
  }

  /* ---------- start ---------- */
  try {
    var saved = JSON.parse(store.getItem(KEY));
    if (saved) {
      T.token = saved.token; T.code = saved.code;
      if (saved.choice) {
        T.choice = { op: saved.choice.op || 'add', seconds: saved.choice.seconds || 120,
                     teams: saved.choice.teams !== undefined ? saved.choice.teams : 4 }; // older saves had "per team" instead
        if (C.TEAM_COUNTS.indexOf(T.choice.teams) < 0) T.choice.teams = 4;
      }
      if (saved.againTeams !== undefined) T.againTeams = saved.againTeams;
    }
  } catch (e) { /* ignore */ }
  if (!T.token) return showLogin();
  // Re-validate the saved login and pick up current settings (e.g. after a page refresh).
  call('teacherInfo').then(function (r) { T.cutoffs = r.cutoffs; T.rules = r.rules; T.code = r.activeRoom || null; save(); showDashboard(); })
    .catch(function (e) { if (e.code === 'SESSION_EXPIRED') fail(e); else { toast(e.message); showLogin(); } });
})();
