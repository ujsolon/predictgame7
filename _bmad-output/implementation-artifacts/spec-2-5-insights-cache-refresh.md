---
title: 'Story 2.5 — Insights cache refresh'
type: 'feature'
created: '2026-10-01'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/seriesdatasource-port.md'
  - '{project-root}/docs/CURRENT_DATA_MODEL.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-predictgame7-2026-09-23/ARCHITECTURE-SPINE.md (AD-4, AD-5, AD-8)'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md (Story 2.5 ACs :371-383)'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/insights` still renders the numbers `00001`'s seed inserted — "Based on **8** historical Game 7s", 62.5%, average margin 8.5 — against a live archive of **178** series and **1,246** score rows. Nothing has written `insights_cache` since that seed (deferred-work finding **F7**, which names this story as its owner). The client side is not the defect: `InsightsPage.tsx:36-38` already reads the cache and does no arithmetic, so AD-8 is satisfied and only the writer is missing.

**Approach:** the pipeline run recomputes the three cached patterns from `series` / `series_game_scores` after it has done its own writes, and exits non-zero if that refresh fails. One row per metric, `insight_key` unchanged.

**Owner decisions recorded 2026-10-01 (answers to the story's three Open Questions, plus the scope direction that grew out of Question 1):**

- **Where the arithmetic lives — (a).** One `SECURITY DEFINER` RPC in a new migration recomputes **and** writes all three rows from the tables in a single statement, matching `00015`'s one-statement-either-lands-or-fails pattern. The TypeScript alternative is rejected: it can half-apply across three statements, and reading the archive for the maths crosses PostgREST's silent 1000-row cap — the exact trap F7's measurement had to page past.
- **When the refresh fires — (a).** A run refreshes the cache only when it filled at least one winner (a completion, or a birth carrying its Game 7 follow-up). Literal to the story's Given clause; a purely offseason run refreshes nothing.
- **Home-court semantics — superseded by a scope decision.** Investigation found the question was worse than open: the archive's `home_team_id` is not a venue but the **series winner** (`docs/NBASeriesResults.xlsx` is winner-oriented, the retired loader mapped `team_a = Winner Team`, `00007:129-204` wrote `home_team_id = team_a_id` for all seven games). So any whole-table home-team statistic returns **exactly 100%**, against the NBA's published 117-43 (.731). The owner's calls, in order:
  1. `league` is stored as **three values — `NBA` / `BAA` / `ABA`** — recoverable from the source spreadsheet's dropped `League` column; no scraping needed. The archive's composition reconciles to the published count exactly: **178 = 160 NBA/BAA + 18 ABA**.
  2. **The venue backfill ships *before* this story.** Tier B is scoped to the **Game 7 home team only**, for the 160 NBA/BAA series, from **one hand-curated source loaded through the existing `manual_csv` floor** (no scraper, no second adapter), carried by **one migration** alongside the `league` column, with its own rehearsal and owner-applied `db push`. This is the one-time, deliberate lift of Story 2.4 Decision 11's archive freeze; the freeze stays in force for the ongoing pipeline and for games 1-6 venues. **[Mechanism settled 2026-10-01 by `sprint-change-proposal-2026-10-01.md` Call 1: the curated list reaches the database *through that migration*, not through a pipeline run — `manual_csv` requires whole series shapes and `plan.ts:382-390` aborts on an archived row by design, which is the freeze working. The intent is unchanged: one hand-curated committed CSV, reviewable as a diff, no scraper, no new adapter.]**
  3. **The archive shows a league chip and filter**, so the 178-row archive and the league-filtered insight denominators stay visibly consistent. **[Placement revised 2026-10-01 by Call 3: this is Story 2.9, in Epic 2 beside this story — co-landing is what removes the contradiction, rather than explaining it in a later epic.]** That surface is not this story's work; it has no UI scope.
- Consequently this story's population is **league-filtered**: all three cards share one population — archived Game 7s with `league IN ('NBA','BAA')` — and **that filter is itself the definition of "this Game-7 `home_team_id` is a real venue"**, because `00016` backfills the venue of every NBA/BAA archived series and the pipeline writes game-true venues from here on (Call 2, 2026-10-01). The 18 ABA series are excluded from all three cards, not just the home-court one. **This story does not run until that migration exists and is applied.**

## Boundaries & Constraints

**Always:**
- Keep the three keys and their JSONB member names exactly as the client declares them (`InsightsPage.tsx:7-24`): `game_6_winner_stats{total_game_sevens, game_6_winners_won, win_rate}`, `home_team_stats{total_game_sevens, home_team_wins, win_rate}`, `avg_point_differential{average, median, max, min}`. The page prints `win_rate` and then appends `%` (`:110`, `:136`), so `win_rate` is a **percentage** (seed `62.5`), not a fraction.
- Population = archived series (`winner_team_id IS NOT NULL`, AD-4) and, within each, the **game 7 row** (`game_number = 7`) — that is what all three cards' copy claims ("X out of Y Game 7s"). Margin is the absolute point difference (`avg_point_differential.min`/`max` are positive in the seed). Median = mean of the two middle values on an even count.
- The population is **league-filtered, and one filter serves all three cards**: `game_6_winner_stats`, `home_team_stats` and `avg_point_differential` all count `league IN ('NBA','BAA')` archived Game 7s. `home_team_stats` needs no separate venue test, because **`00016` rewrites the game-7 row of every NBA/BAA archived series (sides and their scores together, `winner_team_id` untouched) and the pipeline writes game-true venues from here on — so the league filter *is* the "this venue is real" marker** (Call 2, 2026-10-01). Rows the marker does not cover: the 18 ABA series, where `home_team_id` is still the series winner and a home-team statistic would yield a fabricated 100%. After Tier B the population is the 160 NBA/BAA Game 7s plus every series the pipeline writes, and `home_team_stats` must land at **117 home wins of 160** (nba.com's published 117–43 over the same set) — if the RPC's number is not 117, the venue curation or this story's filter is wrong, and that is a stop, not a tolerance.
- Refresh runs **after** the write phase, never before, and writes through `service_role` only. `updated_at` is set by the writer (the column has a `DEFAULT` but no trigger).
- Every run stays idempotent (AD-5): recomputing over an unchanged archive yields byte-equal payloads.
- A refresh failure terminates the run non-zero, naming what failed, like any other pipeline step.

**Never:**
- No change to `InsightsPage.tsx`, its copy, its decimal formatting, or its metric set (FR-18 / Story 5.1 owns wording). No new computation in the browser (AD-8). No intermediate data layer in `src/db/supabase.ts`.
- No metric derived from a date, a season window, or `created_at` (AD-4 and the frozen no-phase-from-dates rule); no code branches on `series.status`, which no longer exists.
- No edit to `00015`'s existing RPCs, and no write to `series`/`series_game_scores` in this story.
- The agent never applies a migration or writes production data: it hands the owner `npx supabase db push` and the run command.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Run completes a series | writes include ≥1 `complete` (or a birth with `followup`) | refresh runs, all three keys written from the post-write archive, exit 0 | n/a |
| Offseason / empty-plan run | no births, no completions | no refresh at all — the trigger is a filled winner (frozen decision); cache keeps its previous values | n/a |
| `--dry-run` | plan computed and printed | **no** refresh call at all — dry run means zero writes | n/a |
| Refresh step fails | write phase succeeded, refresh raises | exit 2 naming the metric/step; series writes stay landed (a PostgREST client cannot roll them back) | message names the failing operation, never a stack trace alone |
| Re-run identical input | archive unchanged since last run | recomputed payloads equal the stored ones; run still exits 0 | n/a |
| No archived game 7 rows | empty or fixture database | zeros written with `total_game_sevens: 0`; no division by zero, no `NaN` in JSONB | n/a |
| Run aborts before writes | plan assertion or fetch failure | refresh never reached; exit 2 from the existing path | existing behaviour |
| League/venue columns missing | Story 2.8's Tier B migration (`00016`) has not been applied | this story does not run: its RPC cannot be created against a table with no `league` column | fail loudly at migration/rehearsal, never fall back to the winner-as-venue reading |
| Venue backfill short or mis-keyed | `00016` applied, but Game-7 home wins over the 160 ≠ 117 | this story stops: a card printed off a half-curated archive is a fabrication with better formatting than the 100% it replaces | resolve in Story 2.8 — one curated row wrong, or nba.com's as-of date excluding the 2026 Finals — before the refresh ships |

</frozen-after-approval>

## Code Map

- `src/pages/InsightsPage.tsx` — the read path, **do not change**. `:7-24` local `InsightData` is the de-facto payload contract; `:36-38` `supabase.from('insights_cache').select('*')`; `:110/:136/:162` render `win_rate`+`%`, and `:117/:143/:169` print the counts.
- `src/types/types.ts:61-67` — `InsightCache` row type, declared and never imported; leave as-is.
- `src/db/supabase.ts` — 7 lines, exports the anon client only. AD-8 lets pages query directly; untouched.
- `supabase/migrations/00001_create_game_sevens_tables.sql` — `:66-72` the table (`insight_key text NOT NULL UNIQUE`, `insight_value jsonb NOT NULL`, `created_at`/`updated_at` defaults); `:96-99` the only policy (public `SELECT`); **no** write policy, so `service_role` is the sole writer; `:121-124` the stale seed.
- `supabase/migrations/00015_pipeline_series_functions.sql` — the template any new RPC must copy: signature style `:40-46`/`:190-194`, `SET search_path = public, pg_temp` `:48-49`, `REVOKE`/`GRANT ... TO service_role` `:353-361`.
- `supabase/scripts/pipeline/writer.ts` — `PipelineSink` `:25-32` gains the refresh member; `:101`/`:118` show the `.rpc(name, params)` call style; `:108-125` the `throw new Error('<op> failed for <label>: …')` convention.
- `supabase/scripts/pipeline/run.ts` — hook point is after the completion loop (`:247-250`) and before `return 0` (`:252`); dry-run short-circuit `:225-228` must stay write-free; single `catch` at `:253-257` produces exit 2; `process.exitCode` set at `:263` (never `process.exit`).
- `supabase/scripts/pipeline/plan.ts` — `Plan {births, completions, skips}` `:119-123`; a winner is filled by `completions[]` or a `births[].followup` (`:81-84`); `PlannedCompletion.series_id`/`winner_team_id` `:99-108`. Trigger input, not to be modified.
- `supabase/scripts/pipeline/port.ts:52-66` — `AdapterRunReport {countsLine, histogramLine, notes[]}` and `describeRun?()`: the pattern any refresh report line should follow.
- `tests/pipeline/run.test.ts` — `FakeSink` `:54-133` (records writes, re-enforces the RPC rules at `:71-84` so a test cannot certify a rejected write), `capture()` `:139-142`. Other suites: `plan.test.ts`, `manual-csv.test.ts`, `nba-com.test.ts`.
- `scripts/rehearse-migration-00014.mjs:64-67,162-167` — `COVERED_THROUGH = 15` and the beyond-coverage warning. **Order is now settled** (`sprint-change-proposal-2026-10-01.md`): Story 2.8's `00016` lands first and takes the ceiling to 16, this story's `00017` takes it to 17 and extends the ordered replay again.
- `docs/CURRENT_DATA_MODEL.md` — `:76-77` the `insights_cache` section to update; "The archive carries slots, not venues — and slot `a` is the series winner" is the measurement that forced the venue-backfill dependency and the league filter.
- `docs/NBASeriesResults.xlsx` — the archive's **committed** source, and the only place the `League` value still exists (columns: Year, League, Series Type, Winner Team, Winner Games, Loser Team, Loser Games, Total games, G1-G7 scores W/L). Read it with the zip/XML route, not a parser dependency: `unzip -p docs/NBASeriesResults.xlsx xl/worksheets/sheet1.xml`, resolving `t="s"` cells against `xl/sharedStrings.xml`. The 18 ABA Game-7 rows (1969-1976, year/round/matchup) are the exact backfill list for the `league` column — no external source needed.
- `supabase/scripts/pipeline/data/series_manual.csv` + `supabase/scripts/pipeline/adapters/manualCsv.ts` — the `manual_csv` floor (`DEFAULT_CSV_PATH`, `run.ts:40`). **[Corrected 2026-10-01, Call 1: it is *not* the Tier B delivery vehicle.]** A run of this floor against an archived series aborts at `plan.ts:382-390` by design — that is Story 2.4's freeze enforcing, not a gap to route around — and the adapter needs whole series shapes (games 1–6 certified 3–3) to plan anything. Tier B's curated list therefore lands as `supabase/scripts/pipeline/data/game7_venues_curated.csv` and is carried by migration `00016`. Note the path is under the pipeline directory — the repo-root `data/` is gitignored, with `!supabase/scripts/pipeline/data/` re-including this one, which is why the curated file belongs in the same directory.
- Story 2.8 / 2.9 (created 2026-10-01 in `epics.md` and `sprint-status.yaml`) — `00016` + the curated CSV + the rehearsal extension, then the league chip/filter surface. This story is downstream of both and names them rather than absorbing them.
- `_bmad-output/implementation-artifacts/seriesdatasource-port.md` — the runner contract doc; gains the refresh step.
- `_bmad-output/implementation-artifacts/deferred-work.md:160-162` — F7, closed by this story.

## Tasks & Acceptance

**Execution:**
- [ ] **Blocked until Story 2.8's `00016` is applied to production** — the course correction has now happened (`_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-01.md`, approved 2026-10-01): it decides the four open mechanism calls, creates Story 2.8 (league + venue migration) and Story 2.9 (chip/filter surface), and fixes this story's population rules as `league IN ('NBA','BAA')` for all three cards. Nothing here needs re-scoring against unknown column names any more; it needs `00016` landed.
- [ ] `supabase/migrations/00017_*.sql` (number follows landing order; `00016` is the venue/league migration) -- one RPC recomputing all three keys from `series`/`series_game_scores` with the league filter and the verified-venue rule applied, `SECURITY DEFINER`, `search_path` pinned, `REVOKE`/`GRANT service_role`, upsert `ON CONFLICT (insight_key) DO UPDATE` setting `updated_at` -- atomic three-row write.
- [ ] `supabase/scripts/pipeline/writer.ts` -- add the sink member as one RPC call following `:101-125`'s call and error conventions.
- [ ] `supabase/scripts/pipeline/run.ts` -- call it after the write loop, before `return 0`, only when the run filled at least one winner; keep `--dry-run` (`:225-228`) refresh-free; a refresh throw must reach the existing exit-2 path with a message naming the step.
- [ ] `supabase/scripts/pipeline/` refresh reporting -- print one line stating what was refreshed and the population counted, by league, in the `AdapterRunReport` style.
- [ ] `tests/pipeline/run.test.ts` -- extend `FakeSink` to record the refresh and assert: called after writes and not at all on `--dry-run`; refresh error → exit 2 with series writes already landed; no fire on a run that filled no winner.
- [ ] Metric tests (`tests/pipeline/insights.test.ts`, or the RPC's SQL) -- assert each I/O matrix row against a hand-built fixture, including zero-denominator, the percentage-unit pin, **the league exclusion (an ABA fixture series that all three cards must skip — its `home_team_id` is still the series winner, so including it is the fabricated 100% coming back), and a fixture proving the RPC counts only the game-7 row**.
- [ ] `scripts/rehearse-migration-00014.mjs` -- extend the replay and exercise the new RPC in the throwaway database, bump `COVERED_THROUGH`, and record the run.
- [ ] `docs/CURRENT_DATA_MODEL.md` + `seriesdatasource-port.md` -- document the refresh step, the league-filtered population, and the units of every JSONB member.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark F7 closed with the evidence, and route to Story 5.1 (FR-18) the `toFixed(2)` vs `toFixed(1)` mismatch between the two win-rate cards (`InsightsPage.tsx:110`/`:136`) **and the "Momentum Matters" prose now being contradicted by its own data** (measured from the source sheet: the Game 6 winner goes on to win the series in 59 of 159 NBA/BAA Game 7s — **37.1%**, not the seeded 62.5%). The league chip/filter surface is **no longer routed here** — it became Story 2.9 in this pass; and note for 5.1 that once `00016` lands, the home-court claim at `InsightsPage.tsx:194` moves from unsupportable to **.731-supported**.
- [ ] `npm run gate` and record the result; hand the owner the production commands, do not run them.

**Acceptance Criteria:**
- Given the seeded cache, when the refresh step runs against the live archive shape, then all three keys hold values recomputed from `series`/`series_game_scores` and no value traces to the `00001` seed.
- Given any pipeline run, when it reaches the write phase, then a refresh failure cannot be reported as success: exit is non-zero and names the failing step.
- Given `--dry-run`, when the run prints its plan, then zero writes happen, refresh included.
- Given the same input twice, when both runs complete, then the stored payloads are identical.
- Given an archive with no `league` column and no backfilled venues, when this story is picked up, then it stops and says so rather than computing `home_team_stats` from winner-first slots or counting ABA series in an NBA statistic.
- Given epics.md:381, when the client renders Insights, then it still reads only `insights_cache` through `src/db/supabase.ts`'s client, with no computation in the bundle (verify unchanged, not implement).

## Implementation Notes

- **2026-10-01 — planning finished, implementation NOT started, and it must not start yet.** The owner answered the three Open Questions (2a / 3a) and, on question 1, widened scope after learning that the archive's `home_team_id` is the series winner rather than a venue. Decisions are folded into the frozen block. The story is **downstream of a course correction that now exists**: `sprint-change-proposal-2026-10-01.md` was approved the same day and created **Story 2.8** (`00016` — league + Game-7 venue backfill, curated CSV, its own rehearsal) and **Story 2.9** (league chip + filter). Still unbuilt — no `league` column, no backfilled venues, no `00016`. Everything recorded here is measurement, not code; no pipeline file was touched by either pass.
- Measurements taken from committed artifacts only, which is why they needed no production read: `docs/NBASeriesResults.xlsx` (the archive's source, kept in-repo for provenance since Story 2.3) parsed via `unzip` + `sharedStrings.xml`; `git show 5b518ef~1:supabase/scripts/load-games/main.py` (the loader deleted in Story 2.3, still in history); `00007:129-204`. The sheet's Game-7 rows are 177 = NBA 158 + BAA 1 + ABA 18, it ends at the 2026 conference semifinals, and the live table holds 178 — so the archive is 160 NBA/BAA + 18 ABA, matching nba.com's published 160 exactly.
- Two earlier claims in this epic's planning trail were **falsified by the mechanism above**, and both are now annotated where they live: `decision-2-1-q-4-data-source.md:85-87` and `sprint-change-proposal-2026-09-30.md:30` ("`team_a_id` = game 1's home team in 178/178"). `scripts/spike-2-1/audit-slot-semantics.mjs:55` compares game 1's `home_team_id` to `team_a_id` — 00007 sets them equal before the audit ever runs, so that line measured the backfill, not the archive. Do not re-derive the slot convention from that audit.
- The 178th row is, on this evidence, the 2026 Finals Game 7 — and it is also the one series the 2026-09-30 measurement found *not* naming `team_a` as home throughout. **That hypothesis is retired rather than confirmed** (`sprint-change-proposal-2026-10-01.md` §2.3): Story 2.8 curates Game 7 of **every** NBA/BAA archived series, this row included, so whether its stored venue was fiction or fact beforehand stops mattering — `00016`'s replay reports the outcome directly. No production read is owed for it.
- `game_6_winner_stats` changes meaning when it stops being seeded, and the direction surprises: in a series that reaches Game 7 the score is 3-3 after six games, so the Game 6 winner is the team that was *behind* 2-3. Measured from the source sheet over NBA/BAA rows, that trailing team wins the series 59/159 = **37.1%** of the time. The card's "Momentum Matters" prose asserts the opposite, so the copy is a Story 5.1 finding, not a 2.5 one.

## Spec Change Log

- **2026-10-01 — frozen block amended under the owner's renegotiation** (`_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-01.md`, approved by the owner the same day; four mechanism calls decided in that pass). Edits inside `<frozen-after-approval>`, each with its authorization: Owner-decision bullet 2 gains Call 1 (the curated CSV is the source, migration `00016` is the carrier — the `manual_csv` floor aborts on archived rows by design); bullet 3 revised by Call 3 (chip/filter placed in Epic 2 as Story 2.9, superseding "belongs to the sharing/UX epic"); the population-consequence bullet and the league-filtered `Always` rule rewritten by Call 2 (`league IN ('NBA','BAA')` *is* the verified-venue marker; one population for all three cards; 117-of-160 as the home card's expected value); the I/O matrix's missing-column row names Story 2.8 and a new row covers a short or mis-keyed backfill. Intent, keys, JSONB member names, the refresh trigger, the unit pin and every `Never` clause are untouched. Code Map, Tasks and Implementation Notes updated outside the frozen block to match; the row-178 venue hypothesis is retired, not confirmed. No code, migration or production action.

## Review Triage Log
