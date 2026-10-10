// @vitest-environment jsdom
// Story 6.1's first task: the two analytics pins the Story 4.0 deferrals left
// open — the SDK bootstrap and the barrel's purity.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('posthog-js', () => ({ default: sdk }));
vi.mock('@posthog/react', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PostHogErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AnalyticsProvider bootstrap', () => {
  it('initializes the SDK once, with the configured key and host', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://ph.example.test');
    const { AnalyticsProvider } = await import('@/lib/analytics/provider');

    const { rerender } = render(
      <AnalyticsProvider>
        <p>child</p>
      </AnalyticsProvider>
    );
    rerender(
      <AnalyticsProvider>
        <p>child again</p>
      </AnalyticsProvider>
    );

    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init.mock.calls[0][0]).toBe('phc_test_key');
    expect(sdk.init.mock.calls[0][1]).toMatchObject({ api_host: 'https://ph.example.test' });
  });

  it('does nothing without a key: no init, and children still render', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    const { AnalyticsProvider } = await import('@/lib/analytics/provider');

    const { container } = render(
      <AnalyticsProvider>
        <p>child</p>
      </AnalyticsProvider>
    );

    expect(sdk.init).not.toHaveBeenCalled();
    expect(container.textContent).toBe('child');
  });

  it('importing the barrel never boots the SDK', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
    await import('@/lib/analytics');
    expect(sdk.init).not.toHaveBeenCalled();
  });
});

describe('@/lib/analytics barrel purity', () => {
  it('exports only the documented runtime surface', async () => {
    const barrel = await import('@/lib/analytics');
    expect(Object.keys(barrel).sort()).toEqual(['EVENTS', 'captureError', 'identify', 'resetUser', 'track']);
  });

  it('the provider module exports only AnalyticsProvider', async () => {
    const provider = await import('@/lib/analytics/provider');
    expect(Object.keys(provider)).toEqual(['AnalyticsProvider']);
  });

  it('imports nothing feature-side: only its own folder, the vendor SDK and React', () => {
    const dir = path.resolve(__dirname, '../analytics');
    const allowed = new Set(['posthog-js', '@posthog/react', 'react']);
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    expect(files.sort()).toEqual(['events.ts', 'index.ts', 'provider.tsx']);
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      // Static `import … from` / `export … from`, side-effect `import '…'`, and dynamic `import('…')`.
      const patterns = [
        /^\s*(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/gm,
        /^\s*import\s+['"]([^'"]+)['"]/gm,
        /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      ];
      const specifiers = patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((m) => m[1]));
      for (const spec of specifiers) {
        const ok = spec.startsWith('./') ? !spec.includes('..') : allowed.has(spec);
        expect(ok, `${file} imports ${spec}`).toBe(true);
      }
    }
  });
});
