import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MethodSlug, PredictionForm, ScoreKey } from '@/types/prediction';
import type { SelectedSeries } from './types';
import { usePrediction } from './usePrediction';
import { useSeriesArrival } from './useSeriesArrival';
import { useSeriesCatalog } from './useSeriesCatalog';

/**
 * The Predict page's state controller (Story 6.0). It owns the selection
 * (series, method, custom form) and both sequence guards, composes the
 * catalog, arrival and prediction hooks, and declares **every** page effect
 * here, in one place, in the order the unsplit page declared them:
 *
 *   1. selection reset   [selectedSeries, selectedMethod, customInput]
 *   2. notice retire     [selectedSeries]
 *   3. URL arrival       [searchParams]
 *   4. field-error clear [selectedSeries, selectedMethod]
 *
 * Effects run in declaration order, and that order is load-bearing: in the
 * mount commit (and any commit that changes both the selection and the URL)
 * the reset's `seriesLoadSeq` bump must happen before the preload captures its
 * own sequence, and the notice retire must run before an arrival that raises
 * the notice. The composed hooks therefore declare no effects of their own
 * (enforced by `src/pages/__tests__/predict-effect-order.test.ts`).
 *
 * `onSelectionReset` is the page's part of a reset (hiding the detailed view).
 */
export function usePredictController(onSelectionReset: () => void) {
  const [searchParams] = useSearchParams();
  const [selectedSeries, setSelectedSeries] = useState<SelectedSeries | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<MethodSlug | null>(null);
  // Story 4.4 (D3): the derived form type — a blank score is simply absent.
  const [customInput, setCustomInput] = useState<PredictionForm>({ team_a: '', team_b: '' });
  const setCustomScore = (key: ScoreKey, value: string) => {
    const next: PredictionForm = { ...customInput };
    next[key] = value === '' ? undefined : Number(value);
    setCustomInput(next);
  };

  // Bumped by every `?series=` load and every new fan input; an in-flight
  // preload whose sequence no longer matches has been superseded, so its
  // late response (success or failure) must not touch on-screen state.
  const seriesLoadSeq = useRef(0);
  // Same discipline for the predict request: bumped by the reset effect and by
  // every new attempt, so a response that lands after a method switch, a new
  // selection, or a newer submit cannot show one attempt's probabilities under
  // another attempt's label.
  const predictSeq = useRef(0);

  const catalog = useSeriesCatalog();
  const prediction = usePrediction({ predictSeq, selectedSeries, selectedMethod, customInput });
  const arrival = useSeriesArrival({
    searchParams,
    seriesLoadSeq,
    fetchAllGames: catalog.fetchAllGames,
    setSelectedSeries,
    setSelectedMethod,
    setCustomInput,
  });

  // 1. Declared before the `?series=` effect on purpose: effects run in
  // declaration order, so on mount the sequence bump below happens before the
  // preload captures its own sequence.
  useEffect(() => {
    prediction.retire();
    onSelectionReset();
    // A new selection supersedes the previous preload failure; leaving it set
    // would keep "Couldn't load this series." masking a result fetched by hand
    // afterwards.
    arrival.clearLoadFailed();
    // ...and supersedes any preload still in flight: bumping the sequence here
    // is what stops a late-arriving response from re-setting the flag over a
    // result the fan has already fetched, or overwriting the manual selection.
    seriesLoadSeq.current++;
    // A new selection already threw away the visible result, so it throws away
    // the in-flight prediction that would have produced it too.
    predictSeq.current++;
  }, [selectedSeries, selectedMethod, customInput]);

  // 2. A not-found `?series=` notice is retired by a new series only — choosing
  // a method or typing custom scores leaves it standing (Story 4.1).
  useEffect(() => {
    arrival.retireNotFound();
  }, [selectedSeries]);

  // 3. URL arrival: `?series=`, `?method=`, `?custom=` (see `useSeriesArrival`).
  useEffect(() => {
    arrival.arrive();
  }, [searchParams]);

  // 4. Field errors are the last submit's verdict on the last matchup, so a new
  // series or method retires them. Typing does not — EXPERIENCE.md · Inline
  // field error clears on the next valid submit, never per keystroke.
  useEffect(() => {
    prediction.clearFieldErrors();
  }, [selectedSeries, selectedMethod]);

  // "New Prediction": back to an empty page, URL untouched (Story 1.4).
  const startOver = () => {
    prediction.clearResult();
    setSelectedSeries(null);
    setSelectedMethod(null);
  };

  // Only state and the handlers the cards are meant to call; the hooks'
  // internal retire/clear functions stay behind the controller's effects.
  return {
    selectedSeries,
    setSelectedSeries,
    selectedMethod,
    setSelectedMethod,
    customInput,
    setCustomInput,
    setCustomScore,
    catalog: {
      games: catalog.games,
      pendingGames: catalog.pendingGames,
      seriesListFailed: catalog.seriesListFailed,
      seriesListLoaded: catalog.seriesListLoaded,
      retrySeriesList: catalog.retrySeriesList,
      rowFor: catalog.rowFor,
    },
    loading: prediction.loading,
    result: prediction.result,
    predictFailure: prediction.predictFailure,
    customFieldErrors: prediction.customFieldErrors,
    handlePredict: prediction.handlePredict,
    seriesLoadFailed: arrival.seriesLoadFailed,
    seriesNotFound: arrival.seriesNotFound,
    retryPreload: arrival.retryPreload,
    startOver,
  };
}

/** What the Series card reads from the catalog. */
export type CatalogView = ReturnType<typeof usePredictController>['catalog'];
