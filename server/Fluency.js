/**
 * FLUENCY RULES  (levels, dust, profiles)
 * ---------------------------------------------------------------
 * Stored profile shape (one JSON blob per student in the Profiles sheet):
 *   { mul: { "4": { r: [3.1, 2.8, 2.9], n: 7, t: 1729500000000 } }, add: {...}, ... }
 *     r = seconds-per-correct for the most recent attempts (max CONFIG.RECENT_ATTEMPTS)
 *     n = total attempts ever at this level
 *     t = time of the last attempt (ms) — dust is counted from here
 *
 * Rules:
 *   attempt time   = seconds played / correct answers (wrong answers cost time, so they count against you)
 *   fluency time   = average of the last 3 attempts (or fewer, if fewer have been played) + dust
 *   dust           = 0.5 s for every new week (Monday) since the level was last played
 *   fluent         = at least MIN_ATTEMPTS_FOR_FLUENCY attempts (currently 1) AND fluency time <= cut-off
 *   current level  = the LOWEST level that is not fluent, counting levels never tried as not fluent
 *                    (e.g. L1 1.2 s, L2 1.1 s, nothing else tried, cut-off 3 s -> Level 3).
 *                    Dusty levels still pull a student back to revise them.
 */

function round2_(x) { return Math.round(x * 100) / 100; }

/** Monday-based week number in local time. */
function weekIndex_(ms) {
  var day = Math.floor((ms + CONFIG.TZ_OFFSET_HOURS * 3600000) / 86400000); // days since 1 Jan 1970 (a Thursday)
  return Math.floor((day + 3) / 7);
}
function dustFor_(lastMs, nowMs) {
  if (!lastMs) return 0;
  return Math.max(0, weekIndex_(nowMs) - weekIndex_(lastMs)) * CONFIG.DUST_PER_WEEK;
}

function cutoffs_() {
  var s = getSettings_(), out = {};
  CONFIG.OPS.forEach(function (op) { out[op] = Number(s['cutoff_' + op]) || CONFIG.DEFAULT_CUTOFF; });
  return out;
}

function attemptTime_(seconds, correct) { return round2_(seconds / Math.max(correct, 1)); }

function levelStats_(entry, cutoff, now) {
  if (!entry || !entry.r || !entry.r.length) return { attempts: 0, avg: null, dust: 0, time: null, fluent: false, last: null };
  var r = entry.r.slice(-CONFIG.RECENT_ATTEMPTS);
  var avg = r.reduce(function (a, b) { return a + b; }, 0) / r.length;
  var dust = dustFor_(entry.t, now);
  var time = avg + dust;
  var need = Math.min(CONFIG.MIN_ATTEMPTS_FOR_FLUENCY, CONFIG.RECENT_ATTEMPTS);
  return {
    attempts: entry.n || r.length,
    recent: r,
    avg: round2_(avg),
    dust: dust,
    time: round2_(time),
    fluent: r.length >= need && time <= cutoff,
    last: entry.t || null
  };
}

/** Summary of one operation: {current, mastered, cutoff, levels:[{level, attempts, avg, dust, time, fluent}]} */
function opSummary_(profile, op, cutoff, now) {
  var n = CONFIG.LEVEL_COUNTS[op], levels = [], current = null;
  var data = (profile && profile[op]) || {};
  for (var L = 1; L <= n; L++) {
    var st = levelStats_(data[L], cutoff, now);
    st.level = L;
    levels.push(st);
    if (current === null && !st.fluent) current = L;
  }
  return { current: current === null ? n : current, mastered: current === null, cutoff: cutoff, levels: levels };
}

/** What the student app displays. */
function profileView_(profile) {
  var now = Date.now(), cut = cutoffs_(), out = {};
  CONFIG.OPS.forEach(function (op) { out[op] = opSummary_(profile, op, cut[op], now); });
  return out;
}

/** Adds one attempt to a profile object (mutates it). */
function recordAttempt_(profile, op, level, time, now) {
  profile[op] = profile[op] || {};
  var e = profile[op][level] || { r: [], n: 0 };
  e.r.push(round2_(time));
  if (e.r.length > CONFIG.RECENT_ATTEMPTS) e.r = e.r.slice(-CONFIG.RECENT_ATTEMPTS);
  e.n = (e.n || 0) + 1;
  e.t = now;
  profile[op][level] = e;
}

/** Expected seconds-per-correct at the student's current level (used to balance teams). */
function expectedTime_(summary) {
  var st = summary.levels[summary.current - 1];
  return st.time !== null ? st.time : summary.cutoff + CONFIG.UNKNOWN_EXTRA;
}

function validOpLevel_(op, level) {
  return CONFIG.LEVEL_COUNTS.hasOwnProperty(op) && level >= 1 && level <= CONFIG.LEVEL_COUNTS[op] && Math.floor(level) === level;
}
