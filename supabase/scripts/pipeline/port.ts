/**
 * Story 2.3 — the `SeriesDataSource` port (ARCHITECTURE-SPINE AD-5).
 *
 * Every source of series data — the `manual_csv` floor shipped here and the
 * automated adapters Story 2.4 swaps in behind this same seam — speaks exactly
 * two operations, named verbatim as AD-5 fixes them so the spine and the code
 * cannot diverge: `fetch_series_statuses` and `fetch_game_scores`. The runner
 * never knows which adapter produced its rows.
 *
 * Rows are keyed by the series identity AD-5 establishes — `(year, team_a_id,
 * team_b_id)` — with `team_a_id` = game 1's home team (the archive convention,
 * measured 178/178 by the Story 2.1 spike). The runner re-checks that
 * convention (the either-slot-order identity assertion) before it writes;
 * adapters must supply it.
 *
 * The contract is documented in
 * `_bmad-output/implementation-artifacts/seriesdatasource-port.md`.
 */
import { createManualCsvAdapter } from './adapters/manualCsv.ts';
import { createEspnAdapter } from './adapters/espn.ts';

/** One series as the source sees it: identity, display round, and whether game 7 has landed. */
export interface SeriesStatusRow {
  year: number;
  /** Free-text display label. `round` is outside the identity key and carries no CHECK (Story 2.2). */
  round: string;
  team_a_id: number;
  team_b_id: number;
  /** NULL ⟺ Game 7 pending (AD-4). The scores half comes from `fetch_game_scores`. */
  winner_team_id: number | null;
}

/** One completed, final game. Keys to its series by the ordered identity pair. */
export interface GameScoreRow {
  year: number;
  team_a_id: number;
  team_b_id: number;
  game_number: number;
  home_team_id: number;
  away_team_id: number;
  home_score: number;
  away_score: number;
}

/**
 * The run report an automated adapter can expose (Story 2.4): what the parse
 * saw, printed by the runner BEFORE planning so an abort during planning
 * still shows the counts and histogram that explain it. AD-5 names the two
 * fetch operations as the contract; this member is optional and additive —
 * `manual_csv` has no report and a run with it prints nothing extra.
 */
export interface AdapterRunReport {
  /** e.g. "N series in feed, M Game-7 candidates (...)" — the selection is never silent. */
  countsLine: string;
  /** The derived depth histogram, rendered by the single shared `formatHistogram`. */
  histogramLine: string;
  /**
   * How many series the feed carried, counted BEFORE any of them was excluded
   * as a non-Game-7 shape. `--require-feed`'s empty-feed alarm (Story 2.6)
   * reads this number and never the wording of `countsLine`, because a copy
   * edit to a log string must not be able to turn a check into one that never
   * matches.
   */
  feedSeriesCount: number;
  /** Named exclusions (e.g. a chain depth the walk cannot explain). */
  notes: string[];
}

/** The port AD-5 names. The two method names are frozen; every adapter implements them. */
export interface SeriesDataSource {
  fetch_series_statuses(): Promise<SeriesStatusRow[]>;
  fetch_game_scores(): Promise<GameScoreRow[]>;
  /** Optional run report — see `AdapterRunReport`. */
  describeRun?(): AdapterRunReport;
}

export class AdapterSelectionError extends Error {}

/** AD-5's adapter list; `manual_csv` is the default and the floor. */
export const DEFAULT_ADAPTER_NAME = 'manual_csv';

/** The minimal response view the feed parser consumes — real `fetch` satisfies it. */
export interface FeedResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface FeedRequestInit {
  headers: Record<string, string>;
  signal: AbortSignal;
}

/** The injectable HTTP seam (Decision 8): tests never reach the network. */
export type FeedFetch = (url: string, init: FeedRequestInit) => Promise<FeedResponseLike>;

export interface AdapterDeps {
  /**
   * CSV-only (Story 2.4, Decision 8): the runner supplies it for `manual_csv`
   * and for nothing else — an HTTP adapter must not be handed a path it
   * cannot use.
   */
  csvPath?: string;
  readFile: (path: string) => string;
  /** Resolves `teams.abbreviation` (UNIQUE) to `teams.id`; undefined for a team the table does not hold. */
  teamIdByAbbreviation: (abbreviation: string) => number | undefined;
  /**
   * Resolves `teams.espn_code` to `teams.id` — the Story 2.13 join key for the
   * `espn` adapter. Per-adapter by construction: which column an adapter
   * resolves through is its own fact, and the shared abbreviation map above must
   * never silently apply to a provider whose codes diverge from it (measured:
   * six franchises, e.g. ESPN prints `NY`/`SA` where the table holds
   * `NYK`/`SAS` — the full list is `00018`'s seed). Optional the way
   * the other HTTP seams are — the runner always supplies it, and an adapter
   * constructed without it refuses rather than falling back.
   */
  teamIdByEspnCode?: (code: string) => number | undefined;
  /** HTTP-adapter seam (Decision 8): injectable fetch; defaults to the global. Tests must inject one. */
  fetch?: FeedFetch;
  /** HTTP-adapter seam: the run's UTC clock, the request-date derivation input. Defaults to wall time. */
  now?: () => Date;
  /** HTTP-adapter seam: retry backoff wait; defaults to `setTimeout`. Tests inject a recorder. */
  sleep?: (ms: number) => Promise<void>;
}

