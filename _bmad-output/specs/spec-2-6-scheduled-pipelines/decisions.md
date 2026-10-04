# Decisions — Story 2.6

All seven were closed by the owner on 2026-10-03; each answer is marked **DECIDED** below and the options tables stay as the record of what was rejected and why. Nothing in this file is open.

## D-1 — Where `service_role` lives for Actions

| Option | What it buys | What it costs |
|---|---|---|
| **A. Repository secret** `SUPABASE_SERVICE_ROLE_KEY`, the same store already holding `SUPABASE_URL` and `SUPABASE_ANON_KEY` (proved reachable by `keepalive.yml`) | one screen to audit; available to every added workflow and to a hand dispatch; fork PRs never see it | two copies of one secret exist (local `.env` and Actions) — a rotation must move both |
| B. Repository **variables** (`vars.*`) | — | wrong tool: variables are plaintext in the workflow context |
| C. Environment secret behind a required reviewer | an approval gate per run | an approval per daily run — CAP-2's whole point is that no human is in the loop. Rejects |
| D. Org secret / GitHub App token | multi-repo reuse, short-lived credentials | infrastructure for a solo repo |
| E. Reuse `VITE_SUPABASE_ANON_KEY` | no new secret | cannot work: the write RPCs and `pipeline_refresh_insights_cache` are granted to `service_role` only (`00015` Decision 2, `00017:145-148`) and `insights_cache` has no write policy, so an anon-key run fails at the writes by design |

**DECIDED (owner, 2026-10-03): A.** Repository secret `SUPABASE_SERVICE_ROLE_KEY`, the same store `keepalive.yml` already proves reachable. Re-states nothing about NFR-S1; it is the shape the repo already uses. The runbook line stays: rotate in the store **and** in `.env`, and mode 6 in `failure-modes.md` is what proves a missed half.

## D-2 — What executes the Docker rehearsal

The rehearsal (`scripts/rehearse-migration-00014.mjs`, `COVERED_THROUGH = 17`) needs only Docker plus `postgres:16`, both present on `ubuntu-latest`. Its **fixture half already runs in the gate** — `tests/pipeline/venue-backfill.test.ts` spawns `--fixture-report`, which needs no container (`:507`). What is unautomated is the replay-and-guards half.

| Option | Coverage | Cost |
|---|---|---|
| A. Step in `ci.yml`, every push and PR | maximal | a container pull and replay on docs-only pushes, and mode 12 infra reds now land in the same log the developer reads |
| **B. Path-filtered `migration-rehearsal.yml`** — push to `master` + PR touching `supabase/migrations/**`, `scripts/rehearse-migration-00014.mjs`, `supabase/scripts/pipeline/venueBackfill.ts` (the generator that emits migration `VALUES`) | runs exactly when the verdict can expire | a new workflow file; no defence against runner-image drift between changes |
| C. Nightly job | catches image drift | a daily container, and a broken replay sits red up to a day after the commit |
| D. B + C | precise and drift-catching | both costs |
| E. Nothing; Story 2.7 gets a manual gate | zero | this is the debt that arrived here (`deferred-work.md:279-280`) — "believed because it passed once" |

**DECIDED (owner, 2026-10-03): B.** Path-filtered `migration-rehearsal.yml` on `supabase/migrations/**`, `scripts/rehearse-migration-00014.mjs`, and `supabase/scripts/pipeline/venueBackfill.ts`. The verdict expires on a migration edit, so the trigger is a migration edit; C stays unbought — if runner-image drift ever reddens `master`, that's the argument for adding a nightly run then, not now. CAP-5's "wherever its verdict can expire" resolves to this file's `on:` block.

**Widened by the owner, same day, on Story 2.6's review finding #6.** `scripts/rehearse-migration-00014.mjs` also reads `supabase/scripts/pipeline/data/game7_venues_curated.csv` (`:510`, `:558` — the fixture seed and the pinned-coverage cross-check at `:505`) and `docs/NBASeriesResults.xlsx` (`:332` — the real scores U11 required), so B's enumeration grows from three paths to five and the trigger set equals the rehearsal's input set. The shape of B is unchanged — path-filtered, no nightly, no `ci.yml` step — and the accepted cost is one container run on a venue- or sheet-edit. The alternative the owner rejected is the misattribution: a data edit that expires the verdict, then goes red on the next unrelated migration commit.

