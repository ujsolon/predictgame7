/**
 * Story 2.4, Decision 10 — the `nba_com` adapter's round vocabulary and the
 * chain-depth derivation that fills it.
 *
 * No working unkeyed endpoint returns a playoff round *name* (the bracket
 * feed is retired — the spike's one unmet AC), so the label is computed from
 * the games themselves: walk the postseason in date order, and a series'
 * depth is one more than the deeper of its two teams' previous series this
 * postseason. Depths 1–4 map to the four canonical labels below — round-only,
 * no conference prefix, so no 30-team conference map enters the repo
 * (`teams` has no conference column; the 2.7 MB CDN blob stays unused).
 *
 * The four labels must land in `getRoundImportance`'s (src/lib/nba-utils.ts)
 * 1/2/3/4 branches respectively: 'First Round' → 1, 'Conference Semifinals'
 * → 2 (the 'semifinals' branch runs first), 'Conference Finals' → 3
 * ('conf' && 'finals'), 'NBA Finals' → 4 (bare 'finals'). That mapping is
 * pinned by tests.
 *
 * This list is frozen: it is display vocabulary, outside the identity key
 * (Story 2.2), and the adapter never rewrites an archived `round` spelling —
 * the 17 era values in the archive stay as written.
 */

/** Canonical label per chain depth 1..4. A depth outside this range has no label. */
export const ROUND_LABELS_BY_DEPTH: readonly string[] = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];

/** One postseason series as the chain walk sees it: its two teams and its start date. */
export interface ChainSeries {
  /** Stable identifier for the series (the adapter uses its grouping key). */
  key: string;
  /** The two `teams.id` values, in feed order — the walk does not care which is which. */
  teamIds: readonly [number, number];
  /** Calendar date (YYYY-MM-DD) of the series' first game; the walk order. */
  startDate: string;
}

/**
 * Derive each series' chain depth by walking the postseason in date order.
 * Depth = 1 + the deeper of the two teams' previous depths (0 for a team with
 * no previous series), so in a well-formed 16-team bracket the histogram is
 * {1:8, 2:4, 3:2, 4:1}; a postseason in flight yields a partial one.
 *
 * A feed a bracket cannot explain (a team in two series at the same round,
 * more rounds than the bracket holds) surfaces as a depth outside 1..4; the
 * caller excludes those series and names them — a wrong `round` label must
 * not pass silently. The tie-break on `key` keeps the walk deterministic for
 * series starting on the same date.
 */
export function deriveChainDepths(series: readonly ChainSeries[]): Map<string, number> {
  const depthByTeam = new Map<number, number>();
  const depths = new Map<string, number>();
  const ordered = [...series].sort(
    (left, right) => left.startDate.localeCompare(right.startDate) || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
  );
  for (const entry of ordered) {
    const [first, second] = entry.teamIds;
    const previousDepth = Math.max(depthByTeam.get(first) ?? 0, depthByTeam.get(second) ?? 0);
    const depth = previousDepth + 1;
    depths.set(entry.key, depth);
    depthByTeam.set(first, Math.max(depthByTeam.get(first) ?? 0, depth));
    depthByTeam.set(second, Math.max(depthByTeam.get(second) ?? 0, depth));
  }
  return depths;
}

/** The canonical label for a derived depth, or undefined when the depth is outside 1..4. */
export function roundLabelForDepth(depth: number): string | undefined {
  return ROUND_LABELS_BY_DEPTH[depth - 1];
}
