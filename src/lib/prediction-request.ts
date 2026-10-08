/**
 * Typed builders for the two `predict-game-7` request bodies (Story 4.4, D3).
 *
 * They replace the page's `any`-typed assembly: each takes what the page
 * holds (a stored `Series`, or the custom `PredictionForm`) and either a
 * complete `PredictionInput` or the failure to show. No React, no toast —
 * the page owns the surfaces, and the bodies are pinned byte-for-byte by the
 * Story 1.4 regression suite, key order included:
 *
 * - series: `series_id, team_a, team_b, method, game_1_score_a … game_6_score_b, home_team`;
 * - custom: `team_a, team_b, game_1_score_a … game_6_score_b, home_team, method`.
 *
 * `home_team: undefined` is kept as a present key, exactly as before; the
 * JSON wire drops it.
 */
import {
  collectRangeHints,
  collectTeamNameHints,
  completeScores,
  GAME_NUMBERS,
  scoreKey,
  validateCustomMatchup,
  validateScores,
  type CustomFieldErrors,
} from '@/lib/custom-matchup';
import type { MethodSlug, PredictionForm, PredictionInput, ScoreFields } from '@/types/prediction';
import type { Series } from '@/types/types';

export type SeriesRequestBuild =
  | { ok: true; request: PredictionInput; hints: string[] }
  | { ok: false; error: string };

export type CustomRequestBuild =
  | { ok: true; request: PredictionInput; hints: string[] }
  | { ok: false; fields: CustomFieldErrors };

export const SERIES_TOO_SHORT = 'Selected series does not include enough game scores for prediction.';

/**
 * A stored series' request: games 1-6 team-relative (score A is team A's score
 * whichever side hosted), `home_team` from the Game 7 row when there is one.
 * Failures are toast copy; `hints` are the non-blocking range notes.
 */
export function buildSeriesRequest(series: Series, method: MethodSlug): SeriesRequestBuild {
  const sorted = [...(series.series_game_scores ?? [])].sort((a, b) => a.game_number - b.game_number);
  if (sorted.length < 6) return { ok: false, error: SERIES_TOO_SHORT };

  const scores: Partial<ScoreFields> = {};
  for (const game of GAME_NUMBERS) {
    const row = sorted.find((r) => r.game_number === game);
    if (!row) return { ok: false, error: `Game ${game} is missing for the selected series.` };
    const isTeamAHome = row.home_team_id === series.team_a_id;
    scores[scoreKey(game, 'a')] = isTeamAHome ? row.home_score : row.away_score;
    scores[scoreKey(game, 'b')] = isTeamAHome ? row.away_score : row.home_score;
  }

  const error = validateScores(scores);
  if (error) return { ok: false, error };
  const complete = completeScores(scores);
  // Unreachable once `validateScores` passes (it rejects every non-number);
  // kept so the narrowing is checked rather than cast.
  if (!complete) return { ok: false, error: SERIES_TOO_SHORT };

  const game7 = sorted.find((r) => r.game_number === 7);
  const request: PredictionInput = {
    series_id: series.id,
    team_a: series.team_a?.full_name || 'Team A',
    team_b: series.team_b?.full_name || 'Team B',
    method,
    ...complete,
    home_team: game7
      ? game7.home_team_id === series.team_a_id
        ? series.team_a?.full_name
        : series.team_b?.full_name
      : undefined,
  };
  return { ok: true, request, hints: collectRangeHints(complete) };
}

/**
 * A custom matchup's request. Invalid input is the inline field-error map
 * (the request never leaves the browser); valid input carries trimmed names
 * and the hints in page order — range notes first, then unrecognized names.
 */
export function buildCustomRequest(form: PredictionForm, method: MethodSlug): CustomRequestBuild {
  const fields = validateCustomMatchup(form);
  const complete = completeScores(form);
  if (Object.keys(fields).length > 0 || !complete) return { ok: false, fields };

  const request: PredictionInput = {
    team_a: (form.team_a ?? '').trim(),
    team_b: (form.team_b ?? '').trim(),
    ...complete,
    home_team: undefined,
    method,
  };
  return { ok: true, request, hints: [...collectRangeHints(complete), ...collectTeamNameHints(form)] };
}
