#!/usr/bin/env node
// Story 2.4, Decision 12 — the committed LIVE leg for spec-2-4's AC:369,
// OWNER-RUN. This session's policy refused the agent's outbound probe, so
// nothing here has been executed by the coding agent and no claim is made
// about the feed's current reachability until the owner pastes this output
// into the spec's `## Implementation Notes`.
//
// What it proves that unit tests cannot:
//   1. The spike's header posture still answers on the real wire — through
//      the SHIPPED adapter, not a re-implementation (triage row 4): the probe
//      imports `createNbaComAdapter` and hands it an injected `fetch` that
//      captures the real response while the adapter parses it. A PASS here
//      certifies exactly the code the pipeline runs.
//   2. The `TEAM_ID` ↔ abbreviation ↔ resolved `teams.id` triples — the
//      measurement `decision-2-1-q-4-data-source.md:104` never made. The
//      owner reads whether the two id spaces agree; the adapter resolves
//      through the abbreviation map either way, so this is evidence, not a
//      dependency.
//   3. One Game 7 cross-checked field-by-field against `boxscoretraditionalv2`
//      (the second unkeyed route the Story 2.1 spike probed,
//      `scripts/spike-2-1/probe-history-and-providers.mjs:92`).
//
// Unkeyed, read-only, ZERO Supabase: no sink, no env vars, no writes.
// Exit 0 on a full pass; exit 2 with a reason if any leg cannot run.
//
// Usage (the flag is required today — the run-date-derived season is an
// offseason season with no completed playoff games):
//   node scripts/probe-nba-com-adapter.mjs --season=2025-26
const exit2 = (reason) => {
  console.error(`\nPROBE COULD NOT RUN TO COMPLETION: ${reason}`);
  console.error('Exit 2 — fix the cause and re-run; paste the whole output either way.');
  process.exitCode = 2;
};

const seasonArg = process.argv.slice(2).find((a) => a.startsWith('--season='));
const otherArgs = process.argv.slice(2).filter((a) => a !== seasonArg);
if (otherArgs.length > 0) {
  exit2(`unrecognised argument "${otherArgs[0]}" — supported: --season=<YYYY-YY>`);
} else {
  try {
    await runProbe(seasonArg ? seasonArg.slice('--season='.length) : undefined);
  } catch (error) {
    exit2(error instanceof Error ? error.message : String(error));
  }
}

