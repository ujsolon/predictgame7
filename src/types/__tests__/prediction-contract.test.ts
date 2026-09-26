import { describe, expect, it } from 'vitest';

import { METHOD_LABELS, METHOD_MATHS_ANCHORS } from '@/lib/method-display';
import type {
  MethodSlug,
  PredictionInput,
  PredictionResult,
} from '@/types/prediction';

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

const customRequest = (method: MethodSlug): PredictionInput => ({
  team_a: 'Cleveland Cavaliers',
  team_b: 'Golden State Warriors',
  ...sixGameScores,
  method,
});

describe('prediction contract (AD-2)', () => {
  it('carries exactly the four slugs the Edge Function branches on', () => {
    expect(Object.keys(METHOD_LABELS)).toEqual([
      'logistic_regression',
      'bayes',
      'elo',
      'exponential_smoothing',
    ]);
  });

  it('labels every slug the pages read from, instead of a display fallback', () => {
    expect(Object.values(METHOD_LABELS)).not.toContain('Not selected');
    expect(METHOD_LABELS.bayes).toBe('Bayes Method');
  });

  it('gives every labelled slug a Maths section to link to', () => {
    expect(Object.keys(METHOD_MATHS_ANCHORS)).toEqual(Object.keys(METHOD_LABELS));
    expect(Object.values(METHOD_MATHS_ANCHORS)).toEqual([
      'logistic-regression',
      'bayesian-inference',
      'elo-rating',
      'exponential-smoothing',
    ]);
  });

  it('types a custom-series request for each method', () => {
    const slugs = Object.keys(METHOD_LABELS) as MethodSlug[];
    const requests = slugs.map(customRequest);

    expect(requests.map((request) => request.method)).toEqual(slugs);
    expect(requests[1]).toMatchObject({
      method: 'bayes',
      team_a: 'Cleveland Cavaliers',
      game_6_score_b: 113,
    });
  });

  it('types the response the UI reads, with probabilities as 0-100 percentages', () => {
    const result: PredictionResult = {
      predicted_winner: 'Cleveland Cavaliers',
      team_a: 'Cleveland Cavaliers',
      team_b: 'Golden State Warriors',
      team_a_logo: 'https://cdn.example/cle.png',
      team_b_logo: null,
      win_probability_a: 62.5,
      win_probability_b: 37.5,
      confidence_level: 'High',
      contributing_factors: [
        {
          factor: 'Cleveland Cavaliers leads cumulative differential',
          description: 'Cleveland Cavaliers outscored the opposition by 16 total points.',
          impact: 0.16,
        },
      ],
      computation_time_ms: 3,
      method_used: 'bayes',
    };

    expect(result.win_probability_a + result.win_probability_b).toBeCloseTo(100);
    expect(METHOD_LABELS[result.method_used]).toBe('Bayes Method');
  });
});

describe('stale slug tripwire', () => {
  // Enforced by `tsc -b`, not by this runner: Vitest strips types without
  // checking them. The case stays so the compile gate has a named failure site
  // if the slug the contract deleted ever comes back.
  it('is a compile-time guard', () => {
    // @ts-expect-error 'bayesian' is not a MethodSlug
    const stale: MethodSlug = 'bayesian';

    expect(stale).toBe('bayesian');
  });
});
