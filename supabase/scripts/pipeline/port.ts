/**
 * Story 2.3 — the `SeriesDataSource` port (ARCHITECTURE-SPINE AD-5); Story
 * 2.4 registered the first automated adapter (`nba_com`) behind it.
 *
 * Every source of series data — the `manual_csv` floor and the automated
 * adapters Story 2.4 swaps in behind this same seam — speaks exactly
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
import { createNbaComAdapter } from './adapters/nbaCom.ts';

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

/** Optional reporting surface (Story 2.4): how an automated adapter selected its rows. */
export interface AdapterRunReport {
  /** One line naming feed size and selection counts — printed on every run so a silent narrowing of coverage cannot pass unnoticed. */
  countsLine: string;
  /** Derived chain-depth histogram (a postseason in flight legitimately shows a partial one — information, not a gate). */
  depthHistogram: Record<number, number>;
  /** Named exclusions (series whose derived depth falls outside 1..4). */
  notes: string[];
}

/** The port AD-5 names. Method names are frozen; Story 2.4's adapter implements the same two. */
export interface SeriesDataSource {
  fetch_series_statuses(): Promise<SeriesStatusRow[]>;
  fetch_game_scores(): Promise<GameScoreRow[]>;
  /**
   * Optional. Automated adapters report their selection counts and depth
   * histogram through it (Story 2.4 Boundaries); the runner prints the report
   * after the two fetch methods resolve. Not one of AD-5's frozen two.
   */
  describeRun?(): AdapterRunReport;
}

export class AdapterSelectionError extends Error {}

/** AD-5's adapter list; `manual_csv` is the default and the floor. */
export const DEFAULT_ADAPTER_NAME = 'manual_csv';

/** The narrow slice of `fetch` an HTTP adapter needs — tests inject a stub, so nothing reaches the network. */
export interface AdapterFetchInit {
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface AdapterFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type AdapterFetch = (url: string, init: AdapterFetchInit) => Promise<AdapterFetchResponse>;

/**
 * What the runner hands an adapter factory. Story 2.4 (Decision 8) kept this
 * from accreting CSV fields: the CSV pieces are `manual_csv`-only, the
 * `nba_com` pieces are the season/date seam plus the injectable network and
 * backoff — every field is used by at least one shipped adapter.
 */
export interface AdapterDeps {
  /** `manual_csv` only: path of the CSV it reads (flag `--csv=` or the default file). Other adapters receive `undefined`. */
  csvPath?: string;
  readFile: (path: string) => string;
  /** Resolves `teams.abbreviation` (UNIQUE) to `teams.id`; undefined for a team the table does not hold. */
  teamIdByAbbreviation: (abbreviation: string) => number | undefined;
  /** `nba_com` only: `--season=YYYY-YY` override; undefined lets the adapter derive the season from `runDate`. */
  season?: string;
  /** `nba_com` only: the run's date — season derivation and the same-UTC-day exclusion read its UTC fields. */
  runDate?: Date;
  /** `nba_com` only: injectable fetch (tests never touch the network); defaults to the runtime's global fetch. */
  fetch?: AdapterFetch;
  /** `nba_com` only: injectable backoff sleep between retry attempts; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

interface AdapterEntry {
  implemented: boolean;
  /** Only implemented adapters carry a factory. */
  create?: (deps: AdapterDeps) => SeriesDataSource;
  /** Only unimplemented adapters carry a reason: where its rejection or its pending story lives. */
  reason?: string;
}

function unimplementedEntry(reason: string): AdapterEntry {
  return { implemented: false, reason };
}

/**
 * The adapter registry keyed by `SERIES_SOURCE`. Story 2.4 registered
 * `nba_com` here; `fantrax` stays recognised-but-unimplemented with its
 * message pointing at the spike's rejection — recorded, never silently
 * dropped. The runner never falls back to `manual_csv` silently, because a
 * silent fallback during the playoff window would leave Active Series stale
 * while looking healthy.
 */
export const ADAPTER_REGISTRY: Record<string, AdapterEntry> = {
  manual_csv: { implemented: true, create: createManualCsvAdapter },
  fantrax: unimplementedEntry(
    'rejected by the Story 2.1 spike: its endpoints return fantasy point totals and playoff configuration, ' +
      'never real home/away game scores (see _bmad-output/implementation-artifacts/decision-2-1-q-4-data-source.md)',
  ),
  nba_com: { implemented: true, create: createNbaComAdapter },
};

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
    throw new AdapterSelectionError(
      `SERIES_SOURCE="${name}" is a recognised adapter but is not implemented — ${entry.reason ?? 'no adapter is shipped for it'}. ` +
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
