---
title: 'Story 2.6 — Scheduled pipeline workflows + failure notification (SM-4)'
type: 'feature'
created: '2026-10-03'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-2-6-scheduled-pipelines/SPEC.md (the canonical contract: 6 capabilities, 10 constraints, 6 non-goals)'
  - '{project-root}/_bmad-output/specs/spec-2-6-scheduled-pipelines/workflow-inventory.md (what exists, what is added, the shared mechanics, the deliberate-failure run sheet)'
  - '{project-root}/_bmad-output/specs/spec-2-6-scheduled-pipelines/failure-modes.md (13 modes; which are loud, which are residue, and who owns each residue)'
  - '{project-root}/_bmad-output/specs/spec-2-6-scheduled-pipelines/decisions.md (D-1..D-7, all CLOSED by the owner 2026-10-03 — the rejected options and why)'
  - '{project-root}/_bmad-output/implementation-artifacts/seriesdatasource-port.md (the port doc; its flag section gains `--require-feed`)'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md (Story 2.6: heading :387, ACs :393-401)'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every pipeline run happens because the owner typed a command. `supabase/scripts/pipeline/run.ts` is idempotent and exits non-zero on any failure (`:344-348`), but nothing schedules it and nothing tells the owner when a run they did not make went wrong — and Epic 2 is calendar-critical: the Apr–Jun 2027 window is where the product's traffic is measured, so stale Active Series during that window invalidate the measurement itself. The same gap covers the one artifact whose truth expires silently: `scripts/rehearse-migration-00014.mjs` certifies the migration replay order, is invoked by no gate step and no CI job (`deferred-work.md:279-280`), and its verdict is dated.

**Approach:** two scheduled workflows and one path-filtered one, plus one shared definition of "loud". `pipeline-inseason.yml` runs the `nba_com` source daily across the declared playoff bracket; `pipeline-offseason.yml` runs the same idempotent command at the bracket's two edges (FR-20's initialize/finalize is one run over the postseason feed, so no separate code path exists to schedule); `migration-rehearsal.yml` re-runs the Docker rehearsal when a change can expire its verdict. Any non-zero exit opens — or comments on — one GitHub issue naming the failed run, via a local composite action that `nightly-gate.yml` also calls. The asymmetry the design has to keep (mode 1): an empty *plan* is legitimate, an empty *feed* inside the window is the anomaly, and the runner must stay date-blind — so the empty-feed alarm is a flag one workflow file passes, never a date branch in code.

## Boundaries & Constraints

