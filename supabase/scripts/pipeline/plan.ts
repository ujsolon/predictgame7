/**
 * Story 2.3 — the plan: a pure function of (source rows, current table rows)
 * that decides births, completions, and skips before a single write is
 * issued. Every rule lives here so the whole I/O matrix is testable without
 * a database.
 *
 * Two assertions run before anything is written (AD-4: "the runner asserts
 * before commit and exits non-zero"; AD-5's identity guard):
 *
 * 1. The either-slot-order identity assertion — the `(year, team_a_id,
 *    team_b_id)` pair must be absent in BOTH slot orders. The UNIQUE
 *    `series_year_team_pair_key` guards the pair as stored and cannot
 *    enforce the `team_a` = game-1-home convention (measured 178/178, with
 *    `team_a_id > team_b_id` in 80), so a slot-swapped re-insert of a
 *    matchup already on the table is caught here, not by the database.
 * 2. The AD-4 derivation invariant — a winner implies exactly {1..7} decided
 *    score rows, a null winner implies exactly {1..6} with a 3–3 split.
 *    The game-number-set reconciliation half is `deriveSeriesPhase`
 *    (src/lib/series-phase.ts, Story 2.2) reused rather than restated.
 *
 * A violation throws `PlanAssertionError` naming the offending row; the
 * entry point turns that into a non-zero exit with nothing written.
 */
import { deriveSeriesPhase } from '../../../src/lib/series-phase.ts';
import type { SeriesPhaseInput } from '../../../src/lib/series-phase.ts';
import type { GameScoreRow, SeriesStatusRow } from './port.ts';

/**
 * Feed the shipped derivation a subset row. `SeriesPhaseInput` is typed with
 * the full `SeriesGameScore`, but `deriveSeriesPhase` reads exactly one
 * field per row — `game_number` — and nothing else, so the plan reuses the
 * shared reconciliation (spec · Boundaries "Always") instead of restating it
 * or inventing stored ids it does not have.
 */
function phaseInputFrom(winnerTeamId: number | null, gameNumbers: number[]): SeriesPhaseInput {
  return {
    winner_team_id: winnerTeamId,
    series_game_scores: gameNumbers.map((game_number) => ({ game_number })),
  } as SeriesPhaseInput;
}

export class PlanAssertionError extends Error {}

/** One source series: its status row plus every game row the adapter keys to it. */
export interface SourceSeries {
  status: SeriesStatusRow;
  games: GameScoreRow[];
  /** Human-readable row name for assertion messages (adapters may supply their own). */
  label?: string;
}

/** A score row as it sits on the table today (the runner's read of `series` + embedded scores). */
export interface CurrentScoreRow {
  game_number: number;
  home_team_id: number;
  away_team_id: number;
  home_score: number;
  away_score: number;
}

export interface CurrentSeriesRow {
  id: string;
  year: number;
  team_a_id: number;
  team_b_id: number;
  winner_team_id: number | null;
  scores: CurrentScoreRow[];
}

/** A score row the runner will write. The per-game winner is derived from the scores. */
export interface PlannedScore {
  game_number: number;
  home_team_id: number;
  away_team_id: number;
  home_score: number;
  away_score: number;
  winner_team_id: number;
}

/** The game-7 half of a birth issued for a source that already holds the finished series. */
export interface PlannedFollowup {
  game: PlannedScore;
  winner_team_id: number;
}

export interface PlannedBirth {
  kind: 'birth';
  label: string;
  year: number;
  round: string;
  team_a_id: number;
  team_b_id: number;
  /** Exactly games 1..6 — AD-4: a row is born only at a certified 3–3, never with game 7. */
  scores: PlannedScore[];
  /** Set when no 3–3 window was observed and the source already holds game 7 + winner. */
  followup: PlannedFollowup | null;
}

export interface PlannedCompletion {
  kind: 'completion';
  label: string;
  series_id: string;
  year: number;
  team_a_id: number;
  team_b_id: number;
  game: PlannedScore;
  winner_team_id: number;
}

export interface PlannedSkip {
  kind: 'skip';
  label: string;
  year: number;
  team_a_id: number;
  team_b_id: number;
  reason: string;
}

