#!/usr/bin/env node
// Story 2.1 spike, fourth pass: (a) can leaguegamelog rebuild a series as
// exactly-N games with home/away scores, for a historical season?  (b) does a
// per-game detail endpoint still exist?  (c) what does the keyed-provider
// alternate do with no key present?
// NOTE: this pass's `analyse` grouping mis-parses the "vs." home form, so its
// series counts and histograms are wrong — probe-series-rebuild.mjs is the
// corrected grouping. The endpoint-survival and provider-auth findings stand.
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

const get = async (url, extra = {}) => {
  const t = Date.now();
  try {
    const res = await fetch(url, { headers: { ...H, ...extra }, signal: AbortSignal.timeout(25000) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, bytes: text.length, ms: Date.now() - t, json, text, rate: Object.fromEntries([...res.headers].filter(([k]) => k.toLowerCase().startsWith('x-ratelimit'))) };
  } catch (err) {
    return { status: 'ERR', bytes: 0, ms: Date.now() - t, text: `${err.name}: ${err.message}`, json: null, rate: {} };
  }
};

const gamelog = (season) =>
  `https://stats.nba.com/stats/leaguegamelog?Counter=1000&DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&Period=0&PlayerOrTeam=T&Season=${season}&SeasonSegment=&SeasonType=Playoffs&SortColumn=DATE&SortDir=ASC`;

// One team row per game, so a matchup is a pair; group to get series length.
const analyse = (label, season) => {
  return get(gamelog(season)).then((r) => {
    const set = r.json?.resultSets?.[0];
    console.log(`\n=== leaguegamelog ${season} (${label}) — HTTP ${r.status}, ${r.bytes}b, ${r.ms}ms ===`);
    if (!set) {
      console.log(`no resultSets: ${String(r.text).slice(0, 100).replace(/\s+/g, ' ')}`);
      return r;
    }
    const idx = Object.fromEntries(set.headers.map((h, i) => [h, i]));
    const rows = set.rowSet;
    const byPair = new Map();
    for (const row of rows) {
      const abbr = row[idx.TEAM_ABBREVIATION];
      const matchup = row[idx.MATCHUP];
      const opp = matchup.includes('@') ? matchup.split(' @ ')[1].split(' (')[0] : matchup.split(' vs ')[1];
      const pair = [abbr, opp].sort().join('-');
      const g = byPair.get(pair) ?? { games: new Map(), opp };
      const gameId = row[idx.GAME_ID];
      const game = g.games.get(gameId) ?? {};
      const home = matchup.startsWith(`${abbr} @`) ? 'away' : 'home';
      game[home] = { team: abbr, pts: row[idx.PTS], wl: row[idx.WL], date: row[idx.GAME_DATE] };
      g.games.set(gameId, game);
      byPair.set(pair, g);
    }
    console.log(`team-rows=${rows.length} games=${new Set(rows.map((x) => x[idx.GAME_ID])).size} series=${byPair.size}`);
    const hist = {};
    const incomplete = [];
    for (const [pair, g] of byPair) {
      const n = g.games.size;
      hist[n] = (hist[n] ?? 0) + 1;
      const bothSides = [...g.games.values()].filter((game) => game.home && game.away).length;
      if (n === 7 && bothSides !== 7) incomplete.push(`${pair}: 7 games but ${bothSides} with both sides`);
    }
    console.log(`games-per-series histogram: ${JSON.stringify(hist)}`);
    const sevens = [...byPair].filter(([, g]) => g.games.size === 7);
    console.log(`7-game series: ${sevens.length}; rows missing an opponent side: ${incomplete.length}`);
    for (const [pair, g] of sevens.slice(0, 1)) {
      console.log(`\nsample 7-game series ${pair}:`);
      for (const [gameId, game] of g.games) {
        console.log(`  ${gameId} ${game.date}  home ${game.home?.team} ${game.home?.pts}  away ${game.away?.team} ${game.away?.pts}`);
      }
    }
    return r;
  });
};

await analyse('archive-consistency test: 2025-26', '2025-26');
await analyse('historical depth test: 1993-94', '1993-94');
await analyse('historical depth test: 2015-16', '2015-16');

console.log('\n=== per-game detail endpoint survival ===');
for (const [name, url] of [
  ['boxscore', 'https://stats.nba.com/stats/boxscore?GameID=0042400404&Range=All&Context=Full'],
  ['boxscoretraditionalv2', 'https://stats.nba.com/stats/boxscoretraditionalv2?GameID=0042400404&EndPeriod=10&EndRange=28800&RangeType=0&StartPeriod=0&StartRange=0'],
]) {
  const r = await get(url);
  const names = r.json?.resultSets?.map((s) => `${s.name}:${s.rowSet?.length ?? 0}`).join(' ');
  console.log(`${name} -> HTTP ${r.status} ${r.bytes}b ${r.ms}ms ${names ?? String(r.text).slice(0, 60).replace(/\s+/g, ' ')}`);
}

console.log('\n=== keyed-provider alternate, probed WITHOUT a key (none in .env) ===');
const providers = [
  ['balldontlie /games 2026 playoffs', 'https://api.balldontlie.io/v1/games?seasons[]=2025&playoffs=true&per_page=3', { 'Authorization': process.env.BALLDONTLIE_API_KEY ?? '' }],
  ['api-sports /v1/seasons', 'https://api-v2.balldontlie.io/v1/games?dates=2026-06-01', {}],
  ['theSportsAPI NBA standings (free tier)', 'https://api.thesportsdb.com/v2/json/api_allstandingsv1.php?l=NBA', { 'X-RapidAPI-Key': process.env.RAPIDAPI_KEY ?? '' }],
];
for (const [name, url, extra] of providers) {
  const r = await get(url, extra);
  const keySent = Object.entries(extra).some(([, v]) => v);
  console.log(`\n${name}\n  url ${url}\n  key supplied: ${keySent}`);
  console.log(`  HTTP ${r.status} ${r.bytes}b ${r.ms}ms ratelimits=${JSON.stringify(r.rate)}`);
  console.log(`  body ${String(r.text).slice(0, 160).replace(/\s+/g, ' ')}`);
}
