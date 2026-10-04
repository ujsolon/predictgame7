// Story 2.2, Decision 4: the rehearsal harness for migration 00014.
//
// What it proves, on a throwaway Docker Postgres and nothing else:
//   1. Replay correctness — 00001..00015 apply in filename order with no
//      statement error. The property under test is that 00007:57's
//      `ON CONFLICT (year, round, team_a_id, team_b_id, status)` target
//      resolves at its own point, while `status` still exists; 00014 drops
//      the column only afterwards.
//   2. Enforcement — against the replayed schema a duplicate
//      (year, team_a_id, team_b_id) insert is rejected with the
//      unique-violation SQLSTATE (23505) by the new constraint itself, and
//      the same matchup with the team slots swapped is accepted *as a raw
//      table insert* (the constraint guards the pair as stored; the
//      team_a = game-1-home convention is the runner's assertion, and
//      section 4 shows 00015's birth RPC refusing the swapped pair).
//
// What it does NOT prove (stated so nobody over-reads a green run): the
// archive's REAL totals. This container replays a 178-series x 7-row fixture
// built from the curated CSV, so its shape is the archive's shape as measured
// 2026-10-01 and, since the 2026-10-02 curation, so are its venues — the
// committed branch seeds curated values and the census (117 keep / 43 swap) is
// measured in the database, while the self-test branch that runs only while
// 00016 is unemitted still uses the deterministic synthetic assignment.
// Amended 2026-10-01 (spec-2-8): the header's former "the archive total is not
// proven by replay" stopped being true the moment section 5 seeded that fixture.
// Amended again by review pass 1 (E1): the fixture seed is applied
// INSIDE the ordered loop, immediately before a committed 00016* file, so the
// deferred AC ("00001–00016 apply in filename order → exit 0") is executable
// in both states — its guards are census guards and cannot evaluate over the
// 8 series 00001 leaves behind. The live table's own totals are still carried
// by the pre-flight (node scripts/spike-2-1/audit-unique-key.mjs), not by
// this container — the agent never reads production.
//
// Why not `supabase db reset`: supabase/.temp/project-ref points at
// PRODUCTION and there is no supabase/config.toml in this checkout, so no
// Supabase CLI db command and no outbound psql may run from here (spec
// Boundaries · Never). The container is local, throwaway, publishes no port,
// and is removed in a finally block.
//
// Environment scaffolding pre-created before the replay (plain Postgres has
// none of it; the migrations themselves are untouched):
//   - roles `anon` / `authenticated` — the RLS policies (00002, 00011) name them;
//   - role `service_role` — migration 00015 grants its pipeline RPCs EXECUTE
//     to that role only, so the GRANT needs the role to exist off-production;
//   - extension `uuid-ossp` — 00002:2 defaults ids with uuid_generate_v4();
//   - schema `auth` + table `auth.users(id uuid)` — 00004:2 FKs profiles to it.
//
// Since Story 2.3 the run also rehearses 00015's two RPCs (birth +
// completion) with psql — see section 4 — because Decision 2 puts the
// rehearsal of those functions here, off-production, before the owner ever
// applies the migration. Since Story 2.8 (spec-2-8 D2/D3, amended by review
// pass 1 E1) section 5 drives the 00016 guard set over a 178-series fixture
// archive with one demonstrable failure per guard, in whichever of the two
// states the repo is in: 00016 unemitted → the generator's SELF-TEST
// rendering from a temp path with the synthetic 117/43 assignment
// (COVERED_THROUGH stays 15, nothing enters supabase/migrations/); 00016
// committed by the curation commit → the ordered replay itself applies the
// committed file over the seeded fixture, and section 5 tampers the committed
// text, runs the generator's --check against the real CSV<->migration pair,
// and re-applies the committed file for the census. Since Story 2.5 section 6
// exercises 00017's pipeline_refresh_insights_cache() over four archive
// states — the synthetic fixture, hand-authored mechanics fixtures (zero
// denominator, pending exclusion, ABA exclusion, game-7-only read), the empty
// population, and U11's real-score fixture built in-repo from the committed
// docs/NBASeriesResults.xlsx joined to the committed curated CSV by
// (year, unordered team pair). The real-fixture arithmetic is a TRANSCRIPTION
// check (fixture and cross-check share one join — agreement proves the SQL
// faithful to the join, not the join faithful to reality); the two anchors
// that answer to the world (nba.com's published 117-43, planning's separately
// derived 59 of 159) are named in its output.
//
// Section 6 has SIX sub-sections, and the last two are this story's negative
// proofs — do not "clean them up". Story 2.8 set the convention 00017 inherits:
// a guard that has never been seen to reject is not yet a guard, and both
// load-bearing docs (docs/CURRENT_DATA_MODEL.md § "Insights cache refresh",
// spec-2-5-insights-cache-refresh.md Verification) name 6e/6f as the answers to
// the frozen I/O matrix's two negative rows:
//   6e drops `series.league` inside one transaction and re-applies 00017, so its
//      `league_column_present` guard is OBSERVED REFUSING — the next assertion
//      then proves the tamper left nothing behind.
//   6f flips one curated Game-7 home side in memory (no database, the committed
//      CSV untouched) and shows the measured home wins move off the pinned 117
//      while the population holds — the pin is sensitive, not sticky, which is
//      the only in-repo answer "Venue backfill short or mis-keyed" has.
// `node scripts/rehearse-migration-00014.mjs --fixture-report` runs just the
// real-fixture parser and its measurements, with no Docker and no database —
// which is what makes U11's numbers reproducible from inside the gate (see the
// `the scripts/** coverage gap (E5)` suite in tests/pipeline/venue-backfill.test.ts).
//
// Since Story 2.13 section 7 rehearses 00018's teams.espn_code: the additive
// nullable column and the 59-row population, the six measured code divergences
// read back out of the database, the shape CHECK refusing a display name and a
// lowercase/over-long code while a legal one is accepted, the partial unique
// index refusing a DUPLICATE non-null code by name (run-sheet step 2's negative
// proof) while the 29 historical NULLs stay free, and 00018's four post-condition
// guards each observed firing over a deliberately wrong population built from the
// seeded state — the 6e convention again, and each tamper then proven to have
// left nothing behind.
//
// Usage: node scripts/rehearse-migration-00014.mjs [--fixture-report] — no other
// argument is accepted: a typo (`--fixture-repor`) refuses the run rather than
// silently starting the full Docker rehearsal.
// Exit: 0 = every claim held; non-zero on the first miss (fail-fast, so a
// stale or broken state can never pass it). Checked by running it — like
// every file under scripts/, Biome's files.includes does not cover it.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

// The Story 2.8 generator, imported — not reimplemented — so section 5's
// self-test exercises the shipped emit path (native type-stripping, Node
// >= 22.18, the same requirement scripts/probe-nba-com-adapter.mjs states).
const venueBackfill = await import('../supabase/scripts/pipeline/venueBackfill.ts');

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(repoRoot, 'supabase', 'migrations');
const container = `pg7-rehearse-00014-${process.pid}`;
const dbUser = 'postgres';
const dbName = 'rehearse';

// The claim is "every migration through the newest one applied in order", so the
// replay check is per-number coverage, not a file count: a renamed or deleted
// migration in the middle of the range would otherwise leave the script green
// while the replay it certifies never happened. COVERED_THROUGH is bumped when a
// story commits a migration whose replay this must certify. A 00016* file on
// disk while the ceiling is still 15 is a RehearsalFailure, not a warning
// (review pass 1, E1): emit and ceiling share a commit or neither is
// certified.
// Story 2.8 raised this to 16 on 2026-10-02, in the commit that landed the
// curated venues and the emitted 00016. They must share a commit: 00016 is
// GENERATOR-OWNED and the generator refuses to emit while any curated NBA/BAA
// venue is blank, so the ceiling tracked curation, not code — while the venues
// were blank the file above 15 did not exist and section 5 certified the
// machinery off a temp-path self-test rendering instead.
// Story 2.5 raises it to 17 in the same commit that emits
// 00017_pipeline_insights_refresh.sql — the hand-written-migration sharing
// rule, the same pairing 00014's own bump established.
// Story 2.13 raises it to 18 in the same commit that emits
// 00018_teams_espn_code.sql, and section 7 is that coverage: the additive
// column, its shape CHECK, the partial unique index with its duplicate-code
// negative proof, the four post-condition guards each observed firing, and
// EXPECTED_TEAM_COUNT=59 still holding because 00018 inserts no row.
const COVERED_THROUGH = 18;

// A failed claim is thrown, never process.exit'd: an exit inside the try
// would skip the container teardown (measured — the first run of this script
// left its container behind exactly that way).
class RehearsalFailure extends Error {}

// Every docker/psql call gets a ceiling: spawnSync blocks, so a hung daemon or
// a psql session that never returns would otherwise strand the script mid-run
// with its container still up. 10 minutes is far above any single call here
// (the slowest measured is the postgres:16 pull), so a timeout is a hang, not
// slow-but-working.
const DOCKER_TIMEOUT_MS = 10 * 60 * 1000;

function docker(args, { input, allowFail } = {}) {
  const res = spawnSync('docker', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    timeout: DOCKER_TIMEOUT_MS,
  });
  if (res.error) {
    throw new Error(`docker ${args[0]} failed to run: ${res.error.message}. Is the Docker daemon up? (docker version)`);
  }
  if (res.status !== 0 && !allowFail) {
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
    throw new Error(`docker ${args.slice(0, 2).join(' ')} exited ${res.status}:\n${out}`);
  }
  return res;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// psql inside the container with ON_ERROR_STOP, so any statement error
// aborts the session and surfaces as a non-zero exit. `-i` only when a file
// is piped through stdin; `tuplesOnly` strips headers/padding so a scalar
// query compares as its bare value.
function psql({ file, sql, tuplesOnly }) {
  const exec = file !== undefined ? ['exec', '-i'] : ['exec'];
  const session = file !== undefined ? ['-f', '-'] : ['-c', sql];
  const format = tuplesOnly ? ['-t', '-A'] : [];
  return docker([...exec, container, 'psql', '-U', dbUser, '-d', dbName, '-v', 'ON_ERROR_STOP=1', ...format, ...session], {
    input: file,
    allowFail: true,
  });
}

function mustSucceed(label, res) {
  if (res.status !== 0) {
    throw new RehearsalFailure(`${label} (exit ${res.status}):\n${res.stdout ?? ''}${res.stderr ?? ''}`);
  }
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`ok   ${label}`);
    return;
  }
  throw new RehearsalFailure(`${label}${detail ? ` — ${detail}` : ''}`);
}

function psqlValue(sql) {
  const res = psql({ sql, tuplesOnly: true });
  mustSucceed(`value query failed: ${sql}`, res);
  return res.stdout.trim();
}

function countWhere(where) {
  return Number(psqlValue(`SELECT count(*) FROM public.series WHERE ${where}`));
}

function waitForReady(maxSeconds = 120) {
  const deadline = Date.now() + maxSeconds * 1000;
  while (Date.now() < deadline) {
    // Not `pg_isready`: the official image runs initdb against a temporary
    // server that accepts connections on the container's unix socket, and the
    // `rehearse` database does not exist yet while it is up. Connecting to
    // `rehearse` is the gate that cannot open early.
    const res = docker(['exec', container, 'psql', '-U', dbUser, '-d', dbName, '-tA', '-c', 'SELECT 1'], { allowFail: true });
    if (res.status === 0 && res.stdout.trim() === '1') return;
    sleepSync(2000);
  }
  throw new Error(`postgres did not accept a connection to ${dbName} within ${maxSeconds}s`);
}

// ---------------------------------------------------------------------------
// Story 2.5, owner decision U11 — the real-score fixture machinery.
//
// Built in-repo from the two COMMITTED sources, by the proven zip/XML route
// (no parser dependency): `docs/NBASeriesResults.xlsx` read through a minimal
// central-directory walk + `inflateRawSync`, `t="s"` cells resolved against
// `xl/sharedStrings.xml`. The sheet speaks franchise full names (the `League`
// column is B, retained here and dropped by the original loader), so names
// resolve to `teams.abbreviation` through the committed 00005 + 00007 seed —
// the same 59 rows `00016` resolves through. The join to
// `data/game7_venues_curated.csv` is on the (year, unordered team pair) —
// never on slot order (the 2026 WCF is the stored counter-example, and the
// sheet itself is winner-first for 177 of its rows). Game-7 rows are seeded
// venue-TRUE from the curated CSV; only `home_team_stats` can be skewed by a
// winner-first seeding, which is why that is a rule and not taste.
//
// The sheet carries 177 Game-7 rows and its NBA/BAA population is 159, not
// production's 160 — the 2026 Western Conference Finals is the row it lacks,
// and that row is one of the archive's 43 home LOSSES, so the fixture's home
// numerator is production's 117 while its denominator is honestly 159. The
// 117-of-160 pair therefore stays the owner's post-apply read against
// epic-2-context.md:44; nothing printed by this fixture may claim 160.
// ---------------------------------------------------------------------------

