// Story 2.2: the single derivation (src/lib/series-phase.ts) is pure and
// platform-free, so this runs under the default Node vitest environment.
// Fixtures cover the two reconciled shapes and BOTH non-reconciling shapes
// from the spec's edge-case matrix: a winner whose rows are not exactly 1–7,
// and a game-number set matching neither ({1,2,4,5,6,7}).
import { describe, expect, it } from 'vitest';

import {
  deriveSeriesPhase,
  isSeriesPending,
  seriesSourceForPhase,
  type SeriesPhaseInput,
} from '@/lib/series-phase';
import type { SeriesGameScore } from '@/types/types';

function scoreRows(gameNumbers: number[]): SeriesGameScore[] {
  return gameNumbers.map((game_number, index) => ({
    id: `g${game_number}`,
    series_id: 's-test',
    game_number,
    home_team_id: index % 2 === 0 ? 11 : 22,
    away_team_id: index % 2 === 0 ? 22 : 11,
    home_score: 100,
    away_score: 90,
    created_at: '2026-01-01T00:00:00Z',
  }));
}

const asInput = (winner: number | null, games: number[]): SeriesPhaseInput => ({
  winner_team_id: winner,
  series_game_scores: scoreRows(games),
});

describe('deriveSeriesPhase', () => {
  it('archives a winner whose game numbers cover 1-7', () => {
    expect(deriveSeriesPhase(asInput(11, [1, 2, 3, 4, 5, 6, 7]))).toBe('archive');
    // Store order is irrelevant: it is a set, not a sequence.
    expect(deriveSeriesPhase(asInput(11, [7, 1, 6, 2, 5, 3, 4]))).toBe('archive');
  });

  it('keeps a null winner with a certified 3-3 (games 1-6) pending', () => {
    expect(deriveSeriesPhase(asInput(null, [1, 2, 3, 4, 5, 6]))).toBe('pending');
  });

  it('rejects the impossible shape of a winner with only six rows', () => {
    expect(deriveSeriesPhase(asInput(11, [1, 2, 3, 4, 5, 6]))).toBeNull();
  });

  it('rejects a null winner whose game set matches neither shape ({1,2,4,5,6,7})', () => {
    expect(deriveSeriesPhase(asInput(null, [1, 2, 4, 5, 6, 7]))).toBeNull();
  });

  it('rejects a winner whose seven rows are not exactly 1-7 ({1,2,3,4,5,6,6} is not a set that covers 7)', () => {
    // A duplicate game_number collapses in the set, so this is 6 distinct
    // numbers with a winner — neither shape. (The DB's unique key makes the
    // duplicate unreachable in production; the derivation must not guess.)
    expect(deriveSeriesPhase(asInput(11, [1, 2, 3, 4, 5, 6, 6]))).toBeNull();
  });

  it('rejects missing or empty score collections rather than defaulting a group', () => {
    expect(deriveSeriesPhase({ winner_team_id: null, series_game_scores: undefined })).toBeNull();
    expect(deriveSeriesPhase({ winner_team_id: 11, series_game_scores: [] })).toBeNull();
    expect(deriveSeriesPhase({})).toBeNull();
  });

  it('treats explicit undefined winner_team_id the same as an omitted key', () => {
    // The type allows `number | null | undefined`; `undefined != null` is false,
    // so explicit undefined must fall through to the pending/null branch just
    // like a missing key. Pin it separately from the `{}` case above.
    expect(deriveSeriesPhase({ winner_team_id: undefined, series_game_scores: scoreRows([1, 2, 3, 4, 5, 6]) })).toBe('pending');
    expect(deriveSeriesPhase({ winner_team_id: undefined, series_game_scores: scoreRows([1, 2, 3, 4, 5, 6, 7]) })).toBeNull();
  });

  it('treats a zero winner id as a winner (null/undefined are the only "pending" markers)', () => {
    // Defensive: the derivation reads `!= null`, never truthiness — an id of
    // 0 would be a data bug upstream, not a reason to call the row pending.
    expect(deriveSeriesPhase(asInput(0, [1, 2, 3, 4, 5, 6, 7]))).toBe('archive');
  });
});

describe('seriesSourceForPhase', () => {
  it('maps pending to current, and archive or null to historical', () => {
    expect(seriesSourceForPhase('pending')).toBe('current');
    expect(seriesSourceForPhase('archive')).toBe('historical');
    // A deep link to a non-reconciling row falls back to historical —
    // today's behavior for anything that is not active; no third bucket.
    expect(seriesSourceForPhase(null)).toBe('historical');
  });

  it('end-to-end: the picker source of the two reconciled shapes and the anomalies', () => {
    expect(seriesSourceForPhase(deriveSeriesPhase(asInput(null, [1, 2, 3, 4, 5, 6])))).toBe('current');
    expect(seriesSourceForPhase(deriveSeriesPhase(asInput(11, [1, 2, 3, 4, 5, 6, 7])))).toBe('historical');
    expect(seriesSourceForPhase(deriveSeriesPhase(asInput(11, [1, 2, 3, 4, 5, 6])))).toBe('historical');
    expect(seriesSourceForPhase(deriveSeriesPhase(asInput(null, [1, 2, 4, 5, 6, 7])))).toBe('historical');
  });
});

describe('isSeriesPending', () => {
  it('is true only for the certified 3-3 shape', () => {
    expect(isSeriesPending(asInput(null, [1, 2, 3, 4, 5, 6]))).toBe(true);
    expect(isSeriesPending(asInput(11, [1, 2, 3, 4, 5, 6, 7]))).toBe(false);
    expect(isSeriesPending(asInput(null, [1, 2, 4, 5, 6, 7]))).toBe(false);
    expect(isSeriesPending(asInput(11, [1, 2, 3, 4, 5, 6]))).toBe(false);
  });
});
