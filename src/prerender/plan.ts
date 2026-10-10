/**
 * The prerender route set (Story 4.8, AD-7): every row of the live read, to
 * the pages it gets. Derived per row through `toSeriesView` — phase from
 * `deriveSeriesPhase` (AD-4), never `status`, dates or `league` — and, since
 * Story 4.5, flagship-ness from the row's own `is_featured` (migration `00019`):
 * - archive, not featured → `series/<year>/<slug>/index.html` (the full record);
 * - archive, featured → that path as the spoiler-free preview, plus
 *   `series/<year>/<slug>/result/index.html` (the full record, outcome included);
 * - pending (featured or not) → the preview only: no reveal and no result
 *   page (4.3's `/result` answers 404 for a pending series).
 *
 * Story 6.1: page paths are the readable slug paths (`seriesHref`, through
 * `src/lib/series-slug.ts`). Every row's old uuid path stays emitted as a
 * stub forwarding to its slug page (and, for a flagship with a result, the
 * uuid result path to the slug result path); `series/` and one
 * `series/<year>/` per year with a series are redirect stubs to Historical.
 * Stubs are never sitemap routes. Two rows with the same `year/slug` fail the
 * plan, naming both ids.
 *
 * Fails loud: an empty read, any row `toSeriesView` cannot show (listed by
 * id), a row without a boolean `is_featured` (the read predates `00019`), or
 * any invalid editorial content (`parseSeriesContent`, every item listed by
 * series id), or a read with no featured row at all is an error, never a page quietly left out. Pure — no I/O.
 */
import { matchupLabel } from '@/lib/matchup';
import { parseSeriesContent } from '@/lib/series-content';
import { resultHref, type SeriesView, seriesHref, toSeriesView, yearRound } from '@/pages/series/series-view';
import type { Series } from '@/types/types';
import { type SeriesPreload, stripOutcome } from './preload';

export interface PlannedPage {
  seriesId: string;
  /** Router path (basename stripped), no trailing slash. */
  route: string;
  /** Output path relative to `dist/`. */
  file: string;
  preload: SeriesPreload;
  /** EXPERIENCE.md's Historic `og:title`, in stored (home-first) order. */
  ogTitle: string;
  /** `og:image:alt` / `twitter:image:alt` (Story 6.1): the matchup, never the winner. */
  ogImageAlt: string;
}

/**
 * A redirect stub (Story 6.1): a thin page at `file` that forwards to `target`
 * (a router path). `canonical` stubs (the old uuid pages) carry the target as
 * `rel=canonical` / `og:url` and carry the query across; `noindex` stubs
 * (`/series/`, `/series/<year>/`) only forward. Never in the sitemap.
 */
export interface PlannedStub {
  file: string;
  target: string;
  kind: 'canonical' | 'noindex';
  /** A uuid stub's unfurl (review fix): its slug page's series, `og:title` and image alt, so an old link re-scraped unfurls the same card. */
  og?: { seriesId: string; title: string; imageAlt: string };
}

export interface SeriesPlan {
  pages: PlannedPage[];
  stubs: PlannedStub[];
  errors: string[];
  /** Rows with `is_featured` — logged by the build. */
  featured: number;
}

/** "{A} vs {B} — Game 7, {Year} {Round}" — stored order (`team_a`, the home team, first; Story 6.8), `yearRound` league wording, never an outcome. */
export function historicOgTitle(series: Series): string | null {
  const view = toSeriesView(series);
  if (!view) return null;
  return `${matchupLabel(view.teamA.full_name, view.teamB.full_name)} — Game 7, ${yearRound(view)}`;
}

/** "Game 7 card: {A} vs {B}, {Year} {League }{Round}" — stored order, `yearRound` wording, never the winner. */
export function ogImageAlt(view: SeriesView): string {
  return `Game 7 card: ${matchupLabel(view.teamA.full_name, view.teamB.full_name)}, ${yearRound(view)}`;
}

/** The legacy uuid path of a series page (Story 4.8's route, a stub since Story 6.1). */
export function uuidRoute(id: string, variant: 'page' | 'result' = 'page'): string {
  return `/series/${id}${variant === 'result' ? '/result' : ''}`;
}

/** `/series/2016/x` → `series/2016/x/index.html` (any router path → its directory index). */
export function routeFile(route: string): string {
  return `${route.replace(/^\/+|\/+$/g, '')}/index.html`;
}