export interface Plan {
  births: PlannedBirth[];
  completions: PlannedCompletion[];
  skips: PlannedSkip[];
}

function labelOf(source: SourceSeries): string {
  return source.label ?? `(${source.status.year}, team ${source.status.team_a_id} vs ${source.status.team_b_id})`;
}

/** The five fields that decide whether two score rows (source or stored) are the same game. */
export interface ComparableScore {
  game_number: number;
  home_team_id: number;
  away_team_id: number;
  home_score: number;
  away_score: number;
}

function scoreKey(score: ComparableScore): string {
  return `${score.game_number}|${score.home_team_id}|${score.away_team_id}|${score.home_score}|${score.away_score}`;
}

function sameScores(left: readonly ComparableScore[], right: readonly ComparableScore[]): boolean {
  return left.length === right.length && left.every((row) => right.some((other) => scoreKey(row) === scoreKey(other)));
}

/** Validate one source series against the AD-4 invariant; throw naming the row on any violation. */
function validatedShape(source: SourceSeries): { scores: PlannedScore[]; winner: number | null } {
  const label = labelOf(source);
  const { status, games } = source;
  if (status.team_a_id === status.team_b_id) {
    throw new PlanAssertionError(`${label}: team slots hold the same team (${status.team_a_id}) — impossible shape`);
  }

  const seenGameNumbers = new Set<number>();
  const scores: PlannedScore[] = [];
  for (const game of games) {
    if (seenGameNumbers.has(game.game_number)) {
      throw new PlanAssertionError(`${label}: duplicate game_number ${game.game_number} in the source`);
    }
    seenGameNumbers.add(game.game_number);
    if (game.home_team_id === game.away_team_id) {
      throw new PlanAssertionError(`${label} game ${game.game_number}: a team cannot play itself`);
    }
    const slots = new Set([status.team_a_id, status.team_b_id]);
    if (!slots.has(game.home_team_id) || !slots.has(game.away_team_id)) {
      throw new PlanAssertionError(
        `${label} game ${game.game_number}: teams ${game.home_team_id}/${game.away_team_id} are not the series pair ${status.team_a_id}/${status.team_b_id}`,
      );
    }
    if (game.home_score < 0 || game.away_score < 0 || !Number.isInteger(game.home_score) || !Number.isInteger(game.away_score)) {
      throw new PlanAssertionError(
        `${label} game ${game.game_number}: scores ${game.home_score}-${game.away_score} are not non-negative integers`,
      );
    }
    if (game.home_score === game.away_score) {
      throw new PlanAssertionError(`${label} game ${game.game_number}: tie score — every source game must be final and decided`);
    }
    const winnerTeamId = game.home_score > game.away_score ? game.home_team_id : game.away_team_id;
    scores.push({
      game_number: game.game_number,
      home_team_id: game.home_team_id,
      away_team_id: game.away_team_id,
      home_score: game.home_score,
      away_score: game.away_score,
      winner_team_id: winnerTeamId,
    });
  }
  scores.sort((left, right) => left.game_number - right.game_number);

  // The slot convention AD-5 fixes and every adapter must supply: `team_a` is
  // game 1's home team. The database cannot enforce it (the UNIQUE guards the
  // pair as stored), and `manual_csv` satisfies it by construction, so this
  // assertion is what keeps a future adapter from birthing a mirror-shaped row.
  const gameOne = scores.find((score) => score.game_number === 1);
  if (gameOne && gameOne.home_team_id !== status.team_a_id) {
    throw new PlanAssertionError(
      `${label}: team_a_id ${status.team_a_id} is not game 1's home team (${gameOne.home_team_id}) — ` +
        'AD-5 fixes the first slot as game 1 home team and every adapter must supply it',
    );
  }

  // The reconciliation half of the invariant is the shipped derivation —
  // reuse it rather than restating it (spec · Boundaries "Always").
  const derived = deriveSeriesPhase(phaseInputFrom(status.winner_team_id, scores.map((score) => score.game_number)));

  if (status.winner_team_id != null) {
    if (derived !== 'archive') {
      const numbers = scores.map((score) => score.game_number).join(',');
      throw new PlanAssertionError(
        `${label}: impossible shape — winner ${status.winner_team_id} with game set {${numbers}}; ` +
          'a winner implies exactly the seven decided score rows {1..7}',
      );
    }
    const gameSeven = scores.find((score) => score.game_number === 7);
    if (!gameSeven || gameSeven.winner_team_id !== status.winner_team_id) {
      throw new PlanAssertionError(
        `${label}: winner_team_id ${status.winner_team_id} does not match game 7's winner ${gameSeven ? gameSeven.winner_team_id : '(no game 7)'}`,
      );
    }
    // A finished series still has to have been 3-3 after six — that is the
    // precondition `pipeline_birth_series` asserts, and the runner's promise
    // is that nothing reaches a write the database would reject.
    const teamAWinsBeforeSeven = scores.filter(
      (score) => score.game_number <= 6 && score.winner_team_id === status.team_a_id,
    ).length;
    if (teamAWinsBeforeSeven !== 3) {
      throw new PlanAssertionError(
        `${label}: impossible shape — the series went ${teamAWinsBeforeSeven}-${6 - teamAWinsBeforeSeven} through six ` +
          'games before game 7 decided it; a birth requires games 1-6 split 3-3',
      );
    }
    return { scores, winner: status.winner_team_id };
  }

  if (derived !== 'pending') {
    const numbers = scores.map((score) => score.game_number).join(',');
    throw new PlanAssertionError(
      `${label}: impossible shape — null winner with game set {${numbers}}; ` +
        'a null winner implies exactly the six decided score rows {1..6}',
    );
  }
  const teamAWins = scores.filter((score) => score.winner_team_id === status.team_a_id).length;
  if (teamAWins !== 3) {
    throw new PlanAssertionError(
      `${label}: not a certified 3–3 — games 1–6 split ${teamAWins}-${scores.length - teamAWins}; birth requires six final games with three wins each`,
    );
  }
  return { scores, winner: null };
}

