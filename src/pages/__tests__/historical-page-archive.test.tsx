// @vitest-environment jsdom
// Story 2.2 review (verification-gap layer): `/historical` is the second read
// path the migration's contract reaches, and until this file no suite rendered
// `HistoricalPage` at all — reverting its predicate to the dropped
// `.eq('status', …)` kept every gate green while blanking the archive in
// production post-00014. These tests observe the query the page actually
// builds, which the mocked supabase otherwise ignores.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTeamAbbreviation } from '@/lib/nba-utils';
import HistoricalPage from '@/pages/HistoricalPage';
import type { Series, Team } from '@/types/types';
import { parseTeamsSeed } from '../../../supabase/scripts/pipeline/venueBackfill.ts';

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

// jsdom defines no `scrollIntoView`, and Radix's `Select` calls it while
// highlighting the selected option, so every case that opens the year list
// would otherwise crash inside a passive effect. The stub is a spy on purpose:
// the "nothing on this surface moves the page" case asserts it was not called,
// rather than relying on the method being absent.
const scrollIntoView = vi.fn(() => {});
Element.prototype.scrollIntoView = scrollIntoView;

const lakers: Team = { id: 33, full_name: 'Los Angeles Lakers', abbreviation: 'LAL', created_at: 'e' };
const warriors: Team = { id: 44, full_name: 'Golden State Warriors', abbreviation: 'GSW', created_at: 'f' };

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

// Story 2.9 put a league chip on every row, a per-league `Select` in the filter
// row and a legend line under it. Story 2.10 re-cut all three on the owner's
// call, and the owner re-cut 2.10's carrier the same day after reviewing it in
// preview: the chip renders only where it carries information — `NBA` is gated
// out at the call site so those rows build no chip at all — the league control is
// deleted outright (FR-10's filters stay year and team), and the gloss is static
// text inside the record of a series that carries a chip, with no trigger
// anywhere on the filter row. The cases below are one per row of that spec's I/O
// matrix. Per AGENTS.md · Evidence discipline nothing here asserts a *computed
// accessible name*: chips, the gloss and the live region are read through
// `textContent` or literal attributes, because jsdom's accname implementation
// inserts separators Chrome does not (qa-matrix-1-5.md §5 note 4, finding F16).
const nets: Team = { id: 66, full_name: 'New York Nets', abbreviation: 'NYN', created_at: 'h' };
const colonels: Team = { id: 77, full_name: 'Kentucky Colonels', abbreviation: 'KEN', created_at: 'i' };

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

/** The sentence Story 2.9 D2 ratified; 2.10 moved it into a chipped record. */
const GLOSS =
  'BAA is the league that became the NBA in 1949, so its Game 7s are NBA history. ABA is the rival league that merged into the NBA in 1976; its series are archived here, but they are not NBA records.';

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
 * trigger opens on click and the choice lands on the option's own click.
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

function chooseYear(value: string) {
  return chooseFrom(document.querySelectorAll<HTMLElement>('[role="combobox"]')[0], value);
}

/** The ratified gloss sentence, located as a rendered paragraph — never by a
 *  computed name, and never by opening something. */
function gloss(): HTMLElement | null {
  return Array.from(document.querySelectorAll('p')).find((p) => p.textContent === GLOSS) ?? null;
}

/** Opens a series record the way a pointer user does: click the row. */
async function openRecord(year: number, title: string): Promise<HTMLElement> {
  fireEvent.click(rowByYear(year));
  const heading = await screen.findByText(title);
  const sheet = heading.closest('.rounded-xl');
  if (!sheet) throw new Error(`no record sheet rendered for ${title}`);
  return sheet as HTMLElement;
}

function liveRegion(): Element | null {
  return document.querySelector('[aria-live="polite"]');
}

function renderedRows(): number {
  return document.querySelectorAll('tbody tr').length;
}

function chipCount(container: HTMLElement): number {
  return Array.from(container.querySelectorAll('span')).filter((s) => ['NBA', 'BAA', 'ABA'].includes(s.textContent ?? '')).length;
}

/**
 * The select string split on its top-level columns only, so a nested wildcard
 * (`team_a:team_a_id(*)`) cannot masquerade as the whole-row one. PostgREST
 * nests inside parentheses, so depth tracking is enough.
 */
function topLevelColumns(select: string): string[] {
  const cols: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of select) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      cols.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cols.push(current.trim());
  return cols;
}

function resetButton(): HTMLButtonElement | undefined {
  // `FilterX` renders through lucide's `createLucideIcon("funnel-x")`, so the
  // class on its svg is `lucide-funnel-x` — verified against
  // node_modules/lucide-react/dist/esm/icons/funnel-x.js, not guessed.
  return document.querySelector('svg.lucide-funnel-x')?.closest('button') ?? undefined;
}

