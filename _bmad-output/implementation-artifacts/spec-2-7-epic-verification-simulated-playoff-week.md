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

### Review Findings

Pass 2, 2026-10-05 — fresh-context review of `94b4988..c8031fe` (four layers: blind hunter, edge-case hunter, verification gap, acceptance auditor; 31 raw findings, 25 entries after merging). The acceptance auditor re-ran the gate itself: Biome 130 files clean, `tsc -b` exit 0, Vitest 25 files / 575 tests, build keeps `/predictgame7/`; and it counted each new script's assertions against the matrix (reconcile 16/16, leg 2 26/26, `--fake-pending` 19/19, `--fake-short` 13/13, `--archive-read` 7/7 — all match).

- [x] [Review][Decision] **RESOLVED 2026-10-06 by running it (option 3), not by dating it.** The epic's Given premise "this drill runs the venue probe" was not met, and F3 carried no date — `epics.md:457` orders Story 2.12 before this one *because the drill re-runs the probe*, but no leg ran it (`drill-2-7-results.md:22` recorded "owner-run"), and F3 (`deferred-work.md:557-559`) said "Owner: the owner, any time" while AC 1 above allows only PASS / FAIL-filed / owner-owed **with date**. The owner ran `node scripts/probe-game7-venues.mjs` on 2026-10-06; F3 is closed on that evidence. Verified independently during triage: 160 lines printed, and each one compared slot-for-slot against `game7_venues_curated.csv` at its own cited line number — 160/160 agree on year, `team_a`, `team_b` **and** the `game7_home_team` value; all 160 NBA/BAA rows answered, 0 blank, 0 ABA rows printed (18 ABA venues stay blank by Call 2); no unplaced-winner, winner-inversion, unmatched-answer or alias-proposal line; `PROBE COMPLETED`, with the probe's only non-zero path (`PROBE INCOMPLETE`, exit 2) absent. The pasted transcript carries no exit code, so none is claimed. Note the comparison was done outside the probe: its own coverage report asserts blank-vs-answered only (`scripts/probe-game7-venues.mjs:335-339`), never that a printed venue equals the curated value. ECH-1's new branch therefore still has no executed coverage — the defer item below.
- [x] [Review][Patch] Ctrl+C neither ends the run promptly nor survives as exit 130 [`scripts/drill-2-7-local-stack.mjs:478-482`, `scripts/measure-predict-latency.mjs:976-979`] — an interrupt during `bringUp`'s `waitFor` leaves the loop spinning to its 120 s deadline (each pass a failing `docker exec` after teardown removed the containers), and `main`'s catch then sets `exitCode = 2`; during a `navigate`, the 60 s timer fires, rejects, and `main().catch` (`:1612`) sets `1`. So an interruption records as an infra red or an assertion red — both of which this story's matrix reads as evidence. The pre-existing legacy path at `:547-550` does call `process.exit(130)`.
- [x] [Review][Patch] The drill's re-run contract is unrecorded, and its pins are offseason-only [`drill-2-7-results.md:69`, `scripts/drill-2-7-reconcile.mjs:31-42`, `scripts/measure-predict-latency.mjs:1455`] — leg 1 pins `series: 178` / `nullWinners: 0` and leg 3 asserts the Active group holds exactly one series, both against production; the first real pending series (April 2027) reddens both, and Boundaries · Always forbids a re-pin. `homePending()` additionally reads the D2 markup (`[data-home-pending-series] a`) that Story 4.5's AC replaces. F2 orders rows 3/4/8 re-read on production at that moment, and the "Re-running" note names no precondition.
- [x] [Review][Patch] Every `PredictPage.tsx` line citation this diff invalidated [`src/pages/PredictPage.tsx:409`, `drill-2-7-results.md:34`] — the comment still cites `SERIES_SELECT (:31-45)` (now `src/lib/series-query.ts:13-27`) and `fetchAllGames (:148-180)` (now `:135-167`); results row 7 cites the unfiltered list query at `:150-153` (now `:137-141`). The claims stay true; only the pointers are dead.
- [x] [Review][Patch] W1's closure overstates its evidence, and `audit-archive.mjs` sits outside the smoke loop [`deferred-work.md:310`, `tests/pipeline/venue-backfill.test.ts:596-603`] — the closure line says exits "now go through `process.exitCode` (the Windows 127 race)", but the only recorded execution is the exit-0 path, and the entry being closed asked 2.7 to "verify the exit code it reports, not only the projection". The `node --check` loop covers seven top-level `scripts/*.mjs`; the edited `scripts/spike-2-1/audit-archive.mjs` is not among them, so a syntax break there surfaces only at the owner's next live run.
- [x] [Review][Patch] The proxy's upstream error handler can throw after headers are sent [`scripts/drill-2-7-local-stack.mjs:139-142`] — an upstream failure mid-body (teardown's `docker rm -f`, a container death) reaches `res.writeHead` with headers already written: an uncaught `ERR_HTTP_HEADERS_SENT` kills the drill with a stack and exit 1, not the `InfraError` / exit 2 its own header documents.
- [x] [Review][Patch] Home's pending read fails with no signal at all [`src/pages/HomePage.tsx:68-73`] — `if (error || …) return` and the bare `catch {}` are both silent, so a broken read in April 2027 is indistinguishable from "nothing pending" on the surface the traffic gate depends on. Rendering nothing is the specified UX; a `console.warn` is not a second PostHog call (exception capture stays with Story 3.1's isolation layer).
- [x] [Review][Patch] Step 2's identity check drops Home's link text and href [`scripts/drill-2-7-local-stack.mjs:395-396`] — `sameUi` collapses `home` to `h.id`, although both branches return the same `{href,text,id}` shape from `homePending()`, so a re-run that rendered a different href or label would still read "UI identical to step 1".
- [x] [Review][Patch] The run-when-executed guard exits 0 silently under a symlinked invocation [`scripts/measure-predict-latency.mjs:1604-1606`] — Node realpaths the main module, so `resolve(argv[1])` differs from `import.meta.url` for a shim or symlink, the guard goes false, and the script prints nothing and exits 0. No current invocation does this (`npm run perf:predict` and the drill both pass the real path); `realpathSync` on both sides is cheap insurance for a harness whose silence reads as green.
- [x] [Review][Patch] Leg 4's row records no exit code [`drill-2-7-results.md:20`] — AC 1 requires each drill command's exit code and the matrix header promises codes were "read from the command itself, never off a pipe"; the `gh issue view` / `gh run view` reads show "—".
- [x] [Review][Patch] F2's evidence quotes the pre-review tally [`deferred-work.md:552`] — "proven on fixture data (leg 2, 25/25)" while the shipped matrix row (`drill-2-7-results.md:16`) records 26/26 after the review patches. Found during triage verification, not by a layer.
- [x] [Review][Defer] The probe's new unplaced-winner branch has no executed coverage [`scripts/probe-game7-venues.mjs:292-298`] — deferred: pre-existing coverage gap already re-owned by this story to the Epic 2 retrospective (`deferred-work.md`), whose extraction of the per-match decision into a pure function in `supabase/scripts/pipeline/venueBackfill.ts` is the repo's own path to countable coverage. As filed and verified: the only test touching the script regex-matches its *source text* (`tests/pipeline/venue-backfill.test.ts:708-728`) plus a `node --check` parse, so deleting the `else if` or flipping `!==` to `===` keeps every gate step green — and F3's expected outcome ("no unplaced-winner line") means the branch may never execute in the very run meant to verify it.

