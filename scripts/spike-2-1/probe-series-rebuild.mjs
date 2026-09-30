#!/usr/bin/env node
// Story 2.1 spike, fifth pass: get MATCHUP formats from the wire first, then
// group games into series correctly.  The previous pass mis-parsed MATCHUP and
// reported a series histogram that was an artifact of that bug.
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};
const gamelog = (season) =>
  `https://stats.nba.com/stats/leaguegamelog?Counter=1000&DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&Period=0&PlayerOrTeam=T&Season=${season}&SeasonSegment=&SeasonType=Playoffs&SortColumn=DATE&SortDir=ASC`;

for (const season of ['2025-26', '1993-94']) {
  const res = await fetch(gamelog(season), { headers: H, signal: AbortSignal.timeout(25000) });
  const json = await res.json();
  const set = json.resultSets[0];
  const i = Object.fromEntries(set.headers.map((h, n) => [h, n]));
  const rows = set.rowSet;
  console.log(`\n===== ${season}: ${rows.length} team rows =====`);
  console.log(`MATCHUP formats seen: ${[...new Set(rows.map((r) => r[i.MATCHUP].replace(/[A-Z]{3}/g, 'XXX')))].join(' | ')}`);
  console.log(`sample rows: ${rows.slice(0, 2).map((r) => JSON.stringify([r[i.GAME_ID], r[i.GAME_DATE], r[i.TEAM_ABBREVIATION], r[i.MATCHUP], r[i.PTS], r[i.WL]])).join('  ')}`);

  // Each game emits two rows, one per team; the home side is the row whose
  // MATCHUP uses "vs" for that team.  Pair on the two-team set + date.
  const games = new Map();
  for (const r of rows) {
    const matchup = r[i.MATCHUP];
    const atIndex = matchup.indexOf(' @ ');
    const isAway = atIndex >= 0;
    // MATCHUP is written from this row's team perspective and the home form is
    // "HOME vs. AWAY" (with the period), so tokenise rather than split once.
    const [own, other] = matchup.split(isAway ? ' @ ' : ' vs. ');
    const key = `${r[i.GAME_DATE]}|${[own, other].sort().join('|')}`;
    const g = games.get(key) ?? { id: r[i.GAME_ID], date: r[i.GAME_DATE], home: null, away: null };
    const slot = isAway ? 'away' : 'home';
    const otherSlot = isAway ? 'home' : 'away';
    g[slot] = { team: own, pts: r[i.PTS], wl: r[i.WL] };
    // The opposing row already filled otherSlot with its score; only the name
    // may be written here, or the merge loses one side every game.
    g[otherSlot] = Object.assign({ team: other }, g[otherSlot]);
    g.complete = Boolean(g.home?.team && g.away?.team && g.home.team !== g.away.team && g.home.pts != null && g.away.pts != null);
    games.set(key, g);
  }
  const list = [...games.values()];
  const complete = list.filter((g) => g.home?.team && g.away?.team && g.home.team !== g.away.team);
  console.log(`grouped games=${games.size} with distinct home+away sides=${complete.length}`);
  const bad = list.filter((g) => g.home?.team === g.away?.team);
  console.log(`parse collisions (home===away): ${bad.length}${bad.length ? ` e.g. ${bad[0].id} ${bad[0].date}` : ''}`);

  // Series = the set of games between the same two teams, ordered by date.
  const byPair = new Map();
  for (const g of complete) {
    const pair = [g.home.team, g.away.team].sort().join('-');
    byPair.set(pair, [...(byPair.get(pair) ?? []), g]);
  }
  const hist = {};
  for (const [, gs] of byPair) hist[gs.length] = (hist[gs.length] ?? 0) + 1;
  console.log(`pairs=${byPair.size} games-per-pair histogram=${JSON.stringify(hist)}`);
  const sevens = [...byPair].filter(([, gs]) => gs.length === 7);
  console.log(`7-game pairs: ${sevens.length}`);
  for (const [pair, gs] of sevens.slice(0, 2)) {
    const withBothScores = gs.filter((g) => g.complete);
    const homeWins = gs.filter((g) => g.home.wl === 'W').length;
    const awayWins = gs.filter((g) => g.away.wl === 'W').length;
    const byDate = [...gs].sort((a, b) => a.date.localeCompare(b.date));
    const g7 = byDate[byDate.length - 1];
    console.log(`  ${pair}: ${gs.length} games (${withBothScores.length} with both scores), home ${homeWins}-${awayWins}, last game ${g7.id} ${g7.date} won by ${g7.home.wl === 'W' ? g7.home.team : g7.away.team}`);
    for (const g of byDate) console.log(`    ${g.id} ${g.date}  ${g.away.team} ${g.away.pts ?? '-'} @ ${g.home.team} ${g.home.pts ?? '-'}`);
  }
  const sizes = {};
  for (const [, gs] of byPair) {
    const hw = gs.filter((g) => g.home.wl === 'W').length;
    const aw = gs.filter((g) => g.away.wl === 'W').length;
    sizes[`${Math.max(hw, aw)}-${Math.min(hw, aw)}`] = (sizes[`${Math.max(hw, aw)}-${Math.min(hw, aw)}`] ?? 0) + 1;
  }
  console.log(`home-role vs away-role win tallies (NOT series records; a 7-game series may read 2-5): ${JSON.stringify(sizes)}`);
}
