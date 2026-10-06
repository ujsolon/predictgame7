// The analytics port (AD-1 / NFR-V1). This folder is the only place the vendor
// SDK (`posthog-js`, `@posthog/react`) may be imported — Biome's
// `noRestrictedImports` makes any other import a lint error. Feature code
// imports from `@/lib/analytics` only; a vendor exit rewrites this folder.
//
// Every function forwards to the SDK verbatim: names come from the typed
// `EVENTS` registry, and an omitted props/context argument stays omitted, so
// the wire payload is byte-for-byte what the direct calls produced.
//
// The `posthog-js` default export is the singleton `provider.tsx` initializes,
// so a call made here lands on the same configured instance.
//
// Ad-blocker caveat (deferred-work finding b — documented, no code): when a
// privacy extension or network filter breaks the first send, posthog-js
// persists the batch and replays it on later loads with `retry_count=N`. The
// app is unaffected (nothing renders from the response), but such visitors may
// be under-counted or arrive late; the owner-side test is a private window with
// extensions off.
//
// Bootstrap lives in `./provider` (`AnalyticsProvider`, mounted by `main.tsx`).
// It is not re-exported here on purpose: `provider.tsx` calls `posthog.init` at
// module load, and keeping it out of this barrel means importing the port never
// boots the SDK as a side effect (page tests mock `posthog-js` with only the
// methods they observe).
//
// Not here yet: FR-25's owner-local metric-query surface and the SM-1
// unique-visitor definition (Story 3.4).
import posthog from 'posthog-js';
import type { EventName } from './events';

export { EVENTS, type EventName } from './events';

export type EventProps = Record<string, unknown>;

/** Emit a registered event. `track(e)` → `capture(e)`; `track(e, p)` → `capture(e, p)`. */
export function track(event: EventName, props?: EventProps): void {
  if (props === undefined) posthog.capture(event);
  else posthog.capture(event, props);
}

/** Report an exception. `captureError(err)` → `captureException(err)`, same arity rule for `ctx`. */
export function captureError(err: unknown, ctx?: EventProps): void {
  if (ctx === undefined) posthog.captureException(err);
  else posthog.captureException(err, ctx);
}

/** Attach the current visitor to a stable user id (no person properties). */
export function identify(userId: string): void {
  posthog.identify(userId);
}

/** Forget the identified user (sign-out). */
export function resetUser(): void {
  posthog.reset();
}
