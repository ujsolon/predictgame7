/**
 * Story 2.13 — the `espn` automated adapter: the third `SeriesDataSource`
 * behind the Story 2.3 port, and the SCHEDULED source from this story on.
 *
 * Why this adapter exists (Story 2.6's egress evidence, `deferred-work.md`
 * "CONFIRMED GREEN AND BOTH THROWAWAYS RETIRED"): `stats.nba.com` refuses every
 * cloud egress (0/15 across two providers and three client stacks) and
 * `cdn.nba.com` answers `403` from both, so the source Story 2.4 shipped can
 * only ever be reached from a residential address. `site.api.espn.com` answers
 * from both clouds — 78 ms from a GitHub-hosted runner (runs `37118226487`,
 * `37119291248`) and 226 ms from Supabase — which is why FR-21 was re-resolved
 * on 2026-10-03 (`sprint-change-proposal-2026-10-03.md`, owner calls C1-C4) and
 * why the documented reopening trigger on the feed route has fired.
 *
 * Shape of a run (spec-2-13 I/O matrix and `payload-contract.md`):
 *
 * - ONE scoreboard request per run, carrying exactly one date:
 *   `…/sports/basketball/nba/scoreboard?dates=YYYYMMDD`. The range form
 *   (`dates=20260601-20260608`) is refused by the host with `400` and a JSON
 *   error body carrying no `.events` key (measured), so a backfill would be a
 *   bounded loop of single-date requests — and this story builds the single-date
 *   form and nothing else. `seasontype`/`playoffType` are out of scope: never
 *   probed. [2026-10-06, Story 2.18 (`sprint-change-proposal-2026-10-06.md`):
 *   still single-date, but no longer one per run. Each run also re-reads the
 *   PREVIOUS date, and a Final Game 6 at 3–3 whose pair is not stored triggers a
 *   bounded walk back (≤21 dates, shared within the run, ≤25 extra requests and
 *   ~3 minutes per run) for that pair's games 1–5. `feedSeriesCount` still
 *   counts the run's own date only, and every extra date is isolated: its
 *   errors become `alerts`, never a thrown run. See "Story 2.18" below.]
 * - The date is DERIVED, never a parameter: the PREVIOUS `America/New_York`
 *   calendar day of the run instant. ESPN filters `dates` by US local date
 *   (measured: `dates=20260605` returned the game stamped `2026-06-06T00:30Z`),
 *   and the 07:30 UTC cron fires at 02:30-03:30 ET, before that day's games tip,
 *   so the only results on the wire at that hour are the previous evening's. A
 *   UTC-derived date reads an empty feed and trips `--require-feed` on a day
 *   that had games. The runner stays date-blind (AD-4): this is a fetch-scope
 *   rule, not a state rule, and no postseason calendar lives anywhere.
 * - Team identity is RESOLVED through `teams.espn_code` (migration `00018`,
 *   owner call C2) — the provider's own code, NOT `teams.abbreviation`.
 *   Measured divergences (all 30 franchises captured 2026-10-04, seeded by
 *   `00018`): ESPN prints `NY`, `SA`, `GS`, `NO`, `UTAH` and `WSH` where the
 *   table holds `NYK`, `SAS`, `GSW`, `NOP`, `UTA` and `WAS`; the other 24
 *   agree string-for-string. A code that
 *   resolves to nothing ABORTS the run naming the code. Substring, city and
 *   nickname matching are forbidden here, because a silent mismatch drops games
 *   (finding 5 — the one item in the evidence with a real silent-failure mode).
 *   `team.displayName` is never read as an identity.
 * - Round and game number come from `competitions[0].notes[0].headline`
 *   ("East 1st Round - Game 2", "NBA Finals - Game 2"), because
 *   `competitions[0].type.shortName` is ABSENT on the measured payload (finding
 *   2). The round segment maps onto `rounds.ts`' frozen canonical vocabulary
 *   through `labelForDepth`, so no new `round` spelling can reach the table and
 *   the 17 archived era spellings stay untouched. A headline that is absent, or
 *   whose round phrase is outside the enumerated vocabulary, EXCLUDES the game
 *   and NAMES the exclusion in `describeRun().notes` — never a guessed label.
 * - Selection rule: **Final AND game 7**, every other shape excluded BY RULE and
 *   named. The feed is date-granular while the plan model is series-granular, so
 *   this adapter's live job is tagging Game 7 of an already stored (curated)
 *   pending series; `plan.ts` admits that one source shape and refuses to birth
 *   a series from a partial source. Births stay Story 2.7's curated path.
 *   Admission is `status.type.state === 'post'` with
 *   `status.type.description === 'Final'`: `in`, `pre`, and any unrecognised
 *   string are excluded, never defaulted to "finished" — `site.api.espn.com` is
 *   undocumented Disney-side infrastructure with no SLA, so a drifted payload
 *   must exit non-zero rather than invent a row. [2026-10-06, Story 2.18: the
 *   rule above still decides what the run's OWN date admits as a game-7-only
 *   source. Births are added beside it: a Final Game 6 whose
 *   `competitions[0].series` stands 3–3 (wins read PER TEAM, joined on
 *   `series.competitors[].id` = `competitors[].team.id`, never by position) and
 *   whose pair is not stored is backfilled into an ordinary six-game source —
 *   seven when that pair's Game 7 is also seen — so `plan.ts` births it through
 *   the unchanged RPC and AD-4/AD-5 checks.]
 * - Failure posture (the discipline Story 2.4's retired stats.nba.com adapter set): 25 s
 *   `AbortSignal.timeout`, three attempts, `[1000, 4000]` ms backoff on
 *   429/5xx or a body that is not the expected scoreboard shape; non-retryable
 *   statuses fail at once. Every terminal message names the URL and reason and
 *   states that no `manual_csv` fallback was taken.
 *
 * If this route breaks, the designated automated fallback of last resort is
 * **`basketball-reference.com`** — measured reachable from both clouds
 * (`200 text/html`, 215,254 chars in 220 ms, the round-2 probe in
 * `deferred-work.md`) and UNIMPLEMENTED by owner call C4: the scrape cost (HTML
 * coupling, no published schema, Cloudflare-guarded) makes it a conditional
 * story authored only if the ESPN route actually fails. `manual_csv` stays the
 * floor beneath both (see
 * `_bmad-output/implementation-artifacts/seriesdatasource-port.md`).
 *
 * No Supabase, no sink, no writes — the runner owns all of that, and no test or
 * agent ever reaches the network: every leg runs through `deps.fetch`.
 */
import { formatHistogram, labelForDepth } from './rounds.ts';
import type {
  AdapterDeps,
  AdapterRunReport,
  FeedFetch,
  FeedResponseLike,
  GameScoreRow,
  SeriesDataSource,
  SeriesStatusRow,
} from '../port.ts';

export class EspnError extends Error {}

