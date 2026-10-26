/**
 * Run with:  node tests/run-tests.js
 * 1) Checks every level's questions against the level specification (independently of levels.js logic).
 * 2) Runs the real server code (server/*.js) against the fake Google services and plays a full class game.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const Levels = require(path.join(ROOT, 'js/levels.js'));
let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { failures++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}

/* ---------- 1. Question generators ---------- */
const digits = n => String(n).length;
const carryCols = (a, b) => { let c = 0, any = false; while (a || b) { const s = a % 10 + b % 10 + c; c = s >= 10 ? 1 : 0; any = any || !!c; a = Math.floor(a / 10); b = Math.floor(b / 10); } return any; };
const borrowCols = (a, b) => { let br = 0, any = false; while (a || b) { let d = a % 10 - br - b % 10; br = d < 0 ? 1 : 0; any = any || !!br; a = Math.floor(a / 10); b = Math.floor(b / 10); } return any; };
const inR = (x, lo, hi) => x >= lo && x <= hi;

const mulTables = [2, 10, 5, 3, 4, 11, 6, 7, 8, 9, 12];
const big = [[13, 15], [16, 20], [21, 25], [26, 30], [31, 35], [36, 40]];
const addSpec = [[1,9,1,9,false],[1,9,1,9,true],[10,99,1,9,false],[10,99,10,99,true],[100,999,1,9,true],[100,999,10,99,true],[100,999,100,999,true],
  [1000,9999,10,99,true],[1000,9999,100,999,true],[1000,9999,1000,9999,true],[10000,99999,100,999,true],[10000,99999,1000,9999,true],[10000,99999,10000,99999,true]];
const subSpec = [[1,9,1,9,false],[10,99,1,9,false],[10,99,1,9,true],[10,99,10,99,false],[10,99,10,99,true],[100,999,1,9,false],[100,999,1,9,true],
  [100,999,10,99,false],[100,999,10,99,true],[100,999,100,999,false],[100,999,100,999,true]];

function checkLevel(op, level, q) {
  const m = q.text.match(/^(\d+) ([×÷+−]) (\d+)$/);
  assert(m, 'bad text ' + q.text);
  const a = +m[1], b = +m[3];
  assert(Number.isInteger(q.answer) && q.answer >= 0, 'answer not a whole number: ' + q.text + ' = ' + q.answer);
  if (op === 'mul') {
    assert.strictEqual(q.answer, a * b, q.text);
    if (level <= 11) { const f = mulTables[level - 1]; assert((a === f && inR(b, 1, 12)) || (b === f && inR(a, 1, 12)), q.text); }
    else if (level === 12) assert(inR(a, 1, 12) && inR(b, 1, 12), q.text);
    else { const r = big[level - 13]; assert((inR(a, r[0], r[1]) && inR(b, 1, 12)) || (inR(b, r[0], r[1]) && inR(a, 1, 12)), q.text); }
  } else if (op === 'div') {
    assert.strictEqual(a % b, 0, 'remainder: ' + q.text);
    assert.strictEqual(q.answer, a / b, q.text);
    assert(inR(q.answer, 1, 12), 'quotient range ' + q.text);
    if (level <= 11) assert.strictEqual(b, mulTables[level - 1], q.text);
    else if (level === 12) assert(inR(b, 1, 12), q.text);
    else { const r = big[level - 13]; assert(inR(b, r[0], r[1]), q.text); }
  } else if (op === 'add') {
    const s = addSpec[level - 1];
    assert.strictEqual(q.answer, a + b, q.text);
    assert(inR(a, s[0], s[1]) && inR(b, s[2], s[3]), 'range ' + q.text);
    assert.strictEqual(carryCols(a, b), s[4], 'regrouping rule ' + q.text);
  } else if (op === 'sub') {
    const s = subSpec[level - 1];
    assert.strictEqual(q.answer, a - b, q.text);
    assert(a >= b, 'negative ' + q.text);
    assert(inR(a, s[0], s[1]) && inR(b, s[2], s[3]), 'range ' + q.text);
    assert.strictEqual(borrowCols(a, b), s[4], 'regrouping rule ' + q.text);
  }
}

console.log('\nQuestion generators (2,000 questions per level)');
const expectedCounts = { mul: 18, div: 18, add: 13, sub: 11 };
for (const op of Levels.ORDER) {
  test(op + ': has ' + expectedCounts[op] + ' levels', () => assert.strictEqual(Levels.count(op), expectedCounts[op]));
  for (let level = 1; level <= Levels.count(op); level++) {
    test(op + ' level ' + level + ' (' + Levels.name(op, level) + ')', () => {
      const deck = Levels.deck(op, level), seen = new Set();
      let last = null;
      for (let i = 0; i < 2000; i++) {
        const q = deck.next();
        checkLevel(op, level, q);
        assert.notStrictEqual(q.key, last, 'same fact twice in a row: ' + q.text);
        if (Math.random() < 0.2) deck.missed(q); // simulate wrong answers
        last = q.key; seen.add(q.key);
      }
      if (deck.size !== Infinity && deck.size <= 400) assert.strictEqual(seen.size, deck.size, 'not every fact was asked');
      if (deck.size === Infinity) assert.strictEqual(seen.size, 2000, 'a huge level repeated a question');
    });
  }
}
test('times-table deck: first 12 questions are all 12 different facts', () => {
  for (let r = 0; r < 200; r++) {
    const d = Levels.deck('mul', 5), keys = new Set();
    for (let i = 0; i < 12; i++) keys.add(d.next().key);
    assert.strictEqual(keys.size, 12);
  }
});
test('names: ×/÷ show the table, +/− show only the name', () => {
  assert.strictEqual(Levels.name('mul', 5), '4× Bumpy Bus');
  assert.strictEqual(Levels.name('div', 1), '÷2 Space Potato');
  assert.strictEqual(Levels.name('add', 1), 'Snoozy Snail');
  assert.deepStrictEqual(Levels.ORDER, ['add', 'sub', 'mul', 'div']);
});

