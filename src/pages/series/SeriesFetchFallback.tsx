import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { captureError } from '@/lib/analytics';
import ErrorRetryPanel from '@/components/common/ErrorRetryPanel';
import PageMeta from '@/components/common/PageMeta';
import SeriesNotFound from '@/components/common/SeriesNotFound';
import type { SeriesRecordState } from './useSeriesRecord';

type FallbackState = Exclude<SeriesRecordState, { status: 'found' }>;

const ERROR_HEADING = "Couldn't load this series.";
const ERROR_MESSAGE = 'Retry fetches it again.';

/**
 * Every series route renders the non-page outcomes the same way: the loading
 * line, the 404 treatment (h1 — it sets the title and takes focus), or the
 * in-place retry panel whose Retry re-runs the one fetch (AD-9). Same
 * `max-w-3xl` column as the pages it frames, so loading → found does not snap
 * the width. The error state sets its own title: `ErrorRetryPanel` carries no
 * `PageMeta`, and without one the tab keeps the previous page's — an outcome
 * title, on a page that failed to load.
 */
export default function SeriesFetchFallback({ state, retry }: { state: FallbackState; retry: () => void }) {
  return (
    <div className="max-w-3xl mx-auto">
      {state.status === 'not-found' ? (
        <SeriesNotFound headingLevel="h1" />
      ) : state.status === 'error' ? (
        <>
          <PageMeta title={ERROR_HEADING} description={ERROR_MESSAGE} />
          <ErrorRetryPanel heading={ERROR_HEADING} message={ERROR_MESSAGE} onRetry={retry} />
        </>
      ) : (
        <div role="status" className="flex items-center gap-3 text-sm text-on-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading series…
        </div>
      )}
    </div>
  );
}

/**
 * The 404 for a row that was fetched but cannot be shown truthfully (phase
 * does not reconcile, or the view cannot be built). Reported through the same
 * exception channel PredictPage uses for non-reconciling rows — never silent.
 */
export function SeriesUnshowable({ id }: { id: string }) {
  useEffect(() => {
    const anomaly = new Error(`Series ${id} cannot be shown: its row does not reconcile to a series page`);
    console.error('Non-reconciling series:', anomaly);
    captureError(anomaly);
  }, [id]);
  return <SeriesFetchFallback state={{ status: 'not-found' }} retry={() => {}} />;
}
