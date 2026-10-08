/**
 * The one `series` projection the client reads a series through — the picker
 * (`PredictPage`) and, since Story 2.7 (owner decision D2), Home's
 * pending-Game-7 data reach. Moved here verbatim from `PredictPage.tsx` so the
 * two readers cannot drift: both need the team embeds and every
 * `series_game_scores` row, because phase is derived from the score rows plus
 * the winner (`series-phase.ts`, AD-4) and never from a stored flag.
 *
 * `/historical` keeps its own `select('*', …)` projection — its contract
 * (`*` or an explicit `league`) is pinned separately by
 * `historical-page-archive.test.tsx`.
 *
 * Story 4.5 (migration `00019`): `is_featured` joins the projection, and the
 * series pages (`useSeriesRecord`, the prerender read) use
 * `SERIES_PAGE_SELECT`, which also embeds `series_content`. Predict, Home and
 * the OG cards stay on `SERIES_SELECT` and never read editorial content.
 */
const SERIES_COLUMNS = `
  id,
  year,
  round,
  league,
  team_a_id,
  team_b_id,
  winner_team_id,
  is_featured,
  created_at,
  updated_at,
  team_a:team_a_id(id, full_name, abbreviation, city, nickname, logo_url, created_at, updated_at),
  team_b:team_b_id(id, full_name, abbreviation, city, nickname, logo_url, created_at, updated_at),
  winner_team:winner_team_id(id, full_name, abbreviation, city, nickname, logo_url, created_at, updated_at),
  series_game_scores(*)`;

export const SERIES_SELECT = `${SERIES_COLUMNS}
`;

/** `SERIES_SELECT` plus the editorial parts (Story 4.5) — the series pages' read. */
export const SERIES_PAGE_SELECT = `${SERIES_COLUMNS},
  series_content(series_id, part, headline, body_md, videos, updated_at)
`;
