import { describe, expect, it } from 'vitest';

import { buildCustomRequest, buildSeriesRequest, SERIES_TOO_SHORT } from '@/lib/prediction-request';
import type { PredictionForm } from '@/types/prediction';
import type { Series } from '@/types/types';

// The Predict page suites' `seriesFixture` (`src/pages/__tests__/helpers.tsx`),
// restated here so this node-environment suite does not load the page harness.
const seriesFixture: Series = {
  id: 's-1',
  year: 2022,
  round: 'Finals',
  league: 'NBA',
  team_a_id: 11,
  team_b_id: 22,
  created_at: 'c',
  team_a: { id: 11, full_name: 'Boston Celtics', abbreviation: 'BOS', created_at: 'a' },
  team_b: { id: 22, full_name: 'Miami Heat', abbreviation: 'MIA', created_at: 'b' },
  series_game_scores: [1, 2, 3, 4, 5, 6].map((game) => ({
    id: `g${game}`,
    series_id: 's-1',
    game_number: game,
    home_team_id: game % 2 === 0 ? 22 : 11,
    away_team_id: game % 2 === 0 ? 11 : 22,
    home_score: 100 + game,
    away_score: 90 + game,
    created_at: 'd',
  })),
};

// Story 4.4 (D3): the typed builders must produce exactly the bodies the page
// assembled through `any` before — the same values AND the same key order, so
// the JSON wire is byte-for-byte unchanged (`predict-flow-regression.test.tsx`
// pins the same bodies at the page level).

const game7 = {
  id: 'g7',
  series_id: 's-1',
  game_number: 7,
  home_team_id: 22,
  away_team_id: 11,
  home_score: 98,
  away_score: 102,
  created_at: 'd',
};

const baseGames = seriesFixture.series_game_scores ?? [];

/** The pre-4.4 series body, rebuilt the way `PredictPage` built it (literal keys in insertion order). */
const legacySeriesBody = {
  series_id: 's-1',
  team_a: 'Boston Celtics',
  team_b: 'Miami Heat',
  method: 'logistic_regression',
  game_1_score_a: 101,
  game_1_score_b: 91,
  game_2_score_a: 92,
  game_2_score_b: 102,
  game_3_score_a: 103,
  game_3_score_b: 93,
  game_4_score_a: 94,
  game_4_score_b: 104,
  game_5_score_a: 105,
  game_5_score_b: 95,
  game_6_score_a: 96,
  game_6_score_b: 106,
  home_team: 'Miami Heat',
};

const form: PredictionForm = {
  team_a: '  BOS ',
  team_b: 'MIA',
  game_1_score_a: 101,
  game_1_score_b: 91,
  game_2_score_a: 102,
  game_2_score_b: 92,
  game_3_score_a: 103,
  game_3_score_b: 93,
  game_4_score_a: 104,
  game_4_score_b: 94,
  game_5_score_a: 105,
  game_5_score_b: 95,
  game_6_score_a: 106,
  game_6_score_b: 96,
};

/** The pre-4.4 custom body: `{ ...customInput, team_a, team_b, home_team: undefined, method }`. */
const legacyCustomBody = {
  team_a: 'BOS',
  team_b: 'MIA',
  game_1_score_a: 101,
  game_1_score_b: 91,
  game_2_score_a: 102,
  game_2_score_b: 92,
  game_3_score_a: 103,
  game_3_score_b: 93,
  game_4_score_a: 104,
  game_4_score_b: 94,
  game_5_score_a: 105,
  game_5_score_b: 95,
  game_6_score_a: 106,
  game_6_score_b: 96,
  home_team: undefined,
  method: 'bayes',
};