describe('HistoricalPage conditional league chip (Story 2.9 D1, re-cut by 2.10 D1\')', () => {
  it('renders no chip on the NBA row, in the list or in its record', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    expect(chipCount(rowByYear(1998))).toBe(0);
    // AC 1's second half: dropping the chip does not drop or add a column.
    expect(document.querySelectorAll('thead th')).toHaveLength(3);
    const sheet = await openRecord(1998, '1998 Finals');
    expect(chipCount(sheet)).toBe(0);
    // The NBA record carries no gloss either — it is the chipped rows that need
    // the sentence, and `showsLeagueChip` is the one rule behind both. That the
    // guard sits in front of the element rather than inside `LeagueChip` (the
    // owner's 2026-10-02 call, so 159 rows spend no render pass on it) is a
    // source-level fact: a tree with no chip looks identical either way.
    expect(gloss()).toBeNull();
  });

  it('shows the stored league verbatim where a chip does render, and never maps BAA to NBA', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    expect(within(rowByYear(1948)).getByText('BAA').textContent).toBe('BAA');
    // The BAA row carries no NBA anywhere: nothing folds the stored value into
    // the younger league's name.
    expect(within(rowByYear(1948)).queryByText('NBA')).toBeNull();
  });

  it('repeats the stored league in the expanded series record', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    const sheet = await openRecord(1948, '1948 BAA Finals');
    expect(within(sheet).getByText('BAA').textContent).toBe('BAA');
  });

  it('keeps an unrecognized league visible rather than silencing it', async () => {
    // Whatever the CHECK domain holds, a row the chip logic does not know must
    // still show what it says instead of rendering as an unexplained NBA row.
    db.list = { data: [{ ...archivedRow, league: 'NBL' }], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1998');

    expect(within(rowByYear(1998)).getByText('NBL').textContent).toBe('NBL');
  });

  it('reads `league` on the archive projection, not only on the predict one', async () => {
    render(<HistoricalPage />);
    await screen.findByText('1998');

    // The chip reads `series.league`, and this page receives it through the
    // whole-row wildcard. The mock hands back the fixtures whatever the
    // projection says, so an enumerated rewrite that dropped `league` would keep
    // every other case green while blanking the chip in production — the exact
    // failure shape this file's header comment records for Story 2.2. Pin the
    // wire at the only depth where it means something: a bare top-level `*`, or
    // an explicit `league`. (`/(\*|\bleague\b)/` was the first attempt here and
    // was vacuous — every plausible projection carries nested `(*)` selects, so
    // it could not fail.)
    const cols = topLevelColumns(db.projection);
    expect(cols.includes('*') || cols.includes('league')).toBe(true);
  });
});

