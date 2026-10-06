# Playoff runbook — the fallback for a 3–3 series the automation could not add

The operator procedure for the NBA playoff window. The first scheduled slot is the offseason run on 2027-04-12 (`pipeline-offseason.yml`), and the inseason cron first fires on 2027-04-16 (`30 7 16-30 4 *`). The inseason cron's last day is June 24, and `pipeline-offseason.yml` carries a second edge run on June 25 (`30 7 25 6 *`) that reads June 24 — so **the last game date any scheduled run reads is June 24** (both files' cron lines are pinned at `tests/pipeline/workflows.test.ts`).

**Since Story 2.18 (2026-10-06) this is the fallback, not the routine.** The scheduled run now puts a series that reached 3–3 into Active Series by itself. Completing a series from its Game 7 is unchanged: the run reads its own date only for that, so a Game 7 that a red or cancelled morning missed is still recovered by hand (scenario 4). You act only when the automation says it could not: the cue is a **"Pipeline birth needed"** GitHub issue (step 1).

## Who does what

| Write | Who | How |
|---|---|---|
| **Birth**: a series reaches 3–3 and appears in Active Series as a pending Game 7 | **The scheduled run** (`--source=espn`), the morning after Game 6 | Automatic: it sees a Final Game 6 at 3–3 whose pair is not stored, finds games 1–5 by walking back one date at a time, and births the six games |
| **Birth, fallback** | **The owner, by hand**, only when a "Pipeline birth needed" issue names the series | Games 1–6 go into `supabase/scripts/pipeline/data/series_manual.csv`, then a `--source=manual_csv` run (steps 2–5) |
| **Completion**: Game 7 is final, the winner is filled and the series moves to the archive | **The scheduled run** (`pipeline-inseason.yml`, 07:30 UTC daily Apr 16 → Jun 24, plus the `pipeline-offseason.yml` edge run on Jun 25, `--source=espn`) | Automatic, the morning after Game 7, from that run's own date only. If that run was red or cancelled, recover by hand (scenario 4) |

How the automatic birth works, so you can read its log (`supabase/scripts/pipeline/adapters/espn.ts`, "Story 2.18"):

- Each run reads the previous US-Eastern date, as before, and **also re-reads the date before that, for births only**. A Game 6 at 3–3 that one run missed (a late finish, or a red run) is caught by the next morning's run. Game 7s on the re-read date are ignored (owner decision 2026-10-06, Story 2.18 review): a completion comes only from the run's own date, so a red run always points at that date.
- A **Final Game 6** whose `competitions[0].series` stands 3–3 and not completed is a birth candidate. Wins are read per team, not by position. A pair already stored (in either slot order) is skipped.
- Games 1–5 are found by **walking back single dates from Game 6**, at most 21 dates. Each must be Final, between the same pair, and numbered by its headline. Each game's own series standing must agree with the running wins from the scores.
- The six games go through the same planner and `pipeline_birth_series` RPC as a curated birth: a certified 3–3, and `team_a` = Game 1's home team. The log prints `espn: birth source assembled — <year> <A>–<B> …` and a `BIRTH` plan line.
- One run spends at most **25 extra date requests and about 3 minutes** on the re-read and the walks. Anything unfinished is alerted, never silently dropped.

**When it cannot**, nothing is born for that series. The run prints a line starting `BIRTH NEEDED:` and the workflow opens that day's **"Pipeline birth needed <UTC date>"** issue (a same-day re-run comments on it). Typical causes: a game of the series missing from the feed within 21 dates, a date ESPN would not answer, a `series` field missing or disagreeing with the scores, the budget spent. The alert never fails the run: completions and the insights refresh still happen, and the exit code is unchanged.

**The window is short.** A pending Game 7 can be shown from the final buzzer of Game 6 until Game 7 tips off, which is usually one or two days. When the alert fires, do the fallback birth inside that window.

## Before you start

