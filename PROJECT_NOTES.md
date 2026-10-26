# Project notes (for Haydn + Claude when editing later)

## ⚠️ How to hand over every update (Haydn's standing instruction, 26 Oct 2026)
1. **Always give Haydn one zip of ALL the game's files** (the whole `fluency-game/` folder, not just the changed ones), as a download link, so he can upload everything to GitHub in one go.
2. **Whenever server code changes, give ALL the Apps Script code in ONE file** (`apps-script/Code.gs`, rebuilt with `node tools/build-apps-script.js`), so he can select all → delete in Apps Script → paste the new code. Never ask him to edit or add individual server functions by hand.
3. Then say in a line or two what to do: paste Code.gs + deploy a new version (if the server changed), and replace the files on GitHub.

## Decisions made in v1 (Oct 2026)
- Stack: GitHub Pages (front end) + Google Apps Script web app bound to a Google Sheet (back end). Polling, not websockets.
- One active room at a time (single class). Students press "Class game"; no room code.
- Rooms, sessions and cached sheet data live in CacheService; the sheet is written once per class round / practice game.
- Questions are generated in the browser (`js/levels.js`); fluency/level logic lives only on the server (`server/Fluency.js`), so there is one source of truth.
- Students only ever receive team names (colour + Greek-myth code names), never other students' names. The teacher can reveal members on the results screen.
- Cut-offs are per operation (4 values on the teacher page) rather than one global value, because e.g. 5-digit addition can't reasonably share a cut-off with ×2.
- Multiplication questions randomly show either factor first (`SWAP_FACTORS` in `js/levels.js`).
- After a wrong answer the correct answer shows for 0.9 s, then a new question appears.
- Server code is kept as `.js` in `server/` so the demo and tests can run the exact same code. `node tools/build-apps-script.js` joins them into `apps-script/Code.gs`, the single file Haydn pastes into Apps Script (his project has just Code.gs).

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

## v4 changes (23 Oct 2026, Haydn's requests)
- **Flip button on the number pad** (`js/game.js`, styles in `css/pad.css`, linked from `index.html`). ⇅ Flip sits to the right of the pad and swaps 7-8-9-on-top ↔ 1-2-3-on-top; the bottom row ⌫ 0 ✓ never moves. Whatever has been typed stays. The choice is saved per iPad (localStorage key `fg_pad_flipped`) and used for every later game, practice and class.
- **Level placement:** current level = lowest level whose fluency time is NOT at/under the cut-off, counting never-tried levels as not fluent. Haydn's example: L1 1.2 s, L2 1.1 s, nothing else tried → Level 3. Done by setting `MIN_ATTEMPTS_FOR_FLUENCY` to 1 (was 3), so one fast try now counts. Fluency time is still the average of the last 3 tries (or fewer if fewer played) + dust, and dust still pulls students back.
- Practice results screen no longer says "x of 3 tries done".
- Not yet confirmed with Haydn: a time exactly equal to the cut-off still counts as fluent (`<=`).

## v5 changes (23 Oct 2026, Haydn's requests)
- **Lobby only shows students who are actually on the Class game screen.** Cause found in the code: the room kept every student who had ever pressed Class game until they tapped "Leave the room". Reloading, closing the app, logging out or the iPad sleeping never told the server, so those students stayed listed and were put into the next round's teams (even while they were in Practice).
  - Fix: presence check-ins. Every request from a student's class-game screen (join, lobby/results polls, submit) refreshes a cache key `seen:CODE:id` lasting `PRESENCE_TTL_SEC` (30 s, `server/Config.js`). The teacher's lobby list, the student "x players in the room" count and team forming only include students whose key still exists. `startGame_` and `newRound_` remove anyone who has gone quiet. If they come back to the class-game screen, it re-joins by itself.
  - During a round nobody polls, so presence is not checked while status is `playing`.
  - Student app: a fresh page load (e.g. reload) calls `leaveRoom` straight away, since a loaded page always opens on the menu.
  - Start is refused with "No students are in the room right now." if nobody is on the class-game screen.
