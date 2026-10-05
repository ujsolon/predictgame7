#!/usr/bin/env node
// Story 2.8, Decision 1 — the venue-curation probe, OWNER-RUN. It is the
// only outbound call this story defines, and this repo's established pattern
// for the live leg (spec-2-4 Decision 12, scripts/probe-nba-com-adapter.mjs)
// is that the agent never runs it: paste the whole output back, then fill
// `game7_venues_curated.csv`'s venue column and re-run the generator.
//
// What it does: iterates the `leaguegamelog` feed over seasons 1946-47 →
// 2025-26 — the whole span the archive can need, since the owner's 2026-10-01
// depth drill answered 1962-63 and proved the older block was never a feed
// limitation — and prints each completed series' Game-7
// home team as a CSV-shaped line:
//
//   year,team_a,team_b,game7_home_team
//
// The three printed fields come from the CURATED row itself, not from the feed's
// slot order: the matcher returns the archive row a season resolves to, and that
// row's own `team_a`/`team_b` are printed, so the line you read is the line you
// edit. Where the feed's winner disagrees with the curated row's winner-first
// slot, that is reported separately as a winner inversion — resolution is by
// unordered pair, so a venue still lands on the right row. It writes NOTHING: no
// file, no database, no environment read.
//
// Era codes resolve through one approved table:
// supabase/scripts/pipeline/data/game7_feed_aliases.csv (`feed_abbr,teams_abbr,
// evidence`). The feed names some franchises by a code `teams` does not hold —
// CIN, STL, GOS, UTH, SAN, CHH, and WAS for a 1970s Bullets series — and the
// depth drill of 2026-10-01 showed the archive identifies them: the year matches
// and one side matches a curated slot exactly. An alias may fire only when the
// direct pass matched nothing, only against rows no direct match claimed, and only
// to one surviving row; otherwise the code is printed as a proposal for the owner
// to verify and never applied. Those rules live in venueBackfill.ts under tests,
// because this leg runs only on the owner's machine (pass 2, P2-12/VG2-3).
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
// What a run can reveal, per D1: feed depth short of the season asked (a route that
// answers with no series at all), 403s on the historical seasons, or a franchise whose
// feed abbreviation the `teams` table does not hold. Each prints loudly with
// the URL and the season; none is a fallback. A season the route cannot answer
// falls back to `--worksheet` hand entry from a reference by the owner. No
// agent-drafted venue list is authorized. (This proved unnecessary in practice:
// the 2026-10-02 curation answered all 160 NBA/BAA rows from the feed, the era
// codes closing through the approved alias table.)
//
// Requires Node >= 22.18 (imports the shipped TypeScript adapter and the
// Story 2.8 generator under native type-stripping; an older Node crashes at
// import, as in the 2.4 probe).
//
// Usage:
//   node scripts/probe-game7-venues.mjs                 # all seasons 1946-47 → 2025-26
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

  // Season ids are calendar-crossing strings: the postseason of 1946-47 is played
  // in calendar 1947. The sweep starts at 1946 — the earliest franchise season the
  // archive can need (its oldest row is the 1948 BAA tiebreaker) — because the owner
  // drilled 1962-63 on 2026-10-01 and the route ANSWERED it: the pre-1993 block was
  // never a depth limit, only an unasked range. Seasons the route cannot answer come
  // back as `empty-feed` and are named, so widening costs visibility, never silence.
  // ABA seasons stay outside this entirely: the LeagueID=00 feed does not carry them,
  // and the 18 ABA rows are blank-legal by scope (Call 2), so nothing here can fill
  // one by accident.
  const seasons = [];
  for (let start = 1946; start <= 2025; start++) {
    seasons.push(`${start}-${String((start + 1) % 100).padStart(2, '0')}`);
  }
  const selected = seasonOverrideRaw !== undefined ? [validateSeasonOverride(seasonOverrideRaw)] : seasons;

  // The resolver the port contract requires: the SAME ids the database ships,
  // read off the committed seeds (no DB access, zero Supabase), through the one
  // reader the generator and the tests share (review pass 2, P2-12).
  const seedText =
    (await readFileSafe('../supabase/migrations/00005_release_1_data_model.sql')) +
    (await readFileSafe('../supabase/migrations/00007_backfill_missing_historical_series.sql'));
  const seed = generator.parseTeamsSeed(seedText, '00005 + 00007 teams seed');
  const idToAbbr = new Map([...seed].map(([abbr, id]) => [id, abbr]));

  // A feed abbreviation the `teams` table does not hold is information, not a
  // season failure (owner's run 2026-10-01: CHH, GOS, UTH and SAN each aborted a
  // whole season, including its clean Game-7 answers). The shipped adapter's
  // refusal is right for the PIPELINE — it would have to write a row into a
  // column with REFERENCES teams(id) — and this probe writes nothing, so such a
  // code maps to a private negative id that can never collide with a real one,
  // and its row simply never matches a curated pair. Those rows surface in the
  // unmatched report with the raw code spelled out.
  const feedOnlyIds = new Map();
  const feedOnlyAbbr = new Map();
  const resolveOrSentinel = (abbr) => {
    const known = seed.get(abbr);
    if (known !== undefined) return known;
    if (!feedOnlyIds.has(abbr)) {
      const sentinel = -1000 - feedOnlyIds.size;
      feedOnlyIds.set(abbr, sentinel);
      feedOnlyAbbr.set(sentinel, abbr);
    }
    return feedOnlyIds.get(abbr);
  };
  const nameOf = (id) => idToAbbr.get(id) ?? `feed:${feedOnlyAbbr.get(id) ?? `id${id}`}`;
  // Raw code space for the matcher: a seed abbreviation stays itself, a feed-only
  // code stays the feed's own string, so `matchSeasonFeedSeries` can decide whether
  // an approved alias resolves it.
  const codeOf = (id) => idToAbbr.get(id) ?? feedOnlyAbbr.get(id) ?? `id${id}`;

  const aliasCsvRel = '../supabase/scripts/pipeline/data/game7_feed_aliases.csv';
  let feedAliases;
  try {
    feedAliases = generator.parseFeedAliases(await readFileSafe(aliasCsvRel), 'game7_feed_aliases.csv', seed);
  } catch (error) {
    throw new Error(
      `the approved alias table is unreadable (${aliasCsvRel.replace(/^\.\.\//, '')}): ${error.message} — ` +
        'refusing to run a curation pass that would silently treat every era code as unknown',
    );
  }

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
  const nbaBaaByCalendarYear = new Map();
  for (const row of curatedRows) {
    if (generator.isNbaBaa(row)) nbaBaaByCalendarYear.set(row.year, (nbaBaaByCalendarYear.get(row.year) ?? 0) + 1);
  }
  const answeredKeys = new Set();
  const unmatchedProbeAnswers = [];
  const aliasProposals = [];
  const winnerInversions = [];
  const feedOnlyCodes = new Set();

  const failures = [];
  let printed = 0;
  for (let i = 0; i < selected.length; i++) {
    const season = selected[i];
    if (i > 0) {
      // One full second between seasons: unmeasured limits on a hostile route.
      await sleepMs(1000);
    }
    // The postseason of season S is played in calendar year S+1, and the
    // archive's `year` is a calendar year — that is the curated population a
    // quiet season has to be compared against.
    const calendarYear = Number(season.slice(0, 4)) + 1;
    const adapter = createNbaComAdapter({
      readFile: () => {
        throw new Error('probe: manual_csv-only dependency touched — wiring bug');
      },
      // Unknown feed codes become private sentinels instead of aborting the
      // season; they can never match a curated pair, so they cannot corrupt a
      // paste, and the season's clean answers still print.
      teamIdByAbbreviation: resolveOrSentinel,
      now: () => new Date(Date.UTC(2026, 9, 1)),
      seasonOverride: season,
    });
    try {
      const statuses = await adapter.fetch_series_statuses();
      const scores = await adapter.fetch_game_scores();
      const report = adapter.describeRun();
      const completed = statuses.filter((s) => s.winner_team_id !== null);
      for (const s of statuses) {
        for (const id of [s.team_a_id, s.team_b_id]) {
          if (feedOnlyAbbr.has(id)) feedOnlyCodes.add(feedOnlyAbbr.get(id));
        }
      }
      // `no-game7` is the case the first version got wrong: 1998-99 answers zero
      // completed Game 7s and the archive holds none for calendar 1999 either —
      // the feed corroborating the file, not a blocker. Only route silence, or a
      // season the archive says had a Game 7, is news (owner's run 2026-10-01).
      const outcome = generator.classifySeason({
        seriesInFeed: statuses.length,
        completedGame7: completed.length,
        curatedRowsForYear: nbaBaaByCalendarYear.get(calendarYear) ?? 0,
      });
      if (outcome === 'empty-feed' || outcome === 'missing-game7') {
        failures.push(`${season} (calendar ${calendarYear}): ${generator.SEASON_OUTCOME_MEANING[outcome]}`);
        console.log(`\n=== ${season} — FAILED — ${generator.SEASON_OUTCOME_MEANING[outcome]}`);
        for (const note of report.notes) console.log(`note: ${note}`);
        continue;
      }
      console.log(
        `\n=== ${season} — ${report.countsLine} — ${completed.length} completed Game-7 series` +
          (outcome === 'no-game7' ? `; calendar ${calendarYear} holds no curated NBA/BAA Game 7 either — agrees` : ''),
      );
      // Resolve the season in raw-code space. The two-pass rule that decides whether
      // an approved alias may rename a franchise lives in the tested module, because
      // this leg only runs on the owner's machine and nothing here can be verified by
      // executing it (pass 2, P2-12/VG2-3).
      const resolved = [];
      for (const status of completed) {
        const game7 = scores.find(
          (g) =>
            g.year === status.year &&
            ((g.team_a_id === status.team_a_id && g.team_b_id === status.team_b_id) ||
              (g.team_a_id === status.team_b_id && g.team_b_id === status.team_a_id)) &&
            g.game_number === 7,
        );
        if (!game7) {
          console.log(`${status.year},${nameOf(status.team_a_id)},${nameOf(status.team_b_id)},MISSING-GAME-7-ROW`);
          failures.push(`${season}: series ${status.year} pair resolved with a winner but no game-7 row in the same parse`);
          continue;
        }
        resolved.push({
          codeA: codeOf(status.team_a_id),
          codeB: codeOf(status.team_b_id),
          homeCode: codeOf(game7.home_team_id),
          winnerCode: codeOf(status.winner_team_id),
        });
      }

      const { matched, unmatched } = generator.matchSeasonFeedSeries({
        year: calendarYear,
        series: resolved,
        curated: curatedRows,
        aliases: feedAliases,
      });

      for (const m of matched) {
        // Story 2.12: the resolver is slot-aware — a feed code that already names
        // one of the matched row's two abbreviations is used verbatim, and the
        // alias table is consulted only when it names neither. Without the slots
        // the context-free WAS->WSB alias shadowed a modern Wizards row and this
        // next check refused a correct paste target (deferred-work P3-1). The
        // check itself stays: a code that names neither slot and no approved
        // alias places is still a refusal, not a guess.
        const home = generator.resolveFeedCode(m.series.homeCode, feedAliases, [m.row.teamA, m.row.teamB]).abbr;
        if (home !== m.row.teamA && home !== m.row.teamB) {
          unmatchedProbeAnswers.push(
            `${m.row.year} ${m.row.teamA} vs ${m.row.teamB} (csv:${m.row.line}) — Game 7 home resolved to "${home}", which is not one of that row's two slots: refusing to print a paste target`,
          );
          continue;
        }
        // Print the CURATED row's own shape, so the line you paste into and the line
        // printed agree slot for slot. What the feed's slots were is reported
        // separately, as a winner inversion.
        const via = m.via === 'direct' ? '' : `  [via alias ${m.via.aliases.map((a) => `${a.feed}->${a.teams}`).join(', ')}]`;
        console.log(`${m.row.year},${m.row.teamA},${m.row.teamB},${home}\t# paste into ${curatedCsvRel.replace(/^\.\.\//, '')}:${m.row.line}${via}`);
        printed += 1;
        answeredKeys.add(pairKey(m.row.year, m.row.teamA, m.row.teamB));

        // Slot-aware here too (Story 2.12): the raw winner code of a modern row
        // is compared as itself, so `WAS` winning a `BOS`/`WAS` series reports a
        // real inversion instead of silently resolving to `WSB` and matching
        // neither slot.
        const feedWinner = generator.resolveFeedCode(m.series.winnerCode, feedAliases, [m.row.teamA, m.row.teamB]).abbr;
        if (feedWinner === m.row.teamB) {
          winnerInversions.push(
            `${m.row.year} ${m.row.teamA} vs ${m.row.teamB} (csv:${m.row.line}) — the feed says ${feedWinner} won this series, while the curated row holds ${m.row.teamA} in the winner-first slot. Resolution is by UNORDERED pair so the venue still lands on the right row; this is a provenance question about the row, not a blocker.`,
          );
        } else if (feedWinner !== m.row.teamA) {
          // ECH-1 (Story 2.7): a winner code naming neither slot and no approved
          // alias used to fall through both branches and print nothing.
          winnerInversions.push(
            `${m.row.year} ${m.row.teamA} vs ${m.row.teamB} (csv:${m.row.line}) — the feed's winner code resolved to "${feedWinner}", which is neither of that row's two slots: the winner could not be placed. The venue line above still stands; check the row and the alias table.`,
          );
        }
      }

      for (const u of unmatched) {
        const unknown = [u.series.codeA, u.series.codeB].find((code) => !seed.has(code));
        const known = [u.series.codeA, u.series.codeB].find((code) => seed.has(code));
        if (unknown !== undefined && known !== undefined && u.candidates.length === 1) {
          const row = u.candidates[0];
          const target = row.teamA === known ? row.teamB : row.teamA;
          aliasProposals.push(
            `${unknown},${target},${season} game 7 ${u.series.codeA} vs ${u.series.codeB} resolves to curated row ${row.year} ${row.teamA} vs ${row.teamB} (csv:${row.line}) — the only unclaimed row for that year holding ${known}. Verify against a reference before approving; one code may name only one franchise.`,
          );
          continue;
        }
        unmatchedProbeAnswers.push(
          `${calendarYear} ${u.series.codeA} vs ${u.series.codeB} — no approved alias resolves this pair${
            u.candidates.length === 0
              ? ' and the archive holds no unclaimed row for it: either the feed answered a series the archive never stored, or both sides are unmapped'
              : ` — ${u.candidates.length} curated rows are still standing: ${u.candidates.map((c) => `${c.teamA}/${c.teamB} (csv:${c.line})`).join(', ')}. Not resolved by preference.`
          }`,
        );
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
    console.log(
      '  usually an era-code difference the approved alias table already maps — open ' +
        'supabase/scripts/pipeline/data/game7_feed_aliases.csv (14 rows: CIN→CNR, STL→SLH, WAS→WSB, ' +
        'GOS→GSW, UTH→UTA, CHH→CHA, SAN→SAS, BOM→SLB, ROC→ROR, MNL→MPL, FTW→FWP, PHL→PHI, BLT→BLB, ' +
        'CAP→CPB). Neither archive growth nor a typo — the pair is right and only the code differs. ' +
        'If instead the feed answered a series the archive does not hold, reconcile against the live table BEFORE emitting: ' +
        "00016's league_backfill_complete guard aborts db push on any uncovered series.",
    );
  }

  if ([...feedOnlyCodes].some((code) => !feedAliases.some((alias) => alias.feed === code))) {
    // Codes the seed lacks AND the alias table does not cover. An aliased code is
    // still seen here as raw feed vocabulary, so it is filtered out — reporting
    // `UTH` as unheld while `UTH->UTA` sits approved in the table would send the
    // owner looking for a mapping that already exists.
    const unresolved = [...feedOnlyCodes].filter((code) => !feedAliases.some((alias) => alias.feed === code)).sort();
    console.log(`\nfeed abbreviations neither in the teams table nor covered by an approved alias: ${unresolved.join(', ')}`);
    console.log('  (each is reported as a proposal below where one exists; none is ever applied without you)');
  }

  if (aliasProposals.length > 0) {
    // Proposals, never applications: each of these is one unknown code with exactly
    // one surviving curated row for its year. The owner verifies and pastes the line
    // into supabase/scripts/pipeline/data/game7_feed_aliases.csv; the next run resolves
    // it and prints the paste target.
    console.log(`\n# proposed alias rows (${aliasProposals.length}) — verify each, then append to data/game7_feed_aliases.csv as feed_abbr,teams_abbr,evidence:`);
    for (const proposal of aliasProposals) console.log(`# ${proposal}`);
  }

  if (winnerInversions.length > 0) {
    console.log(`\n# curated slot order disagrees with the feed's winner (${winnerInversions.length})`);
    for (const inversion of winnerInversions) console.log(`# ${inversion}`);
  }

  if (failures.length > 0) {
    console.error(`\nPROBE INCOMPLETE — ${failures.length} season(s) could not be answered: ${failures.map((f) => f.split(':')[0]).join(', ')}`);
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      'Rows still blank are resolved by approving the proposals above into data/game7_feed_aliases.csv and re-running; ' +
        'run `node supabase/scripts/pipeline/venueBackfill.ts --worksheet` for the residue that is genuinely unanswerable here.',
    );
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