- **Use the local run (route A: the commands in steps 3–4).** The runner reads the CSV from your working tree. It needs `.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (`supabase/scripts/pipeline/run.ts`, the `ENV_SERVICE_ROLE_KEY` constant), and Node 24 (the workflow pins `24.x`; native type stripping needs Node ≥ 22.18). **Pass `--source` and `--dry-run` explicitly, every time.** With neither flag the runner falls back to the `manual_csv` floor (`port.ts`, `DEFAULT_ADAPTER_NAME`) and dry-run is opt-in (`run.ts`, `--dry-run`), so a bare `node --env-file=.env supabase/scripts/pipeline/run.ts` writes whatever rows the committed CSV holds — during a playoff that is a real birth, with no plan read first. Until Story 2.17 the committed file was required to be empty, which made that bare command harmless by construction; it no longer is.
- **Commit the rows: the gate checks them.** Since Story 2.17, `npm test` (and so `npm run gate`, the `pre-push` hook on `master` and CI) checks that the committed `series_manual.csv` is **valid**. Every code must be a real `teams.abbreviation`, every series must be one the runner would accept **against an empty table** (a certified 3–3, or a valid seven-game shape), and every round must be one of the four canonical labels (`tests/pipeline/manual-csv.test.ts`, "the committed operator file"). A typo such as ESPN's `NY` for `NYK` therefore turns the gate red before anything runs. Header-only is the offseason state, not a requirement.
  - **What the gate cannot see.** It never reads production, so it cannot tell that a series in the file has since been completed by the feed: scenario 3's "append Game 7 or remove the rows" stays a manual step, and only your `manual_csv` dry-run catches it. It also does not check `year`, and it accepts any of the 59 seeded codes, defunct franchises included.
  - **The hook checks your working tree, not the commit.** Commit first, then push from a clean tree (`git status` shows nothing), so the rows the hook validated are the rows you push.
  - **Commit and push after every edit.** The pushed commit is your backup (a local commit does not survive a lost machine), and CI validates it again: scenario 4 needs each series' games 1–6 exactly as they were born.
  - **Never empty the file while a series in it is still pending.** The recovery steps below need those rows. If the gate goes red during the playoffs, the fix is the row the failure names, not an empty file.
- **Do not run by hand while a scheduled run is running** (07:30 UTC). Check first, for both files, and require nothing running **or** waiting to start: `gh run list --workflow pipeline-inseason.yml -L 5 --json status,conclusion` and `gh run list --workflow pipeline-offseason.yml -L 5 --json status,conclusion` must each show no `in_progress`, `queued` or `waiting`. A laptop run joins no group (Epic 2 retro, finding W2), so a run that is merely *queued* still starts seconds later and interleaves with yours. A dispatched run (route B) does join the `pipeline-writes` group — but that queue is **ONE slot deep**, exactly as the workflow's own concurrency comment says: GitHub keeps a single pending run per group, so a third arrival cancels the pending one, and **a cancelled run files no issue**. So a dispatch is safer than a laptop run, not free: do not dispatch while a run is both running and pending, and confirm your dispatch actually ran (`gh run list --workflow pipeline-inseason.yml -L 3`) rather than being cancelled.

## Step by step: the fallback birth of a series at 3–3

### 1. Spot it

- **Primary cue: a "Pipeline birth needed <UTC date>" issue.** It opens the morning the run could not birth a series, and every line of its body starts `BIRTH NEEDED:` and names the series as `<year> <A>–<B>` with the reason. The title is dated, so each day's alerts open an issue of their own with their own lines, and two open issues can name the same series on consecutive days. Only a re-run on the same day comments ("Still red: <run link>") instead; open that run's log and search for `BIRTH NEEDED:`. Close each issue once every series it names is pending or archived.
- **Backstop cue:** the game result. If a Game 6 ended 3–3 and the series is not in Active Series by the morning after the next scheduled run (the re-read is the second chance), treat it as an alert even if no issue opened.
- Not every alert needs a birth. A line about a date that could not be read says only that something on that date **may** have been missed: check that date's games yourself.

The codes in the alert are **ESPN codes**, and six differ from the CSV's: `NY`→`NYK`, `SA`→`SAS`, `GS`→`GSW`, `NO`→`NOP`, `UTAH`→`UTA`, `WSH`→`WAS` (`supabase/migrations/00018_teams_espn_code.sql:70-90`).

### 2. Add games 1–6 to the CSV

Append six rows to `supabase/scripts/pipeline/data/series_manual.csv`, one per game, under the header. The column contract is in the file's own comment block (`:4-11`). The rules that bite:

- **Team codes are `teams.abbreviation`**, never the ESPN code: `NYK`, not `NY`. An unknown code stops the run naming the line (`unknown team abbreviation "NY" — not in the teams table`).
- **`home_team` is the team that actually hosted that game.** Game 1's home team becomes `team_a` (AD-5; `manualCsv.ts`, the game-1 slot rule). Take the venue from the league's own box score for that date (the feed this product reads, or the published series page) — **never from this app's own pages**. For archived series the app's `series_game_scores.home_team_id` names the stored `team_a`/`team_b` slot, not a venue, at games 1–6 (`docs/CURRENT_DATA_MODEL.md` § "Story 2.8 status": only a game-7 row of an `NBA`/`BAA` series is a real venue), so reading the home side off `/historical` or a matchup card puts the fixture backwards.
- **`round` uses one of the four canonical labels**, spelled exactly: `First Round`, `Conference Semifinals`, `Conference Finals`, `NBA Finals` (`adapters/rounds.ts`, `CANONICAL_ROUND_LABELS`). The gate rejects any other label since Story 2.17 (`tests/pipeline/manual-csv.test.ts`, "rejects a non-canonical round label"), so a typo turns `npm run gate` red before you push. Use the same label on all six rows; mixed labels are refused. **`series_manual.example.csv` beside the file now spells all four labels canonically**, and a test runs it through the same gate (`tests/pipeline/manual-csv.test.ts`, "is valid operator data"), so its round label is safe to copy as well as its row shape and cadence.
- **Games 1–6 only, split 3–3.** Fewer games are refused ("impossible shape — null winner with game set {1,2,3,4}"), and so is a 4–2 ("not a certified 3–3 — games 1–6 split 4-2") (`plan.ts:274-287`).
- `year` is the calendar year (2027), not a season id.

Shape (illustration only; these are not real results):

```
year,round,game_number,home_team,away_team,home_score,away_score
2027,First Round,1,NYK,BOS,108,101
2027,First Round,2,NYK,BOS,97,104
2027,First Round,3,BOS,NYK,112,99
2027,First Round,4,BOS,NYK,95,102
2027,First Round,5,NYK,BOS,110,103
2027,First Round,6,BOS,NYK,106,100
```

Series that are already pending stay in the file. Each one re-plans as a `SKIP`, so several series can sit in the CSV together.

### 3. Dry-run and read the plan

```
node --env-file=.env supabase/scripts/pipeline/run.ts --source=manual_csv --dry-run
```

Expected output for one new series:

```
pipeline adapter=manual_csv (dry-run — no writes will be issued)
BIRTH     (2027, team <id> vs <id>): one series row + 6 score rows
plan: 1 birth(s), 0 completion(s), 0 skip(s) (6 score row(s) planned)
dry-run: 0 rows written
```

- **Go on only if** there is exactly one `BIRTH` line per new series, a `SKIP … already pending with identical games 1–6` line for each series you added earlier and that is still pending, a `SKIP … already archived with identical games 1–7` line for each completed series you kept (scenario 3), and the last line is `dry-run: 0 rows written`.
- The label shows team **ids**, not codes. Game 1's home team is the first id.
- **If you get no `dry-run: 0 rows written` line, nothing was a dry run.** Check how you typed the flag. The runner refuses any token outside its flag list (`run.ts`, `SUPPORTED_FLAGS`), including `-dry-run`, `dry-run` and an em-dash `—dry-run`.
- In a dry-run, any `pipeline failed: …` line exits 2 and has written nothing. It names the offending row, so fix the CSV and dry-run again.

### 4. Run for real

```
node --env-file=.env supabase/scripts/pipeline/run.ts --source=manual_csv
```

Success looks like `wrote birth (2027, team <id> vs <id>) as series <uuid>`, then `applied: 1 birth(s), …`, then exit 0. A birth fills no winner, so no insights-refresh line prints (`run.ts`, the `winnerFilled` trigger).

### 5. Confirm before Game 7 tips off

Reload the live site (https://ujsolon.github.io/predictgame7/):

- **Home (`/`)** lists the series as a link reading `<A> vs <B> — Game 7 pending`.
- **Predict (`/predict`)**: the series sits under **Current Game 7s** at the top of the series picker.

Both read `series` where `winner_team_id IS NULL`, so the series shows as soon as the write lands. No deploy is involved.

### 6. Game 7: nothing to do

The morning after Game 7, the scheduled `espn` run completes the series from the feed. Confirm it in that run's log: a `COMPLETE` line and an `insights cache refreshed: …` line. On the site, the series leaves Current Game 7s and appears in `/historical`. Then do the after-completion step below (scenario 3).

**Exception: a Game 7 played on June 25 or later.** The inseason cron's last day is June 24 and that run reads June 23 (`30 7 1-24 6 *`); the `pipeline-offseason.yml` edge run on June 25 (`30 7 25 6 *`) reads June 24 and finalizes a Game 7 played that late with no alarm. No scheduled run reads June 25 or later, so complete such a series by hand with scenario 4.

## The five scenarios

| Scenario | What you do | The signal it worked |
|---|---|---|
| **1. Series reaches 3–3** (Game 6 final, no stored row) | **Automatic** since Story 2.18. Fallback only when a "Pipeline birth needed" issue names it: steps 1–5 above, games 1–6 into the CSV, dry-run, read `BIRTH`, run for real, check Active Series before Game 7 (`plan.ts:439-457`) | Dry-run shows one `BIRTH`; the real run prints `wrote birth … as series <uuid>`; Home and `/predict` list the series |
| **2. Late birth: Game 7 already played** (no stored row) | **Automatic when the run sees both games**: a Game 6 on the re-read date plus its Game 7 on the run date births seven games at once (`BIRTH … — birth at certified 3–3 immediately followed by the completion`). **Otherwise** the run leaves that Game 7 out of the plan and files "Pipeline birth needed" with `Game 7 (…) has no stored row and no birth was assembled for it this run` (since Story 2.18 this is an alert, not a red run, so other completions that day still land). Fallback: add **games 1–7** to the CSV, where Game 7 is the real home team and score. Then dry-run and run `manual_csv` once: one birth plus its Game 7 follow-up (`plan.ts:443-455`). **Afterwards:** an `espn` run that reads that Game 7 date as its own (a re-run or a dispatch for that date; the next morning's re-read ignores Game 7s) meets the now-archived row. It skips only if your CSV's Game 7 home team and score match ESPN's exactly. Otherwise it goes red with `archived on the table and the source disagrees`, and that red aborts every other completion that day. | Dry-run: `BIRTH … — birth at certified 3–3 immediately followed by the completion (game 7 + winner)` with 7 score rows planned. Real run: `wrote birth …`, `wrote completion …`, then `insights cache refreshed: …`. The series goes straight to `/historical`; it was never visible in Active Series, and that window is lost. |
| **3. After the scheduled run completes a series you curated** (archived row; CSV still holds games 1–6). A series the run birthed by itself is not in the CSV and needs nothing here. | **Before the next `manual_csv` run**, either append the Game 7 row **exactly as played** (real home team, real score), or delete that series' rows from the CSV. If left as is, the next `manual_csv` run fails for **every** series in the file: `series <id> is archived on the table and the source disagrees` (exit 2). A Game 7 row with the wrong home team or score fails the same way. | Dry-run shows `SKIP … already archived with identical games 1–7` (if you appended) or no line for that series (if you removed it); exit 0. *Measured 2026-10-06 against an in-memory sink: 1–6 only → exit 2; 1–7 → skip; removed → empty plan.* |
| **4. Game 7 missed by the feed** (series still pending after the morning that should have completed it) | **By hand.** The run completes a series only from its own date, and the re-read of the date before ignores Game 7s (owner decision 2026-10-06, Story 2.18 review), so one red or cancelled morning after a Game 7 drops that game from the automated path. For a series you curated: append that Game 7 row to the CSV (games 1–6 are already there from the birth), dry-run, then run `manual_csv` (the failure issue's "MISSED GAME 7 RECOVERY" text in `pipeline-inseason.yml`). For a series the run birthed by itself, the CSV holds none of its games: add games 1–7 exactly as stored and played, so the plan reads it as the stored games plus Game 7. | Dry-run: `COMPLETE  (2027, team …): append game 7 (<home score>-<away score>) and fill winner_team_id=<id> on series <uuid>`. Real run: `wrote completion …`, then `insights cache refreshed: …`. |
| **5. Offseason** (playoffs over) | **Precondition:** every series in the file is archived. Each one either re-plans as `SKIP … already archived with identical games 1–7` or has been removed. Then delete the data rows so `series_manual.csv` holds only its header and comment lines (`series_manual.csv:17-21`), commit, and push. | A `manual_csv` dry-run prints `plan: 0 birth(s), 0 completion(s), 0 skip(s)`, and `git diff origin/master -- supabase/scripts/pipeline/data/series_manual.csv` prints nothing. |

**Keep each series' rows until it is archived.** Scenario 4 needs games 1–6 in the CSV exactly as they were born. Re-typed rows that differ by a single score fail in one of two ways. With Game 7 appended, the error is `the source's games 1–6 are not the stored ones` (`plan.ts:481`). In a re-plan without Game 7, the error is `the source's games 1–6 differ` (`plan.ts:503-504`).

## The birth landed but it is wrong

A run that exits 0 and prints `wrote birth … as series <uuid>` has written production, and Home and `/predict` show it within a refresh. Nothing here corrects that: the runner never rewrites stored games or an archived outcome (`plan.ts`'s re-plan refusals above), and it has no delete path. This section is the only way out, and it is hand work in the **Supabase dashboard SQL editor** — the app's anon role cannot write, and an agent working in this repo does not run production writes (AGENTS.md, NFR-S1). Take the `series.id` from the run log's `as series <uuid>`, or find it:

```sql
SELECT s.id, s.year, s.round, s.league, s.winner_team_id,
       a.abbreviation AS team_a, b.abbreviation AS team_b
