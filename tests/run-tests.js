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
['js/demo/mock-gas.js', 'server/Config.js', 'server/Store.js', 'server/Fluency.js', 'server/Rooms.js', 'server/Code.js'].forEach(load);
ctx.MockGas.reset();
ctx.MockGas.seedDemo();
const call = req => vm.runInContext('handleRequest(' + JSON.stringify(req) + ')', ctx);
const ok = r => { assert(r.ok, r.error); return r; };

let teacher, tokens = {}, ids = [];
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
  list.forEach(s => { const r = ok(call({ action: 'setPassword', studentId: s.id, password: 'Pw-' + s.name + ' ' })); tokens[s.id] = r.token; ids.push(s.id); });
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
test('start game: 12 players, teams of 4 -> 3 teams of 4, levels assigned', () => {
  const room = ok(call({ action: 'startGame', teacherToken: teacher, code, op: 'mul', teamSize: 4, seconds: 60 })).room;
  assert.strictEqual(room.game.teams.length, 3);
  room.game.teams.forEach(t => assert.strictEqual(t.members.length, 4));
  const sv = ok(call({ action: 'roomState', token: tokens[ids[0]] })).room;
  assert.strictEqual(sv.game.level, 2, 'fluent-at-level-1 student should get level 2');
  assert(sv.game.team.name && !sv.game.team.members, 'student should see team name only');
  assert(!JSON.stringify(sv).includes('Ben'), 'student view leaked a name');
});
test('team sizes for awkward class sizes stay within 1', () => {
  [[25, 4], [27, 4], [10, 4], [7, 3], [5, 6], [9, 2]].forEach(([n, size]) => {
    const entries = Array.from({ length: n }, (_, i) => ({ id: 'x' + i, rate: Math.random() }));
    const teams = vm.runInContext('formTeams_', ctx)(entries, size);
    const sizes = teams.map(t => t.length);
    assert.strictEqual(sizes.reduce((a, b) => a + b, 0), n);
    assert(Math.max(...sizes) - Math.min(...sizes) <= 1, n + '/' + size + ' sizes ' + sizes);
  });
});
test('balancing: team averages close together', () => {
  const entries = Array.from({ length: 28 }, (_, i) => ({ id: 'x' + i, rate: 1 / (1.5 + i * 0.25) }));
  const teams = vm.runInContext('formTeams_', ctx)(entries, 4);
  const rate = Object.fromEntries(entries.map(e => [e.id, e.rate]));
  const means = teams.map(t => t.reduce((a, id) => a + rate[id], 0) / t.length);
  const spread = (Math.max(...means) - Math.min(...means)) / (means.reduce((a, b) => a + b) / means.length);
  assert(spread < 0.05, 'team means differ by ' + (spread * 100).toFixed(1) + '%');
});
test('individual play: one team per student', () => {
  const entries = Array.from({ length: 28 }, (_, i) => ({ id: 'x' + i, rate: 1 }));
  assert.strictEqual(vm.runInContext('formTeams_', ctx)(entries, 1).length, 28);
  const labels = vm.runInContext('teamLabels_', ctx)(40);
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
  for (let i = 1; i < t.length; i++) assert(t[i - 1].avgTime <= t[i].avgTime, 'not sorted by avg time');
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
});
test('a student who leaves mid-round drops out so the teacher is not kept waiting', () => {
  const room = ok(call({ action: 'startGame', teacherToken: teacher, code, op: 'add', teamSize: 3, seconds: 60 })).room;
  assert.strictEqual(room.game.expected, 12);
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
test('teacher resets a forgotten password; student makes a new one', () => {
  ok(call({ action: 'resetPassword', teacherToken: teacher, id: ids[2] }));
  assert.strictEqual(call({ action: 'login', studentId: ids[2], password: 'Pw-Chloe' }).error, 'NEEDS_PASSWORD');
  ok(call({ action: 'setPassword', studentId: ids[2], password: 'newpass' }));
  ok(call({ action: 'login', studentId: ids[2], password: 'newpass' }));
});
test('class overview', () => {
  const rows = ok(call({ action: 'classOverview', teacherToken: teacher })).rows;
  assert.strictEqual(rows.length, 12);
  assert(rows[0].mul.level >= 1);
});

/* ---------- 3. Dust ---------- */
console.log('\nDust and fluency rules');
const F = name => vm.runInContext(name, ctx);
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
test('fluency uses only the 3 most recent attempts', () => {
  const p = {}; const rec = F('recordAttempt_');
  [9, 9, 2, 2, 2].forEach(t => rec(p, 'add', 1, t, Date.now()));
  assert.strictEqual(JSON.stringify(p.add[1].r), '[2,2,2]');
  assert.strictEqual(p.add[1].n, 5);
});

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll tests passed\n');
process.exit(failures ? 1 : 0);
