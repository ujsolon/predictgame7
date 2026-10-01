// Story 2.4 — the `nba_com` adapter against an injected fetch: a synthetic
// fixture postseason built in this file, zero network, zero Supabase. Every
// row of the spec's I/O & Edge-Case matrix is pinned here, plus the runner
// legs that prove the report prints before planning and that Story 2.3's
// archive guard is what a `--season=` drill meets.
//
// Fixture discipline (spec Tasks): real Date.UTC-rolled dates, deliberately
// non-sequential GAME_ID suffixes (hazard 1), and an id space matching the
// `teams` seed of `supabase/migrations/00005` (BOS=2, MIA=16, CLE=6, GSW=10,
// …). The feed's TEAM_ID column is populated with ids the seed assigns to
// OTHER franchises, so any test reddens the moment the adapter reads them.
import { describe, expect, it } from 'vitest';
import { getRoundImportance } from '../../src/lib/nba-utils.ts';
import {
  BACKOFF_MS,
  FETCH_TIMEOUT_MS,
  MAX_FEED_ATTEMPTS,
  NBA_COM_HEADERS,
  createNbaComAdapter,
  deriveSeason,
  gameLogUrl,
} from '../../supabase/scripts/pipeline/adapters/nbaCom.ts';
import { createManualCsvAdapter } from '../../supabase/scripts/pipeline/adapters/manualCsv.ts';
import { runPipeline } from '../../supabase/scripts/pipeline/run.ts';
import type { CurrentSeriesRow, PlannedBirth, PlannedCompletion } from '../../supabase/scripts/pipeline/plan.ts';
import type { FeedFetch, FeedRequestInit, FeedResponseLike } from '../../supabase/scripts/pipeline/port.ts';
import type { PipelineSink, TeamRow } from '../../supabase/scripts/pipeline/writer.ts';

/** The `00005` seed's ids (alphabetical by city) — the only id space the sink's FKs accept. */
const SEED_IDS: Record<string, number> = {
  ATL: 1,
  BOS: 2,
  BKN: 3,
  CHA: 4,
  CHI: 5,
  CLE: 6,
  DAL: 7,
  DEN: 8,
  DET: 9,
  GSW: 10,
  HOU: 11,
  IND: 12,
  LAC: 13,
  LAL: 14,
  MEM: 15,
  MIA: 16,
  MIL: 17,
  MIN: 18,
  NOP: 19,
  NYK: 20,
  OKC: 21,
  ORL: 22,
  PHI: 23,
  PHX: 24,
  POR: 25,
  SAC: 26,
  SAS: 27,
  TOR: 28,
  UTA: 29,
  WAS: 30,
};

/**
 * A deliberately WRONG id per abbreviation — a number the seed assigns to a
 * different franchise. `7*i mod 30 + 1` is in 1..30 and never equals `i`
 * (6i ≡ 29 mod 30 has no solution), so copying the feed's TEAM_ID anywhere
 * produces a visible mismatch.
 */
function decoyTeamId(abbr: string): number {
  return ((SEED_IDS[abbr] * 7) % 30) + 1;
}

const TEAMS: TeamRow[] = Object.entries(SEED_IDS).map(([abbreviation, id]) => ({ id, abbreviation }));

const HEADERS = ['GAME_ID', 'GAME_DATE', 'TEAM_ID', 'TEAM_ABBREVIATION', 'MATCHUP', 'PTS', 'WL'];

/** The run's pinned UTC date: June 2027 — the derived season is 2026-27. */
const RUN_DATE = new Date(Date.UTC(2027, 5, 20));
const RUN_DATE_KEY = '2027-06-20';

/** Which FRANCHISE of the series wins a game: `home` = `spec.home`, `away` = `spec.away`. */
type Side = 'home' | 'away';