export const FETCH_TIMEOUT_MS = 25000;
export const MAX_FEED_ATTEMPTS = 3;
/** Waits before attempt 2 and attempt 3; there is no wait after the third failure. */
export const BACKOFF_MS: readonly number[] = Object.freeze([1000, 4000]);

/** The measured endpoint (`payload-contract.md` "Request"), unkeyed and unauthenticated. */
export const SCOREBOARD_ENDPOINT = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

/** The league's own timezone — the only calendar the requested date is derived against. */
export const LEAGUE_TIME_ZONE = 'America/New_York';

/** No key and no `Authorization` header: the measured probe sent neither. (That requirement belongs to the Supabase function gateway, not to ESPN.) */
export const ESPN_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  Accept: 'application/json',
  'User-Agent': 'predictgame7-pipeline/1.0 (+https://ujsolon.github.io/predictgame7/)',
});

/** `events[].date` as measured (`2026-04-20T23:00Z`, `2026-06-06T00:30Z`): seconds optional, a zone required. */
const EVENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
/** The provider code shape ESPN prints: `NY`, `SA`, `CLE`, `TOR`, `DEN`. */
const ESPN_CODE_PATTERN = /^[A-Z]{2,4}$/;
/** `<round phrase> - Game <n>` — the measured headline form. */
const HEADLINE_PATTERN = /^(.+?) - Game (\d{1,2})$/;
/**
 * The conference-qualified round phrases the headline vocabulary admits
 * (lower-cased for lookup) mapped to the canonical chain depth whose
 * `labelForDepth` value is written. `East 1st Round` is MEASURED; the rest of
 * this enumeration is inferred from ESPN's naming of the same bracket, and an
 * inferred phrase that does not appear costs a named exclusion — a loud red
 * that writes nothing — rather than a wrong label.
 */
const CONFERENCE_ROUND_DEPTH: ReadonlyMap<string, number> = new Map([
  ['1st round', 1],
  ['2nd round', 2],
  ['3rd round', 3],
  ['semifinals', 2],
  ['conf semifinals', 2],
  ['conference semifinals', 2],
  ['finals', 3],
  ['conf finals', 3],
  ['conference finals', 3],
]);
/** The league-wide phrase, measured on the Finals-day payload (`NBA Finals - Game 2`). */
const LEAGUE_FINALS_PHRASE = 'nba finals';
const LEAGUE_FINALS_DEPTH = 4;
/** `East`/`West` qualify a conference round; anything else is the league-wide shape. */
const CONFERENCE_PREFIX_PATTERN = /^(East|West)\s+(.+)$/i;

/** What one event's headline yields when it can be read at all. */
type HeadlineParse = { depth: number; round: string; gameNumber: number } | { reason: string };

/**
 * Story 2.18 — `competitions[0].series` as the parse read it. Wins are joined
 * PER TEAM: `series.competitors[].id` against the event's
 * `competitors[].team.id` (measured: ESPN's numeric team id, e.g. `"7"`), never
 * by array position — the spike measured GS–HOU reading `[0,1]` after Game 1,
 * where the 1 belongs to the AWAY side. The read never throws: a field missing
 * or malformed matters only on a Final Game 6, where the caller names it.
 */
export type SeriesRead =
  | { kind: 'absent' }
  | { kind: 'malformed'; reason: string }
  | { kind: 'read'; homeWins: number; awayWins: number; completed: boolean; type: string | null };

/** One event as the parse saw it, before admission. Scores stay raw: an unfinished game legitimately carries none. */
export interface ParsedEvent {
  /** Diagnosis label used by every message this event can produce. */
  describe: string;
  /** Identity year: the LOCAL (`America/New_York`) calendar year of `events[].date`. */
  year: number;
  localDate: string;
  state: string;
  description: string;
  headline: string | null;
  /** Why the headline could not be read, kept so the exclusion names the real cause. */
  headlineReason: string | null;
  depth: number | null;
  round: string | null;
  gameNumber: number | null;
  /** Unresolved provider codes — the `feedSeriesCount` key, counted before any exclusion. */
  pairKey: string;
  homeCode: string;
  awayCode: string;
  homeScoreRaw: unknown;
  awayScoreRaw: unknown;
  /** Story 2.18: the series standing, joined per team. Read only for Game 6 detection and backfill certification. */
  series: SeriesRead;
}

export interface EspnFeedResult {
  statuses: SeriesStatusRow[];
  scores: GameScoreRow[];
  report: AdapterRunReport;
  /** Story 2.18: every event of the request date as parsed, so Game 6 detection reads the same parse the admission did. */
  parsed?: ParsedEvent[];
  /** Story 2.18: the admitted Game 7 events, index-parallel to `statuses` and `scores`. */
  admittedEvents?: ParsedEvent[];
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * The `America/New_York` calendar day an instant falls on. `Intl` owns the
 * timezone arithmetic (DST included) because a hand-rolled offset is exactly
 * how a UTC-derived date — the bug CAP-5 exists to catch — would sneak in.
 */
export function etCalendarDay(instant: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LEAGUE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const valueOf = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value);
  const year = valueOf('year');
  const month = valueOf('month');
  const day = valueOf('day');
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new EspnError(`the ${LEAGUE_TIME_ZONE} calendar day of ${instant.toISOString()} did not resolve (got ${year}/${month}/${day})`);
  }
  return { year, month, day };
}

/**
 * The one date a run asks for: the PREVIOUS `America/New_York` calendar day of
 * the run instant, as `YYYYMMDD`. The subtraction runs on a UTC-midnight anchor,
 * so month and year underflow (`Jan 1` → `Dec 31` of the year before) is
 * `Date.UTC`'s arithmetic rather than a hand-written table.
 */
export function deriveRequestDate(instant: Date): string {
  const { year, month, day } = etCalendarDay(instant);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return `${previous.getUTCFullYear()}${pad(previous.getUTCMonth() + 1)}${pad(previous.getUTCDate())}`;
}

/**
 * Why a `fetch` call threw, with the reason undici hides. Every connection-class
 * failure — DNS, refused socket, TLS refusal, a timeout fired by a proxy —
 * reaches Node as the identical `TypeError: fetch failed`, and the distinguishing
 * code and message live on `error.cause`. Reporting only the outer text makes the
 * alarm log blind on precisely the class Story 2.6's egress evidence turned on, so
 * the cause is unwrapped one level and named. The owner's first live probe run
 * (2026-10-04) is what exposed the gap: three legs, three `fetch failed`, no reason.
 */
export function describeFetchThrow(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause === undefined || cause === null) {
    return error.message;
  }
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    const detail = [typeof code === 'string' ? code : undefined, cause.message].filter(Boolean).join(' ');
    return `${error.message} (${detail || 'cause carries no code or message'})`;
  }
  return `${error.message} (${String(cause)})`;
}