FROM series s
JOIN teams a ON a.id = s.team_a_id
JOIN teams b ON b.id = s.team_b_id
WHERE s.year = 2027
  AND (a.abbreviation, b.abbreviation) IN (('NYK','BOS'), ('BOS','NYK'));
```

Read the seven rows before you touch anything (`winner_team_id` per game is stored, and no CHECK ties it to the scores — `00005` guards only `game_number` 1..7, non-negative scores and `home_team_id <> away_team_id`):

```sql
SELECT g.game_number, ha.abbreviation AS home, g.home_score,
       aa.abbreviation AS away, g.away_score, g.winner_team_id
FROM series_game_scores g
JOIN teams ha ON ha.id = g.home_team_id
JOIN teams aa ON aa.id = g.away_team_id
WHERE g.series_id = '<uuid>' ORDER BY g.game_number;
```

**Repair in place — the default.** Wrong score, wrong venue side, or wrong label on a series whose two teams are right. Fix the score rows, and set each row's `winner_team_id` with it, because a score edit alone leaves a row whose stated winner disagrees with its scores:

```sql
UPDATE series_game_scores
SET home_score = 106, away_score = 100, winner_team_id = (SELECT id FROM teams WHERE abbreviation = 'BOS')
WHERE series_id = '<uuid>' AND game_number = 6;