describe('HistoricalPage with no league control (Story 2.10 D3\', supersedes 2.9 D3)', () => {
  it('lists every league by default, chips and all, with the count announced', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    // The 18 ABA rows stay in the archive and in the SEO set (AD-7); the chip is
    // what marks them, not a filter that hides them.
    expect(renderedRows()).toBe(3);
    expect(visibleYears()).toEqual(['1998', '1976', '1948']);
    expect(within(rowByYear(1976)).getByText('ABA').textContent).toBe('ABA');
    expect(liveRegion()?.textContent).toBe('Showing 3 of 3 series.');
    expect(resetButton()).toBeUndefined();
  });

  it('offers the year `Select` as the only dropdown in the filter row', async () => {
    db.list = { data: [archivedRow, baaRow, { ...abaRow, id: 's-aba-72', year: 1972 }], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    expect(document.querySelectorAll('[role="combobox"]')).toHaveLength(1);
    // 2.9's control is gone. The `'Archive scope'` assertion that sat here was
    // dropped on the 2026-10-02 dead-code pass: the scope toggle it named was
    // built, measured and then removed before it was ever committed, so no edit
    // to this tree could resurrect it and the case could not fail.
    expect(document.body.textContent).not.toContain('Filter League');
    expect(document.body.textContent).not.toContain('All leagues');
    // And the year list is back to the whole archive: 1972 exists here only as
    // an ABA series, and nothing scopes it out any more.
    const yearSelect = document.querySelectorAll<HTMLElement>('[role="combobox"]')[0];
    fireEvent.click(yearSelect);
    await waitFor(() => expect(optionByText('1998')).toBeTruthy());
    expect(optionByText('1972')?.textContent).toBe('1972');
    fireEvent.click(optionByText('All Years') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeNull());
  });

  it('never emits a league filter event, since nothing filters by league', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    await chooseYear('1976');
    fireEvent.change(screen.getByPlaceholderText('Search by team name or code...'), { target: { value: 'Nets' } });
    fireEvent.click(rowByYear(1976));

    // The whole capture log for the surface, including the row expansion: two
    // filter events and §A.1's existing `historical_series_expanded`. Because the
    // array is pinned exactly, no name outside addendum §A.1's ten can appear
    // without failing this case, and a `filter_type: 'league'` cannot either. The
    // gloss is not clicked here because there is nothing to click: it is static
    // text, and an explanation was never a filter application (2.10 D4').
    expect(db.capture.mock.calls).toEqual([
      ['historical_filter_applied', { filter_type: 'year', year: '1976' }],
      ['historical_filter_applied', { filter_type: 'team_search' }],
      [
        'historical_series_expanded',
        {
          series_id: 's-aba',
          series_year: 1976,
          series_round: 'ABA Finals',
          team_a: 'New York Nets',
          team_b: 'Kentucky Colonels',
          winner: 'New York Nets',
        },
      ],
    ]);
  });

  it('intersects year with team search, and an empty intersection reuses the existing empty state', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    await chooseYear('1976');
    fireEvent.change(screen.getByPlaceholderText('Search by team name or code...'), { target: { value: 'Nets' } });
    expect(renderedRows()).toBe(1);
    expect(visibleYears()).toEqual(['1976']);

    // Now the team predicate excludes the row the year kept: FR-10's combined
    // rule, with the copy that already existed and no new empty state.
    fireEvent.change(screen.getByPlaceholderText('Search by team name or code...'), { target: { value: 'Lakers' } });
    expect(await screen.findByText('No series found matching your filters.')).toBeInTheDocument();
    expect(liveRegion()?.textContent).toBe('Showing 0 of 0 series.');
  });

  it('clears both filters with the reset button and hides it again', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    await chooseYear('1976');
    expect(renderedRows()).toBe(1);

    const reset = resetButton();
    // `toBeInstanceOf` fails on `undefined` too, which `not.toBeNull()` does not.
    expect(reset).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(reset as HTMLButtonElement);

    await waitFor(() => expect(renderedRows()).toBe(3));
    expect(document.querySelector('svg.lucide-funnel-x')).toBeNull();
    expect(liveRegion()?.textContent).toBe('Showing 3 of 3 series.');
  });

  it('shows the reset button for a team search alone and clears the search with it', async () => {
    // The other half of the reset button's render condition in `HistoricalPage.tsx`
    // (`yearFilter !== 'all' || teamSearch !== ''`). The case above reaches the
    // button through the year disjunct only, so without this one, deleting the
    // `teamSearch` disjunct keeps every other case green while a fan who only
    // typed a team name loses the page's sole clear control. Filed by the
    // external review's verification-gap layer (2026-10-04) as the diff's one
    // unpinned leg; mutation-proven there — this case reddens without the disjunct.
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    fireEvent.change(screen.getByPlaceholderText('Search by team name or code...'), { target: { value: 'Nets' } });
    expect(renderedRows()).toBe(1);

    const reset = resetButton();
    expect(reset).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(reset as HTMLButtonElement);

    await waitFor(() => expect(renderedRows()).toBe(3));
    expect((screen.getByPlaceholderText('Search by team name or code...') as HTMLInputElement).value).toBe('');
    expect(document.querySelector('svg.lucide-funnel-x')).toBeNull();
    expect(liveRegion()?.textContent).toBe('Showing 3 of 3 series.');
  });

  it('resets the visible counter to 10 when the year filter changes, as it always did', async () => {
    // 15 in 1998 and 10 in 1997: paging out to 20 rows and then filtering to the
    // 15-row year has to land on a 10-row page again, which is only true if the
    // counter reset rather than staying at 20.
    db.list = {
      data: [
        ...Array.from({ length: 15 }, (_, i) => ({ ...archivedRow, id: `a-${i}`, year: 1998 })),
        ...Array.from({ length: 10 }, (_, i) => ({ ...archivedRow, id: `b-${i}`, year: 1997 })),
      ],
      error: null,
    };
    render(<HistoricalPage />);
    // Not `findByText('1998')` — fifteen rows carry that year, and a text query
    // that matches more than one element throws.
    await waitFor(() => expect(renderedRows()).toBe(10));

    fireEvent.click(screen.getByText('Load More History'));
    await waitFor(() => expect(renderedRows()).toBe(20));

    await chooseYear('1998');
    expect(renderedRows()).toBe(10);
    expect(screen.getByText('Load More History')).toBeInTheDocument();
  });

  it('resets the visible counter to 10 when the team search changes, on the same terms', async () => {
    // The counter reset lives in two call sites (the search input's `onChange`
    // in `HistoricalPage.tsx` as well as the year one), and only the year path was covered
    // above. 15 Lakers rows and 10 Nets rows: page out to 20, then search for
    // `Lakers`, and a 15-row page proves the counter stayed at 20.
    db.list = {
      data: [
        ...Array.from({ length: 15 }, (_, i) => ({ ...archivedRow, id: `l-${i}` })),
        ...Array.from({ length: 10 }, (_, i) => ({ ...abaRow, id: `n-${i}` })),
      ],
      error: null,
    };
    render(<HistoricalPage />);
    await waitFor(() => expect(renderedRows()).toBe(10));

    fireEvent.click(screen.getByText('Load More History'));
    await waitFor(() => expect(renderedRows()).toBe(20));

    fireEvent.change(screen.getByPlaceholderText('Search by team name or code...'), { target: { value: 'Lakers' } });
    await waitFor(() => expect(liveRegion()?.textContent).toBe('Showing 10 of 15 series.'));
    expect(renderedRows()).toBe(10);
    expect(screen.getByText('Load More History')).toBeInTheDocument();
  });
});
describe('HistoricalPage gloss inside a chipped record (Story 2.10 D2\', revised by the owner the same day)', () => {
  it('keeps the sentence off the surface until a chipped record is open', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    // Neither carrier that existed earlier survives: not 2.9's always-visible
    // legend line, and not 2.10's first replacement for it — a `Leagues` trigger
    // button in the filter row, which the owner judged too prominent for an
    // audience here for the modern game. A named `dialog` is what that trigger
    // opened, so pinning its absence pins the deletion.
    expect(document.body.textContent).not.toContain('BAA is the league');
    expect(Array.from(document.querySelectorAll('button')).some((b) => b.textContent === 'Leagues')).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('glosses the record of a BAA row, verbatim, inside that sheet', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    const sheet = await openRecord(1948, '1948 BAA Finals');
    const paragraph = gloss();
    expect(paragraph).toBeInstanceOf(HTMLParagraphElement);
    expect(sheet.contains(paragraph)).toBe(true);
    // Verbatim means Story 2.9 (D2)'s ratified wording, not a paraphrase of it.
    expect(paragraph?.textContent).toBe(GLOSS);
    // It sits *below* the winner readout, not in the header: on the 390px pass the
    // header placement wrapped the sentence to six lines beside the logo stack and
    // floated the close button into the middle of it, so the owner moved it to the
    // foot of the card. Pin the order, since nothing else would notice a move back.
    const winnerLabel = Array.from(sheet.querySelectorAll('p')).find((el) => el.textContent === 'Series Winner');
    expect(winnerLabel).toBeInstanceOf(HTMLParagraphElement);
    expect(winnerLabel!.compareDocumentPosition(paragraph!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // Static text in an already-open sheet: no popup anywhere on the page.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('glosses an ABA record on the same rule, beside its chip', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    const sheet = await openRecord(1976, '1976 ABA Finals');
    expect(within(sheet).getByText('ABA').textContent).toBe('ABA');
    expect(gloss()).toBeInstanceOf(HTMLParagraphElement);
  });

  it('does not gloss an unchipped record', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    await openRecord(1998, '1998 Finals');
    // The 159 `NBA` rows are the archive's own default; the sentence explaining
    // the two exceptions has no reason to appear on them.
    expect(gloss()).toBeNull();
  });

  it('explains without scoping: opening a chipped record changes no row and no count', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    await openRecord(1948, '1948 BAA Finals');
    expect(gloss()).toBeInstanceOf(HTMLParagraphElement);

    expect(renderedRows()).toBe(3);
    expect(liveRegion()?.textContent).toBe('Showing 3 of 3 series.');
  });

  it('puts every piece of text it adds on the AA-safe token', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');
    await openRecord(1948, '1948 BAA Finals');

    // Computed contrast is only reachable over CDP (the spec's record carries the
    // measurement); jsdom can pin the token, which is what a later edit can drift.
    const chip = within(rowByYear(1948)).getByText('BAA');
    const abaChip = within(rowByYear(1976)).getByText('ABA');
    const paragraph = gloss() as HTMLElement;

    for (const el of [chip, abaChip, paragraph]) {
      expect(el.classList.contains('text-on-muted')).toBe(true);
      expect(el.className).not.toContain('text-muted-foreground');
    }
  });

  it('adds the gloss without moving the page', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const scroll = vi.spyOn(window, 'scroll').mockImplementation(() => {});
    render(<HistoricalPage />);
    await screen.findByText('1948');

    await openRecord(1948, '1948 BAA Finals');

    // The owner's established behavior for this app is that selecting something
    // never scrolls, so it is pinned rather than promised. `scrollIntoView` is a
    // spy (see the polyfill note above), so an attempt shows up here instead of
    // throwing.
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    scrollTo.mockRestore();
    scroll.mockRestore();
  });

  it('moves the page for no filter interaction either', async () => {
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const scroll = vi.spyOn(window, 'scroll').mockImplementation(() => {});
    render(<HistoricalPage />);
    await screen.findByText('1948');

    await chooseYear('1976');
    fireEvent.change(screen.getByPlaceholderText('Search by team name or code...'), { target: { value: 'Nets' } });
    fireEvent.click(resetButton() as HTMLButtonElement);
    fireEvent.click(rowByYear(1998));

    // `scrollIntoView` is deliberately not asserted here: opening the year
    // `Select` makes Radix scroll its own highlighted option inside the popup,
    // which is the listbox moving, not the page. The two window methods are what
    // a page scroll would go through.
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
    scrollTo.mockRestore();
    scroll.mockRestore();
  });

  it('keeps the live region out of the list section\'s first-child slot', async () => {
    render(<HistoricalPage />);
    await screen.findByText('1998');

    // `space-y-8` gives every non-first child a 32px top margin, so a first-child
    // live region pushed the table down by a margin the ratified surface never
    // had. Measured over CDP as marginTop 32px, then 0px once the region moved.
    const region = liveRegion() as HTMLElement;
    const section = region.parentElement as HTMLElement;
    expect(section.firstElementChild).not.toBe(region);
    expect(section.firstElementChild?.className).toContain('overflow-x-auto');
  });
});

