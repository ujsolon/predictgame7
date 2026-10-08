// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeSharePayload, encodeSharePayload } from '@/lib/share-payload';
import type { SharePayload } from '@/types/prediction';
import {
  byRoleText,
  chooseCustomMatchup,
  chooseMethod,
  conformingResult,
  fetchError,
  fillField,
  renderPage,
  SERIES_ID,
  seriesFixture,
  submitPrediction,
} from './helpers';

// Story 4.4 · Share on Predict's detailed result, and the `?custom=` arrival.
// Same mock-and-helper harness as the Story 1.3/1.4 suites.
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

const ORIGIN = window.location.origin;
const BASE = import.meta.env.BASE_URL;

function setNavigator(share: unknown, writeText: unknown) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
    writable: true,
  });
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

afterEach(() => {
  setNavigator(undefined, undefined);
});

const shareButton = () => document.querySelector('[data-share-button]') as HTMLButtonElement | null;
const sharedEvents = () => db.capture.mock.calls.filter(([name]) => name === 'prediction_shared');

// Load-sensitive, not slow (the Story 1.3 suite's precedent): a full contended
// `npm test` run measured the first result paint past waitFor's 1 s default.
const SLOW = { timeout: 20000 };
const SUITE = { timeout: 60000 };

// A preload's selection commits before its effects run, and the reset effect
// (which supersedes any in-flight prediction) runs on that commit. A click in
// that gap — milliseconds no fan can hit — would have its result dropped, so
// arrivals flush pending effects before submitting.
const flushEffects = () => act(async () => {});

async function openDetails() {
  await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument(), SLOW);
  // No Share before the detailed view: the button sits in its header only.
  expect(shareButton()).toBeNull();
  fireEvent.click(screen.getByText('View Detailed Analysis'));
  await waitFor(() => expect(screen.getByText('Prediction Result')).toBeInTheDocument(), SLOW);
}

const montreal: SharePayload = {
  v: 1,
  team_a: 'Montréal',
  team_b: 'Miami Heat',
  scores: [101, 91, 92, 102, 103, 93, 94, 104, 105, 95, 96, 106],
  method: 'bayes',
};

describe('Share on the Predict detailed result (Story 4.4)', SUITE, () => {
  it('series result, desktop: copies …/series/<id>/?method=elo&utm_source=share and toasts "Link copied." (matrix row 1)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator(undefined, writeText);
    renderPage(`/predict?series=${SERIES_ID}&method=elo`);
    await screen.findByText('BOS vs MIA', {}, SLOW);
    await flushEffects();
    db.invoke.mockResolvedValue({ data: { ...conformingResult, method_used: 'elo' }, error: null });
    submitPrediction();
    await openDetails();

    const button = shareButton();
    expect(button?.textContent).toBe('Share');
    fireEvent.click(button as HTMLButtonElement);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(`${ORIGIN}${BASE}series/s-1/?method=elo&utm_source=share`);
    await waitFor(() => expect(db.toast.success).toHaveBeenCalledWith('Link copied.', { duration: 2000 }));
    expect(sharedEvents()).toEqual([['prediction_shared', { surface: 'predict', kind: 'series', channel: 'clipboard' }]]);
    // Sharing never re-runs or leaves the result.
    expect(db.invoke).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Prediction Result')).toBeInTheDocument();
  });

  it('mobile: opens the native sheet with that URL and no toast; a cancel does nothing (matrix row 2)', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator(share, vi.fn());
    renderPage(`/predict?series=${SERIES_ID}&method=elo`);
    await screen.findByText('BOS vs MIA', {}, SLOW);
    await flushEffects();
    db.invoke.mockResolvedValue({ data: { ...conformingResult, method_used: 'elo' }, error: null });
    submitPrediction();
    await openDetails();

    fireEvent.click(shareButton() as HTMLButtonElement);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0][0].url).toBe(`${ORIGIN}${BASE}series/s-1/?method=elo&utm_source=share`);
    expect(share.mock.calls[0][0].title).toBe('Boston Celtics vs Miami Heat — Game 7 on PredictGame7');
    await waitFor(() => expect(sharedEvents()).toHaveLength(1));
    expect(sharedEvents()[0][1]).toEqual({ surface: 'predict', kind: 'series', channel: 'native' });
    expect(db.toast.success).not.toHaveBeenCalledWith('Link copied.', expect.anything());

    const abort = new Error('cancel');
    abort.name = 'AbortError';
    share.mockRejectedValueOnce(abort);
    fireEvent.click(shareButton() as HTMLButtonElement);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(sharedEvents()).toHaveLength(1);
    expect(db.toast.error).not.toHaveBeenCalled();
  });

  it('custom result: copies …/predict/?custom=<payload>&utm_source=share that decodes to the matchup (matrix row 3)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator(undefined, writeText);
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod('Bayes Method');
    fillField('team_a', ' Montréal ');
    fillField('team_b', 'Miami Heat');
    montreal.scores.forEach((score, index) => {
      fillField(`game_${Math.floor(index / 2) + 1}_score_${index % 2 === 0 ? 'a' : 'b'}`, String(score));
    });
    db.invoke.mockResolvedValue({
      data: { ...conformingResult, method_used: 'bayes', team_a: 'Montréal', predicted_winner: 'Montréal' },
      error: null,
    });
    submitPrediction();
    await openDetails();

    fireEvent.click(shareButton() as HTMLButtonElement);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const url = new URL(writeText.mock.calls[0][0]);
    expect(`${url.origin}${url.pathname}`).toBe(`${ORIGIN}${BASE}predict/`);
    expect(url.search).toMatch(/^\?custom=[A-Za-z0-9_-]+&utm_source=share$/);
    expect(decodeSharePayload(url.searchParams.get('custom'))).toEqual(montreal);
    await waitFor(() => expect(sharedEvents()).toEqual([['prediction_shared', { surface: 'predict', kind: 'custom', channel: 'clipboard' }]]));
  });

  it('custom result, native sheet: titled with the matchup names exactly', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator(share, vi.fn());
    renderPage(`/predict?custom=${encodeSharePayload(montreal)}`);
    await waitFor(() => expect((document.getElementById('team_a') as HTMLInputElement | null)?.value).toBe('Montréal'), SLOW);
    await flushEffects();
    db.invoke.mockResolvedValue({
      data: { ...conformingResult, method_used: 'bayes', team_a: 'Montréal', team_b: 'Miami Heat', predicted_winner: 'Montréal' },
      error: null,
    });
    submitPrediction();
    await openDetails();

    fireEvent.click(shareButton() as HTMLButtonElement);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0][0].title).toBe('Montréal vs Miami Heat — Game 7 on PredictGame7');
    expect(decodeSharePayload(new URL(share.mock.calls[0][0].url).searchParams.get('custom'))).toEqual(montreal);
    await waitFor(() => expect(sharedEvents()).toEqual([['prediction_shared', { surface: 'predict', kind: 'custom', channel: 'native' }]]));
  });

  it('clipboard blocked: the address-bar toast, no throw, no event (matrix row 4)', async () => {
    setNavigator(undefined, vi.fn().mockRejectedValue(new Error('denied')));
    renderPage(`/predict?series=${SERIES_ID}&method=elo`);
    await screen.findByText('BOS vs MIA', {}, SLOW);
    await flushEffects();
    db.invoke.mockResolvedValue({ data: { ...conformingResult, method_used: 'elo' }, error: null });
    submitPrediction();
    await openDetails();

    fireEvent.click(shareButton() as HTMLButtonElement);
    await waitFor(() => expect(db.toast.error).toHaveBeenCalledWith("Couldn't copy — long-press the address bar to share."));
    expect(sharedEvents()).toEqual([]);
  });
});

