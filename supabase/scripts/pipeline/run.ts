/**
 * Story 2.3 — the pipeline runner entry point.
 *
 * Order of operations is the safety story: environment and adapter selection
 * are checked first (a recognised-but-unimplemented `SERIES_SOURCE` or a
 * missing service-role variable refuses the run before anything else happens),
 * the source is read, the plan is computed and asserted against AD-4/AD-5,
 * and only then — and never in a dry-run — are writes issued, one 00015 RPC
 * per operation. Any failure exits non-zero with a message naming the
 * offending row.
 *
 * Owner usage (the agent never runs this against production):
 *   node --env-file=.env supabase/scripts/pipeline/run.ts --source=manual_csv --dry-run
 *   node --env-file=.env supabase/scripts/pipeline/run.ts --source=nba_com --dry-run
 *
 * Story 2.4 additions: `--season=<YYYY-YY>` drills the nba_com adapter into
 * one postseason (the archive is frozen — a drill onto an archived year
 * reaches Story 2.3's archive guard, never a rewrite), a flag the selected
 * adapter cannot use refuses the run, and an adapter that carries a run
 * report (`describeRun`) prints it before planning.
 *
 * `.env` must supply SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the same
 * names the handle-contact function uses; NFR-S1 — never a `VITE_*` name,
 * never a committed value).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertAdapterImplemented,
  createAdapterSource,
  DEFAULT_ADAPTER_NAME,
  type AdapterDeps,
  type FeedFetch,
} from './port.ts';
import { groupSourceRows, planPipeline, type CurrentSeriesRow, type Plan } from './plan.ts';
import { createSupabaseSink, type PipelineSink, type SinkOptions } from './writer.ts';

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CSV_PATH = join(moduleDir, 'data', 'series_manual.csv');

export const ENV_SUPABASE_URL = 'SUPABASE_URL';
export const ENV_SERVICE_ROLE_KEY = 'SUPABASE_SERVICE_ROLE_KEY';

export class PipelineRunError extends Error {}

/**
 * Flags each adapter understands (Story 2.4, review triage row 6): passing a
 * flag the selected adapter cannot use refuses the run. A silently discarded
 * `--csv=` on an HTTP run is the same class of mistake this file already
 * refuses for a `--dryrun` typo — the operator believes they steered the run.
 */
const ADAPTER_FLAGS: Record<string, string[]> = {
  manual_csv: ['csv'],
  nba_com: ['season'],
};

export interface RunDeps {
  env: Record<string, string | undefined>;
  argv: string[];
  createSink?: (options: SinkOptions) => PipelineSink;
  readFile?: (path: string) => string;
  log?: (line: string) => void;
  logError?: (line: string) => void;
  /** Adapter seams forwarded into `AdapterDeps` (tests; production uses the defaults). */
  fetch?: FeedFetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The value of `--<name>=`, refusing a duplicate. `find` would take the first
 * and `unknownFlag` accepts any well-formed repeat, so a second, different
 * value would steer nothing while reading as if it had — the same
 * operator-misdirection the misplaced-flag guard below refuses.
 */
function flagValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const hits = argv.filter((arg) => arg.startsWith(prefix));
  if (hits.length > 1) {
    throw new PipelineRunError(
      `duplicate --${name}= flag (${hits.length} given: ${hits.map((hit) => hit.slice(prefix.length)).join(', ')}) — ` +
        'refusing instead of silently taking the first',
    );
  }
  const hit = hits[0];
  return hit ? hit.slice(prefix.length) : undefined;
}

/**
 * The first argument that is not one of the supported flags. A typo like
 * `--dry-run=true` or `--dryrun` must not read as "dry run requested and
 * silently ignored" — the whole point of the flag is that no write follows, so
 * an unrecognised flag refuses the run instead.
 */
function unknownFlag(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith('--') && arg !== '--dry-run' && !/^--(source|csv|season)=\S/.test(arg));
}

function requiredEnv(env: RunDeps['env'], name: string): string {
  const value = env[name];
  if (!value) {
    // Name the variable; never its value (NFR-S1).
    throw new PipelineRunError(
      `missing required environment variable ${name} — the pipeline writes with the service-role key only ` +
        '(never an anon key, never a VITE_* variable). Provide it via --env-file=.env or the environment.',
    );
  }
  return value;
}

function describePlan(plan: Plan, log: (line: string) => void): void {
  for (const birth of plan.births) {
    const tail = birth.followup ? ' — birth at certified 3–3 immediately followed by the completion (game 7 + winner)' : '';
    log(`BIRTH     ${birth.label}: one series row + 6 score rows${tail}`);
  }
  for (const completion of plan.completions) {
    log(
      `COMPLETE  ${completion.label}: append game 7 (${completion.game.home_score}-${completion.game.away_score}) ` +
        `and fill winner_team_id=${completion.winner_team_id} on series ${completion.series_id} — one RPC, one transaction`,
    );
  }
  for (const skip of plan.skips) {
    log(`SKIP      ${skip.label}: ${skip.reason}`);
  }
  log(
    `plan: ${plan.births.length} birth(s), ${plan.completions.length} completion(s), ${plan.skips.length} skip(s) ` +
      `(${plan.births.reduce((rows, birth) => rows + birth.scores.length + (birth.followup ? 1 : 0), 0) + plan.completions.length} score row(s) planned)`,
  );
}

/**
 * Run the pipeline. Returns the process exit code (0 success — including an
 * empty plan — 2 on any refusal or failure). Never calls `process.exit`
 * itself: an explicit exit raced libuv on Windows in this repo
 * (`scripts/spike-2-1/audit-unique-key.mjs`), so callers set
 * `process.exitCode` and let the event loop drain.
 */
