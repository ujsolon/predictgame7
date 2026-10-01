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

**D4 — The league split is 159 NBA + 1 BAA + 18 ABA = 178; "160" is the NBA/BAA *combined* population** (owner confirmed 2026-10-01, resolving review finding E7). The `160 / 1 / 18` triple written into `epics.md`, `sprint-change-proposal-2026-10-01.md` and `epic-2-context.md` sums to 179 and cannot hold; those three sites now carry the corrected wording with a pointer back here, and Story 2.7 asserts 159/1/18 with the combined 160 as the insight denominator. `EXPECTED_NBA_BAA = 160` in the generator names the combined population, which is what the 117 checksum is taken over.

**D5 — The pinned counts stay pinned; growth aborts loudly rather than adapting (owner decision 2026-10-01, resolving review finding P2-4).** `178 / 160 / 18 / 117` remain literals in the generator, interpolated into the migration's guards, asserted by the harness. The design intent is that a drifted archive *cannot* be absorbed quietly: if the live table has grown by apply time — the pipeline keeps completing series, and an Active series also has no curated row — `league_backfill_complete` or `venue_coverage` stops `db push`. The route out is written into both guard messages and the handover: **re-measure the live archive (owner-run), append the newer series to the curated CSV, and change the constants in that same commit.** Relaxing, parameterising or deleting a guard is not the route. The rejected alternative was deriving the expected counts from the table at apply time, which would let a grown archive redefine its own denominator without anyone reading it.

**D6 — The pre-1993 fallback reference is basketball-reference.com, and D1's coverage figures are superseded (owner decision 2026-10-01, resolving P2-7).** The probe iterates seasons **1992-93 → 2025-26**, and the curated file splits **98 NBA/BAA rows in calendar years ≥ 1993 / 62 in ≤ 1992** — measured, not estimated. D1's "`1993-94 → 2025-26`", "`~97`" and "`~63`" are therefore stale and stand corrected by this entry; nothing else in D1 changes. The reference is named for the owner's own hand-entry leg — the owner runs it; **no agent-drafted venue list is authorized**, and this decision does not authorize one. *(Its "62 must be hand-entered" premise was falsified the same day by the depth drill — see D7, which keeps basketball-reference as the residue route only.)*

