import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { isMethodSlug } from '@/lib/method-display';
import { isSeriesId } from '@/lib/series-id';
import SeriesFetchFallback, { SeriesUnshowable } from '@/pages/series/SeriesFetchFallback';
import SeriesFullRecord from '@/pages/series/SeriesFullRecord';
import SeriesPreview from '@/pages/series/SeriesPreview';
import { lookupFrom, type SeriesLookup, useSeriesRecord } from '@/pages/series/useSeriesRecord';
import { toSeriesView } from '@/pages/series/series-view';
import { usePreload } from '@/prerender/preload';

/**
 * The share arrival's Predict URL (Story 4.1, Story 4.4): `/predict?series=<id>`,
 * carrying `&method=<slug>` when the slug is known (an unknown slug is
 * dropped, never an error), then every other parameter (`utm_source` above
 * all) in order — never a second `series` or `method`.
 */
export function predictArrivalHref(seriesId: string, searchParams: URLSearchParams): string {
  const params = new URLSearchParams({ series: seriesId });
  const method = searchParams.get('method');
  if (isMethodSlug(method)) params.set('method', method);
  // Story 4.4: every other parameter rides along, in order — `utm_source`
  // must reach the landing `$pageview` (SM-3).
  for (const [key, value] of searchParams) {
    if (key !== 'series' && key !== 'method') params.append(key, value);
  }
  return `/predict?${params.toString()}`;
}

/**
 * Story 6.1: a uuid route forwards in-app to the slug URL with the id in
 * history state, so the slug route reads that row by id instead of matching
 * the slug again.
 */
export interface SeriesHopState {
  seriesId: string;
}

/** The id a uuid route handed over (`SeriesHopState`), when the location carries one. */
export function hopSeriesId(state: unknown): string | null {
  const id = state && typeof state === 'object' ? (state as Partial<SeriesHopState>).seriesId : undefined;
  return isSeriesId(id) ? id : null;
}

/**
 * How a slug route names its row: the preload's id when a prerendered page
 * serves (only a pending preview's refresh fetches), the id a uuid route
 * handed over, else the year + slug from the URL.
 */
export function slugRouteLookup(
  params: { year?: string; slug?: string },
  locationState: unknown,
  preloadId: string | null
): SeriesLookup | null {
  if (preloadId) return { by: 'id', id: preloadId };
  const hopped = hopSeriesId(locationState);
  if (hopped) return { by: 'id', id: hopped };
  return lookupFrom({ year: params.year, slug: params.slug });
}

/**
 * `/series/:year/:slug` (Story 6.1; the page itself is Story 4.1 / 4.3's).
 * One fetch (`SERIES_PAGE_SELECT`) — that year's series, matched to the slug,
 * or the row by id when a uuid route handed one over — then:
 * - `?method=` present → the share arrival: redirect (history replace) to
 *   Predict (`predictArrivalHref`);
 * - an archived series that is not featured → the single full-record page;
 * - a featured archive (`series.is_featured`, Story 4.5) or a pending series
 *   → the spoiler-free preview;
 * - an unknown year or slug (a non-4-digit year makes no request at all), or
 *   a row that cannot be shown (`toSeriesView` → null) → the 404, the latter
 *   reported through `captureError`;
 * - a fetch error → the retry panel, whose Retry re-fetches.
 * Phase is derived (AD-4), never read from `status`. No analytics *event* is
 * emitted; the only port use is `captureError`, for the unshowable row above
 * and for a fetch error inside `useSeriesRecord`.
 *
 * Story 4.8: on a prerendered page the preload rendered for this very path
 * is rendered as-is — a preview from its outcome-stripped row, with its
 * `reveal`. A record or flagship preview never fetches (its content cannot
 * change). A pending preview (`reveal: false`) refreshes in the background
 * by id (owner decision 2026-10-08, option b): the preload view stays while
 * the fetch is loading or has failed, and once it answers the live row goes
 * through the normal logic below (archived since the build → its current
 * page; gone → the 404).
 */
export default function SeriesRoute() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { pathname, state: locationState } = useLocation();
  const matched = usePreload(pathname);
  const preload = matched && matched.variant !== 'result' ? matched : null;
  const refreshing = preload?.variant === 'preview' && !preload.reveal;
  const lookup = slugRouteLookup(params, locationState, preload?.series.id ?? null);
  const { state, retry } = useSeriesRecord(lookup, !preload || refreshing);
  // A pending preview's preload serves only until its refresh answers.
  const served = refreshing ? (state.status === 'loading' || state.status === 'error' ? preload : null) : preload;

  if (!served && state.status !== 'found') return <SeriesFetchFallback state={state} retry={retry} />;

  if (searchParams.has('method')) {
    const id = served ? served.series.id : state.status === 'found' ? state.series.id : '';
    return <Navigate to={predictArrivalHref(id, searchParams)} replace />;
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
