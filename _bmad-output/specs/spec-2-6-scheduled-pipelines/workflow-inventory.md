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
| `migration-rehearsal.yml` | push to `master` and pull_request, path-filtered to `supabase/migrations/**`, `scripts/rehearse-migration-00014.mjs`, `supabase/scripts/pipeline/venueBackfill.ts` (D-2 = B) | `node scripts/rehearse-migration-00014.mjs` on `ubuntu-latest`, which ships Docker and pulls `postgres:16` | none — it talks only to a throwaway container | issue, per CAP-5 |
| `.github/actions/notify-failure/` | — (a local composite action, not a workflow) | the one definition of "loud": open the titled issue if none is open, else comment on the open one, and link the run | none — it uses `github.token` | — |
| `run.ts` flag | — | `--require-feed`: exit 2 when the selected adapter's `describeRun` report counts zero series; refuses up front with `--source=manual_csv` (no report to check) and joins the `run.ts:109` allowlist | — | — |

## Mechanics every added workflow shares

- **Node**: `actions/setup-node@v4` with an explicit `node-version: 24.x` (or a pinned `22.x` at or above 22.18) — `run.ts` needs native type stripping and `ci.yml`'s float is not evidence.
- **Install**: `npm ci --omit=dev`. The runner imports `@supabase/supabase-js` (`writer.ts:17`), which is a `dependencies` entry, so no dev install is needed; `--env-file=.env` must **not** appear in the command line — there is no `.env` on a runner and Node treats a missing env-file as fatal.
- **Invocation**: `node supabase/scripts/pipeline/run.ts --source=nba_com [flags]`, env supplied from the `env:` block. Exit contract as shipped: `0` success including an empty plan, `2` any refusal or failure (`run.ts:159-163`).
- **Secrets guard**: fail fast with a named message when a required secret is empty, as `keepalive.yml:16-19` does, so an absent or rotated key never surfaces as a fetch error (CAP-4).
- **Concurrency**: one shared `concurrency` group across both pipeline workflows, `cancel-in-progress: false`, so an offseason dispatch and a daily inseason run cannot interleave a completion write.
- **Permissions**: `contents: read`, `issues: write` — nothing wider.
- **Dispatch inputs**: `dry_run` (boolean, default false) mapping to `--dry-run`, so the owner can fire the schedule by hand against the live endpoint and see the plan with zero writes; and `source` (choice, default `nba_com`) so the deliberate-failure run below is reachable through the workflow's own surface rather than by editing YAML on a branch. A scheduled trigger never sends inputs, so cron always runs the declared default. `--refresh-insights` is deliberately **not** exposed: U10 makes it an operator-only action and a workflow input would turn it into an automatic one.
- **Notification step**: `if: failure()` on every added workflow, delegating to `.github/actions/notify-failure/` with the title argument `Pipeline inseason run failed` / `Pipeline offseason run failed` / `Migration rehearsal failed`. The action comments on the open issue instead of duplicating, and links `github.server_url/github.repository/actions/runs/github.run_id` — the behaviour `nightly-gate.yml:43-56` already implements, moved there verbatim so one definition of "loud" is what CAP-3's dedupe test reads. The run log is expected to carry the adapter's report lines because `run.ts` prints them before planning (`:285-292`).

## Deliberate-failure verification (CAP-3, zero writes)

Prove the notification without touching data, in this order:

1. Dispatch the workflow with `--source=fantrax` — a recognised-but-unimplemented adapter (`port.ts:133`) whose assertion fires at `run.ts:241`, before the sink opens at `:263`, so the run is red with zero HTTP to the database.
2. Dispatch with `--source=manual_csv --require-feed` — the new flag's up-front refusal, reachable today and independent of feed state, so the alarm's own contract gets a red run in October rather than only in April.
3. Confirm the issue appears and links the run.
4. Confirm a second deliberate failure comments on the open issue rather than opening another.
5. Close the issue, re-run deliberately, and confirm a fresh issue opens — the dedupe must not swallow a *new* breakage.

A `--dry-run` run is **not** a failure test: it exits 0. The path chosen must be the one that exits 2 before any write is possible.
