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
// and re-applies the committed file for the census.
//
// Usage: node scripts/rehearse-migration-00014.mjs
// Exit: 0 = every claim held; non-zero on the first miss (fail-fast, so a
// stale or broken state can never pass it). Checked by running it — like
// every file under scripts/, Biome's files.includes does not cover it.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

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
const COVERED_THROUGH = 16;

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
          throw new RehearsalFailure(`SELF-TEST tamper ${label}: expected exactly one VALUES line for "${tuple}", found ${hits.length}`);
        }
        const tail = lines[hits[0]].slice(tuple.length);
        if (replacement === null) {
          if (tail !== ',') throw new RehearsalFailure(`SELF-TEST tamper ${label}: refusing to drop the final tuple of a VALUES list`);
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

    console.log(`\nREHEARSAL PASSED: replay order holds, the key enforces, the swap stays a runner-side assertion, 00015's RPCs assert, land atomically, and stay service_role-only, and Story 2.8's ${committedMigration ? 'committed 00016 applied inside the ordered replay over the seeded fixture, --check holds on the committed pair, and every guard was observed failing with the post-reject state measured' : 'self-test fixture proves every 00016 guard can fail (SELF-TEST venues — curation still owed by the owner, spec-2-8 D1/D2)'}.`);
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
  main();
} catch (err) {
  if (err instanceof RehearsalFailure) {
    console.error(`FAIL ${err.message}`);
    process.exitCode = 1;
  } else {
    console.error(`rehearsal could not run: ${err.message}`);
    process.exitCode = 2;
  }
}
