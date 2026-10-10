// Analytics bootstrap (AD-1): the SDK is initialized here, at module load,
// exactly as `main.tsx` did before the port — the init options are unchanged.
// `main.tsx` mounts `<AnalyticsProvider>` and never touches the vendor SDK.
import { PostHogErrorBoundary, PostHogProvider } from '@posthog/react';
import posthog from 'posthog-js';
import type { ReactNode } from 'react';

// Without a key the SDK is never initialized (Story 6.1 pin): posthog-js would
// only log and no-op on an empty token, so the guard makes that contract
// explicit instead of relying on the vendor's behaviour.
const key = import.meta.env.VITE_POSTHOG_KEY;
if (key) {
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    defaults: '2026-01-30',
  });
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  return (
    <PostHogProvider client={posthog}>
      <PostHogErrorBoundary>{children}</PostHogErrorBoundary>
    </PostHogProvider>
  );
}
