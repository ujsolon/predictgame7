// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { METHOD_LABELS, METHOD_MATHS_ANCHORS } from '@/lib/method-display';
import type { MethodSlug } from '@/types/prediction';
import type { Series, Team } from '@/types/types';
import {
  chooseCustomMatchup,
  chooseMethod,
  clickDecadeCard,
  clickYearCard,
  conformingResult,
  fetchError,
  fillCustomForm,
  fillField,
  pressRetry,
  renderPage,
  renderPageWithLocationProbe,
  seriesFixture,
  submitPrediction,
  SERIES_ID,
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

vi.mock('posthog-js', () => ({ default: { capture: db.capture, captureException: db.captureException } }));

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

    clickDecadeCard(2020);
    expect(screen.getByText('Select Year from 2020s')).toBeInTheDocument();
    // The fixture reconciles to the pending shape (six rows, no winner), so
    // the derived decade-card label reads `Current` (Story 2.2).
    await clickYearCard(2022);
    expect(screen.getByText('Select Series from 2022')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /BOS vs MIA/ }));

    // The trigger reflects the picked row, and the row's Games 1–6 render
    // through the selection — proof `selectedSeries.data` holds the series.
    expect(await screen.findByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.getByText('101 — 91')).toBeInTheDocument();
    expect(db.toast.success).toHaveBeenCalledWith('Series selected');

    // Back-navigation inside the picker never touches the prior choice.
    fireEvent.click(screen.getByText('BOS vs MIA'));
    clickDecadeCard(2020);
    fireEvent.click(await screen.findByRole('button', { name: /Go Back/ }));
    expect(await screen.findByText('Select Decade')).toBeInTheDocument();
    expect(screen.getByText('101 — 91')).toBeInTheDocument();
  });

  it('populates the card from a ?series= preload and keeps the selection across a later method change', async () => {
    renderPage(`/predict?series=${SERIES_ID}`);
    expect(await screen.findByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.getByText('101 — 91')).toBeInTheDocument();
    // Full name resolved through the alias map to the real logo.
    expect(document.querySelector('img[src$="assets/teams/celtics.png"]')).not.toBeNull();

    await chooseMethod('Elo Rating');
    expect(screen.getByText('Elo Rating')).toBeInTheDocument();
    expect(screen.getByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.getByText('101 — 91')).toBeInTheDocument();
  });

  it('derives the custom trigger label from initials and truncation', async () => {
    renderPage();
    await chooseCustomMatchup();
    // Blank names fall to 'TBD', never back to the old 'Team A'/'Team B' request fallback.
    expect(screen.getByText('TBD vs TBD')).toBeInTheDocument();

    fillField('team_a', 'Boston Celtics');
    // Story 2.11 U15 re-keyed this pin: `BOS` no longer comes from the deleted
    // `TEAM_ABBREVIATIONS` dictionary but from the `teams` row the picker fetch
    // already loaded (`seriesFixture.team_a`), which spells that name and stores
    // that code. Same letters, new source — see the case below for the fall-through.
    expect(screen.getByText('BOS vs TBD')).toBeInTheDocument(); // row hit (U15)
    fillField('team_b', 'Los Angeles');
    expect(screen.getByText('BOS vs LA')).toBeInTheDocument(); // multi-word initials
    // Owner decision U16 (2026-10-05): a nickname the logo table knows prints
    // the code of the team whose logo it shows — `Celtics` was `CEL` until U16.
    fillField('team_a', 'Celtics');
    expect(screen.getByText('BOS vs LA')).toBeInTheDocument(); // logo alias (U16)
    expect(screen.queryByText('CEL vs LA')).toBeNull();
    // A single word no alias knows still truncates.
    fillField('team_a', 'Celtic');
    expect(screen.getByText('CEL vs LA')).toBeInTheDocument(); // single-word truncation
  });

  it('prints the code of the team whose logo the typed text shows (U16)', async () => {
    renderPage();
    await chooseCustomMatchup();
    // Neither name is a `full_name` any loaded row carries, so only the logo
    // alias table can answer — through the same normalization `getTeamLogo` uses.
    fillField('team_a', 'Jazz');
    fillField('team_b', 'Sixers');
    expect(screen.getByText('UTA vs PHI')).toBeInTheDocument();
    expect(screen.queryByText('JAZ vs SIX')).toBeNull();
    // Spacing and punctuation are ignored, as they are for the logo — and the
    // glued `UtahStars` is the Stars (`UTS`), never the Jazz's `UTA`.
    fillField('team_a', 'UtahStars');
    fillField('team_b', 'golden-state warriors');
    expect(screen.getByText('UTS vs GSW')).toBeInTheDocument();
    // A shared nickname takes the team the alias table (and so the logo) chose.
    fillField('team_a', 'Bullets');
    fillField('team_b', 'Kings');
    expect(screen.getByText('BLB vs SAC')).toBeInTheDocument();
    // The one seeded franchise absent from the archive resolves by alias too.
    fillField('team_a', 'Pelicans');
    expect(screen.getByText('NOP vs SAC')).toBeInTheDocument();
  });

  // Story 2.11 U15 (owner, 2026-10-04): after the map is deleted the typed name
  // resolves against the rows the page already holds in memory — `fetchAllGames`
  // loads every series through `SERIES_SELECT`, which embeds `abbreviation` on
  // both sides — and a hit prints that stored code. No new query; the row arm is
  // `full_name` only, exact after trim + lower-case. Owner decision U16
  // (2026-10-05) adds the logo alias table behind it for names no row spells.
  const sonicsTeam: Team = { id: 25, full_name: 'Seattle SuperSonics', abbreviation: 'SEA', created_at: 'e' };
  const jazzTeam: Team = { id: 29, full_name: 'Utah Jazz', abbreviation: 'UTA', created_at: 'f' };
  const historicalFixture: Series = {
    ...seriesFixture,
    id: 's-1979',
    year: 1979,
    team_a: sonicsTeam,
    team_b: jazzTeam,
    team_a_id: 25,
    team_b_id: 29,
  };

  it('resolves a typed custom name through the rows the picker already loaded (U15)', async () => {
    db.list = { data: [seriesFixture, historicalFixture], error: null };
    renderPage();
    await chooseCustomMatchup();

    // A historical identity the deleted map never covered: today's name path
    // prints the initialism `SS`, the row prints the stored `SEA`.
    fillField('team_a', 'Seattle SuperSonics');
    expect(screen.getByText('SEA vs TBD')).toBeInTheDocument();
    fillField('team_b', 'Utah Jazz');
    expect(screen.getByText('SEA vs UTA')).toBeInTheDocument();

    // Case is not part of the match: the index is keyed on the lower-cased
    // `full_name`, so a lowercase-typed name hits the same row rather than
    // falling to the initialism the raw-equality arm would have returned.
    fillField('team_a', 'seattle supersonics');
    expect(screen.getByText('SEA vs UTA')).toBeInTheDocument();
    expect(screen.queryByText('SS vs UTA')).toBeNull();
    fillField('team_a', 'Seattle SuperSonics');

    // Mid-typing there is no matching row, so the name path speaks — the
    // transient goes wrong→right as the keystrokes complete (U15's accepted
    // consequence), and it is the same truncation the surface shows today.
    fillField('team_b', 'Utah J');
    expect(screen.getByText('SEA vs UJ')).toBeInTheDocument();

    // A nickname is not a `full_name`, so the row arm misses — and since owner
    // decision U16 the logo alias table answers it (it was `SUP` under U15).
    fillField('team_a', 'SuperSonics');
    expect(screen.getByText('SEA vs UJ')).toBeInTheDocument();

    // Exact after normalize, not exact in the raw string: padding still hits.
    fillField('team_a', '  Seattle SuperSonics  ');
    expect(screen.getByText('SEA vs UJ')).toBeInTheDocument();

    // An unrecognized name falls through unchanged (`Nowhere FC` → `NF`), which
    // is the Story 1.4 pin this case deliberately does not move.
    fillField('team_a', 'Nowhere FC');
    expect(screen.getByText('NF vs UJ')).toBeInTheDocument();
  });

  // Story 2.11 U6/U7: the two DB-backed answer surfaces — the result card and
  // the detailed sheet — read the embedded rows' stored codes, and
  // `predicted_winner` is resolved client-side against those same two candidate
  // rows (U7: no contract change, no Edge Function deploy). The Sonics/Jazz
  // pair is the golden divergence: the name path the surfaces used to run
  // through printed `SS` and `UJ`.
  it('answers a DB-backed prediction with the stored codes on the card and the details sheet', async () => {
    db.single = { data: historicalFixture, error: null };
    renderPage(`/predict?series=${SERIES_ID}`);
    expect(await screen.findByText('SEA vs UTA')).toBeInTheDocument();

    await chooseMethod('Logistic Regression');
    db.invoke.mockResolvedValue({
      data: {
        ...conformingResult,
        predicted_winner: 'Seattle SuperSonics',
        team_a: 'Seattle SuperSonics',
        team_b: 'Utah Jazz',
      },
      error: null,
    });
    submitPrediction();
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());

    // The card prints the stored `SEA` for the winner; the losing team's line
    // is a compound `{code} · {prob}%` string, so it is matched by prefix and
    // pinned by textContent (AGENTS.md: no computed-accessible-name assertion).
    expect(screen.getByText('SEA')).toBeInTheDocument();
    const cardLosingLine = Array.from(document.querySelectorAll('p')).find((node) =>
      (node.textContent ?? '').startsWith('UTA · ')
    );
    expect(cardLosingLine?.textContent).toBe('UTA · 38.75%');

    fireEvent.click(screen.getByText('View Detailed Analysis'));
    await waitFor(() => expect(screen.getByText('Prediction Result')).toBeInTheDocument());
    // Each code prints twice in the sheet — the matchup span and the winner /
    // losing line (`:1324`,`:1329`,`:1340`,`:1358`) — which is the pin for all
    // four converted lines at once.
    expect(screen.getAllByText('SEA')).toHaveLength(2);
    expect(screen.getAllByText('UTA')).toHaveLength(2);
  });

  // The mirror image of the case above, and the reason it exists: each surface's
  // `Losing Team` line is a ternary (`:1252-1254`, `:1358-1361`), so with the
  // Sonics as winner only the `codeB` arm paints and the card's `codeA` (`:1203`)
  // would survive a mutation that dropped its row argument. Flipping the predicted
  // winner to the other candidate row puts the *stored* `SEA` on the losing line
  // of both surfaces — the last two converted sites no other case can redden — and
  // the probability prints team A's (61.25), which is what makes this the
  // opposite branch rather than a repeat.
  it('prints the stored code for the losing side when the other row wins', async () => {
    db.single = { data: historicalFixture, error: null };
    renderPage(`/predict?series=${SERIES_ID}`);
    await chooseMethod('Logistic Regression');
    db.invoke.mockResolvedValue({
      data: {
        ...conformingResult,
        predicted_winner: 'Utah Jazz',
        team_a: 'Seattle SuperSonics',
        team_b: 'Utah Jazz',
      },
      error: null,
    });
    submitPrediction();
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());

    expect(screen.getByText('UTA')).toBeInTheDocument();
    const cardLosingLine = Array.from(document.querySelectorAll('p')).find((node) =>
      (node.textContent ?? '').startsWith('SEA · ')
    );
    expect(cardLosingLine?.textContent).toBe('SEA · 61.25%');

    fireEvent.click(screen.getByText('View Detailed Analysis'));
    await waitFor(() => expect(screen.getByText('Prediction Result')).toBeInTheDocument());
    // Two `SEA` in the sheet — the matchup span and the losing line — and two
    // `UTA` (the span's other side and the winner line), which pins all four
    // converted sheet lines at once; the winner prints `UTA`.
    expect(screen.getAllByText('SEA')).toHaveLength(2);
    expect(screen.getAllByText('UTA')).toHaveLength(2);
  });

  // Story 2.11 U15 on the answer surfaces (review pass): a custom matchup carries
  // no series FK, so its rows come from the same typed-name index the trigger
  // label used. Without that fallback the card and sheet would print the name
  // initialism `SS`/`UJ` beside a picker reading the stored `SEA`/`UTA` — one fan,
  // one name, two codes on one page.
  it('answers a custom matchup with the stored codes the trigger label used (U15)', async () => {
    db.list = { data: [seriesFixture, historicalFixture], error: null };
    renderPage();
    await chooseCustomMatchup();
    fillField('team_a', 'Seattle SuperSonics');
    fillField('team_b', 'Utah Jazz');
    for (let game = 1; game <= 6; game++) {
      fillField(`game_${game}_score_a`, `${100 + game}`);
      fillField(`game_${game}_score_b`, `${90 + game}`);
    }
    await chooseMethod('Logistic Regression');
    // The trigger half of the agreement, before anything is submitted.
    expect(screen.getByText('SEA vs UTA')).toBeInTheDocument();

    db.invoke.mockResolvedValue({
      data: {
        ...conformingResult,
        predicted_winner: 'Seattle SuperSonics',
        team_a: 'Seattle SuperSonics',
        team_b: 'Utah Jazz',
      },
      error: null,
    });
    submitPrediction();
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());

    expect(screen.getByText('SEA')).toBeInTheDocument();
    const cardLosingLine = Array.from(document.querySelectorAll('p')).find((node) =>
      (node.textContent ?? '').startsWith('UTA · ')
    );
    expect(cardLosingLine?.textContent).toBe('UTA · 38.75%');
    // The name path would have printed these instead, and nothing else does.
    expect(screen.queryByText('SS')).toBeNull();
    expect(screen.queryByText('UJ')).toBeNull();

    fireEvent.click(screen.getByText('View Detailed Analysis'));
    await waitFor(() => expect(screen.getByText('Prediction Result')).toBeInTheDocument());
    expect(screen.getAllByText('SEA')).toHaveLength(2);
    expect(screen.getAllByText('UTA')).toHaveLength(2);
  });

  it('answers a custom matchup typed as nicknames with the codes its logos show (U16)', async () => {
    renderPage();
    await chooseCustomMatchup();
    fillField('team_a', 'Sonics');
    fillField('team_b', 'Jazz');
    for (let game = 1; game <= 6; game++) {
      fillField(`game_${game}_score_a`, `${100 + game}`);
      fillField(`game_${game}_score_b`, `${90 + game}`);
    }
    await chooseMethod('Logistic Regression');
    expect(screen.getByText('SEA vs UTA')).toBeInTheDocument();

    // The function echoes the typed names back, so the card and the sheet hold
    // nicknames and no row — only the alias arm can print the stored codes.
    db.invoke.mockResolvedValue({
      data: { ...conformingResult, predicted_winner: 'Jazz', team_a: 'Sonics', team_b: 'Jazz' },
      error: null,
    });
    submitPrediction();
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());

    expect(screen.getByText('UTA')).toBeInTheDocument();
    const cardLosingLine = Array.from(document.querySelectorAll('p')).find((node) =>
      (node.textContent ?? '').startsWith('SEA · ')
    );
    expect(cardLosingLine).toBeDefined();
    expect(screen.queryByText('JAZ')).toBeNull();

    fireEvent.click(screen.getByText('View Detailed Analysis'));
    await waitFor(() => expect(screen.getByText('Prediction Result')).toBeInTheDocument());
    expect(screen.getAllByText('SEA')).toHaveLength(2);
    expect(screen.getAllByText('UTA')).toHaveLength(2);
    expect(screen.queryByText('JAZ')).toBeNull();
  });

  // Story 2.11 U8: `Team A` / `Team B` are one named client literal, never rows
  // in `teams`. A join miss on the preload hands the helper the literal with no
  // row beside it, so step 2 of the resolution order answers it.
  it('prints the placeholder literal for a preloaded series whose FK row is missing (U8)', async () => {
    db.single = { data: { ...seriesFixture, team_a: undefined, team_a_id: null }, error: null };
    renderPage(`/predict?series=${SERIES_ID}`);

    // `TMA`, not the bare initialism `TA` the name path would derive from
    // 'Team A' — and the row-backed side is untouched.
    expect(await screen.findByText('TMA vs MIA')).toBeInTheDocument();
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
    // `type="number"` sanitizes 'abc' to '' before the handler sees it, so the
    // page-level non-integer case is a decimal; 'abc' itself is pinned at the
    // validator level (custom-matchup.test.ts).
    fillField('game_3_score_a', '48.5');
    fillField('game_3_score_b', '');
    // The blocked phase carries an unrecognized name too: the placeholder
    // warning belongs to a request that proceeds, so a blocked submit must
    // never announce one — this pins the hint loops below the validation
    // early-return (hoisting them above it would warn on a dead submit).
    fillField('team_a', 'Nowhere FC');

    submitPrediction();
    expect(await screen.findByText("Can't be negative")).toBeInTheDocument();
    expect(document.getElementById('game_1_score_a-error')).toHaveTextContent("Can't be negative");
    expect(document.getElementById('game_2_score_b-error')).toHaveTextContent('Score is required');
    expect(document.getElementById('game_3_score_a-error')).toHaveTextContent('Must be a whole number');
    expect(document.getElementById('game_3_score_b-error')).toHaveTextContent('Score is required');
    expect(document.getElementById('game_1_score_a')).toHaveFocus();
    expect(db.invoke).not.toHaveBeenCalled();
    expect(db.toast.warning).not.toHaveBeenCalled();

    fillField('team_a', 'BOS');
    fillField('game_1_score_a', '48');
    fillField('game_2_score_b', '92');
    fillField('game_3_score_a', '103');
    fillField('game_3_score_b', '93');    db.invoke.mockResolvedValue({ data: conformingResult, error: null });
    submitPrediction();

    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    expect(document.getElementById('game_1_score_a')).not.toBeInvalid();
    expect(db.toast.warning).toHaveBeenCalledTimes(1);
    expect(db.toast.warning).toHaveBeenCalledWith(
      'Note: Game 1 scores (48-91) are outside the typical 50-200 range'
    );
  });

  it('emits the range hint and the name hint together, range first, on one proceeding submit', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();
    fillField('game_1_score_a', '48');
    fillField('team_b', 'Nowhere FC');
    db.invoke.mockResolvedValue({ data: conformingResult, error: null });

    submitPrediction();

    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    // Both hint loops fire on one submit, in page order: range, then names —
    // a `break`/early-return mutation in either loop reddens this count.
    expect(db.toast.warning).toHaveBeenCalledTimes(2);
    expect(db.toast.warning.mock.calls[0][0]).toBe(
      'Note: Game 1 scores (48-91) are outside the typical 50-200 range'
    );
    expect(db.toast.warning.mock.calls[1][0]).toBe(
      "Note: \"Nowhere FC\" isn't in our team list yet — showing a placeholder logo."
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
    // The blank-name submit never left the browser — still only the first
    // (failed) call from the top of this test.
    expect(db.invoke).toHaveBeenCalledTimes(1);

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
    renderPageWithLocationProbe(`/predict?series=${SERIES_ID}`);
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
    expect(screen.getByTestId('location-probe')).toHaveTextContent(`/predict?series=${SERIES_ID}`);
    expect(db.from).toHaveBeenCalledTimes(2); // mount list + preload, from before the reset

    // Custom input and the fetched games list survived the reset.
    fireEvent.click(screen.getByText('Click to choose series'));
    expect(await screen.findByText('Select Decade')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Custom Matchup/ }));
    expect((document.getElementById('team_a') as HTMLInputElement).value).toBe('BOS');
    expect((document.getElementById('game_6_score_b') as HTMLInputElement).value).toBe('96');
    expect(db.from).toHaveBeenCalledTimes(2);
  });

  // Story 4.0: the custom-series, four method, generate, detailed-analysis and
  // reset call sites now emit through `@/lib/analytics`. Pinned as the whole
  // capture log, so a renamed event, a changed prop, an extra emission, or a
  // no-props call that gains an argument all fail here.
  it('emits each Predict event through the port with its exact name and props', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod('Logistic Regression');
    for (const [current, next] of [
      ['Logistic Regression', 'Bayes Method'],
      ['Bayes Method', 'Elo Rating'],
      ['Elo Rating', 'Exponential Smoothing'],
    ]) {
      fireEvent.click(screen.getByText(current));
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(next) }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }

    fillCustomForm();
    db.invoke.mockResolvedValue({ data: { ...conformingResult, method_used: 'exponential_smoothing' }, error: null });
    submitPrediction();
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View Detailed Analysis'));
    await waitFor(() => expect(screen.getByText('Prediction Result')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Prediction'));

    expect(db.capture.mock.calls).toEqual([
      ['custom_series_selected'],
      ['prediction_method_selected', { method: 'logistic_regression' }],
      ['prediction_method_selected', { method: 'bayes' }],
      ['prediction_method_selected', { method: 'elo' }],
      ['prediction_method_selected', { method: 'exponential_smoothing' }],
      [
        'prediction_generated',
        {
          method: 'exponential_smoothing',
          series_source: 'custom',
          series_id: undefined,
          series_year: undefined,
          predicted_winner: 'Boston Celtics',
          win_probability_a: 61.25,
          win_probability_b: 38.75,
          confidence_level: 'Medium',
        },
      ],
      ['detailed_analysis_viewed', { method: 'exponential_smoothing', series_id: undefined }],
      ['prediction_reset'],
    ]);
    // The two no-props emissions reach the SDK with one argument, not (name, undefined).
    expect(db.capture.mock.calls[0]).toHaveLength(1);
    expect(db.capture.mock.calls[7]).toHaveLength(1);
    expect(db.captureException).not.toHaveBeenCalled();
  });
});

