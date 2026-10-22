/**
 * GAME ENGINE — the timed question screen with number pad. Used by practice AND class games.
 *
 * Game.play(containerEl, {op, level, endAt, clock, rules, label, quitConfirm})
 *   -> Promise<{correct, wrong, points, seconds, quit}>
 *   endAt       : time the game stops (in the same clock as `clock()`)
 *   clock       : function returning "now" in ms (API.now for class games so every iPad stops together)
 *   quitConfirm : if set, this question is asked before quitting (class games)
 *
 * Game.countdown(el, at, clock, aboveHtml, quitConfirm) -> Promise<true (started) | false (quit)>
 */
(function () {
  var C = window.APP_CONFIG;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function quitButton() { return '<button class="quit" data-quit aria-label="Leave">✕ Leave</button>'; }
  function askQuit(msg) { return !msg || window.confirm(msg); }

  /** A short lightning flash over the sky (respects reduced motion via CSS). */
  function zap() {
    document.body.classList.remove('zap'); void document.body.offsetWidth; document.body.classList.add('zap');
    clearTimeout(zap.t); zap.t = setTimeout(function () { document.body.classList.remove('zap'); }, 450);
  }

  function play(el, opts) {
    return new Promise(function (resolve) {
      var rules = opts.rules || { pointsCorrect: 10, pointsWrong: -5 };
      var clock = opts.clock || Date.now;
      var startedAt = clock();
      var total = Math.max(1, opts.endAt - startedAt);
      var deck = Levels.deck(opts.op, opts.level);
      var st = { correct: 0, wrong: 0, points: 0, input: '', q: null, locked: false, done: false };

      el.innerHTML =
        '<div class="arena">' +
          '<div class="column" aria-hidden="true"></div>' +
          '<div class="play">' +
            '<div class="play-top">' + quitButton() + '<span class="play-label">' + esc(opts.label || '') + '</span></div>' +
            '<div class="hud">' +
              '<div class="hud-item"><span class="hud-label">Time</span><span class="hud-val" data-timer>–</span></div>' +
              '<div class="hud-item"><span class="hud-label">Correct</span><span class="hud-val" data-correct>0</span></div>' +
              '<div class="hud-item"><span class="hud-label">Points</span><span class="hud-val" data-points>0</span></div>' +
            '</div>' +
            '<div class="timebar"><div data-bar></div></div>' +
            '<div class="question" data-q></div>' +
            '<div class="answer" data-ans><span data-ans-text></span><span class="caret"></span></div>' +
            '<div class="reveal" data-reveal></div>' +
            '<div class="pad">' +
              [7, 8, 9, 4, 5, 6, 1, 2, 3].map(function (n) { return '<button class="key" data-k="' + n + '">' + n + '</button>'; }).join('') +
              '<button class="key key-del" data-k="del" aria-label="Delete">⌫</button>' +
              '<button class="key" data-k="0">0</button>' +
              '<button class="key key-go" data-k="go" aria-label="Enter">✓</button>' +
            '</div>' +
          '</div>' +
          '<div class="column" aria-hidden="true"></div>' +
        '</div>';

      var $ = function (sel) { return el.querySelector(sel); };
      var qEl = $('[data-q]'), ansBox = $('[data-ans]'), ansText = $('[data-ans-text]'), reveal = $('[data-reveal]');
      var timerEl = $('[data-timer]'), barEl = $('[data-bar]'), ptsEl = $('[data-points]'), corEl = $('[data-correct]');

      function next() {
        st.q = deck.next();
        st.input = '';
        qEl.textContent = st.q.text + ' =';
        ansText.textContent = '';
        ansBox.className = 'answer';
        reveal.textContent = '';
      }
      function press(k) {
        if (st.done || st.locked) return;
        if (k === 'del') st.input = st.input.slice(0, -1);
        else if (k === 'go') return submit();
        else if (st.input.length < C.MAX_ANSWER_DIGITS) st.input = (st.input === '0' ? '' : st.input) + k;
        ansText.textContent = st.input;
      }
      function submit() {
        if (!st.input) return;
        if (Number(st.input) === st.q.answer) {
          st.correct++; st.points += rules.pointsCorrect;
          ansBox.className = 'answer right';
          zap();
          st.locked = true;
          setTimeout(function () { st.locked = false; if (!st.done) next(); }, C.RIGHT_FLASH_MS);
        } else {
          st.wrong++; st.points += rules.pointsWrong;
          deck.missed(st.q);
          ansBox.className = 'answer wrong';
          reveal.textContent = st.q.text + ' = ' + st.q.answer;
          st.locked = true;
          setTimeout(function () { st.locked = false; if (!st.done) next(); }, C.WRONG_PAUSE_MS);
        }
        ptsEl.textContent = st.points;
        corEl.textContent = st.correct;
      }

      // Touch: respond on pointerdown for speed.
      el.querySelector('.pad').addEventListener('pointerdown', function (e) {
        var b = e.target.closest('[data-k]');
        if (!b) return;
        e.preventDefault();
        b.classList.add('pressed'); setTimeout(function () { b.classList.remove('pressed'); }, 90);
        press(b.getAttribute('data-k'));
      });
      el.querySelector('[data-quit]').addEventListener('click', function () {
        if (st.done || !askQuit(opts.quitConfirm)) return;
        finish(true);
      });
      function onKey(e) {
        if (/^[0-9]$/.test(e.key)) press(e.key);
        else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
        else if (e.key === 'Enter') { e.preventDefault(); press('go'); }
      }
      document.addEventListener('keydown', onKey);

      function tick() {
        var now = clock(), left = opts.endAt - now;
        timerEl.textContent = Math.max(0, Math.ceil(left / 1000));
        barEl.style.width = Math.max(0, Math.min(100, left / total * 100)) + '%';
        timerEl.parentNode.classList.toggle('hurry', left < 10000);
        if (left <= 0) finish(false);
      }
      function finish(quit) {
        if (st.done) return;
        st.done = true;
        clearInterval(iv);
        document.removeEventListener('keydown', onKey);
        el.querySelector('.play').classList.add('finished');
        var seconds = Math.round((Math.min(clock(), opts.endAt) - startedAt) / 10) / 100;
        resolve({ correct: st.correct, wrong: st.wrong, points: st.points, seconds: Math.max(0, seconds), quit: !!quit });
      }
      var iv = setInterval(tick, 100);
      next();
      tick();
    });
  }

  /** Big 3-2-1 countdown until `at` (in clock time). Resolves true when it reaches 0, false if the student leaves. */
  function countdown(el, at, clock, aboveHtml, quitConfirm) {
    clock = clock || Date.now;
    return new Promise(function (resolve) {
      var gone = false;
      el.innerHTML = '<div class="countdown"><div class="play-top">' + quitButton() + '</div>' + (aboveHtml || '') + '<div class="count-num" data-n></div></div>';
      var n = el.querySelector('[data-n]');
      el.querySelector('[data-quit]').addEventListener('click', function () {
        if (!askQuit(quitConfirm)) return;
        gone = true; resolve(false);
      });
      (function loop() {
        if (gone) return;
        var left = at - clock();
        if (left <= 0) return resolve(true);
        var s = Math.ceil(left / 1000);
        if (n.textContent !== String(s)) { n.textContent = s; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); }
        setTimeout(loop, 50);
      })();
    });
  }

  window.Game = { play: play, countdown: countdown, esc: esc, zap: zap };
})();
