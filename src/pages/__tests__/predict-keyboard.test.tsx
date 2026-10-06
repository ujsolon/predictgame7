// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  chooseCustomMatchup,
  chooseMethod,
  conformingResult,
  fetchError,
  fillCustomForm,
  panel,
  renderPage,
  seriesFixture,
  submitPrediction,
} from './helpers';

// Story 1.5, Decisions 1 and 2: the three primary Predict surfaces — Series
// picker, Method picker, Generate — must live in the Tab ring as real
// `<button>`s reachable by Enter and Space, with no interactive element nested
// inside them, while the custom-matchup grid keeps its place as a SIBLING of
// the Series trigger. This file pins that; the two older suites drive the same
// surfaces through ./helpers, which now queries them by role too.
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

// The tab-ring probe Story 1.3's QA ran in a real browser, transcribed: the
// focusable selectors, disabled controls excluded. It is the assertion that
// makes the mutation matter — a surface that is a plain `<div>` reports
// `tabIndex === -1` and drops out of this list by construction, exactly the
// gap the fix closes.
function tabRing(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]'
    )
  ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex >= 0);
}

// jsdom implements no keyboard→click activation behaviour for buttons: that is
// the browser's own, which is why Decision 1/2 land on a real
// `<button type="button">` rather than a click handler on a `<div>`. So this
// asserts the browser-side preconditions the app must not break — native
// button, `type="button"`, focusable, no handler cancelling the keypress — and
// then dispatches the click the browser dispatches for that key: on keydown for
// Enter, on keyup for Space.
function activateByKeyboard(element: HTMLElement, key: 'Enter' | ' ') {
  expect(element.tagName).toBe('BUTTON');
  expect(element.getAttribute('type')).toBe('button');
  expect(element.tabIndex).toBeGreaterThanOrEqual(0);
  element.focus();
  expect(element).toHaveFocus();

  // fireEvent returns false once preventDefault has been called.
  expect(fireEvent.keyDown(element, { key })).toBe(true);
  if (key === 'Enter') {
    expect(fireEvent.click(element)).toBe(true);
    return;
  }
  expect(fireEvent.keyUp(element, { key })).toBe(true);
  expect(fireEvent.click(element)).toBe(true);
}

// Decision 1's substance, not just the ring: nothing interactive may sit
// inside a trigger, or assistive tech hides it in browse mode.
function assertNoInteractiveDescendant(element: Element) {
  expect(element.querySelector('input, select, textarea, button, a[href]')).toBeNull();
}

