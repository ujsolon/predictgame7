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
  children?: ReactNode;
}

/**
 * Series-page hero (DESIGN.md · Series page): eyebrow in the label motif,
 * the display headline in team words, then whatever strip the page passes.
 * Pure and SSR-safe.
 */
export default function SeriesHero({ eyebrow, headline, standfirst, headingRef, focusable, children }: SeriesHeroProps) {
  return (
    <section aria-labelledby="series-headline">
      <p className={`${LABEL} mb-4`}>{eyebrow}</p>
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
