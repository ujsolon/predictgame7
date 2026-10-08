import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { isMethodSlug } from '@/lib/method-display';
import { isSeriesId } from '@/lib/series-id';
import SeriesFetchFallback, { SeriesUnshowable } from '@/pages/series/SeriesFetchFallback';
import SeriesFullRecord from '@/pages/series/SeriesFullRecord';
import SeriesPreview from '@/pages/series/SeriesPreview';
import { useSeriesRecord } from '@/pages/series/useSeriesRecord';
import { toSeriesView } from '@/pages/series/series-view';
import { usePreload } from '@/prerender/preload';

/**
 * `/series/:id` (Story 4.1, Story 4.3). One fetch (`SERIES_PAGE_SELECT`), then:
 * - `?method=` present → the share arrival: redirect (history replace) to
 *   `/predict?series=<id>`, carrying `&method=<slug>` when the slug is known
 *   (Story 4.1); an unknown slug is dropped, never an error; every other
 *   parameter (`utm_source` above all) follows in order (Story 4.4);
 * - an archived series that is not featured → the single full-record page;
 * - a featured archive (`series.is_featured`, Story 4.5) or a pending series
 *   → the spoiler-free preview;
 * - an unknown or malformed id (no request at all for the latter), or a row
 *   that cannot be shown (`toSeriesView` → null, e.g. `deriveSeriesPhase` →
 *   null) → the 404, reported through `captureError`;
 * - a fetch error → the retry panel, whose Retry re-fetches.
 * Phase is derived (AD-4), never read from `status`. No analytics *event* is
 * emitted; the only port use is `captureError`, for the unshowable row above
 * and for a fetch error inside `useSeriesRecord`.
 *
 * Story 4.8: on a prerendered page the preload rendered for this very path
 * is rendered as-is — a preview from its outcome-stripped row, with its
 * `reveal`. A record or flagship preview never fetches (its content cannot
 * change). A pending preview (`reveal: false`) refreshes in the background
 * (owner decision 2026-10-08, option b): the preload view stays while the
 * fetch is loading or has failed, and once it answers the live row goes
 * through the normal logic below (archived since the build → its current
 * page; gone → the 404).
 */
export default function SeriesRoute() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const matched = usePreload(pathname);
  const preload = matched && matched.variant !== 'result' ? matched : null;
  const refreshing = preload?.variant === 'preview' && !preload.reveal;
  const { state, retry } = useSeriesRecord(id, isSeriesId(id) && (!preload || refreshing));
  // A pending preview's preload serves only until its refresh answers.
  const served = refreshing ? (state.status === 'loading' || state.status === 'error' ? preload : null) : preload;

  if (!served && state.status !== 'found') return <SeriesFetchFallback state={state} retry={retry} />;

  if (searchParams.has('method')) {
    const params = new URLSearchParams({ series: id });
    const method = searchParams.get('method');
    if (isMethodSlug(method)) params.set('method', method);
    // Story 4.4: every other parameter rides along, in order — `utm_source`
    // must reach the landing `$pageview` (SM-3).
    for (const [key, value] of searchParams) {
      if (key !== 'series' && key !== 'method') params.append(key, value);
    }
    return <Navigate to={`/predict?${params.toString()}`} replace />;
  }

  if (served) {
    return served.variant === 'record' ? (
      <SeriesFullRecord series={served.series} variant="record" />
    ) : (
      <SeriesPreview series={served.series} reveal={served.reveal} />
    );
  }
  if (state.status !== 'found') return null;

  // `toSeriesView` derives the phase (AD-4) and is null for any row that cannot be shown.
  const view = toSeriesView(state.series);
  if (!view) return <SeriesUnshowable id={state.series.id} />;
  if (view.phase === 'archive' && state.series.is_featured !== true) return <SeriesFullRecord series={state.series} variant="record" />;
  return <SeriesPreview series={state.series} />;
}
