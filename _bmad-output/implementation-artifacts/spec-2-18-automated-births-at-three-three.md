---
title: 'Story 2.18 — The scheduled run births a series at 3–3'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: 'b1adf0e383af554a43997718748d111afee73c5c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-06.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/specs/spec-2-13-espn-feed-adapter/payload-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The scheduled `espn` run completes a stored pending series from its Game 7 but never creates one. Admission is Final and Game 7 (`espn.ts:487-494`), and `plan.ts:425-438` refuses a one-game birth. So every 3–3 series must be born by hand inside a one-to-two-day window. The owner decided to automate this (`sprint-change-proposal-2026-10-06.md`, option B), reversing the 2026-10-04 call. A spike measured the approach first: Game 6's `competitions[0].series` reads `"Series tied 3-3"`, and games 1–5 were found by walking back single dates, in 13 requests per series with 0 errors, for DEN–LAC and GS–HOU 2025.

**Approach:** Implement `epics.md` Story 2.18's ACs. The `espn` adapter:
- reads the run's date plus the previous date; **[amended 2026-10-06, owner at review: the previous date for Game 6 births only]**
- detects a Final Game 6 at 3–3 whose pair is not stored. Wins are read **per team** by joining `series.competitors[].id` to the event's `competitors[].team.id`, never by array position: GS–HOU read `[0,1]` after Game 1. If the headline is unreadable, a Final event whose series field shows 3–3 and not completed still counts as a Game 6, and a headline that disagrees raises an alert, never silence;
- backfills games 1–5 by single-date requests (bounded at 21, with dates shared within the run);
- hands the planner an ordinary six-game source (seven if Game 7 is also seen), so births go through the existing RPC and every AD-4/AD-5 check;
- before handing over, cross-checks each backfilled game's own `series` standing against the running wins computed from the scores, refusing the birth (with an alert) on any mismatch.

From backfill dates the adapter takes **only** the target pair's games 1–5. Every other event on those pages is ignored: never admitted, completed, backfilled from, or counted.

`feedSeriesCount` stays the run's own date. A backfill that cannot certify a 3–3 raises a distinct "birth needed" alert and never blocks the run. Any fetch error, drift or timeout on a re-read or backfill date also becomes an alert and never aborts the run; only the primary date keeps today's failure behaviour. The re-read plus backfill is bounded per run: at most 25 extra requests and about 3 minutes of wall-clock time, well under the 10-minute step limit. Series left unfinished when the budget runs out are alerted. The runbook becomes the fallback.

## Boundaries & Constraints

**Always:**
- Single-date requests only, through the existing retry posture. No range parameter, no calendar logic.
- `feedSeriesCount` comes from the primary date's events only; re-read and backfill events never add to it.
- Identity goes through `teams.espn_code` only. Births carry `team_a` = Game 1's home team. The planner's assertions (3–3, slot rule, identity) and the RPCs' guards run unchanged.
- A failed backfill writes nothing for that series and is loud (alert). It never aborts other series, completions or the insights refresh, and never changes the exit code.
- Re-read and backfill fetches are isolated: their errors, drift and timeouts become alerts, never a thrown run. The budget (≤25 extra requests, ~3 min) holds per run.
- Backfill pages contribute only the target pair's games 1–5.
- Tests are hermetic: an injected fetch serves the committed fixtures, and no agent fetches ESPN.

**Never:**
- No change to the RPCs, migrations, crons, Edge Functions, or the `plan.ts` decision rules.
- No new event names or analytics.
- No birth from fewer than six certified games.

## I/O & Edge-Case Matrix