## D-3 — How an empty feed alarms

The asymmetry that must survive any choice: an empty **plan** is legitimate (a day with no completed games), while an empty **feed** from `nba_com` inside the window is the anomaly. And `manual_csv` declares no `describeRun` (`run.ts:285-292`), so it prints no counts line to key anything on.

| Option | Mechanism | Failure mode of the mechanism itself |
|---|---|---|
| A. Workflow greps the log for `0 series in feed` | zero code change | a copy edit to `countsLine` (`adapters/nbaCom.ts:530-534`) silently turns the check into one that never matches — the hole reopens as green |
| **B. A runner flag the workflow declares** (e.g. `--require-feed`): exits 2 when the selected adapter's report counts zero series, and refuses up front with `--source=manual_csv` because there is no report to check (same "refuse rather than silently discard" rule as `run.ts:248-255`) | tested in `tests/pipeline/run.test.ts` without a runner; fails loudly on its own contract | a small runner change, and a flag the frozen Story 2.4/2.5 flag allowlist (`run.ts:109`) must be taught to accept |
| C. Accept silence; the owner reads the daily log | zero | contradicts AD-5 naming silent in-window staleness as the thing to prevent |

**DECIDED (owner, 2026-10-03): B — `--require-feed`.** The runner exits 2 when the selected adapter's `describeRun` report counts zero series, and refuses up front when paired with `--source=manual_csv` (no report to check). Declared by the inseason workflow rather than defaulted on — that is what keeps the runner date-blind while making zero-rows-a-failure depend on the window. Joins the `run.ts:109` flag allowlist; tested in `tests/pipeline/run.test.ts`, so it needs no runner.

## D-4 — Shared notify step, or a third copy

`nightly-gate.yml:43-56` already implements "open an issue, else comment on the open one". This story adds two or three call sites.

- **A.** Copy the block into each new workflow. Smallest diff, no edits to shipped files, and the copies drift the first time the dedupe rule changes.
- **B.** One local composite action (`.github/actions/notify-failure/`) called by the new workflows **and** by `nightly-gate.yml`. One definition of "loud"; it edits a shipped workflow (permitted — the AC forbids touching `keepalive.yml` only) and adds a path-based `uses:` to review.
- **C.** A reusable `workflow_call` workflow. Heavier than one step justifies.

**DECIDED (owner, 2026-10-03): B.** One local composite action at `.github/actions/notify-failure/`, called by the new workflows **and** by `nightly-gate.yml`. Three call sites is the point where a copy stops being a copy; the shared step is also the one place CAP-3's dedupe rule lives. `nightly-gate.yml` is editable (the AC forbids touching `keepalive.yml` only).

## D-5 — What bounds the window crons, and who re-declares them

Facts that constrain the answer: `deriveSeason` (`adapters/nbaCom.ts:111-114`) returns `Y-1`–`Y` for Jan–Jun and `Y`–`Y+1` for Jul–Dec, so any run up to June 30 asks for the postseason being played, and a July run asks for one that has not happened. The runner is idempotent, so extra runs are harmless — except that D-3's alarm makes an empty feed *fail*, and an empty feed is legitimate in early April.

| Option | What it means | Residual risk |
|---|---|---|
| **A. One bracket, generous on both ends** — daily inseason cron across roughly mid-April to June 20/30, alarm always on inside it, offseason workflow dispatched at the true start and end | the cron line stays the only date expression; nobody re-declares it annually | a leading-edge false issue in a year when the postseason feed is still empty on the bracket's first day — one human read, then the YAML moves |
| B. Bracket cron + a YAML date the owner edits each spring to the confirmed start, consulted by the workflow to decide whether to pass the alarm flag | no false alarm | one human action per year, and a second date expression outside the cron line, which is what the date-blindness constraint exists to keep singular |
| C. Cron runs daily year-round, alarm off, `workflow_dispatch` drives the window | simplest YAML | CAP-6 is then unmet and mode 1 stays silent all season |

