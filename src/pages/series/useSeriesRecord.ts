import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';
import { captureError } from '@/lib/analytics';
import { SERIES_PAGE_SELECT } from '@/lib/series-query';
import type { Series } from '@/types/types';

export type SeriesRecordState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'found'; series: Series };

/**
 * The one fetch a series page makes (Story 4.3): the full `SERIES_PAGE_SELECT`
 * projection (Story 4.5: `SERIES_SELECT` plus `is_featured` and the
 * `series_content` embed) for a single id. `enabled: false` (a malformed id)
 * answers not-found without any request.
 * A query error is retryable: `retry()` re-runs the same fetch.
 */
export function useSeriesRecord(id: string, enabled: boolean): { state: SeriesRecordState; retry: () => void } {
  const [state, setState] = useState<SeriesRecordState>(enabled ? { status: 'loading' } : { status: 'not-found' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'not-found' });
      return;
    }
    let current = true;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const { data, error } = await supabase.from('series').select(SERIES_PAGE_SELECT).eq('id', id).maybeSingle();
        if (error) throw error;
        if (current) setState(data ? { status: 'found', series: data as unknown as Series } : { status: 'not-found' });
      } catch (err) {
        console.error('Error loading series:', err);
        captureError(err);
        if (current) setState({ status: 'error' });
      }
    })();
    return () => {
      current = false;
    };
  }, [id, enabled, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}
