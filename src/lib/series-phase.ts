/**
 * The single derivation of a series' phase (Story 2.2 / AD-4, as amended
 * 2026-09-29): a series is `pending` when it has no winner and its
 * `series_game_scores` game numbers are exactly {1..6} (a certified 3–3), and
 * `archive` when a winner is set and the numbers are exactly {1..7}. Phase is
 * never stored and never derived from dates or `created_at`.
 *
 * The check is a game-number SET, not a row count: a winner whose rows are
 * not exactly 1–7, or a game set matching neither shape (e.g. {1,2,4,5,6,7}),
 * reconciles to nothing and returns `null`. Callers must exclude such rows
 * from the picker groups and report them (the page owns the exception
 * channel — this module stays platform-free); they are never guessed into a
 * group.
 */
import type { Series } from '@/types/types';

export type SeriesPhase = 'archive' | 'pending';

/** The picker/analytics source a phase maps to ('custom' is owned by the page). */
export type SeriesPhaseSource = 'current' | 'historical';

/** The shape the derivation reads — the two inputs AD-4 names, nothing else. */
export type SeriesPhaseInput = Pick<Series, 'winner_team_id' | 'series_game_scores'>;

const PENDING_GAME_NUMBERS = [1, 2, 3, 4, 5, 6];
const ARCHIVE_GAME_NUMBERS = [1, 2, 3, 4, 5, 6, 7];

function coversExactly(scores: SeriesPhaseInput['series_game_scores'], gameNumbers: number[]): boolean {
  const numbers = new Set((scores ?? []).map((score) => score.game_number));
  return numbers.size === gameNumbers.length && gameNumbers.every((game) => numbers.has(game));
}

/**
 * Derive a series' phase, or `null` when the row reconciles to neither shape.
 * `winner_team_id` presence alone is not enough: the score rows must carry
 * the matching game-number set, which is the reconciliation AD-4 §4.2(b)
 * puts on the read path as the defensive half of the guard.
 */
export function deriveSeriesPhase(series: SeriesPhaseInput): SeriesPhase | null {
  if (series.winner_team_id != null) {
    return coversExactly(series.series_game_scores, ARCHIVE_GAME_NUMBERS) ? 'archive' : null;
  }
  return coversExactly(series.series_game_scores, PENDING_GAME_NUMBERS) ? 'pending' : null;
}

/**
 * Map a derived phase to the series source the picker reports. A
 * non-reconciling row (`null`) — reachable through a `?series=` deep link —
 * falls back to `historical`, which is today's behavior for anything that is
 * not active; no third bucket enters the frozen `series_source` registry.
 */
export function seriesSourceForPhase(phase: SeriesPhase | null): SeriesPhaseSource {
  return phase === 'pending' ? 'current' : 'historical';
}

/** Convenience for the picker's Active group and the decade-card label. */
export function isSeriesPending(series: SeriesPhaseInput): boolean {
  return deriveSeriesPhase(series) === 'pending';
}
