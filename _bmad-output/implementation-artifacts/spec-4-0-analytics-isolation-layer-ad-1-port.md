---
title: 'Story 4.0 — Analytics isolation layer (AD-1 port)'
type: 'refactor'
created: '2026-10-07'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-predictgame7-2026-09-23/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/analytics-continuity-before-4-0.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** PostHog is called directly from `main.tsx`, three pages and the dead `AuthContext`. That breaks NFR-V1/AD-1: a vendor exit becomes surgery on many files, and event names can drift from page to page. Epic 4's new surfaces (deep links, series pages, Share) and Epic 3's later stories need one port to emit and query through.

**Approach:** Implement `epics.md` Story 4.0 (was Story 3.1; moved by `sprint-change-proposal-2026-10-07.md`):
- Create `src/lib/analytics/` with:
  - a typed `EVENTS` registry (addendum §A.1's 10 names, verbatim);
  - `track`, `identify`, `resetUser` and `captureError`;
  - `provider.tsx`, which owns `posthog.init` and the provider/error-boundary mount.
- Repoint every call site to the port without changing any event name, property, or firing condition (D1's reset emission is the one deliberate addition).
- Make the isolation a lint error, so it cannot regress.

## Boundaries & Constraints

**Always:**
- Forward to the SDK verbatim:
  - `track(e)` → `capture(e)`; `track(e, p)` → `capture(e, p)`. An absent props argument stays absent.
  - `captureError(err)` → `captureException(err)`, with the same arity rule.
  - Init options are unchanged (`api_host`, `defaults: "2026-01-30"`).
- Each existing call site keeps its exact payload (the only new emission is D1's reset), its guard (e.g. the team-search `if (e.target.value)`), and its position relative to state updates and toasts.
- Feature code imports analytics only from `@/lib/analytics`.
- `posthog-js` and `@posthog/react` imports are a Biome error outside `src/lib/analytics/**`.

**Never:**
- Rename or invent an event name.
- Change the `prediction_generated` firing conditions (D2).
- Add the personal PostHog key or any new `VITE_*` var.
- Build the FR-25 query surface or the SM-1 definition (Story 3.4).
- Import `AuthContext`/`RouteGuard` from anywhere new (AD-9), or delete them.
- Deploy without the owner's request.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Event with props | `track(EVENTS.SERIES_SELECTED, {...})` | `posthog.capture('series_selected', {...})` | N/A |
| Event without props | `track(EVENTS.PREDICTION_RESET)` | `posthog.capture('prediction_reset')`, called with one argument | N/A |
| Error capture | `captureError(err)` in any existing catch block | `posthog.captureException(err)`, called with one argument | Throwing SDK: caller's existing guard (the `prediction_generated` try block) unchanged |
| Unregistered name | `track('foo')` | Type error at `tsc -b` | Gate red |
| Cold landing | first load of `/`, `/historical`, `/predict` | One `$pageview` each (as measured at HEAD, below) | N/A |
| Archive reset | reset button pressed (filters active) | `track(EVENTS.HISTORICAL_FILTER_APPLIED, { filter_type: 'reset' })`, once per press | N/A |

**Owner decisions (2026-10-07):**
- **D1 — finding (c), option B.** The archive reset button emits the existing `historical_filter_applied` with `{ filter_type: 'reset' }`. This is a new property value under a frozen name, and it is the one deliberate count change in this story. The "All Years" `{year:'all'}` emission stays exactly as it is.
- **D2 — finding (d), option A: deferred.** The late `prediction_generated` after leaving Predict stays as it is, and its deferred-work entry stays open.
- **D3 — live-view acceptance: deferred.** The story closes on `npm run gate` plus the headless before/after event walk. The PostHog live-view comparison is split: the owner records the **before** leg (the 10 events on the then-live site) before the first release carrying this story, and Story 4.7 records the after leg and the comparison (re-pointed from Story 3.5 by `sprint-change-proposal-2026-10-07.md`).
- **D4 — resequenced.** The story was renumbered 3.1 → 4.0 and Epic 4 runs before Epic 3 (`sprint-change-proposal-2026-10-07.md`). The spec stays in `draft`; resume via `bmad-build` with this file.

## Code Map

- `src/main.tsx:6-21` -- `posthog.init` + `PostHogProvider`/`PostHogErrorBoundary`. Move both into the port and mount `<AnalyticsProvider>`.
- `src/pages/PredictPage.tsx` -- `usePostHog` at :41. `captureException` at :152, :165, :197, :358, :379. `capture` at :392 (`prediction_generated`, inside its own try, keep it there), :471, :905, :998/:1021/:1044/:1067, :1261, :1401.
- `src/pages/HistoricalPage.tsx` -- `usePostHog` at :48. `capture` at :176 (year), :198 (team search; the guard stays), :250 (expanded). `resetFilters` at :139 gains D1's emission. Pin it in `historical-page-archive.test.tsx`.
- `src/pages/HomePage.tsx` -- `usePostHog` at :115. `contact_form_submitted` at :234, `captureException` at :240, hotspot at :278.
- `src/contexts/AuthContext.tsx:8,93-94,112-113,123` -- dead; no `AuthProvider` is mounted. Repoint `identify` → `identify(id)`, and `reset` → `resetUser()`. Drop the two `user_signed_in`/`user_signed_up` captures. Those names are outside the registry, addendum §A.1 records "no named auth events", and the code never runs. The `{username}` person props go too: `identify(userId)` is the port's signature.
- 6 tests in `src/pages/__tests__/` mock `@posthog/react` `usePostHog` → `{capture: db.capture, captureException: db.captureException}`. Swap each to `vi.mock('posthog-js', () => ({ default: { capture: db.capture, captureException: db.captureException } }))` and change **no assertion**, so the existing pins (e.g. `historical-page-archive.test.tsx:381` exact call log, `predict-flow-regression.test.tsx:682`) now prove the port forwards verbatim.
- `biome.json` -- add `style.noRestrictedImports` for both packages, plus an override that turns it off for `src/lib/analytics/**`.
- `README.md` § Analytics -- point it at the port. Remove "auth events".
- Not to change: the `scripts/measure-predict-latency.mjs` analytics interception (it reads the wire, so it is vendor-coupled by design).

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/analytics/events.ts` -- `EVENTS` const (10 names) + `EventName` type -- no SDK import, so tests and types can use it cheaply.
- [ ] `src/lib/analytics/index.ts` -- `track`, `identify`, `resetUser`, `captureError` over the `posthog-js` singleton (the same instance the provider initializes), re-exporting `EVENTS`/`EventName`/`AnalyticsProvider`. A header comment cites AD-1 and the ad-blocker caveat (finding b: no code; a blocked first send replays as `retry_count=N`).
- [ ] `src/lib/analytics/provider.tsx` -- `init` at module load (as `main.tsx` does today), and `AnalyticsProvider` renders `PostHogProvider client` > `PostHogErrorBoundary` > children.
- [ ] `src/main.tsx`, three pages, `AuthContext.tsx` -- repoint per the Code Map.
- [ ] 6 test files -- swap the mock only.
- [ ] `src/lib/__tests__/analytics.test.ts` -- the I/O matrix's arity rows against a mocked `posthog-js`. `EVENTS` equals the 10 §A.1 names exactly.
- [ ] `biome.json`, `README.md` -- per the Code Map. Prove the rule: a temporary `import posthog from 'posthog-js'` in a page makes `npm run lint` fail. Revert it.
- [ ] `deferred-work.md` -- annotate findings a, b, c, d and e with this story's disposition.

**Acceptance Criteria:**
- Given the change, when `grep -rn "posthog-js\|@posthog/react" src` runs, then the only hits are `src/lib/analytics/**` and `vi.mock` strings in tests.
- Given a build, when the bundle is searched, then it contains no `phx_` personal key and the `VITE_*` var set is unchanged.
- Given the headless harness (`openBrowserSession`, PostHog answered locally), when the scripted walk runs at the baseline and at the change, then the decoded event lists match. The walk covers: land on `/`, `/historical`, `/predict`; click a hotspot; apply the year filter; type a team search; expand a row.
- Given `npm run gate`, then green.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Finding (a) is refuted at HEAD, by measurement rather than inference. `posthog-js@1.376.4` init calls `capture_pageview && setTimeout(Ki)`, and `"history_change"` is truthy. `Ki` captures `$pageview` once `visibilityState === 'visible'`. A cold, extension-free headless Chrome against a `vite build` of `282c1dd` (2026-10-07) decoded `$pageview` on first load of `/`, `/historical` and `/predict`. So the init options stay byte-identical. The 2026-09-30 "no `/i/v0/e/` at all" observation against production is superseded: the owner's live-view before leg (2026-10-07, `analytics-continuity-before-4-0.md`) shows a landing `$pageview` at `/` arriving in PostHog from production.

## Verification

**Commands:**
- `npm run gate` -- expected: exit 0.
- The headless event walk (above) at the baseline and after the change -- expected: identical decoded event-name/property lists.
