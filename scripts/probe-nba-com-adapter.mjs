#!/usr/bin/env node
// Story 2.4 — the committed live leg for AC:369, owner-run (spec Decision 12:
// this session's policy refused the agent's outbound probe, so the owner runs
// this and pastes its output into the spec's ## Implementation Notes).
//
// Unkeyed, read-only, ZERO Supabase calls: one leaguegamelog fetch of one
// postseason — the same route, headers and parse the adapter ships — plus
// exactly one boxscoretraditionalv2 fetch for the cross-check leg. Series
// reconstruction with the chain-depth round derivation; per-game home/away
// scores printed for every Game 7 candidate; one completed Game 7
// cross-checked field-by-field against its box score.
//
// Usage:  node scripts/probe-nba-com-adapter.mjs [--season=YYYY-YY]
// Without --season the season derives from today's UTC date exactly like the
// adapter (offseason today => an empty feed is the EXPECTED shape, not a bug —
// pass --season=2025-26 to probe the most recent completed postseason).
//
// Exit codes: 0 ran and cross-checked; 2 could not run (feed refused, shape
// drift, no completed Game 7 to cross-check, or the cross-check disagreed).
// Never process.exit — this repo's spike learned that an explicit exit races
// libuv on Windows (deferred-work.md, Story 2.2 entry); set process.exitCode.
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

const gamelogUrl = (season) =>
  `https://stats.nba.com/stats/leaguegamelog?Counter=1000&DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&Period=0&PlayerOrTeam=T&Season=${season}&SeasonSegment=&SeasonType=Playoffs&SortColumn=DATE&SortDir=ASC`;

const boxscoreUrl = (gameId) =>
  `https://stats.nba.com/stats/boxscoretraditionalv2?GameID=${gameId}&EndPeriod=10&EndRange=28800&RangeType=0&StartPeriod=0&StartRange=0`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Three attempts with backoff on 403/429/5xx or a non-resultSets body — the adapter's posture. */
async function getSets(url, attempts = 3) {
  let last = 'no attempt';
  for (let n = 1; n <= attempts; n++) {
    if (n > 1) await sleep(n === 2 ? 1000 : 4000);
    try {
      const res = await fetch(url, { headers: H, signal: AbortSignal.timeout(25000) });
      if (!res.ok) {
        last = `HTTP ${res.status}`;
        if (res.status !== 403 && res.status !== 429 && res.status < 500) break;
        continue;
      }
      const json = await res.json();
      const sets = json?.resultSets;
      if (!Array.isArray(sets) || !Array.isArray(sets[0]?.headers) || !Array.isArray(sets[0]?.rowSet)) {
        last = 'response is not the expected resultSets shape';
        continue;
      }
      return sets;
    } catch (err) {
      last = `${err.name}: ${err.message}`;
    }
  }
  throw new Error(`${url} -> ${last}`);
}

