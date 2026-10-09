import { type MutableRefObject, useState } from 'react';
import { supabase } from '@/db/supabase';
import { captureError } from '@/lib/analytics';
import { isMethodSlug } from '@/lib/method-display';
import { isSeriesId } from '@/lib/series-id';
import { deriveSeriesPhase, seriesSourceForPhase } from '@/lib/series-phase';
import { SERIES_SELECT } from '@/lib/series-query';
import { decodeSharePayload, formFromSharePayload } from '@/lib/share-payload';
import type { MethodSlug, PredictionForm } from '@/types/prediction';
import { asSeriesRow, type SelectedSeries, type SeriesNotFoundKind } from './types';

interface ArrivalDeps {
  searchParams: URLSearchParams;
  /** Owned by the controller: its reset effect bumps it on every selection change. */
  seriesLoadSeq: MutableRefObject<number>;
  fetchAllGames: () => Promise<void>;
  setSelectedSeries: (series: SelectedSeries) => void;
  setSelectedMethod: (method: MethodSlug) => void;
  setCustomInput: (form: PredictionForm) => void;
}

/**
 * URL arrival: what `?series=`, `?method=` and `?custom=` put on screen, and
 * the not-found / load-failed state of the series region.
 *
 * `arrive` is the body of the `searchParams` effect. The effect itself is
 * declared by the controller (`usePredictController`), after the selection
 * reset and the notice-retire effects, because effects run in declaration
 * order and that order is what the sequence guard depends on.
 */
export function useSeriesArrival({
  searchParams,
  seriesLoadSeq,
  fetchAllGames,
  setSelectedSeries,
  setSelectedMethod,
  setCustomInput,
}: ArrivalDeps) {
  // `?series=` preload query failure (retryable).
  const [seriesLoadFailed, setSeriesLoadFailed] = useState(false);
  const [seriesNotFound, setSeriesNotFound] = useState<SeriesNotFoundKind>(false);

  const loadSeriesById = async (seriesId: string, method: MethodSlug | null = null) => {
    const seq = ++seriesLoadSeq.current;
    // A malformed id can never name a row, and querying it would come back as
    // a uuid-cast error the retry panel could never recover from: not found,
    // with no request at all (Story 4.1).
    if (!isSeriesId(seriesId)) {
      setSeriesLoadFailed(false);
      setSeriesNotFound('series');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('series')
        .select(SERIES_SELECT)
        .eq('id', seriesId)
        .maybeSingle();

      if (error) throw error;
      // Superseded while in flight (newer preload, or the fan picked by hand):
      // this response no longer describes what should be on screen.
      if (seq !== seriesLoadSeq.current) return;

      if (data) {
        const series = asSeriesRow(data);
        setSeriesLoadFailed(false);
        setSeriesNotFound(false);
        setSelectedSeries({ source: seriesSourceForPhase(deriveSeriesPhase(series)), data: series });
        // Same batch as the selection (Story 4.1 share arrival): the series and
        // the method land together, and nothing runs until Generate (D1).
        if (method) setSelectedMethod(method);
      } else {
        // A genuinely absent row is not retryable: the in-region 404
        // treatment (Story 4.1), and the picker stays usable beside it.
        setSeriesLoadFailed(false);
        setSeriesNotFound('series');
      }
    } catch (err) {
      // Query failure (broken link, unreadable id, network miss on mount):
      // the retryable panel treatment, not a dead-end toast.
      console.error('Error loading series:', err);
      captureError(err);
      // A superseded preload still reports to analytics but must not mask
      // whatever the fan has on screen by the time it lands.
      if (seq === seriesLoadSeq.current) {
        // The panel and the not-found notice are alternative treatments of the
        // same region: an in-app move from a dead `?series=` to one whose query
        // errors would otherwise render both, and put two live regions on the
        // page.
        setSeriesNotFound(false);
        setSeriesLoadFailed(true);
      }
    }
  };

  const arrive = () => {
    fetchAllGames();

    // Load series from query parameter if provided
    const seriesId = searchParams.get('series');
    if (seriesId) {
      // `?method=` is read here but applied only in the preload's success
      // branch: setting it now would run the reset effect, bump
      // `seriesLoadSeq`, and drop the very preload this starts (Story 4.1).
      // An unknown slug is ignored, never an error.
      const method = searchParams.get('method');
      loadSeriesById(seriesId, isMethodSlug(method) ? method : null);
    } else if (searchParams.has('custom')) {
      // Story 4.4: a custom-matchup share arrival prefills the form — both
      // names, the twelve scores and the method — and, like `?series=`, runs
      // nothing until Generate (D1). A payload that does not decode is the
      // not-found treatment in the series region, with no request at all.
      const payload = decodeSharePayload(searchParams.get('custom'));
      // Supersedes any `?series=` preload still in flight from an earlier URL
      // (pinned by `predict-arrival-characterization.test.tsx`).
      seriesLoadSeq.current++;
      setSeriesLoadFailed(false);
      if (payload) {
        setSeriesNotFound(false);
        setCustomInput(formFromSharePayload(payload));
        setSelectedSeries({ source: 'custom' });
        setSelectedMethod(payload.method);
      } else {
        setSeriesNotFound('custom');
      }
    } else {
      // Leaving a not-found link for plain `/predict` retires its notice
      // (pinned by `predict-arrival-characterization.test.tsx`).
      setSeriesNotFound(false);
    }
  };

  const retryPreload = () => {
    // Only clear the flag when there is something to re-fetch; otherwise
    // Retry would dismiss the panel and fetch nothing.
    const seriesId = searchParams.get('series');
    if (!seriesId) return;
    setSeriesLoadFailed(false);
    // A share arrival's method survives the retry too.
    const method = searchParams.get('method');
    void loadSeriesById(seriesId, isMethodSlug(method) ? method : null);
  };

  return {
    seriesLoadFailed,
    seriesNotFound,
    arrive,
    retryPreload,
    /** Called by the controller's reset effect: a new selection supersedes a preload failure. */
    clearLoadFailed: () => setSeriesLoadFailed(false),
    /** Called by the controller's notice effect: only a new series retires the notice. */
    retireNotFound: () => setSeriesNotFound(false),
  };
}
