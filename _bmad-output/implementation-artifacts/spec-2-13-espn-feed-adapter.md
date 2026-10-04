---
title: 'Story 2.13 — ESPN feed adapter'
type: 'feature'
created: '2026-10-04'
status: 'review'
baseline_commit: '332b7c2a4f558cfe0fb183364399e052cda754f4'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/specs/spec-2-13-espn-feed-adapter/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-2-13-espn-feed-adapter/payload-contract.md'
  - '{project-root}/_bmad-output/specs/spec-2-13-espn-feed-adapter/surface-inventory.md'
  - '{project-root}/_bmad-output/specs/spec-2-13-espn-feed-adapter/schedule-amendment.md'
  - '{project-root}/_bmad-output/implementation-artifacts/seriesdatasource-port.md'
---

## Intent

**Problem:** Story 2.6's egress evidence killed the pipeline's only automated source: `nba.com` refuses every cloud (DNS refused from Supabase's, ConnectTimeout hosted) while ESPN answers from both (226 ms Supabase, 78 ms hosted). The scheduled runner therefore has no reachable feed for the 2027 playoff window, and its `--source=nba_com` default points at a host that cannot answer.

**Approach:** Add `espn.ts` behind the frozen `SeriesDataSource` port and register it, so `SERIES_SOURCE=espn` becomes a real run: one single-date scoreboard request per run, the date derived as the previous `America/New_York` calendar day from the run instant; teams resolved through a new additive `teams.espn_code` column; round and game number parsed from `competitions[0].notes[0].headline`. Both pipeline workflows, their `--require-feed` alarm copy, and `keepalive.yml`'s minute move in the same commit that lands the registry entry, so no cron ever points at a source less reachable than the one it replaced.

## Boundaries & Constraints

**Always:**
- One date per run, derived from the run instant, never a parameter and never a fixed constant. The runner stays date-blind.
- Team identity through `teams.espn_code` only. A code that resolves to nothing aborts naming the code. `00018` is additive, nullable, unique-where-not-null, seeded for the 30 modern franchises only; `EXPECTED_TEAM_COUNT = 59` untouched; `docs/CURRENT_DATA_MODEL.md` updated in the same commit as the migration.
- Registry entry, both workflow re-points and `workflows.test.ts`'s pins in ONE commit; `seriesdatasource-port.md`'s registry line gains `espn` in the same commit as the adapter.
- Adapter tests are fixture-driven and hermetic — no test and no agent touches the network. Fixtures are built inline the way `tests/pipeline/nba-com.test.ts` does it (the house pattern; `surface-inventory.md`'s `tests/pipeline/fixtures/espn-*.json` line is superseded).
- `npm run gate` is the definition of done, with exit codes read from the command itself, never from a pipe. Commit locally to `master` with named files only, re-checking `git status` first — the owner runs parallel sessions.

**Never:**
- No live fetch by the agent. No `git push` (hand the owner the command). No `supabase db push` / `db reset` / `db start`, no psql at `supabase/.temp/project-ref` — that is production; `00018`'s application is the owner's leg. No Edge Function deploy; nothing in `supabase/functions/**` moves. No new PostHog event names.
- No multi-date loop, lookback window, range parameter (`400` measured) or postseason calendar anywhere. One date per run is the whole fetch contract; the game-7-only admission is what makes it reach the table.
- No substring/city/nickname team matching. No invented `espn_code`. No rewrite of the 17 archived era `round` spellings. No change to the bracket, the three-line report shape, `--require-feed`'s placement, the concurrency group, the notify composite, dedupe or D-7.
- `nba_com` is not deleted: it stays registered and hand-runnable, it just leaves the workflow surface.

### Planning decisions (owner calls, 2026-10-04)

- **How a one-date feed reaches the table:** `plan.ts` learns exactly one new source shape — a stored *pending* series plus a source carrying only that series' game 7. The 3-3 certification is **not** dropped: `pipeline_complete_series` re-reads the stored games 1..6 and raises unless they are six decided games split 3-3 (`supabase/migrations/00015_pipeline_series_functions.sql:286-308`), and it already refuses a `game_number <> 7` (`:231`), a home/away outside the series pair (`:240-243`), a tie (`:243-245`), a winner mismatch (`:251-255`), an archived row (`:265`) and a differing stored game 7 (`:272-279`). What narrows is only the plan-level equality between the source and the stored games 1–6 — impossible for this adapter, because its feed carries none — and the runner keeps its own pre-flight pair/game-7 checks so nothing reaches a write the database would reject. Births stay curated (Story 2.7's drill owns them); the pipeline's live job is Game 7 admissions only. The adapter consequently admits **Final AND game 7** and excludes every other final BY RULE, naming each exclusion in `describeRun().notes` — the exclusion `port.ts:57-64` already describes `feedSeriesCount` counting before. No multi-date loop and no lookback is introduced by this decision.
- **`00018` seeds:** the owner's probe leg lands first, and the agent transcribes its 30-franchise table into the migration's `UPDATE`s, so `00018` is authored complete in one commit — never a schema-with-empty-seed migration on the path to `db push`, never an invented code.
- **Scope:** the schedule amendment stays inside this spec despite the ~2.3k-token count (owner accepted the context-rot risk).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | ET date carrying a Game 7 final between a stored pending pair | One completion write via the existing RPC: game 7 row + `winner_team_id`, series becomes archive | N/A |
| Same-day game 4 | Final, but not game 7 | Excluded BY RULE, named in `describeRun().notes`; plan stays empty for it and the run is green | N/A |
| Rest day | Run instant whose previous ET day has zero NBA games | `feedSeriesCount: 0`, `--require-feed` throws, run exits non-zero, alarm fires | Refusal, not silence — the red is the instrument working |
| Non-Final admitted | Same-day game still `In-Progress`/`Scheduled` | Excluded BY RULE and named in `describeRun().notes`; never fed to the planner | N/A |
| Unresolvable code | Feed carries `espn_code` no `teams` row holds | Abort naming the code | No curation into a row, no fuzzy match |
| Range requested | `dates=20260601-20260607` | Never constructed — the single-date form is the only shape built | N/A |
| Game 7 for an unknown pair | Source game 7 whose pair has no stored row | Refuse: no birth from a partial source | `PlanAssertionError` naming the pair |
| Game 7 slot clash | Source game 7 whose home/away set differs from the stored pair | Refuse before any write | `PlanAssertionError` naming series id and both ids |

## Code Map

- `supabase/scripts/pipeline/port.ts` — `SeriesDataSource` `:70-75`; `AdapterRunReport` `:52-67` (`feedSeriesCount` counts BEFORE exclusion, and its wording already names the "non-Game-7 shape" this adapter excludes); `AdapterDeps` `:97-115` (`teamIdByAbbreviation` `:106`, `fetch` `:108`, `now` `:110`); `AdapterEntry` `:117-132`; `ADAPTER_REGISTRY` `:147-154` (`nba_com` `:149`, `fantrax` refusal `:150-153`); `adapterHasRunReport` `:163-165`; rejections `:175-186`.
- `supabase/scripts/pipeline/adapters/nbaCom.ts` — the shape to copy: `deriveSeason` `:111-114` (Jan–Jun → `Y-1`–`YY`), `FETCH_TIMEOUT_MS`/`MAX_FEED_ATTEMPTS`/`BACKOFF_MS` `:91-94`, memoised `buildFeed` `:556-566`, `describeRun()` throwing pre-settle `:575-580`, unknown-abbreviation throw `:358-361`, tie rejection `:402-406`, `feedSeriesCount` `:537-540`.
- `supabase/scripts/pipeline/run.ts` — `ADAPTER_FLAGS` `:74-77` and its enforcement `:280-290`; `--require-feed` up-front refusal `:297-303` (its copy says "use --source=nba_com"); `openSink` `:308`, `readTeams` `:310`, `teamIds` map `:311`, deps bag `:312-320`, `createAdapterSource` `:322`; report printing `:330-336`; empty-feed throw `:346-352`; single catch → exit 2 `:405-408`.
- `supabase/scripts/pipeline/writer.ts` — `TeamRow` `:20-23`; `PipelineSink.readTeams` `:40`; `readTeams` `:94-98` selects `id, abbreviation` with no order/limit — must learn `espn_code`. `run.ts:218-222` (`deps.createSink`) is the seam `tests/pipeline/run.test.ts` already fakes, so the resolution gets unit coverage without a database; `tests/pipeline/plan.test.ts` is pure in-memory (source + current arrays, no sink).
- `supabase/scripts/pipeline/plan.ts` — `validatedShape` `:206-247` (the shape gate the new source form must pass through — decide whether game-7-only is admitted here or at the branch); `groupSourceRows` orphan-score throw `:273-282`; pending skip/completion/throw `:359-379` (`:364` is the `sameScores(exact.scores, throughSix)` cross-check the owner's call narrows); archive `:382-389`; non-reconciling repair path `:396-412`; `src/lib/series-phase.ts:25-44` accepts exactly {1..6}/{1..7}; completion writes go through the existing RPC, which hard-rejects `game_number <> 7` (`supabase/migrations/00015*.sql:231-235`) — unchanged by this story.
- `supabase/scripts/pipeline/rounds.ts` — `CANONICAL_ROUND_LABELS` `:28`, `labelForDepth` `:34-36`; `walkChainDepth` `:62` is nbaCom-only — the ESPN adapter must not reach chain depth, it parses the headline.
- `.github/workflows/pipeline-inseason.yml` `:30-32` crons, `:11-13` comment, `:44/:47-49/:50` dispatch input, `:113` `PIPELINE_SOURCE`, `:134` alarm copy; `pipeline-offseason.yml` `:19-20` crons, `:77-78` echo + `--source=nba_com`; `keepalive.yml:5`.
- `tests/pipeline/workflows.test.ts` — `cronsOf` `:72`; pins `:98`, `:103`, `:142`, `:335` (keepalive `['0 9 * * *']` inside the `:332` "keepalive.yml is untouched in shape and never learns about the pipeline" block whose needles `:336-340` stay), `:317`; `inputs.source` `toMatchObject` `:127`; `--source=nba_com` `toContain` `:156`; input keys `:122`; `--require-feed` `:108/:112/:117/:154-155`; secret `env:` `:161/:175/:178/:182`.
- `tests/pipeline/nba-com.test.ts` — inline fixture builders `SeriesSpec` `:84-102`, `feedBody()` `:135`, `stubFeed` `:173`, `runnerHarness` `:744`; `tests/pipeline/run.test.ts` pins registry declaration vs factory output.
- `supabase/migrations/` — `00015`/`00016`/`00017` are the highest, so `00018_teams_espn_code.sql` is free; house style from `00016`: banner header, `BEGIN;`/`COMMIT;`, `DO $guard$ … RAISE EXCEPTION … USING ERRCODE = '23514'`, plain `ADD COLUMN`.
- `scripts/rehearse-migration-00014.mjs` — `COVERED_THROUGH = 17` `:132`, enumeration `:543-545`, ceiling guard `:569-574`, `applyRejected` negative-proof helper `:985-992`.
- `_bmad-output/implementation-artifacts/seriesdatasource-port.md:81-82` — registry table line gains `espn`.

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/00018_teams_espn_code.sql` — add nullable `espn_code text` with a partial unique index (`WHERE espn_code IS NOT NULL`) plus the 30 `UPDATE`s transcribed from the owner's probe output — additive, the 29 historical identities and the `Team A`/`Team B` placeholders stay NULL. The probe leg (`run-sheet.md` step 1) lands BEFORE this file, so it is authored complete in one commit; never a placeholder-with-empty-seed migration, never an invented code. **BLOCKED on probe leg B — not authored, deliberately: the seeds are transcription, not authorship.**
- [x] `supabase/scripts/pipeline/adapters/espn.ts` — new: URL builder (single-date form only), date derivation from `now()` in `America/New_York`, headline parse to canonical round + game number (round segment → `CANONICAL_ROUND_LABELS` via `labelForDepth`; an unrecognised round phrase excludes the game and names it — never a new spelling), **Final AND game 7 admission** with every other game excluded BY RULE and named in notes, `espn_code` resolution with abort-naming-the-code, `describeRun` with `feedSeriesCount` counted before exclusions.
- [x] `supabase/scripts/pipeline/plan.ts` — admit the one new source shape (pending stored series + source carrying exactly that pair's game 7) into a completion, checking the stored row reconciles to {1..6}, game 7's home/away set equals the stored `(team_a_id, team_b_id)`, and the winner comes from game 7's score with no tie; refuse game 7 without a stored pair rather than birthing from a partial source. The message must name the series id and both team ids, and must say the games 1–6 cross-check does not apply to this path.
- [x] `supabase/scripts/pipeline/port.ts` — registry entry `espn: { implemented: true, hasRunReport: true, create: createEspnAdapter }`; `nba_com` untouched.
- [x] `supabase/scripts/pipeline/writer.ts` + `run.ts` — `TeamRow`/`readTeams` carry `espn_code`; `AdapterDeps` gains the code→id resolver; `ADAPTER_FLAGS` learns `espn`; the `:301` refusal copy stops recommending a refused host.
- [x] `.github/workflows/pipeline-inseason.yml`, `pipeline-offseason.yml`, `keepalive.yml` — re-point defaults/options/description/`PIPELINE_SOURCE`/alarm copy to `espn`; move the inseason crons `:30-32` and the offseason edges `:19-20` to 07:30 UTC, `keepalive.yml:5` to `0 7 * * *`, rewrite `:11-13` to name the new pair and its reason — one commit with the registry entry.
- [x] `tests/pipeline/espn-adapter.test.ts` — new, inline fixtures (the `nba-com.test.ts` pattern, no `fixtures/` directory): date derivation (pin instant `2026-06-06T07:30:00Z` → `dates=20260605`), headline parse, Final-and-game-7 exclusion named in notes, unresolvable-code abort, range never constructed, `describeRun` before settle.
- [x] `tests/pipeline/plan.test.ts` — the new shape's cases: game-7-only completion plans exactly one completion; stored pair absent → refuse; home/away set mismatch → refuse; stored row already archived → today's archive branch unchanged; and the existing {1..6}/{1..7} rejections stay green untouched.
- [x] `tests/pipeline/workflows.test.ts`, `tests/pipeline/run.test.ts` — move `:98/:103/:142/:156/:127/:335` pins; `:335` becomes `['0 7 * * *']` and `:332`'s title is re-worded to what the block actually pins (no notify step, no service-role secret, no run.ts needle, `permissions` undefined) while every needle assertion survives.
- [x] `scripts/probe-espn-adapter.mjs` — new owner-run probe (30-franchise code table + the two measured dates + the range control); pinned by `tests/pipeline/venue-backfill.test.ts` (syntax smoke + the bad-flag exit-2 proof).
- [ ] `scripts/rehearse-migration-00014.mjs` — `COVERED_THROUGH = 18` with a duplicate-`espn_code` negative proof through `applyRejected`. **Blocked with `00018`: the rehearsal replays the migration list, so extending it before the file exists makes the ceiling guard red.** Ordering that follows from the probe-first decision: nothing that selects `espn_code` may run against the live database before `00018` is applied, so the probe → `00018` → `db push` (owner's leg) sequence in `run-sheet.md` gates the dispatch legs, not the code landing.
- [x] `_bmad-output/implementation-artifacts/seriesdatasource-port.md:81-82` registry line, and the `docs/`-visible note recording basketball-reference as the unimplemented fallback of last resort (it landed in the port doc's own section, which is where the fallback is designated).
- [ ] `docs/CURRENT_DATA_MODEL.md` — same commit as `00018`. **Blocked with the migration.**
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml:244` — `backlog` → in flight.

**Acceptance Criteria:**
- Given a committed fixture whose games carry `espn_code` values the injected table holds, when the adapter runs, then status/score rows match the fixture and no code path performs substring, city or nickname matching.
- Given a run instant of `2026-06-06T07:30:00Z`, when the request URL is built, then it carries `dates=20260605` and no other date parameter.
- Given a feed whose teams include a code absent from `teams`, when the run resolves identities, then it aborts with a message naming that code and writes nothing.
- Given both pipeline workflows, when `workflows.test.ts` loads them, then every `source` default, choice list and `--source=` literal reads `espn`, and every cron literal matches the 07:30/07:00 pair.
- Given `nba_com` after this story, when a hand run uses `--source=nba_com`, then it still runs — the registry keeps the name and its refusal-free path.
- Given a stored pending series with games 1–6 and a source carrying only that pair's final game 7, when `planPipeline` runs, then it plans exactly one completion through the existing RPC and writes nothing else.
- Given a source carrying a final game that is not game 7, when the adapter reports, then that game appears as a named exclusion and never as a row for the planner.
- Given the whole change, when `npm run gate` runs, then it exits 0 with the code read from the command itself.

## Verification

**Commands:**
- `npm run gate` -- expected: exit 0 (lint, typecheck, test, build in that order); read the code from the command itself, never from a pipe.
- `npx vitest run tests/pipeline/espn-adapter.test.ts tests/pipeline/plan.test.ts tests/pipeline/workflows.test.ts tests/pipeline/run.test.ts` -- expected: exit 0, and per-AC mutation evidence for each new pin (break the assertion's input, watch that specific test go red, restore).
- `git status` before staging, then `git add` with named files only -- expected: nothing from a parallel owner session swept in.

**Manual checks:**
- No `git push` — hand the owner `git push origin master` as the closing line of the report.
- `grep -rn "network\|fetch(" tests/pipeline/espn-adapter.test.ts` returns only the injected stub feed; the suite must stay green with no route to Disney.

## Implementation Notes

**Landed this session (adapter build legs; the probe-owned seed legs are below):**

- `supabase/scripts/pipeline/adapters/espn.ts` — new. One `scoreboard?dates=YYYYMMDD` request per run (the single-date form is the only URL the file builds; `deriveRequestDate` reads the previous `America/New_York` calendar day off the injected `now()`), headline → canonical round + game number through `labelForDepth`, admission **Final AND game 7** with every other game excluded by rule and named in `describeRun().notes`, identity through `deps.teamIdByEspnCode` only (abort names the code; constructed without that resolver the adapter refuses rather than falling back to abbreviation).
- `supabase/scripts/pipeline/port.ts` — `espn: { implemented: true, hasRunReport: true, create: createEspnAdapter }`, `AdapterDeps.teamIdByEspnCode?`, and the registry doc block rewritten to state why `espn` is scheduled and `nba_com` is hand-run (owner call C1). `nba_com`'s entry is untouched.
- `supabase/scripts/pipeline/writer.ts` + `run.ts` — `TeamRow`/`readTeams` carry `espn_code`; the code→id map is built beside the abbreviation map and passed into the deps bag; `ADAPTER_FLAGS` learns `espn` (it takes no flags); the `--require-feed` refusal copy stops recommending a host that refuses clouds.
- `supabase/scripts/pipeline/plan.ts` — the one new source shape (`gameSevenOnly`) plus `storedPendingCertification`. See the deviations below.
- `.github/workflows/pipeline-inseason.yml`, `pipeline-offseason.yml`, `keepalive.yml` — `--source=espn` on the scheduled path and the 07:30/07:00 pair, with `:11-13`'s comment naming the new pairing and its reason. Bracket, three-line shape, `--require-feed` placement, concurrency group, notify composite and dedupe untouched.
- `tests/pipeline/espn-adapter.test.ts` (new, inline fixtures), `plan.test.ts`, `run.test.ts`, `nba-com.test.ts`, `workflows.test.ts`, `venue-backfill.test.ts` (probe harness syntax-smoke + the bad-flag exit-2 pin).
- `scripts/probe-espn-adapter.mjs` — new, owner-run, zero Supabase. Leg A replays a measured date through the shipped adapter, leg B harvests and verifies the 30-franchise code table, leg C re-measures the range refusal.
- Docs: `seriesdatasource-port.md` (registry line, the new `espn` adapter section, `plan.ts` item 6, the probe paragraph, basketball-reference as the designated unimplemented fallback of last resort, the amended cron prose and the offseason-edge consequence), `spec-2-6-scheduled-pipelines/workflow-inventory.md` (three annotations), `epic-2-context.md` (the "keepalive.yml is untouched" line corrected), `spec-2-13/SPEC.md` + `payload-contract.md` (Final-and-game-7 narrowing, the complete-not-seed constraint, the `keepalive.yml` non-goal corrected).

**Deviations from the record's `plan.ts` task — two, both narrowing without relaxing:**

1. **The archived branch's idempotent-replay skip** had to learn the new shape: `sameScores(exact.scores, scores)` compares a source's games against seven stored rows, so a game-7-only source could never match an already-archived series and a twice-dispatched date (`run-sheet.md` proof B, CAP-2's "a second real run changes nothing") would turn an idempotent replay red. The rule is unchanged — agreement skips, disagreement throws, an archived outcome is never rewritten — only the comparison now covers the one row this shape carries (`exact.scores.some(row => scoreKey(row) === scoreKey(gameSeven))`).
2. **The non-reconciling repair branch excludes `gameSevenOnly`.** That branch repairs a stored winner-less row only when the source is a complete archive shape agreeing with everything already stored; its `stored = every stored row present in the source` test is vacuous-to-meaningless against a one-game source, so admitting this shape there would let a run claim agreement about the 3–3 it never saw. It falls through to the existing loud refusal instead.
3. **Ordering consequence, not a deviation:** `readTeams` now selects `espn_code`, so an `--source=espn` run against a database where `00018` is not yet applied fails at the team read — non-zero, loud, and it lands in 2.6's proven issue machinery. This is why `run-sheet.md` gates probe → `00018` → owner `db push` before the dispatch legs; the code may land first, a live `espn` run may not.

**Consequences for other stories, stated where they will be read:** the April offseason edge can no longer initialize the bracket from the feed — births are `--source=manual_csv` and Story 2.7's drill, which now also owns the write-half proof (`run-sheet.md` step D is the accepted hollow green). `seriesdatasource-port.md`, `SPEC.md` Constraints and `payload-contract.md` each carry this.

**surface-inventory P3 — verified, no edit made:** `ARCHITECTURE-SPINE.md` AD-5 already names `espn` as the scheduled source and `teams.espn_code` as the join key (the change proposal amended it before this story was built), so the spine needed no touch. Re-read rather than assumed at build time.

**Probe design calls worth knowing when it is run:** the adapter refuses a date parameter, so leg A supplies the *cron-shaped instant* (target date + 1 day at 07:30 UTC) and asserts the shipped `deriveRequestDate` round-trips it — the flag exercises the derivation instead of bypassing it. The team-list endpoint was never measured, so leg B is a deliberately tolerant reader bounded to one-level-deep arrays, followed by verification rather than trust: 30 distinct codes → 30 distinct `teams.id`, with `NY`→Knicks and `SA`→Spurs confirmed by franchise name. Any divergence beyond those two is a **hard failure**, which forces a `payload-contract.md` row before seeding rather than letting a new divergence flow silently into `00018`. Legs are independent and all failures collect into one exit-2 message, so a single paste carries the whole measurement.

**Not landed — blocked on the owner's probe output (`run-sheet.md` steps 1–3):**

- `supabase/migrations/00018_teams_espn_code.sql` and `docs/CURRENT_DATA_MODEL.md` (same commit) — the 30 seed `UPDATE`s are transcribed from leg B verbatim; nothing was invented, so neither file is authored ahead of the table.
- `scripts/rehearse-migration-00014.mjs` — `COVERED_THROUGH` → 18 and the duplicate-`espn_code` negative proof through `applyRejected`.
- Run-sheet Part 2's four transferred dispatch proofs (A–D) and the owner's `npx supabase db push`.

## Spec Change Log

- CAP-6 was written as "only finished games" and the plan-level games 1–6 cross-check as a straight inheritance. The owner's mid-build call narrowed admission to **Final AND game 7**; `SPEC.md` CAP-2/CAP-6/Success signal, a new Constraints bullet ("the scheduled feed completes; it does not seed") and `payload-contract.md`'s parse rules now carry it, with `00015:286-308` cited so the 3–3 certification's survival is on the record rather than implied.
- `SPEC.md`'s Non-goals forbade "touching the `keepalive.yml` schedule" while its Constraints recorded the owner's own 2026-10-04 move of that very cron. Contradiction resolved in favour of the decision: the non-goal now names `keepalive.yml`'s cron as the one line that does move, and the exception's parenthetical says the pair moves together.

## Review Triage Log

**Iteration 1 — two reviewers over this story's diff in parallel: one contract/verification pass
(its findings 1–7; 1 and 7 share a file and land in P6's four sub-verdicts), one test-quality pass
covering hermeticity, CAP coverage, mutation survivors and records (→ P7–P11).** Every claim was
checked at the cited location before a verdict was written; **one row per finding, 11 rows**.
Routes: **6 code/probe patches**
(P1 the AD-5 orientation, P2 early identity resolution, P3 the discarded headline reason, P4/P5 the
two workflow comments, P6 the probe), **5 test/record patches** (P7–P11). **No `bad_spec`, no
`intent_gap`, no defer, no reject → no spec loopback; `review_loop_iteration` 0 → 1.**
Hermeticity came back clean from the test pass (every adapter and runner test injects `fetch`; the
spawned probe exits before any fetch), and the contract pass verified admission, `feedSeriesCount`
ordering, the date derivation, the retry/exit posture and the workflow shape as clean — those are
absent from the table below because nothing changed for them.

| # | Finding | Severity | Verdict, and the evidence that decided it |
|---|---|---|---|
| P1 | One mis-oriented series aborts the whole run: the adapter sets `team_a` = game-7 home, so when game 7 is played at the stored `team_b`'s court AD-5's swap guard (`plan.ts:400-405`) threw "slots swapped" before the game-7 path, `storedPendingCertification` never ran, and every other completion that day was lost | high | Confirmed at the cited lines, and the census says the case is normal, not exotic: `00016`'s own population has **43 of 160** archived NBA/BAA series playing Game 7 at the non-`team_a` court. **patch (code+test)** — `reversedIsMatch = gameSevenOnly && reversed !== undefined` (`plan.ts:416`): for this shape a reversed stored row IS the series the game completes and the completion adopts the **stored** slots; a source that carries game 1 still refuses a reversed row, and mirror rows in both orders stay a refusal. Pinned by `plan.test.ts:355` "game 7 at the OTHER side: the reversed stored row is the match, and the completion keeps the stored slots" beside the unchanged `:117` swap refusal. |
| P2 | An unresolvable provider code aborts only for **admitted** games, contradicting the file's own unconditional claim — a franchise absent from `espn_code` stays invisible through the six games this adapter never admits and first reddens mid-window on its Game 7 | high | Confirmed: the resolution sat inside the post-admission block. **patch (code+test)** — the id path is walked for **every** parsed event before any exclusion (`espn.ts:415-438`), so the drift surfaces on the first run that sees the code. The reviewer's own finding is what exposed a second gap while patching: the fix had no pin for the case that motivated it, so `espn-adapter.test.ts:475`'s neighbourhood gained "an unresolvable code aborts even on a game this run EXCLUDES — the table is read before admission" (a Game 2 carrying `LAL`). M11 kills the regression this guards. |
| P3 | `parseHeadline`'s rejection reason is discarded, so a headline outside the `<round> - Game N` **pattern** is reported as a round-phrase outside the **vocabulary** — pointing the owner at the wrong table | medium | Confirmed at `espn.ts:339-341`. **patch (code+test)** — `headlineReason` is carried on the parsed event and used in the exclusion note (`espn.ts:343`, `:445-449`); pinned by `espn-adapter.test.ts:414` "a headline in the wrong PATTERN is excluded with the pattern named, not the vocabulary", next to `:370`'s vocabulary case, so the two messages can no longer be swapped silently. |
| P4 | `pipeline-inseason.yml`'s comment overstates the amended slot ("safely behind the tip-off of the latest game") while `SPEC.md` records the traded opposite | medium | Confirmed — a comment that promises more than the design delivers is how a margin gets forgotten. **patch (record)** — the comment now names the residue: 07:30 UTC is 02:30–03:30 ET, a 10 pm ET game that reaches extra overtime can still be non-Final, `espn` excludes it and names the exclusion, and the loss is a missing row detected by Story 2.7's row-count-vs-bracket read, **not** by this cadence. |
| P5 | `pipeline-offseason.yml`'s comment says `manual_csv` is "the dispatch choice still offers" — that file's `workflow_dispatch` has only `dry_run` | medium | Confirmed at `:28-33`. **patch (record)** — the comment now says the initialize half is `--source=manual_csv` **run by hand**, states that this file offers no `source` input (and `pipeline-inseason.yml` does), and keeps Story 2.7's drill as the owner of births. |
| P6 | Four probe holes: (a) leg A prints rows but never ties them to the raw payload, so an adapter that silently dropped an admitted Game 7 still exits 0; (b) duplicate `--date=` silently first-wins; (c) a no-arg run prints "PROBE PASSED" with leg A skipped; (d) leg B name-verifies only the two divergent codes | medium | (a) **patch** — leg A now computes the expected Game-7 set from the **raw** payload (`state === 'post'` + `description === 'Final'` + a Game-7 headline) and requires the emitted score rows to be exactly it (`probe:246-270`), so CAP-8's evidence cannot be a no-op. (b) **patch** — `--date=` given twice exits 2 naming the duplicates (`:75`), matching the one-date rule the adapter itself enforces. (c) **patch** — the final line reads `PROBE PASSED — leg A SKIPPED (…re-run with --date=20260420 and --date=20260605 before this output counts as CAP-8 evidence)` when no date was given (`:371`), so a partial run cannot read as a clean one. (d) **declined, with the assumption stated where it is used** — the 28 remaining codes resolve by abbreviation equality because that equality is the measured fact the contract rests on (`payload-contract.md` records `NY`/`SA` as the only divergences); a 30-row franchise-name table would add an assumption of its own rather than remove one. `harvestFranchiseCodes`' doc block and the divergence check name exactly what is verified: 30 distinct codes → 30 distinct `teams.id`, plus a franchise-name assertion for the two that diverge. |
| P7 | Vacuous and weak assertions: `espn-adapter.test.ts:292` `toBeTypeOf('function')` on a helper that always returns a function; `:232`'s "UTC-derived date would ask for June 6" asserting the same thing as `:229`; `:404`'s decoy ids not in `TEAMS` so a `team.id` join would abort before the assertion; three alternation regexes that pass whichever layer fires; the `FeedSink` RPC mirrors never driven red | medium | All confirmed. **patch** — the `toBeTypeOf` line is gone; the UTC case now computes the UTC day as its negative control and asserts the shipped derivation differs (M1 reddens it and the year-boundary case); the fixture gained `{ id: 41, abbreviation: 'NY', espn_code: null }` so an abbreviation fallback is now **observable** rather than unrepresentable (M4 reddens it); the alternations are tightened to the single message each layer prints (M5 reddens the split-4-2 pins); and the decorative `FeedSink.birth` mirror became a **tripwire** that always throws — the shape is game-7-only, so a run that reaches it is a rule that broke (M8 reddens it). |
| P8 | Coverage gaps: CAP-1's "no `nba_com` on the scheduled path" is unpinned because the cron's real source is `inputs.source \|\| 'espn'`, and CAP-2's "a missing secret names the secret" is tested only on the `manual_csv` floor | medium | Confirmed — both are the scheduled source's own contract, and neither had a pin. **patch** — `workflows.test.ts` pins `PIPELINE_SOURCE === "${{ inputs.source || 'espn' }}"` **and** that the bash passes exactly one `--source=` (M6 reddens the fallback); `espn-adapter.test.ts:902` "the scheduled source refuses a missing credential before it reaches the network" asserts exit 2, the named variable, the value absent from the output, and `stub.urls === []` with zero sink calls (M10 reddens it). |
| P9 | The header assertion compares the request against the exported `ESPN_HEADERS` constant — self-referential, so editing the constant edits the expectation | medium | Confirmed at `espn-adapter.test.ts:284`. **patch** — the literal values are pinned (`Accept: application/json`, the `predictgame7-pipeline/1.0` UA) and the constant import is gone from that assertion; M2 adds a header and reddens exactly the one test. |
| P10 | Mutation survivors: `.sort()` in `pairKey` (the `reverseSides` fixture field was never set by any test), `pipeline-inseason.yml:119`'s `'espn'` fallback, and the header values | medium | Confirmed against the battery. Two of the three were fixed by P8/P9's pins. **The first needed a second pass**: the reviewer's `reverseSides` leg flips the **array order**, and the parser selects sides by `competitions[].homeAway`, so that leg can never tell a sorted pair key from an unsorted one — re-running the mutation after the "fix" came back green, which is how the vacuity was caught. **patch** — the fixture gained `swapSides` (the two codes keep their scores, the **labels** swap), and `espn-adapter.test.ts:596`'s second leg asserts the venue-reversed duplicate still counts as one series. M9 now reddens exactly that test. |
| P11 | Records: `spec-2-6/workflow-inventory.md` still states the scheduled source is `nba_com` (two places) and carries five stale `run.ts` line pointers; `decisions.md:35` has the same class of stale pointer; `payload-contract.md:52` still offers "a `description` matching the port's final vocabulary" as an admission rule when the shipped rule is the exact `Final` | medium | Confirmed at every cited line. **patch (record)** — the drifted pointers carry dated `[→ …]` re-points to the landed anchors (`port.ts:164`/`:180`, `run.ts:302-308`/`:313`/`:340`/`:344-353`, `port.ts:167-170`/`:198-204`) rather than being silently rewritten, and `payload-contract.md` now states that the vocabulary alternative **was NOT built**: `Final (OT)` / `Final 2OT` are unmeasured shapes, and a vocabulary match would write one of them into the table as a Game 7 result. |

**Also corrected in this pass, found while re-checking the record's own anchors:** the unreachable
stored-pair clause came out of `storedPendingCertification`. The reviewer's P1 analysis made me trace
it: `validatedShape` already refuses any source game whose sides leave the source's pair
(`plan.ts:185-190`), and the identity lookup only reaches the certification when the stored row holds
that same pair in either slot order — so the RPC's fourth guard (game 7 between the stored pair) has
no plan-level counterpart that can fire. The docstring records the trace so the next reader does not
re-add the dead guard; the tightened `plan.test.ts:336` title pins where the refusal actually lands.

### Mutation evidence (per new pin, this iteration)

Eleven targeted mutations, each applied with `sed` against a backup copy and restored before the
next; every restored file was byte-compared to its backup, and the battery closes on a green re-check
of the four pipeline suites — **177 passed** on the final tree (baseline 176: M1–M10 ran before the
P2 pin existed, `espn-adapter.test.ts` at 61 tests; M9 and M11 ran against the final 62-test file).
`npm run gate` on the final tree then took the whole suite to **533 passed (24 files)**, exit 0.

| # | Mutation | What reddened |
|---|---|---|
| M1 | `espn.ts:202` — `deriveRequestDate` reads the **UTC** calendar instead of `America/New_York` | 2 red: the UTC negative control ("would ask for June 6") and the year-boundary case |
| M2 | `espn.ts:102` — `ESPN_HEADERS` gains `Accept-Encoding` | 1 red: "no key and no Authorization header: the endpoint is unauthenticated (measured)" |
| M3 | `espn.ts:90` — `MAX_FEED_ATTEMPTS = 4` | 3 red: the retry-posture pin (`BACKOFF_MS` length × attempts cross-invariant) and the two terminal-drift cases |
| M4 | `espn.ts:393` — resolver falls back to `teamIdByAbbreviation` | 2 red: "an adapter built without the `espn_code` resolver refuses instead of falling back" and "it does NOT match `NYK` by substring to `NY`" |
| M5 | `plan.ts:481` — the stored-pending certification returns `null` | 3 red: "a game-7-only feed for a stored pair whose games 1–6 are not a 3–3 refuses", "an undecided stored game rejects the completion the way the RPC would", "the certification moved to the stored row: a 4-2 pending pair is not completed" |
| M6 | `pipeline-inseason.yml:124` — `\|\| 'nba_com'` | 1 red: the new cron-effective-source pin |
| M7 | `run.ts:417` — `winnerFilled = false` | 5 red across `run.test.ts` and the espn refresh-trigger pin |
| M8 | `plan.ts:426` — the refuse-to-birth branch removed for this shape | 2 red: "game 7 with no stored pair is refused — no birth from a partial source" and the report-before-planning pin (the `FeedSink.birth` tripwire fires) |
| M9 | `espn.ts:356` — `pairKey` drops `.sort()` | 1 red: the venue-swap leg of "the competitors array order changes nothing" — the review's survivor, now killed |
| M10 | `run.ts:148` — `requiredEnv` never throws | 5 red, including "the scheduled source refuses a missing credential before it reaches the network" |
| M11 | `espn.ts:425` — only game-7 events walk the `espn_code` id path | 1 red: the P2 pin "an unresolvable code aborts even on a game this run EXCLUDES" |

**Verification of the final tree:** `npm run gate` → exit 0 (lint, typecheck, 533 tests across 24
files, build), with the exit read from the command itself and the output redirected to a log rather
than a pipe; `node --check scripts/probe-espn-adapter.mjs` → exit 0.

### Post-commit: the pre-push hook blocked the push, and it was this story's test that broke

`git push` ran `npm run gate` and got 1 red / 532 green: `no adapter can satisfy --require-feed
vacuously` died with `Test timed out in 5000ms` at 6520 ms, while every sibling in
`tests/pipeline/run.test.ts` stayed under 100 ms. **The exit-0 line above is true of the agent's
runs; it is not true of the owner's push, and the record says so.**

Diagnosis, measured rather than assumed: that case is the file's only multi-`await` loop, and
Story 2.13 lengthened it from two adapters to three by registering `espn`. Its own work is
53–77 ms (a full uncontended suite run passes it at 53 ms; the file alone runs 116 ms of tests in
1.45 s), so 6520 ms is a ~120× stretch of the wall clock by a contended fork pool, not a hang —
no adapter sleeps on a real timer here because `sleep: noWait` is injected (`run.test.ts:820`).

Fix: a 30 s per-test budget on that one case, and a 30 s suite-level budget on
`the scripts/** coverage gap (E5)` in `tests/pipeline/venue-backfill.test.ts` — the five
`spawnSync` cases deferred-work had named, measured at 59–152 ms idle. Both recorded in
`deferred-work.md`, whose Story 2.12 item is now closed with the correction that the casualty was
a different test than predicted. Rejected instead: raising the global `testTimeout` (it would stop
a real hang from being news in all 24 files to fix a measurement artifact in two), and
`--no-file-parallelism` (turns a 13 s signal into minutes).

Mechanism verified, because a budget that is not honored is decoration: `--testTimeout=1` on
`run.test.ts` kills 8 tests and leaves the budgeted one green; the same probe on
`venue-backfill.test.ts` went 13 failures → 10 with the suite budget, **none of the 10 inside that
describe** — which also falsified the assumption that a synchronous `spawnSync` body is out of
reach of the timeout (vitest reports the overrun after the child returns).

### Dispatch proofs — one row here, full evidence in the run sheet

Run ids live in `_bmad-output/specs/spec-2-13-espn-feed-adapter/run-sheet.md` Part 2; they are
not duplicated here. **A is obtained (run `37199559809`, 2026-10-04):** a real hosted runner on the
pushed `espn` defaults still refuses `fantrax` at selection with exit 2, its failed log contains no
database-client line at all, and the alarm commented `Still red:` on the open issue #8 rather than
opening a second one — which is precisely the state step B then resets.

**B is obtained (run `37202299383`, same day):** with #8 closed, the identical deliberate red opened
**issue #9** — same title, `Run: …/37202299383`, `931f220 on master` in its body — and #8 stayed
closed without a sixth `Still red:` comment. The reset half of Story 2.6's dedupe design is now
shown rather than assumed. #9 is a synthetic alarm; it is closed as soon as this row lands.

**C is obtained (run `37201495284`):** the first time the Docker-dependent rehearsal job ever
executed on a runner. It reached `REHEARSAL PASSED` and removed its container:

> REHEARSAL PASSED: replay order holds, the key enforces, the swap stays a runner-side assertion,
> 00015's RPCs assert, land atomically, and stay service_role-only, Story 2.8's committed 00016
> applied inside the ordered replay over the seeded fixture, --check holds on the committed pair,
> and every guard was observed failing with the post-reject state measured, and Story 2.5's 00017
> refresh rewrote all three keys atomically over the synthetic, hand-authored, empty and real-score
> archives — byte-equal payloads on re-run with updated_at moving, and U11's 159/117/59 reproduced
> from the committed sheet joined to the committed curated CSV, with 00017's league guard observed
> refusing under its own tamper and the tamper leaving nothing behind.

That certifies the replay order **through `00017`**: `COVERED_THROUGH` is still 17, so run-sheet step
2 — extending the harness through `00018`, including the negative proof that a duplicate non-null
`espn_code` fails the partial unique index — remains its own leg, and **D remains owed** until then.

### Run-sheet step 1 went red on all three legs, and the red was undiagnosable — both facts recorded

The owner ran `node scripts/probe-espn-adapter.mjs --date=20260420`, `--date=20260605`, and the
range control on 2026-10-04. Each exited **2**. No payload was fetched, so the 30-franchise ESPN
code table is **still unobtained and `00018` still has no seed source** — the migration skeleton
stays unfilled, exactly as the constraint requires.

Two of the probe's assertions did pass *inside* that red run, which is worth separating from the
network failure: leg A printed the date round-trip on the real clock path (`2026-04-21T07:30Z →
20260420`, `2026-06-06T07:30Z → 20260605` — CAP-5's derivation), and leg C's builder refused the
range form (`shipped scoreboardUrl("20260601-20260608") threw as designed`, CAP-2). So the run
proves the calendar and the single-date-only builder on the shipped code path while proving nothing
about field coverage. The rest is an egress fact about the owner's machine, not a feed finding —
GitHub's runner reached the same endpoint in 78 ms and Supabase's in 226 ms (Story 2.6).

**The diagnosability gap the run exposed, and its fix.** Every connection-class failure — DNS
refusal, blocked socket, TLS interception, a proxy killing the request — reaches Node as the
*identical* `TypeError: fetch failed`, with the distinguishing `code` and message on `error.cause`.
The shipped retry reason used only `error.message`, so the alarm log printed three bare `fetch
failed` lines and no reason, which is precisely the blind spot Story 2.6's egress evidence turned
into a requirement. `describeFetchThrow` (`supabase/scripts/pipeline/adapters/espn.ts:216`) now
unwraps one level, and the retry message at `:553`, the probe's leg B route diagnostics and its leg
C range control all route through it. A re-run therefore prints e.g. `fetch failed (ENOTFOUND
getaddrinfo ENOTFOUND site.api.espn.com)` and names the failure class instead of its symptom.

Pins: `tests/pipeline/espn-adapter.test.ts:332` (retry path given an undici-shaped cause, asserting
the code appears and the 3-attempt/2-sleep backoff is unchanged) and `:356` (cause-shape table:
Error cause, string cause, no cause, non-Error throw, and an Error cause with neither code nor
message renders as `cause carries no code or message` rather than `()`). Mutation evidence for both,
each restored byte-identically afterwards:

- reverting the call site to `error instanceof Error ? error.message : String(error)` → the `:332`
  pin red;
- dropping `code` from the detail line → the `:332` pin red (message lost the `ENOTFOUND` token);
- returning only the cause, i.e. dropping the outer `error.message` → **both** pins red, which is
  the point of pinning the table: the fact that no response arrived must survive alongside the reason.

`nbaCom.ts:286` has the identical cause-dropping line and is deliberately **not** patched here —
it is outside this story's surface inventory. It is filed in `deferred-work.md` with a named landing
place rather than left as a remark. The probe's own legs B and C are not unit-tested beyond the
`node --check` smoke in `venue-backfill.test.ts`; their diagnosis quality is proven by the owner's
re-run, not by a pin.

**Re-run of the same leg, one hour later, printed the class** — `request threw: fetch failed
(ENOTFOUND getaddrinfo ENOTFOUND site.api.espn.com)` — and the owner's `Resolve-DnsName` probes
showed the refusal is the machine's default resolver (`RCODE_REFUSED` for that name, google fine,
`-Server 1.1.1.1` answering normally, `hosts` clean). The fix earned its keep within one cycle:
the second run was actionable and the first was not. Full record in the run sheet's step-1 note.
