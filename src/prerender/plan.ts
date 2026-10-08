/**
 * The prerender route set (Story 4.8, AD-7): every row of the live read, to
 * the pages it gets. Derived per row through `toSeriesView` — phase from
 * `deriveSeriesPhase` (AD-4), never `status`, dates or `league` — and, since
 * Story 4.5, flagship-ness from the row's own `is_featured` (migration `00019`):
 * - archive, not featured → `series/<id>/index.html` (the full record);
 * - archive, featured → that path as the spoiler-free preview, plus
 *   `series/<id>/result/index.html` (the full record, outcome included);
 * - pending (featured or not) → the preview only: no reveal and no result
 *   page (4.3's `/result` answers 404 for a pending series).
 *
 * Fails loud: an empty read, any row `toSeriesView` cannot show (listed by
 * id), a row without a boolean `is_featured` (the read predates `00019`), or
 * any invalid editorial content (`parseSeriesContent`, every item listed by
 * series id), or a read with no featured row at all is an error, never a page quietly left out. Pure — no I/O.
 */
import { parseSeriesContent } from '@/lib/series-content';
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
  /** Rows with `is_featured` — logged by the build. */
  featured: number;
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

export function planSeriesPages(rows: readonly Series[]): SeriesPlan {
  const errors: string[] = [];
  if (rows.length === 0) {
    return { pages: [], errors: ['the series read returned no rows — refusing to prerender an empty archive'], featured: 0 };
  }

  const unshowable: string[] = [];
  const unflagged: string[] = [];
  const contentErrors: string[] = [];
  const pages: PlannedPage[] = [];
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
    const route = seriesRoute(view.id);

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
  return { pages, errors, featured };
}
