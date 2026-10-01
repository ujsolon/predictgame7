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
  - `round`
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

### The archive carries slots, not venues — and it is frozen

Measured on the live table 2026-09-30: in 177 of the 178 archived series, **every one of the seven score rows names the same team as `home_team_id`** — the series' `team_a_id`. The backfill came from that winner-oriented spreadsheet, so historical rows hold no real home/away information. Consequences the pipeline must respect: an adapter that supplies genuine venue data cannot reconcile a historical series, and the runner's "never rewrites archived games" guard refuses the attempt by design. `team_a` = game 1's home team is therefore true of the archive only because the archive wrote it that way.

**Owner decision (option (a)), 2026-10-01: the archived score rows are frozen.** No story re-normalises the 1,246 historical rows to real venues — that would be a data migration 00015 does not cover and a rewrite of outcomes the product has already published. Option (b) (re-normalising from a trusted source) is rejected, not deferred.

Enforcement point, as shipped by Story 2.4: the freeze is the `nba_com` adapter's **fetch scope**, not a new guard. The adapter fetches the single postseason derived from the run's UTC date (`--season=<YYYY-YY>` overrides it), so a year already in the archive cannot enter the plan; an offseason run plans nothing. The only protection that fires on a disagreement is Story 2.3's existing archive guard in `supabase/scripts/pipeline/plan.ts` — an archived series whose source rows match the table is **skipped**, and one whose source disagrees **aborts the run naming the series**, never a rewrite. That is why a deliberate `--season=2016-17` drill lands on that guard: the flag's help text and `_bmad-output/implementation-artifacts/seriesdatasource-port.md` both say so in plain words, and a test pins the message. There is no `FROZEN_ARCHIVE_YEAR` constant and no date comparison anywhere — reading a row's timestamp to decide anything would break AD-4's derived-phase rule.

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
