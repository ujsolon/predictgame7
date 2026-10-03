/**
 * Story 2.4 — the `nba_com` automated adapter: the second `SeriesDataSource`
 * behind the Story 2.3 port, built on the route the Story 2.1 spike proved.
 *
 * Shape of a run (spec Decisions 1-6):
 *
 * - ONE unkeyed HTTP request per run: `leaguegamelog` for the current
 *   postseason, `PlayerOrTeam=T`, `Counter=1000`. Both port methods read the
 *   same memoised parse; a run never fans out (rate limits are unmeasured on
 *   this Cloudflare-fronted route).
 * - Season derives from the run's UTC date (Jan-Jun → `Y-1`–`YY`,
 *   Jul-Dec → `Y`–`YY+1`); `--season=` overrides, validated eagerly — before
 *   any request. This is a FETCH PARAMETER only — no phase, group, or page
 *   derives from a date (AD-4). An offseason run therefore asks for a season
 *   with no playoff games, gets zero rows, and plans nothing.
 * - Games are reconstructed from the two team rows each game emits (merged on
 *   GAME_DATE + unordered matchup pair, tolerant of either row arriving
 *   first), numbered by DATE ORDER within the pair — never the GAME_ID
 *   suffix (hazard 1: 1994 HOU-PHX ids run 031..057 for games 1..7) — and a
 *   game whose date equals the run's UTC date is never consumed (the feed has
 *   no final/unfinal status; those games are in tomorrow's run). That
 *   withholding is a proxy, and its safety argument is the cadence: FR-21's
 *   09:00 UTC schedule puts every prior-night game past its final buzzer
 *   before the run starts, so a non-null PTS on both sides means a finished
 *   game. An AD-HOC run at, say, 03:30 UTC can consume an in-progress game
 *   whose partial PTS is already non-null — `finalScore` only rejects null,
 *   negative and non-finite. Nothing here can detect that from the feed, so
 *   it is stated rather than guarded; scheduled runs are the supported mode.
 * - A series enters the output iff its games are exactly {1..6} decided 3-3
 *   (pending) or exactly {1..7} all decided (archive). Every other shape —
 *   4-0/4-1/4-2 sweeps, in-flight 2-1, pre-2003 best-of-5 — is excluded and
 *   counted; that is AD-4's product rule and it discharges the era caveat for
 *   free. Note what "for free" covers: exclusion needs no era rule, but the
 *   COUNTS do, and the ended-vs-in-flight split is first-to-4. A concluded
 *   best-of-5 (3-0/3-1/3-2) therefore lands in "in flight" on a pre-2003
 *   `--season=` drill, because 3-2 through five is genuinely in flight in a
 *   best-of-7 and the feed carries no format field to tell them apart. The
 *   categories are era-blind by design: read the counts line as a diagnostic
 *   of this parse, not as an assertion about a historical series.
 * - Team identity is RESOLVED, not copied: each row's `TEAM_ABBREVIATION`
 *   goes through `deps.teamIdByAbbreviation` — the same resolver `manual_csv`
 *   uses — because the sink's FK columns carry `REFERENCES teams(id)` and the
 *   feed's numeric `TEAM_ID` is a foreign namespace (the decision record's
 *   claim that the two spaces match is unsourced; the owner-run probe
 *   measures it). An unknown abbreviation rejects the run naming the
 *   abbreviation AND the GAME_ID. `TEAM_ID` is never read; `WL` is never
 *   read — the required-column list names only what the parser consumes.
 * - Failure posture: 25 s `AbortSignal.timeout`, three attempts with
 *   [1000, 4000] ms backoff on 403/429/5xx or a body that is not the expected
 *   `resultSets` shape; non-retryable statuses fail at once. Every terminal
 *   message names the URL and reason and states that no `manual_csv` fallback
 *   was taken.
 *
 * The archive is frozen (owner decision 2026-10-01, spec Decision 11) in the
 * narrow sense the fetch scope can enforce: a year already in the table cannot
 * be re-fetched without `--season=`, so this adapter never reaches back to
 * rewrite one. It does NOT stop new archive rows from arriving — a series
 * decided inside the derived season enters the plan as fresh archive data with
 * no drill at all, which is the pipeline working as intended. Story 2.3's
 * archive guard is the enforcement point for both cases and is untouched here;
 * where a stored row and a feed row disagree on games 1-6 (the venue
 * consequence of the same owner decision — `manual_csv` rows carry a slot
 * convention the feed does not), the guard aborts the run non-zero rather than
 * reconciling them.
 *
 * No Supabase, no sink, no writes — the runner owns all of that.
 */
