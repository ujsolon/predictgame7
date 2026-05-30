-- =========================================================
-- Predict Game 7 — Release 1 Data Model
-- Migration 00005
-- =========================================================

-- Required for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- New normalized schema
-- =========================================================

-- teams
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  full_name TEXT UNIQUE NOT NULL,
  abbreviation TEXT UNIQUE NOT NULL,
  city TEXT,
  nickname TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- series
CREATE TABLE IF NOT EXISTS series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  round TEXT NOT NULL,
  team_a_id INTEGER NOT NULL REFERENCES teams(id),
  team_b_id INTEGER NOT NULL REFERENCES teams(id),
  winner_team_id INTEGER REFERENCES teams(id),
  status TEXT DEFAULT 'historical',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_series_status CHECK (status IN ('historical', 'active', 'completed')),
  CONSTRAINT chk_series_teams_different CHECK (team_a_id <> team_b_id)
);

-- series_game_scores
CREATE TABLE IF NOT EXISTS series_game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  game_number SMALLINT NOT NULL,
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  winner_team_id INTEGER REFERENCES teams(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_game_number CHECK (game_number BETWEEN 1 AND 7),
  CONSTRAINT chk_home_score CHECK (home_score >= 0),
  CONSTRAINT chk_away_score CHECK (away_score >= 0),
  CONSTRAINT chk_home_away_different CHECK (home_team_id <> away_team_id),
  CONSTRAINT unique_series_game UNIQUE(series_id, game_number)
);

-- prediction_methods
CREATE TABLE IF NOT EXISTS prediction_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- predictions
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  method_id UUID NOT NULL REFERENCES prediction_methods(id),
  prediction_type TEXT NOT NULL,
  prediction_statement TEXT NOT NULL,
  probability NUMERIC(5,2) NOT NULL,
  confidence_level TEXT NOT NULL,
  input_scores JSONB NOT NULL,
  model_parameters JSONB NOT NULL,
  contributing_factors JSONB,
  metadata JSONB,
  is_default BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_probability CHECK (probability >= 0 AND probability <= 100),
  CONSTRAINT chk_prediction_source CHECK (source IN ('system', 'user'))
);

-- team_logos schema update for Release 1
ALTER TABLE team_logos
  ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id);

ALTER TABLE team_logos
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_logos_team_id ON team_logos(team_id);