function currentPhase(current: CurrentSeriesRow) {
  return deriveSeriesPhase(phaseInputFrom(current.winner_team_id, current.scores.map((score) => score.game_number)));
}

function gamesThroughSix(scores: PlannedScore[]): PlannedScore[] {
  return scores.filter((score) => score.game_number <= 6);
}

/** Join status rows and score rows on the exact ordered identity pair into source series. */
export function groupSourceRows(statuses: SeriesStatusRow[], scores: GameScoreRow[]): SourceSeries[] {
  const byKey = new Map<string, SourceSeries>();
  const orderedKeys = new Set<string>();
  for (const status of statuses) {
    const key = `${status.year}|${status.team_a_id}|${status.team_b_id}`;
    if (orderedKeys.has(key)) {
      throw new PlanAssertionError(
        `duplicate source status for (${status.year}, team ${status.team_a_id} vs ${status.team_b_id}) — the source describes one series per pair`,
      );
    }
    orderedKeys.add(key);
    byKey.set(key, { status, games: [] });
  }
  for (const score of scores) {
    const key = `${score.year}|${score.team_a_id}|${score.team_b_id}`;
    const series = byKey.get(key);
    if (!series) {
      throw new PlanAssertionError(
        `source score row (game ${score.game_number}) for (${score.year}, team ${score.team_a_id} vs ${score.team_b_id}) has no matching series status row`,
      );
    }
    series.games.push(score);
  }
  return [...byKey.values()];
}

/**
 * Turn (source rows, current table rows) into the write plan. Throws
 * `PlanAssertionError` — naming the offending row — rather than planning a
 * shape the read path would have to exclude.
 */
