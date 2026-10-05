// @vitest-environment jsdom
// Story 2.7 (owner decision D2): Home's pending-Game-7 data reach. Pins that a
// pending series reaches Home through the shared derivation and resolves to
// its preview page, and that Home renders nothing at all when none is pending
// or the read fails. Assertions are `textContent` / `href` only — never a
// computed accessible name (AGENTS.md · Evidence discipline, finding F16).
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Series } from '@/types/types';

const db = vi.hoisted(() => ({
  result: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown } | Error,
  projections: [] as string[],
  filters: [] as Array<[string, unknown]>,
  orders: [] as string[],
  from: vi.fn(),
}));

vi.mock('@/db/supabase', () => ({
  supabase: { from: db.from, functions: { invoke: vi.fn() } },
}));

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: vi.fn(), captureException: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

// The carousel is not this story's surface; jsdom has no layout for embla to
// measure, so the hook is stubbed to an inert ref and no API.
vi.mock('embla-carousel-react', () => ({ default: () => [() => {}, undefined] }));

import HomePage, { PendingGameSevens } from '@/pages/HomePage';

const BOS = { id: 2, full_name: 'Boston Celtics', abbreviation: 'BOS', created_at: 'a' };
const MIA = { id: 16, full_name: 'Miami Heat', abbreviation: 'MIA', created_at: 'b' };

function seriesWith(id: string, gameNumbers: number[], winner: number | null = null): Series {
  return {
    id,
    year: 2027,
    round: 'Eastern Conference First Round',
    league: 'NBA',
    team_a_id: BOS.id,
    team_b_id: MIA.id,
    winner_team_id: winner ?? undefined,
    created_at: 'c',
    team_a: BOS,
    team_b: MIA,
    series_game_scores: gameNumbers.map((game_number) => ({
      id: `${id}-g${game_number}`,
      series_id: id,
      game_number,
      home_team_id: game_number % 2 === 0 ? MIA.id : BOS.id,
      away_team_id: game_number % 2 === 0 ? BOS.id : MIA.id,
      home_score: 100 + game_number,
      away_score: 95,
      created_at: 'd',
    })),
  } as Series;
}

const PENDING_ID = '00000000-0000-4000-8000-000000000027';

beforeEach(() => {
  db.result = { data: [], error: null };
  db.projections = [];
  db.filters = [];
  db.orders = [];
  db.from.mockReset();
  db.from.mockImplementation((table: string) => {
    expect(table).toBe('series');
    const chain = {
      select: (projection: string) => {
        db.projections.push(projection);
        return chain;
      },
      is: (column: string, value: unknown) => {
        db.filters.push([column, value]);
        return chain;
      },
      order: (column: string) => {
        db.orders.push(column);
        return db.result instanceof Error ? Promise.reject(db.result) : Promise.resolve(db.result);
      },
    };
    return chain;
  });
});

function renderBlock() {
  return render(
    <MemoryRouter>
      <PendingGameSevens />
    </MemoryRouter>
  );
}

/** Lets the mount effect's awaited query settle, so "renders nothing" is a settled claim. */
async function settled() {
  await waitFor(() => expect(db.orders.length).toBe(1));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Home pending-Game-7 data reach (Story 2.7, D2)', () => {
  it('reads series through the shared projection, embedding every score row', async () => {
    renderBlock();
    await settled();
    expect(db.projections).toHaveLength(1);
    expect(db.projections[0]).toContain('series_game_scores(*)');
    expect(db.projections[0]).toContain('team_a:team_a_id(');
    expect(db.projections[0]).not.toMatch(/\bstatus\b/);
    // The payload is narrowed to winner-less rows; the derivation still decides.
    expect(db.filters).toEqual([['winner_team_id', null]]);
  });

  it('renders one link per pending series, resolving to that series\' preview page', async () => {
    db.result = { data: [seriesWith(PENDING_ID, [1, 2, 3, 4, 5, 6])], error: null };
    const { container } = renderBlock();
    await waitFor(() => expect(container.querySelector('a[data-pending-series-id]')).not.toBeNull());
    const links = container.querySelectorAll('a[data-pending-series-id]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe(`/predict?series=${PENDING_ID}`);
    expect(links[0].textContent).toBe('BOS vs MIA — Game 7 pending');
  });

  it('drops a winner-less row whose game set is not exactly 1–6 (the derivation decides, not the filter)', async () => {
    db.result = {
      data: [seriesWith('short', [1, 2, 3, 4, 5]), seriesWith('gappy', [1, 2, 3, 4, 6, 7]), seriesWith(PENDING_ID, [1, 2, 3, 4, 5, 6])],
      error: null,
    };
    const { container } = renderBlock();
    await waitFor(() => expect(container.querySelector('a[data-pending-series-id]')).not.toBeNull());
    const ids = Array.from(container.querySelectorAll('a[data-pending-series-id]')).map((a) => a.getAttribute('data-pending-series-id'));
    expect(ids).toEqual([PENDING_ID]);
  });

  it('drops a six-row row that carries a winner (the mock ignores the server filter, so only the derivation can drop it)', async () => {
    db.result = { data: [seriesWith('decided', [1, 2, 3, 4, 5, 6], BOS.id), seriesWith(PENDING_ID, [1, 2, 3, 4, 5, 6])], error: null };
    const { container } = renderBlock();
    await waitFor(() => expect(container.querySelector('a[data-pending-series-id]')).not.toBeNull());
    const ids = Array.from(container.querySelectorAll('a[data-pending-series-id]')).map((a) => a.getAttribute('data-pending-series-id'));
    expect(ids).toEqual([PENDING_ID]);
  });

  it('renders nothing at all when no series is pending', async () => {
    db.result = { data: [seriesWith('short', [1, 2, 3, 4, 5])], error: null };
    const { container } = renderBlock();
    await settled();
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing on a query error', async () => {
    db.result = { data: null, error: { message: 'boom', code: '500' } };
    const { container } = renderBlock();
    await settled();
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the read throws', async () => {
    db.result = new Error('network down');
    const { container } = renderBlock();
    await settled();
    expect(container.innerHTML).toBe('');
  });

  it('is mounted by HomePage, which carries no pending block when nothing is pending', async () => {
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    await settled();
    expect(container.textContent).toContain('Predict Game 7');
    expect(container.querySelector('[data-home-pending-series]')).toBeNull();
  });

  it('is mounted by HomePage, which links a pending series to its preview page', async () => {
    db.result = { data: [seriesWith(PENDING_ID, [1, 2, 3, 4, 5, 6])], error: null };
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    await waitFor(() => expect(container.querySelector('[data-home-pending-series] a')).not.toBeNull());
    expect(container.querySelector('[data-home-pending-series] a')?.getAttribute('href')).toBe(`/predict?series=${PENDING_ID}`);
  });
});
