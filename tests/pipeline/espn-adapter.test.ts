// Story 2.13 — the `espn` feed adapter. Most fixtures here are built INLINE (the
// house pattern of Story 2.4's adapter suite, retired by Story 2.16), because a hand-shaped payload
// is what lets a case carry exactly one decoy field. The block at the bottom
// instead reads the VERBATIM captures committed under `tests/pipeline/fixtures/`:
// the shape of a real Game 7 and the population of `teams.espn_code` are facts
// about ESPN's bytes, and an inline fixture can only restate an assumption about
// them. Neither kind of fixture reaches the network, so the suite stays green on
// a runner that has no reason to visit Disney.
//
// Fixture discipline follows `payload-contract.md`: every field the adapter
// reads appears in the shape it is MEASURED in (`state: 'post'`,
// `description: 'Final'`, `notes[0].headline`, `competitors[].homeAway`/`score`,
// `team.abbreviation`), and every field the adapter must NOT read is present
// with a decoy value (`team.id`, `displayName`, `venue.fullName`,
// `type.shortName: '3'`) so a test reddens the moment a parse reaches for it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BACKFILL_DATE_BOUND,
  BACKOFF_MS,
  buildFeed,
  createEspnAdapter,
  deriveRequestDate,
  describeFetchThrow,
  etCalendarDay,
  EXTRA_REQUEST_BUDGET,
  EXTRA_WALL_CLOCK_BUDGET_MS,
  FETCH_TIMEOUT_MS,
  MAX_FEED_ATTEMPTS,
  parseHeadline,
  readSeries,
  SCOREBOARD_ENDPOINT,
  scoreboardUrl,
  shiftDates,
} from '../../supabase/scripts/pipeline/adapters/espn.ts';
import type { CurrentSeriesRow, PlannedBirth, PlannedCompletion } from '../../supabase/scripts/pipeline/plan.ts';
import type { AdapterDeps, FeedFetch, FeedRequestInit, FeedResponseLike } from '../../supabase/scripts/pipeline/port.ts';
import { BIRTH_NEEDED_PREFIX, runPipeline } from '../../supabase/scripts/pipeline/run.ts';
import type { InsightsRefreshCensus, PipelineSink, TeamRow } from '../../supabase/scripts/pipeline/writer.ts';

/**
 * The five codes the inline fixtures need, with their `00005` seed ids: `NY`→
 * Knicks 20 and `SA`→Spurs 27 are DIVERGENCES from `teams.abbreviation` — the
 * reason the abbreviation join is unsafe — and `CLE`/`TOR`/`DEN` are measured
 * agreements. The full 30-row table lives in migration `00018` and the bottom of
 * this file reads it from there, so nothing here has to guess the other 25.
 */
const ESPN_CODES: Record<string, number> = { NY: 20, SA: 27, CLE: 6, TOR: 28, DEN: 8 };

/** The injected `teams` table — `espn_code` filled, `abbreviation` kept as the archive stores it. */
const TEAMS: TeamRow[] = [
  { id: 20, abbreviation: 'NYK', espn_code: 'NY' },
  { id: 27, abbreviation: 'SAS', espn_code: 'SA' },
  { id: 6, abbreviation: 'CLE', espn_code: 'CLE' },
  { id: 28, abbreviation: 'TOR', espn_code: 'TOR' },
  { id: 8, abbreviation: 'DEN', espn_code: 'DEN' },
  // No real franchise stores the abbreviation `NY` — this row exists so that an
  // abbreviation fallback becomes OBSERVABLE rather than unprovable. The deps bag
  // still carries `teamIdByAbbreviation` (Story 2.12's shared shape), so a future
  // edit that reaches for it would resolve `NY` to 41 instead of the Knicks' 20
  // and redden every identity assertion in this file. With the row absent, such
  // an edit would resolve to nothing and the tests would keep passing on the
  // espn_code path while the guard they claim to prove quietly stopped existing.
  { id: 41, abbreviation: 'NY', espn_code: null },
];

/** A number the seed assigns to a DIFFERENT franchise, for the decoy `team.id`. */
function decoyTeamId(code: string): string {
  const own = ESPN_CODES[code] ?? 1;
  return String(((own * 7) % 30) + 1);
}

/** The pinned run instant: the amended 07:30 UTC cron, on the measured Finals day. */
const RUN_INSTANT = new Date('2026-06-06T07:30:00Z');

/** One game in the feed. `code` values are ESPN's provider codes. */
interface FixtureGame {
  /** `events[].date` exactly as measured (`…T23:00Z`, `…T00:30Z`). */
  date?: string;
  state?: string;
  description?: string;
  /** `competitions[0].notes[0].headline`. `null` builds the measured-absence case with no notes. */
  headline?: string | null;
  home?: string;
  away?: string;
  homeScore?: unknown;
  awayScore?: unknown;
  /** Feed the away competitor first: row order must not change the row this yields. */
  reverseSides?: boolean;
  /** Swap the `homeAway` LABELS between the two codes: the same pair, the venue reversed. */
  swapSides?: boolean;
  /** Keep `competitions[0].type.shortName` — which the measured payload does NOT carry. */
  shortName?: string;
}

/** A measured Finals Game 7 between the two divergent codes — the shape this adapter admits. */
const GAME_SEVEN: FixtureGame = {
  date: '2026-06-06T00:30Z',
  headline: 'NBA Finals - Game 7',
  home: 'NY',
  away: 'SA',
  homeScore: 115,
  awayScore: 105,
};

/** A measured-form Game 2 — the same series, the shape this adapter excludes BY RULE. */
const GAME_TWO: FixtureGame = {
  date: '2026-04-20T23:00Z',
  headline: 'East 1st Round - Game 2',
  home: 'CLE',
  away: 'TOR',
  homeScore: 115,
  awayScore: 105,
};

function espnEvent(game: FixtureGame): Record<string, unknown> {
  const home = game.home ?? 'NY';
  const away = game.away ?? 'SA';
  const competitor = (code: string, side: 'home' | 'away', score: unknown) => ({
    homeAway: side,
    score,
    team: {
      id: decoyTeamId(code),
      abbreviation: code,
      // `displayName` is the nickname (`Knicks`), which the contract forbids as
      // an identity; `location` is the city, forbidden the same way.
      displayName: code === 'NY' ? 'Knicks' : code === 'SA' ? 'Spurs' : code,
      location: code === 'NY' ? 'New York' : 'Somewhere',
    },
  });
  // `undefined` means "the fixture's default"; an explicit `null` or a non-number
  // must reach the adapter as written, because a null score is drift it has to
  // refuse rather than silently inherit anything.
  const homeScoreValue = game.homeScore === undefined ? 115 : game.homeScore;
  const awayScoreValue = game.awayScore === undefined ? 105 : game.awayScore;
  const sides = game.swapSides
    ? [competitor(home, 'away', homeScoreValue), competitor(away, 'home', awayScoreValue)]
    : [competitor(home, 'home', homeScoreValue), competitor(away, 'away', awayScoreValue)];
  const competition: Record<string, unknown> = {
    id: '401822617',
    // The measured payload has NO `type.shortName`; a fixture that always
    // carries one would let the adapter read a field the story says is absent.
    ...(game.shortName === undefined ? {} : { type: { shortName: game.shortName } }),
    venue: { fullName: 'Madison Square Garden' },
    competitors: game.reverseSides ? [sides[1], sides[0]] : sides,
  };
  if (game.headline !== null) {
    competition.notes = [{ headline: game.headline ?? 'NBA Finals - Game 7' }];
  }
  return {
    id: '401822617',
    date: game.date ?? '2026-06-06T00:30Z',
    name: 'Game 7',
    season: { year: 2026, type: 4 },
    competitions: [competition],
    status: {
      type: {
        id: 4,
        name: game.state === 'in' ? 'STATUS_IN_PROGRESS' : 'STATUS_FINAL',
        state: game.state ?? 'post',
        description: game.description ?? 'Final',
        completed: game.state !== 'in',
      },
      clock: 'FINAL',
      displayClock: 'FINAL',
      period: 4,
    },
  };
}

/** The scoreboard body: the measured top-level keys, with `leagues`/`provider` unread. */
function feedBody(events: Record<string, unknown>[]): Record<string, unknown> {
  return {
    leagues: [{ id: 10, name: 'NBA', abbreviation: 'nba' }],
    provider: { name: 'ESPN', displayName: 'ESPN' },
    events,
  };
}

const emptyBody = () => feedBody([]);

interface Stubbed {
  urls: string[];
  inits: (FeedRequestInit | undefined)[];
  sleeps: number[];
  fetch: FeedFetch;
}

/**
 * The injected fetch, recording the SECOND argument too so the request contract
 * (headers, timeout signal) is asserted rather than assumed, and the shared
 * `sleeps` array so the backoff is pinned as the VALUES [1000, 4000] rather than
 * as a call count.
 */