/** Read one named entry out of a zip buffer (xlsx) — central-directory walk, stored or raw-deflate. */
function readZipEntry(zip, wantedName) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 66000); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error(`${wantedName}: xlsx has no End of Central Directory — not a zip archive`);
  const total = zip.readUInt16LE(eocd + 10);
  let off = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (zip.readUInt32LE(off) !== 0x02014b50) throw new Error(`${wantedName}: corrupt central directory at ${off}`);
    const method = zip.readUInt16LE(off + 10);
    const compSize = zip.readUInt32LE(off + 20);
    const nameLen = zip.readUInt16LE(off + 28);
    const extraLen = zip.readUInt16LE(off + 30);
    const commentLen = zip.readUInt16LE(off + 32);
    const localOff = zip.readUInt32LE(off + 42);
    const name = zip.toString('utf8', off + 46, off + 46 + nameLen);
    if (name === wantedName) {
      const localNameLen = zip.readUInt16LE(localOff + 26);
      const localExtraLen = zip.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + localNameLen + localExtraLen;
      const raw = zip.subarray(dataStart, dataStart + compSize);
      return method === 0 ? raw : inflateRawSync(raw);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`xlsx has no ${wantedName} entry`);
}

/** `<si>…</si>` → plain strings (the sheet stores team/round labels as shared strings). */
function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
}

/** One data row of sheet1 as Map<columnLetter, string>; row 1 (the header) is skipped. */
function parseSheetRows(sheetXml, shared) {
  const rows = [];
  for (const rowMatch of sheetXml.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    if (Number(rowMatch[1]) === 1) continue;
    const cells = new Map();
    for (const c of rowMatch[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(?:<v>([\s\S]*?)<\/v>)?<\/c>)/g)) {
      const isShared = /t="s"/.test(c[2]);
      cells.set(c[1], c[3] === undefined ? '' : isShared ? shared[Number(c[3])] : c[3]);
    }
    rows.push(cells);
  }
  return rows;
}

/** franchise full_name (lowercased) → teams.abbreviation, from the committed 00005 + 00007 seed. */
function teamsSeedNames() {
  const seedText =
    readFileSync(join(migrationsDir, '00005_release_1_data_model.sql'), 'utf8') +
    readFileSync(join(migrationsDir, '00007_backfill_missing_historical_series.sql'), 'utf8');
  const byName = new Map();
  for (const m of seedText.matchAll(/\((\d+),\s*'([^']+)',\s*'([A-Z]{3})',/g)) {
    byName.set(m[2].toLowerCase(), m[3]);
  }
  if (byName.size !== venueBackfill.EXPECTED_TEAM_COUNT) {
    throw new Error(
      `teams seed parse found ${byName.size} names, expected exactly ${venueBackfill.EXPECTED_TEAM_COUNT} (00005 + 00007) — fix the reader before trusting a fixture built on it`,
    );
  }
  return byName;
}

/** Half-up round to 2 decimals of num/den, in exact BigInt arithmetic — the same reading PostgreSQL's round(numeric,2) gives. */
function round2OfFraction(num, den) {
  const scaledNum = BigInt(num) * 100n;
  const d = BigInt(den);
  const q = scaledNum / d;
  const r = scaledNum % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return Number(rounded) / 100;
}

/**
 * Parse + join + measure. Returns the NBA/BAA Game-7 fixture rows (venue-true
 * game 7 already resolved), the ABA rows (winner-fiction as archived), and
 * every measurement the harness cross-checks the RPC against — all from THIS
 * one join, so agreement is a transcription check by construction (elicitation
 * P5 says exactly that, and the section prints it that way).
 */
function loadRealGame7Fixture(curatedRows) {
  const xlsx = readFileSync(join(repoRoot, 'docs', 'NBASeriesResults.xlsx'));
  const shared = parseSharedStrings(readZipEntry(xlsx, 'xl/sharedStrings.xml').toString('utf8'));
  const rows = parseSheetRows(readZipEntry(xlsx, 'xl/worksheets/sheet1.xml').toString('utf8'), shared);
  const nameToAbbr = teamsSeedNames();

  // Sheet columns (verified against row 1): A year, B league, C series type,
  // D winner team, E winner games, F loser team, G loser games, H total games,
  // I..O = G1..G7 winner score, P..V = G1..G7 loser score.
  const abbr = (value) => {
    const name = String(value ?? '').trim().toLowerCase();
    const code = nameToAbbr.get(name);
    if (code === undefined) throw new Error(`sheet team name "${value}" is not in the 00005+00007 teams seed`);
    return code;
  };

  const curatedByPair = new Map();
  for (const row of curatedRows) {
    const key = `${row.year}|${[row.teamA, row.teamB].sort().join('|')}`;
    if (curatedByPair.has(key)) throw new Error(`curated CSV holds two rows for ${key} — parseVenuesCsv should have refused it`);
    curatedByPair.set(key, row);
  }

  const g7Rows = [];
  for (const cells of rows) {
    const totalGames = Number(cells.get('H'));
    if (!Number.isFinite(totalGames) || totalGames !== 7) continue;
    const year = Number(cells.get('A'));
    const league = String(cells.get('B') ?? '').trim();
    if (!Number.isFinite(year) || !['NBA', 'BAA', 'ABA'].includes(league)) {
      throw new Error(`sheet row for year ${cells.get('A')} has league "${cells.get('B')}" — expected NBA/BAA/ABA on a Game-7 row`);
    }
    const winner = abbr(cells.get('D'));
    const loser = abbr(cells.get('F'));
    const games = [];
    for (let g = 0; g < 7; g++) {
      const w = Number(cells.get(String.fromCharCode(73 + g))); // I..O
      const l = Number(cells.get(String.fromCharCode(80 + g))); // P..V
      if (!Number.isFinite(w) || !Number.isFinite(l) || w === l) {
        throw new Error(
          `sheet ${year} ${winner}/${loser}: game ${g + 1} scores "${cells.get(String.fromCharCode(73 + g))}" vs "${cells.get(String.fromCharCode(80 + g))}" are not a decided pair`,
        );
      }
      games.push([w, l]);
    }
    if (games[6][0] <= games[6][1]) throw new Error(`sheet ${year} ${winner}/${loser}: the series winner did not win game 7`);
    g7Rows.push({ year, league, round: String(cells.get('C') ?? '').trim(), winner, loser, games });
  }

  const sheetBaaNba = g7Rows.filter((r) => r.league !== 'ABA');
  const sheetAba = g7Rows.filter((r) => r.league === 'ABA');

  // Join the NBA/BAA rows to the curated CSV on (year, unordered pair).
  // Every one must join — the fixture population IS the pinned literal.
  const joined = [];
  const unmatched = [];
  const claimedCurated = new Set();
  for (const row of sheetBaaNba) {
    const key = `${row.year}|${[row.winner, row.loser].sort().join('|')}`;
    const curated = curatedByPair.get(key);
    if (curated === undefined || curated.league !== row.league) {
      unmatched.push(`${row.year} ${row.winner}/${row.loser} (${row.league})`);
      continue;
    }
    claimedCurated.add(key);
    joined.push({ ...row, venueHome: curated.home });
  }

  // The curated rows the sheet does not carry — the named counter-example is
  // the 2026 Western Conference Finals, the fixture's whole 159-vs-160 story.
  const curatedNbaBaaKeys = curatedRows
    .filter((r) => venueBackfill.isNbaBaa(r))
    .map((r) => `${r.year}|${[r.teamA, r.teamB].sort().join('|')}`);
  const csvOnly = curatedNbaBaaKeys.filter((k) => !claimedCurated.has(k));

  // ABA rows are seeded (and excluded) when their pair is in the curated CSV
  // too; the hand-authored fixture always covers the ABA exclusion itself.
  const abaSeeded = [];
  const abaUnmatched = [];
  for (const row of sheetAba) {
    const key = `${row.year}|${[row.winner, row.loser].sort().join('|')}`;
    if (curatedByPair.has(key)) abaSeeded.push(row);
    else abaUnmatched.push(`${row.year} ${row.winner}/${row.loser}`);
  }

  // A join that lands nothing has no population to measure: dividing by
  // `joined.length` below would surface as a raw `RangeError: Division by zero`
  // (and `median` as NaN) instead of naming the broken join. Callers check
  // `unmatched`/`measures.total` AFTER this function returns, so the abort
  // lives here, where the empty join is first knowable.
  if (joined.length === 0) {
    throw new RehearsalFailure(
      `the (year, unordered team pair) join between the sheet and the curated CSV produced ZERO NBA/BAA Game-7 rows — nothing to measure ` +
        `(${sheetBaaNba.length} sheet row(s), ${unmatched.length} of them unmatched, e.g. ${unmatched.slice(0, 3).join('; ') || 'none'}); resolve the join, never a pin`,
    );
  }

  const homeWins = joined.filter((r) => r.venueHome === r.winner).length;
  const g6Won = joined.filter((r) => r.games[5][0] > r.games[5][1]).length;
  const margins = joined.map((r) => Math.abs(r.games[6][0] - r.games[6][1])).sort((a, b) => a - b);
  const marginSum = margins.reduce((a, b) => a + b, 0);
  const median =
    margins.length % 2 === 1
      ? margins[(margins.length - 1) / 2]
      : round2OfFraction(margins[margins.length / 2 - 1] + margins[margins.length / 2], 2);

  return {
    joined,
    abaSeeded,
    abaUnmatched,
    unmatched,
    csvOnly,
    measures: {
      total: joined.length,
      homeWins,
      g6Won,
      average: round2OfFraction(marginSum, joined.length),
      median,
      max: margins[margins.length - 1],
      min: margins[0],
      homeRate: round2OfFraction(homeWins * 100, joined.length),
      g6Rate: round2OfFraction(g6Won * 100, joined.length),
    },
  };
}

/** The seed SQL for the real-score fixture: team_a = winner (the 00007 shape the sheet came through), games 1-6 winner-first, game 7 venue-TRUE from the curated CSV. */
function renderRealFixtureSeed(fixture) {
  const idOf = (abbr) => `(SELECT id FROM public.teams WHERE abbreviation = '${abbr}')`;
  const q = (text) => `'${String(text).replace(/'/g, "''")}'`;
  const seriesRows = [];
  const scoreRows = [];
  const seedOne = (row, venueHome) => {
    const id = `md5('pg7-2-5-real|${row.year}|${row.winner}|${row.loser}')::uuid`;
    seriesRows.push(
      `(${id}, ${row.year}, ${q(row.round)}, ${idOf(row.winner)}, ${idOf(row.loser)}, ${idOf(row.winner)}, ${q(row.league)})`,
    );
    for (let g = 0; g < 7; g++) {
      const gameNumber = g + 1;
      const [wScore, lScore] = row.games[g];
      // Games 1-6 carry the archive's winner-first orientation (they are never
      // a venue claim — Story 2.5's population reads only game 7); game 7 is
      // venue-true, sides and their scores travelling together.
      const home = gameNumber === 7 && venueHome !== undefined ? venueHome : row.winner;
      const away = home === row.winner ? row.loser : row.winner;
      const homeScore = home === row.winner ? wScore : lScore;
      const awayScore = home === row.winner ? lScore : wScore;
      const gameWinner = homeScore > awayScore ? home : away;
      scoreRows.push(
        `(${id}, ${gameNumber}, ${idOf(home)}, ${idOf(away)}, ${homeScore}, ${awayScore}, ${idOf(gameWinner)})`,
      );
    }
  };
  for (const row of fixture.joined) seedOne(row, row.venueHome);
  for (const row of fixture.abaSeeded) seedOne(row, undefined);
  return `-- Story 2.5 U11 real-score fixture: the committed docs/NBASeriesResults.xlsx Game-7
-- rows joined to the committed data/game7_venues_curated.csv on (year,
-- unordered team pair). NBA/BAA game-7 rows are venue-TRUE; games 1-6 carry
-- the archive's winner-first orientation; the ABA rows are seeded winner-
-- fiction exactly as the archive holds them, to be excluded by the league
-- filter. Throwaway container only — this never touches production data.

DELETE FROM public.series_game_scores;
DELETE FROM public.series;

INSERT INTO public.series (id, year, round, team_a_id, team_b_id, winner_team_id, league) VALUES
${seriesRows.join(',\n')};

INSERT INTO public.series_game_scores (series_id, game_number, home_team_id, away_team_id, home_score, away_score, winner_team_id) VALUES
${scoreRows.join(',\n')};
`;
}

/** U11's numbers as pinned by the spec (planning's measurements): the fixture's stop-literals. */
const U11_PINS = { total: 159, homeWins: 117, g6Won: 59 };