/**
 * The single-date request form — the only shape this adapter can build. There is
 * deliberately no range, no lookback window and no second parameter: the range
 * form answers `400` on measurement, and a multi-day feed would inflate the
 * number `--require-feed` reads (Story 2.6 D-3's independence).
 */
export function scoreboardUrl(dates: string): string {
  if (!/^\d{8}$/.test(dates)) {
    throw new EspnError(`dates="${dates}" is not YYYYMMDD — the single-date form is the only request shape this adapter builds`);
  }
  const params = new URLSearchParams({ dates });
  return `${SCOREBOARD_ENDPOINT}?${params.toString()}`;
}

/** One headline into a canonical round label plus a game number; a rejection names what it read. */
export function parseHeadline(headline: string): HeadlineParse {
  const match = HEADLINE_PATTERN.exec(headline);
  if (!match) {
    return { reason: `headline "${headline}" is not "<round> - Game N"` };
  }
  const phrase = match[1].trim();
  const gameNumber = Number(match[2]);
  if (!Number.isInteger(gameNumber) || gameNumber < 1 || gameNumber > 7) {
    return { reason: `headline "${headline}" names game ${match[2]}, outside the 1..7 a best-of-seven series holds` };
  }
  const conference = CONFERENCE_PREFIX_PATTERN.exec(phrase);
  let depth: number | undefined;
  if (conference) {
    depth = CONFERENCE_ROUND_DEPTH.get(conference[2].trim().toLowerCase());
  } else if (phrase.toLowerCase() === LEAGUE_FINALS_PHRASE) {
    depth = LEAGUE_FINALS_DEPTH;
  }
  const round = depth === undefined ? undefined : labelForDepth(depth);
  if (depth === undefined || round === undefined) {
    // An unrecognised round phrase is an exclusion, never a new spelling: the
    // canonical list in `rounds.ts` is frozen, and the archive's 17 era
    // spellings are outside this story by owner rule.
    return { reason: `headline "${headline}" names the round phrase "${phrase}", outside the canonical vocabulary` };
  }
  return { depth, round, gameNumber };
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new EspnError(`${path} ${JSON.stringify(value)} is not a non-empty string — the feed's shape has drifted`);
  }
  return value;
}

/**
 * A final score as consumed: a finite, non-negative number, accepted as a number
 * or as a bare digit string. Anything else on a game the feed itself calls
 * `Final` is drift and throws — defaulting it would invent a result, which the
 * no-SLA constraint forbids.
 */
function readScore(value: unknown, describe: string, side: 'home' | 'away'): number {
  const numeric = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric) || numeric < 0) {
    throw new EspnError(
      `${describe}: ${side} score ${JSON.stringify(value)} is not a final non-negative number — a null or non-numeric score on a game ` +
        'the feed calls Final is feed shape drift, and it is refused rather than guessed',
    );
  }
  return numeric;
}

/**
 * One event into the parse's view of it. Nothing here decides admission: every
 * event is read first so `feedSeriesCount` can be counted BEFORE any exclusion
 * (the port rule `--require-feed` depends on, and the reason a parse that
 * dropped every game on a rule still reports a non-zero feed).
 */
