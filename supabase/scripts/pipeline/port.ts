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

/** The port AD-5 names. Method names are frozen; Story 2.4's adapter implements the same two. */
export interface SeriesDataSource {
  fetch_series_statuses(): Promise<SeriesStatusRow[]>;
  fetch_game_scores(): Promise<GameScoreRow[]>;
}

export class AdapterSelectionError extends Error {}

/** AD-5's adapter list; `manual_csv` is the default and the floor. */
export const DEFAULT_ADAPTER_NAME = 'manual_csv';

export interface AdapterDeps {
  /** Path of the CSV the manual_csv adapter reads (flag `--csv=` or the default file). */
  csvPath: string;
  readFile: (path: string) => string;
  /** Resolves `teams.abbreviation` (UNIQUE) to `teams.id`; undefined for a team the table does not hold. */
  teamIdByAbbreviation: (abbreviation: string) => number | undefined;
}

interface AdapterEntry {
  implemented: boolean;
  /** Only implemented adapters carry a factory. */
  create?: (deps: AdapterDeps) => SeriesDataSource;
}

function unimplementedEntry(): AdapterEntry {
  return { implemented: false };
}

/**
 * The adapter registry keyed by `SERIES_SOURCE`. Story 2.4 registers its
 * automated adapter here; until then `fantrax` and `nba_com` are recognised
 * names that fail loudly — the runner never falls back to `manual_csv`
 * silently, because a silent fallback during the playoff window would leave
 * Active Series stale while looking healthy.
 */
export const ADAPTER_REGISTRY: Record<string, AdapterEntry> = {
  manual_csv: { implemented: true, create: createManualCsvAdapter },
  fantrax: unimplementedEntry(),
  nba_com: unimplementedEntry(),
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
      `SERIES_SOURCE="${name}" is a recognised adapter but is not implemented (Story 2.4). ` +
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