describe('buildSeriesRequest (Story 4.4, D3)', () => {
  it("equals today's series body, key order included, with home_team from the Game 7 row", () => {
    const built = buildSeriesRequest({ ...seriesFixture, series_game_scores: [...baseGames, game7] }, 'logistic_regression');
    if (!built.ok) throw new Error(built.error);
    expect(built.request).toEqual(legacySeriesBody);
    expect(JSON.stringify(built.request)).toBe(JSON.stringify(legacySeriesBody));
    expect(Object.keys(built.request)).toEqual(Object.keys(legacySeriesBody));
    expect(built.hints).toEqual([]);
  });

  it('keeps home_team as a present undefined key when there is no Game 7 row', () => {
    const built = buildSeriesRequest(seriesFixture, 'elo');
    if (!built.ok) throw new Error(built.error);
    expect('home_team' in built.request).toBe(true);
    expect(built.request.home_team).toBeUndefined();
    expect(JSON.stringify(built.request)).toBe(
      JSON.stringify({ ...legacySeriesBody, method: 'elo', home_team: undefined })
    );
  });

  it('sorts the stored rows by game number before mapping them', () => {
    const shuffled: Series = { ...seriesFixture, series_game_scores: [...baseGames].reverse() };
    const built = buildSeriesRequest(shuffled, 'elo');
    expect(built.ok && built.request.game_1_score_a).toBe(101);
  });

  it('keeps the Team A / Team B fallback for a missing FK row (unchanged)', () => {
    const built = buildSeriesRequest({ ...seriesFixture, team_a: undefined }, 'elo');
    expect(built.ok && built.request.team_a).toBe('Team A');
  });

  it('fails with the toast copy for too few rows, a missing game and each score rule', () => {
    expect(buildSeriesRequest({ ...seriesFixture, series_game_scores: baseGames.slice(0, 5) }, 'elo')).toEqual({
      ok: false,
      error: SERIES_TOO_SHORT,
    });
    expect(
      buildSeriesRequest({ ...seriesFixture, series_game_scores: [...baseGames.filter((g) => g.game_number !== 3), game7] }, 'elo')
    ).toEqual({ ok: false, error: 'Game 3 is missing for the selected series.' });
    const withScore = (game: number, scores: object): Series => ({
      ...seriesFixture,
      series_game_scores: baseGames.map((g) => (g.game_number === game ? { ...g, ...scores } : g)),
    });
    expect(buildSeriesRequest(withScore(2, { home_score: 0 }), 'elo')).toEqual({ ok: false, error: 'Game 2: Score is required' });
    expect(buildSeriesRequest(withScore(1, { home_score: 99.5 }), 'elo')).toEqual({ ok: false, error: 'Game 1: Must be a whole number' });
    expect(buildSeriesRequest(withScore(4, { away_score: -5 }), 'elo')).toEqual({ ok: false, error: "Game 4: Can't be negative" });
  });

  it('returns the out-of-range note as a non-blocking hint, in the shared wording', () => {
    const built = buildSeriesRequest(
      { ...seriesFixture, series_game_scores: baseGames.map((g) => (g.game_number === 1 ? { ...g, home_score: 48 } : g)) },
      'elo'
    );
    expect(built).toMatchObject({ ok: true, hints: ['Note: Game 1 scores (48-91) are outside the typical 50-200 range'] });
  });
});

describe('buildCustomRequest (Story 4.4, D3)', () => {
  it("equals today's custom body, key order included, with trimmed names", () => {
    const built = buildCustomRequest(form, 'bayes');
    if (!built.ok) throw new Error('invalid');
    expect(built.request).toEqual(legacyCustomBody);
    expect(Object.keys(built.request)).toEqual(Object.keys(legacyCustomBody));
    expect(JSON.stringify(built.request)).toBe(JSON.stringify(legacyCustomBody));
  });

  it('builds the same key order whatever order the fan filled the fields in', () => {
    const scrambled: PredictionForm = { team_b: 'MIA', team_a: 'BOS' };
    for (const key of Object.keys(form).reverse()) {
      if (key.startsWith('game_')) Object.assign(scrambled, { [key]: form[key as keyof PredictionForm] });
    }
    const built = buildCustomRequest(scrambled, 'bayes');
    expect(built.ok && JSON.stringify(built.request)).toBe(JSON.stringify(legacyCustomBody));
  });

  it('returns the field map for invalid input, and no request', () => {
    expect(buildCustomRequest({ ...form, team_a: '', game_2_score_b: 0 }, 'bayes')).toEqual({
      ok: false,
      fields: { team_a: 'Team name is required', game_2_score_b: 'Score is required' },
    });
  });

  it('returns range hints first, then unrecognized-name hints', () => {
    const built = buildCustomRequest({ ...form, team_b: 'Nowhere FC', game_1_score_a: 48 }, 'bayes');
    expect(built).toMatchObject({
      ok: true,
      hints: [
        'Note: Game 1 scores (48-91) are outside the typical 50-200 range',
        'Note: "Nowhere FC" isn\'t in our team list yet — showing a placeholder logo.',
      ],
    });
  });
});
