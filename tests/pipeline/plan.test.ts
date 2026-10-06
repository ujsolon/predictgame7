// Story 2.3 — the plan matrix, run purely against in-memory rows. No network,
// no database: the whole I/O matrix is a function of (source rows, current
// table rows).
import { describe, expect, it } from 'vitest';
import type { Plan } from '../../supabase/scripts/pipeline/plan.ts';
import {
  type CurrentSeriesRow,
  groupSourceRows,
  PlanAssertionError,
  planPipeline,
  type SourceSeries,
} from '../../supabase/scripts/pipeline/plan.ts';
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
    // docs/PLAYOFF_RUNBOOK.md step 3's go/no-go quotes this reason verbatim.
    expect(plan.skips[0].reason).toBe('already pending with identical games 1–6');
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

  it('runbook scenario 3 (Story 2.17): an archived row against a games-1–6-only source refuses; the same source plus its Game 7 skips', () => {
    // docs/PLAYOFF_RUNBOOK.md scenario 3: once the feed completes a series, an
    // operator CSV still holding only its games 1–6 makes the next manual run
    // red for every series in the file; appending the matching Game 7 (or
    // removing the rows) is the fix. Measured in Story 2.15, pinned here.
    expect(() => planFor([pendingSource()], [currentArchive()])).toThrowError(/never rewrites an archived outcome/);
    expect(planFor([archiveSource()], [currentArchive()]).skips).toHaveLength(1);
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

// ---------------------------------------------------------------------------
// Story 2.13 — the ONE new source shape: a stored pending series plus a source
// carrying only that pair's game 7. What narrows is the plan-level equality
// between the source and the stored games 1-6 (this source has none to compare);
// what does NOT narrow is the 3-3 certification, which moves to the stored side
// and mirrors `pipeline_complete_series`' own guards (00015:286-308).
// ---------------------------------------------------------------------------

/** A source holding ONLY game 7: the shape a date-granular feed (`espn`) yields. */
function gameSevenOnlySource(over: { winner?: number | null; game?: GameScoreRow } = {}): SourceSeries {
  return {
    status: statusRow({ winner_team_id: over.winner === undefined ? TEAM_B : over.winner }),
    games: [over.game ?? GAME_SEVEN],
  };
}

describe('planPipeline — Story 2.13 game-7-only source', () => {
  it('pending row + game-7-only source: exactly one completion, nothing else planned', () => {
    const plan = planFor([gameSevenOnlySource()], [currentPending('series-42')]);
    expect(plan.births).toHaveLength(0);
    expect(plan.skips).toHaveLength(0);
    expect(plan.completions).toHaveLength(1);
    const completion = plan.completions[0];
    expect(completion.series_id).toBe('series-42');
    expect(completion.game.game_number).toBe(7);
    expect(completion.winner_team_id).toBe(TEAM_B);
    expect(completion.game).toMatchObject({ home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 89, away_score: 96 });
  });

  it('game 7 with no stored pair is refused — no birth from a partial source', () => {
    expect(() => planFor([gameSevenOnlySource()], [])).toThrowError(PlanAssertionError);
    try {
      planFor([gameSevenOnlySource()], []);
      expect.unreachable('a one-game source must never birth');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/no stored pending row/);
      expect(message).toMatch(/refusing to birth a series from a source that carries one game/);
      // The message says which cross-check does not apply, so a reader of the
      // red run cannot mistake this for the 3-3 guard being missing.
      expect(message).toMatch(/games 1–6 cross-check does not apply to this path/);
      expect(message).toContain(String(YEAR));
      expect(message).toContain(String(TEAM_A));
      expect(message).toContain(String(TEAM_B));
    }
  });

  it('the certification moved to the stored row: a 4-2 pending pair is not completed', () => {
    const skewed = [...sixGames().slice(0, 5), scoreRow(6, TEAM_B, TEAM_A, 90, 110)]; // TEAM_A takes 1/4/5/6
    expect(() => planFor([gameSevenOnlySource()], [currentPending('series-42', skewed)])).toThrowError(
      /stored games 1–6 split 4-2 rather than the 3–3/,
    );
    // The refusal names the series id and both team ids, and says why the
    // source-side comparison is not what failed here.
    expect(() => planFor([gameSevenOnlySource()], [currentPending('series-42', skewed)])).toThrowError(
      new RegExp(`series-42 \\(${YEAR}, team ${TEAM_A} vs ${TEAM_B}\\).*games 1–6 cross-check does not apply to this path`),
    );
  });

  it('an undecided stored game rejects the completion the way the RPC would', () => {
    const tied = sixGames().map((g) => (g.game_number === 3 ? scoreRow(3, TEAM_B, TEAM_A, 100, 100) : g));
    expect(() => planFor([gameSevenOnlySource()], [currentPending('series-42', tied)])).toThrowError(
      /stored games 1–6 include 1 tie\(s\)/,
    );
  });

  it('a stored row missing a game 1-6 number is refused, not repaired', () => {
    const missingThree = sixGames().filter((g) => g.game_number !== 3);
    // The row still has no winner, so it is not `pending` by the derivation: it
    // reconciles to neither shape and the game-7-only source cannot re-explain it.
    // One message, not an alternation: `stored games 1–6` also appears in the
    // CERTIFICATION refusals above, so matching either would let a row that
    // reached the certification branch pass a test about the derivation branch.
    expect(() => planFor([gameSevenOnlySource()], [currentPending('series-42', missingThree)])).toThrowError(
      /does not reconcile to either derivation shape and cannot be repaired from this source/,
    );
  });

  it('winner that does not match the single game 7 is rejected before any plan', () => {
    expect(() => planFor([gameSevenOnlySource({ winner: TEAM_A })], [currentPending()])).toThrowError(
      /does not match game 7's winner/,
    );
  });

  it('a null winner with only game 7 is NOT the new shape — the {1..6} invariant still refuses it', () => {
    const source: SourceSeries = { status: statusRow({ winner_team_id: null }), games: [GAME_SEVEN] };
    expect(() => planFor([source], [currentPending()])).toThrowError(/impossible shape/);
  });

  it('game 7 whose sides are not the source pair is refused before the stored row is consulted', () => {
    // Game 7's home/away name a franchise outside the pair. `validatedShape` is
    // where that is caught — it refuses any source game outside the SOURCE's
    // slots, and the identity lookup then ties those slots to the stored row in
    // either order, so a stored-pair clash can never reach the certification.
    // The database still guards it (`00015:240-243`); the plan's pin sits at the
    // one place the shape can actually drift in.
    const alienSeven = scoreRow(7, TEAM_A, 999, 105, 90);
    const source: SourceSeries = { status: statusRow({ winner_team_id: TEAM_A }), games: [alienSeven] };
    try {
      planFor([source], [currentPending()]);
      expect.unreachable('a game 7 outside the pair must never reach a write');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/game 7: teams \d+\/999 are not the series pair \d+\/\d+/);
      expect(message).toContain(String(TEAM_A));
    }
  });

  it('game 7 at the OTHER side: the reversed stored row is the match, and the completion keeps the stored slots', () => {
    // 43 of the 160 archived NBA/BAA series played Game 7 away from `team_a`'s
    // court (`00016`'s census), so a date-granular source that names game 7's
    // home side will legitimately meet the stored pair in the other order.
    // Refusing there would abort the whole run on a real Game 7.
    const reversedRow: CurrentSeriesRow = { ...currentPending('series-42'), team_a_id: TEAM_B, team_b_id: TEAM_A };
    const plan = planFor([gameSevenOnlySource()], [reversedRow]);
    expect(plan.births).toHaveLength(0);
    expect(plan.skips).toHaveLength(0);
    expect(plan.completions).toHaveLength(1);
    const completion = plan.completions[0];
    expect(completion.series_id).toBe('series-42');
    // The SERIES identity comes from the table, not from the source's slot order…
    expect(completion.team_a_id).toBe(TEAM_B);
    expect(completion.team_b_id).toBe(TEAM_A);
    // …while the game row keeps game 7's real venue sides.
    expect(completion.game).toMatchObject({ game_number: 7, home_team_id: TEAM_A, away_team_id: TEAM_B });
  });

  it('a seven-game source meeting the pair in the other order is still refused naming the series id and both ids', () => {
    // The reversed row is only admissible for the shape that cannot know game 1.
    const swapped: CurrentSeriesRow = { ...currentPending('series-clash'), team_a_id: TEAM_B, team_b_id: TEAM_A };
    try {
      planFor([archiveSource()], [swapped]);
      expect.unreachable('the identity assertion must fire first for a source that carries game 1');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/identity assertion failed/);
      expect(message).toContain('series-clash');
      expect(message).toContain(String(TEAM_A));
      expect(message).toContain(String(TEAM_B));
    }
  });

  it('archived row + the SAME game 7 again: a skip, so re-running a day stays green', () => {
    const plan = planFor([gameSevenOnlySource()], [currentArchive('series-42')]);
    expect(plan.completions).toHaveLength(0);
    expect(plan.skips).toHaveLength(1);
    expect(plan.skips[0].reason).toBe('already archived with identical games 1–7');
  });

  it('archived row stored in the OTHER slot order + the SAME game 7 again: still a skip, not an identity failure', () => {
    // The replay of a Game 7 that completed through the reversed-row match: the
    // first run adopted the stored slots, so the archived row keeps them, and a
    // second dispatch of the same date must stay green rather than trip AD-5.
    const reversedArchive: CurrentSeriesRow = { ...currentArchive('series-42'), team_a_id: TEAM_B, team_b_id: TEAM_A };
    const plan = planFor([gameSevenOnlySource()], [reversedArchive]);
    expect(plan.completions).toHaveLength(0);
    expect(plan.births).toHaveLength(0);
    expect(plan.skips).toHaveLength(1);
    expect(plan.skips[0]).toMatchObject({ team_a_id: TEAM_B, team_b_id: TEAM_A, reason: 'already archived with identical games 1–7' });
  });

  it('archived row + a DIFFERENT game 7: refuse — an archived outcome is never rewritten', () => {
    const differentSeven = scoreRow(7, TEAM_A, TEAM_B, 120, 80); // TEAM_A wins, while the row says TEAM_B
    expect(() => planFor([gameSevenOnlySource({ winner: TEAM_A, game: differentSeven })], [currentArchive()])).toThrowError(
      /never rewrites an archived outcome/,
    );
  });

  it('the seven-row source shape is untouched: its own games 1-6 must still equal the stored ones', () => {
    // Same stored pending row, but the source carries all seven with different
    // games 1-6 — the pre-2.13 refusal, still in force.
    const altSix = [
      scoreRow(1, TEAM_A, TEAM_B, 115, 104),
      scoreRow(2, TEAM_A, TEAM_B, 118, 110),
      scoreRow(3, TEAM_B, TEAM_A, 108, 99),
      scoreRow(4, TEAM_B, TEAM_A, 112, 101),
      scoreRow(5, TEAM_A, TEAM_B, 120, 110),
      scoreRow(6, TEAM_B, TEAM_A, 98, 95),
    ];
    expect(() => planFor([{ status: statusRow({ winner_team_id: TEAM_B }), games: [...altSix, GAME_SEVEN] }], [currentPending()])).toThrowError(
      /source's games 1–6 are not the stored ones/,
    );
  });
});
