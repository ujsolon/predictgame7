/**
 * What Story 4.8's prerender writes under `dist/` — and removes when it fails.
 * Import-free on purpose: `scripts/prerender/run.ts` imports it at runtime in
 * plain Node (type-stripped), where neither the `@/` alias nor JSX resolves.
 */

/** The four app routes that get a static shell (`dist/<name>/index.html`). */
export const SHELL_ROUTES = ['/predict', '/historical', '/insights', '/maths'] as const;

/** Every output path, `dist/`-relative. Never `index.html`, `404.html` or `og/`. */
export const OUTPUT_PATHS: readonly string[] = [
  'series',
  ...SHELL_ROUTES.map((route) => route.slice(1)),
  'sitemap.xml',
  'robots.txt',
];
