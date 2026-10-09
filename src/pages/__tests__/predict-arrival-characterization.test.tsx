// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Profiler, useLayoutEffect, useState } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PredictPage from '@/pages/PredictPage';
import { allByRoleText, conformingResult, fetchError, renderPageWithNavigation, SERIES_ID, seriesFixture } from './helpers';

// Story 6.0 · characterization pins written against the *unrefactored* page,
// before the split into `src/pages/predict/`. Each one names a deferred-work
// entry that recorded the behaviour as untested; together they are the
// regression net for exactly what moving the arrival, selection and prediction
// state into separate hooks puts at risk (effect order and the two sequence
// guards). Same mock-and-helper harness as the other Predict suites.
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

// Load-sensitive, not slow (the Story 1.3 / 4.4 suites' precedent).
const SLOW = { timeout: 20000 };
const SUITE = { timeout: 60000 };

type Row = { data: unknown; error: unknown };

/**
 * Holds every `?series=` preload open until the test resolves it. `held[i]` is
 * the promise the page awaits, so a test can await the same promise: the
 * page's continuation was registered first and has therefore run by the time
 * the test's own await resumes — a condition, not a sleep.
 */
function holdPreloads() {
  const pending: ((value: Row) => void)[] = [];
  const held: Promise<Row>[] = [];
  db.from.mockImplementation(() => ({
    select: () => ({
      order: () => Promise.resolve(db.list),
      eq: () => ({
        maybeSingle: () => {
          const promise = new Promise<Row>((resolve) => {
            pending.push(resolve);
          });
          held.push(promise);
          return promise;
        },
      }),
    }),
  }));
  return { pending, held };
}

/** Resolves held preload `i` with the fixture row and lets the page commit what it does with it. */
async function landPreload(preloads: ReturnType<typeof holdPreloads>, i = 0) {
  await act(async () => {
    preloads.pending[i]({ data: seriesFixture, error: null });
    await preloads.held[i];
    await Promise.resolve();
  });
}

const notice = () => document.querySelector('[data-series-not-found]');

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

