-- =========================================================
-- Force backfill of normalized series_game_scores
-- Migration 00006
-- =========================================================

BEGIN;

DELETE FROM series_game_scores;

-- Historical series: games 1-6 preserve legacy team_a/team_b score orientation.
WITH historical_series_map AS (
  SELECT
    s.id AS series_id,
    s.team_a_id,
    s.team_b_id,
    gs.*
  FROM series s
  JOIN game_sevens gs
    ON s.year = gs.year
   AND s.round = gs.round
   AND s.status = 'historical'
  JOIN teams t_a
    ON t_a.id = s.team_a_id
   AND t_a.full_name = gs.team_a
  JOIN teams t_b
    ON t_b.id = s.team_b_id
   AND t_b.full_name = gs.team_b
)
INSERT INTO series_game_scores (
  series_id,
  game_number,
  home_team_id,
  away_team_id,
  home_score,
  away_score,
  winner_team_id,
  created_at
)
SELECT
  hsm.series_id,
  1,
  hsm.team_a_id,
  hsm.team_b_id,
  hsm.game_1_score_a,
  hsm.game_1_score_b,
  CASE WHEN hsm.game_1_score_a > hsm.game_1_score_b THEN hsm.team_a_id ELSE hsm.team_b_id END,
  hsm.created_at
FROM historical_series_map hsm
UNION ALL
SELECT
  hsm.series_id,
  2,
  hsm.team_a_id,
  hsm.team_b_id,
  hsm.game_2_score_a,
  hsm.game_2_score_b,
  CASE WHEN hsm.game_2_score_a > hsm.game_2_score_b THEN hsm.team_a_id ELSE hsm.team_b_id END,
  hsm.created_at
FROM historical_series_map hsm
UNION ALL
SELECT
  hsm.series_id,
  3,
  hsm.team_a_id,
  hsm.team_b_id,
  hsm.game_3_score_a,
  hsm.game_3_score_b,
  CASE WHEN hsm.game_3_score_a > hsm.game_3_score_b THEN hsm.team_a_id ELSE hsm.team_b_id END,
  hsm.created_at
FROM historical_series_map hsm
UNION ALL
SELECT
  hsm.series_id,
  4,
  hsm.team_a_id,
  hsm.team_b_id,
  hsm.game_4_score_a,
  hsm.game_4_score_b,
  CASE WHEN hsm.game_4_score_a > hsm.game_4_score_b THEN hsm.team_a_id ELSE hsm.team_b_id END,
  hsm.created_at
FROM historical_series_map hsm
UNION ALL
SELECT
  hsm.series_id,
  5,
  hsm.team_a_id,
  hsm.team_b_id,
  hsm.game_5_score_a,
  hsm.game_5_score_b,
  CASE WHEN hsm.game_5_score_a > hsm.game_5_score_b THEN hsm.team_a_id ELSE hsm.team_b_id END,
  hsm.created_at
FROM historical_series_map hsm
UNION ALL
SELECT
  hsm.series_id,
  6,
  hsm.team_a_id,
  hsm.team_b_id,
  hsm.game_6_score_a,
  hsm.game_6_score_b,
  CASE WHEN hsm.game_6_score_a > hsm.game_6_score_b THEN hsm.team_a_id ELSE hsm.team_b_id END,
  hsm.created_at
FROM historical_series_map hsm
UNION ALL
SELECT
  hsm.series_id,
  7,
  CASE WHEN hsm.home_team = hsm.team_a THEN hsm.team_a_id ELSE hsm.team_b_id END,
  CASE WHEN hsm.home_team = hsm.team_a THEN hsm.team_b_id ELSE hsm.team_a_id END,
  CASE WHEN hsm.home_team = hsm.team_a THEN hsm.game_7_score_a ELSE hsm.game_7_score_b END,
  CASE WHEN hsm.home_team = hsm.team_a THEN hsm.game_7_score_b ELSE hsm.game_7_score_a END,
  CASE WHEN hsm.game_7_score_a > hsm.game_7_score_b THEN hsm.team_a_id ELSE hsm.team_b_id END,
  hsm.created_at
FROM historical_series_map hsm;

-- Active/current series: games 1-6 preserve legacy team_a/team_b score orientation.
WITH current_series_map AS (
  SELECT
    s.id AS series_id,
    s.team_a_id,
    s.team_b_id,
    cgs.*
  FROM series s
  JOIN current_game_sevens cgs
    ON s.year = cgs.year
   AND s.round = cgs.round
   AND s.status = 'active'
  JOIN teams t_a
    ON t_a.id = s.team_a_id
   AND t_a.full_name = cgs.team_a
  JOIN teams t_b
    ON t_b.id = s.team_b_id
   AND t_b.full_name = cgs.team_b
)
INSERT INTO series_game_scores (
  series_id,
  game_number,
  home_team_id,
  away_team_id,
  home_score,
  away_score,
  winner_team_id,
  created_at
)
SELECT
  csm.series_id,
  1,
  csm.team_a_id,
  csm.team_b_id,
  csm.game_1_score_a,
  csm.game_1_score_b,
  CASE WHEN csm.game_1_score_a > csm.game_1_score_b THEN csm.team_a_id ELSE csm.team_b_id END,
  csm.created_at
FROM current_series_map csm
UNION ALL
SELECT
  csm.series_id,
  2,
  csm.team_a_id,
  csm.team_b_id,
  csm.game_2_score_a,
  csm.game_2_score_b,
  CASE WHEN csm.game_2_score_a > csm.game_2_score_b THEN csm.team_a_id ELSE csm.team_b_id END,
  csm.created_at
FROM current_series_map csm
UNION ALL
SELECT
  csm.series_id,
  3,
  csm.team_a_id,
  csm.team_b_id,
  csm.game_3_score_a,
  csm.game_3_score_b,
  CASE WHEN csm.game_3_score_a > csm.game_3_score_b THEN csm.team_a_id ELSE csm.team_b_id END,
  csm.created_at
FROM current_series_map csm
UNION ALL
SELECT
  csm.series_id,
  4,
  csm.team_a_id,
  csm.team_b_id,
  csm.game_4_score_a,
  csm.game_4_score_b,
  CASE WHEN csm.game_4_score_a > csm.game_4_score_b THEN csm.team_a_id ELSE csm.team_b_id END,
  csm.created_at
FROM current_series_map csm
UNION ALL
SELECT
  csm.series_id,
  5,
  csm.team_a_id,
  csm.team_b_id,
  csm.game_5_score_a,
  csm.game_5_score_b,
  CASE WHEN csm.game_5_score_a > csm.game_5_score_b THEN csm.team_a_id ELSE csm.team_b_id END,
  csm.created_at
FROM current_series_map csm
UNION ALL
SELECT
  csm.series_id,
  6,
  csm.team_a_id,
  csm.team_b_id,
  csm.game_6_score_a,
  csm.game_6_score_b,
  CASE WHEN csm.game_6_score_a > csm.game_6_score_b THEN csm.team_a_id ELSE csm.team_b_id END,
  csm.created_at
FROM current_series_map csm;

COMMIT;
