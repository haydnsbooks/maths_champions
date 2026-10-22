# ⚡ Trials of Olympus

A class multiplayer maths fluency game. Every student answers questions at **their own level**, teams are balanced from past results, and each game builds a per-student profile of fluency levels (with weekly "dust").

- **Front end:** plain HTML/JS on **GitHub Pages** (free). Works on the teacher PC and student iPads (Safari).
- **Back end:** **Google Apps Script web app** bound to a **Google Sheet** (free).
- **Try it with no setup:** `js/config.js` ships with `API_URL: 'DEMO'`. Open `teacher.html` in one tab and `index.html` in a few other tabs of the same browser — the real server code runs in the page against a fake sheet. Teacher password `changeme`, student passwords `demo`.

---

## 1. Setup (about 15 minutes, once)

### A. Google Sheet + Apps Script
1. Create a new Google Sheet (e.g. "Trials of Olympus Data").
2. **Extensions → Apps Script.** Delete the starter code.
3. Create five script files and paste in the matching file from `server/`:
   `Config.gs`, `Store.gs`, `Fluency.gs`, `Rooms.gs`, `Code.gs` (copy the contents of `server/Config.js` into `Config.gs`, etc.).
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
1. Teacher page → **Open room**. Students log in → **🏁 Class game** (no code to type; there is one room at a time).
2. Teacher picks operation, team size (or individual) and time → **Start**.
3. Server reads everyone's profile, finds each student's current level for that operation, and forms balanced teams. Each iPad shows its team name + emoji only (teammates stay secret) and an 8-second countdown.
4. Students play. **No server traffic during play** — questions are generated on the iPad.
5. When time is up, each iPad sends one small result. The teacher screen finishes the round (when all results are in, or after 15 s), which ranks teams, writes every attempt to the sheet in **one write**, and updates profiles.
6. Grand celebration on every screen. Teacher can tick **Show team members**, then **Another round** (students stay in the room) or **Close room**.

## 3. The rules (as built)
| Rule | Implementation | Where to change |
|---|---|---|
| Points | +10 correct, −5 wrong (shown during play) | `server/Config.js` `POINTS_*` |
| Winner | Lowest **team average time per correct answer** = total seconds played ÷ total correct (wrong answers cost time, so they count against you) | `RANK_BY` (`'avgTime'` or `'points'`) |
| Attempt time | seconds played ÷ correct answers | `server/Fluency.js` |
| Fluency time | average of the **3 most recent attempts** at that level + dust | `RECENT_ATTEMPTS` |
| Fluent | ≥ 3 attempts **and** fluency time ≤ cut-off | `MIN_ATTEMPTS_FOR_FLUENCY`, cut-offs on teacher page |
| Dust | +0.5 s for every new week (Monday 00:00 Perth time) since that level was last played; playing the level clears it | `DUST_PER_WEEK`, `TZ_OFFSET_HOURS` |
| Current level | **lowest** level that is not fluent — so a dusty earlier level pulls a student back to revise it | `opSummary_` in `server/Fluency.js` |
| Team balancing | expected speed = fluency time at current level (or cut-off + 1.5 s if never played); snake draft then best swaps; sizes differ by at most 1 | `formTeams_` in `server/Rooms.js` |
| Short games | games under 20 s (e.g. joined very late) aren't saved to profiles | `MIN_ATTEMPT_SECONDS` |
| Practice | student picks operation → level; always 1 minute; saved to their profile (leaving early saves nothing) | `PRACTICE_SECONDS` in `js/config.js` |
| Question order | small levels (e.g. a times table) are a shuffled deck: every fact once before any repeat, never the same fact twice in a row, wrong answers come back later in the deck. Huge levels are random with no repeats in a game | `Levels.deck` in `js/levels.js` |
| Leaving | ✕ Leave on every game and countdown screen. Leaving a class round mid-game removes the student from that round so the teacher isn't kept waiting | `leaveRoom` in `server/Code.js` |

## 4. Sheet traffic (why this won't overload Google)
- Rooms, logins and lobby polling live in Apps Script **CacheService** (memory), not the sheet. Students/Settings/Profiles are cached too.
- The sheet is written **once per class round** and **once per practice game**.
- Lobby polling: every 3 s + random 0–1 s per iPad (cache read only). Nothing polls during play.
- Google's published limits relevant here: **30 simultaneous executions per user** (the web app runs as you, so all students' requests share this), **6 min per execution**, and CacheService entries are capped at **100 KB per value** and **6 hours** maximum life ([quotas](https://developers.google.com/apps-script/guides/services/quotas), [Cache](https://developers.google.com/apps-script/reference/cache/cache)). I haven't measured how long these requests take on Google's servers, so do a trial with the whole class; if you ever see "too many simultaneous invocations" errors, raise `LOBBY_POLL_MS` in `js/config.js`.
- Rooms expire 6 hours after the last change (CacheService maximum).

## 5. File map — where to change things
```
index.html            Student app page (loads the js files below)
teacher.html          Teacher app page
css/style.css         All styling: Mount Olympus theme (colours + fonts at the top)
js/config.js          API URL, polling speeds, time/team choices        ← browser settings
js/levels.js          Level list, themed names + emoji, question decks  ← add/edit/rename levels here
js/api.js             The only code that talks to the server (+ demo mode)
js/game.js            Timed question screen + number pad + countdown
js/celebrate.js       Results/podium + confetti (shared)
js/student.js         Student screens: login, menu, practice, my levels, class game
js/teacher.js         Teacher screens: room, start, results, cut-offs, class levels
js/demo/mock-gas.js   Fake Google services for demo + tests (NOT for Apps Script)
server/Config.js      Server rules: points, fluency, dust, timing, team names ← server settings
server/Code.js        API router: list of actions
server/Store.js       All Sheet/Cache reads & writes, setup()
server/Fluency.js     Levels, dust, fluency, profiles
server/Rooms.js       Rooms, team forming, results ranking
tests/run-tests.js    `node tests/run-tests.js` — checks 2,000 questions per level against the spec + a full simulated class game
```
**Adding a level:** add it in `js/levels.js`, update `LEVEL_COUNTS` in `server/Config.js` (and the spec arrays in `tests/run-tests.js`), run the tests, redeploy. Add new levels at the **end** of a list — profiles store levels by number, so inserting in the middle shifts students' history.

**Adding a server action:** add it to `ACTIONS` in `server/Code.js`, call it with `API.call('name', {...})`.

## 6. Data
- **Attempts** sheet: one row per game per student (timestamp, id, name, mode, op, level, correct, wrong, seconds, avgTime, points, room) — use it for reporting/filters.
- **Profiles** sheet: one JSON cell per student (last 3 times per level). Don't edit by hand unless you're sure; run *Refresh cached data* afterwards.
- Students create their own password on first log-in (at least 4 characters, not case-sensitive) and are told to write it down. Passwords are stored in plain text in your private sheet so you can look one up if a student forgets; or use **Reset password** on the teacher's Class levels page so they create a new one (their levels are kept). Because a blank password can be claimed by whoever picks that name first, have everyone do their first log-in together in class.
