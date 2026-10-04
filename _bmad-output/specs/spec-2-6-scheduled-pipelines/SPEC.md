---
id: SPEC-2-6-scheduled-pipelines
companions:
  - workflow-inventory.md
  - failure-modes.md
  - decisions.md
  - ../../implementation-artifacts/seriesdatasource-port.md
  - ../../../AGENTS.md
sources:
  - ../../planning-artifacts/epics.md
  - ../../implementation-artifacts/decision-2-1-q-4-data-source.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Spec: Story 2.6 — Scheduled pipeline workflows + failure notification (SM-4)

## Why

A pain to solve, with a deadline attached. Epic 2 is calendar-critical: the Apr–Jun 2027 playoff window is where the product's traffic is measured, and stale Active Series during that window invalidate the measurement itself. Today every pipeline run happens because the owner typed a command — the runner (`supabase/scripts/pipeline/run.ts`) is idempotent and exits non-zero on any failure (`run.ts:159-163` [→ `run.ts:179-181` for the contract, `run.ts:426` for the `return 2`; the numbers drifted when Story 2.13 grew the runner]), but nothing schedules it and nothing tells the owner when a run they did not make went wrong. The same gap covers the one artifact whose truth expires silently: `scripts/rehearse-migration-00014.mjs` certifies the migration replay order, is invoked by no gate and no CI job, and its verdict is dated — it goes stale at the next migration file. Affected: the solo owner (operator and only reader of the signal) and every fan who reads an Active Series card that stopped updating in May.

All seven decisions this spec opened are closed by the owner on 2026-10-03; the options they rejected are kept in `decisions.md` because they are the reason the shape is what it is.

## Capabilities

- **CAP-1**
  - **intent:** The system initializes the postseason bracket at playoff start and finalizes it at playoff end, on its own schedule and idempotently, with no human command (FR-20).
  - **success:** A `pipeline-offseason` workflow exists, is triggerable by schedule and by hand, and running it twice in a row changes nothing in the database — the second run's log shows the same counts with zero writes.
- **CAP-2**
  - **intent:** The system updates Active Series every day inside the declared playoff window (FR-21).
  - **success:** A `pipeline-inseason` workflow fires daily on the window's cron, runs the scheduled source through the existing runner (`nba_com` as authored; re-pointed to `espn` by Story 2.13 — see the Assumptions amendment of 2026-10-03), and its log shows the derived season plus the feed count. At build time that proof is a hand dispatch with `dry_run` set against the live endpoint — an empty feed and exit 0 is the expected honest answer; "the archive reflects a Game 7 the run decided" cannot be demonstrated before 2027 and is verified by Story 2.7's drill.
- **CAP-3**
  - **intent:** A run that goes wrong cannot go unheard: any non-zero exit produces one GitHub issue naming the failed run, within one cron cycle (SM-4).
  - **success:** A deliberate failure run — on a path that issues zero writes — opens (or comments on) an issue whose body links the Actions run, without any notification setting being turned on, and the issue is deduplicated so a still-broken cadence stays one issue, not a daily pile.
- **CAP-4**
  - **intent:** The owner can diagnose a failed run from GitHub alone.
  - **success:** A failed run's log contains the adapter's run report (counts, histogram, named exclusions) and the runner's refusal message verbatim, so the diagnosis does not require reproducing the run locally; a secret that is absent or rotated is named as such rather than surfacing as a fetch error.
- **CAP-5**
  - **intent:** The migration replay certification stays true without a human remembering to re-run it.
  - **success:** The throwaway-database rehearsal executes automatically when a change can expire its verdict (the path filter in `workflow-inventory.md`), exits non-zero on any guard or pinned-literal mismatch, and its red run raises the same CAP-3 issue.
- **CAP-6**
  - **intent:** An inseason run whose source returned nothing is treated as a failure, not as a quiet success.
  - **success:** Inside the declared window, a scheduled-source run whose feed holds zero series (`nba_com` as authored; `espn` from Story 2.13) exits non-zero and therefore produces CAP-3's issue — while the same zero outside the window stays green, and the choice of which is which is visible in the workflow file rather than derived in code.

