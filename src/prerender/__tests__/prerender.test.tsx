// Story 4.8 · the prerender, end to end over the 4.3 fixtures, in a Node
// environment on purpose: the build renders the real route tree without a
// browser, so nothing here may need `window` or `document`.
import { describe, expect, it, vi } from 'vitest';

// The route tree imports every page; their module-level clients are not
// what is under test, and CI has no Supabase env to construct one from.
vi.mock('@/db/supabase', () => ({ supabase: { from: vi.fn(() => { throw new Error('the prerender must not fetch'); }) } }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn(), captureException: vi.fn() } }));

import {
  aba1970,
  BROKEN_ID,
  broken,
  FLAGSHIP_2016_GAME7,
  FLAGSHIP_2016_ID,
  flagship2016,
  NON_FLAGSHIP_ID,
  nonFlagship2018,
  PENDING_ID,
  PENDING_NON_FLAGSHIP_ID,
  pending2026,
  pendingNonFlagship,
} from '@/pages/__tests__/series-fixtures';
import type { Series } from '@/types/types';
import { type DistIo, OUTPUT_PATHS, runPrerender } from '../build';
import { absoluteUrl, escapeHtml, ogTags, robotsTxt, SITE_URL, shellDocument, sitemapXml } from '../document';
import { prerenderSite, renderRoute } from '../entry-server';
import { planSeriesPages } from '../plan';
import { PRELOAD_ELEMENT_ID, parsePreload, type SeriesPreload, serialisePreload, shouldHydrate, stripOutcome } from '../preload';
import type { PrerenderOutput } from '../types';

// Vitest serves BASE_URL as '/'; the build's base is '/predictgame7/', and the
// server entry reads it per render, as the client router does.
vi.stubEnv('BASE_URL', '/predictgame7/');

/** The shape of the built `dist/index.html` (Vite hoists the module script into the head). */
const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script type="module" crossorigin src="/predictgame7/assets/index-AbCdEfGh.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const FLAGSHIPS = [FLAGSHIP_2016_ID];
const ROWS: Series[] = [flagship2016, nonFlagship2018, aba1970, pending2026, pendingNonFlagship];

function site(rows: readonly Series[] = ROWS, flagships: readonly string[] = FLAGSHIPS) {
  const out = prerenderSite(rows, TEMPLATE, flagships);
  const file = (path: string) => out.files.find((f) => f.path === path)?.content;
  return { out, file };
}

function preloadOf(html: string): SeriesPreload {
  const m = new RegExp(`<script type="application/json" id="${PRELOAD_ELEMENT_ID}">([^<]*)</script>`).exec(html);
  const preload = parsePreload(m?.[1]);
  if (!preload) throw new Error('no preload in the page');
  return preload;
}

function meta(html: string, key: string): string | undefined {
  return new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)" />`).exec(html)?.[1];
}

