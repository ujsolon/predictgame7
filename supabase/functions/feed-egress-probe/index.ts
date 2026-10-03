/**
 * THROWAWAY — Story 2.6's blocked-cadence egress probe, round 2. Delete once read; it is not a
 * pipeline component and has no callers.
 *
 * Round 1 answered one cell and it came back red: `stats.nba.com` gave two silent 25 s timeouts
 * from this exact function (08:38 UTC, egress IP 3.39.233.171), matching GitHub-hosted Node at 0/9,
 * while Node from the owner's residential connection passes 2/2. So the variable that matters is the
 * LOCATION, not the scheduler. This round asks the only question that can still change the design:
 * does any other source answer a cloud IP?
 *
 * It accepts no input, so there is no target an attacker can choose. Every candidate is a public,
 * unauthenticated, read-only URL.
 */

interface Candidate {
  name: string;
  url: string;
  headers: Record<string, string>;
  // Dot path whose shape decides whether this source could feed the pipeline at all.
  path: string;
  why: string;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// The adapter's exact header set (supabase/scripts/pipeline/adapters/nbaCom.ts:81-89), kept on the
// control so this run reads against round 1 and against the local Node PASS.
const STATS_HEADERS: Record<string, string> = {
  'User-Agent': BROWSER_UA,
  Accept: 'application/json',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

const PLAIN_HEADERS: Record<string, string> = {
  'User-Agent': BROWSER_UA,
  Accept: 'application/json',
};

// 2026-04-20 is inside the 2026 playoff window, so a 200 here carries real games rather than an
// empty envelope — the shape check means something only if there is data behind it.
const CANDIDATES: Candidate[] = [
  {
    name: 'stats_control',
    url: 'https://stats.nba.com/stats/leaguegamelog?Counter=1000&DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&Period=0&PlayerOrTeam=T&Season=2026-27&SeasonType=Playoffs&SortColumn=DATE&SortDir=ASC',
    headers: STATS_HEADERS,
    path: 'resultSets.0.rowSet',
    why: 'The control. Round 1 read red 2/2 from here; a green now would mean the block is intermittent, not structural.',
  },
  {
    name: 'cdn_scoreboard_today',
    url: 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json',
    headers: PLAIN_HEADERS,
    path: 'scoreboard.games',
    why: 'NBA-owned static-asset CDN, a different filter class from the bot-guarded stats host. Scoreboard day only.',
  },
  {
    name: 'cdn_schedule_league',
    url: 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json',
    headers: PLAIN_HEADERS,
    path: 'league.schedule',
    why: 'Whole-season game list with dates, teams and venues — the closest cdn analogue to what the adapter needs.',
  },
  {
    name: 'espn_scoreboard_dated',
    url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20260420',
    headers: PLAIN_HEADERS,
    path: 'events',
    why: 'The owner-named candidate, requested directly with no relay in the path. Public JSON, date-windowed, carries results and venues.',
  },
  {
    name: 'bball_ref_playoffs',
    url: 'https://www.basketball-reference.com/playoffs/',
    headers: PLAIN_HEADERS,
    path: 'games',
    why: 'The owner-named candidate. HTML not JSON, so a green here reads as status 200 with "body is not JSON" — reachability proven, shape not.',
  },
];

// 5 candidates x 15 s = 75 s, plus the ipify call at 5 s, against the free plan's 150 s wall clock.
// One attempt each and a shorter abort than round 1: the ceiling buys breadth, and a CDN or a public
// API that has not answered in 15 s is not going to answer. The stats control loses 10 s of timeout,
// and its 2/2-at-25 s evidence is already on the record from round 1.
const CANDIDATE_TIMEOUT_MS = 15000;

// A multi-MB schedule file is not worth parsing inside a 2 s CPU budget; reachability is the
// question this round answers, and the shape is a bonus when the body is small enough to read.
const MAX_PARSE_BYTES = 4_000_000;

const EIPIFY_URL = 'https://api.ipify.org?format=json';
const EIPIFY_TIMEOUT_MS = 5000;

interface PathProbe {
  kind: 'array' | 'object' | 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'other';
  length: number | null;
  keys: string[] | null;
}

function kindOf(value: unknown): PathProbe['kind'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'object':
      return 'object';
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'other';
  }
}

function probePath(body: unknown, path: string): PathProbe {
  let cursor: unknown = body;
  for (const segment of path.split('.')) {
    if (cursor === null || cursor === undefined) break;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  const kind = kindOf(cursor);
  return {
    kind,
    length: Array.isArray(cursor) ? cursor.length : null,
    keys: kind === 'object' ? Object.keys(cursor as object).slice(0, 12) : null,
  };
}

interface Result {
  name: string;
  url: string;
  why: string;
  startedAt: string;
  elapsedMs: number;
  httpStatus: number | null;
  contentType: string | null;
  bodyChars: number | null;
  error: string | null;
  jsonParsed: boolean | null;
  pathProbe: PathProbe | null;
  topLevelKeys: string[] | null;
}

async function tryCandidate(candidate: Candidate): Promise<Result> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const shape: Omit<Result, 'elapsedMs' | 'httpStatus' | 'contentType' | 'bodyChars' | 'error' | 'jsonParsed' | 'pathProbe' | 'topLevelKeys'> = {
    name: candidate.name,
    url: candidate.url,
    why: candidate.why,
    startedAt,
  };

  try {
    const response = await fetch(candidate.url, {
      headers: candidate.headers,
      signal: AbortSignal.timeout(CANDIDATE_TIMEOUT_MS),
    });
    // Read the body exactly once — a Response body is a stream, and a second .text() returns empty.
    const text = await response.text();
    const base = {
      ...shape,
      elapsedMs: Date.now() - started,
      httpStatus: response.status,
      contentType: response.headers.get('content-type'),
      bodyChars: text.length,
    };
    if (!response.ok) {
      return { ...base, error: `status ${response.status}`, jsonParsed: false, pathProbe: null, topLevelKeys: null };
    }
    if (text.length > MAX_PARSE_BYTES) {
      return { ...base, error: `body too large to parse here (${text.length} chars)`, jsonParsed: null, pathProbe: null, topLevelKeys: null };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ...base, error: 'body is not JSON (html interstitial?)', jsonParsed: false, pathProbe: null, topLevelKeys: null };
    }
    return {
      ...base,
      error: null,
      jsonParsed: true,
      pathProbe: probePath(parsed, candidate.path),
      topLevelKeys: kindOf(parsed) === 'object' ? Object.keys(parsed as object).slice(0, 12) : null,
    };
  } catch (error) {
    return {
      ...shape,
      elapsedMs: Date.now() - started,
      httpStatus: null,
      contentType: null,
      bodyChars: null,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      jsonParsed: false,
      pathProbe: null,
      topLevelKeys: null,
    };
  }
}

