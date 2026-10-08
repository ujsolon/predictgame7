// @vitest-environment jsdom
// Story 4.8 · the prerendered markup hydrates against the client tree, as
// `main.tsx` builds it: for each variant, a `prerenderSite` file's `#root`
// markup and preload are put into the document at the matching URL and
// `hydrateRoot` takes them over with no recoverable error, no console error,
// and the server-rendered first node kept (createRoot would replace it).
import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  single: { data: null as unknown, error: null as unknown },
  from: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/db/supabase', () => ({ supabase: { from: db.from } }));
vi.mock('posthog-js', () => ({ default: { capture: db.capture, captureException: db.captureException } }));
// `IntersectObserver` restarts the scroll observer on a 100 ms timer that outlives
// each test; the real module has no `restart` under jsdom, so the timer threw
// after teardown and failed the run with an unhandled error.
vi.mock('tailwindcss-intersect', () => ({ Observer: { restart: vi.fn(), start: vi.fn() } }));

import App from '@/App';
import { AppWrapper } from '@/components/common/PageMeta';
import {
  aba1970,
  CONTENT_FLAGSHIP_ID,
  CONTENT_RECORD_ID,
  contentFlagship,
  contentRecord,
  FLAGSHIP_2016_ID,
  flagship2016,
  NON_FLAGSHIP_ID,
  nonFlagship2018,
  PENDING_NON_FLAGSHIP_ID,
  pendingNonFlagship,
} from '@/pages/__tests__/series-fixtures';
import type { Series } from '@/types/types';
import { prerenderSite } from '../entry-server';
import { PRELOAD_ELEMENT_ID, PreloadContext, parsePreload, shouldHydrate } from '../preload';
import type { PrerenderFile } from '../types';

// Vitest serves BASE_URL as '/'; the build (server and client) uses the config base.
vi.stubEnv('BASE_URL', '/predictgame7/');

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

let files: PrerenderFile[] = [];

// What jsdom lacks and a browser has: act's environment flag, and `matchMedia`
// (the toaster reads the color scheme in an effect).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

beforeAll(() => {
  // jsdom has a `window`, so helmet would think it runs in a browser and leave
  // the server context empty; the build renders in Node, where it is false.
  const canUseDOM = HelmetProvider.canUseDOM;
  HelmetProvider.canUseDOM = false;
  try {
    const out = prerenderSite(
      [flagship2016, nonFlagship2018, aba1970, pendingNonFlagship, contentFlagship, contentRecord],
      TEMPLATE
    );
    expect(out.errors).toEqual([]);
    files = out.files;
  } finally {
    HelmetProvider.canUseDOM = canUseDOM;
  }
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  db.from.mockReset();
});

const VARIANTS: [label: string, route: string, live: Series | null][] = [
  ['record', `/series/${NON_FLAGSHIP_ID}`, null],
  ['flagship preview', `/series/${FLAGSHIP_2016_ID}`, null],
  ['flagship result', `/series/${FLAGSHIP_2016_ID}/result`, null],
  // A pending preview refreshes in the background; the live row is the same series.
  ['pending preview', `/series/${PENDING_NON_FLAGSHIP_ID}`, pendingNonFlagship],
  // Story 4.5: editorial content (markdown, an editorial image, a video facade) hydrates as cleanly.
  ['content flagship preview', `/series/${CONTENT_FLAGSHIP_ID}`, null],
  ['content flagship result', `/series/${CONTENT_FLAGSHIP_ID}/result`, null],
  ['content record', `/series/${CONTENT_RECORD_ID}`, null],
];

describe('prerendered pages hydrate against the client tree', () => {
  for (const [label, route, live] of VARIANTS) {
    it(`${label}: no recoverable error, no console error, server nodes kept`, async () => {
      const html = files.find((f) => f.path === `${route.slice(1)}/index.html`)?.content ?? '';
      const rootMatch = /<div id="root">([\s\S]*)<\/div>\n\s*<script type="application\/json"/.exec(html);
      const preloadMatch = new RegExp(`<script type="application/json" id="${PRELOAD_ELEMENT_ID}">([^<]*)</script>`).exec(html);
      expect(rootMatch && preloadMatch).toBeTruthy();

      db.single = { data: live, error: null };
      db.from.mockImplementation(() => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(db.single) }) }),
      }));

      window.history.replaceState(null, '', `/predictgame7${route}/`);
      document.body.innerHTML = `<div id="root">${rootMatch?.[1] ?? ''}</div><script type="application/json" id="${PRELOAD_ELEMENT_ID}">${preloadMatch?.[1] ?? ''}</script>`;
      const container = document.getElementById('root') as HTMLElement;
      const firstNode = container.firstChild;
      const preload = parsePreload(document.getElementById(PRELOAD_ELEMENT_ID)?.textContent);
      expect(
        shouldHydrate({
          hasChildren: container.hasChildNodes(),
          preload,
          pathname: window.location.pathname,
          search: window.location.search,
          base: import.meta.env.BASE_URL,
        })
      ).toBe(true);

      const consoleError = vi.spyOn(console, 'error');
      const onRecoverableError = vi.fn();
      await act(async () => {
        root = hydrateRoot(
          container,
          <AppWrapper>
            <PreloadContext.Provider value={preload}>
              <App />
            </PreloadContext.Provider>
          </AppWrapper>,
          { onRecoverableError }
        );
      });
      // Let a background refresh (pending only) land and re-render.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      expect(firstNode?.isConnected).toBe(true);
      expect(container.firstChild).toBe(firstNode);
      expect(document.getElementById('series-headline')?.textContent).toBeTruthy();
      expect(db.from).toHaveBeenCalledTimes(live ? 1 : 0);
    });
  }
});
