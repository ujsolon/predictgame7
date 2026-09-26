---
title: 'Story 1.2 — One prediction contract (AD-2 consolidation)'
type: 'refactor'
created: '2026-09-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '40d1475'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `PredictPage` permits stale method identifiers such as `bayesian`, while `predict-game-7` accepts `bayes`; its result type also omits fields the UI reads. This contract drift leaves the Bayes selection label wrong and makes the blocking TypeScript gate impossible.

**Approach:** Define the four live method slugs, request, contributing-factor, and response types in one Edge Function-shared contract. Re-export those types from the frontend, remove stale duplicate declarations, preserve prediction behavior, resolve every current TypeScript error, and promote the type check into CI.

## Boundaries & Constraints

**Always:** Preserve the four existing methods and their response behavior for historical and custom series; document probabilities as 0–100 percentages; update the Maths copy where it disagrees with the function; use type-only frontend re-exports; keep the CI gate blocking; run build, Biome, Vitest, and `tsc -b` before completion.

**Never:** Change prediction algorithms, database schema, RLS, analytics architecture or event names, pipeline behavior, deployment state, or guarded accounts/betting/live-scoring features. Do not introduce `SharePayload`; it belongs to the later sharing story despite the contract file being its future home.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Historical prediction | Six loaded series scores and each canonical method | Function accepts `logistic_regression`, `bayes`, `elo`, and `exponential_smoothing`; UI displays the matching label and the same winner, percentage probabilities, factors, confidence, and duration shape | Existing function validation/error response remains unchanged |
| Custom prediction | Valid typed team names and six score pairs | Shared input type supports the current custom payload and results render without casts to a stale shape | Existing client validation rejects incomplete scores before invocation |
| Compile gate | Current app plus dependency/UI typing drift | `npx tsc -b` exits 0 and CI fails on future type errors before tests run | Invalid imports, unresolved declarations, and nullable values remain compiler failures |

</frozen-after-approval>

## Code Map

