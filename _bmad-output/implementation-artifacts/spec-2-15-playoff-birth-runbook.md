---
title: 'Story 2.15 — The 2027 playoff birth runbook'
type: 'chore'
created: '2026-10-06'
status: 'done'
baseline_commit: 'd9fc182f12b3472ae05e670b50da36dd2805f6be'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-retro-2026-10-06.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Since Story 2.13 the scheduled `espn` feed completes a stored pending series but never creates one. It admits Final **and** Game 7 only (`_bmad-output/specs/spec-2-13-espn-feed-adapter/SPEC.md:69`), and `plan.ts:425-438` refuses a birth from a game-7-only source. Every 2027 series that reaches 3–3 must therefore be born by hand through `--source=manual_csv`, inside the game-6 → game-7 window. No runbook says so (retro finding R1). The only operator text is a parenthetical at `pipeline-inseason.yml:180`. The owner-owed item F2 still expects the scheduled run to birth (`drill-2-7-results.md:62`, `deferred-work.md:552`).

**Approach:** Write a step-by-step playoff runbook, correct F2 in both places, and add a dated bracket to the epic goal (`epics.md:253`) leaving the frozen sentence intact. Docs only; no code changes. The owner approves the runbook's wording before the story is marked done.

**Decisions (owner, 2026-10-06, at planning):**
- The runbook lives at **`docs/PLAYOFF_RUNBOOK.md`**, beside `CURRENT_DATA_MODEL.md`. `series_manual.csv`'s header comment points at it.
- The full spec is kept at about 1,800 tokens. The five scenarios are the runbook's content, so they are not split out.
- **Added at implementation (owner, 2026-10-06):** the build found that `manual-csv.test.ts:66-74` requires the committed CSV to be empty. Playoff rows therefore redden the gate and the `pre-push` hook. The owner chose to **relax the test in a new story, 2.17**, over a scratch-CSV procedure. This story stays docs only: the runbook states the red gate as the state until 2.17 lands, and points at it.

## Boundaries & Constraints

