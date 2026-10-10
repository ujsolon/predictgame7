/**
 * The series preload (Story 4.8, AD-7): the one row a prerendered series page
 * was rendered from, embedded in the page as JSON so the client hydrates from
 * the identical input instead of fetching.
 *
 * Spoiler discipline (deferred B10): a preview page's preload is the row with
 * its Game 7 score row removed and the winner nulled (`stripOutcome`). The
 * server renders the preview from that same stripped row, so the outcome is
 * absent from the page source by construction, and hydration cannot mismatch.
 * A stripped flagship row derives as `pending`, so whether the preview shows
 * the reveal link travels explicitly (`reveal`), and the variant is decided
 * once at build time from the full row.
 *
 * Pure and platform-free: no `window`, no `document`, no Node APIs.
 */
import { createContext, useContext } from 'react';
import { withoutResolution } from '@/lib/series-content';
import type { Series } from '@/types/types';

export type PreloadVariant = 'preview' | 'record' | 'result';

export interface SeriesPreload {
  /** The router path the page was rendered at (basename stripped), e.g. `/series/<id>` or `/series/<id>/result`. */
  path: string;
  variant: PreloadVariant;
  /** Preview only: whether the reveal link renders (an archived flagship). */
  reveal: boolean;
  /** The row the page renders from — stripped of its outcome on a preview. */
  series: Series;
}

/** The `id` of the `<script type="application/json">` element carrying the preload. */
export const PRELOAD_ELEMENT_ID = 'pg7-preload';

export const PreloadContext = createContext<SeriesPreload | null>(null);

/** Trailing slashes ignored: GitHub Pages 301s `/x` → `/x/` for a directory page. */
export function normalisePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function samePath(a: string, b: string): boolean {
  return normalisePath(a) === normalisePath(b);
}

/** The preload, only when it was rendered for `pathname` (the router's location). */
export function usePreload(pathname: string): SeriesPreload | null {
  const preload = useContext(PreloadContext);
  return preload && samePath(preload.path, pathname) ? preload : null;
}

/**
 * The row a preview may carry: no Game 7 score row, no winner id, no winner
 * embed, and (Story 4.5) no `resolution` editorial part — only the `before`
 * part, which the preview renders. Everything else (games 1–6, both teams) is
 * what the preview shows.
 *
 * Nothing is reordered (Story 6.8): the stripped row keeps stored
 * `team_a`/`team_b` — home-first since `00020` — and every remaining game row
 * keeps its stored home/away sides and scores. The retired E14 rewrite homed
 * every game on an alphabetically-first team, which would now flip real
 * venues (the 2026 Western Conference Finals' games 3, 4 and 6, and the 1968
 * ABA Finals).
 */
export function stripOutcome(series: Series): Series {
  const games = (series.series_game_scores ?? []).filter((game) => game.game_number !== 7);
  const stripped: Series = { ...series, winner_team_id: null, winner_team: null, series_game_scores: games };
  if (series.series_content) stripped.series_content = withoutResolution(series.series_content);
  return stripped;
}

export interface HydrateInput {
  /** Whether `#root` holds server-rendered markup. */
  hasChildren: boolean;
  preload: SeriesPreload | null;
  /** `location.pathname`, base included. */
  pathname: string;
  /** `location.search`. */
  search: string;
  /** The app base (`import.meta.env.BASE_URL`, e.g. `/predictgame7/`). */
  base: string;
}

/** `location.pathname` with the base stripped — the router's path. */
export function routerPath(pathname: string, base: string): string {
  const prefix = base.replace(/\/+$/, '');
  if (prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`))) return pathname.slice(prefix.length) || '/';
  return pathname;
}

/**
 * `main.tsx`'s choice: hydrate only markup rendered for this very path. A
 * `?method=` share arrival redirects to Predict at once, so it renders
 * client-side (`createRoot`) instead.
 */
export function shouldHydrate({ hasChildren, preload, pathname, search, base }: HydrateInput): boolean {
  return (
    hasChildren &&
    preload !== null &&
    samePath(preload.path, routerPath(pathname, base)) &&
    !new URLSearchParams(search).has('method')
  );
}

/**
 * JSON safe to embed inside a `<script>` element: `<`, `>`, `&` and the two
 * JavaScript line separators are written as `\u` escapes, so no value can close
 * the element or open a comment, and `JSON.parse` reads it back unchanged.
 */
export function serialisePreload(preload: SeriesPreload): string {
  return JSON.stringify(preload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function isPreload(value: unknown): value is SeriesPreload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.path === 'string' &&
    (v.variant === 'preview' || v.variant === 'record' || v.variant === 'result') &&
    typeof v.reveal === 'boolean' &&
    !!v.series &&
    typeof v.series === 'object'
  );
}

/** Parses a preload element's text; anything malformed is `null` (the page then fetches as before). */
export function parsePreload(text: string | null | undefined): SeriesPreload | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isPreload(value) ? value : null;
  } catch {
    return null;
  }
}