-- =========================================================
-- Seed canonical NBA teams
-- =========================================================
INSERT INTO teams (id, full_name, abbreviation, city, nickname)
VALUES
  (1, 'Atlanta Hawks', 'ATL', 'Atlanta', 'Hawks'),
  (2, 'Boston Celtics', 'BOS', 'Boston', 'Celtics'),
  (3, 'Brooklyn Nets', 'BKN', 'Brooklyn', 'Nets'),
  (4, 'Charlotte Hornets', 'CHA', 'Charlotte', 'Hornets'),
  (5, 'Chicago Bulls', 'CHI', 'Chicago', 'Bulls'),
  (6, 'Cleveland Cavaliers', 'CLE', 'Cleveland', 'Cavaliers'),
  (7, 'Dallas Mavericks', 'DAL', 'Dallas', 'Mavericks'),
  (8, 'Denver Nuggets', 'DEN', 'Denver', 'Nuggets'),
  (9, 'Detroit Pistons', 'DET', 'Detroit', 'Pistons'),
  (10, 'Golden State Warriors', 'GSW', 'Golden State', 'Warriors'),
  (11, 'Houston Rockets', 'HOU', 'Houston', 'Rockets'),
  (12, 'Indiana Pacers', 'IND', 'Indiana', 'Pacers'),
  (13, 'Los Angeles Clippers', 'LAC', 'Los Angeles', 'Clippers'),
  (14, 'Los Angeles Lakers', 'LAL', 'Los Angeles', 'Lakers'),
  (15, 'Memphis Grizzlies', 'MEM', 'Memphis', 'Grizzlies'),
  (16, 'Miami Heat', 'MIA', 'Miami', 'Heat'),
  (17, 'Milwaukee Bucks', 'MIL', 'Milwaukee', 'Bucks'),
  (18, 'Minnesota Timberwolves', 'MIN', 'Minnesota', 'Timberwolves'),
  (19, 'New Orleans Pelicans', 'NOP', 'New Orleans', 'Pelicans'),
  (20, 'New York Knicks', 'NYK', 'New York', 'Knicks'),
  (21, 'Oklahoma City Thunder', 'OKC', 'Oklahoma City', 'Thunder'),
  (22, 'Orlando Magic', 'ORL', 'Orlando', 'Magic'),
  (23, 'Philadelphia 76ers', 'PHI', 'Philadelphia', '76ers'),
  (24, 'Phoenix Suns', 'PHX', 'Phoenix', 'Suns'),
  (25, 'Portland Trail Blazers', 'POR', 'Portland', 'Trail Blazers'),
  (26, 'Sacramento Kings', 'SAC', 'Sacramento', 'Kings'),
  (27, 'San Antonio Spurs', 'SAS', 'San Antonio', 'Spurs'),
  (28, 'Toronto Raptors', 'TOR', 'Toronto', 'Raptors'),
  (29, 'Utah Jazz', 'UTA', 'Utah', 'Jazz'),
  (30, 'Washington Wizards', 'WAS', 'Washington', 'Wizards')
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- Seed prediction methods
-- =========================================================
INSERT INTO prediction_methods (slug, name, description)
VALUES
  ('logistic_regression', 'Logistic Regression', 'Baseline logistic regression prediction model'),
  ('elo', 'Elo Rating Model', 'Prediction model using Elo-based ratings'),
  ('bayesian', 'Bayesian Model', 'Bayesian probability prediction engine'),
  ('ensemble_v1', 'Ensemble V1', 'Combined weighted ensemble prediction model'),
  ('margin_model_v1', 'Margin Model V1', 'Margin-based prediction model')
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- Migrate existing series data into the new normalized schema
-- =========================================================
-- Historical series
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
ON CONFLICT DO NOTHING;

-- Active / current series
INSERT INTO series (year, round, team_a_id, team_b_id, winner_team_id, status, created_at, updated_at)
SELECT
  cgs.year,
  cgs.round,
  t_a.id,
  t_b.id,
  NULL,
  CASE WHEN cgs.is_active THEN 'active' ELSE 'historical' END,
  cgs.created_at,
  cgs.updated_at
FROM current_game_sevens cgs
JOIN teams t_a ON t_a.full_name = cgs.team_a
JOIN teams t_b ON t_b.full_name = cgs.team_b
ON CONFLICT DO NOTHING;

-- Series game scores from historical series
WITH series_map AS (
  SELECT s.id AS series_id, gs.id AS legacy_id
  FROM series s
  JOIN game_sevens gs ON s.year = gs.year AND s.round = gs.round
    AND s.team_a_id = (SELECT id FROM teams WHERE full_name = gs.team_a)
    AND s.team_b_id = (SELECT id FROM teams WHERE full_name = gs.team_b)
)
INSERT INTO series_game_scores (series_id, game_number, home_team_id, away_team_id, home_score, away_score, winner_team_id)
SELECT
  sm.series_id,
  1,
  t_h.id,
  t_a.id,
  gs.game_1_score_a,
  gs.game_1_score_b,
  CASE WHEN gs.game_1_score_a > gs.game_1_score_b THEN t_a.id ELSE t_b.id END
FROM series_map sm
JOIN game_sevens gs ON gs.id = sm.legacy_id
JOIN teams t_a ON t_a.full_name = gs.team_a
JOIN teams t_b ON t_b.full_name = gs.team_b
JOIN teams t_h ON t_h.full_name = gs.home_team
UNION ALL
SELECT
  sm.series_id,
  2,
  t_h.id,
  t_a.id,
  gs.game_2_score_a,
  gs.game_2_score_b,
  CASE WHEN gs.game_2_score_a > gs.game_2_score_b THEN t_a.id ELSE t_b.id END
