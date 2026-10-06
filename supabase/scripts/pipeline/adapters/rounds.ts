/**
 * Story 2.4, Decision 10 — the frozen `round` vocabulary.
 *
 * Depths 1..4 map to the four canonical labels below — round-only, no
 * conference prefix, so no 30-team conference map enters the repo (owner call
 * 2026-10-01: 1A). The `espn` adapter reads a depth from each game's headline
 * and writes only these labels (Story 2.13), so no new `round` spelling can
 * reach the table.
 *
 * [2026-10-06, Story 2.16: this file also held the chain-depth walk —
 * `walkChainDepth`, `histogramFromPlacements` and their types — which derived a
 * depth from the games themselves for Story 2.4's stats.nba.com adapter. That
 * adapter was the walk's only consumer, so the walk retired with it; the
 * coverage and unused-export evidence is in `spec-2-16-nba-com-retirement.md`.]
 *
 * `getRoundImportance` (`src/lib/nba-utils.ts`) stays untouched and
 * substring-tolerant: these four labels score 1/2/3/4 in it (pinned by
 * `src/lib/__tests__/nba-utils.test.ts`) — careful reading that function, since
 * its *branch* order is 2/3/4/1, with the semifinal test first because
 * "Semifinals" contains "finals" (the Story 1.4 issue #3 fix). The 17 era
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

/**
 * The one rendering of a depth histogram. Exported so every consumer renders
 * the same string rather than keeping a second copy that can diverge (today
 * the `espn` adapter's run report, which the runner prints).
 */
export function formatHistogram(counts: ReadonlyMap<number, number>): string {
  const entries = [...counts.entries()].sort((left, right) => left[0] - right[0]);
  return `{${entries.map(([depth, count]) => `${depth}:${count}`).join(', ')}}`;
}
