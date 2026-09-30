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
- **Live schema as of 2026-09-30** (owner ran `npx supabase db push`; measured the same day, `node scripts/spike-2-1/audit-unique-key.mjs` now fails with `HTTP 400 {"code":"42703","message":"column series.status does not exist"}` and the dashboard check reported `series_year_team_pair_key` count 1 / `status` column count 0). `00014` was rehearsed off-production first (`node scripts/rehearse-migration-00014.mjs`, a throwaway Docker Postgres replaying 00001–00014 in order) and pre-flighted over all 178 live rows. Consequence to know: the two Story 2.1 spike audits still project `status` and therefore exit red against the live table until Story 2.7 drops that column from their selects — that red is the schema change working, not drift.
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

Rehearsal runs off-production: `node scripts/rehearse-migration-00014.mjs` replays 00001–00015 in a throwaway Docker Postgres and exercises both functions with `psql` (named parameters — `client.rpc` binds by name, so the payload keys are `p_year`, `p_scores`, …). The owner holds the production apply command (`npx supabase db push`), as with 00014. **`00015` was not applied to production as of 2026-09-30** — unlike `00014` (`## series` above), these functions do not exist on the live database yet, so a pipeline apply run will fail on a missing function until the owner pushes it.

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

`supabase/scripts/load-games/main.py` — the old spreadsheet loader — was deleted, not repaired: it blind-inserted into `game_sevens`, a table `00013` moved to `archive` and nothing reads, and its winner-oriented row shape (no home/away) is the wrong one for the current schema. Its `venv/` was never tracked (`.gitignore` has excluded `venv` and `data` all along), so the deletion is of the one tracked script; `data/NBASeriesResults.xlsx` stays in the owner's working tree for provenance but is likewise **not in the repo** — a fresh clone does not carry it, and nothing reads it. Its successor is the pipeline runner under `supabase/scripts/pipeline/`, whose `manual_csv` adapter reads the committed operator file `data/series_manual.csv` (long format, one row per game; header-only — and therefore a zero-write plan — outside a playoff window), with `data/series_manual.example.csv` beside it showing the row shape. That adapter is the spreadsheet floor of the `SeriesDataSource` port — see `_bmad-output/implementation-artifacts/seriesdatasource-port.md`.

### The archive carries slots, not venues

Measured on the live table 2026-09-30: in 177 of the 178 archived series, **every one of the seven score rows names the same team as `home_team_id`** — the series' `team_a_id`. The backfill came from that winner-oriented spreadsheet, so historical rows hold no real home/away information. Consequences the pipeline must respect: an adapter that supplies genuine venue data (Story 2.4's) cannot reconcile a historical series, and the runner's "never rewrites archived games" guard will refuse the attempt by design. `team_a` = game 1's home team is therefore true of the archive only because the archive wrote it that way.

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
