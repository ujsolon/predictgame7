/**
 * Story 2.4 — the `nba_com` adapter: the automated source Story 2.1's spike
 * proved (unkeyed `leaguegamelog` with real per-game home/away scores and
 * historical depth), implemented behind Story 2.3's `SeriesDataSource` port.
 *
 * One unkeyed HTTP request per run (Decision 1) fetches the derived
 * postseason's team-side game log; both port methods read that single cached
 * parse, so a run never fans out against a Cloudflare-fronted route whose
 * rate limits are unmeasured. The parse reconstructs games (two team rows
 * merged on `(GAME_DATE, unordered pair)`) and series (games grouped by team
 * pair, numbered by date order), and hands the runner exactly the port's two
 * row shapes. No runner logic, no schema change, no writes here — writes stay
 * the runner's job.
 *
 * Rules inherited from the spike's decision record:
 * - season derives from the run's UTC date (Jan–Jun → previous calendar year;
 *   `--season=` overrides) — a fetch parameter only, never a stored phase
 *   (AD-4: phase is derived from `winner_team_id`, never from dates);
 * - `year` is the calendar year of `GAME_DATE`, never `SEASON_ID`;
 * - `game_number` follows date order, never the `GAME_ID` suffix;
 * - `MATCHUP`'s home form is `"HOME vs. AWAY"` — the trailing period is load
 *   bearing; naive `' vs '` splitting shatters real series (spike hazard 3);
 * - slots: `team_a` = game 1's home team (Decision 4 — what `epics.md:368`
 *   wants without a seed field the feed does not carry);
 * - Game-7 series only (Decision 3): exactly {1..6} decided split 3–3, or
 *   exactly {1..7} all decided; everything else is excluded and counted;
 * - a game whose `GAME_DATE` equals the run's UTC date is never consumed
 *   (Decision 5 — `leaguegamelog` has no final/unfinal status);
 * - failure posture (Decision 6): 25s timeout, three attempts with backoff
 *   on 403/429/5xx or a body that is not the expected `resultSets` shape,
 *   then a loud failure naming URL and status — never a `manual_csv` fallback.
 *
 * The frozen archive (owner decision 2026-10-01, Decision 11): this adapter
 * fetches exactly one postseason, so a year already archived cannot enter the
 * plan; `--season=` drills that disagree with stored rows land on Story 2.3's
 * archive guard, which aborts rather than rewrite.
 */
import type { AdapterDeps, AdapterFetchResponse, AdapterRunReport, GameScoreRow, SeriesDataSource, SeriesStatusRow } from '../port.ts';
import { deriveChainDepths, roundLabelForDepth, type ChainSeries } from './rounds.ts';

export class NbaComError extends Error {}

/** The spike's header set, copied verbatim — unkeyed, so nothing here is a secret. */
const NBA_STATS_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

const GAMELOG_BASE = 'https://stats.nba.com/stats/leaguegamelog';

/** Decision 1's URL: one request per run, team-side rows, current postseason only. */
export function gameLogUrl(season: string): string {
  const params = new URLSearchParams({
    Counter: '1000',
    DateFrom: '',
    DateTo: '',
    GameSegment: '',
    LastNGames: '0',
    LeagueID: '00',
    Location: '',
    Month: '0',
    OpponentTeamID: '0',
    Outcome: '',
    PORound: '0',
    Period: '0',
    PlayerOrTeam: 'T',
    Season: season,
    SeasonSegment: '',
    SeasonType: 'Playoffs',
    SortColumn: 'DATE',
    SortDir: 'ASC',
  });
  return `${GAMELOG_BASE}?${params.toString()}`;
}

const SEASON_PATTERN = /^\d{4}-\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const REQUEST_TIMEOUT_MS = 25000;
const ATTEMPTS = 3;
/** Sleeps between attempts 1→2 and 2→3 (Decision 6's backoff). */
const BACKOFF_MS = [1000, 4000];