export function planPipeline(sources: SourceSeries[], current: CurrentSeriesRow[]): Plan {
  const plan: Plan = { births: [], completions: [], skips: [] };

  // Guard the source against itself first: the same (year, pair) can appear
  // once, in either slot order.
  const seenKeys = new Map<string, string>();
  for (const source of sources) {
    const label = labelOf(source);
    const { year, team_a_id: a, team_b_id: b } = source.status;
    const exactKey = `${year}|${a}|${b}`;
    const swappedKey = `${year}|${b}|${a}`;
    const clash = seenKeys.get(exactKey) ?? seenKeys.get(swappedKey);
    if (clash) {
      throw new PlanAssertionError(`${label}: the source describes this (year, team pair) twice — already seen ${clash}`);
    }
    seenKeys.set(exactKey, label);
  }

  for (const source of sources) {
    const label = labelOf(source);
    const { year, team_a_id: a, team_b_id: b } = source.status;

    // Identity assertion (AD-5): the pair must be absent in either slot
    // order before any insert. The swapped row is a bug in the source or a
    // corrupted table — never write the mirror image.
    const exact = current.find((row) => row.year === year && row.team_a_id === a && row.team_b_id === b);
    const swapped = current.find((row) => row.year === year && row.team_a_id === b && row.team_b_id === a);
    if (exact && swapped) {
      throw new PlanAssertionError(
        `${label}: the table holds mirror rows ${exact.id} and ${swapped.id} for (${year}, ${a}/${b}) in both slot ` +
          'orders — refusing to pick one and write against half the truth',
      );
    }
    if (!exact && swapped) {
      throw new PlanAssertionError(
        `${label}: identity assertion failed — series ${swapped.id} already holds (${swapped.year}, ${swapped.team_b_id}, ${swapped.team_a_id}) ` +
          `with the slots swapped; refusing to write the pair in the other order`,
      );
    }

    const { scores, winner } = validatedShape(source);
    const throughSix = gamesThroughSix(scores);
    const gameSeven = scores.find((score) => score.game_number === 7) ?? null;

    if (!exact) {
      // AD-4: birth is always the six rows at a certified 3–3. When the
      // source already holds a finished series nobody saw at 3–3, the
      // runner births the pending row and then completes it — one planned
      // pair of atomic operations, never a seven-row birth.
      const birth: PlannedBirth = {
        kind: 'birth',
        label,
        year,
        round: source.status.round,
        team_a_id: a,
        team_b_id: b,
        scores: throughSix,
        followup:
          winner != null && gameSeven
            ? { game: gameSeven, winner_team_id: winner }
            : null,
      };
      plan.births.push(birth);
      continue;
    }

    const phase = currentPhase(exact);

    if (phase === 'pending') {
      if (winner === null && sameScores(exact.scores, throughSix)) {
        plan.skips.push({ kind: 'skip', label, year, team_a_id: a, team_b_id: b, reason: 'already pending with identical games 1–6' });
        continue;
      }
      if (winner != null && gameSeven && sameScores(exact.scores, throughSix)) {
        plan.completions.push({
          kind: 'completion',
          label,
          series_id: exact.id,
          year,
          team_a_id: a,
          team_b_id: b,
          game: gameSeven,
          winner_team_id: winner,
        });
        continue;
      }
      throw new PlanAssertionError(
        `${label}: series ${exact.id} is pending on the table but the source's games 1–6 differ — the runner never rewrites stored games`,
      );
    }

    if (phase === 'archive') {
      if (winner !== null && exact.winner_team_id === winner && sameScores(exact.scores, scores)) {
        plan.skips.push({ kind: 'skip', label, year, team_a_id: a, team_b_id: b, reason: 'already archived with identical games 1–7' });
        continue;
      }
      throw new PlanAssertionError(
        `${label}: series ${exact.id} is archived on the table and the source disagrees — the runner never rewrites an archived outcome`,
      );
    }

    // The exact row reconciles to neither shape (AD-4's defensive case). A
    // winner-less row is repairable by the completion RPC when the source is
    // a complete archive shape that agrees with whatever is already stored;
    // anything else exits rather than guessing.
    if (exact.winner_team_id == null && winner !== null && gameSeven) {
      const stored = exact.scores.every((storedRow) =>
        scores.some((sourceRow) => scoreKey(storedRow) === scoreKey(sourceRow)),
      );
      if (stored) {
        plan.completions.push({
          kind: 'completion',
          label,
          series_id: exact.id,
          year,
          team_a_id: a,
          team_b_id: b,
          game: gameSeven,
          winner_team_id: winner,
        });
        continue;
      }
    }
    throw new PlanAssertionError(
      `${label}: series ${exact.id} does not reconcile to either derivation shape and cannot be repaired from this source`,
    );
  }

  return plan;
}