/* ---------- 2. Server flow ---------- */
console.log('\nServer logic (real server code + fake Google services)');
const ctx = { console, Date, Math, JSON };
ctx.globalThis = ctx;
vm.createContext(ctx);
const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
['js/demo/mock-gas.js', 'server/Config.js', 'server/Store.js', 'server/Fluency.js', 'server/Trophies.js', 'server/Rooms.js', 'server/Code.js'].forEach(load);
ctx.MockGas.reset();
ctx.MockGas.seedDemo();
const call = req => vm.runInContext('handleRequest(' + JSON.stringify(req) + ')', ctx);
const ok = r => { assert(r.ok, r.error); return r; };
/** Pretend a student's class-game screen stopped checking in (app closed, reloaded, iPad asleep, went to Practice). */
const goQuiet = (code, id) => ctx.CacheService.getScriptCache().remove('seen:' + code + ':' + id);
const F = name => vm.runInContext(name, ctx);
/** Standard deviation of team averages, given teams of ids and a {id: time} map. */
const sdOf = (teams, time) => {
  const means = teams.map(t => t.reduce((a, id) => a + time[id], 0) / t.length);
  const avg = means.reduce((a, b) => a + b, 0) / means.length;
  return Math.sqrt(means.reduce((a, m) => a + (m - avg) ** 2, 0) / means.length);
};

let teacher, tokens = {}, ids = [], nameOf = {};
test('teacher login (wrong password rejected)', () => {
  assert(!call({ action: 'teacherLogin', password: 'nope' }).ok);
  teacher = ok(call({ action: 'teacherLogin', password: 'changeme' })).teacherToken;
});
test('class list + student logins', () => {
  const list = ok(call({ action: 'classList' })).students;
  assert.strictEqual(list.length, 12);
  assert(!list[0].password, 'password leaked to class list');
  assert(!call({ action: 'login', studentId: list[0].id, password: 'wrong' }).ok);
  assert(list.every(s => s.isNew), 'new students should be flagged to create a password');
  assert.strictEqual(call({ action: 'login', studentId: list[0].id, password: '' }).error, 'NEEDS_PASSWORD');
  assert(!call({ action: 'setPassword', studentId: list[0].id, password: 'ab' }).ok, 'too-short password accepted');
  list.forEach(s => { const r = ok(call({ action: 'setPassword', studentId: s.id, password: 'Pw-' + s.name + ' ' })); tokens[s.id] = r.token; ids.push(s.id); nameOf[s.id] = s.name; });
  assert(!call({ action: 'setPassword', studentId: list[0].id, password: 'takeover' }).ok, 'password could be changed by someone else');
  assert(!ok(call({ action: 'classList' })).students[0].isNew);
  ok(call({ action: 'login', studentId: list[0].id, password: 'pw-' + list[0].name }));  // case-insensitive, trimmed
  const p = ok(call({ action: 'profile', token: tokens[ids[0]] })).profile;
  assert.strictEqual(p.mul.current, 1);
});
test('multiplayer before room is open -> NO_ROOM', () => {
  assert.strictEqual(call({ action: 'joinRoom', token: tokens[ids[0]] }).error, 'NO_ROOM');
});

// Give students different histories so balancing has something to do
test('practice attempts update profile; short games are not saved', () => {
  const r0 = ok(call({ action: 'practiceSubmit', token: tokens[ids[0]], op: 'mul', level: 1, correct: 30, wrong: 1, seconds: 10 }));
  assert.strictEqual(r0.saved, false);
  for (let k = 0; k < 3; k++) ok(call({ action: 'practiceSubmit', token: tokens[ids[0]], op: 'mul', level: 1, correct: 30, wrong: 1, seconds: 60 }));
  const r = ok(call({ action: 'practiceSubmit', token: tokens[ids[1]], op: 'mul', level: 1, correct: 10, wrong: 4, seconds: 60 }));
  assert.strictEqual(r.profile.mul.levels[0].avg, 6);
  const p0 = ok(call({ action: 'profile', token: tokens[ids[0]] })).profile;
  assert.strictEqual(p0.mul.levels[0].fluent, true, 'three 2s attempts at cut-off 3s should be fluent');
  assert.strictEqual(p0.mul.current, 2);
  const rows = ctx.SpreadsheetApp.getActive().getSheetByName('Attempts').getLastRow() - 1;
  assert.strictEqual(rows, 4);
});
test('practice never gives trophies; empty cabinet to start', () => {
  const c = ok(call({ action: 'cabinet', token: tokens[ids[0]] })).cabinet;
  assert.strictEqual(c.items.length, 0);
  assert.strictEqual(c.fav, null);
});
test('teacher can change cut-offs', () => {
  const c = ok(call({ action: 'saveSettings', teacherToken: teacher, cutoffs: { mul: 4, div: 4, add: 5, sub: 5 } })).cutoffs;
  assert.strictEqual(c.add, 5);
});

