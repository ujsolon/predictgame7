---
title: 'Story 2.7 — Epic verification: simulated playoff week'
type: 'chore'
created: '2026-10-05'
status: 'done'
route: 'dispatch'
baseline_commit: '94b4988353358b405c7401cbdaa2a4d26814a9de'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md (Story 2.7: heading :448, ACs :456-462)'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/qa-matrix-1-5.md (§2.2 active axis, §6.5 options a/b/c)'
  - '{project-root}/_bmad-output/specs/spec-2-13-espn-feed-adapter/run-sheet.md (proofs already obtained: issues #8/#9, runs 37199559809, 37202299383, 37235646137)'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 2's chain (derived phase → runner → `espn` adapter → insights refresh → scheduled workflows → failure issue) has been proven one piece at a time. It has never been proven end to end: from a pending series being born, through the visible UI, to its archive transition. The 2026 postseason is over, so no real pending series will exist before April 2027. Several pinned facts (178/1,246, the league split 159+1+18, the 117 census, the insights' 160) are asserted only inside the Docker rehearsal and `00016`'s apply-time guards, never re-read from production. And `scripts/spike-2-1/audit-archive.mjs` is red on the dropped `status` column.

**Approach:** One drill, recorded as a results matrix at `_bmad-output/implementation-artifacts/drill-2-7-results.md`, with four legs. (1) A read-only reconciliation of production over the anon REST role. (2) The derivation write leg: a fixture pending series is born, shows up in the Active group, gets a score update, then has its winner filled and moves to the archive. (3) The re-scored `qa-matrix-1-5.md §6.5` option (c): a CDP response override fakes six score rows plus a null winner against the production read path. (4) The failure drill, read against the evidence already obtained. Each failure is fixed or filed before `epic-2` is marked done.

