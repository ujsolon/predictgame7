/**
 * The prerender route set (Story 4.8, AD-7): every row of the live read, to
 * the pages it gets. Derived per row through `toSeriesView` — phase from
 * `deriveSeriesPhase` (AD-4), never `status`, dates or `league`:
 * - archive, not flagship → `series/<id>/index.html` (the full record);
 * - archive, flagship → that path as the spoiler-free preview, plus
 *   `series/<id>/result/index.html` (the full record, outcome included);
 * - pending → the preview only: no reveal and no result page (4.3's `/result`
 *   answers 404 for a pending series).
 *
 * Fails loud: an empty read, any row `toSeriesView` cannot show (listed by
 * id), or a pinned flagship that is absent or not archived is an error, never
 * a page quietly left out. Pure — no I/O.
 */
import { FLAGSHIP_SERIES_IDS } from '@/lib/flagship-series';
import { resultHref, spoilerNeutralView, toSeriesView, yearRound } from '@/pages/series/series-view';
import type { Series } from '@/types/types';
import { type SeriesPreload, stripOutcome } from './preload';

export interface PlannedPage {
  seriesId: string;
  /** Router path (basename stripped), no trailing slash. */
  route: string;
  /** Output path relative to `dist/`. */
  file: string;
  preload: SeriesPreload;
  /** EXPERIENCE.md's Historic `og:title`, in spoiler-neutral order. */
  ogTitle: string;
}

export interface SeriesPlan {
  pages: PlannedPage[];
  errors: string[];
}

/** "{A} vs {B} — Game 7, {Year} {Round}" — spoiler-neutral order, `yearRound` league wording, never an outcome. */
export function historicOgTitle(series: Series): string | null {
  const view = toSeriesView(series);
  if (!view) return null;
  const neutral = spoilerNeutralView(view);
  return `${neutral.teamA.full_name} vs ${neutral.teamB.full_name} — Game 7, ${yearRound(neutral)}`;
}

export function seriesRoute(id: string): string {
  return `/series/${id}`;
}

/** `/series/<id>` → `series/<id>/index.html`. */
export function routeFile(route: string): string {
  return `${route.replace(/^\/+|\/+$/g, '')}/index.html`;
}

export function planSeriesPages(rows: readonly Series[], flagshipIds: readonly string[] = FLAGSHIP_SERIES_IDS): SeriesPlan {
  const errors: string[] = [];
  if (rows.length === 0) {
    return { pages: [], errors: ['the series read returned no rows — refusing to prerender an empty archive'] };
  }

  // The same list decides the pages and is validated below (default: the pinned ids the app routes use).
  const flagships = new Set(flagshipIds.map((id) => id.toLowerCase()));
  const unshowable: string[] = [];
  const pages: PlannedPage[] = [];
  const archivedIds = new Set<string>();
  const seenIds = new Set<string>();

  for (const row of rows) {
    seenIds.add(row.id.toLowerCase());
    const view = toSeriesView(row);
    const ogTitle = historicOgTitle(row);
    if (!view || !ogTitle) {
      unshowable.push(`${row.id} (${row.year} ${row.round})`);
      continue;
    }
    const route = seriesRoute(view.id);
    const flagship = flagships.has(view.id.toLowerCase());

    if (view.phase === 'archive') archivedIds.add(view.id.toLowerCase());

    if (view.phase === 'archive' && !flagship) {
      pages.push({
        seriesId: view.id,
        route,
        file: routeFile(route),
        preload: { path: route, variant: 'record', reveal: false, series: row },
        ogTitle,
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
    });
    if (reveal) {
      const result = resultHref(view.id);
      pages.push({
        seriesId: view.id,
        route: result,
        file: routeFile(result),
        preload: { path: result, variant: 'result', reveal: false, series: row },
        ogTitle,
      });
    }
  }

  if (unshowable.length > 0) {
    errors.push(`${unshowable.length} series row(s) cannot be shown (toSeriesView → null): ${unshowable.join('; ')}`);
  }
  for (const id of flagshipIds) {
    const key = id.toLowerCase();
    if (!seenIds.has(key)) errors.push(`pinned flagship ${id} is absent from the series read`);
    else if (!archivedIds.has(key)) errors.push(`pinned flagship ${id} is not archived (no derivable archive phase)`);
  }
  return { pages, errors };
}
