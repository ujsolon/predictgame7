-- =========================================================
-- Canonicalize Los Angeles Clippers naming
-- Migration 00009
-- =========================================================

BEGIN;

UPDATE game_sevens
SET
  team_a = CASE WHEN team_a = 'LA Clippers' THEN 'Los Angeles Clippers' ELSE team_a END,
  team_b = CASE WHEN team_b = 'LA Clippers' THEN 'Los Angeles Clippers' ELSE team_b END,
  winner = CASE WHEN winner = 'LA Clippers' THEN 'Los Angeles Clippers' ELSE winner END,
  home_team = CASE WHEN home_team = 'LA Clippers' THEN 'Los Angeles Clippers' ELSE home_team END;

UPDATE current_game_sevens
SET
  team_a = CASE WHEN team_a = 'LA Clippers' THEN 'Los Angeles Clippers' ELSE team_a END,
  team_b = CASE WHEN team_b = 'LA Clippers' THEN 'Los Angeles Clippers' ELSE team_b END,
  predicted_winner = CASE WHEN predicted_winner = 'LA Clippers' THEN 'Los Angeles Clippers' ELSE predicted_winner END,
  home_team = CASE WHEN home_team = 'LA Clippers' THEN 'Los Angeles Clippers' ELSE home_team END;

UPDATE series
SET
  team_a_id = CASE WHEN team_a_id = 41 THEN 13 ELSE team_a_id END,
  team_b_id = CASE WHEN team_b_id = 41 THEN 13 ELSE team_b_id END,
  winner_team_id = CASE WHEN winner_team_id = 41 THEN 13 ELSE winner_team_id END
WHERE team_a_id = 41 OR team_b_id = 41 OR winner_team_id = 41;

UPDATE series_game_scores
SET
  home_team_id = CASE WHEN home_team_id = 41 THEN 13 ELSE home_team_id END,
  away_team_id = CASE WHEN away_team_id = 41 THEN 13 ELSE away_team_id END,
  winner_team_id = CASE WHEN winner_team_id = 41 THEN 13 ELSE winner_team_id END
WHERE home_team_id = 41 OR away_team_id = 41 OR winner_team_id = 41;

DELETE FROM team_logos
WHERE team_name = 'LA Clippers' OR team_id = 41;

INSERT INTO team_logos (team_name, logo_url, team_id, created_at, updated_at)
VALUES ('Los Angeles Clippers', 'assets/teams/clippers.png', 13, NOW(), NOW())
ON CONFLICT (team_name) DO UPDATE
SET
  logo_url = EXCLUDED.logo_url,
  team_id = EXCLUDED.team_id,
  updated_at = NOW();

DELETE FROM teams
WHERE id = 41;

UPDATE teams
SET
  full_name = 'Los Angeles Clippers',
  abbreviation = 'LAC',
  city = 'Los Angeles',
  nickname = 'Clippers',
  updated_at = NOW()
WHERE id = 13;

COMMIT;
