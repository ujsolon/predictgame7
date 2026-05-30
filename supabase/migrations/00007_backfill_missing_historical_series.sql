-- =========================================================
-- Backfill missing historical series and score rows
-- Migration 00007
-- =========================================================

BEGIN;

INSERT INTO teams (id, full_name, abbreviation, city, nickname)
VALUES
  (31, 'Baltimore Bullets', 'BLB', 'Baltimore', 'Bullets'),
  (32, 'Buffalo Braves', 'BUF', 'Buffalo', 'Braves'),
  (33, 'Capital Bullets', 'CPB', 'Washington', 'Bullets'),
  (34, 'Carolina Cougars', 'CAC', 'Carolina', 'Cougars'),
  (35, 'Cincinnati Royals', 'CNR', 'Cincinnati', 'Royals'),
  (36, 'Dallas Chaparrals', 'DCH', 'Dallas', 'Chaparrals'),
  (37, 'Denver Rockets', 'DNR', 'Denver', 'Rockets'),
  (38, 'Fort Wayne Pistons', 'FWP', 'Fort Wayne', 'Pistons'),
  (39, 'Kansas City Kings', 'KCK', 'Kansas City', 'Kings'),
  (40, 'Kentucky Colonels', 'KEN', 'Kentucky', 'Colonels'),
  (42, 'Miami Floridians', 'MFL', 'Miami', 'Floridians'),
  (43, 'Minneapolis Lakers', 'MPL', 'Minneapolis', 'Lakers'),
  (44, 'Minnesota Pipers', 'MNP', 'Minnesota', 'Pipers'),
  (45, 'New Jersey Nets', 'NJN', 'New Jersey', 'Nets'),
  (46, 'New Orleans Buccaneers', 'NOB', 'New Orleans', 'Buccaneers'),
  (47, 'New Orleans Hornets', 'NOH', 'New Orleans', 'Hornets'),
  (48, 'New York Nets', 'NYN', 'New York', 'Nets'),
  (49, 'Oakland Oaks', 'OAK', 'Oakland', 'Oaks'),
  (50, 'Philadelphia Warriors', 'PHW', 'Philadelphia', 'Warriors'),
  (51, 'Rochester Royals', 'ROR', 'Rochester', 'Royals'),
  (52, 'San Francisco Warriors', 'SFW', 'San Francisco', 'Warriors'),
  (53, 'Seattle SuperSonics', 'SEA', 'Seattle', 'SuperSonics'),
  (54, 'St. Louis Bombers', 'SLB', 'St. Louis', 'Bombers'),
  (55, 'St. Louis Hawks', 'SLH', 'St. Louis', 'Hawks'),
  (56, 'Syracuse Nationals', 'SYR', 'Syracuse', 'Nationals'),
  (57, 'Utah Stars', 'UTS', 'Utah', 'Stars'),
  (58, 'Virginia Squires', 'VAS', 'Virginia', 'Squires'),
  (59, 'Washington Bullets', 'WSB', 'Washington', 'Bullets'),
  (60, 'Washington Capitols', 'WSC', 'Washington', 'Capitols')
ON CONFLICT (full_name) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_series_identity
  ON series (year, round, team_a_id, team_b_id, status);

INSERT INTO series (year, round, team_a_id, team_b_id, winner_team_id, status, created_at)
SELECT
  gs.year,
  gs.round,
  t_a.id,
  t_b.id,
  t_w.id,
  'historical',
  gs.created_at
FROM game_sevens gs
JOIN teams t_a ON t_a.full_name = gs.team_a
JOIN teams t_b ON t_b.full_name = gs.team_b
JOIN teams t_w ON t_w.full_name = gs.winner
ON CONFLICT (year, round, team_a_id, team_b_id, status) DO NOTHING;

DELETE FROM series_game_scores;

WITH historical_series_map AS (
  SELECT
    s.id AS series_id,
    s.team_a_id,
    s.team_b_id,
    gs.game_1_score_a,
    gs.game_1_score_b,
    gs.game_2_score_a,
    gs.game_2_score_b,
    gs.game_3_score_a,
    gs.game_3_score_b,
    gs.game_4_score_a,
    gs.game_4_score_b,
    gs.game_5_score_a,
    gs.game_5_score_b,
    gs.game_6_score_a,
    gs.game_6_score_b,
    gs.game_7_score_a,
    gs.game_7_score_b,
    gs.created_at
  FROM series s
  JOIN teams t_a ON t_a.id = s.team_a_id
  JOIN teams t_b ON t_b.id = s.team_b_id
  JOIN game_sevens gs
    ON gs.year = s.year
   AND gs.round = s.round
   AND gs.team_a = t_a.full_name
   AND gs.team_b = t_b.full_name
  WHERE s.status = 'historical'
),
current_series_map AS (
  SELECT
    s.id AS series_id,
    s.team_a_id,
    s.team_b_id,
    cgs.game_1_score_a,
    cgs.game_1_score_b,
    cgs.game_2_score_a,
    cgs.game_2_score_b,
    cgs.game_3_score_a,
    cgs.game_3_score_b,
    cgs.game_4_score_a,
    cgs.game_4_score_b,
    cgs.game_5_score_a,
    cgs.game_5_score_b,
    cgs.game_6_score_a,
    cgs.game_6_score_b,
    cgs.created_at
  FROM series s
  JOIN teams t_a ON t_a.id = s.team_a_id
  JOIN teams t_b ON t_b.id = s.team_b_id
  JOIN current_game_sevens cgs
    ON cgs.year = s.year
   AND cgs.round = s.round
   AND cgs.team_a = t_a.full_name
   AND cgs.team_b = t_b.full_name
  WHERE s.status = 'active'
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
  hsm.team_a_id,
  hsm.team_b_id,
  hsm.game_7_score_a,
  hsm.game_7_score_b,
  CASE WHEN hsm.game_7_score_a > hsm.game_7_score_b THEN hsm.team_a_id ELSE hsm.team_b_id END,
  hsm.created_at
FROM historical_series_map hsm
UNION ALL
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
