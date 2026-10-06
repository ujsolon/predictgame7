import { useEffect, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/db/supabase';
import ErrorRetryPanel from '@/components/common/ErrorRetryPanel';
import SeriesNotFound from '@/components/common/SeriesNotFound';
import { isMethodSlug } from '@/lib/method-display';
import { isSeriesId } from '@/lib/series-id';
import { captureError } from '@/lib/analytics';

type Lookup = 'loading' | 'found' | 'not-found' | 'error';

/**
 * `/series/:id` (Story 4.1, AD-6). Until Story 4.3 builds the series page this
 * route only resolves the id:
 * - a known id redirects (history replace) to `/predict?series=<id>`, carrying
 *   `&method=<slug>` when the link names a known method — the historic
 *   share-link arrival (EXPERIENCE.md · State Patterns); an unknown slug is
 *   dropped, never an error;
 * - an unknown or malformed id renders the 404 treatment in place;
 * - a lookup *error* renders the retry panel, whose Retry re-runs the lookup.
 * Nothing is emitted to analytics here (Predict's preload emits nothing either).
 */
export default function SeriesRoute() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const wellFormed = isSeriesId(id);
  const [lookup, setLookup] = useState<Lookup>(wellFormed ? 'loading' : 'not-found');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // A malformed id can never name a row: not found, with no request at all.
    if (!wellFormed) {
      setLookup('not-found');
      return;
    }
    let current = true;
    setLookup('loading');
    void (async () => {
      try {
        const { data, error } = await supabase.from('series').select('id').eq('id', id).maybeSingle();
        if (error) throw error;
        if (current) setLookup(data ? 'found' : 'not-found');
      } catch (err) {
        console.error('Error resolving series:', err);
        captureError(err);
        if (current) setLookup('error');
      }
    })();
    return () => {
      current = false;
    };
  }, [id, wellFormed, attempt]);

  if (lookup === 'found') {
    const params = new URLSearchParams({ series: id });
    const method = searchParams.get('method');
    if (isMethodSlug(method)) params.set('method', method);
    return <Navigate to={`/predict?${params.toString()}`} replace />;
  }

  return (
    <div className="max-w-6xl mx-auto">
      {lookup === 'not-found' ? (
        <SeriesNotFound headingLevel="h1" />
      ) : lookup === 'error' ? (
        <ErrorRetryPanel
          heading="Couldn't load this series."
          message="Retry fetches it again."
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : (
        <div role="status" className="flex items-center gap-3 text-sm text-on-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading series…
        </div>
      )}
    </div>
  );
}
