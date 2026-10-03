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

// jsdom defines no `scrollIntoView`, and Radix's `Select` calls it while
// highlighting the selected option, so every case that opens the year list
// would otherwise crash inside a passive effect. The stub is a spy on purpose:
// the "nothing on this surface moves the page" case asserts it was not called,
// rather than relying on the method being absent.
const scrollIntoView = vi.fn(() => {});
Element.prototype.scrollIntoView = scrollIntoView;

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
    fireEvent.change(screen.getByPlaceholderText('Search by team name...'), { target: { value: 'Nets' } });
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
    fireEvent.change(screen.getByPlaceholderText('Search by team name...'), { target: { value: 'Nets' } });
    expect(renderedRows()).toBe(1);
    expect(visibleYears()).toEqual(['1976']);

    // Now the team predicate excludes the row the year kept: FR-10's combined
    // rule, with the copy that already existed and no new empty state.
    fireEvent.change(screen.getByPlaceholderText('Search by team name...'), { target: { value: 'Lakers' } });
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
    // The other half of the button's render condition (`HistoricalPage.tsx:184`:
    // `yearFilter !== 'all' || teamSearch !== ''`). The case above reaches the
    // button through the year disjunct only, so without this one, deleting the
    // `teamSearch` disjunct keeps every other case green while a fan who only
    // typed a team name loses the page's sole clear control. Filed by the
    // external review's verification-gap layer (2026-10-04) as the diff's one
    // unpinned leg; mutation-proven there — this case reddens without the disjunct.
    db.list = { data: [archivedRow, baaRow, abaRow], error: null };
    render(<HistoricalPage />);
    await screen.findByText('1948');

    fireEvent.change(screen.getByPlaceholderText('Search by team name...'), { target: { value: 'Nets' } });
    expect(renderedRows()).toBe(1);

    const reset = resetButton();
    expect(reset).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(reset as HTMLButtonElement);

    await waitFor(() => expect(renderedRows()).toBe(3));
    expect((screen.getByPlaceholderText('Search by team name...') as HTMLInputElement).value).toBe('');
    expect(document.querySelector('svg.lucide-funnel-x')).toBeNull();
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
    // The counter reset lives in two call sites (`HistoricalPage.tsx:180`'s
    // search handler as well as the year one), and only the year path was covered
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

    fireEvent.change(screen.getByPlaceholderText('Search by team name...'), { target: { value: 'Lakers' } });
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
    fireEvent.change(screen.getByPlaceholderText('Search by team name...'), { target: { value: 'Nets' } });
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