**Always:**
- Every command and file the runbook names must exist exactly as written: `series_manual.csv`'s columns and slot rule (team_a = game 1's home team), `teams.abbreviation` codes (`NYK`, not ESPN's `NY`), and the canonical round labels (`First Round`, `Conference Semifinals`, `Conference Finals`, `NBA Finals`).
- Each runbook claim about runner behaviour traces to code or to a recorded measurement.
- `epics.md` brackets are dated and leave frozen text intact. Because `epics.md` is edited, `epic-2-context.md` gets a re-check note in the same commit, so the next `bmad-build` does not see it as stale and regenerate it.

**Never:**
- No change to code, workflows, migrations or tests. No live run or fetch by the agent. No edit to `series_manual.csv`'s data rows (comment lines only, if at all).
- No re-decision of the owner's 2026-10-04 call that births are curated. Automating births is a separate course correction, if ever.

## I/O & Edge-Case Matrix

These are the runbook's scenarios. Each is verified against the runner.

| Scenario | State | Runbook says | Basis |
|---|---|---|---|
| Series reaches 3–3 | Game 6 final, no stored row | Add games 1–6 to the CSV, dry-run, read `BIRTH`, run for real, check Active Series before Game 7 tips | `plan.ts:439-457` |
| Birth late: Game 7 already played | No stored row | The scheduled run goes red ("no stored pending row"). Add games 1–7, and one `manual_csv` run births and completes | `plan.ts:433-438`, `:443-455` |
| After ESPN completes the series | Archived row; CSV holds games 1–6 | Append the Game 7 row exactly as played, or remove the series' rows. Left as is, the next `manual_csv` run fails | Measured 2026-10-06 against an in-memory sink: 1–6 only → exit 2; 1–7 → skip; removed → empty plan |
| Game 7 missed by the feed | Run red or cancelled on that date | Existing recovery: append Game 7 and run `manual_csv` | `pipeline-inseason.yml:175-187` |
| Offseason | Playoffs over | Return the CSV to header-only | `series_manual.csv:17-21` |

</frozen-after-approval>

## Code Map

- `supabase/scripts/pipeline/data/series_manual.csv:1-21`: column contract and the "header-only outside a window" rule. The runbook cites these and does not restate them.
- `supabase/scripts/pipeline/data/series_manual.example.csv:9-16`: the worked shape. Its 2027 row uses `Western Conference First Round`, a non-canonical label (allowed, since `round` is free text). The runbook prescribes the canonical four.
- `supabase/scripts/pipeline/adapters/espn.ts:488-490`: each morning's run log names every excluded game-6 Final ("game 6 of 7"). That is the runbook's cue to check whether a series stands 3–3.
- `supabase/scripts/pipeline/plan.ts:425-457`: the game-7-only refusal, and births with a follow-up.
- `.github/workflows/pipeline-inseason.yml:150-187`: the dispatch inputs (`source`, `dry_run`) and the missed-Game-7 recovery copy. These are the two ways to run: locally with `.env`, or by pushing the CSV and dispatching with `source=manual_csv`.
- `_bmad-output/implementation-artifacts/drill-2-7-results.md:62` (F2 row) and `deferred-work.md:552` (F2 entry): correct "born by the scheduled run" to "curated".
- `_bmad-output/planning-artifacts/epics.md:253`: the epic goal sentence that gets the dated bracket.
- `_bmad-output/implementation-artifacts/epic-2-context.md`: the header re-check note only.

## Tasks & Acceptance

**Execution:**
- [x] `docs/PLAYOFF_RUNBOOK.md` (new). Write it: when to act, the CSV rows, dry-run, read the plan, real run, confirm on `/predict` and Home, then the after-completion and offseason steps, with the five matrix scenarios.
- [x] `series_manual.csv`: one comment line pointing at the runbook.
- [x] `drill-2-7-results.md:62`, `deferred-work.md:552`: correct F2, dated.
- [x] `epics.md:253`: a dated bracket stating that completions are automated and births are curated (owner call 2026-10-04).
- [x] `epic-2-context.md`: header re-check note.
- [x] `sprint-status.yaml`: `2-15` status transitions.

### Review Findings (external pass, 2026-10-06)

Four fresh-context layers (blind hunter, edge case hunter, verification gap, acceptance auditor) on the scoped diff `d9fc182..e7ba090`. Every claim re-verified against both the baseline tree and current HEAD (`4eec447`), because Stories 2.17 (`f26b148`) and 2.18 (`4eec447`) both rewrote `docs/PLAYOFF_RUNBOOK.md` after this story landed — findings already fixed at HEAD are rejected below, not filed.

- [x] [Review][Patch][Applied] No recovery path for a birth that landed green but wrong — **owner call 2026-10-06: document the direct-table procedure in the runbook** (option 1). `docs/PLAYOFF_RUNBOOK.md` gains a "The birth landed but it is wrong" section: correct the CSV rows first, then repair production through the dashboard SQL editor (the app's anon role cannot write, and agents never run production writes), then re-run `manual_csv`. Two schema facts the section must carry, both verified this pass: `series_game_scores.series_id` and `predictions.series_id` are both `REFERENCES series(id) ON DELETE CASCADE` (`00005:43`, `:72`), so deleting a series erases any fan predictions made on it — therefore an in-place `UPDATE` of the six score rows is the preferred repair, and a delete-and-re-birth is for a wrong *pair*; and `series_game_scores` has no CHECK tying `winner_team_id` to the scores (`00005:51-54` cover only `game_number` 1..7, non-negative scores and `home_team_id <> away_team_id`; the consistency is asserted inside the `00015` RPCs and by `00016`'s apply-time guards, never as a live constraint), so a hand-edited score row must set that row's `winner_team_id` too. If the repair removed an archived series' winner, finish with `run.ts --refresh-insights`, because no winner landed to trigger it. [`docs/PLAYOFF_RUNBOOK.md` steps 4–5]
- [x] [Review][Patch][Applied] June-24 hand-recovery boundary is one day late — `docs/PLAYOFF_RUNBOOK.md:112` says a Game 7 "played on June 24 or later" has no scheduled run that reads it, but `pipeline-offseason.yml` carries cron `30 7 25 6 *` (pinned at `tests/pipeline/workflows.test.ts:191`), runs `--source=espn` (`:98`), and its own header says "the June 25 run here reads June 24 with no alarm: it finalizes a Game 7 played that late". The hand-recovery edge is June 25+. The intro (`:3`) and the "Who does what" table (`:13`) name only the inseason file as the completer, so the June-25 edge run is invisible in the runbook. [blind-hunter + edge-case-hunter + acceptance-auditor]
- [x] [Review][Patch][Applied] "A dispatched run is safe" overstates the concurrency guarantee — `docs/PLAYOFF_RUNBOOK.md:35` (and `:134`) assert a dispatch "queues behind a scheduled run", but `pipeline-inseason.yml:99-105` documents "The queue is ONE slot deep: GitHub keeps a single pending run per group, so a third arrival cancels the pending one, and a cancelled run files no issue. Do not dispatch while a run is both running and pending." The runbook's check (`gh run list … --status in_progress`) detects *running*, never *running-and-pending*, and never lists `queued`/`waiting`, so a silently cancelled birth dispatch writes nothing and alerts nobody. [edge-case-hunter + acceptance-auditor + blind-hunter]
- [x] [Review][Patch][Applied] The go/no-go line hinges on a skip reason no test pins — `docs/PLAYOFF_RUNBOOK.md:86` requires `SKIP … already pending with identical games 1–6`, emitted at `supabase/scripts/pipeline/plan.ts:470`; a repo-wide search for that string matches only `plan.ts`, the runbook and this spec. Its sibling in the same bullet (`already archived with identical games 1–7`) is asserted verbatim at `tests/pipeline/plan.test.ts:407`. Rewording `plan.ts:470` keeps the gate green and makes the runbook's checklist unmatchable mid-window. Fix: one `expect(plan.skips[0].reason).toBe(…)` in the existing re-run case, mirroring `:407`. [verification-gap]
- [x] [Review][Patch][Applied] No source-of-truth guidance for the six games' home teams — `docs/PLAYOFF_RUNBOOK.md:52` says "`home_team` is the team that actually hosted that game" and stops there. The repo's standing rule (`docs/CURRENT_DATA_MODEL.md` § Story 2.8 status, AGENTS.md) is that for archived series `home_team_id` names the `team_a` slot, not a venue, at games 1–6 — so reading the home side off `/historical` or the app's own matchup is wrong by construction. The runbook should name a valid source (the feed's box scores) and forbid the app's archive. [blind-hunter]
- [x] [Review][Patch][Applied] `README.md` docs index omits the runbook — `README.md:157-158` lists CHANGELOG and CURRENT_DATA_MODEL; `docs/PLAYOFF_RUNBOOK.md` appears in no repo-facing index (only the `series_manual.csv` comment line, `epic-2-context.md:27` and `epics.md`). [blind-hunter]
- [x] [Review][Patch][Applied] The example file teaches the label the runbook forbids — `series_manual.example.csv:32-37` uses `Western Conference First Round`, and `series_manual.csv:21` sends the operator to that file "for the row shape and cadence", while `docs/PLAYOFF_RUNBOOK.md:53` prescribes the four canonical labels. Since Story 2.17 the gate rejects the non-canonical label (`tests/pipeline/manual-csv.test.ts:92`), so copying the example now turns the gate red. One clarifying line in the runbook or the example's comment block settles it. [blind-hunter]
- [x] [Review][Patch][Applied] Bare line-number citations in the runbook have drifted — it cites `pipeline-inseason.yml:84-86` for the concurrency group (now `:99-106`), `:60-75` for the dispatch inputs (now `:78-97`) and `:175-187` for the recovery text (now `:201`/`:245`); `espn.ts:479-494` moved with Story 2.18's backfill. Accurate at this story's baseline, wrong for an April reader. Fix: cite symbols/comments rather than line numbers. [edge-case-hunter + blind-hunter]
- [x] [Review][Defer] Same-day reversals left this story's downstream text stale — `drill-2-7-results.md:62` and `deferred-work.md:552` (F2, still reading "the real `espn` feed's first write is therefore the completion only"), `epics.md:253` bracket (still "Births are curated by owner call 2026-10-04 … added by hand"), and `epic-2-context.md` (visible Goal at `:7` untouched, its caveat living only in the line-3 HTML comment; Story 2.15 bullet at `:27` "births are curated", and `:79` still describing Story 2.18 as "Detection and alert only"). Correct as built; superseded by Story 2.18 (`4eec447`), which updated the runbook and its own story section but swept none of these — deferred: belongs to 2.18's review, not this diff. [blind-hunter + edge-case-hunter + verification-gap]