let code;
test('open room, students join, names hidden from students', () => {
  code = ok(call({ action: 'openRoom', teacherToken: teacher })).room.code;
  ids.forEach(id => ok(call({ action: 'joinRoom', token: tokens[id] })));
  ok(call({ action: 'joinRoom', token: tokens[ids[0]] })); // double join is harmless
  const tv = ok(call({ action: 'roomState', teacherToken: teacher, code })).room;
  assert.strictEqual(tv.players.length, 12);
  const sv = ok(call({ action: 'roomState', token: tokens[ids[3]] })).room;
  assert.strictEqual(sv.playerCount, 12);
  assert(!JSON.stringify(sv).includes('Ava'), 'student view leaked a name');
});
test('start game: 12 players, 3 teams -> 3 teams of 4, levels assigned', () => {
  const room = ok(call({ action: 'startGame', teacherToken: teacher, code, op: 'mul', teams: 3, seconds: 60 })).room;
  assert.strictEqual(room.game.teams.length, 3);
  assert.strictEqual(room.game.individual, false);
  room.game.teams.forEach(t => assert.strictEqual(t.members.length, 4));
  const sv = ok(call({ action: 'roomState', token: tokens[ids[0]] })).room;
  assert.strictEqual(sv.game.level, 2, 'fluent-at-level-1 student should get level 2');
  assert.strictEqual(sv.game.individual, false);
  assert(sv.game.team.name && !sv.game.team.members, 'student should see team name only');
  assert(!JSON.stringify(sv).includes('Ben'), 'student view leaked a name');
});
test('expected time = average at the student\'s OWN current level (estimate if never played); team average shown to teacher', () => {
  const room = ok(call({ action: 'roomState', teacherToken: teacher, code })).room;
  const members = [].concat(...room.game.teams.map(t => t.members));
  const ava = members.find(m => m.name === nameOf[ids[0]]), ben = members.find(m => m.name === nameOf[ids[1]]);
  assert.strictEqual(ava.level, 2);
  assert.strictEqual(ava.exp, 5.5, 'never played level 2: cut-off 4 + 1.5');
  assert.strictEqual(ava.est, true);
  assert.strictEqual(ben.level, 1);
  assert.strictEqual(ben.exp, 6, 'Ben averages 6 s at his level 1');
  assert.strictEqual(ben.est, false);
  room.game.teams.forEach(t => {
    const avg = t.members.reduce((a, m) => a + m.exp, 0) / t.members.length;
    assert.strictEqual(t.exp, Math.round(avg * 100) / 100, 'team average shown to teacher is wrong');
  });
  assert(typeof room.game.balanceSd === 'number');
});
test('number of teams: exactly the number asked for, sizes within 1', () => {
  [[25, 6], [27, 7], [10, 3], [7, 2], [5, 2], [9, 4], [26, 5]].forEach(([n, count]) => {
    const entries = Array.from({ length: n }, (_, i) => ({ id: 'x' + i, time: 2 + Math.random() * 7 }));
    const teams = F('formTeams_')(entries, count);
    const sizes = teams.map(t => t.length);
    assert.strictEqual(teams.length, count, n + ' students / ' + count + ' teams gave ' + teams.length);
    assert.strictEqual(sizes.reduce((a, b) => a + b, 0), n);
    assert.strictEqual(new Set([].concat(...teams)).size, n, 'a student was lost or doubled');
    assert(Math.max(...sizes) - Math.min(...sizes) <= 1, n + '/' + count + ' sizes ' + sizes);
  });
});
test('more teams asked for than students -> one student per team', () => {
  const entries = Array.from({ length: 3 }, (_, i) => ({ id: 'x' + i, time: 3 }));
  assert.strictEqual(F('formTeams_')(entries, 6).length, 3);
});
test('Haydn\'s example: A 4.5 s, B 7.2 s, C 3.7 s -> team average 5.13 s', () => {
  const avg = F('teamMean_')([{ t: 4.5 }, { t: 7.2 }, { t: 3.7 }]);
  assert.strictEqual(Math.round(avg * 100) / 100, 5.13);
});
// Some classes can't be split perfectly evenly (e.g. teams of 2, or a few very fast and very slow students).
// In the rare uneven cases found (about 1 class in 10,000 above 0.1 s; worst seen 0.19 s), an independent search
// (simulated annealing) found exactly the same spread as formTeams_, so those are limits of the numbers, not misses.
test('balancing: standard deviation of team average times is tiny (200 random classes, teams of 3+)', () => {
  let worst = 0, total = 0;
  for (let r = 0; r < 200; r++) {
    const n = 20 + Math.floor(Math.random() * 9), k = 2 + Math.floor(Math.random() * 5);
    const time = {}, entries = [];
    for (let i = 0; i < n; i++) { time['x' + i] = Math.round((2 + Math.random() * 8) * 100) / 100; entries.push({ id: 'x' + i, time: time['x' + i] }); }
    const sd = sdOf(F('formTeams_')(entries, k), time);
    worst = Math.max(worst, sd); total += sd;
  }
  assert(total / 200 < 0.02, 'average standard deviation ' + (total / 200).toFixed(3) + ' s');
  assert(worst < 0.3, 'worst standard deviation ' + worst.toFixed(3) + ' s');
});
test('balancing beats the old snake-draft-only method', () => {
  let better = 0, worse = 0;
  for (let r = 0; r < 100; r++) {
    const time = {}, entries = [];
    for (let i = 0; i < 25; i++) { time['x' + i] = 2 + Math.random() * 8; entries.push({ id: 'x' + i, t: time['x' + i] }); }
    const snake = F('snakeDraft_')(entries, 6).map(t => t.map(e => e.id));
    const now = F('formTeams_')(entries.map(e => ({ id: e.id, time: e.t })), 6);
    const a = sdOf(now, time), b = sdOf(snake, time);
    if (a < b - 1e-9) better++; else if (a > b + 1e-9) worse++;
  }
  assert.strictEqual(worse, 0, 'new method was less even ' + worse + ' times');
  assert(better > 90, 'only better ' + better + '/100 times');
});
test('individual play: one team per student', () => {
  const entries = Array.from({ length: 28 }, (_, i) => ({ id: 'x' + i, time: 3 }));
  assert.strictEqual(F('formTeams_')(entries, 28).length, 28);
  const labels = F('teamLabels_')(40);
  assert.strictEqual(new Set(labels.map(l => l.name)).size, 40, 'duplicate code names');
});
test('submit results, finish, ranking by avg time, one sheet write', () => {
  const room = ok(call({ action: 'roomState', teacherToken: teacher, code })).room;
  ids.forEach((id, i) => {
    if (i === 11) return; // one student never submits (iPad went flat)
    const r = ok(call({ action: 'submitResult', token: tokens[id], round: room.round, correct: 10 + i, wrong: i % 3, seconds: 60 }));
    assert(r.accepted);
  });
  const before = ctx.SpreadsheetApp.getActive().getSheetByName('Attempts').getLastRow();
  const fin = ok(call({ action: 'finishGame', teacherToken: teacher, code })).room;
  assert.strictEqual(fin.status, 'results');
  const t = fin.results.teams;
  for (let i = 1; i < t.length; i++) assert(t[i - 1].avgRaw <= t[i].avgRaw, 'not sorted by avg time');
  assert.strictEqual(t[0].rank, 1);
  const after = ctx.SpreadsheetApp.getActive().getSheetByName('Attempts').getLastRow();
  assert.strictEqual(after - before, 11);
  ok(call({ action: 'finishGame', teacherToken: teacher, code })); // second finish must not double-save
  assert.strictEqual(ctx.SpreadsheetApp.getActive().getSheetByName('Attempts').getLastRow(), after);
  const sv = ok(call({ action: 'roomState', token: tokens[ids[2]] })).room;
  assert(sv.results.me && sv.results.me.correct === 12);
  assert(!JSON.stringify(sv.results).includes('Chloe'));
  const late = call({ action: 'submitResult', token: tokens[ids[11]], round: room.round, correct: 5, wrong: 0, seconds: 60 });
  assert.strictEqual(late.accepted, false);
  ok(call({ action: 'joinRoom', token: tokens[ids[11]] })); // their iPad is charged again and back on the class-game screen
});
test('a student who leaves mid-round drops out so the teacher is not kept waiting', () => {
  ok(call({ action: 'newRound', teacherToken: teacher, code }));
  const room = ok(call({ action: 'startGame', teacherToken: teacher, code, op: 'add', teams: 4, seconds: 60 })).room;
  assert.strictEqual(room.game.expected, 12);
  assert.strictEqual(room.game.teams.length, 4);
  ok(call({ action: 'leaveRoom', token: tokens[ids[5]] }));
  const tv = ok(call({ action: 'roomState', teacherToken: teacher, code })).room;
  assert.strictEqual(tv.game.expected, 11);
  assert.strictEqual(tv.players.length, 11);
  ids.forEach((id, i) => { if (i !== 5) ok(call({ action: 'submitResult', token: tokens[id], round: tv.round, correct: 20, wrong: 1, seconds: 60 })); });
  const fin = ok(call({ action: 'finishGame', teacherToken: teacher, code })).room;
  assert.strictEqual(fin.status, 'results');
  ok(call({ action: 'joinRoom', token: tokens[ids[5]] })); // comes back for the next round
});
test('new round goes back to lobby with players kept', () => {
  const r = ok(call({ action: 'newRound', teacherToken: teacher, code })).room;
  assert.strictEqual(r.status, 'lobby');
  assert.strictEqual(r.players.length, 12);
});
test('students whose class-game screen is closed are not listed or put in teams', () => {
  goQuiet(code, ids[7]); goQuiet(code, ids[8]); // e.g. reloaded the page, then went to Practice
  const tv = ok(call({ action: 'roomState', teacherToken: teacher, code })).room;
  assert.strictEqual(tv.players.length, 10, 'teacher lobby should only list students on the class-game screen');
  assert(!tv.players.some(p => p.id === ids[7] || p.id === ids[8]));
  const sv = ok(call({ action: 'roomState', token: tokens[ids[0]] })).room;
  assert.strictEqual(sv.playerCount, 10);
  const room = ok(call({ action: 'startGame', teacherToken: teacher, code, op: 'sub', teams: 0, seconds: 60 })).room;
  assert.strictEqual(room.game.expected, 10, 'absent students were put into the round');
  assert.strictEqual(room.game.individual, true);
  assert.strictEqual(room.game.teams.length, 10);
  // Ids 7 and 8 come back to the class-game screen mid-round: told they're not in the room, so their screen re-joins
  const back = ok(call({ action: 'roomState', token: tokens[ids[7]] })).room;
  assert.strictEqual(back.joined, false);
  const rejoined = ok(call({ action: 'joinRoom', token: tokens[ids[7]] })).room;
  assert.strictEqual(rejoined.joined, true);
  assert.strictEqual(rejoined.game.inGame, false, 'should wait for the next round');
  ok(call({ action: 'finishGame', teacherToken: teacher, code }));
  const lobby = ok(call({ action: 'newRound', teacherToken: teacher, code })).room;
  assert(lobby.players.some(p => p.id === ids[7]), 'student who came back should be in the next lobby');
  assert(!lobby.players.some(p => p.id === ids[8]));
});
test('nobody on the class-game screen -> start is refused with a clear message', () => {
  ids.forEach(id => goQuiet(code, id));
  const r = call({ action: 'startGame', teacherToken: teacher, code, op: 'mul', teams: 2, seconds: 60 });
  assert(!r.ok && /No students/.test(r.error), r.error);
  ids.forEach(id => ok(call({ action: 'joinRoom', token: tokens[id] })));
});
test('an old cached teacher page that still sends "per team" keeps working', () => {
  const room = ok(call({ action: 'startGame', teacherToken: teacher, code, op: 'mul', teamSize: 4, seconds: 60 })).room;
  assert.strictEqual(room.game.teams.length, 3);
  ok(call({ action: 'finishGame', teacherToken: teacher, code }));
  ok(call({ action: 'newRound', teacherToken: teacher, code }));
});
test('teacher resets a forgotten password; student makes a new one', () => {
  ok(call({ action: 'resetPassword', teacherToken: teacher, id: ids[2] }));
  assert.strictEqual(call({ action: 'login', studentId: ids[2], password: 'Pw-Chloe' }).error, 'NEEDS_PASSWORD');
  ok(call({ action: 'setPassword', studentId: ids[2], password: 'newpass' }));
  ok(call({ action: 'login', studentId: ids[2], password: 'newpass' }));
});
test('teacher Passwords page: list shows who has a password, reset by picking a name', () => {
  assert(!call({ action: 'studentPasswords' }).ok, 'list available without teacher login');
  let list = ok(call({ action: 'studentPasswords', teacherToken: teacher })).students;
  assert.strictEqual(list.length, 12);
  assert(list.every(s => s.hasPassword));
  assert(!JSON.stringify(list).includes('newpass'), 'passwords sent to the page');
  const isla = list.find(s => s.name === 'Isla');
  ok(call({ action: 'resetPassword', teacherToken: teacher, id: isla.id }));
  list = ok(call({ action: 'studentPasswords', teacherToken: teacher })).students;
  assert.strictEqual(list.find(s => s.name === 'Isla').hasPassword, false, 'list not updated straight after reset');
  assert(ok(call({ action: 'classList' })).students.find(s => s.name === 'Isla').isNew, 'student login screen should ask Isla to create a password');
  assert(!call({ action: 'resetPassword', teacherToken: teacher, id: 'nobody' }).ok, 'unknown student accepted');
  ok(call({ action: 'setPassword', studentId: isla.id, password: 'isla2' }));
});
test('class overview', () => {
  const rows = ok(call({ action: 'classOverview', teacherToken: teacher })).rows;
  assert.strictEqual(rows.length, 12);
  assert(rows[0].mul.level >= 1);
});

