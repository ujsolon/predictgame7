import { useLocation, useParams } from 'react-router-dom';
import { isFlagship } from '@/lib/flagship-series';
import { isSeriesId } from '@/lib/series-id';
import SeriesFetchFallback, { SeriesUnshowable } from '@/pages/series/SeriesFetchFallback';
import SeriesFullRecord from '@/pages/series/SeriesFullRecord';
import { useSeriesRecord } from '@/pages/series/useSeriesRecord';
import { toSeriesView } from '@/pages/series/series-view';
import { usePreload } from '@/prerender/preload';

/**
 * `/series/:id/result` (Story 4.3): a flagship's result page. Only an
 * archived flagship has one — a malformed or non-flagship id is the 404
 * without any request, and an unknown id, a pending series or a row whose
 * phase does not reconcile is the 404 after the one fetch. A fetch error
 * renders the retry panel. The result `<h1>` takes focus on client navigation.
 * Story 4.8: a prerendered result page renders its preload without a fetch.
 */
export default function SeriesResultRoute() {
  const { id = '' } = useParams();
  const { pathname } = useLocation();
  const matched = usePreload(pathname);
  const preload = matched?.variant === 'result' ? matched : null;
  const { state, retry } = useSeriesRecord(id, isSeriesId(id) && isFlagship(id) && !preload);

  if (preload) return <SeriesFullRecord series={preload.series} variant="result" />;

  if (state.status !== 'found') return <SeriesFetchFallback state={state} retry={retry} />;
  const view = toSeriesView(state.series);
  // An unshowable row is reported; a pending flagship is a legitimate 404 (no result yet).
  if (!view) return <SeriesUnshowable id={state.series.id} />;
  if (view.phase !== 'archive') return <SeriesFetchFallback state={{ status: 'not-found' }} retry={retry} />;
  return <SeriesFullRecord series={state.series} variant="result" />;
}
