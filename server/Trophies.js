/**
 * TROPHY CABINET
 * ---------------------------------------------------------------
 * Each student's cabinet is stored inside their profile JSON (Profiles sheet), so no new sheet is needed:
 *   profile.cab = { wk, items: [trophy, ...newest first], keep: id | null, locked: [trophy + {wk}, ...newest first] }
 *   trophy      = { id, e: '🦉', n: 'Owl of Athena', op: 'mul', team: 'Azure Krakens', t: 1729500000000,
 *                   plat: true (platinum) | absent, open: true (not decided yet: keep or re-roll) | absent }
 *
 * Rules:
 *  - Every player on the winning team of a class round (who sent in a result) gets the same trophy. It goes
 *    into this week's trophies straight away, "open" (undecided).
 *  - Undecided trophy: the student either puts it in the cabinet as it is (decides it), or re-rolls it:
 *    REROLL_PLATINUM_CHANCE (5%) it becomes platinum, REROLL_LOSE_CHANCE (95%) it is lost, otherwise it stays
 *    gold and undecided. They can choose on the win screen or later in the cabinet. Platinum can't be re-rolled.
 *  - One trophy per week is kept: the student taps the one to keep. At the start of the next trophy week
 *    (Sunday 00:00 Perth) that trophy is LOCKED into the cabinet for good and the week's other trophies are cleared.
 *    If they didn't choose, their best trophy is kept: platinum first, then the newest.
 *  - Locking happens whenever the cabinet is next read or changed, so no timed trigger is needed.
 *  - Older cabinets (v6/v7) had a "favourite": it is locked in (or, if it was won this week, kept as this week's choice).
 */

var DAY_MS_ = 86400000;

/** Sunday-based week number in local time (day 0 = Thursday 1 Jan 1970, so day 3 is a Sunday). */
function trophyWeek_(ms) {
  var day = Math.floor((ms + CONFIG.TZ_OFFSET_HOURS * 3600000) / DAY_MS_);
  return Math.floor((day + 4) / 7);
}
/** Time (ms) the given trophy week ends, i.e. the next Sunday 00:00 local time. */
function trophyWeekEnds_(wk) {
  return ((wk + 1) * 7 - 4) * DAY_MS_ - CONFIG.TZ_OFFSET_HOURS * 3600000;
}
/** Time (ms) the given trophy week starts (Sunday 00:00 local time). */
function trophyWeekStarts_(wk) { return trophyWeekEnds_(wk) - 7 * DAY_MS_; }

function copyTrophy_(t) { var c = {}; Object.keys(t).forEach(function (k) { c[k] = t[k]; }); return c; }

/** The trophy that will be locked in this week: the chosen one, else platinum first, then newest. */
function weekKeeper_(cab) {
  var items = cab.items || [], i;
  if (cab.keep) for (i = 0; i < items.length; i++) if (items[i].id === cab.keep) return items[i];
  var best = null;
  items.forEach(function (t) {
    if (!best || (!!t.plat !== !!best.plat ? !!t.plat : t.t > best.t)) best = t;
  });
  return best;
}

/** Locks the week's keeper into the cabinet and clears the week. */
function lockWeek_(cab) {
  var k = weekKeeper_(cab);
  if (k) {
    var lockedT = copyTrophy_(k);
    delete lockedT.open;
    lockedT.wk = cab.wk;
    cab.locked.unshift(lockedT);
  }
  cab.items = []; cab.keep = null;
}

/** The student's cabinet, after locking any finished week. Mutates the profile. */
function cabinet_(profile, now) {
  var wk = trophyWeek_(now);
  var cab = profile.cab || { wk: wk, items: [], keep: null, locked: [] };
  if (!cab.items) cab.items = [];
  if (!cab.locked) cab.locked = [];
  if (cab.keep === undefined) cab.keep = null;
  if (cab.wk === undefined) cab.wk = wk;
  if (cab.fav) { // v6/v7 favourite
    var fav = cab.fav; delete cab.fav;
    var favWk = trophyWeek_(fav.t);
    if (favWk === cab.wk) { cab.items.unshift(fav); cab.items.sort(function (a, b) { return b.t - a.t; }); cab.keep = fav.id; }
    else { var lf = copyTrophy_(fav); lf.wk = favWk; cab.locked.unshift(lf); cab.locked.sort(function (a, b) { return b.wk - a.wk; }); }
  }
  if (cab.wk !== wk) { lockWeek_(cab); cab.wk = wk; }
  profile.cab = cab;
  return cab;
}