export function planSeriesPages(rows: readonly Series[]): SeriesPlan {
  const errors: string[] = [];
  if (rows.length === 0) {
    return { pages: [], stubs: [], errors: ['the series read returned no rows — refusing to prerender an empty archive'], featured: 0 };
  }

  const unshowable: string[] = [];
  const unflagged: string[] = [];
  const contentErrors: string[] = [];
  const pages: PlannedPage[] = [];
  const stubs: PlannedStub[] = [];
  const years = new Set<number>();
  /** `year/slug` → the ids that claim it. */
  const claims = new Map<string, string[]>();
  const unslugged: string[] = [];
  let featured = 0;

  for (const row of rows) {
    if (typeof row.is_featured !== 'boolean') unflagged.push(row.id);
    const flagship = row.is_featured === true;
    if (flagship) featured += 1;
    contentErrors.push(...parseSeriesContent(row.series_content ?? [], row.id).errors);

    const view = toSeriesView(row);
    const ogTitle = historicOgTitle(row);
    if (!view || !ogTitle) {
      unshowable.push(`${row.id} (${row.year} ${row.round})`);
      continue;
    }
    const route = seriesHref(view);
    if (route === uuidRoute(view.id)) {
      unslugged.push(`${row.id} (${row.year} ${row.round})`);
      continue;
    }
    claims.set(route, [...(claims.get(route) ?? []), row.id]);
    years.add(view.year);
    const imageAlt = ogImageAlt(view);
    stubs.push({
      file: routeFile(uuidRoute(view.id)),
      target: route,
      kind: 'canonical',
      og: { seriesId: view.id, title: ogTitle, imageAlt },
    });

    if (view.phase === 'archive' && !flagship) {
      pages.push({
        seriesId: view.id,
        route,
        file: routeFile(route),
        preload: { path: route, variant: 'record', reveal: false, series: row },
        ogTitle,
        ogImageAlt: imageAlt,
      });
      continue;
    }

    // The preview renders from the stripped row on server and client alike;
    // it must still be showable once the outcome is gone.
    const stripped = stripOutcome(row);
    if (!toSeriesView(stripped)) {
      unshowable.push(`${row.id} (${row.year} ${row.round}): its preview row does not reconcile once Game 7 is removed`);
      continue;
    }
    const reveal = view.phase === 'archive' && flagship;
    pages.push({
      seriesId: view.id,
      route,
      file: routeFile(route),
      preload: { path: route, variant: 'preview', reveal, series: stripped },
      ogTitle,
      ogImageAlt: imageAlt,
    });
    if (reveal) {
      const result = resultHref(view);
      pages.push({
        seriesId: view.id,
        route: result,
        file: routeFile(result),
        preload: { path: result, variant: 'result', reveal: false, series: row },
        ogTitle,
        ogImageAlt: imageAlt,
      });
      stubs.push({
        file: routeFile(uuidRoute(view.id, 'result')),
        target: result,
        kind: 'canonical',
        og: { seriesId: view.id, title: ogTitle, imageAlt },
      });
    }
  }

  stubs.push({ file: routeFile('/series'), target: '/historical', kind: 'noindex' });
  for (const year of [...years].sort((a, b) => a - b)) {
    stubs.push({ file: routeFile(`/series/${year}`), target: `/historical?year=${year}`, kind: 'noindex' });
  }

  const duplicates = [...claims].filter(([, ids]) => ids.length > 1);
  if (duplicates.length > 0) {
    errors.push(
      `${duplicates.length} duplicate series slug(s) — every /series/<year>/<slug> must name one series: ${duplicates
        .map(([route, ids]) => `${route} (${ids.join(', ')})`)
        .join('; ')}`
    );
  }
  if (unslugged.length > 0) {
    errors.push(`${unslugged.length} series row(s) have no slug (a team name with no ASCII letter or digit): ${unslugged.join('; ')}`);
  }

  if (unshowable.length > 0) {
    errors.push(`${unshowable.length} series row(s) cannot be shown (toSeriesView → null): ${unshowable.join('; ')}`);
  }
  if (unflagged.length > 0) {
    errors.push(
      `${unflagged.length} series row(s) carry no boolean is_featured (is migration 00019 applied, and does the read select it?): ${unflagged.join(', ')}`
    );
  }
  // The floor the pinned-flagship check used to give: a read that lost its flags
  // would otherwise prerender no preview/result pair at all, silently.
  if (featured === 0) {
    errors.push('no series row has is_featured = true — refusing to prerender without a single featured series');
  }
  if (contentErrors.length > 0) {
    errors.push(`${contentErrors.length} invalid editorial content item(s): ${contentErrors.join('; ')}`);
  }
  return { pages, stubs, errors, featured };
}
