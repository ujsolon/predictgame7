import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface SeriesTitleProps {
  /** `{year} {League }{round}` (`seriesTitleLine`); `null` prints the matchup line alone (a custom matchup). */
  title: string | null;
  /** `{A} vs {B}` from `matchupLabel`, stored order. */
  matchup: string;
  /** The series page: `seriesPagePath` (`seriesPath(series, 'page')` + `/`) only; `null` renders plain text, never a uuid fallback. */
  to: string | null;
  /** Runs on a plain primary click, before in-tab navigation (Historical closes its overlay); skipped for modified or non-primary clicks. */
  onNavigate?: () => void;
  className?: string;
  titleClassName?: string;
  matchupClassName?: string;
}

/**
 * The two-line series title (Story 6.2): a title line and a matchup line that
 * are, together, one link to the series page — or plain text when there is no
 * page to link to. The lines are separated by a real visually hidden ", " so
 * the link's accessible name reads "{title line}, {matchup}" in every accname
 * implementation, not only where block layout happens to insert a space. The
 * "→" cue is always visible (touch has no hover) and `aria-hidden`; hover and
 * keyboard focus add the underline, and focus keeps a visible ring. The link
 * is at least 44px tall (`min-h-11`, NFR-U1) wherever it is placed.
 */
export default function SeriesTitle({
  title,
  matchup,
  to,
  onNavigate,
  className,
  titleClassName,
  matchupClassName,
}: SeriesTitleProps) {
  const lineHover = to ? 'underline-offset-4 group-hover:underline group-focus-visible:underline' : '';
  const body = (
    <>
      {title !== null && (
        <span data-series-title-line="" className={cn('block text-foreground', titleClassName)}>
          <span className={lineHover}>{title}</span>
          {to && (
            <span aria-hidden="true" className="ml-1.5 inline-block">
              →
            </span>
          )}
        </span>
      )}
      {title !== null && <span className="sr-only">, </span>}
      <span data-series-matchup-line="" className={cn('block text-on-muted', lineHover, matchupClassName)}>
        {matchup}
      </span>
    </>
  );

  if (!to) {
    return (
      <span data-series-title="" className={cn('block min-w-0 break-words', className)}>
        {body}
      </span>
    );
  }

  return (
    <Link
      to={to}
      onClick={(e) => {
        // A modified or non-primary click opens elsewhere (new tab/window), so
        // this tab stays where it is and `onNavigate` must not run.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        onNavigate?.();
      }}
      data-series-title=""
      data-series-title-link=""
      className={cn(
        'group block min-h-11 min-w-0 break-words rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className
      )}
    >
      {body}
    </Link>
  );
}