**D7 — Curation goes through an approved alias table, not a third-party source (owner chose option A, 2026-10-01, superseding D6's premise).** The depth drill showed the feed answers every season the archive needs; only the names differ. So `supabase/scripts/pipeline/data/game7_feed_aliases.csv` (`feed_abbr,teams_abbr,evidence`) is the mechanism: the direct pass matches first and claims its rows, an alias fires only on what the direct pass could not match and only against unclaimed rows, and only when exactly one row survives. Two substitutions in one pair, zero surviving rows, or two reachable rows are never resolved by preference — the first two are printed as proposals with their candidate list, the third raises as a broken invariant. Aliases are therefore **proposed with evidence and approved by the owner**, which keeps D1's rule intact: no venue value enters the archive from a model's reading of a website. basketball-reference.com stays as the reference for whatever residue the alias table cannot resolve, and for spot-checking a proposed mapping.


## Boundaries & Constraints

**Always:** `series.league` added nullable → backfilled → `SET NOT NULL` → `DEFAULT 'NBA'` → `CHECK (league IN ('NBA','BAA','ABA'))`, in that order. Series resolution keyed on `(year, unordered team pair)` via `teams.abbreviation`, never `round` (17 era spellings). Game-7 rows only: no statement may touch `game_number <> 7`, and the 18 ABA game-7 rows stay as archived. `winner_team_id` (both tables) is never written. The swap is a pure exchange of `(home_team_id, away_team_id)` and `(home_score, away_score)`, so winner-vs-score consistency survives whatever orientation the row arrives in. Census guards must be **executed** against a replayed archive of the real shape: a guard that cannot fail is not a guard. Docs update lands in the same commit as the migration (standing rule).

**Never:** no production read, no `npx supabase db push`/`db reset`/`db start`, no `psql` at the linked project — the agent hands the owner the command. No scraper, no new adapter, no pipeline run as the delivery vehicle (`plan.ts:382-390` aborts on archived rows by design; that is Story 2.3's freeze working). `00014`/`00015`, `plan.ts`, and both adapters' fetch scope unchanged. No UI, no route-list or prerender change (Story 2.9 owns the chip/filter; AD-7's 178 stands). No deriving `league` from a date. A guard is never relaxed or deleted to make a run pass — a wrong census count is resolved in writing first.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Curation complete and correct | 178 CSV rows, 160 with a venue, 18 ABA blank | generator emits `00016`; ordered replay exits 0; census = 159 NBA + 1 BAA + 18 ABA (combined NBA/BAA 160), zero NULL, Game-7 home wins = 117 | N/A |
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
- `supabase/scripts/pipeline/data/game7_feed_aliases.csv` **(new, D7)** — `feed_abbr,teams_abbr,evidence`, five rows as of 2026-10-01 (`CIN→CNR`, `STL→SLH`, `WAS→WSB`, `GOS→GSW`, `UTH→UTA`), each evidence line naming the season, the opposing side and the curated `csv:` row it resolves to. Read and validated by `venueBackfill.ts` (`parseFeedAliases`: target must be in the 59-team seed, one alias per feed code, no identity mapping, no alias without evidence) and applied only by `matchSeasonFeedSeries` — direct pass first, alias pass on unclaimed rows only, exactly one survivor or it is a proposal. The evidence column may contain commas, which is why it has its own splitter rather than the curated file's five-column one.
- `scripts/probe-nba-com-adapter.mjs` — the owner-run live-leg harness Story 2.4 handed over, and the exact pattern `scripts/probe-game7-venues.mjs` **(new)** copies: the spike's six browser-like headers verbatim, one request per season, 25 s timeout, 3-attempt `[1000, 4000]` backoff, terminal messages naming the URL, and **no silent `manual_csv` fallback**. Identity resolves through the port's abbreviation→`teams.id` path, never the feed's numeric `TEAM_ID`, which Story 2.4 measured as **not** agreeing with `teams.id` (the shipped adapter aborts the parse naming any abbreviation its map lacks — `adapters/nbaCom.ts:356-359`). Three things this session's review found and must fix before the owner runs it: **the season loop has to start at 1992** (season 1992-93 → calendar 1993, and the CSV holds two `1993` rows — starting at 1993-94 answers 96 of 160, not the 97 D1 states); **a season the feed answers with zero completed Game-7 series is a named failure, not a quiet `PROBE COMPLETED` at exit 0** (D1 promises that exact condition is the mapping-blocker evidence); and it must print a **coverage report** — which curated rows it answered and, by `file:line`, which still stand blank, because that list is where D1's accepted residual risk (a compensating pair) actually materialises. Its header comment also contradicts its own output (it claims the adapter's game-1-home slot convention while printing winner-first); matching is unordered so nothing breaks, but the file the owner reads while pasting must say one thing. Both files sit under `scripts/`, which no gate step checks.
- `.gitattributes` — `core.autocrlf=true` on this machine and the file pins `eol=lf` only for `.githooks/pre-push`, so a generated LF `00016` checks out as CRLF and a byte compare reports divergence at line 1 (git said exactly this when the review commit touched a markdown file). Fix both sides: the generator normalizes line endings before comparing (the emit path's `existing === rendered` idempotence check breaks the same way), and `.gitattributes` pins `eol=lf` for `supabase/migrations/*.sql` and the curated CSV.
- `supabase/migrations/00016_archive_league_identity_and_game7_venues.sql` — **generated, one copy, owned by the generator** (no hand-spliced `VALUES` block to drift). Not emitted this session: D2 leaves the venue column blank and the generator refuses. Structure once it is: `ALTER TABLE … ADD COLUMN league text` → `UPDATE … FROM (VALUES …)` league backfill → `SET NOT NULL` → `DEFAULT 'NBA'` → `CHECK`; then one `UPDATE` for the game-7 rows needing an orientation fix; guard blocks in `00015`'s raise-to-abort style (`00015:80-85` is the in-repo precedent for a data assertion; note no migration has ever data-guarded before this one). Two template fixes from review pass 1: drop the unused `v_found boolean := false` (every future reader of `00016` inherits it), and make `game7_home_win_census` assert the population it names instead of only interpolating it into the failure message — NBA/BAA = 160 is the denominator the 117 means.
- `scripts/rehearse-migration-00014.mjs` — the replay loop (section 1) applies **every** `.sql` in `supabase/migrations/`, so a committed `00016` is reached there, and its guards are census guards that cannot evaluate over the 8 series `00001:102-110` leaves behind. **The seeding therefore belongs inside the ordered loop, immediately before the `00016*` file is applied** — that single change makes the deferred AC ("`00001`–`00016` apply in filename order → exit 0") executable in both states: self-test while `00016` is unemitted, committed migration once it exists. Section 5 then switches on the file's existence: absent → apply the generator's synthetic self-test rendering; present → apply the committed file, use curated assignments, and run `--check` against the real CSV↔migration pair as part of the run that must pass before `db push`. `COVERED_THROUGH` (`:87`) goes 15→16 in the curation commit, and a `00016*` file present while the ceiling is still 15 is a `RehearsalFailure`, not the `console.warn` at `:185-188` — emit and ceiling share a commit or neither is certified. The `!migrationOnDisk` guard becomes state-aware (`!migrationOnDisk || COVERED_THROUGH >= 16`). `applyRejected` (`:534-540`) must stop asserting a literal `true` after a rejection and instead measure the post-reject state (`league` absent from `information_schema.columns`, `series_league_check` absent, 178 series still home = `team_a`), because "the transaction rolled back" is exactly what the owner is told to trust before running `db push`. Helpers: `assert` `:142`, `mustSucceed` `:136`, `psqlValue` `:150`, `countWhere` `:156`; exit only via `process.exitCode`, teardown in `finally`; the header's archive-total claim (`:17-24`) stays amended (fixture shape real, venues synthetic until curation lands).
- The fixture seed is built by the generator from the CSV (no committed derived file, so it cannot drift): 178 series × 7 rows in the pre-`00016` state — `home_team_id = team_a_id` throughout, `winner_team_id = team_a_id`, synthetic scores that satisfy every CHECK (`00005:41-56`), `round` a literal string (`NOT NULL`, never a key). Synthetic scores are enough: every guard this story writes is relational, and the 117 census depends only on which side is home vs which side won — both real data.
- `supabase/migrations/00007_*.sql:129-204` — read-only evidence of the state `00016` corrects.
- `supabase/migrations/00014_*.sql:28` — `series_year_team_pair_key`, the identity the CSV resolves against; `teams.abbreviation` is `UNIQUE NOT NULL` and 59 abbreviations cover the archive (watch near-collisions: BKN/NJN/NYN, GSW/PHW/SFW, NOP/NOH/CHA, DEN/DNR).
- `docs/CURRENT_DATA_MODEL.md` — **the authoritative statement of the post-`00016` boundary**; this spec's Code Map and `epic-2-context.md` point at it rather than restating it (pass 2, P2-11). Replace "The archive carries slots, not venues — and slot `a` is the series winner" and the Decision-11 freeze annotation with the post-`00016` boundary, stated so no later reader repeats the falsified measurement. Same commit as the migration.
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

- [x] `scripts/rehearse-migration-00014.mjs` (loopback E1/E3) — fixture seeding moved **inside the ordered loop**, immediately before the `00016*` file is applied; section 5 switches on whether `00016` exists (self-test rendering while unemitted, committed file + `--check` on the real CSV↔migration pair once it is); a `00016*` file present while `COVERED_THROUGH` is 15 becomes a `RehearsalFailure` rather than a `console.warn`; the `!migrationOnDisk` guard becomes state-aware (`!migrationOnDisk || COVERED_THROUGH >= 16`); `applyRejected` measures the post-reject state (`league` column absent, `series_league_check` absent, 178 series still in the canonical orientation) instead of asserting a literal `true`.
- [x] `scripts/probe-game7-venues.mjs` (loopback E4) — season loop starts at **1992** (calendar 1993 is in the archive: two CSV rows); a season that answers zero completed Game-7 series is a named failure, not a quiet `PROBE COMPLETED` at exit 0; print a coverage report of answered rows vs still-blank curated rows with `file:line`; reconcile the header comment to the winner-first output.
- [x] `supabase/scripts/pipeline/venueBackfill.ts` + `.gitattributes` (loopback E2/E6) — normalize line endings before any byte compare (and pin `eol=lf` for `supabase/migrations/*.sql` + the curated CSV — `core.autocrlf=true` here makes a committed LF migration check out CRLF and `--check` red at line 1); drop the dead `v_found`; make `game7_home_win_census` assert the 160 NBA/BAA population instead of only naming it; case-insensitive `refusePathInsideMigrations`.
- [x] `tests/pipeline/venue-backfill.test.ts` (loopback E5/VG-4) — derive the committed-CSV expectations from `blankVenueRows(...)` so the suite inverts itself at curation instead of turning `npm test` red; add a real-IO `--check` case, a case pinning every CSV abbreviation against the 59-team `00005`+`00007` seed, and a `node --check` smoke over both `scripts/**` additions.
- [x] docs (loopback E7/E8) — correct the impossible `160 / 1 / 18` triple at `epics.md:412`/`:430`, `sprint-change-proposal-2026-10-01.md:153` and `epic-2-context.md:43` to 159 NBA + 1 BAA + 18 ABA (NBA/BAA combined = 160) with a pointer to D4; reconcile the 178th row's slot convention between the CSV comment and `CURRENT_DATA_MODEL.md`; state the archive-growth rule in the handover (re-measure the live archive and append any series newer than the CSV before emitting, or `league_backfill_complete` aborts the owner's `db push`).

**Acceptance Criteria:**
*Met by this session:*
- Given the CSV with a blank venue column, when the generator runs, then it exits non-zero naming the 160 rows and writes no migration — the data gap is an instrument that cannot pass, not a comment.
- Given a seeded fixture archive of 178 series / 1,246 game rows and the self-test migration, when the harness applies it, then the census reads 159 NBA + 1 BAA + 18 ABA (NBA/BAA combined = 160, per D4) with zero NULL and Game-7 home wins = 117, and every swapped row still has `winner_team_id` = the higher-scoring side.
- Given each guard, when its input is tampered (a flipped venue, a curated row matching two series, a blank NBA venue, a game-7 row that already carries a different venue), then the harness observes the abort with a message **and measures the rolled-back state** — no guard is certified by its presence in the SQL alone, and no rollback claim is certified by an assertion that cannot fail.

*Deferred to the curation commit by design (D2), not silently:*
- Given the curated venues and the emitted `00016`, when `00001`–`00016` apply in filename order — with the fixture archive seeded inside that loop immediately before `00016`, since its guards are census guards and the `00001` fixture leaves 8 series — then the run exits 0 with `COVERED_THROUGH = 16`, `--check` passes on the committed pair, and Story 2.8's `epics.md:418-442` AC closes.
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

**`node scripts/rehearse-migration-00014.mjs` — exit 0, verbatim (SUPERSEDED 2026-10-01 by the
loopback re-run below; kept for the audit trail of what pass-1 code printed):**

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

**Loopback pass 1 implementation (2026-10-01, same day as the review).** All five unchecked task
lines landed: E1/E3 (`rehearse-migration-00014.mjs` — seeding moved inside the ordered loop before
the `00016*` file; section 5 switches on committed vs self-test and in committed mode applies the
committed file, uses curated assignments and runs `--check` on the real CSV↔migration pair through
the CLI's default IO; a `00016` above `COVERED_THROUGH = 15` is now a `RehearsalFailure` before the
container even starts; the `!migrationOnDisk` guard is state-aware; `applyRejected` snapshots
league-column / `series_league_check` / series-count / score-row-count / non-canonical-home-count
before and after each rejected apply and asserts equality plus column-absence), E4
(`probe-game7-venues.mjs` — loop starts at season 1992-93; a zero-Game-7 season is a named failure;
coverage report with `file:line`; header reconciled to the winner-first output), E2/E6
(`venueBackfill.ts` + `.gitattributes` — `normalizeEol` before every byte compare on both sides,
`eol=lf` pinned for `supabase/migrations/*.sql` and the curated CSV, `v_found` dropped from the
template, `game7_home_win_census` now raises on the 160 population before the 117,
`refusePathInsideMigrations` case-insensitive), E5/VG-4 (`venue-backfill.test.ts` — committed-file
expectations derive from `blankVenueRows(...)` and invert at curation, real-IO `--check` case,
59-team seed pin for every abbreviation, `node --check` smoke over both `scripts/**` files), E8
(docs — see the handover's new step 0 and the `CURRENT_DATA_MODEL.md` 178th-row reconciliation; the
`160/1/18` shorthand was additionally swept out of the three remaining sites in
`sprint-change-proposal-2026-10-01.md` §2.1/§2.3/§5.2 with a pointer to D4). `00016` is still NOT
emitted, `COVERED_THROUGH` is still 15, the probe still has not been run, and no production command
was executed.

**`node supabase/scripts/pipeline/venueBackfill.ts --check` after loopback — unchanged outcome
(exit 2, names the 160, writes nothing; the E2/E6 template fixes do not touch the refusal path).**

**`node scripts/rehearse-migration-00014.mjs` after loopback — exit 0, verbatim (this block
supersedes the pass-1 record above):**

```
rehearsal container: pg7-rehearse-00014-8208 (postgres:16, throwaway, no published port)
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
note   fixture series rows in the replayed schema: 8 (fixture, not the 178-row archive — 00016 unemitted, see header)
ok   duplicate (2024, 8, 18) rejected with unique-violation SQLSTATE 23505 by series_year_team_pair_key
ok   slot-swapped insert (2024, 18, 8) accepted — the DB half of the identity guard is the pair as stored, only
ok   birth returned a series id (5ac1fc44-a024-41a4-8338-9ef4df2d95b5)
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
ok   00016 is absent from supabase/migrations/ while COVERED_THROUGH is 15, or present with the ceiling raised to 16 (state-aware, E1)
SELF-TEST generator: SELF-TEST generated (spec-2-8 D2): synthetic venues 117 keep (home = team_a) / 43 swap (home = team_b) — venue values are SYNTHETIC, not curated
SELF-TEST generator: SELF-TEST wrote migration rendering to C:\Users\yujey\AppData\Local\Temp\pg7-2-8-selftest-yKQ5Qt\00016-selftest.sql
SELF-TEST generator: SELF-TEST wrote fixture archive seed to C:\Users\yujey\AppData\Local\Temp\pg7-2-8-selftest-yKQ5Qt\fixture-seed.sql
ok   SELF-TEST generator exited 0 on the self-test path
ok   SELF-TEST 00016 rendering was NOT written into supabase/migrations/ (COVERED_THROUGH stays 15 until curation lands)
ok   SELF-TEST CLI fixture seed matches the generator render the ordered replay would use
ok   SELF-TEST curated CSV holds 178 rows (the archive total, AD-7: 178 stands)
ok   SELF-TEST assignment covers exactly 160 NBA/BAA rows
ok   SELF-TEST assignment splits 117 keep / 43 swap (synthetic, by construction)
ok   SELF-TEST curated CSV carries exactly 18 ABA rows
ok   SELF-TEST fixture archive holds 178 series rows
ok   SELF-TEST fixture archive holds 1,246 game rows
ok   SELF-TEST every fixture series carries exactly 7 game rows
ok   SELF-TEST pre-state is the canonical 00007 orientation: every game row names team_a as home
ok   SELF-TEST guard league_row_match: a curated row matching TWO series aborts naming the row — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|179|1246|0)
ok   SELF-TEST guard league_row_match: a curated row matching ZERO series aborts naming the row — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|177|1239|0)
ok   SELF-TEST guard league_backfill_complete: a series the CSV does not cover aborts the SET NOT NULL with the count named — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|179|1246|0)
ok   SELF-TEST guard aba_row_census: a mis-keyed league list that resizes the ABA block aborts naming the count — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|178|1246|0)
ok   SELF-TEST guard venue_row_match: a venue row mis-keyed to a year no series holds aborts naming the row — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|178|1246|0)
ok   SELF-TEST guard venue_coverage: a blank NBA/BAA venue hand-bypassed into a missing row aborts naming the uncovered series — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|178|1246|0)
ok   SELF-TEST guard orientation_conflict: a game-7 row that is neither canonical nor curated aborts naming the series (the 178th-series protection) — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|178|1246|1)
ok   SELF-TEST guard game7_home_win_census: one flipped curated venue lands 116, not 117, and aborts — the curated list checksums itself — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|178|1246|0)
ok   SELF-TEST guard row_winner_consistency: a game row whose winner_team_id is not the higher-scoring side aborts naming the count — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|178|1246|0)
ok   SELF-TEST guard series_winner_game7_consistency: an archived series whose winner_team_id is not its game-7 winner aborts naming the count — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (0|0|178|1246|0)
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
rehearsal container pg7-rehearse-00014-8208 removed
```

(The post-reject snapshots vary by tamper exactly as the tamper's own committed writes dictate —
`179|1246` with a slot-twin inserted, `177|1239` after a series delete, `178|1246|1` for the
pre-swapped orientation-conflict row — and the assertion E3 demanded is that the pre- and
post-reject snapshots MATCH, i.e. only 00016's own transaction went; the snapshot columns are
league-column-count | series_league_check-count | series rows | game rows | non-canonical-home rows.)

**`npm run gate` after loopback — all four pass:** Biome `Checked 122 files in 2s. No fixes
applied.`; `tsc -b` clean; Vitest `20 passed (20)` files / `301 passed (301)` tests
(`venue-backfill.test.ts` now contributes 39 — the 9 loopback additions); `vite build` +
`verify-build-base` green — `Build output uses the /predictgame7/ asset prefix.`

**Guard ↔ tamper correspondence (what "executed, not merely present" meant here).** Ten rejects, one
per guard plus two for the match-count rule (0 and 2), each asserting non-zero exit AND a message hit
AND — since loopback pass 1 (E3) — an equality check on a five-column state snapshot taken before and
after the rejected apply (league column, `series_league_check`, series rows, game rows,
non-canonical-home rows):
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

**Main-session re-verification of the loopback (not taken from the implementer's report).** `node scripts/rehearse-migration-00014.mjs` → exit 0, 60 `ok` lines, ten rejects each printing a measured post-reject snapshot; `npm run gate` → exit 0 (Biome 122 files, `tsc -b` clean, Vitest 20 files / 301 tests, build + `/predictgame7/` prefix); `node supabase/scripts/pipeline/venueBackfill.ts --check` → exit 2 naming the 160 blanks and writing nothing; the curated CSV recounted independently at 178 data rows / 159 NBA + 1 BAA + 18 ABA / zero non-blank venue cells; the frozen block diffed against `HEAD` and changed **only** by D4 and the matrix row it corrects.

**Mutation evidence that E3's snapshot has teeth.** Three deliberate breaks, each run to completion, each restored afterwards:
1. `BEGIN;` deleted from the template → rehearsal exit 1, first tamper "rejected for an unexpected reason" — and it exposed *why* the structure matters: with `ON COMMIT DROP` the curated temp tables vanish under autocommit, so no structural drift can pass silently.
2. A `COMMIT;` injected after the `league` DDL → exit 1.
3. The expected snapshot prefix flipped from `0|0|` to an impossible `1|1|` → exit 1 at the first tamper, printing the **measured** value `0|0|179|1246|0` alongside `before=… after=…` — which is the decisive one: the assertion is evaluated against queried state, and a tautology could not be broken this way.
After restoring, `venueBackfill.ts` is byte-identical to the pre-mutation copy, the harness line is back to `0|0|`, and no mutation marker survives in the tree. Mutations 1 and 2 did not isolate the snapshot (both tripped the message-pattern check first); mutation 3 did.

**The committed-mode drill (review pass 2's central gap, closed).** Pass 2 found that everything the E1 loopback added runs only when a committed `00016` exists, so nothing in the repo had ever executed it — and proved it by mutation: moving the fixture seeding back out of the ordered loop changes no normally-run result. So it was executed, locally, in a throwaway drill with the three touched files backed up to `/tmp/drill-backup/`:
1. The 160 NBA/BAA venue cells filled with the same deterministic 117/43 rule the self-test uses (**synthetic values, never presented as curation**) → `node supabase/scripts/pipeline/venueBackfill.ts` exited 0 and wrote `00016_archive_league_identity_and_game7_venues.sql` (24,902 bytes) — the emit path's first-ever execution.
2. `--check` against that real committed pair → exit 0: `matches this generator's output … (EOL-normalized byte compare)` — the drift instrument's first real-IO pass.
3. `COVERED_THROUGH` raised to 16 and the rehearsal run → **exit 0, 59 `ok` lines, zero `SELF-TEST` tags**: `seeded 178-series x 7-row fixture archive from the curated CSV (pre-00016 state)` then `applied 00016_archive_league_identity_and_game7_venues.sql` **inside the ordered replay**, section 5 headed `Story 2.8 committed 00016: guard tampers, --check, census`, the real-IO `--check` asserted inside the run, and the census printing `159 NBA + 1 BAA + 18 ABA = 178, NULL 0; 117 home wins + 43 swapped … home = stored winner in 117`. Sections 3 and 4 also ran against the 178-series table for the first time and passed.
4. The new pairing hard-fail proven: with the emitted `00016` still on disk and the ceiling put back to 15, the run exits 1 before the container starts, naming the rule. `docker ps -a --filter name=pg7-rehearse` was empty afterwards — nothing leaked.
5. Restoration verified: emitted file deleted, CSV and `COVERED_THROUGH` restored from the backups, the generator refusing again (exit 2, names the 160), then the self-test rehearsal and `npm run gate` re-run green on the restored tree.

What the drill does **not** buy: the venue values were synthetic, so it certifies the committed-mode *code path* — emit, `--check`, replay-with-seed, tampers over the committed text, the census SQL — and not a single curated value. It also surfaced one real fragility, fixed in the same pass: `orientation_conflict`'s tamper picked `venues[5]`, a keep row only by synthetic construction, which against curated data can pre-swap a swap row into a legal case-1 keep and report "the guard cannot fail" at a guard that works; the tamper row and the census split are now property- and identity-based (P2-13/P2-14).

**Pass-2 patches applied by the main session after the drill** (the rows marked `patch — done` in the pass-2 triage table, each verified by re-running the rehearsal and the gate): `conflictRow`/`flippedVenue` picked from `keepVenues` by property instead of `venues[5]`/`find` (P2-2, and the two tampers now use different series); the census split made mode-aware with a new identity-space assertion, `home_team_id = series.winner_team_id` counted over the NBA/BAA game-7 rows, which must equal the score-derived 117 (P2-3); the probe prints `# paste into …csv:<line>` beside each answer so the owner is not hunting rows by eye (P2-5); both winner-consistency guard messages now say the drift they report predates `00016`, and `docs/CURRENT_DATA_MODEL.md` carries the two pre-apply measurements the owner takes — archive coverage and AD-4 invariants — so a guard abort is never the first time anyone looked (P2-6); `.gitattributes`' comment rewritten to what `git ls-files --eol` actually shows, including the renormalize churn the new pattern owes 14 untouched migrations (P2-8); the self-referential coherence assert deleted in favor of a printed mode line, with the enforcement left in the pre-flight that the drill fired on purpose (P2-9); Story 2.9's read-path prerequisite written into `epic-2-context.md`'s dependencies and onto its `sprint-status.yaml` line, and `CURRENT_DATA_MODEL.md` declared the authoritative boundary statement that the other two point at (P2-10, P2-11); `deferred-work.md`'s stale `~97 / ~63` replaced by the measured 98/62 with the reason, and the probe's duplicated seed regex filed with a home in the curation commit (P2-7's non-frozen half, P2-12).

**The owner's first probe run (2026-10-01) — D1's live leg, and three findings.** `node scripts/probe-game7-venues.mjs`, 34 seasons, decisive lines verbatim:

```
seasons asked: 34 (1992-93 → 2025-26)
=== 1992-93 — FAILED — game 0049200018: unknown team abbreviation "CHH" — not in the teams table. …
=== 1993-94 — FAILED — game 0049300024: unknown team abbreviation "GOS" — …
=== 1994-95 — FAILED — game 0049400009: unknown team abbreviation "UTH" — …
=== 1995-96 — FAILED — game 0049500007: unknown team abbreviation "SAN" — …
=== 1998-99 — FAILED — 0 completed Game-7 series answered by the feed
2003,DAL,POR,DAL        # paste into supabase/scripts/pipeline/data/game7_venues_curated.csv:139
2016,CLE,GSW,GSW        # paste into …:178
2026,SAS,OKC,OKC        # paste into …:215
Game-7 venue lines printed: 78
curated NBA/BAA rows answered by this run: 78 (of which venue still blank: 78)
curated NBA/BAA rows still blank this run did NOT answer: 82
PROBE INCOMPLETE — 10 season(s) could not be answered: 1992-93 … 2001-02
```

1. **Four feed codes the `teams` table does not hold — `CHH`, `GOS`, `UTH`, `SAN` — aborted nine seasons** including their clean Game-7 answers, costing 20 of the 98 rows D6 expected (78 answered + 20 = 98, verified by counting the blank list). The adapter's refusal is correct for the pipeline, which would have to write into a `REFERENCES teams(id)` column; the probe writes nothing, so it now maps such a code to a private negative id that can never match a curated pair, prints the raw code in the unmatched report, and keeps the season's other answers.
2. **`1998-99 — 0 completed Game-7 series` was a false alarm of mine.** The curated file holds **no 1999 row at all** (verified), so the feed and the archive agree; failing the run on that is the instrument crying wolf. `classifySeason` now separates route silence (`empty-feed`, a real depth blocker), a season the archive says had a Game 7 that the feed did not answer (`missing-game7`, a genuine disagreement), and agreement (`no-game7` — printed as "agrees", not a failure). Both decisions live in `venueBackfill.ts` under tests, because the network leg is owner-run and nothing else can execute them.
3. **CSV line 215 — the 2026 Finals row appended by inference — is answered, and its inferred slot order is wrong.** The probe printed `2026,SAS,OKC,OKC`: winner **SAS**, Game 7 hosted at **OKC**, while the file reads `2026,OKC,SAS,NBA,`. Nothing in the migration depends on the CSV's slot order (resolution is by unordered pair and `winner_team_id` is read from the table), so this is safe — and it is direct evidence for the sentence `docs/CURRENT_DATA_MODEL.md` carries, that the 178th series was written by a path that did not use winner-first orientation. The venue for that row is now known: `OKC`.

Also closed by this change: P2-12 (the probe's duplicated seed regex now calls `parseTeamsSeed`, which the test verifies), and D6's remaining-hand-entry route got a tool — `node supabase/scripts/pipeline/venueBackfill.ts --worksheet` prints the still-blank rows as a binary checklist (`csv:  39  1948  BAA  PHW vs SLB  ->  game7_home_team = ____ (one of PHW | SLB)`), because a curated home is always one of the row's own two slots. Hand entry therefore never means transcribing an outside site's abbreviation for a relocated franchise — which is where a hand-built list actually goes wrong — and the worksheet lists exactly **62** rows for the 1948–1992 block.

**The depth drill falsifies D6's premise (owner-run, 2026-10-01, four single-season runs).** The sentinel fix works — 1992-93 now answers instead of aborting, and prints paste targets — and the surprise is how far back the route goes:

```
--season=1992-93 → 1993,SEA,HOU,SEA  # :120 | 1993,PHX,SEA,PHX  # :119           (2 answered, 0 failures)
--season=1987-88 → 1988,BOS,ATL,BOS # :111 | LAL,DAL,LAL # :112 | LAL,DET,LAL # :113
                   1988,LAL,feed:UTH,LAL            ← curated :114 is 1988 LAL vs UTA
--season=1975-76 → 1976,CLE,WAS,CLE                ← curated :88  is 1976 CLE vs WSB
                   1976 feed:GOS vs PHX, home GOS  ← curated :91  is 1976 PHX vs GSW
--season=1962-63 → 1963,BOS,feed:CIN,BOS           ← curated :51  is 1963 BOS vs CNR
                   1963,LAL,feed:STL,LAL            ← curated :52  is 1963 LAL vs SLH
```

**The feed answers 1962-63.** So the 62-row "hand-enter from basketball-reference" block D6 assumed is not a depth limit at all — it is a **naming** limit, and a small one: seven codes so far (`CHH`, `GOS`, `UTH`, `SAN`, `CIN`, `STL`, `WAS`) where the feed names a franchise one way and `teams` holds it another (`CIN`↔`CNR` Cincinnati Royals, `STL`↔`SLH` St. Louis Hawks, `WAS`↔`WSB` Washington Bullets, `GOS`↔`GSW`, `UTH`↔`UTA`, `SAN`↔`SAS`). In every case above the *series* is still identifiable — the year matches, one side matches a curated slot exactly, and the unmapped code occupies the other slot, which is a derivation from the archive's own data rather than a guess about history. Only the venue abbreviation is blocked, and only for `GOS` (where the home team is the unmapped side). Consequences to settle with the owner: D6's reference route may be unnecessary, the probe's unmatched hint ("archive growth or a key mismatch") was mislabouring these rows and now names the era-code case, and whether the mapping lives in a committed, auditable alias table is an architecture question this story shouldn't answer silently.

**Option A implemented (2026-10-01, owner's choice) — and verified against the real files, not a fixture.** `venueBackfill.ts` gained `parseTeamsSeed`/`EXPECTED_TEAM_COUNT`, `classifySeason`, `parseFeedAliases`, `matchSeasonFeedSeries` and `resolveFeedCode`; `--worksheet` prints the blank rows as a binary checklist; the probe loads the alias table (refusing to run if it cannot), resolves each season in raw-code space, prints the **curated** row's own slots with the answer appended, flags a home that resolves outside the matched row's two slots instead of printing it, separates proposals from unresolvables, and reports winner inversions against the curated slot order. Run against the committed curated CSV and the committed `00005`+`00007` seed, the three seasons the owner drilled resolve exactly as their output predicted:

```
aliases loaded: CIN->CNR, STL->SLH, WAS->WSB, GOS->GSW, UTH->UTA
1963 matched: 51:BOS/CNR via CIN 52:LAL/SLH via STL | unmatched: 0
1976 matched: 88:CLE/WSB via WAS 91:PHX/GSW via GOS | unmatched: 0
1988 matched: 112:LAL/DAL 113:LAL/DET 111:BOS/ATL 114:LAL/UTA via UTH | unmatched: 0
```

The 1988 line is the rule earning its keep: three curated rows hold `LAL` that year, and `LAL/UTH` resolves only because the direct pass claimed the other two first. `2017 BOS/WAS` is the mirror case — it matches directly and is therefore never re-read as the 1970s Bullets. Both are pinned by tests, as are the refusals: a pair needing two substitutions stays unmatched, and a series reachable through two aliases raises instead of choosing. Gate green at 320 tests; the throwaway rehearsal still exits 0 with 60 `ok` lines.

What this does **not** claim: the probe's own print loop is still executed only on the owner's machine — `scripts/**` is invisible to all four gate steps, Biome's `files.includes` skips it even when asked directly (`npx biome lint scripts/…` reports "No files were processed"), and its verification here is `node --check` plus the matcher tests underneath it. The next full run is the first real exercise of that glue.

**The full sweep, transcribed (owner's run 2026-10-01, then the agent's paste).** `node scripts/probe-game7-venues.mjs` over 34 seasons:

```
Game-7 venue lines printed: 97
curated NBA/BAA rows answered by this run: 97 (of which venue still blank: 97)
curated NBA/BAA rows still blank this run did NOT answer: 63
=== 1998-99 — FAILED — the route returned no series at all …
# proposed alias rows (1) — CHH → CHA for 2001 MIL vs CHA (csv:135)
# curated slot order disagrees with the feed's winner (1) — csv:215 OKC vs SAS
```

All 97 answers were transcribed into `game7_venues_curated.csv` by script, not by hand, each one refused unless its own line reproduced the year and unordered pair the probe printed, its venue was one of that row's two slots, the slot was previously blank, and the row was not ABA — **97 written, 0 refused**. Spot-verified after: `1993,SEA,HOU,NBA,SEA`, `2016,CLE,GSW,NBA,GSW` (a road Game 7, so one of the ~43 the migration will swap), `2026,OKC,SAS,NBA,OKC`; the 18 ABA rows are still blank; `--check` still refuses, now naming **63** blanks; the rehearsal and the gate are green (320 tests).

**Why 63 remain, and it is not depth.** The sweep only ever asked 1992-93 → 2025-26, so the 62 pre-1993 rows were never requested — while the owner's own `--season=1962-63` drill had already answered that era. The loop therefore starts at **1946-47** now (the archive's oldest row is the 1948 BAA tiebreaker), seasons the route cannot answer report as `empty-feed` rather than passing silently, and the code list at the tail filters out codes an approved alias already covers, which had been reporting `UTH` as unheld while `UTH->UTA` sat in the table. The 63rd row is csv:135's `CHH`, which needs the owner's approval of `CHH -> CHA` — proposed with evidence, deliberately not applied by the agent.

**Two things the sweep raised that are not venue questions.** The 2026 Finals row is confirmed inverted against the curated convention — the feed says SAS won a Game 7 hosted at OKC, while the file holds OKC in the winner-first slot — exactly the divergence `CURRENT_DATA_MODEL.md` asserts for that row, now with source evidence; the migration reads the winner from the table and matches unordered, so nothing depends on it. And 1998-99 answering with **no series at all** sits oddly beside an archive that holds no 1999 Game 7 either: the two agree, but a whole empty postseason is the kind of thing to check once against a reference rather than accept, because nba.com's published 160 Game 7s is the denominator this file is being built to match.

**Owner's confirmations, applied (2026-10-01 evening).** Three things settled by the owner, one of them against an independent table:

- **`CHH → CHA` approved** and appended to the alias table, with csv:135's venue filled from the same evidence the owner cited (May 20, 2001, Bradley Center: Charlotte 95 at Milwaukee 104 → `2001,MIL,CHA,NBA,MIL`). The next sweep should reproduce that answer from the feed; if it does not, the mapping or the parse is wrong, and that is a finding rather than a detail.
- **The 178th row is the 2026 conference finals, not the Finals** — San Antonio won at Oklahoma City. The file's row is now `2026,SAS,OKC,NBA,OKC`, and its provenance comment plus `docs/CURRENT_DATA_MODEL.md` and `spec-2-5` carry the correction. The venue was never at risk (resolution is by unordered pair); what was wrong was a slot-order inference the probe had already surfaced as a winner inversion.
- **1998-99's empty postseason is corroborated, not a feed failure** — the owner's own dataset has the same gap. The row count is unaffected (the archive holds no 1999 Game 7), so `classifySeason` still naming that season loudly is the instrument doing its job on a data shape nobody assumed.

**A cross-check worth recording, because it is the first independent grade of the whole route.** The owner supplied three Game 7s from their own reference; the feed-and-alias answers already in the file match all three — `1998,CHI,IND,…,CHI` (United Center), `2000,LAL,POR,…,LAL` (Staples Center), `2000,NYK,MIA,…,MIA` (American Airlines Arena, 83–82). Three for three on rows the feed reached through *different* paths, one of them the 1997-era code space. State of the curated file now: **98 of 160 venues filled, 62 blank**, all 62 in the 1948–1992 block the widened sweep has not yet been run over.

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
0. **Archive-growth rule (D5 — the pinned counts stay pinned by choice, so this step is the route out):** the CSV covers the archive as measured 2026-10-01 (178 rows). Before emitting, re-measure the live archive (owner-run; the agent never reads production) and append any series newer than the CSV's last row — every new series needs a curated row and, if NBA/BAA, a curated Game-7 venue — **and change `EXPECTED_NBA_BAA` / `EXPECTED_ABA` / `EXPECTED_GAME7_HOME_WINS` in `venueBackfill.ts` in that same commit**, since they are literals by design and the guards read them. A series the CSV does not cover makes `league_backfill_complete` or `venue_coverage` abort the `db push`, and both messages name this step. No committed tool produces the `(year, team pair)` list the comparison needs: `scripts/spike-2-1/audit-unique-key.mjs` prints counts, duplicate groups and the round domain, and `scripts/probe-game7-venues.mjs` reports curated-row mismatches only for the seasons it asks about (1992-93 → 2025-26), so the growth check is a count against the CSV's 178 rows and the two instruments' mismatch lists, not one command.
1. `node scripts/probe-game7-venues.mjs` fills the modern block — **98 of the 160** NBA/BAA rows fall in calendar years ≥ 1993, which is what its season iteration covers (D6). The remaining **62** (1948–1992, including the single BAA row, plus every ABA row which stays blank by scope) are hand-entered by the owner from **basketball-reference.com** (D6); each probe line prints the CSV `file:line` to paste into.
2. `node supabase/scripts/pipeline/venueBackfill.ts` — emits `00016`; then bump `COVERED_THROUGH` 15→16
   in `scripts/rehearse-migration-00014.mjs` in the same commit, and let that commit replace the
   "slots, not venues" paragraphs of `docs/CURRENT_DATA_MODEL.md` with the post-`00016` boundary
   (standing same-commit rule). The rehearsal now treats a `00016` on disk with the ceiling still at
   15 as a hard failure, so emit and ceiling bump genuinely share a commit.
3. `node scripts/rehearse-migration-00014.mjs` (must print the ordered replay including 00016 — the
   fixture archive is seeded inside that loop immediately before the file — plus the committed-mode
   section: guard tampers over the committed text, `--check` green on the committed pair, census
   159/1/18 + 117 — and exit 0).
4. `npx supabase db push` — the apply stays the owner's explicit action.
If the census lands 116 or 118: resolve WHICH in writing (mis-curated row vs. the published as-of date
excluding the 2026 Finals) — relaxing or deleting the guard is not an acceptable resolution.

## Spec Change Log

**Loopback 1 (2026-10-01, review pass 1 → `review_loop_iteration` 1).** Triggered by E1 + E2 (both `high`, `bad_spec`): the spec described the rehearsal as seeding the fixture archive *inside the ordered replay, immediately before `00016`*, then the D2 edit rewrote that bullet into a standalone section-5 self-test without touching the deferred AC that still reads "`00001`–`00016` apply in filename order → exit 0". The two cannot both hold — section 1 replays every file in `supabase/migrations/`, so the emitted `00016` is applied to the 8-series replay table and aborts. E2 is the same blind spot one layer on: the spec said "`--check` proves CSV↔migration agreement" but never named who runs it, so agreement is currently asserted only by tests over injected IO and by a temp render of the generator's own output.

**Amended 2026-10-01 once E7 was answered (owner: NBA/BAA combined = 160 → recorded as D4 inside the frozen block, and the impossible triple corrected with a pointer in all four sites that carried it — `epics.md` Story 2.8's AC and Story 2.7's AC, `sprint-change-proposal-2026-10-01.md` §5's reproduced AC, `epic-2-context.md`'s pinned facts). The Code Map, Tasks and Verification now carry the design the two `high` findings require:**
- The certified ordered replay must seed the fixture archive **before** applying the file whose guards need it, and section 5's `!migrationOnDisk` assertion becomes state-aware (`!migrationOnDisk || COVERED_THROUGH >= 16`) so the curation commit can pass it.
- A `00016` present above `COVERED_THROUGH = 15` is a failure, not a warning — emit and ceiling bump share a commit or neither is certified.
- The committed-pair drift check runs from a normally-executed path (the rehearsal, and/or a `verify-build-base.mjs`-style step in the gate), and the comparison normalizes line endings first — `core.autocrlf=true` here with `eol=lf` pinned only for the hook would otherwise make `--check` red at line 1 for every fresh checkout.
- The handover must state the archive-growth rule: re-measure the live archive and append any series newer than the CSV **before** emitting, or `league_backfill_complete` aborts the owner's `db push` for a reason no rehearsal can show.

**KEEP — what worked and must survive re-derivation:** the generator owns the single copy of `00016` and refuses to emit while any NBA/BAA venue is blank (verified: exit 2, names the 160, writes nothing); the CSV's four derived columns and the 178/160/18/1 split; the three-case orientation rule with case-3 abort as the 178th-series protection; the nine raise-to-abort guards and the synthetic 117/43 self-test assignment that lets every one of them be observed failing; the fixture seeded from the CSV rather than committed as a derived file; `venueBackfill.ts` living under `supabase/scripts/pipeline/` so `tsc -b` and Biome actually check it; the venue probe driving the *shipped* adapter through `seasonOverride` and resolving identity only through abbreviations; and the discipline of never letting a census guard be relaxed to make a run pass.

**E7 is not a spec fix — it is an owner answer.** The approved artifacts pin "160 / 1 / 18" (sums to 179); the code, the tests and `docs/CURRENT_DATA_MODEL.md` assert 159 NBA + 1 BAA + 18 ABA = 178 with NBA/BAA = 160. Escalated before any revert.

**Loopback 1 implemented (2026-10-01).** All five unchecked Execution lines landed (E1–E6, E8). D4's triple-correction had already reached `epics.md`, `epic-2-context.md` and the proposal's §5.3 Story 2.8 AC line; this pass swept the proposal's three remaining `160/1/18` shorthand sites (§2.1 table, §2.3 rehearsal bullet, §5.2 Edit-E7 line) with pointers to D4, since E7's verdict named the approved-artifact wording itself as the hazard. The handover gained step 0 (the archive-growth rule the Change Log demanded) and `CURRENT_DATA_MODEL.md`'s 178th-row sentence was reconciled with the curated CSV's winner-first convention (E8). No frozen-block edit, no `00016` emission, no production command; the re-run outputs are recorded in Implementation Notes.

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

**Pass 2 (2026-10-01, same session, after loopback 1).** Three layers on the diff since `5c111e8` (`story-2-8-diff-pass2.patch`, 235 kB / 3,039 lines). The E-numbering continues; **P2- entries are pass-2 routing units.**

| # | Layer / location | Claim (verified bad outcome, or the refutation) | Verdict | Route |
|---|---|---|---|---|
| P2-1 | VG2-1, BH2-6 — `rehearse:211-214, 249, 541-567` | Confirmed and closed in this pass: everything the E1 loopback added runs only when a committed `00016` exists, so it had never executed — the reviewer's demonstration (move the seeding back out of the ordered loop and nothing that runs normally changes colour) is decisive, and it covers the emit path and the real-IO `--check` too. **Executed instead of argued:** the local throwaway drill in `## Implementation Notes` filled the venue column with the deterministic synthetic 117/43, emitted `00016` for real (exit 0), `--check`ed the real pair (exit 0), and ran the rehearsal at `COVERED_THROUGH = 16` → exit 0, 59 `ok` lines, zero SELF-TEST tags, seeding + `applied 00016…` inside the ordered replay, census measured in DB space. All three files restored; the new pairing hard-fail was also fired on purpose and no container leaked. | high | patch — done, with evidence |
| P2-2 | EC2-2/8 — `rehearse:735` `conflictRow = venues[5].row` | Confirmed: index 5 is a keep row only by synthetic construction; against curated data it can be a swap row, whose pre-swapped game-7 row is then a **legal** case-1 keep — the migration applies cleanly and `applyRejected` fails the run with "the guard cannot fail, which is the one outcome that must never be green", i.e. a false alarm at a working guard, at the story's most pressure-loaded moment. Fixed in this pass by property-picking (`keepVenues[0]`, with the census flip taking a different keep row so the two cases never share a series). | high | patch — done |
| P2-3 | EC2-3 — `rehearse:590, 825` slot-space keeps/swaps vs the DB's stored orientation | Confirmed: `keeps`/`swaps` count in the **curated file's** slot order while the census counts in the **stored** slot order, and those differ for exactly the one archived series the loader did not write winner-first — so a curated 43 can measure as 44 and the run goes red over a data fact the migration handles correctly. Fixed: in committed mode the CSV split is reported, not asserted, and the census is re-measured through `series.winner_team_id` (identity) as well as through the scores — a mode-invariant cross-check that both must agree. | medium | patch — done |
| P2-4 | BH2-3/4/5, EC2-4 — `venueBackfill.ts:63-65`, the emitted guards, `rehearse:590-602`, handover step 0 | Confirmed as a cluster and **not resolvable from the code**: `178 / 160 / 18 / 117 / 1,246` are constants interpolated into the migration, asserted by the harness, and hard-checked by `syntheticAssignments`, while handover step 0 tells the owner to "append any series newer than the CSV" before emitting. Following step 0 literally produces a migration whose own `league_backfill_complete` (or a pending Active series at apply time) aborts the apply, and no artifact says who re-derives the constants, from what measurement, or against what tool — the named re-measure path (`scripts/spike-2-1/audit-unique-key.mjs`) prints counts and histograms, never the `(year, team pair)` list a CSV diff needs. Two defensible readings exist (pinned-and-loud-abort vs derive-from-the-table), so this is asked, not assumed. | medium | intent_gap |
| P2-5 | BH2-8 — `probe-game7-venues.mjs:181` prints 4 fields, the CSV row is 5 columns | Confirmed: the paste step is the one irreversible human act in D1 and it is targeted by eye — the owner reads a `year,team_a,team_b,home` line and hunts the matching row. The probe already resolves every answer to a curated row for its coverage report, so the line number is in hand; printing it costs one field and turns a hunt into a directed paste. Fixed in this pass. | medium | patch — done |
| P2-6 | BH2-9 — the two winner-consistency guards | Confirmed: `row_winner_consistency` and `series_winner_game7_consistency` scan all 1,246 rows and every series, including games 1–6 and the ABA rows the migration never writes, and their only evidence here is a fixture whose scores the generator invented. That is deliberate (AD-4 must survive the change) but the handover has no route for the one case it creates: a **pre-existing** production inconsistency aborting `db push` at a guard the owner cannot read as "not my change". Fixed: the guard messages now say the drift predates `00016`, and the handover names the pre-apply measurement that settles it. | medium | patch — done |
| P2-7 | BH2-1/2, EC2-7 — frozen D1's "1993-94 → 2025-26 / ~97 / ~63" vs the shipped probe and the data | Confirmed by counting: the probe starts at season 1992-93, and the curated file splits **98 NBA/BAA rows in calendar years ≥ 1993 / 62 ≤ 1992**. So D1's frozen range and both figures are wrong, `deferred-work.md` repeats them, and my own pass-1 triage row recorded "96" — three stale numbers for one measured fact. The corrected split is written to the non-frozen sites in this pass; **the frozen D1 text and the reference named for the 62-row fallback are the owner's to amend**, so they ride with P2-4. | medium | intent_gap (with P2-4) |
| P2-8 | BH2-11 — `.gitattributes` | Confirmed with `git ls-files --eol`: the attribute now reads `attr/text eol=lf` on all 15 migrations while the **worktree** stays `w/crlf` (attributes bind at checkout), so the comment's "both are pinned to LF in the worktree" is not currently true; and the pattern silently extends to 14 migrations this story does not touch, which will show as whole-file EOL churn whenever anyone renormalizes. The over-claim is fixed here; the churn is recorded where the next reader will meet it. | low | patch — done |
| P2-9 | BH2-7 — `rehearse:550-554` | Confirmed: the "state-aware coherence guard" cannot fail — the `:211` pre-flight already throws whenever a `00016` exists at ceiling 15, so at that line either the file is absent or the ceiling is 16. That is the `assert(label, true)` shape E3 banned, re-introduced one file over, and its `ok` line claims more than it measures. Reduced to what it actually pins (a self-test render must never land in `migrations/`, which the emit-path refusal also enforces); the enforcement stays the pre-flight, whose firing is proven in the drill. | low | patch — done |
| P2-10 | BH2-12 — E9's filing place | Confirmed: the `league`-read-path asymmetry exists only in `deferred-work.md`, while the two places a Story 2.9 session is told to read — `epics.md`'s AC and `sprint-status.yaml`'s bare `2-9: backlog` line — carry nothing. Fixed: the pointer is in `epic-2-context.md`'s dependencies (the epic handoff 2.9 loads) and on the tracker line itself. | low | patch — done |
| P2-11 | BH2-13 (second half) — the post-`00016` boundary paragraph now exists near-verbatim in `epic-2-context.md`, `docs/CURRENT_DATA_MODEL.md` and this spec's Code Map, with no authoritative copy | Confirmed, and it is the same two-copies-must-be-checked failure the generator exists to remove. Fixed by naming `docs/CURRENT_DATA_MODEL.md` the authoritative statement in the other two; the reviewer's first half (the spec's own `status` / stale template line) is a spec-text edit and stays out of the finding set, corrected as a matter of course. | low | patch — done |
| P2-12 | VG2-2 — `probe:88-90` vs the new E5 test | Confirmed: the probe and the test each carry their own copy of the 00005+00007 seed regex, so the test pins its own copy rather than the probe's — gate-invisible drift between two readings of one source. Mitigated hard: the probe throws its own named "seed format drifted" error before any network call if its count is not 59. Deferred with a home rather than fixed twice. | low | defer |
| R11 | EC2-5 — the coverage headline counts curated rows already filled, overstating coverage | Checked the printed lines: the headline is immediately followed by `of which venue still blank: N` and a `still blank this run did NOT answer` list with `file:line` for every one. The overstatement is a label on a number whose precise companions are printed beside it. | false | — |
| R12 | EC2-1 — the emit path should pin 178/160/18 | Checked: a short or long curated CSV cannot pass quietly — `syntheticAssignments` refuses any population ≠ 160, the fixture seeds from the CSV so the harness's 178-row and census asserts go red, and the emitted guards re-check NULL/ABA/coverage against whatever table it applies to. Pinning 178 in the emit path is exactly what P2-4 asks about instead. | low | rejected |
| R13 | EC2-6 — `resolve(process.argv[1])` compared byte-for-byte | Carried from pass 1 (R6): the non-matching case *is* the import case the tests and the harness depend on, so a failure branch would break the contract they use; reachable only by running the file under a deliberately mismatched path form. | low | rejected (carried) |
| R14 | VG2-3 — the probe has no offline execution of its pure helpers | Carried from pass 1 (R10) and unchanged by intent: the probe's first lines are its own loud self-guards and its network leg is owner-run by policy. | low | rejected (carried) |

## Design Notes

Three-case orientation rule for each matched series' game-7 row, which is what makes the rewrite safe on rows the generator did not write:
1. `home_team_id` already = curated home → no change.
2. `home_team_id` = `series.team_a_id` (the canonical `00007` state) → swap teams **and** scores in one statement; Postgres evaluates every `SET` expression against the pre-update row, so the exchange is atomic and `winner_team_id` needs no touch.
3. otherwise → abort naming the series. This branch is the 178th-series protection: the production measurement read `homeAlwaysTeamA = 177 of 178`, so exactly one archived series may already carry a real venue, and a curated list must never clobber it silently.

## Verification

**Commands:**
- `node supabase/scripts/pipeline/venueBackfill.ts --check` -- expected: non-zero this session, naming the 160 blank venues and writing no migration; exit 0 and silence once the CSV is complete and `00016` matches it.
- `node scripts/rehearse-migration-00014.mjs` -- expected: exit 0 with a SELF-TEST banner on every venue line, printed census `159 NBA + 1 BAA + 18 ABA` (combined 160) and `Game-7 home wins = 117`, and each guard's tamper observed as an abort **with the rolled-back state measured afterwards**. Once `00016` is emitted, the same command additionally applies the committed file over the seeded fixture inside the ordered replay and runs `--check` against the committed pair. Requires a running Docker daemon (up and `postgres:16` cached as of 2026-10-01).
- `npm run gate` -- expected: all four pass. State the coverage gap rather than glossing it: `scripts/**` is checked by none of them, so the rehearsal and the probe are verified only by running them.
- Owner-run, never agent-run: `node scripts/probe-game7-venues.mjs` (the venue block) and `npx supabase db push` (the apply, after the curated CSV and the emitted `00016` land).
