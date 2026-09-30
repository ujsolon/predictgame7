// Story 2.3 — the plan matrix, run purely against in-memory rows. No network,
// no database: the whole I/O matrix is a function of (source rows, current
// table rows).
import { describe, expect, it } from 'vitest';
import {
  PlanAssertionError,
  groupSourceRows,
  planPipeline,
  type CurrentSeriesRow,
  type SourceSeries,
} from '../../supabase/scripts/pipeline/plan.ts';
import type { Plan } from '../../supabase/scripts/pipeline/plan.ts';
import type { GameScoreRow, SeriesStatusRow } from '../../supabase/scripts/pipeline/port.ts';

const TEAM_A = 10; // GSW-shaped first slot (game 1 home)
const TEAM_B = 6; //  team_b slot
const YEAR = 2027;

function statusRow(overrides: Partial<SeriesStatusRow> = {}): SeriesStatusRow {
  return { year: YEAR, round: 'Western Conference First Round', team_a_id: TEAM_A, team_b_id: TEAM_B, winner_team_id: null, ...overrides };
}

function scoreRow(gameNumber: number, homeId: number, awayId: number, homeScore: number, awayScore: number): GameScoreRow {
  return {
    year: YEAR,
    team_a_id: TEAM_A,
    team_b_id: TEAM_B,
    game_number: gameNumber,
    home_team_id: homeId,
    away_team_id: awayId,
    home_score: homeScore,
    away_score: awayScore,
  };
}

/** Games 1–6 of a certified 3–3: TEAM_A wins 1/4/5, TEAM_B wins 2/3/6 (A hosts 1/2/5, B hosts 3/4/6). */
function sixGames(): GameScoreRow[] {
  return [
    scoreRow(1, TEAM_A, TEAM_B, 110, 102),
    scoreRow(2, TEAM_A, TEAM_B, 104, 115),
    scoreRow(3, TEAM_B, TEAM_A, 108, 99),
    scoreRow(4, TEAM_B, TEAM_A, 101, 112),
    scoreRow(5, TEAM_A, TEAM_B, 120, 110),
    scoreRow(6, TEAM_B, TEAM_A, 98, 95),
  ];
}

const GAME_SEVEN = scoreRow(7, TEAM_A, TEAM_B, 89, 96); // TEAM_B wins the series

function pendingSource(): SourceSeries {
  return { status: statusRow(), games: sixGames() };
}

function archiveSource(over: { games?: GameScoreRow[]; winner?: number | null } = {}): SourceSeries {
  return {
    status: statusRow({ winner_team_id: over.winner === undefined ? TEAM_B : over.winner }),
    games: over.games ?? [...sixGames(), GAME_SEVEN],
  };
}

function currentPending(id = 'series-1', scores: GameScoreRow[] = sixGames()): CurrentSeriesRow {
  return {
    id,
    year: YEAR,
    team_a_id: TEAM_A,
    team_b_id: TEAM_B,
    winner_team_id: null,
    scores: scores.map((s) => ({
      game_number: s.game_number,
      home_team_id: s.home_team_id,
      away_team_id: s.away_team_id,
      home_score: s.home_score,
      away_score: s.away_score,
    })),
  };
}

function currentArchive(id = 'series-1'): CurrentSeriesRow {
  const row = currentPending(id, [...sixGames(), GAME_SEVEN]);
  row.winner_team_id = TEAM_B;
  return row;
}

function planFor(sources: SourceSeries[], current: CurrentSeriesRow[]): Plan {
  return planPipeline(sources, current);
}

