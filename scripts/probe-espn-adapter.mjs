#!/usr/bin/env node
// Story 2.13, CAP-8 — the committed LIVE leg for the `espn` adapter, OWNER-RUN.
// Nothing here has been executed by the coding agent (spec-2-13 Constraints
// forbid an agent-side fetch), so no claim is made about the feed's current
// behavior until the owner pastes this output into the story record.
//
// Three legs, each independently named:
//   A. `--date=YYYYMMDD` — drives the SHIPPED adapter (imported, never copied)
//      against the real scoreboard for exactly one date, and prints the field
//      coverage CAP-8 exists to measure: `notes[0].headline`, `status.type`,
//      `competitors[].team.abbreviation`, `.homeAway`, `.score`. A PASS here
//      certifies the parse the pipeline runs, on a payload nobody trimmed.
//   B. The 30-franchise ESPN code table. `payload-contract.md` measures five
//      codes (`CLE`, `TOR`, `DEN`, `NY`, `SA`) and ASSUMES the other 26 agree
//      with `teams.abbreviation`. This leg measures them, which is what makes
//      `00018`'s seeds evidence instead of a guess list — the file's own rule.
//      It reads the codes from ESPN's team list, whose shape has never been
//      measured here, so the reader is deliberately tolerant and every
//      alternative ends in a named exit 2 rather than a printed table nobody
//      checked.
//   C. The range control — re-measures `dates=20260601-20260608` and requires
//      the `400` with no `.events` that CAP-2's single-date-only decision rests
//      on. If the host ever starts answering a range, this goes red and the
//      decision has to be revisited, not quietly widened.
//
// Identity note for leg A: the adapter DERIVES its date from the run instant
// (`deriveRequestDate`, CAP-5), and `--source=espn` carries no date flag by
// design, so the probe supplies an instant instead of a date — 07:30 UTC on the
// day AFTER the one you asked for, which is the cron's own shape. The leg then
// asserts the shipped derivation lands back on the date you named, so the flag
// round-trips the rule rather than bypassing it.
//
// Unkeyed, read-only, ZERO Supabase: no sink, no env vars, no writes, and the
// `teams` table is read off the committed `00005` seed rather than a database.
// Exit 0 ONLY when every leg that ran passed — a leg that disagrees throws into
// the top-level handler rather than printing a failure it would then declare
// passed (the triage-row-20 rule from Story 2.4). Exit 2 with a named reason.
//
// Requires Node >= 22.18 (this repo runs on 24.x): the probe imports the shipped
// TypeScript adapter and relies on Node's native type-stripping, so on an older
// Node it crashes at import time instead of exiting 2 with a reason.
//
// Usage (run-sheet.md step 1):
//   node scripts/probe-espn-adapter.mjs --date=20260420
//   node scripts/probe-espn-adapter.mjs --date=20260605
//   node scripts/probe-espn-adapter.mjs            # legs B and C only
const exit2 = (reason) => {
  console.error(`\nPROBE COULD NOT RUN TO COMPLETION: ${reason}`);
  console.error('Exit 2 — fix the cause and re-run; paste the whole output either way.');
  process.exitCode = 2;
};

/**
 * `payload-contract.md` "Team codes": the SIX measured divergences between what
 * ESPN prints and what `00005` seeds in `teams.abbreviation`. All six come from
 * the committed capture `tests/pipeline/fixtures/espn-teams-site-20261004.json`,
 * and `espn-adapter.test.ts` cross-checks them against migration `00018`'s seed
 * text, so a transcription slip in either place goes red rather than shipping.
 *
 * The first two were measured by Story 2.4 against the archive; the other four
 * are the rows `payload-contract.md` recorded as "assumed to agree" until CAP-8's
 * cross-check measured them. It did, on 2026-10-04, and four of the assumed
 * twenty-six do not agree. The other 24 franchises agree string-for-string.
 *
 * The probe still carries this table instead of reading `teams.espn_code`: leg B's
 * whole point is to run with ZERO Supabase, so it stands in for the column rather
 * than depending on it being applied.
 */
