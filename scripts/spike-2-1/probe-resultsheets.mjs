#!/usr/bin/env node
// Story 2.1 spike, third pass: read the `resultSets` envelope and print the
// actual column headers, so the field mapping in the decision record is copied
// from the wire rather than from a library's docs.
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

const show = (label, json) => {
  const sets = json?.resultSets ?? [];
  console.log(`\n=== ${label} ===`);
  console.log(`resource=${json?.resource} resultSets=${sets.length}`);
  for (const s of sets) {
    const rows = s.rowSet ?? [];
    console.log(`  name=${s.name} rows=${rows.length}`);
    console.log(`  headers: ${(s.headers ?? []).join(', ')}`);
    if (rows.length) console.log(`  row0: ${JSON.stringify(rows[0])}`);
  }
};

const get = async (url) => {
  const res = await fetch(url, { headers: H, signal: AbortSignal.timeout(25000) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep null */
  }
  return { status: res.status, bytes: text.length, json, text };
};

const cases = [
  ['leaguegamelog 2025-26 Playoffs (team rows)', 'https://stats.nba.com/stats/leaguegamelog?Counter=1000&DateFrom=&DateTo=&GameSegment=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&Period=0&PlayerOrTeam=T&Season=2025-26&SeasonSegment=&SeasonType=Playoffs&SortColumn=DATE&SortDir=DESC'],
  ['scoreboardv2 2025-06-13 (Finals game 5)', 'https://stats.nba.com/stats/scoreboardv2?GameDate=06%2F13%2F2025&LeagueID=00&DayOffset=0'],
  ['boxscore of a 2025 Finals game', 'https://stats.nba.com/stats/boxscore?GameID=0042400401&Range=All&Context=Full'],
  ['franchisehistory', 'https://stats.nba.com/stats/franchisehistory?LeagueID=00'],
];

for (const [label, url] of cases) {
  const r = await get(url);
  console.log(`\n[${r.status} ${r.bytes}b] ${url.slice(0, 110)}`);
  if (r.json) show(label, r.json);
  else console.log(`non-JSON: ${r.text.slice(0, 120).replace(/\s+/g, ' ')}`);
}
