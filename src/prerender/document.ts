/**
 * The static documents Story 4.8 writes (AD-6/AD-7): a prerendered page is the
 * built `dist/index.html` with its head tags and rendered root injected, an
 * app-route shell is that same file with generic meta and an empty root, and
 * `sitemap.xml` / `robots.txt` list what was emitted.
 *
 * OG copy is EXPERIENCE.md · Voice and Tone · OG meta copy: the **Historic**
 * row on every series variant (winner-free, so one string serves preview,
 * result and record), the **Fallback** row on the shells. Every attribute
 * value is HTML-escaped; every URL is absolute under `SITE_URL`, with the
 * trailing slash GitHub Pages redirects a directory page to.
 *
 * Pure — no I/O.
 */
import { SHELL_ROUTES } from './outputs';
import { PRELOAD_ELEMENT_ID, type SeriesPreload, serialisePreload } from './preload';

export { SHELL_ROUTES };

export const SITE_URL = 'https://ujsolon.github.io/predictgame7/';

export const HISTORIC_OG_DESCRIPTION = 'Every Game 7 has a history. Decode the biggest game in basketball on PredictGame7.';
export const FALLBACK_OG_TITLE = 'PredictGame7 — Where data meets playoff drama';
export const FALLBACK_OG_DESCRIPTION = 'Decode the biggest game in basketball.';
export const FALLBACK_CARD = 'og/fallback.png';


const ROOT_EMPTY = '<div id="root"></div>';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `/` → the site root; `/series/x` → `…/series/x/` (the directory URL GitHub Pages serves). */
export function absoluteUrl(route: string): string {
  const trimmed = route.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? SITE_URL : `${SITE_URL}${trimmed}/`;
}

/** A `dist/`-relative asset path → its absolute URL (no trailing slash). */
export function absoluteAsset(path: string): string {
  return `${SITE_URL}${path.replace(/^\/+/, '')}`;
}

export function seriesCard(seriesId: string): string {
  return `og/${seriesId}.png`;
}

export interface OgMeta {
  title: string;
  description: string;
  /** Router path of the page. */
  route: string;
  /** `dist/`-relative card path. */
  image: string;
  /** `og:image:alt` and `twitter:image:alt` (Story 6.1); omitted when absent. */
  imageAlt?: string;
}