interface SeriesSpec {
  /** Game 1's home team — also the series' `team_a` (Decision 4). */
  home: string;
  away: string;
  /** `YYYY-MM-DD` of game 1; later games follow the 2-2-1-1-1 pattern, one `dayGap` apart. */
  startDate: string;
  /** Winning franchise per game, in date order (venue is the builder's, not the caller's). */
  results: Side[];
  /** GAME_ID suffix per game — left deliberately non-monotonic by callers (hazard 1). */
  idSuffixes?: number[];
  /** Feed the away row first for every game (the merge must not care). */
  reverseRows?: boolean;
  /** Days between consecutive games; default 2. */
  dayGap?: number;
  /** Mutate constructed rows before they enter the rowSet (drift fixtures). */
  mutate?: (rows: unknown[][]) => void;
  /** Override the home row's MATCHUP text wholesale (period-hazard fixtures). */
  homeMatchup?: (home: string, away: string, gameIndex: number) => string;
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${next.getUTCFullYear()}-${mm}-${dd}`;
}

/** The 2-2-1-1-1 venue pattern: which series role hosts each game. */
const HOME_ROTATION: Side[] = ['home', 'home', 'away', 'away', 'home', 'away', 'home'];

function seriesRows(code: number, spec: SeriesSpec): unknown[][] {
  const rows: unknown[][] = [];
  spec.results.forEach((winnerRole, index) => {
    const homeAbbr = HOME_ROTATION[index] === 'home' ? spec.home : spec.away;
    const awayAbbr = HOME_ROTATION[index] === 'home' ? spec.away : spec.home;
    const winnerAbbr = winnerRole === 'home' ? spec.home : spec.away;
    const date = addDays(spec.startDate, index * (spec.dayGap ?? 2));
    const gameId = `00427${String(code).padStart(2, '0')}${String(spec.idSuffixes?.[index] ?? index + 1).padStart(2, '0')}`;
    const homeWon = winnerAbbr === homeAbbr;
    const homePts = homeWon ? 110 : 100;
    const awayPts = homeWon ? 100 : 110;
    const homeMatchup = spec.homeMatchup ? spec.homeMatchup(homeAbbr, awayAbbr, index) : `${homeAbbr} vs. ${awayAbbr}`;
    const homeRow = [gameId, date, decoyTeamId(homeAbbr), homeAbbr, homeMatchup, homePts, homeWon ? 'W' : 'L'];
    const awayRow = [gameId, date, decoyTeamId(awayAbbr), awayAbbr, `${awayAbbr} @ ${homeAbbr}`, awayPts, homeWon ? 'L' : 'W'];
    rows.push(...(spec.reverseRows ? [awayRow, homeRow] : [homeRow, awayRow]));
  });
  spec.mutate?.(rows);
  return rows;
}

function feedBody(seriesSpecs: SeriesSpec[], headers: string[] = HEADERS): { resultSets: { headers: string[]; rowSet: unknown[][] }[] } {
  const rowSet = seriesSpecs.flatMap((spec, index) => seriesRows(index + 1, spec));
  return { resultSets: [{ headers, rowSet }] };
}

/** A full 16-team (15-series) 8/4/2/1 postseason — every series 3-3 then game 7. */
function fullBracketSpecs(): SeriesSpec[] {
  // 3-3 through six by role: home franchise takes games 1/4/5, away takes 2/3/6.
  const threeThree: Side[] = ['home', 'away', 'away', 'home', 'home', 'away'];
  const bracket = (startDate: string, pairs: [string, string][], winner: Side, idBase: number): SeriesSpec[] =>
    pairs.map(([home, away], index) => ({
      home,
      away,
      startDate,
      results: [...threeThree, winner],
      idSuffixes: [idBase + index * 3 + 1, idBase + index * 3 + 40, idBase + index * 3 + 12, idBase + index * 3 + 55, idBase + index * 3 + 7, idBase + index * 3 + 33, idBase + index * 3 + 21],
    }));
  return [
    ...bracket('2027-04-18', [['ATL', 'BOS'], ['BKN', 'CHA'], ['CHI', 'CLE'], ['DAL', 'DEN'], ['DET', 'GSW'], ['HOU', 'IND'], ['LAC', 'LAL'], ['MEM', 'MIA']], 'home', 100),
    ...bracket('2027-05-04', [['ATL', 'BKN'], ['CHI', 'DAL'], ['DET', 'HOU'], ['LAC', 'MEM']], 'home', 200),
    ...bracket('2027-05-20', [['ATL', 'CHI'], ['DET', 'LAC']], 'home', 300),
    ...bracket('2027-06-05', [['ATL', 'DET']], 'home', 400),
  ];
}

interface Stubbed {
  urls: string[];
  inits: (FeedRequestInit | undefined)[];
  sleeps: number[];
  fetch: FeedFetch;
}

/**
 * The injected fetch. It records the SECOND argument too, so the request
 * contract (headers, timeout signal) is asserted, not assumed — and the
 * shared `sleeps` array feeds the injected `sleep` seam, so the backoff is
 * pinned as the VALUES [1000, 4000], not as a call count.
 */
function stubFeed(plans: Array<{ status: number; body?: unknown; brokenJson?: boolean }>): Stubbed {
  const stub: Stubbed = { urls: [], inits: [], sleeps: [], fetch: async () => ({ ok: false, status: 500, json: async () => undefined }) };
  stub.fetch = async (url: string, init: FeedRequestInit): Promise<FeedResponseLike> => {
    stub.urls.push(url);
    stub.inits.push(init);
    const plan = plans[stub.urls.length - 1] ?? plans[plans.length - 1];
    if (plan.status !== 200) {
      return { ok: false, status: plan.status, json: async () => plan.body };
    }
    return {
      ok: true,
      status: 200,
      json: async () => {
        if (plan.brokenJson) throw new TypeError('Unexpected token < in JSON');
        return plan.body;
      },
    };
  };
  return stub;
}

function depsFor(stub: Stubbed, overrides: Partial<{ seasonOverride: string; now: Date }> = {}) {
  return {
    readFile: () => {
      throw new Error('nba_com deps must not read files');
    },
    teamIdByAbbreviation: (abbreviation: string) => SEED_IDS[abbreviation],
    fetch: stub.fetch,
    now: () => overrides.now ?? RUN_DATE,
    sleep: async (ms: number) => {
      stub.sleeps.push(ms);
    },
    seasonOverride: overrides.seasonOverride,
  };
}

async function adapterOver(body: unknown, overrides: Partial<{ seasonOverride: string; now: Date }> = {}) {
  const stub = stubFeed([{ status: 200, body }]);
  const adapter = createNbaComAdapter(depsFor(stub, overrides));
  const statuses = await adapter.fetch_series_statuses();
  const scores = await adapter.fetch_game_scores();
  const report = adapter.describeRun!();
  return { statuses, scores, report, stub };
}

const PENDING_3_3: SeriesSpec[] = [{ home: 'BOS', away: 'PHI', startDate: '2027-05-02', results: ['home', 'away', 'away', 'home', 'home', 'away'] }];
const DECIDED_GAME_7: SeriesSpec[] = [{ home: 'BOS', away: 'PHI', startDate: '2027-05-02', results: ['home', 'away', 'away', 'home', 'home', 'away', 'away'] }];

describe('nba_com — the port rows and the one-request rule', () => {
  it('a pending 3-3 series yields six score rows, a null winner, and exactly one HTTP request', async () => {
    const { statuses, scores, stub } = await adapterOver(feedBody(PENDING_3_3));
    expect(stub.urls).toHaveLength(1);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toEqual({ year: 2027, round: 'First Round', team_a_id: SEED_IDS.BOS, team_b_id: SEED_IDS.PHI, winner_team_id: null });
    expect(scores).toHaveLength(6);
    expect(scores.map((row) => row.game_number)).toEqual([1, 2, 3, 4, 5, 6]);
    // Slots: team_a = game 1's home team (Decision 4), from the RESOLVED ids.
    expect(scores.every((row) => row.team_a_id === SEED_IDS.BOS && row.team_b_id === SEED_IDS.PHI)).toBe(true);
    expect(scores[0]).toEqual({ year: 2027, team_a_id: 2, team_b_id: 23, game_number: 1, home_team_id: 2, away_team_id: 23, home_score: 110, away_score: 100 });
  });

  it('a decided seven yields the game-7 winner on the status and seven rows', async () => {
    const { statuses, scores } = await adapterOver(feedBody(DECIDED_GAME_7));
    expect(statuses[0]?.winner_team_id).toBe(SEED_IDS.PHI); // PHI took game 7
    expect(scores).toHaveLength(7);
  });

  it('team ids come from the teams-seed space, never the feed TEAM_ID (the resolver is the only id path)', async () => {
    const { statuses, scores } = await adapterOver(feedBody(DECIDED_GAME_7));
    const bosDecoy = decoyTeamId('BOS');
    const phiDecoy = decoyTeamId('PHI');
    expect(statuses[0]?.team_a_id).toBe(2);
    expect(statuses[0]?.team_a_id).not.toBe(bosDecoy);
    expect(statuses[0]?.team_b_id).toBe(23);
    expect(scores.every((row) => row.home_team_id !== bosDecoy && row.home_team_id !== phiDecoy)).toBe(true);
    expect(scores.every((row) => row.away_team_id !== bosDecoy && row.away_team_id !== phiDecoy)).toBe(true);
  });

  it('the id-space assertion bites: the fixture TEAM_IDs really are other franchises\' ids', () => {
    expect(decoyTeamId('BOS')).toBe(15); // MEM's seed id, not BOS's
    expect(decoyTeamId('PHI')).toBe(12); // IND's seed id, not PHI's
    expect(SEED_IDS.MEM).toBe(15);
    expect(SEED_IDS.IND).toBe(12);
  });

  it('either row arriving first merges to the same game (the (date, unordered pair) key)', async () => {
    const forward = await adapterOver(feedBody(DECIDED_GAME_7));
    const reversedBody = feedBody([{ ...DECIDED_GAME_7[0], reverseRows: true }]);
    const reversed = await adapterOver(reversedBody);
    expect(reversed.statuses).toEqual(forward.statuses);
    expect(reversed.scores).toEqual(forward.scores);
  });

  it('game numbers follow DATE order, not the GAME_ID suffix (hazard 1)', async () => {
    const scrambled: SeriesSpec[] = [{ ...DECIDED_GAME_7[0], idSuffixes: [7, 3, 11, 2, 9, 5, 1] }];
    const { scores } = await adapterOver(feedBody(scrambled));
    expect(scores.map((row) => row.game_number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // The first row by date carries the biggest id suffix and is still game 1.
    expect(scores[0]).toMatchObject({ game_number: 1, home_team_id: SEED_IDS.BOS });
  });

  it('year is the calendar year of GAME_DATE, never a season string (hazard 2)', async () => {
    // The pinning here: game dates in 2027 yield year 2027 even though the
    // fetched season is 2026-27 — the year comes off GAME_DATE, not SEASON_ID.
    const { statuses } = await adapterOver(feedBody(DECIDED_GAME_7), { seasonOverride: '2026-27' });
    expect(statuses[0]?.year).toBe(2027);
  });
});

describe('nba_com — Decision 3 selection and the summary counts', () => {
  it('4-2, 4-0 and in-flight 2-1 series are absent from the output and named in the counts line', async () => {
    const specs: SeriesSpec[] = [
      { home: 'CLE', away: 'GSW', startDate: '2027-04-20', results: ['home', 'home', 'away', 'home', 'away', 'home'] }, // 4-2
      { home: 'ATL', away: 'BKN', startDate: '2027-04-21', results: ['home', 'home', 'home', 'home'] }, // 4-0
      { home: 'CHI', away: 'MIA', startDate: '2027-04-22', results: ['home', 'away', 'home'] }, // 2-1 in flight
    ];
    const { statuses, scores, report } = await adapterOver(feedBody(specs));
    expect(statuses).toEqual([]);
    expect(scores).toEqual([]);
    expect(report.countsLine).toContain('3 series in feed, 0 Game-7 candidate(s)');
    expect(report.countsLine).toContain('2 ended before game 7');
    expect(report.countsLine).toContain('1 in flight');
  });

  it('a pre-2003 best-of-5 shape (3-2 through five) is excluded as in flight — no era rule needed', async () => {
    const specs: SeriesSpec[] = [{ home: 'HOU', away: 'PHX', startDate: '1994-05-01', results: ['home', 'away', 'home', 'away', 'home'] }];
    const { statuses, report } = await adapterOver(feedBody(specs), { seasonOverride: '1993-94' });
    expect(statuses).toEqual([]);
    expect(report.countsLine).toContain('1 in flight');
  });

  it('a game played on the run UTC date is withheld and counted; its null PTS is never consumed', async () => {
    // Game 7 lands on the run date itself with a null score — the unfinished
    // row must be filtered BEFORE grouping, so the series reads as a
    // certified 3-3 pending birth instead of aborting on the null.
    const body = feedBody([
      {
        home: 'BOS',
        away: 'PHI',
        startDate: addDays(RUN_DATE_KEY, -12), // games every 2 days → game 7 on RUN_DATE_KEY
        results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'],
      },
    ]);
    for (const row of body.resultSets[0].rowSet.slice(-2)) row[5] = null;
    const { statuses, scores, report } = await adapterOver(body);
    expect(statuses[0]?.winner_team_id).toBeNull();
    expect(scores).toHaveLength(6);
    expect(report.countsLine).toContain(`1 game(s) played on ${RUN_DATE_KEY} withheld`);
  });

  it('a withheld same-day game can downgrade a would-be pending series to in flight (never a fake 3-3)', async () => {
    const specs: SeriesSpec[] = [
      {
        home: 'NYK',
        away: 'BKN',
        startDate: addDays(RUN_DATE_KEY, -10), // games 1..6, game 6 on the run date
        results: ['home', 'away', 'home', 'away', 'home', 'away'],
      },
    ];
    const { statuses, report } = await adapterOver(feedBody(specs));
    expect(statuses).toEqual([]);
    expect(report.countsLine).toContain(`1 game(s) played on ${RUN_DATE_KEY} withheld`);
    expect(report.countsLine).toContain('1 in flight');
  });

  it('an offseason feed (zero rows) yields empty output without erroring', async () => {
    const { statuses, scores, report } = await adapterOver({ resultSets: [{ headers: HEADERS, rowSet: [] }] });
    expect(statuses).toEqual([]);
    expect(scores).toEqual([]);
    expect(report.countsLine).toContain('0 series in feed, 0 Game-7 candidate(s)');
  });
});

describe('nba_com — Decision 10 round derivation', () => {
  it('a full 16-team postseason yields the exact {1:8, 2:4, 3:2, 4:1} histogram and the four canonical labels', async () => {
    const { statuses, report } = await adapterOver(feedBody(fullBracketSpecs()));
    expect(report.histogramLine).toBe('nba_com depth histogram {1:8, 2:4, 3:2, 4:1}');
    expect(statuses).toHaveLength(15);
    const byRound = new Map<string, number>();
    for (const status of statuses) {
      byRound.set(status.round, (byRound.get(status.round) ?? 0) + 1);
    }
    expect([...byRound.entries()].sort()).toEqual([
      ['Conference Finals', 2],
      ['Conference Semifinals', 4],
      ['First Round', 8],
      ['NBA Finals', 1],
    ]);
  });

  it('every emitted label lands in the intended getRoundImportance branch (1/2/3/4)', async () => {
    const { statuses } = await adapterOver(feedBody(fullBracketSpecs()));
    const importanceFor: Record<string, number> = { 'First Round': 1, 'Conference Semifinals': 2, 'Conference Finals': 3, 'NBA Finals': 4 };
    for (const status of statuses) {
      expect(getRoundImportance(status.round)).toBe(importanceFor[status.round]);
    }
  });

  it('chain depth counts excluded series too — a sweep survivor is still labelled by its round', async () => {
    // R1: BOS sweeps CHA 4-0 (excluded from the output), ATL beats BKN in seven.
    // R2: ATL vs BOS (included) must derive depth 2 even though BOS's own R1
    // was excluded — the walk consumes every reconstructed series.
    const specs: SeriesSpec[] = [
      { home: 'BOS', away: 'CHA', startDate: '2027-04-18', results: ['home', 'home', 'home', 'home'] },
      { home: 'ATL', away: 'BKN', startDate: '2027-04-19', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] },
      { home: 'ATL', away: 'BOS', startDate: '2027-05-04', results: ['home', 'away', 'away', 'home', 'home', 'away', 'away'] },
    ];
    const { statuses } = await adapterOver(feedBody(specs));
    const atlBos = statuses.find((status) => status.team_a_id === SEED_IDS.ATL && status.team_b_id === SEED_IDS.BOS);
    expect(atlBos?.round).toBe('Conference Semifinals');
    expect(getRoundImportance(atlBos?.round ?? '')).toBe(2);
    const atlBkn = statuses.find((status) => status.team_b_id === SEED_IDS.BKN);
    expect(atlBkn?.round).toBe('First Round');
  });

  it('a partial mid-playoff fixture prints its real histogram without complaint', async () => {
    const specs: SeriesSpec[] = [
      { home: 'BOS', away: 'NYK', startDate: '2027-04-18', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] },
      { home: 'MIA', away: 'ATL', startDate: '2027-04-18', results: ['away', 'home', 'home', 'away', 'away', 'home', 'away'] },
      { home: 'BOS', away: 'ATL', startDate: '2027-05-04', results: ['home', 'away', 'home'] }, // in flight 2-1
    ];
    const { statuses, report } = await adapterOver(feedBody(specs));
    expect(report.histogramLine).toBe('nba_com depth histogram {1:2, 2:1}');
    expect(report.countsLine).toContain('3 series in feed, 2 Game-7 candidate(s)');
    expect(statuses).toHaveLength(2);
    expect(statuses.every((status) => status.round === 'First Round')).toBe(true);
  });

  it('a chain walk deriving depth 5 excludes that series, names it, and still writes nothing for it', async () => {
    const fiveRound: SeriesSpec[] = [
      { home: 'ATL', away: 'BOS', startDate: '2027-04-18', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] },
      { home: 'ATL', away: 'CHI', startDate: '2027-05-04', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] },
      { home: 'ATL', away: 'DEN', startDate: '2027-05-20', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] },
      { home: 'ATL', away: 'MIA', startDate: '2027-06-05', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] },
      { home: 'ATL', away: 'CLE', startDate: '2027-06-15', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] }, // depth 5
    ];
    const { statuses, scores, report } = await adapterOver(feedBody(fiveRound));
    expect(statuses).toHaveLength(4);
    expect(statuses.some((status) => status.team_a_id === SEED_IDS.ATL && status.team_b_id === SEED_IDS.CLE)).toBe(false);
    expect(scores.filter((row) => row.team_a_id === SEED_IDS.ATL && row.team_b_id === SEED_IDS.CLE)).toEqual([]);
    expect(report.notes).toHaveLength(1);
    expect(report.notes[0]).toMatch(/derived chain depth 5 is outside 1\.\.4/);
    expect(report.notes[0]).toMatch(/ATL\/CLE/);
    expect(report.notes[0]).toMatch(/the histogram that produced it: \{1:1, 2:1, 3:1, 4:1, 5:1\}/);
    expect(report.countsLine).toContain('1 unexplainable');
  });

  it('seven games without a 3-3 split through six is excluded and named — an impossible bracket shape', async () => {
    const specs: SeriesSpec[] = [
      { home: 'BOS', away: 'MIA', startDate: '2027-04-18', results: ['home', 'home', 'away', 'home', 'home', 'away', 'away'] }, // 4-2 through six, seven played
    ];
    const { statuses, report } = await adapterOver(feedBody(specs));
    expect(statuses).toEqual([]);
    expect(report.notes.some((note) => /impossible bracket shape/.test(note))).toBe(true);
    expect(report.countsLine).toContain('1 unexplainable');
  });
});

describe('nba_com — feed shape drift rejects naming GAME_ID', () => {
  it('the trailing period is load-bearing: "vs." without it rejects as unparseable', async () => {
    const specs: SeriesSpec[] = [
      { ...PENDING_3_3[0], homeMatchup: (home, away) => `${home} vs ${away}` }, // the bug that shattered series in the spike
    ];
    const stub = stubFeed([{ status: 200, body: feedBody(specs) }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/unparseable/);
    try {
      await adapter.fetch_series_statuses();
    } catch (error) {
      expect((error as Error).message).toMatch(/MATCHUP "BOS vs PHI"/);
      expect((error as Error).message).toMatch(/game 00427/);
    }
  });

  it('a tie in date (two GAME_IDs, one date, one pair) rejects naming both games', async () => {
    const one = seriesRows(1, { home: 'BOS', away: 'PHI', startDate: '2027-05-02', results: ['home'] });
    const two = seriesRows(2, { home: 'BOS', away: 'PHI', startDate: '2027-05-02', results: ['away'] });
    const body = { resultSets: [{ headers: HEADERS, rowSet: [...one, ...two] }] };
    const stub = stubFeed([{ status: 200, body }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/games 004270101 and 004270201 share one date \(2027-05-02\) and one team pair/);
  });

  it('a self-match rejects naming GAME_ID', async () => {
    const body = feedBody([{ home: 'BOS', away: 'PHI', startDate: '2027-05-02', results: ['home'] }]);
    body.resultSets[0].rowSet[0] = ['004270101', '2027-05-02', 2, 'BOS', 'BOS vs. BOS', 110, 'W'];
    const stub = stubFeed([{ status: 200, body }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/game 004270101.*playing itself/s);
  });

  it('a null PTS on a concluded game rejects naming GAME_ID', async () => {
    const body = feedBody([{ home: 'BOS', away: 'PHI', startDate: '2027-05-02', results: ['home'] }]);
    body.resultSets[0].rowSet[0][5] = null;
    const stub = stubFeed([{ status: 200, body }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/game 004270101 2027-05-02: home PTS null/);
  });

  it('a tie score rejects naming GAME_ID — the chain walk would otherwise pick a winner silently', async () => {
    // `manual_csv` refuses a tie at the adapter (manualCsv.ts:112) and this one
    // mirrors it: winners feed both the depth walk and Decision 3's selection,
    // so `plan.ts`'s later guard would be too late to keep the label honest.
    const body = feedBody([{ home: 'BOS', away: 'PHI', startDate: '2027-05-02', results: ['home'] }]);
    body.resultSets[0].rowSet[1][5] = 110; // away PTS now equals home PTS
    const stub = stubFeed([{ status: 200, body }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/game 004270101 2027-05-02: tie score 110-110/);
  });

  it('an abbreviation the teams table does not hold rejects naming the abbreviation AND GAME_ID', async () => {
    const body = feedBody([{ home: 'BOS', away: 'PHI', startDate: '2027-05-02', results: ['home'] }]);
    body.resultSets[0].rowSet[1] = ['004270101', '2027-05-02', 99, 'XYZ', 'XYZ @ BOS', 100, 'L'];
    const stub = stubFeed([{ status: 200, body }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/game 004270101: unknown team abbreviation "XYZ"/);
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/Refusing to substitute the feed's TEAM_ID/);
  });

  it('a MATCHUP that contradicts TEAM_ABBREVIATION rejects naming GAME_ID', async () => {
    const body = feedBody([{ home: 'BOS', away: 'PHI', startDate: '2027-05-02', results: ['home'] }]);
    body.resultSets[0].rowSet[0] = ['004270101', '2027-05-02', 2, 'BOS', 'MIA vs. BOS', 110, 'W'];
    const stub = stubFeed([{ status: 200, body }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/game 004270101: MATCHUP "MIA vs\. BOS" names "MIA" but TEAM_ABBREVIATION is "BOS"/);
  });

  it('only one side row for a game rejects naming GAME_ID', async () => {
    const body = feedBody([{ home: 'BOS', away: 'PHI', startDate: '2027-05-02', results: ['home'] }]);
    body.resultSets[0].rowSet.splice(1, 1); // drop the away row
    const stub = stubFeed([{ status: 200, body }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/game 004270101 2027-05-02: only one team row arrived \(BOS\)/);
  });

  it('WL is never read: a header set without WL still parses, and inverted WL values change nothing', async () => {
    const spec = DECIDED_GAME_7[0];
    const noWlHeaders = HEADERS.filter((header) => header !== 'WL');
    const trimmedBody = feedBody([spec]);
    const withoutWl = { resultSets: [{ headers: noWlHeaders, rowSet: trimmedBody.resultSets[0].rowSet.map((row) => row.slice(0, 6)) }] };
    const invertedBody = feedBody([spec]);
    invertedBody.resultSets[0].rowSet.forEach((row) => {
      row[6] = row[6] === 'W' ? 'L' : 'W';
    });
    const a = await adapterOver(withoutWl);
    const b = await adapterOver(invertedBody);
    expect(a.statuses).toEqual(b.statuses);
    expect(a.scores).toEqual(b.scores);
  });

  it('required-column drift rejects naming the missing column', async () => {
    const body = feedBody(DECIDED_GAME_7);
    const headersNoPts = HEADERS.filter((header) => header !== 'PTS');
    const trimmed = { resultSets: [{ headers: headersNoPts, rowSet: body.resultSets[0].rowSet.map((row) => row.filter((_, index) => index !== 5)) }] };
    const stub = stubFeed([{ status: 200, body: trimmed }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/headers lack required column\(s\) PTS/);
    // The column drift is terminal at once — headers fail on attempt 1, not after retries.
    expect(stub.urls).toHaveLength(1);
    expect(stub.sleeps).toEqual([]);
  });
});

describe('nba_com — Decision 1/6 request posture', () => {
  it('the request carries the six spike headers verbatim, a 25 s timeout signal, and the pinned URL', async () => {
    const stub = stubFeed([{ status: 200, body: feedBody(DECIDED_GAME_7) }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await adapter.fetch_series_statuses();
    expect(stub.urls).toHaveLength(1);
    const init = stub.inits[0]!;
    expect(Object.keys(init.headers).sort()).toEqual(
      ['Accept', 'Origin', 'Referer', 'User-Agent', 'x-nba-stats-origin', 'x-nba-stats-token'].sort(),
    );
    expect(init.headers).toEqual({ ...NBA_COM_HEADERS });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(FETCH_TIMEOUT_MS).toBe(25000);
    const url = new URL(stub.urls[0]);
    expect(`${url.host}${url.pathname}`).toBe('stats.nba.com/stats/leaguegamelog');
    const params = Object.fromEntries(url.searchParams.entries());
    expect(params).toMatchObject({ Season: '2026-27', SeasonType: 'Playoffs', PlayerOrTeam: 'T', Counter: '1000', LeagueID: '00' });
  });

  it('both port methods share one memoised request (Decision 1)', async () => {
    const { stub } = await adapterOver(feedBody(DECIDED_GAME_7));
    expect(stub.urls).toHaveLength(1);
  });

  it('season derives from the run UTC date: Jan-Jun asks Y-1, Jul-Dec asks Y', () => {
    expect(deriveSeason(new Date(Date.UTC(2027, 0, 15)))).toBe('2026-27');
    expect(deriveSeason(new Date(Date.UTC(2027, 5, 30)))).toBe('2026-27');
    expect(deriveSeason(new Date(Date.UTC(2026, 6, 1)))).toBe('2026-27');
    expect(deriveSeason(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-27');
    expect(deriveSeason(new Date(Date.UTC(2027, 8, 1)))).toBe('2027-28');
  });

  it('--season= overrides the derivation and survives into the URL', async () => {
    const stub = stubFeed([{ status: 200, body: feedBody(DECIDED_GAME_7) }]);
    const adapter = createNbaComAdapter(depsFor(stub, { seasonOverride: '2015-16' }));
    await adapter.fetch_series_statuses();
    expect(new URL(stub.urls[0]).searchParams.get('Season')).toBe('2015-16');
  });

  it('a malformed --season= refuses eagerly — before any request', () => {
    const stub = stubFeed([{ status: 200, body: feedBody(DECIDED_GAME_7) }]);
    expect(() => createNbaComAdapter(depsFor(stub, { seasonOverride: '2016' }))).toThrow(/--season="2016" is not a season string/);
    expect(stub.urls).toHaveLength(0);
  });

  it('403 then success: the retry waited exactly 1000 ms', async () => {
    const stub = stubFeed([{ status: 403 }, { status: 200, body: feedBody(DECIDED_GAME_7) }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    const statuses = await adapter.fetch_series_statuses();
    expect(statuses).toHaveLength(1);
    expect(stub.urls).toHaveLength(2);
    expect(stub.sleeps).toEqual([1000]);
  });

  it('exhausted 403s: the terminal error names URL + status and states no fallback was taken', async () => {
    const stub = stubFeed([{ status: 403 }, { status: 403 }, { status: 403 }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/HTTP 403/);
    expect(stub.urls).toHaveLength(MAX_FEED_ATTEMPTS);
    expect(stub.sleeps).toEqual(BACKOFF_MS);
    expect(stub.sleeps).toEqual([1000, 4000]);
    try {
      await adapter.fetch_series_statuses();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain(stub.urls[0]);
      expect(message).toMatch(/no manual_csv fallback was taken/);
    }
  });

  it('a non-retryable status fails at once with zero waits', async () => {
    const stub = stubFeed([{ status: 404 }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    await expect(adapter.fetch_series_statuses()).rejects.toThrow(/HTTP 404/);
    expect(stub.urls).toHaveLength(1);
    expect(stub.sleeps).toEqual([]);
  });

  it('non-JSON and missing-resultSets bodies are retryable drift, then terminal', async () => {
    const notJson = stubFeed([{ status: 200, brokenJson: true }, { status: 200, brokenJson: true }, { status: 200, brokenJson: true }]);
    await expect(createNbaComAdapter(depsFor(notJson)).fetch_series_statuses()).rejects.toThrow(/not JSON/);
    expect(notJson.sleeps).toEqual([1000, 4000]);
    const noResultSets = stubFeed([{ status: 200, body: { data: 'surprise' } }, { status: 200, body: {} }, { status: 200, body: null }]);
    await expect(createNbaComAdapter(depsFor(noResultSets)).fetch_series_statuses()).rejects.toThrow(/resultSets/);
    expect(noResultSets.sleeps).toEqual([1000, 4000]);
  });

  it('describeRun() before the feed resolved throws — the report describes a parse that has not happened', () => {
    const stub = stubFeed([{ status: 200, body: feedBody(DECIDED_GAME_7) }]);
    const adapter = createNbaComAdapter(depsFor(stub));
    expect(() => adapter.describeRun!()).toThrow(/before the feed resolved/);
    expect(stub.urls).toHaveLength(0);
  });

  it('gameLogUrl is the one URL template, built through URLSearchParams', () => {
    const url = new URL(gameLogUrl('2025-26'));
    expect(url.searchParams.get('Season')).toBe('2025-26');
    expect(url.searchParams.get('SeasonType')).toBe('Playoffs');
    expect(url.searchParams.get('PlayerOrTeam')).toBe('T');
    expect(url.searchParams.get('Counter')).toBe('1000');
  });
});

// ---------------------------------------------------------------------------
// Runner legs: the fake sink mirrors Story 2.3's so "zero writes" is an
// assertion, and the report-before-planning order is pinned on real output.
// ---------------------------------------------------------------------------

class RecordingSink implements PipelineSink {
  current: CurrentSeriesRow[] = [];
  births: PlannedBirth[] = [];
  completions: PlannedCompletion[] = [];
  private teams: TeamRow[] = TEAMS;

  async readTeams(): Promise<TeamRow[]> {
    return this.teams;
  }
  async readCurrent(): Promise<CurrentSeriesRow[]> {
    return this.current.map((row) => ({ ...row, scores: row.scores.map((score) => ({ ...score })) }));
  }
  async birth(birthOp: PlannedBirth): Promise<string> {
    this.births.push(birthOp);
    const id = `feed-series-${this.births.length}`;
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
    row.scores.push({
      game_number: completion.game.game_number,
      home_team_id: completion.game.home_team_id,
      away_team_id: completion.game.away_team_id,
      home_score: completion.game.home_score,
      away_score: completion.game.away_score,
    });
    row.winner_team_id = completion.winner_team_id;
  }
}

const VALID_ENV = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'never-print-this' };

function runnerHarness(body: unknown, sink: RecordingSink, argv: string[]) {
  const lines: string[] = [];
  const errors: string[] = [];
  const stub = stubFeed([{ status: 200, body }]);
  const promise = runPipeline({
    env: VALID_ENV,
    argv: ['--source=nba_com', ...argv],
    createSink: () => sink,
    fetch: stub.fetch,
    sleep: async (ms: number) => {
      stub.sleeps.push(ms);
    },
    now: () => RUN_DATE,
    log: (line: string) => lines.push(line),
    logError: (line: string) => errors.push(line),
    readFile: () => {
      throw new Error('nba_com runner tests must not read files');
    },
  });
  return { lines, errors, stub, promise };
}

describe('nba_com through runPipeline', () => {
  it('the report prints before planning and the pending series births with seed-space ids', async () => {
    const sink = new RecordingSink();
    const harness = runnerHarness(feedBody(PENDING_3_3), sink, []);
    const code = await harness.promise;
    expect(code).toBe(0);
    expect(sink.births).toHaveLength(1);
    expect(sink.births[0]).toMatchObject({ year: 2027, team_a_id: 2, team_b_id: 23, round: 'First Round' });
    const text = harness.lines.join('\n');
    expect(text).toMatch(/nba_com: 1 series in feed, 1 Game-7 candidate\(s\) \(1 pending 3-3, 0 decided/);
    expect(text).toContain('nba_com depth histogram {1:1}');
    const countsIndex = harness.lines.findIndex((line) => line.startsWith('nba_com:'));
    const planIndex = harness.lines.findIndex((line) => line.startsWith('plan:'));
    expect(countsIndex).toBeGreaterThanOrEqual(0);
    expect(planIndex).toBeGreaterThan(countsIndex);
  });

  it('exclusion notes reach stdout through the runner', async () => {
    const fiveRound = [
      { home: 'ATL', away: 'BOS', startDate: '2027-04-18', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] },
      { home: 'ATL', away: 'CHI', startDate: '2027-05-04', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] },
      { home: 'ATL', away: 'DEN', startDate: '2027-05-20', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] },
      { home: 'ATL', away: 'MIA', startDate: '2027-06-05', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] },
      { home: 'ATL', away: 'CLE', startDate: '2027-06-15', results: ['home', 'away', 'away', 'home', 'home', 'away', 'home'] },
    ] satisfies SeriesSpec[];
    const sink = new RecordingSink();
    const harness = runnerHarness(feedBody(fiveRound), sink, []);
    expect(await harness.promise).toBe(0);
    const noteLine = harness.lines.find((line) => /depth 5 is outside 1\.\.4/.test(line));
    expect(noteLine).toBeDefined();
    expect(sink.births).toHaveLength(4);
  });

  it('a planning abort still shows the parse: the report prints, then the slot assertion reddens', async () => {
    const sink = new RecordingSink();
    // The table holds the BOS/PHI pair with the slots swapped (PHI as team_a).
    sink.current.push({
      id: 'swapped-row',
      year: 2027,
      team_a_id: SEED_IDS.PHI,
      team_b_id: SEED_IDS.BOS,
      winner_team_id: null,
      scores: [],
    });
    const harness = runnerHarness(feedBody(PENDING_3_3), sink, []);
    const code = await harness.promise;
    expect(code).toBe(2);
    expect(sink.births).toHaveLength(0);
    expect(harness.errors.join('\n')).toMatch(/identity assertion failed/);
    const text = harness.lines.join('\n');
    expect(text).toContain('nba_com: 1 series in feed');
    expect(text).toContain('depth histogram');
  });

  it('--season= onto an archived year that DISAGREES aborts with Story 2.3\'s guard — never a rewrite', async () => {
    const sink = new RecordingSink();
    // The table already archived 2027 BOS/PHI with BOS winning; the feed
    // (drilled to the same season) says PHI won game 7.
    sink.current.push({
      id: 'archived-row',
      year: 2027,
      team_a_id: SEED_IDS.BOS,
      team_b_id: SEED_IDS.PHI,
      winner_team_id: SEED_IDS.BOS,
      scores: [1, 2, 3, 4, 5, 6, 7].map((gameNumber) => ({
        game_number: gameNumber,
        home_team_id: gameNumber % 2 === 1 ? SEED_IDS.BOS : SEED_IDS.PHI,
        away_team_id: gameNumber % 2 === 1 ? SEED_IDS.PHI : SEED_IDS.BOS,
        home_score: 110,
        away_score: 100,
      })),
    });
    const harness = runnerHarness(feedBody(DECIDED_GAME_7), sink, ['--season=2026-27']);
    const code = await harness.promise;
    expect(code).toBe(2);
    expect(sink.completions).toHaveLength(0);
    expect(sink.births).toHaveLength(0);
    expect(harness.errors.join('\n')).toMatch(/is archived on the table and the source disagrees/);
  });

  it('--season= onto an archived year that AGREES skips with zero writes', async () => {
    const sink = new RecordingSink();
    // Table holds exactly what the feed reconstructs for DECIDED_GAME_7:
    // venues follow 2-2-1-1-1 from game 1 at BOS, PHI takes games 2/3/6/7.
    const scores = [
      { game_number: 1, home_team_id: SEED_IDS.BOS, away_team_id: SEED_IDS.PHI, home_score: 110, away_score: 100 },
      { game_number: 2, home_team_id: SEED_IDS.BOS, away_team_id: SEED_IDS.PHI, home_score: 100, away_score: 110 },
      { game_number: 3, home_team_id: SEED_IDS.PHI, away_team_id: SEED_IDS.BOS, home_score: 110, away_score: 100 },
      { game_number: 4, home_team_id: SEED_IDS.PHI, away_team_id: SEED_IDS.BOS, home_score: 100, away_score: 110 },
      { game_number: 5, home_team_id: SEED_IDS.BOS, away_team_id: SEED_IDS.PHI, home_score: 110, away_score: 100 },
      { game_number: 6, home_team_id: SEED_IDS.PHI, away_team_id: SEED_IDS.BOS, home_score: 110, away_score: 100 },
      { game_number: 7, home_team_id: SEED_IDS.BOS, away_team_id: SEED_IDS.PHI, home_score: 100, away_score: 110 },
    ];
    sink.current.push({ id: 'archived-row', year: 2027, team_a_id: SEED_IDS.BOS, team_b_id: SEED_IDS.PHI, winner_team_id: SEED_IDS.PHI, scores });
    const harness = runnerHarness(feedBody(DECIDED_GAME_7), sink, []);
    expect(await harness.promise).toBe(0);
    expect(sink.births).toHaveLength(0);
    expect(sink.completions).toHaveLength(0);
    expect(harness.lines.join('\n')).toMatch(/already archived with identical games/);
  });

  it('a re-run with the same feed plans nothing (existing all-skip behaviour holds for nba_com)', async () => {
    const sink = new RecordingSink();
    const first = runnerHarness(feedBody(PENDING_3_3), sink, []);
    expect(await first.promise).toBe(0);
    expect(sink.births).toHaveLength(1);
    const second = runnerHarness(feedBody(PENDING_3_3), sink, []);
    expect(await second.promise).toBe(0);
    expect(sink.births).toHaveLength(1);
    expect(second.lines.join('\n')).toMatch(/plan: 0 birth\(s\), 0 completion\(s\), 1 skip\(s\)/);
  });

  it('--csv= with nba_com refuses the run instead of silently discarding it', async () => {
    const sink = new RecordingSink();
    const harness = runnerHarness(feedBody(PENDING_3_3), sink, ['--csv=whatever.csv']);
    expect(await harness.promise).toBe(2);
    expect(harness.errors.join('\n')).toMatch(/--csv= does not apply to adapter "nba_com"/);
    expect(sink.births).toHaveLength(0);
    expect(harness.stub.urls).toHaveLength(0);
  });

  it('--season= with manual_csv refuses the run too', async () => {
    const errors: string[] = [];
    const code = await runPipeline({
      env: VALID_ENV,
      argv: ['--source=manual_csv', '--season=2026-27'],
      createSink: () => new RecordingSink(),
      readFile: () => 'year,round,game_number,home_team,away_team,home_score,away_score\n',
      logError: (line: string) => errors.push(line),
    });
    expect(code).toBe(2);
    expect(errors.join('\n')).toMatch(/--season= does not apply to adapter "manual_csv"/);
  });

  it('manual_csv still works, still defaults, and reports nothing extra', async () => {
    const lines: string[] = [];
    const sink = new RecordingSink();
    const csv = [
      'year,round,game_number,home_team,away_team,home_score,away_score',
      '2027,First Round,1,BOS,PHI,110,100',
      '2027,First Round,2,BOS,PHI,100,110',
      '2027,First Round,3,PHI,BOS,110,100',
      '2027,First Round,4,PHI,BOS,100,110',
      '2027,First Round,5,BOS,PHI,110,100',
      '2027,First Round,6,PHI,BOS,110,100',
    ].join('\n');
    const code = await runPipeline({
      env: VALID_ENV,
      argv: [],
      createSink: () => sink,
      readFile: () => csv,
      log: (line: string) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(sink.births).toHaveLength(1);
    const text = lines.join('\n');
    expect(text).toMatch(/pipeline adapter=manual_csv/);
    expect(text).not.toMatch(/series in feed/);
    expect(text).not.toMatch(/depth histogram/);
    expect(text).not.toMatch(/withheld/);
  });
});

describe('manual_csv adapter deps (Decision 8)', () => {
  it('createManualCsvAdapter without a csvPath fails loudly instead of reading undefined', () => {
    expect(() =>
      createManualCsvAdapter({
        readFile: () => 'unused',
        teamIdByAbbreviation: () => undefined,
      }),
    ).toThrow(/received no csvPath/);
  });
});
