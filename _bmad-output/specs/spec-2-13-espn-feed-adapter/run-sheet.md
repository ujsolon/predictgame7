# Run sheet — every live leg, all of them owner-run

Companion to `SPEC.md`. This file exists because the story has two halves and only one of
them is agent-runnable: the adapter, tests, docs and migration text land in a commit, while
every fetch, every dispatch and every `db push` here is the owner's by policy (Constraints).
Each step states the command, what it proves, and what must be pasted back. Nothing on this
sheet may be marked done from inference — a step is green when its run id or its printed
verdict exists.

Order matters at one point only: steps 1–3 before the migration is applied, and steps A–D
only after the re-pointed workflows are on `master` (they dispatch the defaults CAP-1 moves,
so a dispatch fired before the push proves `nba_com`). Pushing is the owner's act; the agent
hands over the command.

## Part 1 — build legs, before `00018` is applied

| # | Command | Proves | Recorded as |
|---|---|---|---|
| 1 | `node scripts/probe-espn-adapter.mjs --date=20260420` then `--date=20260605`, then the range control | CAP-8: the field coverage the adapter depends on is present on real payloads, and the **30-franchise ESPN code table** exists as measurement. This table — not a guess list — is what `00018` seeds. The two known divergences (`NY`→Knicks, `SA`→Spurs) must reappear; any *other* code that differs from `teams.abbreviation` is a new finding and gets its own row in `payload-contract.md`. | Output pasted **verbatim** into the story record; each `espn_code` value in `00018` traces to a line of it. Exit code from the command itself. |
| 2 | `node scripts/rehearse-migration-00014.mjs` with `COVERED_THROUGH` extended through `00018` | The additive column and the partial unique index behave on a throwaway database, including the negative proof that a **duplicate non-null `espn_code` fails the index**, and `EXPECTED_TEAM_COUNT = 59` still holds because no row is inserted. Needs Docker; it is the same harness Stories 2.8/2.12 ran. | The run's verdict block, verbatim. |
| 3 | `npx supabase db push` — **owner only** | `00018` reaches production. The agent never runs `db push`, `db reset`, `db start`, and never points `psql` at `supabase/.temp/project-ref` — that *is* production. | The applied-migration name and date, plus `docs/CURRENT_DATA_MODEL.md` updated in the same commit as the migration file. |

Step 1 gates step 3: seeding `00018` before the cross-check runs would be guessing at codes
the assumption in `SPEC.md` explicitly refuses to keep.

## Part 2 — the four proofs Story 2.6 transferred (owner call C3)

Not new work: these are spec-2-6's `workflow-inventory.md` steps 1 and 5, its rehearsal
dispatch, and its CAP-2 green run — re-pointed because the source they prove changed from
`nba_com` to `espn`. Story 2.6 stays at `review`; none of these gate that review. Each one
needs a **run id** in the record, and zero-write steps need the confirmation that no row moved.

| # | Dispatch (all from `pipeline-inseason.yml` unless noted) | Proves | Status entering this story |
|---|---|---|---|
| A | `source=fantrax`, `dry_run` either way | The registry-refusal path still fires **before** `openSink()` on a real runner, now that `espn` is the default — i.e. CAP-1's re-point did not disarm the guard. Zero HTTP to the database. | Proven twice against the old default (runs `37102521529`, `37102534986`); this is the re-fire after the source change. |
| B | Deliberate red **after** closing issue #8 ("Pipeline inseason run failed") | The dedupe resets on close: a *new* issue opens instead of a `"Still red:"` comment on the closed one. | Issue #8 is open with four `"Still red:"` comments; the reset half has never been shown. Close it, then dispatch. |
| C | `migration-rehearsal.yml`, manual `workflow_dispatch` | The Docker-dependent rehearsal job executes on a runner at least once. `00018`'s push will trigger it via `paths:` anyway, so this dispatch is the independent proof, not a substitute. | Never executed on a runner. |
| D | `source=espn`, `dry_run=false`, `require_feed=true`, fired on a day the owner names | The fetch-and-plan leg on a hosted runner, against the new default, exiting 0. **Accepted as a hollow green (owner call 2026-10-04)** — see the note below. | Cannot fire until the adapter ships and the defaults move. The record must state the hollowness; the write proof belongs to step E. |

Step D's date is not a choice of playoff day. The adapter asks for exactly one day — **the
previous calendar day in `America/New_York`**, computed from the run instant — because the
07:30 UTC cron (owner call 2026-10-04, moved from 09:30; `keepalive.yml` moved with it to 07:00)
fires at 02:30 ET in winter and 03:30 ET in summer, before that day's games tip, so the only
results visible at that hour are the previous evening's. That reasoning is unchanged by the move:
`America/New_York` minus one day gives `20260605` for the measured game stamped
`2026-06-06T00:30Z` at either minute. What the move does change is the margin — see
`schedule-amendment.md`. So "the date you give" is the day you *fire* the dispatch, and ESPN is
asked for the day before it in ET. There is no fixed first-playoff-date to point at; naming one
would be the calendar logic the spec's Non-goals refuse, and the workflow carries no date input.

Why hollow, and what it still proves: in October the asked-for day holds no playoff game, so the
feed either is empty (red — which is the alarm working, not a defect) or is a preseason
`events` array. In the latter case `--require-feed` passes on `feedSeriesCount` counted **before**
exclusions, CAP-4's round parse then excludes every game, and the run exits 0 having written
nothing. That green is real evidence about the fetch, the parse's refusal to invent a series, and
the runner reaching exit 0 on a hosted box — it is **not** evidence that a write happens. Pointing
the same dispatch at a day whose games are already archived is not a workaround: `plan.ts:382-389`
skips an identical archived series or throws if the stored outcome disagrees, so the run either
writes nothing or goes red, and a day whose games are *not* on the table inserts live rows — a
real content change, which is the in-season behavior, not a test.

| # | Dispatch | Proves | Status |
|---|---|---|---|
| E | Story 2.7's simulated-playoff-week drill (fixture date, not a dispatch) | The **write** leg step D cannot show: fetch → plan → RPC write → the archive and `/predict` reflecting it. | Owned by 2.7; listed here so step D's green is never read as this proof. |

## What is already closed

`supabase functions delete feed-egress-probe` — **done by the owner 2026-10-03**, confirmed in
this session, so it is not on this sheet. Both throwaway probe artifacts
(`.github/workflows/egress-probe-hosted.yml`, `supabase/functions/feed-egress-probe/`) are gone
from the tree; `git show c9745e2` restores the CI shape if a future round wants it.

## Closing the story

`npm run gate` green with its exit code read from the command, the four run ids above recorded,
`seriesdatasource-port.md`'s registry line carrying `espn`, `sprint-status.yaml`'s
`2-13-espn-feed-adapter` moved to `review` (external fresh-context code review is the same gate
2.4/2.5/2.6 passed through), and the commit made locally with named files after re-checking
`git status` — the owner runs parallel sessions on this tree. The hand-over, not the push:
`git push origin master`.
