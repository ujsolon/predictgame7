# Workflow inventory — Story 2.6

What exists today, what this story adds, and the mechanics every workflow shares. The decisions each row implements are recorded in `decisions.md`; the failure semantics are in `failure-modes.md`.

## Already in the repo (read-only baseline)

| File | Trigger | Permissions | Secrets used | Failure signal |
|---|---|---|---|---|
| `.github/workflows/ci.yml` | push to `master`, pull_request | `contents: read` | none | reports only — no branch protection, so nothing blocks |
| `.github/workflows/keepalive.yml` | cron `0 9 * * *`, `workflow_dispatch` | default | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | step exits 1, names missing secrets (`:16-19`); no notification |
| `.github/workflows/nightly-gate.yml` | cron `30 3 * * *`, `workflow_dispatch` | `contents: read`, `issues: write` | none | opens/comments an issue `Nightly gate is red` (`:43-56`) — the pattern this story reuses |

`keepalive.yml` is not modified (constraint). `nightly-gate.yml` is edited once — its issue-opening step becomes a call to the shared composite action (D-4 = B); its trigger, cron, and semantics are unchanged.

## Added by this story

| File | Trigger | Runs | Secrets used | On non-zero |
|---|---|---|---|---|
| `pipeline-inseason.yml` | cron `30 9 16-30 4 *`, `30 9 * 5 *`, `30 9 1-30 6 *` (D-5: three lines, because a cron day-of-month range cannot span mid-April through June in one) + `workflow_dispatch` | the runner at `--source=nba_com --require-feed` — the alarm flag is passed by this file, never defaulted in code; the refresh fires automatically only when that run filled a winner (Story 2.5's trigger) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | issue, per CAP-3; an empty feed is red here and only here, per D-3 |
| `pipeline-offseason.yml` | cron `30 9 12 4 *` and `30 9 25 6 *` — the bracket edges, deliberately **outside** the alarm window so a legitimately empty feed stays green — + `workflow_dispatch` | the same command at `--source=nba_com` with **no** `--require-feed`. No new code path: FR-20's initialize/finalize is one idempotent run over the postseason feed, placed at the edges | same | issue, per CAP-3 |
| `migration-rehearsal.yml` | push to `master` and pull_request, path-filtered to `supabase/migrations/**`, `scripts/rehearse-migration-00014.mjs`, `supabase/scripts/pipeline/venueBackfill.ts` (D-2 = B) — **OPEN after review: the rehearsal also reads `supabase/scripts/pipeline/data/game7_venues_curated.csv` (`rehearse-…:511`, `:559`) and `docs/NBASeriesResults.xlsx` (`:332`), which this filter does not watch. The three-path set is owner-closed text, so widening it is the owner's call, not the build's — see `deferred-work.md`, Story 2.6 section** | `node scripts/rehearse-migration-00014.mjs` on `ubuntu-latest`, which ships Docker and pulls `postgres:16` | none — it talks only to a throwaway container | issue, per CAP-5 |
| `.github/actions/notify-failure/` | — (a local composite action, not a workflow) | the one definition of "loud": open the titled issue if none is open, else comment on the open one, and link the run | none — it uses `github.token` | — |
| `run.ts` flag | — | `--require-feed`: exit 2 when the selected adapter's `describeRun` report carries `feedSeriesCount: 0`; refuses up front with `--source=manual_csv` (that adapter declares no report, so the check could only pretend to run) and joins the `unknownFlag` allowlist (`run.ts:117-126`) | — | — |

## Mechanics every added workflow shares

- **Node**: `actions/setup-node@v4` with an explicit `node-version: 24.x` (or a pinned `22.x` at or above 22.18) — `run.ts` needs native type stripping and `ci.yml`'s float is not evidence.
- **Install**: `npm ci --omit=dev`. The runner imports `@supabase/supabase-js` (`writer.ts:17`), which is a `dependencies` entry, so no dev install is needed; `--env-file=.env` must **not** appear in the command line — there is no `.env` on a runner and Node treats a missing env-file as fatal.
- **Invocation**: `node supabase/scripts/pipeline/run.ts --source=nba_com [flags]`, env supplied from the `env:` block — the flags are built in bash from the step's env so a scheduled run and a dispatch can differ without two job bodies. Exit contract as shipped: `0` success including an empty plan, `2` any refusal or failure (`run.ts:172-180`).
- **Secrets guard**: fail fast with a named message when a required secret is empty, as `keepalive.yml:16-19` does, so an absent or rotated key never surfaces as a fetch error (CAP-4).
- **Concurrency**: one shared `concurrency` group across both pipeline workflows, `cancel-in-progress: false`, so an offseason dispatch and a daily inseason run cannot interleave a completion write.
- **Permissions**: `contents: read`, `issues: write` — nothing wider.
- **Ceiling**: every added job declares `timeout-minutes` (20 for the two pipeline jobs, 30 for the rehearsal, whose `postgres:16` pull is the slow part). Without one a stalled install or pull never *fails*, so `if: failure()` never fires and the shared `pipeline-writes` group — which queues rather than cancels — lets a single hang block every later cron. A hang is the only failure shape this design would otherwise be deaf to, and `run.ts`'s own fetch loop (25 s × 3 attempts) cannot bound it.
- **Dispatch inputs**: `dry_run` (boolean, default false) mapping to `--dry-run`, so the owner can fire the schedule by hand against the live endpoint and see the plan with zero writes; `source` (choice, default `nba_com`) so the deliberate-failure run below is reachable through the workflow's own surface rather than by editing YAML on a branch. `source` and `require_feed` exist **in the inseason file only** — the offseason file's whole decision is that it passes no alarm, so giving it a `require_feed` input would contradict it, and giving it `source` would only offer a second way to run the one command it exists to run. Consequence for the run sheet below: both failing dispatches are fired from `pipeline-inseason.yml`. The flag is added when `github.event_name == 'schedule' || inputs.require_feed` — a scheduled trigger sends no inputs, so the cron path always alarms while a hand dispatch alarms only when the operator asks it to. That expression is what keeps CAP-2 (the October dry dispatch is green) from contradicting CAP-6 (the alarm is provable before April). `--refresh-insights` is deliberately **not** exposed: U10 makes it an operator-only action and a workflow input would turn it into an automatic one.
- **Notification step**: `if: failure()` on every added workflow, delegating to `.github/actions/notify-failure/` with the title argument `Pipeline inseason run failed` / `Pipeline offseason run failed` / `Migration rehearsal failed`. The action comments on the open issue instead of duplicating, and links `github.server_url/github.repository/actions/runs/github.run_id`. The behaviour is `nightly-gate.yml:43-56`'s, moved **behaviour-for-behaviour rather than verbatim**: a composite `with:` value is expression context, so `${GITHUB_SHA:0:7}` could not be computed there and `github.sha` is the full 40 characters. The action therefore appends the run link and the `Commit: <short-sha> on <branch>` footer itself, which means the nightly issue body lost those two lines from its prose and gained them as a footer. Its dedupe lookup runs `gh issue list … || true`: the runner's bash is `-e`, so an unguarded failed lookup would abort the step *before* the create branch and leave a broken cadence with a red check and no issue — the one silence SM-4 exists to end, and a duplicate issue is the cheaper error beside it. One definition of "loud" is what CAP-3's dedupe test reads, and `tests/pipeline/workflows.test.ts` pins that no `gh issue` call survives in any workflow run block. The run log is expected to carry the adapter's report lines because `run.ts` prints them before planning (`:330-341`).

## Deliberate-failure verification (CAP-3, zero writes)

Prove the notification without touching data, in this order. Five steps: four `workflow_dispatch` runs (1, 2, 4, 5) and one confirmation (3). All four dispatches are fired from **`pipeline-inseason.yml`** — it is the only pipeline file with a `source` input, which is what makes a refusal reachable from the UI.

1. Dispatch `pipeline-inseason.yml` with `source=fantrax` — a recognised-but-unimplemented adapter (`port.ts:150`) whose assertion fires at `run.ts:273`, before the sink opens at `:308`, so the run is red with zero HTTP to the database.
2. Dispatch `pipeline-inseason.yml` with `source=manual_csv` and `require_feed=true` — the new flag's up-front refusal (`run.ts:297`), reachable today and independent of feed state, so the alarm's own contract gets a red run in October rather than only in April. (`--dry-run` may be left false; the refusal precedes any write either way.)
3. Confirm the issue appears and links the run.
4. Confirm a second deliberate failure comments on the open issue rather than opening another.
5. Close the issue, re-run deliberately, and confirm a fresh issue opens — the dedupe must not swallow a *new* breakage.

A `--dry-run` run is **not** a failure test: it exits 0. The path chosen must be the one that exits 2 before any write is possible.