FROM series_map sm
JOIN game_sevens gs ON gs.id = sm.legacy_id
JOIN teams t_a ON t_a.full_name = gs.team_a
JOIN teams t_b ON t_b.full_name = gs.team_b
JOIN teams t_h ON t_h.full_name = gs.home_team
UNION ALL
SELECT
  sm.series_id,
  3,
  t_h.id,
  t_a.id,
  gs.game_3_score_a,
  gs.game_3_score_b,
  CASE WHEN gs.game_3_score_a > gs.game_3_score_b THEN t_a.id ELSE t_b.id END
FROM series_map sm
JOIN game_sevens gs ON gs.id = sm.legacy_id
JOIN teams t_a ON t_a.full_name = gs.team_a
JOIN teams t_b ON t_b.full_name = gs.team_b
JOIN teams t_h ON t_h.full_name = gs.home_team
UNION ALL
SELECT
  sm.series_id,
  4,
  t_h.id,
  t_a.id,
  gs.game_4_score_a,
  gs.game_4_score_b,
  CASE WHEN gs.game_4_score_a > gs.game_4_score_b THEN t_a.id ELSE t_b.id END
FROM series_map sm
JOIN game_sevens gs ON gs.id = sm.legacy_id
JOIN teams t_a ON t_a.full_name = gs.team_a
JOIN teams t_b ON t_b.full_name = gs.team_b
JOIN teams t_h ON t_h.full_name = gs.home_team
UNION ALL
SELECT
  sm.series_id,
  5,
  t_h.id,
  t_a.id,
  gs.game_5_score_a,
  gs.game_5_score_b,
  CASE WHEN gs.game_5_score_a > gs.game_5_score_b THEN t_a.id ELSE t_b.id END
FROM series_map sm
JOIN game_sevens gs ON gs.id = sm.legacy_id
JOIN teams t_a ON t_a.full_name = gs.team_a
JOIN teams t_b ON t_b.full_name = gs.team_b
JOIN teams t_h ON t_h.full_name = gs.home_team
UNION ALL
SELECT
  sm.series_id,
  6,
  t_h.id,
  t_a.id,
  gs.game_6_score_a,
  gs.game_6_score_b,
  CASE WHEN gs.game_6_score_a > gs.game_6_score_b THEN t_a.id ELSE t_b.id END
FROM series_map sm
JOIN game_sevens gs ON gs.id = sm.legacy_id
JOIN teams t_a ON t_a.full_name = gs.team_a
JOIN teams t_b ON t_b.full_name = gs.team_b
JOIN teams t_h ON t_h.full_name = gs.home_team
UNION ALL
SELECT
  sm.series_id,
  7,
  t_h.id,
  t_a.id,
  gs.game_7_score_a,
  gs.game_7_score_b,
  CASE WHEN gs.game_7_score_a > gs.game_7_score_b THEN t_a.id ELSE t_b.id END
FROM series_map sm
JOIN game_sevens gs ON gs.id = sm.legacy_id
JOIN teams t_a ON t_a.full_name = gs.team_a
JOIN teams t_b ON t_b.full_name = gs.team_b
JOIN teams t_h ON t_h.full_name = gs.home_team
ON CONFLICT DO NOTHING;

-- =========================================================
-- Populate team_logos.team_id where possible
-- =========================================================
UPDATE team_logos tl
SET team_id = t.id,
    updated_at = NOW()
FROM teams t
WHERE tl.team_name = t.full_name;

-- Keep legacy team_name for backward compatibility while new code transitions to team_id.

-- =========================================================
-- Optional cleanup notes
-- =========================================================
-- The existing `game_sevens` and `current_game_sevens` tables are preserved for migration and rollback.
-- After release 1 is validated, they may be dropped or deprecated in a later migration.
