---
title: 'Story 4.1 — Series deep-links + 404 SPA fallback'
type: 'feature'
created: '2026-10-07'
status: 'done'
baseline_commit: 'b67686ec7e88ed32a9531d48558fd534ef9ef335'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** GitHub Pages answers a cold GET on any non-root path (`/predictgame7/predict`, `/historical`, …) with its own 404 page, so every deep link and every future share link dead-ends. There is no `/series/<id>` route, and Predict cannot preload a method. An absent series is only a toast, and a malformed id shows a retry panel that can never succeed.

**Approach:** Implement `epics.md` Story 4.1:
- The build emits `dist/404.html` as a byte copy of `index.html` (AD-6), so GitHub Pages serves the SPA for every path.
- A new `/series/:id` route resolves the id:
  - `?method=<slug>` → client-redirect (`replace`) to `/predict?series=<id>&method=<slug>` (EXPERIENCE.md · Historic share-link arrival);
  - no `method` → `/predict?series=<id>`, an interim landing until Story 4.3 builds the series page;
  - unknown or malformed id → the EXPERIENCE.md 404 treatment, rendered in place.
- Predict applies a valid `?method=` once its series preload resolves.
- An unknown `?series=` on Predict gets the same not-found treatment in place of the toast.

## Boundaries & Constraints

**Always:**
- The 404 copy is verbatim from EXPERIENCE.md: `<h1>` "This series doesn't exist.", then "It may have been removed, or the link is wrong.", then a link to Historical.
  - The document title updates through `PageMeta`, and focus moves to the headline.
  - Layout: icon tile → title → one line → one onward action (UX-DR-4). AA, ≥44×44px targets, token floor.
- On Predict, the not-found state renders inside the series region, so the page's own `<h1>` stays. Its heading is `<h2>`, and focus is not stolen.
- An id that is not UUID-shaped is "not found" without any query.
- A query *error* keeps today's retry panel. Only "no row" or a malformed id becomes not-found.
- `?method=` is checked against the keys of `METHOD_LABELS` (`src/lib/method-display.ts`). An unknown slug is ignored (the series still preloads), never an error.
- The method is set in the same success branch as `setSelectedSeries` in `loadSeriesById`. Setting it in the `?series=` effect would bump `seriesLoadSeq` through the reset effect and drop the in-flight preload.
- No new analytics events or names. Preloads emit nothing, as today (D-continuity with Story 4.0).
- `scripts/verify-build-base.mjs` also fails the build unless `dist/404.html` exists and equals `dist/index.html` byte for byte.

**Never:**
- Build the series preview/result pages, the prerender step, `/series/<id>/result`, Share, or `utm` handling (Stories 4.3–4.5).
- Change the catch-all `*` → `/` redirect.
- Read `series.status` (AD-4).
- Revive `src/pages/NotFound.tsx`, which is a template leftover with missing images.
- Deploy without the owner's request.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Share arrival | `/series/<known>?method=elo` | URL becomes `/predict?series=<id>&method=elo` (history replace). Series and Elo are selected, and nothing runs until Generate | N/A |
| Bare series link | `/series/<known>` | `/predict?series=<id>`, series preloaded, no method | N/A |
| Bad method | `/series/<known>?method=foo` or `/predict?series=<id>&method=foo` | Series preloaded, method unset | ignored silently |
| Unknown id | `/series/<valid-uuid-absent>` | 404 treatment at `/series/<id>`: `<h1>`, title, focus, Historical link | N/A |
| Malformed id | `/series/abc` | Same 404, with no Supabase request | N/A |
| Lookup fails | `/series/<id>` query errors | Retry panel; Retry re-runs the lookup | retryable |
| Predict unknown series | `/predict?series=<absent or malformed>` | In-region not-found (`<h2>`, Historical link). The toast is gone, and the picker still works | N/A |
| Cold GET | any route on the deployed site | GitHub Pages serves `404.html`, and the app renders the route under `/predictgame7/` | N/A |

