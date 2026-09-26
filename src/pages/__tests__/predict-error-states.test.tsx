// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PredictPage from '@/pages/PredictPage';
import type { Series, Team } from '@/types/types';

// The whole file is about what the page *does* with a classified failure, so
// every boundary is stubbed: `vi.hoisted` keeps the controllable result objects
// reachable from the mocked module factory.
const db = vi.hoisted(() => ({
  list: { data: [] as unknown, error: null as unknown },
  single: { data: null as unknown, error: null as unknown },
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

const teamA: Team = { id: 11, full_name: 'Boston Celtics', abbreviation: 'BOS', created_at: 'a' };
const teamB: Team = { id: 22, full_name: 'Miami Heat', abbreviation: 'MIA', created_at: 'b' };

const seriesFixture: Series = {
  id: 's-1',
  year: 2022,
  round: 'Finals',
  team_a_id: 11,
  team_b_id: 22,
  status: 'historical',
  created_at: 'c',
  team_a: teamA,
  team_b: teamB,
  series_game_scores: [1, 2, 3, 4, 5, 6].map((game) => ({
    id: `g${game}`,
    series_id: 's-1',
    game_number: game,
    home_team_id: game % 2 === 0 ? 22 : 11,
    away_team_id: game % 2 === 0 ? 11 : 22,
    home_score: 100 + game,
    away_score: 90 + game,
    created_at: 'd',
  })),
};

/** A `FunctionsHttpError`: `context` is the raw `Response`, body is JSON. */
function httpError(status: number, body: string) {
  return { name: 'FunctionsHttpError', message: 'HttpError', context: { status, text: () => Promise.resolve(body) } };
}

/** A `FunctionsFetchError`: `context` is NOT a `Response` — `:243` crashed here. */
function fetchError() {
  return { name: 'FunctionsFetchError', message: 'Failed to fetch', context: {} };
}

const TRANSPORT_COPY = "Couldn't reach the prediction service. It may be briefly unavailable.";

// The contract's documented scale: percentages 0-100, two decimals.
const conformingResult = {
  predicted_winner: 'Boston Celtics',
  team_a: 'Boston Celtics',
  team_b: 'Miami Heat',
  win_probability_a: 61.25,
  win_probability_b: 38.75,
  confidence_level: 'Medium',
  computation_time_ms: 12,
  method_used: 'logistic_regression',
  contributing_factors: [{ factor: 'momentum', description: 'late-series margin', impact: 0.1 }],
};

function renderPage(entry = '/predict') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PredictPage />
    </MemoryRouter>
  );
}

async function chooseMethod(label = 'Logistic Regression') {
  fireEvent.click(screen.getByText('Click to choose method'));
  const option = await screen.findByRole('button', { name: new RegExp(label) });
  fireEvent.click(option);
}

async function chooseCustomMatchup() {
  fireEvent.click(screen.getByText('Click to choose series'));
  const option = await screen.findByRole('button', { name: /Custom Matchup/ });
  fireEvent.click(option);
}

function fillField(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

function fillCustomForm() {
  fillField('team_a', 'BOS');
  fillField('team_b', 'MIA');
  for (let game = 1; game <= 6; game++) {
    fillField(`game_${game}_score_a`, `${100 + game}`);
    fillField(`game_${game}_score_b`, `${90 + game}`);
  }
}

function submitPrediction() {
  fireEvent.click(screen.getByText('Click to generate prediction'));
}

function panel() {
  return screen.getByRole('status');
}

function pressRetry() {
  fireEvent.click(within(panel()).getByRole('button', { name: 'Retry' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  db.list = { data: [seriesFixture], error: null };
  db.single = { data: seriesFixture, error: null };
  db.from.mockImplementation(() => ({
    select: () => ({
      order: () => Promise.resolve(db.list),
      eq: () => ({ maybeSingle: () => Promise.resolve(db.single) }),
    }),
  }));
  db.invoke.mockResolvedValue({ data: null, error: fetchError() });
});

describe('PredictPage error states (Story 1.3)', () => {
  it('replaces the result region with the server envelope string, not raw JSON (matrix: function rejects)', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    db.invoke.mockResolvedValue({ data: null, error: httpError(400, '{"error":"Team names are required"}') });
    fillCustomForm();
    submitPrediction();

    await waitFor(() => expect(screen.getByText("Couldn't generate the prediction.")).toBeInTheDocument());
    expect(within(panel()).getByText('Team names are required')).toBeInTheDocument();
    expect(panel().textContent).not.toContain('{"error"');
    expect(db.captureException).toHaveBeenCalled();
  });

  it('renders the service-unreachable copy for a transport failure (matrix: transport)', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();
    submitPrediction();

    await waitFor(() => expect(screen.getByText("Couldn't generate the prediction.")).toBeInTheDocument());
    expect(within(panel()).getByText(TRANSPORT_COPY)).toBeInTheDocument();
  });

  it('catches a 200 with a null probability instead of rendering undefined% (matrix: non-conforming success)', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();
    db.invoke.mockResolvedValue({ data: { ...conformingResult, win_probability_a: null }, error: null });

    submitPrediction();

    await waitFor(() => expect(screen.getByText("Couldn't generate the prediction.")).toBeInTheDocument());
    expect(document.body.textContent).not.toContain('undefined%');
  });

  it('flags invalid custom input inline and never leaves the browser (matrix: invalid input)', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();

    fillField('team_b', 'MIA');
    for (let game = 2; game <= 6; game++) {
      fillField(`game_${game}_score_a`, `${100 + game}`);
      fillField(`game_${game}_score_b`, `${90 + game}`);
    }
    submitPrediction();

    const teamAInput = document.getElementById('team_a') as HTMLInputElement;
    expect(await screen.findByText('Team name is required')).toBeInTheDocument();
    expect(teamAInput).toBeInvalid();
    expect(teamAInput).toHaveAttribute('aria-describedby', 'team_a-error');
    expect(document.getElementById('team_b')).not.toBeInvalid();
    // A blank score is wired the same way — twelve inputs, not just the names.
    const scoreA = document.getElementById('game_1_score_a') as HTMLInputElement;
    expect(scoreA).toBeInvalid();
    expect(scoreA).toHaveAttribute('aria-describedby', 'game_1_score_a-error');
    expect(document.getElementById('game_1_score_a-error')).toHaveTextContent('Score is required');
    // The announcement an SR user gets when no toast fires for field errors:
    // focus lands on the first invalid field, in reading order.
    expect(teamAInput).toHaveFocus();
    expect(db.invoke).not.toHaveBeenCalled();
    expect(screen.queryByText("Couldn't generate the prediction.")).toBeNull();
  });

  it('re-fires the identical attempt on Retry and keeps every input (matrix: retry)', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();
    submitPrediction();

    await waitFor(() => expect(screen.getByText("Couldn't generate the prediction.")).toBeInTheDocument());
    expect(db.invoke).toHaveBeenCalledTimes(1);
    const firstBody = db.invoke.mock.calls[0][1];

    pressRetry();

    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(2));
    expect(db.invoke.mock.calls[1][1]).toEqual(firstBody);
    // Second failure re-renders the panel — no spinner loop, no lost place.
    await waitFor(() => expect(screen.getByText("Couldn't generate the prediction.")).toBeInTheDocument());
    expect(screen.queryByText('Analyzing series data...')).toBeNull();
    expect((document.getElementById('team_a') as HTMLInputElement).value).toBe('BOS');
    expect((document.getElementById('game_6_score_b') as HTMLInputElement).value).toBe('96');
    expect(screen.getByText('Logistic Regression')).toBeInTheDocument();
  });

  it('swaps the picker body for a panel that re-runs the fetch and keeps the selection (matrix: series list on mount)', async () => {
    db.list = { data: null, error: new Error('series select failed') };
    renderPage('/predict?series=s-1');

    // The preloaded selection lands asynchronously — wait for the trigger.
    fireEvent.click(await screen.findByText('BOS vs MIA'));
    await screen.findByText("Couldn't load the series list.");

    db.list = { data: [seriesFixture], error: null };
    pressRetry();

    await waitFor(() => expect(screen.getByText('Select Decade')).toBeInTheDocument());
    expect(screen.queryByText("Couldn't load the series list.")).toBeNull();
    // The preloaded selection survived the failure and the retry.
    expect(screen.getByText('BOS vs MIA')).toBeInTheDocument();
    expect(db.from).toHaveBeenCalledWith('series');
  });

  it('treats a failed ?series= query as retryable in the result region (matrix: broken preload)', async () => {
    db.single = { data: null, error: new Error('bad request') };
    renderPage('/predict?series=s-1');

    await waitFor(() => expect(screen.getByText("Couldn't load this series.")).toBeInTheDocument());
    expect(db.toast.error).not.toHaveBeenCalledWith('Series not found');
    expect(db.captureException).toHaveBeenCalled();
  });

  it('swaps the panel for the result when the retry succeeds (matrix: retry)', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();
    submitPrediction();

    await waitFor(() => expect(screen.getByText("Couldn't generate the prediction.")).toBeInTheDocument());

    db.invoke.mockResolvedValue({ data: conformingResult, error: null });
    pressRetry();

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    // The contract's percentage scale renders as sent.
    expect(screen.getByText('61.25%')).toBeInTheDocument();
    expect(screen.getByText('Predicted Winner')).toBeInTheDocument();
    expect(db.toast.success).toHaveBeenCalledWith('Prediction generated successfully');
  });

  it('renders a string response body as a result, not as raw text (matrix: non-conforming success)', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();
    db.invoke.mockResolvedValue({ data: JSON.stringify(conformingResult), error: null });

    submitPrediction();

    await waitFor(() => expect(screen.getByText('61.25%')).toBeInTheDocument());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps a genuinely missing series row as a toast, not a panel (matrix: broken preload)', async () => {
    db.single = { data: null, error: null };
    renderPage('/predict?series=does-not-exist');

    await waitFor(() => expect(db.toast.error).toHaveBeenCalledWith('Series not found'));
    expect(screen.queryByText("Couldn't load this series.")).toBeNull();
  });

  it('stops masking the result region after a failed preload when the fan picks a series (matrix: broken preload)', async () => {
    db.single = { data: null, error: new Error('bad request') };
    renderPage('/predict?series=s-1');
    await waitFor(() => expect(screen.getByText("Couldn't load this series.")).toBeInTheDocument());

    fireEvent.click(screen.getByText('Click to choose series'));
    fireEvent.click(await screen.findByRole('button', { name: /2020s/ }));
    fireEvent.click(await screen.findByRole('button', { name: /2022 View Series/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Finals/ }));

    await waitFor(() => expect(screen.getByText('BOS vs MIA')).toBeInTheDocument());
    expect(screen.queryByText("Couldn't load this series.")).toBeNull();
  });
});
