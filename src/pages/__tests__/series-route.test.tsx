// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SERIES_SELECT } from '@/lib/series-query';
import SeriesRoute from '@/pages/SeriesRoute';
import { routes } from '@/routes';
import { SERIES_ID } from './helpers';
import { nonFlagship2018 } from './series-fixtures';

// Story 4.1 · I/O matrix rows for `/series/:id` (every row except Cold GET,
// which `scripts/probe-deep-links.mjs` measures against a real server). Since
// Story 4.3 the route fetches the full `SERIES_SELECT` row and a bare id
// renders the series page (`series-pages.test.tsx` covers the page variants);
// the `?method=` share arrival still redirects.
const KNOWN = { ...nonFlagship2018, id: SERIES_ID };
const db = vi.hoisted(() => ({
  single: { data: null as unknown, error: null as unknown },
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/db/supabase', () => ({ supabase: { from: db.from } }));

vi.mock('posthog-js', () => ({ default: { capture: db.capture, captureException: db.captureException } }));

beforeEach(() => {
  vi.clearAllMocks();
  db.single = { data: KNOWN, error: null };
  db.eq.mockImplementation(() => ({ maybeSingle: () => Promise.resolve(db.single) }));
  db.select.mockImplementation(() => ({ eq: db.eq }));
  db.from.mockImplementation(() => ({ select: db.select }));
});

function PredictProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="predict-probe">{`${location.pathname}${location.search}`}</span>
      <button type="button" onClick={() => navigate(-1)}>
        back
      </button>
    </>
  );
}

function renderRoute(entry: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/', entry]} initialIndex={1}>
        <Routes>
          <Route path="/" element={<span>home</span>} />
          <Route path="/series/:id" element={<SeriesRoute />} />
          <Route path="/predict" element={<PredictProbe />} />
          <Route path="/historical" element={<span>archive</span>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

function notFoundHeading() {
  return document.querySelector('[data-series-not-found] h1');
}

// Role finds the control and raw `textContent` pins its copy — a jsdom-computed
// accessible name is not evidence (AGENTS.md · Evidence discipline, F16). Same
// discipline as the shared Predict harness locators, kept local because this
// suite deliberately does not import `PredictPage`.
function byRoleText(role: 'button', expected: string, scope?: HTMLElement): HTMLElement {
  const root = scope ?? document.body;
  const matches = within(root)
    .queryAllByRole(role)
    .filter((el) => (el.textContent ?? '').includes(expected));
  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${role} matching "${expected}", found ${matches.length}`);
  }
  return matches[0];
}

describe('SeriesRoute (Story 4.1, as amended by Story 4.3)', () => {
  it('redirects a known id with a known method to Predict with both preloaded (matrix: share arrival)', async () => {
    renderRoute(`/series/${SERIES_ID}?method=elo`);

    expect(await screen.findByTestId('predict-probe')).toHaveTextContent(`/predict?series=${SERIES_ID}&method=elo`);
    expect(db.from).toHaveBeenCalledWith('series');
    expect(db.select).toHaveBeenCalledWith(SERIES_SELECT);
    expect(db.eq).toHaveBeenCalledWith('id', SERIES_ID);
    // Preloads emit nothing (D-continuity with Story 4.0).
    expect(db.capture).not.toHaveBeenCalled();
  });

  it('replaces the /series entry instead of pushing over it', async () => {
    renderRoute(`/series/${SERIES_ID}?method=elo`);
    await screen.findByTestId('predict-probe');

    // With `replace`, Back from Predict returns to where the arrival came from;
    // a pushed redirect would put /series/<id> one step back and bounce the
    // reader straight back into Predict.
    fireEvent.click(byRoleText('button', 'back'));
    expect(await screen.findByText('home')).toBeInTheDocument();
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it('renders the series page for a bare known id instead of redirecting (Story 4.3 replaces the 4.1 interim redirect)', async () => {
    renderRoute(`/series/${SERIES_ID}`);

    await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Cavaliers win Game 7'));
    expect(screen.queryByTestId('predict-probe')).toBeNull();
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.capture).not.toHaveBeenCalled();
  });

  it('drops an unknown method slug and still lands on the series (matrix: bad method)', async () => {
    renderRoute(`/series/${SERIES_ID}?method=foo`);

    expect(await screen.findByTestId('predict-probe')).toHaveTextContent(`/predict?series=${SERIES_ID}`);
    expect(screen.getByTestId('predict-probe').textContent).not.toContain('method');
  });

  it('renders the 404 treatment for a well-formed id that names no row (matrix: unknown id)', async () => {
    db.single = { data: null, error: null };
    renderRoute(`/series/${SERIES_ID}`);

    await waitFor(() => expect(notFoundHeading()).not.toBeNull());
    const heading = notFoundHeading() as HTMLElement;
    expect(heading.textContent).toBe("This series doesn't exist.");
    expect(screen.getByText('It may have been removed, or the link is wrong.')).toBeInTheDocument();
    // Focus moves to the headline, and the document title follows.
    expect(heading).toHaveFocus();
    expect(heading.getAttribute('tabindex')).toBe('-1');
    await waitFor(() => expect(document.title).toBe("This series doesn't exist."));
    // One onward action: the Historical archive.
    const link = screen.getByText('Browse the Historical archive →').closest('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/historical');
    expect(screen.queryByTestId('predict-probe')).toBeNull();
    fireEvent.click(link);
    expect(await screen.findByText('archive')).toBeInTheDocument();
  });

  it('renders the same 404 for a malformed id without any Supabase request (matrix: malformed id)', async () => {
    renderRoute('/series/abc?method=elo');

    await waitFor(() => expect(notFoundHeading()).not.toBeNull());
    expect(notFoundHeading()).toHaveFocus();
    expect(db.from).not.toHaveBeenCalled();
    expect(screen.queryByTestId('predict-probe')).toBeNull();
  });

  it('shows the retry panel on a query error, and Retry re-runs the lookup (matrix: lookup fails)', async () => {
    db.single = { data: null, error: new Error('network miss') };
    renderRoute(`/series/${SERIES_ID}?method=elo`);

    const panel = await screen.findByText("Couldn't load this series.");
    expect(notFoundHeading()).toBeNull();
    expect(db.captureException).toHaveBeenCalled();
    expect(db.from).toHaveBeenCalledTimes(1);

    // Second failure re-renders the panel — never a spinner loop.
    fireEvent.click(byRoleText('button', 'Retry', panel.closest('[role="status"]') as HTMLElement));
    await waitFor(() => expect(db.from).toHaveBeenCalledTimes(2));
    await screen.findByText("Couldn't load this series.");

    db.single = { data: KNOWN, error: null };
    fireEvent.click(byRoleText('button', 'Retry'));
    expect(await screen.findByTestId('predict-probe')).toHaveTextContent(`/predict?series=${SERIES_ID}&method=elo`);
    expect(db.from).toHaveBeenCalledTimes(3);
  });

  it('is wired into the real routes array, ahead of the * → / fallback', async () => {
    // Mirrors App.tsx's <Routes>: deleting or mistyping the `/series/:id`
    // entry would send /series/abc to Home instead of the 404.
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/series/abc']}>
          <Routes>
            {routes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    );

    await waitFor(() => expect(notFoundHeading()).not.toBeNull());
    expect(notFoundHeading()?.textContent).toBe("This series doesn't exist.");
    expect(db.from).not.toHaveBeenCalled();
  });
});
