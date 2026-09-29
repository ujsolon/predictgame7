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
- A series' phase is **derived, not stored**: `winner_team_id IS NULL` ⟺ Game 7 pending, `IS NOT NULL` ⟺ archived (AD-4, owner decision 2026-09-29). `status` still exists on the live table and is `'historical'` on every row; it is a vestige of the un-cascaded `series_historical`/`series_active` merge and no read path may branch on it. **Owner decision 2026-09-29: the column, its `chk_series_status` CHECK and its `DEFAULT 'historical'` are dropped** by the migration Story 2.2 opens (along with the `00007:42` five-column index over `(year, round, team_a_id, team_b_id, status)`), and the archive query becomes `.not('winner_team_id','is',null)`. That migration has **not been applied as of this writing** — the schema below is the live, unchanged shape, and this paragraph updates when the migration lands (AD-4 requires the same commit).
- Stores:
  - `id`
  - `year`
  - `round`
  - `team_a_id`
  - `team_b_id`
  - `winner_team_id`
  - `status`

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