// Best effort, and its own failure is not evidence about any candidate — it is a different host.
async function readEgressIp(): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(EIPIFY_URL, { signal: AbortSignal.timeout(EIPIFY_TIMEOUT_MS) });
    if (!response.ok) return { ok: false, note: `status ${response.status}` };
    const body = (await response.json()) as { ip?: unknown };
    return { ok: true, ip: typeof body.ip === 'string' ? body.ip : null };
  } catch (error) {
    return { ok: false, note: error instanceof Error ? error.name : String(error) };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405 });

  const results: Result[] = [];
  for (const candidate of CANDIDATES) results.push(await tryCandidate(candidate));

  const usable = results.filter((r) => r.httpStatus === 200 && r.jsonParsed);
  const blocked = results.filter((r) => r.httpStatus === 200 && r.jsonParsed !== true);
  const silent = results.filter((r) => r.httpStatus === null);
  const answeredButRefused = results.filter((r) => r.httpStatus !== null && r.httpStatus !== 200);

  return Response.json({
    verdict: usable.length > 0
      ? `HOSTED SOURCE EXISTS — ${usable.map((r) => r.name).join(', ')} answered with parseable JSON from a cloud IP. Read each pathProbe before believing it can feed the pipeline: kind "array" with length > 0 is the shape that matters, and a length of 0 may just mean no games that day.`
      : `NO CANDIDATE FED PARSEABLE JSON. Silent (no bytes, same shape as the stats block): ${silent.map((r) => r.name).join(', ') || 'none'}. Answered but not usable (status/shape): ${[...blocked, ...answeredButRefused].map((r) => r.name).join(', ') || 'none'}.`,
    note: 'One attempt per candidate at 15 s, so a single transient reads as blocked; the stats control carries 3/3 reds across two runs of this function. Pass/fail across four clients and three locations tracks the LOCATION and the CDN owner, not the scheduler: the whole nba.com family (stats. silent, cdn. 403) refuses cloud egress, while independent hosts answer it fast. This project\'s Supabase egress IP also rotated between runs (3.39.233.171 then 43.201.97.153), so a red is not one address being listed.',
    ranAt: new Date().toISOString(),
    results,
    egressIp: await readEgressIp(),
  });
});
