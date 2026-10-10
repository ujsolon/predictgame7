/**
 * One team order on every surface: home team first (Story 6.8, owner decision
 * 2026-10-09, option C).
 *
 * Since migration `00020` (with `00021`), `series.team_a_id` is the home-court
 * team — the real Game 7 host — for every archived series, and the pipeline
 * keeps `team_a` = the Game 1 host for a pending one. So **stored order is
 * home-first**, and every "{A} vs {B}" a page, card, title or share string
 * prints is built here from `team_a` then `team_b`, never re-sorted. The
 * alphabetical winner-free ordering of E14 is retired; the rest of the
 * preview's spoiler discipline (no Game 7 score, winner or result) is untouched
 * and lives elsewhere (`stripOutcome`, `SeriesPreview`).
 *
 * Dependency-free on purpose: `scripts/og/render.ts` imports it by relative
 * path under plain Node.
 */

/** "{A} vs {B}" — the two labels in the order given, which callers pass as `team_a`, `team_b`. */
export function matchupLabel(teamA: string, teamB: string): string {
  return `${teamA} vs ${teamB}`;
}

/** A row's two teams in display order: stored `team_a` first, then `team_b`. */
export function homeFirstPair<T>(row: { team_a: T; team_b: T }): [T, T] {
  return [row.team_a, row.team_b];
}
