# Project notes (for Haydn + Claude when editing later)

## Decisions made in v1 (Oct 2026)
- Stack: GitHub Pages (front end) + Google Apps Script web app bound to a Google Sheet (back end). Polling, not websockets.
- One active room at a time (single class). Students press "Class game"; no room code.
- Rooms, sessions and cached sheet data live in CacheService; the sheet is written once per class round / practice game.
- Questions are generated in the browser (`js/levels.js`); fluency/level logic lives only on the server (`server/Fluency.js`), so there is one source of truth.
- Students only ever receive team names (colour + Greek-myth code names), never other students' names. The teacher can reveal members on the results screen.
- Cut-offs are per operation (4 values on the teacher page) rather than one global value, because e.g. 5-digit addition can't reasonably share a cut-off with ×2.
- Multiplication questions randomly show either factor first (`SWAP_FACTORS` in `js/levels.js`).
- After a wrong answer the correct answer shows for 0.9 s, then a new question appears.
- Server code is kept as `.js` in `server/` so the demo and tests can run the exact same code; paste into Apps Script as `.gs` files.

## v2 changes (22 Oct 2026, Haydn's requests)
- ✕ Leave buttons on countdown + play screens (class games ask to confirm; leaving mid-round calls `leaveRoom`).
- Practice is always 1 minute (no time picker).
- Question decks: no fact twice in a row; whole fact set before repeating, in random order; wrong facts re-inserted later.
- Level names themed per operation, getting more epic: Addition = creatures, Subtraction = fruit, Multiplication = vehicles, Division = space. ×/÷ levels also show the table (e.g. "4× Bumpy Bus"); +/− show just the name.
- Operation order: add, sub, mul, div.
- Waiting room: green "You're in the game room" strip + lightning on every class-game waiting screen.
- Mount Olympus design: night sky + mountain, marble panels with gold pediments, fluted columns beside the play area, lightning flash on each correct answer, Cinzel + Nunito fonts. Team names are now Greek-myth creatures.

## v3 changes (22 Oct 2026)
- Game renamed "Trials of Olympus". ÷6 level renamed "Bubblegum Planet Zorp".
- One shared link: student login screen has a "Teacher login" link (and back).
- Students create their own password on first log-in (password column blank in the Students sheet). `setPassword` only works while blank. Teacher can reset from Class levels (`resetPassword`). Passwords stay plain text in the sheet so the teacher can look them up.

## Assumptions to confirm with Haydn
- Winner = lowest team average time per correct answer (as specified). Points are shown but only used as a tie-break. Switch with `RANK_BY`.
- Wrong answer penalty −5, correct +10 (values not specified).
- A level needs 3 attempts before it can be fluent (literal reading of "three most recent attempts"). `MIN_ATTEMPTS_FOR_FLUENCY`.
- Current level = lowest non-fluent level, so dust on an earlier level pulls the student back to it.
- Practice results count towards the profile.
- Default cut-off 3 s for every operation until changed.
- Single-digit numbers use 1–9 (not 0) in Addition L1–2 and Subtraction L1.

## Ideas not built yet
- Placement test for new students (otherwise everyone starts at Level 1 and needs 3 attempts per level to move up).
- Per-level cut-offs (e.g. 5D+5D addition needs more time than 2D+2D).
- Teacher "student detail" view with per-level history from the Attempts sheet.
- Multiple simultaneous classes (would need room codes).
- If live in-game leaderboards are ever wanted, Firebase Realtime Database would suit better than Apps Script polling.
