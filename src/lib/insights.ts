/**
 * Story 2.5 — the `/insights` sample-set sentence (owner decision U4,
 * 2026-10-02; wording settled by U12, 2026-10-03).
 *
 * One static line at the foot of the page naming the population the three
 * cached cards count, so the reader who meets 179 on the archive and 160 on
 * the insights can reconcile the two. Lives in a module rather than inline in
 * JSX for the same reason `series-phase.ts` and `method-display.ts` do: a
 * pure function is testable without the page, and the page keeps doing no
 * arithmetic (AD-8 — reading a cached field and formatting a sentence is not
 * computation of a metric).
 *
 * The count is the cached `total_game_sevens` the 00017 refresh writes —
 * never a literal — so the sentence cannot drift from the denominators above
 * it. The set is named by league rule (NBA and BAA Game 7s) rather than by
 * counting what was excluded, for the same reason. U13: a zero population
 * renders "count the 0 Game 7s" honestly — that is the truthful description
 * of an empty archive, not a defect to guard.
 */

/**
 * The footer sentence, verbatim per U12. No other number may appear in it.
 */
export function sampleSetSentence(totalGameSevens: number): string {
  return `These patterns count the ${totalGameSevens} Game 7s played in the NBA and its predecessor league, the BAA.`;
}