| Scenario | State / input (fixtures) | Expected |
|---|---|---|
| Birth | Run at 2025-05-02 07:30Z (primary `20250501`: DEN–LAC G6 at 3–3), nothing stored | One birth, DEN–LAC 2025, six games, `team_a` = DEN; the report names the birth |
| Shared backfill + re-read | Run at 2025-05-03 07:30Z (primary `20250502`: GS–HOU G6; re-read `20250501`: DEN–LAC G6), nothing stored | Two births; each fixture date fetched at most once in the run |
| Already stored | DEN–LAC pending row stored | No backfill requests for that pair; skip |
| Not 3–3 | Game 6 at 4–2 (completed), or a Game 5 | No backfill, no birth, no alert |
| Backfill gap | One of games 1–5 unreachable within 21 dates (stub returns empty) | No birth; a "birth needed" alert naming DEN–LAC; exit 0; other work proceeds |
| Missing `series` | Final G6 with no `competitions[0].series` | No birth; the alert names the missing field |
| Previous-date G7 | Stored pending pair; its Game 7 is on the re-read date | **[Amended 2026-10-06, owner at review]** Ignored: counted in the re-read note, never planned, no completion and no alert. Completions come from the run's own date only |
| Alarm independence | Primary date empty, re-read date has games | `feedSeriesCount` 0, so `--require-feed` stays red |
| Dry-run | Any of the above with `--dry-run` | Same detection, backfill and plan printed; 0 writes |
| Per-team wins (C2) | GS–HOU, whose `series.competitors` order differs from home/away (`[0,1]` after Game 1) | Detection and progression read wins through `team.id`; a position-swap mutation goes red |
| Headline unreadable (C3) | Final G6 with its headline removed, series 3–3 not completed | Treated as Game 6 and backfilled; a headline naming a different game number raises an alert |
| Progression mismatch (C4) | One backfilled game's own `series` standing disagrees with the running score wins | No birth; the alert names the series and the game |
| Budget and isolation (C1) | A backfill date that throws, or more than 25 extra requests needed | Primary-date completions still land; the unfinished series is alerted; exit 0 |
| Backfill page noise (C5) | A backfill date that also carries another pair's Final Game 7 (or 3–3 Game 6) | Ignored: no completion, no second backfill, not counted |

</frozen-after-approval>

## Code Map