/* ---------- 3. Dust ---------- */
console.log('\nDust and fluency rules');
const perth = (y, m, d, h) => Date.UTC(y, m - 1, d, h - 8); // Perth local -> ms
test('weeks start Monday 00:00 Perth time', () => {
  const wk = F('weekIndex_');
  assert.strictEqual(wk(perth(2026, 10, 25, 23)), wk(perth(2026, 10, 19, 0)), 'Sun 25 Oct and Mon 19 Oct same week');
  assert.strictEqual(wk(perth(2026, 10, 26, 0)), wk(perth(2026, 10, 25, 23)) + 1, 'Mon 26 Oct is a new week');
});
test('dust: 0.5 s per new week since last played', () => {
  const dust = F('dustFor_');
  assert.strictEqual(dust(perth(2026, 10, 22, 10), perth(2026, 10, 25, 10)), 0);
  assert.strictEqual(dust(perth(2026, 10, 22, 10), perth(2026, 10, 26, 8)), 0.5);
  assert.strictEqual(dust(perth(2026, 10, 1, 10), perth(2026, 10, 22, 10)), 1.5);
});
test('your example: 3.2 s with 3 weeks of dust = 4.7 s, no longer fluent at 4 s cut-off', () => {
  const stats = F('levelStats_')({ r: [3.1, 3.2, 3.3], n: 5, t: perth(2026, 10, 1, 10) }, 4, perth(2026, 10, 22, 10));
  assert.strictEqual(stats.time, 4.7);
  assert.strictEqual(stats.fluent, false);
});
test('dusty lower level becomes the current level again', () => {
  const now = perth(2026, 10, 22, 10);
  const prof = { mul: { 1: { r: [2, 2, 2], n: 3, t: perth(2026, 9, 1, 10) }, 2: { r: [2, 2, 2], n: 3, t: now } } };
  const sum = F('opSummary_')(prof, 'mul', 3, now);
  assert.strictEqual(sum.current, 1);
});
test('team balancing uses the real average at the current level (dust not added unless BALANCE_ADD_DUST)', () => {
  const now = perth(2026, 10, 22, 10);
  const prof = { mul: { 1: { r: [3.5, 3.5, 3.5], n: 3, t: perth(2026, 10, 1, 10) } } }; // 3 weeks of dust
  const sum = F('opSummary_')(prof, 'mul', 4, now);
  assert.strictEqual(sum.current, 1);
  assert.strictEqual(F('expectedTime_')(sum), 3.5);
  F('CONFIG').BALANCE_ADD_DUST = true;
  assert.strictEqual(F('expectedTime_')(sum), 5);
  F('CONFIG').BALANCE_ADD_DUST = false;
});
test('fluency uses only the 3 most recent attempts', () => {
  const p = {}; const rec = F('recordAttempt_');
  [9, 9, 2, 2, 2].forEach(t => rec(p, 'add', 1, t, Date.now()));
  assert.strictEqual(JSON.stringify(p.add[1].r), '[2,2,2]');
  assert.strictEqual(p.add[1].n, 5);
});

