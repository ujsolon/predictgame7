# Current Data Model

This document summarizes the active Supabase data model used by Predict Game 7 after the normalized Release 1 rollout and legacy table cleanup.

## Active public schema tables

### `teams`
- Canonical franchise records
- Stores:
  - `id`
  - `full_name`
  - `abbreviation`
  - `city`
  - `nickname`
  - `logo_url`

### `series`
- Canonical series records for historical and active Game 7 matchups
- A series' phase is **derived, not stored**: `winner_team_id IS NULL` ⟺ Game 7 pending, `IS NOT NULL` ⟺ archived (AD-4, owner decision 2026-09-29). Migration `00014_series_identity_and_drop_status.sql` (Story 2.2) carries that decision into the schema: it drops the vestigial `status` column with its `chk_series_status` CHECK and its `DEFAULT 'historical'`, drops the `00007` five-column index `idx_series_identity` (which could not survive the column's removal), and adds `UNIQUE (year, team_a_id, team_b_id)` as the constraint `series_year_team_pair_key` — the identity key corrected 2026-09-30 by `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-30.md`, because `(year, round)` alone collides on 19 groups of the live table and `round` ships with no CHECK. The team slots guard the pair **as stored only**: the `team_a` = game-1-home convention is enforced by the pipeline's pre-commit assertion (Story 2.3), not the database.
- **Live schema as of 2026-09-30** (owner ran `npx supabase db push`; measured the same day, `node scripts/spike-2-1/audit-unique-key.mjs` then failed with `HTTP 400 {"code":"42703","message":"column series.status does not exist"}` and the dashboard check reported `series_year_team_pair_key` count 1 / `status` column count 0). `00014` was rehearsed off-production first (`node scripts/rehearse-migration-00014.mjs`, a throwaway Docker Postgres replaying 00001–00014 in order) and pre-flighted over all 178 live rows. **Re-measured post-apply on 2026-10-01** (Story 2.2 review, H2): the audit's select no longer names `status`, and `node scripts/spike-2-1/audit-unique-key.mjs` exits 0 over 178 live rows — `(year, team pair)` duplicate-free with 0 duplicate groups, `(year, round)` still colliding on 19 groups. Consequence to know: `scripts/spike-2-1/audit-archive.mjs` still projects `status` (its subject is the `status` domain section at `:168-171`) and therefore exits red against the live table until Story 2.7 retires that section — that red is the schema change working, not drift.
- Stores:
  - `id`
  - `year`
  - `round` — free text, deliberately ungated (Story 2.2). The archive holds 17 era spellings; the automated adapter writes only the four canonical labels `First Round` / `Conference Semifinals` / `Conference Finals` / `NBA Finals`, derived by chain depth in `supabase/scripts/pipeline/adapters/rounds.ts` (Story 2.4) and scored 1/2/3/4 by `getRoundImportance`. A `manual_csv` row carries whatever the operator's CSV says.
  - `team_a_id`
  - `team_b_id`
  - `winner_team_id`
- Identity: `UNIQUE (year, team_a_id, team_b_id)` (`series_year_team_pair_key`) — the upsert conflict target the Epic 2 pipeline upserts against. The archive read is `.not('winner_team_id','is',null)`; nothing may branch on a stored status.
- Write path (Story 2.3, migration `00015_pipeline_series_functions.sql`): rows are created and completed only through the two `SECURITY DEFINER` RPCs below, called by `supabase/scripts/pipeline/` with the service-role key. No writer sets `id` (server-generated `gen_random_uuid()`), and no writer can address `status` — the column is gone.

### `series_game_scores`
- One row per game within a series
- Stores:
  - `id` (UUID, server-generated)
  - `series_id`
  - `game_number`
  - `home_team_id`
  - `away_team_id`
  - `home_score`
  - `away_score`
  - `winner_team_id`
  - `created_at` (pipeline write timestamp — not a game date; nothing user-facing may derive from it, AD-4)
- Conflict target: `UNIQUE (series_id, game_number)` (`unique_series_game`, `00005:55`) — the pipeline's scores key. `series_id` cascades on delete.

## Pipeline write functions (`00015`, Story 2.3)

Two `SECURITY DEFINER` functions with `search_path` pinned; `EXECUTE` granted to `service_role` only, revoked from `public`/`anon`/`authenticated`:

- `pipeline_birth_series(year, round, team_a_id, team_b_id, scores jsonb) → uuid` — AD-4 atomic birth: asserts in SQL that the pair is absent **in either slot order** (AD-5's identity rule, which the UNIQUE cannot enforce), that `scores` is exactly the six decided games `{1..6}` split 3–3, then writes the `series` row (`winner_team_id NULL`) plus its six `series_game_scores` rows in one call. `ON CONFLICT` on both keys lives inside the function, so a racing identical run lands nothing new and returns the existing id.
- `pipeline_complete_series(series_id, game jsonb, winner_team_id) → uuid` — AD-4 atomic completion: asserts the pending row is a certified 3–3 and game 7 is a decided game between the slots whose winner matches the claim, then appends (or repairs) the game-7 row and fills `winner_team_id` in one call — both statements land, or neither does. A stored row that already disagrees with the request is rejected: an archived outcome is never rewritten.

Rehearsal runs off-production: `node scripts/rehearse-migration-00014.mjs` replays 00001–00015 in a throwaway Docker Postgres and exercises both functions with `psql` (named parameters — `client.rpc` binds by name, so the payload keys are `p_year`, `p_scores`, …). The owner holds the production apply command (`npx supabase db push`), as with 00014. **`00015` was applied to production on 2026-10-01** (owner-run `npx supabase db push`, after the rehearsal above went green — exit 0, 28 assertions). Confirming from this repo needs a service-role or dashboard read, because `EXECUTE` is revoked from `anon`/`authenticated`; the dashboard SQL that settles it is `SELECT proname, prosecdef, has_function_privilege('service_role', oid, 'EXECUTE') AS svc, has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE proname LIKE 'pipeline_%'` — expect two rows, `prosecdef = true`, `svc = true`, `anon = false`. **Measured 2026-10-01 in the dashboard SQL editor: exactly that** — both functions present, `prosecdef: true`, `svc: true`, `anon: false`, so `00015`'s bodies exist on production and the revocation held there, not only in the replay. An anon `POST /rest/v1/rpc/pipeline_birth_series` with `{}` also discriminates without any write risk (42501 permission denied = applied; PGRST202 = not applied; and the function's first statement raises on a NULL argument, so even an authorized empty call cannot write) — not run here, because reading the key out of `.env` to call production is blocked for agents by policy.

### `prediction_methods`
- Catalog of supported prediction methods
- Stores:
  - `slug`
  - `name`
  - `description`
  - `is_active`

### `predictions`
- Structured prediction storage for normalized model workflows
- Stores:
  - `series_id`
  - `method_id`
  - `prediction_type`
  - `prediction_statement`
  - `probability`
  - `confidence_level`
  - `input_scores`
  - `model_parameters`
  - `contributing_factors`
  - `metadata`

### `insights_cache`
- Cached insight payloads used by the Insights page

### `contact_submissions`
- Stores messages submitted through the site contact form

### `profiles`
- User profile records tied to `auth.users`

## Archived legacy tables

The following legacy tables are no longer part of the active `public` schema and are moved into the `archive` schema to reduce clutter while preserving recovery options:

- `archive.game_sevens`
- `archive.current_game_sevens`
- `archive.model_parameters`
- `archive.team_logos`

## Legacy loader retired (Story 2.3, Decision 4)

`supabase/scripts/load-games/main.py` — the old spreadsheet loader — was deleted, not repaired: it blind-inserted into `game_sevens`, a table `00013` moved to `archive` and nothing reads, and its winner-oriented row shape (no home/away) is the wrong one for the current schema. Its `venv/` was never tracked (`.gitignore` has excluded `venv` and `data` all along), so the deletion was of the one tracked script plus `requirements.txt`; the directory is now gone entirely. The source spreadsheet it read, `NBASeriesResults.xlsx`, **is** in the repo — moved to `docs/NBASeriesResults.xlsx` (2026-10-01) for provenance, where nothing reads it. Its successor is the pipeline runner under `supabase/scripts/pipeline/`, whose `manual_csv` adapter reads the committed operator file `data/series_manual.csv` (long format, one row per game; header-only — and therefore a zero-write plan — outside a playoff window), with `data/series_manual.example.csv` beside it showing the row shape. That adapter is the spreadsheet floor of the `SeriesDataSource` port — see `_bmad-output/implementation-artifacts/seriesdatasource-port.md`.

### The archive carries slots, not venues — and slot `a` is the series winner

Measured on the live table 2026-09-30: in 177 of the 178 archived series, **every one of the seven score rows names the same team as `home_team_id`** — the series' `team_a_id`.

**Corrected 2026-10-01 from the source data: that `team_a_id` is the series *winner*, not game 1's home team.** The measurement above is real but was read backwards, and the correction is mechanical rather than statistical — it comes from the archive's own ancestry, which is committed:

- The source spreadsheet `docs/NBASeriesResults.xlsx` is **winner-oriented**. Its 22 columns are `Year, League, Series Type, Winner Team, Winner Games, Loser Team, Loser Games, Total games`, then G1–G7 scores for the winner and the loser. **There is no home/away column anywhere in it.**
- The retired loader mapped that orientation straight into the slots: `team_a = "Winner Team"`, `team_b = "Loser Team"`, and passed `home_team = None` (`git show 5b518ef~1:supabase/scripts/load-games/main.py`, deleted in Story 2.3).
- `00007_backfill_missing_historical_series.sql:129-204` then wrote `home_team_id = team_a_id` for **all seven** games of every historical series.

