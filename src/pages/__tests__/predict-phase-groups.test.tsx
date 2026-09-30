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
  conformingResult,
  renderPage,
  seriesFixture,
  submitPrediction,
  teamA,
  teamB,
} from './helpers';

const db = vi.hoisted(() => ({
  list: { data: [] as unknown, error: null as unknown },
  single: { data: null as unknown, error: null as null },
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

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ capture: db.capture, captureException: db.captureException }),
}));

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
    select: () => ({
      order: () => Promise.resolve(db.list),
      eq: () => ({ maybeSingle: () => Promise.resolve(db.single) }),
    }),
  }));
}

async function openPickerAtDecadeLevel() {
  fireEvent.click(screen.getByRole('button', { name: /Click to choose series/ }));
  await screen.findByText('Select Decade');
}

async function openYear(decade: string, yearCard: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(decade) }));
  fireEvent.click(await screen.findByRole('button', { name: yearCard }));
}

beforeEach(() => {
  vi.clearAllMocks();
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

    await openYear('1990s', /1998 View Series/);
    expect(await screen.findByText('Select Series from 1998')).toBeInTheDocument();
    expect(screen.getByText('LAL vs GSW')).toBeInTheDocument();
  });

  it('labels a year `Current` from the derivation and `View Series` when its rows are all archived', async () => {
    db.list = { data: [seriesFixture, archivedSeries], error: null };
    renderPage();
    await openPickerAtDecadeLevel();

    fireEvent.click(screen.getByRole('button', { name: /2020s/ }));
    expect(await screen.findByRole('button', { name: /2022 Current/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /2022 View Series/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Go Back/ }));
    fireEvent.click(screen.getByRole('button', { name: /1990s/ }));
    expect(await screen.findByRole('button', { name: /1998 View Series/ })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /2020s/ }));
    fireEvent.click(await screen.findByRole('button', { name: /2022 Current/ }));
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
