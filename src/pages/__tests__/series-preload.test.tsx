// @vitest-environment jsdom
// Story 4.8 · the series routes consume a prerendered page's preload: when it
// was rendered for the current path the page renders from it with no fetch,
// and any other path fetches exactly as before.
import { render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SeriesResultRoute from '@/pages/SeriesResultRoute';
import SeriesRoute from '@/pages/SeriesRoute';
import { PreloadContext, type SeriesPreload, stripOutcome } from '@/prerender/preload';
import {
  FLAGSHIP_2016_ID,
  flagship2016,
  NON_FLAGSHIP_ID,
  nonFlagship2018,
  PENDING_NON_FLAGSHIP_ID,
  pendingNonFlagship,
} from './series-fixtures';

const db = vi.hoisted(() => ({
  single: { data: null as unknown, error: null as unknown },
  from: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/db/supabase', () => ({ supabase: { from: db.from } }));
vi.mock('posthog-js', () => ({ default: { capture: db.capture, captureException: db.captureException } }));

beforeEach(() => {
  vi.clearAllMocks();
  db.from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(db.single) }) }),
  }));
});

function PredictProbe() {
  const location = useLocation();
  return <span data-testid="predict-probe">{`${location.pathname}${location.search}`}</span>;
}

function renderAt(entry: string, preload: SeriesPreload | null) {
  return render(
    <HelmetProvider>
      <PreloadContext.Provider value={preload}>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/series/:id" element={<SeriesRoute />} />
            <Route path="/series/:id/result" element={<SeriesResultRoute />} />
            <Route path="/predict" element={<PredictProbe />} />
          </Routes>
        </MemoryRouter>
      </PreloadContext.Provider>
    </HelmetProvider>
  );
}

const recordPreload: SeriesPreload = { path: `/series/${NON_FLAGSHIP_ID}`, variant: 'record', reveal: false, series: nonFlagship2018 };
const previewPreload: SeriesPreload = {
  path: `/series/${FLAGSHIP_2016_ID}`,
  variant: 'preview',
  reveal: true,
  series: stripOutcome(flagship2016),
};
const resultPreload: SeriesPreload = { path: `/series/${FLAGSHIP_2016_ID}/result`, variant: 'result', reveal: false, series: flagship2016 };

function headline(): string {
  return document.getElementById('series-headline')?.textContent ?? '';
}

describe('a matching preload renders without a fetch', () => {
  it('record: the full record, no request', () => {
    renderAt(`/series/${NON_FLAGSHIP_ID}`, recordPreload);
    expect(headline()).toBe('Cavaliers win Game 7');
    expect(db.from).not.toHaveBeenCalled();
  });

  it('a trailing slash still matches (GitHub Pages 301s to the directory URL)', () => {
    renderAt(`/series/${NON_FLAGSHIP_ID}/`, recordPreload);
    expect(headline()).toBe('Cavaliers win Game 7');
    expect(db.from).not.toHaveBeenCalled();
  });

  it('preview: rendered from the stripped row, with the reveal link carried by the preload', () => {
    renderAt(`/series/${FLAGSHIP_2016_ID}`, previewPreload);
    expect(headline()).toBe('Cavaliers and Warriors stand three games apiece');
    const reveal = screen.getAllByRole('link').find((a) => (a.textContent ?? '').includes('See how the series ended'));
    expect(reveal?.getAttribute('href')).toBe(`/series/${FLAGSHIP_2016_ID}/result`);
    expect(document.body.textContent).not.toContain('win Game 7');
    expect(db.from).not.toHaveBeenCalled();
  });

  it('preview without `reveal`: the stripped row derives as pending, so no reveal link', () => {
    renderAt(`/series/${FLAGSHIP_2016_ID}`, { ...previewPreload, reveal: false });
    expect(headline()).toBe('Cavaliers and Warriors stand three games apiece');
    expect(document.body.textContent).not.toContain('See how the series ended');
  });

  it('result: the full record at /result, no request', () => {
    renderAt(`/series/${FLAGSHIP_2016_ID}/result`, resultPreload);
    expect(headline()).toBe('Cavaliers win Game 7');
    expect(db.from).not.toHaveBeenCalled();
  });

  it('a `?method=` arrival still redirects to Predict, with no request', async () => {
    renderAt(`/series/${NON_FLAGSHIP_ID}?method=elo`, recordPreload);
    await waitFor(() => expect(screen.getByTestId('predict-probe').textContent).toBe(`/predict?series=${NON_FLAGSHIP_ID}&method=elo`));
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('a preload for another path is ignored', () => {
  it('the preview path’s preload does not serve /result: that fetches', async () => {
    db.single = { data: flagship2016, error: null };
    renderAt(`/series/${FLAGSHIP_2016_ID}/result`, previewPreload);
    await waitFor(() => expect(headline()).toBe('Cavaliers win Game 7'));
    expect(db.from).toHaveBeenCalledWith('series');
  });

  it('another series fetches its own row', async () => {
    db.single = { data: flagship2016, error: null };
    renderAt(`/series/${FLAGSHIP_2016_ID}`, recordPreload);
    await waitFor(() => expect(headline()).toBe('Cavaliers and Warriors stand three games apiece'));
    expect(db.from).toHaveBeenCalledTimes(1);
  });
});

describe('a pending preview refreshes in the background (owner decision 2026-10-08, option b)', () => {
  const pendingPreload: SeriesPreload = {
    path: `/series/${PENDING_NON_FLAGSHIP_ID}`,
    variant: 'preview',
    reveal: false,
    series: stripOutcome(pendingNonFlagship),
  };
  const PENDING_HEADLINE = 'Celtics and Cavaliers stand three games apiece';

  it('renders the preload at once, then the full record once the live row comes back archived', async () => {
    db.single = { data: { ...nonFlagship2018, id: PENDING_NON_FLAGSHIP_ID }, error: null };
    renderAt(`/series/${PENDING_NON_FLAGSHIP_ID}/`, pendingPreload);
    expect(headline()).toBe(PENDING_HEADLINE);
    await waitFor(() => expect(headline()).toBe('Cavaliers win Game 7'));
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it('keeps the preload view when the refresh fails', async () => {
    db.single = { data: null, error: new Error('network down') };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAt(`/series/${PENDING_NON_FLAGSHIP_ID}/`, pendingPreload);
    await waitFor(() => expect(db.captureException).toHaveBeenCalled());
    expect(headline()).toBe(PENDING_HEADLINE);
    expect(document.body.textContent).not.toContain("Couldn't load this series.");
    quiet.mockRestore();
  });

  it('a series the database no longer has renders the 404', async () => {
    db.single = { data: null, error: null };
    renderAt(`/series/${PENDING_NON_FLAGSHIP_ID}/`, pendingPreload);
    await waitFor(() => expect(document.querySelector('[data-series-not-found] h1')).not.toBeNull());
  });

  it('record, flagship preview and result preloads never request', () => {
    renderAt(`/series/${NON_FLAGSHIP_ID}/`, recordPreload);
    renderAt(`/series/${FLAGSHIP_2016_ID}/`, previewPreload);
    renderAt(`/series/${FLAGSHIP_2016_ID}/result/`, resultPreload);
    expect(db.from).not.toHaveBeenCalled();
  });
});
