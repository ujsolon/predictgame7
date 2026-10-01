// Story 2.4 — the nba_com adapter against an injected fetch: a synthetic
// fixture postseason built in this file, zero network (Decision 8:
// `tests/pipeline` never touches the wire). This is the I/O matrix of
// spec-2-4 executed row by row; the live leg is the owner-run
// `scripts/probe-nba-com-adapter.mjs` (Decision 12).
import { describe, expect, it } from 'vitest';
import { getRoundImportance } from '../../src/lib/nba-utils.ts';
import { runPipeline } from '../../supabase/scripts/pipeline/run.ts';
import type { CurrentSeriesRow } from '../../supabase/scripts/pipeline/plan.ts';
import { createNbaComAdapter, deriveSeason, gameLogUrl, NbaComError } from '../../supabase/scripts/pipeline/adapters/nbaCom.ts';
import { deriveChainDepths, ROUND_LABELS_BY_DEPTH, roundLabelForDepth } from '../../supabase/scripts/pipeline/adapters/rounds.ts';
import type { AdapterDeps, AdapterFetch, AdapterFetchResponse } from '../../supabase/scripts/pipeline/port.ts';
import type { PipelineSink, TeamRow } from '../../supabase/scripts/pipeline/writer.ts';
import type { PlannedBirth, PlannedCompletion } from '../../supabase/scripts/pipeline/plan.ts';

// ---------- fixture builders ----------

interface Side {
  abbr: string;
  id: number;
}

interface FixtureGame {
  date: string;
  gameId: string;
  home: Side;
  away: Side;
  homePts: unknown;
  awayPts: unknown;
  /** Feed order realism: the two team rows of a game arrive in either order. */
  awayFirst?: boolean;
  /** Override the home row's MATCHUP text (shape-drift fixtures). */
  homeMatchupOverride?: string;
}

const FEED_HEADERS = ['GAME_ID', 'GAME_DATE', 'TEAM_ID', 'TEAM_ABBREVIATION', 'MATCHUP', 'PTS', 'WL'];

function teamRows(game: FixtureGame): unknown[][] {
  const homeWon = Number(game.homePts) > Number(game.awayPts);
  const homeRow = [
    game.gameId,
    game.date,
    game.home.id,
    game.home.abbr,
    game.homeMatchupOverride ?? `${game.home.abbr} vs. ${game.away.abbr}`,
    game.homePts,
    homeWon ? 'W' : 'L',
  ];
  const awayRow = [
    game.gameId,
    game.date,
    game.away.id,
    game.away.abbr,
    `${game.away.abbr} @ ${game.home.abbr}`,
    game.awayPts,
    homeWon ? 'L' : 'W',
  ];
  return game.awayFirst ? [awayRow, homeRow] : [homeRow, awayRow];
}

function feedBody(games: readonly FixtureGame[]): unknown {
  return { resultSets: [{ name: 'LeagueGameLog', headers: FEED_HEADERS, rowSet: games.flatMap(teamRows) }] };
}

const BOS: Side = { abbr: 'BOS', id: 2 };
const MIA: Side = { abbr: 'MIA', id: 13 };

/**
 * A series as the feed emits it: `winners` lists 'H' (game-1 home team) or
 * 'B' (game-1 away team) per date, scores decided by one-point margins,
 * venues alternating from game 1's home (real data, not the archive's slots).
 * `startDay` spaces rounds so the date-ordered chain walk sees one round
 * fully before the next starts — as a real postseason does.
 */
function seriesFixture(
  firstDate: string,
  gameIdBase: string,
  teamA: Side,
  teamB: Side,
  winners: readonly ('H' | 'B')[],
  startDay = 20,
): FixtureGame[] {
  const games: FixtureGame[] = [];
  winners.forEach((winner, index) => {
    // Every other day, rolled through a real calendar: a seven-game series
    // starting on the 20th ends on the 2nd of the next month, as it does in a
    // feed, so the fixture's dates are dates and not day counters.
    const date = new Date(Date.UTC(Number(firstDate.slice(0, 4)), Number(firstDate.slice(5, 7)) - 1, startDay + index * 2))
      .toISOString()
      .slice(0, 10);
    const homeIsA = index % 2 === 0;
    const home = homeIsA ? teamA : teamB;
    const away = homeIsA ? teamB : teamA;
    const homeWins = (homeIsA && winner === 'H') || (!homeIsA && winner === 'B');
    games.push({
      date,
      // GAME_ID suffixes deliberately NOT the game number (spike hazard 1).
      gameId: `${gameIdBase}${String(101 + index * 3).padStart(3, '0')}`,
      home,
      away,
      homePts: homeWins ? 110 : 100,
      awayPts: homeWins ? 100 : 110,
      awayFirst: index % 3 === 1,
    });
  });
  return games;
}