## Constraints

- `service_role` reaches the runner only as a GitHub Actions secret — never committed, never a `VITE_*` var, never in the bundle (NFR-S1, and this repo has one leak in its history). It rules out copying the operator command verbatim onto a runner: no `.env` exists there and Node treats a missing `--env-file` as fatal, so the workflow passes `env:` to a command that reads the environment directly. Store: a repository secret, the one `keepalive.yml` already proves reachable (D-1).
- No workflow applies a migration or any DDL. `supabase db push` stays an owner action — this rules out the "CI keeps the schema current" shortcut and keeps census-guard aborts (`00016`, `00017`) in the owner's hands.
- `keepalive.yml` is never modified; new scheduled work lands as separate workflows (the AC, and the convention `nightly-gate.yml:10-11` already states).
- The runner stays date-blind. The bracket cron is the *single* date expression in this design; no Apr–Jun branch may enter `run.ts` or `plan.ts` (AD-4, Story 2.4 Decision 2 — the reason `deriveSeason` is a fetch-scope rule and never a state rule). Consequently the empty-feed check is opt-in per workflow, never on by default.
- No new PostHog event names and no analytics-shaped signal (addendum §A.1 frozen). Notification is GitHub-native, following the issue pattern already shipped in `nightly-gate.yml:43-56`, and it is defined once (D-4).
- Scheduled writes go through the existing pipeline RPCs only (`00015` write functions, `00017` refresh, granted to `service_role`). No new RPC, grant, or row-level policy in this story.
- The workflow pins Node at or above 22.18 — `run.ts` relies on native type stripping (`seriesdatasource-port.md:370`), and `ci.yml`'s floating `22.x` is not evidence that a runner can execute the entry point.
- The deliberate-failure verification issues zero writes.
- At most one pipeline workflow run executes at a time (`concurrency` group, no cancel-in-progress), so two scheduled runs cannot interleave a completion write.
- An existing refusal pattern governs the new flag: a flag the selected adapter cannot honour refuses the run rather than being silently discarded (`run.ts:248-255` [→ `run.ts:288-297` since Story 2.13]), so the empty-feed check names `manual_csv` as inadmissible instead of pretending to pass.

## Non-goals

- No notification channel beyond a GitHub issue — no email/Slack/push integration, no PagerDuty, no health endpoint or uptime pinger, and no watchdog for a cadence that never fired. That last exclusion is D-7 taken as option A: an un-run schedule produces no non-zero exit, so nothing in this story can hear it, and the gap is handed to Story 2.7's drill run sheet rather than dropped (`failure-modes.md` mode 8).
- No new adapter, no second data source, and no attempt to prove the in-season freshness leg (it is owed in the 2027 window — `deferred-work.md` Story 2.1). The `manual_csv` floor stays reachable by hand; it is not scheduled. No provider key is provisioned here either — but the alternate keyed provider's debt (`deferred-work.md`, Story 2.1) names this story as its home, so if the owner ever obtains that key it joins the repository-secret store, and its free/paid tier becomes a stated cost rather than an assumption.
- No fix to the feed's `Counter=1000` truncation ceiling and no check for it; a truncated-but-non-empty postseason still reads as a shorter postseason. CAP-6 covers empty only. Where the residue lands is stated in `failure-modes.md`.
- No UI change of any kind — this story touches no page component and no shipped copy. The cached cards' numbers still move (that is `00017` firing on a winner-filling run), and the census line in the run log stays the only recertification signal they get.
- The two Story 2.8 carry-overs (the `WAS` alias collision at `venueBackfill.ts:512`, the census at `00016:610` that counts pending series) are split out as **Story 2.12**, per the owner's own routing rule at `sprint-status.yaml:130`. They are registered in `epics.md` ahead of Story 2.7 so the drill does not inherit two known probe defects.
- No PLANNED-GATED scope (accounts FR-22/23, betting-adjacent FR-26..29, video FR-13) and nothing wagering-shaped.

## Success signal