// Story 2.11 — one team code everywhere on `/historical`.
//
// The 20 franchise pairs below are the divergences measured 2026-10-04 over the
// committed `00005` + `00007` seeds and the archive CSV (recorded at
// `spec-2-11:20`; the throwaway script that read them is deliberately not
// committed, which is why the case below re-derives the third column from the
// live `getTeamAbbreviation` instead of trusting this table): the code a row
// printed came from the `TEAM_ABBREVIATIONS` map or `getTeamAbbreviation`, and on
// these 20 identities it differed from the stored `teams.abbreviation` — 39 of the
// 178 series, 47 team cells, years 1948→1997, every one a `00007` historical
// identity. `initialism` is what the surviving name path still derives from the
// name, so the third column is what this surface used to print; the pairs are
// pinned against it rather than against the deleted map, because a pin that only
// restates the implementation would stay green if the name path itself changed.
const DIVERGENT_FRANCHISES: Array<{ name: string; stored: string; initialism: string }> = [
  { name: 'Philadelphia Warriors', stored: 'PHW', initialism: 'PW' },
  { name: 'Rochester Royals', stored: 'ROR', initialism: 'RR' },
  { name: 'Minneapolis Lakers', stored: 'MPL', initialism: 'ML' },
  { name: 'Syracuse Nationals', stored: 'SYR', initialism: 'SN' },
  { name: 'Cincinnati Royals', stored: 'CNR', initialism: 'CR' },
  { name: 'Kentucky Colonels', stored: 'KEN', initialism: 'KC' },
  { name: 'Miami Floridians', stored: 'MFL', initialism: 'MF' },
  { name: 'Minnesota Pipers', stored: 'MNP', initialism: 'MP' },
  { name: 'Dallas Chaparrals', stored: 'DCH', initialism: 'DC' },
  { name: 'Oakland Oaks', stored: 'OAK', initialism: 'OO' },
  { name: 'Denver Rockets', stored: 'DNR', initialism: 'DR' },
  { name: 'Washington Capitols', stored: 'WSC', initialism: 'WC' },
  { name: 'Baltimore Bullets', stored: 'BLB', initialism: 'BB' },
  { name: 'Utah Stars', stored: 'UTS', initialism: 'US' },
  { name: 'Virginia Squires', stored: 'VAS', initialism: 'VS' },
  { name: 'Carolina Cougars', stored: 'CAC', initialism: 'CC' },
  { name: 'Capital Bullets', stored: 'CPB', initialism: 'CB' },
  { name: 'Washington Bullets', stored: 'WSB', initialism: 'WB' },
  { name: 'Buffalo Braves', stored: 'BUF', initialism: 'BB' },
  { name: 'Seattle SuperSonics', stored: 'SEA', initialism: 'SS' },
];

