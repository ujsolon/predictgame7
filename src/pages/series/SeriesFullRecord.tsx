import { useEffect, useRef } from 'react';
import { Link, useNavigationType } from 'react-router-dom';
import PageMeta from '@/components/common/PageMeta';
import SeriesNotFound from '@/components/common/SeriesNotFound';
import ShareButton from '@/components/common/ShareButton';
import SeriesContentSection, { useSeriesContent } from '@/components/series/SeriesContentSection';
import { seriesPageSharePath } from '@/lib/share';
import type { Series } from '@/types/types';
import ScoreStrip from './ScoreStrip';
import SeriesHero from './SeriesHero';
import { CTA_LINK } from './series-styles';
import { outcomeDescription, outcomeHeadline, outcomeTitle, predictHref, seriesEyebrow, toSeriesView } from './series-view';

interface SeriesFullRecordProps {
  series: Series;
  /**
   * `record`: a non-flagship archive series' single page at `/series/<year>/<slug>`.
   * `result`: a flagship's `/series/<year>/<slug>/result` — same content, and its
   * `<h1>` takes focus on client navigation (the reveal is one tap).
   */
  variant: 'record' | 'result';
}

/**
 * The full record of an archived series (Story 4.3): eyebrow, "{W} win Game 7",
 * the final 4–3 with the Game 7 box, all seven games, and the generic
 * "Model it yourself" CTA — no per-method links. Pure over its `Series` prop
 * and SSR-safe: focus is moved in an effect, never during render.
 *
 * Story 4.5: the result page shows the `resolution` part only; the
 * non-flagship record shows whatever exists, `before` then `resolution`.
 * Both take the `resolution` headline over the default one when it exists.
 */
export default function SeriesFullRecord({ series, variant }: SeriesFullRecordProps) {
  const view = toSeriesView(series);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigationType = useNavigationType();
  const isResult = variant === 'result';
  const renderable = view?.phase === 'archive' && view.winner != null;
  const content = useSeriesContent(series);

  useEffect(() => {
    // A cold load (POP) leaves focus where the browser puts it; an in-app
    // arrival — the reveal link — lands the reader on the result heading.
    if (isResult && renderable && navigationType !== 'POP') headingRef.current?.focus();
  }, [isResult, renderable, navigationType]);

  if (!view || !renderable || !view.winner || !view.loser) return <SeriesNotFound headingLevel="h1" />;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-16">
      <PageMeta title={outcomeTitle(view, view.winner)} description={outcomeDescription(view, view.winner, view.loser)} />

      <SeriesHero
        eyebrow={seriesEyebrow(view)}
        headline={content.resolution?.headline ?? outcomeHeadline(view.winner)}
        headingRef={headingRef}
        focusable={isResult}
        action={
          <ShareButton
            appearance="icon"
            path={seriesPageSharePath(series, isResult ? 'result' : 'page')}
            title={outcomeTitle(view, view.winner)}
            surface="series"
            kind="series"
          />
        }
      >
        <ScoreStrip view={view} mode="full" />
      </SeriesHero>

      {!isResult && <SeriesContentSection part={content.before} name="before" />}
      <SeriesContentSection part={content.resolution} name="resolution" />

      <section aria-labelledby="series-cta" className="border-t border-border pt-10">
        <h2 id="series-cta" className="text-3xl font-medium leading-tight tracking-[-0.01em] text-foreground">
          Model it yourself
        </h2>
        <p className="mt-2 max-w-[65ch] text-on-muted">
          From iconic classics to hypothetical showdowns — run the matchup through the prediction model.
        </p>
        <Link to={predictHref(view.id)} className={CTA_LINK}>
          Open Predict <span aria-hidden="true">→</span>
        </Link>
      </section>
    </div>
  );
}