/* ---------- 4. Trophy cabinet ---------- */
console.log('\nTrophy cabinet');
const cab = id => ok(call({ action: 'cabinet', token: tokens[id] })).cabinet;
let winners = [], losers = [], trophy;
test('winning team: every player who played gets the same trophy; nobody else does', () => {
  const before = Object.fromEntries(ids.map(id => [id, cab(id).items.length]));
  const room = ok(call({ action: 'startGame', teacherToken: teacher, code, op: 'mul', teams: 3, seconds: 60 })).room;
  const st = ok(call({ action: 'roomState', teacherToken: teacher, code })).room;
  // Find each student's team from their own view, then make team 0 clearly fastest.
  const teamOf = Object.fromEntries(ids.map(id => [id, ok(call({ action: 'roomState', token: tokens[id] })).room.game.team.name]));
  const fastTeam = teamOf[ids[0]];
  const skip = ids.find(id => teamOf[id] === fastTeam && id !== ids[0]); // on the winning team but never sends a result
  ids.forEach(id => {
    if (id === skip) return;
    ok(call({ action: 'submitResult', token: tokens[id], round: st.round, correct: teamOf[id] === fastTeam ? 40 : 10, wrong: 0, seconds: 60 }));
  });
  const fin = ok(call({ action: 'finishGame', teacherToken: teacher, code })).room;
  const w = fin.results.teams[0];
  assert.strictEqual(w.name, fastTeam);
  assert(w.trophy && w.trophy.e && w.trophy.n, 'winning team has no trophy in the results');
  assert(!fin.results.teams.slice(1).some(t => t.trophy), 'a losing team got a trophy');
  trophy = w.trophy;
  ids.forEach(id => {
    const after = cab(id);
    const me = ok(call({ action: 'roomState', token: tokens[id] })).room.results.me;
    if (teamOf[id] === fastTeam && id !== skip) {
      winners.push(id);
      assert.strictEqual(after.items.length, before[id] + 1, 'winner did not get a trophy');
      assert.strictEqual(after.items[0].e, trophy.e);
      assert.strictEqual(after.items[0].team, fastTeam);
      assert.deepStrictEqual(me.trophy, trophy, 'win screen is not told about the trophy');
    } else {
      if (id !== skip) losers.push(id);
      assert.strictEqual(after.items.length, before[id], 'non-winner got a trophy');
      if (me) assert(!me.trophy);
    }
  });
  assert.strictEqual(winners.length, 3);
  ok(call({ action: 'finishGame', teacherToken: teacher, code })); // finishing twice must not give a second trophy
  winners.forEach(id => assert.strictEqual(cab(id).items.length, before[id] + 1));
  ok(call({ action: 'newRound', teacherToken: teacher, code }));
});
test('cabinet is saved to the sheet (survives a cache clear)', () => {
  vm.runInContext('clearCache()', ctx);
  assert.strictEqual(cab(winners[0]).items[0].e, trophy.e);
});
test('tap a trophy -> favourite on the top shelf; old favourite goes back on a shelf', () => {
  const id = winners[0];
  let c = cab(id);
  const n = c.items.length;
  assert(n >= 1);
  const first = c.items[c.items.length - 1];
  c = ok(call({ action: 'setFavourite', token: tokens[id], id: first.id })).cabinet;
  assert.strictEqual(c.fav.id, first.id);
  assert.strictEqual(c.items.length, n - 1, 'favourite should leave the shelves');
  if (n >= 2) {
    const second = c.items[0];
    c = ok(call({ action: 'setFavourite', token: tokens[id], id: second.id })).cabinet;
    assert.strictEqual(c.fav.id, second.id);
    assert(c.items.some(t => t.id === first.id), 'old favourite disappeared');
    assert.strictEqual(c.items.length, n - 1);
    for (let i = 1; i < c.items.length; i++) assert(c.items[i - 1].t >= c.items[i].t, 'shelves not newest first');
  }
  assert.strictEqual(cab(id).fav.id, c.fav.id, 'favourite not saved');
  assert(!call({ action: 'setFavourite', token: tokens[id], id: 'not-a-trophy' }).ok);
  assert(!call({ action: 'setFavourite', token: tokens[losers[0]], id: c.fav.id }).ok, 'could pick someone else\'s trophy');
});
test('trophy week starts Sunday 00:00 Perth time', () => {
  const wk = F('trophyWeek_');
  assert.strictEqual(wk(perth(2026, 10, 24, 23)), wk(perth(2026, 10, 18, 0)), 'Sat 24 Oct and Sun 18 Oct same trophy week');
  assert.strictEqual(wk(perth(2026, 10, 25, 0)), wk(perth(2026, 10, 24, 23)) + 1, 'Sun 25 Oct starts a new trophy week');
  assert.strictEqual(F('trophyWeekEnds_')(wk(perth(2026, 10, 27, 9))), perth(2026, 11, 1, 0), 'clears at Sun 1 Nov 00:00');
});
test('Sunday: shelves emptied, favourite kept, new trophies go on the shelves below', () => {
  const now = perth(2026, 10, 27, 10); // Tuesday
  const p = {};
  const give = F('awardTrophy_'), fav = F('setFavourite_'), view = F('cabinetView_');
  const a = give(p, { e: '🦉', n: 'Owl of Athena' }, 'mul', 'Azure Krakens', now);
  give(p, { e: '🔱', n: 'Trident of Poseidon' }, 'add', 'Teal Titans', now + 1000);
  fav(p, a.id, now + 2000);
  assert.strictEqual(view(p, perth(2026, 10, 31, 23)).items.length, 1, 'cleared before Sunday');
  const sun = view(p, perth(2026, 11, 1, 0));
  assert.strictEqual(sun.items.length, 0, 'shelves not emptied on Sunday');
  assert.strictEqual(sun.fav.e, '🦉', 'favourite lost on Sunday');
  give(p, { e: '👑', n: 'Crown of Olympus' }, 'div', 'Coral Sirens', perth(2026, 11, 2, 9));
  const mon = view(p, perth(2026, 11, 2, 10));
  assert.strictEqual(mon.items.length, 1);
  assert.strictEqual(mon.items[0].e, '👑');
  assert.strictEqual(mon.fav.e, '🦉');
});
test('shelves hold at most TROPHY_SHELF_MAX in a week; every trophy has a name', () => {
  const p = {}, give = F('awardTrophy_'), now = perth(2026, 10, 27, 10);
  for (let i = 0; i < 70; i++) give(p, { e: '🏆', n: 'Golden Cup' }, 'mul', 'x', now + i);
  assert.strictEqual(p.cab.items.length, F('CONFIG').TROPHY_SHELF_MAX);
  assert(F('CONFIG').TROPHIES.every(t => t[0] && t[1]));
  const seen = new Set(); for (let i = 0; i < 200; i++) seen.add(F('pickTrophy_')('🏆').e);
  assert(!seen.has('🏆'), 'pickTrophy_ repeated the previous round\'s trophy');
});