describe('the route set (I/O matrix)', () => {
  it('runs in a node environment', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('emits one page per row plus a result page per archived flagship, and nothing else under series/', () => {
    const { out } = site();
    expect(out.errors).toEqual([]);
    const seriesFiles = out.files.map((f) => f.path).filter((p) => p.startsWith('series/')).sort();
    expect(seriesFiles).toEqual(
      [
        `series/${FLAGSHIP_2016_ID}/index.html`,
        `series/${FLAGSHIP_2016_ID}/result/index.html`,
        `series/${NON_FLAGSHIP_ID}/index.html`,
        `series/${aba1970.id}/index.html`,
        `series/${PENDING_ID}/index.html`,
        `series/${PENDING_NON_FLAGSHIP_ID}/index.html`,
      ].sort()
    );
    expect(out.summary).toMatchObject({ rows: 5, record: 2, preview: 3, result: 1, shells: 4 });
  });

  it('non-flagship archive: the full record, its outcome title, Historic OG tags and the full-row preload', () => {
    const { file } = site();
    const html = file(`series/${NON_FLAGSHIP_ID}/index.html`) ?? '';
    expect(html).toContain('Cavaliers win Game 7');
    expect(html).toMatch(/<title data-rh="true">Boston Celtics vs Cleveland Cavaliers, 2018 Eastern Conference Finals: Cavaliers win Game 7 · PredictGame7<\/title>/);
    // Historic row, spoiler-neutral order (Cavaliers before Celtics), never the outcome.
    expect(meta(html, 'og:title')).toBe('Cleveland Cavaliers vs Boston Celtics — Game 7, 2018 Eastern Conference Finals');
    expect(meta(html, 'og:description')).toBe('Every Game 7 has a history. Decode the biggest game in basketball on PredictGame7.');
    expect(meta(html, 'og:url')).toBe(`${SITE_URL}series/${NON_FLAGSHIP_ID}/`);
    expect(meta(html, 'og:image')).toBe(`${SITE_URL}og/${NON_FLAGSHIP_ID}.png`);
    expect(meta(html, 'og:type')).toBe('website');
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}series/${NON_FLAGSHIP_ID}/" />`);
    const preload = preloadOf(html);
    expect(preload).toMatchObject({ path: `/series/${NON_FLAGSHIP_ID}`, variant: 'record', reveal: false });
    expect(preload.series).toEqual(nonFlagship2018);
  });

  it('ABA archive: the league in the eyebrow and in the OG title', () => {
    const { file } = site();
    const html = file(`series/${aba1970.id}/index.html`) ?? '';
    expect(html).toContain('GAME 7 · 1970 ABA WESTERN DIVISION SEMIFINALS');
    expect(meta(html, 'og:title')).toBe('Washington Caps vs Denver Rockets — Game 7, 1970 ABA Western Division Semifinals');
  });

  it('flagship: a spoiler-free preview with the reveal link, and a result page that carries the outcome (B10)', () => {
    const { file } = site();
    const preview = file(`series/${FLAGSHIP_2016_ID}/index.html`) ?? '';
    const result = file(`series/${FLAGSHIP_2016_ID}/result/index.html`) ?? '';
    const { cle, gsw } = FLAGSHIP_2016_GAME7;

    // The whole file — head, rendered root and preload — carries no outcome.
    const pairs = [`${cle}–${gsw}`, `${gsw}–${cle}`, `${cle}-${gsw}`, `${gsw}-${cle}`];
    // React separates adjacent text nodes with `<!-- -->`; a pair is looked for with those removed too.
    const flatPreview = preview.split('<!-- -->').join('');
    for (const pair of pairs) {
      expect(preview).not.toContain(pair);
      expect(flatPreview).not.toContain(pair);
    }
    expect(preview).not.toMatch(new RegExp(`\\b${cle}\\b`));
    expect(preview).not.toContain('game_number":7');
    expect(preview).not.toContain('winner_team":{');
    expect(preview).not.toContain('win Game 7');
    expect(preview).not.toContain('4–3');
    expect(preview).not.toContain('Final series');

    expect(preview).toContain('Cavaliers and Warriors stand three games apiece');
    expect(preview).toContain(`href="/predictgame7/series/${FLAGSHIP_2016_ID}/result"`);
    expect(preview).toMatch(/<title data-rh="true">Cleveland Cavaliers vs Golden State Warriors — Game 7, 2016 Finals · PredictGame7<\/title>/);
    const pv = preloadOf(preview);
    expect(pv).toMatchObject({ path: `/series/${FLAGSHIP_2016_ID}`, variant: 'preview', reveal: true });
    expect(pv.series).toEqual(stripOutcome(flagship2016));
    // The series-level winner is null; only games 1–6 (which the preview shows) keep their per-game winners.
    expect(pv.series.winner_team_id).toBeNull();
    expect(pv.series.winner_team).toBeNull();
    expect(pv.series.series_game_scores?.map((g) => g.game_number).sort()).toEqual([1, 2, 3, 4, 5, 6]);

    // The result file is where the outcome lives.
    expect(result.split('<!-- -->').join('')).toContain(`${cle}–${gsw}`);
    expect(result).toContain('game_number":7');
    expect(result).toContain('winner_team":{');
    expect(result).toContain('Cavaliers win Game 7');
    expect(result).toContain('4–3');
    expect(result).toContain('tabindex="-1"');
    expect(preloadOf(result)).toMatchObject({ path: `/series/${FLAGSHIP_2016_ID}/result`, variant: 'result', reveal: false });
    // One winner-free OG string serves both variants.
    expect(meta(result, 'og:title')).toBe(meta(preview, 'og:title'));
    expect(meta(result, 'og:url')).toBe(`${SITE_URL}series/${FLAGSHIP_2016_ID}/result/`);
  });

  it('pending: the preview only — no reveal link, no result page', () => {
    const { file } = site();
    for (const id of [PENDING_ID, PENDING_NON_FLAGSHIP_ID]) {
      const html = file(`series/${id}/index.html`) ?? '';
      expect(html).toContain('stand three games apiece');
      expect(html).not.toContain('See how the series ended');
      expect(preloadOf(html)).toMatchObject({ variant: 'preview', reveal: false });
      expect(file(`series/${id}/result/index.html`)).toBeUndefined();
    }
  });

  it('an unshowable row fails the build, naming its id, and nothing is emitted', () => {
    const { out } = site([...ROWS, broken]);
    expect(out.files).toEqual([]);
    expect(out.errors.join('\n')).toContain(BROKEN_ID);
    expect(out.errors.join('\n')).toContain('toSeriesView → null');
  });

  it('an empty read fails', () => {
    expect(planSeriesPages([], FLAGSHIPS).errors).toHaveLength(1);
  });

  it('a pinned flagship that is absent, or present but pending, fails the build', () => {
    const absent = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const missing = site(ROWS, [FLAGSHIP_2016_ID, absent]);
    expect(missing.out.files).toEqual([]);
    expect(missing.out.errors.join('\n')).toContain(`pinned flagship ${absent} is absent`);

    const pending = site(ROWS, [PENDING_ID]);
    expect(pending.out.errors.join('\n')).toContain(`pinned flagship ${PENDING_ID} is not archived`);
  });
});