/** `--fixture-report`: run ONLY the parser + join + measurements — no Docker, no database. */
function fixtureReport() {
  const curatedRows = venueBackfill.parseVenuesCsv(
    readFileSync(venueBackfill.CURATED_CSV_PATH, 'utf8'),
    'game7_venues_curated.csv',
  );
  const fixture = loadRealGame7Fixture(curatedRows);
  const m = fixture.measures;
  console.log('U11 real-score fixture report (parser + join only — no database was touched):');
  console.log(
    `  NBA/BAA Game-7 rows joined to the curated CSV: ${m.total} (pinned literal ${U11_PINS.total}) — the sheet lacks the 2026 Western Conference Finals Game 7, so this is 159, NOT production's 160`,
  );
  console.log(`  curated NBA/BAA rows the sheet does not carry: ${fixture.csvOnly.length} (${fixture.csvOnly.join(', ') || 'none'})`);
  console.log(
    `  home wins over the fixture (game 7 venue-true from the CSV): ${m.homeWins} (pinned literal ${U11_PINS.homeWins}) — external anchor: nba.com's published 117-43`,
  );
  console.log(
    `  game-6 winners who took the series: ${m.g6Won} (pinned literal ${U11_PINS.g6Won}) — external anchor: planning's separately derived 59 of 159`,
  );
  console.log(`  game-7 margins: average ${m.average}, median ${m.median}, max ${m.max}, min ${m.min}`);
  console.log(`  win rates (percentage units): home ${m.homeRate}, game 6 ${m.g6Rate}`);
  console.log(`  ABA Game-7 rows seeded as exclusion bait: ${fixture.abaSeeded.length}; ABA rows the curated CSV does not carry: ${fixture.abaUnmatched.join(', ') || 'none'}`);
  console.log(
    '  fixture and cross-check share one join, so agreement is a TRANSCRIPTION CHECK, not a second measurement of the world (elicitation P5).',
  );
  const ok =
    fixture.unmatched.length === 0 &&
    m.total === U11_PINS.total &&
    m.homeWins === U11_PINS.homeWins &&
    m.g6Won === U11_PINS.g6Won &&
    fixture.csvOnly.length === 1;
  console.log(ok ? 'FIXTURE REPORT OK — every pinned literal reproduces' : 'FIXTURE REPORT FAILED — a pinned literal does not reproduce; resolve the join, never the pin');
  process.exitCode = ok ? 0 : 1;
}

