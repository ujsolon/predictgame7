import { describe, expect, it } from 'vitest';

import { METHOD_LABELS } from '@/lib/method-display';
import {
  ACCEPTED_METHOD_SLUGS,
  SCORE_FIELDS,
  validatePredictionRequest,
} from '../../../supabase/functions/_shared/predict-request';

const sixGameScores = {
  game_1_score_a: 108,
  game_1_score_b: 95,
  game_2_score_a: 103,
  game_2_score_b: 110,
  game_3_score_a: 112,
  game_3_score_b: 99,
  game_4_score_a: 101,
  game_4_score_b: 107,
  game_5_score_a: 115,
  game_5_score_b: 104,
  game_6_score_a: 98,
  game_6_score_b: 113,
};

const request = (overrides: Record<string, unknown> = {}) => ({
  team_a: 'Cleveland Cavaliers',
  team_b: 'Golden State Warriors',
  ...sixGameScores,
  ...overrides,
});

const reject = (body: unknown): string | null =>
  validatePredictionRequest(body, ACCEPTED_METHOD_SLUGS);

describe('predict-game-7 request boundary (Story 2.0 / D2)', () => {
  it('accepts the slug list the frontend labels exhaustively, in both directions', () => {
    // METHOD_LABELS is Record<MethodSlug, string>, so this is the local half of
    // the tie `index.ts` completes under `deno check`: a contract slug added or
    // renamed without the server list reddens here.
    expect([...ACCEPTED_METHOD_SLUGS]).toEqual(Object.keys(METHOD_LABELS));
  });

  it('carries the twelve score fields the contract declares, in grid order', () => {
    expect([...SCORE_FIELDS]).toEqual(
      [1, 2, 3, 4, 5, 6].flatMap((game) => [`game_${game}_score_a`, `game_${game}_score_b`])
    );
  });

  it('accepts a conforming request for every method and for no method at all', () => {
    expect(reject(request())).toBeNull();
    for (const method of ACCEPTED_METHOD_SLUGS) {
      expect(reject(request({ method }))).toBeNull();
    }
  });

  it('keeps the pre-existing 400 string for every missing-name shape', () => {
    expect(reject(request({ team_b: undefined }))).toBe('Team names are required');
    expect(reject(request({ team_a: '' }))).toBe('Team names are required');
    expect(reject(request({ team_a: '   ' }))).toBe('Team names are required');
    expect(reject(request({ team_a: 123 }))).toBe('Team names are required');
    expect(reject(null)).toBe('Team names are required');
    expect(reject('a string')).toBe('Team names are required');
    expect(reject([])).toBe('Team names are required');
  });

  it('rejects a self-vs-self matchup, including the case and padding variants', () => {
    expect(reject(request({ team_b: 'Cleveland Cavaliers' }))).toBe(
      'Team A and Team B are the same team. Pick two different teams to predict.'
    );
    expect(reject(request({ team_a: ' Cleveland Cavaliers ', team_b: 'cleveland cavaliers' }))).toBe(
      'Team A and Team B are the same team. Pick two different teams to predict.'
    );
  });

  it('names every offending score field, in field order', () => {
    expect(reject(request({ game_3_score_a: '112' }))).toBe(
      'Game scores for games 1-6 must all be numbers. Invalid: game_3_score_a'
    );
    expect(reject(request({ game_6_score_b: null, game_1_score_b: Number.NaN }))).toBe(
      'Game scores for games 1-6 must all be numbers. Invalid: game_1_score_b, game_6_score_b'
    );
    expect(reject(request({ game_4_score_a: undefined }))).toContain('game_4_score_a');
  });

  it('rejects an off-contract method slug and names the accepted ones', () => {
    // The D2 defect: `bayesian` used to run logistic regression and echo back
    // as `method_used: 'bayesian'`.
    expect(reject(request({ method: 'bayesian' }))).toBe(
      'Unknown prediction method "bayesian". Accepted methods: logistic_regression, bayes, elo, exponential_smoothing'
    );
    expect(reject(request({ method: 42 }))).toBe(
      'Unknown prediction method 42. Accepted methods: logistic_regression, bayes, elo, exponential_smoothing'
    );
  });

  it('reports identity before data, and data before method', () => {
    const body = request({ team_b: 'Cleveland Cavaliers', game_1_score_a: 'x', method: 'ensemble_v1' });
    expect(reject(body)).toContain('same team');
    expect(reject(request({ game_1_score_a: 'x', method: 'ensemble_v1' }))).toContain('game_1_score_a');
  });

  it('validates without rewriting what the prediction is computed from', () => {
    // Trim is a check, not a transformation: the response team names must stay
    // exactly what the caller sent, or the success path would change.
    const padded = request({ team_a: '  Cleveland Cavaliers  ' });
    expect(reject(padded)).toBeNull();
    expect((padded as { team_a: string }).team_a).toBe('  Cleveland Cavaliers  ');
  });
});
