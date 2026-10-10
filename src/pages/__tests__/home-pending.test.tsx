// @vitest-environment jsdom
// Story 2.7 (owner decision D2): Home's pending-Game-7 data reach; Story 4.5:
// its treatment. Pins that a pending series reaches Home through the shared
// derivation as a highlight card linking its series page and Predict, and that
// zero pending series, a read in flight and a failed read all render nothing
// (owner decision 2026-10-08: the empty state is withdrawn until Story 4.9). Assertions are `textContent` / `href` only — never a computed
// accessible name (AGENTS.md · Evidence discipline, finding F16).
import { fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Series } from '@/types/types';

const db = vi.hoisted(() => ({
  result: { data: [] as unknown, error: null as unknown } as { data: unknown; error: unknown } | Error,
  projections: [] as string[],
  filters: [] as Array<[string, unknown]>,
  orders: [] as string[],
  from: vi.fn(),
  invoke: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/db/supabase', () => ({
  supabase: { from: db.from, functions: { invoke: db.invoke } },
}));

vi.mock('posthog-js', () => ({ default: { capture: db.capture, captureException: db.captureException } }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

// The carousel is not this story's surface; jsdom has no layout for embla to
// measure, so the hook is stubbed to an inert ref and no API.
vi.mock('embla-carousel-react', () => ({ default: () => [() => {}, undefined] }));

import HomePage, { PendingGameSevens } from '@/pages/HomePage';

const BOS = { id: 2, full_name: 'Boston Celtics', nickname: 'Celtics', abbreviation: 'BOS', created_at: 'a' };
const MIA = { id: 16, full_name: 'Miami Heat', nickname: 'Heat', abbreviation: 'MIA', created_at: 'b' };

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

describe('Home pending-Game-7 highlight (Story 2.7 data reach, Story 4.5 treatment)', () => {
  it('reads series through the shared projection, embedding every score row and no editorial content', async () => {
    renderBlock();
    await settled();
    expect(db.projections).toHaveLength(1);
    expect(db.projections[0]).toContain('series_game_scores(*)');
    expect(db.projections[0]).toContain('team_a:team_a_id(');
    expect(db.projections[0]).not.toMatch(/\bstatus\b/);
    expect(db.projections[0]).not.toContain('series_content');
    // The payload is narrowed to winner-less rows; the derivation still decides.
    expect(db.filters).toEqual([['winner_team_id', null]]);
  });

  it('renders one card per pending series: eyebrow, stored-order headline, "Game 7 stands." and both links (matrix: Home, pending exists)', async () => {
    // Story 6.8: stored order, `team_a` (the Game 1 host of a pending series) first. Miami is
    // stored first here because the alphabet would put Boston first, so the retired E14 order fails.
    const row = seriesWith(PENDING_ID, [1, 2, 3, 4, 5, 6]);
    const miamiFirst = { ...row, team_a_id: MIA.id, team_b_id: BOS.id, team_a: MIA, team_b: BOS } as Series;
    db.result = { data: [miamiFirst], error: null };
    const { container } = renderBlock();
    await waitFor(() => expect(container.querySelector('[data-pending-series-id]')).not.toBeNull());
    const cards = container.querySelectorAll('[data-pending-series-id]');
    expect(cards).toHaveLength(1);
    const card = cards[0] as HTMLElement;
    expect(card.getAttribute('data-pending-series-id')).toBe(PENDING_ID);
    expect(card.querySelector('p')?.textContent).toBe('GAME 7 · 2027 EASTERN CONFERENCE FIRST ROUND');
    expect(card.querySelector('h2')?.textContent).toBe('Heat and Celtics stand three games apiece');
    expect(card.textContent).toContain('Game 7 stands.');

    const series = card.querySelector('a[data-pending-series-link="series"]') as HTMLAnchorElement;
    const predict = card.querySelector('a[data-pending-series-link="predict"]') as HTMLAnchorElement;
    // Story 6.1: the slug URL, from the teams' nicknames in stored order.
    expect(series.getAttribute('href')).toBe('/series/2027/heat-celtics');
    expect(series.textContent).toBe('Read the series →');
    expect(predict.getAttribute('href')).toBe(`/predict?series=${PENDING_ID}`);
    expect(predict.textContent).toBe('Model Game 7 →');
    // ≥44px targets.
    for (const link of [series, predict]) expect(link.className).toMatch(/\bmin-h-11\b/);
    // Spoiler discipline: no score, no outcome wording.
    expect(card.textContent).not.toMatch(/\d+–\d+|win|won|over/);
  });

  it('drops a winner-less row whose game set is not exactly 1–6 (the derivation decides, not the filter)', async () => {
    db.result = {
      data: [seriesWith('short', [1, 2, 3, 4, 5]), seriesWith('gappy', [1, 2, 3, 4, 6, 7]), seriesWith(PENDING_ID, [1, 2, 3, 4, 5, 6])],
      error: null,
    };
    const { container } = renderBlock();
    await waitFor(() => expect(container.querySelector('[data-pending-series-id]')).not.toBeNull());
    const ids = Array.from(container.querySelectorAll('[data-pending-series-id]')).map((el) => el.getAttribute('data-pending-series-id'));
    expect(ids).toEqual([PENDING_ID]);
  });

  it('drops a six-row row that carries a winner (the mock ignores the server filter, so only the derivation can drop it)', async () => {
    db.result = { data: [seriesWith('decided', [1, 2, 3, 4, 5, 6], BOS.id), seriesWith(PENDING_ID, [1, 2, 3, 4, 5, 6])], error: null };
    const { container } = renderBlock();
    await waitFor(() => expect(container.querySelector('[data-pending-series-id]')).not.toBeNull());
    const ids = Array.from(container.querySelectorAll('[data-pending-series-id]')).map((el) => el.getAttribute('data-pending-series-id'));
    expect(ids).toEqual([PENDING_ID]);
  });

  it('renders nothing when no series is pending (owner decision 2026-10-08: the empty state is withdrawn until Story 4.9)', async () => {
    db.result = { data: [seriesWith('short', [1, 2, 3, 4, 5])], error: null };
    const { container } = renderBlock();
    await settled();
    expect(container.innerHTML).toBe('');
    expect(container.textContent).not.toContain('No active series right now');
  });

  it('renders nothing while the read is in flight (no placeholder, no copy)', () => {
    db.from.mockImplementation(() => {
      const chain = { select: () => chain, is: () => chain, order: () => new Promise(() => {}) };
      return chain;
    });
    const { container } = renderBlock();
    expect(container.innerHTML).toBe('');
  });

  it('a pending row the card cannot show is reported once by id, and the others still render', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.captureException.mockClear();
    const unshowable = { ...seriesWith('teamless', [1, 2, 3, 4, 5, 6]), team_a: undefined } as Series;
    db.result = { data: [unshowable, unshowable, seriesWith(PENDING_ID, [1, 2, 3, 4, 5, 6])], error: null };
    const { container } = renderBlock();
    await waitFor(() => expect(container.querySelector('[data-pending-series-id]')).not.toBeNull());
    const ids = Array.from(container.querySelectorAll('[data-pending-series-id]')).map((el) => el.getAttribute('data-pending-series-id'));
    expect(ids).toEqual([PENDING_ID]);
    expect(db.captureException).toHaveBeenCalledTimes(1);
    expect(String(db.captureException.mock.calls[0][0])).toContain('teamless');
    expect(quiet).toHaveBeenCalledWith('Non-reconciling series:', expect.any(Error));
    quiet.mockRestore();
  });

  it('renders nothing on a query error, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.result = { data: null, error: { message: 'boom', code: '500' } };
    const { container } = renderBlock();
    await settled();
    expect(container.innerHTML).toBe('');
    expect(log).toHaveBeenCalledWith('Error fetching pending Game 7s:', 'boom');
    log.mockRestore();
  });

  it('renders nothing when the read throws, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.result = new Error('network down');
    const { container } = renderBlock();
    await settled();
    expect(container.innerHTML).toBe('');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('is mounted by HomePage, which shows no pending block and no empty-state copy when nothing is pending', async () => {
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    await settled();
    expect(container.textContent).toContain('Predict Game 7');
    expect(container.querySelector('[data-home-pending-series]')).toBeNull();
    expect(container.textContent).not.toContain('No active series right now');
  });

  it('is mounted by HomePage, which links a pending series to its series page and to Predict', async () => {
    db.result = { data: [seriesWith(PENDING_ID, [1, 2, 3, 4, 5, 6])], error: null };
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    await waitFor(() => expect(container.querySelector('[data-home-pending-series] a')).not.toBeNull());
    const hrefs = Array.from(container.querySelectorAll('[data-home-pending-series] a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/series/2027/celtics-heat', `/predict?series=${PENDING_ID}`]);
  });
});

// Story 4.0: Home's three analytics call sites now go through the port
// (`@/lib/analytics` → the mocked `posthog-js` singleton), so these pin the
// exact name and props each one sends, as the whole call log.
describe('Home analytics through the port (Story 4.0)', () => {
  beforeEach(() => {
    db.invoke.mockReset();
    db.capture.mockClear();
    db.captureException.mockClear();
  });

  function renderHome() {
    return render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
  }

  function submitContact(container: HTMLElement) {
    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.change(form.querySelector('#name') as HTMLInputElement, { target: { value: 'Fan Name' } });
    fireEvent.change(form.querySelector('#email') as HTMLInputElement, { target: { value: 'fan@example.com' } });
    fireEvent.change(form.querySelector('#message') as HTMLTextAreaElement, { target: { value: 'Hello there' } });
    fireEvent.submit(form);
  }

  it('sends banner_hotspot_clicked with the hotspot caption and series id', async () => {
    const { container } = renderHome();
    await settled();
    const hotspot = container.querySelector('a[href="/predict?series=29638c4e-261a-4d09-81aa-5740f76175f5"]') as HTMLAnchorElement;
    fireEvent.click(hotspot);
    expect(db.capture.mock.calls).toEqual([
      ['banner_hotspot_clicked', { caption: 'Raptors vs 76ers, 2019', series_id: '29638c4e-261a-4d09-81aa-5740f76175f5' }],
    ]);
    expect(db.captureException).not.toHaveBeenCalled();
  });

  it('sends the 2016 hotspot caption home-first, Game 7 host named first (Story 6.8 value change)', async () => {
    const { container } = renderHome();
    await settled();
    const hotspot = container.querySelector('a[href="/predict?series=06715a85-ec33-46a4-8383-d058055eefe6"]') as HTMLAnchorElement;
    fireEvent.click(hotspot);
    expect(db.capture.mock.calls).toEqual([
      ['banner_hotspot_clicked', { caption: 'Warriors vs Cavs, 2016', series_id: '06715a85-ec33-46a4-8383-d058055eefe6' }],
    ]);
    expect(db.captureException).not.toHaveBeenCalled();
  });

  it('sends contact_form_submitted with no props, one argument, on a successful submit', async () => {
    db.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { container } = renderHome();
    await settled();
    submitContact(container);
    await waitFor(() => expect(db.capture).toHaveBeenCalled());
    expect(db.invoke.mock.calls[0][0]).toBe('handle-contact');
    expect(db.capture.mock.calls).toEqual([['contact_form_submitted']]);
    expect(db.capture.mock.calls[0]).toHaveLength(1);
    expect(db.captureException).not.toHaveBeenCalled();
  });

  it('reports a failed submit through captureError alone, with no submitted event', async () => {
    db.invoke.mockResolvedValue({ data: null, error: { message: 'relay down', context: {} } });
    const { container } = renderHome();
    await settled();
    submitContact(container);
    await waitFor(() => expect(db.captureException).toHaveBeenCalled());
    expect(db.captureException.mock.calls).toHaveLength(1);
    expect(db.captureException.mock.calls[0]).toHaveLength(1);
    expect(db.captureException.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((db.captureException.mock.calls[0][0] as Error).message).toBe('relay down');
    expect(db.capture.mock.calls).toEqual([]);
  });
});
