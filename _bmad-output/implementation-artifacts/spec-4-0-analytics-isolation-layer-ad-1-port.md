---
title: 'Story 4.0 — Analytics isolation layer (AD-1 port)'
type: 'refactor'
created: '2026-10-07'
status: 'done'
baseline_commit: 'f21847a1d422d01d006fbcfcc4f9f0f00ad7c79a'
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
- [x] `src/lib/analytics/events.ts` -- `EVENTS` const (10 names) + `EventName` type -- no SDK import, so tests and types can use it cheaply.
- [x] `src/lib/analytics/index.ts` -- `track`, `identify`, `resetUser`, `captureError` over the `posthog-js` singleton (the same instance the provider initializes), re-exporting `EVENTS`/`EventName`/`AnalyticsProvider`. A header comment cites AD-1 and the ad-blocker caveat (finding b: no code; a blocked first send replays as `retry_count=N`).
- [x] `src/lib/analytics/provider.tsx` -- `init` at module load (as `main.tsx` does today), and `AnalyticsProvider` renders `PostHogProvider client` > `PostHogErrorBoundary` > children.
- [x] `src/main.tsx`, three pages, `AuthContext.tsx` -- repoint per the Code Map.
- [x] 6 test files -- swap the mock only.
- [x] `src/lib/__tests__/analytics.test.ts` -- the I/O matrix's arity rows against a mocked `posthog-js`. `EVENTS` equals the 10 §A.1 names exactly.
- [x] `biome.json`, `README.md` -- per the Code Map. Prove the rule: a temporary `import posthog from 'posthog-js'` in a page makes `npm run lint` fail. Revert it.
- [x] `deferred-work.md` -- annotate findings a, b, c, d and e with this story's disposition.

**Acceptance Criteria:**
- Given the change, when `grep -rn "posthog-js\|@posthog/react" src` runs, then the only hits are `src/lib/analytics/**` and `vi.mock` strings in tests.
- Given a build, when the bundle is searched, then it contains no `phx_` personal key and the `VITE_*` var set is unchanged.
- Given the headless harness (`openBrowserSession`, PostHog answered locally), when the scripted walk runs at the baseline and at the change, then the decoded event lists match. The walk covers: land on `/`, `/historical`, `/predict`; click a hotspot; apply the year filter; type a team search; expand a row.
- Given `npm run gate`, then green.

## Implementation Notes

Implementation pass, 2026-10-07 (uncommitted at the time of writing).

- **One deviation: `AnalyticsProvider` is not re-exported from the `@/lib/analytics` barrel.** `main.tsx` imports it from `@/lib/analytics/provider`. The reason is a conflict inside the spec. `provider.tsx` must call `posthog.init` at module load, and the six page tests must swap to a `posthog-js` mock with only `capture`/`captureException` and change nothing else. If the barrel re-exported the provider, every page import would evaluate `posthog.init` on that mock and throw `TypeError: init is not a function`. Keeping bootstrap out of the barrel also means importing the port never boots the SDK as a side effect. The import rule still holds: `main.tsx` imports from the port folder, never from the vendor. The reasoning is recorded in the header comment of `index.ts`.
- `captureError(err, ctx?)` takes the spine's optional context argument (AD-1) under the same arity rule: an omitted `ctx` stays omitted on the wire. No call site passes one today.
- **Tests.** In each of the six page tests the `@posthog/react` mock became a `posthog-js` default-export mock with the same `capture`/`captureException` functions, and no existing assertion changed. `historical-page-archive.test.tsx` gains one new case, which the Code Map asks for: the D1 reset is pinned as the whole call log (year, team_search, reset). Mutation check: deleting the `resetFilters` emission makes that case, and only that case, fail. The `@ts-expect-error` on `track('foo')` in `analytics.test.ts` makes the "unregistered name" row a `tsc -b` assertion.
- **Biome rule proven.** A temporary `posthog-js` + `@posthog/react` import at the top of `HomePage.tsx` made `npm run lint` exit 1 with two `lint/style/noRestrictedImports` errors. The import was reverted.
- **Acceptance evidence:**
  - **grep.** The only `posthog-js` / `@posthog/react` hits are `src/lib/analytics/{index.ts,provider.tsx}` (imports and comments) and the seven `vi.mock('posthog-js', …)` strings in tests.
  - **Bundle.** The only `phx_` strings are Supabase realtime's Phoenix protocol literals (`phx_join`, `phx_ref`, …), which the baseline bundle contains too. No key-shaped `phx_<token>` appears.
  - **`VITE_*` set.** Unchanged: `VITE_POSTHOG_HOST`, `VITE_POSTHOG_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`.
