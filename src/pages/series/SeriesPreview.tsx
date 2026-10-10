import { Link } from 'react-router-dom';
import PageMeta from '@/components/common/PageMeta';
import SeriesNotFound from '@/components/common/SeriesNotFound';
import ShareButton from '@/components/common/ShareButton';
import SeriesContentSection, { useSeriesContent } from '@/components/series/SeriesContentSection';
import { matchupLabel } from '@/lib/matchup';
import { METHOD_LABELS } from '@/lib/method-display';
import { seriesPageSharePath } from '@/lib/share';
import type { MethodSlug } from '@/types/prediction';
import type { Series } from '@/types/types';
import ScoreStrip from './ScoreStrip';
import SeriesHero from './SeriesHero';
import { CTA_LINK, LABEL, ROW_LINK, TEXT_LINK } from './series-styles';
import {
  predictHref,
  previewDescription,
  previewHeadline,
  previewTitle,
  resultHref,
  seriesEyebrow,
  teamWord,
  toSeriesView,
} from './series-view';

const METHOD_SLUGS = Object.keys(METHOD_LABELS) as MethodSlug[];

/**
 * The spoiler-free series preview (Story 4.3) — a flagship archive series at
 * `/series/<year>/<slug>`, or a pending series. Pure over its `Series` prop and
 * SSR-safe, so Story 4.8 can prerender it from preloaded rows.
 *
 * Spoiler discipline is structural: nothing about Game 7 — its row, scores,
 * winner, the final series score, past-tense outcome copy — is rendered, and
 * the document title is winner-free. Story 4.5: of the editorial content only
 * the `before` part renders here (its headline overrides the default hero
 * headline); a prerendered preview's row carries no resolution part at all.
 */
export default function SeriesPreview({ series, reveal }: { series: Series; reveal?: boolean }) {
  // Stored order, `team_a` (the home team) first, as on every surface (Story 6.8).
  const view = toSeriesView(series);
  const { before } = useSeriesContent(series);
  if (!view) return <SeriesNotFound headingLevel="h1" />;

  // Only an archived featured series (`is_featured`, Story 4.5) has a result page to reveal; a pending series has none.
  // A prerendered preview (Story 4.8) renders from its stripped row, which derives as pending,
  // so the build-time decision arrives as `reveal` and overrides the derived one.
  const hasReveal = reveal ?? (view.phase === 'archive' && series.is_featured === true);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-16">
      <PageMeta title={previewTitle(view)} description={previewDescription(view)} />

      <SeriesHero
        eyebrow={seriesEyebrow(view)}
        headline={before?.headline ?? previewHeadline(view)}
        standfirst="Game 7 stands."
        action={
          <ShareButton
            appearance="icon"
            path={seriesPageSharePath(series, 'page')}
            title={previewTitle(view)}
            surface="series"
            kind="series"
          />
        }
      >
        <ScoreStrip view={view} mode="preview" />
      </SeriesHero>

      <SeriesContentSection part={before} name="before" />

      <section aria-labelledby="series-methods">
        <h2 id="series-methods" className={LABEL}>
          The models have their picks
        </h2>
        <ul className="mt-4 border-t border-border">
          {METHOD_SLUGS.map((slug) => (
            <li key={slug}>
              <Link to={predictHref(view.id, slug)} className={ROW_LINK}>
                <span className="flex-1 font-medium">{METHOD_LABELS[slug]}</span>
                <span className="text-on-muted" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="series-cta" className="border-t border-border pt-10">
        <h2 id="series-cta" className="text-3xl font-medium leading-tight tracking-[-0.01em] text-foreground">
          Model this matchup yourself
        </h2>
        <p className="mt-2 max-w-[65ch] text-on-muted">
          Run {matchupLabel(teamWord(view.teamA), teamWord(view.teamB))} through the prediction model and make your own call on Game 7.
        </p>
        <Link to={predictHref(view.id)} className={CTA_LINK}>
          Open Predict <span aria-hidden="true">→</span>
        </Link>

        {hasReveal && (
          <div className="mt-10">
            <Link to={resultHref(view)} className={TEXT_LINK}>
              See how the series ended <span aria-hidden="true">→</span>
            </Link>
            <p className="mt-1 text-sm text-on-muted">Spoilers for Game 7 ahead.</p>
          </div>
        )}
      </section>
    </div>
  );
}
