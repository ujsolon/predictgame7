// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SERIES_SELECT } from '@/lib/series-query';
import { routes } from '@/routes';
import {
  ABA_ID,
  BROKEN_FLAGSHIP_ID,
  BROKEN_ID,
  FIXTURES,
  FLAGSHIP_2016_GAME7,
  FLAGSHIP_2016_ID,
  NON_FLAGSHIP_ID,
  PENDING_ID,
  PENDING_NON_FLAGSHIP_ID,
} from './series-fixtures';

// Story 4.3 · I/O matrix (every row except SSR, which `series-ssr.test.tsx`
// renders in a node environment). Supabase answers from the fixture map by id.
const db = vi.hoisted(() => ({
  fail: false,
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
  db.fail = false;
  db.eq.mockImplementation((_column: string, id: string) => ({
    maybeSingle: () =>
      Promise.resolve(db.fail ? { data: null, error: new Error('network miss') } : { data: FIXTURES[id] ?? null, error: null }),
  }));
  db.select.mockImplementation(() => ({ eq: db.eq }));
  db.from.mockImplementation(() => ({ select: db.select }));
});

function PredictProbe() {
  const location = useLocation();
  return <span data-testid="predict-probe">{`${location.pathname}${location.search}`}</span>;
}

/** Sits outside `<Routes>`, so it survives the navigation it triggers. */
function JumpTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      jump
    </button>
  );
}

/**
 * The real `routes` array, as `App.tsx` mounts it, behind a Home entry. With
 * `jumpTo`, the case starts on `entry` and can then navigate to a second id on
 * the same route element — the only way to reach `KeyedById`'s remount.
 */
