// Node environment on purpose (no jsdom): Story 4.8 prerenders these page
// components at build time, so render must not touch `window`, `document`,
// `localStorage` or `navigator` — focus and titles move in effects only.
import { renderToString } from 'react-dom/server';
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async';
import { StaticRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import SeriesFullRecord from '@/pages/series/SeriesFullRecord';
import SeriesPreview from '@/pages/series/SeriesPreview';
import type { Series } from '@/types/types';
import {
  aba1970,
  FLAGSHIP_2016_GAME7,
  FLAGSHIP_2016_ID,
  flagship2016,
  NON_FLAGSHIP_ID,
  nonFlagship2018,
  pending2026,
} from './series-fixtures';

function ssr(location: string, element: React.ReactNode) {
  const context: { helmet?: HelmetServerState } = {};
  const html = renderToString(
    <HelmetProvider context={context}>
      <StaticRouter location={location}>{element}</StaticRouter>
    </HelmetProvider>
  );
  return { html, title: context.helmet?.title.toString() ?? '' };
}

describe('series pages render without a browser (SSR)', () => {
  it('runs in a node environment', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('flagship preview: spoiler-free HTML and a winner-free title', () => {
    const { html, title } = ssr(`/series/${FLAGSHIP_2016_ID}`, <SeriesPreview series={flagship2016} />);
    expect(html).toContain('Cavaliers and Warriors stand three games apiece');
    expect(html).toContain('GAME 7 · 2016 FINALS');
    expect(html).toContain(`href="/series/${FLAGSHIP_2016_ID}/result"`);
    expect(html).not.toContain(String(FLAGSHIP_2016_GAME7.cle));
    expect(html).not.toContain('win Game 7');
    expect(html).not.toContain('4–3');
    expect(title).toContain('Cleveland Cavaliers vs Golden State Warriors — Game 7, 2016 Finals · PredictGame7');
  });

  it('pending preview renders without a reveal', () => {
    const { html } = ssr('/series/x', <SeriesPreview series={pending2026} />);
    expect(html).toContain('Spurs and Thunder stand three games apiece');
    expect(html).not.toContain('See how the series ended');
  });

  it('flagship result and non-flagship full record render the outcome', () => {
    const result = ssr(`/series/${FLAGSHIP_2016_ID}/result`, <SeriesFullRecord series={flagship2016} variant="result" />);
    expect(result.html).toContain('Cavaliers win Game 7');
    expect(result.html).toContain('tabindex="-1"');
    expect(result.title).toContain('2016 Finals: Cavaliers win Game 7 · PredictGame7');

    const record = ssr(`/series/${NON_FLAGSHIP_ID}`, <SeriesFullRecord series={nonFlagship2018} variant="record" />);
    expect(record.html).toContain('Cavaliers win Game 7');
    expect(record.html).toContain('Final series');
  });

  it('ABA full record carries its league in the eyebrow', () => {
    const { html } = ssr('/series/x', <SeriesFullRecord series={aba1970} variant="record" />);
    expect(html).toContain('GAME 7 · 1970 ABA WESTERN DIVISION SEMIFINALS');
    expect(html).not.toMatch(/\b(home|away)\b/i);
  });

  it('an unshowable row renders the 404 block, still without a browser', () => {
    const broken: Series = { ...nonFlagship2018, series_game_scores: [] };
    const { html } = ssr('/series/x', <SeriesFullRecord series={broken} variant="record" />);
    expect(html).toContain("This series doesn&#x27;t exist.");
  });
});