So for every archived series `home_team_id` **is** the series winner, on game 7 included. Two consequences, both load-bearing:

1. `scripts/spike-2-1/audit-slot-semantics.mjs:55` compares game 1's `home_team_id` to `team_a_id` — a question 00007 answers before the audit runs. The "`team_a_id` = game 1's home team in 178/178" line recorded in `decision-2-1-q-4-data-source.md:85-87` and `sprint-change-proposal-2026-09-30.md:30` is therefore **not a measurement of the archive**; it restates the backfill's own SQL. The same audit's `winner_is_A` tally (177/178) was the live-table evidence that pointed the other way, and it is now explained.
2. Any whole-table "home team won Game 7" statistic over the archived rows computes to **exactly 100%**, by construction, and is meaningless. The NBA's published figure is 117-43 (.731). A home-court metric needs real venues, which this table does not contain.

### The archive's league composition, and its reconciliation to the published count

The spreadsheet carries a `League` column that the loader **dropped** — no `series` row records which league it came from. Reading it directly (rows with `Total games = 7`) gives the archive's composition, and it reconciles to the published NBA figure exactly:

| Source | Game-7 series | NBA | BAA | ABA |
|---|---|---|---|---|
| `docs/NBASeriesResults.xlsx` | **177** | 158 | 1 | 18 |
| Live `series` table (measured 2026-09-30) | **178** | — | — | — |

The sheet stops at the 2026 conference semifinals and has no 2026 Finals row, which accounts for the live table's one extra series (the 2026 Finals Game 7), and makes the archive **159 + 1 = 160 NBA/BAA Game 7s plus 18 ABA Game 7s**. nba.com's "Facts to know about Game 7 matchups" (updated 2026-05-31) states 160 Game 7s in NBA history — the NBA counts BAA 1946-49 as its own, and excludes the ABA. So nothing is missing from the archive and nothing in it is spurious: **178 − 18 ABA = 160**, and every one of the 18 ABA series is identifiable from the sheet (1969–1976, listed with year/round/matchup). The 1 non-uniform series flagged by the 2026-09-30 measurement is, on this evidence, that same 178th row — written by a path outside 00007's winner-first backfill, so its **stored** slots need not follow that convention. The curated CSV nonetheless holds that row winner-first like every other row (`2026,OKC,SAS` — from the owner-pinned flagship record, `spec-2-8` Known limits); the two statements are reconciled by the design, not by a data rewrite: series resolution in `00016` is by **unordered** pair, `league` comes from the row's own column, and the orientation guard's case 3 aborts rather than clobbering a game-7 row that already carries a real venue.

**Still true and still respected by the pipeline:** the archived rows hold no venue information; an adapter that supplies genuine venue data cannot reconcile a historical series, and the runner's "never rewrites archived games" guard refuses the attempt by design.

**Resolved 2026-10-01 (Story 2.4, Decision 11, owner call 2A): the archive is frozen — option (a).** No automated adapter re-ingests historical seasons; the venue/slot mismatch above stays as measured and is handled by never testing it, not by repairing it. Enforcement is by FETCH SCOPE, not a stored flag: the `nba_com` adapter asks for the one postseason derived from the run's UTC date (`--season=` overrides for drills), so **a year the table already holds cannot be re-fetched** — that is the whole of what construction guarantees, and it is worth stating precisely, because the freeze does not stop *new* archive rows arriving: a series decided inside the fetched season enters the plan as fresh archive data with no drill involved, which is the pipeline working as intended. If a `--season=` drill is aimed at an archived year anyway, Story 2.3's archive guard (`plan.ts:382-390`: identical source → skip, disagreeing source → non-zero abort naming the series) is the enforcement point and refuses the rewrite — and because the archived rows predate the slot/venue boundary above, a drill that reaches back through `manual_csv`-sourced years is expected to hit that guard's abort rather than reconcile the two venue conventions. The freeze is deliberately not derived from any stored date or timestamp (AD-4 forbids phase from dates). Series created from here on carry real venues — both adapters supply game-true home/away — so the table's venue/slot split has a hard boundary at the last archived year.

**The freeze stands as written, but its premise is now known to be wrong** (see the correction above): the archived slots are winner-first, not game-1-home, so the boundary being protected is not a venue convention the archive got right. As of 2026-10-01 the owner has accepted a one-time lift of it — backfilling the **Game 7 home team only**, for the 160 NBA/BAA series, from a single hand-curated source, together with a `league` column carrying three values (`NBA` / `BAA` / `ABA`) — on the condition that it ships as a course correction with its own migration and rehearsal, not inside an insights story.

