---
title: 'Story 2.16 — Retire the nba_com source: adapter, registry entry, hand-run probes and tests'
type: 'refactor'
created: '2026-10-06'
status: 'review'
baseline_commit: 'b4ef872a03cd9c9a83b9ce7019225c1afd437984'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-retro-2026-10-06.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `nba_com` source is hand-run only. `stats.nba.com` refuses every cloud, so no scheduled path can reach it. Its last live job, venue curation, is complete: 160/160 cells filled and F3 closed. It still carries about 2,350 lines that no gate program can see: `nbaCom.ts` (607), `probe-nba-com-adapter.mjs` (292), `probe-game7-venues.mjs` (401) and `nba-com.test.ts` (1,059). With `espn` scheduled and `manual_csv` as the floor, it is not worth maintaining (owner, 2026-10-06, reversing owner call C1).

**Approach:** Implement `epics.md` Story 2.16's ACs as written: delete the adapter, its registry entry, both probes and its test file in one commit, and retire `--season=` with its only adapter. Every anchor the epic ACs cite was re-derived for this spec, because Story 2.14 moved them (`deferred-work.md`, Story 2.14 review AA-4). Where the two disagree, this spec's Code Map wins on line numbers and the epic wins on substance.

## Boundaries & Constraints

**Always:**
- **Evidence before deletion.** Run a coverage pass and an unused-export scan, and record both outputs in Implementation Notes **before** any deletion. The tooling is installed without saving (`npm i --no-save …` or `npx --yes …`), so `package.json` and the lockfile stay unchanged.
- **Triage every `nba-com.test.ts` case.** Each case is dropped as adapter-only, mapped to an existing twin (cite it), or re-parented (the new test lands and is green **before** the original is deleted). No case is deleted while it is the sole pin of live code.
- **Keep the egress conclusion.** "nba.com refuses every cloud" keeps its citations in the docs, so nobody re-proposes the endpoint.
- **Annotate, don't rewrite.** Frozen spec and epic text that names the source gets a dated annotation, never an edit.
- **Commit hygiene.** One commit, named files only. Check `git status` first: the owner runs parallel sessions.

