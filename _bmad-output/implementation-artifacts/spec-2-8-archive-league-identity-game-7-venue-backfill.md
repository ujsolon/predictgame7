---
title: 'Story 2.8 — Archive league identity + Game 7 venue backfill'
type: 'feature'
created: '2026-10-01'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '5c111e8a8ef96d7bdbea776f4f987bdd222aee5f'
story_key: '2-8-archive-league-identity-and-game7-venue-backfill'
context:
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-01.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The archive has no league identity and no venues. `00007:129-204` wrote `home_team_id = team_a_id` and `home_score = game_7_score_a` for every backfilled game, and `team_a` is the series winner — so a whole-table Game-7 home-team statistic returns exactly 100% against nba.com's published 117–43 (.731). Story 2.5 cannot ship an honest `home_team_stats` without venues, and cannot scope a statistic to the league its copy names.

**Approach:** One committed, hand-curated CSV carries league + Game-7 home team for all 178 archived series; one generator turns it into migration `00016` (add `league`, backfill, constrain; swap the game-7 home/away teams **and their scores** where the real home team lost); one extended throwaway rehearsal proves every guard can actually fail before the owner applies anything.

## Decisions (owner answers, 2026-10-01)

**D1 — Curation route: owner-run probe, hand-entry as the fallback.** This story adds `scripts/probe-game7-venues.mjs`, extended from `scripts/probe-nba-com-adapter.mjs` (same six browser-like headers, same backoff and timeout ceilings, `--season=` iteration over 1993-94 → 2025-26), which prints each season's Game-7 home team as CSV-shaped lines the owner pastes into the curated file. It is the owner's command to run — it is the only outbound call in this story, and the repo's established pattern for the live leg is an owner-run probe. **If the probe hits a major blocker** (feed depth short of 1993-94, 403s on the historical seasons, or the `TEAM_ID`→abbreviation mapping that Story 2.4 already refused to assume), the uncovered rows — the ~63 pre-1993 block included — are hand-entered by the owner from a reference. **No agent-drafted venue list is authorized**; the residual risk that settles it is that the 117 checksum catches a single wrong row but not a compensating pair.

**D2 — This session lands machinery, not data.** The committed CSV ships with `game7_home_team` blank on all 160 NBA/BAA rows (filled for the 18 ABA rows only by the blank being *legal* there), and the generator refuses to emit `00016` while any NBA/BAA venue is blank — so the missing data is a non-zero exit, not a comment. Because no emitted migration exists yet, the rehearsal proves the machinery on a **self-test path**: the same generator, given a deterministic synthetic assignment (117 rows home = `team_a`, 43 home = `team_b`), emits the identical SQL into a temp location, the harness applies it to the fixture archive inside the throwaway container, asserts the census, then tampers it to demonstrate each guard failing. `00016` never enters `supabase/migrations/` from the self-test path, and `COVERED_THROUGH` stays at 15 with the pending condition stated in the header; it goes to 16 in the commit that lands the curated venues and the emitted migration. Story 2.8 therefore ends `review`-pending-data, and Story 2.5 and 2.9 stay blocked behind it.

**D3 — The agent runs the rehearsal here.** Docker's daemon was confirmed reachable and `postgres:16` cached on 2026-10-01, so the harness output is recorded verbatim in this spec by the agent. The probe and `npx supabase db push` stay the owner's commands.


## Boundaries & Constraints

**Always:** `series.league` added nullable → backfilled → `SET NOT NULL` → `DEFAULT 'NBA'` → `CHECK (league IN ('NBA','BAA','ABA'))`, in that order. Series resolution keyed on `(year, unordered team pair)` via `teams.abbreviation`, never `round` (17 era spellings). Game-7 rows only: no statement may touch `game_number <> 7`, and the 18 ABA game-7 rows stay as archived. `winner_team_id` (both tables) is never written. The swap is a pure exchange of `(home_team_id, away_team_id)` and `(home_score, away_score)`, so winner-vs-score consistency survives whatever orientation the row arrives in. Census guards must be **executed** against a replayed archive of the real shape: a guard that cannot fail is not a guard. Docs update lands in the same commit as the migration (standing rule).