- **`supabase/scripts/pipeline/adapters/espn.ts`:**
  - `deriveRequestDate` `:203`; `scoreboardUrl` `:235+`; `readEvent`/`eventsOf` `~:360-411`.
  - `selectEvents` `:419-531`: the admission rule is at `:487-494`, `feedSeriesCount` at `:432`, the report at `:525-530`.
  - `buildFeed` `:539-585`: single request plus retry; reuse it per date.
  - `createEspnAdapter` `:592-623`: memoised feed.
  - Today `ParsedEvent` `:143-163` does not keep `competitions[0].series`. Extend it with per-team wins, joined from `series.competitors[].id` to `competitors[].team.id` (measured: the id is ESPN's numeric team id, e.g. `"7"`), plus `completed`. Handle a field missing on a Final Game 6 loudly. `buildFeed`'s terminal throw (`:584`) must be caught for re-read and backfill dates.
- **`supabase/scripts/pipeline/port.ts`:**
  - `AdapterDeps` `:100-125` gains an optional stored-pair check, so the adapter skips backfilling pairs already on the table.
  - `AdapterRunReport` gains an `alerts: string[]` channel, separate from `notes`.
- **`supabase/scripts/pipeline/run.ts`:**
  - `readCurrent` currently runs after the adapter fetch (`~:415`). Read it before constructing the adapter, pass the stored-pair check, and reuse the same rows for planning (one read).
  - Print the alerts with a stable prefix (e.g. `BIRTH NEEDED:`) after the report lines. The exit code is unchanged.
- **`supabase/scripts/pipeline/plan.ts`:** untouched. A six-game null-winner source births (`:439-457`); seven games birth plus follow-up; the game-7-only path stays for stored pending pairs. One pair must not mix the two slot orientations (`groupSourceRows` `:341` keys on the ordered pair), so a backfilled pair's rows all use the `team_a` = Game 1 home orientation.
- **`.github/workflows/pipeline-inseason.yml` (and offseason, if it runs `espn`) plus `.github/actions/notify-failure`:** add a step after the run that opens or comments a distinct issue, e.g. "Pipeline: birth needed", when the log carries the alert prefix. It must be distinguishable from the failure issue. `tests/pipeline/workflows.test.ts` pins are updated; crons are unchanged.
- **Tests:**
  - `tests/pipeline/espn-adapter.test.ts`: an injected fetch maps `dates=` to `tests/pipeline/fixtures/espn-backfill-2025/scoreboard-YYYYMMDD.json`, with existing harnesses at `~:812`. ESPN codes `DEN`, `LAC`, `GS`, `HOU` must resolve in the test's team table.
  - The 2025-05-03 Game 7 fixture `tests/pipeline/fixtures/espn-scoreboard-20250503-game7.json` already exists.
- **Fixtures:** `tests/pipeline/fixtures/espn-backfill-2025/` (14 payloads plus `spike-probe.mjs.txt`) is untracked and committed by this story, with a provenance README.
- **Docs:**
  - `docs/PLAYOFF_RUNBOOK.md` becomes the fallback. Step 1's cue is the alert; the scenarios for "late birth" and "missed Game 7" note they are now automatic and remain only as fallback.
  - `_bmad-output/implementation-artifacts/seriesdatasource-port.md`: the `espn` section.
  - `docs/CURRENT_DATA_MODEL.md`: only if it states the feed never births.

## Tasks & Acceptance

**Execution:**
- [x] `espn.ts`, `port.ts`: series-field parse, previous-date read, per-run date cache, backfill, six- or seven-game source assembly, `alerts`, and `feedSeriesCount` from the primary date only.
- [x] `run.ts`: read stored rows before the adapter is built, pass the stored-pair check, print alerts.
- [x] Workflow alert step plus the `workflows.test.ts` pins; record the mechanism choice in Implementation Notes.
- [x] Tests for every matrix row, with per-row mutation evidence. Commit the fixtures with provenance.
- [x] Runbook (fallback framing), port doc, and `sprint-status.yaml`.

**Acceptance Criteria:**
- Given each matrix row, when the pipeline suite runs, then a test pins it and goes red under a mutation that breaks it.
- Given a run's fetch log in the shared-backfill test, then no date is requested twice.
- Given the existing suites, then every Story 2.13/2.14/2.16/2.17 test stays green unchanged, or its change is listed with a reason.
- Given the change, when `npm run gate` runs, then it exits 0.

### Review Findings

Code review 2026-10-06. Four layers ran: Blind Hunter, Edge Case Hunter, Verification Gap and Acceptance Auditor. Triage: 2 decision-needed, 8 patch, 1 defer, 18 rejected. Outcome (same day): decision 2 resolved as (b) and applied; decision 1 resolved by narrowing the re-read to births only (see below); all 8 patches applied. The three new tests each went red under their mutation: the year dropped from `isPairStored`, the stored check skipped in `consider`, and the alert loop moved below the `--require-feed` throw. `npm run gate` exited 0 (565 tests).

- [x] [Review][Decision] The re-read can turn the run red through the planner (medium) — Each morning a stored pair's Game 7 on the previous date goes to `planPipeline` unguarded (`espn.ts` `extendWithBirths`, assembly loop). If ESPN corrects that score overnight, or a curated row disagrees with the feed, the planner throws `PlanAssertionError` and aborts the morning's own completions. The spec isolates the re-read's fetch errors, drift and timeouts, but not a planner disagreement. Before this story, a date the run did not own could not make the run red. Options: (a) accept it and document it as a known red cause in the runbook and port doc; (b) widen `isPairStored` to report the phase, and leave out (with a note) re-read Game 7s for pairs already archived; (c) something else. `plan.ts` is off-limits, so per-series catching there is out. **Open 2026-10-06:** the owner answered (c), proposing to narrow the re-read to one job and keep it distinguishable from the main read, or else to split it into its own pipeline. It is a scope and AC change (the frozen matrix row "Previous-date G7"). **Resolved the same day: narrowing approved, applied.** The re-read is for births only, and its Game 7s are ignored (`espn.ts` `extendWithBirths`). Tests: "Previous-date G7" was rewritten (a re-read Game 7 is ignored); a new case shows a re-read Game 7 that disagrees with its archived row cannot redden the run, and it is red against the pre-narrowing adapter; the never-born Game 7 case now carries that Game 7 on the run date. The owner declined an alert for a Game 7 not yet Final at read time. Amendments are recorded in the Spec Change Log.
- [x] [Review][Decision] Repeat birth-needed alerts lose their series names and read "Still red" (medium) — When the "Pipeline birth needed" issue is already open, `notify-failure` comments only `Still red: <run>` (`.github/actions/notify-failure/action.yml:59`) and drops the `BIRTH NEEDED:` lines. A second series that needs a birth on a later day never appears in the issue text, and the "Still red" wording is wrong for a run that did not fail. Options: (a) add an optional `comment_body` input to the action (the default stays as it is) and pass the alert lines; (b) put the date in the title, so each day gets its own issue; (c) accept it as documented ("read that run's log"). **Resolved 2026-10-06, owner: (b), applied.** The title is now `Pipeline birth needed ${{ steps.alerts.outputs.date }}` (the UTC run date) in both workflows; the runbook, the port doc and the `notify-failure` title doc say so, and `workflows.test.ts` pins the date output and the dated title.
- [x] [Review][Patch] Test that `isPairStored` matches on the year: an archived DEN–LAC row from another year must not block the 2025 birth [tests/pipeline/espn-adapter.test.ts]
- [x] [Review][Patch] Test that a red run still prints `BIRTH NEEDED:` lines: `--require-feed` with an empty run date and a re-read backfill gap gives code 2 plus the alert [tests/pipeline/espn-adapter.test.ts]
- [x] [Review][Patch] Test the common next-morning path: a re-read Game 6 of a pair already stored means no walk, no alert, and a note only [tests/pipeline/espn-adapter.test.ts]
- [x] [Review][Patch] The docs say walks run "concurrently"; `extendWithBirths` runs them one after another [supabase/scripts/pipeline/adapters/espn.ts:733, _bmad-output/implementation-artifacts/seriesdatasource-port.md:328]
- [x] [Review][Patch] The port doc says an absent `isPairStored` is handled "as Story 2.13 did", but `port.ts:137` says the adapter backfills every 3–3 it sees [_bmad-output/implementation-artifacts/seriesdatasource-port.md:65]
- [x] [Review][Patch] The probe still prints "non-Game-7 dates yield zero rows BY RULE", and it builds the adapter without `isPairStored`, so a 3–3 date walks about 20 live dates without saying so [scripts/probe-espn-adapter.mjs:255]
- [x] [Review][Patch] The fixture README says `competitions[0].series` = "Series tied 3-3". That string is `series.summary`; the code reads `completed` and `competitors[].wins` [tests/pipeline/fixtures/espn-backfill-2025/README.md]
- [x] [Review][Patch] The offseason birth-needed body lacks the inseason one's "a later run comments here; read that run's log" sentence [.github/workflows/pipeline-offseason.yml:134]
- [x] [Review][Defer] Several alert branches have no tests [supabase/scripts/pipeline/adapters/espn.ts extendWithBirths/backfillBirth] — deferred: on the re-read, an unknown ESPN code, an unreadable or tied Game 7 score, events the parse refused, and a spent budget; in the backfill, a game whose `series` is absent or malformed; and a headline-less candidate whose `series.type` is not playoff. A re-read date was the previous run's own date, where most of these already turned the run red.

**Rejected:**
- Same Game 7 on both the run date and the re-read page, so it is pushed or folded twice — false: an event lives on one date's page, and the two pages are different dates.
- Duplicate-fold variant: a birth gets two game-7 rows — false: it depends on the duplicate Game 7 above.
- `--require-feed` red throws away the re-read's births and completions — low: the re-read is a second chance for a date the previous run already handled as its own. Losing it needs a prior failure plus a league-wide rest day, and that run is red anyway.
- A Final with an unreadable headline and no `series` is dropped silently — low: alerting on every headline-less Final would be noise. The run date already notes unreadable headlines.
- A folded Game 7's round is never compared with the birth's round — low: not reachable in practice, and it would need a new guard.
- An unexpected throw inside `extendWithBirths` turns the run red — low: no unguarded throw path was shown. Every read and parse is caught.
- A newline inside an alert escapes the grep — low: unlikely, and it would add sanitising code.
- One slow, failing extra date can overrun the 180 s budget — low: the budget is documented as checked before each new date, and the worst case of about 4–6 minutes stays under the 10-minute step.
- The 14 JSON fixtures and `spike-probe.mjs.txt` are untracked — not a code defect. Stage them explicitly in the story commit.
- Implementation Notes are empty: no mechanism choice, no per-row mutation evidence, no list of changed earlier-story tests (AC 1/AC 3) — the fix edits the spec under review, so it is out of this review's scope. Fill them before marking done. The `sprint-status.yaml` claim "each red under a recorded mutation" is unsupported until then.
- The headline-less Game 6 path also filters on `series.type` — low: a defensive filter. Only best-of-seven playoff series can stand 3–3.
- Only a substituted budget tests the 25-request default — low: detection alone stays within 21 dates, and the constant is pinned.
- Alerts unrelated to a birth (a refused parse, an unknown code on the re-read) go out as `BIRTH NEEDED:` — low: they only follow a primary-date failure that has already filed a failure issue.
- A headline-less Game 7 on the re-read leaves no note — low: the run date only notes it too.
- The re-read repeats the Game 7 admission rule instead of reusing `selectEvents` — low: a design remark with no named divergence.
- `--require-feed` now waits on `readCurrent` — false: the spec's Code Map requires the read before the adapter is built.
- The runbook gives no query for curating a run-birthed series, and does not mention the automatic next-morning retry — low: these are additions to docs, not corrections.
- The wall-clock test does not pin per-date checking or the `startedAt` placement — low: the documented behaviour holds.

### Review Findings — pass 2 (2026-10-07)

Fresh four-layer review (Blind Hunter, Edge Case Hunter, Verification Gap, Acceptance Auditor) on an independent model, per the owner's standing practice. Diff: `b1adf0e..4eec447` (36 files, +2023/−89). Triage: 2 decision-needed, 7 patch, 1 defer, 9 rejected. The pass-1 record above stands unchanged; nothing below re-opens a pass-1 decision except where noted. Outcome (same day, owner chose "apply every patch"): both decisions resolved as (a), all 7 patches applied, the defer item recorded in `deferred-work.md`, and the two guards that changed behaviour each went red under a recorded mutation (table below). `npm run gate` exited 0, read from the command itself (568 tests, 24 files).

- [x] [Review][Decision] A dry-run dispatch can file a real "Pipeline birth needed" issue (medium) — The collect/file steps run under `if: always()` with no `inputs.dry_run` guard (`pipeline-inseason.yml:219-249`, offseason twin), and `run.ts` prints the alert lines before its dry-run early return. A rehearsal dispatch that detects a real 3–3 (or a backfill gap) therefore opens shared-state issues from a run documented as writing nothing. The alert content is still true (nothing was born), so both behaviours are defensible. Options: (a) suppress the file step when `inputs.dry_run` is true — the lines stay in the dispatch log; (b) keep filing and document it where `--dry-run` is described; (c) something else. **Resolved 2026-10-07, owner: (a).** The file step is suppressed on a dry-run dispatch in both workflows, with `workflows.test.ts` pins; the alert lines stay in the dispatch log.
- [x] [Review][Decision] The frozen budget's unit is "requests" but the code counts dates (medium) — Frozen Intent/Boundaries say "at most 25 extra requests"; `EXTRA_REQUEST_BUDGET = 25` counts one per date and "retries of the same date are not counted separately" (`espn.ts:703-704`), while each date retries up to `MAX_FEED_ATTEMPTS = 3` (`:649`), so the worst case is ~75 HTTP requests under a 25-request budget. The port doc already re-labels it "25 extra dates"; the Spec Change Log records no amendment. Practical exposure is bounded (the 180 s wall clock binds; retries fire only on 429/5xx), but the frozen text understates the egress cap 3×. Options: (a) ratify the unit as dates with a Spec Change Log entry (and rename the constant, e.g. `EXTRA_DATE_BUDGET`); (b) count HTTP attempts against the budget instead; (c) something else. **Resolved 2026-10-07, owner: (a).** The unit is ratified as dates: `EXTRA_REQUEST_BUDGET` is renamed `EXTRA_DATE_BUDGET`, the Spec Change Log carries the amendment, and the 180 s wall clock stays the binding cap.
- [x] [Review][Patch] The probe copies constants it also imports: `probe-espn-adapter.mjs:255` hardcodes `BIRTH NEEDED:` instead of importing `BIRTH_NEEDED_PREFIX` (`run.ts` guards its main behind the argv check at `:554`, so the import is side-effect-free), and `:244` hardcodes the full scoreboard endpoint regex although the same destructuring at `:149` imports `SCOREBOARD_ENDPOINT` — both against the probe's own "imported, never copied" rule (`:146`) [scripts/probe-espn-adapter.mjs:244,255]
- [x] [Review][Patch] A successful backfill drops its accumulated `problems` (walk-page events of the target pair the parse refused, non-Final games, mis-numbered games, unreadable dates): the failure alert carries them (`espn.ts:924`) but the success note (`:1001-1007`) does not, so partial feed drift leaves no trace when the birth certifies — append them to the note as walk warnings [supabase/scripts/pipeline/adapters/espn.ts:879-1007]
- [x] [Review][Patch] The extra-date fetch-failure alert still says "a Game 6 at 3–3 or a Game 7 on that date may have been missed" — after the re-read narrowing the run never acts on a Game 7 of an extra date; in the common case (the owning run was green) the clause sends the owner to chase work the design ignores. Reword so a Game 7 is named only as the runbook's manual-recovery concern for the re-read date [supabase/scripts/pipeline/adapters/espn.ts:776-777]
- [x] [Review][Patch] `payloadFor` catches every error and returns `null`, so "no fixture committed" and "fixture committed but corrupt" are indistinguishable — a corrupted committed payload silently degrades to an empty rest-day page instead of failing loudly, contradicting the fixture README's "facts read off these exact bytes"; rethrow when the file exists [tests/pipeline/espn-adapter.test.ts:1277-1281]
- [x] [Review][Patch] Dead condition: the headline-less branch tests `tied && series.kind === 'read'` although `tied` (`:801`) already requires `kind === 'read'` — drop the redundant clause [supabase/scripts/pipeline/adapters/espn.ts:834]
- [x] [Review][Patch] `extendWithBirths` returns `admittedEvents: []` beside rebuilt non-empty `statuses`/`scores`, breaking the field's documented "index-parallel to `statuses` and `scores`" contract (`:199`); no consumer reads the merged copy today (only `:1062` reads `primary`'s), but a future one would read `[]` as "no Game 7s admitted" — amend the type doc for the merged result or rebuild the array in parallel [supabase/scripts/pipeline/adapters/espn.ts:1171]
- [x] [Review][Patch] "Concurrent backfills" survives in two planning docs this same diff edited, contradicting the shipped sequential walk ("Backfill each target in turn", `espn.ts:1118`; the port doc and the code comment were fixed in pass 1) — amend with dated brackets [_bmad-output/planning-artifacts/epics.md:670; _bmad-output/planning-artifacts/sprint-change-proposal-2026-10-06.md:27,65]
- [x] [Review][Defer] Seven certification/classification guards beyond the recorded defer inventory fail no test when deleted — wins total ≠ 6 (`espn.ts:819-823`), the "which no Game 6 can" standing (`:829-832`), a game number appearing twice in the walk (`:913-916`), mixed rounds (`:933-935`), an off-year game (`:937-939`), a tied score (`:953-954`), and the non-3–3 six-score split (`:975-976`); no fixture presents any of these shapes (message-text search across `tests/`: zero matches) — deferred: same class and same owner decision as the 2026-10-06 defer; the actionable now is extending the `deferred-work.md` inventory, which reads as complete but lists only some of the guards