describe('the preview preload is spoiler-neutral (E14)', () => {
  /** Stripped without reordering: what the preload carried before the neutral-order fix. */
  const naiveStrip = (row: Series): Series => ({
    ...row,
    winner_team_id: null,
    winner_team: null,
    series_game_scores: (row.series_game_scores ?? []).filter((g) => g.game_number !== 7),
  });

  it('team_a is the neutral-first team and every game row is homed on it, per-game winners unchanged', () => {
    const { file } = site();
    // 2016 Finals: Cavaliers first (no swap); 2026 WCF pending: stored Thunder–Spurs, neutral Spurs first (swap).
    for (const [id, first, row] of [
      [FLAGSHIP_2016_ID, 'Cavaliers', flagship2016],
      [PENDING_ID, 'Spurs', pending2026],
    ] as const) {
      const pv = preloadOf(file(`series/${id}/index.html`) ?? '');
      const firstId = pv.series.team_a?.id;
      expect(pv.series.team_a?.nickname).toBe(first);
      expect(pv.series.team_a_id).toBe(firstId);
      expect(pv.series.team_b_id).toBe(pv.series.team_b?.id);
      const games = pv.series.series_game_scores ?? [];
      expect(games.length).toBe(6);
      for (const game of games) {
        expect(game.home_team_id).toBe(firstId);
        const stored = row.series_game_scores?.find((g) => g.game_number === game.game_number);
        expect(game.winner_team_id).toBe(stored?.winner_team_id);
        // Each team keeps its own score.
        const scoreOf = (g: typeof game, team: number) => (g.home_team_id === team ? g.home_score : g.away_score);
        expect(scoreOf(game, row.team_a_id)).toBe(stored && scoreOf(stored, row.team_a_id));
        expect(scoreOf(game, row.team_b_id)).toBe(stored && scoreOf(stored, row.team_b_id));
      }
    }
  });

  it('the rendered preview is unchanged by the reordering', () => {
    for (const row of [flagship2016, pending2026]) {
      const route = `/series/${row.id}`;
      const reveal = row === flagship2016;
      const neutral = renderRoute(route, { path: route, variant: 'preview', reveal, series: stripOutcome(row) });
      const naive = renderRoute(route, { path: route, variant: 'preview', reveal, series: naiveStrip(row) });
      expect(neutral.html).toBe(naive.html);
      expect(neutral.helmetHead).toBe(naive.helmetHead);
    }
  });
});

