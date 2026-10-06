// @vitest-environment jsdom
// Story 2.2, spec I/O matrix: Active/Historical membership is derived, and a
// row that reconciles to neither shape is excluded from the picker and reported
// — none of that is visible from `series-phase.test.ts`, which only sees the
// pure function. This file pins the page half: the empty Active group, the
// derived grouping, the exclusion + exception reporting, and the deep link that
// still predicts on an excluded row.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Series } from '@/types/types';

import {
  chooseMethod,
  clickDecadeCard,
  clickYearCard,
  conformingResult,
  pressRetry,
  renderPage,
  seriesFixture,
  submitPrediction,
  teamA,
  teamB,
  yearCardText,
} from './helpers';

const db = vi.hoisted(() => ({
  list: { data: [] as unknown, error: null as unknown },
  single: { data: null as unknown, error: null as null },
  // Every projection string the page asks PostgREST for, so the migration's
  // client contract (no `status`, score rows present) is observed rather than
  // assumed — the mocks otherwise ignore `select`'s argument.
  projections: [] as string[],
  from: vi.fn(),
  invoke: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/db/supabase', () => ({
  supabase: {
    from: db.from,
    functions: { invoke: db.invoke },
  },
}));

vi.mock('posthog-js', () => ({ default: { capture: db.capture, captureException: db.captureException } }));

vi.mock('sonner', () => ({ toast: db.toast }));

const teamC: Series['team_a'] = { id: 33, full_name: 'Los Angeles Lakers', abbreviation: 'LAL', created_at: 'e' };
const teamD: Series['team_b'] = { id: 44, full_name: 'Golden State Warriors', abbreviation: 'GSW', created_at: 'f' };

const scoreRows = (seriesId: string, gameNumbers: number[]) =>
  gameNumbers.map((game_number) => ({
    id: `${seriesId}-g${game_number}`,
    series_id: seriesId,
    game_number,
    home_team_id: game_number % 2 === 0 ? 44 : 33,
    away_team_id: game_number % 2 === 0 ? 33 : 44,
    home_score: 110 + game_number,
    away_score: 100 + game_number,
    created_at: '2026-01-01T00:00:00Z',
  }));

/** A winner and games 1-7: the archived shape. */
const archivedSeries: Series = {
  id: 's-archive',
  year: 1998,
  round: 'Finals',
  league: 'NBA',
  team_a_id: 33,
  team_b_id: 44,
  winner_team_id: 33,
  created_at: 'g',
  team_a: teamC,
  team_b: teamD,
  series_game_scores: scoreRows('s-archive', [1, 2, 3, 4, 5, 6, 7]),
};

/** A winner with only games 1-6: the impossible shape AD-4 §4.2(b) excludes. */
const nonReconcilingSeries: Series = {
  ...archivedSeries,
  id: 's-anomaly',
  year: 2022,
  series_game_scores: scoreRows('s-anomaly', [1, 2, 3, 4, 5, 6]),
};

function stubQueries() {
  db.from.mockImplementation(() => ({
    select: (projection: string) => {
      db.projections.push(projection);
      return {
        order: () => Promise.resolve(db.list),
        eq: () => ({ maybeSingle: () => Promise.resolve(db.single) }),
      };
    },
  }));
}

async function openPickerAtDecadeLevel() {
  fireEvent.click(screen.getByRole('button', { name: /Click to choose series/ }));
  await screen.findByText('Select Decade');
}

async function openYear(decade: number, year: number) {
  clickDecadeCard(decade);
  await clickYearCard(year);
}

beforeEach(() => {
  vi.clearAllMocks();
  db.projections.length = 0;
  db.list = { data: [seriesFixture], error: null };
  db.single = { data: seriesFixture, error: null };
  db.invoke.mockResolvedValue({ data: null, error: null });
  stubQueries();
});

