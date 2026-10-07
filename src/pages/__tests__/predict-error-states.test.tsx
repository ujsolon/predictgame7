// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chooseCustomMatchup,
  chooseMethod,
  clickDecadeCard,
  clickYearCard,
  conformingResult,
  fetchError,
  fillCustomForm,
  fillField,
  httpError,
  panel,
  pressRetry,
  renderPage,
  renderPageWithNavigation,
  seriesFixture,
  submitPrediction,
  SERIES_ID,
} from './helpers';

// The whole file is about what the page *does* with a classified failure, so
// every boundary is stubbed: `vi.hoisted` keeps the controllable result objects
// reachable from the mocked module factory. (Shared page/DOM helpers live in
// `./helpers.tsx`, reused by the Story 1.4 flow-regression suite.)
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

vi.mock('posthog-js', () => ({ default: { capture: db.capture, captureException: db.captureException } }));

vi.mock('sonner', () => ({ toast: db.toast }));

const TRANSPORT_COPY = "Couldn't reach the prediction service. It may be briefly unavailable.";

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
  // Per-case budget, not a global raise (the Story 2.12/2.13 precedent): this is
  // the suite's heaviest case and it is load-sensitive, not slow — 609-686 ms
  // standalone, 1872 ms in an uncontended full run, and 5177-5700 ms in the
  // contended ones, which is how it blew the 5000 ms default and turned `npm run
  // gate` red on a green tree. 30 s is ~5x the worst observed under load.
  it(
    'replaces the result region with the server envelope string, not raw JSON (matrix: function rejects)',
    async () => {
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
    },
    30_000,
  );

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
    renderPage(`/predict?series=${SERIES_ID}`);

    // The preloaded selection lands asynchronously — wait for the trigger.
    fireEvent.click(await screen.findByText('BOS vs MIA'));
    await screen.findByText("Couldn't load the series list.");

    db.list = { data: [seriesFixture], error: null };
    pressRetry();

    await waitFor(() => expect(screen.getByText('Select Decade')).toBeInTheDocument());
    expect(screen.queryByText("Couldn't load the series list.")).toBeNull();
    // The preloaded selection survived the failure and the retry — proven
    // through its own game rows under the trigger, because with the picker
    // open at decade level the derived Active group now also lists the same
    // matchup (Story 2.2: the group is always present).
    expect(screen.getByText('101 — 91')).toBeInTheDocument();
    expect(db.from).toHaveBeenCalledWith('series');
    // Story 4.0 pass-2 review: a list-fetch failure must reach the exception
    // stream through the port. The preload succeeded, so this is the render's
    // only exception — pin the single call and the error it carries.
    expect(db.captureException).toHaveBeenCalledTimes(1);
    expect((db.captureException.mock.calls[0]?.[0] as Error).message).toBe('series select failed');
  });

  it('treats a failed ?series= query as retryable in the result region (matrix: broken preload)', async () => {
    db.single = { data: null, error: new Error('bad request') };
    renderPage(`/predict?series=${SERIES_ID}`);

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

  // Story 4.1 retired the "Series not found" toast: a genuinely missing row is
  // not retryable, so it gets the in-region 404 treatment instead.
  it('renders an absent ?series= row as the in-region not-found, not a toast or a panel (Story 4.1 matrix: Predict unknown series)', async () => {
    db.single = { data: null, error: null };
    renderPage(`/predict?series=${SERIES_ID}`);

    const heading = await screen.findByRole('heading', { level: 2 });
    expect(heading.textContent).toBe("This series doesn't exist.");
    expect(screen.getByText('It may have been removed, or the link is wrong.')).toBeInTheDocument();
    expect(screen.getByText('Browse the Historical archive →').closest('a')?.getAttribute('href')).toBe('/historical');
    // The page keeps its own <h1>, and focus is not stolen from <body>.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Win Probability');
    expect(heading).not.toHaveFocus();
    expect(db.toast.error).not.toHaveBeenCalled();
    expect(screen.queryByText("Couldn't load this series.")).toBeNull();
    // The notice lands asynchronously, so the role is what announces it
    // (WCAG 4.1.3). Asserted as an attribute, never as a computed name.
    expect(document.querySelector('[data-series-not-found]')?.parentElement?.getAttribute('role')).toBe('status');
    // Predict owns its own title: the 404 copy must never reach the tab.
    expect(document.title).not.toBe("This series doesn't exist.");
  });

  it('reports an unknown ?series= arrival even while a stale selection is on screen (Story 4.1 review pass 2: the toast this replaced always did)', async () => {
    const { goTo } = renderPageWithNavigation(`/predict?series=${SERIES_ID}`);
    // The first preload lands and is selected — the fan has a series on screen.
    await screen.findByText('BOS vs MIA');

    db.single = { data: null, error: null };
    // Home links `/predict?series=<id>` into the mounted page: `searchParams`
    // change without a remount, so the old selection stays put. A cold render
    // cannot produce this state, which is why the notice's own guard was
    // invisible to every other test in the file.
    goTo('/predict?series=00000000-0000-0000-0000-000000000000');

    await waitFor(() =>
      expect(document.querySelector('[data-series-not-found] h2')?.textContent).toBe("This series doesn't exist."),
    );
    expect(screen.getByText('BOS vs MIA')).toBeInTheDocument();
    expect(db.toast.error).not.toHaveBeenCalled();
  });

  it('leaves the notice standing when the fan picks a method, because only a series change retires it (Story 4.1 review pass 2)', async () => {
    renderPage('/predict?series=abc');
    await waitFor(() => expect(document.querySelector('[data-series-not-found]')).not.toBeNull());

    await chooseMethod();

    expect(document.querySelector('[data-series-not-found] h2')?.textContent).toBe("This series doesn't exist.");
  });

  it('replaces the notice with the retry panel when the next arrival errors, rather than rendering both (Story 4.1 review pass 2)', async () => {
    const { goTo } = renderPageWithNavigation('/predict?series=abc');
    await waitFor(() => expect(document.querySelector('[data-series-not-found]')).not.toBeNull());

    db.single = { data: null, error: new Error('network miss') };
    goTo(`/predict?series=${SERIES_ID}`);

    await waitFor(() => expect(screen.getByText("Couldn't load this series.")).toBeInTheDocument());
    // One treatment per region: two `role="status"` blocks would also make the
    // shared `panel()` helper throw on the double.
    expect(document.querySelector('[data-series-not-found]')).toBeNull();
  });

  it('treats a malformed ?series= id as not found without querying it (Story 4.1 matrix: Predict malformed series)', async () => {
    const byId = vi.fn(() => ({ maybeSingle: () => Promise.resolve(db.single) }));
    db.from.mockImplementation(() => ({
      select: () => ({ order: () => Promise.resolve(db.list), eq: byId }),
    }));
    renderPage('/predict?series=does-not-exist');

    await waitFor(() => expect(document.querySelector('[data-series-not-found] h2')?.textContent).toBe("This series doesn't exist."));
    expect(db.toast.error).not.toHaveBeenCalled();
    // The mount-time list fetch still runs; the by-id preload never does —
    // re-checked after the page has settled, so a late query cannot slip by.
    await waitFor(() => expect(screen.getByRole('button', { name: /Click to choose series/ })).toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(byId).not.toHaveBeenCalled();
    expect(screen.queryByText("Couldn't load this series.")).toBeNull();
  });

  it('keeps the picker working beside the not-found notice, and a pick retires it (Story 4.1 matrix: Predict unknown series)', async () => {
    renderPage('/predict?series=abc');
    await waitFor(() => expect(document.querySelector('[data-series-not-found]')).not.toBeNull());

    fireEvent.click(screen.getByText('Click to choose series'));
    clickDecadeCard(2020);
    await clickYearCard(2022);
    fireEvent.click(await screen.findByRole('button', { name: /Finals/ }));

    await waitFor(() => expect(screen.getByText('BOS vs MIA')).toBeInTheDocument());
    expect(document.querySelector('[data-series-not-found]')).toBeNull();
  });

  it('stops masking the result region after a failed preload when the fan picks a series (matrix: broken preload)', async () => {
    db.single = { data: null, error: new Error('bad request') };
    renderPage(`/predict?series=${SERIES_ID}`);
    await waitFor(() => expect(screen.getByText("Couldn't load this series.")).toBeInTheDocument());

    fireEvent.click(screen.getByText('Click to choose series'));
    clickDecadeCard(2020);
    // Derived label: the fixture reads pending, so the year card says
    // `Current`, not `View Series` (Story 2.2).
    await clickYearCard(2022);
    fireEvent.click(await screen.findByRole('button', { name: /Finals/ }));

    await waitFor(() => expect(screen.getByText('BOS vs MIA')).toBeInTheDocument());
    expect(screen.queryByText("Couldn't load this series.")).toBeNull();
  });

  it('keeps a hand-fetched result when a slow preload failure lands afterwards (review P1)', async () => {
    // The preload hangs while the fan works; it only rejects once the
    // prediction is already on screen.
    let rejectPreload: () => void = () => {};
    db.from.mockImplementation(() => ({
      select: () => ({
        order: () => Promise.resolve(db.list),
        eq: () => ({
          maybeSingle: () =>
            new Promise((_resolve, reject) => {
              rejectPreload = () => reject(new Error('late network miss'));
            }),
        }),
      }),
    }));
    renderPage(`/predict?series=${SERIES_ID}`);

    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();
    db.invoke.mockResolvedValue({ data: conformingResult, error: null });
    submitPrediction();
    await waitFor(() => expect(screen.getByText('61.25%')).toBeInTheDocument());

    rejectPreload();

    // The failure is still reported to analytics…
    await waitFor(() => expect(db.captureException).toHaveBeenCalled());
    // …but the superseded preload must not mask the result or the inputs.
    expect(screen.queryByText("Couldn't load this series.")).toBeNull();
    expect(screen.getByText('61.25%')).toBeInTheDocument();
    expect((document.getElementById('team_a') as HTMLInputElement).value).toBe('BOS');
  });

  it('never turns a completed prediction into a failure panel when a success side-effect throws (review P2)', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();
    db.invoke.mockResolvedValue({ data: conformingResult, error: null });
    db.capture.mockImplementationOnce(() => {
      throw new Error('analytics down');
    });

    submitPrediction();

    await waitFor(() => expect(screen.getByText('61.25%')).toBeInTheDocument());
    expect(screen.queryByText("Couldn't generate the prediction.")).toBeNull();
    expect(db.toast.success).toHaveBeenCalledWith('Prediction generated successfully');
  });
});