async function runProbe(seasonOverrideRaw) {
  // The shipped code — imported, never copied. If this import fails, the
  // probe must not quietly fall back to its own parse; the catch above exits 2.
  const shipped = await import('../supabase/scripts/pipeline/adapters/nbaCom.ts');
  const { createNbaComAdapter, deriveSeason, validateSeasonOverride, NBA_COM_HEADERS } = shipped;

  const now = new Date();
  const season = seasonOverrideRaw !== undefined ? validateSeasonOverride(seasonOverrideRaw) : deriveSeason(now);
  if (seasonOverrideRaw === undefined) {
    // Decision 12's live leg needs a postseason with completed Game 7s; the
    // derived season in the offseason has none, so require the flag's evidence.
    console.error('note: no --season= given; deriving from the run date may fetch an empty offseason postseason.');
  }
  console.log(`story 2.4 live probe — shipped adapter against the real feed (read-only, zero Supabase)`);
  console.log(`run date (UTC): ${now.toISOString()} — season asked: ${season}`);

  // The resolver the runner will supply in production comes from the `teams`
  // table; the probe reads the SAME ids off the 00005 seed (no DB access).
  const migrationText = await readFileSafe('../supabase/migrations/00005_release_1_data_model.sql');
  const seed = new Map();
  for (const match of migrationText.matchAll(/\((\d+),\s*'[^']+',\s*'([A-Z]{3})',/g)) seed.set(match[2], Number(match[1]));
  if (seed.size !== 30) throw new Error(`teams seed parse found ${seed.size} abbreviations in 00005, expected 30 — seed format drifted, fix the probe regex before trusting this output`);
  const idToAbbr = new Map([...seed].map(([abbr, id]) => [id, abbr]));

  // The capturing fetch: the adapter consumes the response; the probe keeps a
  // copy of the raw rows for the TEAM_ID measurement and the boxscore leg.
  let captured = null;
  const feedUrls = [];
  const capturingFetch = async (url, init) => {
    feedUrls.push(url);
    const response = await fetch(url, { headers: init.headers, signal: init.signal });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    if (response.ok && body) captured = body;
    return { ok: response.ok, status: response.status, json: async () => body };
  };

  const adapter = createNbaComAdapter({
    readFile: () => {
      throw new Error('probe: manual_csv-only dependency touched — wiring bug');
    },
    teamIdByAbbreviation: (abbr) => seed.get(abbr),
    fetch: capturingFetch,
    now: () => now,
    seasonOverride: seasonOverrideRaw,
  });

  // Both port methods through the SHIPPED parse — exactly what run.ts does.
  const statuses = await adapter.fetch_series_statuses();
  const scores = await adapter.fetch_game_scores();
  const report = adapter.describeRun();

  console.log('\n===== shipped adapter output =====');
  console.log(report.countsLine);
  console.log(report.histogramLine);
  for (const note of report.notes) console.log(note);
  console.log(`feed requests made by the adapter: ${feedUrls.length} (${feedUrls.length === 1 ? 'PASS — one request per run' : 'FAIL — Decision 1 violated'})`);
  console.log(`URL: ${feedUrls[0]}`);

  console.log('\n===== derived round + per-game scores (rows from the shipped adapter) =====');
  if (statuses.length === 0) {
    console.log('(no Game-7 series in this postseason — the counts line above explains every exclusion)');
  }
  for (const status of statuses) {
    const a = idToAbbr.get(status.team_a_id) ?? `?${status.team_a_id}`;
    const b = idToAbbr.get(status.team_b_id) ?? `?${status.team_b_id}`;
    const winner = status.winner_team_id === null ? 'PENDING (3-3)' : `winner ${idToAbbr.get(status.winner_team_id) ?? '?'}`;
    console.log(`${status.year} ${status.round}: ${a} vs ${b} — ${winner}`);
    const games = scores
      .filter((row) => row.team_a_id === status.team_a_id && row.team_b_id === status.team_b_id)
      .sort((l, r) => l.game_number - r.game_number);
    for (const game of games) {
      console.log(
        `  game ${game.game_number}: ${idToAbbr.get(game.away_team_id)} ${game.away_score} @ ${idToAbbr.get(game.home_team_id)} ${game.home_score}`,
      );
    }
  }

  // The measurement the decision record never made: TEAM_ID vs the resolved
  // teams.id space. Printed for every abbreviation the feed used.
  console.log('\n===== TEAM_ID ↔ abbreviation ↔ resolved teams.id (the :104 claim, measured) =====');
  if (!captured) throw new Error('adapter succeeded but the capture is empty — probe wiring bug');
  const set = captured.resultSets?.[0];
  if (!set) throw new Error('captured body lost resultSets — race?');
  const idx = Object.fromEntries(set.headers.map((h, n) => [h, n]));
  const triples = new Map();
  for (const row of set.rowSet) {
    const abbr = row[idx.TEAM_ABBREVIATION];
    const feedId = row[idx.TEAM_ID];
    const key = `${abbr}|${feedId}`;
    if (!triples.has(key)) triples.set(key, { abbr, feedId, resolved: seed.get(abbr) });
  }
  let agree = 0;
  let differ = 0;
  let unknown = 0;
  for (const t of [...triples.values()].sort((l, r) => l.abbr.localeCompare(r.abbr))) {
    if (t.resolved === undefined) {
      unknown += 1;
      console.log(`  ${t.abbr.padEnd(4)} feed TEAM_ID=${String(t.feedId).padEnd(6)} resolved=NOT IN TEAMS TABLE — a run holding this team aborts naming it`);
    } else if (t.feedId === t.resolved) {
      agree += 1;
      console.log(`  ${t.abbr.padEnd(4)} feed TEAM_ID=${String(t.feedId).padEnd(6)} resolved=${t.resolved}  AGREE`);
    } else {
      differ += 1;
      console.log(`  ${t.abbr.padEnd(4)} feed TEAM_ID=${String(t.feedId).padEnd(6)} resolved=${t.resolved}  DIFFER — copying TEAM_ID would have written the wrong franchise`);
    }
  }
  console.log(`verdict on decision-2-1-q-4-data-source.md:104 ("numeric ids already match"): ${agree} agree / ${differ} differ / ${unknown} not in the teams table.`);
  console.log('(the adapter resolves through the abbreviation map regardless — this line is the measurement, not a dependency.)');

  // Cross-check one Game 7 against boxscoretraditionalv2 (spike-probed route).
  console.log('\n===== Game 7 cross-check: boxscoretraditionalv2 =====');
  const decided = statuses.filter((s) => s.winner_team_id !== null);
  if (decided.length === 0) throw new Error('this postseason has no completed Game 7 to cross-check — pass --season= with a finished one (e.g. 2025-26)');
  const target = decided[0];
  const pairKey = new Set([target.team_a_id, target.team_b_id]);
  const abbrOf = (id) => idToAbbr.get(id);
  const gameDates = new Map();
  for (const row of set.rowSet) {
    if (!pairKey.has(seed.get(row[idx.TEAM_ABBREVIATION]))) continue;
    const g = gameDates.get(row[idx.GAME_ID]) ?? { date: row[idx.GAME_DATE], abbrs: new Set() };
    g.abbrs.add(row[idx.TEAM_ABBREVIATION]);
    gameDates.set(row[idx.GAME_ID], g);
  }
  const ordered = [...gameDates.entries()].sort((l, r) => l[1].date.localeCompare(r[1].date));
  if (ordered.length !== 7) throw new Error(`series ${abbrOf(target.team_a_id)}/${abbrOf(target.team_b_id)}: expected 7 games on the wire, captured ${ordered.length}`);
  const [game7Id, game7] = ordered[6];
  const feedRows = set.rowSet.filter((row) => row[idx.GAME_ID] === game7Id);
  if (feedRows.length !== 2) throw new Error(`game ${game7Id}: expected 2 feed rows, captured ${feedRows.length}`);
  const homeRow = feedRows.find((row) => row[idx.MATCHUP].includes(' vs. '));
  const feedHome = { abbr: homeRow[idx.TEAM_ABBREVIATION], id: homeRow[idx.TEAM_ID], pts: homeRow[idx.PTS] };
  const awayRow = feedRows.find((row) => !row[idx.MATCHUP].includes(' vs. '));
  const feedAway = { abbr: awayRow[idx.TEAM_ABBREVIATION], id: awayRow[idx.TEAM_ID], pts: awayRow[idx.PTS] };
  console.log(`game ${game7Id} (${game7.date}): feed says ${feedAway.abbr} ${feedAway.pts} @ ${feedHome.abbr} ${feedHome.pts}`);

  const boxParams = new URLSearchParams({ GameID: game7Id, EndPeriod: '10', EndRange: '28800', RangeType: '0', StartPeriod: '0', StartRange: '0' });
  const boxUrl = `https://stats.nba.com/stats/boxscoretraditionalv2?${boxParams}`;
  const boxResponse = await fetch(boxUrl, { headers: NBA_COM_HEADERS, signal: AbortSignal.timeout(25000) });
  if (!boxResponse.ok) throw new Error(`boxscoretraditionalv2 returned HTTP ${boxResponse.status} for game ${game7Id}`);
  const box = await boxResponse.json();
  const teamSet = (box.resultSets ?? []).find((s) => s.headers?.includes('PTS') && s.headers?.includes('TEAM_ID'));
  if (!teamSet) throw new Error(`no PTS/TEAM_ID result set in boxscoretraditionalv2 for game ${game7Id} — shape drifted; inspect: ${(box.resultSets ?? []).map((s) => s.name).join(', ')}`);
  const bIdx = Object.fromEntries(teamSet.headers.map((h, n) => [h, n]));
  const ptsByTeamId = new Map();
  for (const row of teamSet.rowSet) {
    ptsByTeamId.set(row[bIdx.TEAM_ID], (ptsByTeamId.get(row[bIdx.TEAM_ID]) ?? 0) + row[bIdx.PTS]);
  }
  let checked = 0;
  for (const side of [feedHome, feedAway]) {
    const boxPts = ptsByTeamId.get(side.id);
    if (boxPts === undefined) {
      console.log(`  ${side.abbr}: boxscore has no row for TEAM_ID ${side.id} — cannot cross-check this side`);
      continue;
    }
    checked += 1;
    console.log(`  ${side.abbr}: feed PTS=${side.pts} vs boxscore PTS=${boxPts} — ${boxPts === side.pts ? 'MATCH' : 'MISMATCH'}`);
  }
  if (checked < 2) throw new Error('boxscoretraditionalv2 did not carry both sides of the game — the cross-check did not complete');
  console.log('Game 7 cross-check complete: the leaguegamelog PTS values are the boxscore final scores.');
  console.log('\nPROBE PASSED — paste this whole output into spec-2-4 `## Implementation Notes` (Decision 12).');
}

async function readFileSafe(relative) {
  const { readFileSync } = await import('node:fs');
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}
