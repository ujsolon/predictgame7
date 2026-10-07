/**
 * The one projection the series pages (Story 4.3) render from. Pure, platform
 * free, and built from a `Series` loaded through `SERIES_SELECT`, so Story 4.8
 * can prerender the same pages from preloaded rows.
 *
 * Rules it encodes:
 * - phase comes from `deriveSeriesPhase` (AD-4) — never `status`, dates or
 *   `league`;
 * - a game's scores are mapped to teams by team id, never by home/away
 *   position, and no venue is carried at all: an archived row's home side is
 *   a real venue only for Game 7 of an NBA/BAA series (migration `00016`);
 * - a row that cannot be shown truthfully (no phase, missing team embeds, a
 *   score row naming neither team, a winner that is neither team) yields
 *   `null`, which the routes render as the 404.
 */
import { deriveSeriesPhase, type SeriesPhase } from '@/lib/series-phase';
import { shouldSwapForNeutralOrder } from '@/lib/spoiler-neutral';
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

/**
 * The same view with the two teams in spoiler-neutral order (owner decision
 * 2026-10-07, `src/lib/spoiler-neutral.ts`): stored order puts the eventual
 * winner first in 177/178 archived rows, so a winner-free surface must not
 * use it. Scores and per-game winners swap with the teams; `winner`/`loser`
 * are untouched (the preview never renders them).
 */
export function spoilerNeutralView(view: SeriesView): SeriesView {
  if (!shouldSwapForNeutralOrder(view.teamA, view.teamB)) return view;
  return {
    ...view,
    teamA: view.teamB,
    teamB: view.teamA,
    games: view.games.map((g) => ({
      number: g.number,
      scoreA: g.scoreB,
      scoreB: g.scoreA,
      winner: g.winner === 'a' ? 'b' : g.winner === 'b' ? 'a' : null,
    })),
  };
}

/** "{Year} {Round}", with the stored league before the round when it is not NBA (as 2.10's chip). */
function yearRound(view: SeriesView): string {
  return `${view.year} ${view.league !== 'NBA' ? `${view.league} ` : ''}${view.round}`;
}

/** `GAME 7 · {YEAR} {LEAGUE }{ROUND}`, uppercase in the text itself so it survives without CSS. */
export function seriesEyebrow(view: SeriesView): string {
  return `GAME 7 · ${yearRound(view)}`.toUpperCase();
}

/** Winner-free (preview). */
export function previewTitle(view: SeriesView): string {
  return `${view.teamA.full_name} vs ${view.teamB.full_name} — Game 7, ${yearRound(view)} · PredictGame7`;
}

export function previewHeadline(view: SeriesView): string {
  return `${teamWord(view.teamA)} and ${teamWord(view.teamB)} stand three games apiece`;
}

export function previewDescription(view: SeriesView): string {
  return `${view.teamA.full_name} and ${view.teamB.full_name}, ${yearRound(view)}: three games apiece. Game 7 stands.`;
}

/** Outcome-bearing (result and full record). Archive views only. */
export function outcomeTitle(view: SeriesView, winner: Team): string {
  return `${view.teamA.full_name} vs ${view.teamB.full_name}, ${yearRound(view)}: ${teamWord(winner)} win Game 7 · PredictGame7`;
}

export function outcomeHeadline(winner: Team): string {
  return `${teamWord(winner)} win Game 7`;
}

export function outcomeDescription(view: SeriesView, winner: Team, loser: Team): string {
  return `${winner.full_name} over ${loser.full_name}, 4–3, in the ${yearRound(view)}. Every game of the series.`;
}

export function resultHref(id: string): string {
  return `/series/${id}/result`;
}

export function predictHref(id: string, method?: string): string {
  const params = new URLSearchParams({ series: id });
  if (method) params.set('method', method);
  return `/predict?${params.toString()}`;
}