describe('planPipeline — I/O matrix', () => {
  it('certified 3-3, new: births one series row plus exactly six score rows, no completion', () => {
    const plan = planFor([pendingSource()], []);
    expect(plan.births).toHaveLength(1);
    expect(plan.completions).toHaveLength(0);
    expect(plan.skips).toHaveLength(0);
    const birth = plan.births[0];
    expect(birth.followup).toBeNull();
    expect(birth.scores.map((s) => s.game_number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(birth.round).toBe('Western Conference First Round');
  });

  it('same input re-run: the plan is empty — one skip, zero births, zero completions', () => {
    const plan = planFor([pendingSource()], [currentPending()]);
    expect(plan.births).toHaveLength(0);
    expect(plan.completions).toHaveLength(0);
    expect(plan.skips).toHaveLength(1);
  });

  it('game 7 arrives on a pending row: one completion carrying game 7 and the winner', () => {
    const plan = planFor([archiveSource()], [currentPending('series-42')]);
    expect(plan.births).toHaveLength(0);
    expect(plan.completions).toHaveLength(1);
    const completion = plan.completions[0];
    expect(completion.series_id).toBe('series-42');
    expect(completion.game.game_number).toBe(7);
    expect(completion.winner_team_id).toBe(TEAM_B);
  });

  it('slot-swapped pair on the table: throws naming the row, before anything is planned', () => {
    const swapped: CurrentSeriesRow = { ...currentPending(), team_a_id: TEAM_B, team_b_id: TEAM_A };
    expect(() => planFor([pendingSource()], [swapped])).toThrowError(PlanAssertionError);
    try {
      planFor([pendingSource()], [swapped]);
      expect.unreachable('the identity assertion must throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/identity assertion failed/);
      expect(message).toMatch(/slots swapped/);
      expect(message).toContain(String(YEAR)); // names the row
    }
  });

  it('winner with only six games: the invariant assertion fires and names the row', () => {
    const source: SourceSeries = { status: statusRow({ winner_team_id: TEAM_A }), games: sixGames() };
    expect(() => planFor([source], [])).toThrowError(/impossible shape/);
  });

  it('game set {1,2,4,5,6,7} with a winner: rejected (the count is right, the set is not)', () => {
    const gapped = [...sixGames().filter((g) => g.game_number !== 3), GAME_SEVEN];
    const source: SourceSeries = { status: statusRow({ winner_team_id: TEAM_B }), games: gapped };
    expect(() => planFor([source], [])).toThrowError(/impossible shape/);
  });

  it('a tie score is an unfinal game: rejected naming the row', () => {
    const tied = sixGames().map((g) => (g.game_number === 4 ? scoreRow(4, TEAM_B, TEAM_A, 100, 100) : g));
    expect(() => planFor([{ status: statusRow(), games: tied }], [])).toThrowError(/tie/);
  });

  it('not 3-3 (4-2 over six games) is not a certified birth', () => {
    const skewed = sixGames().map((g) => (g.game_number === 6 ? scoreRow(6, TEAM_B, TEAM_A, 90, 110) : g));
    expect(() => planFor([{ status: statusRow(), games: skewed }], [])).toThrowError(/certified 3–3/);
  });

  it('a finished series that went 4-2 through six is rejected before any write', () => {
    // The same rule `pipeline_birth_series` asserts; the runner must not plan a
    // birth the database would reject, or the run fails mid-apply after other
    // operations have already landed.
    const skewed = sixGames().map((g) => (g.game_number === 6 ? scoreRow(6, TEAM_B, TEAM_A, 90, 110) : g));
    const source: SourceSeries = { status: statusRow({ winner_team_id: TEAM_B }), games: [...skewed, GAME_SEVEN] };
    expect(() => planFor([source], [])).toThrowError(/went 4-2 through six/);
  });

  it('team_a that is not game 1\'s home team breaks the AD-5 slot convention', () => {
    const flipped = sixGames().map((g) => (g.game_number === 1 ? scoreRow(1, TEAM_B, TEAM_A, 102, 110) : g));
    expect(() => planFor([{ status: statusRow(), games: flipped }], [])).toThrowError(
      /is not game 1's home team/,
    );
  });

  it('mirror rows on the table — the pair in both slot orders — are refused, not resolved', () => {
    const mirror: CurrentSeriesRow = { ...currentPending('series-mirror'), team_a_id: TEAM_B, team_b_id: TEAM_A };
    expect(() => planFor([pendingSource()], [currentPending('series-exact'), mirror])).toThrowError(/mirror rows/);
  });

  it('winner that does not match game 7 is rejected', () => {
    expect(() => planFor([archiveSource({ winner: TEAM_A })], [])).toThrowError(/does not match game 7/);
  });

  it('a finished series nobody saw at 3-3: births the six, then follows up with the completion', () => {
    const plan = planFor([archiveSource()], []);
    expect(plan.births).toHaveLength(1);
    expect(plan.completions).toHaveLength(0);
    const followup = plan.births[0].followup;
    expect(followup).not.toBeNull();
    expect(followup?.game.game_number).toBe(7);
    expect(followup?.winner_team_id).toBe(TEAM_B);
  });

  it('archived row + identical source: skip; diverging source: refuse to rewrite the archive', () => {
    expect(planFor([archiveSource()], [currentArchive()]).skips).toHaveLength(1);
    const different = [...sixGames().slice(0, 5), scoreRow(6, TEAM_B, TEAM_A, 120, 80), GAME_SEVEN];
    expect(() => planFor([archiveSource({ games: different })], [currentArchive()])).toThrowError(/never rewrites an archived outcome/);
  });

  it('pending row whose stored games differ from the source: refuse to rewrite stored games', () => {
    // A different 3-3 shape than the one on the table — the source may not
    // silently restyle games that are already stored.
    const altSix = [
      scoreRow(1, TEAM_A, TEAM_B, 115, 104),
      scoreRow(2, TEAM_A, TEAM_B, 118, 110),
      scoreRow(3, TEAM_B, TEAM_A, 108, 99),
      scoreRow(4, TEAM_B, TEAM_A, 112, 101),
      scoreRow(5, TEAM_A, TEAM_B, 120, 110),
      scoreRow(6, TEAM_B, TEAM_A, 98, 95),
    ]; // TEAM_A wins 1/2/5, TEAM_B 3/4/6 — certified 3–3, different scores
    expect(() => planFor([{ status: statusRow(), games: altSix }], [currentPending()])).toThrowError(
      /never rewrites stored games/,
    );
  });

  it('a half-written row (null winner, seven stored) is repaired by a completion when the source agrees', () => {
    const broken = currentPending('series-half-written', [...sixGames(), GAME_SEVEN]);
    const plan = planFor([archiveSource()], [broken]);
    expect(plan.completions).toHaveLength(1);
    expect(plan.completions[0].series_id).toBe('series-half-written');
  });

  it('a reconciled-shape row the source cannot re-explain is left alone and reported', () => {
    const weird: CurrentSeriesRow = { ...currentPending('series-weird'), winner_team_id: TEAM_B };
    expect(() => planFor([pendingSource()], [weird])).toThrowError(/does not reconcile/);
  });

  it('the same (year, pair) twice in the source — same order or swapped — fails the run', () => {
    expect(() => planFor([pendingSource(), pendingSource()], [])).toThrowError(/describes this \(year, team pair\) twice/);
    const swappedStatus: SeriesStatusRow = { ...statusRow(), team_a_id: TEAM_B, team_b_id: TEAM_A };
    const swappedGames = sixGames().map((g) => ({ ...g, team_a_id: TEAM_B, team_b_id: TEAM_A }));
    expect(() => planFor([pendingSource(), { status: swappedStatus, games: swappedGames }], [])).toThrowError(/twice/);
  });

  it('a score row whose home team is not in the series pair is rejected', () => {
    const alien = scoreRow(1, 999, TEAM_B, 110, 102);
    expect(() => planFor([{ status: statusRow(), games: [alien, ...sixGames().slice(1)] }], [])).toThrowError(/not the series pair/);
  });

  it('groupSourceRows joins on the exact ordered pair and reports orphans and duplicates', () => {
    const statuses = [statusRow()];
    const grouped = groupSourceRows(statuses, sixGames());
    expect(grouped).toHaveLength(1);
    expect(grouped[0].games).toHaveLength(6);
    const orphan: GameScoreRow = { ...scoreRow(1, TEAM_A, TEAM_B, 100, 90), team_b_id: 777 };
    expect(() => groupSourceRows(statuses, [...sixGames(), orphan])).toThrowError(/no matching series status/);
    expect(() => groupSourceRows([statusRow(), statusRow()], sixGames())).toThrowError(/duplicate source status/);
  });

  it('duplicate game numbers in one source series are rejected', () => {
    expect(() => planFor([{ status: statusRow(), games: [...sixGames(), sixGames()[0]] }], [])).toThrowError(/duplicate game_number/);
  });

  it('team slots holding the same team is an impossible shape', () => {
    expect(() => planFor([{ status: statusRow({ team_b_id: TEAM_A }), games: [] }], [])).toThrowError(/same team/);
  });
});
