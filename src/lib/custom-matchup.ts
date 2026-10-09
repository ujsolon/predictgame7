/**
 * The one score rule set for both Predict request paths (Story 1.3 / FR-8,
 * consolidated by Story 4.4 / D3), plus the custom-matchup form validator.
 *
 * `scoreError` is the rule set: a score is required (`0` counts as missing —
 * it never occurs in a played NBA game), a whole number, and not negative.
 * Both paths read it, and each keeps its own surface:
 *
 * - `validateCustomMatchup` returns a per-field error map keyed by the field
 *   ids `src/pages/predict/SeriesCard.tsx` renders (`team_a`, `team_b`, `game_<n>_score_<a|b>`),
 *   shown inline at submit, never per keystroke (Decision 1);
 * - `validateScores` returns the first failure of a stored series' scores in
 *   the same wording, prefixed "Game N:" — series rows are not editable, so
 *   the page shows it as a toast (EXPERIENCE.md, Story 1.3 Decision 1).
 *
 * A score outside the typical 50-200 range is a non-blocking hint on both
 * paths (`collectRangeHints`), never an error.
 */
import type { GameNumber, PredictionForm, ScoreFields, ScoreKey } from '@/types/prediction';
import { isRecognizedTeam } from '@/lib/team-logos';

export type CustomFieldErrors = Record<string, string>;

export const GAME_NUMBERS: readonly GameNumber[] = [1, 2, 3, 4, 5, 6];

export function scoreKey(game: GameNumber, side: 'a' | 'b'): ScoreKey {
  return `game_${game}_score_${side}`;
}

/** The twelve score fields in grid (and wire) order: game 1 a, game 1 b, … game 6 b. */
export const SCORE_KEYS: readonly ScoreKey[] = GAME_NUMBERS.flatMap((game) => [scoreKey(game, 'a'), scoreKey(game, 'b')]);

const MESSAGES = {
  nameRequired: 'Team name is required',
  scoreRequired: 'Score is required',
  scoreWhole: 'Must be a whole number',
  scoreNegative: "Can't be negative",
} as const;

/** The shared score rule set. Null when the value is a usable score. */
export function scoreError(value: unknown): string | null {
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
export function validateCustomMatchup(input: PredictionForm): CustomFieldErrors {
  const fields: CustomFieldErrors = {};
  if ((input.team_a ?? '').trim() === '') fields.team_a = MESSAGES.nameRequired;
  if ((input.team_b ?? '').trim() === '') fields.team_b = MESSAGES.nameRequired;

  for (const key of SCORE_KEYS) {
    const error = scoreError(input[key]);
    if (error) fields[key] = error;
  }
  return fields;
}

/**
 * The series path's check over the same rules: the first failing score in
 * grid order as "Game N: <rule wording>", or null when all twelve pass.
 */
export function validateScores(scores: Partial<ScoreFields>): string | null {
  for (const game of GAME_NUMBERS) {
    for (const side of ['a', 'b'] as const) {
      const error = scoreError(scores[scoreKey(game, side)]);
      if (error) return `Game ${game}: ${error}`;
    }
  }
  return null;
}

/**
 * Narrows validated scores to the complete, numeric shape a request carries,
 * built in grid order (so the wire's key order never depends on the order the
 * fan typed in). Null if any score is not a finite number.
 */
export function completeScores(scores: Partial<ScoreFields>): ScoreFields | null {
  const out: Partial<ScoreFields> = {};
  for (const key of SCORE_KEYS) {
    const value = scores[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    out[key] = value;
  }
  return out as ScoreFields;
}

/**
 * Non-blocking out-of-range hints, one per affected game, in the copy the
 * app already used (`toast.warning`, not a field error). Both paths.
 */
export function collectRangeHints(scores: Partial<ScoreFields>): string[] {
  const hints: string[] = [];
  for (const game of GAME_NUMBERS) {
    const scoreA = Number(scores[scoreKey(game, 'a')]);
    const scoreB = Number(scores[scoreKey(game, 'b')]);
    if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) continue;
    if (scoreA < 50 || scoreA > 200 || scoreB < 50 || scoreB > 200) {
      hints.push(`Note: Game ${game} scores (${scoreA}-${scoreB}) are outside the typical 50-200 range`);
    }
  }
  return hints;
}

/**
 * Non-blocking unrecognized-name hints (Story 1.4 / Decision 4), one per
 * custom team name the logo alias map does not recognize: `toast.warning`
 * naming the team and saying a placeholder logo is used — never a field
 * error, never a blocked request. Blank names are skipped: the validator
 * owns those.
 */
export function collectTeamNameHints(input: Pick<PredictionForm, 'team_a' | 'team_b'>): string[] {
  const hints: string[] = [];
  for (const field of ['team_a', 'team_b'] as const) {
    const name = (input[field] ?? '').trim();
    if (name && !isRecognizedTeam(name)) {
      hints.push(`Note: "${name}" isn't in our team list yet — showing a placeholder logo.`);
    }
  }
  return hints;
}