**Rejected (pass 2):**
- Empty `## Review Triage Log` heading in the committed spec — that section is this workflow's own record and is filled by this pass below. (Raised by three layers.)
- Spec test-count discrepancy (565 in Review Findings vs 566 in Implementation Notes) — the fix edits the spec under review; both counts are plausible at their respective moments (patches landed between the runs). Flagged here for the owner rather than patched.
- "Still red" comment wording on a same-day birth-needed re-run — the owner's pass-1 decision 2(b) chose the dated title knowing a same-day re-run comments a run link only, and the issue body says exactly that; the fix is rejected option (a).
- Issue-title date computed in the collect step, so a run crossing UTC midnight titles the next day — real (`pipeline-inseason.yml:227`) but needs a manual dispatch within minutes of UTC midnight plus an alert; harm is a one-day-off title on an alert issue.
- The probe's edits are verified by nothing — false: `tests/pipeline/venue-backfill.test.ts:643,665,685` spawn the probe under node in the suite, so a parse error reddens the gate; leg A running live-only is the documented owner-run policy, and `shiftDates` is exported (`espn.ts:711`).
- `epic-2-context.md:79` keeps "a non-Final Game 6 at read time is warned about" — false: the fragment sits inside the explicitly historical registration clause, superseded in the same bullet by two dated brackets (the re-scope bracket: alerts remain only as the backfill fallback), per that file's hand-curated convention.
- No closure path for birth-needed issues (consecutive same-series issues) — low: the direct consequence of the owner's pass-1 decision 2(b), with the closing procedure documented in the runbook; a fix adds process the owner already declined to automate.
- Duplicate `team.id` on both competitors yields a phantom certified 3–3 — false: a duplicate team.id gives both sides the same standing wins, and the progression cross-check (`espn.ts:963-971`) compares that against the score-derived running wins, which are unequal after any decided game (ties refused at `:953`), so game 1's cross-check necessarily fails into a loud alert; no birth can reach the planner.
- Pass-1 rejection rationale "alerts unrelated to a birth only follow a primary-date failure" is factually wrong (re-read alerts fire on green runs, `espn.ts:1080,1094`) — the behaviour itself matches the frozen Intent and is documented in the issue body and runbook; the fix edits the spec under review. Flagged for the owner.