UPDATE series SET round = 'Conference Semifinals' WHERE id = '<uuid>';  -- a wrong label
```

A wrong venue is both teams and both scores on that row, not the score alone.

**Delete and re-birth — only when the pair itself is wrong** (wrong franchises, or the series should not exist at all). `series_game_scores.series_id` **and** `predictions.series_id` are both `REFERENCES series(id) ON DELETE CASCADE` (`00005:43`, `:72`), so deleting the series erases every prediction recorded on it. That is the cost, and it is why the in-place repair above comes first.

```sql
DELETE FROM series WHERE id = '<uuid>';   -- cascades: its score rows AND its predictions
```

Then correct `series_manual.csv` to the true games — it must agree with the table, since step 3's dry-run compares them — dry-run, and run `manual_csv` (steps 2–5). To recreate a series that had already been completed, put **games 1–7** in the CSV and let one run birth and complete it (scenario 2).

**Finish with the cache.** Insights are computed from archived series' game-7 rows, and a hand edit rewrites neither the cache nor its trigger: `--refresh-insights` fires only when a run fills a winner (`run.ts`, the `winnerFilled` trigger). So after any repair that changed an archived series' winner, its game 7, or that removed a series, run it yourself:

```
node --env-file=.env supabase/scripts/pipeline/run.ts --refresh-insights
```

Green looks like `insights cache refreshed: 3 keys rewritten over <N> NBA/BAA Game 7(s) …`, and the census in that line is how you confirm the repair reached the cards. Never edit `insights_cache` by hand — the RPC is its only writer.

## Route B: dispatch instead of a local run

Use this when you are away from the machine that holds `.env`. The workflow reads the CSV **from the ref it checks out**, so push first. The `manual_csv` leg of this route is exercised: run [`37507206156`](https://github.com/ujsolon/predictgame7/actions/runs/37507206156) (2026-10-06 17:55 UTC, `source=manual_csv`, `dry_run=true`, success on `9535436`) printed `adapter=manual_csv flags=--dry-run`, `plan: 0 birth(s), 0 completion(s), 0 skip(s)` and `dry-run: 0 rows written`. What that run could not cover is a dispatch carrying real playoff rows — the committed CSV was header-only at that ref — so the first 2027 birth is this route's first write.

1. Commit the CSV rows and push to `master`. The `pre-push` hook runs the gate, which validates the rows.
2. Dry-run: `gh workflow run pipeline-inseason.yml -f source=manual_csv -f dry_run=true`. Find the run with `gh run list --workflow pipeline-inseason.yml --event workflow_dispatch -L 1` — without `--event` a scheduled 07:30 run started in the same window prints instead, and you then watch and read someone else's log. Follow it with `gh run watch <id>`, and read the plan with `gh run view <id> --log` (the go/no-go rules under "Step by step → 3. Dry-run and read the plan" apply).
3. Real run: `gh workflow run pipeline-inseason.yml -f source=manual_csv -f dry_run=false`. A dispatch runs on `master` as it is at that moment, so push nothing between the dry run and this one, and check both runs sit on the same commit: `gh run list --workflow pipeline-inseason.yml --event workflow_dispatch -L 2 --json databaseId,headSha,conclusion`. The default `gh run list` output carries no SHA, so it cannot answer this.

**Warning: the dispatch defaults are `dry_run` = false and `source` = `espn`** (`pipeline-inseason.yml`, the `workflow_dispatch` inputs). A dispatch with the dry-run box unticked, or without `-f dry_run=true`, writes to production immediately. Always pass both inputs explicitly. A dispatched run joins the `pipeline-writes` concurrency group, so it queues behind a scheduled run instead of racing it — but that queue holds one pending slot, so a dispatch made while a run is both running and pending gets cancelled and files nothing ("Before you start" above). Confirm the dispatch ran. This is also the route the failure issue's recovery text describes (`pipeline-inseason.yml`, the "MISSED GAME 7 RECOVERY" copy).