export async function runPipeline(deps: RunDeps): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const logError = deps.logError ?? ((line: string) => console.error(line));
  const readFile = deps.readFile ?? ((path: string) => readFileSync(path, 'utf8'));
  const argv = deps.argv;

  try {
    const stray = unknownFlag(argv);
    if (stray) {
      throw new PipelineRunError(
        `unrecognised flag "${stray}" — supported: --dry-run, --source=<adapter>, --csv=<path>, --season=<YYYY-YY> ` +
          '(--season drills the nba_com adapter into one postseason; the archive is frozen, so pointing it at an archived ' +
          'year reaches the runner\'s archive guard, never a rewrite)',
      );
    }
    const dryRun = argv.includes('--dry-run');
    // An empty SERIES_SOURCE — a CI job that declares the variable with no
    // value — means "unset": the documented default is the manual_csv floor.
    const sourceName = flagValue(argv, 'source') ?? (deps.env.SERIES_SOURCE?.trim() || DEFAULT_ADAPTER_NAME);
    // Adapter selection is validated before any secret is read: a recognised
    // but unimplemented name (Story 2.4's) refuses loudly, never silently
    // falling back to manual_csv.
    assertAdapterImplemented(sourceName);

    // A flag the selected adapter cannot use refuses the run (ADAPTER_FLAGS):
    // silently discarding `--csv=` on an nba_com run would let an operator
    // believe a file steered a feed run that never read it, and vice versa —
    // the same class of mistake the stray-flag guard above refuses for a
    // `--dryrun` typo.
    const csvArg = flagValue(argv, 'csv');
    const seasonArg = flagValue(argv, 'season');
    const passedFlags = [csvArg !== undefined ? 'csv' : undefined, seasonArg !== undefined ? 'season' : undefined].filter(
      (name): name is string => name !== undefined,
    );
    const allowed = ADAPTER_FLAGS[sourceName] ?? [];
    const misplaced = passedFlags.find((name) => !allowed.includes(name));
    if (misplaced) {
      throw new PipelineRunError(
        `--${misplaced}= does not apply to adapter "${sourceName}" — refusing instead of silently discarding the flag. ` +
          `Flags this adapter understands: ${allowed.length > 0 ? allowed.map((name) => `--${name}=`).join(', ') : 'none'}.`,
      );
    }
    // Decision 8: the CSV path is resolved only for the adapter that can read
    // a CSV; an HTTP adapter's deps bag carries no path it could misuse.
    const csvPath = sourceName === 'manual_csv' ? (csvArg ?? DEFAULT_CSV_PATH) : undefined;

    const supabaseUrl = requiredEnv(deps.env, ENV_SUPABASE_URL);
    const serviceRoleKey = requiredEnv(deps.env, ENV_SERVICE_ROLE_KEY);

    const sink = (deps.createSink ?? createSupabaseSink)({ supabaseUrl, serviceRoleKey });
    const teams = await sink.readTeams();
    const teamIds = new Map<string, number>(teams.map((team) => [team.abbreviation, team.id]));
    const adapterDeps: AdapterDeps = {
      csvPath,
      readFile,
      teamIdByAbbreviation: (abbreviation) => teamIds.get(abbreviation),
      fetch: deps.fetch,
      now: deps.now,
      seasonOverride: seasonArg,
      sleep: deps.sleep,
    };

    const adapter = createAdapterSource(sourceName, adapterDeps);
    const statuses = await adapter.fetch_series_statuses();
    const gameScores = await adapter.fetch_game_scores();

    // The adapter's report prints BEFORE its rows are assembled, so an abort
    // in `groupSourceRows` — or in planning — still shows the parse that
    // explains it (review triage rows 3 and 22). `manual_csv` has no report; a
    // run with it prints none of these lines and does not error for it.
    if (adapter.describeRun) {
      const report = adapter.describeRun();
      log(report.countsLine);
      log(report.histogramLine);
      for (const note of report.notes) {
        log(note);
      }
    }

    const source = groupSourceRows(statuses, gameScores);
    const current: CurrentSeriesRow[] = await sink.readCurrent();
    const plan = planPipeline(source, current);

    log(`pipeline adapter=${sourceName}${dryRun ? ' (dry-run — no writes will be issued)' : ''}`);
    describePlan(plan, log);

    if (dryRun) {
      log('dry-run: 0 rows written');
      return 0;
    }

    for (const birth of plan.births) {
      const seriesId = await sink.birth(birth);
      log(`wrote birth ${birth.label} as series ${seriesId}`);
      if (birth.followup) {
        await sink.complete({
          kind: 'completion',
          label: birth.label,
          series_id: seriesId,
          year: birth.year,
          team_a_id: birth.team_a_id,
          team_b_id: birth.team_b_id,
          game: birth.followup.game,
          winner_team_id: birth.followup.winner_team_id,
        });
        log(`wrote completion ${birth.label} on series ${seriesId}`);
      }
    }
    for (const completion of plan.completions) {
      await sink.complete(completion);
      log(`wrote completion ${completion.label} on series ${completion.series_id}`);
    }
    log(`applied: ${plan.births.length} birth(s), ${plan.completions.length} completion(s), ${plan.skips.length} skip(s)`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`pipeline failed: ${message}`);
    return 2;
  }
}

// Only auto-run when executed as the entry script (`node supabase/scripts/pipeline/run.ts …`);
// importing it (tests, future callers) has no side effects.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runPipeline({ env: process.env, argv: process.argv.slice(2) });
}
