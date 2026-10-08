---
title: 'Story 4.4 — Share button + attribution'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_commit: '909b8c26a3d94a5493d6da85ed8b2363b7ac2df8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A completed prediction cannot be shared. There is no Share action, no `?custom=` link format, and the `/series/<id>?method=` redirect drops every parameter except `method`, so a share arrival cannot be attributed (SM-3). The request path the button sits on is also still built from `any` and blind casts (deferred-work D3).

**Approach:** Implement `epics.md` Story 4.4:
- one Share action (`navigator.share`, else the clipboard) on the Predict detailed result and in the series-page header;
- share URLs per AD-6, each carrying `utm_source=share`, and a `SharePayload` codec for custom matchups;
- the redirect keeps every non-`series`/`method` parameter;
- the D3 rebuild of `PredictPage`'s request path, which the owner bundled into this story on 2026-09-29.

## Boundaries & Constraints

**Always:**
- **Share URLs** are absolute, built from `window.location.origin` and `import.meta.env.BASE_URL`. They use the trailing-slash directory form, so they never depend on GitHub Pages' 301 keeping the query.
  - Predict with a series: `…/series/<id>/?method=<slug>&utm_source=share`. It unfurls with that series' card.
  - Predict with a custom matchup: `…/predict/?custom=<payload>&utm_source=share`. It unfurls with the fallback card (accepted, AD-6).
  - Series page header: the page's own canonical URL (`…/series/<id>/` or `…/series/<id>/result/`) plus `?utm_source=share`.
- **`SharePayload`.**
  - The schema is a type in `supabase/functions/_shared/contract.ts` (AD-2): version, both team names, the 12 scores and the method.
  - One module, `src/lib/share-payload.ts`, holds both the encoder and the decoder: JSON, then UTF-8, then URL-safe base64 with no padding.
  - Decoding validates through the same rules as the custom form, plus `isMethodSlug`. Anything malformed is `null` and never throws.
- **`?custom=` arrival** prefills the custom matchup (both names, 12 scores, method) and runs nothing until Generate (owner decision D1, as `?series=`). A malformed payload shows a not-found-style notice inside the series card (the Story 4.1 pattern) and sends no request.
- **The redirect** (`SeriesRoute`, `?method=`) carries every query parameter other than `series` and `method` through to `/predict`, in order. `utm_source` is the one that matters.
- **Share behaviour** (EXPERIENCE.md):
  - one tap and no menu;
  - `navigator.share({ url, title })` where it exists, with no toast; a user cancel (`AbortError`) does nothing;
  - otherwise `navigator.clipboard.writeText`, then the sonner toast "Link copied." for 2s with no action;
  - if that fails, "Couldn't copy — long-press the address bar to share.";
  - no platform buttons and no confirmation dialog.
- **Button.**
  - It is icon-only (ghost) in the series hero header, with the accessible name "Share this series".
  - It is a labelled outline button "Share" in the Predict detailed-view header.
  - Hit area at least 44×44 px, visible focus, keyboard-operable, AA contrast.
  - It is SSR-safe: `navigator` and `window` are touched only in the click handler, so the series pages still prerender and hydrate.
- **D3, one change:**
  1. A derived form type (`PredictionForm`: `Partial` scores, names as strings) exported from `src/types/prediction.ts`, plus typed builders `buildSeriesRequest` and `buildCustomRequest` in `src/lib/prediction-request.ts`. These retire `seriesInput: any`, both `as PredictionInput` casts, the 12 `undefined as any` and every untyped `` `game_${n}_score_*` `` key (use a `ScoreKey` template-literal type).
  2. `METHOD_DESCRIPTIONS: Record<MethodSlug, string>` sits beside `METHOD_LABELS`. It replaces the description `switch` (`PredictPage.tsx:1009`, silent default `""`), and the four hard-coded method-label toast strings (`:1046/:1069/:1092/:1115`) use `METHOD_LABELS`.
  3. The dead `PredictionFailure['invalid-input']` arm (`error-envelope.ts:27-29`) is deleted, and the Story 1.3 spec's Spec Change Log is annotated to match.
  4. **One score rule set.** `validateScores` (series path) and `validateCustomMatchup` share one `scoreError` rule set: required (0 counts as missing), whole number, not negative. Each path keeps its surface: series rows are not editable, so their failure stays a toast, now in the shared wording prefixed "Game N:". Custom failures stay inline. The 50–200 range stays a non-blocking hint on both paths.

  Plus `error-envelope.ts:68` uses `isMethodSlug` (deferred 4.1 row B10).