**Rejected (verified false or not worth fixing):**

- `--csv=<path>` scratch file never offered — **false**: the owner chose the 2.17 relax over a scratch-CSV procedure (Decisions, this spec), and HEAD commits the rows, so the working-tree hazard it answers no longer exists.
- "Nothing pins the runbook's verifiable claims" — **false**: `workflows.test.ts:111,191` pin all five pipeline cron lines, and `run.test.ts`/`plan.test.ts`/`espn-adapter.test.ts` pin the quoted plan, dry-run, birth and exclusion lines. The one genuinely unpinned string is filed above.
- Curated-birth premise / "nothing alerts" / red-gate caveat / Route B workaround / five-scenario list all stale — **false at HEAD**: `f26b148` and `4eec447` rewrote `docs/PLAYOFF_RUNBOOK.md` (`:5`, `:11-13`, `:23`, `:30-34`, `:41`, `:118-122`, `:128-134`).
- F2's correction duplicated across two docs — **false**: this spec's Code Map requires correcting F2 in both of its homes.
- `series_manual.csv:7` "(npm test enforces it)" contradicts the runbook — **false at HEAD**: `manual-csv.test.ts:92` now rejects non-canonical round labels.
- Failure-issue recovery text recommends a blocked route with no runbook pointer — **false**: `pipeline-inseason.yml:245` names `docs/PLAYOFF_RUNBOOK.md (the fallback procedure)`.
- Route B omits that `pipeline-offseason.yml` offers no `source` input — **false**: Route B already dispatches `pipeline-inseason.yml` only.
- No documented path for a team code missing from the seed (expansion/relocation) — **low, rejected**: no 2027 playoff entrant is known to lack a seeded `teams.abbreviation`, and both the runner and the gate name the missing code loudly.
- "a re-run or a dispatch for that date" implies ESPN reads an arbitrary date — **false at HEAD**: runbook `:119` now scopes it ("for that date; the next morning's re-read ignores Game 7s").
- `sprint-status.yaml` and this spec's narrative about the red gate are stale — **false**: dated audit trail, kept by the repo's addendum/spec lifecycle rule.
- Spec frontmatter `status: 'done'`, `review_loop_iteration: 0`, empty Spec Change Log — **rejected**: the fix edits the spec under review, and the owner approval the AC requires did land (`80e23e5`).
- Repo-wide grep needle is phrase-locked (informational) — **false**: the auditor records no AC violated; all three named files are corrected.