// Picked up at the external review from the Story 1.3 hand-off (deferred-work,
// owner decision 2026-09-26): the series path is the main fan route, and its
// submit body, retry, score guards and exception reporting were unpinned — a
// broken home/away swap in the series rewrite would have shipped green.
describe('PredictPage series-path regressions (Story 1.4)', () => {
  const baseGames = seriesFixture.series_game_scores ?? [];
  const game7 = {
    id: 'g7',
    series_id: 's-1',
    game_number: 7,
    home_team_id: 22, // team_b hosts Game 7
    away_team_id: 11,
    home_score: 98,
    away_score: 102,
    created_at: 'd',
  };

  function preload(series: object) {
    db.single = { data: series, error: null };
    return renderPage(`/predict?series=${SERIES_ID}`);
  }

  function seriesWithGame(gameNumber: number, scores: { home_score?: number; away_score?: number }) {
    return {
      ...seriesFixture,
      series_game_scores: baseGames.map((game) =>
        game.game_number === gameNumber ? { ...game, ...scores } : game
      ),
    };
  }

  it('submits the exact series body: home/away mapping for games 1-6 and home_team from the game-7 row', async () => {
    preload({ ...seriesFixture, series_game_scores: [...baseGames, game7] });
    await screen.findByText('BOS vs MIA');
    await chooseMethod('Logistic Regression');
    db.invoke.mockResolvedValue({ data: conformingResult, error: null });

    submitPrediction();

    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    // Odd games: team_a (id 11) is home → score_a = home_score. Even games:
    // team_b (id 22) is home → score_a = away_score. Game 7 is hosted by
    // team_b, so home_team is Miami's full name.
    expect(db.invoke).toHaveBeenCalledWith('predict-game-7', {
      body: {
        series_id: 's-1',
        team_a: 'Boston Celtics',
        team_b: 'Miami Heat',
        method: 'logistic_regression',
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
        home_team: 'Miami Heat',
      },
    });
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());
  });

  it('retry re-fires the identical series attempt and captureException carries the failure copy', async () => {
    preload(seriesFixture);
    await screen.findByText('BOS vs MIA');
    await chooseMethod('Elo Rating');

    // Default stub: transport failure — the panel replaces the result region.
    submitPrediction();
    await waitFor(() =>
      expect(screen.getByText("Couldn't generate the prediction.")).toBeInTheDocument()
    );

    // The mocked FunctionsFetchError is a plain object, not an Error, so the
    // page wraps the classifier's copy — pin what analytics receives.
    expect(db.captureException).toHaveBeenCalledTimes(1);
    const reported = db.captureException.mock.calls[0][0];
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toBe(
      "Couldn't reach the prediction service. It may be briefly unavailable."
    );

    pressRetry();

    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(2));
    // Identical attempt — same body down to `home_team: undefined` (no game-7
    // row), same method — and the second failure re-renders the panel.
    expect(db.invoke.mock.calls[1][1]).toEqual(db.invoke.mock.calls[0][1]);
    expect(db.invoke.mock.calls[0][1].body).toMatchObject({
      series_id: 's-1',
      method: 'elo',
      home_team: undefined,
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('toasts and never invokes on a series with fewer than six game rows', async () => {
    preload({ ...seriesFixture, series_game_scores: baseGames.slice(0, 5) });
    await screen.findByText('BOS vs MIA');
    await chooseMethod();

    submitPrediction();

    await waitFor(() =>
      expect(db.toast.error).toHaveBeenCalledWith(
        'Selected series does not include enough game scores for prediction.'
      )
    );
    expect(db.invoke).not.toHaveBeenCalled();
  });

  it('toasts and never invokes when a game 1-6 row is missing from a six-row series', async () => {
    preload({
      ...seriesFixture,
      series_game_scores: [...baseGames.filter((game) => game.game_number !== 3), game7],
    });
    await screen.findByText('BOS vs MIA');
    await chooseMethod();

    submitPrediction();

    await waitFor(() =>
      expect(db.toast.error).toHaveBeenCalledWith('Game 3 is missing for the selected series.')
    );
    expect(db.invoke).not.toHaveBeenCalled();
  });

  it('toasts and never invokes on a zero series score — zero counts as missing', async () => {
    // Zero counts as missing (team_a is away in even games → score_b).
    preload(seriesWithGame(2, { home_score: 0 }));
    await screen.findByText('BOS vs MIA');
    await chooseMethod();
    submitPrediction();
    await waitFor(() =>
      expect(db.toast.error).toHaveBeenCalledWith(
        'Game 2 is missing scores. Please enter scores for all 6 games.'
      )
    );
    expect(db.invoke).not.toHaveBeenCalled();
  });

  it('toasts and never invokes on a non-integer series score', async () => {
    preload(seriesWithGame(1, { home_score: 99.5 }));
    await screen.findByText('BOS vs MIA');
    await chooseMethod();
    submitPrediction();
    await waitFor(() =>
      expect(db.toast.error).toHaveBeenCalledWith('Game 1 scores must be whole numbers')
    );
    expect(db.invoke).not.toHaveBeenCalled();
  });

  it('toasts and never invokes on a negative series score', async () => {
    // team_a is away in even games → the negative away_score lands in score_a.
    preload(seriesWithGame(4, { away_score: -5 }));
    await screen.findByText('BOS vs MIA');
    await chooseMethod();
    submitPrediction();
    await waitFor(() =>
      expect(db.toast.error).toHaveBeenCalledWith('Game 4 scores cannot be negative')
    );
    expect(db.invoke).not.toHaveBeenCalled();
  });

  it('treats an out-of-range series score as the non-blocking inline advisory, wording pinned', async () => {
    preload(seriesWithGame(1, { home_score: 48 }));
    await screen.findByText('BOS vs MIA');
    await chooseMethod();
    db.invoke.mockResolvedValue({ data: conformingResult, error: null });

    submitPrediction();

    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    // The series path builds this string inline (not via collectRangeHints) —
    // pinned here so the two paths cannot drift undetected forever.
    expect(db.toast.warning).toHaveBeenCalledTimes(1);
    expect(db.toast.warning).toHaveBeenCalledWith(
      'Note: Game 1 scores (48-91) are outside the typical 50-200 range'
    );
    expect(db.toast.error).not.toHaveBeenCalled();
  });
});

// Epic 1 retro finding A1: Story 1.3 put a sequence guard on the preload path
// and the predict path kept none, so a slow response could land after a method
// switch and show one method's probabilities under another's label. Nothing in
// the 116-test suite or the Story 1.5 matrix covered it — Story 1.4 pins
// method-switch *state preservation*, and the matrix drove two methods
// sequentially. These are the cases that guard removes.
describe('PredictPage superseded predictions (Epic 1 retro A1)', () => {
  function deferred() {
    let settle!: (value: { data: unknown; error: unknown }) => void;
    let fail!: (reason: Error) => void;
    const promise = new Promise<{ data: unknown; error: unknown }>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    return { promise, settle, reject: fail };
  }

  // A superseded response produces no observable state change by design, so an
  // immediate assertion would pass on an unprocessed continuation. Flushing a
  // macrotask runs the whole invoke → classifier → setState chain first.
  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function preloadedSeriesRoute() {
    renderPage(`/predict?series=${SERIES_ID}`);
    return screen.findByText('BOS vs MIA');
  }

  // The pickers emit their own events, so only the generated-prediction count
  // can show whether a superseded attempt leaked a success to analytics.
  function generatedEvents() {
    return db.capture.mock.calls.filter(([event]) => event === 'prediction_generated');
  }

  // The pickers toast their own confirmations too, so the success toast needs
  // the same event-scoped count: a superseded attempt must leak neither the
  // event nor the "generated successfully" message.
  function generatedToastMessages() {
    return db.toast.success.mock.calls.filter(([message]) => message === 'Prediction generated successfully');
  }

  // The shared `chooseMethod` targets the trigger by its "Click to choose
  // method" copy, which only exists while no method is selected — so a switch
  // goes through the trigger's current label, the way Story 1.4's switching
  // test already drives it.
  async function switchMethod(currentLabel: string, nextLabel: string) {
    fireEvent.click(screen.getByText(currentLabel));
    const option = await screen.findByRole('button', { name: new RegExp(nextLabel) });
    fireEvent.click(option);
    await waitFor(() => {
      if (screen.queryByRole('dialog')) throw new Error('the method picker is still mounted');
    });
    expect(screen.getByText(nextLabel)).toBeInTheDocument();
  }

  it('keeps the newer response when a slower one lands after it', async () => {
    await preloadedSeriesRoute();
    await chooseMethod('Logistic Regression');

    const slow = deferred();
    const fast = deferred();
    db.invoke.mockImplementationOnce(() => slow.promise).mockImplementationOnce(() => fast.promise);

    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));

    // The fan switches method and submits again while the first request is out.
    await switchMethod('Logistic Regression', 'Elo Rating');
    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(2));
    expect(db.invoke.mock.calls[1][1].body.method).toBe('elo');

    fast.settle({ data: conformingResult, error: null });
    await waitFor(() => expect(screen.getByText('61.25%')).toBeInTheDocument());

    slow.settle({
      data: { ...conformingResult, win_probability_a: 71.5, win_probability_b: 28.5 },
      error: null,
    });
    await flush();

    // The stale probabilities never reach the card.
    expect(screen.queryByText('71.5%')).toBeNull();
    expect(screen.getByText('61.25%')).toBeInTheDocument();
    expect(screen.getByText('Elo Rating')).toBeInTheDocument();
    // And the fan never saw a second prediction: one event, for the live attempt.
    expect(generatedEvents()).toHaveLength(1);
    expect(generatedEvents()[0][1]).toMatchObject({ method: 'elo' });
    expect(generatedToastMessages()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Click to generate prediction' })).toBeEnabled();
  });

  it('drops an in-flight result when a method switch ends the wait it was part of', async () => {
    await preloadedSeriesRoute();
    await chooseMethod();

    const slow = deferred();
    db.invoke.mockImplementationOnce(() => slow.promise);

    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Generating prediction…' })).toBeDisabled();

    // No second submit this time: the switch alone retires the attempt, so the
    // spinner must not be left waiting on a response that can no longer paint.
    await switchMethod('Logistic Regression', 'Elo Rating');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Click to generate prediction' })).toBeEnabled()
    );

    slow.settle({ data: conformingResult, error: null });
    await flush();

    expect(screen.queryByText('61.25%')).toBeNull();
    expect(screen.getByText('Click anywhere to predict')).toBeInTheDocument();
    expect(generatedEvents()).toHaveLength(0);
    expect(generatedToastMessages()).toHaveLength(0);
  });

  it('lets a superseded failure pass without replacing the fresh result with the panel', async () => {
    await preloadedSeriesRoute();
    await chooseMethod();

    const slow = deferred();
    db.invoke
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => Promise.resolve({ data: conformingResult, error: null }));

    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));

    await switchMethod('Logistic Regression', 'Elo Rating');
    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('61.25%')).toBeInTheDocument());

    slow.settle({ data: null, error: fetchError() });
    await flush();

    // The panel would have erased a result the fan is looking at; the error
    // itself is still reported, superseded or not.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('61.25%')).toBeInTheDocument();
    expect(db.captureException).toHaveBeenCalledTimes(1);
  });

  it('lets a superseded throw pass without replacing the fresh result with the panel', async () => {
    await preloadedSeriesRoute();
    await chooseMethod();

    const slow = deferred();
    db.invoke
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => Promise.resolve({ data: conformingResult, error: null }));

    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));

    await switchMethod('Logistic Regression', 'Elo Rating');
    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('61.25%')).toBeInTheDocument());

    // The last-resort catch, reached by a throw outside the classified invoke
    // path — the panel it would have written is the same class of leak.
    slow.reject(new Error('transport blew up outside the classifier'));
    await flush();

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('61.25%')).toBeInTheDocument();
    expect(db.captureException).toHaveBeenCalledTimes(1);
  });

  it('holds Generate disabled when a superseded response lands while the live one is pending', async () => {
    await preloadedSeriesRoute();
    await chooseMethod();

    const stale = deferred();
    const live = deferred();
    db.invoke.mockImplementationOnce(() => stale.promise).mockImplementationOnce(() => live.promise);

    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));

    await switchMethod('Logistic Regression', 'Elo Rating');
    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(2));

    stale.settle({ data: conformingResult, error: null });
    await flush();

    // The live request is still out there, so the control the fan must not
    // double-fire stays disabled — and the retired attempt stays silent.
    expect(screen.getByRole('button', { name: 'Generating prediction…' })).toBeDisabled();
    expect(generatedEvents()).toHaveLength(0);
    expect(generatedToastMessages()).toHaveLength(0);

    live.settle({ data: { ...conformingResult, win_probability_a: 71.5, win_probability_b: 28.5 }, error: null });
    await waitFor(() => expect(screen.getByText('71.5%')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Click to generate prediction' })).toBeEnabled();
  });

  it('drops an in-flight result when the fan edits the custom scores that produced it', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();

    const slow = deferred();
    db.invoke.mockImplementationOnce(() => slow.promise);

    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Generating prediction…' })).toBeDisabled();

    // A keystroke rebuilds `customInput`, the reset effect's third dependency.
    // That edit already discards a visible result, so it discards the response
    // that would have painted a result computed from the pre-edit scores.
    fillField('game_1_score_a', '111');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Click to generate prediction' })).toBeEnabled()
    );

    slow.settle({ data: conformingResult, error: null });
    await flush();

    expect(screen.queryByText('61.25%')).toBeNull();
    expect(generatedEvents()).toHaveLength(0);
    expect(generatedToastMessages()).toHaveLength(0);
    // The corrected input survived the retired attempt, and is submittable.
    expect((document.getElementById('game_1_score_a') as HTMLInputElement).value).toBe('111');
  });
});