/** A random trophy, avoiding `notEmoji` (e.g. the previous round's) when possible. */
function pickTrophy_(notEmoji) {
  var list = CONFIG.TROPHIES.filter(function (t) { return t[0] !== notEmoji; });
  if (!list.length) list = CONFIG.TROPHIES;
  var t = list[Math.floor(Math.random() * list.length)];
  return { e: t[0], n: t[1] };
}

/** Adds a won trophy to this week's trophies, undecided (mutates the profile). Returns the stored trophy. */
function awardTrophy_(profile, trophy, op, teamName, now) {
  var cab = cabinet_(profile, now);
  var item = { id: now.toString(36) + Math.random().toString(36).slice(2, 7), e: trophy.e, n: trophy.n, op: op, team: teamName, t: now, open: true };
  cab.items.unshift(item);
  while (cab.items.length > CONFIG.TROPHY_SHELF_MAX) {
    var drop = cab.items.pop();
    if (drop.id === cab.keep) { cab.items.splice(cab.items.length - 1, 1, drop); } // never drop the chosen one
  }
  return item;
}

function findItem_(cab, id) {
  for (var i = 0; i < cab.items.length; i++) if (cab.items[i].id === id) return i;
  return -1;
}

/**
 * The student decides what to do with an undecided trophy.
 * choice 'keep'   -> it goes in the cabinet as it is.          outcome 'kept'
 * choice 'reroll' -> platinum (outcome 'platinum'), lost (outcome 'lost'), or stays gold and undecided ('gold').
 * rnd: optional random number 0..1 (tests); the server always uses Math.random.
 */
function decideTrophy_(profile, id, choice, now, rnd) {
  var cab = cabinet_(profile, now);
  var i = findItem_(cab, id);
  if (i < 0) throw new Error('That trophy isn\'t in your cabinet any more.');
  var t = cab.items[i];
  if (!t.open) throw new Error('You\'ve already decided about this trophy.');
  if (choice === 'keep') { delete t.open; return { outcome: 'kept', trophy: t }; }
  if (choice !== 'reroll') throw new Error('Unknown choice');
  var r = rnd === undefined ? Math.random() : rnd;
  if (r < CONFIG.REROLL_PLATINUM_CHANCE) { t.plat = true; delete t.open; return { outcome: 'platinum', trophy: t }; }
  if (r < CONFIG.REROLL_PLATINUM_CHANCE + CONFIG.REROLL_LOSE_CHANCE) {
    cab.items.splice(i, 1);
    if (cab.keep === id) cab.keep = null;
    return { outcome: 'lost', trophy: null };
  }
  return { outcome: 'gold', trophy: t };
}

/** The student picks which of this week's trophies to keep. */
function setKeeper_(profile, id, now) {
  var cab = cabinet_(profile, now);
  if (findItem_(cab, id) < 0) throw new Error('That trophy isn\'t in your cabinet any more.');
  cab.keep = id;
  return cab;
}

/** What the student app displays. */
function cabinetView_(profile, now) {
  var cab = cabinet_(profile, now);
  var k = weekKeeper_(cab);
  return {
    week: { items: cab.items, keeper: k ? k.id : null, chosen: !!cab.keep, locksAt: trophyWeekEnds_(cab.wk) },
    locked: cab.locked.map(function (t) { var c = copyTrophy_(t); c.from = trophyWeekStarts_(t.wk); return c; }),
    odds: { platinum: CONFIG.REROLL_PLATINUM_CHANCE, lose: CONFIG.REROLL_LOSE_CHANCE }
  };
}