import { formatHistogram, histogramFromPlacements, labelForDepth, walkChainDepth, type ChainSeriesInput } from './rounds.ts';
import type {
  AdapterDeps,
  AdapterRunReport,
  FeedFetch,
  FeedResponseLike,
  GameScoreRow,
  SeriesDataSource,
  SeriesStatusRow,
} from '../port.ts';

export class NbaComError extends Error {}

/** The spike's proven header set (`scripts/spike-2-1/probe-series-rebuild.mjs:5-12`), copied verbatim. */
export const NBA_COM_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
});

export const FETCH_TIMEOUT_MS = 25000;
export const MAX_FEED_ATTEMPTS = 3;
/** Waits before attempt 2 and attempt 3; there is no wait after the third failure. */
export const BACKOFF_MS: readonly number[] = Object.freeze([1000, 4000]);

/** What the parser actually reads — the list names what the adapter consumes (spec Tasks). */
const REQUIRED_COLUMNS = ['GAME_ID', 'GAME_DATE', 'MATCHUP', 'TEAM_ABBREVIATION', 'PTS'];

const SEASON_PATTERN = /^\d{4}-\d{2}$/;
const GAME_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ABBREVIATION_PATTERN = /^[A-Z]{3}$/;

function padYear(year: number): string {
  return String(year % 100).padStart(2, '0');
}

/**
 * Decision 2: the postseason of season `Y-1`–`Y` is played in calendar year
 * `Y`, so Jan-Jun asks for `Y-1`–`YY` and Jul-Dec for `Y`–`YY+1`.
 */
export function deriveSeason(runDateUtc: Date): string {
  const year = runDateUtc.getUTCFullYear();
  return runDateUtc.getUTCMonth() <= 5 ? `${year - 1}-${padYear(year)}` : `${year}-${padYear(year + 1)}`;
}

/** Validate a `--season=` override; throws before any request is built (eager rejection). */
export function validateSeasonOverride(value: string): string {
  if (!SEASON_PATTERN.test(value)) {
    throw new NbaComError(
      `--season="${value}" is not a season string — expected YYYY-YY (e.g. 2025-26). ` +
        "The archive is frozen: pointing this at an archived year reaches the runner's archive guard, never a rewrite.",
    );
  }
  return value;
}

/** The one URL a run fetches (Decision 1), built with URLSearchParams from the spike's proven template. */
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
  return `https://stats.nba.com/stats/leaguegamelog?${params.toString()}`;
}

function utcDateKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/** One reconstructed game: both team rows merged, scores and sides settled. */
interface FeedGame {
  gameId: string;
  date: string;
  homeAbbr: string;
  awayAbbr: string;
  homeId: number;
  awayId: number;
  homePts: number;
  awayPts: number;
}

export interface NbaComFeedResult {
  statuses: SeriesStatusRow[];
  scores: GameScoreRow[];
  report: AdapterRunReport;
}

interface FeedRowView {
  gameId: string;
  gameDate: string;
  matchup: string;
  abbreviation: string;
  pts: unknown;
}

/** Either a retryable body-shape reason or the headers/rows to consume. */
type BodyParse = { reason: string } | { headers: string[]; rows: unknown[][] };