const REQUIRED_COLUMNS = ['GAME_ID', 'GAME_DATE', 'TEAM_ID', 'TEAM_ABBREVIATION', 'MATCHUP', 'PTS', 'WL'] as const;

/**
 * Decision 2: the postseason of season `Y-1`–`Y` is played in calendar year
 * `Y`, so Jan–Jun belongs to the season that started last year and Jul–Dec to
 * the one starting this year. An offseason run therefore asks for a season
 * with no playoff games, gets zero rows, and plans nothing. This is a fetch
 * parameter only — nothing stored or derived from a date (AD-4).
 */
export function deriveSeason(runDate: Date): string {
  const year = runDate.getUTCFullYear();
  const seasonStart = runDate.getUTCMonth() <= 5 ? year - 1 : year;
  const seasonEnd = String((seasonStart + 1) % 100).padStart(2, '0');
  return `${seasonStart}-${seasonEnd}`;
}

function retryableStatus(status: number): boolean {
  return status === 403 || status === 429 || status >= 500;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A body that is not the expected `resultSets` shape is retryable per Decision 6. */
class FeedShapeError extends Error {}

interface RawFeed {
  index: Record<string, number>;
  rows: unknown[][];
}

function extractRawFeed(body: unknown, url: string): RawFeed {
  const resultSets = (body as { resultSets?: unknown })?.resultSets;
  if (!Array.isArray(resultSets) || resultSets.length === 0) {
    throw new FeedShapeError(`${url}: response is not the expected { resultSets: [...] } shape`);
  }
  const first = resultSets[0] as { headers?: unknown; rowSet?: unknown };
  if (!Array.isArray(first?.headers) || !Array.isArray(first?.rowSet)) {
    throw new FeedShapeError(`${url}: resultSets[0] carries no headers/rowSet arrays`);
  }
  const index: Record<string, number> = Object.fromEntries(first.headers.map((header, position) => [header, position]));
  const missing = REQUIRED_COLUMNS.filter((column) => index[column] === undefined);
  if (missing.length > 0) {
    throw new FeedShapeError(`${url}: resultSets[0] headers are missing ${missing.join(', ')}`);
  }
  return { index, rows: first.rowSet as unknown[][] };
}

async function fetchFeed(deps: AdapterDeps, url: string): Promise<RawFeed> {
  const doFetch = deps.fetch ?? ((feedUrl: string, init: { headers: Record<string, string>; signal: AbortSignal }) => globalThis.fetch(feedUrl, init));
  const sleep = deps.sleep ?? defaultSleep;
  let lastFailure = 'no attempt ran';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(BACKOFF_MS[attempt - 2]);
    let response: AdapterFetchResponse;
    try {
      response = await doFetch(url, { headers: { ...NBA_STATS_HEADERS }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      lastFailure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      continue;
    }
    if (!response.ok) {
      if (!retryableStatus(response.status)) {
        throw new NbaComError(
          `${url} -> HTTP ${response.status} — the feed refused this run. No manual_csv fallback is ever selected; ` +
            'unset SERIES_SOURCE (or pass --source=manual_csv) to use the floor deliberately.',
        );
      }
      lastFailure = `HTTP ${response.status}`;
      continue;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      lastFailure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      continue;
    }
    try {
      return extractRawFeed(body, url);
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      continue;
    }
  }
  throw new NbaComError(
    `${url} -> failed after ${ATTEMPTS} attempts (${lastFailure}). The feed is refused or malformed; no manual_csv ` +
      'fallback is ever selected — unset SERIES_SOURCE (or pass --source=manual_csv) to use the floor deliberately.',
  );
}

interface TeamSide {
  abbr?: string;
  id?: number;
  pts?: number | null;
}

interface FeedGame {
  gameId: string;
  date: string;
  home: TeamSide;
  away: TeamSide;
}

interface FeedSeries {
  key: string;
  year: number;
  /** Games in date order; `game_number` is the 1-based position in this list. */
  games: FeedGame[];
}

function parseMatchup(matchup: string, gameId: string): { own: string; other: string; isAway: boolean } {
  const atIndex = matchup.indexOf(' @ ');
  if (atIndex >= 0) {
    return { own: matchup.slice(0, atIndex).trim(), other: matchup.slice(atIndex + 3).trim(), isAway: true };
  }
  // The home form carries the trailing period — "HOME vs. AWAY". Matching the
  // period is what keeps the two-row merge from shattering a real series.
  const vsIndex = matchup.indexOf(' vs. ');
  if (vsIndex >= 0) {
    return { own: matchup.slice(0, vsIndex).trim(), other: matchup.slice(vsIndex + 5).trim(), isAway: false };
  }
  throw new NbaComError(
    `${gameId}: MATCHUP "${matchup}" is neither "TEAM vs. TEAM" nor "TEAM @ TEAM" — the feed shape drifted`,
  );
}

function requireNumeric(value: unknown, column: string, gameId: string): number {
  const parsed = Number(value);
  if (value === null || value === undefined || !Number.isFinite(parsed)) {
    throw new NbaComError(`${gameId}: ${column} is not a number (got ${JSON.stringify(value)}) — the feed shape drifted`);
  }
  return parsed;
}

/** Merge the two team rows of every game on (GAME_DATE, unordered team pair). */
function buildGames(raw: RawFeed): FeedGame[] {
  const { index: i, rows } = raw;
  const games = new Map<string, FeedGame>();
  for (const row of rows) {
    const gameId = String(row[i.GAME_ID]);
    const date = String(row[i.GAME_DATE]);
    if (!DATE_PATTERN.test(date)) {
      throw new NbaComError(`${gameId}: GAME_DATE "${date}" is not YYYY-MM-DD — the feed shape drifted`);
    }
    const teamId = requireNumeric(row[i.TEAM_ID], 'TEAM_ID', gameId);
    const matchup = String(row[i.MATCHUP]);
    const { own, other, isAway } = parseMatchup(matchup, gameId);
    if (own === '' || other === '') {
      throw new NbaComError(`${gameId}: MATCHUP "${matchup}" parses to an empty team name — the feed shape drifted`);
    }
    const key = `${date}|${[own, other].sort().join('|')}`;
    let game = games.get(key);
    if (!game) {
      game = { gameId, date, home: {}, away: {} };
      games.set(key, game);
    } else if (game.gameId !== gameId) {
      throw new NbaComError(
        `${game.gameId}/${gameId}: two different games share ${date} and the teams ${own}/${other} — cannot merge the feed`,
      );
    }
    const side: TeamSide = isAway ? game.away : game.home;
    const opponent: TeamSide = isAway ? game.home : game.away;
    // A side the *other* row already named is a placeholder, not a claim: the
    // merge must survive either row arriving first (the spike's two-row
    // merge, where only the real row carries id and PTS).
    if (side.id !== undefined) {
      throw new NbaComError(`${gameId}: two rows claim the same ${isAway ? 'away' : 'home'} side of ${date} ${own} vs ${other}`);
    }
    if (side.abbr !== undefined && side.abbr !== own) {
      throw new NbaComError(`${gameId}: rows on ${date} disagree on who is ${isAway ? 'away' : 'home'} (${side.abbr} vs ${own})`);
    }
    side.abbr = own;
    side.id = teamId;
    side.pts = row[i.PTS] === null || row[i.PTS] === undefined ? null : requireNumeric(row[i.PTS], 'PTS', gameId);
    if (opponent.abbr === undefined) {
      // Only the name is written from this row — the opposing row carries its
      // own id and score when it arrives (or the game fails validation).
      opponent.abbr = other;
    } else if (opponent.abbr !== other) {
      throw new NbaComError(`${gameId}: rows on ${date} disagree on the opponent (${opponent.abbr} vs ${other})`);
    }
  }
  return [...games.values()];
}

/** Group validated games into series on (calendar year, unordered team-id pair). */
function buildSeries(games: readonly FeedGame[]): FeedSeries[] {
  const byPair = new Map<string, FeedSeries>();
  for (const game of games) {
    const home = game.home;
    const away = game.away;
    if (home.id === undefined || away.id === undefined) {
      throw new NbaComError(`${game.gameId}: game has only one team row on ${game.date} — both sides must be present to be final`);
    }
    if (home.id === away.id || home.abbr === away.abbr) {
      throw new NbaComError(`${game.gameId}: a team cannot play itself (${home.abbr} vs ${away.abbr} on ${game.date})`);
    }
    if (home.pts === null || home.pts === undefined || away.pts === null || away.pts === undefined) {
      throw new NbaComError(
        `${game.gameId}: PTS missing on a final game (home ${home.abbr} ${home.pts ?? 'null'}, away ${away.abbr} ${away.pts ?? 'null'}) ` +
          '— a game older than the run day must carry a final score',
      );
    }
    if (home.pts === away.pts) {
      throw new NbaComError(`${game.gameId}: tie score ${home.pts}-${away.pts} — every source game must be final and decided`);
    }
    const year = Number(game.date.slice(0, 4));
    const key = `${year}|${Math.min(home.id, away.id)}|${Math.max(home.id, away.id)}`;
    const series = byPair.get(key) ?? { key, year, games: [] };
    series.games.push(game);
    byPair.set(key, series);
  }
  // Game numbers follow date order within the pair — never the GAME_ID suffix
  // (spike hazard 1: 1994 ids are global postseason numbers, not 1..7).
  for (const series of byPair.values()) {
    series.games.sort((left, right) => left.date.localeCompare(right.date) || left.gameId.localeCompare(right.gameId));
  }
  return [...byPair.values()];
}

function gameWinnerId(game: FeedGame): number {
  return (game.home.pts as number) > (game.away.pts as number) ? (game.home.id as number) : (game.away.id as number);
}

interface ParsedFeed {
  statuses: SeriesStatusRow[];
  scores: GameScoreRow[];
  report: AdapterRunReport;
}

function formatHistogram(histogram: Record<number, number>): string {
  return `{${Object.keys(histogram)
    .map(Number)
    .sort((left, right) => left - right)
    .map((depth) => `${depth}:${histogram[depth]}`)
    .join(', ')}}`;
}

/**
 * The whole feed pipeline: fetch once, reconstruct games and series, walk the
 * chain for depths, select Game-7 series, emit the port's row shapes plus the
 * run report (counts + histogram + named exclusions).
 */
async function loadParsedFeed(deps: AdapterDeps, season: string, runDateUtc: string): Promise<ParsedFeed> {
  const url = gameLogUrl(season);
  const raw = await fetchFeed(deps, url);
  const allGames = buildGames(raw);

  // Decision 5: a game whose GAME_DATE equals the run's UTC date is never
  // consumed — leaguegamelog has no final/unfinal status, and a game is not
  // over until it is over. FR-21's daily cadence puts those games in tomorrow's run.
  const sameDayGames = allGames.filter((game) => game.date === runDateUtc);
  const usableGames = allGames.filter((game) => game.date !== runDateUtc);
  const series = buildSeries(usableGames);

  const depths = deriveChainDepths(
    series.map((entry): ChainSeries => ({ key: entry.key, teamIds: [Number(entry.key.split('|')[1]), Number(entry.key.split('|')[2])], startDate: entry.games[0].date })),
  );
  const depthHistogram: Record<number, number> = {};
  for (const depth of depths.values()) {
    depthHistogram[depth] = (depthHistogram[depth] ?? 0) + 1;
  }

  const statuses: SeriesStatusRow[] = [];
  const scores: GameScoreRow[] = [];
  const notes: string[] = [];
  let pending = 0;
  let completed = 0;
  let excludedByShape = 0;

  for (const entry of series) {
    // Decision 3: a series enters the output iff its games are exactly {1..6}
    // decided split 3–3 (birth/pending) or exactly {1..7} all decided
    // (archive). Every other shape — 4-0/4-1/4-2, an in-flight 2-1, a pre-2003
    // best-of-5 — is excluded and counted; the era caveat discharges itself.
    const count = entry.games.length;
    const teamAId = entry.games[0].home.id as number;
    const teamBId = entry.games[0].away.id as number;
    const teamAWins = entry.games.filter((game) => gameWinnerId(game) === teamAId).length;
    const isPendingShape = count === 6 && teamAWins === 3;
    const isCompletedShape = count === 7;
    if (!isPendingShape && !isCompletedShape) {
      excludedByShape++;
      continue;
    }

    const depth = depths.get(entry.key) as number;
    const round = roundLabelForDepth(depth);
    if (!round) {
      // The chain walk met a bracket shape it cannot explain — exclude loudly.
      notes.push(
        `nba_com: excluded series ${entry.year} ${entry.games[0].home.abbr} vs ${entry.games[0].away.abbr} ` +
          `(game 7 candidate) — derived chain depth ${depth} is outside 1..4; a round label for it would be a guess. ` +
          `Depth histogram that produced this: ${formatHistogram(depthHistogram)}`,
      );
      continue;
    }

    const gameSeven = isCompletedShape ? entry.games[6] : null;
    statuses.push({
      year: entry.year,
      round,
      team_a_id: teamAId,
      team_b_id: teamBId,
      winner_team_id: gameSeven ? gameWinnerId(gameSeven) : null,
    });
    entry.games.forEach((game, position) => {
      scores.push({
        // Decision 4: `year` is the calendar year of GAME_DATE, never SEASON_ID.
        year: Number(game.date.slice(0, 4)),
        team_a_id: teamAId,
        team_b_id: teamBId,
        game_number: position + 1,
        home_team_id: game.home.id as number,
        away_team_id: game.away.id as number,
        home_score: game.home.pts as number,
        away_score: game.away.pts as number,
      });
    });
    if (isPendingShape) pending++;
    else completed++;
  }

  const countsLine =
    `nba_com feed: ${series.length} series in feed, ${pending + completed} Game-7 candidates selected ` +
    `(${pending} pending at a certified 3–3, ${completed} completed with game 7); ` +
    `${excludedByShape} excluded by shape, ${sameDayGames.length} same-UTC-day game(s) skipped, ${notes.length} round-unexplainable`;

  return { statuses, scores, report: { countsLine, depthHistogram, notes } };
}

/**
 * The registry factory (Decision 1): one request per run, memoised so both
 * port methods read the same cached parse. The eager-throw on a malformed
 * `--season=` mirrors `manual_csv`'s read-then-validate style — bad input
 * fails the run before any write.
 */
export function createNbaComAdapter(deps: AdapterDeps): SeriesDataSource {
  const runDate = deps.runDate ?? new Date();
  const season = deps.season ?? deriveSeason(runDate);
  if (!SEASON_PATTERN.test(season)) {
    throw new NbaComError(
      `season "${season}" is not a YYYY-YY identifier (e.g. 2026-27) — --season= names the postseason's season; ` +
        'without it the season derives from the run date',
    );
  }
  const runDateUtc = runDate.toISOString().slice(0, 10);
  let feedPromise: Promise<ParsedFeed> | null = null;
  let parsed: ParsedFeed | null = null;
  const feed = async (): Promise<ParsedFeed> => {
    if (!feedPromise) feedPromise = loadParsedFeed(deps, season, runDateUtc);
    parsed = await feedPromise;
    return parsed;
  };
  return {
    async fetch_series_statuses() {
      return (await feed()).statuses;
    },
    async fetch_game_scores() {
      return (await feed()).scores;
    },
    describeRun() {
      // Called by the runner after both fetch methods have resolved; a report
      // before the feed exists would describe a run that never happened.
      if (!parsed) {
        throw new NbaComError('describeRun() called before the feed was fetched');
      }
      return parsed.report;
    },
  };
}
