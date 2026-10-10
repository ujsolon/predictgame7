import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import PageMeta from '@/components/common/PageMeta';

export const SERIES_NOT_FOUND_HEADLINE = "This series doesn't exist.";
export const SERIES_NOT_FOUND_LINE = 'It may have been removed, or the link is wrong.';

/** The same treatment for a `?custom=` share link that does not decode (Story 4.4). */
export const MATCHUP_NOT_FOUND_HEADLINE = "This matchup link doesn't work.";
export const MATCHUP_NOT_FOUND_LINE = 'It may be incomplete or mistyped. Pick a series, or build the matchup yourself.';

interface SeriesNotFoundProps {
  /**
   * `h1` when the block IS the page (`/series/<year>/<slug>`): it sets the document
   * title and takes focus, because react-router does neither on its own.
   * `h2` when it sits inside a page that owns its own `<h1>` (Predict's
   * series region): no title change and no focus theft.
   */
  headingLevel?: 'h1' | 'h2';
  /** Copy override for a variant of the same treatment (Story 4.4: a bad `?custom=` link). */
  headline?: string;
  line?: string;
}

/**
 * The 404 treatment for an unknown or malformed series id (EXPERIENCE.md ·
 * State Patterns · Unknown series id; DESIGN.md · Error/empty states): icon
 * tile → title → one line → one onward action, `max-w-md`.
 */
export default function SeriesNotFound({
  headingLevel = 'h1',
  headline = SERIES_NOT_FOUND_HEADLINE,
  line = SERIES_NOT_FOUND_LINE,
}: SeriesNotFoundProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isPage = headingLevel === 'h1';

  useEffect(() => {
    if (isPage) headingRef.current?.focus();
  }, [isPage]);

  const Heading = headingLevel;

  return (
    <div className="w-full max-w-md space-y-2 text-left" data-series-not-found="">
      {isPage && <PageMeta title={headline} description={line} />}
      <div className="mb-4 inline-flex rounded-lg bg-accent p-2 text-foreground" aria-hidden="true">
        <SearchX className="h-5 w-5" />
      </div>
      <Heading
        ref={headingRef}
        tabIndex={isPage ? -1 : undefined}
        className={
          isPage
            ? 'text-3xl font-medium tracking-tight text-foreground focus:outline-none'
            : 'text-xl font-medium text-foreground'
        }
      >
        {headline}
      </Heading>
      <p className="text-sm text-on-muted">{line}</p>
      <Link
        to="/historical"
        // ≥44px hit area (NFR-U1) on the single onward action.
        className="mt-4 inline-flex min-h-11 items-center rounded-md font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Browse the Historical archive →
      </Link>
    </div>
  );
}