function renderApp(entry: string, jumpTo?: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={jumpTo ? [entry] : ['/', entry]} initialIndex={jumpTo ? 0 : 1}>
        {jumpTo && <JumpTo to={jumpTo} />}
        <Routes>
          {routes
            .filter((route) => route.path !== '/predict')
            .map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
          <Route path="/predict" element={<PredictProbe />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

const text = () => document.body.textContent ?? '';
const h1 = () => document.querySelector('h1') as HTMLHeadingElement;
const notFoundHeading = () => document.querySelector('[data-series-not-found] h1');
const anchors = () => Array.from(document.querySelectorAll('a'));
const hrefs = () => anchors().map((a) => a.getAttribute('href'));
const gameRows = () => Array.from(document.querySelectorAll('ol > li')).map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim());

async function headline(expected: string) {
  await waitFor(() => expect(h1()?.textContent).toBe(expected));
  return h1();
}

/** No venue, home or away label anywhere (AGENTS.md: archived home sides are mostly fiction). */
function expectNoVenue() {
  expect(text()).not.toMatch(/\b(home|away|venue|arena)\b/i);
  expect(text()).not.toMatch(/\bat (Cleveland|Boston|Golden State|Oracle|Denver|Washington)\b/);
}

describe('/series/:id — non-flagship archive (full record)', () => {
  it('renders the full record with scores mapped by team id and an outcome title', async () => {
    renderApp(`/series/${NON_FLAGSHIP_ID}`);
    await headline('Cavaliers win Game 7');

    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalledWith(SERIES_SELECT);
    expect(db.eq).toHaveBeenCalledWith('id', NON_FLAGSHIP_ID);

    expect(text()).toContain('GAME 7 · 2018 EASTERN CONFERENCE FINALS');
    expect(text()).toContain('Final series');
    expect(text()).toContain('4–3');
    expect(text()).toContain('Cavaliers over Celtics');
    // team_a (Celtics) is the loser and home sides alternate: by-id mapping.
    expect(gameRows()).toEqual([
      'Game 1 Celtics 108–83 Cavaliers',
      'Game 2 Celtics 107–94 Cavaliers',
      'Game 3 Celtics 86–116 Cavaliers',
      'Game 4 Celtics 102–111 Cavaliers',
      'Game 5 Celtics 96–83 Cavaliers',
      'Game 6 Celtics 99–109 Cavaliers',
      'Game 7 Celtics 79–87 Cavaliers',
    ]);
    // The Game 7 box, winner marked.
    // The summary cells precede the game list, so the first score line is the box.
    const box = document.querySelector('[data-game-winner]');
    expect(box?.closest('ol')).toBeNull();
    expect(box?.textContent).toBe('Celtics 79–87 Cavaliers');
    expect(box?.getAttribute('data-game-winner')).toBe('b');
    expect(box?.querySelector('strong')?.textContent).toBe('Cavaliers');

    // Generic CTA, no per-method links, no reveal.
    expect(text()).toContain('Model it yourself');
    expect(hrefs()).toContain(`/predict?series=${NON_FLAGSHIP_ID}`);
    expect(hrefs().some((href) => href?.includes('method='))).toBe(false);
    expect(text()).not.toContain('See how the series ended');
    expectNoVenue();

    await waitFor(() =>
      expect(document.title).toBe('Boston Celtics vs Cleveland Cavaliers, 2018 Eastern Conference Finals: Cavaliers win Game 7 · PredictGame7')
    );
    // A cold load does not steal focus onto the headline.
    expect(h1()).not.toHaveFocus();
    expect(db.capture).not.toHaveBeenCalled();
  });

  it('labels an ABA series with its league and prints no venue', async () => {
    renderApp(`/series/${ABA_ID}`);
    await headline('Rockets win Game 7');
    expect(text()).toContain('GAME 7 · 1970 ABA WESTERN DIVISION SEMIFINALS');
    expect(gameRows()).toHaveLength(7);
    expectNoVenue();
    // The title carries the stored league too, as the eyebrow does.
    await waitFor(() =>
      expect(document.title).toBe('Denver Rockets vs Washington Caps, 1970 ABA Western Division Semifinals: Rockets win Game 7 · PredictGame7')
    );
  });

  it('has no result page: /result is the 404, with no request', async () => {
    renderApp(`/series/${NON_FLAGSHIP_ID}/result`);
    await waitFor(() => expect(notFoundHeading()).not.toBeNull());
    expect(notFoundHeading()).toHaveFocus();
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('/series/:id — flagship preview (spoiler-free)', () => {
  it('renders games 1–6, the method links, the CTA and the reveal — and no Game 7 outcome in the DOM', async () => {
    renderApp(`/series/${FLAGSHIP_2016_ID}`);
    await headline('Cavaliers and Warriors stand three games apiece');

    expect(text()).toContain('GAME 7 · 2016 FINALS');
    expect(text()).toContain('Game 7 stands.');
    expect(text()).toContain('After six games');
    expect(text()).toContain('3–3');
    expect(gameRows()).toEqual([
      'Game 1 Cavaliers 89–104 Warriors',
      'Game 2 Cavaliers 77–110 Warriors',
      'Game 3 Cavaliers 120–90 Warriors',
      'Game 4 Cavaliers 97–108 Warriors',
      'Game 5 Cavaliers 112–97 Warriors',
      'Game 6 Cavaliers 115–101 Warriors',
    ]);

    // Spoiler discipline: absent from the DOM, not merely hidden.
    const body = text();
    const { cle, gsw } = FLAGSHIP_2016_GAME7;
    expect(body).not.toContain(`${cle}–${gsw}`);
    expect(body).not.toContain(`${gsw}–${cle}`);
    expect(body).not.toContain(String(cle));
    expect(body).not.toContain('4–3');
    expect(body).not.toContain('Final series');
    expect(body).not.toContain('win Game 7');
    expect(body).not.toMatch(/Cavaliers (win|won|over)/);
    expect(body).not.toMatch(/Cleveland Cavaliers (win|won|over)/);
    expect(document.body.innerHTML).not.toContain(`>${cle}<`);
    expect(gameRows().some((row) => row.startsWith('Game 7'))).toBe(false);
    await waitFor(() => expect(document.title).toBe('Cleveland Cavaliers vs Golden State Warriors — Game 7, 2016 Finals · PredictGame7'));
    expect(document.title).not.toMatch(/win|over|4–3/);
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
    expect(description).not.toMatch(/win|over|4–3|93/);

    // The four method links, labelled from METHOD_LABELS.
    const methodLinks = anchors().filter((a) => a.getAttribute('href')?.includes('method='));
    expect(methodLinks.map((a) => [a.textContent?.replace('→', '').trim(), a.getAttribute('href')])).toEqual([
      ['Logistic Regression', `/predict?series=${FLAGSHIP_2016_ID}&method=logistic_regression`],
      ['Bayes Method', `/predict?series=${FLAGSHIP_2016_ID}&method=bayes`],
      ['Elo Rating', `/predict?series=${FLAGSHIP_2016_ID}&method=elo`],
      ['Exponential Smoothing', `/predict?series=${FLAGSHIP_2016_ID}&method=exponential_smoothing`],
    ]);
    // Sentence case in the DOM; the label motif uppercases it in CSS.
    expect(text()).toContain('The models have their picks');

    // The CTA, then — below both — the reveal.
    const cta = anchors().find((a) => a.getAttribute('href') === `/predict?series=${FLAGSHIP_2016_ID}`) as HTMLAnchorElement;
    expect(text()).toContain('Model this matchup yourself');
    const reveal = anchors().find((a) => a.getAttribute('href') === `/series/${FLAGSHIP_2016_ID}/result`) as HTMLAnchorElement;
    expect(reveal.textContent).toBe('See how the series ended →');
    expect(text()).toContain('Spoilers for Game 7 ahead.');
    const after = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(methodLinks[3], cta)).toBe(true);
    expect(after(cta, reveal)).toBe(true);
    expectNoVenue();
  });

  it('reveal → the result page: full record, outcome title, focus on the <h1>', async () => {
    renderApp(`/series/${FLAGSHIP_2016_ID}`);
    await headline('Cavaliers and Warriors stand three games apiece');
    fireEvent.click(screen.getByText('See how the series ended', { exact: false }).closest('a') as HTMLAnchorElement);

    const heading = await headline('Cavaliers win Game 7');
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(db.from).toHaveBeenCalledTimes(2);
    expect(gameRows()).toHaveLength(7);
    expect(gameRows()[6]).toBe('Game 7 Cavaliers 93–89 Warriors');
    expect(text()).toContain('Cavaliers over Warriors');
    expect(text()).toContain('Model it yourself');
    expect(hrefs().some((href) => href?.includes('method='))).toBe(false);
    expect(text()).not.toContain('See how the series ended');
    await waitFor(() =>
      expect(document.title).toBe('Cleveland Cavaliers vs Golden State Warriors, 2016 Finals: Cavaliers win Game 7 · PredictGame7')
    );
  });

  it('a cold /result load renders the result without moving focus (POP)', async () => {
    renderApp(`/series/${FLAGSHIP_2016_ID}/result`);
    const heading = await headline('Cavaliers win Game 7');
    expect(heading).not.toHaveFocus();
  });

  it('/result: a fetch error shows the retry panel, and Retry re-fetches', async () => {
    db.fail = true;
    renderApp(`/series/${FLAGSHIP_2016_ID}/result`);
    await screen.findByText("Couldn't load this series.");
    db.fail = false;
    fireEvent.click(screen.getByText('Retry'));
    await headline('Cavaliers win Game 7');
    expect(db.from).toHaveBeenCalledTimes(2);
  });
});

describe('/series/:id — pending series', () => {
  it('renders the preview with no reveal; its /result is the 404', async () => {
    renderApp(`/series/${PENDING_ID}`);
    await headline('Spurs and Thunder stand three games apiece');
    // Neutral order must reach the game rows, not just the headline and title:
    // the fixture stores Thunder (`team_a`, the eventual winner) first, so a
    // strip rendered from the stored view reads "Thunder 122–116 Spurs" and
    // re-leaks the `team_a`-is-winner pattern per row (owner decision E14).
    expect(gameRows()).toEqual([
      'Game 1 Spurs 116–122 Thunder',
      'Game 2 Spurs 108–101 Thunder',
      'Game 3 Spurs 114–106 Thunder',
      'Game 4 Spurs 99–105 Thunder',
      'Game 5 Spurs 102–117 Thunder',
      'Game 6 Spurs 118–110 Thunder',
    ]);
    expect(text()).not.toContain('See how the series ended');
    expect(text()).not.toContain('Spoilers');
    expect(anchors().filter((a) => a.getAttribute('href')?.includes('method='))).toHaveLength(4);
    await waitFor(() =>
      expect(document.title).toBe('San Antonio Spurs vs Oklahoma City Thunder — Game 7, 2026 Western Conference Finals · PredictGame7')
    );
  });

  it('a pending non-flagship series renders the preview with no reveal; its /result is the 404 with no request', async () => {
    renderApp(`/series/${PENDING_NON_FLAGSHIP_ID}`);
    await headline('Cavaliers and Celtics stand three games apiece');
    // Stored order is Celtics first (`team_a`); neutral order swaps it.
    expect(gameRows()).toEqual([
      'Game 1 Cavaliers 101–110 Celtics',
      'Game 2 Cavaliers 104–98 Celtics',
      'Game 3 Cavaliers 112–107 Celtics',
      'Game 4 Cavaliers 95–103 Celtics',
      'Game 5 Cavaliers 109–118 Celtics',
      'Game 6 Cavaliers 106–99 Celtics',
    ]);
    expect(text()).not.toContain('See how the series ended');
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it('/result for a pending non-flagship series is the 404 with no request', async () => {
    renderApp(`/series/${PENDING_NON_FLAGSHIP_ID}/result`);
    await waitFor(() => expect(notFoundHeading()).not.toBeNull());
    expect(db.from).not.toHaveBeenCalled();
  });

  it('/result for a pending series (even a pinned flagship id) is the 404', async () => {
    renderApp(`/series/${PENDING_ID}/result`);
    await waitFor(() => expect(notFoundHeading()).not.toBeNull());
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain('win Game 7');
  });
});

describe('/series/:id — 404, redirect and retry rows', () => {
  it('share arrival still redirects to Predict (Story 4.1)', async () => {
    renderApp(`/series/${FLAGSHIP_2016_ID}?method=elo`);
    expect(await screen.findByTestId('predict-probe')).toHaveTextContent(`/predict?series=${FLAGSHIP_2016_ID}&method=elo`);
  });

  it('an unknown id is the 404 (title and focus)', async () => {
    renderApp('/series/00000000-0000-4000-8000-000000000000');
    await waitFor(() => expect(notFoundHeading()).not.toBeNull());
    expect(notFoundHeading()).toHaveFocus();
    await waitFor(() => expect(document.title).toBe("This series doesn't exist."));
  });

  it('a malformed /result id is the 404 with no request', async () => {
    renderApp('/series/abc/result');
    await waitFor(() => expect(notFoundHeading()).not.toBeNull());
    expect(db.from).not.toHaveBeenCalled();
  });

  it('a row whose phase does not reconcile is the 404', async () => {
    renderApp(`/series/${BROKEN_ID}`);
    await waitFor(() => expect(notFoundHeading()).not.toBeNull());
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain('win Game 7');
    // Reported, never silent — named by its id (as PredictPage reports non-reconciling rows).
    await waitFor(() => expect(db.captureException).toHaveBeenCalledTimes(1));
    expect(String(db.captureException.mock.calls[0][0])).toContain(BROKEN_ID);
  });

  it('a flagship row whose phase does not reconcile is the 404 on /result, reported', async () => {
    // A flagship id is the only shape that reaches this branch: a non-flagship
    // `/result` short-circuits before any request, so `BROKEN_ID` cannot.
    renderApp(`/series/${BROKEN_FLAGSHIP_ID}/result`);
    await waitFor(() => expect(notFoundHeading()).not.toBeNull());
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain('win Game 7');
    await waitFor(() => expect(db.captureException).toHaveBeenCalledTimes(1));
    expect(String(db.captureException.mock.calls[0][0])).toContain(BROKEN_FLAGSHIP_ID);
  });

  it('navigating to a second series does not redirect off the first one\'s state (KeyedById)', async () => {
    renderApp(`/series/${NON_FLAGSHIP_ID}`, `/series/${FLAGSHIP_2016_ID}?method=elo`);
    await headline('Cavaliers win Game 7');

    fireEvent.click(screen.getByText('jump'));

    // The remount per `:id` is what makes B wait for its own fetch. Without the
    // key the component keeps A's `found` state for one commit, and the
    // `?method=` branch redirects B to Predict before B is ever looked up
    // (review row B8). The bare stale paint of A's page is the same defect, but
    // it is one commit that `act` collapses before the fetch effect resets it,
    // so the redirect timing is the half jsdom can actually see.
    expect(screen.queryByTestId('predict-probe')).toBeNull();
    expect(db.from).toHaveBeenCalledTimes(2);
    expect(db.eq).toHaveBeenLastCalledWith('id', FLAGSHIP_2016_ID);
    expect(text()).toContain('Loading series…');
    expect(text()).not.toContain('Cavaliers win Game 7');

    await waitFor(() =>
      expect(screen.getByTestId('predict-probe')).toHaveTextContent(`/predict?series=${FLAGSHIP_2016_ID}&method=elo`)
    );
  });

  it('a fetch error shows the retry panel with its own title, and Retry re-fetches into the page', async () => {
    db.fail = true;
    renderApp(`/series/${NON_FLAGSHIP_ID}`);
    await screen.findByText("Couldn't load this series.");
    // The error state owns its title: without one the tab keeps whatever the
    // previous page set — an outcome title, on a page that failed to load.
    await waitFor(() => expect(document.title).toBe("Couldn't load this series."));
    db.fail = false;
    fireEvent.click(screen.getByText('Retry'));
    await headline('Cavaliers win Game 7');
    expect(db.from).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(document.title).toBe('Boston Celtics vs Cleveland Cavaliers, 2018 Eastern Conference Finals: Cavaliers win Game 7 · PredictGame7')
    );
  });
});

// Story 4.4 · the header Share button shares the page's own canonical URL
// (trailing-slash directory form) plus `utm_source=share`.
describe('series header Share (Story 4.4)', () => {
  async function shareFrom(entry: string, expectedHeadline: string) {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
    renderApp(entry);
    await headline(expectedHeadline);
    const buttons = document.querySelectorAll('[data-share-button]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Share this series');
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(db.capture).toHaveBeenCalledTimes(1));
    return writeText.mock.calls[0][0] as string;
  }

  it('result page: …/series/<id>/result/?utm_source=share (matrix: series header share)', async () => {
    const url = await shareFrom(`/series/${FLAGSHIP_2016_ID}/result`, 'Cavaliers win Game 7');
    expect(url).toBe(`${window.location.origin}${import.meta.env.BASE_URL}series/${FLAGSHIP_2016_ID}/result/?utm_source=share`);
    expect(db.capture.mock.calls[0]).toEqual(['prediction_shared', { surface: 'series', kind: 'series', channel: 'clipboard' }]);
  });

  it('preview page: …/series/<id>/?utm_source=share', async () => {
    const url = await shareFrom(`/series/${FLAGSHIP_2016_ID}`, 'Cavaliers and Warriors stand three games apiece');
    expect(url).toBe(`${window.location.origin}${import.meta.env.BASE_URL}series/${FLAGSHIP_2016_ID}/?utm_source=share`);
  });

  it('full-record page: …/series/<id>/?utm_source=share', async () => {
    const url = await shareFrom(`/series/${NON_FLAGSHIP_ID}`, 'Cavaliers win Game 7');
    expect(url).toBe(`${window.location.origin}${import.meta.env.BASE_URL}series/${NON_FLAGSHIP_ID}/?utm_source=share`);
  });
});

// Story 4.4 review: the native sheet's title is the page's own title — winner-free on the preview.
describe('series header Share — native sheet title (Story 4.4)', () => {
  async function nativeTitleFrom(entry: string, expectedHeadline: string) {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
    renderApp(entry);
    await headline(expectedHeadline);
    fireEvent.click(document.querySelector('[data-share-button]') as HTMLButtonElement);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
    return share.mock.calls[0][0] as { url: string; title: string };
  }

  it('flagship preview: the winner-free page title', async () => {
    const { title, url } = await nativeTitleFrom(`/series/${FLAGSHIP_2016_ID}`, 'Cavaliers and Warriors stand three games apiece');
    expect(title).toBe('Cleveland Cavaliers vs Golden State Warriors — Game 7, 2016 Finals · PredictGame7');
    expect(title).not.toMatch(/win|over|4–3/);
    expect(url).toBe(`${window.location.origin}${import.meta.env.BASE_URL}series/${FLAGSHIP_2016_ID}/?utm_source=share`);
  });

  it('flagship result: the outcome title', async () => {
    const { title } = await nativeTitleFrom(`/series/${FLAGSHIP_2016_ID}/result`, 'Cavaliers win Game 7');
    expect(title).toBe('Cleveland Cavaliers vs Golden State Warriors, 2016 Finals: Cavaliers win Game 7 · PredictGame7');
  });
});
