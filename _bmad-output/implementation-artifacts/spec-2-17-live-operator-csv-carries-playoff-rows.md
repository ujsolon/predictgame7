---
title: 'Story 2.17 — Let the live operator CSV carry playoff rows without reddening the gate'
type: 'chore'
created: '2026-10-06'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `tests/pipeline/manual-csv.test.ts:66-74` (Story 2.3) asserts that the committed `series_manual.csv` holds **no data rows**. The test reads the working-tree file and the `pre-push` hook runs the gate, so while any 3–3 series sits in the file every push to `master` is refused, CI reports red, and the runbook's "commit, push, dispatch" route cannot be used. That was found during Story 2.15's build, and the owner chose to relax the test (2026-10-06).

**Approach (`epics.md` Story 2.17):**
- **Relax the test from "empty" to "valid".** Every data row parses through the shipped `parseManualCsv` against the real teams seed (`parseTeamsSeed` over `00005` + `00007`). The rows also pass the runner's own `groupSourceRows` + `planPipeline` against an empty current table. Every `round` is one of `CANONICAL_ROUND_LABELS`. A header-only file stays green, and the comment says that is the offseason state, not a requirement.
- **Mutation evidence** runs against temporary CSV text, never the live file: an unknown code (`NY`) goes red, a 4–2 split goes red, a non-canonical round goes red, and a valid six-row 3–3 stays green.
- **Pin the runbook's scenario 3**, which Story 2.15's matrix audit found measured but untested, in `plan.test.ts`. A 1–6-only source against an archived stored row is refused with "never rewrites an archived outcome"; the same source plus its matching Game 7 is a skip.
- **Rewrite `docs/PLAYOFF_RUNBOOK.md` in the same commit.** Drop the red-gate caveat and its "do not commit" sub-bullets: committing the rows is now the normal path, and the commit is the backup. Route B becomes supported: commit, push, then dispatch with `-f source=manual_csv -f dry_run=true`, read the plan, and dispatch again with `dry_run=false`. Keep the default-is-a-real-run warning. Scenario 5's signal stops relying on the empty-file test.
- **Unchanged:** no change to the runner, adapters, plan, workflows or any migration. `npm run gate` exits 0.

</frozen-after-approval>

## Implementation Notes

**Files touched:**
- `tests/pipeline/manual-csv.test.ts`: the "committed operator file" case now asserts the file is **valid** rather than empty, through `assertValidOperatorCsv`. That helper does three things:
  - parses with `parseManualCsv` against `SEED_LOOKUP`, which is `parseTeamsSeed` over `00005` + `00007`, the same 59-team seed `team-logos.test.ts` uses;
  - checks every `round` is in `CANONICAL_ROUND_LABELS`;
  - runs `planPipeline(groupSourceRows(…), [])`.

  Four cases pin the check against temporary text: header-only and a six-row 3–3 are accepted; `NY` for `NYK`, a 4–2, and `First Rnd` are each refused. The live file is never edited.
- `tests/pipeline/plan.test.ts`: runbook scenario 3 is pinned. `pendingSource()` (games 1–6, null winner) against `currentArchive()` throws "never rewrites an archived outcome", and `archiveSource()` against `currentArchive()` is one skip.
- `docs/PLAYOFF_RUNBOOK.md`:
  - The red-gate bullet and its "do not commit" and "back the file up" sub-bullets became "commit the rows: the gate checks them": commit after every edit, and never empty the file while a series is pending.
  - Scenario 5 resets by deleting the rows and committing, and drops the empty-file signal.
  - Route B is now the supported path: commit, push, then dispatch with `-f source=manual_csv -f dry_run=true` and then `=false`. The default-is-a-real-run warning is kept.
  - The failure-issue recovery text (`pipeline-inseason.yml:175-187`) is now accurate as written, so no workflow edit was needed.
- `sprint-status.yaml`: `2-17` → `in-progress` → `review`.

**Consequence noted:** Story 2.15's deferred AGENTS.md item (review B5: "never empty the CSV when the gate is red") loses its premise. The gate no longer goes red because rows exist, only on an invalid row, which the failure names. That half can be closed when it is next triaged. Its other half stays open: AGENTS.md's "Docs layout" should list `docs/PLAYOFF_RUNBOOK.md`. Old `deferred-work.md` entries are not edited here.

**Mutation evidence:** each mutation was applied to the file, the suite run, and the file restored. `git status` showed `supabase/` clean afterwards.

| Mutation | Red tests |
|---|---|
| M1: round check removed | "rejects a non-canonical round label" |
| M2: plan assertions skipped | "rejects a series the runner would refuse (a 4–2 split)" |
| M3: lookup accepts any code | "rejects an ESPN code … (NY for NYK)" |
| M4: archive-branch mutation on `plan.ts`, first attempt | none. The edit did not change behaviour (`exact.winner_team_id === winner` still failed), so it was discarded rather than counted. |
| M4b: `plan.ts` archive branch skips any null-winner source | "runbook scenario 3 …" |

**Gate:** `npm run gate` exit 0 (read from the command itself). It ran before the review (537 tests) and after the review patches (538, the extra one being the mid-playoff acceptance case).

## Review Triage Log

**Pass 1 (2026-10-06).** Blind Hunter, a fresh-context subagent on the same model level. Its floor was N = 5 on about 22 kB, and it returned 10 findings. That was the oneshot route's only layer.

| # | Finding | Verdict | Route and evidence |
|---|---|---|---|
| 1 | The runbook overclaims: the gate validates against an **empty** table, so a series the feed already completed (scenario 3's stale rows) still passes | medium | **patch**. The runbook says "against an empty table" and names what the gate cannot see: scenario 3, `year`, and defunct codes. |
| 2 | The pre-push hook validates the working tree, not the pushed commit | low | **patch**. The runbook says to commit first, then push from a clean tree. |
| 3 | The live CSV's header comments contradict the gate (free-text round; "intentionally empty") | low | **patch**. Comment lines only, with the same line count, so the runbook's `:4-11`/`:17-21` citations hold. The parser skips `#` lines, and the gate stayed green. |
| 4 | No test accepts a seven-row or multi-series file | low | **patch**. Added "accepts the normal mid-playoff file". |
| 5 | `year` and defunct franchises are not checked | low | **reject** as a check: a year bound needs a clock in the test, which is more than a direct correction. The limit is stated in the runbook (finding 1's patch). |
| 6 | The B5 consequence note drops the "list the runbook in AGENTS.md" half | low | **patch**. The note keeps that half open. |
| 7 | Status disagrees across the spec, the YAML and the notes | false | The notes describe the Finalize transition, which ran after this review: the spec is `done` and `2-17` is at `review`. |
| 8 | Route B: no command to find the run, and `master` may move between the dry and real runs | low | **patch**. Added `gh run list`/`watch`/`view --log`, and "push nothing between, check both runs are on the same commit". |
| 9 | "The commit is your backup" doesn't survive a lost machine | low | **patch**. Changed to "commit and push"; CI also re-validates. |
| 10 | Scenario 5 has no check that the reset was pushed | low | **patch**. Added `git diff origin/master -- …series_manual.csv` printing nothing. |
