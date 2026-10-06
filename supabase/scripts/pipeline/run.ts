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
 *   node --env-file=.env supabase/scripts/pipeline/run.ts --source=espn --dry-run        (the scheduled source)
 *   node --env-file=.env supabase/scripts/pipeline/run.ts --source=manual_csv --dry-run  (the floor; births)
 *
 * Story 2.14 additions: every supported flag lives in `SUPPORTED_FLAGS`, which
 * both the refusal and its help text read, and ANY argv token outside it —
 * positional, single-dash, em-dash, empty — refuses the run before a sink is
 * opened. A write that throws after a winner already landed in this run
 * refreshes the insights cache before exiting 2, because the refresh trigger
 * is one-shot and the next run would plan those series as skips.
 *
 * Story 2.4 additions: a flag the selected adapter cannot use refuses the run,
 * and an adapter that carries a run report (`describeRun`) prints it before
 * planning. [2026-10-06, Story 2.16: Story 2.4 also added `--season=<YYYY-YY>`,
 * which drilled its stats.nba.com adapter into one postseason. The flag retired
 * with that adapter and is now an unrecognised flag that refuses the run.]
 *
 * Story 2.5 additions: a run that filled at least one winner (a completion,
 * or a birth carrying its Game 7 follow-up) refreshes the insights cache
 * through the 00017 RPC after its own writes land, and U10's operator flag
 * `--refresh-insights` runs *only* that refresh and exits — no adapter
 * selected, fetched, or validated, no series row read or written. It is
 * refused up front when combined with `--dry-run` (dry-run promises zero
 * writes; the refresh is three) and when combined with the `--csv=` scoping
 * flag, which could narrow nothing here and would otherwise read as if it had.
 * A refresh failure reaches the same exit-2 path as any other step.
 *
 * Story 2.6 additions: `--require-feed` makes an empty feed a failure rather
 * than a quiet success, so a scheduled inseason run that reached the endpoint
 * and got nothing back exits non-zero and alarms. The runner stays date-blind
 * — no Apr–Jun branch lives here — so the flag is opt-in, declared by
 * `.github/workflows/pipeline-inseason.yml` and by nothing in code. It is
 * refused up front (before any credential is read) with an adapter that
 * carries no run report, because `manual_csv`'s rows are a file the operator
 * edited rather than a feed that can come back empty.
 *
 * Story 2.18 additions: the stored series rows are read BEFORE the adapter is
 * built (and reused for planning — still one read), so the `espn` adapter can
 * skip backfilling a pair already on the table; and the adapter's `alerts`
 * print after its report lines, each prefixed `BIRTH NEEDED:` for the
 * workflows to grep. An alert never changes the exit code.
 *
 * `.env` must supply SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the same
 * names the handle-contact function uses; NFR-S1 — never a `VITE_*` name,
 * never a committed value).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  adapterHasRunReport,
  assertAdapterImplemented,
  createAdapterSource,
  DEFAULT_ADAPTER_NAME,
  type AdapterDeps,
  type AdapterSelectionOrigin,
  type FeedFetch,
} from './port.ts';
import { groupSourceRows, planPipeline, type CurrentSeriesRow, type Plan } from './plan.ts';
import { createSupabaseSink, type InsightsRefreshCensus, type PipelineSink, type SinkOptions } from './writer.ts';

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CSV_PATH = join(moduleDir, 'data', 'series_manual.csv');

export const ENV_SUPABASE_URL = 'SUPABASE_URL';
export const ENV_SERVICE_ROLE_KEY = 'SUPABASE_SERVICE_ROLE_KEY';

export class PipelineRunError extends Error {}

/**
 * Story 2.18 — the prefix every adapter alert prints with. The workflows grep
 * the run log for it (line start) to file the "Pipeline birth needed" issue,
 * and `tests/pipeline/workflows.test.ts` pins that grep against this constant.
 */
export const BIRTH_NEEDED_PREFIX = 'BIRTH NEEDED:';

/** The operator recovery both refresh-failure messages print — one copy, so they cannot drift. */
const REFRESH_RECOVERY_COMMAND = '`node --env-file=.env supabase/scripts/pipeline/run.ts --refresh-insights`';

