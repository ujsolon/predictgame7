// @vitest-environment jsdom
// Story 2.5, owner decision U4 (wording U12): the /insights sample-set
// footer. Two proofs, both on rendered textContent — AGENTS.md's accname
// rule forbids asserting a computed accessible name in jsdom, and the whole
// point of U4 is that the sentence moves with the cached number rather than
// being a literal. The db mock follows the pattern
// `historical-page-archive.test.tsx` already uses: `// @vitest-environment
// jsdom` + a `vi.hoisted` mock of `@/db/supabase`.
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import InsightsPage from '@/pages/InsightsPage';
import { sampleSetSentence } from '@/lib/insights';

const db = vi.hoisted(() => ({
  rows: [] as { insight_key: string; insight_value: unknown }[],
  error: null as unknown,
  from: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/db/supabase', () => ({
  supabase: {
    from: db.from,
  },
}));

vi.mock('sonner', () => ({ toast: db.toast }));

/**
 * The three cache rows exactly as the 00017 refresh writes them, over a
 * population of `total`. The two `win_rate`s are DERIVED from it, never pinned:
 * the RPC's `CASE WHEN v_total = 0 THEN 0` branch writes `0` into every numeric
 * member, so a pinned 37.11 / 73.13 would hand the page a state the writer can
 * never produce — the U13 zero-population case most of all. Rounding matches the
 * RPC's `round(..., 2)`.
 */
function cacheRows(total: number, homeWins = Math.round(total * 0.731)) {
  const g6Wins = Math.round(total * 0.371);
  const rate = (wins: number) => (total === 0 ? 0 : Number(((wins * 100) / total).toFixed(2)));
  return [
    {
      insight_key: 'game_6_winner_stats',
      insight_value: { total_game_sevens: total, game_6_winners_won: g6Wins, win_rate: rate(g6Wins) },
    },
    {
      insight_key: 'home_team_stats',
      insight_value: { total_game_sevens: total, home_team_wins: homeWins, win_rate: rate(homeWins) },
    },
    {
      insight_key: 'avg_point_differential',
      insight_value: { average: 9.54, median: 8.0, max: 40, min: 1 },
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  db.error = null;
  db.rows = cacheRows(159);
  db.from.mockImplementation(() => ({
    select: () => Promise.resolve({ data: db.rows, error: db.error }),
  }));
});

describe('InsightsPage sample-set footer (U4/U12)', () => {
  it('renders the U12 sentence verbatim, reading the cached total_game_sevens', async () => {
    const { container } = render(<InsightsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain(
        'These patterns count the 159 Game 7s played in the NBA and its predecessor league, the BAA.',
      );
    });
  });

  it('the sentence moves with the cache — a different fixture value prints a different number (proof it is no literal)', async () => {
    db.rows = cacheRows(42);
    const { container } = render(<InsightsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain(
        'These patterns count the 42 Game 7s played in the NBA and its predecessor league, the BAA.',
      );
    });
    expect(container.textContent).not.toContain('count the 159');
  });

  it('the footer sits in the page wrapper as a single static line at text-on-muted, with no control attached', async () => {
    const { container } = render(<InsightsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain('These patterns count the 159');
    });
    const paragraphs = Array.from(container.querySelectorAll('p.text-on-muted'));
    expect(paragraphs).toHaveLength(1);
    const footer = paragraphs[0];
    expect(footer.className).toContain('text-sm');
    expect(footer.textContent).toBe(sampleSetSentence(159));
    // Not a button, not a link, not interactive of any shape (U4: no control,
    // no popover, and addendum §A.1's ten event names stand untouched).
    expect(footer.querySelector('button, a, [role="button"], [tabindex]')).toBeNull();
    // Last node inside the page wrapper — "at the foot of the page" as stated.
    const wrapper = footer.parentElement as HTMLElement;
    expect(wrapper.lastElementChild).toBe(footer);
  });

  it('a zero population prints the honest "0 Game 7s" sentence (U13: accepted, not guarded)', async () => {
    db.rows = cacheRows(0, 0);
    const { container } = render(<InsightsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain('These patterns count the 0 Game 7s played in the NBA');
    });
  });

  it('the page reads only insights_cache through the shared client — no rpc call, no second source (AD-8, verify-not-implement)', async () => {
    const { container } = render(<InsightsPage />);
    await waitFor(() => {
      expect(container.textContent).toContain('These patterns count the 159');
    });
    expect(db.from).toHaveBeenCalledWith('insights_cache');
    const tables = db.from.mock.calls.map((call) => call[0]);
    expect(tables.every((table) => table === 'insights_cache')).toBe(true);
  });
});

describe('sampleSetSentence (src/lib/insights.ts)', () => {
  it('is a pure string of exactly one sentence with only the passed number in it', () => {
    expect(sampleSetSentence(160)).toBe('These patterns count the 160 Game 7s played in the NBA and its predecessor league, the BAA.');
    expect(sampleSetSentence(0)).toMatch(/^These patterns count the 0 /);
  });
});
