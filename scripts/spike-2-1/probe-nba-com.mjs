#!/usr/bin/env node
// Story 2.1 (Q-4) spike probe: does the unkeyed nba.com route answer the four
// AC questions?  GET only, no secrets, nothing written to the repo.
// Run: node scripts/spike-2-1/probe-nba-com.mjs [--year=2026] [--only=<substr>]
// CORRECTION (same day): this first pass read stats.nba.com's 400/500s as if the
// route were blocked.  It was not — the params were incomplete.  See
// probe-resultsheets.mjs and probe-series-rebuild.mjs for the working requests;
// the data.nba.net DNS failures and the cdn.nba.com 200 recorded here stand.
// no module imports: this script only fetches


const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : dflt;
};
const YEAR = Number(arg('year', 2026));
const ONLY = arg('only', null);
const TIMEOUT_MS = 15000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// stats.nba.com rejects requests without a browser-ish UA + an nba.com referer.
const headers = (host) => ({
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': host.includes('stats.nba.com') ? 'stats' : undefined,
  'x-nba-stats-token': host.includes('stats.nba.com') ? 'true' : undefined,
});

// Each candidate is judged against the four AC probes, not on whether it returns 200.
const CANDIDATES = [
  {
    id: 'playoffinline',
    url: `https://stats.nba.com/stats/playoffinline?leagueFamilyId=intl&year=${YEAR}`,
    wants: ['bracket', 'series-status', 'per-game-score'],
    note: 'NBA bracket tree per season; series + game scores inline',
  },
  {
    id: 'leaguegamelog-playoffs',
    url: `https://stats.nba.com/stats/leaguegamelog?Counter=ALL&Season=${YEAR - 1}-${String(YEAR).slice(2)}&SeasonType=Playoffs&LeagueID=00&PlayerOrTeam=T&SortDir=DESC&SortColumn=DATE`,
    wants: ['per-game-score', 'historical'],
    note: 'Team game log: HOME_TEAM_ID, Team_Away/Team_Home scores per game',
  },
  {
    id: 'scoreboardv2',
    url: `https://stats.nba.com/stats/scoreboardv2?DayOffset=0&leagueID=1&renderAll=false`,
    wants: ['series-status', 'per-game-score'],
    note: ' games on a date incl. series_status when in playoffs',
  },
  {
    id: 'cdn-scheduleLeague',
    url: 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json',
    wants: ['per-game-score', 'historical'],
    note: 'Full league schedule JSON, one blob, includes final scores',
  },
  {
    id: 'data-nba-bracket',
    url: `https://data.nba.net/prod/v2/${YEAR}/playoffs/bracket.json`,
    wants: ['bracket', 'series-status'],
    note: 'Legacy data.nba.net bracket (v1 and v2 both seen in the wild)',
  },
  {
    id: 'data-nba-legacy-bracket',
    url: `https://data.nba.net/10s/prod/v1/${YEAR}/playoffs/bracket.json`,
    wants: ['bracket', 'series-status'],
    note: 'Older 10s/v1 bracket path',
  },
  {
    id: 'data-nba-daily-scores',
    url: `https://data.nba.net/prod/v2/${YEAR}/scores/20260613/games.json`,
    wants: ['per-game-score'],
    note: 'Daily games feed with home/away final scores',
  },
];

const keys = (o, depth = 0, seen = []) => {
  if (depth > 2 || o === null || typeof o !== 'object') return seen;
  for (const k of Object.keys(o).slice(0, 40)) {
    seen.push(k);
    keys(o[k], depth + 1, seen);
  }
  return [...new Set(seen)];
};

// Field mapping probes: the decision record needs to know whether a real
// home/away score and a series status are actually present, by name.
const FIELD_PROBES = {
  'home/away score': ['team_home', 'team_away', 'HOME_TEAM_ID', 'home_team', 'homeTeam', 'away_team'],
  'series status': ['series_status', 'seriesStatus', 'conf_seed', 'best_of_series_status'],
  'game number': ['game_id', 'GAME_ID', 'series_game', 'gameStatus', 'game_datetime'],
};

async function probe(candidate) {
  const host = new URL(candidate.url).host;
  const started = Date.now();
  const record = { ...candidate, ms: null, status: null, contentType: null, bytes: null, verdict: null, fields: {}, error: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(candidate.url, { headers: headers(host), signal: controller.signal, redirect: 'follow' });
    record.status = res.status;
    record.contentType = res.headers.get('content-type');
    const text = await res.text();
    record.bytes = text.length;
    record.ms = Date.now() - started;
    if (!text) {
      record.verdict = 'empty body';
      return record;
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      record.verdict = `non-JSON body (${text.slice(0, 60).replace(/\s+/g, ' ')})`;
      return record;
    }
    const found = keys(json);
    record.topKeys = found.slice(0, 45);
    for (const [label, needles] of Object.entries(FIELD_PROBES)) {
      record.fields[label] = needles.filter((n) => found.includes(n));
    }
    const resultCount =
      json.result?.result?.length ?? json.games?.length ?? json.league?.games?.length ?? null;
    record.rowCount = resultCount;
    record.verdict = 'parsed';
  } catch (err) {
    record.ms = Date.now() - started;
    record.error = `${err.name}: ${err.message}`;
    record.verdict = 'request failed';
  } finally {
    clearTimeout(timer);
  }
  return record;
}

const out = [];
for (const c of CANDIDATES) {
  if (ONLY && !c.id.includes(ONLY)) continue;
  out.push(await probe(c));
}

for (const r of out) {
  console.log(`\n=== ${r.id} ===`);
  console.log(`url      ${r.url}`);
  console.log(`role     ${r.note}`);
  console.log(`wants    ${r.wants.join(', ')}`);
  console.log(`status   ${r.status ?? '-'}  ${r.ms ?? '?'}ms  ${r.bytes ?? '?'} bytes  type=${r.contentType ?? '-'}`);
  console.log(`verdict  ${r.verdict}${r.error ? ` (${r.error})` : ''}`);
  if (r.rowCount !== undefined) console.log(`rows     ${r.rowCount ?? 'not a recognised shape'}`);
  for (const [label, hits] of Object.entries(r.fields)) {
    if (hits.length) console.log(`fields   ${label}: ${hits.join(', ')}`);
  }
  if (r.topKeys) console.log(`keys     ${r.topKeys.join(' ')}`);
}

console.log(`\n${out.length} candidate(s) probed`);
process.exit(0);