**DECIDED (owner, 2026-10-03): A**, with the bracket fixed rather than approximate: `09:30 UTC` daily across **April 16–30, all of May, and June 1–30** — three cron lines, because a cron day-range cannot express "mid-April through June" in one. `--require-feed` is passed on all three. The time sits after the existing 09:00 UTC keepalive so a sleeping instance is not the cadence's failure mode. 09:30 also leaves the bracket's leading edge free to move a week without touching the schedule. Story 2.7's drill confirms the real 2027 first-non-empty-feed date, so the leading edge gets measured rather than assumed. Note what was load-bearing on the other: **D-3 and D-5 were decided together** — the alarm is only sound inside a bracket that makes an empty feed an anomaly.
`[Amended 2026-10-04 by owner call, Story 2.13: the slot moves to 07:30 UTC and the keepalive to 07:00 with it, so this ordering reason stands and only the pair shifts. The bracket, the three-line shape, --require-feed's placement and D-7 are unchanged. Argued in _bmad-output/specs/spec-2-13-espn-feed-adapter/schedule-amendment.md, which also records the non-Final margin the earlier slot trades away.]`


The file shape this settles at the same time: **two** scheduled workflow files. `pipeline-inseason.yml` carries the three-window crons and `workflow_dispatch`; `pipeline-offseason.yml` carries two dated crons at the bracket edges (≈April 12 and ≈June 25, outside the alarm window) plus `workflow_dispatch`. Both run the same idempotent command — the initializer/finalizer capability is one runner invocation over a postseason feed, so no separate code path exists to schedule.

## D-6 — The two Story 2.8 carry-overs routed here

Owner rule on the routing (`sprint-status.yaml:130`): split either out at 2.6's planning turn if it does not fit.

- **The context-free `WAS` alias collision** (`venueBackfill.ts:512`, applied at `scripts/probe-game7-venues.mjs:261,276`) — `WAS` is both the approved alias for the 1970s Bullets (→ `WSB`) and the live Wizards abbreviation (`00005:133`), so a future direct-matched modern series can be refused. Fails loud, never wrong.
- **`game7_home_win_census` counting pending series** (`00016:610`, template at `venueBackfill.ts:928`) — the guard's population has no `winner_team_id IS NOT NULL`, so a series born inside a future apply window would abort a later census at ≠160, and the guard's advice is unactionable for a pending series.

Neither fits 2.6: both are `supabase/scripts/**` + `scripts/**` correctness work with no scheduling surface, and 2.6's diff is YAML plus one runner flag. **DECIDED (owner, 2026-10-03): split them out as a new append-only story `2-12-venue-probe-and-census-followup`** (the content of the never-authored `spec-2-8b`), registered in `epics.md` and `sprint-status.yaml` before 2.7 so the drill does not inherit two known probe defects — the alternative of folding both into 2.7's run sheet makes the epic's largest AC set carry fixes that have nothing to do with the drill. Reachability under 2.6 is real but narrow: scheduled 2027 runs give new rows true venues from the adapter (`00017` has no pinned census literal to abort on, `00017:64-65`), so the probe is a spot-check route, not a curation route.

## D-7 — Does an un-run cadence alarm?

Every other mode in `failure-modes.md` is a non-zero exit; this one is the absence of an exit. GitHub does not fire a missed schedule and backfill it, and scheduled workflows on a repo go quiet after 60 days with no activity. SM-4's "zero unhandled data-pipeline failures" reads either way.

- **A. Accept it.** The owner glances at Actions history during the window; Story 2.7's drill institutionalizes the glance. Cost: a schedule that silently stops is exactly the "no human remembering" problem 2.6 was created to end, arriving through a different door.
- **B. A GitHub-native watchdog.** A third cron job (`actions: read`, `issues: write`) that asks `gh run list` whether the previous day's inseason run succeeded, and files the CAP-3 issue if it did not. Covers the absence with no new vendor. Cost: one more workflow, one more permission, and it must itself be watched for absence (a problem that stops recursing only at "a human looks sometimes").
- **C. An external uptime ping.** Rejected — a new vendor for one signal, and the non-goals already exclude it.

**DECIDED (owner, 2026-10-03): A — accepted, not covered.** SM-4 is read as covering failures, not absences, so no capability in this spec alarms on a cadence that never fired. The named owner of the residual is Story 2.7: its epic-verification drill makes the Actions-history glance a documented step of the playoff-week rehearsal rather than a habit. Option B stays available inside 2.6's scope — the watchdog is one more file that reuses CAP-3's shared notify step, so if the owner later reads SM-4 the wider way, adding it breaks nothing decided here. The recursion is honest: a watchdog must itself be watched for absence, and that stops only at "a human looks sometimes".