const MEASURED_DIVERGENCES = new Map([
  ['NY', { abbreviation: 'NYK', teamsId: 20, nameMustContain: 'knick' }],
  ['SA', { abbreviation: 'SAS', teamsId: 27, nameMustContain: 'spur' }],
  ['GS', { abbreviation: 'GSW', teamsId: 10, nameMustContain: 'warrior' }],
  ['NO', { abbreviation: 'NOP', teamsId: 19, nameMustContain: 'pelican' }],
  ['UTAH', { abbreviation: 'UTA', teamsId: 29, nameMustContain: 'jazz' }],
  ['WSH', { abbreviation: 'WAS', teamsId: 30, nameMustContain: 'wizard' }],
]);

/** The measured range form (`payload-contract.md` "Request"), re-checked verbatim. */
const RANGE_CONTROL = '20260601-20260608';

const dateArgs = process.argv.slice(2).filter((arg) => arg.startsWith('--date='));
const dateArg = dateArgs[0];
// `--fixture-teamlist=<file>` runs leg B's READER over a committed payload with
// zero network. It exists because the agent may not fetch: leg B's traversal was
// wrong in a way only a live run could show, and a live run costs the owner a
// network switch. This mode lets the reader be executed by `npm test` instead.
// It is not CAP-8 evidence and says so on every path.
const fixtureArgs = process.argv.slice(2).filter((arg) => arg.startsWith('--fixture-teamlist='));
const otherArgs = process.argv.slice(2).filter((arg) => !dateArgs.includes(arg) && !fixtureArgs.includes(arg));
if (dateArgs.length > 1) {
  // The run sheet asks for two dates, so this is the shape a real operator run
  // takes by accident; silently keeping the first would print one payload and
  // read as two.
  exit2(`--date= given ${dateArgs.length} times (${dateArgs.join(', ')}) — one date per run, the way the adapter takes it: run the probe once per date`);
} else if (otherArgs.length > 0) {
  exit2(`unrecognised argument "${otherArgs[0]}" — supported: --date=<YYYYMMDD>, --fixture-teamlist=<file>, or no flag for legs B and C only`);
} else if (fixtureArgs.length === 1 && dateArg === undefined) {
  try {
    await runFixtureTeamList(fixtureArgs[0].slice('--fixture-teamlist='.length));
  } catch (error) {
    exit2(error instanceof Error ? error.message : String(error));
  }
} else if (fixtureArgs.length > 0) {
  exit2('--fixture-teamlist= runs no network leg, so pass it alone (no --date=)');
} else {
  try {
    await runProbe(dateArg ? dateArg.slice('--date='.length) : undefined);
  } catch (error) {
    exit2(error instanceof Error ? error.message : String(error));
  }
}

/**
 * leg B's reader, offline: the file is parsed as if it were a team-list response
 * and the same verification decides the exit code. It prints FIXTURE MODE and
 * never counts as CAP-8 evidence, because a pass here proves the READER resolves
 * the shape on disk — not that ESPN still answers that way today. The committed
 * payloads it runs on are captured responses, so a green pass here is the reader
 * agreeing with reality as of the capture date, and the live leg is what
 * re-measures the present tense.
 */
async function runFixtureTeamList(file) {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const text = readFileSync(resolve(process.cwd(), file), 'utf8');
  const { rows, notes } = analyzeTeamList(file, JSON.parse(text), await readSeedTable());
  console.log(`fixture mode — leg B reader over ${file}, ZERO network, not CAP-8 evidence`);
  for (const note of notes) console.log(`  ${note}`);
  if (!rows) {
    console.log('reader result: no verified 30-franchise table (exit 2)');
    process.exitCode = 2;
    return;
  }
  printTeamTable(rows);
  console.log('reader result: 30 verified rows read off the payload at that path — the reader resolves it; the live leg B run is what re-measures the feed today (exit 0)');
}

