/**
 * The one projection the series pages (Story 4.3) render from. Pure, platform
 * free, and built from a `Series` loaded through `SERIES_SELECT`, so Story 4.8
 * can prerender the same pages from preloaded rows.
 *
 * Rules it encodes:
 * - phase comes from `deriveSeriesPhase` (AD-4) — never `status`, dates or
 *   `league`;
 * - a game's scores are mapped to teams by team id, never by home/away
 *   position, and no venue is carried at all: since `00020` an archived row's
 *   games 1–6 home side is a convention (`team_a`) for the 177
 *   spreadsheet-sourced series, real only for Game 7 and for pipeline-born or
 *   `00021` rows (`docs/CURRENT_DATA_MODEL.md`);
 * - the two teams are shown in stored order, `team_a` first, which is
 *   home-first (Story 6.8, `src/lib/matchup.ts`) — on every surface, preview
 *   included;
 * - a row that cannot be shown truthfully (no phase, missing team embeds, a
 *   score row naming neither team, a winner that is neither team) yields
 *   `null`, which the routes render as the 404.
 */
import { matchupLabel } from '@/lib/matchup';
import { deriveSeriesPhase, type SeriesPhase } from '@/lib/series-phase';
import { type SeriesPathVariant, seriesPath } from '@/lib/series-slug';
import type { Series, Team } from '@/types/types';

export interface GameView {
  number: number;
  scoreA: number;
  scoreB: number;
  /** Which slot won the game; `null` only for a tied (malformed) row. */
  winner: 'a' | 'b' | null;
}

export interface SeriesView {
  id: string;
  year: number;
  round: string;
  league: string;
  phase: SeriesPhase;
  teamA: Team;
  teamB: Team;
  /** Every score row, sorted by game number (1–6 pending, 1–7 archive). */
  games: GameView[];
  /** Archive only. */
  winner: Team | null;
  loser: Team | null;
}

/** The short team word used in headlines and score lines. */
export function teamWord(team: Team): string {
  return team.nickname?.trim() || team.full_name;
}

function scoreFor(game: NonNullable<Series['series_game_scores']>[number], teamId: number): number | null {
  if (game.home_team_id === teamId) return game.home_score;
  if (game.away_team_id === teamId) return game.away_score;
  return null;
}

export function toSeriesView(series: Series): SeriesView | null {
  const phase = deriveSeriesPhase(series);
  if (!phase) return null;
  const teamA = series.team_a;
  const teamB = series.team_b;
  if (!teamA || !teamB || teamA.id !== series.team_a_id || teamB.id !== series.team_b_id) return null;

  const games: GameView[] = [];
  for (const row of [...(series.series_game_scores ?? [])].sort((x, y) => x.game_number - y.game_number)) {
    const scoreA = scoreFor(row, teamA.id);
    const scoreB = scoreFor(row, teamB.id);
    if (scoreA == null || scoreB == null) return null;
    games.push({
      number: row.game_number,
      scoreA,
      scoreB,
      winner: scoreA > scoreB ? 'a' : scoreB > scoreA ? 'b' : null,
    });
  }

  let winner: Team | null = null;
  let loser: Team | null = null;
  if (phase === 'archive') {
    if (series.winner_team_id === teamA.id) [winner, loser] = [teamA, teamB];
    else if (series.winner_team_id === teamB.id) [winner, loser] = [teamB, teamA];
    else return null;
  }

  return {
    id: series.id,
    year: series.year,
    round: series.round,
    league: series.league,
    phase,
    teamA,
    teamB,
    games,
    winner,
    loser,
  };
}

/** "{Year} {Round}", with the stored league before the round when it is not NBA (as 2.10's chip). */
export function yearRound(view: SeriesView): string {
  return `${view.year} ${view.league !== 'NBA' ? `${view.league} ` : ''}${view.round}`;
}

/** `GAME 7 · {YEAR} {LEAGUE }{ROUND}`, uppercase in the text itself so it survives without CSS. */
export function seriesEyebrow(view: SeriesView): string {
  return `GAME 7 · ${yearRound(view)}`.toUpperCase();
}

/** Winner-free (preview). */
export function previewTitle(view: SeriesView): string {
  return `${matchupLabel(view.teamA.full_name, view.teamB.full_name)} — Game 7, ${yearRound(view)} · PredictGame7`;
}

export function previewHeadline(view: SeriesView): string {
  return `${teamWord(view.teamA)} and ${teamWord(view.teamB)} stand three games apiece`;
}

export function previewDescription(view: SeriesView): string {
  return `${view.teamA.full_name} and ${view.teamB.full_name}, ${yearRound(view)}: three games apiece. Game 7 stands.`;
}

/** Outcome-bearing (result and full record). Archive views only. */
export function outcomeTitle(view: SeriesView, winner: Team): string {
  return `${matchupLabel(view.teamA.full_name, view.teamB.full_name)}, ${yearRound(view)}: ${teamWord(winner)} win Game 7 · PredictGame7`;
}

export function outcomeHeadline(winner: Team): string {
  return `${teamWord(winner)} win Game 7`;
}

export function outcomeDescription(view: SeriesView, winner: Team, loser: Team): string {
  return `${winner.full_name} over ${loser.full_name}, 4–3, in the ${yearRound(view)}. Every game of the series.`;
}

/**
 * A series page's canonical router path (Story 6.1): `/series/<year>/<slug>`
 * (or `…/result`) through `seriesPath`, the one slug helper. The uuid form is
 * only the fallback for a pair that slugs to nothing (a name with no ASCII
 * letter or digit — none exists today); the uuid routes forward to the slug.
 */
export function seriesHref(view: SeriesView, variant: SeriesPathVariant = 'page'): string {
  return (
    seriesPath({ year: view.year, team_a: view.teamA, team_b: view.teamB }, variant) ??
    `/series/${view.id}${variant === 'result' ? '/result' : ''}`
  );
}

export function resultHref(view: SeriesView): string {
  return seriesHref(view, 'result');
}

export function predictHref(id: string, method?: string): string {
  const params = new URLSearchParams({ series: id });
  if (method) params.set('method', method);
  return `/predict?${params.toString()}`;
}