describe('shouldHydrate (main.tsx)', () => {
  const preload: SeriesPreload = { path: `/series/${NON_FLAGSHIP_ID}`, variant: 'record', reveal: false, series: nonFlagship2018 };
  const base = '/predictgame7/';
  const at = (pathname: string, extra: Partial<Parameters<typeof shouldHydrate>[0]> = {}) =>
    shouldHydrate({ hasChildren: true, preload, pathname, search: '', base, ...extra });

  it('hydrates the path the preload was rendered for, with or without the trailing slash', () => {
    expect(at(`/predictgame7/series/${NON_FLAGSHIP_ID}/`)).toBe(true);
    expect(at(`/predictgame7/series/${NON_FLAGSHIP_ID}`)).toBe(true);
  });

  it('strips the base before comparing, and never matches without it', () => {
    expect(at(`/series/${NON_FLAGSHIP_ID}/`, { base: '/' })).toBe(true);
    expect(at(`/other/series/${NON_FLAGSHIP_ID}/`)).toBe(false);
    expect(at(`/predictgame7x/series/${NON_FLAGSHIP_ID}/`)).toBe(false);
  });

  it('renders client-side for an empty root, no preload, another path, or a ?method= arrival', () => {
    expect(at(`/predictgame7/series/${NON_FLAGSHIP_ID}/`, { hasChildren: false })).toBe(false);
    expect(at(`/predictgame7/series/${NON_FLAGSHIP_ID}/`, { preload: null })).toBe(false);
    expect(at(`/predictgame7/series/${NON_FLAGSHIP_ID}/result/`)).toBe(false);
    expect(at(`/predictgame7/series/${FLAGSHIP_2016_ID}/`)).toBe(false);
    expect(at(`/predictgame7/series/${NON_FLAGSHIP_ID}/`, { search: '?method=elo' })).toBe(false);
    expect(at(`/predictgame7/series/${NON_FLAGSHIP_ID}/`, { search: '?utm_source=share' })).toBe(true);
  });
});

describe('shells, sitemap and robots', () => {
  it('each app-route shell is the template plus Fallback meta, with an empty root', () => {
    const { file } = site();
    for (const name of ['predict', 'historical', 'insights', 'maths']) {
      const html = file(`${name}/index.html`) ?? '';
      expect(html).toContain('<div id="root"></div>');
      expect(html).not.toContain(PRELOAD_ELEMENT_ID);
      expect(html).toContain('<title>PredictGame7 — Where data meets playoff drama</title>');
      expect(meta(html, 'og:title')).toBe('PredictGame7 — Where data meets playoff drama');
      expect(meta(html, 'og:description')).toBe('Decode the biggest game in basketball.');
      expect(meta(html, 'og:image')).toBe(`${SITE_URL}og/fallback.png`);
      expect(meta(html, 'og:url')).toBe(`${SITE_URL}${name}/`);
      expect(html).toContain(`<link rel="canonical" href="${SITE_URL}${name}/" />`);
      expect(html.replace(/\n\s*<(title|meta|link)[^>]*>(?:[^<]*<\/title>)?/g, '')).toBe(TEMPLATE.replace(/\n\s*<meta[^>]*>/g, ''));
    }
  });

  it('index.html and 404.html are never among the outputs', () => {
    const { out } = site();
    expect(out.files.map((f) => f.path)).not.toContain('index.html');
    expect(out.files.map((f) => f.path)).not.toContain('404.html');
  });

  it('sitemap.xml lists home, the four app routes and every emitted series and result URL', () => {
    const { out, file } = site();
    const xml = file('sitemap.xml') ?? '';
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
    const locs = [...xml.matchAll(/<url><loc>([^<]+)<\/loc><\/url>/g)].map((m) => m[1]);
    const pages = out.files.filter((f) => f.path.startsWith('series/')).map((f) => `${SITE_URL}${f.path.replace(/index\.html$/, '')}`);
    expect(locs).toEqual([
      SITE_URL,
      `${SITE_URL}predict/`,
      `${SITE_URL}historical/`,
      `${SITE_URL}insights/`,
      `${SITE_URL}maths/`,
      ...pages,
    ]);
    expect(out.summary.sitemapUrls).toBe(locs.length);
    expect(xml.match(/<url>/g)).toHaveLength(xml.match(/<\/url>/g)?.length ?? -1);
  });

  it('robots.txt allows all and points at the sitemap', () => {
    expect(robotsTxt()).toBe('User-agent: *\nAllow: /\n\nSitemap: https://ujsolon.github.io/predictgame7/sitemap.xml\n');
  });
});

