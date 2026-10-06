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

### Review Findings — pass 2 (2026-10-07 02:08 local, four-layer review: blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor)

Subject: `f26b148` (290 diff lines, 6 files). Blind Hunter's floor was N = 6 (√27.7 kB ≈ 5.26 → 5 + 1) and it returned 12. All four layers reported; none failed. Every finding below was verified against the working tree at `42519e6`, not only the diff.

- [x] [Review][Decision][Applied] **Route B is now documented as the supported path, but its `manual_csv` leg has never run** (`docs/PLAYOFF_RUNBOOK.md:179-186`) — the diff deleted "That has not been exercised in this repo yet, so prefer route A" and replaced it with a numbered commit→push→dry-run→run recipe. Verified: the workflow does accept it (`.github/workflows/pipeline-inseason.yml:90-97`, `source` choice includes `manual_csv`), and dispatches have run (`37235646137`, success 2026-10-04), but every recorded dispatch used `espn`; `drill-2-7-results.md:29` documents the `manual_csv` write path as the **local** shipped runner. So the mechanism is proven and this specific route is not. **Owner chose option (b): exercise it.** Run [`37507206156`](https://github.com/ujsolon/predictgame7/actions/runs/37507206156) — `workflow_dispatch` on `9535436`, `-f source=manual_csv -f dry_run=true` — concluded **success** and its log prints `adapter=manual_csv flags=--dry-run`, `plan: 0 birth(s), 0 completion(s), 0 skip(s) (0 score row(s) planned)`, `dry-run: 0 rows written`. The run id, its log lines and the one thing it could *not* cover (the committed CSV was header-only at that ref, so a dispatch carrying real playoff rows is still first-in-2027) are now in Route B's intro line.
- [x] [Review][Decision][Applied] **A bare local runner invocation can now write a real birth** (`supabase/scripts/pipeline/run.ts:266` `--dry-run` is opt-in, `:336` falls back to `DEFAULT_ADAPTER_NAME` = `manual_csv` at `port.ts:88`) — the assertion this story deleted was titled "carries no data rows, so an untouched apply run plans zero rows", and that guarantee was the only thing making `node --env-file=.env supabase/scripts/pipeline/run.ts` harmless. While a pending 3–3 sits committed, the bare command now births it into production. The honest fixes are runner-side (default `manual_csv` to dry-run, or require an explicit apply flag), which Story 2.17 excluded by its own "no change to the runner" constraint. **Owner chose option (a): document the hazard, no runner change.** Added to the runbook's route-A bullet ("**Pass `--source` and `--dry-run` explicitly, every time.**", with why the bare command stopped being harmless) and to `series_manual.csv:19-20`, keeping the comment block at 22 lines so the `:4-11`/`:17-21` citations hold.
- [x] [Review][Patch][Applied] **`series_manual.example.csv` teaches a round label the new gate rejects, and the live file still points at it** (`supabase/scripts/pipeline/data/series_manual.example.csv:14`, `:32-37`; `series_manual.csv:21`) — `Western Conference First Round` is not in `CANONICAL_ROUND_LABELS` (`adapters/rounds.ts:25`), and `rounds.ts`'s own header says the vocabulary is round-only with no conference prefix. The example's test only parses it with a 4-team lookup, so nothing pins it: an operator following "See series_manual.example.csv beside it for the row shape and cadence" gets `npm run gate` red mid-playoff. `docs/PLAYOFF_RUNBOOK.md:53` already warns "copy its row shape and cadence from there, not its round label" (added by Story 2.18), but the example itself still ships the bad label. **Landed:** the six 2027 rows and the `:14` comment now read `First Round (Western Conference)`, the example describe calls `assertValidOperatorCsv(EXAMPLE_CSV, …)`, and `docs/PLAYOFF_RUNBOOK.md:53` was re-pointed — it now states the example is canonical and pinned, since the sentence that named the stale label became false on this same edit. Story 2.15's pass-2 record offered exactly this fork ("in the runbook or the example's comment block"); the runbook half landed then, the example half lands here. The `tests/fixtures/drill-2-7/*.csv` files keep the old spelling and are left alone: no gate reads them, the runner accepts any non-empty round by design, and they are the closed Story 2.7 drill's evidence. Sources: blind-hunter + edge-case-hunter + verification-gap (its disposition was `patch`).
- [x] [Review][Patch][Applied] **Route B's two discovery commands cannot do what the runbook asks of them** (`docs/PLAYOFF_RUNBOOK.md:183-185`) — step 2 finds the run with `gh run list --workflow pipeline-inseason.yml -L 1`, with no `--event workflow_dispatch`, so a scheduled 07:30 run started in the same window prints instead and the operator reads someone else's log; step 3 says "check that `gh run list` shows both runs on the same commit", and the default output carries no SHA (measured: `gh run list --repo ujsolon/predictgame7 -L 2` prints state/title/workflow/branch/event/id/duration/date only). **Landed:** step 2 now filters `--event workflow_dispatch` and says why; step 3 gives `gh run list --workflow pipeline-inseason.yml --event workflow_dispatch -L 2 --json databaseId,headSha,conclusion`, which is the command that produced this patch's own evidence (`headSha` `9535436…`). Sources: blind-hunter + edge-case-hunter.
- [x] [Review][Patch][Applied] **"(step 3's go/no-go rules apply)" is ambiguous** (`docs/PLAYOFF_RUNBOOK.md:183`) — Route B has its own numbered step 3 (the real run), while the intended target is the `### 3. Dry-run and read the plan` heading under "Step by step". **Landed:** the reference names the section ("the go/no-go rules under \"Step by step → 3. Dry-run and read the plan\" apply"). Source: blind-hunter.
- [x] [Review][Patch][Applied] **The new check does not pin its own premises** (`tests/pipeline/manual-csv.test.ts:79-97`) — `SEED_LOOKUP` trusts whatever `parseTeamsSeed` returns, so a shrunken seed passes as long as NYK/BOS/DEN/LAL survive it, and `CANONICAL_ROUND_LABELS.includes(…)` trusts the list, so a label dropped during the offseason (header-only live file) goes unnoticed. The repo already has this pattern: `venueBackfill.ts:237` exports `EXPECTED_TEAM_COUNT = 59` and `team-logos.test.ts:106` asserts against it for exactly this reason ("a reader that parsed nothing… would make the loop pass by checking nothing"). **Landed — half of it.** The label pin shipped as its own case. The seed-count pin was **dropped after measuring**: `parseTeamsSeed` already refuses any seed but the 59-team one inside the shipped reader, so a test-side `SEED.size` assertion is a second source of truth for a guard that already aborts (mutation M6 below). Sources: acceptance-auditor + edge-case-hunter.
- [x] [Review][Patch][Applied] **The tracker comment above `2-17` still states the retired rule as current** (`_bmad-output/implementation-artifacts/sprint-status.yaml:349-352`) — it reads "manual-csv.test.ts:66-74 requires the committed operator CSV to be empty, so playoff rows redden the gate and block every push to master. Relax it to…", next to a value of `done`. The next agent reading the tracker takes a dead contract as live; the `2-16` comment beside it reads as a record. **Landed:** rewritten in past tense with the landing commit (`RELAXED in f26b148 — the case now validates every committed row against the real teams seed`), provenance and the original due date kept, same four lines. Sources: blind-hunter + edge-case-hunter.
- [x] [Review][Defer] **The headline scenario — pushing a CSV that actually holds playoff rows — has never been exercised end-to-end** (`tests/pipeline/manual-csv.test.ts:100-103`; `.githooks/pre-push`) — deferred: real but not actionable now. The live file is still header-only at `HEAD`, so the committed-file case passes trivially today; the playoff-rows state is covered by the temporary-text acceptance cases, and the pre-push path runs the same `npm run gate`. Settling it needs the first real 3–3 in 2027, which the runbook already routes through this file; fabricating rows in the live file now would contradict the story's own "the live file is never edited" rule.

**Pass-2 landing evidence.**

Mutations for the two cases this pass added — each applied to live code or live CSV text, run with `npx vitest run tests/pipeline/manual-csv.test.ts`, then restored:

| # | Mutation | Result |
|---|---|---|
| M5 | the six example rows put back to `Western Conference First Round` | 1 red: "is valid operator data, since the live file sends the operator here for row shape", with `round "Western Conference First Round" is not one of First Round, Conference Semifinals, Conference Finals, NBA Finals`. The parse case above it stayed green — it never looked at the label. |
| M6 | the seed read narrowed to `00005` alone | the file fails at import: `00005 + 00007 teams seed: teams seed parse found 30 abbreviations, expected exactly 59 … fix the reader before trusting any output built on it` (`venueBackfill.ts:265`). This killed the planned `SEED.size` assertion rather than reddening it: the shipped reader already refuses a short seed, so a test-side copy of that number would be a second source of truth guarding a state no writer can produce. |
| M7 | `'NBA Finals'` removed from `CANONICAL_ROUND_LABELS` | 2 red: "reads the four canonical labels spelled literally" and the example case. **"is valid: real team codes…" (the committed-file case, the story's headline) stayed green** — with the live file header-only there is nothing to check, which is precisely the hole the pin exists to cover. |

- **Gate after the patches:** `npm run gate` **exit 0**, read from the command (`GATE EXIT 0`) — Biome, `tsc -b`, Vitest 24 files / **568 tests** (566 → 568: the example-validity case and the label pin), and the build with the `/predictgame7/` asset prefix.
- **Markdown re-read in the same turn** (no gate step scans `docs/` or these files): every runbook edit landed inside an existing physical line, so the file's line count is unchanged and the citations that point into it from elsewhere — `series_manual.csv:4-11`/`:17-21`, `docs/PLAYOFF_RUNBOOK.md:53`, and Story 2.15's `:52`/`:86`/`:112` review records — still resolve. The live CSV comment block stays 22 lines with the header at 23.

**Rejected (pass 2).**

| ID | Finding | Verdict and refutation |
|---|---|---|
| BH1 | `SEED_LOOKUP` built at module scope: a seed-reader change reddens all parser cases at import | **false**. The IIFE throwing at import is fail-loud with the file named in the error; no case silently passes. Nothing at `manual-csv.test.ts:79-86` produces a wrong outcome. |
| BH4 / VG-other | "turns the gate red before anything runs" overclaims route A, since the runner accepts any non-empty round | **false** as to the sentence cited: its example is `NY` for `NYK`, and the runner does refuse an unknown code at runtime (`docs/PLAYOFF_RUNBOOK.md:51` quotes `unknown team abbreviation "NY" — not in the teams table`). The round-label sequencing was already corrected downstream — `docs/PLAYOFF_RUNBOOK.md:53` reads "a typo turns `npm run gate` red before you push". |
| BH5 | `series_manual.csv:17-21` is not the header-and-comment block (comments are 1-22, header 23) | **low**, and pre-existing: the citation predates this diff (it is in the scenario-5 row the diff deleted), and the story deliberately preserved the line count so it stayed exactly as good, or as loose, as it was. The instruction text itself ("holds only its header and comment lines") is unambiguous. |
| BH2 | Scenario 3's "fails for **every** series in the file" is unpinned — no stale-series-beside-healthy case | **low**, and the claim is code-confirmed rather than untested: `plan.ts:525-533` throws `PlanAssertionError` from the archive branch, and the plan is computed for the whole source before any write, so one stale series aborts the run. An extra multi-series case is coverage, not a correction. |
| BH6 / EH5 | Route B step 2 could grab a scheduled run | Not rejected and not a separate entry — deduplicated into the Route B command patch above. |
| BH9 | Spec "Files touched" omits `series_manual.csv`; `team-logos.test.ts` "has no such seed" | **false** on its premise and a spec edit as its fix. `src/lib/__tests__/team-logos.test.ts:90-101` reads `00005` + `00007` and calls `parseTeamsSeed(teamsSeedText, '00005 + 00007 teams seed')` — the same seed the spec claims. |
| BH10 | Spec contradicts itself on what the mutations were applied to | **low**, and the fix edits the spec under review. |
| BH11 | Spec `status: done` + `review_loop_iteration: 0` beside a pass-1 log; YAML at `review` | **false** at the current tree: `9535436` set `2-17` to `done`. The `review_loop_iteration` counter is a spec-field edit and out of scope by rule. |
| EH4 | `year`/score digits unbounded, so a row Postgres `integer` rejects could pass the gate | **low**, and the guard was already refused once: pass 1 rejected the same class as "more than a direct correction" (finding 5). `manualCsv.ts:56` does reject non-integers and negatives; only an absurd magnitude is unbounded, and no writer can produce one from a box score. |
| EH7 | Scenario 5's `git diff origin/master` "reads as pushed while rows stay on master" | **false**. `git push` failure does not move the `origin/master` tracking ref, so the local ref stays at the commit **without** the rows and the diff prints them — the check fails loud in exactly the case named. A `git fetch` prefix hardens a state no writer here produces. |
| EH8 / EH10 | Spec says "Four cases pin the check" against five delivered; "the live file is never edited" vs the comment-only CSV edit | **low**, and both fixes edit the spec under review. The CSV edit is comment lines only and the sentence is about mutation evidence, which never touched it. |
| BH1-dup | `plan.test.ts:194` repeats the skip assertion the case at `:198` already makes | **low** and AC-mandated: epics Story 2.17 requires the named case to pin both halves ("refused with… and the same source plus its matching Game 7 is a skip"). Deleting the line would uncouple the AC from the test named for it. |
| AA5 | The live CSV comment dropped "round is outside the identity key and has no CHECK" | **false**. The schema fact is recorded twice elsewhere and untouched: `supabase/scripts/pipeline/port.ts:25` and `docs/CURRENT_DATA_MODEL.md:20` ("`round` ships with no CHECK"). |
