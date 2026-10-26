/**
 * TROPHY CABINET
 * ---------------------------------------------------------------
 * Each student's cabinet is stored inside their profile JSON (Profiles sheet), so no new sheet is needed:
 *   profile.cab = { wk: 2912, fav: trophy | null, items: [trophy, ...newest first] }
 *   trophy      = { id, e: '🦉', n: 'Owl of Athena', op: 'mul', team: 'Azure Krakens', t: 1729500000000 }
 *
 * Rules:
 *  - Every player on the winning team of a class round (who sent in a result) gets the same trophy.
 *  - The student taps a trophy to make it their favourite: it moves to the top shelf. The old favourite
 *    goes back onto the shelves below.
 *  - A new trophy week starts every Sunday 00:00 Perth time. The shelves are emptied then; the favourite stays.
 *    Clearing happens whenever the cabinet is next read or changed, so no timed trigger is needed.
 */

/** Sunday-based week number in local time (day 0 = Thursday 1 Jan 1970, so day 3 is a Sunday). */
function trophyWeek_(ms) {
  var day = Math.floor((ms + CONFIG.TZ_OFFSET_HOURS * 3600000) / 86400000);
  return Math.floor((day + 4) / 7);
}
/** Time (ms) the given trophy week ends, i.e. the next Sunday 00:00 local time. */
function trophyWeekEnds_(wk) {
  return ((wk + 1) * 7 - 4) * 86400000 - CONFIG.TZ_OFFSET_HOURS * 3600000;
}

/** The student's cabinet, emptied (favourite kept) if a new trophy week has started. Mutates the profile. */
function cabinet_(profile, now) {
  var wk = trophyWeek_(now);
  var cab = profile.cab || { wk: wk, fav: null, items: [] };
  if (!cab.items) cab.items = [];
  if (cab.wk !== wk) { cab.items = []; cab.wk = wk; }
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

/** Adds a trophy to a profile's shelves (mutates it). Returns the stored trophy. */
function awardTrophy_(profile, trophy, op, teamName, now) {
  var cab = cabinet_(profile, now);
  var item = { id: now.toString(36) + Math.random().toString(36).slice(2, 7), e: trophy.e, n: trophy.n, op: op, team: teamName, t: now };
  cab.items.unshift(item);
  if (cab.items.length > CONFIG.TROPHY_SHELF_MAX) cab.items.length = CONFIG.TROPHY_SHELF_MAX;
  return item;
}

/** Moves the tapped trophy to the top shelf; the previous favourite goes back onto the shelves. */
function setFavourite_(profile, id, now) {
  var cab = cabinet_(profile, now);
  if (cab.fav && cab.fav.id === id) return cab;
  var idx = -1;
  for (var i = 0; i < cab.items.length; i++) if (cab.items[i].id === id) { idx = i; break; }
  if (idx < 0) throw new Error('That trophy isn\'t in your cabinet any more.');
  var pick = cab.items.splice(idx, 1)[0];
  if (cab.fav) {
    cab.items.push(cab.fav);
    cab.items.sort(function (a, b) { return b.t - a.t; });
  }
  cab.fav = pick;
  return cab;
}

/** What the student app displays. */
function cabinetView_(profile, now) {
  var cab = cabinet_(profile, now);
  return { fav: cab.fav, items: cab.items, clearsAt: trophyWeekEnds_(cab.wk) };
}
