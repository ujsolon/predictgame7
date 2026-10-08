/**
 * Story 4.8's server entry (AD-7): renders every planned series page through
 * the app's own route tree — `AppRoutes`, the same components and routes the
 * SPA mounts, wrapped in `StaticRouter` instead of `BrowserRouter` — and
 * builds the static site files around it. No fork of the app.
 *
 * Loaded by `scripts/prerender/run.ts` through Vite's SSR loader (never
 * imported statically there, so no JSX enters the pipeline program), and
 * directly by the unit tests.
 */
import { renderToString } from 'react-dom/server';
import type { HelmetServerState } from 'react-helmet-async';
import { StaticRouter } from 'react-router-dom';
import { AppRoutes } from '@/App';
import { AppWrapper } from '@/components/common/PageMeta';
import type { Series } from '@/types/types';
import {
  FALLBACK_CARD,
  HISTORIC_OG_DESCRIPTION,
  pageDocument,
  robotsTxt,
  SHELL_ROUTES,
  seriesCard,
  shellDocument,
  sitemapXml,
} from './document';
import { planSeriesPages, routeFile } from './plan';
import { PreloadContext, type SeriesPreload } from './preload';
import type { PrerenderFile, PrerenderOutput, PrerenderSummary } from './types';

export type { PrerenderFile, PrerenderOutput, PrerenderSummary } from './types';

/**
 * The router basename, exactly as the client's `BrowserRouter` gets it
 * (`import.meta.env.BASE_URL`, trailing slash kept): read per call, and never
 * normalised, because the basename is reflected in link `href`s and React does
 * not patch a mismatched attribute on hydration (measured: a slash-less server
 * basename left the Home link at `/predictgame7` against the client's
 * `/predictgame7/`).
 */
export function basename(): string {
  return import.meta.env.BASE_URL;
}

export interface RenderedPage {
  html: string;
  helmetHead: string;
}

/** One page through the shared tree, at its canonical (trailing-slash) URL. */
export function renderRoute(route: string, preload: SeriesPreload | null): RenderedPage {
  const context: { helmet?: HelmetServerState } = {};
  const base = basename();
  const html = renderToString(
    <AppWrapper context={context}>
      <PreloadContext.Provider value={preload}>
        <StaticRouter basename={base} location={`${base.replace(/\/+$/, '')}${route}/`}>
          <AppRoutes />
        </StaticRouter>
      </PreloadContext.Provider>
    </AppWrapper>
  );
  const helmet = context.helmet;
  const helmetHead = helmet ? [helmet.title.toString(), helmet.meta.toString()].filter(Boolean).join('\n    ') : '';
  return { html, helmetHead };
}

export function prerenderSite(rows: readonly Series[], template: string, flagshipIds?: readonly string[]): PrerenderOutput {
  const plan = planSeriesPages(rows, flagshipIds);
  const summary: PrerenderSummary = { rows: rows.length, record: 0, preview: 0, result: 0, shells: 0, sitemapUrls: 0 };
  if (plan.errors.length > 0) return { files: [], cards: [], errors: plan.errors, summary };

  const errors: string[] = [];
  const files: PrerenderFile[] = [];
  const cards = new Set<string>([FALLBACK_CARD]);

  for (const page of plan.pages) {
    try {
      const { html, helmetHead } = renderRoute(page.route, page.preload);
      if (!html.includes('id="series-headline"')) {
        throw new Error('rendered without the series headline (the route did not render the preloaded page)');
      }
      if (!/<title[^>]*>[^<]+<\/title>/.test(helmetHead)) throw new Error('rendered without a <title>');
      const card = seriesCard(page.seriesId);
      cards.add(card);
      files.push({
        path: page.file,
        content: pageDocument({
          template,
          helmetHead,
          og: { title: page.ogTitle, description: HISTORIC_OG_DESCRIPTION, route: page.route, image: card },
          body: html,
          preload: page.preload,
        }),
      });
      summary[page.preload.variant] += 1;
    } catch (error) {
      errors.push(`${page.route}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    for (const route of SHELL_ROUTES) {
      files.push({ path: routeFile(route), content: shellDocument(template, route) });
      summary.shells += 1;
    }
  } catch (error) {
    errors.push(`shells: ${error instanceof Error ? error.message : String(error)}`);
  }

  const sitemapRoutes = ['/', ...SHELL_ROUTES, ...plan.pages.map((page) => page.route)];
  summary.sitemapUrls = sitemapRoutes.length;
  files.push({ path: 'sitemap.xml', content: sitemapXml(sitemapRoutes) });
  files.push({ path: 'robots.txt', content: robotsTxt() });

  if (errors.length > 0) return { files: [], cards: [], errors, summary };
  return { files, cards: [...cards], errors, summary };
}
