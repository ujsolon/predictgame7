/**
 * Readable series URLs (Story 6.1, owner decision 1a, 2026-10-10): every
 * series page's canonical path is `/series/<year>/<slug>` (plus `/result` for
 * an archived flagship), where the slug is `{home}-{away}` - the two teams in
 * stored order, `team_a` (home-court, Story 6.8 / `00020`) first. No round and
 * no alias are encoded, and the slug never re-sorts the pair, so it names the
 * teams exactly as every other surface does (`src/lib/matchup.ts`).
 *
 * Derived, never stored (no column, no migration): each team contributes its
 * `nickname`, falling back to `full_name`, as lowercase ASCII with every run
 * of non-alphanumerics folded to one `-` (`76ers`, `trail-blazers`,
 * `supersonics`). The archive's historical team rows are separate era
 * identities, so a franchise rename never moves a historic page.
 *
 * The one helper the router, the prerender, Share and the deep-link probe
 * share. Dependency-free on purpose: `scripts/probe-deep-links.mjs` imports it
 * by relative path under plain Node (type-stripped).
 */

export interface SlugTeam {
  full_name: string;
  nickname?: string | null;
}

export interface SlugSeries {
  year: number;
  team_a?: SlugTeam | null;
  team_b?: SlugTeam | null;
}

export type SeriesPathVariant = 'page' | 'result';

/** Any label -> lowercase ASCII words joined by single hyphens (diacritics folded, no edge hyphens). */
export function slugify(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** One team's slug word: its nickname, else its full name. */
export function teamSlug(team: SlugTeam): string {
  return slugify(team.nickname?.trim() || team.full_name);
}

/** `{home}-{away}` in stored order; `null` when either team embed is missing or slugs to nothing. */
export function seriesSlug(series: SlugSeries): string | null {
  if (!series.team_a || !series.team_b) return null;
  const a = teamSlug(series.team_a);
  const b = teamSlug(series.team_b);
  return a && b ? `${a}-${b}` : null;
}

/**
 * The router path (no base, no trailing slash): `/series/<year>/<slug>` or
 * `/series/<year>/<slug>/result`. `null` when the row has no slug.
 */
export function seriesPath(series: SlugSeries, variant: SeriesPathVariant = 'page'): string | null {
  const slug = seriesSlug(series);
  if (!slug) return null;
  return `/series/${series.year}/${slug}${variant === 'result' ? '/result' : ''}`;
}

/** A 4-digit year segment, as the `/series/<year>` routes accept it. */
export function parseSeriesYear(value: string | null | undefined): number | null {
  return typeof value === 'string' && /^\d{4}$/.test(value) ? Number(value) : null;
}