describe('PredictPage derived phase groups (Story 2.2)', () => {
  it('renders the Active group empty, with its copy and the archive link, when nothing is pending (matrix: nothing pending)', async () => {
    db.list = { data: [archivedSeries], error: null };
    renderPage();
    await openPickerAtDecadeLevel();

    expect(screen.getByText('Current Game 7s')).toBeInTheDocument();
    expect(screen.getByText('No active series right now — the next Game 7 is coming.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Every Game 7 has a history.' })).toHaveAttribute('href', '/historical');
    // Not hidden, and not an error: the retry panel stays away.
    expect(screen.queryByText("Couldn't load the series list.")).toBeNull();
    expect(db.captureException).not.toHaveBeenCalled();
  });

  it('puts only the pending series in the Active group and keeps the archived one reachable by year (matrix: archived + certified 3-3)', async () => {
    db.list = { data: [seriesFixture, archivedSeries], error: null };
    renderPage();
    await openPickerAtDecadeLevel();

    expect(screen.getByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.queryByText('LAL vs GSW')).toBeNull();

    await openYear(1990, 1998);
    expect(await screen.findByText('Select Series from 1998')).toBeInTheDocument();
    expect(screen.getByText('LAL vs GSW')).toBeInTheDocument();
  });

  it('labels a year `Current` from the derivation and `View Series` when its rows are all archived', async () => {
    db.list = { data: [seriesFixture, archivedSeries], error: null };
    renderPage();
    await openPickerAtDecadeLevel();

    clickDecadeCard(2020);
    await waitFor(() => expect(yearCardText(2022)).toBe('2022Current'));

    fireEvent.click(screen.getByRole('button', { name: /Go Back/ }));
    clickDecadeCard(1990);
    await waitFor(() => expect(yearCardText(1998)).toBe('1998View Series'));
  });

  it('excludes a non-reconciling row from both groups and reports it on the exception channel (matrix: impossible shape)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.list = { data: [seriesFixture, nonReconcilingSeries], error: null };
    renderPage();
    await openPickerAtDecadeLevel();

    // The anomaly shares 2022 with the pending fixture, so at decade level it
    // would surface only as a second LAL vs GSW card.
    expect(screen.queryByText('LAL vs GSW')).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    expect(db.captureException).toHaveBeenCalledTimes(1);
    const reported = db.captureException.mock.calls[0][0];
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toContain('s-anomaly');

    // And it stays out of the year's own series list.
    clickDecadeCard(2020);
    await clickYearCard(2022);
    expect(await screen.findByText('Select Series from 2022')).toBeInTheDocument();
    expect(screen.getByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.queryByText('LAL vs GSW')).toBeNull();
    consoleError.mockRestore();
  });

  it('still loads and predicts a non-reconciling row reached by ?series= (matrix: deep link)', async () => {
    db.single = { data: nonReconcilingSeries, error: null };
    db.invoke.mockResolvedValue({ data: conformingResult, error: null });
    renderPage('/predict?series=s-anomaly');

    expect(await screen.findByText('LAL vs GSW')).toBeInTheDocument();
    await chooseMethod();
    submitPrediction();

    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());
    expect(db.invoke.mock.calls[0][1].body).toMatchObject({ series_id: 's-anomaly' });
    // Exclusion is a picker concern; a deep-linked row loads and predicts, and
    // the load path itself reports nothing.
    expect(db.captureException).not.toHaveBeenCalled();
    // And its source stays inside the frozen two-value registry: an anomaly is
    // not `current`, and no third bucket reaches the event.
    const generated = db.capture.mock.calls.find(([name]) => name === 'prediction_generated');
    expect(generated?.[1]).toMatchObject({ series_source: 'historical' });
    // The matrix's "existing submit guards toast as today" half, pinned as the
    // negative: this anomaly shape (winner + games 1-6) passes every series-path
    // guard, so no guard toast fires on the way to the successful prediction.
    // The guards' own toasts are pinned in predict-flow-regression.test.tsx.
    expect(db.toast.error).not.toHaveBeenCalled();
    expect(db.toast.warning).not.toHaveBeenCalled();
  });

  it('asks PostgREST for the derivation inputs and never for the dropped column', async () => {
    renderPage();
    await openPickerAtDecadeLevel();

    // The projection is the client half of migration 00014's contract: it must
    // carry both derivation inputs and must not name `status`, which the
    // migration removes. Re-adding either breaks production while every mock
    // that ignores this argument stays green.
    const projection = db.projections[0];
    expect(projection).toContain('winner_team_id');
    expect(projection).toContain('series_game_scores(*)');
    expect(projection).not.toMatch(/\bstatus\b/);
    // Story 2.9 closes the other half of that asymmetry: this list enumerates
    // its columns, so `league` has to be named here too or the `Series` this
    // page builds is missing a field its own type requires.
    expect(projection).toContain('league');
    // Story 2.11 makes the stored `teams.abbreviation` this page's display and
    // resolution source, and its embeds are enumerated — so a column-pruning pass
    // that dropped `abbreviation` from either side would revert every code on the
    // page to a name initialism with all the row fixtures still supplying the
    // field. Pinned per side, not just somewhere in the string.
    expect(projection).toMatch(/team_a:team_a_id\([^)]*\babbreviation\b/);
    expect(projection).toMatch(/team_b:team_b_id\([^)]*\babbreviation\b/);
  });

  it('reports a pending series as `current` on the selection event', async () => {
    db.list = { data: [seriesFixture, archivedSeries], error: null };
    renderPage();
    await openPickerAtDecadeLevel();

    fireEvent.click(screen.getByText('BOS vs MIA').closest('button') as HTMLButtonElement);

    const selected = db.capture.mock.calls.find(([name]) => name === 'series_selected');
    expect(selected?.[1]).toMatchObject({ series_source: 'current', series_id: 's-1' });
  });

  it('withholds the Active empty-state claim until the archive has answered', async () => {
    // The group renders as soon as the picker opens, but "No active series
    // right now" is a statement about the whole table; a fan who opens the
    // picker mid-fetch must not be told the pending set is empty.
    let resolveList: (value: { data: unknown; error: null }) => void = () => {};
    const pending = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveList = resolve;
    });
    db.from.mockImplementation(() => ({
      select: () => ({
        order: () => pending,
        eq: () => ({ maybeSingle: () => Promise.resolve(db.single) }),
      }),
    }));
    renderPage();
    await openPickerAtDecadeLevel();

    expect(screen.getByText('Current Game 7s')).toBeInTheDocument();
    expect(screen.queryByText('No active series right now — the next Game 7 is coming.')).toBeNull();

    resolveList({ data: [archivedSeries], error: null });
    expect(await screen.findByText('No active series right now — the next Game 7 is coming.')).toBeInTheDocument();
  });

  it('restores the withheld empty state after a failed list fetch is retried', async () => {
    // The other half of the `seriesListLoaded` gate: a failed fetch leaves the
    // flag false and shows the retry panel, and while the retry is in flight the
    // empty-state claim must stay withheld — the pending set is unknown again.
    // Deleting the gate passes every other test in this file; this one is the
    // mutation check that the flag itself is load-bearing.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.list = { data: null, error: { message: 'list fetch failed' } };
    renderPage();
    await openPickerAtDecadeLevel();

    expect(await screen.findByText("Couldn't load the series list.")).toBeInTheDocument();

    let resolveRetry: (value: { data: unknown; error: null }) => void = () => {};
    const retryPending = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveRetry = resolve;
    });
    db.from.mockImplementation(() => ({
      select: () => ({
        order: () => retryPending,
        eq: () => ({ maybeSingle: () => Promise.resolve(db.single) }),
      }),
    }));
    pressRetry();

    await waitFor(() => expect(screen.queryByText("Couldn't load the series list.")).toBeNull());
    expect(screen.getByText('Current Game 7s')).toBeInTheDocument();
    expect(screen.queryByText('No active series right now — the next Game 7 is coming.')).toBeNull();

    resolveRetry({ data: [archivedSeries], error: null });
    expect(await screen.findByText('No active series right now — the next Game 7 is coming.')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});

// The fixture that predates this story is a certified 3-3: six decided games
// with no winner. Pinned here so a future edit to `helpers.tsx` cannot silently
// move every suite off the pending shape.
it('keeps the shared fixture on the pending shape', () => {
  expect(seriesFixture.winner_team_id).toBeUndefined();
  expect(seriesFixture.series_game_scores?.map((row) => row.game_number)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(seriesFixture.team_a).toBe(teamA);
  expect(seriesFixture.team_b).toBe(teamB);
});
