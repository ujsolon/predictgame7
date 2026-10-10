import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { parseSeriesYear, seriesPath } from '@/lib/series-slug';
import { predictArrivalHref, type SeriesHopState } from '@/pages/SeriesRoute';
import SeriesFetchFallback, { SeriesUnshowable } from '@/pages/series/SeriesFetchFallback';
import { lookupFrom, useSeriesRecord } from '@/pages/series/useSeriesRecord';

/**
 * The legacy uuid routes, `/series/<id>` and `/series/<id>/result` (Story 6.1,
 * owner decision 2a). Those URLs were shared and indexed from 0.2.9 on, so
 * they stay: a cold GET lands on the prerendered stub (`src/prerender/stub.ts`),
 * and this route covers the in-app and `404.html` arrivals. One fetch by id,
 * then a history replace to the slug URL (`seriesPath`, the one slug helper)
 * with the query and hash kept and the id handed over in state, so the slug
 * route does not match the slug again. A `?method=` arrival on the page path
 * forwards straight to Predict, as the uuid route always did. A malformed id
 * is the 404 without a request; an unknown id is the 404; a fetch error is
 * the retry panel.
 *
 * `/series/<4-digit year>` matches the page path too and goes to Historical
 * filtered to that year (`?year=`, read by `HistoricalPage`) — the client
 * twin of the prerendered year redirect stub.
 */
export default function SeriesIdRoute({ variant }: { variant: 'page' | 'result' }) {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { search, hash } = useLocation();
  const year = variant === 'page' ? parseSeriesYear(id) : null;
  const { state, retry } = useSeriesRecord(year === null ? lookupFrom({ id }) : null, year === null);

  if (year !== null) return <Navigate to={`/historical?year=${year}`} replace />;
  if (state.status !== 'found') return <SeriesFetchFallback state={state} retry={retry} />;
  if (variant === 'page' && searchParams.has('method')) {
    return <Navigate to={predictArrivalHref(state.series.id, searchParams)} replace />;
  }
  const path = seriesPath(state.series, variant);
  if (!path) return <SeriesUnshowable id={state.series.id} />;
  const hop: SeriesHopState = { seriesId: state.series.id };
  return <Navigate to={`${path}${search}${hash}`} replace state={hop} />;
}
