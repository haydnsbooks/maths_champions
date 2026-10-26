# ⚡ Trials of Olympus

A class multiplayer maths fluency game. Every student answers questions at **their own level**, teams are balanced from past results, and each game builds a per-student profile of fluency levels (with weekly "dust"). Winning teams earn golden trophies for each player's **trophy cabinet**.

- **Front end:** plain HTML/JS on **GitHub Pages** (free). Works on the teacher PC and student iPads (Safari).
- **Back end:** **Google Apps Script web app** bound to a **Google Sheet** (free).
- **Try it with no setup:** set `API_URL: 'DEMO'` in `js/config.js`. Open `teacher.html` in one tab and `index.html` in a few other tabs of the same browser — the real server code runs in the page against a fake sheet. Teacher password `changeme`; each demo student creates their own password.

---

## 1. Setup (about 15 minutes, once)

### A. Google Sheet + Apps Script
1. Create a new Google Sheet (e.g. "Trials of Olympus Data").
2. **Extensions → Apps Script.** Delete the starter code.
3. Open the file **Code.gs**, delete everything in it, and paste in the **whole** of `apps-script/Code.gs` from this folder (it contains all the server code in one file). Press **Save**.
4. Project Settings (⚙️) → tick **Show "appsscript.json"** → paste `server/appsscript.json` into it.
5. In the editor choose the function **`setup`** and press **Run**. Approve the permissions. This creates the sheets **Students, Profiles, Attempts, Settings**.
6. In the sheet:
   - **Settings:** change `teacherPassword` from `changeme`. Set the four `cutoff_…` values (or do it later from the teacher page).
   - **Students:** one row per student — `id` (any unique short code, e.g. `s01`; never change it later), `name`, `password` (**leave blank**: each student creates their own the first time they log in), `active` (TRUE/FALSE).
7. **Deploy → New deployment → Web app.** Execute as: **Me**. Who has access: **Anyone**. Deploy and copy the URL ending in `/exec`.

> After editing the Students or Settings sheet by hand, use the sheet menu **Fluency Game → Refresh cached data** (or wait 5 minutes).
> After changing any server code: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** (the URL stays the same).

### B. GitHub Pages
1. Create a GitHub repository and upload everything in this folder (the `server/` and `tests/` folders can be included; they do no harm).
2. Edit `js/config.js` → set `API_URL` to your `/exec` URL.
3. Repository **Settings → Pages → Deploy from branch → main / root**.
4. Share one link with everyone: `https://<you>.github.io/<repo>/`. Students log in there; you tap **Teacher login** at the bottom of the same screen (or bookmark `…/teacher.html` to skip a step).
   Tip: on iPads, Share → **Add to Home Screen** makes it open full-screen.

---

## 2. How a class game runs
1. Teacher page → **Open room**. Students log in → **⚔️ Class game** (no code to type; there is one room at a time).
2. Teacher picks operation, number of teams (or individual) and time → **Start**.
3. Server reads everyone's profile, finds each student's current level for that operation, and forms balanced teams. Each iPad shows its team name + emoji only (teammates stay secret) and an 8-second countdown.
4. Students play. **No server traffic during play** — questions are generated on the iPad.
5. When time is up, each iPad sends one small result. The teacher screen finishes the round (when all results are in, or after 15 s), which ranks teams, writes every attempt to the sheet in **one write**, updates profiles and hands out the winning team's trophy.
6. Grand celebration on every screen, including the round's prize trophy. Winning players also see **"You won a trophy!"**. Teacher can tick **Show team members**, then **Another round** (students stay in the room) or **Close room**.

