/**
 * LEVELS & QUESTION DECKS
 * ---------------------------------------------------------------
 * The ONLY file that defines what each level asks and what it is called.
 * Questions are made in the browser, so they cost no server traffic.
 *
 * Each level has a name (themed per operation), an emoji, a tag (×/÷ levels show the table, e.g. "4×"),
 * a desc (technical description, shown to the teacher) and its number pairs.
 *
 * Question order (Levels.deck):
 *  - Small levels (e.g. a times table) are a shuffled "deck" of every fact. Every fact is asked once
 *    before any repeats; then the deck is reshuffled. A fact never appears twice in a row
 *    (also across reshuffles). Facts answered wrongly are slipped back into the rest of the deck.
 *  - Huge levels (e.g. 3-digit + 3-digit) have too many facts to list, so questions are random
 *    and never repeat within the game.
 *
 * To change a level: edit it below. If you add/remove levels, also update CONFIG.LEVEL_COUNTS in
 * server/Config.js and the spec in tests/run-tests.js, then run `node tests/run-tests.js`.
 * Add new levels at the END of a list — profiles store progress by level number.
 */
(function (root) {
  var SWAP_FACTORS = true;     // multiplication: randomly show 7 × 3 or 3 × 7
  var MAX_DECK_SIZE = 20000;   // levels with more possible facts than this use random questions

  function rnd(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /** True if adding a + b (column method) carries in at least one column. */
  function hasCarry(a, b) {
    var c = 0;
    while (a > 0 || b > 0) {
      var s = (a % 10) + (b % 10) + c;
      c = s >= 10 ? 1 : 0;
      if (c) return true;
      a = Math.floor(a / 10); b = Math.floor(b / 10);
    }
    return false;
  }
  /** True if a − b (column method) needs to borrow in at least one column. */
  function hasBorrow(a, b) {
    while (a > 0 || b > 0) {
      if ((a % 10) < (b % 10)) return true;
      a = Math.floor(a / 10); b = Math.floor(b / 10);
    }
    return false;
  }

  /* ---------- How each operation turns a pair into a question ---------- */
  var SHOW = {
    mul: function (p) { var a = p[0], b = p[1]; if (SWAP_FACTORS && Math.random() < 0.5) { a = p[1]; b = p[0]; } return { text: a + ' × ' + b, answer: p[0] * p[1] }; },
    div: function (p) { return { text: (p[0] * p[1]) + ' ÷ ' + p[0], answer: p[1] }; },   // p = [divisor, quotient]
    add: function (p) { return { text: p[0] + ' + ' + p[1], answer: p[0] + p[1] }; },
    sub: function (p) { return { text: p[0] + ' − ' + p[1], answer: p[0] - p[1] }; }
  };

  /** Pair source: every [a, b] with a in A, b in B that passes ok(a, b). */
  function pairs(aLo, aHi, bLo, bHi, ok) {
    ok = ok || function () { return true; };
    var size = (aHi - aLo + 1) * (bHi - bLo + 1);
    return {
      all: size <= MAX_DECK_SIZE ? function () {
        var out = [];
        for (var a = aLo; a <= aHi; a++) for (var b = bLo; b <= bHi; b++) if (ok(a, b)) out.push([a, b]);
        return out;
      } : null,
      random: function () {
        for (var i = 0; i < 20000; i++) { var a = rnd(aLo, aHi), b = rnd(bLo, bHi); if (ok(a, b)) return [a, b]; }
        throw new Error('Could not make a question');
      }
    };
  }
  var carry = function (want) { return function (a, b) { return hasCarry(a, b) === want; }; };
  var borrow = function (want) { return function (a, b) { return a >= b && hasBorrow(a, b) === want; }; };
  var RG = true, NRG = false;

  function L(emoji, name, tag, desc, src) { return { emoji: emoji, name: name, tag: tag, desc: desc, src: src }; }

  /* ---------- The levels ---------- */
  var OPS = {
    add: {
      name: 'Addition', symbol: '+', theme: 'Creatures',
      levels: [
        L('🐌', 'Snoozy Snail', '', '1D + 1D, no regrouping', pairs(1, 9, 1, 9, carry(NRG))),
        L('🐨', 'Dozy Koala', '', '1D + 1D, regrouping (sum 10+)', pairs(1, 9, 1, 9, carry(RG))),
        L('🐧', 'Waddling Penguin', '', '2D + 1D, no regrouping', pairs(10, 99, 1, 9, carry(NRG))),
        L('🐸', 'Burping Frog', '', '2D + 2D, regrouping', pairs(10, 99, 10, 99, carry(RG))),
        L('🦘', 'Boxing Kangaroo', '', '3D + 1D, regrouping', pairs(100, 999, 1, 9, carry(RG))),
        L('🦩', 'Disco Flamingo', '', '3D + 2D, regrouping', pairs(100, 999, 10, 99, carry(RG))),
        L('🐆', 'Turbo Cheetah', '', '3D + 3D, regrouping', pairs(100, 999, 100, 999, carry(RG))),
        L('🐼', 'Ninja Panda', '', '4D + 2D, regrouping', pairs(1000, 9999, 10, 99, carry(RG))),
        L('🦏', 'Thunder Rhino', '', '4D + 3D, regrouping', pairs(1000, 9999, 100, 999, carry(RG))),
        L('🦈', 'Mega Shark', '', '4D + 4D, regrouping', pairs(1000, 9999, 1000, 9999, carry(RG))),
        L('🦅', 'Storm Eagle', '', '5D + 3D, regrouping', pairs(10000, 99999, 100, 999, carry(RG))),
        L('🐎', 'Mighty Pegasus', '', '5D + 4D, regrouping', pairs(10000, 99999, 1000, 9999, carry(RG))),
        L('🐉', 'Legendary Hydra', '', '5D + 5D, regrouping', pairs(10000, 99999, 10000, 99999, carry(RG)))
      ]
    },
    sub: {
      name: 'Subtraction', symbol: '−', theme: 'Fruit',
      levels: [
        L('🍌', 'Squishy Banana', '', '1D − 1D', pairs(1, 9, 1, 9, borrow(NRG))),
        L('🍋', 'Sour-Face Lemon', '', '2D − 1D, no regrouping', pairs(10, 99, 1, 9, borrow(NRG))),
        L('🍇', 'Rolling Grape', '', '2D − 1D, regrouping', pairs(10, 99, 1, 9, borrow(RG))),
        L('🥝', 'Hairy Kiwi', '', '2D − 2D, no regrouping', pairs(10, 99, 10, 99, borrow(NRG))),
        L('🍍', 'Spiky Pineapple', '', '2D − 2D, regrouping', pairs(10, 99, 10, 99, borrow(RG))),
        L('🥥', 'Coconut Cannonball', '', '3D − 1D, no regrouping', pairs(100, 999, 1, 9, borrow(NRG))),
        L('🍉', 'Exploding Watermelon', '', '3D − 1D, regrouping', pairs(100, 999, 1, 9, borrow(RG))),
        L('🥭', 'Rocket Mango', '', '3D − 2D, no regrouping', pairs(100, 999, 10, 99, borrow(NRG))),
        L('🍒', 'Twin Thunder Cherries', '', '3D − 2D, regrouping', pairs(100, 999, 10, 99, borrow(RG))),
        L('🍎', 'Golden Apple of the Gods', '', '3D − 3D, no regrouping', pairs(100, 999, 100, 999, borrow(NRG))),
        L('🍯', 'Ambrosia of Olympus', '', '3D − 3D, regrouping', pairs(100, 999, 100, 999, borrow(RG)))
      ]
    },
    mul: {
      name: 'Multiplication', symbol: '×', theme: 'Vehicles',
      levels: [
        L('🛹', 'Squeaky Skateboard', '2×', '2 × 1 to 2 × 12', pairs(2, 2, 1, 12)),
        L('🛴', 'Wonky Scooter', '10×', '10 × 1 to 10 × 12', pairs(10, 10, 1, 12)),
        L('🚲', 'Rusty Bicycle', '5×', '5 × 1 to 5 × 12', pairs(5, 5, 1, 12)),
        L('🚜', 'Muddy Tractor', '3×', '3 × 1 to 3 × 12', pairs(3, 3, 1, 12)),
        L('🚌', 'Bumpy Bus', '4×', '4 × 1 to 4 × 12', pairs(4, 4, 1, 12)),
        L('🚒', 'Wailing Fire Engine', '11×', '11 × 1 to 11 × 12', pairs(11, 11, 1, 12)),
        L('🏎️', 'Nitro Race Car', '6×', '6 × 1 to 6 × 12', pairs(6, 6, 1, 12)),
        L('🚤', 'Splash Speedboat', '7×', '7 × 1 to 7 × 12', pairs(7, 7, 1, 12)),
        L('🚄', 'Bullet Train', '8×', '8 × 1 to 8 × 12', pairs(8, 8, 1, 12)),
        L('🚁', 'Whirlybird Chopper', '9×', '9 × 1 to 9 × 12', pairs(9, 9, 1, 12)),
        L('✈️', 'Jumbo Jet', '12×', '12 × 1 to 12 × 12', pairs(12, 12, 1, 12)),
        L('🛩️', 'Supersonic Jet', '1–12×', 'Both factors 1–12', pairs(1, 12, 1, 12)),
        L('🚀', 'Rocket Ship', '13–15×', 'One factor 13–15, the other 1–12', pairs(13, 15, 1, 12)),
        L('🛸', 'Flying Saucer', '16–20×', 'One factor 16–20, the other 1–12', pairs(16, 20, 1, 12)),
        L('🛰️', 'Galaxy Cruiser', '21–25×', 'One factor 21–25, the other 1–12', pairs(21, 25, 1, 12)),
        L('🌠', 'Comet Rider', '26–30×', 'One factor 26–30, the other 1–12', pairs(26, 30, 1, 12)),
        L('☀️', 'Chariot of Helios', '31–35×', 'One factor 31–35, the other 1–12', pairs(31, 35, 1, 12)),
        L('⚡', 'Zeus\'s Thunder Chariot', '36–40×', 'One factor 36–40, the other 1–12', pairs(36, 40, 1, 12))
      ]
    },
    div: {
      name: 'Division', symbol: '÷', theme: 'Space',
      levels: [
        L('🥔', 'Space Potato', '÷2', 'Divide by 2, answers 1–12', pairs(2, 2, 1, 12)),
        L('☄️', 'Dizzy Asteroid', '÷10', 'Divide by 10, answers 1–12', pairs(10, 10, 1, 12)),
        L('🌕', 'Cheesy Moon', '÷5', 'Divide by 5, answers 1–12', pairs(5, 5, 1, 12)),
        L('🧊', 'Frosty Pluto', '÷3', 'Divide by 3, answers 1–12', pairs(3, 3, 1, 12)),
        L('🔥', 'Toasty Mercury', '÷4', 'Divide by 4, answers 1–12', pairs(4, 4, 1, 12)),
        L('🔴', 'Rusty Mars', '÷11', 'Divide by 11, answers 1–12', pairs(11, 11, 1, 12)),
        L('🫧', 'Bubblegum Planet Zorp', '÷6', 'Divide by 6, answers 1–12', pairs(6, 6, 1, 12)),
        L('🌍', 'Blue Marble Earth', '÷7', 'Divide by 7, answers 1–12', pairs(7, 7, 1, 12)),
        L('🔵', 'Windy Neptune', '÷8', 'Divide by 8, answers 1–12', pairs(8, 8, 1, 12)),
        L('🪐', 'Hula-Hoop Saturn', '÷9', 'Divide by 9, answers 1–12', pairs(9, 9, 1, 12)),
        L('🟠', 'Gigantic Jupiter', '÷12', 'Divide by 12, answers 1–12', pairs(12, 12, 1, 12)),
        L('🌞', 'Blazing Sun', '÷1–12', 'Divisor 1–12, answers 1–12', pairs(1, 12, 1, 12)),
        L('❤️‍🔥', 'Red Giant', '÷13–15', 'Divisor 13–15, answers 1–12', pairs(13, 15, 1, 12)),
        L('💫', 'Spinning Pulsar', '÷16–20', 'Divisor 16–20, answers 1–12', pairs(16, 20, 1, 12)),
        L('💥', 'Supernova', '÷21–25', 'Divisor 21–25, answers 1–12', pairs(21, 25, 1, 12)),
        L('🕳️', 'Black Hole', '÷26–30', 'Divisor 26–30, answers 1–12', pairs(26, 30, 1, 12)),
        L('🌌', 'Milky Way', '÷31–35', 'Divisor 31–35, answers 1–12', pairs(31, 35, 1, 12)),
        L('✨', 'The Whole Universe', '÷36–40', 'Divisor 36–40, answers 1–12', pairs(36, 40, 1, 12))
      ]
    }
  };

  /* ---------- Decks ---------- */
  function key(p) { return p[0] + ',' + p[1]; }

  function Deck(op, level) {
    var lv = OPS[op].levels[level - 1], show = SHOW[op];
    var all = lv.src.all ? lv.src.all() : null;
    var queue = [], lastKey = null, seen = {};
    this.size = all ? all.length : Infinity;
    this.next = function () {
      var p;
      if (all) {
        if (!queue.length) {
          queue = shuffle(all.slice());
          if (queue.length > 1 && key(queue[0]) === lastKey) { var j = 1 + Math.floor(Math.random() * (queue.length - 1)); var t = queue[0]; queue[0] = queue[j]; queue[j] = t; }
        }
        p = queue.shift();
      } else {
        for (var i = 0; i < 200; i++) { p = lv.src.random(); if (key(p) !== lastKey && !seen[key(p)]) break; }
        seen[key(p)] = true;
      }
      lastKey = key(p);
      var q = show(p); q.pair = p; q.key = lastKey;
      return q;
    };
    /** A wrongly answered fact comes back later in this round of the deck (never straight away). */
    this.missed = function (q) {
      if (!all || !queue.length) return; // an empty queue means it will be in the next shuffle anyway
      queue.splice(1 + Math.floor(Math.random() * queue.length), 0, q.pair);
    };
  }

  var Levels = {
    OPS: OPS,
    ORDER: ['add', 'sub', 'mul', 'div'],
    count: function (op) { return OPS[op].levels.length; },
    info: function (op, level) { return OPS[op].levels[level - 1]; },
    /** "4× Bumpy Bus" for ×/÷, "Snoozy Snail" for +/−. */
    name: function (op, level) { var lv = OPS[op].levels[level - 1]; return (lv.tag ? lv.tag + ' ' : '') + lv.name; },
    /** With emoji: "🚌 4× Bumpy Bus" */
    title: function (op, level) { return OPS[op].levels[level - 1].emoji + ' ' + Levels.name(op, level); },
    /** "Level 5: 🚌 4× Bumpy Bus" */
    label: function (op, level) { return 'Level ' + level + ': ' + Levels.title(op, level); },
    deck: function (op, level) { return new Deck(op, level); },
    _hasCarry: hasCarry, _hasBorrow: hasBorrow
  };

  root.Levels = Levels;
  if (typeof module !== 'undefined') module.exports = Levels;
})(typeof window !== 'undefined' ? window : globalThis);
