/**
 * Spoiler-neutral team order (owner decision 2026-10-07, option A).
 *
 * Archived rows store the eventual winner as `team_a` in 177 of 178 series
 * (AGENTS.md), so "team_a first" quietly names the Game 7 winner on any
 * surface that must not reveal it. Every winner-free surface — the series
 * preview (Story 4.3) and the OG card (Story 4.2) — orders the two teams by
 * this rule instead: alphabetically by the short team word (nickname, else
 * full name), with full name and then id as tie-breakers so the order is
 * total and stable.
 */
export interface OrderableTeam {
  id: number | string;
  full_name: string;
  nickname?: string | null;
}

function word(team: OrderableTeam): string {
  return team.nickname?.trim() || team.full_name;
}

/** True when `b` should be shown before `a` on a winner-free surface. */
export function shouldSwapForNeutralOrder(a: OrderableTeam, b: OrderableTeam): boolean {
  const byWord = word(a).localeCompare(word(b), 'en', { sensitivity: 'base' });
  if (byWord !== 0) return byWord > 0;
  const byName = a.full_name.localeCompare(b.full_name, 'en', { sensitivity: 'base' });
  if (byName !== 0) return byName > 0;
  return String(a.id) > String(b.id);
}

/** The two teams in spoiler-neutral order. */
export function neutralPair<T extends OrderableTeam>(a: T, b: T): [T, T] {
  return shouldSwapForNeutralOrder(a, b) ? [b, a] : [a, b];
}
