# Playoff runbook — the fallback for a 3–3 series the automation could not add

The operator procedure for the NBA playoff window. The first scheduled slot is the offseason run on 2027-04-12 (`pipeline-offseason.yml`), and the inseason cron first fires on 2027-04-16 (`30 7 16-30 4 *`).

**Since Story 2.18 (2026-10-06) this is the fallback, not the routine.** The scheduled run now puts a series that reached 3–3 into Active Series by itself. Completing a series from its Game 7 is unchanged: the run reads its own date only for that, so a Game 7 that a red or cancelled morning missed is still recovered by hand (scenario 4). You act only when the automation says it could not: the cue is a **"Pipeline birth needed"** GitHub issue (step 1).

## Who does what

| Write | Who | How |
|---|---|---|
| **Birth**: a series reaches 3–3 and appears in Active Series as a pending Game 7 | **The scheduled run** (`--source=espn`), the morning after Game 6 | Automatic: it sees a Final Game 6 at 3–3 whose pair is not stored, finds games 1–5 by walking back one date at a time, and births the six games |
| **Birth, fallback** | **The owner, by hand**, only when a "Pipeline birth needed" issue names the series | Games 1–6 go into `supabase/scripts/pipeline/data/series_manual.csv`, then a `--source=manual_csv` run (steps 2–5) |
| **Completion**: Game 7 is final, the winner is filled and the series moves to the archive | **The scheduled run** (`pipeline-inseason.yml`, 07:30 UTC daily, `--source=espn`) | Automatic, the morning after Game 7, from that run's own date only. If that run was red or cancelled, recover by hand (scenario 4) |

How the automatic birth works, so you can read its log (`supabase/scripts/pipeline/adapters/espn.ts`, "Story 2.18"):

- Each run reads the previous US-Eastern date, as before, and **also re-reads the date before that, for births only**. A Game 6 at 3–3 that one run missed (a late finish, or a red run) is caught by the next morning's run. Game 7s on the re-read date are ignored (owner decision 2026-10-06, Story 2.18 review): a completion comes only from the run's own date, so a red run always points at that date.
- A **Final Game 6** whose `competitions[0].series` stands 3–3 and not completed is a birth candidate. Wins are read per team, not by position. A pair already stored (in either slot order) is skipped.
- Games 1–5 are found by **walking back single dates from Game 6**, at most 21 dates. Each must be Final, between the same pair, and numbered by its headline. Each game's own series standing must agree with the running wins from the scores.
- The six games go through the same planner and `pipeline_birth_series` RPC as a curated birth: a certified 3–3, and `team_a` = Game 1's home team. The log prints `espn: birth source assembled — <year> <A>–<B> …` and a `BIRTH` plan line.
- One run spends at most **25 extra date requests and about 3 minutes** on the re-read and the walks. Anything unfinished is alerted, never silently dropped.

**When it cannot**, nothing is born for that series. The run prints a line starting `BIRTH NEEDED:` and the workflow opens that day's **"Pipeline birth needed <UTC date>"** issue (a same-day re-run comments on it). Typical causes: a game of the series missing from the feed within 21 dates, a date ESPN would not answer, a `series` field missing or disagreeing with the scores, the budget spent. The alert never fails the run: completions and the insights refresh still happen, and the exit code is unchanged.

**The window is short.** A pending Game 7 can be shown from the final buzzer of Game 6 until Game 7 tips off, which is usually one or two days. When the alert fires, do the fallback birth inside that window.

## Before you start

