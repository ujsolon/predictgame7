import type { MethodSlug } from '@/types/prediction';

/**
 * The only slug -> display mapping in the app (AD-2). Keyed by `MethodSlug`, so
 * adding or renaming a slug in the contract fails the typecheck gate here first.
 */
export const METHOD_LABELS: Record<MethodSlug, string> = {
  logistic_regression: 'Logistic Regression',
  bayes: 'Bayes Method',
  elo: 'Elo Rating',
  exponential_smoothing: 'Exponential Smoothing',
};

/**
 * The one-line description the Predict method card shows under the label
 * (Story 4.4, D3). Keyed by `MethodSlug` like `METHOD_LABELS`, so a new slug
 * cannot ship with a silently empty description.
 */
export const METHOD_DESCRIPTIONS: Record<MethodSlug, string> = {
  logistic_regression:
    'A statistical model that predicts the probability of a binary outcome based on individual game point differentials from the series.',
  bayes:
    'A Bayesian inference model that sequentially updates win probability using point differentials from each game as evidence.',
  elo: 'An Elo-based rating system where team ratings update after each game based on the result and margin of victory.',
  exponential_smoothing:
    'A momentum-based model that applies a decay factor, giving exponentially more weight to recent game results.',
};

/** MathsPage section `id` per method — see the `methods` array in `src/pages/MathsPage.tsx`. */
export const METHOD_MATHS_ANCHORS: Record<MethodSlug, string> = {
  logistic_regression: 'logistic-regression',
  bayes: 'bayesian-inference',
  elo: 'elo-rating',
  exponential_smoothing: 'exponential-smoothing',
};

/**
 * Narrows a URL `?method=` value to a `MethodSlug` (Story 4.1). The own-key
 * check against `METHOD_LABELS` is the only slug list in the client — its keys
 * are pinned to the function's `ACCEPTED_METHOD_SLUGS` by
 * `predict-request.test.ts` — so an unknown slug is simply not a method.
 */
export function isMethodSlug(value: string | null | undefined): value is MethodSlug {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(METHOD_LABELS, value);
}
