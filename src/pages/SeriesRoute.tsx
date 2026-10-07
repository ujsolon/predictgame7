import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { isFlagship } from '@/lib/flagship-series';
import { isMethodSlug } from '@/lib/method-display';
import { isSeriesId } from '@/lib/series-id';
import SeriesFetchFallback, { SeriesUnshowable } from '@/pages/series/SeriesFetchFallback';
import SeriesFullRecord from '@/pages/series/SeriesFullRecord';
import SeriesPreview from '@/pages/series/SeriesPreview';
import { useSeriesRecord } from '@/pages/series/useSeriesRecord';
import { toSeriesView } from '@/pages/series/series-view';

/**
 * `/series/:id` (Story 4.1, Story 4.3). One fetch (`SERIES_SELECT`), then:
 * - `?method=` present → the share arrival: redirect (history replace) to
 *   `/predict?series=<id>`, carrying `&method=<slug>` when the slug is known
 *   (Story 4.1, unchanged); an unknown slug is dropped, never an error;
 * - an archived non-flagship series → the single full-record page;
 * - a flagship archive or a pending series → the spoiler-free preview;
 * - an unknown or malformed id (no request at all for the latter), or a row
 *   that cannot be shown (`toSeriesView` → null, e.g. `deriveSeriesPhase` →
 *   null) → the 404, reported through `captureError`;
 * - a fetch error → the retry panel, whose Retry re-fetches.
 * Phase is derived (AD-4), never read from `status`. No analytics *event* is
 * emitted; the only port use is `captureError`, for the unshowable row above
 * and for a fetch error inside `useSeriesRecord`.
 */
export default function SeriesRoute() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { state, retry } = useSeriesRecord(id, isSeriesId(id));

  if (state.status !== 'found') return <SeriesFetchFallback state={state} retry={retry} />;

  if (searchParams.has('method')) {
    const params = new URLSearchParams({ series: id });
    const method = searchParams.get('method');
    if (isMethodSlug(method)) params.set('method', method);
    return <Navigate to={`/predict?${params.toString()}`} replace />;
  }

  // `toSeriesView` derives the phase (AD-4) and is null for any row that cannot be shown.
  const view = toSeriesView(state.series);
  if (!view) return <SeriesUnshowable id={state.series.id} />;
  if (view.phase === 'archive' && !isFlagship(view.id)) return <SeriesFullRecord series={state.series} variant="record" />;
  return <SeriesPreview series={state.series} />;
}