/** The canonical in-flight 3–3: BOS (game-1 home) wins 1–3, MIA wins 4–6. */
const pendingSeries = (firstDate = '2027-04') => seriesFixture(firstDate, '00427009', BOS, MIA, ['H', 'H', 'H', 'B', 'B', 'B']);
/** A completed Game 7: 3–3 through six, BOS takes seven. */
const completedSeries = (firstDate = '2027-04') => seriesFixture(firstDate, '00427009', BOS, MIA, ['H', 'H', 'B', 'B', 'B', 'H', 'H']);

interface StubResponse {
  status: number;
  body?: unknown;
  jsonThrows?: boolean;
}

function stubFeed(responses: readonly StubResponse[]): {
  fetch: AdapterFetch;
  urls: string[];
  calls: () => number;
} {
  const urls: string[] = [];
  let call = 0;
  const doFetch: AdapterFetch = async (url: string): Promise<AdapterFetchResponse> => {
    urls.push(url);
    const response = responses[Math.min(call, responses.length - 1)];
    call++;
    if (response.status !== 200) {
      return { ok: false, status: response.status, json: async () => ({} as unknown) };
    }
    if (response.jsonThrows) {
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new TypeError('Body unfetchable: not valid JSON');
        },
      };
    }
    const body = response.body;
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetch: doFetch, urls, calls: () => call };
}

function adapterFromFeed(body: unknown, opts: { runDate?: Date; season?: string } = {}) {
  const stub = stubFeed([{ status: 200, body }]);
  const deps: AdapterDeps = {
    readFile: () => {
      throw new Error('nba_com must never read a CSV');
    },
    teamIdByAbbreviation: () => undefined,
    fetch: stub.fetch,
    sleep: async () => {},
    runDate: opts.runDate ?? new Date(Date.UTC(2027, 4, 10)),
    season: opts.season,
  };
  return { adapter: createNbaComAdapter(deps), stub };
}

async function loadFromFeed(body: unknown, opts: { runDate?: Date; season?: string } = {}) {
  const { adapter, stub } = adapterFromFeed(body, opts);
  const statuses = await adapter.fetch_series_statuses();
  const scores = await adapter.fetch_game_scores();
  return { statuses, scores, report: adapter.describeRun?.(), stub };
}

// ---------- fake sink (mirrors run.test.ts's, compact) ----------

const VALID_ENV = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'never-print-this' };
const TEAMS: TeamRow[] = [
  { id: 2, abbreviation: 'BOS' },
  { id: 13, abbreviation: 'MIA' },
];

class FakeSink implements PipelineSink {
  current: CurrentSeriesRow[] = [];
  births: PlannedBirth[] = [];
  completions: PlannedCompletion[] = [];

  async readTeams(): Promise<TeamRow[]> {
    return TEAMS;
  }
  async readCurrent(): Promise<CurrentSeriesRow[]> {
    return this.current.map((row) => ({ ...row, scores: [...row.scores] }));
  }
  async birth(birthOp: PlannedBirth): Promise<string> {
    this.births.push(birthOp);
    const id = `fake-series-${this.births.length}`;
    this.current.push({
      id,
      year: birthOp.year,
      team_a_id: birthOp.team_a_id,
      team_b_id: birthOp.team_b_id,
      winner_team_id: null,
      scores: birthOp.scores.map((score) => ({
        game_number: score.game_number,
        home_team_id: score.home_team_id,
        away_team_id: score.away_team_id,
        home_score: score.home_score,
        away_score: score.away_score,
      })),
    });
    return id;
  }
  async complete(completion: PlannedCompletion): Promise<void> {
    this.completions.push(completion);
    const row = this.current.find((candidate) => candidate.id === completion.series_id);
    if (!row) throw new Error('fake sink: completion for unknown series');
    row.scores.push({ ...completion.game });
    row.winner_team_id = completion.winner_team_id;
  }
}

