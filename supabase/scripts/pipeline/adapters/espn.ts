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
 *   probed.
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
 *   Measured divergences: ESPN prints `NY` for the Knicks (`NYK`, id 20) and
 *   `SA` for the Spurs (`SAS`, id 27); `CLE`/`TOR`/`DEN` agree. A code that
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
 *   must exit non-zero rather than invent a row.
 * - Failure posture (the same discipline as `nbaCom.ts`): 25 s
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

/** One event as the parse saw it, before admission. Scores stay raw: an unfinished game legitimately carries none. */
interface ParsedEvent {
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
}

export interface EspnFeedResult {
  statuses: SeriesStatusRow[];
  scores: GameScoreRow[];
  report: AdapterRunReport;
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
  const seen: { side: string; code: string; score: unknown }[] = competitors.map((entry) => {
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
    return { side, code, score: competitor.score };
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
  };
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
          `Refusing to match it by abbreviation, city, nickname or substring; add the code through migration 00018 or fix the URL ${url}.`,
      );
    }
    const awayId = resolver(event.awayCode);
    if (awayId === undefined) {
      throw new EspnError(
        `espn: unknown ESPN team code "${event.awayCode}" (${event.describe}, dates=${dates}) — no teams row holds it in espn_code. ` +
          `Refusing to match it by abbreviation, city, nickname or substring; add the code through migration 00018 or fix the URL ${url}.`,
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
          'carried alone; games 1-6 arrive through the curated path (Story 2.7)',
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
  }

  const countsLine =
    `espn: ${feedSeriesCount} series in feed (dates=${dates}), ${statuses.length} Game-7 candidate(s) — excluded: ` +
    `${excludedNonFinal} not final, ${excludedNotGameSeven} final but not game 7, ${excludedHeadline} unreadable headline`;
  const histogramLine = `espn depth histogram ${formatHistogram(depthCounts)}`;
  const report: AdapterRunReport = { countsLine, histogramLine, feedSeriesCount, notes };
  return { statuses, scores, report };
}

/**
 * One request per run with Decision-6's retry posture, then the full parse into
 * port rows. `createEspnAdapter` wraps this in the memoised two-method port; the
 * owner-run probe (`scripts/probe-espn-adapter.mjs`) drives it through a real
 * fetch — no agent and no test ever does.
 */
export async function buildFeed(url: string, dates: string, deps: AdapterDeps): Promise<EspnFeedResult> {
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
    let events: unknown[];
    try {
      events = eventsOf(body);
    } catch (error) {
      // A body that is not the scoreboard shape is drift, and drift is retried
      // the way nbaCom treats it — the terminal message still names the URL.
      lastReason = `response ${error instanceof Error ? error.message : String(error)}`;
      continue;
    }
    const parsed = events.map((event, index) => readEvent(event, index));
    return selectEvents(parsed, deps, dates, url);
  }
  throw terminalFetchError(url, lastReason, MAX_FEED_ATTEMPTS);
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
      feedPromise = buildFeed(url, dates, deps).then((result) => {
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