function deriveSeason(now) {
  const start = now.getUTCMonth() <= 5 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

async function main() {
  const seasonFlag = process.argv.find((a) => a.startsWith('--season='))?.slice('--season='.length);
  if (seasonFlag !== undefined && !/^\d{4}-\d{2}$/.test(seasonFlag)) {
    console.error(`--season=${seasonFlag} is not a YYYY-YY identifier`);
    return 2;
  }
  const now = new Date();
  const season = seasonFlag ?? deriveSeason(now);
  const runDateUtc = now.toISOString().slice(0, 10);
  console.log(`nba_com adapter probe — season ${season} (run UTC date ${runDateUtc}), unkeyed, no Supabase calls`);

  let sets;
  try {
    sets = await getSets(gamelogUrl(season));
  } catch (err) {
    console.error(`feed refused: ${err.message}`);
    return 2;
  }
  const set = sets[0];
  const i = Object.fromEntries(set.headers.map((h, n) => [h, n]));
  for (const column of ['GAME_ID', 'GAME_DATE', 'TEAM_ID', 'TEAM_ABBREVIATION', 'MATCHUP', 'PTS']) {
    if (i[column] === undefined) {
      console.error(`shape drift: leaguegamelog headers lack ${column}`);
      return 2;
    }
  }
  console.log(`leaguegamelog answered: ${set.rowSet.length} team rows`);

  // ---------- games: merge the two team rows on (date, unordered pair) ----------
  // The home form is "TEAM vs. TEAM" — the trailing period is load bearing.
  const games = new Map();
  for (const r of set.rowSet) {
    const gameId = String(r[i.GAME_ID]);
    const date = String(r[i.GAME_DATE]);
    const matchup = String(r[i.MATCHUP]);
    const at = matchup.indexOf(' @ ');
    const isAway = at >= 0;
    const sep = isAway ? ' @ ' : ' vs. ';
    const vs = matchup.indexOf(sep);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || vs < 0) {
      console.error(`shape drift: ${gameId} date "${date}" matchup "${matchup}"`);
      return 2;
    }
    const own = matchup.slice(0, vs).trim();
    const other = matchup.slice(vs + sep.length).trim();
    const key = `${date}|${[own, other].sort().join('|')}`;
    const g = games.get(key) ?? { id: gameId, date, home: {}, away: {} };
    const side = isAway ? g.away : g.home;
    const opp = isAway ? g.home : g.away;
    side.abbr = own;
    side.id = Number(r[i.TEAM_ID]);
    side.pts = r[i.PTS];
    if (opp.abbr === undefined) opp.abbr = other;
    games.set(key, g);
  }
  const sameDay = [...games.values()].filter((g) => g.date === runDateUtc);
  const list = [...games.values()].filter((g) => g.date !== runDateUtc);
  console.log(`games: ${games.size} merged, ${sameDay.length} excluded as played on the run date (spec Decision 5)`);

  // ---------- series: group by (year, unordered team-id pair), number by date ----------
  const byPair = new Map();
  for (const g of list) {
    if (!Number.isFinite(g.home.id) || !Number.isFinite(g.away.id) || g.home.id === g.away.id) {
      console.error(`shape drift: game ${g.id} sides ${JSON.stringify(g.home)} / ${JSON.stringify(g.away)}`);
      return 2;
    }
    if (g.home.pts === null || g.home.pts === undefined || g.away.pts === null || g.away.pts === undefined || g.home.pts === g.away.pts) {
      console.error(`shape drift: game ${g.id} pts ${g.home.pts}/${g.away.pts} — undecided or tied on a past date`);
      return 2;
    }
    const key = `${g.date.slice(0, 4)}|${Math.min(g.home.id, g.away.id)}|${Math.max(g.home.id, g.away.id)}`;
    byPair.set(key, [...(byPair.get(key) ?? []), g]);
  }
  for (const [key, gs] of byPair) byPair.set(key, gs.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)));

  // ---------- chain depth (spec Decision 10) ----------
  const LABELS = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
  const all = [...byPair.entries()].map(([key, gs]) => ({ key, gs, ids: key.split('|').slice(1).map(Number), start: gs[0].date }));
  all.sort((a, b) => a.start.localeCompare(b.start) || (a.key < b.key ? -1 : 1));
  const prev = new Map();
  const hist = {};
  for (const s of all) {
    s.depth = Math.max(prev.get(s.ids[0]) ?? 0, prev.get(s.ids[1]) ?? 0) + 1;
    prev.set(s.ids[0], Math.max(prev.get(s.ids[0]) ?? 0, s.depth));
    prev.set(s.ids[1], Math.max(prev.get(s.ids[1]) ?? 0, s.depth));
    hist[s.depth] = (hist[s.depth] ?? 0) + 1;
  }
  const candidates = [];
  let excludedShape = 0;
  let unexplained = 0;
  for (const s of all) {
    const label = LABELS[s.depth - 1];
    const teamAId = s.gs[0].home.id;
    const aWins = s.gs.filter((g) => (g.home.pts > g.away.pts ? g.home.id : g.away.id) === teamAId).length;
    if (!(s.gs.length === 7 || (s.gs.length === 6 && aWins === 3))) {
      excludedShape++;
      continue;
    }
    if (!label) {
      unexplained++;
      console.log(`EXCLUDED (derived depth ${s.depth} outside 1..4): ${s.key.split('|').slice(1).join(' vs ')}`);
      continue;
    }
    candidates.push({ ...s, label });
  }
  console.log(`series=${all.length} game7Candidates=${candidates.length} excludedByShape=${excludedShape} roundUnexplainable=${unexplained} sameDayGames=${sameDay.length}`);
  console.log(`depth histogram: {${Object.keys(hist).sort((a, b) => a - b).map((d) => `${d}:${hist[d]}`).join(', ')}}`);

  for (const c of candidates) {
    const decided = c.gs.length === 7;
    const winner = decided ? (c.gs[6].home.pts > c.gs[6].away.pts ? c.gs[6].home : c.gs[6].away) : null;
    console.log(
      `\n${c.gs[0].date.slice(0, 4)} ${c.label}: ${c.gs[0].home.abbr} vs ${c.gs[0].away.abbr} — ` +
        `${decided ? `COMPLETED, winner ${winner.abbr}` : 'PENDING (certified 3-3)'}`,
    );
    for (const [n, g] of c.gs.entries()) {
      console.log(`  g${n + 1}: ${g.away.abbr} ${g.away.pts} @ ${g.home.abbr} ${g.home.pts}   (${g.id} ${g.date})`);
    }
  }

  // ---------- cross-check one completed Game 7 against boxscoretraditionalv2 ----------
  const completed = candidates.filter((c) => c.gs.length === 7);
  if (completed.length === 0) {
    console.error('\nno completed Game 7 in this feed — nothing to cross-check; re-run with --season=<a postseason that has one>');
    return 2;
  }
  const g7 = completed[0].gs[6];
  console.log(`\ncross-check: Game 7 ${g7.id} (${g7.date}) ${g7.away.abbr} ${g7.away.pts} @ ${g7.home.abbr} ${g7.home.pts}`);
  let boxSets;
  try {
    boxSets = await getSets(boxscoreUrl(g7.id));
  } catch (err) {
    console.error(`boxscoretraditionalv2 refused: ${err.message}`);
    return 2;
  }
  // The first sheet carrying both TEAM_ID and PTS (per-player lines): summing
  // PTS by TEAM_ID reproduces each team's final score.
  const teamPts = new Map();
  for (const rs of boxSets) {
    const bi = Object.fromEntries((rs.headers ?? []).map((h, n) => [h, n]));
    if (bi.TEAM_ID === undefined || bi.PTS === undefined || !Array.isArray(rs.rowSet)) continue;
    for (const row of rs.rowSet) {
      teamPts.set(row[bi.TEAM_ID], (teamPts.get(row[bi.TEAM_ID]) ?? 0) + (row[bi.PTS] ?? 0));
    }
    break;
  }
  if (teamPts.size === 0) {
    console.error('cross-check failed: no boxscore sheet carried both TEAM_ID and PTS');
    return 2;
  }
  let pass = teamPts.size === 2;
  for (const side of [g7.home, g7.away]) {
    const boxPts = teamPts.get(side.id);
    const ok = boxPts === side.pts;
    pass = pass && ok;
    console.log(`  ${side.abbr} (id ${side.id}): feed ${side.pts} vs boxscore ${boxPts ?? '(team not found)'} — ${ok ? 'PASS' : 'FAIL'}`);
  }
  if (!pass) {
    console.error('cross-check failed — the box score does not confirm the feed scores');
    return 2;
  }
  console.log('\nprobe passed: feed, reconstruction, round derivation and the Game 7 box-score cross-check agree.');
  return 0;
}

main().then((code) => {
  process.exitCode = code;
});
