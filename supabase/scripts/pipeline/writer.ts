/**
 * Story 2.3 — the write sink. Everything the runner does to the database is
 * behind this interface so tests run against a fake and no network is
 * touched; the production implementation is the only file here that speaks
 * Supabase.
 *
 * Writes go through migration 00015's two `SECURITY DEFINER` RPCs (Decision
 * 2) and, since Story 2.5, migration 00017's insights-refresh RPC: birth,
 * completion and refresh each execute as a single function call, so their
 * statements share one transaction — the "in one transaction" AC is
 * literally met, and a rejected write lands nothing. The identity key stays
 * `(year, team_a_id, team_b_id)` (`series_year_team_pair_key`) and the scores
 * key `(series_id, game_number)` (`unique_series_game`); the `ON CONFLICT`
 * targets live in SQL, not here. No step writes `series.status` — the column
 * is gone as of 00014, so a writer literally cannot.
 */
import { createClient } from '@supabase/supabase-js';
import type { ComparableScore, CurrentScoreRow, CurrentSeriesRow, PlannedBirth, PlannedCompletion, PlannedScore } from './plan.ts';

export interface TeamRow {
  id: number;
  abbreviation: string;
  /**
   * Story 2.13 (migration `00018`) — the provider code `site.api.espn.com`
   * prints for this franchise, when it has one. Nullable by design: the 29
   * historical identities and the `Team A`/`Team B` placeholders carry no
   * modern ESPN code and stay NULL, and the `espn` adapter's join key resolves
   * only through this column (never `abbreviation`, which differs for at least
   * `NY`/`NYK` and `SA`/`SAS`).
   */
  espn_code: string | null;
}
/**
 * The census `pipeline_refresh_insights_cache()` returns (00017, Story 2.5):
 * the population the server counted and the headline numbers it wrote. The
 * run's report line prints this instead of re-reading `insights_cache`, so
 * what is on screen is what the RPC itself answered.
 */
export interface InsightsRefreshCensus {
  total_game_sevens: number;
  home_team_wins: number;
  game_6_winners_won: number;
  average_margin: number;
}

/** The sink the runner writes through. Reads back what the tables hold today. */
export interface PipelineSink {
  readTeams(): Promise<TeamRow[]>;
  readCurrent(): Promise<CurrentSeriesRow[]>;
  /** Executes the 00015 birth RPC and returns the series id (server-generated, never client-set). */
  birth(birth: PlannedBirth): Promise<string>;
  /** Executes the 00015 completion RPC: append game 7 and fill the winner in one call. */
  complete(completion: PlannedCompletion): Promise<void>;
  /**
   * Story 2.5 — executes the 00017 refresh RPC: all three `insights_cache`
   * rows recomputed and written in one statement, or none. Returns the census
   * so both callers (the completion-triggered path and U10's
   * `--refresh-insights` path) share one report source.
   */
  refreshInsights(): Promise<InsightsRefreshCensus>;
}

export function scorePayload(score: PlannedScore | ComparableScore): Record<string, number> {
  return {
    game_number: score.game_number,
    home_team_id: score.home_team_id,
    away_team_id: score.away_team_id,
    home_score: score.home_score,
    away_score: score.away_score,
  };
}

interface RawEmbeddedScore {
  game_number: number;
  home_team_id: number;
  away_team_id: number;
  home_score: number;
  away_score: number;
}

interface RawSeriesRow {
  id: string;
  year: number;
  team_a_id: number;
  team_b_id: number;
  winner_team_id: number | null;
  series_game_scores?: RawEmbeddedScore[] | null;
}

const SERIES_SELECT =
  'id, year, team_a_id, team_b_id, winner_team_id, series_game_scores(game_number, home_team_id, away_team_id, home_score, away_score)';

export interface SinkOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
}

/** The production sink: service_role from the environment only (NFR-S1), never an anon key. */
export function createSupabaseSink(options: SinkOptions): PipelineSink {
  const client = createClient(options.supabaseUrl, options.serviceRoleKey);
  return {
    async readTeams() {
      const { data, error } = await client.from('teams').select('id, abbreviation, espn_code');
      if (error) throw new Error(`reading teams failed: ${error.message}`);
      return (data ?? []) as TeamRow[];
    },
    async readCurrent() {
      const { data, error } = await client.from('series').select(SERIES_SELECT);
      if (error) throw new Error(`reading series rows failed: ${error.message}`);
      return (data ?? []).map((raw) => {
        const row = raw as RawSeriesRow;
        const scores: CurrentScoreRow[] = (row.series_game_scores ?? []).map((score) => ({
          game_number: score.game_number,
          home_team_id: score.home_team_id,
          away_team_id: score.away_team_id,
          home_score: score.home_score,
          away_score: score.away_score,
        }));
        return {
          id: row.id,
          year: row.year,
          team_a_id: row.team_a_id,
          team_b_id: row.team_b_id,
          winner_team_id: row.winner_team_id ?? null,
          scores,
        };
      });
    },
    async birth(birthPlan) {
      const { data, error } = await client.rpc('pipeline_birth_series', {
        p_year: birthPlan.year,
        p_round: birthPlan.round,
        p_team_a_id: birthPlan.team_a_id,
        p_team_b_id: birthPlan.team_b_id,
        p_scores: birthPlan.scores.map(scorePayload),
      });
      if (error) {
        throw new Error(`pipeline_birth_series failed for ${birthPlan.label}: ${error.message}`);
      }
      const seriesId = data as string | null;
      if (!seriesId) {
        throw new Error(`pipeline_birth_series returned no series id for ${birthPlan.label}`);
      }
      return seriesId;
    },
    async complete(completion) {
      const { error } = await client.rpc('pipeline_complete_series', {
        p_series_id: completion.series_id,
        p_game: scorePayload(completion.game),
        p_winner_team_id: completion.winner_team_id,
      });
      if (error) {
        throw new Error(`pipeline_complete_series failed for ${completion.label} (series ${completion.series_id}): ${error.message}`);
      }
    },
    async refreshInsights() {
      const { data, error } = await client.rpc('pipeline_refresh_insights_cache');
      if (error) {
        throw new Error(`pipeline_refresh_insights_cache failed: ${error.message}`);
      }
      // birth's second-throw convention (:112-114): an RPC declared RETURNS
      // jsonb that answers with no census must throw rather than let the run
      // print an empty report line about a refresh it cannot prove.
      const census = data as InsightsRefreshCensus | null;
      if (!census) {
        throw new Error('pipeline_refresh_insights_cache returned no census — the refresh cannot be reported without the population it counted');
      }
      return census;
    },
  };
}