/* ---------- 5. Play again, no-result rounds, placings ---------- */
console.log('\nPlay again, no-result rounds and placings');
const tview = () => ok(call({ action: 'roomState', teacherToken: teacher, code })).room;
/** Every player in the round sends a result: fn(id) -> {correct, wrong, seconds} (or null to skip). */
const submitAll = fn => {
  const room = tview();
  ids.forEach(id => {
    const sv = ok(call({ action: 'roomState', token: tokens[id] })).room;
    if (!sv.game || !sv.game.inGame) return;
    const r = fn(id); if (!r) return;
    ok(call({ action: 'submitResult', token: tokens[id], round: room.round, correct: r.correct, wrong: r.wrong || 0, seconds: r.seconds || 60 }));
  });
};
const teamsByName = room => Object.fromEntries(room.game.teams.map(t => [t.name, t.members.map(m => m.name).sort()]));

test('Play again is refused from the lobby (use Start there)', () => {
  const r = call({ action: 'playAgain', teacherToken: teacher, code, op: 'add', seconds: 60, teams: 'same' });
  assert(!r.ok && /results screen/.test(r.error), r.error);
});
test('Play again, SAME teams, new operation + time: everyone still here plays, nobody re-joins', () => {
  goQuiet(code, ids[9]); // not on the class-game screen when the round starts
  ok(call({ action: 'startGame', teacherToken: teacher, code, op: 'mul', teams: 3, seconds: 60 }));
  ok(call({ action: 'joinRoom', token: tokens[ids[9]] })); // arrives mid-round, waits for the next one
  submitAll(() => ({ correct: 15 }));
  const fin = ok(call({ action: 'finishGame', teacherToken: teacher, code })).room;
  assert.strictEqual(fin.status, 'results');
  const before = teamsByName(fin), lastRound = fin.round;
  ok(call({ action: 'leaveRoom', token: tokens[ids[4]] })); // leaves on the results screen
  const room = ok(call({ action: 'playAgain', teacherToken: teacher, code, op: 'add', seconds: 90, teams: 'same' })).room;
  assert.strictEqual(room.status, 'playing');
  assert.strictEqual(room.round, lastRound + 1);
  assert.strictEqual(room.game.op, 'add');
  assert.strictEqual(room.game.seconds, 90);
  assert.strictEqual(room.game.expected, 11, '12 in the room, minus the one who left');
  const after = teamsByName(room);
  assert.deepStrictEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'team names changed');
  Object.keys(before).forEach(name => before[name].forEach(n => {
    if (n === nameOf[ids[4]]) return assert(!after[name].includes(n), 'student who left is still in a team');
    assert(after[name].includes(n), n + ' moved to a different team');
  }));
  assert(Object.values(after).some(m => m.includes(nameOf[ids[9]])), 'newcomer not put in a team');
  const sizes = Object.values(after).map(m => m.length);
  assert(Math.max(...sizes) - Math.min(...sizes) <= 1, 'newcomer not put in the smallest team: ' + sizes);
  const sv = ok(call({ action: 'roomState', token: tokens[ids[0]] })).room; // the student's normal results-screen poll
  assert.strictEqual(sv.status, 'playing');
  assert.strictEqual(sv.game.inGame, true);
  assert.strictEqual(sv.game.op, 'add');
  assert(sv.game.startAt - Date.now() > 8000, 'countdown too short for students on the results screen');
  const again = ok(call({ action: 'playAgain', teacherToken: teacher, code, op: 'add', seconds: 90, teams: 'same' })).room;
  assert.strictEqual(again.round, room.round, 'pressing Play again twice started two rounds');
  ok(call({ action: 'joinRoom', token: tokens[ids[4]] })); // back for later rounds
  submitAll(() => ({ correct: 15 }));
  ok(call({ action: 'finishGame', teacherToken: teacher, code }));
});
test('Play again, NEW teams: chosen number of balanced teams, or individual', () => {
  let room = ok(call({ action: 'playAgain', teacherToken: teacher, code, op: 'div', seconds: 60, teams: 4 })).room;
  assert.strictEqual(room.game.teams.length, 4);
  assert.strictEqual(room.game.expected, 12);
  assert.strictEqual(room.game.individual, false);
  submitAll(() => ({ correct: 12 }));
  ok(call({ action: 'finishGame', teacherToken: teacher, code }));
  room = ok(call({ action: 'playAgain', teacherToken: teacher, code, op: 'sub', seconds: 60, teams: '0' })).room;
  assert.strictEqual(room.game.individual, true);
  assert.strictEqual(room.game.teams.length, 12);
  assert.strictEqual(room.game.balanceSd, null);
  submitAll(() => ({ correct: 12 }));
  ok(call({ action: 'finishGame', teacherToken: teacher, code }));
});
test('Play again, SAME after individual play: still individual, same code names, newcomer plays solo', () => {
  const before = Object.keys(teamsByName(tview()));
  ok(call({ action: 'leaveRoom', token: tokens[ids[6]] }));
  goQuiet(code, ids[6]);
  const room = ok(call({ action: 'playAgain', teacherToken: teacher, code, op: 'mul', seconds: 60, teams: 'same' })).room;
  assert.strictEqual(room.game.individual, true);
  assert.strictEqual(room.game.teams.length, 11);
  room.game.teams.forEach(t => assert(before.includes(t.name), 'code name changed: ' + t.name));
  ok(call({ action: 'joinRoom', token: tokens[ids[6]] }));
  submitAll(() => ({ correct: 12 }));
  ok(call({ action: 'finishGame', teacherToken: teacher, code }));
  const r2 = ok(call({ action: 'playAgain', teacherToken: teacher, code, op: 'mul', seconds: 60, teams: 'same' })).room;
  assert.strictEqual(r2.game.teams.length, 12, 'returning student not given a solo spot');
  assert.strictEqual(new Set(r2.game.teams.map(t => t.name)).size, 12, 'duplicate code name');
  submitAll(() => ({ correct: 12 }));
  ok(call({ action: 'finishGame', teacherToken: teacher, code }));
});
test('no result (nobody answers correctly): no trophy and no places', () => {
  const before = Object.fromEntries(ids.map(id => [id, cab(id).items.length]));
  ok(call({ action: 'playAgain', teacherToken: teacher, code, op: 'add', seconds: 60, teams: 3 }));
  submitAll(() => ({ correct: 0, wrong: 3 }));
  const fin = ok(call({ action: 'finishGame', teacherToken: teacher, code })).room;
  assert.strictEqual(fin.status, 'results');
  fin.results.teams.forEach(t => {
    assert.strictEqual(t.rank, null, 'a team with no result got a place');
    assert(!t.trophy, 'a team with no result got a trophy');
    assert.strictEqual(t.avgTime, null);
  });
  ids.forEach(id => assert.strictEqual(cab(id).items.length, before[id], 'trophy given for a round with no result'));
  const me = ok(call({ action: 'roomState', token: tokens[ids[0]] })).room.results.me;
  assert(!me.trophy);
  assert.strictEqual(me.avgTime, null);
});
test('a team with no result gets no place; the others are still placed', () => {
  ok(call({ action: 'playAgain', teacherToken: teacher, code, op: 'add', seconds: 60, teams: 3 }));
  const room = tview(), zeroTeam = room.game.teams[0].name;
  const teamOf = Object.fromEntries(ids.map(id => [id, ok(call({ action: 'roomState', token: tokens[id] })).room.game.team.name]));
  const fast = room.game.teams[1].name; // the other two teams get clearly different results
  submitAll(id => ({ correct: teamOf[id] === zeroTeam ? 0 : teamOf[id] === fast ? 20 : 10 }));
  const t = ok(call({ action: 'finishGame', teacherToken: teacher, code })).room.results.teams;
  assert.deepStrictEqual(t.map(x => x.rank), [1, 2, null]);
  assert.strictEqual(t[2].name, zeroTeam);
  assert(t[0].trophy && !t[2].trophy);
});
test('tie at 2 decimal places: the unrounded time decides the place (not points)', () => {
  ok(call({ action: 'playAgain', teacherToken: teacher, code, op: 'mul', seconds: 60, teams: 0 }));
  const a = ids[0], b = ids[1];
  submitAll(id => id === a ? { correct: 13, wrong: 0, seconds: 59.99 }   // 4.6146 s -> shows 4.61, more points
                : id === b ? { correct: 13, wrong: 2, seconds: 59.95 }   // 4.6115 s -> shows 4.61, fewer points, but faster
                : { correct: 5 });
  const t = ok(call({ action: 'finishGame', teacherToken: teacher, code })).room.results.teams;
  assert.strictEqual(t[0].avgTime, t[1].avgTime, 'test set-up: both should show the same 2-decimal time');
  assert(t[0].points < t[1].points, 'test set-up: the faster player has fewer points');
  assert.strictEqual(t[0].rank, 1); assert.strictEqual(t[1].rank, 2);
  assert(t[0].avgRaw < t[1].avgRaw);
  const sv = ok(call({ action: 'roomState', token: tokens[b] })).room;
  assert(sv.results.me.trophy, 'faster player did not get the trophy');
});
test('exact tie (same time and points): both share 1st and both get the trophy', () => {
  ok(call({ action: 'playAgain', teacherToken: teacher, code, op: 'mul', seconds: 60, teams: 0 }));
  const a = ids[2], b = ids[3];
  submitAll(id => id === a || id === b ? { correct: 20, wrong: 1 } : { correct: 6 });
  const t = ok(call({ action: 'finishGame', teacherToken: teacher, code })).room.results.teams;
  assert.deepStrictEqual(t.slice(0, 3).map(x => x.rank), [1, 1, 3]);
  assert(t[0].trophy && t[1].trophy && t[0].trophy.e === t[1].trophy.e);
  [a, b].forEach(id => assert(ok(call({ action: 'roomState', token: tokens[id] })).room.results.me.trophy));
});

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll tests passed\n');
process.exit(failures ? 1 : 0);
