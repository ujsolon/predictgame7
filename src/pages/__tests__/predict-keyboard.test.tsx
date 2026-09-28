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

  it('activates Generate with Enter and Space for exactly one invoke each, and keeps the card click', async () => {
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

    // Decision 2: the card keeps its own click as shipped (the accidental
    // re-predict footgun is recorded in `deferred-work.md`, not removed here).
    db.invoke.mockClear();
    fireEvent.click(screen.getByText('Predict'));
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

    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(db.invoke).toHaveBeenCalledTimes(1);
  });

  it('leaves an incomplete selection with a disabled submit control, outside the ring and inert', () => {
    renderPage();

    const submit = screen.getByRole('button', { name: 'Select series and method first' });
    // A real disabled `<button>`, not the opacity-only fakery the card wore.
    expect(submit.tagName).toBe('BUTTON');
    expect(submit).toBeDisabled();
    expect(tabRing()).not.toContain(submit);

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