function parseBodyShape(body: unknown): BodyParse {
  const first = (body as { resultSets?: { headers?: unknown; rowSet?: unknown }[] } | null)?.resultSets?.[0];
  if (!first || !Array.isArray(first.headers) || !Array.isArray(first.rowSet)) {
    return { reason: 'body is not the expected `{ resultSets: [ { headers, rowSet } ] }` shape' };
  }
  const headers = first.headers as unknown[];
  if (!headers.every((header) => typeof header === 'string')) {
    return { reason: 'resultSets[0].headers contains a non-string entry' };
  }
  if (!first.rowSet.every(Array.isArray)) {
    return { reason: 'resultSets[0].rowSet contains a row that is not an array' };
  }
  return { headers: headers as string[], rows: first.rowSet as unknown[][] };
}

function readRow(headers: string[], row: unknown[]): FeedRowView {
  const at = (column: string) => row[headers.indexOf(column)];
  const gameId = at('GAME_ID');
  if (typeof gameId !== 'string' || gameId === '') {
    throw new NbaComError('feed row carries no GAME_ID — every row must name itself for a rejection to be diagnosable');
  }
  const gameDate = at('GAME_DATE');
  if (typeof gameDate !== 'string' || !GAME_DATE_PATTERN.test(gameDate)) {
    throw new NbaComError(`game ${gameId}: GAME_DATE "${String(gameDate)}" is not YYYY-MM-DD — the feed's shape has drifted`);
  }
  const matchup = at('MATCHUP');
  if (typeof matchup !== 'string') {
    throw new NbaComError(`game ${gameId}: MATCHUP ${JSON.stringify(matchup)} is not a string — the feed's shape has drifted`);
  }
  const abbreviation = at('TEAM_ABBREVIATION');
  if (typeof abbreviation !== 'string' || !ABBREVIATION_PATTERN.test(abbreviation)) {
    throw new NbaComError(
      `game ${gameId}: TEAM_ABBREVIATION ${JSON.stringify(abbreviation)} is not a three-letter abbreviation — the feed's shape has drifted`,
    );
  }
  return { gameId, gameDate, matchup, abbreviation, pts: at('PTS') };
}

interface GameSlotFill {
  abbr: string;
  id: number;
  pts: unknown;
}

/**
 * The two-row merge target. `home`/`away` hold only REAL rows (the row whose
 * own MATCHUP names that side); a slot that never received its row stays null
 * and fails completeness, naming the game.
 */
interface MutableFeedGame {
  gameId: string;
  date: string;
  home: GameSlotFill | null;
  away: GameSlotFill | null;
}

/** PTS as consumed: a final, non-negative, finite number — anything else is feed drift. */
function finalScore(label: 'home' | 'away', gameId: string, date: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new NbaComError(
      `game ${gameId} ${date}: ${label} PTS ${JSON.stringify(value)} is not a final non-negative score — ` +
        'a null or non-numeric PTS on a concluded game is feed shape drift',
    );
  }
  return value;
}

function terminalFetchError(url: string, reason: string, attempts: number): NbaComError {
  return new NbaComError(
    `GET ${url} failed after ${attempts} attempt(s): ${reason} — no manual_csv fallback was taken. ` +
      'Unset SERIES_SOURCE (or pass --source=manual_csv) to use the floor deliberately.',
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 403 || status === 429 || status >= 500;
}

/**
 * One request per run with the retry posture of Decision 6, then the full
 * parse into port rows. `createNbaComAdapter` wraps this in the memoised
 * two-method port; the owner-run probe calls it through the adapter.
 */
export async function buildFeed(url: string, runDate: Date, deps: AdapterDeps): Promise<NbaComFeedResult> {
  const fetchImpl: FeedFetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms)));

  let lastReason = 'no attempt was made';
  for (let attempt = 1; attempt <= MAX_FEED_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await sleep(BACKOFF_MS[attempt - 2]);
    }
    let response: FeedResponseLike;
    try {
      response = await fetchImpl(url, {
        headers: { ...NBA_COM_HEADERS },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      lastReason = `request threw: ${error instanceof Error ? error.message : String(error)}`;
      continue;
    }
    if (!response.ok) {
      lastReason = `HTTP ${response.status}`;
      if (!isRetryableStatus(response.status)) {
        throw terminalFetchError(url, lastReason, attempt);
      }
      continue;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      lastReason = `response body is not JSON: ${error instanceof Error ? error.message : String(error)}`;
      continue;
    }
    const shape = parseBodyShape(body);
    if ('reason' in shape) {
      lastReason = `response ${shape.reason}`;
      continue;
    }
    return parseRows(shape.headers, shape.rows, url, runDate, deps);
  }
  throw terminalFetchError(url, lastReason, MAX_FEED_ATTEMPTS);
}