**Mutation evidence for the two pass-2 guards (2026-10-07).** Each mutation was applied to the working tree, run, recorded, and reverted byte-for-byte.

| Guard | Mutation | Result | Revert |
| --- | --- | --- | --- |
| Dry-run suppression of the birth-needed file step (`pipeline-inseason.yml:239`) | `&& !inputs.dry_run` dropped from the step's `if:` | Red: `vitest run tests/pipeline/workflows.test.ts` exited 1, "pipeline-inseason.yml: a found alert files its own DATED issue" failed on the `if:` pin (1 failed / 47 passed) | Re-edited the line (the file carries uncommitted work, so no `git checkout`); the file re-ran green, 48 passed |
| `payloadFor` throws on a corrupt committed fixture (`espn-adapter.test.ts:1277-1281`) | `<<<CORRUPTED BY MUTATION RUN>>>` appended to `tests/pipeline/fixtures/espn-backfill-2025/scoreboard-20250425.json` | Red: `vitest run tests/pipeline/espn-adapter.test.ts` exited 1, 12 failed / 78 passed, each naming `Unexpected non-whitespace character after JSON at position 48043` inside a `BIRTH NEEDED: … could not be read` alert — loud, not a silent rest-day page | `git checkout --` (the fixture carried no other change); the file re-ran green, 90 passed |

