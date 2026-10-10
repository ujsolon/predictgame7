// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SERIES_PAGE_SELECT } from '@/lib/series-query';
import { routes } from '@/routes';
import { SERIES_ID } from './helpers';
import { aba1970, flagship2016HomeFirst, nonFlagship2018, pending2026 } from './series-fixtures';

// Story 4.1 · I/O matrix rows for `/series/:id` (every row except Cold GET,
// which `scripts/probe-deep-links.mjs` measures against a real server). Since
// Story 4.3 the route fetches the full series row (`SERIES_PAGE_SELECT` since Story 4.5) and a bare id
// renders the series page (`series-pages.test.tsx` covers the page variants);
// the `?method=` share arrival still redirects. Since Story 6.1 a uuid URL is
// the legacy form: it forwards to the slug URL (`/series/<year>/<slug>`), so
// these cases run on the real routes array.
const KNOWN = { ...nonFlagship2018, id: SERIES_ID };
const KNOWN_SLUG = '/series/2018/celtics-cavaliers';
const db = vi.hoisted(() => ({
  single: { data: null as unknown, error: null as unknown },
  year: { data: [] as unknown, error: null as unknown },
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
  db.year = { data: [KNOWN], error: null };
  db.eq.mockImplementation((column: string) =>
    column === 'year' ? Promise.resolve(db.year) : { maybeSingle: () => Promise.resolve(db.single) }
  );
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
          {routes
            .filter((route) => route.path.startsWith('/series'))
            .map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
          <Route path="/predict" element={<PredictProbe />} />
          <Route path="/historical" element={<PredictProbe />} />
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
    expect(db.select).toHaveBeenCalledWith(SERIES_PAGE_SELECT);
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

  it('renders the series page for a bare known id, at its slug URL (Story 4.3; Story 6.1 hop)', async () => {
    renderRoute(`/series/${SERIES_ID}`);

    await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Cavaliers win Game 7'));
    expect(screen.queryByTestId('predict-probe')).toBeNull();
    // The uuid lookup, then the slug page's own fetch — by the handed-over id, never a slug match.
    expect(db.from).toHaveBeenCalledTimes(2);
    expect(db.eq.mock.calls).toEqual([
      ['id', SERIES_ID],
      ['id', SERIES_ID],
    ]);
    expect(db.capture).not.toHaveBeenCalled();
  });

  it('drops an unknown method slug and still lands on the series (matrix: bad method)', async () => {
    renderRoute(`/series/${SERIES_ID}?method=foo`);

    expect(await screen.findByTestId('predict-probe')).toHaveTextContent(`/predict?series=${SERIES_ID}`);
    expect(screen.getByTestId('predict-probe').textContent).not.toContain('method');
  });

  // Story 4.4: attribution survives the redirect (SM-3) — every parameter other
  // than `series` and `method` rides along, in order.
  it('carries utm_source through the redirect (Story 4.4 matrix: share arrival)', async () => {
    renderRoute(`/series/${SERIES_ID}?method=elo&utm_source=share`);

    expect(await screen.findByTestId('predict-probe')).toHaveTextContent(
      `/predict?series=${SERIES_ID}&method=elo&utm_source=share`
    );
    expect(db.capture).not.toHaveBeenCalled();
  });

  it('carries every other parameter in order, and never a second series or method', async () => {
    renderRoute(`/series/${SERIES_ID}?utm_source=share&method=elo&series=other&ref=x%20y&utm_source=dup`);

    const probe = await screen.findByTestId('predict-probe');
    expect(probe.textContent).toBe(`/predict?series=${SERIES_ID}&method=elo&utm_source=share&ref=x+y&utm_source=dup`);
  });

  it('keeps utm_source when it drops an unknown method slug', async () => {
    renderRoute(`/series/${SERIES_ID}?method=foo&utm_source=share`);

    expect((await screen.findByTestId('predict-probe')).textContent).toBe(`/predict?series=${SERIES_ID}&utm_source=share`);
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
    expect((await screen.findByTestId('predict-probe')).textContent).toBe('/historical');
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

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe">{`${location.pathname}${location.search}${location.hash}`}</span>;
}

/** The real routes, plus a location readout that survives every redirect. */
function renderWithLocation(entry: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          {routes
            .filter((route) => route.path.startsWith('/series'))
            .map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
          <Route path="/predict" element={<span>predict</span>} />
          <Route path="/historical" element={<span>archive</span>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </HelmetProvider>
  );
}

const where = () => screen.getByTestId('location-probe').textContent;

// Story 6.1 · I/O matrix rows on the client (the cold-GET rows are the probe's).
describe('readable series URLs (Story 6.1)', () => {
  it('a slug URL resolves by a year query matched to the slug — a series born after the deploy needs no static file', async () => {
    db.year = { data: [aba1970, pending2026, flagship2016HomeFirst], error: null };
    renderWithLocation('/series/2026/thunder-spurs');
    await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Thunder and Spurs stand three games apiece'));
    expect(db.eq.mock.calls).toEqual([['year', 2026]]);
    expect(db.select).toHaveBeenCalledWith(SERIES_PAGE_SELECT);
    expect(where()).toBe('/series/2026/thunder-spurs');
  });

  it('the slug is stored order, home first: the reversed pair is not the same series', async () => {
    db.year = { data: [flagship2016HomeFirst], error: null };
    renderWithLocation('/series/2016/cavaliers-warriors');
    await waitFor(() => expect(notFoundHeading()?.textContent).toBe("This series doesn't exist."));
  });

  it('an unknown slug in a known year is the series 404', async () => {
    db.year = { data: [flagship2016HomeFirst], error: null };
    renderWithLocation('/series/2016/nope');
    await waitFor(() => expect(notFoundHeading()?.textContent).toBe("This series doesn't exist."));
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it.each(['/series/16/warriors-cavaliers', '/series/20166/warriors-cavaliers/result'])(
    'a year segment that is not 4 digits is the 404 with no request: %s',
    async (path) => {
      const { unmount } = renderWithLocation(path);
      await waitFor(() => expect(notFoundHeading()?.textContent).toBe("This series doesn't exist."));
      // Checked after the 404 rendered, so every effect has run.
      expect(db.from).not.toHaveBeenCalled();
      unmount();
    }
  );

  it('a case-variant or percent-encoded slug still matches (lowercased and URI-decoded)', async () => {
    db.year = { data: [flagship2016HomeFirst], error: null };
    const { unmount } = renderWithLocation('/series/2016/Warriors-Cavaliers');
    await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Warriors and Cavaliers stand three games apiece'));
    expect(db.eq.mock.calls).toEqual([['year', 2016]]);
    unmount();

    renderWithLocation('/series/2016/warriors%2Dcavaliers');
    await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Warriors and Cavaliers stand three games apiece'));
  });

  it('a ?method= arrival on the slug route forwards to Predict with every other parameter carried', async () => {
    renderWithLocation(`${KNOWN_SLUG}?method=elo&utm_source=share&ref=x`);
    await waitFor(() => expect(where()).toBe(`/predict?series=${SERIES_ID}&method=elo&utm_source=share&ref=x`));
    expect(db.capture).not.toHaveBeenCalled();
  });

  it('a uuid page URL is replaced by the slug URL, query and hash kept', async () => {
    renderWithLocation(`/series/${SERIES_ID}?utm_source=share#games`);
    await waitFor(() => expect(where()).toBe(`${KNOWN_SLUG}?utm_source=share#games`));
    await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Cavaliers win Game 7'));
  });

  it('a uuid page URL with ?method= reaches Predict with series, method and utm_source intact (matrix: old shared link)', async () => {
    renderWithLocation(`/series/${SERIES_ID}?method=elo&utm_source=share`);
    await waitFor(() => expect(where()).toBe(`/predict?series=${SERIES_ID}&method=elo&utm_source=share`));
  });

  it('a uuid result URL ends on the slug result path (matrix: old result link)', async () => {
    const featured = { ...flagship2016HomeFirst, id: SERIES_ID };
    db.single = { data: featured, error: null };
    renderWithLocation(`/series/${SERIES_ID}/result`);
    await waitFor(() => expect(where()).toBe('/series/2016/warriors-cavaliers/result'));
    await waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Cavaliers win Game 7'));
  });

  it('a 4-digit /series/<year> goes to Historical filtered to that year (matrix: year landing)', async () => {
    renderWithLocation('/series/1968');
    await waitFor(() => expect(where()).toBe('/historical?year=1968'));
    expect(db.from).not.toHaveBeenCalled();
  });

  it('/series goes to Historical', async () => {
    renderWithLocation('/series');
    await waitFor(() => expect(where()).toBe('/historical'));
    expect(db.from).not.toHaveBeenCalled();
  });
});
