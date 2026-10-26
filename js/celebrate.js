/**
 * RESULTS & CELEBRATION — shared by the teacher screen and student screens.
 * Celebrate.results(el, {teams, myTeam, me, showMembers, rankBy, big})
 * Celebrate.trophy(t, cls) -> HTML for one golden trophy emoji (also used by the trophy cabinet).
 *
 * Placings come from the server (team.rank):
 *  - rank null = no result (no correct answers): no place, no medal, listed last as "No result".
 *  - Teams can share a rank (exactly the same time and points). Every team ranked 1st is a winner.
 *  - Times normally show 2 decimal places. If two teams would show the same time but their real times differ,
 *    both show more decimal places (3rd, 4th, ...) until the difference is visible, so the placing makes sense.
 */
(function () {
  var esc = function (s) { return Game.esc(s); };
  var medal = ['🥇', '🥈', '🥉'];
  var MAX_DP = 6;

  function fmtTime(t, dp) { return t === null || t === undefined ? '—' : t.toFixed(dp || 2) + ' s'; }

  /** The unrounded time per correct answer (older servers only sent the rounded avgTime). */
  function raw(t) { return t.avgRaw !== undefined && t.avgRaw !== null ? t.avgRaw : t.avgTime; }

  /** Decimal places for each team's time: 2, or more where needed to tell two different times apart. */
  function decimals(teams) {
    var dp = teams.map(function () { return 2; });
    for (var i = 0; i < teams.length; i++) {
      for (var j = i + 1; j < teams.length; j++) {
        var a = raw(teams[i]), b = raw(teams[j]);
        if (a === null || a === undefined || b === null || b === undefined) continue;
        if (Math.abs(a - b) < 1e-9) continue; // a real tie: same number on screen is correct
        var d = 2;
        while (d < MAX_DP && a.toFixed(d) === b.toFixed(d)) d++;
        if (d > dp[i]) dp[i] = d;
        if (d > dp[j]) dp[j] = d;
      }
    }
    return dp;
  }

  /** Older servers didn't send rank: null for teams with no correct answers. */
  function rankOf(t, i) {
    if (t.rank !== undefined) return t.rank;
    return t.correct > 0 ? i + 1 : null;
  }

  /** A trophy emoji drawn in gold (the colour comes from the .trophy CSS filter). */
  function trophy(t, cls) { return '<span class="trophy' + (cls ? ' ' + cls : '') + '" role="img" aria-label="' + esc(t.n) + '">' + esc(t.e) + '</span>'; }

  function results(el, o) {
    var teams = (o.teams || []).map(function (t, i) { var c = Object.assign({}, t); c.rank = rankOf(t, i); return c; });
    var dp = decimals(teams);
    teams.forEach(function (t, i) { t.dp = dp[i]; });
    var winners = teams.filter(function (t) { return t.rank === 1; });
    var w = winners[0];
    var individual = teams.every(function (t) { return t.size === 1; });
    var mine = o.myTeam;
    var noOne = !winners.length;
    var tie = winners.length > 1;
    var iWon = winners.some(function (t) { return t.index === mine; });

    var head = noOne
      ? '<div class="winner no-result"><h1>No results this round</h1>' +
          '<div class="winner-sub">Nobody answered a question correctly, so there are no places and no trophy this time.</div></div>'
      : '<div class="winner" style="--team:' + w.hex + '">' +
          '<div class="winner-kicker">' + (tie ? 'A tie on Olympus!' : 'Victory on Olympus') + '</div>' +
          '<div class="laurel"><span class="winner-emoji">' + winners.map(function (t) { return t.emoji; }).join('') + '</span></div>' +
          '<h1>' + winners.map(function (t) { return esc(t.name); }).join(' &amp; ') + '</h1>' +
          (individual || tie ? '' : '<div class="winner-sub">Team of ' + w.size + '</div>') +
          '<div class="winner-stat">' + fmtTime(raw(w), w.dp) + ' per correct answer' + (tie ? '' : ' · ' + w.correct + ' correct') + '</div>' +
          (w.trophy ? '<div class="prize">' + trophy(w.trophy, 'sm') + '<span>Prize: <b>' + esc(w.trophy.n) + '</b>' + (tie ? ' (each)' : '') + '</span></div>' : '') +
          (iWon ? '<div class="you-badge">That\'s you! 🎉</div>' : '') +
        '</div>';

    // Shown only on the iPads of the winning team's players.
    var won = o.me && o.me.trophy ? '<div class="trophy-won">' +
        '<div class="trophy-won-rays" aria-hidden="true"></div>' +
        trophy(o.me.trophy, 'xl') +
        '<div class="trophy-won-text"><div class="trophy-won-kicker">You won a trophy!</div>' +
        '<div class="trophy-won-name">' + esc(o.me.trophy.n) + '</div>' +
        '<div class="trophy-won-note">It\'s waiting in your 🏆 Trophy cabinet.</div></div>' +
      '</div>' : '';

    var me = o.me ? '<div class="me-card">' +
        '<div><b>You:</b> ' + o.me.correct + ' correct · ' + o.me.wrong + ' wrong · ' + fmtTime(o.me.avgTime) + ' each · ' + o.me.points + ' pts</div>' +
        (o.me.levelUp ? '<div class="levelup">⬆️ Level up! You\'re now on level ' + o.me.newLevel + '</div>' : '') +
        (o.me.saved === false ? '<div class="muted">This round was too short to count towards your levels.</div>' : '') +
      '</div>' : '';

    var memberChips = function (t) {
      return t.members.map(function (m) {
        return '<span class="member">' + esc(m.name) + ' <small>L' + m.level + (m.avgTime !== null && m.avgTime !== undefined ? ' · ' + fmtTime(m.avgTime) : ' · no result') + (m.levelUp ? ' ⬆️' : '') + '</small></span>';
      }).join('');
    };

    /** True when another team has exactly the same time (or points) but a different place, so the tie-break decided it. */
    var tieBroken = function (t) {
      if (t.rank === null) return false;
      return teams.some(function (u) {
        if (u === t || u.rank === null || u.rank === t.rank) return false;
        return o.rankBy === 'points' ? u.points === t.points : Math.abs(raw(u) - raw(t)) < 1e-9;
      });
    };

    var rows = teams.filter(function (t) { return t.rank !== 1; }).map(function (t) {
      var placed = t.rank !== null;
      var note = tieBroken(t) ? (o.rankBy === 'points' ? 'same points · placed on time' : 'same time · placed on points') : '';
      var members = o.showMembers && t.members ? '<div class="members">' + memberChips(t) + '</div>' : '';
      return '<li class="rank-row' + (t.index === mine ? ' mine' : '') + (placed ? '' : ' unranked') + '" style="--team:' + t.hex + '">' +
        '<span class="rank">' + (placed ? (medal[t.rank - 1] || t.rank) : '–') + '</span>' +
        '<span class="team-emoji">' + t.emoji + '</span>' +
        '<span class="team-name">' + esc(t.name) + (t.index === mine ? ' <em>(you)</em>' : '') + '</span>' +
        '<span class="team-stat">' + (placed ? fmtTime(raw(t), t.dp) : 'No result') +
          '<small>' + t.correct + ' correct · ' + t.points + ' pts' + (note ? '<br>' + note : '') + '</small></span>' +
        members + '</li>';
    }).join('');

    var winnerMembers = (!noOne && o.showMembers && winners.every(function (t) { return t.members; }))
      ? '<div class="members center">' + winners.map(memberChips).join('') + '</div>' : '';

    var anyUnplaced = teams.some(function (t) { return t.rank === null; });
    el.innerHTML = '<div class="results' + (o.big ? ' big' : '') + '">' + head + winnerMembers + won + me +
      (rows ? '<ol class="ranks">' + rows + '</ol>' : '') +
      '<p class="muted small center">Ranked by ' + (o.rankBy === 'points' ? 'total points' : 'average time per correct answer (lower is better)') +
      (anyUnplaced && !noOne ? '. A team with no correct answers gets no place.' : '') + '</p></div>';
    if (!noOne && o.confetti !== false) confetti(o.big ? 6000 : 3500);
  }

  function confetti(ms) {
    var cv = document.createElement('canvas');
    cv.className = 'confetti';
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d'), W, H;
    function size() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
    size(); addEventListener('resize', size);
    var cols = ['#e8b93c', '#f6d77a', '#b8860b', '#ffffff', '#dfe6f2', '#2f6fd6', '#3f8a55'];
    var parts = Array.from({ length: 160 }, function () {
      return { x: Math.random() * W, y: -20 - Math.random() * H, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10,
               vy: 2 + Math.random() * 4, vx: -1.5 + Math.random() * 3, r: Math.random() * 6, vr: -0.2 + Math.random() * 0.4,
               c: cols[Math.floor(Math.random() * cols.length)] };
    });
    var end = Date.now() + ms;
    (function frame() {
      ctx.clearRect(0, 0, W, H);
      var live = Date.now() < end;
      parts.forEach(function (p) {
        p.y += p.vy; p.x += p.vx; p.r += p.vr;
        if (p.y > H + 20 && live) { p.y = -20; p.x = Math.random() * W; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (live || parts.some(function (p) { return p.y < H + 20; })) requestAnimationFrame(frame);
      else { removeEventListener('resize', size); cv.remove(); }
    })();
  }

  window.Celebrate = { results: results, confetti: confetti, fmtTime: fmtTime, trophy: trophy, decimals: decimals };
})();
