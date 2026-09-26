// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { METHOD_LABELS, METHOD_MATHS_ANCHORS } from '@/lib/method-display';
import type { MethodSlug } from '@/types/prediction';
import {
  chooseCustomMatchup,
  chooseMethod,
  conformingResult,
  fetchError,
  fillCustomForm,
  fillField,
  renderPage,
  renderPageWithLocationProbe,
  seriesFixture,
  submitPrediction,
} from './helpers';

// Story 1.4 (FR-30): the regression suite for the highest-risk Predict paths
// issue #3 named — series selection, `?series=` preload, custom inputs,
// method switching, New Prediction, and the method-label render surface. The
// error-state pages themselves are Story 1.3's file (same mock-and-helper
// harness via ./helpers); nothing here re-derives those assertions.
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

describe('PredictPage flow regressions (Story 1.4)', () => {
  it('selects a series through the decade → year → series picker and keeps it across back-navigation', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Click to choose series'));

    fireEvent.click(await screen.findByRole('button', { name: /2020s/ }));
    expect(screen.getByText('Select Year from 2020s')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /2022 View Series/ }));
    expect(screen.getByText('Select Series from 2022')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /BOS vs MIA/ }));

    // The trigger reflects the picked row, and the row's Games 1–6 render
    // through the selection — proof `selectedSeries.data` holds the series.
    expect(await screen.findByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.getByText('101 — 91')).toBeInTheDocument();
    expect(db.toast.success).toHaveBeenCalledWith('Series selected');

    // Back-navigation inside the picker never touches the prior choice.
    fireEvent.click(screen.getByText('BOS vs MIA'));
    fireEvent.click(await screen.findByRole('button', { name: /2020s/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Go Back/ }));
    expect(await screen.findByText('Select Decade')).toBeInTheDocument();
    expect(screen.getByText('101 — 91')).toBeInTheDocument();
  });

  it('populates the card from a ?series= preload and keeps the selection across a later method change', async () => {
    renderPage('/predict?series=s-1');
    expect(await screen.findByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.getByText('101 — 91')).toBeInTheDocument();
    // Full name resolved through the alias map to the real logo.
    expect(document.querySelector('img[src$="assets/teams/celtics.png"]')).not.toBeNull();

    await chooseMethod('Elo Rating');
    expect(screen.getByText('Elo Rating')).toBeInTheDocument();
    expect(screen.getByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.getByText('101 — 91')).toBeInTheDocument();
  });

  it('derives the custom trigger label from dict hits, initials and truncation', async () => {
    renderPage();
    await chooseCustomMatchup();
    // Blank names fall to 'TBD', never back to the old 'Team A'/'Team B' request fallback.
    expect(screen.getByText('TBD vs TBD')).toBeInTheDocument();

    fillField('team_a', 'Boston Celtics');
    expect(screen.getByText('BOS vs TBD')).toBeInTheDocument(); // dict hit
    fillField('team_b', 'Los Angeles');
    expect(screen.getByText('BOS vs LA')).toBeInTheDocument(); // multi-word initials
    fillField('team_a', 'Celtics');
    expect(screen.getByText('CEL vs LA')).toBeInTheDocument(); // single-word truncation
  });

  it('warns once per unrecognized custom name without blocking the request', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();

    fillField('team_a', 'Nowhere FC');
    fillField('team_b', 'Boston Celtics');
    for (let game = 1; game <= 6; game++) {
      fillField(`game_${game}_score_a`, `${100 + game}`);
      fillField(`game_${game}_score_b`, `${90 + game}`);
    }
    // Never fires on keystroke — this is a submit-time hint.
    expect(db.toast.warning).not.toHaveBeenCalled();
    // Not a field error, either.
    expect(document.getElementById('team_a')).not.toBeInvalid();

    db.invoke.mockResolvedValue({ data: conformingResult, error: null });
    submitPrediction();

    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    expect(db.invoke.mock.calls[0][1].body.team_a).toBe('Nowhere FC');
    // Exactly one non-blocking warning, naming the team and the placeholder —
    // 'Boston Celtics' is recognized and stays silent.
    expect(db.toast.warning).toHaveBeenCalledTimes(1);
    expect(db.toast.warning).toHaveBeenCalledWith(expect.stringContaining('Nowhere FC'));
    expect(db.toast.warning).toHaveBeenCalledWith(expect.stringContaining('placeholder'));
    // The prediction renders anyway, with the generic Team A placeholder logo.
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());
    expect(document.querySelector('img[src$="assets/teams/teama.png"]')).not.toBeNull();
    expect(document.getElementById('team_a')).not.toBeInvalid();
  });

  it('blocks the wire on invalid scores but treats 48 as only a non-blocking range hint', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();
    fillField('game_1_score_a', '-3');
    fillField('game_2_score_b', '0');

    submitPrediction();
    expect(await screen.findByText("Can't be negative")).toBeInTheDocument();
    expect(document.getElementById('game_1_score_a-error')).toHaveTextContent("Can't be negative");
    expect(document.getElementById('game_2_score_b-error')).toHaveTextContent('Score is required');
    expect(document.getElementById('game_1_score_a')).toHaveFocus();
    expect(db.invoke).not.toHaveBeenCalled();

    fillField('game_1_score_a', '48');
    fillField('game_2_score_b', '92');
    db.invoke.mockResolvedValue({ data: conformingResult, error: null });
    submitPrediction();

    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    expect(document.getElementById('game_1_score_a')).not.toBeInvalid();
    expect(db.toast.warning).toHaveBeenCalledTimes(1);
    expect(db.toast.warning).toHaveBeenCalledWith(
      'Note: Game 1 scores (48-91) are outside the typical 50-200 range'
    );
  });

  it('carries custom input through logistic → bayes → elo while clearing result, field errors and failure panels', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod('Logistic Regression');
    fillCustomForm();

    // A failed submit leaves the retry panel (default stub: transport failure).
    submitPrediction();
    await waitFor(() =>
      expect(screen.getByText("Couldn't generate the prediction.")).toBeInTheDocument()
    );

    // Switch 1: logistic → bayes clears the failure panel and resets nothing else.
    fireEvent.click(screen.getByText('Logistic Regression'));
    fireEvent.click(await screen.findByRole('button', { name: /Bayes Method/ }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Bayes Method')).toBeInTheDocument();
    expect((document.getElementById('team_a') as HTMLInputElement).value).toBe('BOS');

    // A field error is retired by the next switch, like the panel was.
    fillField('team_a', '');
    submitPrediction();
    expect(await screen.findByText('Team name is required')).toBeInTheDocument();

    // Switch 2: bayes → elo.
    fireEvent.click(screen.getByText('Bayes Method'));
    fireEvent.click(await screen.findByRole('button', { name: /Elo Rating/ }));
    expect(screen.queryByText('Team name is required')).toBeNull();
    expect((document.getElementById('team_b') as HTMLInputElement).value).toBe('MIA');
    expect((document.getElementById('game_6_score_a') as HTMLInputElement).value).toBe('106');

    // Switch 3: a showing result is cleared, custom input still survives.
    fillField('team_a', 'BOS');
    db.invoke.mockResolvedValue({ data: conformingResult, error: null });
    submitPrediction();
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Elo Rating'));
    fireEvent.click(await screen.findByRole('button', { name: /Bayes Method/ }));
    expect(screen.queryByText('Predicted Winner')).toBeNull();
    expect(screen.getByText('Bayes Method')).toBeInTheDocument();
    expect((document.getElementById('game_1_score_a') as HTMLInputElement).value).toBe('101');
  });

  // One test per MethodSlug: the picker option, its hardcoded "Details" anchor,
  // the card label and the details line must all equal what `method-display.ts`
  // says — drift in any of those places turns the suite red instead of showing
  // two names for one method or a "Details" link that jumps nowhere.
  (Object.entries(METHOD_LABELS) as [MethodSlug, string][]).forEach(([slug, label]) => {
    it(`labels '${slug}' identically in the picker, the card and the details line`, async () => {
      renderPage();
      await chooseCustomMatchup();

      fireEvent.click(screen.getByText('Click to choose method'));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(label)).toBeInTheDocument();
      const option = within(dialog).getByRole('button', { name: new RegExp(label) });
      // The dialog's option labels and anchors are literals, not reads of the maps.
      expect(within(option).getByRole('link', { name: 'Details' })).toHaveAttribute(
        'href',
        `/maths#${METHOD_MATHS_ANCHORS[slug]}`
      );
      fireEvent.click(option);
      expect(await screen.findByText(label)).toBeInTheDocument();

      fillCustomForm();
      db.invoke.mockResolvedValue({ data: { ...conformingResult, method_used: slug }, error: null });
      submitPrediction();
      await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());
      expect(db.invoke.mock.calls[0][1].body.method).toBe(slug);

      fireEvent.click(screen.getByText('View Detailed Analysis'));
      await waitFor(() => expect(screen.getByText('Prediction Result')).toBeInTheDocument());
      expect(screen.getByText(`Method: ${label}`)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /View Maths/ })).toHaveAttribute(
        'href',
        `/maths#${METHOD_MATHS_ANCHORS[slug]}`
      );
    });
  });

  it('clears the flow on New Prediction while preserving custom input, fetched games and the URL', async () => {
    renderPageWithLocationProbe('/predict?series=s-1');
    await screen.findByText('BOS vs MIA');

    // Move the preloaded selection over to the custom grid.
    fireEvent.click(screen.getByText('BOS vs MIA'));
    fireEvent.click(await screen.findByRole('button', { name: /Custom Matchup/ }));
    await chooseMethod();
    fillCustomForm();
    db.invoke.mockResolvedValue({ data: conformingResult, error: null });
    submitPrediction();
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View Detailed Analysis'));
    await waitFor(() => expect(screen.getByText('Prediction Result')).toBeInTheDocument());

    fireEvent.click(screen.getByText('New Prediction'));

    // Result, details, series and method are cleared...
    expect(screen.queryByText('Prediction Result')).toBeNull();
    expect(screen.getByText('Not selected')).toBeInTheDocument();
    expect(screen.getByText('Click to choose series')).toBeInTheDocument();
    // ...the URL is untouched, and nothing re-fetched the archive.
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/predict?series=s-1');
    expect(db.from).toHaveBeenCalledTimes(2); // mount list + preload, from before the reset

    // Custom input and the fetched games list survived the reset.
    fireEvent.click(screen.getByText('Click to choose series'));
    expect(await screen.findByText('Select Decade')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Custom Matchup/ }));
    expect((document.getElementById('team_a') as HTMLInputElement).value).toBe('BOS');
    expect((document.getElementById('game_6_score_b') as HTMLInputElement).value).toBe('96');
    expect(db.from).toHaveBeenCalledTimes(2);
  });
});
