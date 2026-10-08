// @vitest-environment jsdom
import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('posthog-js', () => ({ default: { capture: mocks.capture, captureException: mocks.captureException } }));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import ShareButton, { SHARE_COPIED, SHARE_COPY_FAILED } from '@/components/common/ShareButton';

const ID = '06715a85-ec33-46a4-8383-d058055eefe6';
// jsdom's origin, and the app base the build uses.
vi.stubEnv('BASE_URL', '/predictgame7/');
const EXPECTED_URL = `${window.location.origin}/predictgame7/series/${ID}/?utm_source=share`;

function setNavigator(share: unknown, writeText: unknown) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
    writable: true,
  });
}

function renderButton(appearance: 'icon' | 'labelled' = 'icon') {
  render(
    <ShareButton
      appearance={appearance}
      path={`series/${ID}/?utm_source=share`}
      title="Cleveland Cavaliers vs Golden State Warriors — Game 7, 2016 Finals"
      surface="series"
      kind="series"
    />
  );
  return document.querySelector('[data-share-button]') as HTMLButtonElement;
}

function abortError() {
  const err = new Error('Share canceled');
  err.name = 'AbortError';
  return err;
}

const sharedCalls = () => mocks.capture.mock.calls.filter(([name]) => name === 'prediction_shared');

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  setNavigator(undefined, undefined);
});

describe('ShareButton (Story 4.4)', () => {
  it('icon form: a ghost icon-only <button> named by aria-label, 44×44, no visible text', () => {
    const button = renderButton('icon');
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    // The name source, asserted as an attribute — never a jsdom-computed name (AGENTS.md, F16).
    expect(button.getAttribute('aria-label')).toBe('Share this series');
    expect(button.textContent).toBe('');
    expect(button.className).toContain('h-11');
    expect(button.className).toContain('w-11');
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('labelled form: an outline button reading "Share", at least 44px tall', () => {
    const button = renderButton('labelled');
    expect(button.textContent).toBe('Share');
    expect(button.getAttribute('aria-label')).toBeNull();
    expect(button.className).toContain('h-11');
    expect(button.className).toContain('border');
  });

  it('native sheet: shares the absolute URL, no toast, prediction_shared once with channel native (matrix: mobile)', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    setNavigator(share, writeText);
    fireEvent.click(renderButton());

    await waitFor(() => expect(sharedCalls()).toHaveLength(1));
    expect(share).toHaveBeenCalledWith({
      url: EXPECTED_URL,
      title: 'Cleveland Cavaliers vs Golden State Warriors — Game 7, 2016 Finals',
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(sharedCalls()[0]).toEqual(['prediction_shared', { surface: 'series', kind: 'series', channel: 'native' }]);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it('native cancel (AbortError): nothing — no toast, no copy, no event', async () => {
    const share = vi.fn().mockRejectedValue(abortError());
    const writeText = vi.fn();
    setNavigator(share, writeText);
    fireEvent.click(renderButton());

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(writeText).not.toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('clipboard: copies the URL, "Link copied." for 2s with no action, prediction_shared once with channel clipboard (matrix: desktop)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator(undefined, writeText);
    fireEvent.click(renderButton());

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(EXPECTED_URL);
    expect(mocks.toast.success).toHaveBeenCalledWith(SHARE_COPIED, { duration: 2000 });
    expect(SHARE_COPIED).toBe('Link copied.');
    expect(sharedCalls()).toEqual([['prediction_shared', { surface: 'series', kind: 'series', channel: 'clipboard' }]]);
  });

  it('clipboard blocked: the address-bar toast, no throw, no event (matrix: clipboard blocked)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    setNavigator(undefined, writeText);
    fireEvent.click(renderButton());

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledTimes(1));
    expect(mocks.toast.error).toHaveBeenCalledWith(SHARE_COPY_FAILED);
    expect(SHARE_COPY_FAILED).toBe("Couldn't copy — long-press the address bar to share.");
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('no clipboard API at all is the same failed copy', async () => {
    setNavigator(undefined, undefined);
    fireEvent.click(renderButton());
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(SHARE_COPY_FAILED));
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('a throwing analytics SDK does not undo a completed copy', async () => {
    mocks.capture.mockImplementationOnce(() => {
      throw new Error('sdk down');
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    setNavigator(undefined, vi.fn().mockResolvedValue(undefined));
    fireEvent.click(renderButton());
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(SHARE_COPIED, { duration: 2000 }));
    await waitFor(() => expect(errorLog).toHaveBeenCalled());
    expect(mocks.toast.error).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('ignores a second tap while a share is pending: one share call, at most one prediction_shared', async () => {
    let settle!: () => void;
    const share = vi.fn(() => new Promise<void>((resolve) => {
      settle = resolve;
    }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator(share, writeText);
    const button = renderButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    settle();
    await waitFor(() => expect(sharedCalls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(sharedCalls()).toHaveLength(1);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();

    // Released once the share settles: the next tap shares again.
    share.mockResolvedValueOnce(undefined);
    fireEvent.click(button);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
  });

  it('is keyboard-operable: a native <button>, so Enter and Space activate it', () => {
    const button = renderButton();
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.disabled).toBe(false);
    expect(button.tabIndex).toBe(0);
  });
});