## 3. The rules (as built)
| Rule | Implementation | Where to change |
|---|---|---|
| Points | +10 correct, −5 wrong (shown during play) | `server/Config.js` `POINTS_*` |
| Winner | Lowest **team average time per correct answer** = total seconds played ÷ total correct (wrong answers cost time, so they count against you) | `RANK_BY` (`'avgTime'` or `'points'`) |
| Attempt time | seconds played ÷ correct answers | `server/Fluency.js` |
| Fluency time | average of the **3 most recent attempts** at that level + dust | `RECENT_ATTEMPTS` |
| Fluent | ≥ 1 attempt **and** fluency time ≤ cut-off | `MIN_ATTEMPTS_FOR_FLUENCY`, cut-offs on teacher page |
| Dust | +0.5 s for every new week (Monday 00:00 Perth time) since that level was last played; playing the level clears it | `DUST_PER_WEEK`, `TZ_OFFSET_HOURS` |
| Current level | **lowest** level that is not fluent — so a dusty earlier level pulls a student back to revise it | `opSummary_` in `server/Fluency.js` |
| Team balancing | expected speed = fluency time at current level (or cut-off + 1.5 s if never played); snake draft then best swaps; sizes differ by at most 1 | `formTeams_` in `server/Rooms.js` |
| Short games | games under 20 s (e.g. joined very late) aren't saved to profiles | `MIN_ATTEMPT_SECONDS` |
| Practice | student picks operation → level; always 1 minute; saved to their profile (leaving early saves nothing) | `PRACTICE_SECONDS` in `js/config.js` |
| Question order | small levels (e.g. a times table) are a shuffled deck: every fact once before any repeat, never the same fact twice in a row, wrong answers come back later in the deck. Huge levels are random with no repeats in a game | `Levels.deck` in `js/levels.js` |
| Leaving | ✕ Leave on every game and countdown screen. Leaving a class round mid-game removes the student from that round so the teacher isn't kept waiting | `leaveRoom` in `server/Code.js` |
| Trophies | every player on the winning team of a class round who sent in a result gets the same trophy (random from a Greek-myth list, never the same as the previous round's). Practice gives no trophies | `TROPHIES` in `server/Config.js` |
| Trophy cabinet | **🏆 Trophy cabinet** on the student menu. Tap a trophy → it goes on the big top shelf as the favourite (the old favourite goes back on a shelf). Every **Sunday 00:00 Perth time** the shelves are emptied; the favourite stays. Up to 60 trophies a week | `server/Trophies.js`, `TROPHY_SHELF_MAX` |
| Gold trophies | any emoji is drawn gold by a CSS filter, so the list can use any emoji | `.trophy` in `css/style.css` |

## 4. Sheet traffic (why this won't overload Google)
- Rooms, logins and lobby polling live in Apps Script **CacheService** (memory), not the sheet. Students/Settings/Profiles are cached too.
- The sheet is written **once per class round**, **once per practice game** and **once each time a student picks a favourite trophy**. Trophies live inside each student's profile, so they add no extra sheet writes to a class round.
- Lobby polling: every 3 s + random 0–1 s per iPad (cache read only). Nothing polls during play.
- Google's published limits relevant here: **30 simultaneous executions per user** (the web app runs as you, so all students' requests share this), **6 min per execution**, and CacheService entries are capped at **100 KB per value** and **6 hours** maximum life ([quotas](https://developers.google.com/apps-script/guides/services/quotas), [Cache](https://developers.google.com/apps-script/reference/cache/cache)). I haven't measured how long these requests take on Google's servers, so do a trial with the whole class; if you ever see "too many simultaneous invocations" errors, raise `LOBBY_POLL_MS` in `js/config.js`.
- Rooms expire 6 hours after the last change (CacheService maximum).

## 5. File map — where to change things
```
index.html            Student app page (loads the js files below)
teacher.html          Teacher app page
css/style.css         All styling: Mount Olympus theme (colours + fonts at the top), trophy cabinet at the bottom
css/pad.css           Number pad + Flip button
js/config.js          API URL, polling speeds, time/team choices        ← browser settings
js/levels.js          Level list, themed names + emoji, question decks  ← add/edit/rename levels here
js/api.js             The only code that talks to the server (+ demo mode)
js/game.js            Timed question screen + number pad + countdown
js/celebrate.js       Results/podium, "You won a trophy!", confetti (shared)
js/student.js         Student screens: login, menu, practice, my levels, trophy cabinet, class game
js/teacher.js         Teacher screens: room, start, results, cut-offs, class levels, passwords
js/demo/mock-gas.js   Fake Google services for demo + tests (NOT for Apps Script)
apps-script/Code.gs   ALL server code in one file — this is what you paste into Apps Script (built from server/)
server/Config.js      Server rules: points, fluency, dust, timing, team names, trophy list ← server settings
server/Code.js        API router: list of actions
server/Store.js       All Sheet/Cache reads & writes, setup()
server/Fluency.js     Levels, dust, fluency, profiles
server/Trophies.js    Trophy cabinet: awarding, favourite, Sunday clear-out
server/Rooms.js       Rooms, team forming, results ranking, trophy for the winning team
tests/run-tests.js    `node tests/run-tests.js` — checks 2,000 questions per level against the spec + a full simulated class game + trophies
```
**Adding a level:** add it in `js/levels.js`, update `LEVEL_COUNTS` in `server/Config.js` (and the spec arrays in `tests/run-tests.js`), run the tests, redeploy. Add new levels at the **end** of a list — profiles store levels by number, so inserting in the middle shifts students' history.

**Adding or renaming a trophy:** edit `TROPHIES` in `server/Config.js` (`['emoji', 'Name']`), rebuild Code.gs, redeploy. Trophies already in cabinets keep their old emoji and name.

**Adding a server action:** add it to `ACTIONS` in `server/Code.js`, call it with `API.call('name', {...})`.

**After changing anything in `server/`:** run `node tools/build-apps-script.js` to rebuild `apps-script/Code.gs`, paste that into Apps Script, Save, and deploy a new version.

## 6. Data
- **Attempts** sheet: one row per game per student (timestamp, id, name, mode, op, level, correct, wrong, seconds, avgTime, points, room) — use it for reporting/filters.
- **Profiles** sheet: one JSON cell per student (last 3 times per level, plus the trophy cabinet under `"cab"`). Don't edit by hand unless you're sure; run *Refresh cached data* afterwards.
- Students create their own password on first log-in (at least 4 characters, not case-sensitive) and are told to write it down. Passwords are stored in plain text in your private sheet so you can look one up if a student forgets. To reset one: teacher page → **🔑 Passwords** → choose the student → **Reset password** (or the Reset password button on Class levels). They create a new one at their next log-in; their levels and trophies are kept. Because a blank password can be claimed by whoever picks that name first, have everyone do their first log-in together in class.
