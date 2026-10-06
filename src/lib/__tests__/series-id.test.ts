import { describe, expect, it } from 'vitest';

import { isMethodSlug } from '@/lib/method-display';
import { isSeriesId } from '@/lib/series-id';

// Story 4.1: the two URL guards behind `/series/:id` and Predict's
// `?series=` / `?method=` preload.
describe('isSeriesId', () => {
  it('accepts a lowercase and an uppercase UUID', () => {
    expect(isSeriesId('7b0c6e1a-3f2d-4c5e-9a8b-1d2e3f4a5b6c')).toBe(true);
    expect(isSeriesId('7B0C6E1A-3F2D-4C5E-9A8B-1D2E3F4A5B6C')).toBe(true);
  });

  it('accepts the nil UUID (shape only; the lookup decides existence)', () => {
    expect(isSeriesId('00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('rejects surrounding whitespace, a too-long string, and non-UUIDs', () => {
    expect(isSeriesId(' 7b0c6e1a-3f2d-4c5e-9a8b-1d2e3f4a5b6c')).toBe(false);
    expect(isSeriesId('7b0c6e1a-3f2d-4c5e-9a8b-1d2e3f4a5b6c ')).toBe(false);
    expect(isSeriesId('7b0c6e1a-3f2d-4c5e-9a8b-1d2e3f4a5b6c0')).toBe(false);
    expect(isSeriesId('abc')).toBe(false);
    expect(isSeriesId('')).toBe(false);
    expect(isSeriesId(null)).toBe(false);
    expect(isSeriesId(undefined)).toBe(false);
  });
});

describe('isMethodSlug', () => {
  it('accepts every METHOD_LABELS key', () => {
    for (const slug of ['logistic_regression', 'bayes', 'elo', 'exponential_smoothing']) {
      expect(isMethodSlug(slug)).toBe(true);
    }
  });

  it('rejects null, empty, wrong case, and inherited property names', () => {
    expect(isMethodSlug(null)).toBe(false);
    expect(isMethodSlug(undefined)).toBe(false);
    expect(isMethodSlug('')).toBe(false);
    expect(isMethodSlug('Elo')).toBe(false);
    expect(isMethodSlug('toString')).toBe(false);
    expect(isMethodSlug('__proto__')).toBe(false);
  });
});
