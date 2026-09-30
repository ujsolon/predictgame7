// @vitest-environment jsdom
// Story 2.2 review (verification-gap layer): `/historical` is the second read
// path the migration's contract reaches, and until this file no suite rendered
// `HistoricalPage` at all — reverting its predicate to the dropped
// `.eq('status', …)` kept every gate green while blanking the archive in
// production post-00014. These tests observe the query the page actually
// builds, which the mocked supabase otherwise ignores.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import HistoricalPage from '@/pages/HistoricalPage';
import type { Series } from '@/types/types';

const db = vi.hoisted(() => ({
  list: { data: [] as unknown, error: null as unknown },
  projection: '' as string,
  filter: [] as unknown[],
  from: vi.fn(),
  capture: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/db/supabase', () => ({
  supabase: {
    from: db.from,
  },
}));

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: db.capture, captureException: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: db.toast }));

const lakers: Series['team_a'] = { id: 33, full_name: 'Los Angeles Lakers', abbreviation: 'LAL', created_at: 'e' };
const warriors: Series['team_b'] = { id: 44, full_name: 'Golden State Warriors', abbreviation: 'GSW', created_at: 'f' };

const archivedRow: Series = {
  id: 's-archive',
  year: 1998,
  round: 'Finals',
  team_a_id: 33,
  team_b_id: 44,
  winner_team_id: 33,
  created_at: 'g',
  team_a: lakers,
  team_b: warriors,
  winner_team: lakers,
  series_game_scores: [1, 2, 3, 4, 5, 6, 7].map((game_number) => ({
    id: `g${game_number}`,
    series_id: 's-archive',
    game_number,
    home_team_id: game_number % 2 === 0 ? 44 : 33,
    away_team_id: game_number % 2 === 0 ? 33 : 44,
    home_score: 100 + game_number,
    away_score: 90 + game_number,
    created_at: '2026-01-01T00:00:00Z',
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.projection = '';
  db.filter = [];
  db.list = { data: [archivedRow], error: null };
  db.from.mockImplementation(() => ({
    select: (projection: string) => {
      db.projection = projection;
      return {
        not: (column: string, operator: string, value: unknown) => {
          db.filter = [column, operator, value];
          return Promise.resolve(db.list);
        },
      };
    },
  }));
});

describe('HistoricalPage archive read (Story 2.2)', () => {
  it('selects the archive by the derived winner, not by a stored status', async () => {
    render(<HistoricalPage />);
    expect(await screen.findByText('1998')).toBeInTheDocument();

    expect(db.filter).toEqual(['winner_team_id', 'is', null]);
    expect(db.projection).not.toMatch(/\bstatus\b/);
  });

  it('opens a row with its winner and no stored-status readout', async () => {
    render(<HistoricalPage />);
    const row = await screen.findByText('1998');
    fireEvent.click(row.closest('tr') as HTMLTableRowElement);

    const sheet = screen.getByText('1998 Finals').closest('.rounded-xl') as HTMLElement;
    expect(within(sheet).getByText('Series Winner')).toBeInTheDocument();
    expect(within(sheet).getByText('Los Angeles Lakers')).toBeInTheDocument();
    // Story 2.2 deletes the "Series Status" line rather than deriving it: under
    // this predicate every openable row carries the same word.
    expect(within(sheet).queryByText('Series Status')).toBeNull();
    expect(within(sheet).queryByText('TBD')).toBeNull();
  });
});
