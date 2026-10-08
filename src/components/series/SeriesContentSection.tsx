import { useEffect, useMemo } from 'react';
import { captureError } from '@/lib/analytics';
import { type ParsedSeriesContent, parseSeriesContent, type SeriesContentPartView } from '@/lib/series-content';
import type { Series } from '@/types/types';
import EditorialBody from './EditorialBody';
import VideoEmbed from './VideoEmbed';

/**
 * A series' validated editorial parts (Story 4.5). An invalid part is dropped
 * (`null`) and the whole set of reasons is reported once through
 * `captureError` — never thrown, so the page still renders. The prerender
 * never reaches this with invalid content: it fails the build first.
 */
export function useSeriesContent(series: Series): ParsedSeriesContent {
  const parsed = useMemo(() => parseSeriesContent(series.series_content ?? [], series.id), [series.series_content, series.id]);
  const problems = parsed.errors.join('; ');
  useEffect(() => {
    if (!problems) return;
    const error = new Error(`Series content not shown: ${problems}`);
    console.error('Invalid series content:', error);
    captureError(error);
  }, [problems]);
  return parsed;
}

/**
 * One editorial part: the write-up, then its videos. Renders nothing for an
 * absent part, and no heading of its own — a missing section leaves no gap.
 */
export default function SeriesContentSection({ part, name }: { part: SeriesContentPartView | null; name: 'before' | 'resolution' }) {
  if (!part || (!part.body && part.videos.length === 0)) return null;
  return (
    <div className="space-y-10" data-series-content={name}>
      {part.body && <EditorialBody markdown={part.body} />}
      {part.videos.map((video, index) => (
        <VideoEmbed key={`${index}-${video.youtube_id}`} video={video} />
      ))}
    </div>
  );
}