- **Teacher picks the number of teams** (Individual, 2–8 teams; `TEAM_COUNTS` in `js/config.js`) instead of players per team. A line under the choice shows e.g. "25 students → 6 teams of 4–5". Sizes still differ by at most 1; asking for more teams than students gives one per team. The server still accepts the old `teamSize` field in case a cached teacher page sends it.
- `game.teamSize` replaced by `game.teamCount` + `game.individual`.

## v6 changes (26 Oct 2026, Haydn's requests)
- **Trophy cabinet** (new file `server/Trophies.js`; screen in `js/student.js` → `showCabinet`; styles at the bottom of `css/style.css`).
  - Every player on the winning (rank 1) team of a class round gets the same trophy, chosen at random from `CONFIG.TROPHIES` (28 Greek-myth `[emoji, name]` pairs), never the same emoji as the previous round in that room (`room.lastTrophy`). Only players who sent in a result get it; a team with 0 correct gets none. Practice gives no trophies.
  - Stored inside each student's profile JSON as `profile.cab = { wk, fav, items[] }`, so a class round still writes the sheet once. Trophy = `{ id, e, n, op, team, t }`.
  - Win screen: the winner panel shows "Prize: <trophy>" on every screen (teacher too); the winning team's iPads also get a big "You won a trophy!" panel (`Celebrate.results`, `o.me.trophy`).
  - Cabinet: menu button **🏆 Trophy cabinet**. Big top shelf = favourite; shelves of 5 below, newest first, at least 2 shelves always drawn. Tap a trophy → `setFavourite` → it moves to the top shelf and the old favourite goes back on the shelves (sorted by date).
  - Weekly clear: trophy week = Sunday 00:00 Perth (`trophyWeek_`, separate from the Monday dust week). Clearing is lazy: whenever the cabinet is read or changed and the week number differs, the shelves are emptied and the favourite kept. No time trigger needed.
  - Shelves capped at `TROPHY_SHELF_MAX` (60) per week, oldest dropped.
  - Gold: any emoji is tinted gold by the `.trophy` CSS filter (sepia + saturate + hue-rotate + glow).
- **Teacher Passwords page** (`🔑 Passwords` in the teacher header, `showPasswords` in `js/teacher.js`): pick a student from a drop-down → Reset password → confirm. New teacher-only action `studentPasswords` (names + hasPassword, never the passwords; reads the sheet fresh so the list is right straight after a reset). Students without a password are marked "(no password yet)" and the button stays disabled for them. The old per-row button on Class levels still works.
- README: rules table updated (fluent = 1 attempt; trophies), demo instructions corrected (config.js holds the real URL; demo students create their own passwords).

## v7 changes (26 Oct 2026, Haydn's requests)
- **Play again from the results screen** (`playAgain_` in `server/Rooms.js`, action `playAgain`, panel in `drawResults` in `js/teacher.js`).
  - Drop-downs: Operation, Time, Teams. Teams = "Same teams (N teams)" / "Same as last round (individual play)", or "New: individual play / 2–8 teams".
  - Starts the next round straight away with everyone still on the class-game screen (presence check, same as Start). Students don't re-enter anything: their results screen keeps polling and goes straight into the countdown (no change needed in `js/student.js`). `PLAY_AGAIN_DELAY_MS` = 10 s (results-screen polls are every 4–5 s, so it's a little longer than the 8 s lobby start).
  - Same teams: same names/colours and members. Anyone who left drops out (an emptied team disappears); anyone new joins one of the smallest teams, whichever keeps team averages most even (individual rounds: newcomers get their own code name). If nobody from last round is left, new teams of the same kind are made. Levels are always worked out fresh for the chosen operation.
  - Pressing Play again twice doesn't start two rounds. From the lobby it is refused (Start is used there). "Back to lobby" keeps the old behaviour.
  - The Teams choice is remembered on the teacher's computer (`againTeams` in localStorage). Operation and time default to last round's.