**Acceptance Criteria:**
- Given the runbook, when each command in it is compared against `run.ts`'s `SUPPORTED_FLAGS` and the workflow inputs, then every flag and input exists as written.
- Given the five matrix scenarios, when the runbook is read, then each has an action and the signal that confirms it worked.
- Given `epics.md`, `drill-2-7-results.md` and `deferred-work.md`, when searched for "born by the scheduled run", then no uncorrected claim remains.
- Given the change, when `npm run gate` runs, then it exits 0. The owner then approves the runbook's wording.

## Verification

**Commands:**
- `npm run gate`: expected exit 0 (docs-only, but `manual-csv.test.ts` reads the live CSV).
- `grep -rn "born by the scheduled run" _bmad-output`: expected only dated, corrected text.

## Implementation Notes

- **Gate interaction found while building (not in the matrix):** `tests/pipeline/manual-csv.test.ts:66-74` asserts the committed `series_manual.csv` has zero data rows. During the playoff window, therefore, `npm test` / `npm run gate` / the `master` pre-push hook / CI are red for as long as any series row is in the file, and the "push the CSV and dispatch" route (`pipeline-inseason.yml:175-187`) cannot reach `master` through the hook. Code/tests/workflows are out of scope here (Boundaries · Never), so the runbook states it and recommends the local `.env` run; dispatching from a non-`master` ref is named as unexercised. Owner decision needed on whether a follow-up relaxes that test or moves the playoff rows elsewhere.
- **Scenario outputs re-measured 2026-10-06** with `runPipeline` against an in-memory sink (scratchpad script, not committed; no database, no network): birth dry-run/real/re-run (`BIRTH` → `wrote birth` → `SKIP already pending`), games 1–4 only (exit 2, "null winner with game set {1,2,3,4}"), 4–2 (exit 2, "not a certified 3–3"), archived + CSV 1–6 (exit 2), archived + CSV 1–7 (skip), archived + wrong Game 7 venue (exit 2), rows removed (empty plan), late birth 1–7 (birth + follow-up + insights refresh), ESPN code `NY` in the CSV (exit 2, unknown abbreviation). The runbook quotes these strings. The plan label prints team **ids** (`(2027, team 1 vs 2)`), not codes, and the runbook says so.
- **Late-birth side effect, from code:** the "no stored pending row" refusal is thrown inside `planPipeline` before any write, so it aborts the whole scheduled run, and any other Game 7 on that date also misses completion. The runbook's scenario 2 says to recover them in the same `manual_csv` run.