**Decisions (owner, 2026-10-05):**
- **D1 — Write leg on a local throwaway stack.** Docker `postgres:16` replays `00001..00018` (reusing the rehearsal's bootstrap), with a `postgrest` container on top and locally minted anon/service JWTs. `run.ts` and `npm run preview` both point at it. No production write. Docker Desktop must be running; if it isn't, the leg is recorded as owner-owed with the exact command, never faked.
- **D2 — Build the Home data reach.** Home reads `series` with the same embed as the picker, keeps rows where `isSeriesPending` holds, and renders a minimal link to `/predict?series=<id>` per pending series (`/series/<id>` arrives with Story 4.1). It renders nothing at all when none is pending, so production Home is unchanged until April. Story 4.5 owns its visual treatment, copy and AA floor later.
- **D3 — Accept dispatch evidence for the failure drill.** The matrix cites issues #8/#9 and runs `37199559809` / `37202299383` (open, "Still red", close-then-fresh). The scheduled-trigger half is filed as an owner check on the first inseason cron (2027-04-16), together with D-7's un-run-cron glance. No temporary workflow.
- **D4 — Keep the full spec** (~2,900 tokens) as one drill with one matrix.

## Boundaries & Constraints

**Always:**
- Production stays read-only for the agent. The only production calls are anon-REST GETs and the normal user Predict call that option (c) triggers. The agent never pushes, never dispatches a workflow, never creates an issue, never runs `supabase db push`/`db reset`, and never points `psql` at `supabase/.temp/project-ref`. Every one of those is handed to the owner as a command.
- Phase is asserted through `src/lib/series-phase.ts` shapes: six score rows with game numbers 1–6 plus a null winner means pending. No status flag, no date and no `created_at` decide phase anywhere in the drill.
- The archive figures are asserted as the measured literals 178 / 1,246 / seven each / 159 NBA + 1 BAA + 18 ABA / 117 home wins over 160. A mismatch is a red finding, never a re-pin.
- Every new script exits non-zero on any failed assertion, and the matrix records exit codes read from the command itself, never off a pipe.
- `npm run gate` is green at the end.

**Never:**
- No fixture or seeded row in production (option (a) stays withdrawn: the picker query is unfiltered, `PredictPage.tsx:150-153`).
- No change to `run.ts`/`plan.ts`/adapters, no migration, no edit to `00015`–`00018`, and no relaxed guard or pinned literal.
- No Home visual treatment, copy or AA work. Story 4.5 owns that.
- No `jsdom` accessible-name assertions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Archive reconciliation | production, anon key | 178 series, 1,246 scores, all seven each, null winners 0; league 159/1/18; G7 home wins 117 of 160; insights `total_game_sevens` = 160 | any mismatch: exit 1 naming the figure |
| Fixture birth | 3–3 fixture via `manual_csv` | one series with six rows and a null winner; picker shows it under "Current Game 7s"; `/historical` does not list it | runner exit 2 aborts the leg, recorded red |
| Re-run, same input | identical CSV | zero writes (idempotent) | n/a |
| Completion | fixture CSV with game 7 + winner | one write fills the winner; the series leaves Active and enters `/historical`; total = fixture base + 1 | n/a |
| §6.5 (c) override | CDP `Fetch` rewrite of the `series` response | the Active group renders the faked row; `source:'current'`; the predict request carries six games; preload `?series=<id>` resolves | harness exit 1 on a missing element |
| Non-reconciling row | override with five score rows, null winner | excluded from `games`, `Non-reconciling series:` logged | asserted present |

</frozen-after-approval>

## Code Map

- `scripts/spike-2-1/audit-archive.mjs` -- `:76` selects `status` (HTTP 400 since `00014`); `:168-171` prints a `status` domain. Drop both. This is the 178/1,246 reconciler, and its Windows exit code (127 versus 2) was a deferred note at `deferred-work.md:276,305`.
- `src/lib/series-phase.ts` -- `deriveSeriesPhase` `:39`, `isSeriesPending` `:57`. Game-number set rule. The only consumer is `PredictPage`.
- `src/pages/PredictPage.tsx` -- `SERIES_SELECT` `:31-45` (embeds teams + `series_game_scores(*)`), list query `:150-153` (no filter, `order=year.desc`), exclude-and-report `:156-169`, preload `:185-199` (`.eq('id').maybeSingle()`), "Current Game 7s" `:807`, empty state `:812-817`, `Current` label `:877`.
- `src/pages/HistoricalPage.tsx` -- server filter `.not('winner_team_id','is',null)` `:63-67`; announced "Showing N of M series." `:340-341`; chip `:31,39,292,364`; gloss `:33-34,420-421`.
- `src/pages/InsightsPage.tsx:37-39` + `src/lib/insights.ts:24` -- `insights_cache`, `game_6_winner_stats.total_game_sevens` = the 160.
- `src/pages/HomePage.tsx` -- no series read today; banner hotspots `:183-190` already link `/predict?series=<uuid>`, which is the link shape D2 reuses.
- `scripts/measure-predict-latency.mjs` -- hand-rolled `CDP` class `:264`; spawns headless Chrome itself `:491-508`; enables Page/Runtime/Network only. Add `Fetch.enable` (`requestStage: 'Response'`, pattern `*/rest/v1/series*`) after `:559-563`, before `loadPage` `:608`. Targets `npm run preview` on `:4173`.
- `scripts/rehearse-migration-00014.mjs` -- container bootstrap and roles `:594-604`, migration replay, `COVERED_THROUGH = 18`. Reuse its bootstrap for D1. Do not change its assertions.
- `supabase/scripts/pipeline/run.ts` -- `manual_csv` + `--csv=` births/completes through `00015`'s `pipeline_birth_series` `:40` / `pipeline_complete_series` `:190`. `espn` takes no flags and fetches yesterday (ET) only, so a real-feed write needs a live bracket.
- `.github/workflows/pipeline-inseason.yml`, `.github/actions/notify-failure/action.yml` -- read-only evidence for leg 4.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/spike-2-1/audit-archive.mjs` -- drop `status` from the select and the domain section; keep its exit contract -- leg 1 needs a green reconciler.
- [x] `scripts/drill-2-7-reconcile.mjs` -- new, anon-REST read-only: league composition, the G7 census over `league IN ('NBA','BAA')` game-7 rows only, null-winner count, insights `total_game_sevens`; exit 1 on any mismatch -- leg 1's missing half.
- [x] `scripts/measure-predict-latency.mjs` -- add `--fake-pending` (and a `--fake-short` variant): `Fetch` override that appends one synthetic series (six rows, null winner) to the list response and serves it on the `?id=eq.` preload; assert the Active group, `Current` label, the six-game predict request and exclusion of the short row -- leg 3.
- [x] `scripts/drill-2-7-local-stack.mjs` + `tests/fixtures/drill-2-7/*.csv` -- start postgres + postgrest, replay migrations, seed the 178×7 archive fixture, run birth → re-run → score update → completion through `run.ts`, query between steps; print the env lines for `npm run preview`, then drive the picker, Home and `/historical` over CDP at each step -- leg 2 (D1).
- [x] `src/pages/HomePage.tsx` + `src/pages/__tests__/home-pending.test.tsx` (jsdom; first written under `tests/`, whose tsconfig is Node-only, so moved beside the other page tests) -- pending-series read via `isSeriesPending`, minimal link to `/predict?series=<id>`, nothing rendered when empty or on query error; tests assert `textContent`/`href`, never accessible names -- D2.
- [x] `_bmad-output/implementation-artifacts/drill-2-7-results.md` -- the matrix: one row per AC clause with command, exit code, evidence and verdict, plus the side-by-side 178 vs 160.
- [x] `qa-matrix-1-5.md` §2.2/§6.5, `deferred-work.md`, `sprint-status.yaml` (`2-7` → review; close retro item 3), `epic-2-context.md` -- record outcomes, close the entries 2.7 owns, file the rest.

**Acceptance Criteria:**
- Given the drill's commands, when each runs, then `drill-2-7-results.md` records its exit code and every AC clause of `epics.md:456-462` has a verdict row (PASS / FAIL-filed / owner-owed with date).
- Given any red row, then it is fixed in this story or carries a filed `deferred-work.md` entry or issue reference before `epic-2` moves to done.
- Given `npm run gate`, then it exits 0.

## Implementation Notes

- **How it was built.** The fresh-context implementation subagent wrote the first pass: the audit fix, `drill-2-7-reconcile.mjs`, the harness modes, `series-query.ts`, the Home block and its test. Its spawn was reported to the parent as rejected, so it never handed a report back, and the parent finished the work inline from the working tree. Nothing it wrote was reverted. Every claim below was re-run by the parent.
- **`SERIES_SELECT` moved to `src/lib/series-query.ts`** (verbatim) so Home's read and the picker cannot drift. `/historical` keeps its own projection. Home adds `.is('winner_team_id', null)` only to narrow the payload; `isSeriesPending` still decides.
- **Harness defects found by running it** (none in product code): the CORS preflight recorded as the list call; posthog-js dropping every event from a `HeadlessChrome` UA (bot filter), fixed by a UA override; PostHog `/flags`, config and preflight answers the SDK rejected; the preload check reading the trigger label instead of the readout; the basename in the Home href. Recorded in `drill-2-7-results.md`.
- **Leg 2 needed Docker.** The engine was down on 2026-10-05 (`com.docker.service` stopped, no Docker process). After the owner restarted, the parent launched Docker Desktop. The first run timed out waiting on PostgREST at 120 s on a fresh image pull. The script now prints PostgREST's logs on that path and probes `docker version` with a 20 s ceiling. The immediate re-run was 25/25, exit 0, with a clean teardown.
- **Results:** leg 1 reconcile 16/16, audit exit 0, `--archive-read` 7/7; leg 2 25/25; leg 3 `--fake-pending` 19/19 at 1440×900 and at 390×844, `--fake-short` 12/12; `npm run gate` exit 0 (569 tests). Owner-owed F1 (first scheduled cron, 2027-04-16) and F2 (first real-feed write) are filed in `deferred-work.md`.
- **Trackers:** `qa-matrix-1-5.md` §2.2 re-scored (D/M `[x]`, K/S `[ ]`, not driven), §6.5 and F9 closed; `deferred-work.md` F9, option (c), both `audit-archive` entries closed, the cron entry transferred to F1, inherited item 4 annotated; retro item 3 `done`.

## Spec Change Log

## Review Triage Log

Pass 1, 2026-10-05. Three same-model, fresh-context layers ran over `94b4988..` (the working tree; spec excluded from the diff and given to the edge-case layer as claims): blind hunter (BH), edge-case hunter (EC), verification gap (VG). Routing: **patch** = applied in this pass; **defer** = filed in `deferred-work.md`; **reject** = not acted on. No intent_gap or bad_spec entry, so no loopback.

| ID | Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| BH-1 | The drill never re-ran the venue probe (why 2.12 preceded it); ECH-1 and `Counter=1000` were routed to 2.7 and left untouched | medium | patch | Real. `deferred-work.md` names Story 2.7 as owner of both. ECH-1 fixed (one `else if` branch); the probe re-run filed as F3 (the probe's header says agents never run it); `Counter=1000` dispositioned (nba_com-only, off both scheduled workflows since 2.13; `espn` has no `Counter`); the per-match unit-test item re-owned to the Epic 2 retro. |
| BH-2 | The spec is not in the diff under review | false | reject | Excluded on purpose: step 4 hands the spec to the edge-case layer as the claims file. It exists at its path, and the results doc links it. |
| BH-3 / VG-o1 | Results row 7 claims `captureException` sent; the script only printed it as informational | medium | patch | Real, an evidence overclaim. Made a ledger check (20 s wait); `--fake-short` re-ran 13/13, exit 0. |
| BH-4 | Row 3 credits leg 3 with the Active→archive exit, which a browser rewrite cannot show | low | patch | Real. Row 3 now says leg 3 shows the entry half only; the exit is leg 2's. |
| BH-5 | The 390×844 run has no row in the results matrix | low | patch | Real. Row added (19/19, exit 0). |
| BH-6 | §2.2 K/S reopened to `[ ]` with no owner | low | patch | Real. Filed to Story 5.2 in `qa-matrix-1-5.md` §6.5. |
| BH-7 | Sprint status says `in-progress` while docs say closed; no 2-7 comment block | false | reject | The story moves on the workflow's own transitions (`review` at step 5). Closed *entries* are owned debt the drill discharged, not the story's status. |
| BH-8 | Home's block has no AA floor and goes live in April with nothing recording that 4.5 must land first | low | defer | Owner D2 excludes AA work from 2.7; the ordering risk is real. Filed as F4 (Story 4.5, before 2027-04-16). |
| BH-9 / VG-o3 | Home drops a non-reconciling row silently; the picker reports it | low | reject | The picker still reports the same row on every `/predict` load (`PredictPage.tsx:148-152`). Mirroring it adds a second direct PostHog call ahead of the Story 3.1 isolation layer; unlikely to be met. |
| BH-10 | Missing tests: six-row row with a winner; `order` argument; unmount cancel | low | patch (first) / reject (rest) | Six-row-with-winner test added; it proves the derivation drops it, since the mock ignores the server filter. Order and unmount: cosmetic, and asserting them adds mock surface. |
| BH-11 / EC-3 | Ctrl+C during a normal leg-2 run leaves containers, network, proxy and `dist-drill-2-7/` | medium | patch | Real: default SIGINT skips `'exit'` listeners. SIGINT handler now installed unconditionally (exit 130). |
| BH-12 | `dist-drill-2-7/` not gitignored | low | patch | Real for crash or `--keep` runs. `.gitignore` entry added. |
| BH-13 / VG-1 | The three harnesses (and the run-when-executed guard) are checked by no gate step | medium | patch | Real. Added to the `node --check` loop in `tests/pipeline/venue-backfill.test.ts`, plus a `--help` spawn test (direct run) and an import test (starts nothing). Both mutation-checked: each flipped guard turns its test red. |
| BH-14 | `reconcile.mjs` silently skips the count check when `Content-Range` is missing | false | reject | With no total, paging stops at a short page and the result is compared with the pinned literal (178 / 1,246), so a truncated read fails loudly. |
| BH-15 | Side-by-side line credits BAA to the gloss, not the population rule | low | patch | Direct string correction: now cites `league IN ('NBA','BAA')`, 00016/00017. |
| BH-16 | "Production Home unchanged" is false: every load makes an extra `series` read | low | patch | Real. JSDoc and results row 8 now state the one zero-row read per load. |
| VG-o2 | Stale comment in `audit-unique-key.mjs:14-15` says audit-archive stays red until 2.7 | low | patch | Direct correction. |
| EC-1 | Home absence read after a fixed 4 s sleep can pass before the query returns | medium | patch | Real false-green risk. The session now records finished `series` loads, and absence is asserted only after Home's `winner_team_id=is.null` read lands. Leg 2 re-ran 26/26. |
| EC-2 | postgres temp init server answers `SELECT 1` and then restarts | false | reject | The probe connects to the `drill` database, which the temp init server does not have yet (the same reasoning the rehearsal records at `waitForReady`). |
| EC-4 | `--keep` Ctrl+C can hang on keep-alive sockets | low | patch | Direct fix: `closeAllConnections()` after `close()` in teardown. |
| EC-5 | A foreign server on :4174 gets driven | low | reject | `--strictPort` makes the preview exit. A foreign (production-backed) server has no pending series, so step 1 fails loudly rather than passing. Unlikely, and the guard would add complexity. |
| EC-6 | Unparsable `docker port` → NaN port | low | reject | Fails as a PostgREST timeout, which now prints the container logs; unlikely. |
| EC-7 | `spawn` has no `'error'` listener | false | reject | Every spawn runs `process.execPath`, the running Node binary, so ENOENT cannot occur. |
| EC-8 | Node < 22.18 exits 1, not 2 | low | reject | The repo pins Node 24 for this path; unlikely. |
| EC-9 | Idempotency fingerprint omits score team ids, winner and updated_at | low | patch | Direct correction: fingerprint is now `row_to_json` of every row of both tables. |
| EC-10 | Seven rows with a duplicated game number pass "exactly seven" | false | reject | `unique_series_game UNIQUE(series_id, game_number)` plus `CHECK (game_number BETWEEN 1 AND 7)` (00005) make seven rows exactly {1..7}. |
| EC-11 | Null or tied game-7 scores are counted as home losses | low | reject | Scores are `NOT NULL` (00005); ties are measured at 0 by `audit-archive.mjs` in the same leg. |
| EC-12 | A `league` equal to an `Object.prototype` key escapes the set check | false | reject | `series.league` is CHECKed to `NBA`/`BAA`/`ABA` (00016). |
| EC-13 | Quoted `.env` values break the reader | false | reject | The reader is the one the audits already use, and the run against this `.env` exited 0. |
| EC-14 | Ctrl+C during a harness mode leaves Chrome | low | patch | Direct fix: `process.once('SIGINT')` closes the session. |
| EC-15 | The 60 s navigation timer is never cleared | low | patch | Direct fix: cleared in `finally`. A finished run now exits at once (`--archive-read` measured at 4 s wall). |
| EC-16 | The rewritten list keeps the upstream `Content-Range` | false | reject | The picker's list read requests no count, and nothing in the app reads that header. |
| EC-17 | Home orders pending links by year only | low | reject | Order within a year is presentation, which is Story 4.5's (D2). |
| EC-18 | A score update on a still-pending series is never drilled | false | reject | 00015 offers only birth and completion. Games 1–6 are fixed at birth, and a disagreeing re-feed is refused (`plan.ts`). The completion is the only score update, and row 4 now says so. |
| EC-19 | The task says "print the env lines"; none printed | low | patch | Direct fix: the drill prints both `VITE_*` lines it built with (the anon key is minted per run against a throwaway secret). |
| EC-20 | Step 2 (re-run) reads no UI | low | patch | Added: step 2 re-reads all four surfaces and asserts them identical to step 1. |

## Verification

**Commands:**
- `node scripts/spike-2-1/audit-archive.mjs` and `node scripts/drill-2-7-reconcile.mjs` -- expected: exit 0 against production.
- `npm run preview` then `node scripts/measure-predict-latency.mjs --fake-pending` / `--fake-short` -- expected: exit 0.
- `npm run gate` -- expected: exit 0.