describe('?custom= share arrival (Story 4.4)', SUITE, () => {
  const input = (id: string) => document.getElementById(id) as HTMLInputElement;

  it('prefills both names, the 12 scores and the method, and runs nothing until Generate (matrix: custom arrival)', async () => {
    renderPage(`/predict?custom=${encodeSharePayload(montreal)}&utm_source=share`);

    await waitFor(() => expect(input('team_a')?.value).toBe('Montréal'), SLOW);
    expect(input('team_b').value).toBe('Miami Heat');
    montreal.scores.forEach((score, index) => {
      expect(input(`game_${Math.floor(index / 2) + 1}_score_${index % 2 === 0 ? 'a' : 'b'}`).value).toBe(String(score));
    });
    expect(screen.getByText('Bayes Method')).toBeInTheDocument();
    expect(byRoleText('button', 'Click to generate prediction')).toBeEnabled();
    expect(db.invoke).not.toHaveBeenCalled();
    // A preload is not a fan action: no selection events, no toasts.
    expect(db.capture).not.toHaveBeenCalled();
    expect(db.toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText("This matchup link doesn't work.")).toBeNull();

    // Generate sends exactly the shared matchup.
    db.invoke.mockResolvedValue({ data: { ...conformingResult, method_used: 'bayes' }, error: null });
    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(db.invoke.mock.calls[0][1].body)).toBe(
      JSON.stringify({
        team_a: 'Montréal',
        team_b: 'Miami Heat',
        game_1_score_a: 101,
        game_1_score_b: 91,
        game_2_score_a: 92,
        game_2_score_b: 102,
        game_3_score_a: 103,
        game_3_score_b: 93,
        game_4_score_a: 94,
        game_4_score_b: 104,
        game_5_score_a: 105,
        game_5_score_b: 95,
        game_6_score_a: 96,
        game_6_score_b: 106,
        method: 'bayes',
      })
    );
  });

  const forge = (value: unknown) => encodeSharePayload(value as SharePayload);
  const malformed: [string, string][] = [
    ['not base64 JSON ("abc")', 'abc'],
    ['bad scores', forge({ ...montreal, scores: [0, ...montreal.scores.slice(1)] })],
    ['an unknown method', forge({ ...montreal, method: 'bayesian' })],
    ['an empty value', ''],
  ];
  for (const [label, value] of malformed) {
    it(`renders the not-found notice in the series card and sends nothing for ${label} (matrix: malformed custom)`, async () => {
      renderPage(`/predict?custom=${value}&utm_source=share`);

      const notice = await screen.findByText("This matchup link doesn't work.", {}, SLOW);
      expect(notice.tagName).toBe('H2');
      expect(notice.closest('[role="status"]')).not.toBeNull();
      expect(notice.closest('[data-series-not-found]')?.textContent).toContain('It may be incomplete or mistyped.');
      // The page keeps its own <h1> and title: an in-region notice, not a 404 page.
      expect(document.title).not.toBe("This matchup link doesn't work.");
      expect(document.getElementById('team_a')).toBeNull();
      expect(byRoleText('button', 'Select series and method first')).toBeDisabled();
      await new Promise((r) => setTimeout(r, 20));
      expect(db.invoke).not.toHaveBeenCalled();
      expect(db.capture).not.toHaveBeenCalled();
    });
  }

  it('choosing Custom Matchup by hand retires the notice', async () => {
    renderPage('/predict?custom=abc');
    await screen.findByText("This matchup link doesn't work.");
    await chooseCustomMatchup();
    await waitFor(() => expect(screen.queryByText("This matchup link doesn't work.")).toBeNull());
  });
});