- **Headless walk.** The script is scratchpad-only and uncommitted. It imports `openBrowserSession` from `scripts/measure-predict-latency.mjs`, with PostHog answered locally. The baseline is a `vite build` of `f21847a`'s source tree, whose bundle is `index-B2RSXBTe.js`, the 0.2.7 production hash. The change is the 4.0 build, `index-BOCk5_iE.js`. Each build was served by its own `vite preview` and walked the same way:
  1. Land on `/`, `/historical` and `/predict`.
  2. Land on `/` and click the 2019 hotspot.
  3. Land on `/historical` and choose a year (2019).
  4. Type a three-letter team code (`por`).
  5. Expand the row, then close it.
  6. Press reset.

  The decoded lists match line for line on event name, `$pathname` and non-`$` properties. Shared lines:
  - `$pageview` ×6, including each cold landing
  - `banner_hotspot_clicked {caption, series_id}`
  - `historical_filter_applied {year}` ×1
  - `historical_filter_applied {team_search}` ×3
  - `historical_series_expanded {…6 props}`

  The single difference is the change's added `historical_filter_applied {filter_type:'reset'}` on the reset press. That is D1, and it is the only line the reset produced. Totals: 23 decoded events at the baseline and 24 at the change, `$autocapture`/`$set` included.
- **Gate.** `npm run gate` exit 0: lint clean, `tsc -b` clean, 25 files / 578 tests, and the build with the base-path check.

- **Orchestrator's independent check (step 3, 2026-10-07).**
  - `npm run gate` exit 0: 25 files / 578 tests, and the build produced `index-BOCk5_iE.js`.
  - A separate scratchpad walk ran against the `vite preview` on 4173, with PostHog answered locally. Its baseline was recorded before dispatch on `index-B2RSXBTe.js`, and it was rerun on `index-BOCk5_iE.js`. The decoded custom and `$pageview` events are identical on name, path and every non-`$` property. That covers 8 lines: 4 `$pageview`, hotspot, year filter, team search and expanded.
  - A reset probe on the 4.0 build decoded `historical_filter_applied {filter_type:'reset'}` on the press. That is D1, seen in a real browser.
  - Every I/O-matrix row maps to a test that ran (`analytics.test.ts`, `historical-page-archive.test.tsx`, `tsc -b` for `@ts-expect-error`), or to the walks for the cold-landing row.

- **Review pass 1 patches (2026-10-07).**
  - `biome.json` gained `patterns` (`posthog-js/**`, `@posthog/**`). A single star still let `@posthog/react/dist/x` through. A probe importing `posthog-js/react` from `src/pages` now fails lint; the probe was deleted.
  - README § Analytics now separates the barrel from `main.tsx`'s `@/lib/analytics/provider` import.
  - `deferred-work.md`: finding (d) is marked owner-gated with no landing story, and finding (a)'s summary is prefixed CLOSED/refuted.
  - New whole-log page cases:
    - Predict: custom series, 4 methods, generate, details, reset. That is 8 `capture` calls, with arity 1 on the no-props calls and `captureException` never called.
    - Home: hotspot, contact success, and contact failure (one `captureException(err)`).
  - Two findings deferred to `deferred-work.md`: the provider `init` test, and the AGENTS.md pointer.
  - `npm run gate` exit 0, 25 files / 582 tests.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-10-07). Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B1/E1 | `noRestrictedImports.paths` matches exact specifiers only, so subpath vendor imports bypass AD-1 | medium | Measured: a probe file in `src/pages` importing `posthog-js/react` (a real subpath; `node_modules/posthog-js/react/` exists) and `@posthog/react/dist/x` passed `biome lint` with no diagnostic; probe deleted | patch |