**Never:**
- No change to migrations, RPCs, crons, Edge Functions, `plan.ts` decisions or the `espn`/`manual_csv` behaviour. No live fetch by the agent.
- `scripts/spike-2-1/**` stays: it is provenance.
- No new checker for `scripts/*.mjs` (retro action item 5's other half stays open).

## I/O & Edge-Case Matrix

| Scenario | Input | Expected after this story |
|---|---|---|
| Retired source by flag | `--source=nba_com` | Refuses the start as an unrecognised adapter; no sink opened |
| Retired source by env | `SERIES_SOURCE=nba_com` | Same refusal, never a fallback to `manual_csv` |
| Retired flag | `--season=2025-26`, with any source | Refused as an unrecognised flag (exit 2), naming the token |
| Scheduled source | `--source=espn --require-feed` on an empty feed (also with `--dry-run`) | Red, as before. The dry-run case now runs on `espn` |
| Floor | `--source=manual_csv`, or no source | Unchanged |

</frozen-after-approval>

## Code Map

Anchors as of HEAD `b4ef872`:
- `supabase/scripts/pipeline/port.ts`: import `:20`; the C1 comment `:150-163`, where the reversal is recorded; registry entry `:166`; `seasonOverride` `:123-124`.
- `supabase/scripts/pipeline/run.ts`:
  - **Header:** usage line `:15`; Story 2.4 `--season` prose `:24-30`.
  - **Flag lists:** `ADAPTER_FLAGS.nba_com` `:88` and its comment `:91`; the `SUPPORTED_FLAGS` season entry `:159-165`, which also feeds the help text.
  - **`--season` wiring:** `seasonArg` `:279`; refresh scoping `:312-318`; `passedFlags` `:346`; `seasonOverride` `:398`. Plus prose mentions at `:342` and `:430`.
- `supabase/scripts/pipeline/adapters/rounds.ts`: `walkChainDepth` `:62` and `histogramFromPlacements` `:80` go, with their types `:39-60`, unless the scan finds another consumer. `labelForDepth` `:34` and `formatHistogram` `:93` stay, because `espn.ts` uses them.
- **`tests/pipeline/nba-com.test.ts` triage.** Describes `:225`, `:286`, `:356`, `:441` and `:567` are adapter-only. The runner suite at `:815` has 15 cases:
  - **Have twins** in `espn-adapter.test.ts`:
    - report before planning and planning abort `:816`/`:848` → `:902`
    - re-run skips `:946` → `:914`
    - a flag the adapter doesn't understand `:957` → `:999`
    - dry-run `:1008` → `:892`
  - **Retire with `--season`:** `:897`, `:924`, `:966`, `:979`.
  - **Re-parent into `run.test.ts`:** the duplicate-flag refusal `:989`, re-pinned with `--csv=`, since there is no twin today.
  - **Verify a twin or re-parent:** exclusion notes reaching stdout `:832`; fetch-failure `:874` and drift `:887` through the runner; `SERIES_SOURCE` selection end to end `:998`; manual_csv still defaults `:1021`.
  - **Moves:** the `manual_csv` deps case `:1050` goes to `manual-csv.test.ts`.
- `tests/pipeline/run.test.ts`:
  - **Re-point:** the selection cases `:376-385` and the refresh bypass `:679-713` (`:713` is `--season`).
  - **`--require-feed` block `:841-1035`:** it is built on nba.com's `resultSets` body (`feedBody`/`stubFeed` `:831-832`). Its red, green and one-series cases have `espn` twins at `espn-adapter.test.ts:941-993`. The dry-run alarm `:966` has none, so it is re-parented onto `espn`. The registry list `:998` and the per-adapter empty bodies `:1001-1004` drop `nba_com`.
  - **Comments:** `:22` and `:356` are updated.
  - **W4 pin `:1196-1215`:** it loops over the registry, so it stays green once the `:15` usage line goes.
- `tests/pipeline/venue-backfill.test.ts`: the `node --check` list `:597-604` drops both probes; the source-text pins `:712-731` are deleted.
- `.github/workflows/pipeline-inseason.yml:69`: the `source` input's description drops "(nba_com runs by hand only…)". This is text only; the options and crons are unchanged. `workflows.test.ts:134,153` are comments, so keep their "not offered" meaning.
- **Docs:**
  - `_bmad-output/implementation-artifacts/seriesdatasource-port.md` (14 mentions; registry line `:85-88`, header `:3-5`)
  - `docs/CURRENT_DATA_MODEL.md:162`
  - `epics.md` Stories 2.4 and 2.6
  - stale comments: `espn.ts:60,577`, `rounds.ts:21`, `team-logos.ts:116`, `rehearse-migration-00014.mjs:116`, `espn-adapter.test.ts:2`
  - `docs/CHANGELOG.md` stays as history.

## Tasks & Acceptance

**Execution:**
- [x] Coverage plus unused-export scan; record both outputs.
- [x] Re-parent and re-point first: run `npx vitest run tests/pipeline` green with the originals still present.
- [x] Delete `nbaCom.ts`, both probes and `nba-com.test.ts`; remove the registry entry and the `rounds.ts` dead exports.
- [x] Retire `--season`: every `run.ts`/`port.ts` site above, plus `run.test.ts:713`.
- [x] Workflow description text; docs annotations; C1 reversal in `port.ts`'s comment; comment sweep.
- [x] Update `sprint-status.yaml`.

**Acceptance Criteria:**
- Given the five matrix rows, when the runner suite runs, then each is pinned by a passing test.
- Given the triage, when Implementation Notes are read, then every one of `nba-com.test.ts`'s cases names its fate and landing place, with per-case mutation evidence for each re-parented test.
- Given `grep -rn "nbaCom\|nba-com\|nba_com\|--season" supabase src tests scripts .github --include=*.ts --include=*.mjs --include=*.yml`, then only dated annotations, egress-evidence citations, `workflows.test.ts`'s "not offered" pin, `run.test.ts`'s refusal pins and `scripts/spike-2-1/**` remain.
- Given the change, when `npm run gate` runs, then it exits 0.

## Verification

**Commands:**
- `npm run gate`: expected exit 0, read from the command itself.
- `npx vitest run tests/pipeline`: green before the deletions, and green after.

## Implementation Notes

### 1. Evidence before deletion (recorded 2026-10-06, HEAD `b4ef872`, nothing deleted yet)

Tooling was installed without saving: `npm i --no-save @vitest/coverage-v8@4.1.11` (matches the installed `vitest` 4.1.11) and `npx --yes knip@5`. `package.json` and `package-lock.json` were diffed against a pre-install copy afterwards: both unchanged.

**Coverage pass.** `npx vitest run tests/pipeline --coverage.enabled --coverage.provider=v8 --coverage.include='supabase/scripts/pipeline/**'`, run twice: with every pipeline test file, and with `--exclude tests/pipeline/nba-com.test.ts`. The second run shows what `nba-com.test.ts` is the **sole** pin of.

| File | All 8 files (365 tests) | Without `nba-com.test.ts` | Lines that only `nba-com.test.ts` reaches |
|---|---|---|---|
| `run.ts` | lines 133/134, funcs 28/29, branches 85/93 | lines 130/134, funcs 26/29, branches 83/93 | `:119-120` (the duplicate-flag refusal in `flagValue`); `:354` (the `allowed.map(...)` arrow — a misplaced flag on an adapter that *has* flags, which only `--season=` on `manual_csv` reaches) |
| `manualCsv.ts` | lines 78/80 | lines 77/80 | `:206` (the missing-`csvPath` refusal) |
| `rounds.ts` | lines 22/22, funcs 7/7 | lines 21/22, funcs 6/7 | `:64` (`walkChainDepth`'s body) |
| `nbaCom.ts` | lines 189/193 | lines 138/193 | the adapter itself (deleted) |
| `plan.ts`, `port.ts`, `venueBackfill.ts`, `writer.ts`, `espn.ts` | — | identical to the left column | none |

So the live code `nba-com.test.ts` solely pins is: the duplicate-flag refusal (re-parented, §2 row 12), the `manual_csv` missing-`csvPath` refusal (moved, §2 the `:1050` case), and the `run.ts:354` arrow. That arrow becomes unreachable once `--season=` retires — `csv` is the only scoping flag left, and the only adapter that accepts it is `manual_csv`, so no misplaced flag can meet a non-empty allowed list. It is left as written (the `ADAPTER_FLAGS` shape is the spec's to keep, and the message still renders correctly if a second scoping flag is ever added); recorded here, not hidden.

**Unused-export scan.** `npx --yes knip@5 --include exports,types --reporter compact`, pipeline rows only (the `src/` rows — unused shadcn re-exports and the like — are outside this story and left to retro action item 6):

```
Unused exports
supabase/scripts/pipeline/adapters/espn.ts: EspnError, LEAGUE_TIME_ZONE, ESPN_HEADERS
supabase/scripts/pipeline/adapters/nbaCom.ts: NbaComError, buildFeed
supabase/scripts/pipeline/adapters/rounds.ts: CANONICAL_ROUND_LABELS, MIN_CHAIN_DEPTH, MAX_CHAIN_DEPTH
supabase/scripts/pipeline/port.ts: AdapterSelectionError
supabase/scripts/pipeline/venueBackfill.ts: EXPECTED_NBA_BAA, EXPECTED_ABA, SYNTHETIC_KEEP_COUNT
supabase/scripts/pipeline/writer.ts: scorePayload
Unused exported types
supabase/scripts/pipeline/adapters/espn.ts: EspnFeedResult
supabase/scripts/pipeline/adapters/nbaCom.ts: NbaComFeedResult
supabase/scripts/pipeline/adapters/rounds.ts: ChainPlacement
supabase/scripts/pipeline/venueBackfill.ts: SeasonOutcome, FeedAlias, FeedSeriesPair, MatchedSeries, UnmatchedSeries, SeriesPair, OrientationDecision, VenueAssignment, CliResult
```

knip counts test files as consumers and does not treat the dynamic `import()`s inside `scripts/*.mjs` as entries, so it was paired with a per-export consumer grep over `supabase src tests scripts` (`scripts/spike-2-1/**` excluded) for the three modules this story touches. The rows that decide this story:

- `rounds.ts`: `walkChainDepth`, `histogramFromPlacements` and `ChainSeriesInput` → only `nbaCom.ts`; `ChainPlacement` → none outside the file. `labelForDepth` and `formatHistogram` → `espn.ts` (and `nbaCom.ts`). `CANONICAL_ROUND_LABELS`/`MIN_CHAIN_DEPTH`/`MAX_CHAIN_DEPTH` → no consumer outside `rounds.ts`, but `labelForDepth` reads all three, so they stay (their `export` keyword is the only dead part, and un-exporting them is not this story's).
- `nbaCom.ts`: `validateSeasonOverride` → the two probes only; `NBA_COM_HEADERS`, `deriveSeason`, `gameLogUrl` → `nba-com.test.ts` and the probes only; `createNbaComAdapter` → `port.ts`, the test file and the probes. (`FETCH_TIMEOUT_MS`/`MAX_FEED_ATTEMPTS`/`BACKOFF_MS`/`buildFeed` grep-match `espn.ts`, but those are `espn.ts`'s own same-named declarations, not imports — `espn.ts` imports only `rounds.ts` and `port.ts` types.)
- `venueBackfill.ts` (not changed here — out of this story's Code Map, recorded for action item 6): once `probe-game7-venues.mjs` is gone, `classifySeason`, `SEASON_OUTCOME_MEANING`, `parseFeedAliases`, `matchSeasonFeedSeries` and `resolveFeedCode` have **no non-test consumer** (their only other reader was the probe); `isNbaBaa` keeps `rehearse-migration-00014.mjs`, `parseTeamsSeed` keeps its `src/` tests. Action item 5's "move the probe's per-match logic into `venueBackfill.ts`" is moot for a probe that no longer exists; whether these exports retire is the open half of action item 6.

### 2. Triage of `tests/pipeline/nba-com.test.ts` (64 cases: 61 `it` + one `it.each` of 3)

Order followed the spec: every re-parent and re-point below landed first, and `npx vitest run tests/pipeline` was green **with the originals still present** — 8 files, 369 tests (365 baseline + 1 moved + 6 re-parented − 3 `--require-feed` originals whose twins are cited below). Only then were the four files deleted. New line numbers are post-change.

**Adapter-only, dropped (48 cases).** `:225` port rows and the one-request rule (7), `:286` Decision 3 selection and counts (5), `:356` Decision 10 round derivation (6), `:441` feed shape drift (13), `:567` request posture (14 + the `:643` `it.each` of 3 = 17). Each pins `nbaCom.ts` or the chain walk deleted with it. The one guarantee inside them that outlives the adapter — the four canonical labels score 1/2/3/4 in `getRoundImportance` (`:373`) — already has a twin at `src/lib/__tests__/nba-utils.test.ts:194-206`, which asserts all four labels directly; `rounds.ts`'s header now cites that test instead of the deleted one.

**Runner suite `:815` (15 cases).**

| # | Original | Fate | Lands at |
|---|---|---|---|
| 1 | `:816` report prints before planning; pending series births with seed ids | twin | `espn-adapter.test.ts:902` (report before planning). The birth half is `nba_com`-only: `espn` cannot birth. |
| 2 | `:832` exclusion notes reach stdout through the runner | **re-parented** | `run.test.ts:1253`, on `espn` (a game-2 event is excluded and named); also pins note-after-report, before-plan order |
| 3 | `:848` a planning abort still shows the parse | twin | `espn-adapter.test.ts:902` |
| 4 | `:874` a feed that 403s three times exits 2 through the runner, no fallback | **re-parented** | `run.test.ts:1264`, on `espn` with 503 ×3 (`espn` does not retry 403, so 503 is the three-attempt shape); asserts URL + status, "no manual_csv fallback", sink calls `['readTeams']`, and a `readFile` that throws |
| 5 | `:887` feed shape drift aborts through the runner | **re-parented** | `run.test.ts:1281`, on `espn` (a body with no `events` array) |
| 6 | `:897` `--season=` onto an archived year that disagrees | retired with `--season=` | the guard itself stays pinned at `plan.test.ts:187`, `:413` |
| 7 | `:924` `--season=` onto an archived year that agrees | retired with `--season=` | `plan.test.ts:187`, `:394`, `:401` |
| 8 | `:946` a re-run plans nothing | twin | `espn-adapter.test.ts:914` |
| 9 | `:957` `--csv=` with the feed adapter refuses | twin | `espn-adapter.test.ts:998`, re-pointed from `--season=` to `--csv=operator.csv` in this story because `--season=` is now refused earlier, as an unrecognised flag |
| 10 | `:966` `--season=` with `manual_csv` refuses | retired with `--season=` | replaced by the matrix pin `run.test.ts:1324` (unrecognised flag with any source) |
| 11 | `:979` `--season=` reaches the wire | retired with `--season=` | not re-parented, per the epic AC |
| 12 | `:989` a duplicate `--season=` refuses | **re-parented** | `run.test.ts:1297`, as a duplicate `--csv=` (`--source=manual_csv --csv=first.csv --csv=second.csv`); also pins no sink opened, no file read |
| 13 | `:998` `SERIES_SOURCE` selects the adapter end to end | **re-parented** | `run.test.ts:1289`: `SERIES_SOURCE=espn`, no `--source=`, reaches the feed report and `pipeline adapter=espn`. No twin existed: every `espn` runner case passes `--source=`. |
| 14 | `:1008` `--dry-run` with the feed adapter writes nothing | twin | `espn-adapter.test.ts:892` |
| 15 | `:1021` `manual_csv` still works, defaults, and reports nothing extra | **re-parented** | `run.test.ts:1352`. `run.test.ts` had default runs, but none asserted the absence of feed-report lines. |

**`:1050` `manual_csv` deps (1 case): moved** unchanged to `manual-csv.test.ts:146`.

**`run.test.ts` re-points.**
- Selection `:376` became the matrix's two retired-source rows, `run.test.ts:416` (`it.each` by flag and by env). Each asserts the "not a recognised adapter" refusal listing `espn, fantrax, manual_csv`, no sink opened, no file read and no fetch — never a fallback.
- Refresh bypass `:679`: its `--source=` row now names `espn` (`:736`). The scoping-flag loop `:705` lost its `--season=` row (`:762`); `run.ts`'s refresh path now checks `--csv=` alone.
- `--require-feed` block: it rides `espn` bodies now. Its red, green and one-series originals were deleted with their twins cited in the block's own comment (`espn-adapter.test.ts:941` red + green, `:950` one-series). The dry-run alarm had no twin and was **re-parented** onto `espn` (`run.test.ts:964`), asserting the report line and the derived `dates=` print before the red. The typo case re-points to `--source=espn` (`:981`), the registry list is `['espn', 'manual_csv']` (`:1000`), and the empty-body map drops the retired adapter.
- Matrix "retired flag" row: `run.test.ts:1324`, `--season=2025-26` with no source, `manual_csv`, `espn` and `--refresh-insights`. Each exits 2 naming the token, opens no sink and no longer lists `--season=<YYYY-YY>` in the help.
- Matrix "scheduled source" row: `espn-adapter.test.ts:941` (red, and green without the flag) plus `run.test.ts:964` (dry-run). "Floor" row: `run.test.ts:1352` and the existing `manual_csv` cases.

### 3. Mutation evidence (each re-parented or new pin)

Script `mutate.py` (session scratchpad): apply one mutation to live code, run only the named test with `npx vitest run <file> -t <name>`, then restore the file byte for byte. Unmutated, every row passed (exit 0) in the same run.

| Test | Mutation to live code | Mutated result |
|---|---|---|
| `run.test.ts:1253` notes reach stdout | `run.ts`: the `for (const note of report.notes) log(note)` loop logs nothing | exit 1, 1 failed |
| `run.test.ts:1264` fetch failure | `run.ts`: `fetch_series_statuses()`/`fetch_game_scores()` gain `.catch(() => [])` (a silent empty fallback) | exit 1, 1 failed |
| `run.test.ts:1281` drift | same mutation | exit 1, 1 failed |
| `run.test.ts:1289` `SERIES_SOURCE` selection | `run.ts`: the env read is dropped (`?? DEFAULT_ADAPTER_NAME` only) | exit 1, 1 failed |
| `run.test.ts:1297` duplicate `--csv=` | `run.ts` `flagValue`: `hits.length > 1` → `> 99` | exit 1, 1 failed |
| `run.test.ts:1352` `manual_csv` reports nothing extra | `manualCsv.ts`: the source gains a `describeRun` | exit 1, 1 failed |
| `manual-csv.test.ts:146` missing `csvPath` | `manualCsv.ts`: the `csvPath === undefined` guard never fires | exit 1, 1 failed |
| `run.test.ts:964` dry-run alarm on `espn` | `run.ts`: the alarm condition gains `&& !dryRun` | exit 1, 1 failed |
| `run.test.ts:416` retired source (2 rows) | `port.ts`: an `nba_com` entry re-registered | exit 1, 2 failed |
| `run.test.ts:1324` retired flag (4 rows) | `run.ts`: `season` re-added to `SUPPORTED_FLAGS` | exit 1, 4 failed |

### 4. Verification

- `npx vitest run tests/pipeline`: green before the deletions (8 files, 369 tests) and after (7 files, 307 tests). 307 = 369 − 64 (the deleted file) − 1 (the venue-probe source-text pin) − 2 (the two `node --check` rows) − 1 (old selection case) + 2 + 4 (the two matrix `it.each`s).
- `npm run gate`: **exit 0**, read from the command itself (`GATE EXIT 0`). Biome checked 128 files, `tsc -b` clean, Vitest 24 files / 532 tests, and the build passed with the `/predictgame7/` base-path check. 532 = Story 2.14's recorded 590 − 64 − 1 − 2 − 1 − 3 + 1 + 6 + 2 + 4.
- AC grep (`grep -rn "nbaCom\|nba-com\|nba_com\|--season" supabase src tests scripts .github --include=*.ts --include=*.mjs --include=*.yml`, `scripts/spike-2-1/**` aside). What remains is dated Story 2.16 annotations (`rounds.ts:14`, `run.ts:25,126`, `espn-adapter.test.ts:999`, `manual-csv.test.ts:144`, `run.test.ts:768,1228`), `run.test.ts`'s refusal pins (`:417-443`, `:1320-1348`), and `workflows.test.ts:134,154`, the "not offered" pin. `.github` has no hit: the workflow's `source` description no longer names the source, and its options and crons are unchanged.
- Not done by the agent: no live fetch, no migration, RPC, cron, Edge Function or `plan.ts` change. The CI `deno check` step is unaffected, since no `supabase/functions/**` file changed.

## Spec Change Log

## Review Triage Log
