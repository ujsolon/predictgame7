# Current Data Model — Summary

This document summarizes the existing data model across the `/supabase` migrations and the TypeScript types in `src/types/types.ts`, plus relevant behavior in the prediction function.

## Overview
The current project stores historical Game 7 series, an active/current table variant, cached insights, model parameters, and team logos. Team names are stored as plain text in most places (not normalized to a teams table). Predictions are produced by a Supabase Edge Function (`predict-game-7`) which may also query `team_logos`.

## Database Tables (from migrations)

### `game_sevens`
- Purpose: historical Game 7 records (one row per completed series)
- Key columns:
  - `id` (uuid PK)
  - `year` (integer)
  - `round` (text)
  - `team_a`, `team_b` (text)
  - `game_1_score_a`, `game_1_score_b` ... `game_6_score_a`, `game_6_score_b` (integer)
  - `game_7_score_a`, `game_7_score_b` (integer)
  - `winner` (text)
  - `home_team` (text)
  - `created_at` (timestamptz)
- Notes: team names stored as text; all scores are stored as separate columns (denormalized per series row).

### `current_game_sevens`
- Purpose: active series representation (appears to mirror `game_sevens` but for active matchups)
- Key columns:
  - `id` (uuid PK)
  - `year`, `round`, `team_a`, `team_b` (text)
  - `game_1_score_*` ... `game_6_score_*` (integer)
  - `predicted_winner` (text)
  - `win_probability_a`, `win_probability_b` (numeric)
  - `home_team` (text)
  - `is_active` (boolean)
  - `created_at`, `updated_at`
- Notes: overlaps substantially with `game_sevens`. This duplication is a current pain point.

### `team_logos`
- Purpose: store logo URLs keyed by team name
- Key columns:
  - `id` (uuid PK)
  - `team_name` (text unique)
  - `logo_url` (text)
  - `created_at`
- Notes: `team_name` is text; logo lookup by exact team name string. If names vary (aliases, abbreviations), lookups can fail.

### `model_parameters`
- Purpose: store tunable model parameters
- Key columns:
  - `id` (uuid)
  - `parameter_name` (text unique)
  - `parameter_value` (numeric)
  - `description` (text)
  - timestamps

### `insights_cache`
- Purpose: cached computed analytics
- Key columns:
  - `id` (uuid)
  - `insight_key` (text unique)
  - `insight_value` (jsonb)
  - timestamps

## Types (from `src/types/types.ts`)
- `GameSeven` — mirrors `game_sevens` fields in TypeScript; uses `team_a: string`, `team_b: string`, numeric score fields, optional `winner`, `home_team` (string|null), optional `is_current`, optional prediction fields such as `predicted_winner`, `win_probability_a`, `win_probability_b`.
- `PredictionInput` — shape sent to prediction function: `team_a`, `team_b`, `game_1_score_a` .. `game_6_score_b`, optional `home_team`, optional `method` and `parameters`.
- `PredictionResult` — shape returned by prediction function and expected by frontend: includes `predicted_winner`, `team_a`, `team_b`, optional `team_a_logo`, `team_b_logo`, `win_probability_a`, `win_probability_b`, `confidence_level`, `contributing_factors`, `computation_time_ms`, optional `method_used`.
- `ModelParameters`, `InsightCache`, `TeamLogo` — TS interfaces that map to corresponding DB tables.

## Prediction Function (`supabase/functions/predict-game-7/index.ts`)
- Accepts a `PredictionInput` JSON body.
- Computes features (game diffs, cumulative_margin, recent_margin, home_advantage, game_6_winner).
- Supports several prediction strategies (logistic regression, Bayes, Elo, exponential smoothing) and returns a probability for team A winning.
- Builds `PredictionResult` with:
  - `predicted_winner` (input.team_a or input.team_b based on probability)
  - `team_a`, `team_b` (echoes the input strings)
  - `team_a_logo`, `team_b_logo` — fetched from `team_logos` by `team_name IN (input.team_a, input.team_b)` (exact string match)
  - `win_probability_a` and `win_probability_b` (rounded percentages), `confidence_level`, `contributing_factors`, `computation_time_ms`, `method_used`
- Notes: logo lookup requires exact team name matches in `team_logos`. If the frontend or DB uses alternate names/abbreviations, logos may be missing.

## Current Pain Points and Observations
- Team names are not normalized: `team_a`, `team_b`, `winner`, `home_team` are plain text strings across tables and types. This leads to alias mismatch issues and missing logos.
- `game_sevens` stores scores in repeated columns (`game_1_score_a`...); this denormalized format makes some queries and transformations harder and duplicates schema logic across `current_game_sevens`.
- `current_game_sevens` duplicates `game_sevens` schema and is a maintenance burden; it's unclear whether it provides necessary semantics beyond `is_current`.
- `team_logos` keys by `team_name` text rather than a `team_id` FK, making it brittle to naming variations.
- Prediction function returns `team_a`/`team_b` as sent — if the request input uses abbreviations only, the PredictionResult will also contain abbreviations (affecting UI which expects full names for logo lookup).

## Quick Recommendations (derived from current state)
- Normalize teams into a `teams` table and reference `teams.id` (integer or uuid) instead of storing repeated text names.
- Replace `current_game_sevens` with `series` that contains `is_current` or `status` to represent active vs historical.
- Normalize game scores into a `series_game_scores` table (one row per game within a series) or migrate score columns into a JSONB scores array if preferred.
- Change `team_logos` to reference `team_id` instead of `team_name`.
- Ensure frontend and prediction inputs consistently use either canonical team IDs or canonical team names — prefer IDs.

## Where to look next
- Migrations: `supabase/migrations/00001_create_game_sevens_tables.sql` and `00003_create_team_logos_table.sql` (these define the current DB schema).
- Types: `src/types/types.ts` (TypeScript interfaces used by frontend and function signatures).
- Prediction function: `supabase/functions/predict-game-7/index.ts` (logic for feature extraction and constructing `PredictionResult`).

---

This summary reflects the current state in the repository and the earlier conversation notes. If you want, I can generate a migration plan and SQL to normalize teams and migrate scores step-by-step.