### Story 2.8 status (2026-10-01): machinery complete, venues pending — the boundary `00016` will enforce

The Story 2.8 machinery is committed; the data is not, and the distinction is load-bearing. What exists: `supabase/scripts/pipeline/data/game7_venues_curated.csv` (178 rows — `year,team_a,team_b,league,game7_home_team`; the four derived columns restored from `docs/NBASeriesResults.xlsx`, the 178th row — the 2026 Finals Game 7 — from the owner-pinned flagship record; `game7_home_team` **blank on all 160 NBA/BAA rows pending owner curation**, blank-legal on the 18 ABA rows by scope), and `supabase/scripts/pipeline/venueBackfill.ts`, the generator that owns the single copy of migration `00016`: it **refuses to emit** (non-zero exit, naming the 160 blanks) while any NBA/BAA venue is blank — the missing data is an instrument that cannot pass, not a comment — plus a `--check` mode that byte-compares CSV against migration in either direction. `scripts/probe-game7-venues.mjs` is the owner-run curation route (D1); hand entry is the fallback; no agent-drafted venue list is authorized. The rehearsal (`scripts/rehearse-migration-00014.mjs` section 5) proves the whole guard set against a **fixture archive of the real shape** (178 series × 7 game rows) using the generator's deterministic synthetic 117/43 assignment — every guard observed failing under a tamper, the clean run printing census 159 NBA + 1 BAA + 18 ABA, NULL 0, Game-7 home wins 117 — so no real venue value asserted below is certified by this session; the fixture's venues are synthetic until curation lands.

**The post-`00016` boundary, stated so no later reader repeats the falsified measurement:** `series.league` ∈ {`NBA`,`BAA`,`ABA`} (`NOT NULL DEFAULT 'NBA'`, CHECKed, added nullable → backfilled → constrained in that order); the game-7 row of each of the **160 NBA/BAA** archived series carries the real home and away sides **with `home_score`/`away_score` swapped alongside their teams** (~43 rows), `winner_team_id` never written; **`league IN ('NBA','BAA')` is the definition of "this Game-7 venue is real"** — no separate flag; games 1–6 venue data stays unknown permanently; the 18 ABA game-7 rows stay winner-fiction as archived; no statistic may read `home_team_id` from any archived game other than game 7 of an `NBA`/`BAA` row.

**Until the owner curates the venues and applies `00016`** (`npx supabase db push`, after the curation commit raises the rehearsal's `COVERED_THROUGH` to 16): no database anywhere has a `league` column, every archived game-7 `home_team_id` is still the series winner, and **no home-court statistic may be computed from archived rows** — that sentence still describes the live table as of this writing. This section is the **authoritative** statement of that boundary; `epic-2-context.md` and `spec-2-8`'s Code Map point here rather than competing with it.

**Two pre-apply measurements the owner runs, because `00016`'s guards will abort on them and neither is 00016's doing.** First, **archive coverage**: the migration's `league_backfill_complete` and `venue_coverage` guards require every stored series to have a curated row, and the expected counts (178 / 160 / 18 / 117) are **pinned literals by owner decision (`spec-2-8` D5) rather than derived from the table** — the choice is that a drifted archive must stop the apply loudly instead of quietly re-scoping a statistic. So if the live table has grown since this file was cut — the pipeline keeps completing series, and an Active series with a NULL winner also has no curated row — the apply stops, and the route out is to re-measure it, append the newer rows to the curated CSV **and change the constants in `venueBackfill.ts` in that same commit**. Neither committed tool does the whole comparison: `scripts/spike-2-1/audit-unique-key.mjs` prints counts, duplicate groups and the round domain — never the `(year, team pair)` list — and `scripts/probe-game7-venues.mjs` reports curated-row mismatches only for the seasons it asks about (1992-93 → 2025-26). Second, **AD-4's invariants over the whole table**: `row_winner_consistency` and `series_winner_game7_consistency` scan all 1,246 rows and every series, including games 1–6 and the ABA rows the migration never writes, so a failure there is *pre-existing* drift surfacing at the first table-wide check this repo has ever run — the guard messages say so, and the measurement belongs before `db push`, not after a rolled-back apply. Venue curation itself splits 98 rows answered by that probe against **62 hand-entered from basketball-reference.com** for 1948–1992 including the single BAA series (`spec-2-8` D6).

## Current app usage

The current app and edge functions actively read from:

- `teams`
- `series`
- `series_game_scores`
- `insights_cache`
- `profiles`
- `contact_submissions`

The prediction edge function also reads `teams` for logo resolution.

## Notes

- The app now uses normalized team and series relationships instead of the old flat legacy series tables.
- Team logos are sourced from `teams.logo_url`.
- Legacy archived tables are preserved for rollback, audit, or one-off recovery work, but are not part of normal runtime reads.
