export interface Team {
  id: number;
  full_name: string;
  abbreviation: string;
  city?: string | null;
  nickname?: string | null;
  logo_url?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface SeriesGameScore {
  id: string;
  series_id: string;
  game_number: number;
  home_team_id: number;
  away_team_id: number;
  home_score: number;
  away_score: number;
  winner_team_id?: number | null;
  created_at: string;
  home_team?: Team;
  away_team?: Team;
  winner_team?: Team;
}

export interface Series {
  id: string;
  year: number;
  round: string;
  team_a_id: number;
  team_b_id: number;
  winner_team_id?: number | null;
  status: 'historical' | 'active' | 'completed';
  created_at: string;
  updated_at?: string | null;
  team_a?: Team;
  team_b?: Team;
  winner_team?: Team;
  series_game_scores?: SeriesGameScore[];
}

export interface PredictionMethod {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface PredictionInput {
  series_id?: string;
  team_a?: string;
  team_b?: string;
  game_1_score_a: number;
  game_1_score_b: number;
  game_2_score_a: number;
  game_2_score_b: number;
  game_3_score_a: number;
  game_3_score_b: number;
  game_4_score_a: number;
  game_4_score_b: number;
  game_5_score_a: number;
  game_5_score_b: number;
  game_6_score_a: number;
  game_6_score_b: number;
  home_team?: string;
  method?: 'logistic_regression' | 'bayesian' | 'elo' | 'exponential_smoothing' | 'ensemble_v1' | 'margin_model_v1';
  parameters?: Record<string, number>;
}

export interface ContributingFactor {
  factor: string;
  description: string;
  impact: number;
}

export interface PredictionResult {
  prediction_id?: string;
  series_id?: string;
  method_id?: string;
  prediction_type: string;
  prediction_statement: string;
  probability: number;
  team_a: string;
  team_b: string;
  team_a_logo?: string;
  team_b_logo?: string;
  win_probability_a?: number;
  win_probability_b?: number;
  confidence_level: string;
  contributing_factors: ContributingFactor[];
  metadata?: Record<string, unknown>;
  computation_time_ms: number;
  method_used?: string;
}

export interface ModelParameters {
  id: string;
  parameter_name: string;
  parameter_value: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsightCache {
  id: string;
  insight_key: string;
  insight_value: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TeamLogo {
  id: string;
  team_id?: number;
  team_name?: string;
  logo_url: string;
  created_at: string;
  updated_at?: string;
}