**Never:** no production read, no `npx supabase db push`/`db reset`/`db start`, no `psql` at the linked project — the agent hands the owner the command. No scraper, no new adapter, no pipeline run as the delivery vehicle (`plan.ts:382-390` aborts on archived rows by design; that is Story 2.3's freeze working). `00014`/`00015`, `plan.ts`, and both adapters' fetch scope unchanged. No UI, no route-list or prerender change (Story 2.9 owns the chip/filter; AD-7's 178 stands). No deriving `league` from a date. A guard is never relaxed or deleted to make a run pass — a wrong census count is resolved in writing first.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Curation complete and correct | 178 CSV rows, 160 with a venue, 18 ABA blank | generator emits `00016`; ordered replay exits 0; census = 160/1/18, zero NULL, Game-7 home wins = 117 | N/A |
| One curated venue wrong | flipped NBA/BAA row | in-migration raise aborts the whole transaction, count ≠ 117 | rehearsal proves it fires (`expectRejected`) |
| NBA/BAA row with blank venue | curation incomplete | generator **refuses to emit**, naming the count; the migration's guard refuses again if hand-bypassed | non-zero exit |
| Curated row matches 0 or 2 series | year/abbreviation typo | abort naming the row | |
| Game-7 row already carries a different venue | the 178th series (2026 Finals) | abort naming the series — never overwrite a row that is neither the canonical `home = team_a` state nor the curated value | |
| Migration edited by hand | CSV and `00016` disagree in either direction | `--check` fails | non-zero exit |
| Self-test (venues not curated yet) | CSV complete but venue column blank on the 160 | the generator emits the same SQL from a deterministic synthetic 117/43 assignment into a temp path; the harness applies it to the fixture, asserts the census, tampers it to prove each guard fires; nothing is written to `supabase/migrations/` | banner states SELF-TEST on every line; `COVERED_THROUGH` stays 15 |

</frozen-after-approval>

## Code Map

- `supabase/scripts/pipeline/data/game7_venues_curated.csv` **(new)** — the single committed source. 178 rows, `year,team_a,team_b,league,game7_home_team` (abbreviations, one row per archived series, `series_manual.csv`'s `#`-comment style for provenance). Tracked despite `.gitignore:6 data` because of `:9 !supabase/scripts/pipeline/data/`. Four columns derive from `docs/NBASeriesResults.xlsx` (header order confirmed 2026-10-01: `League, Year, Series Type, Winner Team, Winner Games, Loser Team, Loser Games, Total games, G1–G7 Score W, G1–G7 Score L`; `team_a` = Winner Team, so `team_a` is always the series winner); `game7_home_team` is human.
- `supabase/scripts/pipeline/venueBackfill.ts` **(new)** — the committed generator: parse → validate → refuse to emit while curation is incomplete → emit the whole `00016` file, plus `--check` (regenerate and byte-compare against the committed file, so drift fails in either direction) and the deterministic self-test assignment the harness consumes (D2). Placement is deliberate: `tsconfig.json` references `tsconfig.pipeline.json`, whose `include` is `["supabase/scripts/pipeline", "tests"]`, so this file is type-checked by `tsc -b` and linted by Biome — unlike anything under `scripts/`. Reuse `adapters/manualCsv.ts`'s parsing conventions (`:50-52` `rowRef` message shape, `:61-69` no-quote `splitCsvLine`, `:90-102` header + comment handling); do **not** import the adapter, and do not touch `plan.ts`.
- `scripts/probe-nba-com-adapter.mjs` — the owner-run live-leg harness Story 2.4 handed over, and the exact pattern `scripts/probe-game7-venues.mjs` **(new)** copies: the spike's six browser-like headers verbatim, one request per season, 25 s timeout, 3-attempt `[1000, 4000]` backoff, terminal messages naming the URL, and **no silent `manual_csv` fallback**. It reads `leaguegamelog` per game and prints `year,team_a,team_b,game7_home_team` lines for the owner to paste into the curated file; it writes nothing. Identity resolves through the port's abbreviation→`teams.id` path, never the feed's numeric `TEAM_ID`, which Story 2.4 measured as **not** agreeing with `teams.id`. Both files sit under `scripts/`, which no gate step checks — same stated gap as the rehearsal.
- `supabase/migrations/00016_archive_league_identity_and_game7_venues.sql` — **generated, one copy, owned by the generator** (no hand-spliced `VALUES` block to drift). Not emitted this session: D2 leaves the venue column blank and the generator refuses. Structure once it is: `ALTER TABLE … ADD COLUMN league text` → `UPDATE … FROM (VALUES …)` league backfill → `SET NOT NULL` → `DEFAULT 'NBA'` → `CHECK`; then one `UPDATE` for the game-7 rows needing an orientation fix; guard blocks in `00015`'s raise-to-abort style (`00015:80-85` is the in-repo precedent for a data assertion; note no migration has ever data-guarded before this one).
- `scripts/rehearse-migration-00014.mjs` — `COVERED_THROUGH` `:67` goes 15→16 **in the commit that lands the curated venues and the emitted `00016`**; this session it stays 15 and the header states why (the file above it does not exist yet, so the pre-flight warning at `:165-168` cannot fire). The self-test section seeds a **fixture archive** — 178 series × 7 rows — because `00016`'s guards are census guards and a replayed table otherwise holds 8 series / 56 rows (`00001:102-110`), where the migration cannot apply at all. Helpers to reuse: `assert` `:122`, `mustSucceed` `:116`, `psqlValue` `:130`, `countWhere` `:136`, `expectRejected` `:338-348` (needs non-zero exit **and** a message hit). Exit only via `process.exitCode` (`:469-479`), teardown in `finally`. **Amend the header claim at `:17-24`** — "the archive total is not proven by replay" stops being true the moment a 178×7 fixture is seeded, and the amendment must say the fixture's shape is real while its venue values are synthetic until curation lands.
- The fixture seed is built by the generator from the CSV (no committed derived file, so it cannot drift): 178 series × 7 rows in the pre-`00016` state — `home_team_id = team_a_id` throughout, `winner_team_id = team_a_id`, synthetic scores that satisfy every CHECK (`00005:41-56`), `round` a literal string (`NOT NULL`, never a key). Synthetic scores are enough: every guard this story writes is relational, and the 117 census depends only on which side is home vs which side won — both real data.
- `supabase/migrations/00007_*.sql:129-204` — read-only evidence of the state `00016` corrects.
- `supabase/migrations/00014_*.sql:28` — `series_year_team_pair_key`, the identity the CSV resolves against; `teams.abbreviation` is `UNIQUE NOT NULL` and 59 abbreviations cover the archive (watch near-collisions: BKN/NJN/NYN, GSW/PHW/SFW, NOP/NOH/CHA, DEN/DNR).
- `docs/CURRENT_DATA_MODEL.md` — replace "The archive carries slots, not venues — and slot `a` is the series winner" and the Decision-11 freeze annotation with the post-`00016` boundary, stated so no later reader repeats the falsified measurement. Same commit as the migration.
- `_bmad-output/implementation-artifacts/seriesdatasource-port.md` — one sentence in the `manual_csv` section: the floor writes live playoff rows only and is not a backfill vehicle; pointer to `00016`.
- `epics.md:418-442` — the ACs this spec implements; `sprint-change-proposal-2026-10-01.md` §2.3 and §4 — the four owner calls, treated as fixed input.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/scripts/pipeline/data/game7_venues_curated.csv` — 178 rows; the four derivable columns generated from the committed sheet by a throwaway read, `game7_home_team` blank on the 160 NBA/BAA rows this session (D2) and filled only by the probe route in D1.
- [x] `supabase/scripts/pipeline/venueBackfill.ts` — parse, validate, **refuse to emit while any NBA/BAA venue is blank** (naming the count), emit `00016`, `--check` for CSV↔migration drift in either direction, and the deterministic self-test assignment mode the harness drives.
- [x] `scripts/probe-game7-venues.mjs` — D1's owner-run probe over seasons 1993-94 → 2025-26, printed as CSV-shaped lines; writes nothing, no fallback, messages name the URL it failed on.
- [x] `scripts/rehearse-migration-00014.mjs` — fixture-archive seeding, census asserts against the self-test migration, one demonstrable failure per guard, amended header; `COVERED_THROUGH` stays 15 with the reason stated in the header.
- [x] `tests/pipeline/venue-backfill.test.ts` — the matrix rows, plus the generator's unit-level rules (unordered pair resolution, blank-venue legality, the three-case orientation decision, the refuse-to-emit gate) as pure-function tests.
- [x] `docs/CURRENT_DATA_MODEL.md` + `seriesdatasource-port.md` + `epic-2-context.md` + `deferred-work.md` (the Tier B entry names its owner and route here rather than closing) + `sprint-status.yaml` — 2.8 recorded as machinery-complete/venue-blocked, so 2.9 and 2.5 stay visibly blocked.
- [x] `npm run gate` and `node scripts/rehearse-migration-00014.mjs` run here (D3); output recorded verbatim in Implementation Notes. `00016` is **not** emitted and `npx supabase db push` is **not** run by the agent.

**Acceptance Criteria:**
*Met by this session:*
- Given the CSV with a blank venue column, when the generator runs, then it exits non-zero naming the 160 rows and writes no migration — the data gap is an instrument that cannot pass, not a comment.
- Given a seeded fixture archive of 178 series / 1,246 game rows and the self-test migration, when the harness applies it, then the census reads 160 / 1 / 18 with zero NULL and Game-7 home wins = 117, and every swapped row still has `winner_team_id` = the higher-scoring side.
- Given each guard, when its input is tampered (a flipped venue, a curated row matching two series, a blank NBA venue, a game-7 row that already carries a different venue), then the harness observes the abort with a message — no guard is certified by its presence in the SQL alone.

*Deferred to the curation commit by design (D2), not silently:*
- Given the curated venues and the emitted `00016`, when `00001`–`00016` apply in filename order, then the run exits 0 with `COVERED_THROUGH = 16` and Story 2.8's `epics.md:418-442` AC closes.
- Given a hand-edit of the emitted `00016`, when `--check` runs, then it exits non-zero naming the divergence.
- Given the owner has not run `npx supabase db push`, then production is unchanged and every claim here is sourced from the throwaway container.

## Implementation Notes

**Session outcome (2026-10-01): machinery complete, venues pending — ends `review`-pending-data per D2.**
Committed this session: `game7_venues_curated.csv` (178 rows), `venueBackfill.ts` (generator: parse →
validate → refuse-to-emit gate → emit `00016` → `--check` byte-compare → deterministic self-test mode),
`scripts/probe-game7-venues.mjs` (owner-run, never executed by the agent — outbound policy, same as the
2.4 probe), `scripts/rehearse-migration-00014.mjs` section 5 (fixture archive + guard tampers,
`COVERED_THROUGH` stays 15 with the reason in the header), `tests/pipeline/venue-backfill.test.ts`
(30 tests), and the doc set (`CURRENT_DATA_MODEL.md` Story-2.8-status section, `seriesdatasource-port.md`
manual_csv sentence, `epic-2-context.md`, `deferred-work.md` Tier B stays open naming route+owner,
`sprint-status.yaml` 2-8 → `review` with the machinery-complete comment). **`00016` does not exist in
`supabase/migrations/` and no production command was run; production is unchanged.**

**`node supabase/scripts/pipeline/venueBackfill.ts --check` — exit 2 as Verification expects (same output
as the bare emit run; the listing runs to all 160 rows):**

```
venueBackfill refuses to emit: 160 NBA/BAA row(s) carry a blank game7_home_team — the curation (spec-2-8 D1/D2) has not landed, so no migration was written.
  C:\Users\yujey\Documents\predictgame7\supabase\scripts\pipeline\data\game7_venues_curated.csv:32: 1948, PHW vs SLB (BAA)
  C:\Users\yujey\Documents\predictgame7\supabase\scripts\pipeline\data\game7_venues_curated.csv:33: 1951, ROR vs NYK (NBA)
  ... (158 more rows) ...
  C:\Users\yujey\Documents\predictgame7\supabase\scripts\pipeline\data\game7_venues_curated.csv:209: 2026, PHI vs BOS (NBA)
no migration written; 00016 does not exist and COVERED_THROUGH stays 15 until the curated venues land
```

**`node scripts/rehearse-migration-00014.mjs` — exit 0, verbatim:**

```
rehearsal container: pg7-rehearse-00014-25208 (postgres:16, throwaway, no published port)
migrations to replay: 15
applied 00001_create_game_sevens_tables.sql
applied 00002_create_contact_submissions.sql
applied 00003_create_team_logos_table.sql
applied 00004_user_profiles_storage.sql
applied 00005_release_1_data_model.sql
applied 00006_backfill_series_game_scores.sql
applied 00007_backfill_missing_historical_series.sql
applied 00008_populate_team_logo_urls.sql
applied 00009_canonicalize_los_angeles_clippers.sql
applied 00010_refresh_team_logo_asset_paths.sql
applied 00011_enable_rls_on_public_release_tables.sql
applied 00012_harden_contact_submission_access.sql
applied 00013_archive_legacy_tables.sql
applied 00014_series_identity_and_drop_status.sql
applied 00015_pipeline_series_functions.sql
ok   migrations 00001..00015 all present and applied in filename order with no statement error — 00007:57 ON CONFLICT status target resolved at its own point

-- \d public.series --
Table "public.series"
     Column     |           Type           | Collation | Nullable |      Default      
----------------+--------------------------+-----------+----------+-------------------
 id             | uuid                     |           | not null | gen_random_uuid()
 year           | integer                  |           | not null | 
 round          | text                     |           | not null | 
 team_a_id      | integer                  |           | not null | 
 team_b_id      | integer                  |           | not null | 
 winner_team_id | integer                  |           |          | 
 created_at     | timestamp with time zone |           |          | now()
 updated_at     | timestamp with time zone |           |          | now()
Indexes:
    "series_pkey" PRIMARY KEY, btree (id)
    "series_year_team_pair_key" UNIQUE CONSTRAINT, btree (year, team_a_id, team_b_id)
Check constraints:
    "chk_series_teams_different" CHECK (team_a_id <> team_b_id)
Foreign-key constraints:
    "series_team_a_id_fkey" FOREIGN KEY (team_a_id) REFERENCES teams(id)
    "series_team_b_id_fkey" FOREIGN KEY (team_b_id) REFERENCES teams(id)
    "series_winner_team_id_fkey" FOREIGN KEY (winner_team_id) REFERENCES teams(id)
Referenced by:
    TABLE "predictions" CONSTRAINT "predictions_series_id_fkey" FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
    TABLE "series_game_scores" CONSTRAINT "series_game_scores_series_id_fkey" FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
Policies:
    POLICY "Public can read series" FOR SELECT
      TO anon,authenticated
      USING (true)

ok   series_year_team_pair_key UNIQUE is present
ok   idx_series_identity is absent
ok   status column is absent (its DEFAULT went with it)
ok   chk_series_status is absent
note   fixture series rows in the replayed schema: 8 (fixture, not the 178-row archive — see header)
ok   duplicate (2024, 8, 18) rejected with unique-violation SQLSTATE 23505 by series_year_team_pair_key
ok   slot-swapped insert (2024, 18, 8) accepted — the DB half of the identity guard is the pair as stored, only
ok   birth returned a series id (b7d96ce3-334e-4a2c-a2b5-fcb337d38673)
ok   a birth lands the series row with winner NULL and exactly six score rows
ok   re-running the identical birth returns the same id without duplicating rows (ON CONFLICT path)
ok   the slot-swapped insert wrote nothing
ok   a 4-2 split over six games is not a certified 3-3 and is rejected
ok   the rejected 4-2 birth wrote nothing
ok   a tie game is not final and is rejected
ok   the rejected tie birth wrote nothing
ok   game set {1,2,4,5,6,7} — right count, wrong set — is rejected
ok   the rejected gapped birth wrote nothing
ok   a blank round label is rejected — NOT NULL alone would happily store spaces
ok   the rejected blank-round birth wrote nothing
ok   a payload that is not six elements long is rejected on the raw array, not as a bare NOT NULL violation
ok   the rejected malformed-length birth wrote nothing
ok   the completion RPC returns the same series id
ok   the completion fills the winner and appends game 7 — both statements landed
ok   the replayed completion changed nothing
ok   a completion whose claimed winner contradicts game 7 is rejected
ok   a completion trying to restyle an archived game 7 is rejected (never rewrites the archive)
ok   the two rejected completions left the row exactly as it was
ok   EXECUTE on the two RPCs belongs to service_role only (anon and authenticated are revoked)

-- 5) SELF-TEST: Story 2.8 fixture archive + synthetic 00016 --
SELF-TEST generator: SELF-TEST generated (spec-2-8 D2): synthetic venues 117 keep (home = team_a) / 43 swap (home = team_b) — venue values are SYNTHETIC, not curated
SELF-TEST generator: SELF-TEST wrote migration rendering to C:\Users\yujey\AppData\Local\Temp\pg7-2-8-selftest-SBMGib\00016-selftest.sql
SELF-TEST generator: SELF-TEST wrote fixture archive seed to C:\Users\yujey\AppData\Local\Temp\pg7-2-8-selftest-SBMGib\fixture-seed.sql
ok   SELF-TEST generator exited 0 on the self-test path
ok   SELF-TEST 00016 rendering was NOT written into supabase/migrations/ (COVERED_THROUGH stays 15 until curation lands)
ok   SELF-TEST curated CSV holds 178 rows (the archive total, AD-7: 178 stands)
ok   SELF-TEST synthetic assignment covers exactly 160 NBA/BAA rows
ok   SELF-TEST synthetic assignment splits 117 keep / 43 swap
ok   SELF-TEST curated CSV carries exactly 18 ABA rows
ok   SELF-TEST fixture archive holds 178 series rows
ok   SELF-TEST fixture archive holds 1,246 game rows
ok   SELF-TEST every fixture series carries exactly 7 game rows
ok   SELF-TEST pre-state is the canonical 00007 orientation: every game row names team_a as home
ok   SELF-TEST guard league_row_match: a curated row matching TWO series aborts naming the row — abort observed, whole transaction rolled back
ok   SELF-TEST guard league_row_match: a curated row matching ZERO series aborts naming the row — abort observed, whole transaction rolled back
ok   SELF-TEST guard league_backfill_complete: a series the CSV does not cover aborts the SET NOT NULL with the count named — abort observed, whole transaction rolled back
ok   SELF-TEST guard aba_row_census: a mis-keyed league list that resizes the ABA block aborts naming the count — abort observed, whole transaction rolled back
ok   SELF-TEST guard venue_row_match: a venue row mis-keyed to a year no series holds aborts naming the row — abort observed, whole transaction rolled back
ok   SELF-TEST guard venue_coverage: a blank NBA/BAA venue hand-bypassed into a missing row aborts naming the uncovered series — abort observed, whole transaction rolled back
ok   SELF-TEST guard orientation_conflict: a game-7 row that is neither canonical nor curated aborts naming the series (the 178th-series protection) — abort observed, whole transaction rolled back
ok   SELF-TEST guard game7_home_win_census: one flipped curated venue lands 116, not 117, and aborts — the curated list checksums itself — abort observed, whole transaction rolled back
ok   SELF-TEST guard row_winner_consistency: a game row whose winner_team_id is not the higher-scoring side aborts naming the count — abort observed, whole transaction rolled back
ok   SELF-TEST guard series_winner_game7_consistency: an archived series whose winner_team_id is not its game-7 winner aborts naming the count — abort observed, whole transaction rolled back
SELF-TEST census — league: 159 NBA + 1 BAA + 18 ABA = 178, NULL 0; NBA/BAA Game-7: 117 home wins + 43 swapped (home = team_b) over the 160 population; Game-7 home wins = 117
ok   SELF-TEST league census is 159 NBA + 1 BAA + 18 ABA with zero NULL
ok   SELF-TEST Game-7 home wins over the 160 NBA/BAA series = 117 (nba.com 117-43, same population)
ok   SELF-TEST exactly 43 rows took the team+score swap
ok   SELF-TEST every swapped game-7 row still has winner_team_id = the higher-scoring side (all 1,246 rows checked)
ok   SELF-TEST every series still has winner_team_id = its game-7 winner
ok   SELF-TEST no games 1-6 row was touched (no statement may reach game_number <> 7)
ok   SELF-TEST the 18 ABA game-7 rows stay exactly as archived (home = team_a, Call 2)
ok   SELF-TEST series_league_check exists
ok   SELF-TEST league is NOT NULL with DEFAULT 'NBA' — in that order, so the backfill owned every archived value and the default owns pipeline rows (Call 4)
ok   SELF-TEST a pipeline birth after 00016 defaults to league = NBA without any RPC change
SELF-TEST Story 2.8 section complete: every guard observed failing, the clean census holds, 00016 itself is NOT in supabase/migrations/.

REHEARSAL PASSED: replay order holds, the key enforces, the swap stays a runner-side assertion, 00015's RPCs assert, land atomically, and stay service_role-only, and Story 2.8's self-test fixture proves every 00016 guard can fail (SELF-TEST venues — curation still owed by the owner, spec-2-8 D1/D2).
rehearsal container pg7-rehearse-00014-25208 removed
```

**`npm run gate` — all four pass:** Biome `Checked 122 files. No fixes applied.`; `tsc -b` clean (the
pipeline project now includes `venueBackfill.ts`, which `tsconfig.pipeline.json` pulls in with
`tests/pipeline/venue-backfill.test.ts`); Vitest `20 passed (20)` files / `292 passed (292)` tests
(the new file contributes 30); `vite build` + `verify-build-base` green — `Build output uses the
/predictgame7/ asset prefix.`

**Guard ↔ tamper correspondence (what "executed, not merely present" meant here).** Ten rejects, one
per guard plus two for the match-count rule (0 and 2), each asserting non-zero exit AND a message hit:
`league_row_match` ×2 (fixture slot-twin insert; fixture series delete), `league_backfill_complete`
(fixture series outside the CSV), `aba_row_census` (curated-side league tuple relabel NBA→ABA → 19),
`venue_row_match` (venue tuple year surgery → matches 0), `venue_coverage` (venue tuple dropped — the
hand-bypassed blank), `orientation_conflict` (fixture game-7 row pre-swapped to a different real venue
— the 178th-series case), `game7_home_win_census` (one flipped curated home → 116), `row_winner_consistency`
(a game-3 `winner_team_id` flip), `series_winner_game7_consistency` (a series `winner_team_id` flip).
The curated-side tampers are one-tuple line surgeries that assert exactly one candidate line, so they
cannot silently no-op; each reject run re-seeds the fixture first, and every rejected transaction rolls
back its own DDL. The winner-column flips are written by the HARNESS tamper only — the rendered
migration contains no `SET ... winner_team_id` (pinned by a unit test) and no non-game-7 statement.

**Known limits, stated not glossed.**
- Coverage split: `scripts/**` (rehearsal, probe) is checked by none of the four gate steps — verified
  only by running them, per AGENTS.md. `venueBackfill.ts` is under the gate by design (Biome + `tsc -b`
  via `tsconfig.pipeline.json`).
- The rehearsal's census `117` is proven against SYNTHETIC venues (the deterministic 117/43 assignment);
  what transfers to the real migration is the template and the guards' falsifiability, not any venue
  value. The 117-vs-116/118 as-of-date caveat (§2.3 of the change proposal) is untouched and stays the
  curation commit's to resolve in writing.
- CSV row 178 (2026 Finals, `2026,OKC,SAS,NBA,`) is not in `NBASeriesResults.xlsx`; its matchup and
  winner-first slot come from the owner-pinned flagship record (FR-13, 2026-09-25 — the list is
  winner-first everywhere else). Provenance is recorded in the file's comments. If that slot order is
  ever wrong, the design stays safe: series resolution is by UNORDERED pair, `league` comes from the
  row's own column, and AD-4's consistency guards read `winner_team_id` from the table, never from the
  CSV — orientation case 3 aborts rather than clobbering.
- The probe was NOT run this session (owner-run: D1 + the live-leg policy from spec-2.4 Decision 12);
  nothing here claims the feed's current reachability. It is syntax-checked only.
- `npx supabase db push` not run; production unchanged; every number above is sourced from the
  throwaway container.

**Handover to the owner (in order, when venues are curated):**
1. `node scripts/probe-game7-venues.mjs` (or hand-enter from a reference; pre-1993 block included);
   fill `game7_home_team` on the 160 NBA/BAA rows of the curated CSV.
2. `node supabase/scripts/pipeline/venueBackfill.ts` — emits `00016`; then bump `COVERED_THROUGH` 15→16
   in `scripts/rehearse-migration-00014.mjs` in the same commit, and let that commit replace the
   "slots, not venues" paragraphs of `docs/CURRENT_DATA_MODEL.md` with the post-`00016` boundary
   (standing same-commit rule).
3. `node scripts/rehearse-migration-00014.mjs` (must print the ordered replay including 00016 and exit 0).
4. `npx supabase db push` — the apply stays the owner's explicit action.
If the census lands 116 or 118: resolve WHICH in writing (mis-curated row vs. the published as-of date
excluding the 2026 Finals) — relaxing or deleting the guard is not an acceptable resolution.

## Spec Change Log

**Loopback 1 (2026-10-01, review pass 1 → `review_loop_iteration` 1).** Triggered by E1 + E2 (both `high`, `bad_spec`): the spec described the rehearsal as seeding the fixture archive *inside the ordered replay, immediately before `00016`*, then the D2 edit rewrote that bullet into a standalone section-5 self-test without touching the deferred AC that still reads "`00001`–`00016` apply in filename order → exit 0". The two cannot both hold — section 1 replays every file in `supabase/migrations/`, so the emitted `00016` is applied to the 8-series replay table and aborts. E2 is the same blind spot one layer on: the spec said "`--check` proves CSV↔migration agreement" but never named who runs it, so agreement is currently asserted only by tests over injected IO and by a temp render of the generator's own output.

**To be amended in the non-frozen sections once E7 is answered** (`## Code Map`'s rehearsal bullet, `## Tasks & Acceptance`, the deferred AC block, `## Verification`):
- The certified ordered replay must seed the fixture archive **before** applying the file whose guards need it, and section 5's `!migrationOnDisk` assertion becomes state-aware (`!migrationOnDisk || COVERED_THROUGH >= 16`) so the curation commit can pass it.
- A `00016` present above `COVERED_THROUGH = 15` is a failure, not a warning — emit and ceiling bump share a commit or neither is certified.
- The committed-pair drift check runs from a normally-executed path (the rehearsal, and/or a `verify-build-base.mjs`-style step in the gate), and the comparison normalizes line endings first — `core.autocrlf=true` here with `eol=lf` pinned only for the hook would otherwise make `--check` red at line 1 for every fresh checkout.
- The handover must state the archive-growth rule: re-measure the live archive and append any series newer than the CSV **before** emitting, or `league_backfill_complete` aborts the owner's `db push` for a reason no rehearsal can show.

**KEEP — what worked and must survive re-derivation:** the generator owns the single copy of `00016` and refuses to emit while any NBA/BAA venue is blank (verified: exit 2, names the 160, writes nothing); the CSV's four derived columns and the 178/160/18/1 split; the three-case orientation rule with case-3 abort as the 178th-series protection; the nine raise-to-abort guards and the synthetic 117/43 self-test assignment that lets every one of them be observed failing; the fixture seeded from the CSV rather than committed as a derived file; `venueBackfill.ts` living under `supabase/scripts/pipeline/` so `tsc -b` and Biome actually check it; the venue probe driving the *shipped* adapter through `seasonOverride` and resolving identity only through abbreviations; and the discipline of never letting a census guard be relaxed to make a run pass.

**E7 is not a spec fix — it is an owner answer.** The approved artifacts pin "160 / 1 / 18" (sums to 179); the code, the tests and `docs/CURRENT_DATA_MODEL.md` assert 159 NBA + 1 BAA + 18 ABA = 178 with NBA/BAA = 160. Escalated before any revert.

(No changes to the frozen block; implemented as approved on 2026-10-01.)

## Review Triage Log

Pass 1 (2026-10-01), three layers run on the diff since `5c111e8` (`story-2-8-diff.patch`, 153 kB). Verdicts rendered by the session after reading the cited code, not by the reviewers. Grouped entries carry a shared root cause; **E-numbers are the routing units.**

| # | Layer / location | Claim (verified bad outcome, or the refutation) | Verdict | Route |
|---|---|---|---|---|
| E1 | VG-1, EC-9/10/11, BH-7 — `rehearse-migration-00014.mjs:175-214, 503-512` | Confirmed: section 1 applies **every** `.sql` in `supabase/migrations/` and `mustSucceed`s each, while the fixture archive is seeded only in section 5. The moment the curation commit emits `00016`, section 1 replays it against the 8-series table, `league_row_match`/`league_backfill_complete` raise, and the run exits non-zero — so the story's deferred AC ("`00001`–`00016` apply in filename order → exit 0") is unexecutable as designed, and section 5's `!migrationOnDisk` assert goes red in the same commit. Nothing also pins that a `00016` above the ceiling is a failure. | high | bad_spec |
| E2 | VG-2, BH-8 — `venueBackfill.ts:772-783`, `rehearse:491-499`, `tests:268/285/301` | Confirmed: the three `--check` tests drive injected IO over synthetic text, section 5 compares only its own freshly-generated temp render, and no gate/CI/hook invokes the CLI — so nothing that runs normally can catch CSV↔migration drift, though `epics.md:438` requires the rehearsal to fail on it "in either direction". Compounding and independently verified: `core.autocrlf=true` with `.gitattributes` pinning `eol=lf` only for `.githooks/pre-push`, so a committed LF `00016` checks out CRLF and `firstDriftLine` reports divergence at line 1 — a false red at exactly the step meant to catch hand edits. | high | bad_spec |
| E3 | VG-3, BH-12, EC-12 — `rehearse:534-540` | Confirmed: `applyRejected` checks exit ≠ 0 and a message hit, then closes with `assert(label, true)` and prints "whole transaction rolled back"; no query anywhere inspects post-reject state, and every next case re-seeds. The rollback half of the claim is certified by a tautology — this repo's own rule (`epic-2-context.md:43`) says that is not a rehearsal assertion, and the owner is told to trust that atomicity before `db push`. | high | patch |
| E4 | BH-1/2/3, EC-13 — `probe-game7-venues.mjs:75, 431-434, 126-170` | Confirmed: the loop starts at season 1993-94 (postseason in calendar **1994**), but the CSV holds two year-1993 rows (`1993,PHX,SEA` / `1993,SEA,HOU`), so the probe can answer 96 of 160 and the "~97 covered / ~63 older" figure in D1 and `deferred-work.md` is one row off. Confirmed: the header comment says its `team_a/team_b` follow the adapter's game-1-home convention while the printed line is winner-first (`${winner},${loser}`) — harmless for matching (unordered) but the file the owner reads while pasting contradicts itself. Confirmed: a season the route answers empty prints "0 completed Game-7 series" and the run still ends "PROBE COMPLETED" at exit 0, though frozen D1 promises that exact condition is the mapping-blocker evidence. No coverage report tells the owner which curated rows were answered and which still stand blank. | medium | patch |
| E5 | BH-17 — `tests/pipeline/venue-backfill.test.ts` | Confirmed by search: no test pins the committed CSV's abbreviations against the 59-team `00005`+`00007` seed the migration joins on, so an abbreviation typo introduced at curation is caught only by the Docker rehearsal, which no gate step runs. Both new `scripts/**` files are likewise checked by nothing but `node --check`. | medium | patch |
| E6 | BH-4/6/14, EC-7 — `venueBackfill.ts:561-579, 502-506, 707-712` | Confirmed: `v_population` is computed only to interpolate the failure message — no guard asserts it (the NBA/BAA count of 160 falls out arithmetically from NULL=0 + ABA=18 + total=178, so the harm is a misleading message, not a silent wrong); `v_found boolean := false` is declared and never used, and will be inherited by every future reader of the generated `00016`; `refusePathInsideMigrations` compares case-sensitively on a case-insensitive filesystem. | low | patch |
| E7 | BH-9/10, VG-4 — `epic-2-context.md:43`, `epics.md:412`/`:430`, `sprint-change-proposal-2026-10-01.md:153`, this spec's frozen matrix | Confirmed: the approved planning text pins the post-`00016` split as "160 NBA + 1 BAA + 18 ABA = 178" / "splits exactly **160 / 1 / 18**", which sums to 179 and cannot hold. The code, the tests and `docs/CURRENT_DATA_MODEL.md` all carry the arithmetically possible reading — **159 NBA + 1 BAA + 18 ABA = 178, NBA/BAA combined = 160** — and the rehearsal prints exactly that. Story 2.7 is instructed to assert the impossible triple. Not resolvable from the code: the wording is in human-approved artifacts. | medium | intent_gap |
| E8 | BH-10 — `docs/CURRENT_DATA_MODEL.md` 178th-row sentence vs the CSV's provenance comment | Partly confirmed: the doc's 178th-row sentence says that series was "written by a path that did not use winner-first orientation", while the curated CSV's comment declares `team_a` = the series winner for every row. No functional break (resolution is by unordered pair and the venue is an abbreviation, not a slot), but the two statements teach different things about the same row, and `orientation_conflict`'s case-3 branch is exactly the protection the doc sentence implies is needed. The reviewer's second half is not a defect: "the archived rows hold no venue information" is still true today, and the spec already routes the section's replacement to the migration commit. | medium | patch |
| E9 | BH-15 — `src/pages/PredictPage.tsx:31` (`SERIES_SELECT` enumerates columns) vs `src/pages/HistoricalPage.tsx:38` (`select('*')`), `src/types/types.ts` | Confirmed: after `db push`, one read path never asks for `league` and the other starts returning it into a type that does not declare it and an unvalidated cast. Nothing breaks today (Story 2.9 owns the chip), but the divergence is undocumented and is that story's prerequisite. | medium | defer |
| E10 | BH-16 — `AGENTS.md` product guardrails | The standing-rule class is right (an agent could compute a home-court statistic from games 1–6 or an ABA game-7 row), but the rule is not yet true of any database that exists — `league` is not applied — and AGENTS.md carries durable rules only. | low | defer |
| R1 | EC-1 — `venueBackfill.ts:536-551` swap leaves `away_team_id` unconstrained | Checked: the only writers of `series_game_scores` (`00006`, `00007`, `00015`'s birth/completion RPCs) derive both sides from the series' own pair, so a game-7 row naming a third team is not reachable by any path in the repo; and if one existed, the census would move and the transaction would abort rather than commit. | false | — |
| R2 | EC-2 — a `game7_home` not resolving in `teams` is silently dropped | Checked: `parseVenuesCsv:157` rejects a curated home that is neither slot of its own row, and `venue_row_match` proves that row's pair resolves to exactly one stored series — so the join cannot drop a row. | false | — |
| R3 | EC-3 — `venue_coverage` comments "exactly one", checks ≥1 | Checked: `parseVenuesCsv:168-176` rejects two curated rows resolving to the same unordered pair, so duplicates cannot reach the emitted migration. Wording only. | false | — |
| R4 | EC-5 — the emit path should pin 178/160/18 | The migration's guards already fail loudly on a dropped or mislabelled row, and pinning a hard 178 in the emit path would make the archive-growth case (E1's sibling) worse, not better. | false | — |
| R5 | EC-6 — refusal runs before `--check`, so drift is unreachable | By design and stated in `## Verification`: while the venues are blank there is no committed migration to compare against, and the expected output is the refusal. | false | — |
| R6 | EC-8 — a `process.argv[1]` mismatch makes the CLI exit 0 having done nothing | The non-matching case *is* the import case the tests and the rehearsal depend on; adding a failure branch would break that contract, and it matches `run.ts`'s shipped precedent. Reachable only by running the file under a deliberately mismatched path form. | low | rejected |
| R7 | EC-14 — probe prints `undefined` on a winner/loser lookup miss | Checked the shipped adapter: `nbaCom.ts:356-359` aborts the parse naming the abbreviation before any id reaches the probe, so an unresolvable id cannot appear in `statuses`. | false | — |
| R8 | BH-5 — no guard that each NBA/BAA series has exactly one game-7 row | Real that nothing checks it, but a missing game-7 row moves the 117 and aborts the transaction; the archive measured seven rows for every series. Graded low; the fix adds a branch for a state no writer produces. | low | rejected |
| R9 | BH-11, BH-13 — stale line numbers in this spec's Code Map; `... (158 more rows) ...` elision in Implementation Notes | Both true, and both fixes edit this build's spec, which the review step excludes. Recorded here so the next planning pass re-cites by symbol rather than by line. | low | rejected (spec-edit-only fix) |
| R10 | VG-5 — the probe re-states the adapter's option/return contract in a file nothing type-checks | Verified the shapes exist today, and this is the same exposure Story 2.4's `probe-nba-com-adapter.mjs` already carries — pre-existing class, widened by one file. Folded into E5's cheap `node --check` case rather than left as a claim. | low | rejected→E5 |

(empty — review loop not yet run)

## Design Notes

Three-case orientation rule for each matched series' game-7 row, which is what makes the rewrite safe on rows the generator did not write:
1. `home_team_id` already = curated home → no change.
2. `home_team_id` = `series.team_a_id` (the canonical `00007` state) → swap teams **and** scores in one statement; Postgres evaluates every `SET` expression against the pre-update row, so the exchange is atomic and `winner_team_id` needs no touch.
3. otherwise → abort naming the series. This branch is the 178th-series protection: the production measurement read `homeAlwaysTeamA = 177 of 178`, so exactly one archived series may already carry a real venue, and a curated list must never clobber it silently.

## Verification

**Commands:**
- `node supabase/scripts/pipeline/venueBackfill.ts --check` -- expected: non-zero this session, naming the 160 blank venues and writing no migration; exit 0 and silence once the CSV is complete and `00016` matches it.
- `node scripts/rehearse-migration-00014.mjs` -- expected: exit 0 with a SELF-TEST banner on every venue line, printed census `160/1/18` and `117`, and each guard's tamper observed as an abort. Requires a running Docker daemon (up and `postgres:16` cached as of 2026-10-01).
- `npm run gate` -- expected: all four pass. State the coverage gap rather than glossing it: `scripts/**` is checked by none of them, so the rehearsal and the probe are verified only by running them.
- Owner-run, never agent-run: `node scripts/probe-game7-venues.mjs` (the venue block) and `npx supabase db push` (the apply, after the curated CSV and the emitted `00016` land).
