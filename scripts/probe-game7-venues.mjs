#!/usr/bin/env node
// Story 2.8, Decision 1 — the venue-curation probe, OWNER-RUN. It is the
// only outbound call this story defines, and this repo's established pattern
// for the live leg (spec-2-4 Decision 12, scripts/probe-nba-com-adapter.mjs)
// is that the agent never runs it: paste the whole output back, then fill
// `game7_venues_curated.csv`'s venue column and re-run the generator.
//
// What it does: iterates the `leaguegamelog` feed over seasons 1992-93 →
// 2025-26 (the depth Story 2.1 measured, pushed back one season so the
// calendar-1993 rows — season 1992-93's postseason — are answered too; the
// curated CSV holds two of them) and prints each completed series' Game-7
// home team as a CSV-shaped line:
//
//   year,team_a,team_b,game7_home_team
//
// Printed team_a/team_b follow the CURATED file's convention, winner-first
// (team_a = series winner, same as docs/NBASeriesResults.xlsx and 00007's
// slots) — so the fourth field can be pasted straight into the matching row.
// Matching into the curated file is by (year, UNORDERED team pair) either
// way, and only the home abbreviation travels; the adapter's own slots
// follow game-1-home and are not what is printed. It writes NOTHING: no
// file, no database, no environment read.
//
// The feed posture is the shipped adapter's, not a re-implementation (the
// same triage rule Story 2.4 learned): the probe imports `createNbaComAdapter`
// and drives it with `seasonOverride`, so the six browser-like headers, the
// 25 s timeout, the three attempts with [1000, 4000] ms backoff, the
// URL-naming terminal messages and the refusal of any silent `manual_csv`
// fallback are all exercised as shipped. One request per season, a full
// second between seasons — the route is Cloudflare-fronted and its rate
// limits are unmeasured, so the cadence is deliberately hostile-safe.
//
// Identity resolves through the port's abbreviation→teams.id path ONLY — the
// feed's numeric TEAM_ID is a foreign namespace (measured 2026-10-01: 0 agree
// / 16 differ) and Story 2.4 already refused to assume it.
//
// What a run can reveal, per D1: feed depth short of 1993-94 (a season the
// route answers empty), 403s on the historical seasons, or a franchise whose
// feed abbreviation the `teams` table does not hold. Each prints loudly with
// the URL and the season; none is a fallback. If a season cannot be covered,
// its rows — the pre-1993 block included — are hand-entered from a reference
// by the owner. No agent-drafted venue list is authorized.
//
// Requires Node >= 22.18 (imports the shipped TypeScript adapter and the
// Story 2.8 generator under native type-stripping; an older Node crashes at
// import, as in the 2.4 probe).
//
// Usage:
//   node scripts/probe-game7-venues.mjs                 # all seasons 1992-93 → 2025-26
//   node scripts/probe-game7-venues.mjs --season=2016-17  # one season (drill)
const exitWith = (code, reason) => {
  console.error(`\nPROBE COULD NOT RUN TO COMPLETION: ${reason}`);
  console.error(`Exit ${code} — fix the cause and re-run; paste the whole output either way.`);
  process.exitCode = code;
};

const seasonArg = process.argv.slice(2).find((a) => a.startsWith('--season='));
const otherArgs = process.argv.slice(2).filter((a) => a !== seasonArg);
if (otherArgs.length > 0) {
  exitWith(2, `unrecognised argument "${otherArgs[0]}" — supported: --season=<YYYY-YY>`);
} else {
  try {
    await runVenueProbe(seasonArg ? seasonArg.slice('--season='.length) : undefined);
  } catch (error) {
    exitWith(2, error instanceof Error ? error.message : String(error));
  }
}

