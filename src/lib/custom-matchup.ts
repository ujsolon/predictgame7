/**
 * Pure submit-time validator for Predict's custom-matchup form (Story 1.3 / FR-8).
 *
 * Returns a per-field error map keyed by the field ids `PredictPage.tsx`
 * renders (`team_a`, `team_b`, `game_<n>_score_<a|b>`), so the page owns no
 * validation logic of its own. Decision 1: no form framework — this is a
 * plain function over the existing controlled `customInput` state; errors
 * are produced at submit, never per keystroke.
 *
 * Rules: both team names are required (Decision 4); all six score pairs must
 * be present, integer, and non-negative. A score of `0` counts as missing —
 * it never occurs in a played NBA game. A score outside the typical 50-200
 * range stays a non-blocking hint (`collectRangeHints`), not a field error.
 */
import type { PredictionInput } from '@/types/prediction';

export type CustomFieldErrors = Record<string, string>;

const GAME_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

const MESSAGES = {
  nameRequired: 'Team name is required',
  scoreRequired: 'Score is required',
  scoreWhole: 'Must be a whole number',
  scoreNegative: "Can't be negative",
} as const;

export type CustomScoreField = `game_${1 | 2 | 3 | 4 | 5 | 6}_score_${'a' | 'b'}`;

function scoreError(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return MESSAGES.scoreRequired;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return MESSAGES.scoreWhole;
  if (parsed < 0) return MESSAGES.scoreNegative;
  // 0 counts as missing: it never occurs in a played NBA game.
  if (parsed === 0) return MESSAGES.scoreRequired;
  if (!Number.isInteger(parsed)) return MESSAGES.scoreWhole;
  return null;
}

/** Empty map means the input is valid and the request may leave the browser. */
export function validateCustomMatchup(input: PredictionInput): CustomFieldErrors {
  const fields: CustomFieldErrors = {};
  if ((input.team_a ?? '').trim() === '') fields.team_a = MESSAGES.nameRequired;
  if ((input.team_b ?? '').trim() === '') fields.team_b = MESSAGES.nameRequired;

  for (const game of GAME_NUMBERS) {
    for (const side of ['a', 'b'] as const) {
      const key: CustomScoreField = `game_${game}_score_${side}`;
      const error = scoreError(input[key as keyof PredictionInput]);
      if (error) fields[key] = error;
    }
  }
  return fields;
}

/**
 * Non-blocking out-of-range hints, one per affected game, in the copy the
 * app already used (`toast.warning`, not a field error).
 */
export function collectRangeHints(input: PredictionInput): string[] {
  const hints: string[] = [];
  for (const game of GAME_NUMBERS) {
    const scoreA = Number(input[`game_${game}_score_a` as keyof PredictionInput]);
    const scoreB = Number(input[`game_${game}_score_b` as keyof PredictionInput]);
    if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) continue;
    if (scoreA < 50 || scoreA > 200 || scoreB < 50 || scoreB > 200) {
      hints.push(`Note: Game ${game} scores (${scoreA}-${scoreB}) are outside the typical 50-200 range`);
    }
  }
  return hints;
}