function main() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`rehearsal container: ${container} (postgres:16, throwaway, no published port)`);
  console.log(`migrations to replay: ${files.length}`);

  // Story 2.8 state detection (review pass 1, E1): whether the curation
  // commit has emitted 00016 yet decides which half of this run applies it —
  // the ordered replay (committed) or section 5's temp-path self-test
  // rendering (unemitted). The fixture archive is built from the curated CSV
  // by the generator — no committed derived file, so it cannot drift — and
  // seeded inside the ordered loop right before a committed 00016.
  const migration016File = files.find((f) => f.startsWith('00016'));
  const curatedRows = venueBackfill.parseVenuesCsv(
    readFileSync(venueBackfill.CURATED_CSV_PATH, 'utf8'),
    'game7_venues_curated.csv',
  );
  const fixtureSeedText = venueBackfill.renderFixtureSeed(curatedRows);

  // Review M1: every file IS replayed, but only 00001..COVERED_THROUGH is
  // certified present-and-in-order. By D2/E1 the emitting commit and the
  // ceiling bump share a commit, so ANY file above the ceiling means that
  // pairing broke — hard failure, not a warning. (This check was 00016-specific
  // until the ceiling reached 16 and the prefix test went vacuous; pass 3,
  // P3-4 generalized it rather than delete the enforcement.)
  const beyondCoverage = files.filter((f) => Number(f.slice(0, 5)) > COVERED_THROUGH);
  if (beyondCoverage.length) {
    throw new RehearsalFailure(
      `${beyondCoverage.join(', ')} exists in supabase/migrations/ while COVERED_THROUGH = ${COVERED_THROUGH} — the emitting commit must bump the ceiling in the SAME commit (spec-2-8 E1: emit and ceiling share a commit or neither is certified).`,
    );
  }

  try {
    // Started inside the try: a `docker run` that creates the container and
    // then fails (pull or start) would otherwise leak it past the teardown.
    docker(['run', '-d', '--name', container, '-e', `POSTGRES_PASSWORD=${container}`, '-e', `POSTGRES_DB=${dbName}`, 'postgres:16']);
    waitForReady();

    // Environment scaffolding (see header) — never a rewrite of the migrations.
    mustSucceed(
      'pre-create anon/authenticated roles, uuid-ossp, auth.users stub',
      psql({
        sql: `
          CREATE ROLE anon NOLOGIN;
          CREATE ROLE authenticated NOLOGIN;
          CREATE ROLE service_role NOLOGIN;
          CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
          CREATE SCHEMA IF NOT EXISTS auth;
          CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
        `,
      }),
    );

    // 1) Ordered replay — one psql session per file, in filename order.
    // Story 2.8 (E1): a committed 00016's guards are census guards, so the
    // fixture archive is seeded INSIDE this loop, immediately before that
    // file — this is what makes "00001–00016 apply in filename order → exit
    // 0" executable once the curation commit emits the migration. While it
    // is unemitted the loop never reaches a 00016 and the replay is exactly
    // the 2.2–2.5 one it was.
    for (const file of files) {
      if (file === migration016File) {
        mustSucceed('fixture archive seeded inside the ordered replay (immediately before 00016)', psql({ file: fixtureSeedText }));
        console.log('seeded 178-series x 7-row fixture archive from the curated CSV (pre-00016 state)');
      }
      const res = psql({ file: readFileSync(join(migrationsDir, file), 'utf8') });
      mustSucceed(`${file} did not apply cleanly`, res);
      console.log(`applied ${file}`);
    }
    // Per-number coverage against COVERED_THROUGH (defined with the header
    // constants so the pre-flight warning and this assertion share it).
    const prefixes = new Set(files.map((f) => f.slice(0, 5)));
    const missing = [];
    for (let n = 1; n <= COVERED_THROUGH; n++) {
      const prefix = String(n).padStart(5, '0');
      if (!prefixes.has(prefix)) missing.push(prefix);
    }
    assert(
      `migrations 00001..000${COVERED_THROUGH} all present and applied in filename order with no statement error — 00007:57 ON CONFLICT status target resolved at its own point`,
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')} (found ${files.join(', ')})` : '',
    );

    // 2) Schema shape: \d printed for the report, plus assertions.
    const desc = psql({ sql: '\\d public.series' });
    mustSucceed('\\d public.series', desc);
    console.log(`\n-- \\d public.series --\n${desc.stdout.trim()}\n`);

    assert(
      'series_year_team_pair_key UNIQUE is present',
      psqlValue("SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.series'::regclass AND conname = 'series_year_team_pair_key'") === '1',
    );
    assert(
      'idx_series_identity is absent',
      psqlValue("SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_series_identity'") === '0',
    );
    assert(
      'status column is absent (its DEFAULT went with it)',
      psqlValue("SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'series' AND column_name = 'status'") === '0',
    );
    assert(
      'chk_series_status is absent',
      psqlValue("SELECT count(*) FROM pg_constraint WHERE conname = 'chk_series_status'") === '0',
    );
    const replaySeriesRows = psqlValue('SELECT count(*) FROM public.series');
    if (migration016File) {
      // The deferred AC, made executable: the committed 00016 applied inside
      // the ordered replay over the seeded fixture — census guards and all.
      assert(
        `ordered replay applied the committed ${migration016File} over the seeded fixture: 178 series rows and a live league column`,
        replaySeriesRows === '178' &&
          psqlValue("SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'series' AND column_name = 'league'") === '1' &&
          psqlValue('SELECT count(*) FROM public.series WHERE league IS NULL') === '0',
      );
    } else {
      console.log(`note   fixture series rows in the replayed schema: ${replaySeriesRows} (fixture, not the 178-row archive — 00016 unemitted, see header)`);
    }

    // 3) Enforcement. Pick a stored pair whose slot-swapped twin is absent,
    //    so the duplicate test and the swap test target a pair as stored.
    const picked = psqlValue(`
      SELECT s.year || '|' || s.team_a_id || '|' || s.team_b_id
      FROM public.series s
      WHERE NOT EXISTS (
        SELECT 1 FROM public.series t
        WHERE t.year = s.year AND t.team_a_id = s.team_b_id AND t.team_b_id = s.team_a_id
      )
      ORDER BY s.year DESC
      LIMIT 1
    `);
    const [year, a, b] = picked.split('|').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(a) || !Number.isFinite(b)) {
      throw new RehearsalFailure(`could not pick a fixture pair from the replayed table (got "${picked}")`);
    }

    // Duplicate insert: the DO block only completes if the rejection comes
    // from the new constraint with SQLSTATE 23505; an accepted duplicate or
    // a rejection by any other constraint raises and exits non-zero.
    const dup = psql({
      sql: `
        DO $$
        DECLARE
          v_constraint text;
        BEGIN
          INSERT INTO public.series (year, round, team_a_id, team_b_id)
            VALUES (${year}, 'Rehearsal Duplicate', ${a}, ${b});
          RAISE EXCEPTION 'duplicate pair %/%/% was NOT rejected', ${year}, ${a}, ${b};
        EXCEPTION WHEN unique_violation THEN
          GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
          IF v_constraint <> 'series_year_team_pair_key' THEN
            RAISE EXCEPTION 'rejected by constraint % instead of series_year_team_pair_key', v_constraint;
          END IF;
        END $$;
      `,
    });
    mustSucceed('duplicate (year, team_a_id, team_b_id) insert was not rejected by the database', dup);
    assert(
      `duplicate (${year}, ${a}, ${b}) rejected with unique-violation SQLSTATE 23505 by series_year_team_pair_key`,
      countWhere("round = 'Rehearsal Duplicate'") === 0,
    );

    // Slot-swapped insert must be ACCEPTED: the constraint guards the pair
    // as stored, not the team_a = game-1-home convention (Decision 1).
    const swap = psql({
      sql: `INSERT INTO public.series (year, round, team_a_id, team_b_id) VALUES (${year}, 'Rehearsal Slot Swap', ${b}, ${a}) RETURNING id;`,
    });
    mustSucceed('slot-swapped insert of the same matchup was rejected (it must NOT be — that half belongs to Story 2.3)', swap);
    assert(
      `slot-swapped insert (${year}, ${b}, ${a}) accepted — the DB half of the identity guard is the pair as stored, only`,
      countWhere("round = 'Rehearsal Slot Swap'") === 1,
    );

    // 4) Migration 00015 — the pipeline birth/completion RPCs (Story 2.3,
    //    Decision 2): every assert fires before anything writes, a completion
    //    lands game 7 + winner in one call, a rejected write leaves the row
    //    exactly as it was, and EXECUTE belongs to service_role alone. Teams
    //    10 (GSW) and 6 (CLE) are seeded by 00005; years 2096..2099 are far
    //    from any fixture series, so each check owns its identity cleanly.
    const TEAM_A = 10;
    const TEAM_B = 6;
    const sixThreeThree = JSON.stringify([
      { game_number: 1, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 108, away_score: 89 },
      { game_number: 2, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 118, away_score: 98 },
      { game_number: 3, home_team_id: TEAM_B, away_team_id: TEAM_A, home_score: 120, away_score: 108 },
      { game_number: 4, home_team_id: TEAM_B, away_team_id: TEAM_A, home_score: 137, away_score: 116 },
      { game_number: 5, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 104, away_score: 87 },
      { game_number: 6, home_team_id: TEAM_B, away_team_id: TEAM_A, home_score: 115, away_score: 103 },
    ]); // TEAM_A wins 1/2/5, TEAM_B 3/4/6 — a certified 3–3
    const gameSeven = JSON.stringify({ game_number: 7, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 89, away_score: 96 });
    const fourTwo = JSON.stringify([
      { game_number: 1, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 108, away_score: 89 },
      { game_number: 2, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 118, away_score: 98 },
      { game_number: 3, home_team_id: TEAM_B, away_team_id: TEAM_A, home_score: 100, away_score: 108 },
      { game_number: 4, home_team_id: TEAM_B, away_team_id: TEAM_A, home_score: 101, away_score: 112 },
      { game_number: 5, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 104, away_score: 87 },
      { game_number: 6, home_team_id: TEAM_B, away_team_id: TEAM_A, home_score: 90, away_score: 110 },
    ]); // TEAM_A wins 1/2/5/6 — 4–2, not a birth
    const tieSix = JSON.stringify([
      { game_number: 1, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 108, away_score: 89 },
      { game_number: 2, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 118, away_score: 98 },
      { game_number: 3, home_team_id: TEAM_B, away_team_id: TEAM_A, home_score: 100, away_score: 100 },
      { game_number: 4, home_team_id: TEAM_B, away_team_id: TEAM_A, home_score: 137, away_score: 116 },
      { game_number: 5, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 104, away_score: 87 },
      { game_number: 6, home_team_id: TEAM_B, away_team_id: TEAM_A, home_score: 115, away_score: 103 },
    ]);
    const gappedSeven = JSON.stringify([
      { game_number: 1, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 108, away_score: 89 },
      { game_number: 2, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 118, away_score: 98 },
      { game_number: 4, home_team_id: TEAM_B, away_team_id: TEAM_A, home_score: 137, away_score: 116 },
      { game_number: 5, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 104, away_score: 87 },
      { game_number: 6, home_team_id: TEAM_B, away_team_id: TEAM_A, home_score: 115, away_score: 103 },
      { game_number: 7, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 89, away_score: 96 },
    ]); // six rows, but the set is {1,2,4,5,6,7} — the count is right, the set is not
    // Seven elements where the extra one is missing a key: the well-formed
    // element counts ignore it (six of them are fine) and the NULL comparisons
    // ignore it too, so without the raw length assert it reaches the INSERT and
    // fails as a bare NOT NULL violation instead of naming the birth rule.
    const malformedExtra = JSON.stringify([...JSON.parse(sixThreeThree), { game_number: 6, home_team_id: TEAM_A, away_team_id: TEAM_B, home_score: 120 }]);

    const countSeriesWhere = (where) => Number(psqlValue(`SELECT count(*) FROM public.series WHERE ${where}`));
    const countScoresOf = (seriesId) =>
      Number(psqlValue(`SELECT count(*) FROM public.series_game_scores WHERE series_id = '${seriesId}'::uuid`));
    const expectRejected = (label, pattern, sql) => {
      const res = psql({ sql });
      const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
      if (res.status === 0) {
        throw new RehearsalFailure(`${label}: the call unexpectedly SUCCEEDED:\n${out}`);
      }
      if (!pattern.test(out)) {
        throw new RehearsalFailure(`${label}: rejected for an unexpected reason:\n${out}`);
      }
      assert(label, true);
    };

    // Named arguments, not positional: supabase-js calls these functions by
    // parameter NAME (writer.ts sends { p_year, p_round, ... } as JSON), so a
    // positional call could not catch a renamed parameter on either side.
    const birthId = psqlValue(
      `SELECT public.pipeline_birth_series(p_year => 2099, p_round => 'Rehearsal Birth', p_team_a_id => ${TEAM_A}, p_team_b_id => ${TEAM_B}, p_scores => '${sixThreeThree}'::jsonb)`,
    );
    mustSucceed('pipeline_birth_series (certified 3-3)', psql({ sql: `SELECT 1 WHERE '${birthId}'::uuid IS NOT NULL` }));
    assert(`birth returned a series id (${birthId})`, /^[0-9a-f-]{36}$/i.test(birthId));
    assert('a birth lands the series row with winner NULL and exactly six score rows',
      countSeriesWhere(`year = 2099 AND winner_team_id IS NULL`) === 1 && countScoresOf(birthId) === 6);

    const rebirthId = psqlValue(
      `SELECT public.pipeline_birth_series(2099, 'Ignored Round', ${TEAM_A}, ${TEAM_B}, '${sixThreeThree}'::jsonb)`,
    );
    assert('re-running the identical birth returns the same id without duplicating rows (ON CONFLICT path)',
      rebirthId === birthId && countSeriesWhere('year = 2099') === 1 && countScoresOf(birthId) === 6 &&
        countSeriesWhere(`year = 2099 AND round = 'Rehearsal Birth'`) === 1);

    // The either-slot-order identity assertion, in SQL too (the racing-run half).
    mustSucceed(
      'slot-swapped birth was rejected with the identity message',
      psql({
        sql: `
          DO $$
          BEGIN
            PERFORM public.pipeline_birth_series(2099, 'Rehearsal Swap', ${TEAM_B}, ${TEAM_A}, '${sixThreeThree}'::jsonb);
            RAISE EXCEPTION 'slot-swapped birth was NOT rejected';
          EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%slots swapped%' THEN NULL; ELSE RAISE; END IF;
          END $$;
        `,
      }),
    );
    assert('the slot-swapped insert wrote nothing', countSeriesWhere("round = 'Rehearsal Swap'") === 0);

    expectRejected(
      'a 4-2 split over six games is not a certified 3-3 and is rejected',
      /certified 3-3/,
      `SELECT public.pipeline_birth_series(2098, 'Rehearsal 4-2', ${TEAM_A}, ${TEAM_B}, '${fourTwo}'::jsonb);`,
    );
    assert('the rejected 4-2 birth wrote nothing', countSeriesWhere('year = 2098') === 0);
    expectRejected(
      'a tie game is not final and is rejected',
      /fail the birth rules/,
      `SELECT public.pipeline_birth_series(2097, 'Rehearsal Tie', ${TEAM_A}, ${TEAM_B}, '${tieSix}'::jsonb);`,
    );
    assert('the rejected tie birth wrote nothing', countSeriesWhere('year = 2097') === 0);
    expectRejected(
      'game set {1,2,4,5,6,7} — right count, wrong set — is rejected',
      /fail the birth rules/,
      `SELECT public.pipeline_birth_series(2096, 'Rehearsal Gap', ${TEAM_A}, ${TEAM_B}, '${gappedSeven}'::jsonb);`,
    );
    assert('the rejected gapped birth wrote nothing', countSeriesWhere('year = 2096') === 0);
    expectRejected(
      'a blank round label is rejected — NOT NULL alone would happily store spaces',
      /p_round must be a non-empty display label/,
      `SELECT public.pipeline_birth_series(p_year => 2095, p_round => '   ', p_team_a_id => ${TEAM_A}, p_team_b_id => ${TEAM_B}, p_scores => '${sixThreeThree}'::jsonb);`,
    );
    assert('the rejected blank-round birth wrote nothing', countSeriesWhere('year = 2095') === 0);
    expectRejected(
      'a payload that is not six elements long is rejected on the raw array, not as a bare NOT NULL violation',
      /exactly six game objects/,
      `SELECT public.pipeline_birth_series(p_year => 2094, p_round => 'Rehearsal Malformed', p_team_a_id => ${TEAM_A}, p_team_b_id => ${TEAM_B}, p_scores => '${malformedExtra}'::jsonb);`,
    );
    assert('the rejected malformed-length birth wrote nothing', countSeriesWhere('year = 2094') === 0);

    const completedId = psqlValue(
      `SELECT public.pipeline_complete_series(p_series_id => '${birthId}'::uuid, p_game => '${gameSeven}'::jsonb, p_winner_team_id => ${TEAM_B})`,
    );
    assert('the completion RPC returns the same series id', completedId === birthId);
    assert('the completion fills the winner and appends game 7 — both statements landed',
      countSeriesWhere(`id = '${birthId}'::uuid AND winner_team_id = ${TEAM_B}`) === 1 && countScoresOf(birthId) === 7);

    mustSucceed(
      're-running the identical completion is a no-op',
      psql({ sql: `SELECT public.pipeline_complete_series('${birthId}'::uuid, '${gameSeven}'::jsonb, ${TEAM_B});` }),
    );
    assert('the replayed completion changed nothing', countScoresOf(birthId) === 7);

    expectRejected(
      'a completion whose claimed winner contradicts game 7 is rejected',
      /does not match game 7/,
      `SELECT public.pipeline_complete_series('${birthId}'::uuid, '${gameSeven}'::jsonb, ${TEAM_A});`,
    );
    expectRejected(
      'a completion trying to restyle an archived game 7 is rejected (never rewrites the archive)',
      /never rewrites archived games|already has a game 7 that differs/,
      // Internally consistent (away team 6 wins, claimed winner 6 — matches
      // the stored archive's winner) but a DIFFERENT final score than the
      // stored game 7, so it reaches the archive-restyling guard rather than
      // the earlier "claimed winner contradicts the proposed game" one.
      `SELECT public.pipeline_complete_series('${birthId}'::uuid, '{"game_number":7,"home_team_id":10,"away_team_id":6,"home_score":88,"away_score":120}'::jsonb, ${TEAM_B});`,
    );
    assert('the two rejected completions left the row exactly as it was',
      countSeriesWhere(`id = '${birthId}'::uuid AND winner_team_id = ${TEAM_B}`) === 1 &&
        countScoresOf(birthId) === 7 &&
        psqlValue(`SELECT home_score FROM public.series_game_scores WHERE series_id = '${birthId}'::uuid AND game_number = 7`) === '89');

    assert('EXECUTE on the two RPCs belongs to service_role only (anon and authenticated are revoked)',
      psqlValue(`SELECT has_function_privilege('service_role', 'public.pipeline_birth_series(integer, text, integer, integer, jsonb)', 'EXECUTE')`) === 't' &&
        psqlValue(`SELECT has_function_privilege('service_role', 'public.pipeline_complete_series(uuid, jsonb, integer)', 'EXECUTE')`) === 't' &&
        psqlValue(`SELECT has_function_privilege('anon', 'public.pipeline_birth_series(integer, text, integer, integer, jsonb)', 'EXECUTE')`) === 'f' &&
        psqlValue(`SELECT has_function_privilege('authenticated', 'public.pipeline_complete_series(uuid, jsonb, integer)', 'EXECUTE')`) === 'f');

    // 5) Story 2.8 (spec-2-8 D2, amended by review pass 1 E1/E2/E3) — the
    //    league/venue migration exercised over a fixture archive of the real
    //    shape, in whichever of the two states the repo is in:
    //    - 00016 UNEMITTED (venues blank, COVERED_THROUGH 15): the generator's
    //      SELF-TEST path renders the SAME template from the deterministic
    //      synthetic 117/43 assignment into a temp path; nothing enters
    //      supabase/migrations/. Banner discipline: every line says SELF-TEST.
    //    - 00016 COMMITTED (curation landed, ceiling at 16): the ordered
    //      replay already applied the committed file over the seeded fixture
    //      (section 1); this section tampers the committed text so EVERY
    //      guard is observed failing, runs the generator's --check against
    //      the real CSV<->migration pair (the normally-executed drift check,
    //      E2), and re-applies the committed file for the census.
    // Either way: a guard that cannot fail is not a guard, and a rejected
    // apply is measured on the post-reject state, not asserted (E3).
    const committedMigration = migration016File !== undefined;
    const tag = committedMigration ? '2.8' : 'SELF-TEST';
    console.log(`\n-- 5) ${committedMigration ? 'Story 2.8 committed 00016: guard tampers, --check, census' : 'SELF-TEST: Story 2.8 fixture archive + synthetic 00016'} --`);
    const selfTestDir = mkdtempSync(join(tmpdir(), 'pg7-2-8-selftest-'));
    try {
      // Which state this run is in, printed rather than asserted (pass 2,
      // P2-9): the emit/ceiling pairing is enforced by the pre-flight above,
      // which throws before the container starts — proven for the 15→16
      // transition by deliberately leaving a committed 00016 under the old
      // ceiling (the check is number-agnostic since pass 3, P3-4). Asserting
      // it again here could never fail, and "an assertion that cannot fail is
      // not a rehearsal assertion" is this story's own rule (E3).
      console.log(`${tag} mode: ${committedMigration ? 'committed 00016 (ceiling ' + COVERED_THROUGH + ')' : 'SELF-TEST rendering; 00016 unemitted while COVERED_THROUGH = ' + COVERED_THROUGH} — supabase/migrations/ left untouched by this branch`);

      let migrationText;
      let venues;
      if (committedMigration) {
        migrationText = readFileSync(join(migrationsDir, migration016File), 'utf8');
        assert(`${tag} curated CSV carries no blank NBA/BAA venue once 00016 is committed`, venueBackfill.blankVenueRows(curatedRows).length === 0);
        venues = venueBackfill.curatedAssignments(curatedRows);
        // E2: the committed-pair drift check runs from a normally-executed
        // path — this harness, real IO through the CLI, no injection.
        const check = venueBackfill.runVenueBackfillCli(['--check'], {});
        for (const message of check.messages) console.log(`generator --check: ${message}`);
        assert(`${tag} generator --check exits 0 on the committed CSV<->migration pair (real IO)`, check.exitCode === 0, `exit ${check.exitCode}`);
      } else {
        const migrationPath = join(selfTestDir, '00016-selftest.sql');
        const fixturePath = join(selfTestDir, 'fixture-seed.sql');
        const gen = venueBackfill.runVenueBackfillCli(
          [`--self-test-migration=${migrationPath}`, `--self-test-fixture=${fixturePath}`],
          {},
        );
        for (const message of gen.messages) console.log(`SELF-TEST generator: ${message}`);
        assert('SELF-TEST generator exited 0 on the self-test path', gen.exitCode === 0, `exit ${gen.exitCode}`);
        migrationText = readFileSync(migrationPath, 'utf8');
        assert(
          'SELF-TEST 00016 rendering was NOT written into supabase/migrations/ (this branch runs only while no committed 00016 exists)',
          !migration016File,
          'a 00016 appeared on disk during the self-test branch — the temp rendering leaked into supabase/migrations/',
        );
        assert('SELF-TEST CLI fixture seed matches the generator render the ordered replay would use', readFileSync(fixturePath, 'utf8') === fixtureSeedText);
        venues = venueBackfill.syntheticAssignments(curatedRows);
      }

      assert(`${tag} curated CSV holds 178 rows (the archive total, AD-7: 178 stands)`, curatedRows.length === 178);
      assert(`${tag} assignment covers exactly 160 NBA/BAA rows`, venues.length === 160);
      const keeps = venues.filter((v) => v.home === v.row.teamA);
      const swaps = venues.filter((v) => v.home !== v.row.teamA);
      if (committedMigration) {
        // Review pass 2, P2-14: `keeps`/`swaps` are counted in the CURATED
        // file's slot order, and that order is not the stored order for the one
        // archived series the loader did not write winner-first. Asserting a
        // slot-space 117/43 against real data would be a false red at the most
        // pressure-loaded moment in the story, so in committed mode the split is
        // reported here and measured against the database's own `winner_team_id`
        // after the apply.
        console.log(`${tag} curated split read from the CSV slot order: ${keeps.length} keep / ${swaps.length} swap — reported, not asserted (P2-14); the census below measures it in the database`);
      } else {
        assert(`${tag} assignment splits 117 keep / 43 swap (synthetic, by construction)`, keeps.length === 117 && swaps.length === 43);
      }
      const abaRows = curatedRows.filter((r) => r.league === 'ABA');
      assert(`${tag} curated CSV carries exactly 18 ABA rows`, abaRows.length === 18);

      // Helpers: re-seed the fixture archive (the seed file itself DELETEs
      // first, so every tamper run starts from the identical pre-00016
      // state), and apply [seed + tamper + migration] so the migration's own
      // BEGIN/COMMIT semantics match a real `db push`. In committed mode the
      // ordered replay already applied 00016 — the harness-side reset drops
      // the league column (its constraints and default go with it) so each
      // re-apply starts exactly where `db push` would. The reset is DDL the
      // rehearsal owns; the migration text is never edited here.
      const fixtureResetSql = 'ALTER TABLE public.series DROP COLUMN IF EXISTS league;\n';
      const seedFixture = () =>
        mustSucceed(`${tag} fixture archive seeded (178 series x 7 rows, pre-00016 state)`, psql({ file: `${fixtureResetSql}${fixtureSeedText}` }));
      // E3: "the transaction rolled back" is exactly what the owner is told
      // to trust before running `npx supabase db push`, so a rejected apply
      // MEASURES the post-reject state — league column absent,
      // series_league_check absent, and the seeded+tampered rows (series
      // count, score-row count, non-canonical-home count) byte-for-byte what
      // they were the moment before the migration ran. A guard's rollback is
      // never certified by an assertion that cannot fail.
      const stateSnapshot = () => [
        psqlValue("SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'series' AND column_name = 'league'"),
        psqlValue("SELECT count(*) FROM pg_constraint WHERE conname = 'series_league_check'"),
        psqlValue('SELECT count(*) FROM public.series'),
        psqlValue('SELECT count(*) FROM public.series_game_scores'),
        psqlValue('SELECT count(*) FROM public.series_game_scores g JOIN public.series s ON s.id = g.series_id WHERE g.home_team_id <> s.team_a_id'),
      ].join('|');
      const applyRejected = (label, pattern, extraSql, migration) => {
        seedFixture();
        if (extraSql !== '') mustSucceed(`${label}: tamper SQL applied`, psql({ sql: extraSql }));
        const before = stateSnapshot();
        const res = psql({ file: migration });
        const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
        if (res.status === 0) throw new RehearsalFailure(`${label}: the migration unexpectedly SUCCEEDED — the guard cannot fail, which is the one rehearsal outcome that must never be green:\n${out}`);
        if (!pattern.test(out)) throw new RehearsalFailure(`${label}: rejected for an unexpected reason:\n${out}`);
        const after = stateSnapshot();
        assert(
          `${label} — abort observed; post-reject state measured: league DDL rolled back (column and check absent), rows exactly as before (${after})`,
          after === before && after.startsWith('0|0|'),
          `before=${before} after=${after}`,
        );
      };
      const seriesPairWhere = (row) =>
        `s.year = ${row.year} AND ((ta.abbreviation = '${row.teamA}' AND tb.abbreviation = '${row.teamB}')` +
        ` OR (ta.abbreviation = '${row.teamB}' AND tb.abbreviation = '${row.teamA}'))`;
      const leagueTuple = (row) => `  (${row.year}, '${row.teamA}', '${row.teamB}', '${row.league}')`;
      const venueTuple = (v) => `  (${v.row.year}, '${v.row.teamA}', '${v.row.teamB}', '${v.home}')`;
      // One-tuple line surgery on the generated migration — the curated-side
      // tampers (a flipped venue, a mis-keyed row) are edits to the VALUES
      // lists exactly as a hand-edited migration would be; the harness asserts
      // it found exactly one candidate line, so a surgery can never silently
      // no-op.
      const mutateTupleLine = (text, tuple, replacement, label) => {
        const lines = text.split('\n');
        const hits = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith(`${tuple},`) || lines[i].startsWith(`${tuple};`)) hits.push(i);
        }
        if (hits.length !== 1) {
          throw new RehearsalFailure(`${tag} tamper ${label}: expected exactly one VALUES line for "${tuple}", found ${hits.length}`);
        }
        const tail = lines[hits[0]].slice(tuple.length);
        if (replacement === null) {
          if (tail !== ',') throw new RehearsalFailure(`${tag} tamper ${label}: refusing to drop the final tuple of a VALUES list`);
          lines.splice(hits[0], 1);
        } else {
          lines[hits[0]] = `${replacement}${tail}`;
        }
        return lines.join('\n');
      };

      // Fixture shape first: the census guards need it and the header
      // amendment claims it.
      seedFixture();
      assert(`${tag} fixture archive holds 178 series rows`, psqlValue('SELECT count(*) FROM public.series') === '178');
      assert(`${tag} fixture archive holds 1,246 game rows`, psqlValue('SELECT count(*) FROM public.series_game_scores') === '1246');
      assert(
        `${tag} every fixture series carries exactly 7 game rows`,
        psqlValue('SELECT count(*) FROM (SELECT series_id FROM public.series_game_scores GROUP BY series_id HAVING count(*) <> 7) t') === '0',
      );
      assert(
        `${tag} pre-state is the canonical 00007 orientation: every game row names team_a as home`,
        psqlValue(`SELECT count(*) FROM public.series_game_scores g JOIN public.series s ON s.id = g.series_id WHERE g.home_team_id <> s.team_a_id`) === '0',
      );

      // Each guard, with a tamper that makes it fire.
      const twinRow = venues[0].row;
      applyRejected(
        `${tag} guard league_row_match: a curated row matching TWO series aborts naming the row`,
        /00016 guard league_row_match: curated league row \(\d+, [A-Z]{3}, [A-Z]{3}\) matches 2 series/,
        `INSERT INTO public.series (year, round, team_a_id, team_b_id, winner_team_id)
         SELECT s.year, '${tag} Slot Twin', s.team_b_id, s.team_a_id, s.winner_team_id
           FROM public.series s JOIN public.teams ta ON ta.id = s.team_a_id JOIN public.teams tb ON tb.id = s.team_b_id
          WHERE ${seriesPairWhere(twinRow)};`,
        migrationText,
      );

      const missingRow = abaRows[0];
      applyRejected(
        `${tag} guard league_row_match: a curated row matching ZERO series aborts naming the row`,
        /00016 guard league_row_match: curated league row/,
        `DELETE FROM public.series s
           WHERE s.year = ${missingRow.year}
             AND ((s.team_a_id = (SELECT id FROM public.teams WHERE abbreviation = '${missingRow.teamA}')
                  AND s.team_b_id = (SELECT id FROM public.teams WHERE abbreviation = '${missingRow.teamB}'))
              OR (s.team_a_id = (SELECT id FROM public.teams WHERE abbreviation = '${missingRow.teamB}')
                  AND s.team_b_id = (SELECT id FROM public.teams WHERE abbreviation = '${missingRow.teamA}')));`,
        migrationText,
      );

      applyRejected(
        `${tag} guard league_backfill_complete: a series the CSV does not cover aborts the SET NOT NULL with the count named`,
        /00016 guard league_backfill_complete: 1 series row\(s\) left with NULL league/,
        `INSERT INTO public.series (year, round, team_a_id, team_b_id)
         VALUES (1899, '${tag} Uncovered',
           (SELECT id FROM public.teams WHERE abbreviation = 'BOS'),
           (SELECT id FROM public.teams WHERE abbreviation = 'CHI'));`,
        migrationText,
      );

      const relabelRow = venues[10].row; // an NBA row, made ABA on the curated side
      applyRejected(
        `${tag} guard aba_row_census: a mis-keyed league list that resizes the ABA block aborts naming the count`,
        /00016 guard aba_row_census: ABA series count is 19, expected exactly 18/,
        '',
        mutateTupleLine(migrationText, leagueTuple(relabelRow), `  (${relabelRow.year}, '${relabelRow.teamA}', '${relabelRow.teamB}', 'ABA')`, 'aba census resize'),
      );

      const wrongYearVenue = venues[20];
      applyRejected(
        `${tag} guard venue_row_match: a venue row mis-keyed to a year no series holds aborts naming the row`,
        /00016 guard venue_row_match: curated venue row \(1899, [A-Z]{3}, [A-Z]{3}\) matches 0 series/,
        '',
        mutateTupleLine(migrationText, venueTuple(wrongYearVenue), `  (1899, '${wrongYearVenue.row.teamA}', '${wrongYearVenue.row.teamB}', '${wrongYearVenue.home}')`, 'venue row mis-key'),
      );

      applyRejected(
        `${tag} guard venue_coverage: a blank NBA/BAA venue hand-bypassed into a missing row aborts naming the uncovered series`,
        /00016 guard venue_coverage: 1 NBA\/BAA archived series have no curated Game-7 venue row/,
        '',
        mutateTupleLine(migrationText, venueTuple(venues[0]), null, 'drop one venue row'),
      );

      // Chosen by property, never by index: the tamper has to mean the same
      // thing against the synthetic assignment and the curated one alike.
      // `venues[5]` was a keep row only by synthetic construction (review pass
      // 2, P2-13) — against curated data an index pick can land a swap row, and
      // then pre-swapping its game-7 row produces a legal case-1 keep, the
      // migration applies cleanly, and the harness cries "the guard cannot
      // fail" at a guard that works.
      const keepVenues = venues.filter((v) => v.home === v.row.teamA);
      const conflictRow = keepVenues[0].row; // keep-assigned; arrive with a DIFFERENT real venue
      applyRejected(
        `${tag} guard orientation_conflict: a game-7 row that is neither canonical nor curated aborts naming the series (the 178th-series protection)`,
        /00016 guard orientation_conflict: game 7 of series/,
        `UPDATE public.series_game_scores g
            SET home_team_id = s.team_b_id, away_team_id = s.team_a_id,
                home_score = g.away_score, away_score = g.home_score
          FROM public.series s JOIN public.teams ta ON ta.id = s.team_a_id JOIN public.teams tb ON tb.id = s.team_b_id
         WHERE g.series_id = s.id AND g.game_number = 7 AND ${seriesPairWhere(conflictRow)};`,
        migrationText,
      );

      // Flip one KEEP row's curated home — lands 116, not 117. A different keep
      // row than the orientation-conflict tamper's, so the two cases never
      // describe the same series.
      const flippedVenue = keepVenues[1];
      applyRejected(
        `${tag} guard game7_home_win_census: one flipped curated venue lands 116, not 117, and aborts — the curated list checksums itself`,
        /00016 guard game7_home_win_census: Game-7 home wins over the NBA\/BAA archive = 116 \(population 160\), expected exactly 117/,
        '',
        mutateTupleLine(
          migrationText,
          venueTuple(flippedVenue),
          `  (${flippedVenue.row.year}, '${flippedVenue.row.teamA}', '${flippedVenue.row.teamB}', '${flippedVenue.row.teamB}')`,
          'flip one curated venue',
        ),
      );

      const badRowWinner = abaRows[1]; // ABA row: the guards see an inconsistent GAME row
      applyRejected(
        `${tag} guard row_winner_consistency: a game row whose winner_team_id is not the higher-scoring side aborts naming the count`,
        /00016 guard row_winner_consistency: 1 game row\(s\) whose winner_team_id is not the higher-scoring side/,
        `UPDATE public.series_game_scores g
            SET winner_team_id = CASE WHEN g.home_score > g.away_score THEN g.away_team_id ELSE g.home_team_id END
          FROM public.series s JOIN public.teams ta ON ta.id = s.team_a_id JOIN public.teams tb ON tb.id = s.team_b_id
         WHERE g.series_id = s.id AND g.game_number = 3 AND ${seriesPairWhere(badRowWinner)};`,
        migrationText,
      );

      const badSeriesWinner = abaRows[2]; // ABA row: the SERIES winner no longer matches game 7
      applyRejected(
        `${tag} guard series_winner_game7_consistency: an archived series whose winner_team_id is not its game-7 winner aborts naming the count`,
        /00016 guard series_winner_game7_consistency: 1 archived series whose winner_team_id is not their game-7 winner/,
        `UPDATE public.series s
            SET winner_team_id = s.team_b_id
          FROM public.teams ta, public.teams tb
         WHERE ta.id = s.team_a_id AND tb.id = s.team_b_id
           AND ${seriesPairWhere(badSeriesWinner)};`,
        migrationText,
      );

      // The clean run, last: seed + apply + the census the AC names. In
      // committed mode this re-applies the committed file after the tampers
      // disturbed the container — the same text the ordered replay already
      // applied once (byte-identical by the --check above).
      seedFixture();
      mustSucceed(`${tag} clean 00016 ${committedMigration ? 'committed file re-applied' : 'rendering applied'} over the fixture archive`, psql({ file: migrationText }));

      const leagueCount = (league) => Number(psqlValue(`SELECT count(*) FROM public.series WHERE league = '${league}'`));
      const nullLeague = Number(psqlValue('SELECT count(*) FROM public.series WHERE league IS NULL'));
      const homeWins = Number(psqlValue(
        `SELECT count(*) FROM public.series_game_scores g JOIN public.series s ON s.id = g.series_id
          WHERE g.game_number = 7 AND s.league IN ('NBA','BAA') AND g.home_score > g.away_score`,
      ));
      const swappedRows = Number(psqlValue(
        `SELECT count(*) FROM public.series_game_scores g JOIN public.series s ON s.id = g.series_id
          WHERE g.game_number = 7 AND s.league IN ('NBA','BAA') AND g.home_team_id = s.team_b_id`,
      ));
      const homeIsWinner = Number(psqlValue(
        `SELECT count(*) FROM public.series_game_scores g JOIN public.series s ON s.id = g.series_id
          WHERE g.game_number = 7 AND s.league IN ('NBA','BAA') AND g.home_team_id = s.winner_team_id`,
      ));
      console.log(`${tag} census — league: ${leagueCount('NBA')} NBA + ${leagueCount('BAA')} BAA + ${leagueCount('ABA')} ABA = 178, NULL ${nullLeague}; NBA/BAA Game-7: ${homeWins} home wins + ${swappedRows} swapped (home = team_b) over the ${leagueCount('NBA') + leagueCount('BAA')} population; home = stored winner in ${homeIsWinner}`);
      assert(`${tag} league census is 159 NBA + 1 BAA + 18 ABA with zero NULL`, leagueCount('NBA') === 159 && leagueCount('BAA') === 1 && leagueCount('ABA') === 18 && nullLeague === 0);
      assert(`${tag} Game-7 home wins over the 160 NBA/BAA series = 117 (nba.com 117-43, same population)`, homeWins === venueBackfill.EXPECTED_GAME7_HOME_WINS);
      // Mode-invariant and stronger than the slot-space split it replaces
      // (P2-14): the census measured through the STORED winner instead of the
      // scores. Scores and identity have to agree on every NBA/BAA Game 7, in
      // the synthetic fixture and against curated production data alike.
      assert(`${tag} the same census measured through identity, not scores: 117 game-7 rows name the series winner as home`, homeIsWinner === venueBackfill.EXPECTED_GAME7_HOME_WINS);
      if (committedMigration) {
        console.log(`${tag} swap-count in CSV slot space is not asserted in committed mode (P2-14): the stored orientation is the database's, and ${swappedRows} game-7 rows currently name stored team_b as home`);
      } else {
        assert(`${tag} exactly ${swaps.length} rows took the team+score swap`, swappedRows === swaps.length);
      }
      assert(
        `${tag} every swapped game-7 row still has winner_team_id = the higher-scoring side (all 1,246 rows checked)`,
        psqlValue(`SELECT count(*) FROM public.series_game_scores g WHERE g.winner_team_id IS DISTINCT FROM (CASE WHEN g.home_score > g.away_score THEN g.home_team_id ELSE g.away_team_id END)`) === '0',
      );
      assert(
        `${tag} every series still has winner_team_id = its game-7 winner`,
        psqlValue(`SELECT count(*) FROM public.series s JOIN public.series_game_scores g ON g.series_id = s.id AND g.game_number = 7 WHERE s.winner_team_id IS DISTINCT FROM (CASE WHEN g.home_score > g.away_score THEN g.home_team_id ELSE g.away_team_id END)`) === '0',
      );
      assert(
        `${tag} no games 1-6 row was touched (no statement may reach game_number <> 7)`,
        psqlValue('SELECT count(*) FROM public.series_game_scores g JOIN public.series s ON s.id = g.series_id WHERE g.game_number <> 7 AND g.home_team_id <> s.team_a_id') === '0',
      );
      assert(
        `${tag} the 18 ABA game-7 rows stay exactly as archived (home = team_a, Call 2)`,
        psqlValue("SELECT count(*) FROM public.series_game_scores g JOIN public.series s ON s.id = g.series_id WHERE g.game_number = 7 AND s.league = 'ABA' AND g.home_team_id <> s.team_a_id") === '0',
      );
      assert(
        `${tag} series_league_check exists`,
        psqlValue(`SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.series'::regclass AND conname = 'series_league_check'`) === '1',
      );
      assert(
        `${tag} league is NOT NULL with DEFAULT 'NBA' — in that order, so the backfill owned every archived value and the default owns pipeline rows (Call 4)`,
        psqlValue(`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'series' AND column_name = 'league'`) === 'NO' &&
          psqlValue(`SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'series' AND column_name = 'league'`) === `'NBA'::text`,
      );

      // Call 4 end-to-end: a birth through the UNCHANGED 00015 RPC lands with
      // league filled by the column default — no RPC signature change.
      const defaultedId = psqlValue(
        `SELECT public.pipeline_birth_series(p_year => 2093, p_round => '${tag} Default League', p_team_a_id => ${TEAM_A}, p_team_b_id => ${TEAM_B}, p_scores => '${sixThreeThree}'::jsonb)`,
      );
      assert(`${tag} a pipeline birth after 00016 defaults to league = NBA without any RPC change`,
        countWhere(`id = '${defaultedId}'::uuid AND league = 'NBA'`) === 1);

      console.log(committedMigration
        ? 'Story 2.8 committed-00016 section complete: every guard observed failing over the seeded fixture with the post-reject state measured, --check holds on the committed CSV<->migration pair, and the census reads 159/1/18 + 117.'
        : 'SELF-TEST Story 2.8 section complete: every guard observed failing, the clean census holds, 00016 itself is NOT in supabase/migrations/.');
    } finally {
      try {
        rmSync(selfTestDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.error(`warning: SELF-TEST temp dir ${selfTestDir} needs manual removal: ${cleanupErr.message}`);
      }
    }

    // 6) Story 2.5 — `pipeline_refresh_insights_cache()` (migration 00017),
    //    exercised over four archive states in the throwaway container:
    //    6a the synthetic fixture section 5 left behind (the archive whose
    //       home card is right BY CONSTRUCTION — U11 names that blind spot,
    //       which is exactly why 6b/6d exist), 6b hand-authored mechanics
    //       fixtures (zero-safe divisions, the pending exclusion, the ABA
    //       exclusion, the game-7-only read, the percentage-unit pin), 6c the
    //       empty population, and 6d U11's real-score fixture: the committed
    //       sheet joined to the committed curated CSV, seeded as this story's
    //       own section AFTER the ordered replay, with game-7 rows venue-true
    //       (seeding before 00016 would put 159 real rows under its pinned
    //       178/160/18/117 census guards — a foreseeable wrong turn P4 names,
    //       and relaxing a pin to get past that abort is forbidden).
    console.log('\n-- 6) Story 2.5: pipeline_refresh_insights_cache over synthetic, hand-authored, zero and real-score fixtures --');

    const CACHE_KEYS = ['game_6_winner_stats', 'home_team_stats', 'avg_point_differential'];
    const runRefresh = () => {
      const res = psql({ sql: 'SELECT public.pipeline_refresh_insights_cache()::text', tuplesOnly: true });
      mustSucceed('pipeline_refresh_insights_cache() call failed', res);
      return JSON.parse(res.stdout.trim());
    };
    const cacheAggregate = () =>
      psqlValue(`SELECT string_agg(insight_key || '=' || insight_value::text, '#' ORDER BY insight_key) FROM public.insights_cache`);
    const memberEq = (key, member, value) =>
      psqlValue(`SELECT (insight_value ->> '${member}')::numeric = ${value}::numeric FROM public.insights_cache WHERE insight_key = '${key}'`) === 't';
    const updatedVal = (key) => psqlValue(`SELECT updated_at::text FROM public.insights_cache WHERE insight_key = '${key}'`);

    assert(
      '6a EXECUTE on the refresh RPC belongs to service_role only (anon and authenticated are revoked — NFR-S1, and insights_cache has no write policy for anything else)',
      psqlValue("SELECT has_function_privilege('service_role', 'public.pipeline_refresh_insights_cache()', 'EXECUTE')") === 't' &&
        psqlValue("SELECT has_function_privilege('anon', 'public.pipeline_refresh_insights_cache()', 'EXECUTE')") === 'f' &&
        psqlValue("SELECT has_function_privilege('authenticated', 'public.pipeline_refresh_insights_cache()', 'EXECUTE')") === 'f',
    );

    // 6a — the synthetic archive (the section-5 end state: 178 committed-CSV
    //      fixture series venues-corrected by the re-applied 00016, plus the
    //      2093 pending birth that must not count).
    const seedBefore = cacheAggregate();
    const census6a = runRefresh();
    assert(
      '6a census over the synthetic archive: population 160, home wins 117, game-6 winners 0 — degenerate exactly as U11 predicts of the synthetic scores',
      census6a.total_game_sevens === 160 && census6a.home_team_wins === 117 && census6a.game_6_winners_won === 0,
      JSON.stringify(census6a),
    );
    assert(
      '6a three rows, the three declared keys — one statement, nothing partial',
      psqlValue('SELECT count(*) FROM public.insights_cache') === '3' &&
        psqlValue("SELECT count(*) FROM public.insights_cache WHERE insight_key = ANY (ARRAY['game_6_winner_stats','home_team_stats','avg_point_differential'])") === '3',
    );
    {
      const after = cacheAggregate();
      assert(
        '6a the seed is replaced, no value traces to it: 62.5 / 8.5 / max 28 / min 2 were in 00001\'s rows before and are in none of them after',
        seedBefore.includes('62.5') && seedBefore.includes('8.5') && seedBefore.includes('"max": 28') &&
          !after.includes('62.5') && !after.includes('8.5') && !after.includes('"max": 28') && !after.includes('"min": 2') &&
          memberEq('game_6_winner_stats', 'total_game_sevens', 160) && memberEq('home_team_stats', 'total_game_sevens', 160),
      );
    }
    assert(
      '6a the negative pins U11 named: game_6 win_rate 0 on the uniform fixture, every margin exactly 10, and the home rate reads 73.13 (117/160) as a PERCENTAGE',
      memberEq('game_6_winner_stats', 'win_rate', 0) &&
        memberEq('avg_point_differential', 'average', 10) && memberEq('avg_point_differential', 'median', 10) &&
        memberEq('avg_point_differential', 'max', 10) && memberEq('avg_point_differential', 'min', 10) &&
        memberEq('home_team_stats', 'win_rate', 73.13),
    );
    {
      const textBefore = cacheAggregate();
      const updatedBefore = CACHE_KEYS.map(updatedVal);
      sleepSync(1100);
      runRefresh();
      assert(
        '6a idempotence (AD-5 narrowed per elicitation P7): the identical archive recomputes byte-equal insight_values',
        cacheAggregate() === textBefore,
      );
      assert(
        '6a updated_at moves while the payloads stay byte-equal — the RPC setting it is the column\'s purpose; dropping it from the write would be the forbidden repair',
        CACHE_KEYS.every((key, i) => updatedVal(key) !== updatedBefore[i]),
      );
    }

    // 6b — hand-authored mechanics fixtures: the cases a real archive cannot
    //      show economically. One team pair (10 GSW / 6 CLE) across six years;
    //      S1–S4 archived NBA, S5 archived ABA (winner-fiction home, a 30-
    //      point margin — counting it revives the fabricated 100%), S6 pending
    //      NBA carrying a decided game-7 row (the winner IS the exclusion, not
    //      the missing row). Game 1 of S1 is a 50-point distractor: only game
    //      7 may reach the stats.
    const handAuthoredSeed = `
DELETE FROM public.series_game_scores;
DELETE FROM public.series;

INSERT INTO public.series (id, year, round, team_a_id, team_b_id, winner_team_id, league) VALUES
  (md5('pg7-2-5-hand|2071')::uuid, 2071, 'Hand Finals', 10, 6, 10, 'NBA'),
  (md5('pg7-2-5-hand|2072')::uuid, 2072, 'Hand Finals', 10, 6, 10, 'NBA'),
  (md5('pg7-2-5-hand|2073')::uuid, 2073, 'Hand Finals', 10, 6, 10, 'NBA'),
  (md5('pg7-2-5-hand|2074')::uuid, 2074, 'Hand Finals', 10, 6,  6, 'NBA'),
  (md5('pg7-2-5-hand|2075')::uuid, 2075, 'Hand Finals', 10, 6, 10, 'ABA'),
  (md5('pg7-2-5-hand|2076')::uuid, 2076, 'Hand Finals', 10, 6, NULL, 'NBA');

INSERT INTO public.series_game_scores (series_id, game_number, home_team_id, away_team_id, home_score, away_score, winner_team_id) VALUES
  (md5('pg7-2-5-hand|2071')::uuid, 1, 10, 6, 120, 70, 10),
  (md5('pg7-2-5-hand|2071')::uuid, 6, 10, 6, 101, 95, 10),
  (md5('pg7-2-5-hand|2071')::uuid, 7, 10, 6, 104, 100, 10),
  (md5('pg7-2-5-hand|2072')::uuid, 6, 10, 6, 95, 101, 6),
  (md5('pg7-2-5-hand|2072')::uuid, 7, 10, 6, 106, 100, 10),
  (md5('pg7-2-5-hand|2073')::uuid, 6, 10, 6, 101, 95, 10),
  (md5('pg7-2-5-hand|2073')::uuid, 7, 10, 6, 103, 100, 10),
  (md5('pg7-2-5-hand|2074')::uuid, 6, 10, 6, 111, 105, 10),
  (md5('pg7-2-5-hand|2074')::uuid, 7, 10, 6, 97, 104, 6),
  (md5('pg7-2-5-hand|2075')::uuid, 6, 10, 6, 120, 110, 10),
  (md5('pg7-2-5-hand|2075')::uuid, 7, 10, 6, 130, 100, 10),
  (md5('pg7-2-5-hand|2076')::uuid, 6, 10, 6, 115, 105, 10),
  (md5('pg7-2-5-hand|2076')::uuid, 7, 10, 6, 120, 80, 10);
`;
    mustSucceed('6b hand-authored mechanics fixture seeded', psql({ file: handAuthoredSeed }));
    const census6b = runRefresh();
    assert(
      '6b population is 4 — the ABA archived series and the pending series are both skipped: its game-7 home (the winner, by fiction) and its 30/40-point margins would otherwise move every card',
      census6b.total_game_sevens === 4 && census6b.home_team_wins === 3 && census6b.game_6_winners_won === 2,
      JSON.stringify(census6b),
    );
    assert(
      '6b the percentage-unit pin: 3-of-4 home wins prints 75 (the page appends "%", so 0.75 would read 0.75%), and 2-of-4 game-6 winners prints 50',
      memberEq('home_team_stats', 'win_rate', 75) && memberEq('game_6_winner_stats', 'win_rate', 50),
    );
    assert(
      '6b only game 7 is read: margins {4,6,3,7} give average 5, median (4+6)/2 = 5, max 7 — the 50-point game 1 and the excluded 30/40-point game 7s are what a wrong read would show',
      memberEq('avg_point_differential', 'average', 5) && memberEq('avg_point_differential', 'median', 5) &&
        memberEq('avg_point_differential', 'max', 7) && memberEq('avg_point_differential', 'min', 3),
    );

    // 6c — the empty population (I/O row "No archived game 7 rows"): zeros,
    //      no division, no NaN; U13 accepts the footer's "0 Game 7s" reading.
    mustSucceed('6c archive emptied', psql({ sql: 'DELETE FROM public.series_game_scores; DELETE FROM public.series;' }));
    const census6c = runRefresh();
    assert(
      '6c empty archive: every card writes zeros — total_game_sevens 0, win_rates 0, margin trio 0 — and no NaN or JSON null reaches jsonb',
      census6c.total_game_sevens === 0 && census6c.home_team_wins === 0 && census6c.game_6_winners_won === 0 && census6c.average_margin === 0 &&
        psqlValue("SELECT count(*) FROM public.insights_cache WHERE insight_value::text ~ 'NaN|null'") === '0' &&
        psqlValue("SELECT count(*) FROM public.insights_cache WHERE (insight_value ->> 'total_game_sevens')::numeric = 0") === '2' &&
        psqlValue("SELECT count(*) FROM public.insights_cache WHERE (insight_value ->> 'win_rate')::numeric = 0") === '2' &&
        memberEq('avg_point_differential', 'average', 0) && memberEq('avg_point_differential', 'median', 0) &&
        memberEq('avg_point_differential', 'max', 0) && memberEq('avg_point_differential', 'min', 0),
    );

    // 6d — U11's real-score fixture, run as this story's own section AFTER
    //      the ordered replay. Honest population statement: 159, not
    //      production's 160 — the sheet lacks the 2026 WCF Game 7, one of the
    //      archive's 43 home LOSSES, so the fixture's numerator is
    //      production's 117 while its denominator is its own. The 117-of-160
    //      pair stays the owner's post-apply read; nothing printed here
    //      claims it.
    const realFixture = loadRealGame7Fixture(curatedRows);
    const realM = realFixture.measures;
    console.log(
      `6d real-score fixture: ${realFixture.joined.length} NBA/BAA Game-7 rows joined on (year, unordered team pair) + ${realFixture.abaSeeded.length} ABA rows seeded for exclusion; margin measures average ${realM.average}, median ${realM.median}, max ${realM.max}, min ${realM.min}`,
    );
    if (realFixture.unmatched.length > 0) {
      throw new RehearsalFailure(`6d: sheet NBA/BAA Game-7 rows that do not join the curated CSV: ${realFixture.unmatched.join('; ')} — resolve the join, never a pin`);
    }
    assert(
      '6d the one curated NBA/BAA row the sheet lacks is the 2026 Western Conference Finals (fixture 159 vs production 160, named, not hidden)',
      realFixture.csvOnly.length === 1 && realFixture.csvOnly[0].startsWith('2026|'),
      realFixture.csvOnly.join(', '),
    );
    assert(
      '6d the join reproduces every pinned literal: total 159, home wins 117 (external anchor: nba.com\'s published 117-43), game-6 winners 59 (external anchor: planning\'s separately derived 59 of 159) — a pin that stops matching is a finding, not an obstacle',
      realM.total === U11_PINS.total && realM.homeWins === U11_PINS.homeWins && realM.g6Won === U11_PINS.g6Won,
      `measured ${realM.total}/${realM.homeWins}/${realM.g6Won} vs pinned ${U11_PINS.total}/${U11_PINS.homeWins}/${U11_PINS.g6Won}`,
    );
    mustSucceed(
      '6d real-score fixture seeded after the ordered replay, game-7 rows venue-true from the curated CSV (00016\'s pinned census guards ran over the 178 archive in section 5; this 159-row reading never passes under them)',
      psql({ file: renderRealFixtureSeed(realFixture) }),
    );
    assert(
      '6d seeding rule held in the database: game-7 home = the series winner on exactly 117 of the 159 NBA/BAA rows — winner-first seeding would land 159 and fabricate the 100% back',
      psqlValue(
        `SELECT count(*) FROM public.series_game_scores g JOIN public.series s ON s.id = g.series_id
          WHERE g.game_number = 7 AND s.league IN ('NBA','BAA') AND g.home_team_id = s.winner_team_id`,
      ) === '117',
    );
    const census6d = runRefresh();
    console.log(
      '6d TRANSCRIPTION CHECK (fixture and cross-check come from the same join — agreement proves the SQL faithful to the join, never the join faithful to reality):',
    );
    assert(
      '6d census = the harness measurement of the same join: 159 / 117 / 59 / average margin',
      census6d.total_game_sevens === realM.total && census6d.home_team_wins === realM.homeWins &&
        census6d.game_6_winners_won === realM.g6Won && Number(census6d.average_margin) === realM.average,
      JSON.stringify(census6d),
    );
    assert(
      `6d home card over the real fixture: 117 of 159, win_rate ${realM.homeRate} — the fixture's stop is on its OWN denominator (elicitation P3); production's 117 of 160 stays the owner's post-apply read against epic-2-context.md:44`,
      memberEq('home_team_stats', 'home_team_wins', 117) && memberEq('home_team_stats', 'total_game_sevens', 159) &&
        memberEq('home_team_stats', 'win_rate', realM.homeRate),
    );
    assert(
      `6d game-6 card over the real fixture: 59 of 159, win_rate ${realM.g6Rate} — 37.1%, not the seeded 62.5 the "Momentum Matters" prose repeats (routed to Story 5.1 in deferred-work)`,
      memberEq('game_6_winner_stats', 'game_6_winners_won', 59) && memberEq('game_6_winner_stats', 'total_game_sevens', 159) &&
        memberEq('game_6_winner_stats', 'win_rate', realM.g6Rate),
    );
    assert(
      '6d margin trio = the same join re-measured in the harness (average, median, max, min), and the ABA rows seeded here changed nothing: the population is 159, not 159 + ABA',
      memberEq('avg_point_differential', 'average', realM.average) && memberEq('avg_point_differential', 'median', realM.median) &&
        memberEq('avg_point_differential', 'max', realM.max) && memberEq('avg_point_differential', 'min', realM.min),
    );
    console.log(
      '6d external anchors named: nba.com\'s published 117-43 (the fixture reproduces the 117 numerator; its denominator is 159 because the missing 2026 WCF is one of the 43 home losses) and planning\'s separately derived 59 of 159 (reproduced). No line above or below claims a 160-series population for this fixture.',
    );

    // 6e — the I/O matrix's "League/venue columns missing" row, observed
    //      FAILING under its own tamper. Story 2.8 set the convention this
    //      story inherits: a guard that has never been seen to reject is not
    //      yet a guard. The tamper runs in one transaction and dies on the
    //      guard, so the session closes with the transaction uncommitted and
    //      the certified state of this database is untouched.
    const migration017File = files.find((f) => f.startsWith('00017'));
    if (migration017File === undefined) {
      throw new RehearsalFailure('6e: no 00017* file to tamper — the ceiling claims coverage of a migration that is not on disk');
    }
    const migration017Text = readFileSync(join(migrationsDir, migration017File), 'utf8');
    // Strip the file's own transaction wrapper so the tamper's BEGIN/ROLLBACK
    // is the only one in play (the plpgsql bodies use bare `BEGIN`, never
    // `BEGIN;`, so the two anchored replacements cannot touch anything else).
    const guardTamperSql = `BEGIN;
ALTER TABLE public.series DROP COLUMN league;
DROP FUNCTION IF EXISTS public.pipeline_refresh_insights_cache();
${migration017Text.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '')}
ROLLBACK;
`;
    const tamper = psql({ file: guardTamperSql });
    const tamperOutput = `${tamper.stdout ?? ''}${tamper.stderr ?? ''}`;
    assert(
      '6e 00017 refuses to exist against a table with no league column — the apply aborts naming guard league_column_present, never falling back to the winner-as-venue reading',
      tamper.status !== 0 && /league_column_present/.test(tamperOutput),
      `exit ${tamper.status}: ${tamperOutput.trim().slice(0, 240)}`,
    );
    assert(
      '6e the tamper rolled back with the session: the league column and the refresh RPC are both still present, and 6d\'s real-fixture census is intact (a tamper that leaked state would silently certify a different database than the one measured)',
      psqlValue("SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'series' AND column_name = 'league'") === '1' &&
        psqlValue("SELECT count(*) FROM pg_proc WHERE proname = 'pipeline_refresh_insights_cache'") === '1' &&
        memberEq('home_team_stats', 'total_game_sevens', 159) &&
        memberEq('home_team_stats', 'home_team_wins', 117),
    );

    // 6f — the I/O row "Venue backfill short or mis-keyed" needs a covering
    //      check, and 6d alone is not one: a census that reproduces 117 proves
    //      the join is faithful to the CSV, not that the CSV could be wrong.
    //      So flip one curated Game-7 home side and confirm the measurement
    //      MOVES with it — which is what makes the pinned 117 a stop rather
    //      than a coincidence. Pure parser work: no database is touched, and
    //      the committed CSV is not modified.
    {
      const mutated = curatedRows.map((row) =>
        row.year === 1998 && venueBackfill.isNbaBaa(row)
          ? { ...row, home: row.home === row.teamA ? row.teamB : row.teamA }
          : row,
      );
      const mutatedMeasures = loadRealGame7Fixture(mutated).measures;
      assert(
        '6f the pin is sensitive, not sticky: swapping the 1998 curated Game-7 home side moves home wins off 117 while the population holds at 159, so a mis-keyed or short backfill cannot pass 6d unnoticed',
        mutatedMeasures.homeWins !== U11_PINS.homeWins && mutatedMeasures.total === U11_PINS.total,
        `mutated: home wins ${mutatedMeasures.homeWins} over ${mutatedMeasures.total} (pinned ${U11_PINS.homeWins}/${U11_PINS.total})`,
      );
    }

    // 7) Migration 00018 — teams.espn_code (Story 2.13). run-sheet step 2's
    //    contract in order: the additive nullable column applies over the
    //    replayed seed, the partial unique index refuses a DUPLICATE non-null
    //    code, the shape CHECK refuses a name where an identity belongs, the
    //    four post-condition guards are each observed firing, and
    //    EXPECTED_TEAM_COUNT = 59 still holds because 00018 inserts no row.
    const migration018File = files.find((f) => f.startsWith('00018'));
    if (migration018File === undefined) {
      throw new RehearsalFailure(`7: COVERED_THROUGH = ${COVERED_THROUGH} claims 00018's replay, but no 00018* file is on disk`);
    }
    const migration018Text = readFileSync(join(migrationsDir, migration018File), 'utf8');
    console.log(`\n-- 7) Story 2.13: ${migration018File} — the feed identity column, its index, its shape, its guards --`);

    // 7a — additive, and the population untouched.
    const teamsCount = psqlValue('SELECT count(*) FROM public.teams');
    const espnNonNull = psqlValue('SELECT count(*) FROM public.teams WHERE espn_code IS NOT NULL');
    const espnDistinct = psqlValue('SELECT count(DISTINCT espn_code) FROM public.teams WHERE espn_code IS NOT NULL');
    const espnNull = psqlValue('SELECT count(*) FROM public.teams WHERE espn_code IS NULL');
    const colShape = psqlValue(`
      SELECT is_nullable || '|' || data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'teams' AND column_name = 'espn_code'
    `);
    assert(
      `7a 00018 is additive: ${venueBackfill.EXPECTED_TEAM_COUNT} teams rows after the replay (read ${teamsCount}), the column is nullable ${colShape}, ${espnNonNull} modern franchises carry a code and ${espnNull} historical ones stay NULL, with ${espnDistinct} distinct values`,
      teamsCount === String(venueBackfill.EXPECTED_TEAM_COUNT) && colShape === 'YES|text' &&
        espnNonNull === '30' && espnDistinct === '30' &&
        espnNull === String(venueBackfill.EXPECTED_TEAM_COUNT - 30),
    );
    const diverged = psqlValue(`
      SELECT string_agg(full_name || ':' || abbreviation || '/' || espn_code, ',' ORDER BY id)
      FROM public.teams
      WHERE espn_code IS NOT NULL AND espn_code <> abbreviation
    `);
    assert(
      "7a the six measured divergences are in the database on the franchises the capture names them for — and they are the ONLY differences between ESPN's code space and teams.abbreviation, which is why abbreviation could not be the join key",
      diverged ===
        'Golden State Warriors:GSW/GS,New Orleans Pelicans:NOP/NO,New York Knicks:NYK/NY,San Antonio Spurs:SAS/SA,Utah Jazz:UTA/UTAH,Washington Wizards:WAS/WSH',
      `read: ${diverged}`,
    );

    // 7b — the shape CHECK. The drift it exists to stop is a display name in an
    //      identity column: the capture prints `LA Clippers` where 00005 stores
    //      `Los Angeles Clippers`, so a name-shaped backfill is exactly the
    //      failure Story 2.13 refused, and it has to be refused by the schema.
    expectRejected(
      '7b the shape CHECK refuses a display name in espn_code (teams_espn_code_shape, not a silent truncation)',
      /teams_espn_code_shape/,
      "UPDATE public.teams SET espn_code = 'Los Angeles Clippers' WHERE id = 13;",
    );
    expectRejected(
      '7b the shape CHECK refuses a lowercase code (ESPN prints capitals on all 30 captured rows)',
      /teams_espn_code_shape/,
      "UPDATE public.teams SET espn_code = 'atl' WHERE id = 1;",
    );
    expectRejected(
      '7b the shape CHECK refuses a 5-letter code (the measured space is 2-4, so UTAH is the ceiling by measurement)',
      /teams_espn_code_shape/,
      "UPDATE public.teams SET espn_code = 'PHOEN' WHERE id = 24;",
    );
    const legalCode = psql({ file: "BEGIN;\nUPDATE public.teams SET espn_code = 'CHH' WHERE id = 31;\nROLLBACK;\n" });
    assert(
      '7b a legal 3-letter capital code is accepted on a historical row — the CHECK is the measured 2-4 shape space, not a whitelist of the 30 seeded values',
      legalCode.status === 0,
      `exit ${legalCode.status}: ${legalCode.stdout ?? ''}${legalCode.stderr ?? ''}`,
    );
    assert(
      '7b that transaction rolled back: id 31 (Baltimore Bullets) carries no code again',
      psqlValue('SELECT espn_code::text FROM public.teams WHERE id = 31') === '',
    );

    // 7c — the partial unique index, and its negative proof (run-sheet step 2).
    const dupIndex = psql({
      sql: `
        DO $$
        DECLARE
          v_index text;
        BEGIN
          UPDATE public.teams SET espn_code = 'ATL' WHERE id = 2;
          RAISE EXCEPTION 'a duplicate non-null espn_code was ACCEPTED — idx_teams_espn_code is not enforcing';
        EXCEPTION WHEN unique_violation THEN
          GET STACKED DIAGNOSTICS v_index = CONSTRAINT_NAME;
          IF v_index <> 'idx_teams_espn_code' THEN
            RAISE EXCEPTION 'rejected by % instead of the partial unique index idx_teams_espn_code', v_index;
          END IF;
        END $$;
      `,
    });
    assert(
      "7c Atlanta's code onto Boston is rejected with unique-violation by idx_teams_espn_code itself (the DO block only completes if that index names the rejection)",
      dupIndex.status === 0,
      `exit ${dupIndex.status}: ${dupIndex.stdout ?? ''}${dupIndex.stderr ?? ''}`,
    );
    assert(
      "7c a duplicate non-null espn_code could not be written — 'ATL' still sits on exactly one franchise",
      psqlValue("SELECT count(*) FROM public.teams WHERE espn_code = 'ATL'") === '1',
    );
    assert(
      '7c the rejected write left Boston on its own code, and the index really is partial — the 29 NULL historical rows coexist inside it',
      psqlValue('SELECT espn_code FROM public.teams WHERE id = 2') === 'BOS' &&
        /WHERE \(espn_code IS NOT NULL\)/.test(psqlValue("SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_teams_espn_code'")),
    );

    // 7d — the four post-condition guards, each observed FIRING. Extracted from
    //      the committed file rather than copied, so this rehearses the shipped
    //      text; each tamper builds a wrong population from the seeded state
    //      inside one transaction that dies on the guard, so nothing can leak —
    //      and the state is read back afterwards to prove that.
    const guardBlock = /DO \$\$\s*\nDECLARE[\s\S]*?00018 seeded espn_code[\s\S]*?END \$\$;/.exec(migration018Text)?.[0];
    if (guardBlock === undefined) {
      throw new RehearsalFailure(`7d: could not locate ${migration018File}'s post-condition DO block — the guard text moved, so this rehearsal would be certifying a copy rather than the shipped guards`);
    }
    const guardCount = (migration018Text.match(/RAISE EXCEPTION/g) ?? []).length;
    assert(`7d the committed file carries exactly the ${guardCount} guards this section fires`, guardCount === 4);

    const guardFires = (label, pattern, tamper) => {
      const res = psql({ file: `BEGIN;\n${tamper}\n${guardBlock}\nROLLBACK;\n` });
      const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
      if (res.status === 0) {
        throw new RehearsalFailure(`${label}: the guard block COMPLETED over a tampered population — it did not fire:\n${out}`);
      }
      if (!pattern.test(out)) {
        throw new RehearsalFailure(`${label}: aborted for an unexpected reason:\n${out}`);
      }
      assert(label, true);
    };

    guardFires(
      '7d guard 1 fires on a short seed — a partially applied 30-row list is stale, not good enough',
      /seeded espn_code on 29 teams rows, expected exactly 30/,
      'UPDATE public.teams SET espn_code = NULL WHERE id = 1;',
    );
    guardFires(
      '7d guard 2 fires in the one state the index cannot reach: with idx_teams_espn_code dropped, a shared code is caught by the migration',
      /left 29 distinct espn_code values across 30 seeded rows/,
      "DROP INDEX public.idx_teams_espn_code;\nUPDATE public.teams SET espn_code = 'ATL' WHERE id = 2;",
    );
    guardFires(
      '7d guard 3 fires when a divergence lands on the wrong franchise — Utah moved to its own abbreviation leaves 5 of the 6',
      /found only 5 of the six measured code divergences/,
      "UPDATE public.teams SET espn_code = 'UTA' WHERE id = 29;",
    );
    guardFires(
      '7d guard 4 fires on a code outside the modern 30 even while the seed count, distinctness and divergences all still read right',
      /rows outside the seeded 30: Baltimore Bullets/,
      "UPDATE public.teams SET espn_code = NULL WHERE id = 1;\nUPDATE public.teams SET espn_code = 'ATL' WHERE id = 31;",
    );

    const postState = psqlValue(`
      SELECT (count(*) FILTER (WHERE espn_code IS NOT NULL)) || '|' ||
             (count(DISTINCT espn_code) FILTER (WHERE espn_code IS NOT NULL)) || '|' ||
             (count(*) FILTER (WHERE espn_code IS NOT NULL AND espn_code <> abbreviation)) || '|' ||
             (count(*) FILTER (WHERE espn_code IS NOT NULL AND id NOT BETWEEN 1 AND 30))
      FROM public.teams
    `);
    assert(
      `7d every tamper died inside its own transaction: the certified state is 30 seeded / 30 distinct / 6 divergences / 0 outside the 30, the dropped index and the CHECK are both still in place, and the four tampered rows read their shipped values (state ${postState})`,
      postState === '30|30|6|0' &&
        psqlValue("SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_teams_espn_code'") === '1' &&
        psqlValue("SELECT count(*) FROM pg_constraint WHERE conname = 'teams_espn_code_shape'") === '1' &&
        psqlValue('SELECT espn_code FROM public.teams WHERE id IN (1, 2) ORDER BY id') === 'ATL\nBOS' &&
        psqlValue('SELECT espn_code FROM public.teams WHERE id = 29') === 'UTAH' &&
        psqlValue('SELECT espn_code::text FROM public.teams WHERE id = 31') === '',
    );

    console.log('\nREHEARSAL PASSED: replay order holds, the key enforces, the swap stays a runner-side assertion, 00015\'s RPCs assert, land atomically, and stay service_role-only, Story 2.8\'s ' + (committedMigration ? 'committed 00016 applied inside the ordered replay over the seeded fixture, --check holds on the committed pair, and every guard was observed failing with the post-reject state measured' : 'self-test fixture proves every 00016 guard can fail (SELF-TEST venues — curation still owed by the owner, spec-2-8 D1/D2)') + ', Story 2.5\'s 00017 refresh rewrote all three keys atomically over the synthetic, hand-authored, empty and real-score archives — byte-equal payloads on re-run with updated_at moving, and U11\'s 159/117/59 reproduced from the committed sheet joined to the committed curated CSV, with 00017\'s league guard observed refusing under its own tamper and the tamper leaving nothing behind, and Story 2.13\'s 00018 adding a nullable espn_code over 59 teams rows with the six measured divergences on their franchises, its shape CHECK refusing a display name and its partial unique index refusing a duplicate non-null code, and all four of its post-condition guards observed firing over tampered populations that then proved to have left nothing behind.');
  } finally {
    try {
      const rm = docker(['rm', '-f', container], { allowFail: true });
      if (rm.status !== 0) {
        console.error(`warning: could not remove rehearsal container ${container}: ${rm.stdout ?? ''}${rm.stderr ?? ''}`);
      } else {
        console.log(`rehearsal container ${container} removed`);
      }
    } catch (cleanupErr) {
      console.error(`warning: rehearsal container ${container} needs manual removal: ${cleanupErr.message}`);
    }
  }
}

try {
  // No argument but `--fixture-report` is accepted. `includes` alone would read
  // a typo (`--fixture-repor`) as "not the report", i.e. as the full Docker
  // rehearsal — the operator asks for a parser run and gets a container.
  const args = process.argv.slice(2);
  const stray = args.filter((arg) => arg !== '--fixture-report');
  if (stray.length > 0) {
    throw new Error(
      `unrecognised argument(s): ${stray.join(', ')} — this script takes no argument, or the single read-only --fixture-report ` +
        '(parser + join + measurements, no Docker and no database)',
    );
  }
  if (args.includes('--fixture-report')) fixtureReport();
  else main();
} catch (err) {
  if (err instanceof RehearsalFailure) {
    console.error(`FAIL ${err.message}`);
    process.exitCode = 1;
  } else {
    console.error(`rehearsal could not run: ${err.message}`);
    process.exitCode = 2;
  }
}
