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

### `series_game_scores`
- One row per game within a series
- Stores:
  - `series_id`
  - `game_number`
  - `home_team_id`
  - `away_team_id`
  - `home_score`
  - `away_score`
  - `winner_team_id`

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
