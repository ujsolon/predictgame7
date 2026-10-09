import { type MutableRefObject, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { captureError, EVENTS, track } from '@/lib/analytics';
import { classifyInvokeResult, parseInvokeBody, SERVICE_MESSAGES, type ServiceFailure } from '@/lib/error-envelope';
import { buildCustomRequest, buildSeriesRequest } from '@/lib/prediction-request';
import type { MethodSlug, PredictionForm, PredictionInput, PredictionResult } from '@/types/prediction';
import type { SelectedSeries } from './types';

interface PredictionDeps {
  /** Owned by the controller: its reset effect bumps it on every selection change. */
  predictSeq: MutableRefObject<number>;
  selectedSeries: SelectedSeries | null;
  selectedMethod: MethodSlug | null;
  customInput: PredictionForm;
}

/**
 * The prediction request: Generate's validation, the `predict-game-7` invoke,
 * and the result / failure / spinner state it produces. No effects of its own —
 * the controller's reset effect retires an attempt through `retire`.
 */
export function usePrediction({ predictSeq, selectedSeries, selectedMethod, customInput }: PredictionDeps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  // Failure state for the result region (service class from the classifier).
  const [predictFailure, setPredictFailure] = useState<ServiceFailure | null>(null);
  // Inline submit-time field errors for the custom matchup form, keyed by the
  // input ids (Decision 1: controlled state + pure validator, no form lib).
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});

  const handlePredict = async () => {
    // Precondition on the whole flow, not a field error — stays a toast;
    // both pickers already render "Not selected".
    if (!selectedSeries || !selectedMethod) {
      toast.error('Please select both a series and a method');
      return;
    }

    // Retry re-fires what the fan just submitted: the attempt is read from
    // live state, and any change to it clears the panel before Retry exists.
    const attempt = { method: selectedMethod, series: selectedSeries };

    let inputData: PredictionInput;

    if (attempt.series.source === 'custom') {
      // Invalid input is reported inline before submit — the request never
      // leaves the browser (Story 1.3 I/O matrix). Decision 4: both names are
      // required, so no 'Team A'/'Team B' placeholder supplies a request.
      const built = buildCustomRequest(customInput, attempt.method);
      setCustomFieldErrors(built.ok ? {} : built.fields);
      if (!built.ok) {
        // No summary toast on this path (EXPERIENCE.md · Inline field error),
        // so focus carries the announcement: the field's error is reachable
        // through its own `aria-describedby` (WCAG 4.1.3 / 3.3.1).
        const firstInvalid = Object.keys(built.fields)[0];
        if (firstInvalid) document.getElementById(firstInvalid)?.focus();
        return;
      }
      // A score outside 50-200, then an unrecognized team name (Story 1.4 /
      // Decision 4): non-blocking hints — the request proceeds and the
      // generic Team A/Team B placeholder logo stays shown.
      for (const hint of built.hints) toast.warning(hint);
      inputData = built.request;
    } else if (attempt.series.data) {
      // Series-path checks stay toasts: they guard the whole flow with
      // server-provided data, not per-field user input (Story 1.3 Decision 1),
      // in the shared rule wording prefixed "Game N:" (Story 4.4, D3).
      const built = buildSeriesRequest(attempt.series.data, attempt.method);
      if (!built.ok) {
        toast.error(built.error);
        return;
      }
      for (const hint of built.hints) toast.warning(hint);
      inputData = built.request;
    } else {
      toast.error('Invalid series selection');
      return;
    }

    await runPrediction(inputData, attempt);
  };

  const runPrediction = async (
    inputData: PredictionInput,
    attempt: { method: MethodSlug; series: SelectedSeries }
  ) => {
    const seq = ++predictSeq.current;
    setLoading(true);
    setPredictFailure(null);
    setResult(null);

    let prediction: PredictionResult;
    try {
      const { data, error } = await supabase.functions.invoke<PredictionResult>('predict-game-7', {
        body: inputData,
      });

      // One classifier for everything the transport or function can return:
      // no raw JSON reaches the UI, and a non-conforming 200 (the
      // `win_probability_a: null` path) never renders `undefined%`.
      const failure = await classifyInvokeResult(error, data);
      // Superseded while in flight by a newer attempt or a new selection. The
      // error still gets reported; what the fan has on screen does not change.
      const superseded = seq !== predictSeq.current;
      if (failure) {
        console.error('Prediction failure:', failure);
        if (!superseded) {
          // Failure state only — series, method and scores survive the retry.
          setPredictFailure(failure);
        }
        captureError(
          error instanceof Error ? error : new Error(failure.message)
        );
        return;
      }

      // The classifier already proved this body conforms; `parseInvokeBody`
      // hands back the same decoded copy a `text/plain` `200` arrives as.
      prediction = parseInvokeBody(data) as PredictionResult;
      // A result the fan has already switched away from is not a result; the
      // live attempt will bring its own. Returning here also skips the success
      // toast and the `prediction_generated` event below.
      if (superseded) return;
      setResult(prediction);
    } catch (err) {
      // Last-resort guard for anything thrown outside the classified invoke
      // path; the panel replaces a bare toast, inputs untouched.
      console.error('Prediction error:', err);
      if (seq === predictSeq.current) {
        setPredictFailure({ kind: 'service', reason: 'transport', message: SERVICE_MESSAGES.transport });
      }
      captureError(err);
      return;
    } finally {
      // Only the newest attempt owns the spinner: a superseded response landing
      // while a live request is pending must not re-enable Generate.
      if (seq === predictSeq.current) setLoading(false);
    }

    // Success side-effects live outside the guarded region: a throwing toast
    // or analytics call must not convert the prediction already on screen
    // into a "service unreachable" panel.
    try {
      toast.success('Prediction generated successfully');
      track(EVENTS.PREDICTION_GENERATED, {
        method: attempt.method,
        series_source: attempt.series.source,
        series_id: attempt.series.data?.id,
        series_year: attempt.series.data?.year,
        predicted_winner: prediction.predicted_winner,
        win_probability_a: prediction.win_probability_a,
        win_probability_b: prediction.win_probability_b,
        confidence_level: prediction.confidence_level,
      });
    } catch (err) {
      console.error('Prediction success side-effect failed:', err);
    }
  };

  /**
   * The reset effect's share of a selection change: the visible result and
   * failure go, and — since the attempt this retires can now never paint —
   * nothing may still be waiting on it: without clearing `loading` the spinner
   * would outlive the only response that could clear it.
   */
  const retire = () => {
    setResult(null);
    setPredictFailure(null);
    setLoading(false);
  };

  return {
    loading,
    result,
    predictFailure,
    customFieldErrors,
    handlePredict,
    retire,
    clearResult: () => setResult(null),
    clearFieldErrors: () => setCustomFieldErrors({}),
  };
}
