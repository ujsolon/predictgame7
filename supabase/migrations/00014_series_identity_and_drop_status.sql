-- =========================================================
-- Predict Game 7 — Series identity key + derived-phase cleanup
-- Migration 00014 (Story 2.2)
-- =========================================================
-- Adds the idempotency key AD-5 (as amended 2026-09-30 by
-- _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-30.md) requires:
-- UNIQUE (year, team_a_id, team_b_id). Measured duplicate-free over all 178 live
-- rows (pre-flight: node scripts/spike-2-1/audit-unique-key.mjs). `round` is
-- deliberately outside the key and ships with no CHECK — (year, round) collides
-- on 19 groups of the live table and the column carries 17 era spellings; the
-- Story 2.4 adapter owns the vocabulary.
--
-- Removes the stored phase vestige entirely — owner decision 2026-09-29 (AD-4):
-- `status`, its CHECK and its DEFAULT 'historical' all go; a series' phase is
-- derived from winner_team_id + series_game_scores from here on. All 178 live
-- rows read 'historical', so there is no data change and no backfill.
--
-- The 00007 five-column index idx_series_identity cannot survive the removal of
-- status, so its drop and the new constraint land in this one migration. The
-- drops are written explicitly rather than relying on Postgres' implicit
-- dependency cascade, so a replayer reads the intent. Replay order is what
-- makes this safe: 00007's ON CONFLICT (…, status) target at :57 resolves at
-- its own point, while the column still exists.

BEGIN;

ALTER TABLE public.series
  ADD CONSTRAINT series_year_team_pair_key UNIQUE (year, team_a_id, team_b_id);

DROP INDEX IF EXISTS public.idx_series_identity;

ALTER TABLE public.series
  DROP CONSTRAINT IF EXISTS chk_series_status;

ALTER TABLE public.series
  DROP COLUMN IF EXISTS status;

COMMIT;