- **Use the local run (route A: the commands in steps 3–4).** The runner reads the CSV from your working tree. It needs `.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (`supabase/scripts/pipeline/run.ts:51-53`), and Node 24 (the workflow pins `24.x`; native type stripping needs Node ≥ 22.18).
- **Commit the rows: the gate checks them.** Since Story 2.17, `npm test` (and so `npm run gate`, the `pre-push` hook on `master` and CI) checks that the committed `series_manual.csv` is **valid**. Every code must be a real `teams.abbreviation`, every series must be one the runner would accept **against an empty table** (a certified 3–3, or a valid seven-game shape), and every round must be one of the four canonical labels (`tests/pipeline/manual-csv.test.ts`, "the committed operator file"). A typo such as ESPN's `NY` for `NYK` therefore turns the gate red before anything runs. Header-only is the offseason state, not a requirement.
  - **What the gate cannot see.** It never reads production, so it cannot tell that a series in the file has since been completed by the feed: scenario 3's "append Game 7 or remove the rows" stays a manual step, and only your `manual_csv` dry-run catches it. It also does not check `year`, and it accepts any of the 59 seeded codes, defunct franchises included.
  - **The hook checks your working tree, not the commit.** Commit first, then push from a clean tree (`git status` shows nothing), so the rows the hook validated are the rows you push.
  - **Commit and push after every edit.** The pushed commit is your backup (a local commit does not survive a lost machine), and CI validates it again: scenario 4 needs each series' games 1–6 exactly as they were born.
  - **Never empty the file while a series in it is still pending.** The recovery steps below need those rows. If the gate goes red during the playoffs, the fix is the row the failure names, not an empty file.
- **Do not run by hand while a scheduled run is running** (07:30 UTC). Check first: `gh run list --workflow pipeline-inseason.yml --status in_progress` and `gh run list --workflow pipeline-offseason.yml --status in_progress` must both list nothing. A dispatched run (route B) is safe, because it joins the `pipeline-writes` concurrency group (`pipeline-inseason.yml:84-86`) and queues behind a scheduled run. A laptop run does not join that group (Epic 2 retro, finding W2).

## Step by step: the fallback birth of a series at 3–3

### 1. Spot it

- **Primary cue: a "Pipeline birth needed <UTC date>" issue.** It opens the morning the run could not birth a series, and every line of its body starts `BIRTH NEEDED:` and names the series as `<year> <A>–<B>` with the reason. The title is dated, so each day's alerts open an issue of their own with their own lines, and two open issues can name the same series on consecutive days. Only a re-run on the same day comments ("Still red: <run link>") instead; open that run's log and search for `BIRTH NEEDED:`. Close each issue once every series it names is pending or archived.
- **Backstop cue:** the game result. If a Game 6 ended 3–3 and the series is not in Active Series by the morning after the next scheduled run (the re-read is the second chance), treat it as an alert even if no issue opened.
- Not every alert needs a birth. A line about a date that could not be read says only that something on that date **may** have been missed: check that date's games yourself.

The codes in the alert are **ESPN codes**, and six differ from the CSV's: `NY`→`NYK`, `SA`→`SAS`, `GS`→`GSW`, `NO`→`NOP`, `UTAH`→`UTA`, `WSH`→`WAS` (`supabase/migrations/00018_teams_espn_code.sql:70-90`).

### 2. Add games 1–6 to the CSV

Append six rows to `supabase/scripts/pipeline/data/series_manual.csv`, one per game, under the header. The column contract is in the file's own comment block (`:4-11`). The rules that bite:

- **Team codes are `teams.abbreviation`**, never the ESPN code: `NYK`, not `NY`. An unknown code stops the run naming the line (`unknown team abbreviation "NY" — not in the teams table`).
- **`home_team` is the team that actually hosted that game.** Game 1's home team becomes `team_a` (AD-5; `manualCsv.ts:162-170`).
- **`round` uses one of the four canonical labels**, spelled exactly: `First Round`, `Conference Semifinals`, `Conference Finals`, `NBA Finals` (`adapters/rounds.ts:28`). The runner accepts any non-empty text, so a typo would be stored and shown. Use the same label on all six rows; mixed labels are refused.
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
- **If you get no `dry-run: 0 rows written` line, nothing was a dry run.** Check how you typed the flag. The runner refuses any token outside its flag list (`run.ts:142-197`), including `-dry-run`, `dry-run` and an em-dash `—dry-run`.
- In a dry-run, any `pipeline failed: …` line exits 2 and has written nothing. It names the offending row, so fix the CSV and dry-run again.

### 4. Run for real

```
node --env-file=.env supabase/scripts/pipeline/run.ts --source=manual_csv
```

Success looks like `wrote birth (2027, team <id> vs <id>) as series <uuid>`, then `applied: 1 birth(s), …`, then exit 0. A birth fills no winner, so no insights-refresh line prints (`run.ts:510`).

### 5. Confirm before Game 7 tips off

Reload the live site (https://ujsolon.github.io/predictgame7/):

- **Home (`/`)** lists the series as a link reading `<A> vs <B> — Game 7 pending`.
- **Predict (`/predict`)**: the series sits under **Current Game 7s** at the top of the series picker.

Both read `series` where `winner_team_id IS NULL`, so the series shows as soon as the write lands. No deploy is involved.

### 6. Game 7: nothing to do

The morning after Game 7, the scheduled `espn` run completes the series from the feed. Confirm it in that run's log: a `COMPLETE` line and an `insights cache refreshed: …` line. On the site, the series leaves Current Game 7s and appears in `/historical`. Then do the after-completion step below (scenario 3).

**Exception: a Game 7 played on June 24 or later.** The inseason cron ends on June 24 and that run reads June 23 (`30 7 1-24 6 *`). No scheduled inseason run reads a later date, so complete such a series by hand with scenario 4.

## The five scenarios

| Scenario | What you do | The signal it worked |
|---|---|---|
| **1. Series reaches 3–3** (Game 6 final, no stored row) | **Automatic** since Story 2.18. Fallback only when a "Pipeline birth needed" issue names it: steps 1–5 above, games 1–6 into the CSV, dry-run, read `BIRTH`, run for real, check Active Series before Game 7 (`plan.ts:439-457`) | Dry-run shows one `BIRTH`; the real run prints `wrote birth … as series <uuid>`; Home and `/predict` list the series |
| **2. Late birth: Game 7 already played** (no stored row) | **Automatic when the run sees both games**: a Game 6 on the re-read date plus its Game 7 on the run date births seven games at once (`BIRTH … — birth at certified 3–3 immediately followed by the completion`). **Otherwise** the run leaves that Game 7 out of the plan and files "Pipeline birth needed" with `Game 7 (…) has no stored row and no birth was assembled for it this run` (since Story 2.18 this is an alert, not a red run, so other completions that day still land). Fallback: add **games 1–7** to the CSV, where Game 7 is the real home team and score. Then dry-run and run `manual_csv` once: one birth plus its Game 7 follow-up (`plan.ts:443-455`). **Afterwards:** an `espn` run that reads that Game 7 date as its own (a re-run or a dispatch for that date; the next morning's re-read ignores Game 7s) meets the now-archived row. It skips only if your CSV's Game 7 home team and score match ESPN's exactly. Otherwise it goes red with `archived on the table and the source disagrees`, and that red aborts every other completion that day. | Dry-run: `BIRTH … — birth at certified 3–3 immediately followed by the completion (game 7 + winner)` with 7 score rows planned. Real run: `wrote birth …`, `wrote completion …`, then `insights cache refreshed: …`. The series goes straight to `/historical`; it was never visible in Active Series, and that window is lost. |
| **3. After the scheduled run completes a series you curated** (archived row; CSV still holds games 1–6). A series the run birthed by itself is not in the CSV and needs nothing here. | **Before the next `manual_csv` run**, either append the Game 7 row **exactly as played** (real home team, real score), or delete that series' rows from the CSV. If left as is, the next `manual_csv` run fails for **every** series in the file: `series <id> is archived on the table and the source disagrees` (exit 2). A Game 7 row with the wrong home team or score fails the same way. | Dry-run shows `SKIP … already archived with identical games 1–7` (if you appended) or no line for that series (if you removed it); exit 0. *Measured 2026-10-06 against an in-memory sink: 1–6 only → exit 2; 1–7 → skip; removed → empty plan.* |
| **4. Game 7 missed by the feed** (series still pending after the morning that should have completed it) | **By hand.** The run completes a series only from its own date, and the re-read of the date before ignores Game 7s (owner decision 2026-10-06, Story 2.18 review), so one red or cancelled morning after a Game 7 drops that game from the automated path. For a series you curated: append that Game 7 row to the CSV (games 1–6 are already there from the birth), dry-run, then run `manual_csv` (the failure issue's "MISSED GAME 7 RECOVERY" text in `pipeline-inseason.yml`). For a series the run birthed by itself, the CSV holds none of its games: add games 1–7 exactly as stored and played, so the plan reads it as the stored games plus Game 7. | Dry-run: `COMPLETE  (2027, team …): append game 7 (<home score>-<away score>) and fill winner_team_id=<id> on series <uuid>`. Real run: `wrote completion …`, then `insights cache refreshed: …`. |
| **5. Offseason** (playoffs over) | **Precondition:** every series in the file is archived. Each one either re-plans as `SKIP … already archived with identical games 1–7` or has been removed. Then delete the data rows so `series_manual.csv` holds only its header and comment lines (`series_manual.csv:17-21`), commit, and push. | A `manual_csv` dry-run prints `plan: 0 birth(s), 0 completion(s), 0 skip(s)`, and `git diff origin/master -- supabase/scripts/pipeline/data/series_manual.csv` prints nothing. |

**Keep each series' rows until it is archived.** Scenario 4 needs games 1–6 in the CSV exactly as they were born. Re-typed rows that differ by a single score fail in one of two ways. With Game 7 appended, the error is `the source's games 1–6 are not the stored ones` (`plan.ts:481`). In a re-plan without Game 7, the error is `the source's games 1–6 differ` (`plan.ts:503-504`).

## Route B: dispatch instead of a local run

Use this when you are away from the machine that holds `.env`. The workflow reads the CSV **from the ref it checks out**, so push first.

1. Commit the CSV rows and push to `master`. The `pre-push` hook runs the gate, which validates the rows.
2. Dry-run: `gh workflow run pipeline-inseason.yml -f source=manual_csv -f dry_run=true`. Find the run with `gh run list --workflow pipeline-inseason.yml -L 1`, follow it with `gh run watch <id>`, and read the plan with `gh run view <id> --log` (step 3's go/no-go rules apply).
3. Real run: `gh workflow run pipeline-inseason.yml -f source=manual_csv -f dry_run=false`. A dispatch runs on `master` as it is at that moment, so push nothing between the dry run and this one, and check that `gh run list` shows both runs on the same commit.

**Warning: the dispatch defaults are `dry_run` = false and `source` = `espn`** (`pipeline-inseason.yml:60-75`). A dispatch with the dry-run box unticked, or without `-f dry_run=true`, writes to production immediately. Always pass both inputs explicitly. A dispatched run joins the `pipeline-writes` concurrency group, so it queues behind a scheduled run instead of racing it. This is also the route the failure issue's recovery text (`pipeline-inseason.yml:175-187`, "push the CSV edit and dispatch") describes.