- **Share event (owner decision 2026-10-08, option a).** One new event, `prediction_shared`, is the epic's second deliberate registry addition. It is emitted through the analytics port on every share attempt that reaches the native sheet or the clipboard, with the props `{ surface: 'predict' | 'series', kind: 'series' | 'custom', channel: 'native' | 'clipboard' }`. A cancel or a failed copy emits nothing. The ten existing names are untouched. `events.ts`'s header comment and the epic context record the addition, and Story 4.7's continuity comparison lists it.
- **The wire is unchanged:** the request bodies the existing Story 1.4 regression tests pin stay byte-for-byte the same.

**Never:**
- Auto-run a prediction on arrival.
- Change `predict-game-7` or its validator.
- Add a share-menu or platform button.
- Rename an existing event.
- Change Predict's address bar on its own: the clipboard-blocked toast's address-bar advice is accepted as a non-dead-end (the bare page still lands).
- Add OG meta per custom matchup.
- Read `series.status`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Share series result, desktop | detailed view, series 2016, Elo; no `navigator.share` | clipboard gets `…/series/<id>/?method=elo&utm_source=share`; toast "Link copied." | N/A |
| Share, mobile | `navigator.share` present | sheet opened with that URL; no toast | `AbortError` → nothing |
| Share custom | custom matchup result | clipboard gets `…/predict/?custom=<payload>&utm_source=share` | N/A |
| Clipboard blocked | `writeText` rejects | toast "Couldn't copy — long-press the address bar to share." | no throw |
| Series header share | `/series/<id>/result` | URL `…/series/<id>/result/?utm_source=share` | N/A |
| Share arrival | `/series/<id>/?method=elo&utm_source=share` | redirect to `/predict?series=<id>&method=elo&utm_source=share`; series + Elo selected; nothing runs | N/A |
| Custom arrival | `/predict/?custom=<valid>&utm_source=share` | custom form prefilled, method selected, no request | N/A |
| Malformed custom | `?custom=abc` / bad scores / unknown method | notice in the series card; no request | no throw |
| Non-ASCII name | "Montréal" in a payload | round-trips exactly | N/A |

</frozen-after-approval>

## Code Map

- `src/pages/PredictPage.tsx`:
  - request path `:278-284` (custom build, cast 1), `:292-321` `validateScores(input:any)`, `:328-358` `seriesInput:any` with computed keys and cast 2;
  - custom state `:80-95` (12× `undefined as any`), score inputs `:735-785`;
  - method description `switch` `:1008-1021`, hard-coded label toasts `:1046/1069/1092/1115`;
  - URL preload effect `:127-143` and `loadSeriesById` `:187-239` (the not-found notice pattern for `?custom=`), retry re-read `:1202-1207`;
  - detailed view `:1326-1464`, header `:1348-1360` (the Share site), title "Prediction Result";
  - reset effect `:100-119` clears the result on any input change.
