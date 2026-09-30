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
// archive total. The migrations seed only the eight fixture `game_sevens`
// rows at 00001:102-110, which 00007 turns into series rows — a replayed
// table therefore holds 8 series rows (measured 2026-09-30, printed below as
// a note). The 178-row archive is loaded out of band, so "satisfiable by all
// 178 existing rows" is carried by the live pre-flight
// (node scripts/spike-2-1/audit-unique-key.mjs), not by replay. A row-count
// assertion here would measure the fixture, not the archive.
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
// applies the migration.
//
// Usage: node scripts/rehearse-migration-00014.mjs
// Exit: 0 = every claim held; non-zero on the first miss (fail-fast, so a
// stale or broken state can never pass it). Checked by running it — like
// every file under scripts/, Biome's files.includes does not cover it.

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(repoRoot, 'supabase', 'migrations');
const container = `pg7-rehearse-00014-${process.pid}`;
const dbUser = 'postgres';
const dbName = 'rehearse';

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
    for (const file of files) {
      const res = psql({ file: readFileSync(join(migrationsDir, file), 'utf8') });
      mustSucceed(`${file} did not apply cleanly`, res);
      console.log(`applied ${file}`);
    }
    // The claim is "every migration through the newest one applied in order",
    // so the check is per-number coverage, not a file count: a renamed or
    // deleted migration in the middle of the range would otherwise leave this
    // green while the replay it certifies never happened. COVERED_THROUGH is
    // bumped when a story commits a migration whose replay this must certify.
    const COVERED_THROUGH = 15;
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
    console.log(`note   fixture series rows in the replayed schema: ${psqlValue('SELECT count(*) FROM public.series')} (fixture, not the 178-row archive — see header)`);

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

    console.log('\nREHEARSAL PASSED: replay order holds, the key enforces, the swap stays a runner-side assertion, and 00015\'s RPCs assert, land atomically, and stay service_role-only.');
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