function capture(): { lines: string[]; log: (line: string) => void } {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

// ---------- season derivation (Decision 2) ----------

describe('nba_com season derivation', () => {
  it('maps the run date UTC to the postseason season it will find games in', () => {
    expect(deriveSeason(new Date(Date.UTC(2027, 3, 15)))).toBe('2026-27'); // April 2027 playoffs
    expect(deriveSeason(new Date(Date.UTC(2027, 0, 4)))).toBe('2026-27'); // January: still season 2026-27
    expect(deriveSeason(new Date(Date.UTC(2026, 5, 30)))).toBe('2025-26'); // June 2026: the finals just ended
    expect(deriveSeason(new Date(Date.UTC(2026, 6, 1)))).toBe('2026-27'); // July: the next season
    expect(deriveSeason(new Date(Date.UTC(2026, 9, 1)))).toBe('2026-27'); // October: offseason — zero playoff rows
  });

  it('builds the one Decision-1 URL: unkeyed, team-side, playoffs, Counter=1000', () => {
    const url = gameLogUrl('2026-27');
    expect(url.startsWith('https://stats.nba.com/stats/leaguegamelog?')).toBe(true);
    expect(url).toContain('Season=2026-27');
    expect(url).toContain('SeasonType=Playoffs');
    expect(url).toContain('PlayerOrTeam=T');
    expect(url).toContain('Counter=1000');
  });

  it('refuses a malformed --season= before any request', () => {
    expect(() => adapterFromFeed(feedBody([]), { season: '2016' })).toThrow(NbaComError);
    expect(() => adapterFromFeed(feedBody([]), { season: '2016' })).toThrow(/YYYY-YY/);
  });
});

// ---------- the port's row shapes, from exactly one request ----------

describe('nba_com — one request per run, the two port row shapes verbatim', () => {
  it('both fetch methods read one cached parse and emit only the declared shapes', async () => {
    const { statuses, scores, stub } = await loadFromFeed(feedBody(pendingSeries()));
    expect(stub.calls()).toBe(1); // one HTTP request serves BOTH port methods
    expect(statuses).toEqual([
      { year: 2027, round: 'First Round', team_a_id: 2, team_b_id: 13, winner_team_id: null },
    ]);
    expect(scores).toHaveLength(6);
    expect(scores[0]).toEqual({
      year: 2027,
      team_a_id: 2,
      team_b_id: 13,
      game_number: 1,
      home_team_id: 2, // team_a = game 1's home team (Decision 4)
      away_team_id: 13,
      home_score: 110,
      away_score: 100,
    });
  });

  it('an offseason run — zero playoff rows — yields zero rows and plans nothing', async () => {
    const { statuses, scores, report } = await loadFromFeed(feedBody([]), {
      runDate: new Date(Date.UTC(2026, 9, 1)), // Oct 2026: derived 2026-27 has no playoff games yet
    });
    expect(statuses).toEqual([]);
    expect(scores).toEqual([]);
    expect(report?.depthHistogram).toEqual({});
  });

  it('the runner completes the offseason as exit 0 with an empty plan', async () => {
    const sink = new FakeSink();
    const out = capture();
    const stub = stubFeed([{ status: 200, body: feedBody([]) }]);
    const code = await runPipeline({
      env: { ...VALID_ENV },
      argv: ['--source=nba_com'],
      createSink: () => sink,
      fetch: stub.fetch,
      now: () => new Date(Date.UTC(2026, 9, 1)),
      readFile: () => {
        throw new Error('nba_com must never read a CSV');
      },
      log: out.log,
    });
    expect(code).toBe(0);
    expect(out.lines.join('\n')).toMatch(/plan: 0 birth\(s\), 0 completion\(s\), 0 skip\(s\)/);
    expect(out.lines.join('\n')).toMatch(/0 Game-7 candidates selected \(0 pending at a certified 3–3, 0 completed/);
  });
});

// ---------- Decision 3: Game-7 series only ----------

describe('nba_com — Game-7-only selection', () => {
  it('an in-flight 3–3 becomes a pending status plus six score rows', async () => {
    const { statuses, scores } = await loadFromFeed(feedBody(pendingSeries()));
    expect(statuses).toHaveLength(1);
    expect(statuses[0].winner_team_id).toBeNull();
    expect(scores.map((game) => game.game_number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a completed Game 7 carries game 7 and its winner', async () => {
    const { statuses, scores } = await loadFromFeed(feedBody(completedSeries()));
    expect(statuses[0].winner_team_id).toBe(2); // BOS took game 7 at 110-100
    expect(scores).toHaveLength(7);
    const gameSeven = scores[6];
    expect(gameSeven.game_number).toBe(7);
    // Venues alternate from game 1 at BOS: game 7 is again BOS at home.
    expect(gameSeven.home_team_id).toBe(2);
    expect(gameSeven.away_team_id).toBe(13);
  });

  it('a 4-2, a 4-0 and an in-flight 2-1 are excluded and counted, never emitted', async () => {
    const sweep40 = seriesFixture('2027-04', '00427001', { abbr: 'CLE', id: 6 }, { abbr: 'DET', id: 5 }, ['H', 'H', 'H', 'H']);
    const win42 = seriesFixture('2027-04', '00427002', { abbr: 'NYK', id: 18 }, { abbr: 'PHI', id: 20 }, ['H', 'H', 'B', 'H', 'H', 'B']);
    const inflight = seriesFixture('2027-04', '00427003', { abbr: 'DEN', id: 8 }, { abbr: 'PHX', id: 17 }, ['H', 'B', 'H']);
    const { statuses, scores, report } = await loadFromFeed(feedBody([...sweep40, ...win42, ...inflight]));
    expect(statuses).toEqual([]);
    expect(scores).toEqual([]);
    const counts = report?.countsLine ?? '';
    expect(counts).toMatch(/3 series in feed, 0 Game-7 candidates selected/);
    expect(counts).toMatch(/3 excluded by shape/);
  });

  it('a completed seven-game series with a 4–2 through six still enters the plan — the runner asserts, not the adapter', async () => {
    // Decision 3 shapes are {1..6} 3–3 or {1..7} all-decided; the impossible
    // 4-2-then-game-7 is left for plan.ts's 3–3 assertion to reject (the
    // spec's first mutation check).
    const impossible = seriesFixture('2027-04', '00427009', BOS, MIA, ['H', 'H', 'H', 'H', 'B', 'B', 'H']);
    const { statuses } = await loadFromFeed(feedBody(impossible));
    expect(statuses).toHaveLength(1);
    const sink = new FakeSink();
    const errors = capture();
    const stub = stubFeed([{ status: 200, body: feedBody(impossible) }]);
    const code = await runPipeline({
      env: { ...VALID_ENV },
      argv: ['--source=nba_com'],
      createSink: () => sink,
      fetch: stub.fetch,
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(/went 4-2 through six/);
    expect(sink.births).toHaveLength(0);
  });

  it('a game played the run UTC day is excluded and counted — a series stands at its decided games', async () => {
    const games = completedSeries();
    // Game 7 (index 6, date 2027-05-02 by the every-other-day rule from 04-20)
    // is moved to the run date; the other six stand 3–3 → pending remains.
    games[6] = { ...games[6], date: '2027-05-10' };
    const { statuses, scores, report } = await loadFromFeed(feedBody(games), {
      runDate: new Date(Date.UTC(2027, 4, 10)),
    });
    expect(statuses[0].winner_team_id).toBeNull();
    expect(scores).toHaveLength(6);
    expect(report?.countsLine).toMatch(/1 same-UTC-day game\(s\) skipped/);
  });
});

// ---------- spike inherit list: MATCHUP period, date order, two-row merge ----------

describe('nba_com — game reconstruction from the spike', () => {
  it('merges a game\u2019s two rows on (date, unordered pair) into one home/away row', async () => {
    const { scores } = await loadFromFeed(feedBody(pendingSeries()));
    expect(scores).toHaveLength(6); // 12 team rows → 6 games
    for (const game of scores) {
      expect(game.home_team_id).not.toBe(game.away_team_id);
      expect(game.home_score).not.toBe(game.away_score);
    }
    // Game 1 is BOS at home 110-100; game 2 flipped venues (MIA home).
    expect(scores[1]).toMatchObject({ home_team_id: 13, away_team_id: 2, home_score: 100, away_score: 110 });
  });

  it('numbers games by date order, never the GAME_ID suffix', async () => {
    const games = pendingSeries();
    const shuffled = [...games].reverse(); // feed row order is no help either
    const { scores } = await loadFromFeed(feedBody(shuffled));
    expect(scores.map((game) => game.game_number)).toEqual([1, 2, 3, 4, 5, 6]);
    // Suffixes are 101,104,107,... (three apart) while dates say 1..6.
    const gameOne = scores.find((game) => game.game_number === 1);
    expect(gameOne).toBeDefined();
  });

  it('year comes from the calendar year of GAME_DATE, never SEASON_ID', async () => {
    // Season 2026-27, games in April 2027 → year 2027.
    const { statuses, scores } = await loadFromFeed(feedBody(pendingSeries()), { season: '2026-27' });
    expect(statuses[0].year).toBe(2027);
    expect(scores.every((game) => game.year === 2027)).toBe(true);
  });

  it('rejects a MATCHUP without the trailing period naming the GAME_ID', async () => {
    const games = pendingSeries();
    games[2] = { ...games[2], homeMatchupOverride: `${games[2].home.abbr} vs ${games[2].away.abbr}` };
    await expect(loadFromFeed(feedBody(games))).rejects.toThrow(new RegExp(games[2].gameId));
  });

  it('rejects a tie, a null PTS on a final game and a half-merged game, each naming the GAME_ID', async () => {
    const tie = pendingSeries();
    tie[3] = { ...tie[3], homePts: 105, awayPts: 105 };
    await expect(loadFromFeed(feedBody(tie))).rejects.toThrow(new RegExp(`${tie[3].gameId}.*tie score`, 's'));

    const nullPts = pendingSeries();
    nullPts[1] = { ...nullPts[1], awayPts: null };
    await expect(loadFromFeed(feedBody(nullPts))).rejects.toThrow(new RegExp(nullPts[1].gameId));

    const oneRow = { resultSets: [{ headers: FEED_HEADERS, rowSet: teamRows(pendingSeries()[0]).slice(0, 1) }] };
    await expect(loadFromFeed(oneRow)).rejects.toThrow(new RegExp(pendingSeries()[0].gameId));
  });

  it('rejects a self-match naming the GAME_ID', async () => {
    const games = pendingSeries();
    games[0] = { ...games[0], away: BOS, homeMatchupOverride: 'BOS vs. BOS' };
    await expect(loadFromFeed(feedBody(games))).rejects.toThrow(new RegExp(`${games[0].gameId}.*play itself`, 's'));
  });
});

// ---------- Decision 6: failure posture ----------

describe('nba_com — fetch retry posture', () => {
  it('403 then 403 then success: retries with backoff and still spends exactly one logical request', async () => {
    const sleeps: number[] = [];
    const body = feedBody(pendingSeries());
    const stub = stubFeed([{ status: 403 }, { status: 403 }, { status: 200, body }]);
    const adapter = createNbaComAdapter({
      readFile: () => {
        throw new Error('no CSV for nba_com');
      },
      teamIdByAbbreviation: () => undefined,
      fetch: stub.fetch,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
      runDate: new Date(Date.UTC(2027, 4, 10)),
    });
    const statuses = await adapter.fetch_series_statuses();
    expect(statuses).toHaveLength(1);
    expect(stub.calls()).toBe(3);
    expect(sleeps).toHaveLength(2);
  });

  it('a non-JSON 200 body and a missing resultSets shape are retried like 403', async () => {
    const stub = stubFeed([{ status: 200, jsonThrows: true }, { status: 200, body: { nonsense: true } }, { status: 200, body: feedBody(pendingSeries()) }]);
    const adapter = createNbaComAdapter({
      readFile: () => undefined as never,
      teamIdByAbbreviation: () => undefined,
      fetch: stub.fetch,
      sleep: async () => {},
      runDate: new Date(Date.UTC(2027, 4, 10)),
    });
    await expect(adapter.fetch_series_statuses()).resolves.toHaveLength(1);
    expect(stub.calls()).toBe(3);
  });

  it('three 403s: the run exits non-zero naming the URL and the status, writes nothing, and never selects manual_csv', async () => {
    const sink = new FakeSink();
    const errors = capture();
    const stub = stubFeed([{ status: 403 }]);
    const code = await runPipeline({
      env: { ...VALID_ENV },
      argv: ['--source=nba_com'],
      createSink: () => sink,
      fetch: stub.fetch,
      sleep: async () => {},
      logError: errors.log,
      readFile: () => {
        throw new Error('manual_csv must not be reached when nba_com fails');
      },
    });
    expect(code).toBe(2);
    const text = errors.lines.join('\n');
    expect(text).toMatch(/stats\.nba\.com\/stats\/leaguegamelog/);
    expect(text).toMatch(/HTTP 403/);
    expect(text).toMatch(/after 3 attempts/);
    expect(text).toMatch(/no manual_csv fallback/i);
    expect(stub.calls()).toBe(3);
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
  });

  it('a non-retryable refusal (404) fails at once instead of burning the backoff', async () => {
    const stub = stubFeed([{ status: 404 }]);
    const adapter = createNbaComAdapter({
      readFile: () => undefined as never,
      teamIdByAbbreviation: () => undefined,
      fetch: stub.fetch,
      sleep: async () => {},
      runDate: new Date(Date.UTC(2027, 4, 10)),
    });
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/HTTP 404/);
    expect(stub.calls()).toBe(1);
  });
});

// ---------- Decision 10: chain depth and the round vocabulary ----------

function bracketFixture(): FixtureGame[] {
  const team = (n: number): Side => ({ abbr: `T${String(n).padStart(2, '0')}`, id: 100 + n });
  const games: FixtureGame[] = [];
  // First round (April, day 20): one Game 7 (T01 vs T02), seven sweeps.
  games.push(...seriesFixture('2027-04', '00427010', team(1), team(2), ['H', 'H', 'B', 'B', 'B', 'H', 'H']));
  const r1Sweeps: Array<[number, number]> = [
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
  ];
  r1Sweeps.forEach(([a, b], index) => {
    games.push(...seriesFixture('2027-04', `0042702${index}`, team(a), team(b), ['H', 'H', 'H', 'H']));
  });
  // Conference semifinals (May, day 10): T01 vs T03 goes seven; others sweep.
  games.push(...seriesFixture('2027-05', '00427030', team(1), team(3), ['H', 'H', 'B', 'B', 'B', 'H', 'H'], 10));
  const r2Sweeps: Array<[number, number]> = [
    [5, 7],
    [9, 11],
    [13, 15],
  ];
  r2Sweeps.forEach(([a, b], index) => {
    games.push(...seriesFixture('2027-05', `0042704${index}`, team(a), team(b), ['H', 'H', 'H', 'H'], 10));
  });
  // Conference finals (June, day 8): T01 vs T05 goes seven; T09 vs T13 sweeps.
  games.push(...seriesFixture('2027-06', '00427050', team(1), team(5), ['H', 'B', 'H', 'B', 'B', 'H', 'H'], 8));
  games.push(...seriesFixture('2027-06', '00427051', team(9), team(13), ['H', 'H', 'H', 'H'], 8));
  // NBA Finals in flight (June, day 26): T01 vs T09 at a certified 3–3.
  games.push(...seriesFixture('2027-06', '00427060', team(1), team(9), ['H', 'H', 'H', 'B', 'B', 'B'], 26));
  return games;
}

describe('nba_com — round derivation over the bracket', () => {
  it('a full 16-team postseason yields the depth histogram {1:8, 2:4, 3:2, 4:1}', async () => {
    const { report } = await loadFromFeed(feedBody(bracketFixture()), {
      runDate: new Date(Date.UTC(2027, 5, 27)), // June 27: finals game 1 was the 26th, none today
    });
    expect(report?.depthHistogram).toEqual({ 1: 8, 2: 4, 3: 2, 4: 1 });
  });

  it('emits exactly the four canonical labels, one per depth, and each maps through getRoundImportance to its branch', async () => {
    const { statuses } = await loadFromFeed(feedBody(bracketFixture()), {
      runDate: new Date(Date.UTC(2027, 5, 27)),
    });
    const byRound = new Map(statuses.map((status) => [status.round, status]));
    expect([...byRound.keys()].sort()).toEqual(
      ['Conference Finals', 'Conference Semifinals', 'First Round', 'NBA Finals'].sort(),
    );
    expect(ROUND_LABELS_BY_DEPTH).toEqual(['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals']);
    expect(getRoundImportance('First Round')).toBe(1);
    expect(getRoundImportance('Conference Semifinals')).toBe(2);
    expect(getRoundImportance('Conference Finals')).toBe(3);
    expect(getRoundImportance('NBA Finals')).toBe(4);
    expect(byRound.get('NBA Finals')?.winner_team_id).toBeNull(); // in flight at 3–3
    expect(byRound.get('First Round')?.team_a_id).toBe(101); // T01 hosted game 1
  });

  it('a postseason in flight prints its real partial histogram without complaint', async () => {
    // Four first-round series (two of them Game 7 shapes) and one in-flight
    // 3–3 second-round series: histogram {1:4, 2:1}, exit 0, no exclusions.
    const games = [
      ...seriesFixture('2027-04', '00427070', BOS, MIA, ['H', 'H', 'B', 'B', 'B', 'H', 'H']),
      ...seriesFixture('2027-04', '00427071', { abbr: 'PHI', id: 20 }, { abbr: 'NYK', id: 18 }, ['H', 'H', 'H', 'H']),
      ...seriesFixture('2027-04', '00427072', { abbr: 'DEN', id: 8 }, { abbr: 'PHX', id: 17 }, ['H', 'H', 'H', 'H']),
      ...seriesFixture('2027-04', '00427073', { abbr: 'MIL', id: 15 }, { abbr: 'CHI', id: 4 }, ['H', 'B', 'H', 'B', 'H', 'H']),
      ...seriesFixture('2027-05', '00427074', BOS, { abbr: 'PHI', id: 20 }, ['H', 'H', 'H', 'B', 'B', 'B']),
    ];
    const { statuses, report } = await loadFromFeed(feedBody(games), { runDate: new Date(Date.UTC(2027, 4, 21)) });
    expect(report?.depthHistogram).toEqual({ 1: 4, 2: 1 });
    expect(report?.notes).toEqual([]);
    expect(report?.countsLine).toMatch(/0 round-unexplainable/);
    expect(statuses.map((status) => status.round).sort()).toEqual(['Conference Semifinals', 'First Round']);
  });

  it('a chain walk that derives depth 5 excludes the series, names it, and writes nothing for it', async () => {
    // After the Finals (depth 4), T01 somehow plays a fifth series — a seven
    // -game shape, so ONLY the depth can exclude it.
    const games = [
      ...seriesFixture('2027-04', '00427080', { abbr: 'T01', id: 101 }, { abbr: 'T02', id: 102 }, ['H', 'H', 'H', 'H']),
      ...seriesFixture('2027-05', '00427081', { abbr: 'T01', id: 101 }, { abbr: 'T03', id: 103 }, ['H', 'H', 'H', 'H']),
      ...seriesFixture('2027-05', '00427082', { abbr: 'T01', id: 101 }, { abbr: 'T05', id: 105 }, ['H', 'H', 'H', 'H']),
      ...seriesFixture('2027-06', '00427083', { abbr: 'T01', id: 101 }, { abbr: 'T09', id: 109 }, ['H', 'H', 'H', 'H']),
      ...seriesFixture('2027-06', '00427084', { abbr: 'T01', id: 101 }, { abbr: 'T11', id: 111 }, ['H', 'H', 'B', 'B', 'B', 'H', 'H']),
    ];
    const { statuses, scores, report } = await loadFromFeed(feedBody(games), { runDate: new Date(Date.UTC(2027, 6, 1)) });
    expect(report?.depthHistogram[5]).toBe(1);
    expect(report?.notes).toHaveLength(1);
    expect(report?.notes[0]).toMatch(/T01 vs T11/);
    expect(report?.notes[0]).toMatch(/depth 5 is outside 1\.\.4/);
    expect(report?.countsLine).toMatch(/1 round-unexplainable/);
    // The depth-5 series is written nowhere: no status, no game rows for it.
    expect(statuses.find((status) => status.team_a_id === 111 || status.team_b_id === 111)).toBeUndefined();
    expect(scores.find((game) => game.home_team_id === 111 || game.away_team_id === 111)).toBeUndefined();
  });

  it('deriveChainDepths walks in date order regardless of feed order', () => {
    const depths = deriveChainDepths([
      { key: 'k2', teamIds: [1, 3], startDate: '2027-05-01' },
      { key: 'k1', teamIds: [1, 2], startDate: '2027-04-01' },
      { key: 'k3', teamIds: [3, 4], startDate: '2027-04-01' },
    ]);
    expect(depths.get('k1')).toBe(1);
    expect(depths.get('k3')).toBe(1);
    expect(depths.get('k2')).toBe(2);
    expect(roundLabelForDepth(4)).toBe('NBA Finals');
    expect(roundLabelForDepth(5)).toBeUndefined();
    expect(roundLabelForDepth(0)).toBeUndefined();
  });
});

// ---------- runner integration + Decision 11 (frozen archive) ----------

describe('nba_com through the runner', () => {
  it('births the in-flight 3–3 with its canonical round label and prints the counts line and histogram', async () => {
    const sink = new FakeSink();
    const out = capture();
    const stub = stubFeed([{ status: 200, body: feedBody(pendingSeries()) }]);
    const code = await runPipeline({
      env: { ...VALID_ENV },
      argv: ['--source=nba_com'],
      createSink: () => sink,
      fetch: stub.fetch,
      now: () => new Date(Date.UTC(2027, 4, 10)),
      log: out.log,
    });
    expect(code).toBe(0);
    expect(sink.births).toHaveLength(1);
    expect(sink.completions).toHaveLength(0);
    expect(sink.births[0].round).toBe('First Round');
    expect(sink.births[0].scores).toHaveLength(6);
    const text = out.lines.join('\n');
    expect(text).toMatch(/pipeline adapter=nba_com/);
    expect(text).toMatch(/1 series in feed, 1 Game-7 candidates selected \(1 pending at a certified 3–3, 0 completed/);
    expect(text).toMatch(/depth histogram: \{1:1\}/);
    expect(stub.urls[0]).toContain('Season=2026-27'); // derived from the May 2027 run date
  });

  it('re-running the identical feed plans zero writes — the second run is all skips', async () => {
    const sink = new FakeSink();
    const body = feedBody(completedSeries());
    const first = await runPipeline({
      env: { ...VALID_ENV },
      argv: ['--source=nba_com'],
      createSink: () => sink,
      fetch: stubFeed([{ status: 200, body }]).fetch,
      now: () => new Date(Date.UTC(2027, 4, 10)),
    });
    expect(first).toBe(0);
    expect(sink.births).toHaveLength(1); // birth + followup completion
    expect(sink.completions).toHaveLength(1);
    const out = capture();
    const second = await runPipeline({
      env: { ...VALID_ENV },
      argv: ['--source=nba_com'],
      createSink: () => sink,
      fetch: stubFeed([{ status: 200, body }]).fetch,
      now: () => new Date(Date.UTC(2027, 4, 10)),
      log: out.log,
    });
    expect(second).toBe(0);
    expect(sink.births).toHaveLength(1);
    expect(sink.completions).toHaveLength(1);
    expect(out.lines.join('\n')).toMatch(/plan: 0 birth\(s\), 0 completion\(s\), 1 skip\(s\)/);
  });

  it('completes a pending Active Series from the feed in one run', async () => {
    const sink = new FakeSink();
    // The table already holds the 3–3 with rows identical to games 1–6 of
    // the same fixture the feed now carries game 7 for.
    const decided = completedSeries().slice(0, 6);
    sink.current.push({
      id: 'active-1',
      year: 2027,
      team_a_id: 2,
      team_b_id: 13,
      winner_team_id: null,
      scores: decided.map((game, index) => ({
        game_number: index + 1,
        home_team_id: game.home.id,
        away_team_id: game.away.id,
        home_score: Number(game.homePts),
        away_score: Number(game.awayPts),
      })),
    });
    const out = capture();
    const code = await runPipeline({
      env: { ...VALID_ENV },
      argv: ['--source=nba_com'],
      createSink: () => sink,
      fetch: stubFeed([{ status: 200, body: feedBody(completedSeries()) }]).fetch,
      now: () => new Date(Date.UTC(2027, 4, 10)),
      log: out.log,
    });
    expect(code).toBe(0);
    expect(sink.completions).toHaveLength(1);
    expect(sink.completions[0].series_id).toBe('active-1');
    expect(sink.completions[0].winner_team_id).toBe(2);
  });

  it('a --season= drill onto a disagreeing archived year lands on the Story 2.3 archive guard, not a write', async () => {
    const sink = new FakeSink();
    // The frozen 2016 archive: slot-convention rows (team_a home throughout)
    // — exactly what the audit measured. The feed's venue-true rows cannot
    // reconcile against it, and the guard refuses the run.
    sink.current.push({
      id: 'archived-2016',
      year: 2016,
      team_a_id: 10,
      team_b_id: 6,
      winner_team_id: 10,
      scores: [1, 2, 3, 4, 5, 6, 7].map((gameNumber) => ({
        game_number: gameNumber,
        home_team_id: 10, // the archive's slots, not venues
        away_team_id: 6,
        home_score: 100 + gameNumber,
        away_score: 90 + gameNumber,
      })),
    });
    const games2016 = seriesFixture('2016-05', '00416009', { abbr: 'GSW', id: 10 }, { abbr: 'CLE', id: 6 }, [
      'H',
      'H',
      'B',
      'B',
      'B',
      'H',
      'H',
    ]);
    const errors = capture();
    const stub = stubFeed([{ status: 200, body: feedBody(games2016) }]);
    const code = await runPipeline({
      env: { ...VALID_ENV },
      argv: ['--source=nba_com', '--season=2016-17'],
      createSink: () => sink,
      fetch: stub.fetch,
      logError: errors.log,
    });
    expect(code).toBe(2);
    const text = errors.lines.join('\n');
    // The Message Story 2.3 owns, verbatim enough for a drill operator to recognise:
    expect(text).toMatch(/is archived on the table and the source disagrees/);
    expect(text).toMatch(/never rewrites an archived outcome/);
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
    expect(stub.urls[0]).toContain('Season=2016-17');
  });

  it('a --season= drill whose source matches the stored archive rows skips them — the guard\u2019s other half', async () => {
    const sink = new FakeSink();
    const games = completedSeries();
    sink.current.push({
      id: 'archived-2027',
      year: 2027,
      team_a_id: 2,
      team_b_id: 13,
      winner_team_id: 2,
      scores: games.map((game, index) => ({
        game_number: index + 1,
        home_team_id: game.home.id,
        away_team_id: game.away.id,
        home_score: Number(game.homePts),
        away_score: Number(game.awayPts),
      })),
    });
    const out = capture();
    const code = await runPipeline({
      env: { ...VALID_ENV },
      argv: ['--source=nba_com', '--season=2026-27'],
      createSink: () => sink,
      fetch: stubFeed([{ status: 200, body: feedBody(games) }]).fetch,
      now: () => new Date(Date.UTC(2027, 4, 10)),
      log: out.log,
    });
    expect(code).toBe(0);
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
    expect(out.lines.join('\n')).toMatch(/already archived with identical games 1–7/);
  });

  it('feed shape drift aborts the run through the runner: non-zero exit, the GAME_ID named, zero writes', async () => {
    const sink = new FakeSink();
    const errors = capture();
    const games = pendingSeries();
    games[3] = { ...games[3], homePts: 105, awayPts: 105 };
    const stub = stubFeed([{ status: 200, body: feedBody(games) }]);
    const code = await runPipeline({
      env: { ...VALID_ENV },
      argv: ['--source=nba_com'],
      createSink: () => sink,
      fetch: stub.fetch,
      now: () => new Date(Date.UTC(2027, 4, 10)),
      logError: errors.log,
    });
    expect(code).toBe(2);
    expect(errors.lines.join('\n')).toMatch(new RegExp(`${games[3].gameId}.*tie score`, 's'));
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
  });

  it('an unrecognised flag refuses with help text naming --season= and the frozen-archive rule', async () => {
    const errors = capture();
    const code = await runPipeline({ env: { ...VALID_ENV }, argv: ['--seaon=2016-17'], createSink: () => new FakeSink(), logError: errors.log });
    expect(code).toBe(2);
    const text = errors.lines.join('\n');
    expect(text).toMatch(/--season=<YYYY-YY>/);
    expect(text).toMatch(/FROZEN/i);
  });
});
