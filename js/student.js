/**
 * STUDENT APP (index.html)
 * Screens: login -> menu -> { practice | class game (multiplayer) | my levels }
 * Each screen is one function that fills #app. Server calls go through API (js/api.js).
 */
(function () {
  var C = window.APP_CONFIG, esc = Game.esc, store = API.storage, KEY = 'fg_session';
  var app = document.getElementById('app');
  var S = { session: null, timer: null, mp: null };

  /* ---------- helpers ---------- */
  function render(html) { app.innerHTML = html; window.scrollTo(0, 0); }
  function stopPolling() { clearTimeout(S.timer); S.timer = null; S.mp = null; }
  function saveSession() { store.setItem(KEY, JSON.stringify(S.session)); }
  function opName(op) { return Levels.OPS[op].name; }
  function loading(msg) { render('<div class="center pad-xl"><div class="spinner"></div><p>' + esc(msg || 'Loading…') + '</p></div>'); }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3500);
  }
  function fail(e) {
    if (e && e.code === 'SESSION_EXPIRED') { store.removeItem(KEY); S.session = null; toast('Please log in again.'); return showLogin(); }
    toast(e && e.message ? e.message : 'Something went wrong');
  }
  function on(sel, ev, fn) { var n = app.querySelector(sel); if (n) n.addEventListener(ev, fn); }
  function onAll(sel, ev, fn) { app.querySelectorAll(sel).forEach(function (n) { n.addEventListener(ev, function () { fn(n); }); }); }
  function backBtn(label) { return '<button class="btn ghost back" data-back>← ' + (label || 'Back') + '</button>'; }
  /** Profiles change after class games and when the teacher changes cut-offs, so re-fetch on the menu screens. */
  function refreshProfile(then) {
    API.call('profile', { token: S.session.token }).then(function (r) { S.session.profile = r.profile; S.session.rules = r.rules; saveSession(); then(); }).catch(fail);
  }

  /* ---------- login ---------- */
  function startSession(res) {
    S.session = { token: res.token, student: res.student, profile: res.profile, rules: res.rules };
    saveSession();
  }

  function showLogin() {
    stopPolling();
    loading('Opening the temple gates…');
    API.call('classList').then(function (r) {
      var byId = {};
      r.students.forEach(function (s) { byId[s.id] = s; });
      render(
        '<div class="card temple narrow">' +
          '<h1 class="title">Trials of Olympus</h1>' +
          '<p class="subtitle">Climb Mount Olympus one level at a time</p>' +
          (API.demo ? '<p class="demo-note">Demo mode: nobody has a password yet, so you\'ll create one.</p>' : '') +
          '<label>Your name<select id="who"><option value="">Choose your name…</option>' +
            r.students.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('') +
          '</select></label>' +
          '<div id="pw-area"></div>' +
          '<a class="switch-link" href="teacher.html">Teacher login</a>' +
        '</div>');
      var area = app.querySelector('#pw-area'), who = app.querySelector('#who');

      function drawReturning() {
        area.innerHTML = '<label>Password<input id="pw" type="password" autocomplete="off" autocapitalize="off"></label>' +
          '<button class="btn big primary" id="go">Enter</button>';
        var go = function () {
          var b = app.querySelector('#go'); b.disabled = true; b.textContent = 'Checking…';
          API.call('login', { studentId: who.value, password: app.querySelector('#pw').value }).then(function (res) {
            startSession(res); showMenu();
          }).catch(function (e) {
            b.disabled = false; b.textContent = 'Enter';
            if (e.code === 'NEEDS_PASSWORD') { byId[who.value].isNew = true; return drawFirstTime(); } // teacher reset it
            fail(e);
          });
        };
        on('#go', 'click', go);
        on('#pw', 'keydown', function (e) { if (e.key === 'Enter') go(); });
        app.querySelector('#pw').focus();
      }

      function drawFirstTime() {
        area.innerHTML =
          '<div class="first-time">' +
            '<h2>Create your password</h2>' +
            '<p>This is your first time here. Make up a password you\'ll remember, at least 4 letters or numbers.</p>' +
            '<p class="write-it">✍️ Write it down somewhere safe, like the back of your diary.</p>' +
            '<label>New password<input id="pw1" type="password" autocomplete="off" autocapitalize="off"></label>' +
            '<label>Type it again<input id="pw2" type="password" autocomplete="off" autocapitalize="off"></label>' +
            '<label class="show-pw"><input type="checkbox" id="show"> Show what I typed</label>' +
            '<button class="btn big primary" id="create">Save my password</button>' +
          '</div>';
        on('#show', 'change', function (e) {
          ['#pw1', '#pw2'].forEach(function (sel) { app.querySelector(sel).type = e.target.checked ? 'text' : 'password'; });
        });
        var create = function () {
          var a = app.querySelector('#pw1').value.trim(), b2 = app.querySelector('#pw2').value.trim();
          if (a.length < 4) return toast('Your password needs at least 4 letters or numbers.');
          if (a !== b2) return toast('The two passwords don\'t match. Try again.');
          var b = app.querySelector('#create'); b.disabled = true; b.textContent = 'Saving…';
          API.call('setPassword', { studentId: who.value, password: a }).then(function (res) {
            startSession(res); showPasswordSaved(a);
          }).catch(function (e) { b.disabled = false; b.textContent = 'Save my password'; fail(e); });
        };
        on('#create', 'click', create);
        on('#pw2', 'keydown', function (e) { if (e.key === 'Enter') create(); });
        app.querySelector('#pw1').focus();
      }

      who.addEventListener('change', function () {
        var s = byId[who.value];
        if (!s) { area.innerHTML = ''; return; }
        if (s.isNew) drawFirstTime(); else drawReturning();
      });
    }).catch(function (e) {
      render('<div class="card narrow center"><h2>Can\'t reach the game</h2><p>' + esc(e.message) + '</p><button class="btn primary" id="retry">Try again</button></div>');
      on('#retry', 'click', showLogin);
    });
  }

  /** Shown once, straight after a student creates their password. */
  function showPasswordSaved(pw) {
    render('<div class="card temple narrow center">' +
      '<div class="big-emoji">🔐</div>' +
      '<h2>Password saved!</h2>' +
      '<p>Your password is:</p><p class="pw-show">' + esc(pw) + '</p>' +
      '<p class="write-it">✍️ Write it down somewhere safe now. You\'ll need it every time you log in.</p>' +
      '<button class="btn big primary" id="done">I\'ve written it down</button></div>');
    on('#done', 'click', showMenu);
  }

  /* ---------- menu ---------- */
  function showMenu() {
    stopPolling();
    render(
      '<div class="card temple narrow center">' +
        '<h1 class="title">Welcome, ' + esc(S.session.student.name.split(' ')[0]) + '</h1>' +
        '<div class="menu">' +
          '<button class="btn huge primary" id="mp">⚔️ Class game</button>' +
          '<button class="btn huge" id="pr">🎯 Practice</button>' +
          '<button class="btn huge" id="lv">📜 My levels</button>' +
        '</div>' +
        '<button class="btn ghost small" id="out">Log out</button>' +
      '</div>');
    on('#mp', 'click', showMultiplayer);
    on('#pr', 'click', function () { showPracticeOps(); });
    on('#lv', 'click', function () { showProfile(Levels.ORDER[0]); });
    on('#out', 'click', function () { store.removeItem(KEY); S.session = null; showLogin(); });
  }

  function opButtons() {
    return Levels.ORDER.map(function (op) {
      var sum = S.session.profile[op];
      return '<button class="btn op-btn" data-op="' + op + '"><span class="op-sym">' + Levels.OPS[op].symbol + '</span>' +
        '<span>' + opName(op) + '<small>' + (sum.mastered ? '🏆 Every level fluent' : 'Level ' + sum.current + ': ' + esc(Levels.title(op, sum.current))) + '</small></span></button>';
    }).join('');
  }

  /* ---------- practice (always 1 minute) ---------- */
  function showPracticeOps(fresh) {
    stopPolling();
    render('<div class="card" data-screen="ops">' + backBtn('Menu') + '<h2>Practice</h2><p class="muted">Choose an operation. Every practice round is ' + C.PRACTICE_SECONDS + ' seconds.</p><div class="op-grid">' + opButtons() + '</div></div>');
    on('[data-back]', 'click', showMenu);
    onAll('[data-op]', 'click', function (b) { showPracticeLevels(b.getAttribute('data-op')); });
    if (!fresh) refreshProfile(function () { if (app.querySelector('[data-screen="ops"]')) showPracticeOps(true); });
  }

  function levelStatus(st, sum) {
    if (st.fluent) return '<span class="tag ok">✅ ' + st.time.toFixed(2) + ' s</span>';
    if (st.level === sum.current) return '<span class="tag cur">🎯 Your level' + (st.time !== null ? ' · ' + st.time.toFixed(2) + ' s' : '') + '</span>';
    if (st.time !== null) return '<span class="tag">' + st.time.toFixed(2) + ' s</span>';
    return '<span class="tag dim">Not tried</span>';
  }

  function showPracticeLevels(op) {
    var sum = S.session.profile[op];
    render('<div class="card">' + backBtn() + '<h2>' + opName(op) + '</h2>' +
      '<p class="muted">Tap a level to start. You\'re fluent at ' + sum.cutoff + ' s or faster per correct answer (average of your last 3 tries).</p>' +
      '<div class="level-list">' + sum.levels.map(function (st) {
        var info = Levels.info(op, st.level);
        return '<button class="level-btn' + (st.level === sum.current ? ' current' : '') + '" data-level="' + st.level + '">' +
          '<span class="lv-num">' + st.level + '</span>' +
          '<span class="lv-emoji">' + info.emoji + '</span>' +
          '<span class="lv-name">' + (info.tag ? '<b class="lv-tag">' + esc(info.tag) + '</b> ' : '') + esc(info.name) + '</span>' +
          levelStatus(st, sum) + '</button>';
      }).join('') + '</div></div>');
    on('[data-back]', 'click', showPracticeOps);
    onAll('[data-level]', 'click', function (b) { runPractice(op, Number(b.getAttribute('data-level'))); });
    var cur = app.querySelector('.level-btn.current'); if (cur) cur.scrollIntoView({ block: 'center' });
  }

  async function runPractice(op, level) {
    var secs = C.PRACTICE_SECONDS;
    var started = await Game.countdown(app, Date.now() + 3000, Date.now, '<h2 class="count-title">' + esc(Levels.title(op, level)) + '</h2>');
    if (!started) return showPracticeLevels(op);
    var res = await Game.play(app, { op: op, level: level, endAt: Date.now() + secs * 1000, clock: Date.now, rules: S.session.rules, label: Levels.title(op, level) });
    if (res.quit) return showPracticeLevels(op); // leaving early doesn't save anything
    var saved = null, err = null;
    try {
      saved = await API.callRetry('practiceSubmit', { token: S.session.token, op: op, level: level, correct: res.correct, wrong: res.wrong, seconds: res.seconds });
      S.session.profile = saved.profile; saveSession();
    } catch (e) { err = e; if (e.code === 'SESSION_EXPIRED') return fail(e); }
    var st = S.session.profile[op].levels[level - 1], sum = S.session.profile[op];
    var each = res.correct ? (res.seconds / res.correct) : null;
    render('<div class="card temple narrow center">' +
      '<h2>' + (res.correct ? 'Well fought!' : 'Keep training!') + '</h2>' +
      '<p class="muted">' + esc(Levels.label(op, level)) + '</p>' +
      '<div class="stat-grid">' +
        '<div><b>' + res.correct + '</b><span>correct</span></div><div><b>' + res.wrong + '</b><span>wrong</span></div>' +
        '<div><b>' + (each ? each.toFixed(2) + ' s' : '—') + '</b><span>per correct</span></div><div><b>' + res.points + '</b><span>points</span></div>' +
      '</div>' +
      (err ? '<p class="warn">Couldn\'t save this game: ' + esc(err.message) + '</p>' :
        !saved.saved ? '<p class="muted">This game was too short to save.</p>' :
        '<p>' + (st.fluent ? '✅ You are <b>fluent</b> at this level (' + st.time.toFixed(2) + ' s)!' :
          'Your fluency time here: <b>' + st.time.toFixed(2) + ' s</b> (goal: ' + sum.cutoff + ' s or faster)') + '</p>') +
      '<div class="choice-row"><button class="btn primary" id="again">Play again</button><button class="btn" id="lvls">Levels</button><button class="btn ghost" id="menu">Menu</button></div></div>');
    on('#again', 'click', function () { runPractice(op, level); });
    on('#lvls', 'click', function () { showPracticeLevels(op); });
    on('#menu', 'click', showMenu);
  }

  /* ---------- my levels ---------- */
  function showProfile(op) {
    stopPolling();
    var draw = function () {
      var sum = S.session.profile[op];
      render('<div class="card">' + backBtn('Menu') + '<h2>My levels</h2>' +
        '<div class="tabs">' + Levels.ORDER.map(function (o) { return '<button class="tab' + (o === op ? ' active' : '') + '" data-op="' + o + '">' + Levels.OPS[o].symbol + ' ' + opName(o) + '</button>'; }).join('') + '</div>' +
        '<p class="big-line">' + (sum.mastered ? '🏆 You are fluent at every level!' : 'You are on <b>Level ' + sum.current + ': ' + esc(Levels.title(op, sum.current)) + '</b>') + '</p>' +
        '<p class="muted">Fluent = ' + sum.cutoff + ' s or faster. Dust 🧹 adds 0.5 s each week you don\'t play a level. Play it to clean it off.</p>' +
        '<div class="table-wrap"><table class="lv-table"><thead><tr><th>Level</th><th>Average</th><th>Dust</th><th>Fluency time</th><th></th></tr></thead><tbody>' +
        sum.levels.map(function (st) {
          return '<tr class="' + (st.level === sum.current && !sum.mastered ? 'current' : '') + '">' +
            '<td><b>' + st.level + '</b> ' + esc(Levels.title(op, st.level)) + '</td>' +
            '<td>' + (st.avg !== null ? st.avg.toFixed(2) + ' s' : '—') + '</td>' +
            '<td>' + (st.dust ? '🧹 +' + st.dust.toFixed(1) + ' s' : '') + '</td>' +
            '<td>' + (st.time !== null ? '<b>' + st.time.toFixed(2) + ' s</b>' : '—') + '</td>' +
            '<td>' + (st.fluent ? '✅' : st.level === sum.current ? '🎯' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>');
      on('[data-back]', 'click', showMenu);
      onAll('[data-op]', 'click', function (b) { op = b.getAttribute('data-op'); draw(); });
    };
    draw();
    refreshProfile(function () { if (app.querySelector('.lv-table')) draw(); });
  }

  /* ---------- class game (multiplayer) ---------- */
  var LEAVE_MSG = 'Leave this round? Your score won\'t count.';

  function showMultiplayer() {
    stopPolling();
    var mp = S.mp = { playedRound: null, doneRound: null, resultsRound: null, view: '' };
    loading('Entering the arena…');
    var join = function () {
      if (S.mp !== mp) return;
      API.call('joinRoom', { token: S.session.token }).then(function (r) { if (S.mp === mp) handleRoom(r.room); }).catch(function (e) {
        if (S.mp !== mp) return;
        if (e.code === 'NO_ROOM' || e.code === 'ROOM_CLOSED') {
          if (mp.view !== 'noroom') {
            mp.view = 'noroom';
            render('<div class="card temple narrow center"><div class="big-emoji">🏛️</div><h2>The arena gates are closed</h2>' +
              '<p>Your teacher hasn\'t opened a class game yet. Stay on this screen and you\'ll walk in as soon as it opens.</p>' +
              '<button class="btn ghost" id="leave">← Menu</button></div>');
            on('#leave', 'click', showMenu);
          }
          S.timer = setTimeout(join, C.NO_ROOM_POLL_MS + Math.random() * C.POLL_JITTER_MS);
        } else if (e.network) { S.timer = setTimeout(join, C.NO_ROOM_POLL_MS); }
        else fail(e);
      });
    };
    join();
  }

  function poll(ms) {
    var mp = S.mp;
    clearTimeout(S.timer);
    S.timer = setTimeout(function () {
      API.call('roomState', { token: S.session.token }).then(function (r) { if (S.mp === mp) handleRoom(r.room); }).catch(function (e) {
        if (S.mp !== mp) return;
        if (e.code === 'ROOM_CLOSED') { roomClosed(); }
        else if (e.code === 'SESSION_EXPIRED') fail(e);
        else poll(Math.min(ms * 1.5, 15000));
      });
    }, ms + Math.random() * C.POLL_JITTER_MS);
  }

  /** Leave the room on purpose: tell the server (so the teacher isn't kept waiting), then go to the menu. */
  function leaveRoom() {
    API.call('leaveRoom', { token: S.session.token }).catch(function () {});
    showMenu();
  }

  function roomClosed() {
    S.mp = null;
    render('<div class="card temple narrow center"><div class="big-emoji">🏛️</div><h2>The class game has finished</h2><button class="btn primary" id="menu">Back to menu</button></div>');
    on('#menu', 'click', showMenu);
  }

  function setView(key, html, bind) {
    if (S.mp.view === key) return;
    S.mp.view = key; render(html); if (bind) bind();
  }

  /** Strip shown on every class-game waiting screen so students know they're in the room. */
  function inRoomBanner(text) { return '<div class="in-room"><span class="dot"></span>' + esc(text) + '</div>'; }

  function handleRoom(room) {
    var mp = S.mp;
    if (!mp) return;
    if (!room.joined) { // removed by teacher, or a new room was opened
      return API.call('joinRoom', { token: S.session.token }).then(function (r) { if (S.mp === mp) { handleRoom(r.room); } }).catch(function () { roomClosed(); });
    }
    var g = room.game;
    if (room.status === 'lobby') {
      setView('lobby' + room.round,
        '<div class="card temple narrow center lobby">' + inRoomBanner('You\'re in the game room') +
          '<div class="bolt-wait" aria-hidden="true">⚡</div>' +
          '<h2>You\'re in the arena!</h2>' +
          '<p>Waiting for your teacher to start the game…</p>' +
          '<p class="count-line" data-count></p>' +
          '<p class="muted small">Keep this screen open. The game starts by itself.</p>' +
          '<button class="btn ghost" id="leave">← Leave the room</button></div>',
        function () { on('#leave', 'click', leaveRoom); });
      var c = app.querySelector('[data-count]'); if (c) c.textContent = room.playerCount + ' player' + (room.playerCount === 1 ? '' : 's') + ' in the room';
      return poll(C.LOBBY_POLL_MS);
    }
    if (room.status === 'playing') {
      if (!g.inGame) {
        setView('spectate' + room.round, '<div class="card temple narrow center">' + inRoomBanner('You\'re in the game room') +
          '<div class="big-emoji">🍿</div><h2>A round is already running</h2><p>You\'ll be in the next round.</p>' +
          '<button class="btn ghost" id="leave">← Leave the room</button></div>', function () { on('#leave', 'click', leaveRoom); });
        return poll(C.RESULTS_POLL_MS);
      }
      if (room.submitted || mp.doneRound === room.round) { waiting(); return poll(C.RESULTS_POLL_MS); }
      if (mp.playedRound !== room.round) { mp.playedRound = room.round; return runClassGame(room); }
      return poll(C.RESULTS_POLL_MS);
    }
    if (room.status === 'results') {
      if (mp.resultsRound !== room.round) {
        mp.resultsRound = room.round; mp.view = 'results' + room.round;
        render('<div class="card wide" id="res"></div><div class="center after-results">' + inRoomBanner('Still in the game room. Waiting for the next round…') +
          '<button class="btn ghost" id="leave">← Leave the room</button></div>');
        Celebrate.results(app.querySelector('#res'), { teams: room.results.teams, myTeam: room.results.myTeam, me: room.results.me, rankBy: S.session.rules.rankBy });
        on('#leave', 'click', leaveRoom);
      }
      return poll(C.RESULTS_POLL_MS);
    }
  }

  function waiting(res) {
    setView('waiting', '<div class="card temple narrow center">' + inRoomBanner('You\'re in the game room') +
      '<div class="big-emoji spin">⏳</div><h2>Time\'s up!</h2>' +
      (res ? '<p>You got <b>' + res.correct + '</b> correct.</p>' : '') + '<p>Waiting for everyone\'s results…</p></div>');
  }

  async function runClassGame(room) {
    var mp = S.mp, g = room.game;
    clearTimeout(S.timer); // no polling while playing
    var teamHtml = g.individual
      ? '<div class="team-reveal" style="--team:' + g.team.hex + '"><span>' + g.team.emoji + '</span><div>You are the <b>' + esc(g.team.name) + '</b><small>Solo round</small></div></div>'
      : '<div class="team-reveal" style="--team:' + g.team.hex + '"><span>' + g.team.emoji + '</span><div>You\'re on the <b>' + esc(g.team.name) + '</b><small>' + g.team.size + ' players. Your teammates are a secret 🤫</small></div></div>';
    var above = teamHtml + '<p class="lv-line">' + opName(g.op) + ': ' + esc(Levels.label(g.op, g.level)) + '</p>';
    if (API.now() < g.startAt) {
      var started = await Game.countdown(app, g.startAt, API.now, above, LEAVE_MSG);
      if (!started) return leaveRoom();
    }
    if (S.mp !== mp) return;
    var res;
    if (API.now() >= g.endAt) res = { correct: 0, wrong: 0, points: 0, seconds: 0 };
    else res = await Game.play(app, { op: g.op, level: g.level, endAt: g.endAt, clock: API.now, rules: S.session.rules,
                                      label: g.team.emoji + ' ' + g.team.name + ' · ' + Levels.title(g.op, g.level), quitConfirm: LEAVE_MSG });
    if (res.quit) return leaveRoom(); // left mid-round: no score is sent
    if (S.mp !== mp) return;
    mp.doneRound = room.round;
    mp.view = '';
    waiting(res);
    try {
      var r = await API.callRetry('submitResult', { token: S.session.token, round: room.round, correct: res.correct, wrong: res.wrong, seconds: res.seconds });
      if (S.mp === mp) handleRoom(r.room);
    } catch (e) {
      if (S.mp !== mp) return;
      if (e.code === 'ROOM_CLOSED') return roomClosed();
      toast('Could not send your result: ' + e.message);
      poll(C.RESULTS_POLL_MS);
    }
  }

  /* ---------- start ---------- */
  try { S.session = JSON.parse(store.getItem(KEY)); } catch (e) { S.session = null; }
  if (S.session && S.session.token) showMenu(); else showLogin();
})();