/** OG + Twitter tags and the canonical link, every value escaped. */
export function ogTags(meta: OgMeta): string {
  const url = absoluteUrl(meta.route);
  const tag = (attr: 'property' | 'name', key: string, content: string) =>
    `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  return [
    tag('property', 'og:title', meta.title),
    tag('property', 'og:description', meta.description),
    tag('property', 'og:url', url),
    tag('property', 'og:image', absoluteAsset(meta.image)),
    ...(meta.imageAlt ? [tag('property', 'og:image:alt', meta.imageAlt)] : []),
    tag('property', 'og:type', 'website'),
    tag('name', 'twitter:card', 'summary_large_image'),
    ...(meta.imageAlt ? [tag('name', 'twitter:image:alt', meta.imageAlt)] : []),
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  ].join('\n    ');
}

/** The app base path (`/predictgame7/`), from `SITE_URL`. */
export const SITE_BASE = new URL(SITE_URL).pathname;

/** A router path (`/series/2016/x`, `/historical?year=1968`) → its base-relative directory URL (`/predictgame7/series/2016/x/`). */
export function sitePath(target: string): string {
  const [path, query] = target.split('?', 2);
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return `${SITE_BASE}${trimmed === '' ? '' : `${trimmed}/`}${query ? `?${query}` : ''}`;
}

export interface StubInput {
  /** The router path it forwards to (a query only on a `noindex` stub). */
  target: string;
  kind: 'canonical' | 'noindex';
  /**
   * A `canonical` stub's unfurl: the slug page's OG/Twitter meta (title,
   * description, card, image alt). Its `route` is ignored — `og:url` and the
   * canonical are always the target's.
   */
  og?: OgMeta;
}

/**
 * A redirect stub (Story 6.1, owner decision 2a). Thin on purpose — no app
 * bundle, no template: GitHub Pages cannot answer a server redirect, so this
 * page is the redirect.
 * - `canonical` (an old uuid page): `rel=canonical` and `og:url` name the slug
 *   URL, so crawlers and unfurlers move to it; a tiny inline script replaces
 *   the location with the slug URL carrying the query and hash (a
 *   `?method=…&utm_source=share` link still reaches Predict, through the slug
 *   page); without JS a 0-second meta refresh reaches the slug page. The
 *   refresh sits in `<noscript>` so it cannot race the script and drop the
 *   query.
 * - `noindex` (`/series/`, `/series/<year>/`): `noindex` and a 0-second meta
 *   refresh to Historical (`?year=<year>` for a year).
 * Both carry a plain link. Forwarding URLs are base-relative, so a local
 * `vite preview` stays local; canonical and `og:url` are absolute.
 */
export function stubDocument({ target, kind, og }: StubInput): string {
  const local = sitePath(target);
  const href = escapeHtml(local);
  const head =
    kind === 'canonical'
      ? [
          ...(og
            ? [ogTags({ ...og, route: target })]
            : [
                `<link rel="canonical" href="${escapeHtml(absoluteUrl(target))}" />`,
                `<meta property="og:url" content="${escapeHtml(absoluteUrl(target))}" />`,
              ]),
          `<script>location.replace(${JSON.stringify(local).replace(/</g, '\\u003c')} + location.search + location.hash);</script>`,
          `<noscript><meta http-equiv="refresh" content="0; url=${href}" /></noscript>`,
        ]
      : ['<meta name="robots" content="noindex" />', `<meta http-equiv="refresh" content="0; url=${href}" />`];
  const title = kind === 'canonical' ? 'This series page has moved' : 'Redirecting to the Historical archive';
  const linkText = kind === 'canonical' ? 'Continue to the series page' : 'Continue to the Historical archive';
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${title} · PredictGame7</title>`,
    ...head.map((line) => `    ${line}`),
    '  </head>',
    '  <body>',
    `    <p><a href="${href}">${linkText}</a></p>`,
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

function injectHead(template: string, head: string): string {
  const at = template.indexOf('</head>');
  if (at < 0) throw new Error('the built index.html has no </head>');
  return `${template.slice(0, at)}  ${head}\n  ${template.slice(at)}`;
}

function assertTemplate(template: string): void {
  if (!template.includes(ROOT_EMPTY)) throw new Error(`the built index.html has no empty ${ROOT_EMPTY}`);
}

export interface PageDocumentInput {
  template: string;
  /** Helmet's `<title>` and description tags, already serialised. */
  helmetHead: string;
  og: OgMeta;
  /** `renderToString` output for `#root`. */
  body: string;
  preload: SeriesPreload;
}

/** A prerendered series page: head tags, the rendered root, then the preload ahead of the module script. */
export function pageDocument({ template, helmetHead, og, body, preload }: PageDocumentInput): string {
  assertTemplate(template);
  const withHead = injectHead(template, `${helmetHead}\n    ${ogTags(og)}`);
  const preloadScript = `<script type="application/json" id="${PRELOAD_ELEMENT_ID}">${serialisePreload(preload)}</script>`;
  // A replacer function, so `$` sequences in the rendered markup are never read as patterns.
  return withHead.replace(ROOT_EMPTY, () => `<div id="root">${body}</div>\n    ${preloadScript}`);
}

/** An app-route shell: the built shell plus generic (Fallback) meta, root left empty. */
export function shellDocument(template: string, route: string): string {
  assertTemplate(template);
  const head = [
    `<title>${escapeHtml(FALLBACK_OG_TITLE)}</title>`,
    `<meta name="description" content="${escapeHtml(FALLBACK_OG_DESCRIPTION)}" />`,
    ogTags({ title: FALLBACK_OG_TITLE, description: FALLBACK_OG_DESCRIPTION, route, image: FALLBACK_CARD }),
  ].join('\n    ');
  return injectHead(template, head);
}

/** `sitemap.xml` over absolute URLs (each escaped for XML). */
export function sitemapXml(routes: readonly string[]): string {
  const urls = routes.map((route) => `  <url><loc>${escapeHtml(absoluteUrl(route))}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`;
}
