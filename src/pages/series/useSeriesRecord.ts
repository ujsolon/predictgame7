import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { captureError } from '@/lib/analytics';
import { isSeriesId } from '@/lib/series-id';
import { SERIES_PAGE_SELECT } from '@/lib/series-query';
import { parseSeriesYear, seriesSlug } from '@/lib/series-slug';
import type { Series } from '@/types/types';

export type SeriesRecordState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'found'; series: Series };

/**
 * How a series page names its row (Story 6.1): by `series.id` (the uuid
 * routes, a pending preview's background refresh, an in-app hop from a uuid
 * route), or by `/series/<year>/<slug>` — which reads that year's series and
 * matches the slug through `seriesSlug`, the one slug helper, so a series born
 * after the last deploy (no prerendered page) still resolves.
 */
export type SeriesLookup = { by: 'id'; id: string } | { by: 'slug'; year: number; slug: string };

/** A lookup from route parameters; `null` when they can never name a row (no request is made). */
export function lookupFrom(params: { id?: string; year?: string; slug?: string }): SeriesLookup | null {
  if (params.id !== undefined) return isSeriesId(params.id) ? { by: 'id', id: params.id } : null;
  const year = parseSeriesYear(params.year);
  const slug = params.slug ? normaliseSlug(params.slug) : '';
  return year !== null && slug ? { by: 'slug', year, slug } : null;
}

/** A slug segment as typed or pasted: URI-decoded (when it decodes) and lowercased, so `Warriors-Cavaliers` matches. */
function normaliseSlug(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // A malformed escape stays as written; it will simply match nothing.
  }
  return decoded.toLowerCase();
}

function lookupKey(lookup: SeriesLookup | null): string {
  if (!lookup) return '';
  return lookup.by === 'id' ? `id:${lookup.id}` : `slug:${lookup.year}/${lookup.slug}`;
}

/**
 * The one fetch a series page makes (Story 4.3): the full `SERIES_PAGE_SELECT`
 * projection (Story 4.5: `SERIES_SELECT` plus `is_featured` and the
 * `series_content` embed) for a single id — or, since Story 6.1, for one
 * year, matched to the slug client-side. A `null` lookup or `enabled: false`
 * answers not-found without any request.
 * A query error is retryable: `retry()` re-runs the same fetch.
 */
export function useSeriesRecord(
  lookup: SeriesLookup | null,
  enabled: boolean
): { state: SeriesRecordState; retry: () => void } {
  const active = enabled && lookup !== null;
  const [state, setState] = useState<SeriesRecordState>(active ? { status: 'loading' } : { status: 'not-found' });
  const [attempt, setAttempt] = useState(0);
  const key = lookupKey(lookup);

  // `key` stands for `lookup`, whose identity changes every render.
  useEffect(() => {
    if (!active || !lookup) {
      setState({ status: 'not-found' });
      return;
    }
    let current = true;
    setState({ status: 'loading' });
    void (async () => {
      try {
        let found: Series | null;
        if (lookup.by === 'id') {
          const { data, error } = await supabase.from('series').select(SERIES_PAGE_SELECT).eq('id', lookup.id).maybeSingle();
          if (error) throw error;
          found = (data as unknown as Series | null) ?? null;
        } else {
          const { data, error } = await supabase.from('series').select(SERIES_PAGE_SELECT).eq('year', lookup.year);
          if (error) throw error;
          const rows = (data ?? []) as unknown as Series[];
          found = rows.find((row) => seriesSlug(row) === lookup.slug) ?? null;
        }
        if (current) setState(found ? { status: 'found', series: found } : { status: 'not-found' });
      } catch (err) {
        console.error('Error loading series:', err);
        captureError(err);
        if (current) setState({ status: 'error' });
      }
    })();
    return () => {
      current = false;
    };
  }, [key, active, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}