The offseason twin carries the identical guard and is pinned by the second iteration of the same `for (const rel of [INSEASON, OFFSEASON])` loop (`workflows.test.ts:270`), so deleting its guard reddens the same test under the offseason name; it was not mutated separately, since the two files' pins are the same assertion over the same string.

Note on the second row: the parse error surfaces as the adapter's fetch-failure alert rather than an uncaught throw, because `payloadFor` is called inside the mock `fetch` and the adapter retries a failed request up to `MAX_FEED_ATTEMPTS`. The distinction the guard buys still holds — under the old swallow-everything `catch`, the same corruption read as "no fixture committed" and the date became an empty rest-day page that no test noticed.

## Verification

**Commands:**
- `npm run gate`: expected exit 0, read from the command itself.
- `npx vitest run tests/pipeline`: green, with the new rows present.

## Implementation Notes

**Alert mechanism (Task 3).** The runner prints each adapter alert as a line starting `BIRTH NEEDED:` (`run.ts` `BIRTH_NEEDED_PREFIX`). It prints them after the report lines and before the `--require-feed` refusal or planning can stop the run. The run step in both pipeline workflows `tee`s its output to `$RUNNER_TEMP/pipeline.log` under `set -o pipefail`, so the runner's exit code is still the step's exit code. A "Collect birth-needed alerts" step (`if: always()`) greps the log for the prefix. A "File a birth-needed alert" step then files the issue through the existing `notify-failure` action, under a title separate from the failure issue: `Pipeline birth needed <UTC date>`. Why a log grep: the alert must not change the exit code (completions and the insights refresh go ahead), and it must land in the same cron cycle. A non-zero exit would break the first rule; a second workflow would break the second and duplicate the secrets and the table read. Why the dated title (owner, at review): on an open issue `notify-failure` comments only a run link, so a stable title would bury a later day's series behind "Still red".

