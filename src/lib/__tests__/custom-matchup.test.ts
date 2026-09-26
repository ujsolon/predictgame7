import { describe, expect, it } from 'vitest';

import { collectRangeHints, validateCustomMatchup } from '@/lib/custom-matchup';

const validInput = {
  team_a: 'Boston Celtics',
  team_b: 'Miami Heat',
  game_1_score_a: 102,
  game_1_score_b: 98,
  game_2_score_a: 96,
  game_2_score_b: 104,
  game_3_score_a: 110,
  game_3_score_b: 101,
  game_4_score_a: 99,
  game_4_score_b: 94,
  game_5_score_a: 105,
  game_5_score_b: 112,
  game_6_score_a: 97,
  game_6_score_b: 89,
};

const custom = (overrides: Record<string, unknown>) =>
  ({ ...validInput, ...overrides }) as never;

describe('validateCustomMatchup — valid input', () => {
  it('returns an empty map for a fully valid matchup', () => {
    expect(validateCustomMatchup(custom({}))).toEqual({});
  });
});

describe('validateCustomMatchup — team names (Decision 4)', () => {
  it('flags both blank names', () => {
    expect(validateCustomMatchup(custom({ team_a: '', team_b: '   ' }))).toEqual({
      team_a: 'Team name is required',
      team_b: 'Team name is required',
    });
  });

  it('does not fall back to placeholder names for whitespace-padded input', () => {
    expect(validateCustomMatchup(custom({ team_a: ' Celtics ' }))).toEqual({});
  });
});

describe('validateCustomMatchup — scores', () => {
  it('treats a blank score as missing, keyed by the field id', () => {
    expect(validateCustomMatchup(custom({ game_3_score_a: undefined }))).toEqual({
      game_3_score_a: 'Score is required',
    });
  });

  it('reports every offending field, not just the first (two blank scores → two errors)', () => {
    const fields = validateCustomMatchup(
      custom({ game_1_score_a: undefined, game_5_score_b: '' })
    );
    expect(fields).toEqual({
      game_1_score_a: 'Score is required',
      game_5_score_b: 'Score is required',
    });
  });

  it('counts a score of 0 as missing', () => {
    expect(validateCustomMatchup(custom({ game_2_score_b: 0 }))).toEqual({
      game_2_score_b: 'Score is required',
    });
  });

  it('flags non-integer scores', () => {
    expect(validateCustomMatchup(custom({ game_6_score_a: 99.5 }))).toEqual({
      game_6_score_a: 'Must be a whole number',
    });
  });

  it('flags negative scores', () => {
    expect(validateCustomMatchup(custom({ game_4_score_a: -3 }))).toEqual({
      game_4_score_a: "Can't be negative",
    });
  });

  it('keys each error by the matching game_N_score_side field id', () => {
    const fields = validateCustomMatchup(custom({ game_6_score_b: undefined }));
    expect(Object.keys(fields)).toEqual(['game_6_score_b']);
  });
});

describe('collectRangeHints — out-of-50-200 stays a non-blocking hint', () => {
  it('emits the existing warning copy per affected game', () => {
    expect(collectRangeHints(custom({ game_1_score_a: 250 }))).toEqual([
      'Note: Game 1 scores (250-98) are outside the typical 50-200 range',
    ]);
  });

  it('does not flag in-range input', () => {
    expect(collectRangeHints(custom({}))).toEqual([]);
  });

  it('stays silent for missing scores — the validator owns those', () => {
    expect(collectRangeHints(custom({ game_2_score_a: undefined }))).toEqual([]);
  });

  it('a 250-point score produces a hint but never a field error', () => {
    expect(validateCustomMatchup(custom({ game_1_score_a: 250 }))).toEqual({});
    expect(collectRangeHints(custom({ game_1_score_a: 250 })).length).toBe(1);
  });
});