describe('PredictPage URL-arrival characterization (Story 6.0)', SUITE, () => {
  // deferred-work.md · 4.4 review V2: the `?custom=` branch bumps
  // `seriesLoadSeq`, so a `?series=` preload still in flight from the previous
  // URL is superseded and its late response is dropped.
  // Positive control for the pin below: the very same held response, with no
  // `?custom=` move in between, does select the series — so the pin's "nothing
  // selected" is the supersession at work, not a response that never lands.
  it('the held ?series= response selects its series when nothing supersedes it (control for 4.4 V2)', async () => {
    const preloads = holdPreloads();
    renderPageWithNavigation(`/predict?series=${SERIES_ID}`);
    await waitFor(() => expect(preloads.pending).toHaveLength(1), SLOW);
    expect(screen.queryByText('BOS vs MIA')).toBeNull();

    await landPreload(preloads);

    expect(screen.getByText('BOS vs MIA')).toBeInTheDocument();
    expect(notice()).toBeNull();
  });

  it('a ?custom= arrival supersedes a ?series= preload still in flight (4.4 V2)', async () => {
    const preloads = holdPreloads();
    const { goTo } = renderPageWithNavigation(`/predict?series=${SERIES_ID}`);
    await waitFor(() => expect(preloads.pending).toHaveLength(1), SLOW);

    goTo('/predict?custom=abc');
    await waitFor(
      () => expect(notice()?.querySelector('h2')?.textContent).toBe("This matchup link doesn't work."),
      SLOW,
    );

    // The preload from the old URL lands late, with a real row.
    await landPreload(preloads);

    // The notice stands, nothing is selected, and there is one live region.
    expect(notice()?.querySelector('h2')?.textContent).toBe("This matchup link doesn't work.");
    expect(screen.queryByText('BOS vs MIA')).toBeNull();
    expect(screen.getByText('Select a Series')).toBeInTheDocument();
    expect(document.getElementById('team_a')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(db.invoke).not.toHaveBeenCalled();
  });

  // deferred-work.md · 4.1 review V3: the effect's `else` branch retires the
  // not-found notice when the reader moves on to plain `/predict`.
  it('moving from a not-found ?series= link to plain /predict retires the notice (4.1 V3)', async () => {
    const { goTo } = renderPageWithNavigation('/predict?series=abc');
    await waitFor(() => expect(notice()?.querySelector('h2')?.textContent).toBe("This series doesn't exist."), SLOW);

    goTo('/predict');

    await waitFor(() => expect(notice()).toBeNull(), SLOW);
    expect(screen.getByText('Select a Series')).toBeInTheDocument();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  // deferred-work.md · 4.4 (found during the review-pass-1 fixes): a Generate
  // click that lands after a preload has *committed* its selection but before
  // that commit's passive effects have run is retired by the reset effect.
  // This pins today's outcome — a KNOWN DEFECT, kept on purpose by Story 6.0
  // (fixing it is out of scope): the request goes out once, its result never
  // paints, the spinner is released, and no success toast or
  // `prediction_generated` event fires.
  //
  // The window is produced deterministically: a sibling probe's state update is
  // batched into the same render as the preload's selection, and the probe's
  // layout effect — which runs after the DOM mutation but before any passive
  // effect of that commit — clicks Generate.
  //
  // DEPENDENCY: this relies on React 18 batching the probe's update and the
  // preload's selection updates into ONE commit inside `act`, and on layout
  // effects running before that commit's passive effects. If React stopped
  // batching them, the click would land in a later commit, after the reset
  // effect had run, and the result would paint — which would read as "defect
  // fixed" when only the harness changed. So the test first proves the click
  // landed in the very commit that painted the selection (counted with a
  // `<Profiler>`), and fails on that, explicitly, before the outcome asserts.
  it('a Generate click between a preload commit and its effects is dropped (4.4 preload race, pinned as-is)', async () => {
    const preloads = holdPreloads();
    let arm: () => void = () => {};
    let clicked = false;
    let commits = 0;
    let selectionCommit = -1;
    let clickCommit = -2;
    const countCommit = () => {
      commits++;
      if (selectionCommit < 0 && document.body.textContent?.includes('BOS vs MIA')) selectionCommit = commits;
    };
    function GenerateInCommitGap() {
      const [armed, setArmed] = useState(false);
      arm = () => setArmed(true);
      useLayoutEffect(() => {
        if (!armed || clicked) return;
        const generate = allByRoleText('button', 'Click to generate prediction');
        if (generate.length !== 1 || (generate[0] as HTMLButtonElement).disabled) return;
        clicked = true;
        clickCommit = commits;
        fireEvent.click(generate[0]);
      }, [armed]);
      return null;
    }

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/predict?series=${SERIES_ID}&method=elo`]}>
          <Profiler id="predict" onRender={countCommit}>
            <PredictPage />
          </Profiler>
          <GenerateInCommitGap />
        </MemoryRouter>
      </HelmetProvider>,
    );
    await waitFor(() => expect(preloads.pending).toHaveLength(1), SLOW);
    db.invoke.mockResolvedValue({ data: { ...conformingResult, method_used: 'elo' }, error: null });

    await act(async () => {
      preloads.pending[0]({ data: seriesFixture, error: null });
      // Let the preload's continuation queue its selection before the probe's
      // update joins the same batch.
      await preloads.held[0];
      await Promise.resolve();
      arm();
    });

    // The click really happened inside the gap — in the same commit that
    // painted the selection, so before that commit's reset effect — and sent
    // one request.
    expect(clicked).toBe(true);
    expect(clickCommit, 'harness drift: the click no longer lands in the selection commit (see DEPENDENCY above)').toBe(
      selectionCommit,
    );
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1), SLOW);
    expect(screen.getByText('BOS vs MIA')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Today's outcome: the response is treated as superseded.
    expect(screen.queryByText('Predicted Winner')).toBeNull();
    expect(screen.queryByText('Analyzing series data...')).toBeNull();
    expect(screen.getByText('Click anywhere to predict')).toBeInTheDocument();
    expect(allByRoleText('button', 'Click to generate prediction')[0]).toBeEnabled();
    expect(db.toast.success).not.toHaveBeenCalledWith('Prediction generated successfully');
    expect(db.capture.mock.calls.filter(([name]) => name === 'prediction_generated')).toEqual([]);

    // Not a dead end: the next Generate paints normally.
    fireEvent.click(allByRoleText('button', 'Click to generate prediction')[0]);
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument(), SLOW);
    expect(db.invoke).toHaveBeenCalledTimes(2);
  });

  // The reset's "leave the detailed view" step (the page's `onSelectionReset`):
  // a new selection arriving by URL while the detailed result is open sends
  // the reader back to the cards, with no result.
  it('a new ?series= arrival while the detailed view is open returns to the cards (reset → onSelectionReset)', async () => {
    const { goTo } = renderPageWithNavigation(`/predict?series=${SERIES_ID}&method=elo`);
    await screen.findByText('BOS vs MIA', {}, SLOW);
    await act(async () => {});
    db.invoke.mockResolvedValue({ data: { ...conformingResult, method_used: 'elo' }, error: null });
    fireEvent.click(allByRoleText('button', 'Click to generate prediction')[0]);
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument(), SLOW);
    fireEvent.click(screen.getByText('View Detailed Analysis'));
    await waitFor(() => expect(screen.getByText('Prediction Result')).toBeInTheDocument(), SLOW);

    const preloads = holdPreloads();
    goTo('/predict?series=00000000-0000-4000-8000-000000000001&method=bayes');
    await waitFor(() => expect(preloads.pending).toHaveLength(1), SLOW);
    await landPreload(preloads);

    await waitFor(() => expect(screen.queryByText('Prediction Result')).toBeNull(), SLOW);
    expect(screen.getByText('Series')).toBeInTheDocument();
    expect(screen.getByText('Predict')).toBeInTheDocument();
    expect(screen.getByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.getByText('Click anywhere to predict')).toBeInTheDocument();
    expect(screen.queryByText('Predicted Winner')).toBeNull();
  });
});
