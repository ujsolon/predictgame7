/**
 * One prediction contract (AD-2) — the single source of truth for the
 * `predict-game-7` request and response shapes.
 *
 * Pure type declarations only: no runtime code and no platform APIs, so the
 * Deno Edge Function and the Vite frontend type graph can both import it.
 * Probabilities are documented as 0-100 percentages.
 */

/** The four methods the Edge Function actually branches on. */
export type MethodSlug =
  | 'logistic_regression'
  | 'bayes'
  | 'elo'
  | 'exponential_smoothing';

/** Confidence band derived from the higher win probability. */
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface PredictionInput {
  /** Present when the caller predicts a stored series; the function ignores it. */
  series_id?: string;
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
  /** Full team name of the Game 7 home team, when known. */
  home_team?: string;
  method?: MethodSlug;
  parameters?: Record<string, number>;
}

export interface ContributingFactor {
  factor: string;
  description: string;
  /** Probability shift this factor contributes, as a 0-1 fraction — not a percentage. */
  impact: number;
}

export interface PredictionResult {
  predicted_winner: string;
  team_a: string;
  team_b: string;
  team_a_logo?: string | null;
  team_b_logo?: string | null;
  /** Percentage probability (0-100, two decimals) that team A wins Game 7. */
  win_probability_a: number;
  /** Percentage probability (0-100, two decimals) that team B wins Game 7. */
  win_probability_b: number;
  confidence_level: ConfidenceLevel;
  contributing_factors: ContributingFactor[];
  computation_time_ms: number;
  method_used: MethodSlug;
}
