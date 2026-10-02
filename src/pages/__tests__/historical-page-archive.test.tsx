// @vitest-environment jsdom
// Story 2.2 review (verification-gap layer): `/historical` is the second read
// path the migration's contract reaches, and until this file no suite rendered
// `HistoricalPage` at all — reverting its predicate to the dropped
// `.eq('status', …)` kept every gate green while blanking the archive in
// production post-00014. These tests observe the query the page actually
// builds, which the mocked supabase otherwise ignores.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  league: 'NBA',
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

  it('falls back when the winner_team join misses instead of rendering "undefined"', async () => {
    const rowWithoutWinnerJoin: Series = { ...archivedRow, winner_team: undefined };
    db.list = { data: [rowWithoutWinnerJoin], error: null };

    render(<HistoricalPage />);
    const row = await screen.findByText('1998');
    fireEvent.click(row.closest('tr') as HTMLTableRowElement);

    const sheet = screen.getByText('1998 Finals').closest('.rounded-xl') as HTMLElement;
    expect(within(sheet).getByText('Winner not available')).toBeInTheDocument();
    expect(within(sheet).queryByText('undefined')).toBeNull();
  });
});

// Story 2.9: the league chip and the league filter — one case per row of the
// spec's I/O matrix. Per AGENTS.md · Evidence discipline nothing here asserts a
// *computed accessible name*: chips, the legend and the live region are read
// through `textContent` / structural queries, because jsdom's accname
// implementation inserts separators Chrome does not (qa-matrix-1-5.md F16).
const nets: Series['team_a'] = { id: 66, full_name: 'New York Nets', abbreviation: 'NYN', created_at: 'h' };
const colonels: Series['team_b'] = { id: 77, full_name: 'Kentucky Colonels', abbreviation: 'KEN', created_at: 'i' };

/** The 1948 BAA finals row — the archive's single `BAA` series. */
const baaRow: Series = { ...archivedRow, id: 's-baa', year: 1948, round: 'BAA Finals', league: 'BAA' };
/** One of the 18 ABA rows, on teams no other fixture in this file uses. */
const abaRow: Series = {
  ...archivedRow,
  id: 's-aba',
  year: 1976,
  round: 'ABA Finals',
  league: 'ABA',
  team_a: nets,
  team_b: colonels,
  team_a_id: 66,
  team_b_id: 77,
  winner_team: nets,
  winner_team_id: 66,
};

function rowByYear(year: number): HTMLTableRowElement {
  return yearCell(year).closest('tr') as HTMLTableRowElement;
}

// Year cells only — the year `Select`'s trigger shows the same digits once a
// year is chosen, so a page-wide `getByText('1976')` would find two.
function yearCell(year: number): HTMLElement {
  const cell = Array.from(document.querySelectorAll('tbody tr td:first-child')).find((td) => td.textContent === String(year));
  if (!cell) throw new Error(`no row rendered for ${year}`);
  return cell as HTMLElement;
}

function visibleYears(): string[] {
  return Array.from(document.querySelectorAll('tbody tr td:first-child')).map((td) => td.textContent ?? '');
}

function optionByText(value: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((o) => o.textContent === value);
}

/**
 * Drives a Radix `Select` the way a pointer/keyboard user reaches it: the
 * trigger opens on click and the choice lands on the option's own click. The
 * league trigger is located by the id its visible `<label for>` points at, so
 * the labeling is exercised rather than assumed.
 */
async function chooseFrom(select: HTMLElement, value: string) {
  fireEvent.click(select);
  await waitFor(() => {
    const option = optionByText(value);
    if (!option) throw new Error(`no ${value} option rendered yet`);
    fireEvent.click(option);
  });
  await waitFor(() => {
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });
}

function chooseLeague(value: string) {
  return chooseFrom(document.getElementById('league-filter-select') as HTMLElement, value);
}

// The year `Select` is the first combobox in the filter row.
function chooseYear(value: string) {
  return chooseFrom(document.querySelectorAll<HTMLElement>('[role="combobox"]')[0], value);
}

function liveRegion(): Element | null {
  return document.querySelector('[aria-live="polite"]');
}

function renderedRows(): number {
  return document.querySelectorAll('tbody tr').length;
}