- **Team balancing rewritten** (`formTeams_`, `improveTeams_`, `placeNewcomers_` in `server/Rooms.js`; `expectedTime_` in `server/Fluency.js`).
  - Each player's expected time = their average seconds-per-correct at THEIR OWN current level for the chosen operation (students on different levels mix freely). Team value = average of its players. Goal = lowest standard deviation of the team values.
  - Was: balanced on 1/time ("rate"), one snake draft + swaps. Now: balances the times themselves (Haydn's definition), tries `BALANCE_RESTARTS` (40) starting line-ups, and allows moving a player from a bigger to a smaller team as well as swaps. Sizes still differ by at most 1.
  - Dust is NOT included in the balancing time by default (`BALANCE_ADD_DUST: false`), because it isn't how fast they actually are. Never played their level → cut-off + 1.5 s (unchanged rule; flagged as an estimate).
  - Checked: never less even than the old method (100/100 random classes); in the rare uneven cases (worst seen 0.19 s, about 1 class in 10,000 over 0.1 s; also 0.17 s for 20 students in 8 teams of 2–3) an independent search (simulated annealing) found exactly the same spread, so these are limits of the numbers.
  - Teacher's playing screen shows each team's expected average and the spread (standard deviation), plus how many players' times are estimates. Room stores `assign[id].exp/est`, `team.exp`, `game.balanceSd`.
- **No result → no trophy, no places.** A team with no correct answers gets `rank: null`, is listed last as "No result" with "–" instead of a medal. If no team has a result: "No results this round", no trophy, no confetti. Personal `avgTime` is null when 0 correct (was seconds ÷ 1).
- **Near-ties.** Ranking now compares the unrounded time (`team.avgRaw`). Before, two teams that both rounded to e.g. 4.61 s were split on points even if one was really faster. Screens show a 3rd/4th… decimal place for any teams whose times would otherwise look the same (up to 6; `Celebrate.decimals`). Exactly equal time AND points → shared place; if that's 1st, every tied team gets the trophy ("A tie on Olympus!"). Exactly equal time but different points → placed on points, with a "same time · placed on points" note.
- Tests: 110 checks (`node tests/run-tests.js`), including Play again (same/new/individual), no-result rounds, 2-decimal ties, exact ties and balancing quality. Also run end to end in a browser (demo mode, 12 simulated students, 3 rounds).

## Assumptions to confirm with Haydn
- Winner = lowest team average time per correct answer (as specified). Points are shown but only used as a tie-break. Switch with `RANK_BY`.
- Wrong answer penalty −5, correct +10 (values not specified).
- Current level = lowest non-fluent level, so dust on an earlier level pulls the student back to it.
- Practice results count towards the profile.
- Default cut-off 3 s for every operation until changed.
- Single-digit numbers use 1–9 (not 0) in Addition L1–2 and Subtraction L1.
- Team-count choices go up to 8 (`TEAM_COUNTS`); presence timeout 30 s.
- Trophies (v6): a winning-team member whose result never arrived (e.g. flat iPad) gets no trophy; the favourite stays on the top shelf week after week until the student picks a different one; the shelves clear at the very start of Sunday (00:00), so trophies won on a Sunday sit on the shelves until the following Sunday.
- v7: balancing ignores dust (`BALANCE_ADD_DUST`); "Same teams" keeps sizes as they are after people leave (e.g. 4, 4, 2), only newcomers are evened out; a full tie (same time and points) shares 1st place and every tied team gets the trophy.

## Ideas not built yet
- Placement test for new students (otherwise everyone starts at Level 1 and must play each level once to move up).
- Per-level cut-offs (e.g. 5D+5D addition needs more time than 2D+2D).
- Teacher "student detail" view with per-level history from the Attempts sheet.
- Multiple simultaneous classes (would need room codes).
- If live in-game leaderboards are ever wanted, Firebase Realtime Database would suit better than Apps Script polling.
- Better estimate for a level a student has never played (currently cut-off + 1.5 s), e.g. a short placement round.
