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
 * `--season=<YYYY-YY>` overrides the nba_com adapter's date-derived season;
 * the archive is frozen (Story 2.4 Decision 11), so pointing it at an archived
 * year is a drill that lands on the runner's archive guard, never a rewrite.
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
  type AdapterFetch,
  type AdapterRunReport,
} from './port.ts';
import { groupSourceRows, planPipeline, type CurrentSeriesRow, type Plan, type SourceSeries } from './plan.ts';
import { createSupabaseSink, type PipelineSink, type SinkOptions } from './writer.ts';

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CSV_PATH = join(moduleDir, 'data', 'series_manual.csv');

export const ENV_SUPABASE_URL = 'SUPABASE_URL';
export const ENV_SERVICE_ROLE_KEY = 'SUPABASE_SERVICE_ROLE_KEY';

export class PipelineRunError extends Error {}

export interface RunDeps {
  env: Record<string, string | undefined>;
  argv: string[];
  createSink?: (options: SinkOptions) => PipelineSink;
  readFile?: (path: string) => string;
  log?: (line: string) => void;
  logError?: (line: string) => void;
  /** Test seam for the run's UTC date (Story 2.4: season derivation + same-day exclusion). */
  now?: () => Date;
  /** Test seam for HTTP adapters — `tests/pipeline` never touches the network (Story 2.4 Decision 8). */
  fetch?: AdapterFetch;
  /** Test seam for an HTTP adapter's retry backoff, so a refused-feed test does not wait on real timers. */
  sleep?: (ms: number) => Promise<void>;
}

function flagValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

/**
 * The first argument that is not one of the supported flags. A typo like
 * `--dry-run=true` or `--dryrun` must not read as "dry run requested and
 * silently ignored" — the whole point of the flag is that no write follows, so
 * an unrecognised flag refuses the run instead. The help text names the
 * frozen-archive rule beside `--season=` (Story 2.4 Decision 11) so a drill
 * onto an archived year reads as intentional, not as an accidental attack on
 * rows the adapter may never rewrite.
 */
function unknownFlag(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith('--') && arg !== '--dry-run' && !/^--(source|csv|season)=\S/.test(arg));
}

function flagHelp(): string {
  return (
    'supported: --dry-run, --source=<adapter>, --csv=<path> (manual_csv), ' +
    '--season=<YYYY-YY> (nba_com; overrides the derived postseason — the archived years are FROZEN: ' +
    'pointing --season= at one reaches the archive guard, which skips it when the source matches and aborts naming ' +
    'the series when it disagrees, never a rewrite)'
  );
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

/** `{1:8, 2:4, 3:2, 4:1}` — depth order, so a reviewer can read the bracket shape at a glance. */
function formatHistogram(histogram: Record<number, number>): string {
  return `{${Object.keys(histogram)
    .map(Number)
    .sort((left, right) => left - right)
    .map((depth) => `${depth}:${histogram[depth]}`)
    .join(', ')}}`;
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
      throw new PipelineRunError(`unrecognised flag "${stray}" — ${flagHelp()}`);
    }
    const dryRun = argv.includes('--dry-run');
    // An empty SERIES_SOURCE — a CI job that declares the variable with no
    // value — means "unset": the documented default is the manual_csv floor.
    const sourceName = flagValue(argv, 'source') ?? (deps.env.SERIES_SOURCE?.trim() || DEFAULT_ADAPTER_NAME);
    // Adapter selection is validated before any secret is read: a recognised
    // but unimplemented name refuses loudly, never silently falling back to
    // manual_csv.
    assertAdapterImplemented(sourceName);
    // Story 2.4 (Decision 8): the CSV path is resolved for the adapter that
    // can use it and for no other.
    const csvPath = sourceName === DEFAULT_ADAPTER_NAME ? (flagValue(argv, 'csv') ?? DEFAULT_CSV_PATH) : undefined;

    const supabaseUrl = requiredEnv(deps.env, ENV_SUPABASE_URL);
    const serviceRoleKey = requiredEnv(deps.env, ENV_SERVICE_ROLE_KEY);

    const sink = (deps.createSink ?? createSupabaseSink)({ supabaseUrl, serviceRoleKey });
    const teams = await sink.readTeams();
    const teamIds = new Map<string, number>(teams.map((team) => [team.abbreviation, team.id]));
    const adapterDeps: AdapterDeps = {
      csvPath,
      readFile,
      teamIdByAbbreviation: (abbreviation) => teamIds.get(abbreviation),
      season: flagValue(argv, 'season'),
      runDate: deps.now ? deps.now() : new Date(),
      fetch: deps.fetch,
      sleep: deps.sleep,
    };

    const { sources, report } = await loadSource(sourceName, adapterDeps);
    const current: CurrentSeriesRow[] = await sink.readCurrent();
    const plan = planPipeline(sources, current);

    log(`pipeline adapter=${sourceName}${dryRun ? ' (dry-run — no writes will be issued)' : ''}`);
    if (report) {
      log(report.countsLine);
      log(`depth histogram: ${formatHistogram(report.depthHistogram)}`);
      for (const note of report.notes) log(note);
    }
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

interface LoadedSource {
  sources: SourceSeries[];
  /** The adapter's selection report, when it has one (Story 2.4: automated adapters report counts + histogram). */
  report?: AdapterRunReport;
}

async function loadSource(sourceName: string, adapterDeps: AdapterDeps): Promise<LoadedSource> {
  const adapter = createAdapterSource(sourceName, adapterDeps);
  const statuses = await adapter.fetch_series_statuses();
  const scores = await adapter.fetch_game_scores();
  // Both fetch methods have resolved — an HTTP adapter's single request is
  // spent and its cached parse is complete, so the run report exists now.
  const report = adapter.describeRun?.();
  return { sources: groupSourceRows(statuses, scores), report };
}

// Only auto-run when executed as the entry script (`node supabase/scripts/pipeline/run.ts …`);
// importing it (tests, future callers) has no side effects.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runPipeline({ env: process.env, argv: process.argv.slice(2) });
}
