/**
 * Story 2.4, Decisions 10 & 11 — the frozen `round` vocabulary and the
 * chain-depth derivation that fills it.
 *
 * No working unkeyed endpoint returns a playoff round *name* (the bracket
 * feed is retired — Story 2.1 decision record, inherit item 1), so the label
 * is computed from the games themselves: walk the postseason in date order,
 * and each series' depth is one more than the deeper of its two teams'
 * previous series this postseason. Depths 1..4 map to the four canonical
 * labels below — round-only, no conference prefix, so no 30-team conference
 * map enters the repo (owner call 2026-10-01: 1A).
 *
 * The walk deliberately consumes *every* reconstructed series, including the
 * shapes Decision 3 excludes from the output (a 4-2 sweep is not a Game 7,
 * but it is a real bracket series whose winner advances). Excluding sweeps
 * from the walk would collapse a mid-bracket Game 7 to depth 1 and print a
 * wrong label; the walk needs the sweeps to place the survivors correctly.
 *
 * `getRoundImportance` (`src/lib/nba-utils.ts`) stays untouched and
 * substring-tolerant: these four labels land in its 2/3/4/1 branches
 * respectively (pinned by `tests/pipeline/nba-com.test.ts`), and the 17 era
 * spellings already archived keep rendering from the same table.
 */

/** The fixed canonical list, indexed by chain depth 1..4. Never extended at runtime. */
export const CANONICAL_ROUND_LABELS: readonly string[] = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];

export const MIN_CHAIN_DEPTH = 1;
export const MAX_CHAIN_DEPTH = 4;

/** The display label for a derived depth, or undefined when the depth is outside 1..4. */
export function labelForDepth(depth: number): string | undefined {
  return depth >= MIN_CHAIN_DEPTH && depth <= MAX_CHAIN_DEPTH ? CANONICAL_ROUND_LABELS[depth - 1] : undefined;
}

/** One series as the chain walk sees it: the two teams and the date the series opened. */
export interface ChainSeriesInput {
  /** Identity of the reconstructed series, for message and result mapping. */
  key: string;
  teamAId: number;
  teamBId: number;
  /** `YYYY-MM-DD` of the series' first game — the walk orders by this. */
  firstGameDate: string;
}

export interface ChainPlacement {
  input: ChainSeriesInput;
  depth: number;
  /** False when the depth falls outside 1..4 — the walk met a bracket shape it cannot explain. */
  inRange: boolean;
}

/**
 * Walk the postseason in date order and derive each series' chain depth.
 * A team's depth strictly increases every time it reappears (the new depth is
 * one past the deeper of the two sides' previous depths), so "one team in
 * two series at the same depth" is unreachable arithmetic; the range check is
 * what catches a feed with more rounds than a 16-team bracket holds.
 */
export function walkChainDepth(series: readonly ChainSeriesInput[]): ChainPlacement[] {
  const ordered = [...series].sort((left, right) =>
    left.firstGameDate === right.firstGameDate ? left.key.localeCompare(right.key) : left.firstGameDate.localeCompare(right.firstGameDate),
  );
  const previousDepth = new Map<number, number>();
  const placements: ChainPlacement[] = [];
  for (const input of ordered) {
    const beforeA = previousDepth.get(input.teamAId) ?? 0;
    const beforeB = previousDepth.get(input.teamBId) ?? 0;
    const depth = 1 + Math.max(beforeA, beforeB);
    previousDepth.set(input.teamAId, depth);
    previousDepth.set(input.teamBId, depth);
    placements.push({ input, depth, inRange: labelForDepth(depth) !== undefined });
  }
  return placements;
}

/** Count placements per depth — a postseason in flight legitimately shows a partial histogram. */
export function histogramFromPlacements(placements: readonly ChainPlacement[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const placement of placements) {
    counts.set(placement.depth, (counts.get(placement.depth) ?? 0) + 1);
  }
  return counts;
}

/**
 * The one rendering of a depth histogram. Exported so every consumer (the
 * adapter's run report, the runner's print, the owner-run probe) renders the
 * same string rather than keeping a second copy that can diverge.
 */
export function formatHistogram(counts: ReadonlyMap<number, number>): string {
  const entries = [...counts.entries()].sort((left, right) => left[0] - right[0]);
  return `{${entries.map(([depth, count]) => `${depth}:${count}`).join(', ')}}`;
}
