// Shared harness for the Predict-page test suites (Story 1.3 error states,
// Story 1.4 flow regressions, Story 1.5 keyboard operability). The vitest
// boilerplate that must live per-file (`vi.hoisted` mock bags, `vi.mock`
// registrations, the `beforeEach` stub wiring) stays in each suite; everything
// that is plain DOM/RTL plumbing is defined exactly once here so the files
// cannot drift.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

import PredictPage from '@/pages/PredictPage';
import type { Series, Team } from '@/types/types';

/**
 * A UUID-shaped `?series=` id for preload tests. Story 4.1 treats a malformed
 * id as "not found" without querying, so preload URLs must look like a real
 * `series.id`; the per-suite Supabase mocks ignore the value itself.
 */
export const SERIES_ID = '7b0c6e1a-3f2d-4c5e-9a8b-1d2e3f4a5b6c';

export const teamA: Team = { id: 11, full_name: 'Boston Celtics', abbreviation: 'BOS', created_at: 'a' };
export const teamB: Team = { id: 22, full_name: 'Miami Heat', abbreviation: 'MIA', created_at: 'b' };

export const seriesFixture: Series = {
  id: 's-1',
  year: 2022,
  round: 'Finals',
  league: 'NBA',
  team_a_id: 11,
  team_b_id: 22,
  created_at: 'c',
  team_a: teamA,
  team_b: teamB,
  // Six rows, games 1–6, no winner: under the Story 2.2 derivation this
  // fixture is a certified 3–3 — pending, not stored-status anything.
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
export function httpError(status: number, body: string) {
  return { name: 'FunctionsHttpError', message: 'HttpError', context: { status, text: () => Promise.resolve(body) } };
}

/** A `FunctionsFetchError`: `context` is NOT a `Response`. */
export function fetchError() {
  return { name: 'FunctionsFetchError', message: 'Failed to fetch', context: {} };
}

// The contract's documented scale: percentages 0-100, two decimals.
export const conformingResult = {
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

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe">{`${location.pathname}${location.search}`}</span>;
}

// `main.tsx` mounts the whole app inside a `HelmetProvider`, so the harness does
// too: a `PageMeta` rendered by any page is then checked rather than thrown on,
// which is what makes Predict's "the 404 copy never reaches the tab" rule
// assertable instead of incidentally protected (Story 4.1 review).
export function renderPage(entry = '/predict') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[entry]}>
        <PredictPage />
      </MemoryRouter>
    </HelmetProvider>
  );
}

/** Same page plus a probe that pins the router location (Story 1.4: 'New Prediction' keeps the URL). */
export function renderPageWithLocationProbe(entry = '/predict') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[entry]}>
        <PredictPage />
        <LocationProbe />
      </MemoryRouter>
    </HelmetProvider>
  );
}

/**
 * PredictPage plus a `goTo` handle that performs a real in-app navigation.
 * Home links `/predict?series=<id>` into an already-mounted page, so
 * `searchParams` change without the page remounting and the previous selection
 * stays on screen — the one arrival shape a cold single-entry render cannot
 * produce (Story 4.1 review pass 2).
 */
export function renderPageWithNavigation(entry = '/predict') {
  let navigate: ((to: string) => void) | undefined;
  function Navigator() {
    navigate = useNavigate();
    return null;
  }
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[entry]}>
        <PredictPage />
        <Navigator />
      </MemoryRouter>
    </HelmetProvider>
  );
  return { goTo: (to: string) => void act(() => navigate?.(to)) };
}

// Story 1.5 (Decisions 1-2) turned the three Predict surfaces into real
// `<button>`s, so the click helpers retarget once, centrally, to the accessible
// element instead of the hint `<p>` inside it. Every suite shares these, and the
// hint copy itself is unchanged — `predict-keyboard.test.tsx` pins the roles.
//
// A second, quieter consequence: because the trigger is now focusable, Radix
// hands focus back to it when the picker unmounts, and that restore lands a
// tick after the closing click. Anything that moves focus afterwards would
// have it stolen mid-test, so the helpers wait the unmount out — focus then
// rests where a real fan would have left it: on the trigger.
async function settlePickerClose() {
  await waitFor(() => {
    if (screen.queryByRole('dialog')) throw new Error('the picker is still mounted');
  });
}

export async function chooseMethod(label = 'Logistic Regression') {
  fireEvent.click(screen.getByRole('button', { name: /Click to choose method/ }));
  const option = await screen.findByRole('button', { name: new RegExp(label) });
  fireEvent.click(option);
  await settlePickerClose();
}

export async function chooseCustomMatchup() {
  fireEvent.click(screen.getByRole('button', { name: /Click to choose series/ }));
  const option = await screen.findByRole('button', { name: /Custom Matchup/ });
  fireEvent.click(option);
  await settlePickerClose();
}

export function fillField(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

export function fillCustomForm() {
  fillField('team_a', 'BOS');
  fillField('team_b', 'MIA');
  for (let game = 1; game <= 6; game++) {
    fillField(`game_${game}_score_a`, `${100 + game}`);
    fillField(`game_${game}_score_b`, `${90 + game}`);
  }
}

export function submitPrediction() {
  fireEvent.click(screen.getByRole('button', { name: 'Click to generate prediction' }));
}

export function panel() {
  return screen.getByRole('status');
}

// The picker's decade and year cards are `<button>`s whose text is split across
// stacked `<span>`s, so their accessible name is precisely the jsdom-vs-Chrome
// accname divergence AGENTS.md · Evidence discipline forbids asserting (F16).
// These helpers locate a card by the raw textContent concatenation instead, and
// hand the same string back for assertions.
function findCard(prefix: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((button) => (button.textContent ?? '').startsWith(prefix));
}

function cardByText(prefix: string): HTMLButtonElement {
  const matches = Array.from(document.querySelectorAll('button')).filter((button) => (button.textContent ?? '').startsWith(prefix));
  if (matches.length !== 1) {
    throw new Error(`expected exactly one card starting with "${prefix}", found ${matches.length}`);
  }
  return matches[0];
}

export function clickDecadeCard(decade: number) {
  fireEvent.click(cardByText(`${decade}s`));
}

export function yearCardText(year: number): string {
  return cardByText(`${year}`).textContent ?? '';
}

export async function clickYearCard(year: number) {
  await waitFor(() => {
    if (!findCard(`${year}`)) throw new Error(`no ${year} card yet`);
  });
  fireEvent.click(cardByText(`${year}`));
}

export function pressRetry() {
  fireEvent.click(within(panel()).getByRole('button', { name: 'Retry' }));
}
