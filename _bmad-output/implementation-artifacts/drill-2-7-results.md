# Story 2.7 — Simulated playoff week: results matrix

**Run:** 2026-10-05, on `master` at `94b4988` plus the Story 2.7 working tree. Spec: [spec-2-7-epic-verification-simulated-playoff-week.md](spec-2-7-epic-verification-simulated-playoff-week.md). ACs: `epics.md:456-462`.

**Verdict:** every AC clause has evidence. Two halves can only be produced by real 2027 playoff data and are **owner-owed with a date**, not faked: the first scheduled cron fire, and a write from the real `espn` feed. Both are filed below.

Exit codes were read from the command itself, never off a pipe.

## The four legs

| Leg | Command | Against | Exit | Result |
| --- | --- | --- | --- | --- |
| 1 — reconciliation | `node scripts/drill-2-7-reconcile.mjs` | production, anon REST GET only | **0** | 16/16 figures reconciled |
| 1 — audit | `node scripts/spike-2-1/audit-archive.mjs` | production, anon REST GET only | **0** | 178 × 7, AD-4 premise 178/178, 0 integrity anomalies (red since `00014` on `status`; fixed here) |
| 1 — UI half | `node scripts/measure-predict-latency.mjs --archive-read` | `npm run preview` → production | **0** | 7/7 |
| 2 — write leg (D1) | `node scripts/drill-2-7-local-stack.mjs` | throwaway Docker stack: `postgres:16` + `postgrest:v12.2.3`, 00001–00018 replayed over the 178×7 fixture | **0** | 26/26 (after review patches; 25/25 before) |
| 3 — §6.5 (c) | `node scripts/measure-predict-latency.mjs --fake-pending` | `npm run preview` → production, `series` response rewritten in the browser | **0** | 19/19 at 1440×900 |
| 3 — §6.5 (c), mobile | `node scripts/measure-predict-latency.mjs --fake-pending --viewport 390x844` | same | **0** | 19/19 at 390×844 |
| 3 — short row | `node scripts/measure-predict-latency.mjs --fake-short` | same | **0** | 13/13 (12/12 before the review made `captureException` a checked assertion) |
| 4 — failure drill (D3) | `gh issue view 8 / 9`, `gh run view …` (read-only) | GitHub | — | dispatch evidence confirmed; scheduled half owner-owed |
| gate | `npm run gate` | local | **0** | Biome 130 files; `tsc -b`; Vitest 25 files / 575 tests; build keeps `/predictgame7/` |
| venue probe | `node scripts/probe-game7-venues.mjs` | nba.com `leaguegamelog`, read-only | owner-run | the repo's pattern is that agents never run this probe (its own header); ECH-1 fixed in it first; see F3 |

## AC clause by clause

