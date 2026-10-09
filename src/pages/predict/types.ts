import type { Series } from '@/types/types';

export type SeriesSource = 'current' | 'historical' | 'custom';

export interface SelectedSeries {
  source: SeriesSource;
  data?: Series;
}

/**
 * Story 4.1: a `?series=` id that is malformed or names no row. Not retryable,
 * so it is the in-region 404 treatment, never the retry panel. Story 4.4:
 * `'custom'` is the same treatment for a `?custom=` share link that does not
 * decode.
 */
export type SeriesNotFoundKind = false | 'series' | 'custom';

// supabase-js has no generated Database types in this app, so `series` rows come
// back with their to-one embeds typed as arrays. These two casts are the only
// places the picker reads a row as `Series` (Home's pending read has its own,
// equally unvalidated, cast); nothing is validated.
export const asSeries = (rows: unknown): Series[] => (Array.isArray(rows) ? rows : []) as Series[];
export const asSeriesRow = (row: unknown): Series => row as Series;
