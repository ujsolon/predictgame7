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