| B2 | Nothing shows the lint rule fires | false | The rule was proven twice on the real lint path: the implementer's temporary `HomePage.tsx` import (exit 1, two diagnostics) and the V layer's own `ZzProbeTmp.ts` probe | reject |
| B3 | README lists `AnalyticsProvider` under "imports from `@/lib/analytics` only" though the barrel does not export it | low | README §Analytics reads as if the barrel carries it; `index.ts` deliberately does not. Direct wording fix | patch |
| B4 | The port propagates SDK throws, and most call sites are unguarded | low | Pre-existing: the old `posthog?.capture`/`captureException` calls threw identically. The spec's matrix pins "caller's existing guard unchanged". Fixing needs new guards, and the SDK does not throw in normal use | reject |
| B5/V2 | No gate test pins `provider.tsx`'s `init` arguments or the `main.tsx` mount | medium (unverified gap) | Real gap: no test imports `provider`/`main`. It is pre-existing (the init in `main.tsx` was untested too), and the move is evidenced only by the headless walks | defer |
| B6 | Event props are `Record<string, unknown>`, so property keys are untyped | low | True. A per-event props map adds public surface and complexity, and the spec scoped "typed" to names. Not met in everyday use | reject |
| B7 | Finding (d) in `deferred-work.md` has no live landing story ("Lands with Story 2.2", now "Stays open") | low | Verified at `deferred-work.md:202`. Direct wording fix: name it owner-gated with no landing story | patch |
| B8 | Finding (a)'s bold summary still states the refuted claim as fact | low | Verified at `deferred-work.md:214`. The file's convention prefixes closed summaries (e.g. "CLOSED RED 2026-10-03"). Direct fix | patch |
| B9 | AGENTS.md does not name `src/lib/analytics/` or the Biome guard | low | True. The fix edits an agent-context file | defer |
| B10 | Rewired `AuthContext` auth path is untested | false | `AuthProvider` is mounted nowhere (spec Code Map; grep), so the path does not run. The spec scoped it to a repoint of dead code | reject |
| B11 | The review diff omits the spec, sprint status and context files | false | By design: the claims file goes to the edge-case layer alone (step 4). The closures' citations resolve in the working tree | reject |
| E2 | The analytics-folder override switches off the whole rule, which would exempt future restricted paths | low | Hypothetical (no other restricted path exists). A per-path scoped override adds config complexity | reject |
| E3/V-other | Spec task text says `index.ts` re-exports `AnalyticsProvider`; code does not | low | True, and recorded as a deviation in Implementation Notes. The fix edits this build's spec | reject |
| V1 | Nine rewritten call sites (seven §A.1 events: custom series, 4× method, details, reset, hotspot, contact submit, contact `captureError`) have no page test pinning name + props | medium | Pre-verified by the V layer (grep of every name and key across tests). This diff rewrote each line, and a wrong key, wrong props or dropped call passes the gate | patch |

## Design Notes

Finding (a) is refuted at HEAD, by measurement rather than inference. `posthog-js@1.376.4` init calls `capture_pageview && setTimeout(Ki)`, and `"history_change"` is truthy. `Ki` captures `$pageview` once `visibilityState === 'visible'`. A cold, extension-free headless Chrome against a `vite build` of `282c1dd` (2026-10-07) decoded `$pageview` on first load of `/`, `/historical` and `/predict`. So the init options stay byte-identical. The 2026-09-30 "no `/i/v0/e/` at all" observation against production is superseded: the owner's live-view before leg (2026-10-07, `analytics-continuity-before-4-0.md`) shows a landing `$pageview` at `/` arriving in PostHog from production.

## Verification

**Commands:**
- `npm run gate` -- expected: exit 0.
- The headless event walk (above) at the baseline and after the change -- expected: identical decoded event-name/property lists.