**Owner decisions (2026-10-07):**
- **D1 — no auto-run on arrival (option A).** A share or deep-link arrival selects the series and method only, and the recipient taps Generate. `predict-game-7` and `prediction_generated` fire only on that tap. Story 4.4 may revisit auto-run alongside Share (FR-31's "re-renders … outputs").
- **D2 — release to close (option A).** When 4.1 passes review, the owner cuts release 0.2.8, which also ships Story 4.0's port, and the probe runs against the live site. The run is recorded with its date. The story reaches `done` only after that live run.

</frozen-after-approval>

## Code Map

- `vite.config.ts` / `package.json` `build` -- emit `dist/404.html`, either from a tiny `closeBundle` plugin or a copy step before `verify-build-base.mjs`.
- `scripts/verify-build-base.mjs` -- add the 404.html existence and equality check (it already runs inside `npm run build`).
- `src/routes.tsx` / `src/App.tsx` -- add `/series/:id`. `routes` drives nothing in the nav (verified: `Layouts` does not read it), so add an entry or a direct `<Route>`.
- New `src/pages/SeriesRoute.tsx` -- the id check, then a `supabase.from('series').select('id').eq('id', id).maybeSingle()` lookup, then redirect / 404 / retry panel. Reuse the existing retry-panel component that Predict uses.
- New `src/components/common/SeriesNotFound.tsx` -- the shared 404 block, with a heading-level prop (`h1` for the route, `h2` in Predict).
- `src/pages/PredictPage.tsx`:
  - `:117-124`, the `?series=` effect: read `method` there, but apply it only in `loadSeriesById`'s success branch at `:168-190`.
  - `:184-188`: the absent-row toast ("Series not found", with the comment "the 404 treatment belongs to Story 4.1") becomes a not-found state.
  - Add the UUID-shape check before querying.
  - The `onRetry` at `:1147-1156` stays for query errors.
- `src/lib/method-display.ts:7` `METHOD_LABELS: Record<MethodSlug, string>` -- the slug guard (an own-key check narrows to `MethodSlug`). `predict-request.test.ts:42` already pins its keys equal to the function's `ACCEPTED_METHOD_SLUGS`, so there is no second slug list.
- Tests (jsdom, mocks as in `predict-flow-regression.test.tsx`; never assert a computed accessible name):
  - new `src/pages/__tests__/series-route.test.tsx` for the route rows of the matrix;
  - extend the Predict tests for the method preload, the bad method, and the in-region not-found;
  - assert the absent-row case no longer toasts.

## Tasks & Acceptance

**Execution:**
- [x] build + `verify-build-base.mjs` -- emit and verify `404.html`.
- [x] `SeriesNotFound.tsx`, `SeriesRoute.tsx`, routes -- the route and the 404 treatment.
- [x] `PredictPage.tsx` -- method preload, UUID guard, in-region not-found.
- [x] tests -- every matrix row except Cold GET.
- [x] new `scripts/probe-deep-links.mjs` -- headless (`openBrowserSession`, PostHog answered locally) against a base URL arg:
  - cold-GET `/predict`, `/historical`, `/insights`, `/maths`, a known `/series/<id>?method=elo`, and an unknown id;
  - assert the rendered route, the preloaded series and method, and the 404 headline;
  - exit non-zero on failure.

  Add it to the `node --check` smoke in `tests/pipeline/venue-backfill.test.ts`, and run it against `npm run preview`.

**Acceptance Criteria:**
- Given `npm run gate`, then green, and a build without an identical `404.html` fails.
- Given the probe against `npm run preview`, then exit 0 with every row printed.
- Given new or changed UI, then keyboard reachable, focus lands on the 404 `<h1>`, and AA contrast holds (CDP `--probe-evidence` style check for focus and computed style).

## Implementation Notes

- 404.html is emitted by a `closeBundle` plugin in `vite.config.ts` (`spaFallback404`); `verify-build-base.mjs` fails on a missing or non-identical copy (both failure modes exercised by hand: exit 1 each).
- UUID-shape guard lives in `src/lib/series-id.ts`, shared by `SeriesRoute` and `PredictPage`; the slug guard is `isMethodSlug` in `src/lib/method-display.ts` (own-key check, so `toString` is not a method).
- Predict's in-region not-found renders in the Series card under the trigger (`<h2>`, no `PageMeta`, no focus); it clears when a series is picked or `?series=` goes away. The `?series=` retry carries the method too.
- `/series/<id>` drops an unknown `?method=` before redirecting, and passes no other query params through (so a future `utm_source` on this URL is not forwarded — Story 4.4's call).
- Existing Predict tests used non-UUID ids (`s-1`, `s-1979`, `s-anomaly`); they now use `SERIES_ID` from `helpers.tsx` (the mocks ignore the id).
- Probe vs `vite preview` on :4317 (2026-10-07): exit 0, every row `ok`. Preview answers deep paths 200 from its own SPA fallback, so locally the `404.html` byte-equality row is what proves the file; the live run is where the HTTP-404-with-shell path is exercised. Live run: pending deploy (D2).

- **Review pass 1 patches (2026-10-07).** Nine fixes, rows `patch` in the triage log:
  - probe: `\s*` escaping, and a 1.5 s settle before the D1 count;
  - Predict's in-region notice is now `role="status"`, shows even beside a stale selection, and retires on a series change only;
  - new tests: the real `routes` array, Retry keeping `?method=`, the strengthened malformed-id case, and `series-id.test.ts` for both guards.
  - Three findings deferred to `deferred-work.md`. The 4.4 note there covers `utm_source` on `/series/<id>`.
  - Orchestrator re-check: `npm run gate` exit 0 (27 files / 602 tests); probe GREEN on `vite preview :4327`.
- **Built in a worktree** (`../pg7-story-4-1`, branch `story-4-1` from `b67686e`) while a parallel session reviewed Story 4.0 in the main checkout. The branch merges to `master` once that session is done.
- **Live probe, D2 satisfied (2026-10-07T00:40:30Z, owner-run).** `node scripts/probe-deep-links.mjs https://ujsolon.github.io/predictgame7/` ran against the deployed `bac0e3f` build, bundle `index-DVoJqY8d.js` (`gh-pages` `d6e321a`, 2026-10-07 08:39 +0800). Result: **GREEN**, every row `ok`.
  - `404.html` served and byte-identical to the shell (468 bytes).
  - Cold GETs on `/predict`, `/historical`, `/insights`, `/maths` and both `/series/<id>` URLs return the SPA shell with **HTTP 404**, as recorded in deferred-work B14, and each renders its route.
  - The share arrival lands on `/predict?series=f16779ed-…&method=elo` with PHI vs BOS and Elo Rating selected, and nothing runs (D1).
  - Unknown and malformed ids get the 404 headline, title and focus; the line is 7.00:1 and the Historical link is 44px tall with a focus ring.
  - The release record (0.2.8 bump + CHANGELOG) was written after the deploy, which the owner ran from `bac0e3f`.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-10-07). Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V).

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B2 | `READ_PRELOAD`'s `/^\s*(…)/` sits inside a template literal, so Chrome receives `/^s*(…)/` | low | Verified: `probe-deep-links.mjs:124` opens a template literal, and `:130` writes a single backslash (`norm` writes `\s+`). It passes today only because the text has no leading whitespace | patch |
| E7/B3 | The probe's D1 "nothing ran" row counts predict requests the instant the preload paints | low | True. A request fired a tick later would be missed. Fix: a short settle wait before counting | patch |
| B4 | The in-region Predict not-found appears asynchronously with no live region, so AT is never told (WCAG 4.1.3) | medium | Verified: `SeriesNotFound` carries no `role`/`aria-live`, while the sibling `ErrorRetryPanel` uses `role="status"`. AA is required on new UI | patch |
| E1/E10 | On in-app navigation to an unknown `?series=` while a series is selected, the `!selectedSeries` guard hides the notice, and the removed toast used to report it | low | True at `PredictPage.tsx` (notice gated on `!selectedSeries`). Direct fix: drop the guard | patch |
| V-other/B5 | Choosing a method, or typing in the custom grid, dismisses the not-found notice | low | True: `setSeriesNotFound(false)` sits in the reset effect keyed on `[selectedSeries, selectedMethod, customInput]`. Retire it on a series change only | patch |
| V1 | No gate test renders the real `routes` array, so deleting or mistyping the `/series/:id` entry passes every gate step | medium | Pre-verified by V. `series-route.test.tsx` hand-builds its own `<Route>` | patch |
| V2 | A failed preload's Retry keeps `?method=`, untested | low | Pre-verified by V. No test retries a failed `?series=&method=` preload | patch |
| B9 | The malformed-id Predict test's `waitFor(toHaveBeenCalledTimes(1))` would pass a by-id query fired a tick later | low | True. Direct fix: assert again after settle, with no `.eq('id', …)` call | patch |
| B11 | `isSeriesId` / `isMethodSlug` have no direct unit tests (case, whitespace, nil UUID, `null`, `''`, `Elo`) | low | True. They are exercised only through page tests. Cheap, and adds no surface | patch |
| V3 | The `else` branch that retires the notice on a move to plain `/predict` is untested | low | Pre-verified by V, which filed it as defer. Cosmetic and recoverable through the picker | defer |
| B10 | `error-envelope.ts:68` validates `method_used` with `in METHOD_LABELS`, which accepts inherited keys such as `toString`; the new `isMethodSlug` does not | low | Verified at `error-envelope.ts:68`. Pre-existing and outside this change's call sites | defer |
| B14 | Through the GitHub Pages fallback, every cold GET on a valid route (`/predict`, `/historical`, a known `/series/<id>`) answers HTTP 404 with the shell, which affects crawlers and some unfurlers | medium | Real, and inherent to AD-6 (EXPERIENCE.md records the fallback 404). It is not worse than today, where these paths are GitHub's own 404. Story 4.3's prerender gives series pages real 200s, and `share-og` serves its own meta for unfurls | defer |
| B1 | The live-deploy AC is not recorded | false | By design: frozen decision D2 makes the live probe run after release 0.2.8. The sprint row sits on the story branch (`in-progress`), excluded from the reviewed diff | reject |
| B6 | `?method=` without `?series=` is ignored | false | No AD-6 URL shape produces it. The spec scopes `?method=` to a series preload | reject |
| B7 | `SeriesRoute`'s loading and error states have no `<h1>` or document title | low | The loading state is transient. The error state shows the retry panel with its heading and is rare. Adding titles per state is more than a direct correction | reject |
| B12 | The probe's contrast math is untested and assumes a white background against a `.dark` theme | low | The app is light-mode only (EXPERIENCE.md). This is dev tooling under the AGENTS.md `.mjs` rule | reject |
| B13 | The probe lacks live rows for Predict not-found, an unknown slug on `/series`, and title revert | low | Covered in jsdom. None of these is an accessible-name claim that needs CDP | reject |
| B15/E5 | `closeBundle` copies unconditionally and can bury a failed build's error; it also uses `fs`, not `node:fs` | low | A failed bundle already fails the build, and `verify-build-base.mjs` checks the copy. The import style is cosmetic | reject |
| E2 | Going from `?series=A&method=elo` to `?series=B` keeps Elo selected | false | Consistent with the app: a manual series change also keeps the selected method, and the reset effect never clears `selectedMethod` | reject |
| E3/E4 | Changing `/series/:id` in place shows stale state for one frame, and focus does not re-run | low | No in-app link targets `/series/*` today; arrivals are cold loads. Unlikely, and keying adds complexity for no reachable case | reject |
| E6 | The probe's `.env` reader ignores quotes and the cwd | low | Dev-only, with a `--series` override. The repo `.env` is unquoted | reject |
| E8 | The probe's 404.html fetch rejection is unhandled | low | Dev-only. An unhandled rejection still exits non-zero | reject |
| E9 | The probe's contrast parse assumes `rgb()` | low | Chrome serialises computed colours as `rgb()`/`rgba()` here, as the probe output shows | reject |

## Verification

**Commands:**
- `npm run gate` -- expected: exit 0.
- `npm run preview`, then `node scripts/probe-deep-links.mjs http://localhost:4173/predictgame7/` -- expected: exit 0.
- After a deploy only: `node scripts/probe-deep-links.mjs https://ujsolon.github.io/predictgame7/` -- expected: exit 0, recorded with date in Implementation Notes.