async function runProbe(datesArg) {
  // The shipped code — imported, never copied. If this import fails the probe
  // must not quietly fall back to its own parse; the catch above exits 2.
  const shipped = await import('../supabase/scripts/pipeline/adapters/espn.ts');
  const { createEspnAdapter, deriveRequestDate, scoreboardUrl, parseHeadline, etCalendarDay, SCOREBOARD_ENDPOINT, ESPN_HEADERS, describeFetchThrow } =
    shipped;

  const runDate = new Date();
  console.log('story 2.13 live probe — shipped espn adapter against the real feed (read-only, zero Supabase)');
  console.log(`run date (UTC): ${runDate.toISOString()}`);

  const migrationText = await readFileSafe('../supabase/migrations/00005_release_1_data_model.sql');
  const seed = new Map();
  for (const match of migrationText.matchAll(/\((\d+),\s*'[^']+',\s*'([A-Z]{3})',/g)) seed.set(match[2], Number(match[1]));
  if (seed.size !== 30) {
    throw new Error(`teams seed parse found ${seed.size} abbreviations in 00005, expected 30 — seed format drifted, fix the probe regex before trusting this output`);
  }

  // Every failure reason the legs collect, so one run gives the owner the whole
  // picture instead of the first complaint. Any non-empty list exits 2.
  const failures = [];
  /** Provider codes leg A actually saw on the wire, for leg B's cross-check. */
  const codesOnFeed = new Set();

  // ---- Leg A: one date, through the shipped adapter --------------------------
  if (datesArg === undefined) {
    console.log('\nnote: no --date= given — leg A (field coverage on a real payload) is the one CAP-8 records verbatim; run it for 20260420 and 20260605.');
  } else {
    if (!/^\d{8}$/.test(datesArg)) throw new Error(`--date=${datesArg} is not YYYYMMDD`);
    const year = Number(datesArg.slice(0, 4));
    const month = Number(datesArg.slice(4, 6));
    const day = Number(datesArg.slice(6, 8));
    const probeInstant = new Date(Date.UTC(year, month - 1, day + 1, 7, 30, 0));
    const derived = deriveRequestDate(probeInstant);
    if (derived !== datesArg) {
      throw new Error(
        `deriveRequestDate(${probeInstant.toISOString()}) returned ${derived}, not the requested ${datesArg} — the probe's instant ` +
          'is the 07:30 UTC cron shape, so a mismatch means the America/New_York subtraction moved off the calendar you named',
      );
    }

    const feedUrls = [];
    let captured = null;
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

    const codeToTeamsId = (code) => {
      if (seed.has(code)) return seed.get(code);
      const divergence = MEASURED_DIVERGENCES.get(code);
      return divergence ? divergence.teamsId : undefined;
    };

    console.log(`\n===== leg A — dates=${datesArg} (derived, then round-tripped: deriveRequestDate(${probeInstant.toISOString()}) === ${datesArg}) =====`);
    const adapter = createEspnAdapter({
      readFile: () => {
        throw new Error('probe: manual_csv-only dependency touched — wiring bug');
      },
      teamIdByAbbreviation: (abbr) => seed.get(abbr),
      teamIdByEspnCode: codeToTeamsId,
      fetch: capturingFetch,
      now: () => probeInstant,
    });

    let statuses;
    let scores;
    let report;
    try {
      statuses = await adapter.fetch_series_statuses();
      scores = await adapter.fetch_game_scores();
      report = adapter.describeRun();
    } catch (error) {
      // The adapter's own abort is the loudest evidence CAP-6 produces: it names
      // the code and refuses to match it by substring, city or nickname. Recorded
      // as a failure rather than swallowed, because a red here means `00018`
      // would seed a franchise the table does not hold.
      throw new Error(`the shipped adapter aborted: ${error instanceof Error ? error.message : String(error)}`);
    }

    const distinctUrls = new Set(feedUrls);
    if (distinctUrls.size > 1) {
      throw new Error(`one-request-per-run violated: ${distinctUrls.size} distinct feed URLs in one run — ${[...distinctUrls].join(' | ')}`);
    }
    if (feedUrls[0] !== scoreboardUrl(datesArg)) {
      throw new Error(`the adapter asked ${feedUrls[0]} — expected exactly ${scoreboardUrl(datesArg)}`);
    }

    console.log(report.countsLine);
    console.log(report.histogramLine);
    for (const note of report.notes) console.log(note);
    console.log(`feed requests made by the adapter: ${feedUrls.length} call(s), ${distinctUrls.size} distinct URL`);
    console.log(`URL: ${feedUrls[0]}`);
    console.log(`port rows: ${statuses.length} series status(es), ${scores.length} game score(s) — non-Game-7 dates yield zero rows BY RULE`);

    if (!captured) throw new Error('the adapter succeeded but the raw capture is empty — probe wiring bug');
    const events = captured.events;
    if (!Array.isArray(events)) throw new Error(`captured body has no events array — top-level keys: ${Object.keys(captured).join(', ')}`);
    if (events.length === 0) {
      failures.push(`leg A: dates=${datesArg} answered events: [] — field coverage cannot be measured on an empty feed; name a date that held games`);
    }

    console.log(`\n===== leg A — field coverage on every event the feed returned (${events.length}) =====`);
    events.forEach((event, index) => {
      const headline = event?.competitions?.[0]?.notes?.[0]?.headline ?? null;
      const parsed = headline === null ? { reason: 'no notes[0].headline present' } : parseHeadline(headline);
      const competitors = (event?.competitions?.[0]?.competitors ?? []).map((c) => ({
        side: c?.homeAway,
        code: c?.team?.abbreviation,
        name: c?.team?.displayName,
        score: c?.score,
      }));
      for (const c of competitors) if (typeof c.code === 'string') codesOnFeed.add(c.code);
      const state = event?.status?.type?.state;
      const description = event?.status?.type?.description;
      const localDay = etCalendarDay(new Date(event.date));
      const resolved = competitors.map((c) => codeToTeamsId(c.code));

      console.log(
        `  [${index}] ${event?.date} (local ${localDay.year}-${pad(localDay.month)}-${pad(localDay.day)}) ` +
          `state=${JSON.stringify(state)} description=${JSON.stringify(description)} headline=${JSON.stringify(headline)}`,
      );
      console.log(
        `       parse: ${parsed.reason ? `REJECTED — ${parsed.reason}` : `round="${parsed.round}" game ${parsed.gameNumber} (depth ${parsed.depth})`}`,
      );
      competitors.forEach((c, side) => {
        console.log(
          `       ${String(c.side)}: code=${JSON.stringify(c.code)} name=${JSON.stringify(c.name)} score=${JSON.stringify(c.score)} ` +
            `→ teams.id=${resolved[side] === undefined ? 'UNRESOLVED (00018 would abort naming this code)' : resolved[side]}`,
        );
      });
      console.log(`       venue: ${JSON.stringify(event?.competitions?.[0]?.venue?.fullName)} (recorded; this story reads nothing from it)`);

      // CAP-8's actual question: is the field the adapter depends on PRESENT on
      // a real payload. An absent headline or a missing code is not an exclusion
      // to print and move past — it is the assumption failing.
      if (headline === null) failures.push(`leg A: event ${index} carries no competitions[0].notes[0].headline — naming has no source on this payload`);
      competitors.forEach((c, side) => {
        if (typeof c.code !== 'string' || c.code === '') failures.push(`leg A: event ${index} ${String(c.side)} side has no team.abbreviation — the join key is absent`);
        if (c.side !== 'home' && c.side !== 'away') failures.push(`leg A: event ${index} homeAway=${JSON.stringify(c.side)} — neither home nor away`);
        if (state === 'post' && (typeof c.score !== 'number' && !/^\d+$/.test(String(c.score)))) {
          failures.push(`leg A: event ${index} ${String(c.side)} score=${JSON.stringify(c.score)} on a state=post game — not a final numeric score`);
        }
      });
      if (resolved.some((id) => id === undefined)) {
        failures.push(
          `leg A: dates=${datesArg} printed a provider code the 00005 abbreviation + the two measured divergences do not resolve — ` +
            `add it to MEASURED_DIVERGENCES and to payload-contract.md, and seed it in 00018 (codes: ${competitors.map((c) => c.code).join(', ')})`,
        );
      }
    });
    // CAP-8's admission cross-check: the RAW payload decides what should have
    // reached the plan, independently of the adapter's own bookkeeping. A Final
    // Game 7 the feed printed and the adapter did not emit is the silent drop
    // finding 5 warns about; a row for anything else is an admission the rules
    // forbid. Either way the probe must not be able to exit 0.
    const expectedSeven = [];
    events.forEach((event, index) => {
      const headline = event?.competitions?.[0]?.notes?.[0]?.headline ?? null;
      const parsed = headline === null ? null : parseHeadline(headline);
      const readable = parsed !== null && !('reason' in parsed);
      const admitted =
        event?.status?.type?.state === 'post' && event?.status?.type?.description === 'Final' && readable && parsed.gameNumber === 7;
      if (!admitted) return;
      const home = (event.competitions[0].competitors ?? []).find((c) => c?.homeAway === 'home');
      const away = (event.competitions[0].competitors ?? []).find((c) => c?.homeAway === 'away');
      if (typeof home?.team?.abbreviation !== 'string' || typeof away?.team?.abbreviation !== 'string') return; // already a named failure above
      const local = etCalendarDay(new Date(event.date));
      expectedSeven.push(`${local.year}|${codeToTeamsId(home.team.abbreviation)}|${codeToTeamsId(away.team.abbreviation)}|${index}`);
    });
    const emitted = scores.map((row) => `${row.year}|${row.home_team_id}|${row.away_team_id}`);
    const dropped = expectedSeven.filter((entry) => !emitted.includes(entry.slice(0, entry.lastIndexOf('|'))));
    const unearned = emitted.filter((key) => !expectedSeven.some((entry) => entry.slice(0, entry.lastIndexOf('|')) === key));
    console.log(
      `\nadmission cross-check: the raw payload calls ${expectedSeven.length} event(s) a Final Game 7; the adapter emitted ${scores.length} score row(s) ` +
        `and ${statuses.length} status row(s) — ${dropped.length === 0 && unearned.length === 0 && statuses.length === scores.length ? 'EXACT MATCH' : 'MISMATCH'}`,
    );
    if (dropped.length > 0) {
      failures.push(`leg A: Final Game 7(s) the feed printed and the adapter dropped — silent game loss, the failure finding 5 names: ${dropped.join(', ')}`);
    }
    if (unearned.length > 0) {
      failures.push(`leg A: rows emitted for events the raw payload does not call a Final Game 7: ${unearned.join(', ')}`);
    }
    if (statuses.length !== scores.length) {
      failures.push(`leg A: ${statuses.length} status row(s) against ${scores.length} score row(s) — this shape pairs one of each, so a difference is a build bug in the adapter, not a feed fact`);
    }
    const idToAbbr = new Map([...seed].map(([abbr, id]) => [id, abbr]));
    console.log(`\nderived series (${statuses.length}):`);
    for (const status of statuses) {
      const winner = status.winner_team_id === null ? 'PENDING (3-3)' : `winner ${abbr(idToAbbr, status.winner_team_id)}`;
      console.log(`  ${status.year} ${status.round}: ${abbr(idToAbbr, status.team_a_id)} vs ${abbr(idToAbbr, status.team_b_id)} — ${winner}`);
    }

    console.log(`\nshipped port rows (${scores.length}):`);
    for (const row of scores) {
      console.log(
        `  ${row.year} game ${row.game_number}: ${abbr(idToAbbr, row.away_team_id)} ${row.away_score} @ ` +
          `${abbr(idToAbbr, row.home_team_id)} ${row.home_score} (team_a=${abbr(idToAbbr, row.team_a_id)}, team_b=${abbr(idToAbbr, row.team_b_id)})`,
      );
    }
    console.log('(an empty list is the expected result for a date with no completed Game 7 — the exclusions above explain every game that did not reach it)');
  }

  // ---- Leg B: the 30-franchise code table ------------------------------------
  console.log('\n===== leg B — the 30-franchise ESPN code table (00018 seeds from this, nowhere else) =====');
  const table = await harvestFranchiseCodes(ESPN_HEADERS, failures);
  if (table) {
    const divergences = printTeamTable(table);
    const expected = [...MEASURED_DIVERGENCES.keys()].sort();
    const found = divergences.map((d) => d.code).sort();
    if (found.join(',') !== expected.join(',')) {
      failures.push(
        `leg B: the divergence set is ${found.join(', ') || '(none)'}, but payload-contract.md measures exactly ${expected.join(', ')} — ` +
          'each new divergence gets its own row there BEFORE 00018 is seeded, then re-run; do not widen the stand-in to make this green',
      );
    }
    for (const code of codesOnFeed) {
      if (!table.some((row) => row.code === code)) failures.push(`leg B: leg A saw ${code} on the scoreboard but the team-list table does not hold it — the two routes disagree about the code space`);
    }
    console.log('00018 transcription rule: every espn_code above is the measured value, one UPDATE per row; 28 equal teams.abbreviation and the divergence rows above are the only exceptions.');
  }

  // ---- Leg C: the range control ---------------------------------------------
  console.log('\n===== leg C — range control: dates=20260601-20260608 must still be refused =====');
  let builderRefused = false;
  try {
    scoreboardUrl(RANGE_CONTROL);
  } catch {
    builderRefused = true;
  }
  console.log(`shipped scoreboardUrl("${RANGE_CONTROL}") ${builderRefused ? 'threw as designed (CAP-2: the single-date form is the only shape the adapter builds)' : 'ACCEPTED the range — the shipped builder no longer refuses it'}`);
  if (!builderRefused) failures.push('leg C: scoreboardUrl accepted a range string — the adapter can now build the form the host refuses');

  const rangeUrl = `${SCOREBOARD_ENDPOINT}?${new URLSearchParams({ dates: RANGE_CONTROL })}`;
  try {
    const response = await fetch(rangeUrl, { headers: { ...ESPN_HEADERS }, signal: AbortSignal.timeout(25000) });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    const keys = body && typeof body === 'object' ? Object.keys(body).join(', ') : '(body is not JSON)';
    console.log(`GET ${rangeUrl}\n  → HTTP ${response.status}, ${text.length} bytes, top-level keys: ${keys}`);
    if (response.status !== 400) {
      failures.push(
        `leg C: the range form answered HTTP ${response.status} instead of 400 — CAP-2's single-date-only decision rests on the measured ` +
          'refusal, so a changed answer reopens it rather than quietly widening the adapter',
      );
    } else if (body && 'events' in body) {
      failures.push('leg C: the 400 body carries an events key after all — the refusal is not the shape recorded in payload-contract.md');
    } else {
      console.log('  PASS — 400 with no events key, as measured; a backfill stays a bounded loop of single-date requests and this story builds only the single-date form.');
    }
  } catch (error) {
    failures.push(`leg C: the range control could not run — ${describeFetchThrow(error)}`);
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} leg(s) disagreed:\n  - ${failures.join('\n  - ')}`);
  }
  // The final line names which legs actually ran: CAP-8 records this output
  // verbatim into the story, and a reader of the record must not have to scroll
  // back through the run to learn that leg A — the only field-coverage leg —
  // was skipped. An unqualified "PASSED" over a skipped leg is the silence this
  // story's alarm copy exists to avoid.
  const skipped = datesArg === undefined ? ' — leg A SKIPPED (no --date= given; the field-coverage leg never ran, so re-run with --date=20260420 and --date=20260605 before this output counts as CAP-8 evidence)' : '';
  console.log(`\nPROBE PASSED${skipped} — paste this whole output into the story record; every espn_code in 00018 must trace to a line of leg B.`);
}

/**
 * Reads the franchise codes off ESPN's team list. The leaf fields are measured
 * (leg A reads `.abbreviation` off `competitors[].team` on the same API family);
 * the nesting path is not, so this reader is tolerant on purpose and bounded —
 * it searches every array of objects down to depth 6 and takes the longest one
 * that verifies. The 2026-10-04 run is what made the depth load-bearing: the
 * site route answers `{ sports: [ … ] }`, so a one-level scan sees a single
 * object and finds nothing, and the core route's `items[]` are `{ $ref }`
 * pagination pointers rather than team rows. Both now report themselves as what
 * they are instead of failing as "entry null has no code".
 *
 * Tolerance never means trust: 30 distinct codes, each resolving to a distinct
 * `00005` row, with the two divergences confirmed by the name beside them.
 * Anything that fails verification returns null after naming what it found and
 * where it found it, so the owner inspects the real shape instead of seeding
 * `00018` from a misread field.
 */
async function harvestFranchiseCodes(headers, failures) {
  // The same reason-namer the shipped adapter uses: a connection-class throw
  // arrives as an undifferentiated `fetch failed`, and two blind diagnostics look
  // like the host is down when the cause is DNS, a proxy, or a certificate.
  const { describeFetchThrow } = await import('../supabase/scripts/pipeline/adapters/espn.ts');
  const seed = await readSeedTable();

  const candidates = [
    'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams',
    'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/teams?lang=en&region=us&limit=60',
  ];

  const diagnostics = [];
  for (const url of candidates) {
    let body;
    let status;
    try {
      const response = await fetch(url, { headers: { ...headers }, signal: AbortSignal.timeout(25000) });
      status = response.status;
      body = await response.json();
    } catch (error) {
      diagnostics.push(`${url} → could not read (${describeFetchThrow(error)})`);
      continue;
    }
    if (!body || typeof body !== 'object') {
      diagnostics.push(`${url} → HTTP ${status}, body is not an object`);
      continue;
    }
    const countNote = typeof body.count === 'number' ? `, count=${body.count}` : '';
    diagnostics.push(`${url} → HTTP ${status}, top-level keys: ${Object.keys(body).join(', ')}${countNote}`);
    const { rows, notes } = analyzeTeamList(url, body, seed);
    diagnostics.push(...notes);
    if (rows) return rows;
  }

  failures.push(`leg B: no team-list route produced a verified 30-franchise table. Diagnostics:\n      ${diagnostics.join('\n      ')}`);
  return null;
}

/** The `00005` abbreviation → `teams.id` map, read off the committed migration, never the database. */
async function readSeedTable() {
  const migrationText = await readFileSafe('../supabase/migrations/00005_release_1_data_model.sql');
  const seed = new Map();
  for (const match of migrationText.matchAll(/\((\d+),\s*'[^']+',\s*'([A-Z]{3})',/g)) seed.set(match[2], Number(match[1]));
  return seed;
}

/**
 * The reader leg B needs and the reader `--fixture-teamlist=` exercises — one
 * implementation, so the offline pass proves the code the live leg runs. Returns
 * `rows: null` plus the notes that explain the refusal whenever the payload does
 * not verify; a partial table never comes back as rows.
 */
function analyzeTeamList(url, body, seed) {
  const notes = [];
  const arrays = findObjectArrays(body).sort((l, r) => r.entries.length - l.entries.length);
  if (arrays.length === 0) {
    return { rows: null, notes: ['  no array of objects anywhere within depth 6'] };
  }
  const wide = arrays.filter((a) => a.entries.length >= 30);
  if (wide.length === 0) {
    return {
      rows: null,
      notes: [`  largest array of objects found is ${arrays[0].entries.length} (< 30) at ${arrays[0].path || '(root)'} — the 30-franchise table is not reachable within depth 6`],
    };
  }
  for (const { path, entries } of wide) {
    if (entries.every((e) => e.$ref !== undefined && Object.keys(e).length === 1)) {
      notes.push(
        `  ${path || '(root)'} holds ${entries.length} objects but every one is a lone \`$ref\` — that is a pointer list, not team rows. ` +
          'Resolving it means one request per franchise, which this leg does not spend silently, so this route cannot seed 00018 — another has to carry the table.',
      );
      continue;
    }
    const rows = [];
    const problems = [];
    const fieldsUsed = new Set();
    for (const entry of entries) {
      // Some routes wrap the team in a `team` member; others print it inline.
      const found = entryCode(entry) ?? entryCode(entry.team);
      if (!found) {
        const wrapped = entry.team !== null && typeof entry.team === 'object' ? [`team:${Object.keys(entry.team).join('/')}`] : [];
        problems.push(`entry ${JSON.stringify(entry.id ?? entry.team?.id ?? null)} has no 2-4 capital-letter code (keys: ${[...Object.keys(entry), ...wrapped].join(', ')})`);
        continue;
      }
      const { code, field, name } = found;
      fieldsUsed.add(field);
      const divergence = MEASURED_DIVERGENCES.get(code);
      const abbreviation = seed.has(code) ? code : divergence?.abbreviation;
      if (abbreviation === undefined) {
        problems.push(`code ${code} ("${name}") resolves through neither the 00005 abbreviations nor the two measured divergences`);
        continue;
      }
      if (divergence && !name.toLowerCase().includes(divergence.nameMustContain)) {
        problems.push(`code ${code} was assumed to be the ${divergence.abbreviation} franchise but its name reads "${name}"`);
        continue;
      }
      rows.push({ code, name, abbreviation, teamsId: seed.get(abbreviation) });
    }

    const uniqueCodes = new Set(rows.map((r) => r.code));
    const uniqueIds = new Set(rows.map((r) => r.teamsId));
    if (rows.length < 30 || uniqueCodes.size !== 30 || uniqueIds.size !== 30) {
      notes.push(
        `  ${path} yielded ${rows.length} of ${entries.length} usable rows (${uniqueCodes.size} distinct codes, ${uniqueIds.size} distinct teams.id); ` +
          `problems: ${problems.slice(0, 6).join(' | ') || '(none)'} — not seeding 00018 from a partial table`,
      );
      continue;
    }
    notes.push(
      `source: ${url} — codes read from the "${path}" array (depth-searched, longest match), ` +
        `field(s) that supplied them: ${[...fieldsUsed].sort().join(', ')}`,
    );
    return { rows, notes };
  }
  return { rows: null, notes };
}