**Always:**
- `SUPABASE_SERVICE_ROLE_KEY` reaches the runner only as a **repository secret** (D-1 = A, the store `keepalive.yml` already proves reachable) passed through a step's `env:` block. `--env-file=.env` may **not** appear in any runner command line: there is no `.env` on a runner and Node treats a missing env-file as fatal, so copying the documented operator command verbatim is the failure mode this rule exists to stop.
- No workflow applies a migration or any DDL, and no new RPC, grant, or policy appears anywhere. Scheduled writes go through what already exists: `00015`'s write functions and `00017`'s refresh, both `service_role`-only.
- `keepalive.yml` is **not touched**. `nightly-gate.yml` is edited exactly once — its issue step (`:43-56`) becomes a call to the shared action (D-4 = B); its trigger, cron, title and dedupe semantics are unchanged.
- The runner stays **date-blind**: `pipeline-inseason.yml`'s three cron lines are the *single* date expression in the design. No Apr–Jun branch may enter `run.ts` or `plan.ts` (AD-4, Story 2.4 Decision 2 — the reason `deriveSeason` is a fetch-scope rule and never a state rule). Consequently the empty-feed check is opt-in per workflow (`--require-feed`), never on by default, and "which window alarms" is visible in the YAML rather than derived in code (D-3 = B, D-5 = A).
- `--require-feed` is governed by the refusal pattern this file already uses (`run.ts:248-258`): with `--source=manual_csv` — an adapter that declares no `describeRun` (`manualCsv.ts:201`), so there is no report to check — it refuses the run **up front, before any credential is read**, rather than silently passing a check that can never run.
- Every added workflow: `actions/setup-node@v4` with `node-version: '24.x'` (native type stripping needs ≥ 22.18 — `ci.yml`'s floating `22.x` is not evidence a runner can execute `run.ts`); `permissions: contents: read` + `issues: write`, nothing wider; a named-message secret guard that exits 1 before the runner starts (CAP-4, modelled on `keepalive.yml:19-22`); and a `if: failure()` step delegating to `.github/actions/notify-failure/`.
- Both pipeline workflows share one `concurrency` group with `cancel-in-progress: false`, so a hand dispatch queues behind a scheduled run instead of interleaving a completion write (mode 9).
- Notification is GitHub-native and issue-shaped, with the dedupe rule `nightly-gate.yml:51-55` already implements: open the titled issue if none is open, else comment on the open one with the new SHA and run link. **No new PostHog event name** and nothing analytics-shaped (addendum §A.1 is frozen — an issue is not an event).
- Issue titles are the dedupe keys and are pinned exactly: `Pipeline inseason run failed` / `Pipeline offseason run failed` / `Migration rehearsal failed`.
- Every added workflow is covered by a failable test. Nothing in `npm run gate` reads `.github/**` today — `biome.json:7-15` `files.includes` excludes it and there is no actionlint/yamllint — so without `tests/pipeline/workflows.test.ts` the whole YAML surface is an advisory step that cannot go red.

**Never:**
- No UI change of any kind: no page component, no shipped copy, no new metric. The cached cards' numbers still move — that is `00017` firing on a winner-filling run — and the census line in the run log stays the only recertification signal they get.
- No new adapter, no second data source, no key for the alternate provider, no fix to the feed's `Counter=1000` truncation ceiling and no check for it (CAP-6 covers *empty* only; where the residue lands is stated below), and no watchdog for a cadence that never fired (D-7 = A — accepted, Story 2.7 owns the glance; `failure-modes.md` mode 8).
- No `--refresh-insights` exposed as a workflow input: U10 makes it an operator-only action, and a workflow input would turn it into an automatic one.
- No branch on `series.status`, no metric derived from a date, no edit to `00015`/`00016`/`00017`, no relaxation or deletion of a guard or a pinned literal to go green.
- The agent never pushes, never creates a GitHub issue, never sets a repository secret, and never runs `supabase db push` / `db reset` / `db start` or points `psql` at `supabase/.temp/project-ref` — that **is** production. All of those are handed to the owner as commands to run.
- `jsdom` accessible-name assertions are forbidden repo-wide; this story has no DOM surface, so nothing tempts it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scheduled inseason run, feed non-empty | `schedule`, `nba_com`, `--require-feed` | The adapter's report lines print first, then the plan, then the writes; a winner-filling run refreshes the cache; exit 0 | n/a |
| Scheduled inseason run, **feed empty** | `schedule`, `nba_com`, `--require-feed`, feed carries 0 series | **exit 2** naming the empty feed, with the report lines already in the log above it; no plan computed, nothing written; the composite action files the inseason issue | message names `--require-feed` and the adapter, never a stack trace |
| Offseason edge run, feed empty | `schedule`, `nba_com`, **no** flag | exit 0, plan empty, "dry-run"-shaped log — a legitimately empty bracket outside the window stays green (mode 1's other half) | n/a |
| Hand dispatch with `dry_run=true` | any file, `--dry-run` | plan printed, `dry-run: 0 rows written`, exit 0 (existing contract, unchanged — `--dry-run` exiting 0 is why the AC's "deliberate failure" is a zero-*write* path, not a dry run) | n/a |
| Hand dispatch with `dry_run=true` **and** `require_feed=true`, feed empty | both flags, `nba_com` | **exit 2** — the alarm is a refusal, not a write, so dry-run's zero-writes promise holds. This pair is how the alarm's own contract gets a red run in October instead of April | same message as the empty-feed row |
| `--require-feed` with `--source=manual_csv` | flag + the floor adapter | exit 2 refusing the **combination**, before `requiredEnv` runs and before the sink opens — reachable with no credentials at all, which is what makes it testable without a client | names the adapter and the reason (no run report to check) |
| `--require-feed` with `--refresh-insights` | both flags | refused up front in the same block that refuses `--refresh-insights --dry-run`: the operator refresh reads the archive and fetches no feed, so there is no feed to require | non-zero, names the conflict |
| `--require-feed` on a **non-empty** feed | flag, `nba_com`, ≥1 series | indistinguishable from the happy path — the flag passes silently when its condition holds; exit 0 | n/a |
| `--require-feed` alone, no `--source` | default `manual_csv` | refused the same way as the explicit case (the default is an adapter with no report), so a scheduled file that forgot `--source=` cannot pass the alarm vacuously | same message |
| Unrecognised flag next to the new one | `--requirefeed` (typo) | still refused by `unknownFlag` (`run.ts:107-111`), which must accept `--require-feed` and nothing looser | exit 2 with the supported-flag list, now including `--require-feed` |
| Required secret absent or rotated | Actions secrets missing | the guard step exits 1 naming the **variable**, never a value; the runner's own `requiredEnv` message (`:126-136`) is the backstop | loud → issue (mode 6 is what proves a half-rotation) |
| Migration file edited | push/PR touching one of the three `paths:` filters | the rehearsal replays `00001..00017` in a throwaway container; any guard or pinned-literal mismatch exits 1, infra/bad-arg exits 2; red → `Migration rehearsal failed` | red is read as infrastructure **first** on a `postgres:16` pull or image drift (mode 12) |
| Migration file untouched | every other push | no rehearsal run — the filter is the whole of D-2 = B | n/a |
| Two runs collide | scheduled + dispatch in the same window | the second queues (`cancel-in-progress: false`); no interleaved completion write | n/a |
| A second failure while an issue is open | same title | a **comment** on the open issue carrying the new run URL and short SHA, not a duplicate issue; closing the issue makes the next failure open a fresh one (mode 13) | n/a |

</frozen-after-approval>

## Code Map

- `supabase/scripts/pipeline/run.ts` — the runner. `unknownFlag` allowlist `:107-111` (bare `--dry-run`, `--refresh-insights`, plus `/^--(source|csv|season)=\S/`); the supported-flag refusal text `:174-179`; the bare flag reads `:181-191`; `openSink` `:196-200` is the **only** credential read, first called at `:231` (refresh path) or `:263` (run path); the refresh's mutual-exclusion block `:201-223`; `assertAdapterImplemented` `:241` (before any secret — `--source=fantrax` measured exit 2 with no env vars set); the `ADAPTER_FLAGS` refusal `:248-258`; the report print `:285-292`; the dry-run early return `:301-304`; the single catch returning 2 `:344-348`. Exit codes are only 0 and 2; `process.exitCode` at `:354`, never `process.exit`.
- `supabase/scripts/pipeline/port.ts` — `AdapterRunReport` `:52-59` (`countsLine`, `histogramLine`, `notes`), `describeRun?()` `:66`, `ADAPTER_REGISTRY` `:130-137` (`fantrax` recognised-but-unimplemented `:133-136`), `assertAdapterImplemented` `:144-160`.
- `supabase/scripts/pipeline/adapters/nbaCom.ts` — `reconstructed` `:425-430` is every series pair the feed carried, built from `byPair` **before** any exclusion (exclusions `continue` at `:457-511`), so `reconstructed.length` is the raw feed count; the report is assembled `:530-534`; `describeRun` throws if called before the feed settles `:567-572`; `deriveSeason` `:111-114`.
- `supabase/scripts/pipeline/adapters/manualCsv.ts:201` — returns a source with **no** `describeRun`: the reason the flag refuses this adapter rather than passing vacuously.
- `tests/pipeline/run.test.ts` — imports `runPipeline` directly (no subprocess). `VALID_ENV` `:19`; `FIXTURE_CSV` `:26-41`; `FakeSink` `:54+` records `calls: string[]` so "never called" is an assertion on evidence that can fail (Story 2.5's elicitation P6), and carries `refreshes` / `failNextRefresh`; the refusal test to copy is `:246-260` (`'an unrecognised flag refuses the run instead of silently applying writes'`); `fetchMustNotRun` `:469-471`.
- `tests/pipeline/nba-com.test.ts` — `RecordingSink`, `feedBody(specs)` `:135`, `stubFeed` `:173`, `runnerHarness(body, sink, argv, opts)` `:744-764` (injects `createSink`/`fetch`/`now`/`log`/`logError`, prepends `--source=nba_com`, takes `env:` overrides) — the harness the zero-feed red test uses; `:348` already pins `0 series in feed, 0 Game-7 candidate(s)`.
- `.github/workflows/nightly-gate.yml` — `:43-56` is the block being relocated (title `Nightly gate is red`; `gh issue list --state open --search "\"$TITLE\" in:title" --json number --jq 'map(.number) | .[0] // empty'`, then comment-else-create with `echo -e`); cron `30 3 * * *` `:19`; permissions `:22-24`.
- `.github/workflows/keepalive.yml` — cron `0 9 * * *`, secret guard `:19-22` (the named-message pattern). **Read-only for this story.**
- `.github/workflows/ci.yml` — node `22.x` `:20`, four gate steps, non-hermetic `deno check` `:57-66`. **Not edited.**
- `.github/` — contains **only** `workflows/`: no composite action, no `concurrency:` block and no `paths:` filter exists anywhere in the repo yet, so all three shapes are new here.
- `scripts/rehearse-migration-00014.mjs` — needs only `docker` (container `:111`, `postgres:16` `:579`, `psql` via `docker exec` `:171-179`); reads **zero** env vars, no `.env`, no project-ref (header `:34-38` states project-ref IS production); `COVERED_THROUGH = 17` `:132` with the beyond-coverage guard `:569-574`; `--fixture-report` `:507-540` needs no container and pins 159/117/59; exits 0 / 1 (assertion) / 2 (infra or bad arg `:1521-1541`); only Node builtins plus a dynamic type-stripped import of `venueBackfill.ts` `:107` → **Node ≥ 22.18, no `npm ci` needed**.
- `biome.json:7-15` / `tsconfig.pipeline.json` — Biome's `files.includes` covers `src`, `supabase/functions`, `supabase/scripts`, `tests`, `tailwind.config.js` and **not** `.github/**` or `*.yml`; `run.ts` and `tests/pipeline/**` ARE type-checked locally.

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/scripts/pipeline/port.ts` -- Add `feedSeriesCount: number` to `AdapterRunReport` (the count of series the feed carried, before exclusions) and `hasRunReport: boolean` to the `ADAPTER_REGISTRY` entry shape, true for `nba_com`, false for `manual_csv` -- the alarm reads a number, never the wording of `countsLine` (that is exactly why D-3 rejected the log-grep option), and the refusal must be reachable before the adapter is constructed.
- [ ] `supabase/scripts/pipeline/adapters/nbaCom.ts` -- Set `feedSeriesCount: reconstructed.length` in the report at `:534` -- `reconstructed` is pre-exclusion (`:425-430`), so this is "what came back on the wire", which is the anomaly CAP-6 names; a feed that carried rows and excluded them all is a *different* loud case, already reported in `notes`.
- [ ] `supabase/scripts/pipeline/run.ts` -- Add `--require-feed`: allowlist it at `:109`, name it in the supported-flag text at `:175-179`, read it beside `:186`, refuse it against `--refresh-insights` in the `:201-223` block, refuse it up front (before `openSink()` at `:263`, next to the `ADAPTER_FLAGS` check) when `ADAPTER_REGISTRY[sourceName].hasRunReport` is false, and throw after the report print at `:292` when `describeRun().feedSeriesCount === 0`. Keep the throw **ahead of** the dry-run early return `:301-304` -- the flag applies to a dry run because it is a refusal, not a write. -- one file, one flag; the existing refusal patterns make every branch's placement a precedent rather than a judgement call.
- [ ] `tests/pipeline/run.test.ts` -- Cover: the zero-feed red (via `nba-com.test.ts`'s harness shape, or here with `FakeSink` + an injected stub feed), exit 0 on a non-empty feed, the `manual_csv` refusal with `env: {}` (proves it precedes the credential read), the `--refresh-insights` refusal, `--require-feed --dry-run` still red on an empty feed, that no `birth`/`complete`/`readCurrent` call was made on any refusal (`FakeSink.calls`), and a registry-agreement test asserting `hasRunReport === (describeRun !== undefined)` for every implemented adapter.
- [ ] `.github/actions/notify-failure/action.yml` -- New local composite action, `using: composite`, `shell: bash`, inputs `title` and `body`; `GH_TOKEN: ${{ github.token }}`; the dedupe search + comment-else-create from `nightly-gate.yml:51-55` moved behaviour-for-behaviour; the action appends the run link and `Commit: ${GITHUB_SHA:0:7} on $GITHUB_REF_NAME` to the body itself (see Design Notes for why the caller cannot).
- [ ] `.github/workflows/nightly-gate.yml` -- Replace `:43-56` with `uses: ./.github/actions/notify-failure` + `with: title: Nightly gate is red`; touch nothing else. `keepalive.yml` and `ci.yml` stay untouched.
- [ ] `.github/workflows/pipeline-inseason.yml` -- Crons `30 9 16-30 4 *`, `30 9 * 5 *`, `30 9 1-30 6 *` (D-5: three lines, a cron day-range cannot span mid-April through June in one); `workflow_dispatch` inputs `dry_run`, `require_feed`, `source` (choice: `nba_com` default, `manual_csv`, `fantrax`); `concurrency: pipeline-writes` / `cancel-in-progress: false`; guard step; `npm ci --omit=dev` (`@supabase/supabase-js` is a runtime dep — verified); `node supabase/scripts/pipeline/run.ts --source=…` with `--require-feed` added when `github.event_name == 'schedule'` **or** `inputs.require_feed == 'true'`; `if: failure()` notify step.
- [ ] `.github/workflows/pipeline-offseason.yml` -- Crons `30 9 12 4 *` and `30 9 25 6 *`; same command, same guard, same shared concurrency group, **no** `--require-feed` and no `require_feed` input anywhere in the file.
- [ ] `.github/workflows/migration-rehearsal.yml` -- push to `master` + `pull_request`, both filtered to exactly `supabase/migrations/**`, `scripts/rehearse-migration-00014.mjs`, `supabase/scripts/pipeline/venueBackfill.ts` (D-2 = B); `workflow_dispatch` so mode 12's infra red can be re-run without a commit; no checkout-of-secrets, no `npm ci`; `node scripts/rehearse-migration-00014.mjs`; notify on failure.
- [ ] `tests/pipeline/workflows.test.ts` -- New Node-env Vitest file that parses the four YAML files with `js-yaml` (add it as an explicit `devDependency` — it is in `node_modules` today only as a transitive of `vite-plugin-svgr → @svgr/core → cosmiconfig`, and a contract test must not rest on that) and asserts, per file: the exact cron lists, the `--require-feed` presence in one pipeline file and its **absence** from the other, the shared `pipeline-writes` group with `cancel-in-progress: false`, the exact three issue titles, `if: failure()` on every notify step, `node-version: 24.x`, `permissions` no wider than `contents: read` + `issues: write`, the rehearsal's three `paths:` patterns as a sorted pin, the composite action's `title`/`body` inputs, `keepalive.yml` free of any `notify-failure`/`SERVICE_ROLE` reference, and the negative invariants across all of `.github/**`: no `--env-file`, no `VITE_`, no `supabase db push` / `db reset` / DDL. Normalize `\r\n` → `\n` on read (`core.autocrlf=true` and `.gitattributes` has no `*.yml` rule).
- [ ] `_bmad-output/implementation-artifacts/seriesdatasource-port.md` -- Document `--require-feed` in the flag section (`:66-72`, `:261-271` neighbourhood), the new `feedSeriesCount` report member, and the `hasRunReport` registry field.
- [ ] `_bmad-output/specs/spec-2-6-scheduled-pipelines/workflow-inventory.md` -- Correct the "moved there verbatim" claim at `:34` to what actually ships (the run/commit metadata is appended by the action rather than interpolated per caller), and record `require_feed` as a dispatch input.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- Close the rehearsal-runs-in-no-gate entry (`:279-280`) against `migration-rehearsal.yml` and the silent-empty-run entry (`:311`) against `--require-feed`, each naming where it landed; give mode 2's `Counter=1000` truncation ceiling its named home (Story 2.7's drill, reading the fed row count against the visible bracket) instead of leaving it unowned.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `2-6-…: review` on completion, `done` on the owner's approval; `last_updated` bumped honestly (the file's own note at `:32-35` records what writing the clock forward looked like).

**Acceptance Criteria:**
- Given a push that touches no migration path, when CI runs, then `migration-rehearsal.yml` produces no run; given a push that edits `supabase/migrations/**`, then it runs and its exit code is the verdict (`00001..00017` replayed in a throwaway container, nothing but a container contacted).
- Given the inseason cron list, when a run fires inside the declared bracket, then the log shows the adapter's report lines and the derived season, and the workflow file — not a code branch — is what made an empty feed exit 2.
- Given the offseason edge crons, when either fires against an empty bracket, then the run exits 0 and no issue appears.
- Given a deliberate failure dispatched on a zero-write path, then exactly one issue names the failed run with a link, a second deliberate failure comments on it, and closing it makes the next failure open a fresh issue — with no notification setting turned on and no local reproduction.
- Given the four gate commands, when `npm run gate` runs, then it exits 0 from the command itself (never read off a pipe), and `tests/pipeline/workflows.test.ts` is the step that makes `.github/**` failable for the first time.
- Given the shipped YAML, then `service_role` appears only as `${{ secrets.… }}` in an `env:` block, `--env-file` appears nowhere, and `keepalive.yml` is byte-unchanged (`git diff --stat` proves it).

## Implementation Notes

<!-- Append-only during implementation: decisions made, files touched, surprises encountered. -->

## Spec Change Log

<!-- Append-only, populated by step-04 review loops. -->

## Review Triage Log

<!-- Append-only, one row per reviewer finding; empty until the first review pass. -->

## Design Notes

**Why the composite action appends the run/commit metadata instead of each caller passing it.** `nightly-gate.yml:50` interpolates `$GITHUB_REF_NAME` and `${GITHUB_SHA:0:7}` because the string is a *shell* operand. A composite action's `with:` is an *expression* context: `$GITHUB_SHA` there is literal text, and `${{ github.sha }}` is the full 40 chars, not the 7 the shipped issue body prints. So the callers pass prose and the action's bash step appends `Run: <url>` and `Commit: <7-char sha> on <ref>` — the dedupe key, the comment-else-create rule and the link stay defined once (which is D-4's entire point), and the short-SHA rendering stays where a shell can compute it. Net visible change to the existing nightly issue: the run/commit lines move from mid-body to a footer block.

**Why the flag can't just be "on by default inside the window".** `deriveSeason` (`nbaCom.ts:111-114`) already makes the adapter date-aware in exactly one direction (which postseason to fetch), and Story 2.4 Decision 2 kept that a fetch-scope rule. Pushing an Apr–Jun comparison into `run.ts` would create a second date expression that disagrees with the cron — and the cron is the one the owner edits when a Finals runs past June 30 (mode 11). So the code asks "did the feed carry anything, and was I told to care", and the YAML answers the second half.

**Golden example — the refusal order that keeps `--require-feed` testable without credentials** (`run.ts`, before any `openSink()` call):

```ts
if (requireFeed && !ADAPTER_REGISTRY[sourceName].hasRunReport) {
  throw new PipelineRunError(
    `--require-feed does not apply to adapter "${sourceName}" — the empty-feed alarm reads the adapter's run report and this ` +
      'adapter declares none: its rows are a file the operator edited, not a feed that can come back empty. Refusing instead of ' +
      'silently passing a check that can never run; use --source=nba_com.',
  );
}
```

## Verification

**Commands:**
- `npm run gate` — expected: exit 0 read from the command itself, including the new `tests/pipeline/workflows.test.ts`.
- `node supabase/scripts/pipeline/run.ts --source=manual_csv --require-feed` — expected: exit 2 with the combination-refusal message, **with no `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in the environment**, which is the evidence the refusal precedes the credential read.
- `node supabase/scripts/pipeline/run.ts --require-feed --refresh-insights` — expected: exit 2 naming the conflict, no client built.
- `node supabase/scripts/pipeline/run.ts --requirefeed` — expected: exit 2, unrecognised flag, and the printed supported list now names `--require-feed`.
- `node scripts/rehearse-migration-00014.mjs --fixture-report` — expected: exit 0 (the container-free half, unchanged by this story); the full `node scripts/rehearse-migration-00014.mjs` is expected 0 only where Docker is available, and its absence is not a red.
- `git diff --stat keepalive.yml .github/workflows/ci.yml` — expected: empty.

**Owner-side, in order (the agent runs none of these):**
1. Create repository secret `SUPABASE_SERVICE_ROLE_KEY` in Settings → Secrets and variables → Actions (D-1 = A). I never read the value in `.env`, so this is yours.
2. `git push origin master` — there are four unpushed commits when this lands (`96e6c10`, `f4fd02b`, `ffa209b` and this story's).
3. Run the five deliberate-failure dispatches in `workflow-inventory.md` "Deliberate-failure verification", in that order, in a repo you're willing to see one test issue in — then close it.
4. Note for the record: `pipeline-inseason.yml` will fire its first scheduled run on **April 16**, and its first empty-feed red is a possible and legitimate outcome on that date (D-5 option A's known cost — one human read, then the YAML's leading edge moves).
