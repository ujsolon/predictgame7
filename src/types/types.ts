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
  // Stored league identity, added by migration `00016` (Story 2.8): `NOT NULL
  // DEFAULT 'NBA'` with a CHECK over 'NBA' | 'BAA' | 'ABA' — required here
  // because the column can never be absent. Display it verbatim; never derive
  // it from the year and never fold `BAA` into `NBA`.
  league: string;
  team_a_id: number;
  team_b_id: number;
  winner_team_id?: number | null;
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