/** Prints leg B's table and returns the divergence rows, so the live leg and fixture mode share it. */
function printTeamTable(table) {
  const divergences = table.filter((row) => row.code !== row.abbreviation);
  console.log('teams.id | teams.abbreviation | espn_code | agreement | ESPN name');
  for (const row of [...table].sort((l, r) => l.teamsId - r.teamsId)) {
    console.log(
      `  ${String(row.teamsId).padStart(3)}      | ${row.abbreviation.padEnd(18)} | ${row.code.padEnd(9)} | ` +
        `${(row.code === row.abbreviation ? 'agree' : 'DIVERGES').padEnd(9)} | ${row.name}`,
    );
  }
  console.log(`divergences from teams.abbreviation: ${divergences.length} — ${divergences.map((d) => `${d.code}→${d.abbreviation}`).join(', ') || '(none)'}`);
  return divergences;
}

/**
 * Every array of plain objects in the payload, each tagged with the key path it
 * came from, searched to depth 6. Bounded on purpose: leg B's tolerance is about
 * not knowing the nesting, not about consuming whatever is deep in a document,
 * and the printed path lets the owner see which array supplied the table.
 */
function findObjectArrays(node, path = '', out = [], depth = 0) {
  if (node === null || typeof node !== 'object' || depth > 6 || out.length >= 40) return out;
  if (Array.isArray(node)) {
    if (node.length > 0 && node.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))) out.push({ path, entries: node });
    for (const [index, value] of node.entries()) {
      if (index >= 3) break;
      findObjectArrays(value, `${path}[${index}]`, out, depth + 1);
    }
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    findObjectArrays(value, path ? `${path}.${key}` : key, out, depth + 1);
  }
  return out;
}

/**
 * The code fields the measured routes use, or undefined when this object is not a
 * team row. The chain is tolerance — the 2026-10-04 capture of the site route
 * carries ONLY `abbreviation`, so the field that supplied each code is returned
 * and printed, rather than the note claiming a chain that never fired.
 */
function entryCode(obj) {
  if (obj === null || typeof obj !== 'object') return undefined;
  for (const field of ['abbreviation', 'displayAbbreviation', 'shortName']) {
    const code = obj[field];
    if (typeof code === 'string' && /^[A-Z]{2,4}$/.test(code)) {
      return { code, field, name: String(obj.displayName ?? obj.name ?? obj.location ?? '') };
    }
  }
  return undefined;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

/** `teams.id` back to the 00005 abbreviation — an id the map lacks prints as `?id`, never as a blank. */
function abbr(idToAbbr, id) {
  return idToAbbr.get(id) ?? `?${id}`;
}

async function readFileSafe(relative) {
  const { readFileSync } = await import('node:fs');
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}