**Re-read scope (owner, at review).** The previous-date re-read is for births only; its Game 7s are ignored. See the Spec Change Log.

**Per-row mutation evidence (AC 1).** Run on 2026-10-06 against the final tree. Each row applied one source mutation, ran only that row's test (`vitest run tests/pipeline/espn-adapter.test.ts -t <pattern>`, which selected exactly 1 of 90 tests), recorded the result and restored the file byte for byte. All 18 went red.

| Row | Mutation | Result |
|---|---|---|
| Birth | `team_a`/`team_b` taken from Game 1's away/home (swapped) | red |
| Shared backfill + re-read | date cache bypassed for every extra date | red |
| Already stored | stored-pair check skipped in `consider` | red |
| Already stored (per year) | `row.year === year` dropped from `isPairStored` (`run.ts`) | red |
| Already stored (next morning, re-read) | stored-pair check skipped in `consider` | red |
| Not 3–3 | the "decided at game 6" silent branch disabled | red |
| Backfill gap | walk bound `offset < 21` → `offset <= 21` | red |
| Missing `series` | the `absent` branch of `classifyGameSix` disabled | red |
| Previous-date G7 | the re-read's Game 7 skip removed | red |
| Alarm independence | re-read events added to `feedSeriesCount` | red |
| Alerts on a red run (review) | the alert print loop removed from `run.ts` | red |
| Dry-run | the dry-run early return disabled (`run.ts`) | red |
| Per-team wins (C2) | wins read by position (`entries[0]`/`entries[1]`) | red |
| Headline unreadable (C3) | the headline-less 3–3 candidate branch disabled | red |
| Progression mismatch (C4) | the standing-vs-scores comparison disabled | red |
| Budget and isolation (C1) | a failed extra date rethrown instead of cached as failed | red |
| Budget (C1), request budget | the request-budget check disabled | red |
| Backfill page noise (C5) | the target-pair filter in `backfillBirth` removed | red |

