// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useIsMobile } from '@/hooks/use-mobile';

// The 1.2 deferred-work note asks for exactly this: true below 768px, false
// above, a dispatched `change` updating it, and the listener gone on unmount.
// `window.matchMedia` is stubbed here (and nowhere else in the repo) —
// `renderHook` keeps the harness off the whole Sidebar/Radix tree.
// The stub records the event TYPE alongside each listener: the hook reads
// `window.innerWidth` itself, so the query string and the type it subscribes
// to are the only contract a stub can pin. Duplicating `matches` would test
// the stub, not the hook.

type MediaQueryListener = () => void;
type Registration = { type: string; listener: MediaQueryListener };

const stub: { query: string; added: Registration[]; removed: Registration[] } = {
  query: '',
  added: [],
  removed: [],
};

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

beforeEach(() => {
  stub.query = '';
  stub.added = [];
  stub.removed = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      stub.query = query;
      return {
        media: query,
        onchange: null,
        addEventListener: (type: string, listener: MediaQueryListener) => {
          stub.added.push({ type, listener });
        },
        removeEventListener: (type: string, listener: MediaQueryListener) => {
          stub.removed.push({ type, listener });
        },
        dispatchEvent: () => false,
      };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIsMobile', () => {
  it('reports mobile below the breakpoint, watching the 767px query for changes', () => {
    setViewport(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    expect(stub.query).toBe('(max-width: 767px)');
    expect(stub.added.map((entry) => entry.type)).toEqual(['change']);
  });

  it('splits at the breakpoint the query names: 767 mobile, 768 desktop', () => {
    setViewport(767);
    expect(renderHook(() => useIsMobile()).result.current).toBe(true);
    setViewport(768);
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
    setViewport(1024);
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
  });

  it('updates when the media query dispatches a change event', () => {
    setViewport(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    setViewport(500);
    act(() => {
      for (const { type, listener } of stub.added) {
        if (type === 'change') listener();
      }
    });
    expect(result.current).toBe(true);
  });

  it('removes the change listener on unmount', () => {
    setViewport(500);
    const { unmount } = renderHook(() => useIsMobile());
    expect(stub.added).toHaveLength(1);

    unmount();
    // Same event type and the same function reference, not just any listener.
    expect(stub.removed).toEqual(stub.added);
  });
});