/**
 * Flags each adapter understands (Story 2.4, review triage row 6): passing a
 * flag the selected adapter cannot use refuses the run. A silently discarded
 * `--csv=` on an HTTP run is the same class of mistake this file already
 * refuses for a `--dryrun` typo — the operator believes they steered the run.
 */
const ADAPTER_FLAGS: Record<string, string[]> = {
  manual_csv: ['csv'],
  // Story 2.13: `espn` takes NO flag. Its one date is derived from the run
  // instant inside the adapter, so a `--date=` flag would be the calendar
  // input the spec's Non-goals refuse.
  espn: [],
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
  /** Story 2.18 test seams for the espn extra-date budget (production uses the adapter's defaults). */
  extraFetchBudget?: AdapterDeps['extraFetchBudget'];
  monotonicNow?: () => number;
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
 * Story 2.14: the ONE list of supported flags. The refusal below and its help
 * text both read it, so a flag is added or retired in exactly one place
 * (Story 2.16 retired `--season=` by deleting its entry). A value flag is
 * written `--name=value` and needs a value that does not start with
 * whitespace; a bare flag must match exactly.
 */
interface SupportedFlag {
  name: string;
  takesValue: boolean;
  usage: string;
  note?: string;
}

export const SUPPORTED_FLAGS: readonly SupportedFlag[] = [
  { name: 'dry-run', takesValue: false, usage: '--dry-run' },
  {
    name: 'refresh-insights',
    takesValue: false,
    usage: '--refresh-insights',
    note: '--refresh-insights runs only the Story 2.5 insights-cache refresh and exits',
  },
  {
    name: 'require-feed',
    takesValue: false,
    usage: '--require-feed',
    note: '--require-feed turns an empty feed into a failure',
  },
  { name: 'source', takesValue: true, usage: '--source=<adapter>' },
  { name: 'csv', takesValue: true, usage: '--csv=<path>' },
];

/** `--name=value` with a value that does not start with whitespace. */
function hasValue(arg: string, prefix: string): boolean {
  return arg.startsWith(prefix) && /^\S/.test(arg.slice(prefix.length));
}

function isSupportedFlag(arg: string): boolean {
  return SUPPORTED_FLAGS.some((flag) =>
    flag.takesValue ? hasValue(arg, `--${flag.name}=`) : arg === `--${flag.name}`,
  );
}

/**
 * The first argument that is not one of the supported flags. A typo like
 * `--dry-run=true` or `--dryrun` must not read as "dry run requested and
 * silently ignored" — the whole point of the flag is that no write follows, so
 * an unrecognised flag refuses the run instead. Story 2.14 closed the gap the
 * Epic 2 retro observed (finding W3): the old check looked only at tokens
 * starting with `--`, so `-dry-run`, `dry-run` and an em-dash `—dry-run` ran
 * live. Every token is checked now, and the empty string is a token too —
 * which is why callers compare against `undefined`, not truthiness.
 */
function unknownFlag(argv: string[]): string | undefined {
  return argv.find((arg) => !isSupportedFlag(arg));
}

function supportedFlagsHelp(): string {
  const usages = SUPPORTED_FLAGS.map((flag) => flag.usage).join(', ');
  const notes = SUPPORTED_FLAGS.flatMap((flag) => (flag.note ? [flag.note] : [])).join('; ');
  return `supported: ${usages} (${notes})`;
}

/**
 * The refresh's one report line (Story 2.5) — printed only on the branch
 * that refreshed, and naming the population the *server* counted (the RPC's
 * own census, never a client-side re-read). The `AdapterRunReport` style:
 * one line saying what happened and over what.
 */
export function insightsRefreshLine(census: InsightsRefreshCensus): string {
  return (
    `insights cache refreshed: 3 keys rewritten over ${census.total_game_sevens} NBA/BAA Game 7(s) — ` +
    `home wins ${census.home_team_wins}, game-6 winners won ${census.game_6_winners_won}, average margin ${census.average_margin}`
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
    if (stray !== undefined) {
      throw new PipelineRunError(`unrecognised flag "${stray}" — ${supportedFlagsHelp()}`);
    }
    const dryRun = argv.includes('--dry-run');
    // U10 (owner decision 2026-10-03): a bare operator flag that runs ONLY the
    // refresh and exits — the deliberate entry that populations the cache
    // outside a winner-filling run. It never replaces the frozen automatic
    // trigger below; it is an additional, operator-initiated path.
    const refreshInsightsOnly = argv.includes('--refresh-insights');
    // Story 2.6 / SM-4: an empty *plan* is legitimate (a day with no completed
    // games); an empty *feed* inside the playoff window is the anomaly. The
    // runner never decides which window it is in — the workflow file that
    // passes this flag does — so the flag is off by default and the date
    // expression stays singular (the cron line).
    const requireFeed = argv.includes('--require-feed');
    // The scoping flag is read once, up here, because both paths validate it
    // — the run path against the selected adapter, the refresh path against
    // the fact that it selects no adapter at all.
    const csvArg = flagValue(argv, 'csv');
    // Secrets are read and the client built at one site so both paths share
    // one credential check. Lazy by shape: the run path still calls it only
    // after adapter selection has been validated, so an unimplemented
    // `SERIES_SOURCE` never reaches the environment.
    const openSink = (): PipelineSink =>
      (deps.createSink ?? createSupabaseSink)({
        supabaseUrl: requiredEnv(deps.env, ENV_SUPABASE_URL),
        serviceRoleKey: requiredEnv(deps.env, ENV_SERVICE_ROLE_KEY),
      });
    if (refreshInsightsOnly && dryRun) {
      // Refused here, before any secret is read or client is built: the two
      // are mutually exclusive BY VALIDATION, not by ordering — dry-run's
      // contract is zero writes and the refresh is three cache rows.
      throw new PipelineRunError(
        '--refresh-insights cannot be combined with --dry-run — dry-run promises zero writes and the insights refresh writes three ' +
          'insights_cache rows. Drop one flag: the refresh is an operator action, not a preview.',
      );
    }
    if (refreshInsightsOnly && requireFeed) {
      // Refused by validation, not by ordering: the operator refresh reads the
      // archive through `pipeline_refresh_insights_cache` and fetches no feed,
      // so there is no feed for it to require — and a flag that could check
      // nothing would read as if it had.
      throw new PipelineRunError(
        '--require-feed cannot be combined with --refresh-insights — the operator refresh recomputes the cache from the archived ' +
          'series and never fetches a feed, so there is no feed to require. Drop one flag.',
      );
    }
    if (refreshInsightsOnly) {
      // The same operator-misdirection the ADAPTER_FLAGS block below refuses
      // for a mismatched adapter: a scoping flag on this path narrows nothing,
      // so it is refused by name rather than parsed and discarded — the
      // operator must not believe a file steered a refresh that reads none.
      if (csvArg !== undefined) {
        throw new PipelineRunError(
          '--refresh-insights cannot be combined with --csv= — the operator refresh selects no adapter, so no source file can narrow ' +
            'it, and the flag would be silently discarded. Run --refresh-insights on its own: it recomputes the cache over the whole ' +
            'league-filtered archive as it stands.',
        );
      }
      // U10's operator path is a short-circuit, not a mode: one RPC, one report
      // line, exit — and it sits *ahead* of adapter selection, so nothing here
      // validates, creates or fetches an adapter (a SERIES_SOURCE naming an
      // unimplemented one cannot refuse a run that selects none). Everything
      // below — readTeams, the adapter legs, readCurrent, planning, the write
      // loops — is structurally unreachable, which is how "no adapter fetched,
      // no series row read or written" is enforced by shape rather than by care.
      const census = await openSink().refreshInsights();
      log(insightsRefreshLine(census));
      return 0;
    }
    // An empty SERIES_SOURCE — a CI job that declares the variable with no
    // value — means "unset": the documented default is the manual_csv floor.
    const sourceFlag = flagValue(argv, 'source');
    const sourceName = sourceFlag ?? (deps.env.SERIES_SOURCE?.trim() || DEFAULT_ADAPTER_NAME);
    const origin: AdapterSelectionOrigin = sourceFlag !== undefined ? '--source=' : 'SERIES_SOURCE=';
    // Adapter selection is validated before any secret is read: a recognised
    // but unimplemented name (Story 2.4's) refuses loudly, never silently
    // falling back to manual_csv. The refusal names the route the operator used.
    assertAdapterImplemented(sourceName, origin);

    // A flag the selected adapter cannot use refuses the run (ADAPTER_FLAGS):
    // silently discarding `--csv=` on an espn run would let an operator
    // believe a file steered a feed run that never read it — the same class
    // of mistake the stray-flag guard above refuses for a `--dryrun` typo.
    const passedFlags = csvArg !== undefined ? ['csv'] : [];
    const allowed = ADAPTER_FLAGS[sourceName] ?? [];
    const misplaced = passedFlags.find((name) => !allowed.includes(name));
    if (misplaced) {
      // The `allowed.map` branch below is unreachable while `csv` is the only scoping flag (Story 2.16); kept for the next one.
      throw new PipelineRunError(
        `--${misplaced}= does not apply to adapter "${sourceName}" — refusing instead of silently discarding the flag. ` +
          `Flags this adapter understands: ${allowed.length > 0 ? allowed.map((name) => `--${name}=`).join(', ') : 'none'}.`,
      );
    }
    // Story 2.6: the same refusal shape as the block above, one layer up. An
    // adapter that declares no run report has no feed count to check, so
    // `--require-feed` against it cannot pass or fail — it can only pretend.
    // Refusing here (before `openSink()` and before the adapter is even
    // constructed) also makes the alarm's own contract testable and
    // dispatchable with no credentials and zero HTTP to the database.
    if (requireFeed && !adapterHasRunReport(sourceName)) {
      throw new PipelineRunError(
        `--require-feed does not apply to adapter "${sourceName}" — the empty-feed alarm reads the adapter's run report and this ` +
          'adapter declares none: its rows are a file an operator edited, not a feed that can come back empty. Refusing instead of ' +
          'silently passing a check that can never run; use --source=espn.',
      );
    }
    // Decision 8: the CSV path is resolved only for the adapter that can read
    // a CSV; an HTTP adapter's deps bag carries no path it could misuse.
    const csvPath = sourceName === 'manual_csv' ? (csvArg ?? DEFAULT_CSV_PATH) : undefined;

    const sink = openSink();

    const teams = await sink.readTeams();
    const teamIds = new Map<string, number>(teams.map((team) => [team.abbreviation, team.id]));
    // Story 2.13: a SECOND, per-adapter resolver, keyed on `teams.espn_code`
    // rather than `teams.abbreviation`. It is not the same map under another
    // name and must not become one: ESPN's code differs from the table's for six
    // franchises (measured — `NY`/`NYK`, `SA`/`SAS` and four more, seeded by
    // `00018`), so an abbreviation-equality join would silently drop those
    // franchises' games — the one failure mode in the evidence with no loud
    // signal at all. Identities with no provider code (the 29 historical rows)
    // are absent from this map by construction, which is
    // what makes an unresolvable code abort naming the code instead of resolving
    // to a wrong franchise.
    const espnTeamIds = new Map<string, number>(
      teams.filter((team) => team.espn_code != null).map((team) => [team.espn_code as string, team.id]),
    );
    // Story 2.18: the table is read BEFORE the adapter is built, so `espn` can
    // skip backfilling a pair that is already stored (in either slot order),
    // and the same rows are reused for planning below — one read per run.
    const current: CurrentSeriesRow[] = await sink.readCurrent();
    const adapterDeps: AdapterDeps = {
      csvPath,
      readFile,
      teamIdByAbbreviation: (abbreviation) => teamIds.get(abbreviation),
      teamIdByEspnCode: (code) => espnTeamIds.get(code),
      fetch: deps.fetch,
      now: deps.now,
      sleep: deps.sleep,
      extraFetchBudget: deps.extraFetchBudget,
      monotonicNow: deps.monotonicNow,
      isPairStored: (year, left, right) =>
        current.some(
          (row) =>
            row.year === year &&
            ((row.team_a_id === left && row.team_b_id === right) || (row.team_a_id === right && row.team_b_id === left)),
        ),
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
      // Story 2.18: alerts print after the report lines with a stable prefix
      // the workflows grep for, and BEFORE anything below can refuse, so a red
      // run still shows them. They never change the exit code.
      for (const alert of report.alerts) {
        log(`${BIRTH_NEEDED_PREFIX} ${alert}`);
      }
      // The alarm reads the report's own number, never the wording of the line
      // printed above it — a copy edit to `countsLine` must not be able to turn
      // this into a check that silently never matches. Reaching here with the
      // flag set means the registry declared a report for this adapter (the
      // refusal above guarantees that) and `tests/pipeline/run.test.ts` pins
      // the declaration against the adapter's own members. The throw sits
      // ahead of the dry-run return because this is a refusal, not a write: a
      // `--dry-run --require-feed` run against an empty feed is red, which is
      // how the alarm's contract gets proven before the playoff window.
      if (requireFeed && report.feedSeriesCount === 0) {
        throw new PipelineRunError(
          `--require-feed: ${sourceName} returned 0 series — an empty feed inside the playoff window is a failure, not a quiet ` +
            'success (Story 2.6 / SM-4). No plan was computed and nothing was written; the report lines above are what the feed ' +
            'carried, including the date the adapter derived. Check the endpoint and that scope before the next cron slot.',
        );
      }
    }

    const source = groupSourceRows(statuses, gameScores);
    const plan = planPipeline(source, current);

    log(`pipeline adapter=${sourceName}${dryRun ? ' (dry-run — no writes will be issued)' : ''}`);
    describePlan(plan, log);

    if (dryRun) {
      log('dry-run: 0 rows written');
      return 0;
    }

    // Story 2.14 (retro finding W1): count the winners that actually LANDED, so
    // a write that throws partway through still refreshes the cache over them.
    // Without this, a run that filled one winner and then failed on the next
    // write exited 2 with no refresh, and the next run planned the landed
    // series as skips — the one-shot trigger never fired on their account.
    let winnersLanded = 0;
    try {
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
          winnersLanded += 1;
          log(`wrote completion ${birth.label} on series ${seriesId}`);
        }
      }
      for (const completion of plan.completions) {
        await sink.complete(completion);
        winnersLanded += 1;
        log(`wrote completion ${completion.label} on series ${completion.series_id}`);
      }
    } catch (writeError) {
      // No winner landed yet: nothing to refresh, so the failure surfaces
      // exactly as it did before this story.
      if (winnersLanded === 0) throw writeError;
      const writeMessage = writeError instanceof Error ? writeError.message : String(writeError);
      let census: InsightsRefreshCensus;
      try {
        census = await sink.refreshInsights();
      } catch (refreshError) {
        const refreshMessage = refreshError instanceof Error ? refreshError.message : String(refreshError);
        throw new PipelineRunError(
          `${writeMessage} — ${winnersLanded} winner(s) landed in this run before that failure, and the insights refresh over them ` +
            `failed too (${refreshMessage}). The landed writes stay landed, so a re-run will NOT retry this refresh; recover with ` +
            REFRESH_RECOVERY_COMMAND,
        );
      }
      log(insightsRefreshLine(census));
      throw new PipelineRunError(
        `${writeMessage} — ${winnersLanded} winner(s) landed in this run before that failure; the insights cache was refreshed ` +
          'over them before exiting, so no --refresh-insights recovery is needed for those. Fix the failed write and re-run.',
      );
    }
    log(`applied: ${plan.births.length} birth(s), ${plan.completions.length} completion(s), ${plan.skips.length} skip(s)`);

    // Story 2.5's frozen trigger: a run refreshes the cache only when it
    // filled at least one winner — a completion, or a birth carrying its
    // Game 7 follow-up (that write IS the active→archive transition, AD-4).
    // A purely offseason run fills none and refreshes nothing; the census
    // line above already reports every write, and printing a refresh line on
    // a branch that did not refresh would be a false report. The refresh runs
    // AFTER the write phase, never before; a throw here reaches the single
    // catch below and exits 2 naming the step (series writes stay landed — a
    // PostgREST client cannot roll them back).
    const winnerFilled = plan.completions.length > 0 || plan.births.some((birth) => birth.followup !== null);
    if (winnerFilled) {
      let census: InsightsRefreshCensus;
      try {
        census = await sink.refreshInsights();
      } catch (error) {
        // The trigger is one-shot: the winner-filling writes above have
        // landed, so the next run plans them as skips and never refreshes on
        // their account. The exit-2 message is therefore the only signal the
        // cache is stale, and it has to carry the recovery itself.
        const message = error instanceof Error ? error.message : String(error);
        throw new PipelineRunError(
          `${message} — the series writes above landed, so a re-run will NOT retry this refresh; recover with ` +
            REFRESH_RECOVERY_COMMAND,
        );
      }
      log(insightsRefreshLine(census));
    }
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