function parseRows(headers: string[], rows: unknown[][], url: string, runDate: Date, deps: AdapterDeps): NbaComFeedResult {
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw terminalFetchError(url, `response headers lack required column(s) ${missing.join(', ')} (got: ${headers.join(', ')})`, 1);
  }

  const runDateKey = utcDateKey(runDate);
  const games = new Map<string, MutableFeedGame>();
  const withheldGameIds = new Set<string>();

  for (const row of rows) {
    const view = readRow(headers, row);
    if (view.gameDate === runDateKey) {
      // Decision 5: never consume a game played on the run's UTC day.
      // Filtered BEFORE grouping so an unfinished game cannot reach a series
      // shape at all — and not even parsed further, because half-played rows
      // are where a null PTS legitimately lives.
      withheldGameIds.add(view.gameId);
      continue;
    }

    const atIndex = view.matchup.indexOf(' @ ');
    const isAway = atIndex >= 0;
    // The home form carries a TRAILING PERIOD ("TEA vs. AWY"); a split on
    // ' vs ' silently yields ". AWY" and shatters real series (spike hazard 3).
    const tokens = view.matchup.split(isAway ? ' @ ' : ' vs. ');
    if (tokens.length !== 2 || !tokens.every((token) => ABBREVIATION_PATTERN.test(token))) {
      throw new NbaComError(
        `game ${view.gameId}: MATCHUP "${view.matchup}" is unparseable — expected "AAA vs. BBB" (note the trailing period) or "BBB @ AAA"`,
      );
    }
    const [own, other] = tokens;
    if (own !== view.abbreviation) {
      throw new NbaComError(
        `game ${view.gameId}: MATCHUP "${view.matchup}" names "${own}" but TEAM_ABBREVIATION is "${view.abbreviation}" — the feed's shape has drifted`,
      );
    }
    if (own === other) {
      throw new NbaComError(`game ${view.gameId}: MATCHUP "${view.matchup}" has a team playing itself`);
    }

    // THE id path: the row's own abbreviation through the port's resolver —
    // never the feed's numeric TEAM_ID, which is a foreign namespace.
    const teamId = deps.teamIdByAbbreviation(view.abbreviation);
    if (teamId === undefined) {
      throw new NbaComError(
        `game ${view.gameId}: unknown team abbreviation "${view.abbreviation}" — not in the teams table. Refusing to substitute the feed's ` +
          'TEAM_ID: that is a foreign namespace, and the sink columns carry REFERENCES teams(id).',
      );
    }

    const key = `${view.gameDate}|${[own, other].sort().join('|')}`;
    const ownSlot = isAway ? 'away' : 'home';
    let game = games.get(key);
    if (!game) {
      game = { gameId: view.gameId, date: view.gameDate, home: null, away: null };
      games.set(key, game);
    } else if (game.gameId !== view.gameId) {
      throw new NbaComError(
        `games ${game.gameId} and ${view.gameId} share one date (${view.gameDate}) and one team pair (${own}/${other}) — ` +
          'game numbers come from date order, so a tie cannot be resolved',
      );
    }
    if (game[ownSlot]) {
      throw new NbaComError(
        `game ${view.gameId}: two ${ownSlot}-side rows for one date and team pair (${view.matchup}) — the feed's shape has drifted`,
      );
    }
    game[ownSlot] = { abbr: own, id: teamId, pts: view.pts };
    // The opposing row fills its own slot when it arrives; either arrival
    // order completes the game exactly the same way.
  }

  const feedGames: FeedGame[] = [];
  for (const game of games.values()) {
    const { home, away } = game;
    if (!home || !away) {
      const side = home ?? away;
      throw new NbaComError(
        `game ${game.gameId} ${game.date}: only one team row arrived (${side?.abbr}) — every game must merge both sides ` +
          'before it can become a certified score',
      );
    }
    const homePts = finalScore('home', game.gameId, game.date, home.pts);
    const awayPts = finalScore('away', game.gameId, game.date, away.pts);
    // Rejected here, at the merge, rather than left to `plan.ts`: the chain walk
    // and Decision 3's selection both derive a game's winner from these scores,
    // so a tie would silently decide which franchise advances and what round the
    // next series is labelled — before any plan assertion could see it.
    if (homePts === awayPts) {
      throw new NbaComError(
        `game ${game.gameId} ${game.date}: tie score ${homePts}-${awayPts} — every source game must be final and decided`,
      );
    }
    feedGames.push({
      gameId: game.gameId,
      date: game.date,
      homeAbbr: home.abbr,
      awayAbbr: away.abbr,
      homeId: home.id,
      awayId: away.id,
      homePts,
      awayPts,
    });
  }

  // Series = the games between the same two franchises, ordered by date.
  const byPair = new Map<string, FeedGame[]>();
  for (const game of feedGames) {
    const key = `${Math.min(game.homeId, game.awayId)}|${Math.max(game.homeId, game.awayId)}`;
    byPair.set(key, [...(byPair.get(key) ?? []), game]);
  }
  const reconstructed = [...byPair.entries()]
    .map(([key, gamesOfPair]) => {
      gamesOfPair.sort((left, right) => left.date.localeCompare(right.date));
      return { key, games: gamesOfPair };
    })
    .sort((left, right) => left.games[0].date.localeCompare(right.games[0].date) || left.key.localeCompare(right.key));

  // The chain walk consumes EVERY reconstructed series, excluded shapes
  // included — a 4-2 sweep is not a Game 7, but its winner still advances,
  // and leaving sweeps out would mislabel the next round (see rounds.ts).
  const chainInputs: ChainSeriesInput[] = reconstructed.map((series) => ({
    key: series.key,
    teamAId: series.games[0].homeId,
    teamBId: series.games[0].awayId,
    firstGameDate: series.games[0].date,
  }));
  const placements = walkChainDepth(chainInputs);
  const placementByKey = new Map(placements.map((placement) => [placement.input.key, placement]));
  const histogram = formatHistogram(histogramFromPlacements(placements));
  const histogramLine = `nba_com depth histogram ${histogram}`;

  const statuses: SeriesStatusRow[] = [];
  const scores: GameScoreRow[] = [];
  const notes: string[] = [];
  let excludedEnded = 0;
  let excludedInProgress = 0;
  let excludedUnexplained = 0;
  let pendingCount = 0;
  let decidedCount = 0;

  const winnerOf = (game: FeedGame) => (game.homePts > game.awayPts ? game.homeId : game.awayId);

  for (const series of reconstructed) {
    const firstGame = series.games[0];
    const describe = `${firstGame.date.slice(0, 4)} ${firstGame.homeAbbr}/${firstGame.awayAbbr} (${series.games.length} game(s), opened ${firstGame.date})`;
    const placement = placementByKey.get(series.key);
    if (!placement || !placement.inRange) {
      excludedUnexplained += 1;
      notes.push(
        `nba_com: series ${describe} derived chain depth ${placement ? placement.depth : '(unplaced)'} is outside 1..4 — ` +
          `excluded from this run; the histogram that produced it: ${histogram}`,
      );
      continue;
    }
    const round = labelForDepth(placement.depth) as string;

    // Decision 3: a series enters the output iff its games are exactly
    // {1..6} decided with a 3-3 split (pending) or exactly {1..7} all decided
    // (archive). Decision 4: team_a = game 1's home team — which the runner's
    // plan.ts assertion re-checks from the emitted rows.
    const teamAId = firstGame.homeId;
    const teamBId = firstGame.awayId;
    const total = series.games.length;
    const teamAWinsThroughSix = series.games.slice(0, 6).filter((game) => winnerOf(game) === teamAId).length;
    const teamAWinsOverall = series.games.filter((game) => winnerOf(game) === teamAId).length;

    if (total === 6 && teamAWinsThroughSix === 3) {
      pendingCount += 1;
      statuses.push({
        // Hazard 2 (spike): the year is the calendar year of GAME_DATE,
        // never SEASON_ID.
        year: Number(firstGame.date.slice(0, 4)),
        round,
        team_a_id: teamAId,
        team_b_id: teamBId,
        winner_team_id: null,
      });
    } else if (total === 7 && teamAWinsThroughSix === 3) {
      decidedCount += 1;
      statuses.push({
        year: Number(firstGame.date.slice(0, 4)),
        round,
        team_a_id: teamAId,
        team_b_id: teamBId,
        winner_team_id: winnerOf(series.games[6]),
      });
    } else {
      const teamBWinsOverall = total - teamAWinsOverall;
      if (total <= 6 && (teamAWinsOverall >= 4 || teamBWinsOverall >= 4)) {
        excludedEnded += 1;
      } else if (total < 7) {
        excludedInProgress += 1;
      } else {
        excludedUnexplained += 1;
        notes.push(`nba_com: series ${describe} has ${total} games without a 3-3 split through six — an impossible bracket shape; excluded from this run`);
      }
      continue;
    }

    series.games.forEach((game, index) => {
      scores.push({
        // Hazard 1 (spike): game_number follows DATE order within the pair —
        // never the GAME_ID suffix.
        year: Number(firstGame.date.slice(0, 4)),
        team_a_id: teamAId,
        team_b_id: teamBId,
        game_number: index + 1,
        home_team_id: game.homeId,
        away_team_id: game.awayId,
        home_score: game.homePts,
        away_score: game.awayPts,
      });
    });
  }

  const countsLine =
    `nba_com: ${reconstructed.length} series in feed, ${statuses.length} Game-7 candidate(s) ` +
    `(${pendingCount} pending 3-3, ${decidedCount} decided through game 7) — excluded: ${excludedEnded} ended before game 7, ` +
    `${excludedInProgress} in flight, ${excludedUnexplained} unexplainable; ${withheldGameIds.size} game(s) played on ${runDateKey} withheld`;
  const report: AdapterRunReport = {
    countsLine,
    histogramLine,
    // Every pair the feed carried, before the chain walk excluded any of them
    // — `--require-feed`'s alarm asks "did anything come back", not "was any
    // of it a Game 7".
    feedSeriesCount: reconstructed.length,
    notes,
  };
  return { statuses, scores, report };
}

/**
 * The registry factory. `deps.seasonOverride` (the `--season=` flag) is
 * validated eagerly — before any request — and `deps.now` is the seam tests
 * use to pin the run's UTC date.
 */
export function createNbaComAdapter(deps: AdapterDeps): SeriesDataSource {
  const runDate = (deps.now ?? (() => new Date()))();
  const season = deps.seasonOverride !== undefined ? validateSeasonOverride(deps.seasonOverride) : deriveSeason(runDate);
  const url = gameLogUrl(season);

  let feedPromise: Promise<NbaComFeedResult> | null = null;
  let settled: NbaComFeedResult | null = null;
  function feed(): Promise<NbaComFeedResult> {
    if (!feedPromise) {
      feedPromise = buildFeed(url, runDate, deps).then((result) => {
        settled = result;
        return result;
      });
    }
    return feedPromise;
  }

  return {
    async fetch_series_statuses() {
      return (await feed()).statuses;
    },
    async fetch_game_scores() {
      return (await feed()).scores;
    },
    describeRun() {
      if (!settled) {
        throw new NbaComError('nba_com describeRun() called before the feed resolved — the report describes a parse that has not happened yet');
      }
      return settled.report;
    },
  };
}