| # | AC clause (`epics.md`) | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | **Given** Stories 2.1–2.6, 2.12, 2.13 complete | PASS | `sprint-status.yaml`: all `done` before this story started. |
| 2 | **When** the drill runs: scheduled trigger fired manually, real or fixture source data through to the live UI | PASS (fixture) · owner-owed (real) | The scheduled workflow fired by hand on the `espn` source: run `37235646137` (`workflow_dispatch`, success, 2026-10-04), a non-dry green with 0 writes because no game was played that day. The **write path** ran on fixture data through the shipped runner (`run.ts --source=manual_csv`, 00015's RPCs) into a production bundle served from the throwaway stack (leg 2). A write from the **real** `espn` feed needs a live bracket; it is filed as owner-owed (row F2 below). |
| 3 | Active Series render distinctly from Historical **through the derivation** — present because of six score rows + NULL winner; leaves Active and enters the archive on the single write that fills the winner | PASS | Leg 2 step 1: one 2027 row with 6 score rows and a NULL winner → "Current Game 7s" lists `BOS vs MIA`, Home links it, `/historical` stays 178 with no 2027 row. Step 3: `COMPLETE … append game 7 (105-99) and fill winner_team_id=2 … one RPC, one transaction` → BOS/MIA gone from Active, listed on `/historical` (179). No status flag exists to read (`00014`). Leg 3 shows the *entry* half against the production read path: a six-row / NULL-winner series renders as Active. Leg 3 cannot show the exit, because a browser rewrite performs no write. The exit is proven only by leg 2. |
| 4 | Scores update after a run | PASS | The only write 00015 allows on a pending series is the completion (game 7 + winner); games 1–6 are fixed at birth, and a disagreeing re-feed is refused, not rewritten. So "scores update" is read as that write. Leg 2 step 3: the record reads `…G695104G710599 Series Winner Boston Celtics`; the insight cards go 160/117 → 161/118 (00017's refresh fired on the winner-filling run). Step 4: road win `97-101`, cards → 162/118 (home wins unchanged). |
| 5 | Archive reconciles: 178 series / 1,246 rows / seven each; 159 NBA + 1 BAA + 18 ABA; 117 G7 home wins over the 160 NBA/BAA | PASS | Leg 1 against production: every figure measured equal to its pinned literal, including null winners 0, NULL league 0, 43 home losses, and `insights_cache` `total_game_sevens` = 160 on both cards. |
| 6 | League chip and record gloss exercised; 178 and 160 shown side by side (shown, not filtered) | PASS | `--archive-read`: "Showing 10 of 178 series." → 178/178 rendered; chips on 19 rows (18 ABA + 1 BAA), none on NBA; the BAA record repeats its chip and carries the gloss; an NBA record has neither; `/insights` reads 160 Game 7s and 117 of 160. Printed together: *178 − 18 ABA = 160*. |
| 7 | §6.5 re-scored: option (c) fakes **six score rows + null winner**; option (a)'s warning stands | PASS | `--fake-pending`: Active group renders the synthetic row, empty copy absent, year card `2027 Current`, readout games 1–6 team-relative, predict request carries six games and the deployed `predict-game-7` answered 200, `series_selected` / `prediction_generated` report `series_source: 'current'`, `?series=<id>` preload resolves and predicts as `current`. `--fake-short`: a five-row / NULL-winner row is excluded from every group and from Home, `Non-reconciling series:` is logged, and `captureException` is sent (decoded locally, a checked assertion). The same passes at 390×844. Option (a) stays withdrawn: the picker list query is still unfiltered (`PredictPage.tsx:150-153`), and the drill seeded nothing in production. |
| 8 | Pending-Game-7 data reach on Home: present, and its card resolves to that series' preview page | PASS | Built here (D2): `PendingGameSevens` in `HomePage.tsx`, read through the shared `SERIES_SELECT` and `isSeriesPending`. Leg 3: one link `/predictgame7/predict?series=<id>`; following it lands on the preloaded series. Leg 2: the link appears at birth, moves to the next pending series, and disappears when none is pending. That absence is asserted only after Home's own pending read has landed. 9 jsdom tests (`src/pages/__tests__/home-pending.test.tsx`; `textContent`/`href` only). Cost: every Home load now makes one anon `series` read (zero rows while nothing is pending). Visual treatment and the AA floor stay Story 4.5's; that ordering is filed as F4. |
| 9 | Failure drill: pipeline forced to fail → notification received within one cron cycle | PASS (dispatch) · owner-owed (scheduled) | Re-read from GitHub 2026-10-05: issue **#8** "Pipeline inseason run failed" opened 2026-10-03 and gathered 6 "Still red:" comments; after it was closed, run `37202299383` (deliberate red) opened a **fresh** issue **#9**; run `37199559809` is the `source=fantrax` registry-refusal red. All 9 `pipeline-inseason.yml` runs to date are `workflow_dispatch`. **No cron has ever fired** (`schedule` runs from the default branch only; first slot 2027-04-12 offseason / 2027-04-16 inseason), filed as F1. |
| 10 | Failures found are fixed or filed before the epic is marked done | PASS | Fixed: the `status` projection in `audit-archive.mjs` (W1); ECH-1 in `probe-game7-venues.mjs` (owned by 2.7); the harness defects below. Filed: F1–F4. Re-owned: the venue probe's per-match unit test, to the Epic 2 retrospective. The `Counter=1000` ceiling is `nba_com`-only and leaves the scheduled path with Story 2.13, so it stays with hand runs. No product defect was found. |

## What the drill fixed in its own instruments

None of these changed product code. Each one made a check that was failing for the wrong reason into a real check.

- **The CORS preflight read as "list not rewritten".** The `OPTIONS` preflight reaches the Fetch Response stage with no JSON body. It now passes through unrecorded.
- **PostHog's bot filter.** posthog-js drops every capture from a `HeadlessChrome` user agent, so `series_source` could never be read. The session now presents a plain Chrome UA. Events are still answered locally, and none reached the PostHog project.
- **PostHog endpoint answers.** `/flags` and remote config need bodies the SDK accepts, and preflights need `Allow-Methods`/`Allow-Headers`. Without them the SDK kept its queue parked or retried forever.
- **The preload check read the wrong element.** The series trigger keeps its "Select a Series" label, so the preload check now reads the Games 1–6 readout. The Home href check now accepts the router's `/predictgame7/` basename.
- **Review pass (2026-10-05).**
  - `captureException` is now a checked assertion.
  - Home's absence is read only after its pending read has landed; it used to be a fixed 4 s sleep.
  - The idempotency fingerprint covers every column.
  - The UI is re-read after the re-run.
  - Ctrl+C now tears down both the stack and Chrome.
  - The 60 s navigation timer no longer holds a finished run open.
  - The three harnesses joined the gate's `node --check` smoke, with two tests pinning the run-when-executed guard (both mutation-checked).
- **Fail-fast probe in the Docker drill.** A stopped Docker Desktop makes the CLI hang, so the drill probes `docker version` with a 20 s ceiling. If PostgREST never comes up, it prints PostgREST's logs. The first attempt on 2026-10-05 timed out at 120 s on a fresh image pull and passed on the immediate re-run.

## Filed (owner-owed, dated)

| ID | What | When / who | Where filed |
| --- | --- | --- | --- |
| F1 | First **scheduled** fire of `pipeline-inseason.yml` (and the D-7 glance at Actions history for an un-run cron). A scheduled red must open or comment on the issue within that cron cycle. | Owner, 2027-04-16 07:30 UTC (offseason edge 2027-04-12) | `deferred-work.md` → "Story 2.7 owner-owed" |
| F2 | First write from the **real** `espn` feed: a certified 3–3 is born by the scheduled run and later completed, and the matrix rows 3/4/8 re-read on production. | Owner, first 3–3 of the 2027 playoffs | `deferred-work.md` → "Story 2.7 owner-owed" |
| F3 | Re-run the venue probe (the reason Story 2.12 preceded this drill) with ECH-1 fixed: `node scripts/probe-game7-venues.mjs`. Expected: every line matches `game7_venues_curated.csv`, and no unplaced winner. | Owner, any time | `deferred-work.md` → "Story 2.7 owner-owed" |
| F4 | Home's pending block goes live at the first real 3–3 with only its D2 data-reach markup. Story 4.5's AA floor and treatment should land before 2027-04-16. | Story 4.5, before 2027-04-16 | `deferred-work.md` → "Story 2.7 owner-owed" |

## Notes for the next reader

- The fixture archive's `game_6_winner_stats` counts 0 wins at baseline (the runner's census printed `game-6 winners won 0` at 161). Its games 1–6 are synthetic shapes from the curated venue CSV, not real scores. This is a property of the rehearsal fixture, and the drill asserts no game-6 figure. Production's real value is untouched.
- Re-running: legs 1 and 3 need `npm run preview` (port 4173) and `.env`'s anon key. Leg 2 needs Docker Desktop with the engine up (`docker ps` answers) and Chrome. It tears down its containers, network and `dist-drill-2-7/` itself. Pass `--keep` to look at `http://localhost:4174/predictgame7/` by hand.