// One unique year per franchise so `rowByYear` stays a locator; the archive sorts
// year-descending, so these 20 rows render newest-first.
const DIVERGENT_START_YEAR = 1948;
const divergentYearAt = (index: number) => DIVERGENT_START_YEAR + index;

// Codes the spec's matrix measures live: `SLB` 1, `KCK` 1, `WSB` 5, `SAS` 14,
// `OKC` 7 and `NY` 19 (NYK 16 + NYN 3), with 0 of the 59 seeded full names
// containing the substring "ny". jsdom cannot reproduce those counts, so the
// fixtures below carry deliberate small counts and pin the *arm* that answers; the
// live numbers are recorded here and in the spec, and the owner verifies them in
// preview by row count.
const bombers: Team = { id: 81, full_name: 'St. Louis Bombers', abbreviation: 'SLB', created_at: 'j' };
const kcKings: Team = { id: 82, full_name: 'Kansas City Kings', abbreviation: 'KCK', created_at: 'k' };
const bullets: Team = { id: 83, full_name: 'Washington Bullets', abbreviation: 'WSB', created_at: 'l' };
const superSonics: Team = { id: 85, full_name: 'Seattle SuperSonics', abbreviation: 'SEA', created_at: 'n' };
const spurs: Team = { id: 86, full_name: 'San Antonio Spurs', abbreviation: 'SAS', created_at: 'o' };
const knicks: Team = { id: 87, full_name: 'New York Knicks', abbreviation: 'NYK', created_at: 'p' };