interface AdapterEntry {
  implemented: boolean;
  /** Only implemented adapters carry a factory. */
  create?: (deps: AdapterDeps) => SeriesDataSource;
  /**
   * Whether this adapter's source carries a `describeRun` report. Declared
   * here rather than discovered from the factory because the runner has to
   * answer it BEFORE the sink exists (`--require-feed` refuses an adapter with
   * no report before any credential is read), and constructing a source needs
   * the team table. `tests/pipeline/run.test.ts` pins that this matches the
   * factory's output, so the declaration cannot drift.
   */
  hasRunReport: boolean;
  /** For recognised-but-unimplemented names: why this entry exists (rejection, not silence). */
  rejection?: string;
}

function unimplementedEntry(rejection?: string): AdapterEntry {
  return { implemented: false, hasRunReport: false, ...(rejection ? { rejection } : {}) };
}

/**
 * The adapter registry keyed by `SERIES_SOURCE`. `manual_csv` is the
 * guaranteed floor and stays the default; Story 2.13 adds `espn` — the
 * SCHEDULED source, because Story 2.6's egress evidence proved `stats.nba.com`
 * refuses every cloud while `site.api.espn.com` answers from both (the
 * four-cell table in `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-03.md`).
 * `fantrax` stays recognised-but-unimplemented with the Story 2.1 rejection
 * recorded — a silent drop would let a future session re-propose it as
 * unexamined. The runner never falls back to `manual_csv` silently, because a
 * silent fallback during the playoff window would leave Active Series stale
 * while looking healthy.
 *
 * [2026-10-06, Story 2.16 — owner call C1 reversed.] Story 2.4's stats.nba.com
 * adapter is retired: its file, its registry entry, its two hand-run probes
 * and its test suite were deleted together, and its name is now an
 * unrecognised adapter that refuses the start. C1 had kept it registered for
 * two reasons: "dropping a recognised name would invite a future session to
 * re-propose the endpoint unexamined", and "it remains the source a
 * residential address can still run". The first is answered by keeping the
 * egress conclusion and its citations in the docs (the proposal above;
 * `seriesdatasource-port.md`) instead of in a registry name — do not
 * re-propose stats.nba.com or cdn.nba.com for a scheduled run. The second was
 * no longer worth a registered source once its last live job, Game 7 venue
 * curation, was complete (160/160 NBA/BAA cells, F3 closed). A blank venue
 * cell is now filled by hand through `venueBackfill.ts`'s worksheet.
 */
export const ADAPTER_REGISTRY: Record<string, AdapterEntry> = {
  manual_csv: { implemented: true, hasRunReport: false, create: createManualCsvAdapter },
  espn: { implemented: true, hasRunReport: true, create: createEspnAdapter },
  fantrax: unimplementedEntry(
    'it was rejected by the Story 2.1 spike: Fantrax endpoints are fantasy-scoped and return fantasy point totals and playoff ' +
      'configuration, never a real NBA game score with home/away sides (see _bmad-output/implementation-artifacts/decision-2-1-q-4-data-source.md)',
  ),
};

/**
 * Whether the named adapter's run report can answer "did the feed carry
 * anything?" — the question `--require-feed` asks. False for `manual_csv`,
 * whose rows are a file the operator edited and which declares no
 * `describeRun`. An unknown or unimplemented name is false too: the runner
 * rejects those separately, and this predicate never licenses a run.
 */
export function adapterHasRunReport(name: string): boolean {
  return ADAPTER_REGISTRY[name]?.hasRunReport ?? false;
}

/**
 * Validate an adapter name without touching the environment or the network —
 * the entry point calls this before reading any secret, so `SERIES_SOURCE`
 * naming an unimplemented or unknown adapter refuses the run at once.
 */
export function assertAdapterImplemented(name: string): void {
  const entry = ADAPTER_REGISTRY[name];
  if (!entry) {
    throw new AdapterSelectionError(
      `SERIES_SOURCE="${name}" is not a recognised adapter. Known adapters: ${Object.keys(ADAPTER_REGISTRY)
        .sort()
        .join(', ')}.`,
    );
  }
  if (!entry.implemented) {
    const reason = entry.rejection ? ` — ${entry.rejection}` : ' — ADAPTER_REGISTRY lists no factory for it (an unimplemented entry should carry its rejection reason, the way `fantrax` carries the Story 2.1 spike verdict)';
    throw new AdapterSelectionError(
      `SERIES_SOURCE="${name}" is a recognised adapter but is not implemented${reason}. ` +
        'The runner never falls back silently — unset SERIES_SOURCE (or pass --source=manual_csv) to use the manual_csv floor.',
    );
  }
}

export function createAdapterSource(name: string, deps: AdapterDeps): SeriesDataSource {
  const entry = ADAPTER_REGISTRY[name];
  if (!entry || !entry.implemented || !entry.create) {
    // Unreachable in the entry-point flow (assertAdapterImplemented runs
    // first); guards against a future caller skipping that step.
    throw new AdapterSelectionError(`SERIES_SOURCE="${name}" is not an implemented adapter.`);
  }
  return entry.create(deps);
}