#### Pass 2 patches applied (2026-10-06)

All ten applied in one pass on the owner's instruction. `npm run gate` re-run afterwards: **exit 0** — Biome 130 files clean, `tsc -b` clean, Vitest **25 files / 576 tests** (575 plus the one new smoke entry), build keeps the `/predictgame7/` prefix.

1. **Ctrl+C** — both SIGINT handlers now `process.exit(130)` after their synchronous teardown (`scripts/drill-2-7-local-stack.mjs:492-496`, `scripts/measure-predict-latency.mjs:981-984`), so neither `bringUp`'s 120 s `waitFor` nor the harness's 60 s navigation race can outlive the interrupt and let `main`'s catch report 2 or 1 over it. The drill prints its one line *before* teardown, giving it the ~1 s of `docker rm -f` to flush; both file headers now name 130 and the `process.exit` exception to the W1 rule. **Not mechanically verified, and it cannot be on this platform:** measured 2026-10-06, `process.kill(pid, 'SIGINT')` on Windows resolves to `TerminateProcess` — the probe process died with exit 1 in 3 s and printed nothing from the handler; the spawned headless Chrome was gone afterwards, but its `p1-chrome-*` temp profile survived and had to be removed by hand. Only a real Ctrl+C in a terminal delivers the signal here, so pass 1's "Ctrl+C now tears down both the stack and Chrome" was never executed evidence either; that half rests on inspection, before and after this patch.
2. **Re-run contract** — `drill-2-7-results.md` "Notes for the next reader" gained a **Re-run contract** bullet naming the three offseason-only assertions (leg 1's `178` / `1,246` / `nullWinners: 0`, leg 3's "exactly one Active row", `homePending()`'s dependence on the D2 markup Story 4.5 replaces), what reddens them in April 2027, and that the red is F2's cue rather than licence to re-pin.
3. **Dead citations** — `src/pages/PredictPage.tsx:407-411` now cites `fetchAllGames (:135-167)` and `src/lib/series-query.ts` (no line span, so it cannot rot again); `drill-2-7-results.md` row 7 cites `:137-140`. This spec's own Code Map (`:63`) and Boundaries (`:41`) keep their pre-implementation spans on purpose — they are the plan's record, not a live pointer.
4. **W1's closure + the smoke loop** — `deferred-work.md`'s W1 `closed:` line now states its real scope: only the exit-0 path was executed, the sole non-zero path is exit 2 (`audit-archive.mjs:81`, `:186`, no `process.exit` in the file), the anomaly sections *report* rather than judge, so the 127 race is unproven rather than fixed-and-measured. And `spike-2-1/audit-archive.mjs` joined the gate's `node --check` loop (`tests/pipeline/venue-backfill.test.ts:597-606`) — **mutation-checked**: appending `const broken = ;` to the script reddens exactly that test (1 failed / 79 skipped), and the file was restored byte-identical (`git diff` empty).
5. **Proxy mid-body failure** — `scripts/drill-2-7-local-stack.mjs:141-151` guards on `res.headersSent || res.writableEnded` and destroys the response instead of throwing `ERR_HTTP_HEADERS_SENT`.
6. **Home's silent read failure** — `src/pages/HomePage.tsx:69-82` logs `console.error('Error fetching pending Game 7s:', …)` on both the error/non-array path and the throw, matching the sibling reads (`HistoricalPage.tsx:79`, `InsightsPage.tsx:59`); the `cancelled` check moved after it so an unmounted set-state is still skipped, and the render-nothing UX is unchanged (both jsdom error tests still assert `container.innerHTML === ''`). No analytics call: exception capture through the isolated layer stays Story 3.1's.
7. **Step 2's identity check** — `sameUi` is now `JSON.stringify(u)` over every field, so a re-run rendering a different Home label or href reads as a difference.
8. **Run-when-executed guard** — `scripts/measure-predict-latency.mjs:1607-1614` compares `realpathSync` of both sides (`existsSync` first, so an import with a synthetic `argv[1]` cannot throw at load). Both existing pins still hold: `--help` prints the modes on a direct run, and the `--input-type=module -e` import starts nothing.
9. **Leg 4's exit codes** — the seven read-only `gh` reads were re-run on 2026-10-06 and each recorded at **exit 0** in the legs table (stdout redirected to a file, never piped); the row now carries the measured facts: 9 inseason runs all `workflow_dispatch`, 0 `schedule`, 0 offseason runs, #8 closed 2026-10-04T12:29:40Z and #9 opened 12:30:15Z then closed 12:46:13Z. AC row 9 records the re-read.
10. **F2's tally** — `deferred-work.md` now says leg 2 **26/26**, naming it as the post-pass-1 count.

#### Rejected (pass 2)

- `*/rest/v1/series*` over-matches sibling tables such as `series_game_scores`, injecting synthetic rows — **false**: the client reads exactly three tables (`/rest/v1/series` at `PredictPage.tsx:138,173`, `HomePage.tsx:64`, `HistoricalPage.tsx:63`; `insights_cache`; `profiles`). No direct `series_game_scores` read exists in `src/` — only the embed inside `SERIES_SELECT` — so neither the injection nor a `listCall` mis-match has a request to match.
- `PROXY_PORT = 54321` collides with the Supabase CLI's Kong default and "reads as Docker down" — **false**: `:146` rejects with `proxy could not listen on 54321: <EADDRINUSE>`, and the Docker-down path has its own message at `:78`. Loud and accurate, not misdiagnosed.
- The spec's Implementation Notes carry pre-review figures (25/25, 12/12, 569 tests) — **real, rejected on rule**: the fix edits the spec under review. For the owner's own pass: Notes bullet 4 is stale against `drill-2-7-results.md` and the measured 575.
- The sprint-status comment's triage arithmetic ("36 findings — 18 patched, 1 deferred") does not match the log — **false**: the log has exactly 36 rows, of which 18 route unambiguously to `patch`, one (BH-10) is split patch/reject, one defers, and 16 reject.
- The spec's frontmatter says `status: 'done'` while `sprint-status.yaml` says `review` — **real, rejected on rule**: the fix edits the spec under review, and pass 1's BH-7 already ruled that the story moves on the workflow's own transitions.
- Leg 1 counts a tied game 7 as a home loss and never asserts ties = 0 — **false**: `home_score`/`away_score` are `NOT NULL` (`00005:47-53`), and `audit-archive.mjs:138,144` measures and prints `home_score == away_score` in the *same* leg (matrix row 2, exit 0, "0 integrity anomalies"). A tie displacing a home win also reddens the 117 pin itself.
- Home ships copy and visual treatment against Boundaries · Never, and its `'Team A'/'Team B'` fallback can render placeholders — **rejected**: the boundary question's fix is to reconcile D2 against the Never list in the spec, and the fallback half is **false** — `series.team_a_id INTEGER NOT NULL REFERENCES teams(id)` (`00005:30`) means the embed always resolves, and `|| 'Team A'` is the app-wide convention (`PredictPage.tsx:293,445,487`).
- Leg 3 should assert the synthetic rows stay off `/historical` — **low, not worth the fix**: `HistoricalPage.tsx:63-67` filters `.not('winner_team_id','is',null)`, which is exactly the pass-through the override implements at `:1431`, so no leak is reachable; the fix adds a navigation and an assertion to guard a state nothing demonstrates.
- `readViteEnv` is duplicated a fourth time and cannot handle quoted values — **low, not worth the fix**: the fix is an extraction across gate-unchecked scripts, and a quoted value fails loudly (invalid URL → `catch` → exit 2), not silently.
- `openBrowserSession` accumulates `exit`/`SIGINT` listeners per session — **false**: each process opens exactly one session (`main()` dispatches to a single mode; the local-stack drill calls it once at `:360`), so no accumulation and no `MaxListeners` warning is reachable, and the two SIGINT handlers are idempotent (`tornDown` guard at `:178`, try-wrapped `close()`).
- `Fetch.fulfillRequest` hard-codes `responseCode: 200` and masks the upstream status — **false**: only array-bodied responses reach the rewrite (`:1432` passes everything else through), and no `series` read in the app uses `.range()`/`.limit()`, so PostgREST answers 200; there is no 206 or array-bodied error to mask.
- EC-2's pass-1 rejection rests on a wrong claim about the `postgres:16` entrypoint — **real, rejected on rule**: the correction lands in this spec's Review Triage Log. The technical point stands (the entrypoint does create `POSTGRES_DB` on the temporary init server), and the consequence is benign: the race yields an `InfraError` / exit 2, never a false green.
- Leg 2's PostHog containment rests on the `*posthog*` glob because `openBrowserSession({})` passes no `analyticsHost` — **low, not worth the fix**: `.env` sets `VITE_POSTHOG_HOST=https://us.i.posthog.com`, which the glob contains, so the recorded run leaked nothing; the harm needs a future non-`posthog` host, and the fix means a fourth `readViteEnv` copy or a new export from the harness.

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

Pass 2, 2026-10-06: the owner's fresh-context external review on a different model.

| ID | Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| EXT-D1 | The epic's Given premise ("this drill runs the venue probe") was not met, and its substitute F3 was the only owner-owed item with no date, short of this spec's own AC ("owner-owed with date") | medium | resolved | Real, with one mis-citation: the "owner-owed with date" wording is this spec's AC (Tasks & Acceptance), not `epics.md:456`, which is the Given clause. Resolved by running it, not by dating it: the owner ran the probe on 2026-10-06, and 160/160 lines match `game7_venues_curated.csv` with no unplaced winner. F3 closed. |

## Verification

**Commands:**
- `node scripts/spike-2-1/audit-archive.mjs` and `node scripts/drill-2-7-reconcile.mjs` -- expected: exit 0 against production.
- `npm run preview` then `node scripts/measure-predict-latency.mjs --fake-pending` / `--fake-short` -- expected: exit 0.
- `npm run gate` -- expected: exit 0.
