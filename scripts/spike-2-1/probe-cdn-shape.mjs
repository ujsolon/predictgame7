#!/usr/bin/env node
// Story 2.1 spike: does cdn.nba.com's schedule blob carry the fields
// series / series_game_scores need?  Prints the observed field names, not a guess.
const YEAR = process.argv[2] || '2025-26';
const blobUrl = `https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json`;
const res = await fetch(blobUrl, {
  headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.nba.com/' },
  signal: AbortSignal.timeout(30000),
});
const json = await res.json();
const wrap = json?.leagueSchedule ?? json;
const season = wrap?.seasonYear;
const dates = wrap?.gameDates ?? json?.gameDates ?? [];
const games = dates.flatMap((d) => d.games ?? []);
console.log(`top-level keys: ${Object.keys(json).join(', ')}`);
console.log(`leagueSchedule keys: ${wrap === json ? '(absent)' : Object.keys(wrap).join(', ')}`);
console.log(`seasonYear ${season}; gameDates ${dates.length}; games ${games.length}`);
console.log(`\nGame object keys:\n  ${Object.keys(games[0] ?? {}).join(', ')}`);
const g = games[0] ?? {};
console.log(`\nhomeTeam keys:\n  ${Object.keys(g.homeTeam ?? {}).join(', ')}`);
console.log(`awayTeam keys:\n  ${Object.keys(g.awayTeam ?? {}).join(', ')}`);

const stages = {};
for (const game of games) stages[game.gameStageType ?? '?'] = (stages[game.gameStageType ?? '?'] ?? 0) + 1;
console.log(`\ngameStageType histogram: ${JSON.stringify(stages)}`);

const final = (x) => x.gameStatus === 3 || x.gameStatusText === 'Final';
const finals = games.filter(final);
console.log(`games with gameStatus Final/3: ${finals.length} of ${games.length}`);

const po = finals.filter((x) => (x.gameStageType ?? 0) >= 3);
console.log(`playoff games with a final score: ${po.length}`);
const sample = po.find((x) => x.season === YEAR) ?? po[0];
if (sample) {
  console.log(`\nsample playoff game (${sample.season}, stage ${sample.gameStageType}):`);
  for (const k of ['gameId', 'gameCode', 'season', 'gameDateTimeUTC', 'gameStageType', 'gameStatusText', 'seriesGame', 'gameSubSeriesID', 'roundId', 'intl']) {
    if (k in sample) console.log(`  ${k} = ${JSON.stringify(sample[k])}`);
  }
  for (const side of ['homeTeam', 'awayTeam']) {
    const t = sample[side] ?? {};
    console.log(`  ${side}: id=${t.teamId} tri=${t.teamTriCode} name=${t.teamName} score=${t.score ?? t.teamScore} winLoss=${t.winLoss ?? JSON.stringify(t.winLoss)}`);
  }
}

// Series grouping: what key would collapse games into a playoff series?
const groupKeys = ['seriesGame', 'gameSubSeriesID', 'roundId', 'gameId'];
for (const key of groupKeys) {
  const present = po.filter((x) => key in x).length;
  console.log(`grouping candidate ${key}: present on ${present}/${po.length}`);
}
const bySeries = {};
for (const x of po) {
  const id = x.gameSubSeriesID ?? x.seriesGame ?? x.gameId;
  bySeries[id] = bySeries[id] || { games: 0, stage: x.gameStageType, season: x.season };
  bySeries[id].games += 1;
}
const sizes = {};
for (const v of Object.values(bySeries)) sizes[v.games] = (sizes[v.games] ?? 0) + 1;
console.log(`\nseries size histogram (games per ${groupKeys.join('/')} group): ${JSON.stringify(sizes)}`);
const sevens = Object.values(bySeries).filter((v) => v.games === 7);
console.log(`series with exactly 7 games: ${sevens.length}; with 4: ${Object.values(bySeries).filter((v) => v.games === 4).length}; groups: ${Object.keys(bySeries).length}`);
if (sevens.length) console.log(`sample 7-game group: ${JSON.stringify(sevens[0])}`);
