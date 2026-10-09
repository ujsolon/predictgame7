---
title: 'Story 6.0 — PredictPage refactor (no behaviour change)'
type: 'refactor'
created: '2026-10-09'
status: 'done'
baseline_commit: 'd77ff4a53c143bbda99bc5724d2e4b8569e7fd93'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/pages/PredictPage.tsx` is 1,418 lines: one component with 19 `useState`, 3 `useRef`/`useMemo` and 4 `useEffect`. Stories 4.0, 4.1 and 4.4 each added to it, and Epic 6 (6.8 team order, 6.1 URLs, 6.2 entry points) is about to edit it again. The Epic 4 retro flagged it as a god file (`epic-4-retro-2026-10-09.md` § B, action 8; owner decision: Story 6.0).

**Approach:** split it into focused hooks and components under a new `src/pages/predict/` folder, with **no user-visible, wire or analytics change**. The characterization tests the retro asked for go in first, then the existing Predict suites act as the safety net.

## Boundaries & Constraints

**Always:**
- **Pin first,** before any production edit, in its own commit-ready step, with the tests passing on the *unrefactored* page:
  1. **The `?custom=` supersession** (deferred-work, 4.4 review V2): with a `?series=` preload still in flight, an in-app move to `/predict?custom=<bad>` must leave the not-found notice standing and no series selected after the late response resolves.
  2. **The preload race as a characterization test** (deferred-work, 4.4): Generate clicked after a preload has painted but before its effects ran. Pin today's outcome and link the deferred entry. The refactor keeps it; fixing it is out of scope.
  3. **The 4.1 `?series=` else-branch** (deferred-work, 4.1): leaving a not-found link for plain `/predict` retires the notice.
- **Target shape:** names are the implementer's call; responsibilities are fixed.
  - `PredictPage.tsx` becomes a thin composition (aim for under ~250 lines) that owns layout and the `showDetails` switch.
  - **Hooks** (pure React, no JSX):
    - the **series catalog**: `fetchAllGames`, `games`, the list-failed and list-loaded flags, `teamRowByName`/`rowFor`;
    - **URL arrival**: the `searchParams` effect for `?series=`, `?method=` and `?custom=`, `loadSeriesById`, `seriesLoadSeq`, the not-found and load-failed state;
    - **prediction**: `loading`, `result`, `predictFailure`, `predictSeq`, `handlePredict`/`runPrediction`, `customFieldErrors`;
    - the **selection state** (`selectedSeries`, `selectedMethod`, `customInput`) and the **reset effect** that retires the result and bumps both sequences on any selection change. These live where both sequence guards can be bumped atomically: one controller hook that composes the others, or state passed in explicitly. **Never two effects that can interleave differently from today.**
  - **Components:**
    - the series card (trigger, picker dialog with the decades → years → series levels and Active group, the custom-matchup grid, the not-found and retry notices);
    - the method card (trigger and dialog);
    - the predict and compact-result card;
    - the detailed result view (including the `ShareButton`).
- **Preserve exactly:**
  - every DOM element, text, class, `id`, `aria-*`, `role` and the focus behaviour;
  - toast texts;
  - every `track(...)` call site's event and props (file:line may move; `scripts/probe-analytics-walk.mjs` extracts call sites from `src/**` at run time and must still pass);
  - the request bodies to `predict-game-7` (`buildSeriesRequest`/`buildCustomRequest` unchanged);
  - the effect ordering and the stale-response guards (Stories 1.x, 4.1, 4.4).
- **Tests:**
  - the five suites (`predict-error-states`, `predict-flow-regression`, `predict-keyboard`, `predict-phase-groups`, `predict-share`) pass with **only** import-path changes. No assertion edits.
  - New unit tests for the extracted hooks are welcome but not required.
  - No computed accessible-name assertions (AGENTS.md).
- **`series_source`, analytics and AD-4:** keep deriving phase via `deriveSeriesPhase`; never read `series.status`.

**Never:**
- Change copy, layout, team order (that is Story 6.8), URLs, the share builders, or the analytics events.
- Fix the preload race.
- Add dependencies or state libraries (no Redux or Zustand; React hooks only).
- Touch `HomePage`, `HistoricalPage` or the series pages.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Characterization: custom supersession | `?series=` load pending → navigate to `?custom=abc` → resolve | notice stays, no series selected, one `role="status"` | N/A |
| Characterization: preload race | Generate between paint and effects | today's outcome, pinned | N/A |
| Characterization: else-branch | not-found `?series=` → plain `/predict` | notice retired | N/A |
| Full suite parity | all existing Predict tests | pass unchanged (imports only) | N/A |
| Wire parity | series and custom predictions | bodies byte-identical (existing body tests) | N/A |
| Analytics parity | `probe-analytics-walk.mjs` live after release | GREEN, same call-site keys | N/A |

</frozen-after-approval>

## Code Map

- `src/pages/PredictPage.tsx`:
  - `:42-43` `asSeries`/`asSeriesRow`;
  - `:45-165` state, refs and the three effects (reset `:96`, notice `:119`, URL arrival `:123`, field errors `:162`);
  - `:166` `fetchAllGames`, `:200` `loadSeriesById`;
  - `:254` `handlePredict`, `:306` `runPrediction`;
  - `:395` `teamRowByName`/`rowFor`, `getSeriesLabel`, `getMethodLabel`, `selectSeries`, `renderSeriesOption`;
  - JSX: compact view `:504`, series card `:507-915` (dialog `:518`, notices `:600`, Active group `:774`), method card `:917-1063`, predict card `:1065-1285`, detailed view `:1287+`.
- **Reuse, don't move:** `src/lib/prediction-request.ts`, `src/lib/custom-matchup.ts`, `src/lib/share*.ts`, `src/lib/error-envelope.ts`, `src/lib/series-phase.ts`, `src/lib/method-display.ts`, `src/components/common/{ShareButton,SeriesNotFound,ErrorRetryPanel}.tsx`.
- **New folder** `src/pages/predict/` (hooks and components). `src/routes.tsx` keeps importing `./pages/PredictPage`.
- **Tests:**
  - `src/pages/__tests__/predict-*.test.tsx`, plus `helpers.tsx` and `series-fixtures.ts`;
  - the new characterization tests go in `src/pages/__tests__/predict-arrival-characterization.test.tsx`.
- **Deferred entries to annotate as pinned:** `deferred-work.md` (4.4: the `?custom=` supersession and the preload race; 4.1: the `?series=` else-branch).

## Tasks & Acceptance

**Execution:**
- [x] `src/pages/__tests__/predict-arrival-characterization.test.tsx` -- the three pins, green on the unrefactored page -- a regression net for exactly what the split risks.
- [x] `src/pages/predict/*` hooks -- extract the catalog, arrival, prediction and controller/selection -- one responsibility each, with both sequence guards preserved.
- [x] `src/pages/predict/*` components -- the series card, method card, predict card and detailed view -- markup moved verbatim.
- [x] `src/pages/PredictPage.tsx` -- a thin composition.
- [x] `deferred-work.md` -- annotate the three entries as pinned (and keep the race open as a known defect).
- [x] Verification -- `npm run gate`, then `npm run build && npm run og:cards && npm run prerender` and `probe-deep-links.mjs` on `vite preview` (the Predict rows) GREEN.

**Acceptance Criteria:**
- Given the refactor, when `npm run gate` runs, then it is green, and the five Predict suites are unchanged apart from imports (`git diff` shows no assertion edits).
- Given `probe-deep-links.mjs` against a local preview, then GREEN; its share round-trip rows exercise Predict end to end.
- Given `PredictPage.tsx` after the change, then it is a composition well under the original size, with no single new file above ~400 lines.

## Implementation Notes

**Files (line counts after review patches).** `src/pages/PredictPage.tsx` 1,418 → 88 (layout plus the `showDetails` switch). New in `src/pages/predict/`:
- Hooks: `usePredictController.ts` 137, `usePrediction.ts` 183, `useSeriesArrival.ts` 155, `useSeriesCatalog.ts` 100.
- Components: `SeriesCard.tsx` 364 (the largest file), `SeriesPicker.tsx` 235 (the dialog body), `PredictCard.tsx` 200, `DetailedResult.tsx` 179, `MethodCard.tsx` 174.
- Helpers: `resultTeams.ts` 44 (the team-name, code and logo logic the compact card and detailed view had duplicated character for character), `types.ts` 23.

Tests: `src/pages/__tests__/predict-arrival-characterization.test.tsx` 267 and `predict-effect-order.test.ts` 38. `src/routes.tsx` is unchanged.

**Controller and effect order.** `usePredictController` owns the selection (`selectedSeries`, `selectedMethod`, `customInput`) and both sequence refs (`seriesLoadSeq`, `predictSeq`). It calls the catalog, prediction and arrival hooks, which declare **no effects**. It then declares all four page effects itself, in the unsplit page's order:
1. reset `[selectedSeries, selectedMethod, customInput]`;
2. notice-retire `[selectedSeries]`;
3. URL arrival `[searchParams]`, which calls `arrival.arrive()`;
4. field-error clear `[selectedSeries, selectedMethod]`.

The arrival hook exposes its effect body as `arrive` rather than owning the effect, so the reset's sequence bumps run before the preload captures its sequence, by construction. The page's share of the reset (leaving the detailed view) is passed in as `onSelectionReset`. The controller returns only state and the intended handlers: `handlePredict`, `retryPreload`, `catalog.retrySeriesList`, `startOver` and the selection setters. `SeriesCard` takes a narrowed `CatalogView`.

**Characterization pins (written first, green on the unrefactored page).**
- `?custom=` supersession (4.4 V2), with a positive control: the same held response selects the series when no `?custom=` move intervenes.
- The `?series=` else-branch (4.1 V3).
- The preload race (4.4), pinned as-is and still open. A sibling probe's layout effect clicks Generate inside the preload's commit, and a `<Profiler>` commit count asserts the click landed in the selection commit, so batching drift fails loudly instead of reading as "fixed".
- After review: the reset's `onSelectionReset` step. A new `?series=` arrival with the detailed view open returns to the cards.

Mutation checks, each red when its guarded line is removed: the `?custom=` `seriesLoadSeq` bump, the else-branch `setSeriesNotFound(false)`, the reset's `predictSeq` bump, and `onSelectionReset()`. The drift guard went red, with its own message, when the click was forced into a later commit.

**Baseline-vs-HEAD parity harness (temporary, deleted).** A scratch Vitest file rendered the baseline page (`git show d77ff4a:src/pages/PredictPage.tsx`) and the refactored page through identical interaction scripts. It compared `document.body.innerHTML` at 24 states, normalising only Radix-generated ids, plus the full `invoke`, analytics `capture` and toast call logs. The states covered:
- every picker level, including Escape-close;
- custom select and form fill, and submit-time field errors with the focused field id;
- the predict-failure panel and its Retry;
- the preload-failure panel and its Retry;
- series and custom results, the detailed view, Back to Analysis, and New Prediction;
- the `?series=abc`, `?custom=abc` and valid `?custom=` arrivals.

Result: byte-identical at every state, identical call logs. The harness was deleted afterwards.

**Gate and live-read verification.**
- `npm run gate` exited 0 (47 files, 859 tests) before review.
- After the review patches, typecheck, lint and the 7 Predict test files (98 tests) are green.
- `npm run build && npm run og:cards && npm run prerender` passed: 179 cards; 183 series pages, 4 shells, sitemap 188 URLs.
- On `vite preview` (port 4392; 4317 was held by another process), `node scripts/probe-deep-links.mjs` reported GREEN (115 ok rows).
- `node scripts/probe-analytics-walk.mjs` reported GREEN (63 ok rows). All 9 Predict `track(...)` call sites now resolve under `src/pages/predict/`, with unchanged keys.
- The five existing Predict suites are untouched (`git diff` empty).

**Review patches (2026-10-09).**
- New test: the detailed view → URL re-selection case.
- New test: `predict-effect-order.test.ts`. It fails if `useSeriesArrival.ts`, `usePrediction.ts` or `useSeriesCatalog.ts` contain `useEffect`/`useLayoutEffect`, and pins the controller's four-effect order.
- The controller's return and `SeriesCard`'s catalog prop are narrowed.
- The `?custom=` positive control is added, and its 20 ms sleep is replaced with an await on the held promise.
- The race test now names its React-batching dependency and has the Profiler drift assertion.
- The StrictMode clause is dropped from the controller docstring; neither the app nor the tests use StrictMode.
- Stale `PredictPage.tsx` pointers are re-pointed in `src/lib/custom-matchup.ts`, `src/lib/__tests__/nba-utils.test.ts` and `src/lib/nba-utils.ts`.
- `deferred-work.md`: the 4.4 V2 summary is re-pointed, and the race entry states that no queued Epic 6 story owns the fix.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-10-09). Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V). The diff ran from `d77ff4a` to the working tree.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| V1 | The reset's "leave the detailed view" step now arrives via the `onSelectionReset` callback, and no test opens the detailed view and then changes the selection by URL. A dropped callback would blank the page under the `<h1>` with the gate green | medium | Pre-verified by V: every detailed-view test leaves through "New Prediction", which calls its own `setShowDetails(false)` | patch |
| B6 | The effect-order guarantee (the reset before arrival) depends on a docstring. A future `useEffect` inside a child hook would run before the controller's effects; 6.1/6.2 edit arrival next | medium | True: `usePredictController.ts` calls the child hooks before declaring its effects. Cheap enforcement: a test that fails if the child hooks contain `useEffect`/`useLayoutEffect` | patch |
| B7/B8 | The controller returns `prediction`/`arrival` whole (exposing `retire`, `clearResult`, `arrive`, …), and `SeriesCard` receives the whole catalog, including `fetchAllGames` | low | True. Narrowing the returned API to state plus the intended handlers is a direct tightening that adds no surface | patch |
| B9 | The `?custom=` supersession pin has no positive control and waits on a fixed 20 ms sleep | low | True. Add a sibling case where the held response does select the series, and wait on a condition | patch |
| B10 | The preload-race pin depends on React batching; a drift would read as "defect fixed" | low | True. A comment naming the dependency (and, if cheap, an assertion that the click preceded the reset) | patch |
| B11 | The controller docstring cites StrictMode remounts, but the app and tests never use StrictMode | low | True (`src/main.tsx`). Direct correction | patch |
| B1/E1 | Stale pointers to `PredictPage.tsx` in `src/lib/custom-matchup.ts:10` and `src/lib/__tests__/nba-utils.test.ts:59, :174` | low | True; direct corrections, as already done for `nba-utils.ts` | patch |
| B12 | Two deferred-work entries are incomplete: 4.4 V2 still leads with `PredictPage.tsx:142`; the preload-race entry names no owning story | low | True. Re-point the summary, and state that no queued story owns the fix (it stays open) | patch |
| B3 | Tasks ticked with empty Implementation Notes | low | True. Notes to be filled with the run evidence (gate, build + cards + prerender, probe, line counts, the side-by-side parity harness) | patch |
| B4 | The analytics walk is in the matrix but not in the ACs, and "live after release" is unreachable in-story | low | Partially true. `probe-analytics-walk.mjs` can run against a local `vite preview` (it answers PostHog locally), which gives in-story evidence; run it | patch (verification) |
| E2 | `src/pages/HomePage.tsx:82` points at `PredictPage.tsx`'s `asSeries` (now in `predict/types.ts`) | low | True, but the frozen intent says never touch `HomePage`. Ride with Story 6.4's Home build | defer |
| B1 (part) | `docs/CURRENT_DATA_MODEL.md:190` cites `PredictPage.tsx`'s `SERIES_SELECT` | low | Pre-existing; stale before this diff | defer |
| B5 | No committed programmatic DOM-parity check | low | The implementer ran a 24-state baseline-vs-HEAD DOM/invoke/analytics parity harness (all identical) and deleted it; the five suites are byte-identical. Committing a harness for a one-off refactor adds maintenance for no recurring use | reject (evidence recorded in Implementation Notes) |
| B2 | Spec `in-review` vs sprint-status `in-progress` | false | In flight: step 5 syncs | reject |
| B13 | The Code Map's line numbers point at the baseline file | low | Fix edits this spec; reject per the rules | reject |

## Design Notes

**Why a controller hook.** Today the reset effect bumps `seriesLoadSeq` *and* `predictSeq` in the same commit as the selection change. That is what stops a late preload or prediction response from painting over a newer choice. Splitting the selection state, arrival and prediction into independent hooks with their own effects would make that ordering depend on hook call order. Keeping the selection state and the reset in one place, with the sequence refs handed to it, preserves the guarantee by construction.

## Verification

**Commands:**
- `npm run gate` -- expected: exit 0, Predict suites unchanged.
- `npm run build && npm run og:cards && npm run prerender`, then `vite preview` and `node scripts/probe-deep-links.mjs <base>` -- expected: GREEN.