function readEvent(event: unknown, index: number): ParsedEvent {
  const raw = event as Record<string, unknown>;
  const dateText = readString(raw.date, `event ${index}: events[].date`);
  if (!EVENT_DATE_PATTERN.test(dateText)) {
    throw new EspnError(`event ${index}: events[].date "${dateText}" is not an ISO date-time with a zone — the feed's shape has drifted`);
  }
  const stamp = new Date(dateText);
  if (Number.isNaN(stamp.getTime())) {
    throw new EspnError(`event ${index}: events[].date "${dateText}" is not a readable date — the feed's shape has drifted`);
  }
  // The identity year comes from the LOCAL date, never the stamp's UTC year
  // (payload-contract, `events[].date`): a game stamped `2027-01-01T03:00Z` was
  // played on 2026-12-31 in the league's own calendar.
  const local = etCalendarDay(stamp);
  const localDate = `${local.year}-${pad(local.month)}-${pad(local.day)}`;

  const status = raw.status as { type?: Record<string, unknown> } | undefined;
  const state = readString(status?.type?.state, `event ${index} ${dateText}: status.type.state`);
  const description = readString(status?.type?.description, `event ${index} ${dateText}: status.type.description`);

  const competition = (raw.competitions as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;
  if (!competition) {
    throw new EspnError(`event ${index} ${dateText}: no competitions[0] — a scoreboard event with no game to read is feed shape drift`);
  }
  const notes = competition.notes as unknown[] | undefined;
  const headline = (notes?.[0] as Record<string, unknown> | undefined)?.headline;
  const headlineText = typeof headline === 'string' && headline !== '' ? headline : null;

  const competitors = competition.competitors as unknown[] | undefined;
  if (!Array.isArray(competitors) || competitors.length !== 2) {
    throw new EspnError(
      `event ${index} ${dateText}: competitions[0].competitors holds ${Array.isArray(competitors) ? competitors.length : '(not an array)'} ` +
        'entries — exactly two sides are required to name a game, and a one-sided event cannot be guessed into a row',
    );
  }
  const seen: { side: string; code: string; score: unknown; espnId: string | null }[] = competitors.map((entry) => {
    const competitor = entry as Record<string, unknown>;
    const side = readString(competitor.homeAway, `event ${index} ${dateText}: competitions[].homeAway`);
    if (side !== 'home' && side !== 'away') {
      throw new EspnError(`event ${index} ${dateText}: competitions[].homeAway "${side}" is neither "home" nor "away" — the feed's shape has drifted`);
    }
    const code = readString(
      (competitor.team as Record<string, unknown> | undefined)?.abbreviation,
      `event ${index} ${dateText}: competitions[].team.abbreviation`,
    );
    if (!ESPN_CODE_PATTERN.test(code)) {
      throw new EspnError(
        `event ${index} ${dateText}: ESPN team code "${code}" is not a 2-4 letter upper-case abbreviation — refusing to fall back to a ` +
          'display name, a city, or any substring match (`teams.espn_code` is the only join key, Story 2.13)',
      );
    }
    // `team.id` is read for ONE purpose: joining the series standing's
    // per-team wins (Story 2.18). It is never an identity — that is
    // `teams.espn_code` through the abbreviation above, and nothing else.
    return { side, code, score: competitor.score, espnId: idText((competitor.team as Record<string, unknown> | undefined)?.id) };
  });
  const home = seen.find((entry) => entry.side === 'home');
  const away = seen.find((entry) => entry.side === 'away');
  if (!home || !away) {
    throw new EspnError(`event ${index} ${dateText}: competitors carry no ${home ? 'away' : 'home'} side — every game needs both to yield a score row`);
  }
  if (home.code === away.code) {
    throw new EspnError(`event ${index} ${dateText}: both sides carry the provider code "${home.code}" — a team cannot play itself`);
  }

  const parsed = headlineText === null ? null : parseHeadline(headlineText);
  const isHeadline = parsed !== null && 'depth' in parsed ? parsed : null;
  const headlineReason = parsed !== null && 'reason' in parsed ? parsed.reason : null;
  const headlinePart = headlineText === null ? ' (no headline)' : ', headline "' + headlineText + '"';
  return {
    describe: localDate + ' ' + home.code + '/' + away.code + ' — ' + state + '/' + description + headlinePart,
    year: local.year,
    localDate,
    state,
    description,
    headline: headlineText,
    headlineReason,
    depth: isHeadline ? isHeadline.depth : null,
    round: isHeadline ? isHeadline.round : null,
    gameNumber: isHeadline ? isHeadline.gameNumber : null,
    pairKey: localDate + '|' + [home.code, away.code].sort().join('|'),
    homeCode: home.code,
    awayCode: away.code,
    homeScoreRaw: home.score,
    awayScoreRaw: away.score,
    series: readSeries(competition.series, home.espnId, away.espnId),
  };
}

/** An id as ESPN prints it — a digit string, or a number — normalised to text; anything else is no id. */
function idText(value: unknown): string | null {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Story 2.18 — `competitions[0].series` into per-team wins. The join is
 * `series.competitors[].id` = `competitors[].team.id`; each side must match
 * exactly one entry. Position is never read: ESPN orders `series.competitors`
 * by its own rule, and the spike measured an order that does not follow
 * who won (GS–HOU `[0,1]` after Game 1).
 */
export function readSeries(value: unknown, homeId: string | null, awayId: string | null): SeriesRead {
  if (value === undefined || value === null) {
    return { kind: 'absent' };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'malformed', reason: `competitions[0].series is ${JSON.stringify(value)}, not an object` };
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.completed !== 'boolean') {
    return { kind: 'malformed', reason: `competitions[0].series.completed is ${JSON.stringify(raw.completed)}, not a boolean` };
  }
  const entries = raw.competitors;
  if (!Array.isArray(entries) || entries.length !== 2) {
    return {
      kind: 'malformed',
      reason: `competitions[0].series.competitors holds ${Array.isArray(entries) ? entries.length : '(not an array)'} entries, not two`,
    };
  }
  if (homeId === null || awayId === null) {
    return { kind: 'malformed', reason: 'competitors[].team.id is missing, so series.competitors[].id has nothing to join to' };
  }
  const winsOf = (teamId: string): number | string => {
    const matches = entries.filter((entry) => idText((entry as Record<string, unknown> | null)?.id) === teamId);
    if (matches.length !== 1) {
      return `series.competitors carries ${matches.length} entries for team.id "${teamId}" (ids ${entries
        .map((entry) => JSON.stringify((entry as Record<string, unknown> | null)?.id))
        .join(', ')})`;
    }
    const wins = (matches[0] as Record<string, unknown>).wins;
    if (typeof wins !== 'number' || !Number.isInteger(wins) || wins < 0 || wins > 4) {
      return `series.competitors wins ${JSON.stringify(wins)} for team.id "${teamId}" is not an integer 0..4`;
    }
    return wins;
  };
  const homeWins = winsOf(homeId);
  const awayWins = winsOf(awayId);
  if (typeof homeWins === 'string') return { kind: 'malformed', reason: homeWins };
  if (typeof awayWins === 'string') return { kind: 'malformed', reason: awayWins };
  return { kind: 'read', homeWins, awayWins, completed: raw.completed, type: typeof raw.type === 'string' ? raw.type : null };
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function terminalFetchError(url: string, reason: string, attempts: number): EspnError {
  return new EspnError(
    `GET ${url} failed after ${attempts} attempt(s): ${reason} — no manual_csv fallback was taken. ` +
      'Unset SERIES_SOURCE (or pass --source=manual_csv) to use the floor deliberately.',
  );
}

/** The scoreboard body as consumed: `events` must be an array. `leagues` and `provider` are not read. */
function eventsOf(body: unknown): unknown[] {
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) {
    throw new EspnError(
      'body carries no `events` array — not the scoreboard shape (a rejected parameter form answers exactly this way, so the run ' +
        'refuses instead of reading "no games" off a body nobody described)',
    );
  }
  return events;
}

/**
 * The selection and the plan rows. Admission is Final AND game 7; everything
 * else is excluded by rule and named, and the feed count is taken from every
 * event before any of that happens.
 */
function selectEvents(events: ParsedEvent[], deps: AdapterDeps, dates: string, url: string): EspnFeedResult {
  const resolver = deps.teamIdByEspnCode;
  if (!resolver) {
    throw new EspnError(
      'the espn adapter was constructed without deps.teamIdByEspnCode — `teams.espn_code` is the only admissible identity path, ' +
        'and there is deliberately no fallback to abbreviation, city or nickname matching',
    );
  }

  // Counted BEFORE exclusions, and on the provider codes rather than resolved
  // ids: a rest day and a route that answered `events: []` must look identical
  // to `--require-feed`, while a parse that dropped every game on a rule must
  // still report the feed it read.
  const feedSeriesCount = new Set(events.map((event) => event.pairKey)).size;

  const statuses: SeriesStatusRow[] = [];
  const scores: GameScoreRow[] = [];
  const admittedEvents: ParsedEvent[] = [];
  const notes: string[] = [];
  const depthCounts = new Map<number, number>();
  let excludedNonFinal = 0;
  let excludedNotGameSeven = 0;
  let excludedHeadline = 0;

  for (const event of events) {
    if (event.depth !== null) {
      depthCounts.set(event.depth, (depthCounts.get(event.depth) ?? 0) + 1);
    }

    // THE id path, walked for EVERY event the parse read and not only the
    // admitted ones: a provider code no `teams` row holds is a fact about the
    // TABLE, and learning it only when that franchise's Game 7 arrives is a
    // season late. Nothing else is admissible, and the abort names the code —
    // the loud failure that replaces a silent wrong-franchise insert.
    const homeId = resolver(event.homeCode);
    if (homeId === undefined) {
      throw new EspnError(
        `espn: unknown ESPN team code "${event.homeCode}" (${event.describe}, dates=${dates}) — no teams row holds it in espn_code. ` +
          `Refusing to match it by abbreviation, city, nickname or substring; seed it through a NEW migration (00018 is applied and its guards fix the 30-row seed) or fix the URL ${url}.`,
      );
    }
    const awayId = resolver(event.awayCode);
    if (awayId === undefined) {
      throw new EspnError(
        `espn: unknown ESPN team code "${event.awayCode}" (${event.describe}, dates=${dates}) — no teams row holds it in espn_code. ` +
          `Refusing to match it by abbreviation, city, nickname or substring; seed it through a NEW migration (00018 is applied and its guards fix the 30-row seed) or fix the URL ${url}.`,
      );
    }

    if (event.headline === null) {
      excludedHeadline += 1;
      notes.push(`espn: excluded ${event.describe} — competitions[0].notes[0].headline is absent, so neither the round nor the game number can be read`);
      continue;
    }
    if (event.round === null || event.gameNumber === null) {
      excludedHeadline += 1;
      notes.push(
        `espn: excluded ${event.describe} — ${event.headlineReason ?? 'the headline could not be read'}, and a new round spelling is never invented to admit a game`,
      );
      continue;
    }
    if (event.state !== 'post' || event.description !== 'Final') {
      excludedNonFinal += 1;
      notes.push(
        `espn: excluded ${event.describe} — only a game the feed itself calls Final/post is admitted, and an unobserved status string ` +
          'is never defaulted to "finished"',
      );
      continue;
    }
    if (event.gameNumber !== 7) {
      excludedNotGameSeven += 1;
      notes.push(
        `espn: excluded ${event.describe} — game ${event.gameNumber} of 7. This feed is date-granular, so only a series' game 7 can be ` +
          'carried alone; a Game 6 at 3–3 is detected separately and births through the bounded backfill (Story 2.18)',
      );
      continue;
    }

    const homeScore = readScore(event.homeScoreRaw, event.describe, 'home');
    const awayScore = readScore(event.awayScoreRaw, event.describe, 'away');
    if (homeScore === awayScore) {
      throw new EspnError(`espn: ${event.describe} has a tie score ${homeScore}-${awayScore} — every source game must be final and decided`);
    }
    const winnerTeamId = homeScore > awayScore ? homeId : awayId;

    // `team_a` here is game 7's HOME side: the adapter sees one game and cannot
    // know game 1's venue, which is exactly why `plan.ts` matches this shape
    // against the STORED pair instead of trusting the slots it is handed.
    statuses.push({
      year: event.year,
      round: event.round,
      team_a_id: homeId,
      team_b_id: awayId,
      winner_team_id: winnerTeamId,
    });
    scores.push({
      year: event.year,
      team_a_id: homeId,
      team_b_id: awayId,
      game_number: event.gameNumber,
      home_team_id: homeId,
      away_team_id: awayId,
      home_score: homeScore,
      away_score: awayScore,
    });
    admittedEvents.push(event);
  }

  const countsLine =
    `espn: ${feedSeriesCount} series in feed (dates=${dates}), ${statuses.length} Game-7 candidate(s) — excluded: ` +
    `${excludedNonFinal} not final, ${excludedNotGameSeven} final but not game 7, ${excludedHeadline} unreadable headline`;
  const histogramLine = `espn depth histogram ${formatHistogram(depthCounts)}`;
  const report: AdapterRunReport = { countsLine, histogramLine, feedSeriesCount, notes, alerts: [] };
  return { statuses, scores, report, parsed: events, admittedEvents };
}

/**
 * One request per run with Decision-6's retry posture, then the full parse into
 * port rows. `createEspnAdapter` wraps this in the memoised two-method port; the
 * owner-run probe (`scripts/probe-espn-adapter.mjs`) drives it through a real
 * fetch — no agent and no test ever does.
 */
export async function buildFeed(url: string, dates: string, deps: AdapterDeps): Promise<EspnFeedResult> {
  const events = await fetchScoreboardEvents(url, deps);
  const parsed = events.map((event, index) => readEvent(event, index));
  return selectEvents(parsed, deps, dates, url);
}

/**
 * The single-date request with the shipped retry posture, returning the raw
 * `events` array. Throws the terminal `EspnError` after the last attempt; the
 * run's own date lets that throw end the run (today's posture), while Story
 * 2.18's re-read and backfill dates catch it and turn it into an alert.
 */
async function fetchScoreboardEvents(url: string, deps: AdapterDeps): Promise<unknown[]> {
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
        headers: { ...ESPN_HEADERS },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      lastReason = `request threw: ${describeFetchThrow(error)}`;
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
    try {
      return eventsOf(body);
    } catch (error) {
      // A body that is not the scoreboard shape is drift, and drift is retried
      // as Story 2.4's retired adapter treated it — the terminal message still names the URL.
      lastReason = `response ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  throw terminalFetchError(url, lastReason, MAX_FEED_ATTEMPTS);
}

// ---------------------------------------------------------------------------
// Story 2.18 — the scheduled run births a series at 3–3
// (`sprint-change-proposal-2026-10-06.md`, owner decision option B).
//
// Every request below is the same single-date form through the same retry
// posture as the run's own date. What differs is the failure posture: the run's
// own date still ends the run when it cannot be read, while a re-read or
// backfill date that throws, drifts or times out becomes an ALERT and the run
// carries on — completions and the insights refresh must never wait on a
// backfill. `feedSeriesCount` is never touched here: it is the run's own date
// only (Story 2.6 D-3), so `--require-feed` cannot be satisfied by yesterday.
// ---------------------------------------------------------------------------

/** Games 1–5 are looked for on at most this many dates, Game 6's own date counted as the first (the spike's bound; it measured 13). */
export const BACKFILL_DATE_BOUND = 21;
/** Extra dates (re-read plus backfill) one run may request; retries of the same date are not counted separately. */
export const EXTRA_REQUEST_BUDGET = 25;
/** Wall-clock budget for the extra dates, checked before each new one starts — well under the workflow's 10-minute step. */
export const EXTRA_WALL_CLOCK_BUDGET_MS = 180_000;
/** Where every alert sends the owner. */
export const RUNBOOK_PATH = 'docs/PLAYOFF_RUNBOOK.md';

/** `YYYYMMDD` moved by whole calendar days, by `Date.UTC` arithmetic (month and year underflow included). */
export function shiftDates(dates: string, days: number): string {
  const shifted = new Date(Date.UTC(Number(dates.slice(0, 4)), Number(dates.slice(4, 6)) - 1, Number(dates.slice(6, 8)) + days));
  return `${shifted.getUTCFullYear()}${pad(shifted.getUTCMonth() + 1)}${pad(shifted.getUTCDate())}`;
}

type ExtraPage =
  | { ok: true; events: ParsedEvent[]; unreadable: string[] }
  | { ok: false; reason: string; budgetSpent: boolean };

interface ExtraPages {
  read(dates: string, purpose: string): Promise<ExtraPage>;
  /** Extra dates actually requested this run, in order — each at most once. */
  requested: string[];
  limit: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The per-run date cache plus the budget. A date is fetched at most once per
 * run whoever asks for it (the re-read, or the backfills, which run in turn),
 * and the run's own date is served from the primary parse without a request.
 * A failed date is cached as failed: it is alerted once and not re-asked.
 */
function createExtraPages(deps: AdapterDeps, primaryDates: string, primaryEvents: ParsedEvent[], alerts: string[]): ExtraPages {
  const budget = deps.extraFetchBudget ?? { requests: EXTRA_REQUEST_BUDGET, wallClockMs: EXTRA_WALL_CLOCK_BUDGET_MS };
  const clock = deps.monotonicNow ?? (() => performance.now());
  const startedAt = clock();
  const cache = new Map<string, ExtraPage>([[primaryDates, { ok: true, events: primaryEvents, unreadable: [] }]]);
  const requested: string[] = [];
  return {
    requested,
    limit: budget.requests,
    async read(dates, purpose) {
      const cached = cache.get(dates);
      if (cached) return cached;
      if (requested.length >= budget.requests) {
        return { ok: false, budgetSpent: true, reason: `the per-run budget of ${budget.requests} extra request(s) is spent` };
      }
      if (clock() - startedAt >= budget.wallClockMs) {
        return {
          ok: false,
          budgetSpent: true,
          reason: `the per-run wall-clock budget of ${Math.round(budget.wallClockMs / 1000)} s for extra requests is spent`,
        };
      }
      requested.push(dates);
      let page: ExtraPage;
      try {
        const raw = await fetchScoreboardEvents(scoreboardUrl(dates), deps);
        const events: ParsedEvent[] = [];
        const unreadable: string[] = [];
        raw.forEach((event, index) => {
          try {
            events.push(readEvent(event, index));
          } catch (error) {
            unreadable.push(messageOf(error));
          }
        });
        page = { ok: true, events, unreadable };
      } catch (error) {
        page = { ok: false, budgetSpent: false, reason: messageOf(error) };
        alerts.push(
          `espn: dates=${dates} (${purpose}) could not be read — ${messageOf(error)}. It is not counted in feedSeriesCount and the run ` +
            `carried on, but a Game 6 at 3–3 or a Game 7 on that date may have been missed; check it per ${RUNBOOK_PATH}`,
        );
      }
      cache.set(dates, page);
      return page;
    },
  };
}

/** What a Final event says about a birth: nothing, a silent non-candidate, a 3–3 Game 6, or a disagreement that must be loud. */
export type GameSixVerdict = { kind: 'none' } | { kind: 'silent'; why: string } | { kind: 'candidate' } | { kind: 'alert'; reason: string };

/**
 * Game 6 detection. The headline names the game when it can be read; when it
 * cannot, a Final event whose `series` stands 3–3 and not completed still
 * counts as a Game 6 (only a Game 6 can leave a best-of-seven there). Where
 * the two sources both speak and disagree, the verdict is an alert — never a
 * quiet pick of one.
 */
export function classifyGameSix(event: ParsedEvent): GameSixVerdict {
  if (event.state !== 'post' || event.description !== 'Final') {
    return { kind: 'none' };
  }
  const series = event.series;
  const tied = series.kind === 'read' && !series.completed && series.homeWins === 3 && series.awayWins === 3;
  const headlineGame = event.gameNumber;
  if (headlineGame !== null && headlineGame !== 6) {
    return tied
      ? {
          kind: 'alert',
          reason: `its headline names game ${headlineGame}, but competitions[0].series stands 3–3 and not completed, which only a Game 6 can`,
        }
      : { kind: 'none' };
  }
  if (headlineGame === 6) {
    if (series.kind === 'absent') {
      return { kind: 'alert', reason: 'competitions[0].series is absent, so the 3–3 cannot be read' };
    }
    if (series.kind === 'malformed') {
      return { kind: 'alert', reason: `${series.reason}, so the 3–3 cannot be read` };
    }
    const total = series.homeWins + series.awayWins;
    if (total !== 6) {
      return {
        kind: 'alert',
        reason: `its headline names game 6, but competitions[0].series wins total ${total} (home ${series.homeWins}, away ${series.awayWins})`,
      };
    }
    if (tied) return { kind: 'candidate' };
    if (series.completed && series.homeWins !== 3) {
      return { kind: 'silent', why: `the series was decided ${series.homeWins}-${series.awayWins} at game 6` };
    }
    return {
      kind: 'alert',
      reason: `competitions[0].series reads ${series.homeWins}-${series.awayWins} with completed=${series.completed}, which no Game 6 can`,
    };
  }
  if (tied && series.kind === 'read' && (series.type === null || series.type === 'playoff')) {
    return { kind: 'candidate' };
  }
  return { kind: 'none' };
}

interface BirthTarget {
  origin: string;
  pageDates: string;
  event: ParsedEvent;
  homeId: number;
  awayId: number;
  label: string;
}

interface AssembledBirth {
  status: SeriesStatusRow;
  scores: GameScoreRow[];
  label: string;
}

function pairLabel(year: number, left: string, right: string): string {
  return `${year} ${[left, right].sort().join('–')}`;
}

function pairKey(year: number, left: number, right: number): string {
  return `${year}|${Math.min(left, right)}|${Math.max(left, right)}`;
}

type BackfillOutcome = { ok: true; birth: AssembledBirth; note: string } | { ok: false; alert: string };

/**
 * Walk back from Game 6's date, one date at a time, for the target pair's
 * games 1–5, then certify the six. Only the target pair's games 1–5 are read
 * off a walked page — every other event there is ignored: never admitted,
 * completed, backfilled from or counted.
 */
async function backfillBirth(target: BirthTarget, pages: ExtraPages): Promise<BackfillOutcome> {
  const head = `${target.label} (Game 6 on dates=${target.pageDates}, ${target.origin}) stands 3–3 with no stored row, but`;
  const fail = (reason: string): BackfillOutcome => ({
    ok: false,
    alert: `espn: ${head} ${reason}. Nothing was born for it; curate it per ${RUNBOOK_PATH}`,
  });
  const pairCodes = new Set([target.event.homeCode, target.event.awayCode]);
  const found = new Map<number, { event: ParsedEvent; dates: string }>();
  const problems: string[] = [];
  const walked: string[] = [];
  let stoppedBy: string | null = null;

  for (let offset = 1; offset < BACKFILL_DATE_BOUND && found.size < 5; offset++) {
    const dates = shiftDates(target.pageDates, -offset);
    const page = await pages.read(dates, `backfill for ${target.label}`);
    if (!page.ok && page.budgetSpent) {
      stoppedBy = page.reason;
      break;
    }
    walked.push(dates);
    if (!page.ok) {
      problems.push(`dates=${dates} could not be read`);
      continue;
    }
    if (page.unreadable.length > 0) {
      problems.push(`dates=${dates} carried ${page.unreadable.length} event(s) the parse refused (${page.unreadable.join('; ')})`);
    }
    for (const event of page.events) {
      if (!pairCodes.has(event.homeCode) || !pairCodes.has(event.awayCode)) continue;
      const number = event.gameNumber;
      if (number === null) {
        problems.push(`${event.describe} has no readable game number (${event.headlineReason ?? 'no headline'})`);
        continue;
      }
      if (number < 1 || number > 5) {
        problems.push(`${event.describe} is game ${number}, dated before Game 6`);
        continue;
      }
      if (event.state !== 'post' || event.description !== 'Final') {
        problems.push(`${event.describe} is not Final`);
        continue;
      }
      const earlier = found.get(number);
      if (earlier) {
        return fail(`game ${number} appears twice in the walk (${earlier.event.describe}; ${event.describe})`);
      }
      found.set(number, { event, dates });
    }
  }

  const missing = [1, 2, 3, 4, 5].filter((number) => !found.has(number));
  if (missing.length > 0) {
    const span = walked.length > 0 ? `walked ${walked[0]}..${walked[walked.length - 1]}` : 'walked no date';
    const extra = [stoppedBy ? `stopped early: ${stoppedBy}` : null, ...problems].filter(Boolean).join('; ');
    return fail(
      `game(s) ${missing.join(', ')} were not found as Final, headline-numbered games of this pair within ${BACKFILL_DATE_BOUND} dates ` +
        `(${span}${extra ? `; ${extra}` : ''})`,
    );
  }

  // Certification. Games 1..6 in order: the walk's five plus Game 6 itself.
  const games = [1, 2, 3, 4, 5].map((number) => (found.get(number) as { event: ParsedEvent }).event).concat(target.event);
  const rounds = [...new Set(games.flatMap((event) => (event.round === null ? [] : [event.round])))];
  if (rounds.length !== 1) {
    return fail(`its games name ${rounds.length === 0 ? 'no round' : `different rounds (${rounds.join(', ')})`}`);
  }
  const offYear = games.find((event) => event.year !== target.event.year);
  if (offYear) {
    return fail(`${offYear.describe} falls in ${offYear.year}, not the Game 6 year ${target.event.year}`);
  }
  const wins = new Map<string, number>([...pairCodes].map((code) => [code, 0]));
  const scored: { event: ParsedEvent; homeScore: number; awayScore: number }[] = [];
  for (const [index, event] of games.entries()) {
    const number = index + 1;
    let homeScore: number;
    let awayScore: number;
    try {
      homeScore = readScore(event.homeScoreRaw, event.describe, 'home');
      awayScore = readScore(event.awayScoreRaw, event.describe, 'away');
    } catch (error) {
      return fail(`game ${number}: ${messageOf(error)}`);
    }
    if (homeScore === awayScore) {
      return fail(`game ${number} (${event.describe}) is tied ${homeScore}-${awayScore}`);
    }
    const winner = homeScore > awayScore ? event.homeCode : event.awayCode;
    wins.set(winner, (wins.get(winner) ?? 0) + 1);
    const standing = event.series;
    if (standing.kind !== 'read') {
      const why = standing.kind === 'absent' ? 'competitions[0].series is absent' : standing.reason;
      return fail(`game ${number} (${event.describe}): ${why}, so its own standing cannot cross-check the scores`);
    }
    // The progression cross-check: the event's own standing, joined per team,
    // must equal the running wins the SCORES of games 1..N give.
    const expectedHome = wins.get(event.homeCode) ?? 0;
    const expectedAway = wins.get(event.awayCode) ?? 0;
    if (standing.homeWins !== expectedHome || standing.awayWins !== expectedAway) {
      return fail(
        `game ${number} (${event.describe}): its own series standing reads ${event.homeCode} ${standing.homeWins}–${standing.awayWins} ` +
          `${event.awayCode}, but the scores of games 1–${number} give ${event.homeCode} ${expectedHome}–${expectedAway} ${event.awayCode}`,
      );
    }
    scored.push({ event, homeScore, awayScore });
  }
  if ([...wins.values()].some((count) => count !== 3)) {
    return fail(`its six scores split ${[...wins.entries()].map(([code, count]) => `${code} ${count}`).join(', ')} rather than 3–3`);
  }

  // `team_a` = Game 1's home team (AD-5), and every row of the pair uses that
  // one orientation, because `groupSourceRows` keys on the ordered pair.
  const idOf = (code: string) => (code === target.event.homeCode ? target.homeId : target.awayId);
  const gameOne = games[0];
  const teamA = idOf(gameOne.homeCode);
  const teamB = idOf(gameOne.awayCode);
  const year = target.event.year;
  const birth: AssembledBirth = {
    label: target.label,
    status: { year, round: rounds[0], team_a_id: teamA, team_b_id: teamB, winner_team_id: null },
    scores: scored.map(({ event, homeScore, awayScore }, index) => ({
      year,
      team_a_id: teamA,
      team_b_id: teamB,
      game_number: index + 1,
      home_team_id: idOf(event.homeCode),
      away_team_id: idOf(event.awayCode),
      home_score: homeScore,
      away_score: awayScore,
    })),
  };
  const foundOn = [1, 2, 3, 4, 5].map((number) => `G${number} ${(found.get(number) as { dates: string }).dates}`).join(', ');
  return {
    ok: true,
    birth,
    note:
      `espn: birth source assembled — ${target.label} ${rounds[0]}: games 1–6 certified (${foundOn}, G6 ${target.pageDates}; ` +
      `Game 1 home ${gameOne.homeCode} → team_a), every game's own series standing matches the running score wins`,
  };
}

interface SeenGameSeven {
  status: SeriesStatusRow;
  score: GameScoreRow;
  event: ParsedEvent;
  origin: string;
  pageDates: string;
}

/**
 * The run beyond its own date: re-read the previous date for Game 6s at 3–3
 * (never for Game 7s), backfill and certify them, fold the run date's Game 7
 * into its birth, and drop (loudly) a run-date Game 7 whose pair is known to
 * be unborn. The primary result's
 * `feedSeriesCount`, counts line and histogram pass through untouched.
 */
async function extendWithBirths(primary: EspnFeedResult, dates: string, deps: AdapterDeps): Promise<EspnFeedResult> {
  const resolver = deps.teamIdByEspnCode as (code: string) => number | undefined;
  const stored = (year: number, left: number, right: number): boolean | undefined =>
    deps.isPairStored ? deps.isPairStored(year, left, right) : undefined;
  const notes: string[] = [];
  const alerts: string[] = [];
  const pages = createExtraPages(deps, dates, primary.parsed ?? [], alerts);

  const targets: BirthTarget[] = [];
  const consider = (event: ParsedEvent, origin: string, pageDates: string, homeId: number, awayId: number) => {
    const verdict = classifyGameSix(event);
    if (verdict.kind === 'none') return;
    const label = pairLabel(event.year, event.homeCode, event.awayCode);
    if (stored(event.year, homeId, awayId) === true) {
      notes.push(`espn: ${label} Game 6 (${event.describe}) — the pair is already stored; no backfill`);
      return;
    }
    if (verdict.kind === 'silent') {
      notes.push(`espn: ${label} Game 6 (${event.describe}) — ${verdict.why}; no birth`);
      return;
    }
    if (verdict.kind === 'alert') {
      alerts.push(
        `espn: ${label} (${event.describe}, dates=${pageDates}, ${origin}) — ${verdict.reason}. Nothing was born for it; check it per ${RUNBOOK_PATH}`,
      );
      return;
    }
    const key = pairKey(event.year, homeId, awayId);
    if (targets.some((target) => pairKey(target.event.year, target.homeId, target.awayId) === key)) return;
    targets.push({ origin, pageDates, event, homeId, awayId, label });
  };

  // The run's own date: `selectEvents` already resolved every code or threw.
  for (const event of primary.parsed ?? []) {
    consider(event, 'the run date', dates, resolver(event.homeCode) as number, resolver(event.awayCode) as number);
  }

  const sevens: SeenGameSeven[] = (primary.admittedEvents ?? []).map((event, index) => ({
    status: primary.statuses[index],
    score: primary.scores[index],
    event,
    origin: 'the run date',
    pageDates: dates,
  }));

  // The previous date, for births only: Game 6s at 3–3. Its Game 7s are NOT
  // read for completions (owner decision 2026-10-06, Story 2.18 review): a
  // completion comes from the run's own date only, so a red run always means
  // the run's own date, and yesterday's finished series is never re-planned.
  const rereadDates = shiftDates(dates, -1);
  const reread = await pages.read(rereadDates, 're-read of the previous date');
  if (reread.ok) {
    let gameSixSignals = 0;
    let gameSevensIgnored = 0;
    if (reread.unreadable.length > 0) {
      alerts.push(
        `espn: dates=${rereadDates} (re-read of the previous date) carried ${reread.unreadable.length} event(s) the parse refused ` +
          `(${reread.unreadable.join('; ')}) — a Game 6 at 3–3 there may have been missed; check it per ${RUNBOOK_PATH}`,
      );
    }
    for (const event of reread.events) {
      if (event.gameNumber === 7) {
        gameSevensIgnored += 1;
        continue;
      }
      if (classifyGameSix(event).kind === 'none') continue;
      const homeId = resolver(event.homeCode);
      const awayId = resolver(event.awayCode);
      if (homeId === undefined || awayId === undefined) {
        alerts.push(
          `espn: ${event.describe} (dates=${rereadDates}, re-read) carries an ESPN code no teams.espn_code holds ` +
            `("${homeId === undefined ? event.homeCode : event.awayCode}"); it was skipped — check it per ${RUNBOOK_PATH}`,
        );
        continue;
      }
      gameSixSignals += 1;
      consider(event, 're-read', rereadDates, homeId, awayId);
    }
    // Printed only when the re-read carried games: an empty previous date (a
    // rest day, the whole offseason) adds no line to the report.
    if (reread.events.length > 0) {
      notes.push(
        `espn re-read dates=${rereadDates} (the previous date, births only; never counted in feedSeriesCount): ` +
          `${reread.events.length} event(s), ${gameSixSignals} Game-6 signal(s), ${gameSevensIgnored} Game 7(s) ignored`,
      );
    }
  } else {
    notes.push(`espn re-read dates=${rereadDates} (the previous date) could not be read: ${reread.reason}`);
    if (reread.budgetSpent) {
      alerts.push(`espn: the re-read of dates=${rereadDates} never ran — ${reread.reason}; check that date per ${RUNBOOK_PATH}`);
    }
  }

  // Backfill each target in turn; the date cache shares pages between them.
  const births = new Map<string, AssembledBirth>();
  for (const target of targets) {
    notes.push(`espn: ${target.label} Game 6 at 3–3 (${target.event.describe}, ${target.origin}) — no stored row; backfilling games 1–5`);
    const outcome = await backfillBirth(target, pages);
    if (outcome.ok) {
      births.set(pairKey(target.event.year, target.homeId, target.awayId), outcome.birth);
      notes.push(outcome.note);
    } else {
      alerts.push(outcome.alert);
    }
  }

  // Assemble: kept Game 7s in feed order, then the births.
  const statuses: SeriesStatusRow[] = [];
  const scores: GameScoreRow[] = [];
  for (const seven of sevens) {
    const birth = births.get(pairKey(seven.status.year, seven.status.team_a_id, seven.status.team_b_id));
    if (birth) {
      // Seven games seen in one run: birth plus follow-up, every row in the
      // birth's `team_a` = Game 1 home orientation.
      birth.scores.push({ ...seven.score, team_a_id: birth.status.team_a_id, team_b_id: birth.status.team_b_id });
      birth.status.winner_team_id = seven.status.winner_team_id;
      notes.push(`espn: ${birth.label} Game 7 (${seven.event.describe}, ${seven.origin}) folded into its birth — seven games, birth plus completion`);
      continue;
    }
    if (stored(seven.status.year, seven.status.team_a_id, seven.status.team_b_id) === false) {
      alerts.push(
        `espn: ${pairLabel(seven.status.year, seven.event.homeCode, seven.event.awayCode)} Game 7 (${seven.event.describe}, ` +
          `dates=${seven.pageDates}, ${seven.origin}) has no stored row and no birth was assembled for it this run — the series was ` +
          `never born, so this Game 7 cannot complete it and was left out of the plan. Birth it with games 1–7 per ${RUNBOOK_PATH}`,
      );
      continue;
    }
    statuses.push(seven.status);
    scores.push(seven.score);
  }
  for (const birth of births.values()) {
    statuses.push(birth.status);
    scores.push(...birth.scores);
  }

  if (targets.length > 0) {
    notes.push(
      `espn extra requests: ${pages.requested.length} of a ${pages.limit}-date budget (dates ${pages.requested.join(', ')}) — none ` +
        'counted in feedSeriesCount',
    );
  }
  const report: AdapterRunReport = {
    ...primary.report,
    notes: [...primary.report.notes, ...notes],
    alerts: [...primary.report.alerts, ...alerts],
  };
  return { statuses, scores, report, parsed: primary.parsed, admittedEvents: [] };
}

/**
 * The registry factory. `deps.now` is the seam tests pin the run instant with;
 * the requested date is derived from it and is never a parameter, a constant, or
 * a flag (`ADAPTER_FLAGS` gives `espn` no flags at all).
 */
export function createEspnAdapter(deps: AdapterDeps): SeriesDataSource {
  const runInstant = (deps.now ?? (() => new Date()))();
  const dates = deriveRequestDate(runInstant);
  const url = scoreboardUrl(dates);

  let feedPromise: Promise<EspnFeedResult> | null = null;
  let settled: EspnFeedResult | null = null;
  function feed(): Promise<EspnFeedResult> {
    if (!feedPromise) {
      // The run's own date first, with today's failure posture (a throw ends
      // the run); only then the isolated extra dates of Story 2.18.
      feedPromise = buildFeed(url, dates, deps)
        .then((primary) => extendWithBirths(primary, dates, deps))
        .then((result) => {
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
        throw new EspnError('espn describeRun() called before the feed resolved — the report describes a parse that has not happened yet');
      }
      return settled.report;
    },
  };
}
