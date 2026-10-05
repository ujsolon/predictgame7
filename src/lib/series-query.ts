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
 */
export const SERIES_SELECT = `
  id,
  year,
  round,
  league,
  team_a_id,
  team_b_id,
  winner_team_id,
  created_at,
  updated_at,
  team_a:team_a_id(id, full_name, abbreviation, city, nickname, logo_url, created_at, updated_at),
  team_b:team_b_id(id, full_name, abbreviation, city, nickname, logo_url, created_at, updated_at),
  winner_team:winner_team_id(id, full_name, abbreviation, city, nickname, logo_url, created_at, updated_at),
  series_game_scores(*)
`;