describe('escaping', () => {
  it('escapes every attribute value and builds directory URLs', () => {
    expect(escapeHtml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
    expect(absoluteUrl('/')).toBe(SITE_URL);
    expect(absoluteUrl('/series/x/result')).toBe(`${SITE_URL}series/x/result/`);
    const tags = ogTags({ title: `"><script>alert('x')</script>`, description: 'A & B', route: '/series/x', image: 'og/x.png' });
    expect(tags).not.toContain('<script>');
    expect(tags).toContain('content="&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"');
    expect(tags).toContain('content="A &amp; B"');
    expect(sitemapXml(['/a&b'])).toContain(`<loc>${SITE_URL}a&amp;b/</loc>`);
  });

  it('serialises the preload so no value can close its <script>, and parses it back unchanged', () => {
    const ls = String.fromCharCode(0x2028);
    const hostile = { ...nonFlagship2018, round: `</script><!-- & ${ls} -->` };
    const preload: SeriesPreload = { path: '/series/x', variant: 'record', reveal: false, series: hostile };
    const json = serialisePreload(preload);
    expect(json).not.toMatch(/[<>&]/);
    expect(json).not.toContain(ls);
    expect(parsePreload(json)).toEqual(preload);
  });

  it('an escaped team name renders escaped in the page and its OG tags', () => {
    const odd = {
      ...nonFlagship2018,
      team_a: { ...nonFlagship2018.team_a!, full_name: 'Boston "<Celtics>"', nickname: 'Celtics' },
    } as Series;
    const { out, file } = site([flagship2016, odd]);
    expect(out.errors).toEqual([]);
    const html = file(`series/${NON_FLAGSHIP_ID}/index.html`) ?? '';
    expect(html).not.toContain('"<Celtics>"');
    expect(meta(html, 'og:title')).toBe('Cleveland Cavaliers vs Boston &quot;&lt;Celtics&gt;&quot; — Game 7, 2018 Eastern Conference Finals');
  });

  it('a malformed preload is ignored, never thrown', () => {
    expect(parsePreload('{')).toBeNull();
    expect(parsePreload('{"path":"/x"}')).toBeNull();
    expect(parsePreload(null)).toBeNull();
  });
});

describe('runPrerender (fail loud, outputs removed)', () => {
  const ENV = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' };
  const STALE = ['series/old/index.html', 'predict/index.html', 'sitemap.xml', 'robots.txt'];

  function memoryDist(opts: { cards?: string[]; emptyWrites?: boolean } = {}) {
    const files = new Map<string, string>([
      ['index.html', TEMPLATE],
      ['404.html', TEMPLATE],
      ['og/fallback.png', 'png'],
      ...(opts.cards ?? ROWS.map((r) => `og/${r.id}.png`)).map((c): [string, string] => [c, 'png']),
      ...STALE.map((p): [string, string] => [p, 'stale']),
    ]);
    const io: DistIo = {
      exists: (p) => (files.get(p) ?? '').length > 0,
      read: (p) => files.get(p) ?? null,
      write: (p, c) => void files.set(p, opts.emptyWrites ? '' : c),
      remove: (p) => {
        for (const key of [...files.keys()]) if (key === p || key.startsWith(`${p}/`)) files.delete(key);
      },
    };
    return { files, io };
  }

  async function run(io: DistIo, rows: Series[] = ROWS, env: Record<string, string | undefined> = ENV) {
    const errors: string[] = [];
    const lines: string[] = [];
    const code = await runPrerender({
      env,
      fetchRows: async () => rows,
      render: async (r, t): Promise<PrerenderOutput> => prerenderSite(r, t, FLAGSHIPS),
      io,
      log: (l) => lines.push(l),
      logError: (l) => errors.push(l),
    });
    return { code, errors: errors.join('\n'), lines: lines.join('\n') };
  }

  const noOutputs = (files: Map<string, string>) =>
    [...files.keys()].filter((k) => OUTPUT_PATHS.some((p) => k === p || k.startsWith(`${p}/`)));

  it('writes every page, shell, sitemap and robots, and leaves index.html, 404.html and og/ alone', async () => {
    const { files, io } = memoryDist();
    const r = await run(io);
    expect(r.code).toBe(0);
    expect(files.has('series/old/index.html')).toBe(false);
    expect(files.get(`series/${NON_FLAGSHIP_ID}/index.html`)).toContain('Cavaliers win Game 7');
    expect(files.get('predict/index.html')).toContain('og/fallback.png');
    expect(files.get('index.html')).toBe(TEMPLATE);
    expect(files.get('404.html')).toBe(TEMPLATE);
    expect(files.get('og/fallback.png')).toBe('png');
    expect(r.lines).toContain('6 series pages (2 record + 3 preview + 1 result) from 5 series read, 4 shells, sitemap 11 URLs');
  });

  it('missing env: exit non-zero and nothing deleted', async () => {
    const { files, io } = memoryDist();
    const r = await run(io, ROWS, {});
    expect(r.code).not.toBe(0);
    for (const p of STALE) expect(files.get(p)).toBe('stale');
  });

  it('an unshowable row: exit non-zero listing the id, outputs removed', async () => {
    const { files, io } = memoryDist();
    const r = await run(io, [...ROWS, broken]);
    expect(r.code).not.toBe(0);
    expect(r.errors).toContain(BROKEN_ID);
    expect(noOutputs(files)).toEqual([]);
  });

  it('a missing card: exit non-zero, outputs removed', async () => {
    const { files, io } = memoryDist({ cards: ROWS.filter((r) => r.id !== NON_FLAGSHIP_ID).map((r) => `og/${r.id}.png`) });
    const r = await run(io);
    expect(r.code).not.toBe(0);
    expect(r.errors).toContain(`dist/og/${NON_FLAGSHIP_ID}.png is missing`);
    expect(noOutputs(files)).toEqual([]);
  });

  it('a missing fallback card or index.html fails too', async () => {
    const a = memoryDist();
    a.files.delete('og/fallback.png');
    expect((await run(a.io)).code).not.toBe(0);
    expect(noOutputs(a.files)).toEqual([]);

    const b = memoryDist();
    b.files.delete('index.html');
    const r = await run(b.io);
    expect(r.code).not.toBe(0);
    expect(r.errors).toContain('dist/index.html is missing');
  });

  it('an empty read or an empty file on read-back fails, outputs removed', async () => {
    const a = memoryDist();
    expect((await run(a.io, [])).code).not.toBe(0);
    expect(noOutputs(a.files)).toEqual([]);

    const b = memoryDist({ emptyWrites: true });
    const r = await run(b.io);
    expect(r.code).not.toBe(0);
    expect(r.errors).toContain('missing or empty on read-back');
    expect(noOutputs(b.files)).toEqual([]);
  });
});

describe('shellDocument', () => {
  it('refuses a template without an empty root', () => {
    expect(() => shellDocument('<html><head></head><body></body></html>', '/predict')).toThrow(/empty/);
  });
});
