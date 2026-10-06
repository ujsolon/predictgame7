import { beforeEach, describe, expect, it, vi } from 'vitest';

// The port forwards to the SDK singleton verbatim (Story 4.0 I/O matrix). The
// mock records the exact argument list of each call, so arity is observable:
// `toHaveBeenCalledWith('x')` would also pass for `('x', undefined)`.
const sdk = vi.hoisted(() => ({
  capture: vi.fn(),
  captureException: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('posthog-js', () => ({ default: sdk }));

import { captureError, EVENTS, identify, resetUser, track } from '@/lib/analytics';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EVENTS registry', () => {
  it("holds addendum §A.1's ten names, verbatim and nothing else", () => {
    expect(Object.values(EVENTS).sort()).toEqual(
      [
        'prediction_generated',
        'series_selected',
        'custom_series_selected',
        'prediction_method_selected',
        'detailed_analysis_viewed',
        'prediction_reset',
        'banner_hotspot_clicked',
        'contact_form_submitted',
        'historical_series_expanded',
        'historical_filter_applied',
      ].sort()
    );
  });
});

describe('track', () => {
  it('forwards an event with props as capture(name, props)', () => {
    const props = { series_id: 's1', series_year: 2016 };
    track(EVENTS.SERIES_SELECTED, props);
    expect(sdk.capture.mock.calls).toEqual([['series_selected', props]]);
    expect(sdk.capture.mock.calls[0][1]).toBe(props);
  });

  it('forwards an event without props as capture(name), one argument', () => {
    track(EVENTS.PREDICTION_RESET);
    expect(sdk.capture.mock.calls).toEqual([['prediction_reset']]);
    expect(sdk.capture.mock.calls[0]).toHaveLength(1);
  });

  it('rejects an unregistered name at type-check time', () => {
    // @ts-expect-error — 'foo' is not an EventName; `tsc -b` fails if this ever compiles.
    track('foo');
    expect(sdk.capture).toHaveBeenCalledTimes(1);
  });
});

describe('captureError', () => {
  it('forwards as captureException(err), one argument', () => {
    const err = new Error('boom');
    captureError(err);
    expect(sdk.captureException.mock.calls).toHaveLength(1);
    expect(sdk.captureException.mock.calls[0]).toHaveLength(1);
    expect(sdk.captureException.mock.calls[0][0]).toBe(err);
  });

  it('forwards a context argument only when one is given', () => {
    const err = new Error('boom');
    captureError(err, { where: 'test' });
    expect(sdk.captureException.mock.calls).toEqual([[err, { where: 'test' }]]);
  });

  it('lets a throwing SDK propagate to the caller, whose own guard handles it', () => {
    sdk.captureException.mockImplementationOnce(() => {
      throw new Error('sdk down');
    });
    expect(() => captureError(new Error('boom'))).toThrow('sdk down');
  });
});

describe('identify / resetUser', () => {
  it('identifies by user id alone, with no person properties', () => {
    identify('user-1');
    expect(sdk.identify.mock.calls).toEqual([['user-1']]);
  });

  it('resets through the SDK reset', () => {
    resetUser();
    expect(sdk.reset.mock.calls).toEqual([[]]);
  });
});
