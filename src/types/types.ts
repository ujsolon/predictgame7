export interface GameSeven {
  id: string;
  year: number;
  round: string;
  team_a: string;
  team_b: string;
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
  game_7_score_a: number;
  game_7_score_b: number;
  winner: string;
  home_team: string | null;
  created_at: string;
}

export interface CurrentGameSeven {
  id: string;
  year: number;
  round: string;
  team_a: string;
  team_b: string;
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
  predicted_winner: string | null;
  win_probability_a: number | null;
  win_probability_b: number | null;
  home_team: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PredictionInput {
  team_a: string;
  team_b: string;
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
  method?: 'logistic_regression' | 'bayes' | 'elo' | 'exponential_smoothing';
  parameters?: Record<string, number>;
}

export interface ContributingFactor {
  factor: string;
  description: string;
  impact: number;
}

export interface PredictionResult {
  predicted_winner: string;
  win_probability_a: number;
  win_probability_b: number;
  confidence_level: string;
  contributing_factors: ContributingFactor[];
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
  team_name: string;
  logo_url: string;
  created_at: string;
}