During the 2027 window the owner reads the repo's issue list, not the site's numbers, to know whether the data is current: a green cadence leaves no trace, and a run that fails — including one that reached the feed and found nothing — leaves exactly one open issue naming it within a day, demonstrated before April by a deliberate zero-write failure that produced that issue with no local reproduction. A cadence that never fired at all is outside that sentence by decision (D-7 = A) and is caught, if at all, by Story 2.7's drill. Separately, the archive's replay certification is never older than the newest migration file, because a job — not a memory — re-runs the rehearsal when a migration edit would expire it.

## Assumptions

- `nba_com`, not `manual_csv`, is the scheduled inseason source: `decision-2-1-q-4-data-source.md` records that both candidates did **not** fail, so the AC's conditional operator-cadence branch (`epics.md:400`) is not invoked, and `manual_csv` remains the fallback floor rather than a cron target. If the 2027 window proves that assumption wrong, that branch activates as written — the CSV edited by hand before the daily slot, so Active Series are never more than a day stale — and it is documented, not reinvented, at that point. ``[Amended 2026-10-03 by sprint-change-proposal-2026-10-03.md, owner calls C1+C3: the scheduled inseason source is `espn` (Story 2.13), not `nba_com` — stats.nba.com refuses all cloud egress (0/15 across two providers; `deferred-work.md`, four-cell table). Both workflows' defaults and dispatch choices re-point in Story 2.13's commit; `nba_com` stays registered and hand-runnable but leaves the workflow surface. CAP-2's green-dispatch proof re-points to Story 2.13 (it inherits this spec's run sheet); CAP-6's empty-feed alarm is unchanged in shape and owed against `espn`. Story 2.6 closed 2026-10-03 with the fantrax dispatch, the issue-#8 close-and-re-fire and one rehearsal dispatch still owed — transferred to Story 2.13's spec and the owner's action list in `sprint-status.yaml`, not dropped.]``
- The AC's "deliberate dry failure" (`epics.md:399`) is read as *a deliberate failure on a zero-write path*, not as a `--dry-run` run: `--dry-run` exits 0 (`run.ts:159-163` [→ `run.ts:179-181` for the contract, `run.ts:426` for the `return 2`; the numbers drifted when Story 2.13 grew the runner]), so it cannot produce the red the AC asks CAP-3 to notify on. The procedure that satisfies it is in `workflow-inventory.md`.
- The cadence's HTTP cost is one request per run — the adapter makes exactly one unkeyed call and memoises its parse (`adapters/nbaCom.ts:7-10`) — so a daily cron adds one call a day against a rate ceiling that Story 2.1 could not measure and the 2027 window still owes (`deferred-work.md`, Story 2.1). Nothing here changes that posture.
- A run outside the postseason returns zero rows and exits 0 as shipped (`deriveSeason`, `adapters/nbaCom.ts:111-114` — Jan–Jun asks for `Y-1`–`Y`, Jul–Dec for `Y`–`Y+1`). The cron window, not a code check, is therefore what makes a zero-row feed an alarm — and because every run re-reads the whole postseason, a late bracket start loses no data.
- The Supabase project can be asleep at the scheduled slot, so the inseason run is placed at 09:30 UTC — after the existing 09:00 keepalive rather than in the same minute — so warming the instance is not made the pipeline's failure mode. `[Amended 2026-10-04 by owner call, Story 2.13: the slot moves to 07:30 UTC and the keepalive to 07:00 with it, so this ordering reason stands and only the pair shifts. The bracket, the three-line shape, --require-feed's placement and D-7 are unchanged. Argued in _bmad-output/specs/spec-2-13-espn-feed-adapter/schedule-amendment.md, which also records the non-Final margin the earlier slot trades away.]`
- GitHub scheduled runs can be delayed by tens of minutes at peak. "Within one cron cycle" tolerates that and promises no wall-clock time.
- A 2027 Game 7 needs no venue curation: the adapter supplies real per-game home/away, so scheduled runs grow the archive with true venues, and `00017` has no pinned census literal to abort on (`00017:64-65` is its only guard).