- `src/lib/custom-matchup.ts`: `scoreError` `:31-40` (the shared rule set), `validateCustomMatchup` `:43-56`, `collectRangeHints` `:62-73`.
- `src/lib/error-envelope.ts`: `:27-29` dead arm; `:68` `in METHOD_LABELS` → `isMethodSlug`.
- `src/lib/method-display.ts`: add `METHOD_DESCRIPTIONS`.
- `supabase/functions/_shared/contract.ts`: `PredictionInput` `:20-42`; add the `SharePayload` type (type only; Deno must still `deno check` it, with no imports added).
- `src/pages/SeriesRoute.tsx`: the `?method=` redirect builds a fresh `URLSearchParams({ series: id })`. Carry the remaining parameters through.
- `src/pages/series/SeriesHero.tsx`: add an optional header action slot. `SeriesPreview` and `SeriesFullRecord` pass the Share button. It must still prerender (Story 4.8's tests and hydration test must stay green).
- New:
  - `src/lib/share.ts` (`shareLink` → `'native'|'copied'|'cancelled'|'failed'`, plus the URL builders);
  - `src/lib/share-payload.ts`;
  - `src/lib/prediction-request.ts`;
  - `src/components/common/ShareButton.tsx`.
- Tests to extend:
  - `src/pages/__tests__/predict-flow-regression.test.tsx`: the wire bodies must stay identical;
  - `predict-error-states.test.tsx`;
  - `series-route.test.tsx`: the redirect;
  - `src/lib/__tests__/custom-matchup.test.ts`, `error-envelope.test.ts`, `src/types/__tests__/predict-request.test.ts`: label/slug parity, and extend it to descriptions.
- Probe: `scripts/probe-deep-links.mjs`, via `openBrowserSession` (PostHog traffic answered locally and decodable).

## Tasks & Acceptance

**Execution:**
- [x] `src/types/prediction.ts`, `src/lib/prediction-request.ts`, `PredictPage.tsx` request path -- D3 items 1 and 4 -- typed form and builders, one score rule set, wire unchanged.
- [x] `method-display.ts`, `error-envelope.ts`, the Story 1.3 spec change log -- D3 items 2 and 3, plus `:68`.
- [x] `contract.ts` (`SharePayload`), `src/lib/share-payload.ts`, `src/lib/share.ts`, `ShareButton.tsx` -- codec, URLs, share mechanics.
- [x] `PredictPage.tsx` (Share in the detailed header; `?custom=` arrival), `SeriesHero`/`SeriesPreview`/`SeriesFullRecord` (header Share), `SeriesRoute.tsx` (parameter carry-through) -- the surfaces.
- [x] `src/lib/analytics/events.ts` (`PREDICTION_SHARED`, header comment), `epic-4-context.md` (the second addition), and the `ShareButton` emit -- the share event.
- [x] Tests:
  - every matrix row;
  - a codec round-trip (including non-ASCII and every malformed form);
  - builder output deep-equal to today's bodies;
  - descriptions keyed for every contract slug;
  - `prediction_shared` fires once with the right props on native and clipboard success, and never on cancel or a failed copy;
  - the share button SSR-renders and the 4.8 hydration test stays green;
  - no computed accessible-name assertions (AGENTS.md).
- [x] Probe rows (headless, `vite preview` after `npm run build && npm run og:cards && npm run prerender`):
  - Share from a completed series prediction and from a custom one (stub `navigator.clipboard.writeText` to capture the URL);
  - open each URL in a **fresh browser context**: the same series or matchup and method are selected and no `predict-game-7` request is sent;
  - the landing `$pageview` captured locally has `utm_source=share` in its URL;
  - the share button is focusable, with a ≥44×44 bounding box.

**Acceptance Criteria:**
- Given `npm run gate`, then green. Given the probe, then GREEN.
- Given a completed prediction, when its share link is opened in a fresh profile, then the same series (or custom matchup) and method are selected with zero re-entry, and nothing runs until Generate.

## Implementation Notes

- 2026-10-08 (implementation): built as specced; frozen block untouched.
  - **D3.** `PredictionForm`, `ScoreKey`, `ScoreFields` and `GameNumber` live in `src/types/prediction.ts`. `buildSeriesRequest` and `buildCustomRequest` (`src/lib/prediction-request.ts`) build both bodies in a fixed key order (series: `series_id, team_a, team_b, method, scores…, home_team`; custom: `team_a, team_b, scores…, home_team, method`), so the JSON wire no longer depends on the order a fan fills the grid. `prediction-request.test.ts` pins both bodies with `JSON.stringify` equality against the pre-4.4 shapes, and the Story 1.4 page pins pass unchanged. The one remaining narrowing is `completeScores` in `custom-matchup.ts`, a cast after a loop that checks every key.
  - **One rule set.** `scoreError` is exported. `validateScores` is the series path's check, returning "Game N: <rule wording>". `collectRangeHints` now serves both paths. The three series toasts the Story 1.4 suite pinned changed wording on purpose ("Game 2: Score is required", "Game 1: Must be a whole number", "Game 4: Can't be negative"), and that suite was updated to match. Behaviour change worth knowing: the series path used to toast range warnings for earlier games *before* an error on a later game. It now toasts the first error only, and hints only on a request that proceeds, the same as the custom path.
  - **Share.** `navigator.share` failing with anything other than `AbortError` falls back to the clipboard rather than doing nothing, so a share never dead-ends. The copy toast is `toast.success('Link copied.', { duration: 2000 })`, and the failure toast is `toast.error`. `SeriesHero` gained an `action` slot in the eyebrow row, so the probe's `previousElementSibling` eyebrow read still holds: the icon button carries no text.
  - **Bad `?custom=`.** It reuses `SeriesNotFound` with copy overrides: "This matchup link doesn't work." / "It may be incomplete or mistyped. Pick a series, or build the matchup yourself." The `seriesNotFound` state became `false | 'series' | 'custom'`.
  - **Docs.** Story 4.7's continuity AC in `epics.md` and `epic-4-context.md` now name `prediction_shared` as the second deliberate addition. `deferred-work.md` closes D3, the validation-systems entry, the range-string entry and B10. Still open there: the series path's `'Team A'`/`'Team B'` fallback (kept, because the wire must not change) and the retryability axis for Story 2.0's 400s (not in this spec).
- **Verification.**
  - `npm run gate` exits 0: Biome 180 files, `tsc -b`, 802 tests in 44 files, and a build with the `/predictgame7/` prefix.
  - `npm run build && npm run og:cards && npm run prerender`, then `vite preview` on port 4391 (4317 was held by another process), then `node scripts/probe-deep-links.mjs http://localhost:4391/predictgame7/` → **GREEN**, 109 rows, all rows from Stories 4.1, 4.3 and 4.8 included. The new row 12 drove both shares with real CDP clicks and two live `predict-game-7` requests, then opened each URL in a fresh Chrome profile. Both URLs reproduced the same selection with zero requests, and the landing `$pageview` (decoded locally) carried `utm_source=share`.
  - The probe also checks the hero's icon-only button: 44×44, focusable, `aria-label` "Share this series".
  - `deno check` over `contract.ts` runs only in CI. `SharePayload` adds types only and no imports.
- 2026-10-08 (review fixes, four items):
  - **Share title is now asserted.** `series-pages.test.tsx` stubs `navigator.share` and pins the exact title on two pages. The flagship preview gets its winner-free page title, and that title does not match `/win|over|4–3/`. The flagship result page gets its outcome title. `predict-share.test.tsx` pins "Boston Celtics vs Miami Heat — Game 7 on PredictGame7" for a series and "Montréal vs Miami Heat — Game 7 on PredictGame7" for a custom matchup, the second through a new native-sheet case. That file's load budget was raised to 20 s per wait and 60 s per test. Separately, the intermittent first-test failure ("Predicted Winner" never appeared, even with 20 s) turned out to be a test race, not load: a click in the gap between a preload's commit and its effects had its result dropped by the reset effect's supersede. The arrival tests now flush effects (`act(async () => {})`) before Generate. Afterwards it went 11 isolated runs green, against roughly one failure in four runs before. A fan cannot click inside that gap, but it is a real page-level window and is noted here for review.
  - **In-flight guard.** `ShareButton` holds a `useRef` busy flag that is set for the whole share and cleared in `finally`, so a tap while `share()` or `writeText` is pending is ignored. A new test in `share-button.test.tsx` makes two rapid clicks with a pending native share: it gets one `share` call, no clipboard fallback and one `prediction_shared`, and the button shares again once the first share settles.
  - **Probe row 12 measures focus and contrast.**
    - Both Share buttons are focused by a real keyboard Shift+Tab then Tab (CDP `Input.dispatchKeyEvent`). The probe then reads the focused element's computed `box-shadow` and outline, and asserts that one of them is not `none`.
    - It computes the WCAG ratio of the computed `color` against the effective background, which is the first ancestor-or-self with an opaque background, or white if there is none.
    - It asserts at least 3:1 for the icon-only header button (1.4.11, non-text) and at least 4.5:1 for the labelled Predict button. It prints the measured values.
  - **Deferred-work pointer.** The still-open `'Team A'`/`'Team B'` fallback entry in `deferred-work.md` gained a dated note pointing to `buildSeriesRequest` in `src/lib/prediction-request.ts`.

- **Orchestrator re-check (2026-10-08).** After the review-pass-1 patches:
  - `npm run gate` exits 0: lint 180 files, `tsc -b`, 44 files / 806 tests, and the build with the prefix and 404 checks.
  - `og:cards` and `prerender` ran (183 series pages, 4 shells, a 188-URL sitemap).
  - `probe-deep-links.mjs` against `vite preview --port 4339` is GREEN, with 115 rows ok, including row 12: both share round-trips in fresh profiles, `utm_source=share` on the landing `$pageview`, a keyboard focus ring on every Share button, and 15.13:1 contrast.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-10-08). Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V). The diff ran from `909b8c2` to the working tree.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| V1/B12 | The share **title** is never asserted. The preview passes `previewTitle` to `navigator.share`, but every series-header test takes the clipboard branch, and the Predict test checks only `typeof title`. A swap to `outcomeTitle` would put the winner in a spoiler-free preview's share sheet with the gate green | medium | Pre-verified by V (`series-pages.test.tsx:400-431` stubs `share` as undefined). B12 is the same gap on Predict (voice guardrail) | patch |