function teamRow(id: number, full_name: string, abbreviation: string): Team {
  return { id, full_name, abbreviation, created_at: `row-${id}` };
}

/** A finished series between two exact rows; `teamA` won, so the row opens. */
function seriesBetween(year: number, teamA: Team, teamB: Team): Series {
  return {
    ...archivedRow,
    id: `s-${year}-${teamA.abbreviation}`,
    year,
    team_a: teamA,
    team_b: teamB,
    team_a_id: teamA.id,
    team_b_id: teamB.id,
    winner_team: teamA,
    winner_team_id: teamA.id,
  };
}

function divergentRows(): Series[] {
  return DIVERGENT_FRANCHISES.map((entry, index) =>
    seriesBetween(
      divergentYearAt(index),
      teamRow(200 + index, entry.name, entry.stored),
      warriors
    )
  );
}

function search(value: string) {
  fireEvent.change(screen.getByPlaceholderText('Search by team name or code...'), { target: { value } });
}

describe('HistoricalPage stored team codes and code search (Story 2.11)', () => {
  it('prints the stored abbreviation on all 20 divergent franchise rows, not the initialism', async () => {
    db.list = { data: divergentRows(), error: null };
    render(<HistoricalPage />);
    await waitFor(() => expect(renderedRows()).toBe(10));
    fireEvent.click(screen.getByText('Load More History'));
    await waitFor(() => expect(renderedRows()).toBe(20));

    for (const [index, entry] of DIVERGENT_FRANCHISES.entries()) {
      const row = rowByYear(divergentYearAt(index));
      // Verbatim, and the only place the letters can come from is the row: the
      // opponent is a modern franchise whose code differs from both columns.
      expect(within(row).getByText(entry.stored).textContent).toBe(entry.stored);
      expect(within(row).queryByText(entry.initialism)).toBeNull();
      // Rot-guards on the third column itself: if the name path changes, or the
      // two columns are transposed, this table stops describing a divergence and
      // the case says so instead of passing vacuously.
      expect(getTeamAbbreviation(entry.name)).toBe(entry.initialism);
      expect(entry.initialism).not.toBe(entry.stored);
    }
  });

  it('checks the hand-typed divergent-census table against the teams seed', () => {
    // The 20 pairs above are literals, and the frozen Intent's census rests on
    // them. Only the `initialism` column had an oracle (re-derived from the live
    // name path); `stored` was checked against nothing, so editing a seed
    // abbreviation would leave every case here green while the story's central
    // measurement went false. `parseTeamsSeed` is the shared reader
    // (`deferred-work.md`: one regex serves `00016`'s generator, the venue probe and
    // this assertion), the same one `team-logos.test.ts` re-keyed its oracle onto.
    // `team-logos.test.ts` resolves the seeds through `import.meta.url`; this file
    // runs in jsdom, where that URL is http-schemed, so the repo-root-relative
    // path is used instead. It fails loudly (ENOENT) rather than silently empty if
    // the suite is ever run from a different working directory.
    const readSeed = (name: string) => readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8');
    const teamsSeedText =
      readSeed('00005_release_1_data_model.sql') + readSeed('00007_backfill_missing_historical_series.sql');
    const seededAbbreviations = new Set(parseTeamsSeed(teamsSeedText, '00005 + 00007 teams seed').keys());

    // Non-vacuity: the table is the census's franchise half, and a reader that
    // parsed nothing would make the loop below pass by checking nothing.
    expect(DIVERGENT_FRANCHISES).toHaveLength(20);
    expect(seededAbbreviations.size).toBeGreaterThan(DIVERGENT_FRANCHISES.length);
    for (const entry of DIVERGENT_FRANCHISES) {
      expect(seededAbbreviations.has(entry.stored)).toBe(true);
    }
    // The name↔code pairing and the 39-series / 47-cell half of the census are
    // settled by the next case, which recomputes both from committed files.
  });

  it('recomputes the 39-series / 47-cell / 20-franchise census from the committed archive and seeds', () => {
    // Owner decision D1 (review pass 2, 2026-10-05): the census the frozen Intent
    // rests on is reproducible from the tree, so it is pinned, not recited. The
    // archive is `game7_venues_curated.csv` — one row per archived series (178),
    // carrying both sides' stored codes — and the seeds give each code its
    // `full_name` (`00005`: the 30 modern franchises; `00007`: the 29 historical
    // identities). What the surface printed before Story 2.11 was the retired map
    // for the 30 modern names (verified 2026-10-05 against `9c91056`: 0 mismatches,
    // 0 missing, so no modern cell could diverge) and the name path for everything
    // else; a divergent cell is therefore a `00007` identity whose name path
    // differs from its stored code.
    const readRepo = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
    const seedRows = (sql: string) => {
      const block = sql.slice(sql.search(/INSERT INTO teams/i));
      const values = block.slice(0, block.indexOf(';'));
      return [...values.matchAll(/\(\s*\d+,\s*'((?:[^']|'')+)',\s*'([A-Z]{2,4})'/g)].map((m) => ({
        name: m[1].replace(/''/g, "'"),
        code: m[2],
      }));
    };
    const modern = seedRows(readRepo('supabase/migrations/00005_release_1_data_model.sql'));
    const historical = seedRows(readRepo('supabase/migrations/00007_backfill_missing_historical_series.sql'));
    expect(modern).toHaveLength(30);
    expect(historical).toHaveLength(29);
    const historicalByCode = new Map(historical.map((team) => [team.code, team]));

    const archive = readRepo('supabase/scripts/pipeline/data/game7_venues_curated.csv')
      .split(/\r?\n/)
      .filter((line) => line !== '' && !line.startsWith('#'));
    expect(archive[0]).toBe('year,team_a,team_b,league,game7_home_team');
    const series = archive.slice(1).map((line) => line.split(','));
    expect(series).toHaveLength(178);

    let divergentSeries = 0;
    let divergentCells = 0;
    const years: number[] = [];
    const franchises = new Map<string, string>();
    for (const [year, teamA, teamB] of series) {
      let divergent = false;
      for (const code of [teamA, teamB]) {
        const team = historicalByCode.get(code);
        if (team && getTeamAbbreviation(team.name) !== team.code) {
          divergentCells++;
          divergent = true;
          franchises.set(team.name, team.code);
        }
      }
      if (divergent) {
        divergentSeries++;
        years.push(Number(year));
      }
    }

    expect(divergentSeries).toBe(39);
    expect(divergentCells).toBe(47);
    expect(Math.min(...years)).toBe(1948);
    expect(Math.max(...years)).toBe(1997);
    // The pairing the seed cross-check above could not see: the hand-typed table
    // is exactly the measured franchise set, name and stored code together.
    expect(Object.fromEntries(franchises)).toEqual(
      Object.fromEntries(DIVERGENT_FRANCHISES.map((entry) => [entry.name, entry.stored]))
    );
  });

  it('finds a series by the stored abbreviation on either FK, case-insensitively', async () => {
    db.list = {
      data: [
        seriesBetween(1948, bombers, lakers),
        seriesBetween(1970, knicks, bombers),
        seriesBetween(1976, kcKings, warriors),
        seriesBetween(1978, superSonics, bullets),
      ],
      error: null,
    };
    render(<HistoricalPage />);
    await waitFor(() => expect(renderedRows()).toBe(4));

    // `slb` is not a substring of any fixture name — only the code arm can answer
    // it — and it sits on team_a in one row and on team_b in the other.
    search('slb');
    expect(visibleYears()).toEqual(['1970', '1948']);
    search('SLB');
    expect(visibleYears()).toEqual(['1970', '1948']);
    search('KcK');
    expect(visibleYears()).toEqual(['1976']);
    search('wsb');
    expect(visibleYears()).toEqual(['1978']);
    expect(liveRegion()?.textContent).toBe('Showing 1 of 1 series.');

    // Owner decision D3 (review pass 2): padding from a paste does not hide a
    // code — the query is trimmed for both arms — and whitespace alone is empty.
    search('SLB ');
    expect(visibleYears()).toEqual(['1970', '1948']);
    search('  kck\t');
    expect(visibleYears()).toEqual(['1976']);
    search('   ');
    expect(renderedRows()).toBe(4);

    // The event keeps its name and its `filter_type` — a code query is still a
    // team search; Story 3.1 moves the call site, not this fact.
    expect(db.capture).toHaveBeenCalledWith('historical_filter_applied', { filter_type: 'team_search' });

    // Neither a name nor a code: the existing empty state, unchanged.
    search('zzz');
    expect(await screen.findByText('No series found matching your filters.')).toBeInTheDocument();
  });

  it('answers a two-letter code that no team name contains', async () => {
    db.list = {
      data: [seriesBetween(1970, knicks, bombers), seriesBetween(1974, nets, bullets)],
      error: null,
    };
    render(<HistoricalPage />);
    await waitFor(() => expect(renderedRows()).toBe(2));

    // Self-check on the fixture set: the measured live fact is that 0 seeded full
    // names contain "ny", so if that stopped being true here the query would no
    // longer prove the code arm, and this line would say so.
    const names = [knicks.full_name, bombers.full_name, nets.full_name, bullets.full_name];
    expect(names.filter((name) => name.toLowerCase().includes('ny'))).toEqual([]);

    // Live: `NY` is 19 series (NYK 16 + NYN 3). Here: both rows, because `ny` is a
    // prefix of both stored codes — the whole-row embed carries them, so U1 needed
    // no query change.
    search('ny');
    expect(visibleYears()).toEqual(['1974', '1970']);
  });

  it('keeps the name path a substring search, including the SAS-to-Kansas-City noise U3 accepted', async () => {
    const capitols = teamRow(84, 'Washington Capitols', 'WSC');
    db.list = {
      data: [
        seriesBetween(1979, superSonics, warriors),
        seriesBetween(1980, kcKings, lakers),
        seriesBetween(1978, bullets, capitols),
        seriesBetween(1949, capitols, warriors),
        seriesBetween(1985, spurs, warriors),
      ],
      error: null,
    };
    render(<HistoricalPage />);
    await waitFor(() => expect(renderedRows()).toBe(5));

    // A fragment of a name that is neither a code nor a whole name: the unchanged
    // behavior that is the "never narrowed" half of U1/U3.
    search('Sonics');
    expect(visibleYears()).toEqual(['1979']);
    // A city shared by two era identities, on two different rows.
    search('Washington');
    expect(visibleYears()).toEqual(['1978', '1949']);
    // `sas` is a substring of "Kan-sas City" and the stored code of the Spurs, so
    // both arms answer and the year-descending sort orders them by year — the
    // Spurs row (1985) first, the Kansas City noise row (1980) behind it: the
    // consequence the owner accepted rather than fixed (U3).
    search('sas');
    expect(visibleYears()).toEqual(['1985', '1980']);
  });

  it('prints the placeholder literal on a FK join miss, never the bare initialism', async () => {
    db.list = {
      data: [{ ...archivedRow, id: 's-join-miss', year: 1962, team_a: undefined, team_b: undefined }],
      error: null,
    };
    render(<HistoricalPage />);
    await waitFor(() => expect(renderedRows()).toBe(1));

    const row = rowByYear(1962);
    // U8: `Team A`/`Team B` are one named client literal, and step 2 of the
    // resolution order is what answers them — falling to the name path would print
    // `TA`/`TB`, which is what a mutation deleting step 2 shows.
    expect(within(row).getByText('TMA').textContent).toBe('TMA');
    expect(within(row).getByText('TMB').textContent).toBe('TMB');
    expect(within(row).queryByText('TA')).toBeNull();
  });

  it('falls through visibly when a joined row stores an empty abbreviation', async () => {
    const noCode: Team = { ...bullets, abbreviation: '' };
    db.list = { data: [seriesBetween(1978, noCode, warriors)], error: null };
    render(<HistoricalPage />);
    await waitFor(() => expect(renderedRows()).toBe(1));

    // Fail visible: the cell never renders blank, the name path prints `WB`.
    expect(within(rowByYear(1978)).getByText('WB').textContent).toBe('WB');
    // And the code arm reads the stored value, so a row storing nothing is
    // invisible to the query its own displayed code would suggest — `wsb` is not a
    // substring of "Washington Bullets", so only a stored code could answer it.
    search('wsb');
    expect(await screen.findByText('No series found matching your filters.')).toBeInTheDocument();
    // The name path still finds it: the predicate gained an arm, it did not swap.
    search('Bullets');
    expect(visibleYears()).toEqual(['1978']);
  });

  it('clears a code search with the reset button', async () => {
    db.list = {
      data: [seriesBetween(1948, bombers, lakers), seriesBetween(1970, knicks, bombers), archivedRow],
      error: null,
    };
    render(<HistoricalPage />);
    await waitFor(() => expect(renderedRows()).toBe(3));

    search('slb');
    expect(renderedRows()).toBe(2);
    const reset = resetButton();
    expect(reset).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(reset as HTMLButtonElement);

    await waitFor(() => expect(renderedRows()).toBe(3));
    expect((screen.getByPlaceholderText('Search by team name or code...') as HTMLInputElement).value).toBe('');
    expect(document.querySelector('svg.lucide-funnel-x')).toBeNull();
  });

  it('reads the team rows through the whole-row embeds the code arm depends on', async () => {
    render(<HistoricalPage />);
    await screen.findByText('1998');

    // U1: no query change. `abbreviation` reaches the predicate through these
    // embedded wildcards, so an enumerated rewrite that dropped the column would
    // blank every code search while these fixtures stayed green — the failure
    // shape this file's header comment records for Story 2.2.
    expect(db.projection).toContain('team_a:team_a_id(*)');
    expect(db.projection).toContain('team_b:team_b_id(*)');
  });
});
