-- =========================================================
-- Predict Game 7 — Insights cache refresh RPC
-- Migration 00017 (Story 2.5, owner decisions U1–U13)
-- =========================================================
-- One `SECURITY DEFINER` function recomputes all three cached patterns from
-- `series` / `series_game_scores` and writes all three `insights_cache` rows
-- in ONE statement, so the AC "all three keys, or none" is literally true —
-- copying 00015's one-statement-either-lands-or-fails pattern. There is no
-- client path that can leave the page showing two fresh cards and one stale
-- one (`writer.ts` makes exactly one `.rpc()` call).
--
-- Population (frozen decision, league-filtered — the same rule for all three
-- cards): archived series (`winner_team_id IS NOT NULL`, AD-4 — derived,
-- never stored) AND `league IN ('NBA','BAA')` AND the game-7 row
-- (`game_number = 7`). The league filter IS the "this Game-7 home_team_id is
-- a real venue" marker (00016 rewrote the game-7 row of every NBA/BAA archived
-- series to the real venue; the 18 ABA rows stay winner-fiction and are
-- excluded from every card, not just the home-court one). No card reads
-- `home_team_id` from any archived game other than game 7 of an NBA/BAA row;
-- nothing here derives from a date, a season window or `created_at`.
--
-- Key names and JSONB members are the contract `InsightsPage.tsx` declares
-- (`game_6_winner_stats{total_game_sevens, game_6_winners_won, win_rate}`,
-- `home_team_stats{total_game_sevens, home_team_wins, win_rate}`,
-- `avg_point_differential{average, median, max, min}`). `win_rate` is a
-- PERCENTAGE (seed `62.5`, and the page prints `win_rate` then appends `%`),
-- not a fraction; `win_rate`, `average` and `median` round to 2 decimals,
-- `max`/`min` stay integers; median is `percentile_cont(0.5)`, which is the
-- mean of the two middle values on an even count. An empty population writes
-- `total_game_sevens: 0` with zeros alongside — never a division, never NaN.
--
-- `updated_at` is set by this writer (the column has a DEFAULT but no
-- trigger, 00001:66-72); an unchanged archive recomputes byte-equal
-- `insight_value`s while `updated_at` moves — that is AD-5 idempotence
-- narrowed to what is actually invariant (elicitation P7).
--
-- SECURITY DEFINER, search_path pinned. EXECUTE granted to service_role only
-- and revoked from public/anon/authenticated (NFR-S1/AD-8: the pipeline is
-- the only writer; `insights_cache` has no public write policy — 00001:96-99
-- — so service_role stays the sole writer). No argument: nothing a caller can
-- skew, no way to pass a population in.
--
-- The agent never applies this migration; rehearsal runs in the throwaway
-- Docker Postgres (`node scripts/rehearse-migration-00014.mjs`, whose
-- COVERED_THROUGH this story's commit raises 16→17, replaying 00001–00017 in
-- order and then exercising this function — hand-authored fixtures, a
-- real-score fixture from docs/NBASeriesResults.xlsx joined to
-- data/game7_venues_curated.csv, and the idempotence reads), and the owner
-- holds the production apply command, exactly as with 00014/00015/00016.

BEGIN;

-- Guard league_column_present: this story does not run against a table with
-- no `league` column (the I/O matrix row "League/venue columns missing" —
-- fail loudly at migration/rehearsal, never fall back to the winner-as-venue
-- reading). 00016 (Story 2.8, applied 2026-10-02) is a hard prerequisite.
DO $guard$
DECLARE
  v_has_league integer;
BEGIN
  SELECT count(*) INTO v_has_league
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'series' AND column_name = 'league';
  IF v_has_league <> 1 THEN
    RAISE EXCEPTION '00017 guard league_column_present: public.series has no league column — migration 00016 (Story 2.8) must be applied before the insights refresh can exist; computing home_team_stats against the winner-fiction archive is forbidden, not merely wrong'
      USING ERRCODE = '23514';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.pipeline_refresh_insights_cache()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_total integer;
  v_home_wins integer;
  v_g6_winners_won integer;
  v_home_rate numeric;
  v_g6_rate numeric;
  v_avg numeric;
  v_median numeric;
  v_max integer;
  v_min integer;
BEGIN
  -- One population, read once: the game-7 row of every archived NBA/BAA
  -- series. `g6` is LEFT JOINed because the game-6 winner is compared inside
  -- one row pair (slot-invariant); a series without a game-6 row contributes
  -- no game-6 win, which is the honest reading, not a skew.
  SELECT
    count(*),
    count(*) FILTER (WHERE g.home_score > g.away_score),
    count(*) FILTER (WHERE
      (CASE WHEN g6.home_score > g6.away_score THEN g6.home_team_id ELSE g6.away_team_id END)
        = s.winner_team_id),
    COALESCE(round(avg(abs(g.home_score - g.away_score))::numeric, 2), 0),
    COALESCE(round((percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(g.home_score - g.away_score)))::numeric, 2), 0),
    COALESCE(max(abs(g.home_score - g.away_score)), 0),
    COALESCE(min(abs(g.home_score - g.away_score)), 0)
    INTO v_total, v_home_wins, v_g6_winners_won, v_avg, v_median, v_max, v_min
    FROM public.series s
    JOIN public.series_game_scores g
      ON g.series_id = s.id AND g.game_number = 7
    LEFT JOIN public.series_game_scores g6
      ON g6.series_id = s.id AND g6.game_number = 6
   WHERE s.winner_team_id IS NOT NULL
     AND s.league IN ('NBA', 'BAA');

  -- Percentage units (seed convention): 3 of 4 prints 75, never 0.75. The
  -- zero-population branch is not a division — U13 accepts the footer's
  -- honest "0 Game 7s" reading rather than guarding it away.
  v_home_rate := CASE WHEN v_total = 0 THEN 0 ELSE round(100.0 * v_home_wins / v_total, 2) END;
  v_g6_rate := CASE WHEN v_total = 0 THEN 0 ELSE round(100.0 * v_g6_winners_won / v_total, 2) END;

  -- Three rows, one statement: either all land or none does. ON CONFLICT is
  -- the UNIQUE (insight_key) target; `created_at` stays the seed's, which is
  -- correct — the row identity is old, the payload is new.
  INSERT INTO public.insights_cache (insight_key, insight_value)
  VALUES
    ('game_6_winner_stats',
      jsonb_build_object('total_game_sevens', v_total, 'game_6_winners_won', v_g6_winners_won, 'win_rate', v_g6_rate)),
    ('home_team_stats',
      jsonb_build_object('total_game_sevens', v_total, 'home_team_wins', v_home_wins, 'win_rate', v_home_rate)),
    ('avg_point_differential',
      jsonb_build_object('average', v_avg, 'median', v_median, 'max', v_max, 'min', v_min))
  ON CONFLICT (insight_key) DO UPDATE
     SET insight_value = EXCLUDED.insight_value,
         updated_at = now();

  -- The census the run's report line prints — so it states what the server
  -- wrote instead of re-reading the table.
  RETURN jsonb_build_object(
    'total_game_sevens', v_total,
    'home_team_wins', v_home_wins,
    'game_6_winners_won', v_g6_winners_won,
    'average_margin', v_avg
  );
END;
$fn$;

-- Execution surface: service_role only (the pipeline). public/anon/authenticated
-- get nothing; reads stay RLS-governed SELECTs on the table itself.
REVOKE ALL ON FUNCTION public.pipeline_refresh_insights_cache()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_refresh_insights_cache()
  TO service_role;

COMMIT;