function stubFeed(plans: Array<{ status: number; body?: unknown; brokenJson?: boolean; throws?: unknown }>): Stubbed {
  const stub: Stubbed = { urls: [], inits: [], sleeps: [], fetch: async () => ({ ok: false, status: 500, json: async () => undefined }) };
  // Story 2.18: a run now also asks for the PREVIOUS date (and, at a 3–3, a
  // backfill). The plans below describe the run's OWN date — the first one
  // requested — and every other date answers an empty scoreboard, so these
  // Story 2.13 cases keep describing one date and the re-read adds nothing.
  let ownDate: string | null = null;
  let ownCalls = 0;
  stub.fetch = async (url: string, init: FeedRequestInit): Promise<FeedResponseLike> => {
    stub.urls.push(url);
    stub.inits.push(init);
    const dates = new URL(url).searchParams.get('dates');
    ownDate ??= dates;
    if (dates !== ownDate) {
      return { ok: true, status: 200, json: async () => feedBody([]) };
    }
    ownCalls += 1;
    const plan = plans[ownCalls - 1] ?? plans[plans.length - 1];
    if (plan.throws !== undefined) {
      throw plan.throws;
    }
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

function depsFor(stub: Stubbed, overrides: { now?: Date; teams?: TeamRow[] } = {}) {
  const teams = overrides.teams ?? TEAMS;
  return {
    readFile: () => {
      throw new Error('espn deps must not read files');
    },
    teamIdByAbbreviation: (abbreviation: string) => teams.find((team) => team.abbreviation === abbreviation)?.id,
    teamIdByEspnCode: (code: string) => teams.find((team) => team.espn_code === code)?.id,
    fetch: stub.fetch,
    now: () => overrides.now ?? RUN_INSTANT,
    sleep: async (ms: number) => {
      stub.sleeps.push(ms);
    },
  };
}

/** Run one feed through the port and return both row sets plus the run report. */
async function adapterOver(games: FixtureGame[], overrides: { now?: Date; teams?: TeamRow[] } = {}) {
  const stub = stubFeed([{ status: 200, body: feedBody(games.map(espnEvent)) }]);
  const adapter = createEspnAdapter(depsFor(stub, overrides));
  const statuses = await adapter.fetch_series_statuses();
  const scores = await adapter.fetch_game_scores();
  return { statuses, scores, report: adapter.describeRun!(), stub };
}

/** The one thing every fixture here must agree on: the derived single date. */
const DATES = '20260605';

// ---------------------------------------------------------------------------
// CAP-5 — the date a run asks for is the day the games were actually played.
// ---------------------------------------------------------------------------
describe('espn — the request date is derived from the run instant (CAP-5)', () => {
  it('the pinned 07:30 UTC instant asks for the PREVIOUS America/New_York day', () => {
    // 2026-06-06T07:30Z is 03:30 EDT, before that evening's games tip, and the
    // measured game stamped 2026-06-06T00:30Z lives under local June 5.
    expect(deriveRequestDate(RUN_INSTANT)).toBe(DATES);
  });

  it('the date follows the ET calendar, not UTC — the 03:30Z instant is where a UTC-derived date goes wrong', () => {
    expect(deriveRequestDate(RUN_INSTANT)).toBe('20260605');
    expect(deriveRequestDate(RUN_INSTANT)).not.toBe('20260606');
    // At 04:30Z the UTC calendar has already rolled to June 6 while ET is still
    // June 5; the answer must follow ET, not the UTC clock.
    expect(deriveRequestDate(new Date('2026-06-06T04:30:00Z'))).toBe(DATES);
    expect(etCalendarDay(new Date('2026-06-06T04:30:00Z'))).toEqual({ year: 2026, month: 6, day: 6 });
    // The pinned cron instants above cannot distinguish the two clocks: an
    // instant whose ET day is June 6 gives June 5 under BOTH derivations. This
    // one does. At 03:30Z the UTC day is still June 6 (so a UTC reading asks for
    // June 5) while ET is 23:30 on June 5, and the played day the adapter must
    // name is June 4. A run that swapped etCalendarDay for getUTCDate goes RED
    // here and nowhere else in this file.
    expect(etCalendarDay(new Date('2026-06-06T03:30:00Z'))).toEqual({ year: 2026, month: 6, day: 5 });
    expect(deriveRequestDate(new Date('2026-06-06T03:30:00Z'))).toBe('20260604');
  });

  it('it crosses the year boundary by calendar arithmetic, not a hand-written table', () => {
    // Dec 31 backwards from the new year, Feb 28 backwards from March 1, and the
    // 2028 leap day backwards from March 1 — the three crossings a table of
    // month lengths would have to get right and `Date.UTC(y, m - 1, d - 1)`
    // gets right by construction (day 0 rolls back into the previous month).
    expect(deriveRequestDate(new Date('2027-01-01T12:00:00Z'))).toBe('20261231');
    // 05:00Z is 00:00 EST on March 1, so the played day is Feb 28; 04:00Z is
    // still 23:00 on Feb 28, so the played day is Feb 27.
    expect(deriveRequestDate(new Date('2026-03-01T05:00:00Z'))).toBe('20260228');
    expect(deriveRequestDate(new Date('2026-03-01T04:00:00Z'))).toBe('20260227');
    expect(deriveRequestDate(new Date('2028-03-01T05:00:00Z'))).toBe('20280229');
  });

  it('DST does not move the answer: the same ET day yields the same date', () => {
    // 2026-03-08 is the spring-forward day; 07:30Z is 03:30 EDT (already
    // forward-shifted), and the previous ET calendar day is March 7 either way.
    expect(deriveRequestDate(new Date('2026-03-08T07:30:00Z'))).toBe('20260307');
    expect(deriveRequestDate(new Date('2026-11-01T06:30:00Z'))).toBe('20261031');
  });

  it('the URL carries dates=YYYYMMDD and no other date parameter', async () => {
    const { stub } = await adapterOver([GAME_SEVEN]);
    // [Story 2.18: two requests now — the run's own date first, then the
    // previous date's re-read. Both are the single-date form; the pin on the
    // first is unchanged.]
    expect(stub.urls).toHaveLength(2);
    const url = new URL(stub.urls[0]);
    expect(url.origin + url.pathname).toBe(SCOREBOARD_ENDPOINT);
    expect([...url.searchParams.keys()]).toEqual(['dates']);
    expect(url.searchParams.get('dates')).toBe(DATES);
    expect(url.search).toBe(`?dates=${DATES}`);
    expect(stub.urls[1]).toBe(`${SCOREBOARD_ENDPOINT}?dates=20260604`);
  });

  it('the range form is NEVER constructed — the builder refuses anything but one date', () => {
    // Measured: `dates=20260601-20260608` answers 400 with a JSON error body and
    // no `.events`, so a backfill can only be a bounded loop of single-date runs.
    expect(() => scoreboardUrl('20260601-20260608')).toThrowError(/single-date form is the only request shape/);
    expect(() => scoreboardUrl('20260601,20260602')).toThrowError(/single-date form/);
    expect(() => scoreboardUrl('2026-06-05')).toThrowError(/single-date form/);
    expect(() => scoreboardUrl('')).toThrowError(/single-date form/);
    expect(scoreboardUrl(DATES)).toBe(`${SCOREBOARD_ENDPOINT}?dates=${DATES}`);
  });

  it('no key and no Authorization header: the endpoint is unauthenticated (measured)', async () => {
    const { stub } = await adapterOver([GAME_SEVEN]);
    const headers = stub.inits[0]?.headers;
    // Literal names and values on the wire, not a diff against the shipped
    // `ESPN_HEADERS`: comparing the request to the constant that builds it is
    // green whatever that constant drifts into, and the drift is the risk.
    expect(headers).toEqual({
      Accept: 'application/json',
      'User-Agent': 'predictgame7-pipeline/1.0 (+https://ujsolon.github.io/predictgame7/)',
    });
    expect(Object.keys(headers ?? {}).some((name) => /authorization|apikey|token/i.test(name))).toBe(false);
  });

  it('the retry posture is the shipped one: 25s timeout, three attempts, [1000, 4000] backoff', async () => {
    expect(FETCH_TIMEOUT_MS).toBe(25000);
    expect(MAX_FEED_ATTEMPTS).toBe(3);
    expect(BACKOFF_MS).toEqual([1000, 4000]);
    // One sleep per RETRY rather than per attempt: an attempt count raised
    // without the table leaves the last retry unscheduled, and the two
    // constants would still each read as "the shipped one" on their own.
    expect(BACKOFF_MS).toHaveLength(MAX_FEED_ATTEMPTS - 1);
    const failing = stubFeed([{ status: 429 }, { status: 429 }, { status: 429 }]);
    await expect(createEspnAdapter(depsFor(failing)).fetch_series_statuses()).rejects.toThrow(/HTTP 429/);
    expect(failing.sleeps).toEqual([1000, 4000]);
    // Every retry re-issues the SAME single-date request — a retry that widened
    // the date parameter would inflate `feedSeriesCount` behind `--require-feed`.
    expect(failing.urls).toEqual([`${SCOREBOARD_ENDPOINT}?dates=${DATES}`, `${SCOREBOARD_ENDPOINT}?dates=${DATES}`, `${SCOREBOARD_ENDPOINT}?dates=${DATES}`]);
  });

  it('a connection-class throw names its cause, because "fetch failed" alone is not a diagnosis', async () => {
    // Node collapses DNS failure, a refused socket and a TLS refusal into one
    // `TypeError: fetch failed`, with the distinguishing code and message on
    // `error.cause`. This pin exists because the owner's first live probe run
    // (2026-10-04) printed exactly that bare text three times and nothing else:
    // an alarm log that cannot name the failure class is no use for the class
    // Story 2.6's whole egress investigation turned on. The retry posture is
    // asserted in the same run — unwrapping must not change when a run gives up.
    const dnsCause = Object.assign(new Error('getaddrinfo ENOTFOUND site.api.espn.com'), {
      code: 'ENOTFOUND',
      syscall: 'getaddrinfo',
    });
    const failing = stubFeed([
      { status: 200, throws: new TypeError('fetch failed', { cause: dnsCause }) },
      { status: 200, throws: new TypeError('fetch failed', { cause: dnsCause }) },
      { status: 200, throws: new TypeError('fetch failed', { cause: dnsCause }) },
    ]);
    await expect(createEspnAdapter(depsFor(failing)).fetch_series_statuses()).rejects.toThrow(
      /request threw: fetch failed \(ENOTFOUND getaddrinfo ENOTFOUND site\.api\.espn\.com\)/,
    );
    expect(failing.sleeps).toEqual([1000, 4000]);
    expect(failing.urls).toHaveLength(3);
  });

  it('describeFetchThrow keeps the outer message for every cause shape, including none', () => {
    // A bare `throw error.message` is the bug this guards; a bare `cause` dump
    // would be the opposite one — losing the fact that the request never got a
    // response. Both are pinned so neither side can be "simplified" away later.
    expect(describeFetchThrow(new TypeError('fetch failed'))).toBe('fetch failed');
    expect(describeFetchThrow(new TypeError('fetch failed', { cause: new Error('socket hang up') }))).toBe(
      'fetch failed (socket hang up)',
    );
    expect(describeFetchThrow(new TypeError('fetch failed', { cause: 'proxy refused' }))).toBe('fetch failed (proxy refused)');
    expect(describeFetchThrow(new Error('aborted'))).toBe('aborted');
    expect(describeFetchThrow('not an error object')).toBe('not an error object');
    // An Error cause carrying neither a code nor a message is named as empty
    // rather than rendering as `fetch failed ()`.
    expect(describeFetchThrow(new TypeError('fetch failed', { cause: new Error('') }))).toBe(
      'fetch failed (cause carries no code or message)',
    );
  });

  it('a non-retryable status fails at once, naming the URL and refusing a silent fallback', async () => {
    const failing = stubFeed([{ status: 403 }]);
    await expect(createEspnAdapter(depsFor(failing)).fetch_series_statuses()).rejects.toThrow(
      new RegExp(`GET ${SCOREBOARD_ENDPOINT}\\?dates=20260605 failed after 1 attempt\\(s\\): HTTP 403[^\n]*no manual_csv fallback was taken`),
    );
    expect(failing.urls).toHaveLength(1);
    expect(failing.sleeps).toEqual([]);
  });

  it('describeRun() before the feed has resolved throws — the report describes a parse that has not happened', () => {
    const stub = stubFeed([{ status: 200, body: feedBody([espnEvent(GAME_SEVEN)]) }]);
    const adapter = createEspnAdapter(depsFor(stub));
    expect(() => adapter.describeRun!()).toThrow(/before the feed resolved/);
    expect(stub.urls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CAP-4 — round and game number come from what the feed actually prints.
// ---------------------------------------------------------------------------
describe('espn — the headline names the round and the game (CAP-4)', () => {
  it('the two measured headlines parse to canonical labels and game numbers', () => {
    expect(parseHeadline('East 1st Round - Game 2')).toEqual({ depth: 1, round: 'First Round', gameNumber: 2 });
    expect(parseHeadline('NBA Finals - Game 2')).toEqual({ depth: 4, round: 'NBA Finals', gameNumber: 2 });
  });

  it('every conference round phrase maps onto the frozen canonical vocabulary', () => {
    const cases: [string, number, string][] = [
      ['West 1st Round - Game 7', 1, 'First Round'],
      ['East 2nd Round - Game 3', 2, 'Conference Semifinals'],
      ['West Semifinals - Game 4', 2, 'Conference Semifinals'],
      ['East Conference Semifinals - Game 1', 2, 'Conference Semifinals'],
      ['West 3rd Round - Game 5', 3, 'Conference Finals'],
      ['East Finals - Game 6', 3, 'Conference Finals'],
      ['West Conf Finals - Game 7', 3, 'Conference Finals'],
      ['NBA Finals - Game 7', 4, 'NBA Finals'],
    ];
    for (const [headline, depth, round] of cases) {
      expect(parseHeadline(headline), headline).toEqual({ depth, round, gameNumber: Number(headline.slice(-1)) });
    }
  });

  it('a headline that is not the measured form is a rejection naming what it read', () => {
    const parsed = parseHeadline('Knicks vs. Spurs');
    expect('reason' in parsed).toBe(true);
    expect((parsed as { reason: string }).reason).toContain('Knicks vs. Spurs');
  });

  it('a round phrase outside the vocabulary is a rejection, never a new spelling', () => {
    const parsed = parseHeadline('East 4th Round - Game 7');
    expect((parsed as { reason: string }).reason).toMatch(/outside the canonical vocabulary/);
    expect((parsed as { reason: string }).reason).toContain('4th Round');
    // A game number outside a best-of-seven is refused for the same reason.
    expect((parseHeadline('East 1st Round - Game 8') as { reason: string }).reason).toMatch(/outside the 1\.\.7/);
    expect((parseHeadline('East 1st Round - Game 0') as { reason: string }).reason).toMatch(/outside the 1\.\.7/);
  });

  it('a game reaching a row only ever carries a canonical label', async () => {
    const { statuses } = await adapterOver([
      GAME_SEVEN,
      { ...GAME_SEVEN, headline: 'East 1st Round - Game 7', home: 'CLE', away: 'TOR' },
      { ...GAME_SEVEN, headline: 'West Conf Finals - Game 7', home: 'DEN', away: 'SA' },
    ]);
    const canonical = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
    expect(statuses.map((row) => row.round)).toEqual(['NBA Finals', 'First Round', 'Conference Finals']);
    expect(statuses.every((row) => canonical.includes(row.round))).toBe(true);
  });

  it('an absent headline excludes the game and names the exclusion', async () => {
    const { statuses, report } = await adapterOver([{ ...GAME_SEVEN, headline: null }]);
    expect(statuses).toHaveLength(0);
    expect(report.notes).toHaveLength(1);
    expect(report.notes[0]).toMatch(/headline is absent/);
    expect(report.countsLine).toMatch(/1 series in feed/);
  });

  it('a round phrase outside the vocabulary excludes the game and names it', async () => {
    const { statuses, report } = await adapterOver([{ ...GAME_SEVEN, headline: 'East 4th Round - Game 7' }]);
    expect(statuses).toHaveLength(0);
    // The note carries `parseHeadline`'s own reason, so the operator sees which
    // phrase was outside the map rather than being sent at the pattern.
    expect(report.notes[0]).toMatch(/outside the canonical vocabulary/);
    expect(report.notes[0]).toContain('"East 4th Round"');
    expect(report.notes[0]).toMatch(/a new round spelling is never invented/);
  });

  it('a headline in the wrong PATTERN is excluded with the pattern named, not the vocabulary', async () => {
    // SPEC's open question on the First Round headline: if ESPN ever prints the
    // teams instead of the round, the exclusion must say the form was unreadable.
    const { statuses, report } = await adapterOver([{ ...GAME_SEVEN, headline: 'Knicks at Spurs, Game 7' }]);
    expect(statuses).toHaveLength(0);
    expect(report.notes[0]).toMatch(/is not "<round> - Game N"/);
    expect(report.notes[0]).not.toMatch(/outside the canonical vocabulary/);
  });

  it('the parse never reads competitions[].type.shortName — it is absent on the measured payload', async () => {
    // A fixture that carries the field `type.shortName: '4'` AND a headline that
    // says Game 7 must follow the HEADLINE: trusting shortName would be reading
    // a field this story measured as missing.
    const { statuses } = await adapterOver([{ ...GAME_SEVEN, shortName: '4', headline: 'NBA Finals - Game 7' }]);
    expect(statuses).toHaveLength(1);
    expect(statuses[0].round).toBe('NBA Finals');
  });
});

// ---------------------------------------------------------------------------
// CAP-3 — identity is `teams.espn_code`, and nothing else.
// ---------------------------------------------------------------------------
describe('espn — teams.espn_code is the only join key (CAP-3)', () => {
  it('two of the six measured divergences resolve through espn_code to the right rows', async () => {
    const { statuses, scores } = await adapterOver([GAME_SEVEN]);
    // `NY` → the Knicks row (id 20) and `SA` → the Spurs row (id 27). An
    // abbreviation join would find NEITHER, because the table holds NYK/SAS —
    // and would find id 41 for `NY`, the row `TEAMS` carries to make that
    // fallback observable, so these equalities are the proof the join never ran.
    expect(statuses[0]).toMatchObject({ team_a_id: 20, team_b_id: 27 });
    expect(scores[0]).toMatchObject({ home_team_id: 20, away_team_id: 27 });
    expect(statuses[0]).not.toMatchObject({ team_a_id: 41 });
  });

  it('the provider code is never a team.id, a displayName, a city or a nickname', async () => {
    const { scores } = await adapterOver([GAME_SEVEN]);
    expect(scores[0].home_team_id).not.toBe(Number(decoyTeamId('NY')));
    expect(scores[0].away_team_id).not.toBe(Number(decoyTeamId('SA')));
  });

  it('an unresolvable code aborts the run naming the code, and writes nothing', async () => {
    // The fixture uses a code the injected table does not hold. The row the run
    // is asked about is not there, and no match may be guessed into one.
    const stub = stubFeed([{ status: 200, body: feedBody([espnEvent({ ...GAME_SEVEN, home: 'LAL' })]) }]);
    await expect(createEspnAdapter(depsFor(stub)).fetch_series_statuses()).rejects.toThrow(/unknown ESPN team code "LAL"/);
  });

  it('the abort names the code and the date it was asked for, not just "unknown team"', async () => {
    const stub = stubFeed([{ status: 200, body: feedBody([espnEvent({ ...GAME_SEVEN, away: 'PHX' })]) }]);
    let message = '';
    try {
      await createEspnAdapter(depsFor(stub)).fetch_game_scores();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/unknown ESPN team code "PHX"/);
    expect(message).toMatch(/dates=20260605/);
    expect(message).toMatch(/espn_code/);
    expect(message).toMatch(/Refusing to match it by abbreviation, city, nickname or substring/);
  });

  it('an unresolvable code aborts even on a game this run EXCLUDES — the table is read before admission', async () => {
    // The whole point of resolving inside the parse rather than inside the
    // admission branch: a franchise missing from `espn_code` has to surface on
    // the first run that sees it, not on the one run a season later that finally
    // asks for its Game 7. This fixture is a Game 2 — a row this run drops — and
    // the run still aborts naming it.
    const stub = stubFeed([{ status: 200, body: feedBody([espnEvent({ ...GAME_TWO, home: 'LAL' })]) }]);
    await expect(createEspnAdapter(depsFor(stub)).fetch_series_statuses()).rejects.toThrow(/unknown ESPN team code "LAL"/);
  });

  it('it does NOT match NYK by substring to NY — the abbreviation join is not a fallback', async () => {
    // `NYK` is a stored `teams.abbreviation` (id 20). If the resolver fell back
    // to abbreviation equality, or substring-matched, this run would resolve it
    // silently. `NYK` is not a code ESPN prints, so it must abort.
    const stub = stubFeed([{ status: 200, body: feedBody([espnEvent({ ...GAME_SEVEN, home: 'NYK' })]) }]);
    await expect(createEspnAdapter(depsFor(stub)).fetch_series_statuses()).rejects.toThrow(/unknown ESPN team code "NYK"/);
  });

  it('a code outside the 2-4 upper-case shape aborts before the resolver is consulted', async () => {
    const stub = stubFeed([{ status: 200, body: feedBody([espnEvent({ ...GAME_SEVEN, away: 'Golden State' })]) }]);
    await expect(createEspnAdapter(depsFor(stub)).fetch_series_statuses()).rejects.toThrow(/not a 2-4 letter upper-case abbreviation/);
  });

  it('an adapter built without the espn_code resolver refuses instead of falling back', async () => {
    const stub = stubFeed([{ status: 200, body: feedBody([espnEvent(GAME_SEVEN)]) }]);
    const deps: AdapterDeps = { ...depsFor(stub) };
    delete deps.teamIdByEspnCode;
    await expect(createEspnAdapter(deps).fetch_series_statuses()).rejects.toThrow(/without deps\.teamIdByEspnCode/);
  });

  it('the identity YEAR is the event\'s LOCAL date, not the stamp\'s UTC year', async () => {
    // 2027-01-01T03:00Z is 2026-12-31 22:00 in America/New_York: the game was
    // played on 2026-12-31 by the league's own calendar, so that is the year the
    // identity key carries.
    const { statuses } = await adapterOver([{ ...GAME_SEVEN, date: '2027-01-01T03:00Z' }]);
    expect(statuses[0].year).toBe(2026);
  });

  it('a stamp without a zone, or an unreadable date, is shape drift and aborts', async () => {
    const stub = stubFeed([{ status: 200, body: feedBody([espnEvent({ ...GAME_SEVEN, date: '2026-06-06' })]) }]);
    await expect(createEspnAdapter(depsFor(stub)).fetch_series_statuses()).rejects.toThrow(/is not an ISO date-time with a zone/);
  });

  it('a home/away pair that is missing one side aborts naming the event', async () => {
    const oneSided = {
      ...espnEvent(GAME_SEVEN),
      competitions: [{ notes: [{ headline: 'NBA Finals - Game 7' }], competitors: [{ homeAway: 'home', score: 115, team: { abbreviation: 'NY' } }] }],
    };
    const stub = stubFeed([{ status: 200, body: feedBody([oneSided]) }]);
    await expect(createEspnAdapter(depsFor(stub)).fetch_series_statuses()).rejects.toThrow(/exactly two sides are required/);
  });

  it('both sides carrying the same code is refused — a team cannot play itself', async () => {
    const stub = stubFeed([{ status: 200, body: feedBody([espnEvent({ ...GAME_SEVEN, away: 'NY' })]) }]);
    await expect(createEspnAdapter(depsFor(stub)).fetch_series_statuses()).rejects.toThrow(/cannot play itself/);
  });
});

// ---------------------------------------------------------------------------
// CAP-6 / CAP-7 — what is admitted, what is excluded by rule, and what the
// empty-feed alarm counts.
// ---------------------------------------------------------------------------
describe('espn — Final AND game 7 is the whole admission rule (CAP-6, CAP-7)', () => {
  it('a Game 7 final yields one status and one score row with the winner filled', async () => {
    const { statuses, scores, report } = await adapterOver([GAME_SEVEN]);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toEqual({ year: 2026, round: 'NBA Finals', team_a_id: 20, team_b_id: 27, winner_team_id: 20 });
    expect(scores).toHaveLength(1);
    expect(scores[0]).toEqual({
      year: 2026,
      team_a_id: 20,
      team_b_id: 27,
      game_number: 7,
      home_team_id: 20,
      away_team_id: 27,
      home_score: 115,
      away_score: 105,
    });
    expect(report.notes).toHaveLength(0);
  });

  it('a Game 2 final is excluded BY RULE and named — the plan never sees it', async () => {
    const { statuses, scores, report } = await adapterOver([GAME_TWO]);
    expect(statuses).toHaveLength(0);
    expect(scores).toHaveLength(0);
    expect(report.notes).toHaveLength(1);
    expect(report.notes[0]).toMatch(/game 2 of 7/);
    expect(report.notes[0]).toMatch(/East 1st Round - Game 2/);
    expect(report.countsLine).toMatch(/1 final but not game 7/);
  });

  it('an in-progress game is excluded and named even with a plausible score', async () => {
    const { statuses, report } = await adapterOver([{ ...GAME_SEVEN, state: 'in', description: 'In Progress' }]);
    expect(statuses).toHaveLength(0);
    expect(report.notes[0]).toMatch(/only a game the feed itself calls Final\/post is admitted/);
    expect(report.countsLine).toMatch(/1 not final/);
  });

  it('a `pre` status is excluded too — an unobserved string is never defaulted to finished', async () => {
    const { statuses, report } = await adapterOver([{ ...GAME_SEVEN, state: 'pre', description: 'Scheduled' }]);
    expect(statuses).toHaveLength(0);
    expect(report.countsLine).toMatch(/1 not final/);
  });

  it('an unknown status description is excluded, not admitted', async () => {
    const { statuses, report } = await adapterOver([{ ...GAME_SEVEN, description: 'Final (OT)' }]);
    expect(statuses).toHaveLength(0);
    expect(report.notes[0]).toMatch(/is never defaulted to "finished"/);
  });

  it('feedSeriesCount counts every series BEFORE exclusions, so the alarm still reads a non-zero feed', async () => {
    const { report, statuses } = await adapterOver([GAME_TWO, { ...GAME_TWO, home: 'DEN', away: 'SA' }, GAME_SEVEN]);
    // Three distinct pairs in the feed, only one of which is admitted.
    expect(statuses).toHaveLength(1);
    expect(report.feedSeriesCount).toBe(3);
    expect(report.countsLine).toMatch(/^espn: 3 series in feed \(dates=20260605\), 1 Game-7 candidate\(s\) — excluded: /);
  });

  it('an empty feed counts zero — the rest day and a route that answered nothing look identical', async () => {
    const stub = stubFeed([{ status: 200, body: emptyBody() }]);
    const adapter = createEspnAdapter(depsFor(stub));
    expect(await adapter.fetch_series_statuses()).toEqual([]);
    expect(adapter.describeRun!().feedSeriesCount).toBe(0);
    expect(adapter.describeRun!().countsLine).toMatch(/^espn: 0 series in feed \(dates=20260605\), 0 Game-7 candidate\(s\)/);
  });

  it('two games of the same pair on one date count as ONE series', async () => {
    const { report } = await adapterOver([GAME_SEVEN, { ...GAME_SEVEN, headline: 'NBA Finals - Game 6', homeScore: 100, awayScore: 110 }]);
    expect(report.feedSeriesCount).toBe(1);
  });

  it('the competitors array order changes nothing: the pair key sorts, the venue sides do not', async () => {
    // `pairKey` joins the two provider codes SORTED, so a feed that lists the
    // away competitor first still counts as the same series; the emitted ROW
    // must keep the real home/away from `competitors[].homeAway`, not array
    // position — a venue read off index 0 would flip the Game 7 home court.
    const flipped = await adapterOver([{ ...GAME_SEVEN, reverseSides: true }]);
    const normal = await adapterOver([GAME_SEVEN]);
    expect(flipped.statuses).toEqual(normal.statuses);
    expect(flipped.scores).toEqual(normal.scores);
    expect(flipped.scores[0]).toMatchObject({ home_team_id: 20, away_team_id: 27 });
    expect(flipped.report.feedSeriesCount).toBe(1);

    // The leg that actually reads the `.sort()`: array order is invisible to the
    // parser (it selects by `homeAway`), so a venue-order leg could never tell a
    // sorted key from an unsorted one. Here the two events carry the SAME pair
    // with the labels swapped, so the codes reach the key in opposite order —
    // unsorted, `feedSeriesCount` reports a series the table does not hold twice,
    // and `--require-feed` alarms on a feed that is short by one.
    const bothOrders = await adapterOver([GAME_SEVEN, { ...GAME_SEVEN, swapSides: true }]);
    expect(bothOrders.report.feedSeriesCount).toBe(1);
  });

  it('the depth histogram covers every game the parse read, including exclusions', async () => {
    const { report } = await adapterOver([GAME_SEVEN, GAME_TWO]);
    // depth 4 (Finals G7, admitted) and depth 1 (East 1st Round G2, excluded).
    expect(report.histogramLine).toBe('espn depth histogram {1:1, 4:1}');
  });

  it('a tie score on an admitted Final game 7 aborts — every source game must be decided', async () => {
    const stub = stubFeed([{ status: 200, body: feedBody([espnEvent({ ...GAME_SEVEN, awayScore: 115 })]) }]);
    await expect(createEspnAdapter(depsFor(stub)).fetch_series_statuses()).rejects.toThrow(/tie score 115-115/);
  });

  it('a null or non-numeric score on a Final game is drift, not a default', async () => {
    const nullStub = stubFeed([{ status: 200, body: feedBody([espnEvent({ ...GAME_SEVEN, homeScore: null })]) }]);
    await expect(createEspnAdapter(depsFor(nullStub)).fetch_series_statuses()).rejects.toThrow(/home score null is not a final non-negative number/);
    const textStub = stubFeed([{ status: 200, body: feedBody([espnEvent({ ...GAME_SEVEN, awayScore: 'twelve' })]) }]);
    await expect(createEspnAdapter(depsFor(textStub)).fetch_series_statuses()).rejects.toThrow(/away score .* is not a final non-negative number/);
  });

  it('scores printed as bare digit strings are accepted (the port says numbers; the feed has been seen to print both)', async () => {
    const { scores } = await adapterOver([{ ...GAME_SEVEN, homeScore: '115', awayScore: '105' }]);
    expect(scores[0]).toMatchObject({ home_score: 115, away_score: 105 });
  });

  it('a body with no `events` array is drift, retried, then terminal — never "no games"', async () => {
    // The measured `400` error body, and a 200 that is not the scoreboard shape,
    // read the same way: the run refuses rather than reporting an empty feed.
    const failing = stubFeed([{ status: 200, body: { error: 'invalid date range' } }, { status: 200, body: {} }, { status: 200, body: { events: {} } }]);
    await expect(createEspnAdapter(depsFor(failing)).fetch_series_statuses()).rejects.toThrow(/no `events` array/);
    expect(failing.sleeps).toEqual([1000, 4000]);
  });

  it('non-JSON is drift and is retried', async () => {
    const failing = stubFeed([{ status: 200, brokenJson: true }, { status: 200, brokenJson: true }, { status: 200, brokenJson: true }]);
    await expect(createEspnAdapter(depsFor(failing)).fetch_series_statuses()).rejects.toThrow(/not JSON/);
    expect(failing.sleeps).toEqual([1000, 4000]);
  });

  it('drift on the first two attempts then a real payload succeeds — and no manual_csv fallback was taken', async () => {
    const recovering = stubFeed([{ status: 503 }, { status: 200, body: { surprise: true } }, { status: 200, body: feedBody([espnEvent(GAME_SEVEN)]) }]);
    const statuses = await createEspnAdapter(depsFor(recovering)).fetch_series_statuses();
    expect(statuses).toHaveLength(1);
    // [Story 2.18: the three attempts are the run's own date; the fourth request
    // is the previous date's re-read, which answered at once.]
    expect(recovering.urls.filter((url) => url.endsWith(`dates=${DATES}`))).toHaveLength(3);
    expect(recovering.urls).toHaveLength(4);
    expect(recovering.sleeps).toEqual([1000, 4000]);
  });

  it('one run is ONE request per date even though the port is called twice', async () => {
    // [Story 2.18: renamed from "one run is ONE request" — a run now asks its own
    // date and the previous one. The memoisation this pins is unchanged: a
    // second port call adds no request.]
    const { stub, statuses, scores } = await adapterOver([GAME_SEVEN]);
    expect(stub.urls).toHaveLength(2);
    expect(new Set(stub.urls).size).toBe(2);
    expect(statuses).toHaveLength(1);
    expect(scores).toHaveLength(1);
  });

  it('the exclusions are named in notes, never silent: the counts line adds up', async () => {
    const { report } = await adapterOver([
      GAME_SEVEN,
      GAME_TWO,
      { ...GAME_SEVEN, state: 'in', description: 'In Progress', home: 'DEN', away: 'TOR' },
      { ...GAME_SEVEN, headline: null, home: 'SA', away: 'DEN' },
      { ...GAME_SEVEN, headline: 'East 4th Round - Game 7', home: 'TOR', away: 'CLE' },
    ]);
    expect(report.feedSeriesCount).toBe(5);
    expect(report.countsLine).toMatch(/5 series in feed \(dates=20260605\), 1 Game-7 candidate\(s\) — excluded: 1 not final, 1 final but not game 7, 2 unreadable headline/);
    expect(report.notes).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Runner legs: the fake sink records every call, so "zero writes" is an
// assertion. These prove the `espn_code` map is the runner's, that `espn` is
// dispatchable with `--require-feed`, and that the game-7-only source completes
// a stored pending pair through the existing RPC path.
// ---------------------------------------------------------------------------
class FeedSink implements PipelineSink {
  current: CurrentSeriesRow[] = [];
  births: PlannedBirth[] = [];
  completions: PlannedCompletion[] = [];
  calls: string[] = [];

  async readTeams(): Promise<TeamRow[]> {
    this.calls.push('readTeams');
    return TEAMS;
  }
  async readCurrent(): Promise<CurrentSeriesRow[]> {
    this.calls.push('readCurrent');
    return this.current.map((row) => ({ ...row, scores: row.scores.map((score) => ({ ...score })) }));
  }
  async birth(birthOp: PlannedBirth): Promise<string> {
    // Story 2.13's contract: the `espn` shape carries one game (game 7) and
    // `plan.ts` refuses to birth from a partial source, so NO test in this file
    // can reach this method. The 3–3 mirror it used to carry was therefore dead
    // — a birth planned by a widened `plan.ts` would have been written silently
    // into `sink.births` and only noticed by an assertion nobody wrote. It is a
    // tripwire instead: if the shape ever widens, every run here goes red naming
    // the rule that broke. [Story 2.18: the espn source CAN now birth — from a
    // certified six-game backfill, never from a game-7-only source. No fixture
    // in THIS block carries a Game 6 at 3–3, so the tripwire still holds here;
    // the birthing runs use `BackfillSink` at the bottom of this file.]
    this.calls.push('birth');
    throw new Error(
      `fake sink: birth reached for (${birthOp.year}, team ${birthOp.team_a_id} vs ${birthOp.team_b_id}) — no fixture in this block ` +
        'carries a Game 6 at 3–3, and plan.ts must refuse to birth from a game-7-only source (Story 2.13)',
    );
  }
  async complete(completion: PlannedCompletion): Promise<void> {
    this.calls.push('complete');
    // The 00015 RPC's own guards, applied here so no test can plan a write the
    // database would reject.
    const row = this.current.find((candidate) => candidate.id === completion.series_id);
    if (!row) throw new Error(`fake sink: completion for unknown series ${completion.series_id}`);
    if (completion.game.game_number !== 7) throw new Error('pipeline_complete_series: a completion appends game 7');
    const storedPair = new Set([row.team_a_id, row.team_b_id]);
    if (!storedPair.has(completion.game.home_team_id) || !storedPair.has(completion.game.away_team_id)) {
      throw new Error('pipeline_complete_series: game 7 is not between the series pair');
    }
    if (row.winner_team_id !== null) throw new Error('pipeline_complete_series: series is archived');
    const stored = row.scores.map((score) => score.game_number);
    const six = stored.length === 6 && [1, 2, 3, 4, 5, 6].every((n) => stored.includes(n));
    const ties = row.scores.filter((score) => score.home_score === score.away_score).length;
    const teamAWins = row.scores.filter((score) => (score.home_score > score.away_score ? score.home_team_id : score.away_team_id) === row.team_a_id).length;
    if (!six || ties > 0 || teamAWins !== 3) {
      throw new Error(`pipeline_complete_series: not a certified 3-3 pending row ({${stored.join(',')}}, ties ${ties}, team_a ${teamAWins})`);
    }
    this.completions.push(completion);
    row.scores.push({ ...completion.game });
    row.winner_team_id = completion.winner_team_id;
  }
  async refreshInsights(): Promise<InsightsRefreshCensus> {
    this.calls.push('refreshInsights');
    return { total_game_sevens: 1, home_team_wins: 1, game_6_winners_won: 0, average_margin: 10 };
  }
}

const VALID_ENV = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'never-print-this' };

function runnerHarness(
  body: unknown,
  sink: FeedSink,
  argv: string[],
  opts: { env?: Record<string, string | undefined>; now?: Date; source?: string } = {},
) {
  const lines: string[] = [];
  const errors: string[] = [];
  const stub = stubFeed([{ status: 200, body }]);
  const promise = runPipeline({
    env: opts.env ?? VALID_ENV,
    argv: [`--source=${opts.source ?? 'espn'}`, ...argv],
    createSink: () => sink,
    fetch: stub.fetch,
    sleep: async (ms: number) => {
      stub.sleeps.push(ms);
    },
    now: () => opts.now ?? RUN_INSTANT,
    log: (line: string) => lines.push(line),
    logError: (line: string) => errors.push(line),
    readFile: () => {
      throw new Error('espn runner tests must not read files');
    },
  });
  return { lines, errors, stub, promise };
}

/** A stored pending pair: NYK(20)/SAS(27), games 1–6 split 3–3, game 7 hosted by NYK. */
function storedPendingPair(scores?: CurrentSeriesRow['scores']): CurrentSeriesRow {
  return {
    id: 'pending-2026',
    year: 2026,
    team_a_id: 20,
    team_b_id: 27,
    winner_team_id: null,
    scores:
      scores ??
      [
        { game_number: 1, home_team_id: 20, away_team_id: 27, home_score: 110, away_score: 100 },
        { game_number: 2, home_team_id: 20, away_team_id: 27, home_score: 100, away_score: 110 },
        { game_number: 3, home_team_id: 27, away_team_id: 20, home_score: 110, away_score: 100 },
        { game_number: 4, home_team_id: 27, away_team_id: 20, home_score: 100, away_score: 110 },
        { game_number: 5, home_team_id: 20, away_team_id: 27, home_score: 110, away_score: 100 },
        { game_number: 6, home_team_id: 27, away_team_id: 20, home_score: 110, away_score: 100 },
      ],
  };
}

describe('espn through runPipeline', () => {
  it('a stored pending pair plus a game-7 feed writes exactly one completion', async () => {
    const sink = new FeedSink();
    sink.current.push(storedPendingPair());
    const harness = runnerHarness(feedBody([espnEvent(GAME_SEVEN)]), sink, []);
    expect(await harness.promise).toBe(0);
    expect(sink.completions).toHaveLength(1);
    expect(sink.births).toHaveLength(0);
    expect(sink.calls.filter((call) => call === 'birth')).toHaveLength(0);
    expect(sink.current[0].winner_team_id).toBe(20);
    expect(harness.errors.join('')).toBe('');
  });

  it('the run that writes a Game 7 refreshes the insights cache, and the run that writes none does not (Story 2.5 trigger)', async () => {
    // The trigger is `winnerFilled`, computed from the plan — so the new
    // game-7-only completion shape must reach it the same way a seven-row
    // source's completion does, and a rest day must not print a refresh line it
    // did not earn.
    const writing = new FeedSink();
    writing.current.push(storedPendingPair());
    const wrote = runnerHarness(feedBody([espnEvent(GAME_SEVEN)]), writing, []);
    expect(await wrote.promise).toBe(0);
    expect(writing.calls.filter((call) => call === 'refreshInsights')).toHaveLength(1);
    expect(wrote.lines.join('\n')).toMatch(/insights cache refreshed: 3 keys rewritten/);

    const resting = new FeedSink();
    const none = runnerHarness(emptyBody(), resting, []);
    expect(await none.promise).toBe(0);
    expect(resting.calls).not.toContain('refreshInsights');
    expect(none.lines.join('\n')).not.toMatch(/insights cache refreshed/);
  });

  it('--dry-run plans the same completion and issues zero writes', async () => {
    const sink = new FeedSink();
    sink.current.push(storedPendingPair());
    const harness = runnerHarness(feedBody([espnEvent(GAME_SEVEN)]), sink, ['--dry-run']);
    expect(await harness.promise).toBe(0);
    expect(sink.completions).toHaveLength(0);
    expect(sink.calls).toEqual(['readTeams', 'readCurrent']);
    expect(harness.lines.join('\n')).toMatch(/dry-run: 0 rows written/);
  });

  it('the report prints before planning, so an abort during planning still shows the parse', async () => {
    const sink = new FeedSink();
    // [Story 2.18: the abort used to come from a game 7 for a pair NOT on the
    // table. Through the runner that shape is now an alert and an exit 0 (the
    // adapter knows the pair is unborn and leaves the Game 7 out rather than
    // blocking every other completion), so the planning abort here comes from
    // a stored pending row the plan refuses to extend — the property pinned is
    // unchanged: the feed report is on screen when planning aborts.]
    const skewed = storedPendingPair();
    skewed.scores = skewed.scores.map((score) => (score.game_number === 6 ? { ...score, home_score: 100, away_score: 110 } : score));
    sink.current.push(skewed);
    const harness = runnerHarness(feedBody([espnEvent(GAME_SEVEN)]), sink, []);
    expect(await harness.promise).toBe(2);
    expect(sink.calls).not.toContain('birth');
    expect(sink.calls).not.toContain('complete');
    const text = harness.lines.join('\n');
    expect(text).toMatch(/espn: 1 series in feed \(dates=20260605\), 1 Game-7 candidate\(s\)/);
    expect(harness.errors.join('\n')).toMatch(/is pending on the table but its stored games 1–6 split 4-2/);
  });

  it('the second identical run changes nothing — the archive branch skips it', async () => {
    const sink = new FeedSink();
    sink.current.push(storedPendingPair());
    expect(await runnerHarness(feedBody([espnEvent(GAME_SEVEN)]), sink, []).promise).toBe(0);
    expect(sink.completions).toHaveLength(1);
    const replay = runnerHarness(feedBody([espnEvent(GAME_SEVEN)]), sink, []);
    expect(await replay.promise).toBe(0);
    expect(sink.completions).toHaveLength(1);
    expect(replay.lines.join('\n')).toMatch(/already archived with identical games 1–7/);
  });

  it('a game-7-only feed for a stored pair whose games 1–6 are not a 3–3 refuses — no completion', async () => {
    const sink = new FeedSink();
    const skewed = storedPendingPair();
    // Game 6 goes back to team_a (id 20 away at home id 27), making the stored
    // split 4-2 — a pending row the RPC would never certify, which the
    // game-7-only path must refuse exactly as loudly as the full-source path.
    skewed.scores = skewed.scores.map((score) =>
      score.game_number === 6 ? { ...score, home_score: 100, away_score: 110 } : score,
    );
    sink.current.push(skewed);
    const harness = runnerHarness(feedBody([espnEvent(GAME_SEVEN)]), sink, []);
    expect(await harness.promise).toBe(2);
    expect(sink.completions).toHaveLength(0);
    expect(harness.errors.join('\n')).toMatch(/stored games 1–6 split 4-2 rather than the 3–3/);
  });

  it('a rest day under --require-feed is red naming the adapter, and green without the flag', async () => {
    const alarmedSink = new FeedSink();
    const alarmed = runnerHarness(emptyBody(), alarmedSink, ['--require-feed']);
    expect(await alarmed.promise).toBe(2);
    expect(alarmed.errors.join('\n')).toMatch(/--require-feed: espn returned 0 series/);
    // Story 2.16 strengthened this twin to carry what the deleted run.test.ts
    // originals pinned: the counts line reached the log (the alarm throws right
    // after printing it, and nothing prints after the throw), and the red came
    // before planning and writing — no readCurrent, no write.
    expect(alarmed.lines.join('\n')).toMatch(/^espn: 0 series in feed \(dates=\d{8}\)/m);
    // [Story 2.18: `readCurrent` now runs BEFORE the adapter (the stored-pair
    // check the backfill needs), so it precedes the alarm. Still no write.]
    expect(alarmedSink.calls).toEqual(['readTeams', 'readCurrent']);

    const quietSink = new FeedSink();
    const quiet = runnerHarness(emptyBody(), quietSink, []);
    expect(await quiet.promise).toBe(0);
    expect(quietSink.calls).toEqual(['readTeams', 'readCurrent']);
    expect(quiet.lines.join('\n')).toMatch(/plan: 0 birth\(s\), 0 completion\(s\), 0 skip\(s\)/);
  });

  it('a feed whose every game is excluded is still a non-zero feed: the alarm passes', async () => {
    const harness = runnerHarness(feedBody([espnEvent(GAME_TWO)]), new FeedSink(), ['--require-feed']);
    expect(await harness.promise).toBe(0);
    expect(harness.lines.join('\n')).toMatch(/1 final but not game 7/);
  });

  it('an unresolvable code reddens the run before any write and names the code', async () => {
    const sink = new FeedSink();
    sink.current.push(storedPendingPair());
    const harness = runnerHarness(feedBody([espnEvent({ ...GAME_SEVEN, away: 'UTA' })]), sink, []);
    expect(await harness.promise).toBe(2);
    expect(harness.errors.join('\n')).toMatch(/unknown ESPN team code "UTA"/);
    // [Story 2.18: `readCurrent` now precedes the adapter; still no write.]
    expect(sink.calls).toEqual(['readTeams', 'readCurrent']);
  });

  it('the scheduled source refuses a missing credential before it reaches the network', async () => {
    // Story 2.6's post-mortem hinge: on a secret rotation every scheduled run
    // must fail naming the VARIABLE and touch nothing else. The credential guard
    // runs before the adapter, so the pinned evidence is that no fetch was
    // attempted at all — a run that asked ESPN first and failed after would
    // spend the egress the workflow is supposed to conserve, and would report a
    // feed problem where there is none.
    const sink = new FeedSink();
    sink.current.push(storedPendingPair());
    const noKey = runnerHarness(feedBody([espnEvent(GAME_SEVEN)]), sink, ['--require-feed'], {
      env: { SUPABASE_URL: 'https://example.supabase.co' },
    });
    expect(await noKey.promise).toBe(2);
    const keyText = noKey.errors.join('\n');
    expect(keyText).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(keyText).not.toMatch(/never-print-this/);
    expect(noKey.stub.urls).toEqual([]);
    expect(sink.calls).toEqual([]);

    const noUrl = runnerHarness(feedBody([espnEvent(GAME_SEVEN)]), new FeedSink(), ['--require-feed'], {
      env: { SUPABASE_SERVICE_ROLE_KEY: 'never-print-this' },
    });
    expect(await noUrl.promise).toBe(2);
    expect(noUrl.errors.join('\n')).toMatch(/SUPABASE_URL/);
    expect(noUrl.stub.urls).toEqual([]);
  });

  it('--require-feed with manual_csv still refuses up front, now that espn is the recommended source', async () => {
    const harness = runnerHarness(emptyBody(), new FeedSink(), ['--require-feed'], { source: 'manual_csv' });
    expect(await harness.promise).toBe(2);
    expect(harness.errors.join('\n')).toMatch(/use --source=espn/);
  });

  it('a flag espn does not understand refuses the run (ADAPTER_FLAGS)', async () => {
    // Story 2.16: `--csv=` rather than the retired `--season=`, which is now an
    // unrecognised flag refused before adapter selection (run.test.ts pins that).
    const harness = runnerHarness(emptyBody(), new FeedSink(), ['--csv=operator.csv']);
    expect(await harness.promise).toBe(2);
    expect(harness.errors.join('\n')).toMatch(/--csv= does not apply to adapter "espn"/);
    expect(harness.errors.join('\n')).toMatch(/Flags this adapter understands: none/);
  });

  it('the whole POSTSEASON window of a fixture day plans every admitted game 7 and aborts on none', async () => {
    const sink = new FeedSink();
    sink.current.push(storedPendingPair());
    const secondPair = storedPendingPair();
    secondPair.id = 'pending-cle-tor';
    secondPair.year = 2026;
    secondPair.team_a_id = 6;
    secondPair.team_b_id = 28;
    secondPair.scores = secondPair.scores.map((score) => ({
      ...score,
      home_team_id: score.home_team_id === 20 ? 6 : 28,
      away_team_id: score.away_team_id === 27 ? 28 : 6,
    }));
    sink.current.push(secondPair);
    const body = feedBody([
      espnEvent(GAME_SEVEN),
      espnEvent({ ...GAME_SEVEN, headline: 'East 1st Round - Game 7', home: 'CLE', away: 'TOR' }),
      espnEvent(GAME_TWO),
    ]);
    const harness = runnerHarness(body, sink, ['--require-feed']);
    expect(await harness.promise).toBe(0);
    expect(sink.completions).toHaveLength(2);
    expect(sink.births).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The committed captures. Everything above is a hand-shaped payload; this block
// reads ESPN's own bytes and migration `00018`'s own SQL, so the story's two
// load-bearing claims — what an admitted Game 7 looks like, and which code sits
// on which `teams` row — are proven against the measurement they came from
// instead of against an assumption that happens to agree with itself.
// ---------------------------------------------------------------------------

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/** One captured response body, verbatim. */
function readCapture(file: string): unknown {
  return JSON.parse(readRepoFile(`./fixtures/${file}`));
}

/** The franchise object as the teams capture prints it — `name` is the nickname. */
interface CapturedTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  name: string;
}

function capturedTeams(): CapturedTeam[] {
  const body = readCapture('espn-teams-site-20261004.json') as {
    sports: { leagues: { teams: { team: CapturedTeam }[] }[] }[];
  };
  return body.sports[0].leagues[0].teams.map((entry) => entry.team);
}

/** `00018` as written on disk: every `UPDATE teams SET espn_code = 'X' WHERE id = N;`. */
function migrationSeed(): { byCode: Map<string, number>; statements: number } {
  const sql = readRepoFile('../../supabase/migrations/00018_teams_espn_code.sql');
  const byCode = new Map<string, number>();
  let statements = 0;
  for (const row of sql.matchAll(/UPDATE teams SET espn_code = '([A-Z]{2,4})'\s+WHERE id = (\d+);/g)) {
    statements += 1;
    byCode.set(row[1], Number(row[2]));
  }
  return { byCode, statements };
}

/** The `00005` seed's 30 modern rows, read out of the migration that wrote them. */
function modernTeamRows(): { id: number; full_name: string; abbreviation: string; nickname: string }[] {
  const sql = readRepoFile('../../supabase/migrations/00005_release_1_data_model.sql');
  const start = sql.indexOf('INSERT INTO teams (id, full_name, abbreviation, city, nickname)');
  const block = sql.slice(start, sql.indexOf('ON CONFLICT (id)', start));
  const rows: { id: number; full_name: string; abbreviation: string; nickname: string }[] = [];
  for (const row of block.matchAll(/^\s*\((\d+), '([^']+)', '([^']+)', '([^']+)', '([^']+)'\),?$/gm)) {
    rows.push({ id: Number(row[1]), full_name: row[2], abbreviation: row[3], nickname: row[5] });
  }
  return rows;
}

/**
 * The table a scheduled run resolves against: `00005`'s rows carrying `00018`'s
 * codes. Built from the migrations rather than restated here, so the replay
 * below exercises the production mapping — a code keyed on the wrong id reddens
 * both this table's users and the transcription audit.
 */
const SEEDED_TEAMS: TeamRow[] = (() => {
  const codeById = new Map<number, string>();
  for (const [code, id] of migrationSeed().byCode) codeById.set(id, code);
  return modernTeamRows().map((row) => ({
    id: row.id,
    abbreviation: row.abbreviation,
    espn_code: codeById.get(row.id) ?? null,
  }));
})();

async function replayCapture(file: string, dates: string) {
  const stub = stubFeed([{ status: 200, body: readCapture(file) }]);
  const result = await buildFeed(scoreboardUrl(dates), dates, depsFor(stub, { teams: SEEDED_TEAMS }));
  return { stub, ...result };
}

describe('espn — the committed captures replay offline against the 00018 seed', () => {
  it('00018 puts every captured code on the franchise the capture names it for', () => {
    const { byCode, statements } = migrationSeed();
    const teams = capturedTeams();
    expect(teams).toHaveLength(30);
    expect(statements).toBe(30);
    expect(byCode.size).toBe(30);
    const stored = new Map(modernTeamRows().map((row) => [row.id, row]));

    // The franchise is checked by its NICKNAME, the one name field both sides
    // spell identically: ESPN's `displayName` is `LA Clippers` where `00005`
    // stores `Los Angeles Clippers`, which is exactly why this column exists and
    // why the adapter contains no name, city or substring path at all.
    const misplaced: string[] = [];
    for (const team of teams) {
      const row = stored.get(byCode.get(team.abbreviation) ?? -1);
      misplaced.push(
        row
          ? row.nickname === team.name
            ? ''
            : `${team.abbreviation}: ${row.id} is ${row.full_name}, not ESPN's "${team.displayName}"`
          : `${team.abbreviation} ("${team.displayName}"): 00018 seeds no teams row`,
      );
    }
    expect(misplaced.filter((line) => line !== '')).toEqual([]);

    // The 24/6 split, re-measured from the capture rather than carried as a
    // comment: `payload-contract.md` had four of these as "assumed to agree",
    // and the assumption is what made three probe rounds fail.
    const divergences = teams
      .map((team) => ({ espn: team.abbreviation, stored: stored.get(byCode.get(team.abbreviation) ?? -1)?.abbreviation }))
      .filter((pair) => pair.stored !== pair.espn)
      .map((pair) => `${pair.espn}→${pair.stored}`)
      .sort();
    expect(divergences).toEqual(['GS→GSW', 'NO→NOP', 'NY→NYK', 'SA→SAS', 'UTAH→UTA', 'WSH→WAS']);
  });

  it('the seed covers ids 1-30 and nothing else, which is what 00018\'s guards assume', () => {
    const ids = [...migrationSeed().byCode.values()].sort((left, right) => left - right);
    expect(ids).toEqual(Array.from({ length: 30 }, (_unused, index) => index + 1));
    expect(SEEDED_TEAMS.filter((team) => team.espn_code !== null)).toHaveLength(30);
  });

  it('the captured 2025-05-03 Game 7 replays into exactly one status and one score', async () => {
    const { stub, statuses, scores, report } = await replayCapture('espn-scoreboard-20250503-game7.json', '20250503');
    expect(stub.urls).toEqual(['https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20250503']);
    // DEN 120 / LAC 101: the two codes resolve through espn_code to `00005`'s
    // Nuggets 8 and Clippers 13, and the home side both slots and wins.
    expect(statuses).toEqual([{ year: 2025, round: 'First Round', team_a_id: 8, team_b_id: 13, winner_team_id: 8 }]);
    expect(scores).toEqual([
      { year: 2025, team_a_id: 8, team_b_id: 13, game_number: 7, home_team_id: 8, away_team_id: 13, home_score: 120, away_score: 101 },
    ]);
    expect(report.feedSeriesCount).toBe(1);
    expect(report.countsLine).toBe(
      'espn: 1 series in feed (dates=20250503), 1 Game-7 candidate(s) — excluded: 0 not final, 0 final but not game 7, 0 unreadable headline',
    );
    expect(report.histogramLine).toBe('espn depth histogram {1:1}');
    expect(report.notes).toEqual([]);
  });

  it('the captured 2025-05-04 feed admits the Game 7 whose away side won and names the Game 1 it drops', async () => {
    const { statuses, scores, report } = await replayCapture('espn-scoreboard-20250504-mixed.json', '20250504');
    // HOU 89 / GS 103 — `team_a` is game 7's HOME side and the HOME side LOST, so
    // `winner_team_id` is `team_b_id`: review P1's slot-order case, in ESPN's own
    // bytes rather than a fixture built to match the code.
    expect(statuses).toEqual([{ year: 2025, round: 'First Round', team_a_id: 11, team_b_id: 10, winner_team_id: 10 }]);
    expect(scores).toEqual([
      { year: 2025, team_a_id: 11, team_b_id: 10, game_number: 7, home_team_id: 11, away_team_id: 10, home_score: 89, away_score: 103 },
    ]);
    // Both events count toward the feed BEFORE either exclusion — the property
    // `--require-feed` rests on. The Game 1 is dropped, and said out loud.
    expect(report.feedSeriesCount).toBe(2);
    expect(report.countsLine).toBe(
      'espn: 2 series in feed (dates=20250504), 1 Game-7 candidate(s) — excluded: 0 not final, 1 final but not game 7, 0 unreadable headline',
    );
    expect(report.histogramLine).toBe('espn depth histogram {1:1, 2:1}');
    expect(report.notes).toHaveLength(1);
    expect(report.notes[0]).toContain(
      'espn: excluded 2025-05-04 CLE/IND — post/Final, headline "East Semifinals - Game 1" — game 1 of 7.',
    );
  });
});

// ---------------------------------------------------------------------------
// Story 2.18 — the scheduled run births a series at 3–3. Every case below
// replays the 2026-10-06 spike payloads committed under
// `tests/pipeline/fixtures/espn-backfill-2025/` (plus the two Story 2.13
// captures for the Game 7 dates) through an injected fetch keyed on `dates=`.
// A date with no committed payload answers an empty scoreboard, the shape a
// rest day has. No case reaches the network.
//
// Fixture facts used below (all read off the payloads): DEN–LAC 2025 West 1st
// Round, games 1–6 on 0419/0421/0424/0426/0429/0501, Game 1 at DEN; GS–HOU,
// games 1–6 on 0420/0423/0426/0428/0430/0502, Game 1 at HOU; their Game 7s on
// 0503 (DEN 120–101) and 0504 (HOU 89–103 GS). Seed ids: DEN 8, LAC 13,
// GS 10, HOU 11.
// ---------------------------------------------------------------------------

type ScoreboardBody = { events: Record<string, unknown>[] } & Record<string, unknown>;
type PageEdit = (body: ScoreboardBody) => ScoreboardBody | 'throw';

const DEN = 8;
const LAC = 13;
const GS = 10;
const HOU = 11;

/** A committed payload for one date, freshly parsed (so an edit never leaks between cases); `null` when none is committed. */
function payloadFor(dates: string): ScoreboardBody | null {
  const file =
    dates === '20250503'
      ? 'espn-scoreboard-20250503-game7.json'
      : dates === '20250504'
        ? 'espn-scoreboard-20250504-mixed.json'
        : `espn-backfill-2025/scoreboard-${dates}.json`;
  try {
    return JSON.parse(readRepoFile(`./fixtures/${file}`)) as ScoreboardBody;
  } catch {
    return null;
  }
}

/** The injected fetch: `dates=` → the committed payload, through an optional per-date edit; every asked date is logged. */
function fixtureFeed(edits: Record<string, PageEdit> = {}) {
  const asked: string[] = [];
  const fetch: FeedFetch = async (url) => {
    const dates = new URL(url).searchParams.get('dates') ?? '';
    asked.push(dates);
    let body: ScoreboardBody = payloadFor(dates) ?? { events: [] };
    const edit = edits[dates];
    if (edit) {
      const edited = edit(body);
      if (edited === 'throw') {
        throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }) });
      }
      body = edited;
    }
    return { ok: true, status: 200, json: async () => body };
  };
  return { asked, fetch };
}

function codesOf(event: Record<string, unknown>): string[] {
  const competition = (event.competitions as Record<string, unknown>[])[0];
  return (competition.competitors as { team: { abbreviation: string } }[]).map((side) => side.team.abbreviation).sort();
}

/** The one event of a pair on a payload — the edits below reach into it by codes, never by index. */
function pairEvent(body: ScoreboardBody, left: string, right: string): Record<string, unknown> {
  const event = body.events.find((candidate) => codesOf(candidate).join('|') === [left, right].sort().join('|'));
  if (!event) throw new Error(`fixture: no ${left}/${right} event on this payload`);
  return event;
}

function competitionOf(event: Record<string, unknown>): Record<string, unknown> {
  return (event.competitions as Record<string, unknown>[])[0];
}

/** The days of a walk: `from` back to `to`, inclusive, as `YYYYMMDD`. */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let current = from; current >= to; current = shiftDates(current, -1)) out.push(current);
  return out;
}

/** Games 1–6 as the payloads print them, in `team_a` = Game 1 home orientation. */
const DEN_LAC_GAMES: CurrentSeriesRow['scores'] = [
  { game_number: 1, home_team_id: DEN, away_team_id: LAC, home_score: 112, away_score: 110 },
  { game_number: 2, home_team_id: DEN, away_team_id: LAC, home_score: 102, away_score: 105 },
  { game_number: 3, home_team_id: LAC, away_team_id: DEN, home_score: 117, away_score: 83 },
  { game_number: 4, home_team_id: LAC, away_team_id: DEN, home_score: 99, away_score: 101 },
  { game_number: 5, home_team_id: DEN, away_team_id: LAC, home_score: 131, away_score: 115 },
  { game_number: 6, home_team_id: LAC, away_team_id: DEN, home_score: 111, away_score: 105 },
];
const GS_HOU_GAMES: CurrentSeriesRow['scores'] = [
  { game_number: 1, home_team_id: HOU, away_team_id: GS, home_score: 85, away_score: 95 },
  { game_number: 2, home_team_id: HOU, away_team_id: GS, home_score: 109, away_score: 94 },
  { game_number: 3, home_team_id: GS, away_team_id: HOU, home_score: 104, away_score: 93 },
  { game_number: 4, home_team_id: GS, away_team_id: HOU, home_score: 109, away_score: 106 },
  { game_number: 5, home_team_id: HOU, away_team_id: GS, home_score: 131, away_score: 116 },
  { game_number: 6, home_team_id: GS, away_team_id: HOU, home_score: 107, away_score: 115 },
];

function pendingRow(id: string, teamA: number, teamB: number, games: CurrentSeriesRow['scores']): CurrentSeriesRow {
  return { id, year: 2025, team_a_id: teamA, team_b_id: teamB, winner_team_id: null, scores: games.map((game) => ({ ...game })) };
}

function withoutWinner(scores: PlannedBirth['scores'] | undefined) {
  return (scores ?? []).map(({ winner_team_id: _winner, ...score }) => score);
}

/**
 * The fake sink for the birthing runs: the seeded 30-franchise table, and the
 * guards `pipeline_birth_series` / `pipeline_complete_series` assert server-side
 * (00015), so no case here can plan a write the database would reject.
 */
class BackfillSink implements PipelineSink {
  current: CurrentSeriesRow[] = [];
  births: PlannedBirth[] = [];
  completions: PlannedCompletion[] = [];
  calls: string[] = [];

  async readTeams(): Promise<TeamRow[]> {
    this.calls.push('readTeams');
    return SEEDED_TEAMS;
  }
  async readCurrent(): Promise<CurrentSeriesRow[]> {
    this.calls.push('readCurrent');
    return this.current.map((row) => ({ ...row, scores: row.scores.map((score) => ({ ...score })) }));
  }
  async birth(birthOp: PlannedBirth): Promise<string> {
    this.calls.push('birth');
    const numbers = birthOp.scores.map((score) => score.game_number).sort();
    if (numbers.join(',') !== '1,2,3,4,5,6') throw new Error(`pipeline_birth_series: games ${numbers.join(',')} are not exactly 1..6`);
    const gameOne = birthOp.scores.find((score) => score.game_number === 1);
    if (gameOne?.home_team_id !== birthOp.team_a_id) throw new Error('pipeline_birth_series: team_a is not game 1 home');
    const teamAWins = birthOp.scores.filter((score) => score.winner_team_id === birthOp.team_a_id).length;
    if (teamAWins !== 3) throw new Error(`pipeline_birth_series: not 3-3 (team_a ${teamAWins})`);
    const clash = this.current.some(
      (row) => row.year === birthOp.year && new Set([row.team_a_id, row.team_b_id, birthOp.team_a_id, birthOp.team_b_id]).size === 2,
    );
    if (clash) throw new Error('pipeline_birth_series: the pair is already stored');
    const id = `born-${this.births.length + 1}`;
    this.births.push(birthOp);
    this.current.push({
      id,
      year: birthOp.year,
      team_a_id: birthOp.team_a_id,
      team_b_id: birthOp.team_b_id,
      winner_team_id: null,
      scores: withoutWinner(birthOp.scores),
    });
    return id;
  }
  async complete(completion: PlannedCompletion): Promise<void> {
    this.calls.push('complete');
    const row = this.current.find((candidate) => candidate.id === completion.series_id);
    if (!row) throw new Error(`fake sink: completion for unknown series ${completion.series_id}`);
    if (row.winner_team_id !== null) throw new Error('pipeline_complete_series: series is archived');
    if (completion.game.game_number !== 7) throw new Error('pipeline_complete_series: a completion appends game 7');
    const teamAWins = row.scores.filter(
      (score) => (score.home_score > score.away_score ? score.home_team_id : score.away_team_id) === row.team_a_id,
    ).length;
    if (row.scores.length !== 6 || teamAWins !== 3) throw new Error('pipeline_complete_series: not a certified 3-3 pending row');
    this.completions.push(completion);
    row.scores.push({ ...completion.game });
    row.winner_team_id = completion.winner_team_id;
  }
  async refreshInsights(): Promise<InsightsRefreshCensus> {
    this.calls.push('refreshInsights');
    return { total_game_sevens: 161, home_team_wins: 118, game_6_winners_won: 60, average_margin: 10.9 };
  }
}

interface BackfillRunOptions {
  sink?: BackfillSink;
  edits?: Record<string, PageEdit>;
  budget?: AdapterDeps['extraFetchBudget'];
  clock?: () => number;
}

async function runBackfill(now: string, argv: string[] = [], opts: BackfillRunOptions = {}) {
  const sink = opts.sink ?? new BackfillSink();
  const feed = fixtureFeed(opts.edits);
  const lines: string[] = [];
  const errors: string[] = [];
  const code = await runPipeline({
    env: VALID_ENV,
    argv: ['--source=espn', ...argv],
    createSink: () => sink,
    fetch: feed.fetch,
    sleep: async () => {},
    now: () => new Date(now),
    extraFetchBudget: opts.budget,
    monotonicNow: opts.clock,
    log: (line: string) => lines.push(line),
    logError: (line: string) => errors.push(line),
    readFile: () => {
      throw new Error('espn runner tests must not read files');
    },
  });
  return {
    code,
    sink,
    lines,
    text: lines.join('\n'),
    errors: errors.join('\n'),
    asked: feed.asked,
    alerts: lines.filter((line) => line.startsWith(BIRTH_NEEDED_PREFIX)),
  };
}

/** Runs at 07:30 UTC, the cron's instant: each reads the previous America/New_York day. */
const RUN_0502 = '2025-05-02T07:30:00Z'; // run date 20250501 (DEN–LAC G6), re-read 20250430
const RUN_0503 = '2025-05-03T07:30:00Z'; // run date 20250502 (GS–HOU G6), re-read 20250501 (DEN–LAC G6)
const RUN_0504 = '2025-05-04T07:30:00Z'; // run date 20250503 (DEN–LAC G7), re-read 20250502 (GS–HOU G6)
const RUN_0505 = '2025-05-05T07:30:00Z'; // run date 20250504 (GS–HOU G7 + CLE–IND G1), re-read 20250503 (DEN–LAC G7)

/** The DEN–LAC walk: its Game 6 date, then back to Game 1's date — 13 dates in all, as the spike measured. */
const DEN_LAC_WALK = datesBetween('20250501', '20250419');

describe('Story 2.18 — the scheduled run births a series at 3–3', () => {
  it("the bounds are the spec's: 21 dates per walk, 25 extra requests and 3 minutes per run", () => {
    expect(BACKFILL_DATE_BOUND).toBe(21);
    expect(EXTRA_REQUEST_BUDGET).toBe(25);
    expect(EXTRA_WALL_CLOCK_BUDGET_MS).toBe(180_000);
    expect(shiftDates('20250301', -1)).toBe('20250228');
    expect(shiftDates('20250101', -1)).toBe('20241231');
  });

  it('Birth: a DEN–LAC Game 6 at 3–3 with nothing stored births one six-game series, team_a = DEN', async () => {
    const run = await runBackfill(RUN_0502);
    expect(run.code).toBe(0);
    expect(run.errors).toBe('');
    expect(run.alerts).toEqual([]);
    expect(run.sink.births).toHaveLength(1);
    const birth = run.sink.births[0];
    expect(birth).toMatchObject({ year: 2025, round: 'First Round', team_a_id: DEN, team_b_id: LAC, followup: null });
    expect(withoutWinner(birth.scores)).toEqual(DEN_LAC_GAMES);
    // The report names the birth, in codes and in the plan line.
    expect(run.text).toMatch(/espn: birth source assembled — 2025 DEN–LAC First Round: games 1–6 certified .*Game 1 home DEN → team_a/);
    expect(run.text).toMatch(/^BIRTH {5}\(2025, team 8 vs 13\): one series row \+ 6 score rows$/m);
    expect(run.text).toMatch(/wrote birth \(2025, team 8 vs 13\) as series born-1/);
    // The walk is the spike's: Game 6's date (the run's own), then back to Game 1.
    expect(run.asked).toEqual(DEN_LAC_WALK);
    // A birth fills no winner, so no refresh.
    expect(run.sink.calls).not.toContain('refreshInsights');
  });

  it('Shared backfill + re-read: two births in one run, and no date is requested twice', async () => {
    const run = await runBackfill(RUN_0503);
    expect(run.code).toBe(0);
    expect(run.alerts).toEqual([]);
    expect(run.sink.births).toHaveLength(2);
    expect(run.sink.births.map((birth) => [birth.team_a_id, birth.team_b_id]).sort((left, right) => left[0] - right[0])).toEqual([
      [DEN, LAC],
      [HOU, GS],
    ]);
    expect(withoutWinner(run.sink.births.find((birth) => birth.team_a_id === HOU)?.scores)).toEqual(GS_HOU_GAMES);
    expect(withoutWinner(run.sink.births.find((birth) => birth.team_a_id === DEN)?.scores)).toEqual(DEN_LAC_GAMES);
    // The fetch log: every date once, and exactly the union of the two walks.
    expect(new Set(run.asked).size).toBe(run.asked.length);
    expect([...run.asked].sort()).toEqual(datesBetween('20250502', '20250419').sort());
    expect(run.asked.length - 1).toBeLessThanOrEqual(EXTRA_REQUEST_BUDGET);
    expect(run.text).toMatch(/espn extra requests: 13 of a 25-date budget/);
  });

  it('Already stored: a pending DEN–LAC row, in either slot order, means no backfill request for the pair', async () => {
    for (const [teamA, teamB] of [
      [DEN, LAC],
      [LAC, DEN],
    ]) {
      const sink = new BackfillSink();
      sink.current.push(pendingRow('den-lac', teamA, teamB, DEN_LAC_GAMES));
      const run = await runBackfill(RUN_0502, [], { sink });
      expect(run.code).toBe(0);
      // The run's own date and the re-read — nothing walked.
      expect(run.asked).toEqual(['20250501', '20250430']);
      expect(run.sink.births).toHaveLength(0);
      expect(run.alerts).toEqual([]);
      expect(run.text).toMatch(/2025 DEN–LAC Game 6 .* the pair is already stored; no backfill/);
    }
  });

  it('Already stored is per YEAR: an archived DEN–LAC row from 2020 does not stop the 2025 birth', async () => {
    // `readCurrent` returns every season's rows, so a pair that met in an
    // earlier Game 7 is on the table. Dropping the year from `isPairStored`
    // would skip this birth with only a note (review finding, 2026-10-06).
    const sink = new BackfillSink();
    sink.current.push({
      ...pendingRow('den-lac-2020', DEN, LAC, DEN_LAC_GAMES),
      year: 2020,
      winner_team_id: DEN,
    });
    const run = await runBackfill(RUN_0502, [], { sink });
    expect(run.code).toBe(0);
    expect(run.alerts).toEqual([]);
    expect(run.text).not.toMatch(/already stored/);
    expect(run.asked).toEqual(DEN_LAC_WALK);
    expect(run.sink.births).toHaveLength(1);
    expect(run.sink.births[0]).toMatchObject({ year: 2025, team_a_id: DEN, team_b_id: LAC });
  });

  it('the next morning: a re-read Game 6 of a pair the previous run birthed is a note — no walk, no alert', async () => {
    // The common path: DEN–LAC was born from 20250501 yesterday, and today's
    // run re-reads that date. Only GS–HOU (the run's own Game 6) is walked.
    const sink = new BackfillSink();
    sink.current.push(pendingRow('den-lac', DEN, LAC, DEN_LAC_GAMES));
    const run = await runBackfill(RUN_0503, [], { sink });
    expect(run.code).toBe(0);
    expect(run.alerts).toEqual([]);
    expect(run.text).toMatch(/2025 DEN–LAC Game 6 .* the pair is already stored; no backfill/);
    expect(run.sink.births.map((birth) => [birth.team_a_id, birth.team_b_id])).toEqual([[HOU, GS]]);
    // GS–HOU's walk ends at its Game 1 (20250420); DEN–LAC's Game 1 date is never asked.
    expect([...run.asked].sort()).toEqual(datesBetween('20250502', '20250420').sort());
    expect(new Set(run.asked).size).toBe(run.asked.length);
  });

  it('a red run still prints its BIRTH NEEDED lines: the alerts precede the --require-feed refusal', async () => {
    // Empty run date (alarm red) plus a re-read 3–3 whose backfill has a gap.
    // The workflow collector runs on always(), so both issues get filed only
    // if the alert line reaches the log before the throw.
    const run = await runBackfill(RUN_0503, ['--require-feed'], {
      edits: { '20250502': () => ({ events: [] }), '20250424': () => ({ events: [] }) },
    });
    expect(run.code).toBe(2);
    expect(run.errors).toMatch(/--require-feed: espn returned 0 series/);
    expect(run.alerts).toHaveLength(1);
    expect(run.alerts[0]).toMatch(/^BIRTH NEEDED: espn: 2025 DEN–LAC \(Game 6 on dates=20250501, re-read\)/);
    expect(run.alerts[0]).toMatch(/game\(s\) 3 were not found/);
    expect(run.sink.births).toHaveLength(0);
  });

  it('Not 3–3: a Game 6 that ended the series 4–2, or a Game 5, starts no backfill and raises no alert', async () => {
    // 20250501 without DEN–LAC leaves NY–DET's Game 6, which NY won 4–2.
    const decided = await runBackfill(RUN_0502, [], {
      edits: { '20250501': (body) => ({ ...body, events: body.events.filter((event) => !codesOf(event).includes('DEN')) }) },
    });
    expect(decided.code).toBe(0);
    expect(decided.asked).toEqual(['20250501', '20250430']);
    expect(decided.alerts).toEqual([]);
    expect(decided.sink.births).toHaveLength(0);
    expect(decided.text).toMatch(/2025 DET–NY Game 6 .* the series was decided 2-4 at game 6; no birth/);

    // 20250429 is a Game 5 night (DEN–LAC 3–2 among them).
    const gameFive = await runBackfill('2025-04-30T07:30:00Z');
    expect(gameFive.code).toBe(0);
    expect(gameFive.asked).toEqual(['20250429', '20250428']);
    expect(gameFive.alerts).toEqual([]);
    expect(gameFive.sink.births).toHaveLength(0);
  });

  it('Backfill gap: Game 3 unreachable within 21 dates — no birth, a "birth needed" alert naming DEN–LAC, exit 0', async () => {
    const run = await runBackfill(RUN_0502, [], { edits: { '20250424': () => ({ events: [] }) } });
    expect(run.code).toBe(0);
    expect(run.sink.births).toHaveLength(0);
    expect(run.alerts).toHaveLength(1);
    expect(run.alerts[0]).toMatch(
      /^BIRTH NEEDED: espn: 2025 DEN–LAC \(Game 6 on dates=20250501, the run date\) stands 3–3 with no stored row/,
    );
    expect(run.alerts[0]).toMatch(/game\(s\) 3 were not found as Final, headline-numbered games of this pair within 21 dates/);
    expect(run.alerts[0]).toMatch(/docs\/PLAYOFF_RUNBOOK\.md/);
    // The walk ran its whole bound — Game 6's date plus 20 more — and stopped.
    expect(run.asked).toEqual(datesBetween('20250501', '20250411'));
    expect(run.asked).toHaveLength(BACKFILL_DATE_BOUND);
    // Other work proceeds: the plan ran and the run applied it.
    expect(run.text).toMatch(/^applied: 0 birth\(s\), 0 completion\(s\), 0 skip\(s\)$/m);
  });

  it('Missing `series`: a Final Game 6 without competitions[0].series is no birth, and the alert names the field', async () => {
    const run = await runBackfill(RUN_0502, [], {
      edits: {
        '20250501': (body) => {
          delete competitionOf(pairEvent(body, 'DEN', 'LAC')).series;
          return body;
        },
      },
    });
    expect(run.code).toBe(0);
    expect(run.sink.births).toHaveLength(0);
    expect(run.asked).toEqual(['20250501', '20250430']);
    expect(run.alerts).toHaveLength(1);
    expect(run.alerts[0]).toMatch(/2025 DEN–LAC .* competitions\[0\]\.series is absent, so the 3–3 cannot be read/);
  });

  it('Previous-date G7: a Game 7 on the re-read date is ignored — completions come from the run date only', async () => {
    // Owner decision 2026-10-06 (Story 2.18 review): the re-read is for births
    // only, so yesterday's Game 7 never reaches the planner again and a red run
    // always means the run's own date. Here DEN–LAC's Game 7 (20250503) is on
    // the re-read page and stays pending; GS–HOU's (20250504) is the run date's.
    const sink = new BackfillSink();
    sink.current.push(pendingRow('den-lac', DEN, LAC, DEN_LAC_GAMES), pendingRow('gs-hou', HOU, GS, GS_HOU_GAMES));
    const run = await runBackfill(RUN_0505, [], { sink });
    expect(run.code).toBe(0);
    expect(run.alerts).toEqual([]);
    expect(run.sink.completions.map((completion) => [completion.series_id, completion.winner_team_id])).toEqual([['gs-hou', GS]]);
    expect(run.text).toMatch(/espn re-read dates=20250503 \(the previous date, births only; .*\): 1 event\(s\), 0 Game-6 signal\(s\), 1 Game 7\(s\) ignored/);
    expect(run.text).toMatch(/plan: 0 birth\(s\), 1 completion\(s\), 0 skip\(s\)/);
    // The same run again: the run date's Game 7 skips, and DEN–LAC is still not planned.
    const replay = await runBackfill(RUN_0505, [], { sink });
    expect(replay.code).toBe(0);
    expect(replay.sink.completions).toHaveLength(1);
    expect(replay.text).toMatch(/plan: 0 birth\(s\), 0 completion\(s\), 1 skip\(s\)/);
  });

  it('a re-read Game 7 that would disagree with its archived row cannot redden the run', async () => {
    // The risk the narrowing removes: DEN–LAC archived with a Game 7 score the
    // feed does not carry (an overnight correction, or a curated row). Read on
    // its own date this is red by design; read as yesterday it is ignored.
    const sink = new BackfillSink();
    sink.current.push({
      ...pendingRow('den-lac', DEN, LAC, [
        ...DEN_LAC_GAMES,
        { game_number: 7, home_team_id: DEN, away_team_id: LAC, home_score: 120, away_score: 99 },
      ]),
      winner_team_id: DEN,
    });
    const run = await runBackfill(RUN_0505, [], { sink });
    expect(run.code).toBe(0);
    expect(run.errors).toBe('');
    expect(run.text).not.toMatch(/source disagrees/);
  });

  it('a Game 7 whose pair was never born is an alert, not a red run — the other completion still lands', async () => {
    // RUN_0504: the run date (20250503) carries DEN–LAC's Game 7 (stored) and
    // the re-read (20250502) GS–HOU's Game 6, which births; so the never-born
    // case is built from RUN_0505 with only DEN–LAC stored and its Game 7
    // carried onto the run date's page beside GS–HOU's.
    const sink = new BackfillSink();
    sink.current.push(pendingRow('den-lac', DEN, LAC, DEN_LAC_GAMES));
    const run = await runBackfill(RUN_0505, [], {
      sink,
      edits: {
        '20250504': (body) => {
          const seven = (payloadFor('20250503') as ScoreboardBody).events[0];
          return { ...body, events: [...body.events, seven] };
        },
      },
    });
    expect(run.code).toBe(0);
    expect(run.sink.completions.map((completion) => completion.series_id)).toEqual(['den-lac']);
    expect(run.alerts).toHaveLength(1);
    expect(run.alerts[0]).toMatch(/2025 GS–HOU Game 7 .* has no stored row and no birth was assembled for it this run/);
  });

  it('a Game 7 seen beside its re-read 3–3 Game 6 births seven games: birth plus follow-up, one orientation', async () => {
    // DEN–LAC's Game 7 carried onto the 20250502 page, so the run that re-reads
    // its Game 6 (20250501) also sees its Game 7.
    const run = await runBackfill(RUN_0503, [], {
      edits: {
        '20250502': (body) => {
          const seven = (payloadFor('20250503') as ScoreboardBody).events[0];
          return { ...body, events: [...body.events, seven] };
        },
      },
    });
    expect(run.code).toBe(0);
    expect(run.alerts).toEqual([]);
    const denLac = run.sink.births.find((birth) => birth.team_a_id === DEN);
    expect(denLac?.followup?.winner_team_id).toBe(DEN);
    expect(denLac?.followup?.game).toMatchObject({ game_number: 7, home_team_id: DEN, away_team_id: LAC, home_score: 120, away_score: 101 });
    expect(run.sink.completions.map((completion) => completion.team_a_id)).toEqual([DEN]);
    expect(run.text).toMatch(/2025 DEN–LAC Game 7 .* folded into its birth/);
    expect(run.sink.calls).toContain('refreshInsights');
  });

  it('Alarm independence: an empty run date with games on the re-read date still counts 0, so --require-feed stays red', async () => {
    const run = await runBackfill(RUN_0503, ['--require-feed'], { edits: { '20250502': () => ({ events: [] }) } });
    expect(run.code).toBe(2);
    expect(run.text).toMatch(/^espn: 0 series in feed \(dates=20250502\)/m);
    expect(run.errors).toMatch(/--require-feed: espn returned 0 series/);
    expect(run.sink.births).toHaveLength(0);
    // The re-read did run (and found DEN–LAC) — it just never counts.
    expect(run.text).toMatch(/espn re-read dates=20250501 \(the previous date, births only; never counted in feedSeriesCount\)/);
  });

  it('Dry-run: the same detection, backfill and plan are printed, and nothing is written', async () => {
    const live = await runBackfill(RUN_0503);
    const dry = await runBackfill(RUN_0503, ['--dry-run']);
    expect(dry.code).toBe(0);
    expect(dry.asked).toEqual(live.asked);
    expect(dry.sink.calls).toEqual(['readTeams', 'readCurrent']);
    expect(dry.text.match(/^BIRTH {5}/gm)).toHaveLength(2);
    expect(dry.text).toMatch(/dry-run: 0 rows written/);
    expect(dry.text).toMatch(/birth source assembled — 2025 DEN–LAC/);
    expect(dry.text).toMatch(/birth source assembled — 2025 GS–HOU/);
  });

  it('Per-team wins (C2): series.competitors is joined on team.id, so reversing its order changes nothing', async () => {
    // GS–HOU's Game 1 standing, as printed: HOU (home, id "10") 0, GS (away, id "9") 1.
    const gameOne = pairEvent(payloadFor('20250420') as ScoreboardBody, 'GS', 'HOU');
    const series = competitionOf(gameOne).series as { competitors: unknown[] };
    expect(readSeries(series, '10', '9')).toMatchObject({ kind: 'read', homeWins: 0, awayWins: 1, completed: false });
    expect(readSeries({ ...series, competitors: [...series.competitors].reverse() }, '10', '9')).toMatchObject({ homeWins: 0, awayWins: 1 });

    // End to end: every page's `series.competitors` reversed — a positional
    // read would now see every standing flipped and refuse both births.
    const reverseAll: PageEdit = (body) => {
      for (const event of body.events) {
        const standing = competitionOf(event).series as { competitors?: unknown[] } | undefined;
        if (standing?.competitors) standing.competitors = [...standing.competitors].reverse();
      }
      return body;
    };
    const edits = Object.fromEntries(datesBetween('20250502', '20250419').map((dates) => [dates, reverseAll]));
    const run = await runBackfill(RUN_0503, [], { edits });
    expect(run.alerts).toEqual([]);
    expect(run.sink.births).toHaveLength(2);
    expect(withoutWinner(run.sink.births.find((birth) => birth.team_a_id === HOU)?.scores)).toEqual(GS_HOU_GAMES);
  });

  it('Headline unreadable (C3): a 3–3 Game 6 with no headline still births; a headline naming another game alerts', async () => {
    const noHeadline = await runBackfill(RUN_0502, [], {
      edits: {
        '20250501': (body) => {
          delete competitionOf(pairEvent(body, 'DEN', 'LAC')).notes;
          return body;
        },
      },
    });
    expect(noHeadline.code).toBe(0);
    expect(noHeadline.alerts).toEqual([]);
    expect(noHeadline.sink.births).toHaveLength(1);
    // The round comes from games 1–5's headlines.
    expect(noHeadline.sink.births[0]).toMatchObject({ round: 'First Round', team_a_id: DEN, team_b_id: LAC });

    const wrongGame = await runBackfill(RUN_0502, [], {
      edits: {
        '20250501': (body) => {
          competitionOf(pairEvent(body, 'DEN', 'LAC')).notes = [{ headline: 'West 1st Round - Game 5' }];
          return body;
        },
      },
    });
    expect(wrongGame.code).toBe(0);
    expect(wrongGame.sink.births).toHaveLength(0);
    expect(wrongGame.asked).toEqual(['20250501', '20250430']);
    expect(wrongGame.alerts).toHaveLength(1);
    expect(wrongGame.alerts[0]).toMatch(
      /2025 DEN–LAC .* its headline names game 5, but competitions\[0\]\.series stands 3–3 and not completed/,
    );
  });

  it('Progression mismatch (C4): one backfilled game whose own standing disagrees with the scores refuses the birth', async () => {
    // DEN–LAC Game 3 (LAC won, so LAC 2–1): print it as DEN 2–1 instead.
    const run = await runBackfill(RUN_0502, [], {
      edits: {
        '20250424': (body) => {
          const standing = competitionOf(pairEvent(body, 'DEN', 'LAC')).series as { competitors: { id: string; wins: number }[] };
          for (const entry of standing.competitors) entry.wins = entry.id === '7' ? 2 : 1;
          return body;
        },
      },
    });
    expect(run.code).toBe(0);
    expect(run.sink.births).toHaveLength(0);
    expect(run.alerts).toHaveLength(1);
    expect(run.alerts[0]).toMatch(
      /2025 DEN–LAC .* game 3 \(2025-04-24 LAC\/DEN .*\): its own series standing reads LAC 1–2 DEN, but the scores of games 1–3 give LAC 2–1 DEN/,
    );
  });

  it('Budget and isolation (C1): a backfill date that throws costs only that series — the run-date completion lands, exit 0', async () => {
    const sink = new BackfillSink();
    sink.current.push(pendingRow('den-lac', DEN, LAC, DEN_LAC_GAMES));
    // Run date 20250503 completes DEN–LAC; the re-read (20250502) finds GS–HOU
    // at 3–3, whose Game 5 date (20250430) throws on every attempt.
    const run = await runBackfill(RUN_0504, [], { sink, edits: { '20250430': () => 'throw' } });
    expect(run.code).toBe(0);
    expect(run.sink.completions.map((completion) => completion.series_id)).toEqual(['den-lac']);
    expect(run.sink.births).toHaveLength(0);
    expect(run.sink.calls).toContain('refreshInsights');
    expect(run.alerts).toHaveLength(2);
    expect(run.alerts[0]).toMatch(
      /dates=20250430 \(backfill for 2025 GS–HOU\) could not be read — GET .* failed after 3 attempt\(s\): request threw: fetch failed \(ETIMEDOUT/,
    );
    expect(run.alerts[1]).toMatch(/2025 GS–HOU .* game\(s\) 5 were not found/);
    // The failed date was asked three times (the retry posture) and never again.
    expect(run.asked.filter((dates) => dates === '20250430')).toHaveLength(3);
  });

  it('Budget (C1): a spent request or wall-clock budget stops the walk, alerts the unfinished series, and still completes', async () => {
    let now = 0;
    const cases: { budget?: AdapterDeps['extraFetchBudget']; clock?: () => number; reason: RegExp }[] = [
      { budget: { requests: 4, wallClockMs: EXTRA_WALL_CLOCK_BUDGET_MS }, reason: /the per-run budget of 4 extra request\(s\) is spent/ },
      // Each clock read advances 60 s; the default 180 s budget then refuses
      // a date a few reads in.
      {
        clock: () => {
          now += 60_000;
          return now;
        },
        reason: /wall-clock budget of 180 s for extra requests is spent/,
      },
    ];
    for (const { budget, clock, reason } of cases) {
      const sink = new BackfillSink();
      sink.current.push(pendingRow('den-lac', DEN, LAC, DEN_LAC_GAMES));
      const run = await runBackfill(RUN_0504, [], { sink, budget, clock });
      expect(run.code).toBe(0);
      expect(run.sink.completions.map((completion) => completion.series_id)).toEqual(['den-lac']);
      expect(run.sink.births).toHaveLength(0);
      expect(run.alerts).toHaveLength(1);
      expect(run.alerts[0]).toMatch(/2025 GS–HOU .* were not found/);
      expect(run.alerts[0]).toMatch(reason);
      expect(run.asked.length).toBeLessThan(13);
    }
  });

  it("Backfill page noise (C5): another pair's Game 7 and 3–3 Game 6 on a walked date are ignored entirely", async () => {
    const run = await runBackfill(RUN_0502, [], {
      edits: {
        '20250426': (body) => {
          const gsHouSeven = pairEvent(payloadFor('20250504') as ScoreboardBody, 'GS', 'HOU');
          const gsHouSix = pairEvent(payloadFor('20250502') as ScoreboardBody, 'GS', 'HOU');
          return { ...body, events: [...body.events, gsHouSeven, gsHouSix] };
        },
      },
    });
    expect(run.code).toBe(0);
    expect(run.alerts).toEqual([]);
    // Only DEN–LAC is born; nothing is completed; GS–HOU is never walked.
    expect(run.sink.births.map((birth) => [birth.team_a_id, birth.team_b_id])).toEqual([[DEN, LAC]]);
    expect(run.sink.calls).not.toContain('complete');
    expect(run.asked).toEqual(DEN_LAC_WALK);
    // …and not counted: the feed is still the run date's two series.
    expect(run.text).toMatch(/^espn: 2 series in feed \(dates=20250501\)/m);
  });
});