// Story 4.1: `?method=` on a `?series=` link (the historic share-link arrival)
// is applied in the preload's success branch, so the series and the method land
// together and nothing runs until the fan taps Generate (owner decision D1).
describe('PredictPage method preload (Story 4.1)', () => {
  it('selects the series and the linked method together, and runs nothing until Generate (matrix: share arrival)', async () => {
    renderPage(`/predict?series=${SERIES_ID}&method=elo`);

    expect(await screen.findByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.getByText('Elo Rating')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Click to generate prediction' })).toBeEnabled();
    expect(db.invoke).not.toHaveBeenCalled();
    expect(db.capture).not.toHaveBeenCalled();

    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    expect(db.invoke.mock.calls[0][1].body.method).toBe('elo');
  });

  it('ignores an unknown slug: the series still preloads and the method stays unset (matrix: bad method)', async () => {
    renderPage(`/predict?series=${SERIES_ID}&method=foo`);

    expect(await screen.findByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select series and method first' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Click to choose method/ })).toBeInTheDocument();
    expect(db.toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ignores an inherited-property slug rather than treating it as a method', async () => {
    renderPage(`/predict?series=${SERIES_ID}&method=toString`);

    expect(await screen.findByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select series and method first' })).toBeDisabled();
  });

  it('keeps the linked method through a failed preload and its Retry (matrix: lookup fails)', async () => {
    db.single = { data: null, error: new Error('network miss') };
    renderPage(`/predict?series=${SERIES_ID}&method=elo`);
    await waitFor(() => expect(screen.getByText("Couldn't load this series.")).toBeInTheDocument());

    db.single = { data: seriesFixture, error: null };
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('BOS vs MIA')).toBeInTheDocument();
    expect(screen.getByText('Elo Rating')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Click to generate prediction' })).toBeEnabled();
    expect(db.invoke).not.toHaveBeenCalled();
  });
});

