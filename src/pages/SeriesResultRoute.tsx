import { useLocation, useParams } from 'react-router-dom';
import { isSeriesId } from '@/lib/series-id';
import SeriesFetchFallback, { SeriesUnshowable } from '@/pages/series/SeriesFetchFallback';
import SeriesFullRecord from '@/pages/series/SeriesFullRecord';
import { useSeriesRecord } from '@/pages/series/useSeriesRecord';
import { toSeriesView } from '@/pages/series/series-view';
import { usePreload } from '@/prerender/preload';

/**
 * `/series/:id/result` (Story 4.3): a featured series' result page. Only an
 * archived featured series has one. A malformed id is the 404 without any
 * request; since Story 4.5 flagship-ness is the row's `is_featured`, so every
 * other id is decided after the one fetch: an unknown id, a series that is not
 * featured, or a pending one is the 404, and a featured row whose phase does
 * not reconcile is the reported 404. A fetch error renders the retry panel.
 * The result `<h1>` takes focus on client navigation.
 * Story 4.8: a prerendered result page renders its preload without a fetch.
 */
export default function SeriesResultRoute() {
  const { id = '' } = useParams();
  const { pathname } = useLocation();
  const matched = usePreload(pathname);
  const preload = matched?.variant === 'result' ? matched : null;
  const { state, retry } = useSeriesRecord(id, isSeriesId(id) && !preload);

  if (preload) return <SeriesFullRecord series={preload.series} variant="result" />;

  if (state.status !== 'found') return <SeriesFetchFallback state={state} retry={retry} />;
  // A series that is not featured has no result page at all.
  if (state.series.is_featured !== true) return <SeriesFetchFallback state={{ status: 'not-found' }} retry={retry} />;
  const view = toSeriesView(state.series);
  // An unshowable row is reported; a pending featured series is a legitimate 404 (no result yet).
  if (!view) return <SeriesUnshowable id={state.series.id} />;
  if (view.phase !== 'archive') return <SeriesFetchFallback state={{ status: 'not-found' }} retry={retry} />;
  return <SeriesFullRecord series={state.series} variant="result" />;
}
