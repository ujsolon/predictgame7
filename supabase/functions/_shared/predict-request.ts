/**
 * Request-boundary rules for `predict-game-7`, free of platform APIs.
 *
 * This module imports nothing, on purpose. Deno resolves a relative specifier only
 * with its extension, and `tsc -b` rejects that extension unless
 * `allowImportingTsExtensions` is on — so a module both harnesses reach cannot
 * import `contract.ts`. The accepted method slugs arrive as an argument from
 * `index.ts`, the one file that can tie them to `MethodSlug` at compile time.
 *
 * Returning the message rather than a `Response` is what lets Vitest pin the whole
 * 400 vocabulary without a Deno runtime.
 */

/** The slugs the function will accept; drift is caught on both sides — see `index.ts`. */
export const ACCEPTED_METHOD_SLUGS = [
  'logistic_regression',
  'bayes',
  'elo',
  'exponential_smoothing',
] as const;

/** The twelve score fields a prediction is computed from, in the order the grid reads them. */
export const SCORE_FIELDS = [
  'game_1_score_a',
  'game_1_score_b',
  'game_2_score_a',
  'game_2_score_b',
  'game_3_score_a',
  'game_3_score_b',
  'game_4_score_a',
  'game_4_score_b',
  'game_5_score_a',
  'game_5_score_b',
  'game_6_score_a',
  'game_6_score_b',
] as const;

/** Reused verbatim from the pre-existing check, so the vocabulary stays four rows long. */
const TEAM_NAMES_REQUIRED = 'Team names are required';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const trimmedTeam = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Returns the `error` string a rejected request should carry, or null when the
 * body conforms to `PredictionInput` well enough to compute a prediction.
 *
 * Identity errors are reported before data errors, so a caller that sends both
 * hears about the matchup before the scores.
 */
export function validatePredictionRequest(
  body: unknown,
  acceptedMethodSlugs: readonly string[]
): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return TEAM_NAMES_REQUIRED;
  }
  const request = body as Record<string, unknown>;

  const teamA = trimmedTeam(request.team_a);
  const teamB = trimmedTeam(request.team_b);
  if (teamA === '' || teamB === '') return TEAM_NAMES_REQUIRED;
  if (teamA.toLowerCase() === teamB.toLowerCase()) {
    return 'Team A and Team B are the same team. Pick two different teams to predict.';
  }

  const invalidScores = SCORE_FIELDS.filter((field) => !isFiniteNumber(request[field]));
  if (invalidScores.length > 0) {
    return `Game scores for games 1-6 must all be numbers. Invalid: ${invalidScores.join(', ')}`;
  }

  const method = request.method;
  if (method !== undefined && !acceptedMethodSlugs.includes(method as string)) {
    // The client renders this string verbatim in the retry panel, so a non-string
    // still has to read as copy — `String({a:1})` would say `[object Object]`.
    const shown = typeof method === 'string' ? `"${method}"` : JSON.stringify(method);
    return `Unknown prediction method ${shown}. Accepted methods: ${acceptedMethodSlugs.join(', ')}`;
  }

  return null;
}
