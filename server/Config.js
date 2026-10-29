/**
 * SERVER SETTINGS  (Apps Script)
 * ---------------------------------------------------------------
 * Change values here, then redeploy:
 *   Deploy > Manage deployments > (pencil) Edit > Version: New version > Deploy
 * The teacher password and fluency cut-offs live in the "Settings" sheet,
 * not here, so they can be changed without redeploying.
 */
var CONFIG = {
  // Which version of the server code this is. js/config.js has the matching SERVER_VERSION; if they differ,
  // the teacher page shows a warning that Apps Script is running old code. Change BOTH when the server changes.
  SERVER_VERSION: 9,

  // Number of levels per operation. Must match js/levels.js.
  LEVEL_COUNTS: { mul: 18, div: 18, add: 13, sub: 11 },
  OPS: ['add', 'sub', 'mul', 'div'],

  // ---- Fluency rules ----
  RECENT_ATTEMPTS: 3,          // fluency = average of this many most recent attempts at a level
  MIN_ATTEMPTS_FOR_FLUENCY: 1, // attempts needed at a level before it can count as fluent (<= RECENT_ATTEMPTS). 1 = one fast try is enough
  DUST_PER_WEEK: 0.5,          // seconds of "dust" added for each new week since the level was last played
  TZ_OFFSET_HOURS: 8,          // Perth (WA has no daylight saving). A new week starts Monday 00:00 local time.
  DEFAULT_CUTOFF: 3.0,         // seconds per correct answer; used until the teacher saves cut-offs
  MIN_ATTEMPT_SECONDS: 20,     // games shorter than this (e.g. joined very late) are not saved to profiles
  MIN_PASSWORD_LENGTH: 4,      // students choose their own password on first log-in

  // ---- Scoring ----
  // Time per correct answer = (seconds played + WRONG_PENALTY_SEC for every wrong answer) / correct answers.
  // Used for winning a class round AND for fluency levels. Lower is better. There are no points.
  WRONG_PENALTY_SEC: 1,

  // ---- Team balancing ----
  // Each student's expected seconds-per-correct = their average time at THEIR current level for the chosen operation.
  // Teams are formed so the teams' average expected times are as close as possible (lowest standard deviation).
  // If a student has never played their current level, expected = cut-off + UNKNOWN_EXTRA.
  UNKNOWN_EXTRA: 1.5,
  BALANCE_ADD_DUST: false,     // false = balance on the real average of recent attempts; true = average + dust (the "fluency time")
  BALANCE_RESTARTS: 40,        // how many different starting line-ups the balancer tries (more = more even, slightly slower)

  // ---- Trophy cabinet ----
  // Every player on the winning team of a class round gets the same trophy (picked at random from this list).
  // Straight after winning they choose: put it in the cabinet, or re-roll it (see REROLL_*).
  // Each week they keep ONE trophy: at Sunday 00:00 Perth time the one they chose is locked into their cabinet
  // for good and the rest of that week's trophies are cleared. If they didn't choose, their best one is kept
  // (platinum first, then the newest).
  // The emoji are shown gold (or platinum) on screen by CSS filters in css/style.css, so any emoji works here.
  TROPHIES: [
    ['🏆', 'Golden Cup'], ['👑', 'Crown of Olympus'], ['🦉', 'Owl of Athena'], ['⚡', 'Thunderbolt of Zeus'],
    ['🔱', 'Trident of Poseidon'], ['🏺', 'Golden Amphora'], ['🐎', 'Golden Pegasus'], ['🦁', 'Nemean Lion'],
    ['🛡️', 'Shield of Achilles'], ['⚔️', 'Sword of Perseus'], ['🏛️', 'Golden Temple'], ['🌿', 'Laurel Wreath'],
    ['🐉', 'Golden Hydra'], ['🦅', 'Eagle of Zeus'], ['🐂', 'Golden Bull'], ['🐑', 'Golden Fleece'],
    ['🍎', 'Golden Apple'], ['☀️', 'Sun of Helios'], ['🔥', 'Flame of Olympus'], ['🏹', 'Bow of Artemis'],
    ['🎭', 'Mask of Dionysus'], ['🐍', 'Serpent of Medusa'], ['⛵', 'Ship of the Argonauts'], ['🦚', 'Peacock of Hera'],
    ['🥇', 'Olympic Gold'], ['🌟', 'Star of Olympus'], ['🐬', 'Dolphin of Apollo'], ['🗿', 'Head of the Titan']
  ],
  TROPHY_SHELF_MAX: 60,        // most trophies held in one week before the weekly keep (oldest drop off first)
  REROLL_PLATINUM_CHANCE: 0.05, // re-roll: chance the trophy becomes platinum
  REROLL_LOSE_CHANCE: 0.95,     // re-roll: chance the trophy is lost. Anything left over (1 - both) = stays gold and can be re-rolled again

  // ---- Timing / traffic ----
  START_DELAY_MS: 8000,        // countdown before a class game starts. Must be longer than the student lobby poll (js/config.js)
  PLAY_AGAIN_DELAY_MS: 10000,  // countdown when the teacher presses Play again on the results screen
                               // (students on the results screen check every 4–5 s, so this is a little longer)
  SUBMIT_GRACE_MS: 15000,      // after the game ends, wait this long for late results before finishing anyway
  PRESENCE_TTL_SEC: 30,        // a student stops counting as "in the room" if their class-game screen hasn't checked in for this long
                               // (screens check in every 3–4 s; must stay well above the slowest student poll in js/config.js)
  SESSION_TTL_SEC: 21600,      // login lasts 6 hours (CacheService maximum)
  ROOM_TTL_SEC: 21600,         // a room lasts 6 hours (CacheService maximum)
  LIST_CACHE_SEC: 300,         // Students/Settings sheets are re-read at most every 5 minutes

  // Team / player code names (students never see each other's real names). Colour + creature of Greek myth.
  TEAM_NAMES: [
    ['Titans', '🗿'], ['Spartans', '🛡️'], ['Cyclopes', '👁️'], ['Minotaurs', '🐂'], ['Centaurs', '🏹'], ['Pegasi', '🐎'],
    ['Griffins', '🦅'], ['Hydras', '🐉'], ['Krakens', '🐙'], ['Sphinxes', '🦁'], ['Harpies', '🪶'], ['Gorgons', '🐍'],
    ['Phoenixes', '🔥'], ['Argonauts', '⛵'], ['Olympians', '⚡'], ['Sirens', '🧜'], ['Satyrs', '🐐'], ['Furies', '🌪️'],
    ['Heroes', '⚔️'], ['Oracles', '🔮'], ['Nymphs', '🌿'], ['Giants', '⛰️'], ['Owls of Athena', '🦉'], ['Tridents', '🔱'],
    ['Thunderbolts', '🌩️'], ['Chariots', '🏺'], ['Lions of Nemea', '🦁'], ['Boars of Erymanthus', '🐗'], ['Stymphalian Birds', '🐦'], ['Fleece Hunters', '🐑'],
    ['Labyrinth Runners', '🌀'], ['Trojan Horses', '🐴'], ['Laurel Crowns', '👑'], ['Torchbearers', '🔦'], ['Sea Serpents', '🌊'], ['Sun Chariots', '☀️']
  ],
  TEAM_COLOURS: ['Crimson', 'Azure', 'Emerald', 'Golden', 'Violet', 'Bronze', 'Silver', 'Coral', 'Teal', 'Obsidian', 'Olive', 'Indigo'],
  TEAM_HEX: {
    Crimson: '#c0313f', Azure: '#2f6fd6', Emerald: '#1f8f5c', Golden: '#c9971c', Violet: '#7d4cc4', Bronze: '#a5672d',
    Silver: '#7c8494', Coral: '#e2614f', Teal: '#138a84', Obsidian: '#2b2d3a', Olive: '#6b7a22', Indigo: '#3b3fa8'
  }
};
