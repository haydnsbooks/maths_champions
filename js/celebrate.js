/**
 * RESULTS & CELEBRATION — shared by the teacher screen and student screens.
 * Celebrate.results(el, {teams, myTeam, me, showMembers, rankBy, big})
 */
(function () {
  var esc = function (s) { return Game.esc(s); };
  var medal = ['🥇', '🥈', '🥉'];

  function fmtTime(t) { return t === null || t === undefined ? '—' : t.toFixed(2) + ' s'; }

  function results(el, o) {
    var teams = o.teams || [];
    var w = teams[0];
    var individual = teams.every(function (t) { return t.size === 1; });
    var mine = o.myTeam;
    var noOne = !w || w.played === 0;

    var head = noOne ? '<div class="winner"><h1>No results this round</h1></div>' :
      '<div class="winner" style="--team:' + w.hex + '">' +
        '<div class="winner-kicker">Victory on Olympus</div>' +
        '<div class="laurel"><span class="winner-emoji">' + w.emoji + '</span></div>' +
        '<h1>' + esc(w.name) + '</h1>' +
        (individual ? '' : '<div class="winner-sub">Team of ' + w.size + '</div>') +
        '<div class="winner-stat">' + fmtTime(w.avgTime) + ' per correct answer · ' + w.correct + ' correct</div>' +
        (mine === w.index ? '<div class="you-badge">That\'s you! 🎉</div>' : '') +
      '</div>';

    var me = o.me ? '<div class="me-card">' +
        '<div><b>You:</b> ' + o.me.correct + ' correct · ' + o.me.wrong + ' wrong · ' + fmtTime(o.me.avgTime) + ' each · ' + o.me.points + ' pts</div>' +
        (o.me.levelUp ? '<div class="levelup">⬆️ Level up! You\'re now on level ' + o.me.newLevel + '</div>' : '') +
        (o.me.saved === false ? '<div class="muted">This round was too short to count towards your levels.</div>' : '') +
      '</div>' : '';

    var rows = teams.slice(noOne ? 0 : 1).map(function (t) {
      var members = o.showMembers && t.members ? '<div class="members">' + t.members.map(function (m) {
        return '<span class="member">' + esc(m.name) + ' <small>L' + m.level + (m.avgTime !== null ? ' · ' + fmtTime(m.avgTime) : ' · no result') + (m.levelUp ? ' ⬆️' : '') + '</small></span>';
      }).join('') + '</div>' : '';
      return '<li class="rank-row' + (t.index === mine ? ' mine' : '') + '" style="--team:' + t.hex + '">' +
        '<span class="rank">' + (medal[t.rank - 1] || t.rank) + '</span>' +
        '<span class="team-emoji">' + t.emoji + '</span>' +
        '<span class="team-name">' + esc(t.name) + (t.index === mine ? ' <em>(you)</em>' : '') + '</span>' +
        '<span class="team-stat">' + fmtTime(t.avgTime) + '<small>' + t.correct + ' correct · ' + t.points + ' pts</small></span>' +
        members + '</li>';
    }).join('');

    var winnerMembers = (!noOne && o.showMembers && w.members) ? '<div class="members center">' + w.members.map(function (m) {
      return '<span class="member">' + esc(m.name) + ' <small>L' + m.level + (m.avgTime !== null ? ' · ' + fmtTime(m.avgTime) : '') + (m.levelUp ? ' ⬆️' : '') + '</small></span>';
    }).join('') + '</div>' : '';

    el.innerHTML = '<div class="results' + (o.big ? ' big' : '') + '">' + head + winnerMembers + me +
      (rows ? '<ol class="ranks">' + rows + '</ol>' : '') +
      '<p class="muted small center">Ranked by ' + (o.rankBy === 'points' ? 'total points' : 'average time per correct answer (lower is better)') + '</p></div>';
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

  window.Celebrate = { results: results, confetti: confetti, fmtTime: fmtTime };
})();