async function runVenueProbe(seasonOverrideRaw) {
  // The shipped code — imported, never copied. If this import fails the probe
  // must not quietly fall back to its own HTTP; the catch above exits 2.
  const shipped = await import('../supabase/scripts/pipeline/adapters/nbaCom.ts');
  const { createNbaComAdapter, validateSeasonOverride } = shipped;
  // The Story 2.8 generator, imported for the coverage report at the end:
  // which curated rows this run answered and which still stand blank is
  // exactly where D1's residual risk (a compensating pair) materialises, so
  // the owner must see it while pasting (review pass 1, E4).
  const generator = await import('../supabase/scripts/pipeline/venueBackfill.ts');

  // Season ids are calendar-crossing strings: the postseason of 1992-93 is
  // played in calendar 1993 — and the curated CSV holds two year-1993 rows,
  // so the loop starts at 1992, not 1993 (review pass 1, E4: starting at
  // 1993-94 answers 96 of the 160 NBA/BAA rows, not 97). The list is the
  // 1992-93 → 2025-26 depth Story 2.1 measured; anything older (the pre-1993
  // block, and every ABA season the LeagueID=00 feed cannot answer at all)
  // is D1's hand-entry fallback.
  const seasons = [];
  for (let start = 1992; start <= 2025; start++) {
    seasons.push(`${start}-${String((start + 1) % 100).padStart(2, '0')}`);
  }
  const selected = seasonOverrideRaw !== undefined ? [validateSeasonOverride(seasonOverrideRaw)] : seasons;

  // The resolver the port contract requires: the SAME ids the database ships,
  // read off the committed seeds (no DB access, zero Supabase). 00005 seeds
  // the 30 current franchises, 00007 the 29 historical ones — 59 abbreviations
  // cover the archive.
  const seedText =
    (await readFileSafe('../supabase/migrations/00005_release_1_data_model.sql')) +
    (await readFileSafe('../supabase/migrations/00007_backfill_missing_historical_series.sql'));
  const seed = new Map();
  for (const match of seedText.matchAll(/\((\d+),\s*'[^']+',\s*'([A-Z]{3})',/g)) seed.set(match[2], Number(match[1]));
  if (seed.size !== 59) {
    throw new Error(
      `teams seed parse found ${seed.size} abbreviations in 00005+00007, expected 59 — seed format drifted, ` +
        'fix this probe\'s regex before trusting its output (a wrong id space is exactly what the curated rows must not inherit)',
    );
  }
  const idToAbbr = new Map([...seed].map(([abbr, id]) => [id, abbr]));

  console.log('story 2.8 venue probe — shipped nba_com adapter, season by season (read-only, zero Supabase, writes nothing)');
  console.log(`seasons asked: ${selected.length} (${selected[0]} → ${selected[selected.length - 1]})`);
  console.log('# lines below: year,team_a,team_b,game7_home_team — winner-first like the curated');
  console.log('# file itself; paste the 4th field into');
  console.log('# supabase/scripts/pipeline/data/game7_venues_curated.csv by (year, UNORDERED pair).');

  // The curated file drives the coverage report: identity is (year, unordered
  // team pair), the same key the migration resolves on.
  const curatedCsvRel = '../supabase/scripts/pipeline/data/game7_venues_curated.csv';
  const curatedRows = generator.parseVenuesCsv(await readFileSafe(curatedCsvRel), 'game7_venues_curated.csv');
  const pairKey = (year, a, b) => `${year}|${[a, b].sort().join('|')}`;
  const curatedByKey = new Map(curatedRows.map((row) => [pairKey(row.year, row.teamA, row.teamB), row]));
  const answeredKeys = new Set();
  const unmatchedProbeAnswers = [];

  const failures = [];
  let printed = 0;
  for (let i = 0; i < selected.length; i++) {
    const season = selected[i];
    if (i > 0) {
      // One full second between seasons: unmeasured limits on a hostile route.
      await sleepMs(1000);
    }
    const adapter = createNbaComAdapter({
      readFile: () => {
        throw new Error('probe: manual_csv-only dependency touched — wiring bug');
      },
      // The adapter aborts its parse naming any abbreviation this map lacks —
      // surfaced below as a named season failure, which is D1's mapping-blocker
      // evidence (it never silently drops a franchise).
      teamIdByAbbreviation: (abbr) => seed.get(abbr),
      now: () => new Date(Date.UTC(2026, 9, 1)),
      seasonOverride: season,
    });
    try {
      const statuses = await adapter.fetch_series_statuses();
      const scores = await adapter.fetch_game_scores();
      const report = adapter.describeRun();
      const completed = statuses.filter((s) => s.winner_team_id !== null);
      if (completed.length === 0) {
        // D1 names this exact condition as the feed-depth/mapping blocker
        // evidence — it must not read as a quiet success at exit 0
        // (review pass 1, E4).
        failures.push(`${season}: feed answered with ZERO completed Game-7 series — depth short of this season or a mapping blocker (D1 evidence); rows for this calendar year need the hand-entry fallback`);
        console.log(`\n=== ${season} — FAILED — 0 completed Game-7 series answered by the feed`);
        for (const note of report.notes) console.log(`note: ${note}`);
        continue;
      }
      console.log(`\n=== ${season} — ${report.countsLine} — ${completed.length} completed Game-7 series`);
      for (const status of completed) {
        const game7 = scores.find(
          (g) =>
            g.year === status.year &&
            ((g.team_a_id === status.team_a_id && g.team_b_id === status.team_b_id) ||
              (g.team_a_id === status.team_b_id && g.team_b_id === status.team_a_id)) &&
            g.game_number === 7,
        );
        if (!game7) {
          console.log(`${status.year},${idToAbbr.get(status.team_a_id)},${idToAbbr.get(status.team_b_id)},MISSING-GAME-7-ROW`);
          failures.push(`${season}: series ${status.year} pair resolved with a winner but no game-7 row in the same parse`);
          continue;
        }
        const home = idToAbbr.get(game7.home_team_id);
        if (home === undefined) {
          failures.push(`${season}: game 7 home id ${game7.home_team_id} is not in the 00005+00007 seed`);
          continue;
        }
        // winner-first is the CURATED file's convention; the adapter's slots
        // follow game-1-home. Say which is which so the paste target is never a guess.
        const winner = idToAbbr.get(status.winner_team_id);
        const loser = winner === idToAbbr.get(status.team_a_id) ? idToAbbr.get(status.team_b_id) : idToAbbr.get(status.team_a_id);
        // The paste target travels with the answer (review pass 2, P2-5): the
        // line the owner must edit, not a row they hunt for by eye. Matching is
        // still (year, unordered pair), so the number is a convenience, never a
        // key — a curated row moved between runs shows up as a mismatch here.
        const key = pairKey(status.year, winner, loser);
        const targetRow = curatedByKey.get(key);
        console.log(`${status.year},${winner},${loser},${home}${targetRow ? `\t# paste into ${curatedCsvRel.replace(/^\.\.\//, '')}:${targetRow.line}` : ''}`);
        printed += 1;
        if (curatedByKey.has(key)) {
          answeredKeys.add(key);
        } else {
          unmatchedProbeAnswers.push(`${status.year},${winner},${loser} — no curated row holds this (year, unordered pair)`);
        }
      }
      for (const note of report.notes) console.log(`note: ${note}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // terminalFetchError from the shipped adapter already names the URL and
      // states that no manual_csv fallback was taken — keep it verbatim.
      failures.push(`${season}: ${message}`);
      console.log(`\n=== ${season} — FAILED — ${message}`);
    }
  }

  console.log(`\nGame-7 venue lines printed: ${printed}`);

  // Coverage report (review pass 1, E4): which curated rows this run answered
  // and which still stand blank — with file:line, because that list is where
  // D1's accepted residual risk (a compensating pair) actually materialises.
  const answeredBlanks = curatedRows.filter((row) => generator.isNbaBaa(row) && row.home === '' && answeredKeys.has(pairKey(row.year, row.teamA, row.teamB)));
  const stillUnanswered = curatedRows.filter((row) => generator.isNbaBaa(row) && row.home === '' && !answeredKeys.has(pairKey(row.year, row.teamA, row.teamB)));
  console.log('\n-- coverage report (game7_venues_curated.csv) --');
  console.log(`curated NBA/BAA rows answered by this run: ${answeredKeys.size} (of which venue still blank: ${answeredBlanks.length})`);
  console.log(`curated NBA/BAA rows still blank this run did NOT answer: ${stillUnanswered.length}`);
  for (const row of stillUnanswered) {
    console.log(`  ${curatedCsvRel.replace(/^\.\.\//, '')}:${row.line}: ${row.year}, ${row.teamA} vs ${row.teamB} (${row.league})`);
  }
  if (unmatchedProbeAnswers.length > 0) {
    console.log(`probe answers matching NO curated row: ${unmatchedProbeAnswers.length}`);
    for (const line of unmatchedProbeAnswers) console.log(`  ${line}`);
    console.log('  (archive growth or a key mismatch — reconcile against the live table BEFORE emitting: 00016\'s league_backfill_complete guard aborts db push on any uncovered series)');
  }

  if (failures.length > 0) {
    console.error(`\nPROBE INCOMPLETE — ${failures.length} season(s) could not be answered: ${failures.map((f) => f.split(':')[0]).join(', ')}`);
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('Uncovered rows (the pre-1993 block included) are hand-entered by the owner from a reference (spec-2-8 D1).');
    process.exitCode = 2;
    return;
  }
  console.log('\nPROBE COMPLETED — paste this whole output into spec-2-8 `## Implementation Notes`, then fill the curated CSV and run:');
  console.log('  node supabase/scripts/pipeline/venueBackfill.ts   # emits 00016 once no NBA/BAA venue is blank');
}

async function sleepMs(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function readFileSafe(relative) {
  const { readFileSync } = await import('node:fs');
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}
