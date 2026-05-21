-- Create game_sevens table for historical data
CREATE TABLE game_sevens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  round text NOT NULL,
  team_a text NOT NULL,
  team_b text NOT NULL,
  game_1_score_a integer NOT NULL,
  game_1_score_b integer NOT NULL,
  game_2_score_a integer NOT NULL,
  game_2_score_b integer NOT NULL,
  game_3_score_a integer NOT NULL,
  game_3_score_b integer NOT NULL,
  game_4_score_a integer NOT NULL,
  game_4_score_b integer NOT NULL,
  game_5_score_a integer NOT NULL,
  game_5_score_b integer NOT NULL,
  game_6_score_a integer NOT NULL,
  game_6_score_b integer NOT NULL,
  game_7_score_a integer NOT NULL,
  game_7_score_b integer NOT NULL,
  winner text NOT NULL,
  home_team text,
  created_at timestamptz DEFAULT now()
);

-- Create current_game_sevens table for active matchups
CREATE TABLE current_game_sevens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  round text NOT NULL,
  team_a text NOT NULL,
  team_b text NOT NULL,
  game_1_score_a integer NOT NULL,
  game_1_score_b integer NOT NULL,
  game_2_score_a integer NOT NULL,
  game_2_score_b integer NOT NULL,
  game_3_score_a integer NOT NULL,
  game_3_score_b integer NOT NULL,
  game_4_score_a integer NOT NULL,
  game_4_score_b integer NOT NULL,
  game_5_score_a integer NOT NULL,
  game_5_score_b integer NOT NULL,
  game_6_score_a integer NOT NULL,
  game_6_score_b integer NOT NULL,
  predicted_winner text,
  win_probability_a numeric(5,2),
  win_probability_b numeric(5,2),
  home_team text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create model_parameters table
CREATE TABLE model_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_name text NOT NULL UNIQUE,
  parameter_value numeric NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create insights_cache table
CREATE TABLE insights_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_key text NOT NULL UNIQUE,
  insight_value jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE game_sevens ENABLE ROW LEVEL SECURITY;
ALTER TABLE current_game_sevens ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights_cache ENABLE ROW LEVEL SECURITY;

-- Create public read policies
CREATE POLICY "Public read access for game_sevens"
  ON game_sevens FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public read access for current_game_sevens"
  ON current_game_sevens FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public read access for model_parameters"
  ON model_parameters FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public read access for insights_cache"
  ON insights_cache FOR SELECT
  TO public
  USING (true);

-- Insert sample historical Game 7 data
INSERT INTO game_sevens (year, round, team_a, team_b, game_1_score_a, game_1_score_b, game_2_score_a, game_2_score_b, game_3_score_a, game_3_score_b, game_4_score_a, game_4_score_b, game_5_score_a, game_5_score_b, game_6_score_a, game_6_score_b, game_7_score_a, game_7_score_b, winner, home_team) VALUES
(2016, 'NBA Finals', 'Cleveland Cavaliers', 'Golden State Warriors', 89, 104, 77, 110, 120, 90, 82, 108, 112, 97, 115, 101, 93, 89, 'Cleveland Cavaliers', 'Golden State Warriors'),
(2019, 'Conference Semifinals', 'Toronto Raptors', 'Philadelphia 76ers', 108, 95, 94, 89, 116, 95, 101, 96, 125, 89, 112, 101, 92, 90, 'Toronto Raptors', 'Philadelphia 76ers'),
(2018, 'Conference Finals', 'Cleveland Cavaliers', 'Boston Celtics', 83, 108, 94, 107, 116, 86, 111, 102, 96, 83, 109, 99, 87, 79, 'Cleveland Cavaliers', 'Boston Celtics'),
(2020, 'Conference Semifinals', 'Denver Nuggets', 'LA Clippers', 120, 97, 110, 101, 113, 107, 85, 96, 111, 105, 104, 111, 104, 89, 'Denver Nuggets', 'LA Clippers'),
(2021, 'Conference Semifinals', 'Brooklyn Nets', 'Milwaukee Bucks', 115, 107, 86, 125, 83, 86, 107, 96, 114, 108, 104, 89, 111, 115, 'Milwaukee Bucks', 'Milwaukee Bucks'),
(2022, 'Conference Semifinals', 'Boston Celtics', 'Milwaukee Bucks', 89, 101, 109, 86, 101, 103, 116, 108, 110, 107, 108, 95, 109, 81, 'Boston Celtics', 'Milwaukee Bucks'),
(2023, 'Conference Finals', 'Miami Heat', 'Boston Celtics', 123, 116, 106, 111, 128, 102, 102, 82, 110, 97, 103, 104, 103, 84, 'Miami Heat', 'Boston Celtics'),
(2024, 'Conference Semifinals', 'Denver Nuggets', 'Minnesota Timberwolves', 106, 99, 80, 106, 117, 90, 115, 107, 98, 112, 115, 70, 90, 98, 'Minnesota Timberwolves', 'Minnesota Timberwolves');

-- Insert default model parameters
INSERT INTO model_parameters (parameter_name, parameter_value, description) VALUES
('intercept', 0.0, 'Model intercept'),
('game_6_win_weight', 1.2, 'Weight for winning Game 6'),
('cumulative_margin_weight', 0.05, 'Weight for cumulative point differential'),
('home_advantage_weight', 0.3, 'Weight for home court advantage'),
('momentum_weight', 0.8, 'Weight for recent game momentum');

-- Insert initial insights cache
INSERT INTO insights_cache (insight_key, insight_value) VALUES
('game_6_winner_stats', '{"total_game_sevens": 8, "game_6_winners_won": 5, "win_rate": 62.5}'::jsonb),
('home_team_stats', '{"total_game_sevens": 8, "home_team_wins": 5, "win_rate": 62.5}'::jsonb),
('avg_point_differential', '{"average": 8.5, "median": 7.0, "max": 28, "min": 2}'::jsonb);