describe('PredictPage keyboard operability (Story 1.5)', () => {
  it('puts the Series and Method triggers in the tab ring as real buttons, in DOM order', () => {
    renderPage();

    const series = screen.getByRole('button', { name: /Click to choose series/ });
    const method = screen.getByRole('button', { name: /Click to choose method/ });

    for (const trigger of [series, method]) {
      expect(trigger.tagName).toBe('BUTTON');
      expect(trigger.getAttribute('type')).toBe('button');
      // Radix merged its trigger state onto a real button, not onto a div.
      expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
      expect(trigger.tabIndex).toBe(0);
      assertNoInteractiveDescendant(trigger);
    }

    const ring = tabRing();
    expect(ring).toEqual(expect.arrayContaining([series, method]));
    expect(ring.indexOf(series)).toBeLessThan(ring.indexOf(method));
  });

  // Found by the owner's NVDA pass (§6.1), not by anything automated: Chrome's
  // accessible-name computation concatenates a trigger's descendant text with no
  // separator, so the real screen reader said "Select a SeriesClick to choose
  // series" and "Not selectedClick to choose method". The regexes above match the
  // fused string too, which is why they never caught it.
  //
  // This deliberately asserts `textContent`, NOT `getByRole({ name })`:
  // `dom-accessibility-api` inserts a space between block-level siblings that
  // Chrome does not, so a role/name query reports the separated name in jsdom
  // either way and the test would pass on the broken tree. `textContent` is the
  // raw concatenation, so it is the only assertion here that reddens when the
  // whitespace text node is removed.
  it('separates the trigger label from its hint in the rendered text', () => {
    renderPage();

    const series = screen.getByRole('button', { name: /Click to choose series/ });
    const method = screen.getByRole('button', { name: /Click to choose method/ });

    expect(series.textContent).toBe('Select a Series Click to choose series');
    expect(method.textContent).toBe('Not selected Click to choose method');
  });

  it('opens the series picker on Enter and on Space, Escape closing it back to the trigger', async () => {
    renderPage();
    const trigger = screen.getByRole('button', { name: /Click to choose series/ });

    activateByKeyboard(trigger, 'Enter');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Select Series')).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Focus comes back to the trigger, so the keyboard user is not dumped on
    // the document body — the precondition for re-opening it below.
    expect(trigger).toHaveFocus();

    activateByKeyboard(trigger, ' ');
    await screen.findByRole('dialog');
  });

  it('opens the method picker on Enter and on Space without losing the nested Details links', async () => {
    renderPage();
    const trigger = screen.getByRole('button', { name: /Click to choose method/ });

    activateByKeyboard(trigger, 'Enter');
    const dialog = await screen.findByRole('dialog');
    // The four options stay buttons and their "Details" links stay nested in
    // them (Decision 1 keeps that intact — only the Series card was narrowed).
    expect(within(dialog).getByText('Select Method')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('link', { name: 'Details' })).toHaveLength(4);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    activateByKeyboard(trigger, ' ');
    const reopened = await screen.findByRole('dialog');
    fireEvent.click(within(reopened).getByRole('button', { name: /Elo Rating/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: /^Elo Rating/ })).toBeInTheDocument();
  });

  it('keeps every custom-grid input individually focusable and typed into, beside the Series trigger', async () => {
    renderPage();
    await chooseCustomMatchup();

    const trigger = screen.getByRole('button', { name: /TBD vs TBD/ });
    expect(trigger.tagName).toBe('BUTTON');
    assertNoInteractiveDescendant(trigger);

    const teamA = screen.getByRole('textbox', { name: 'Team A' });
    const teamB = screen.getByRole('textbox', { name: 'Team B' });
    const game1A = document.getElementById('game_1_score_a') as HTMLInputElement;
    const game6B = document.getElementById('game_6_score_b') as HTMLInputElement;

    // Siblings of the trigger, never descendants of it.
    expect(trigger.contains(teamA)).toBe(false);
    expect(trigger.contains(game1A)).toBe(false);

    // Individually focusable and typeable — the trigger does not swallow keys.
    for (const input of [teamA, teamB, game1A, game6B]) {
      input.focus();
      expect(input).toHaveFocus();
    }
    fireEvent.change(teamA, { target: { value: 'BOS' } });
    expect(teamA).toHaveValue('BOS');
    fireEvent.change(game1A, { target: { value: '101' } });
    // `type="number"` reports the value to jest-dom as a number; the string
    // form is what the fan sees, so pin both.
    expect(game1A.value).toBe('101');
    expect(game1A).toHaveValue(101);

    // The ring is a superset of what Story 1.3's QA measured: the same 14
    // inputs, plus the two picker triggers.
    const ring = tabRing();
    expect(ring.filter((element) => element.tagName === 'INPUT')).toHaveLength(14);
    expect(ring).toEqual(expect.arrayContaining([trigger, teamA, teamB, game1A, game6B]));
    expect(ring).toContain(screen.getByRole('button', { name: /Click to choose method/ }));
  });

  it('activates Generate with Enter and Space for exactly one invoke each, and ignores the card click once a result exists', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();

    const submit = screen.getByRole('button', { name: 'Click to generate prediction' });
    expect(submit.tagName).toBe('BUTTON');
    expect(submit).toBeEnabled();
    expect(tabRing()).toEqual(expect.arrayContaining([submit]));

    db.invoke.mockResolvedValue({ data: conformingResult, error: null });

    activateByKeyboard(submit, 'Enter');
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    expect(db.invoke.mock.calls[0][1].body.method).toBe('logistic_regression');
    await waitFor(() => expect(submit).toBeEnabled());

    db.invoke.mockClear();
    activateByKeyboard(submit, ' ');
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).toBeEnabled());

    // F1 (owner, 2026-09-29): with a result on screen the card body is inert.
    // A stray click used to re-issue the whole prediction — the Decision 2
    // footgun matrix §7 filed as F1 — and re-running is now Generate's job.
    db.invoke.mockClear();
    fireEvent.click(screen.getByText('Predict'));
    expect(db.invoke).not.toHaveBeenCalled();

    db.invoke.mockClear();
    activateByKeyboard(submit, 'Enter');
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
  });

  it('keeps the card body clickable as the mouse path until a result exists', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();

    db.invoke.mockResolvedValue({ data: conformingResult, error: null });

    // Nothing rendered yet, so the card's own click still generates — this is
    // the shipped mouse affordance F1 deliberately leaves alone.
    fireEvent.click(screen.getByText('Predict'));
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());

    db.invoke.mockClear();
    fireEvent.click(screen.getByText('Losing Team'));
    expect(db.invoke).not.toHaveBeenCalled();
  });

  // Retro finding A3: Story 1.5 retargeted `submitPrediction()` in ./helpers to
  // the Generate `<button>`, and Story 1.4's series-path describe moved onto it,
  // so the card-body mouse surface was left asserted only on the custom route.
  // The main fan route gets both halves of F1's rule pinned here.
  it('keeps the card body clickable as the mouse path on the series route too', async () => {
    renderPage('/predict?series=s-1');
    await screen.findByText('BOS vs MIA');
    await chooseMethod();

    db.invoke.mockResolvedValue({ data: conformingResult, error: null });

    fireEvent.click(screen.getByText('Predict'));
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    // A card click on this route submits the series attempt, not a custom one.
    expect(db.invoke.mock.calls[0][1].body).toMatchObject({
      series_id: 's-1',
      method: 'logistic_regression',
    });
    await waitFor(() => expect(screen.getByText('Predicted Winner')).toBeInTheDocument());

    // F1's other half on the series route: the result region is inert, and an
    // explicit Generate still re-runs the same attempt.
    db.invoke.mockClear();
    fireEvent.click(screen.getByText('Predict'));
    fireEvent.click(screen.getByText('Losing Team'));
    expect(db.invoke).not.toHaveBeenCalled();

    submitPrediction();
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
  });

  it('holds the in-flight Generate disabled so a second activation cannot double-fire', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();

    const submit = screen.getByRole('button', { name: 'Click to generate prediction' });
    // A request that never resolves is the state the fan actually sits in while
    // waiting, and `loading` is the only thing separating a repeated activation
    // from a second concurrent prediction — `handlePredict` has no guard of its
    // own. Both halves matter: `disabled` is what the browser enforces, the
    // onClick guard is what holds in jsdom, where a disabled `<button>` still
    // receives a dispatched click.
    db.invoke.mockImplementation(() => new Promise(() => {}));

    fireEvent.click(submit);
    await waitFor(() => expect(db.invoke).toHaveBeenCalledTimes(1));
    expect(submit).toBeDisabled();
    // In flight the label must not invite the click the control cannot take.
    expect(screen.getByRole('button', { name: 'Generating prediction…' })).toBe(submit);

    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(db.invoke).toHaveBeenCalledTimes(1);
  });

  it('leaves an incomplete selection with a disabled submit control, outside the ring and inert', () => {
    renderPage();

    const submit = screen.getByRole('button', { name: 'Select series and method first' });
    // A real disabled `<button>`, not the opacity-only fakery the card wore.
    // `tabRing()` filters on `disabled` by construction, so asserting exclusion
    // here would test the probe; the browser's own exclusion of a disabled
    // button from sequential focus navigation is matrix §2.1's measured cell.
    expect(submit.tagName).toBe('BUTTON');
    expect(submit).toBeDisabled();

    // Neither the control nor the card that still carries its own click can
    // start a request or announce one.
    fireEvent.click(submit);
    fireEvent.click(screen.getByText('Predict'));
    expect(db.invoke).not.toHaveBeenCalled();
    expect(db.toast.error).not.toHaveBeenCalled();
  });

  it('keeps Retry the only tab stop inside the failure panel', async () => {
    renderPage();
    await chooseCustomMatchup();
    await chooseMethod();
    fillCustomForm();

    submitPrediction();
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());

    const retry = within(panel()).getByRole('button', { name: 'Retry' });
    const ring = tabRing();
    expect(ring.filter((element) => panel().contains(element))).toEqual([retry]);
    // The panel container stays programmatically focusable only (it takes
    // focus on mount so the swap is announced) — never a ring stop.
    expect(panel()).toHaveAttribute('tabindex', '-1');
    expect(ring).not.toContain(panel());
  });
});