- `supabase/functions/predict-game-7/index.ts` -- owns the actual request handling, four method branches, and JSON response; remove its duplicate interfaces and import shared types only.
- `supabase/functions/_shared/contract.ts` -- new pure type contract for `MethodSlug`, prediction request/response, and contributing factors; safe for Deno and the Vite type graph.
- `src/types/types.ts` -- retain database/domain interfaces but remove stale prediction contract duplicates and their obsolete union.
- `src/types/prediction.ts` -- new type-only frontend re-export path required by AD-2.
- `src/pages/PredictPage.tsx` -- sole frontend consumer of prediction request/result types; replace its local union, correct Bayes label, normalize Supabase relation inference, and eliminate nullable label calls without altering requests or rendering.
- `src/pages/MathsPage.tsx` -- align the Bayes home-court explanation with the function's 62% likelihood and remove an unused icon import.
- `src/pages/HistoricalPage.tsx`, `src/pages/InsightsPage.tsx` -- small TypeScript-only null/unused-import repairs required by the Story 1.2 exit condition.
- `src/hooks/use-mobile.tsx`, `src/components/ui/sidebar.tsx` -- the hook file is empty while Sidebar imports `useIsMobile`; supply the existing expected export without changing Sidebar's public API.
- `src/components/ui/video.tsx`, `src/components/ui/qrcodedataurl.tsx` -- repair video-react and QR-code declaration drift so the build can type-check unchanged components.
- `package.json`, `package-lock.json` -- add the maintained `@types/qrcode` development declaration.
- `.github/workflows/ci.yml` -- add blocking `npx tsc -b` between lint and test, replacing the Story 1.1 deferral comment.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/functions/_shared/contract.ts`, `supabase/functions/predict-game-7/index.ts` -- create and consume the canonical four-slug request/result contract, mirroring the function's present percentage response fields.
- [x] `src/types/prediction.ts`, `src/types/types.ts`, `src/pages/PredictPage.tsx` -- route frontend type usage through a type-only re-export, delete duplicate stale types, and align the Bayes selection/label with `bayes`.
- [x] `src/pages/MathsPage.tsx`, `src/pages/HistoricalPage.tsx`, `src/pages/InsightsPage.tsx` -- correct the documented Bayes home prior and remove or narrow the TypeScript drift surfaced by the baseline check.
- [x] `src/hooks/use-mobile.tsx`, `src/components/ui/video.tsx`, `src/components/ui/qrcodedataurl.tsx`, `package.json`, `package-lock.json` -- resolve the remaining hook, video-react, and QR-code declaration errors without changing their intended UI behavior.
- [x] `.github/workflows/ci.yml` -- run `npx tsc -b` as a blocking step after lint and before tests.

**Acceptance Criteria:**
- Given any of the four method choices, when a historical or custom prediction runs, then the current Edge Function response shape renders as before and the Bayes method label no longer falls back to “Not selected.”
- Given the contract refactor, when the frontend and Edge Function type-check, then only `logistic_regression`, `bayes`, `elo`, and `exponential_smoothing` are available as method slugs, and no obsolete prediction union or response fields remain.
- Given the Maths page, when the Bayesian explanation is read, then its home-court likelihood agrees with the function's 62% value and each of the four methods remains documented.
- Given the repository's current dependencies and UI source, when `npx tsc -b` runs, then it exits 0; CI runs that command between lint and test and blocks on failure.

## Implementation Notes

**Code Map (as built):**

- `supabase/functions/_shared/contract.ts` (new, types only) — `MethodSlug`, `ConfidenceLevel`, `PredictionInput`, `ContributingFactor`, `PredictionResult`. Pure declarations, no platform APIs, so both the Deno function and the Vite type graph import it.
- `supabase/functions/predict-game-7/index.ts` — local `PredictionInput`/`ContributingFactor` deleted; handler annotates `method: MethodSlug`, `confidence_level: ConfidenceLevel`, and the response object as `PredictionResult`, so the file documents the contract it implements. No algorithm, branch, or response-field change. **These annotations are enforced by nothing in this repo** — no CI gate parses `supabase/functions/**` (review row 1; deferred as D1).
- `src/types/prediction.ts` (new) — `export type { … }` re-export from the shared contract; the only frontend door.
- `src/types/types.ts` — stale `PredictionInput` (six-slug union incl. `bayesian`/`ensemble_v1`/`margin_model_v1`), `ContributingFactor`, and `PredictionResult` deleted. Domain rows (`Team`, `Series`, `SeriesGameScore`, `PredictionMethod`, `ModelParameters`, `InsightCache`, `TeamLogo`) untouched.
- `src/lib/method-display.ts` (new, from review patch) — `METHOD_LABELS` and `METHOD_MATHS_ANCHORS`, both keyed `Record<MethodSlug, string>`. The one slug→display mapping in the app, so adding a slug fails `npm run typecheck` at the map instead of falling through to a wrong label.
- `src/pages/PredictPage.tsx` — local `PredictionMethod` union removed; `selectedMethod` is `MethodSlug | null`; `getMethodLabel()` and the result card's label/Maths link now read `METHOD_LABELS` / `METHOD_MATHS_ANCHORS` (the "Not selected" fallback for the Bayes selection is gone, and an out-of-contract `method_used` echoes its own slug and links `/maths` instead of mislabelling itself "Exponential Smoothing"); untyped `supabase-js` rows pass through `asSeries()` / `asSeriesRow()` at the two query boundaries.
- `src/pages/MathsPage.tsx` — Bayesian home-prior copy corrected 75% → 62% to match the function; unused `History` icon import removed.
- `src/pages/HistoricalPage.tsx`, `src/pages/InsightsPage.tsx` — nullable `alt` guards on the team-crest images `HistoricalPage` renders; unused `InsightCache` import removed from `InsightsPage` (which has no `<img>`).
- `src/hooks/use-mobile.tsx` — was a 0-byte file while `sidebar.tsx` imported `useIsMobile`; now the standard 768px `matchMedia` hook (no Sidebar API change).
- `src/components/ui/video.tsx` — `Player` added to the `video-react` import list; `FullscreenToggle` wrapped in a locally typed alias because the vendor typing demands a `actions` prop that `ControlBar` injects itself.
- `src/components/ui/qrcodedataurl.tsx` — unchanged; fixed by adding `@types/qrcode` (`package.json` + lock).
- `.github/workflows/ci.yml`, `package.json`, `README.md` — `npm run typecheck` (`tsc -b`) added as a script, run by `predeploy` and as the blocking CI step between lint and test; the comment states the graph it covers rather than claiming the whole repo.
- `src/types/__tests__/prediction-contract.test.ts` (new, 6 tests) — imports the real `METHOD_LABELS` / `METHOD_MATHS_ANCHORS` and pins the four-slug domain, label-per-slug, anchor parity, the custom request type, and the 0–100 percentage response shape, plus a `@ts-expect-error` on `'bayesian'` labelled as the compile-time guard it is.

**Design Notes:**

- Contract lives on the Edge Function side and the frontend re-exports it, per AD-2 — the function is the authority on the wire shape, so drift is fixed at the source rather than mirrored. Enforcement is asymmetric and now stated as such: the frontend half is inside `npm run typecheck`, the function half is checked by nothing (D1).
- `series_id` is kept on `PredictionInput` because the app sends it; the function still ignores it (documented in the type).
- `asSeries()` / `asSeriesRow()` are the only places an untyped `supabase-js` row is read as `Series`. They are casts, not validation — supabase-js types the to-one embeds as arrays, and `data` cannot be assigned to `Series` directly (TS2322), so the cast has to live somewhere; it lives in one documented pair instead of scattered `as` expressions.
- Labels and Maths anchors moved into `src/lib/method-display.ts` during review rather than staying in `contract.ts`, which is types-only by design (its own header rule), and rather than as a `switch` in `PredictPage`, which has no exhaustiveness check at the point of use. Importing the map from the test means the test now observes the code the page runs.
- `input.method` is still not validated at runtime: a posted `"bayesian"` falls through to logistic regression and echoes in `method_used` (review row 12). The frozen boundaries keep the function's existing validation and error response unchanged, so this story preserves the behavior and D2 carries the guard.
- The `@ts-expect-error` case is a compile-time tripwire, not a runtime test — `vitest run` strips types without checking them. The blocking `npm run typecheck` step is the guard that fires if the deleted slug returns.

**Verified:**

- `npm run typecheck` (`tsc -b`) -- exits 0 (33 baseline errors cleared).
- `npm run lint` -- Biome clean, 89 files.
- `npm test` -- 14 tests green across 3 files, including the 6-test contract suite.
- `npm run build` -- succeeds, `/predictgame7/` asset prefix preserved.
- Gate is falsifiable, not decorative: deleting the `bayes` entry from `METHOD_LABELS` fails `npm run typecheck` with TS2741 (`Property 'bayes' is missing … but required in type 'Record<MethodSlug, string>'`), which the previous `switch` + copied test map did not.
- Browser (local Vite dev against the live `predict-game-7` function, 2026-09-26): selecting Bayes now shows the Method card as "Bayes Method" (was "Not selected"); the 2016 Finals (CLE vs GSW) historical path returns CLE 62% / GSW 38% with Game-by-Game factors, "Confidence: Medium", computation time, and Elo on the same series returns CLE 57.27% / GSW 42.73%; the custom path (BOS vs MIA, six typed score pairs) returns MIA 52.5% / BOS 47.5%. No console errors.
- Label/link equivalence after the review patches is held by the contract tests, not by a second browser pass: they assert `METHOD_LABELS.bayes === 'Bayes Method'`, anchor-key parity, and the exact four anchor values the result card linked to before (`logistic-regression`, `bayesian-inference`, `elo-rating`, `exponential-smoothing`), so the map-driven render produces the same strings for every in-contract slug. A re-run of the live Bayes and Elo paths is still worth doing when the dev server is next up.

## Verification

**Commands:**
- `npm run typecheck` (`tsc -b`) -- expected: exits 0 with no diagnostics.
- `npm run lint` -- expected: Biome reports no errors.
- `npm test` -- expected: the existing Node and jsdom Vitest harness remains green.
- `npm run build` -- expected: production build succeeds and preserves the `/predictgame7/` base path.

## Review Triage Log

Three layers reviewed `_review-diff-1-2.txt` (15 files) on 2026-09-26: `blind-hunter` (BH), `edge-case-hunter` (ECH), `verification-gap` (VGV). Verdicts rendered here after checking each claim at the cited location; severities assigned by the reviewers were disregarded. `carried` marks a row re-logged from an earlier pass (there is none — this is loop 1).

| # | Finding (layer) | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | BH1 / ECH5 / VGV2 — `ci.yml` says "the whole repo type-checks"; `supabase/functions/**` is outside the program | high | Verified: `tsconfig.json` references only `tsconfig.app.json` (`include: ["src"]`) and `tsconfig.node.json` (`vite.config.ts`), so `predict-game-7/index.ts` is parsed by no gate. The comment asserted coverage the change does not have. | patch (comment) + defer D1 |
| 2 | BH1 / ECH6 — Design Notes claim the function's response is "compiler-checked against the contract" | medium | True for frontend consumers of `contract.ts`; false for the producer, which no CI step type-checks. | patch (notes) + defer D1 |
| 3 | BH5 / VGV1 — new test asserts its own hand-copied label map, never the page's mapping | high | Demonstrated before this pass: deleting `case 'bayes'` from `getMethodLabel` left typecheck, lint, tests and build green while AC-1 regressed. | patch |
| 4 | BH4 / ECH2 — slug→label mapping left in four copies; result card defaults an unknown `method_used` to "Exponential Smoothing" and links `#exponential-smoothing` | medium | Verified at `PredictPage.tsx:954-961`: two more copies of the mapping this story exists to collapse, on the same failure mode that shipped the "Not selected" bug. | patch |
| 5 | BH6 — `getMethodLabel()`'s `default: 'Not selected'` is dead on an exhaustive switch with no exhaustiveness check at the point of use | low | Verified; real for the next contract addition, and the fix is the same map as row 4. | patch |
| 6 | VG-O1 — the `@ts-expect-error` case is a no-op under `npm test`; only the typecheck gate sees it | low | Correct: Vitest strips types. Guard is genuine but the title implied runtime enforcement. | patch (test comment) |
| 7 | BH8 — `asSeries()` comment claims normalization the code does not perform; `asSeries([data])` wraps one row to reach it | low | Verified at `PredictPage.tsx:41-44`: the helper is an unchecked cast. The `undefined` half of the claim is unreachable — `[data]` is always length 1 — and `data` cannot be used directly (reverting it reproduces TS2322 on the array-shaped to-one embeds). | patch (comment + explicit row cast) |
| 8 | BH10 / BH11 — no `typecheck` script, so the gate runs only in CI; local `predeploy` and README still describe lint/test/build | medium | Verified: `package.json` had no `typecheck`, `predeploy` was `lint && test && build`, `README.md:83` listed two commands. AGENTS.md's own "before any done claim" gate therefore never type-checked locally. | patch (script, predeploy, README) + AGENTS.md fixed by owner in follow-up |
| 9 | BH12 / ECH4 — trackers left in pre-change state: `deferred-work.md` still lists this diff's fixed items as open, `sprint-status.yaml` still `backlog`, `ci.yml` dropped the pointer without closing | medium | Verified in `deferred-work.md` (entries "6 non-contract type errors", "Not selected" label) and `sprint-status.yaml`. | patch (deferred-work now; sprint-status in step 5) |
| 10 | BH13 — spec file not staged with the code | low | Verified: `git diff --cached` held the 14 code files, the spec sat only in the working tree. | patch (commit in step 5) |
| 11 | BH14a — `ContributingFactor.impact` unit-less while `win_probability_*` are percentages; two scales in one response | low | Verified: `index.ts:267` sets `impact: 0.12, // 0.62 - 0.50`, a 0-1 fraction, beside 0-100 fields. | patch (contract comments) |
| 12 | BH2 / ECH1 — no runtime guard on `input.method`: a posted `"bayesian"` silently runs logistic regression and echoes back in `method_used` | medium | Verified at `index.ts:297,306` — `req.json()` is unvalidated, and the `if/else` chain's final `else` is logistic regression. Real, and reachable only from a non-browser client; the app's own callers are compile-gated. | defer D2 |
| 13 | BH3 — frontend response boundary is an unchecked cast with no `{ error }` variant, so a non-conforming 2xx body renders `undefined%` | low | True as described, but the function's non-2xx path already throws through `invoke`'s `error.context.text()`, and a 2xx body that is not a `PredictionResult` cannot be produced by any code path in this repo. | rejected |
| 14 | BH7 — request path still built with `seriesInput: any`, `as PredictionInput` casts and twelve `undefined as any` form-state fields | medium | Verified in the diff: `git diff HEAD` shows no hunk at `PredictPage.tsx:61-77,179-229` — the scaffolding predates this story and this story's Task list says to leave requests unaltered. | defer D3 |
| 15 | BH9 — `contract.ts` and the Edge Function are outside Biome's `files.includes`; frontend reaches the contract through a relative hop with no alias | medium | Verified: `biome.json` includes `src/**` + `tailwind.config.js` only, and `npx biome lint supabase/functions` reports "No files were processed". Pre-existing config this story inherits. | defer D1 |
| 16 | BH15 — `tsconfig.check.json` is dead config that excludes exactly the surfaces this story fixed (`*.test.ts`, `src/components/ui`) | medium | Verified: not in `tsconfig.json` references, not in any script or CI step; `spec-1-1-toolchain-foundation.md:93` still cites it. Deleting a file needs the owner's confirmation. | settled — file deleted by owner in follow-up |
| 17 | BH16 / 14b — the corrected 62% now lives in four unlinked places with no single source | medium | Verified: `index.ts:206`, `index.ts:209` (38% counterpart), `index.ts:266` factor copy, `MathsPage.tsx:21`. The divergence already bit once (75% copy). A shared runtime constant is blocked by the spec's types-only contract rule. | defer D6 |
| 18 | ECH3 — `use-mobile.tsx` assumes `window.matchMedia` exists | low | True, and unreachable: this is a browser-only Vite SPA and the hook mounts in an effect; a guard branch would protect nothing the app can reach. | rejected |
| 19 | VGV3 — newly implemented `useIsMobile` has no test at its `sidebar.tsx` consumer | medium | Verified: only three test files exist, none render `Sidebar`. Component regression tests are explicitly scheduled for Story 1.4 in `render-smoke.test.tsx:11-12`. | defer D7 |
| 20 | BH14c — `MathsPage.tsx:21` calls 0.62 a "prior" where the code applies it as a likelihood | low | The frontend copy matches the function's own user-visible string at `index.ts:266` ("a 62% prior probability"); no doc/code divergence. The statistics wording is a copy question, logged under D6. | rejected |
| 21 | BH14d — `InsightsPage.tsx` deletes the `InsightCache` import instead of applying it | low | Verified the page still casts `insightData as InsightData[]`; typing that query is a separate change to an untyped page, not a correction of anything this diff broke. | rejected |
| 22 | BH14e — `HistoricalPage.tsx:263,266` `?? ''` alt turns a real crest into an unlabeled image | false | The `<img>` renders only inside `{resolveTeamLogoUrl(...) && (…)}` — no crest means no image, so the empty-alt branch cannot ship an unlabeled image. The `:198`/`:210` sites are untouched by this diff. | rejected |
| 23 | BH14f — spec Code Map attributes team-crest `alt` guards to `InsightsPage`, which has no `<img>` | low | True of the wording; the remedy is this build's own spec text, corrected in Implementation Notes below. | rejected (spec edit) |
| 24 | BH14g — `Series.status` keeps a value domain `docs/CURRENT_DATA_MODEL.md` does not define | low | True and already an AGENTS.md guardrail; this story neither reads nor writes status semantics beyond the pre-existing `=== 'active'` line. | rejected |

**Grouping and routing.** Rows 1-11 grouped by shared cause and applied as patches: **gate truthfulness** (1, 2), **one display mapping, actually tested** (3, 4, 5, 6), **query-boundary honesty** (7), **gate usable locally + trackers current** (8, 9, 10, 11). Rows 12, 14, 15, 16, 17, 19 are real but pre-existing or excluded by the frozen boundaries, so they go to `deferred-work.md` as D1-D7 with owners named. No `intent_gap` and no `bad_spec`: the two candidates for a loopback (runtime method validation, `any`-built request path) are both excluded by the frozen "preserve existing validation/error response" boundary and both pre-date this diff, so they defer rather than force re-derivation.

### External review (parked pass landed 2026-09-26)

The four staged prompts in `_bmad-output/implementation-artifacts/review-prompts-1-2/` were executed as four independent reviewers — acceptance-auditor (XAA), blind-hunter (XBH), edge-case-hunter (XECH), verification-gap (XVGV) — in a fresh session against the staged diff `40d1475..adce8be`, with the current tree used only to verify what the diff did. The acceptance audit confirms all four ACs substantively met; XVGV re-ran the full gate at HEAD (typecheck 0, lint clean, 94/94 tests, build with `/predictgame7/` intact). Findings that duplicate rows 1-24 are folded into their existing routes (producer gate → D1, runtime method guard → D2, request path → D3, 62% constants → D6, hook test → D7, settled by Story 1.4) and not re-logged. 14 deduplicated rows follow; `review_loop_iteration` stays 0 — no loopback candidate emerged.

| # | Finding (reviewer) | Verdict | Evidence | Route |
|---|---|---|---|---|
| 25 | XAA1 / XBH9 — spec frontmatter set `status: 'done'` in the same commit that set `sprint-status.yaml` to `review` | medium | Verified in both files at HEAD: contradictory lifecycle states; the spec front-ran the parked review. | settled by this pass — external review landed and triaged, sprint-status flipped to `done`; trackers agree |
| 26 | XBH5 — `PredictionInput.parameters` is carried into the canonical contract but the function never reads it, and unlike `series_id` it was not documented as ignored | low | Verified: zero references in `predict-game-7/index.ts`; `contract.ts:21` documents `series_id` as ignored, `parameters` had no annotation. | patch — "function currently ignores it" comment added to `contract.ts` (type-only, inside the frozen boundaries) |
| 27 | XBH4 — the contract omits the 400/500 `{ error }` wire shapes while claiming single-source-of-truth status | low | Verified: `contract.ts` documents only the success path; the error bodies are part of the wire shape. | defer — extends D2: the input-validation story owns one 400 vocabulary and types the error shapes in the same change |
| 28 | XECH2 — non-numeric `game_N_score_*` bodies flow unguarded into the arithmetic; NaN probabilities serialize as `null` and render `null%` | medium | Verified: no guard between `req.json()` (`index.ts:297`) and the probability math; same unvalidated-input surface as row 12. | defer — extends D2 |
| 29 | XBH13 / XECH6 — `HistoricalPage.tsx:263,266` crest `alt={... ?? ''}`; row 22's rebuttal answered a stronger claim than the code supports | low | Row 22 is right that the `<img>` renders only when a logo resolves, but the guard is on `logo_url`, not `full_name`: a crest with a null name ships an empty-alt image, while `:162-163` already falls back to 'Team A'/'Team B'. | patch — `?? 'Team A logo'` / `?? 'Team B logo'` fallbacks |
| 30 | XBH11 / XECH3-4 — `use-mobile.tsx`: `change`-event source (767px media query) and predicate (`< 768` innerWidth) disagree at fractional widths; `!!undefined` first render shows one desktop frame on mobile | low | Verified at HEAD. The only consumer (`ui/sidebar.tsx`) is dead scaffold imported by nothing, and Story 1.4's `use-mobile.test.tsx` pins the current behavior, so it cannot regress silently. | defer — new deferred-work entry: dead-scaffold audit, owned by the next toolchain/cleanup story or whichever story first mounts a Sidebar |
| 31 | XAA4 / XBH12 / XVGV-O — `video.tsx` satisfies the gate by erasure (`FullscreenToggle as unknown as FC` strips all prop typing); `sidebar.tsx`/`video.tsx` are imported nowhere in `src` | low | Verified zero importers at HEAD; both components exist only to keep `tsc -b` green. The cast is honestly documented in-code, and `video.tsx`'s missing `Player` import was a latent `ReferenceError` this diff quietly fixed. | defer — same scaffold-audit entry: mount, keep, or delete is an owner call |
| 32 | XBH8 — the seven Story 1.2 deferred-work entries carry no D1-D7 identifiers, though this log and the Code Map route by them | low | Verified: cross-references resolved only by prose matching, and the rows→D grouping sentence doesn't map arithmetically. | patch — every 1.2 entry in `deferred-work.md` now tagged with its D-ID |
| 33 | XAA3 / XBH1-2 / XVGV3 — the "one slug→display mapping" claim is overstated: the picker keeps literal labels/anchors, and the Method-card description `switch` (`PredictPage.tsx:815`) keeps a silent `default: return ""` | medium | Verified. The picker half is closed at HEAD — Story 1.4's `predict-flow-regression.test.tsx:221-231` pins per-slug label/anchor parity across picker, card and details line, so literal drift now fails the gate. The description switch remains unkeyed and untested: a fifth contract slug renders an empty description with every gate green. | defer — extends D3: the PredictPage rebuild moves descriptions into a `Record<MethodSlug, string>` in `method-display.ts` |
| 34 | XVGV1-2 — AC-1's page-level behavior (Bayes label) was observed by no test at `adce8be`; contract tests assert the map, not the page; producer-side parity stays untested | medium at staging | True at `adce8be` and demonstrated by the reviewer (reverting `getMethodLabel` kept all gates green). Closed at HEAD by Story 1.4's render-level suite; the producer half is D1's `deno check` gap. | settled by Story 1.4 / D1 — no new action |
| 35 | XAA6 / XBH6-7 — contract tests pin object insertion order; two fixture tests are runtime tautologies; a test name claims Edge Function parity it doesn't observe | low | The order pin is the slug-set pin the spec asked for; the fixture tests' value is compile-time and they sit inside `tsc -b`'s includes; the naming issue is D1's gap restated. | rejected |
| 36 | XBH10 — Design Notes claim `asSeries()`/`asSeriesRow()` are the only untyped-row boundary, but `HistoricalPage` assigns untyped rows straight into typed state | low | The claim is scoped to `PredictPage`'s normalizer; the `HistoricalPage` pattern predates the diff and is untouched by it. Doc-precision only. | rejected |
| 37 | XAA7 — stale slugs (`bayesian`, `ensemble_v1`, `margin_model_v1`) survive in the `00005` seed migration's `prediction_methods` rows | info | `prediction_methods` has no runtime read path (AGENTS.md / FR-4 guardrail); schema changes were forbidden by this story's Never constraint; the FR-4 catalog work re-slugs the table. | rejected |
| 38 | XAA5 — CI runs `npm run typecheck` rather than the plan's literal `npx tsc -b` | info | The script is exactly `tsc -b`, placed between lint and test per AC-4; the spec's Verification section was amended in the same diff. | rejected |

**Grouping and routing (external pass).** Patches applied with this triage: 26 (contract comment), 29 (alt fallbacks), 32 (D-ID tags); 25 settles via the sprint-status flip. Deferrals all land on a named owner: 27-28 extend D2 (Edge Function input validation), 33 extends D3 (PredictPage rebuild), 30-31 open the dead-scaffold audit entry in `deferred-work.md`. Rows 34 and the picker half of 33 were closed by Story 1.4 between staging and this pass. Rejections 35-38 are style, doc-precision, or out-of-boundary. No `intent_gap`, no `bad_spec`, no loopback: the external pass found no defect in the consolidation itself — the contract, the compile-gated maps and the blocking typecheck all verify as designed.
