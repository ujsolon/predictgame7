// Story 2.2, Decision 4: the rehearsal harness for migration 00014.
//
// What it proves, on a throwaway Docker Postgres and nothing else:
//   1. Replay correctness — 00001..00014 apply in filename order with no
//      statement error. The property under test is that 00007:57's
//      `ON CONFLICT (year, round, team_a_id, team_b_id, status)` target
//      resolves at its own point, while `status` still exists; 00014 drops
//      the column only afterwards.
//   2. Enforcement — against the replayed schema a duplicate
//      (year, team_a_id, team_b_id) insert is rejected with the
//      unique-violation SQLSTATE (23505) by the new constraint itself, and
//      the same matchup with the team slots swapped is accepted (Story 2.3's
//      runner assertion owns that half, per Decision 1).
//
// What it does NOT prove (stated so nobody over-reads a green run): the
// archive total. These migrations seed only the 16 fixture `game_sevens`
// rows from 00001:102; the 178-row archive is loaded out of band, so
// "satisfiable by all 178 existing rows" is carried by the live pre-flight
// (node scripts/spike-2-1/audit-unique-key.mjs), not by replay. Expect ~16
// series rows here; a row-count assertion would measure the fixture, not the
// archive.
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
//   - extension `uuid-ossp` — 00002:2 defaults ids with uuid_generate_v4();
//   - schema `auth` + table `auth.users(id uuid)` — 00004:2 FKs profiles to it.
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

function docker(args, { input, allowFail } = {}) {
  const res = spawnSync('docker', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
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
    const res = docker(['exec', container, 'pg_isready', '-U', dbUser], { allowFail: true });
    if (res.status === 0) return;
    sleepSync(2000);
  }
  throw new Error(`postgres did not become ready within ${maxSeconds}s`);
}

function main() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`rehearsal container: ${container} (postgres:16, throwaway, no published port)`);
  console.log(`migrations to replay: ${files.length}`);

  docker(['run', '-d', '--name', container, '-e', `POSTGRES_PASSWORD=${container}`, '-e', `POSTGRES_DB=${dbName}`, 'postgres:16']);
  try {
    waitForReady();

    // Environment scaffolding (see header) — never a rewrite of the migrations.
    mustSucceed(
      'pre-create anon/authenticated roles, uuid-ossp, auth.users stub',
      psql({
        sql: `
          CREATE ROLE anon NOLOGIN;
          CREATE ROLE authenticated NOLOGIN;
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
    assert(
      'all 14 migrations (00001..00014) applied in order with no statement error — 00007:57 ON CONFLICT status target resolved at its own point',
      files.length === 14 && files[0].startsWith('00001_') && files[13].startsWith('00014_'),
      `found ${files.length}: ${files.join(', ')}`,
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

    console.log('\nREHEARSAL PASSED: replay order holds, the key enforces, the swap stays a runner-side assertion.');
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
