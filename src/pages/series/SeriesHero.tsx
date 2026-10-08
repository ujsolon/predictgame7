import type { ReactNode, Ref } from 'react';
import { LABEL } from './series-styles';

interface SeriesHeroProps {
  eyebrow: string;
  headline: string;
  /** One present-tense line under the headline (preview only). */
  standfirst?: string;
  /** The result page focuses its `<h1>` on client navigation. */
  headingRef?: Ref<HTMLHeadingElement>;
  focusable?: boolean;
  /** A header action beside the eyebrow (Story 4.4: the icon-only Share button). Must be SSR-safe. */
  action?: ReactNode;
  children?: ReactNode;
}

/**
 * Series-page hero (DESIGN.md · Series page): eyebrow in the label motif,
 * the display headline in team words, then whatever strip the page passes.
 * An optional `action` (the Share button) sits at the end of the eyebrow row.
 * Pure and SSR-safe.
 */
export default function SeriesHero({ eyebrow, headline, standfirst, headingRef, focusable, action, children }: SeriesHeroProps) {
  return (
    <section aria-labelledby="series-headline">
      {action ? (
        // The action sits in the eyebrow row; the row carries no text of its
        // own, so the eyebrow still reads as the headline's preceding text.
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className={LABEL}>{eyebrow}</p>
          {action}
        </div>
      ) : (
        <p className={`${LABEL} mb-4`}>{eyebrow}</p>
      )}
      <h1
        id="series-headline"
        ref={headingRef}
        tabIndex={focusable ? -1 : undefined}
        className="max-w-[65ch] text-4xl font-medium leading-[1.1] tracking-[-0.01em] text-foreground focus:outline-none md:text-6xl"
      >
        {headline}
      </h1>
      {standfirst && <p className="mt-4 max-w-[65ch] text-lg text-on-muted">{standfirst}</p>}
      {children}
    </section>
  );
}