The review's "re-read Game 7 that disagrees with its archived row cannot redden the run" case was also checked against the pre-narrowing adapter, where it is red.

**Earlier-story tests changed (AC 3).** Every other Story 2.13/2.14/2.16/2.17 test is unchanged and green.
- `espn-adapter.test.ts` `stubFeed` (2.13 harness): its plans now describe the run's own date only, and every other date answers an empty scoreboard. Reason: each run now also requests the previous date.
- "the request date is derived…" (CAP-5): 1 URL → 2. The first-URL pin is unchanged, and the second is pinned as the previous date.
- The retry-recovery case (CAP-6/7): 3 URLs → 3 for the run's own date plus 1 re-read.
- "one run is ONE request…" was renamed "…ONE request per date…": 1 → 2 distinct URLs. The memoisation it pins is unchanged.
- `FeedSink` birth tripwire: message reworded. The espn source can now birth, but no fixture in that block carries a 3–3.
- "the report prints before planning…": the abort now comes from a stored pending row whose games 1–6 split 4–2. A Game 7 for an unstored pair, which used to be the abort, is now an alert with exit 0. The property pinned (the report is on screen when planning aborts) is unchanged.
- Five sink-call pins, `['readTeams']` → `['readTeams', 'readCurrent']`: two in `espn-adapter.test.ts` (the rest-day alarm and the unresolvable code) and three in `run.test.ts` (the 2.6 `--require-feed` case and two 2.16 re-parented guarantees). Reason: `readCurrent` now runs before the adapter, for the stored-pair check. Still zero writes.
- `workflows.test.ts` (2.6): the MISSED GAME 7 RECOVERY pin is unchanged. A comment notes the re-read ignores Game 7s.

**Verification.** `npm run gate` exits 0 (Biome, `tsc -b`, 566 tests, build), read from the command itself.

## Spec Change Log

- **2026-10-06, code review, owner decisions.** (1) The previous-date re-read is narrowed to births only: its Game 7s are ignored, and completions come from the run's own date only. This amends the frozen Intent bullet and the "Previous-date G7" matrix row, with the owner's explicit approval. Reason: re-reading Game 7s re-planned every finished series the next morning, so an overnight correction or a disagreeing curated row turned the run red from a date it does not own, and a red run could no longer be told apart from a real problem on the run's date. Amended alongside: `epics.md` Story 2.18, `sprint-change-proposal-2026-10-06.md` option (i), `epic-2-context.md`, and the 2.13 memlog. The owner declined a separate alert for a Game 7 not yet Final at read time (judged too unlikely at the 07:30 UTC run). (2) The "Pipeline birth needed" issue title carries the UTC run date.
- **2026-10-07, pass-2 code review, owner decision.** The frozen "at most 25 extra requests" budget is ratified as counting extra **dates**, not HTTP requests: `EXTRA_REQUEST_BUDGET` is renamed `EXTRA_DATE_BUDGET`, retries of the same date stay uncounted (worst case ~75 HTTP requests, since each date retries up to 3 attempts), and the 180 s wall-clock budget remains the binding cap. The frozen Intent and Boundaries sentences read "requests" and are not edited (frozen block); this entry plus the renamed constant and the port doc's "25 extra dates" are the record. Reason: the wall clock, not the request count, is what keeps the run under the 10-minute step, and counting attempts would spend the budget on 429/5xx retries rather than on new dates.

## Review Triage Log

- **Pass 1 (2026-10-06, same-model build-session review):** 4 layers, 29 raw findings → 2 decision-needed (both resolved by the owner the same day: re-read narrowed to births; dated issue title), 8 patches applied, 1 defer, 18 rejected. Record above under "Review Findings".
- **Pass 2 (2026-10-07, independent-model re-run per the owner's standing practice):** 4 layers (Blind Hunter floor N=10, Edge Case Hunter, Verification Gap, Acceptance Auditor), 26 raw findings → 19 distinct after cross-layer dedup → 2 decision-needed, 7 patch, 1 defer, 9 rejected. Every finding verified against the working tree before the verdict; the Verification Gap finding arrived pre-verified per its layer's evidence rules. Record above under "Review Findings — pass 2".