**Orchestrator verification after the implementation subagent returned (2026-10-06):**
- **The red-gate finding.** The subagent found that `manual-csv.test.ts:66-74` requires the committed CSV to be empty, which the spec had not anticipated. Confirmed: the test reads the working-tree file and comes from Story 2.3 (`5b518ef`). The owner chose a new story, so **Story 2.17** is registered in `epics.md` and `sprint-status.yaml`. The runbook's gate bullet and Route B now state the pre-2.17 state and point at 2.17, and `epic-2-context.md`'s re-check note names it.
- **Matrix test audit.** These are runbook scenarios, so each is mapped to the runner test that pins the behaviour it describes:
  - **Row 1, birth:** `run.test.ts` "runs the worked fixture … two births", and `plan.test.ts` "certified 3-3, new: births one series row".
  - **Row 2, late birth:** `plan.test.ts` "game 7 with no stored pair is refused" plus "a finished series nobody saw at 3-3: births the six, then follows up".
  - **Row 3, after completion:** **not pinned**. `plan.test.ts:187` diverges at game 6 of a seven-game source, not a 1–6-only source. Its exact shape was measured with the real planner against an in-memory sink, but the frozen block forbids test changes here, so the pin is added to **Story 2.17's ACs**, the story that edits these tests anyway.
  - **Row 4, missed Game 7:** `plan.test.ts` "game 7 arrives on a pending row: one completion", plus `run.test.ts` "a completion with NO birth follow-up anywhere".
  - **Row 5, offseason:** `manual-csv.test.ts` "the committed operator file … carries no data rows".
  - Every cited test ran green in the gate below.
- **Shared-file caution.** A parallel owner session (the external review of Story 2.14) left uncommitted entries in `deferred-work.md` and `spec-2-14-…md`. This story's commit stages only its own F2 hunk of `deferred-work.md`, and does not touch `spec-2-14`.

## Spec Change Log

## Review Triage Log

**Pass 1 (2026-10-06).** Three fresh-context subagents on the same model level read a scoped diff (27 KB): the runbook, the CSV comment, F2 in both files, `epics.md`, `epic-2-context.md` and `sprint-status.yaml`. The parallel session's `spec-2-14` and `deferred-work.md` hunks were excluded. Blind Hunter used floor N = 6 and returned 12 findings, Edge Case Hunter 7, and Verification Gap none. There was no intent gap or bad spec, so no loopback. The patches went back to the step-3 implementation subagent.

| ID | Finding | Verdict | Route and evidence |
|---|---|---|---|
| B1 | Route B: `dry_run` defaults to `false` and `source` to `espn`, so an unticked dispatch writes to production | medium | **patch**. Confirmed at `pipeline-inseason.yml:60-75`. |
| B2 | "First scheduled slot 2027-04-12" is the offseason run; the inseason run first fires 04-16 | low | **patch**. The crons are `pipeline-offseason.yml:30` and `pipeline-inseason.yml:55`. |
| B3 / E2 | The inseason cron ends June 24 (reading June 23), so a later Game 7 is never completed automatically | low | **patch**. Confirmed at `pipeline-inseason.yml:57`. |
| B4 | Until 2.17, route A's rows live only in an uncommitted working tree | low | **patch**. The runbook gains a keep-a-copy line. |
| B5 | AGENTS.md should carry "never empty the CSV during a window" and list the runbook | medium | **defer**. Real: an agent reacting to the red gate would empty the file. But the fix edits an agent-context file, which the step's rules route to defer. |
| B6 | The failure-issue recovery text recommends the route the hook blocks | low | **reject**. The runbook already flags it, and Story 2.17 makes "push the CSV and dispatch" true, so the text becomes correct rather than needing an edit. |
| B7 | Story 2.17's "valid" check covers single rows only | low | **patch** to the 2.17 AC: run the plan assertions and the canonical round labels too. |
| B8 | The context note says the bullets are "above", but they are below | low | **patch**. |
| B9 / E3 | No alert at 3–3, and the backstop line never prints if Game 6 wasn't Final at 07:30 | low | **patch**. The runbook states both limits (`espn.ts:479-485`, one date per run). |
| B10 / E4 | The concurrency warning gives no way to check | low | **patch**. Add `gh run list … --status in_progress`; the `pipeline-writes` group is at `:84-86`. |
| B11 | Scenario 5 lacks its precondition and reset mechanics | low | **patch**. |
| B12 | F2's title still credits the first write to the feed | low | **patch**. The correction says which re-read checks which writer. |
| B13 | The diff omits the spec, so the ACs can't be checked from it | false | By design: step 4 sends the spec to the edge-case layer as `claims_file`, and that layer checked the ACs and falsified none. |
| E1 | A mistyped late-birth Game 7 turns the next scheduled run red | low | **patch**. Real per `plan.ts:508-533`: the scheduled feed re-reads the date against the archived row. |
| E5 | The go/no-go rule omits the archived `SKIP` line | low | **patch**. |
| E6 | The quoted mismatch error belongs to the Game-7 path only | low | **patch**. Quote both (`plan.ts:481`, `:503-504`). |
| E7 | The COMPLETE line prints scores, not teams | low | **patch**. Confirmed in `run.ts` `describePlan`. |