| E1/B3 | No in-flight guard: a second tap while `share()` is pending rejects `InvalidStateError` (not an abort), falls back to the clipboard, and gives a second toast and a second `prediction_shared` | medium | Verified at `ShareButton.tsx` `onClick` and `share.ts` `shareLink`. It inflates the share count the event exists to measure | patch |
| B11 | "Visible focus … AA contrast" on both buttons is not measured. The unit tests check a class name and the probe checks the focus target and the box | medium | True. AGENTS.md evidence discipline names the CDP harness as the substitute. Fix: a probe row that Tabs to each button and reads the computed focus ring and the foreground/background contrast | patch |
| B10 | The still-open Team A/Team B fallback entry in `deferred-work.md` points at the old `PredictPage.tsx` lines, which moved into `buildSeriesRequest` | low | Verified. Direct correction of the pointer | patch |
| V2 | The `?custom=` branch's `seriesLoadSeq` supersession (`PredictPage.tsx:142`) is unpinned for a preload still in flight | low | Pre-verified by V. It needs an in-app navigation within one request's lifetime, and the same mechanism is pinned by the 4.1/1.3 sequence tests | defer |
| B2 | PRD addendum §A.1 (the canonical event list per AGENTS.md) does not mention `prediction_shared` | low | True. The ten names are preserved as AGENTS.md requires; the addition is recorded in `events.ts`, `epic-4-context.md` and `epics.md`. Editing the PRD addendum is a planning-artifact change for the owner | defer |
| E2/B4 | The encoder has no length cap, while the decoder rejects anything over 4096 characters | low | True only for team names of more than about 1,400 characters each; no everyday use reaches it, and the fix adds a guard | reject |
| E3 | A failed copy on Predict advises the address bar, which holds no `?custom=` | false | The spec accepts this explicitly (Never: "Change Predict's address bar…accepted as a non-dead-end") | reject |
| E4 | An undecodable `?custom=` reached in-app shows the notice beside the previous selection and result | low | Same retirement rule as 4.1's not-found `?series=` (`PredictPage.tsx:117-121`: the notice is retired by a new series only). Broken links arrive cold, not in-app | reject |
| E5/B5 | The fallback after a non-abort `share()` error may find user activation consumed, so the copy fails and shows "Couldn't copy" | low | Without the fallback that path shows nothing. The fallback can only add a success, and its failure lands on the spec's own non-dead-end toast. It is recorded in Implementation Notes | reject |
| B1 | Spec `in-review` vs sprint-status `in-progress` | false | In flight: step 5 syncs sprint-status | reject |
| B6 | The broken-link notice says "Pick a series…" while its link goes to Historical | low | Cosmetic; the picker is in the same card, and the link is 4.1's `SeriesNotFound` onward action | reject |
| B7 | A URL with both `?series=` and `?custom=` silently prefers the series | low | No builder emits both; the URL would have to be hand-made | reject |
| B8 | The series-path range-hint ordering change has no page test | low | Series scores come from validated DB rows, so a series-path score failure is a data anomaly no everyday use reaches | reject |
| B9 | `buildCustomRequest` can return `{ ok:false, fields:{} }`, a silent no-op | false | Unreachable: `validateCustomMatchup` passing implies all 12 scores are valid numbers, so `completeScores` is non-null | reject |

## Design Notes

**Trailing-slash share URLs.** Story 4.8 serves `series/<id>/index.html`. GitHub Pages 301s the slash-less form, and whether that 301 keeps the query is still an owed live check. Sharing the directory form removes the dependency, and it is the canonical URL already.

**Why the series path keeps a toast.** Series scores come from the database and are not form fields, so there is nothing inline to mark. "One failure vocabulary" means one rule set and one wording, not one surface (EXPERIENCE.md keeps the series guards as toasts, Story 1.3 Decision 1).

## Verification

**Commands:**
- `npm run gate` -- expected: exit 0.
- `npm run build && npm run og:cards && npm run prerender`, then `vite preview` and `node scripts/probe-deep-links.mjs <base>` -- expected: GREEN.