describe('HistoricalPage league chip and filter (Story 2.9)', () => {
  it('keeps every league in scope at the default, with the count announced', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    expect(renderedRows()).toBe(3);
    // Newest first, unchanged by this story: all three leagues are in scope.
    expect(visibleYears()).toEqual(['1998', '1976', '1948']);
    expect(liveRegion()?.textContent).toBe('Showing 3 of 3 series.');
  });

  it('shows the stored league verbatim on each row and never maps BAA to NBA', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    expect(within(rowByYear(1998)).getByText('NBA').textContent).toBe('NBA');
    expect(within(rowByYear(1948)).getByText('BAA').textContent).toBe('BAA');
    expect(within(rowByYear(1976)).getByText('ABA').textContent).toBe('ABA');
    // The BAA row carries no NBA anywhere: nothing folds the stored value into
    // the younger league's name.
    expect(within(rowByYear(1948)).queryByText('NBA')).toBeNull();
  });

  it('repeats the stored league in the expanded series record', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');
    fireEvent.click(yearCell(1948).closest('tr') as HTMLTableRowElement);

    const sheet = screen.getByText('1948 BAA Finals').closest('.rounded-xl') as HTMLElement;
    expect(within(sheet).getByText('BAA').textContent).toBe('BAA');
  });

  it('carries one plain-text legend line naming both BAA and ABA under the filters', async () => {
    render(<HistoricalPage />);
    const legend = await screen.findByText(/^BAA is the league that became the NBA in 1949/);

    expect(legend.textContent).toBe(
      'BAA is the league that became the NBA in 1949, so its Game 7s are NBA history. ABA is the rival league that merged into the NBA in 1976; its series are archived here, but they are not NBA records.'
    );
    // Under the filter row, not beside it: it follows the team-search control.
    const search = screen.getByPlaceholderText('Search by team name...');
    expect(legend.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('filters the archive to one league and re-announces the new result set', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    await chooseLeague('ABA');

    expect(renderedRows()).toBe(1);
    expect(visibleYears()).toEqual(['1976']);
    expect(liveRegion()?.textContent).toBe('Showing 1 of 1 series.');
  });

  it('intersects league with year and team search so none of the three overrides', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    await chooseLeague('ABA');
    await chooseYear('1976');
    fireEvent.change(screen.getByPlaceholderText('Search by team name...'), { target: { value: 'Nets' } });

    expect(renderedRows()).toBe(1);
    expect(visibleYears()).toEqual(['1976']);

    // Now the team predicate excludes the row the other two kept: an empty
    // intersection reuses the existing empty state, with no new copy. The only
    // row left in the table body is that empty row.
    fireEvent.change(screen.getByPlaceholderText('Search by team name...'), { target: { value: 'Lakers' } });
    expect(await screen.findByText('No series found matching your filters.')).toBeInTheDocument();
    expect(visibleYears()).toEqual(['No series found matching your filters.']);
  });

  it('resets the visible counter to 10 when the league changes, like the year filter', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ ...archivedRow, id: `s-${i}`, year: 1998 - i }));
    db.list = { data: [...many, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1998');

    expect(renderedRows()).toBe(10);
    fireEvent.click(screen.getByText('Load More History'));
    await waitFor(() => expect(renderedRows()).toBe(12));

    await chooseLeague('NBA');
    // 11 NBA series are in scope, but only the first page shows again.
    expect(renderedRows()).toBe(10);
    expect(screen.getByText('Load More History')).toBeInTheDocument();
  });

  it('emits the existing historical_filter_applied event with the league value', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    await chooseLeague('ABA');

    expect(db.capture.mock.calls).toEqual([['historical_filter_applied', { filter_type: 'league', league: 'ABA' }]]);
  });

  it('clears the league filter with the reset button, and hides it again', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    await chooseLeague('BAA');
    expect(renderedRows()).toBe(1);

    const reset = document.querySelector('svg.lucide-funnel-x')?.closest('button');
    // `toBeInstanceOf` fails on `undefined` too, which `not.toBeNull()` does not.
    expect(reset).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(reset as HTMLButtonElement);

    await waitFor(() => expect(renderedRows()).toBe(3));
    // The button's own visibility condition gained the league filter too.
    expect(document.querySelector('svg.lucide-funnel-x')).toBeNull();
    expect(liveRegion()?.textContent).toBe('Showing 3 of 3 series.');
  });
});
