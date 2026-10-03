/**
 * THROWAWAY — Story 2.6's blocked-cadence egress probe. Delete once one result has been
 * read; it is not a pipeline component and has no callers.
 *
 * Why it exists: `stats.nba.com` answers Node from the owner's residential connection
 * (2/2) and returns zero bytes to a GitHub-hosted runner (9/9 attempts, three dispatches).
 * The scheduling decision hangs on the one untested combination — Supabase's egress.
 *
 * It accepts no input, so there is no target an attacker can choose: the URL below is the
 * byte-identical string the runner and the local probe already used.
 */

const FEED_URL =
  'https://stats.nba.com/stats/leaguegamelog?Counter=1000&DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&Period=0&PlayerOrTeam=T&Season=2026-27&SeasonSegment=&SeasonType=Playoffs&SortColumn=DATE&SortDir=ASC';

// The same six headers as `supabase/scripts/pipeline/adapters/nbaCom.ts:81-89` and the same
// 25 s abort, so this result reads directly against the Node and curl cells.
const FEED_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

const FEED_TIMEOUT_MS = 25000;
// Two attempts worst case is 50 s, inside the free plan's 150 s wall clock. A single
// transient would otherwise read as a block, and the adapter's own posture is to retry.
const MAX_ATTEMPTS = 2;

const EIPIFY_URL = 'https://api.ipify.org?format=json';
const EIPIFY_TIMEOUT_MS = 5000;

interface Attempt {
  startedAt: string;
  elapsedMs: number;
  httpStatus: number | null;
  bodyChars: number | null;
  error: string | null;
  jsonParsed: boolean;
  rowSetKind: 'array' | 'null' | 'missing' | 'other' | 'notReached';
  rowCount: number | null;
}

function classifyRowSet(body: unknown): { kind: Attempt['rowSetKind']; rowCount: number | null } {
  const candidate = body as { resultSets?: { rowSet?: unknown }[] } | null;
  const first = Array.isArray(candidate?.resultSets) ? candidate.resultSets[0] : undefined;
  if (!first || !('rowSet' in first)) return { kind: 'missing', rowCount: null };
  const rowSet = first.rowSet;
  if (rowSet === null) return { kind: 'null', rowCount: null };
  if (Array.isArray(rowSet)) return { kind: 'array', rowCount: rowSet.length };
  return { kind: 'other', rowCount: null };
}

async function attemptFeed(): Promise<Attempt> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  try {
    const response = await fetch(FEED_URL, {
      headers: FEED_HEADERS,
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    // Read the body exactly once: a Response body is a stream, and a second .text()
    // would return empty and make a passing run look unparseable.
    const text = await response.text();
    const shape = { startedAt, elapsedMs: elapsed(), httpStatus: response.status, bodyChars: text.length };
    if (!response.ok) {
      return { ...shape, error: `status ${response.status}`, jsonParsed: false, rowSetKind: 'notReached', rowCount: null };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ...shape, error: 'body is not JSON', jsonParsed: false, rowSetKind: 'notReached', rowCount: null };
    }
    const { kind, rowCount } = classifyRowSet(parsed);
    return { ...shape, error: null, jsonParsed: true, rowSetKind: kind, rowCount };
  } catch (error) {
    return {
      startedAt,
      elapsedMs: elapsed(),
      httpStatus: null,
      bodyChars: null,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      jsonParsed: false,
      rowSetKind: 'notReached',
      rowCount: null,
    };
  }
}

// Best effort, and its own failure is not evidence about the feed — it is a different host.
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

  const attempts: Attempt[] = [];
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const attempt = await attemptFeed();
    attempts.push(attempt);
    if (attempt.httpStatus === 200 && attempt.jsonParsed) break;
  }

  const answered = attempts.some((a) => a.httpStatus === 200 && a.jsonParsed);
  const verdict = answered
    ? 'EGRESS ANSWERED — Supabase reached the feed. Read rowSetKind before trusting it: "array" is the shape the adapter needs.'
    : 'EGRESS BLOCKED OR UNPARSEABLE — and note this cell conflates two variables: Supabase egress IP AND Deno/Hyper as the client. A red here does not by itself say which.';

  return Response.json({
    verdict,
    ranAt: new Date().toISOString(),
    target: FEED_URL,
    attempts,
    egressIp: await readEgressIp(),
  });
});
