#!/usr/bin/env node
// Story 2.8, Decision 1 — the venue-curation probe, OWNER-RUN. It is the
// only outbound call this story defines, and this repo's established pattern
// for the live leg (spec-2-4 Decision 12, scripts/probe-nba-com-adapter.mjs)
// is that the agent never runs it: paste the whole output back, then fill
// `game7_venues_curated.csv`'s venue column and re-run the generator.
//
// What it does: iterates the `leaguegamelog` feed over seasons 1993-94 →
// 2025-26 (the depth Story 2.1 measured) and prints each completed series'
// Game-7 home team as a CSV-shaped line:
//
//   year,team_a,team_b,game7_home_team
//
// The owner pastes the fourth field into the matching curated row. Matching
// is by (year, UNORDERED team pair) — this probe's team_a/team_b follow the
// adapter's game-1-home convention, which need not equal the archive's
// winner-first slots; only the home abbreviation travels. It writes NOTHING:
// no file, no database, no environment read.
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
// Requires Node >= 22.18 (imports the shipped TypeScript adapter under native
// type-stripping; an older Node crashes at import, as in the 2.4 probe).
//
// Usage:
//   node scripts/probe-game7-venues.mjs                 # all seasons 1993-94 → 2025-26
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

  // Season ids are calendar-crossing strings: the postseason of 1993-94 is
  // played in 1994. The list is the 1993-94 → 2025-26 depth Story 2.1
  // measured; anything older (the ~63-row block, and every ABA season the
  // LeagueID=00 feed cannot answer at all) is D1's hand-entry fallback.
  const seasons = [];
  for (let start = 1993; start <= 2025; start++) {
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
  console.log('# lines below: year,team_a,team_b,game7_home_team — paste the 4th field into');
  console.log('# supabase/scripts/pipeline/data/game7_venues_curated.csv by (year, UNORDERED pair).');

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
        console.log(`${status.year},${winner},${loser},${home}`);
        printed += 1;
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
