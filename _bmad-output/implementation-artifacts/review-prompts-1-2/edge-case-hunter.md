Read C:\Users\yujey\Documents\predictgame7\.agents\skills\bmad-code-review\review-prompts\edge-case-hunter.md completely and follow it as your review instructions.

claims_file (leave unread until your instructions call for it): C:\Users\yujey\AppData\Local\Temp\bmad-code-review-claims-8ddba099-9ecb-4814-a4f4-9402b247df1c.txt

Review content:
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index 6c93911..228b708 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -24,11 +24,10 @@ jobs:
 
       - run: npm run lint
 
-      # `npx tsc -b` is deliberately not a step here: 33 pre-existing type
-      # errors in untouched app files (stale prediction unions, shadcn/vendor
-      # typing drift) make it permanently red today, and a step that can never
-      # fail is a fake gate. Story 1.2 adds it as a blocking step once it
-      # exits 0 — see _bmad-output/implementation-artifacts/deferred-work.md.
+      # Blocking typecheck of the app graph (`src` + `vite.config.ts`), which
+      # Story 1.2 made green — so this step can fail. It does not cover
+      # `supabase/functions/**`: no gate here type-checks the Edge Functions.
+      - run: npm run typecheck
 
       - run: npm test
 
diff --git a/README.md b/README.md
index 282e010..e30d5ad 100644
--- a/README.md
+++ b/README.md
@@ -85,6 +85,7 @@ npm run dev
 ```bash
 npm run build
 npm run lint
+npm run typecheck
 ```
 
 ## Deployment notes
diff --git a/_bmad-output/implementation-artifacts/deferred-work.md b/_bmad-output/implementation-artifacts/deferred-work.md
index b7347f6..f82114b 100644
--- a/_bmad-output/implementation-artifacts/deferred-work.md
+++ b/_bmad-output/implementation-artifacts/deferred-work.md
@@ -4,7 +4,7 @@ Entries carved out of specs by the scope standard, or discovered during implemen
 
 - source_spec: `spec-1-1-toolchain-foundation.md`
   summary: 6 non-contract type errors (shadcn/vendor typing + unused imports) that `tsc -b` reports today and that Story 1.2's contract work does not touch.
-  evidence: Owner decision 2026-09-25 — Story 1.2 gains an explicit exit condition that `npx tsc -b` exits 0 and CI's typecheck step is then added as a blocking step, so all 33 baseline errors (27 contract-rooted in `PredictPage.tsx`/`HistoricalPage.tsx`, plus these 6) must be cleared before the gate goes strict. The 6: `ui/qrcodedataurl.tsx` missing `@types/qrcode`; `ui/sidebar.tsx` imports `useIsMobile` not exported by `@/hooks/use-mobile`; `ui/video.tsx` ×3 `Player` undefined (video-react typing); `MathsPage.tsx` + `InsightsPage.tsx` unused imports (TS6133).
+  evidence: Owner decision 2026-09-25 — Story 1.2 gains an explicit exit condition that `npx tsc -b` exits 0 and CI's typecheck step is then added as a blocking step, so all 33 baseline errors (27 contract-rooted in `PredictPage.tsx`/`HistoricalPage.tsx`, plus these 6) must be cleared before the gate goes strict. The 6: `ui/qrcodedataurl.tsx` missing `@types/qrcode`; `ui/sidebar.tsx` imports `useIsMobile` not exported by `@/hooks/use-mobile`; `ui/video.tsx` ×3 `Player` undefined (video-react typing); `MathsPage.tsx` + `InsightsPage.tsx` unused imports (TS6133). **SETTLED 2026-09-26** — Story 1.2 cleared all 33: `@types/qrcode` added, `use-mobile.tsx` implemented, `Player` imported with a typed `FullScreenToggle` alias, both TS6133 imports removed. `npm run typecheck` exits 0 and is now the blocking step (locally via `predeploy`, in CI between lint and test).
 - source_spec: `spec-1-1-toolchain-foundation.md`
   summary: Vite 8 warns that `vite.config.ts` and `vitest.config.ts` use `__dirname`, unsupported by the planned-default `configLoader: 'native'`.
   evidence: Spec froze `vite.config.ts` as no-change, so the one-liner (`import.meta.dirname`) was left alone; fix opportunistically the next time either config is touched, before it becomes a hard error.
@@ -13,10 +13,31 @@ Entries carved out of specs by the scope standard, or discovered during implemen
   evidence: Found while writing the smoke tests; a logic bug, out of bounds for a toolchain-only story. Belongs in the Story 1.4 issue-#3 failure catalog as a reproduced case with a regression test.
 - source_spec: `spec-1-1-toolchain-foundation.md`
   summary: User-visible label bug — selecting the Bayes method leaves the Method card reading "Not selected".
-  evidence: Observed live during Story 1.1's dev-server spot-check (prediction itself succeeded: CLE 62% / GSW 38%). `getMethodLabel()` in `src/pages/PredictPage.tsx:278` switches on `case 'bayesian'` while the Edge Function's canonical slug is `bayes`, so it hits `default: return 'Not selected'`. Pure instance of the contract drift Story 1.2 deletes; out of bounds for a toolchain-only story. Should be covered by a Story 1.4 regression test (display label per method) and verified fixed in Story 1.5's QA matrix.
+  evidence: Observed live during Story 1.1's dev-server spot-check (prediction itself succeeded: CLE 62% / GSW 38%). `getMethodLabel()` in `src/pages/PredictPage.tsx:278` switches on `case 'bayesian'` while the Edge Function's canonical slug is `bayes`, so it hits `default: return 'Not selected'`. Pure instance of the contract drift Story 1.2 deletes; out of bounds for a toolchain-only story. Should be covered by a Story 1.4 regression test (display label per method) and verified fixed in Story 1.5's QA matrix. **SETTLED 2026-09-26** — fixed by Story 1.2 and verified live in the browser (Bayes selection now reads "Bayes Method"). The mapping moved to `src/lib/method-display.ts` as `Record<MethodSlug, string>`, so dropping a label fails the blocking typecheck step instead of falling through to a wrong string; `src/types/__tests__/prediction-contract.test.ts` pins the labels and Maths anchors against that real map. Story 1.4's component regression pass still owns the render-level label test.
 - source_spec: `spec-1-1-toolchain-foundation.md`
   summary: First green CI run is unverified locally — GitHub Actions only executes after a push, which the build workflow forbids.
   evidence: `ci.yml` steps were reproduced locally (lint / test / build all green on the final state), but the workflow itself, the Node 22 runner, and `npm ci` from a clean cache need the owner's first push to confirm. **SETTLED 2026-09-25** — push `6242d17..848dae7` triggered run 36091766887 on the Node 22.x runner: `npm ci` from clean cache, lint "Checked 86 files", 2 test files passed, `vite build` succeeded, overall **success**. The workflow as written gates master.
 - source_spec: `spec-1-1-toolchain-foundation.md`
   summary: `getRoundImportance('Conference Finals')` returns 0 — second round-vocabulary bug for Story 1.4's issue-#3 catalog.
   evidence: Verified in `src/lib/nba-utils.ts:49-56`: line 51 guards the finals branch with `!r.includes('conf')`, and "con**fer**ence" contains `conf`, so a conference-finals string misses branch 1, then fails branch 2's literal `'conf finals'` test, and falls through to 0. With the `'Semifinals'` → 4 entry above, the ranking only behaves correctly for one exact pipeline string shape. `nba-utils.ts` is untouched by Story 1.1, so neither bug is this story's defect; both need pinning tests in 1.4 plus a caller audit (`HistoricalPage`/`InsightsPage` sort on this value).
+- source_spec: `spec-1-2-one-prediction-contract-ad-2-consolidation.md`
+  summary: The producer side of the AD-2 contract — `supabase/functions/**` — is checked by no gate in the repo: `tsc -b` covers only `src` + `vite.config.ts`, and Biome's `files.includes` is `src/**` + `tailwind.config.js`.
+  evidence: Story 1.2 review rows 1, 2 and 15. `contract.ts` is only type-checked transitively as a frontend import; `predict-game-7/index.ts` never enters the program, so renaming a response field or emitting a new `confidence_level` value fails nothing — the frontend would render `undefined%`. Fixing it is a toolchain change, not a contract change: add `deno check supabase/functions/**/*.ts` (which also validates the `../_shared/contract.ts` hop) as a blocking CI step with `actions/setup-deno`, widen `biome.json` includes, and install Deno locally — it is not on this machine today, so the step cannot be proven green before a push. Lands with the next toolchain/CI story, or as a Story 1.5 QA-matrix prerequisite.
+- source_spec: `spec-1-2-one-prediction-contract-ad-2-consolidation.md`
+  summary: `predict-game-7` never validates `input.method` at runtime, so an out-of-contract slug silently runs logistic regression and echoes back as `method_used`.
+  evidence: Story 1.2 review row 12. `index.ts:297` is `const input: PredictionInput = await req.json()` and `:306` annotates `method: MethodSlug` over that unvalidated value; the branch chain's final `else` is logistic regression, so `{"method":"bayesian"}` returns a logistic result labelled `bayesian`. Reachable only from a non-browser caller — every in-app caller is now compile-gated, and the frontend's result card no longer mislabels an unknown slug as "Exponential Smoothing" (it echoes the slug and links `/maths`). Not added here because the frozen boundaries require the existing validation and error response to stay unchanged. Lands with whichever story owns Edge Function input validation; needs a 400 path plus a contract test for it.
+- source_spec: `spec-1-2-one-prediction-contract-ad-2-consolidation.md`
+  summary: `PredictPage`'s request path is still assembled through `any` and blind casts — `seriesInput: any` with computed keys, `as PredictionInput` at two sites, and twelve `undefined as any` fields in the custom-form state.
+  evidence: Story 1.2 review row 14; all of it predates this diff (`git diff HEAD` shows no hunk at those lines), and this story's task for `PredictPage` said to change types "without altering requests". Concretely: a missing or misspelled `game_N_score_*` key compiles clean, and using `PredictionInput` as form state is what forces the twelve `undefined as any` casts. The fix is a derived `Partial<PredictionInput>` form type exported from the frontend door plus typed payload builders — bigger than this story and touching rendering paths. Nothing currently scheduled owns it; raise it at the next planning pass that touches `PredictPage`.
+- source_spec: `spec-1-2-one-prediction-contract-ad-2-consolidation.md`
+  summary: `tsconfig.check.json` is dead config that contradicts the new gate — it excludes `src/**/*.test.ts` and `src/components/ui`, the two surfaces this story fixed.
+  evidence: Story 1.2 review row 16. Not referenced by `tsconfig.json`'s project references, by any npm script, or by CI; it is a Story 1.1 artifact kept for the 33-error era and `spec-1-1-toolchain-foundation.md:93` still cites it as a second check surface, so a future agent may run it and get a different answer than CI. Deleting a file needs the owner's confirmation, so it was left in place. Owner call: delete it, or wire it in and say what it is for.
+- source_spec: `spec-1-2-one-prediction-contract-ad-2-consolidation.md`
+  summary: AGENTS.md still tells agents CI runs lint, test and build — it now runs four steps, with `npm run typecheck` blocking between lint and test.
+  evidence: Story 1.2 review row 8. `AGENTS.md:26` reads "…`npm run lint` (Biome), `npm test` (Vitest), and `npm run build` all pass… CI (`.github/workflows/ci.yml`) runs the same three on every push to `master`", and the same line's local gate is what a "done" claim rests on. `README.md` and `package.json` (`typecheck` script, `predeploy` now running it) were corrected in this commit; agent-context files are the owner's to edit. Suggested replacement: name four commands and add `npm run typecheck` to the verification gate list.
+- source_spec: `spec-1-2-one-prediction-contract-ad-2-consolidation.md`
+  summary: The Bayes home-court figures (62% / 38%) live in four unlinked places across the function and the Maths copy, and are described as a "prior" where the code applies them as a likelihood.
+  evidence: Story 1.2 review rows 17 and 20. `index.ts:206` (`likelihood = 0.62`), `:209` (0.38 counterpart), `:266` (the user-visible "a 62% prior probability" factor description) and `MathsPage.tsx:21` (the copy this story corrected 75% → 62%). The frontend/server divergence already bit once, and there is no way to single-source it: `contract.ts` is types-only by AD-2, so a shared runtime constant would pull Edge Function code into the bundle, and the server's factor string is response behavior this story's boundaries froze. The terminology question (Bayesian likelihood vs prior) is a copy call for the same pass. Lands with the FR-4 method-catalog work, which is where method parameters are meant to become data.
+- source_spec: `spec-1-2-one-prediction-contract-ad-2-consolidation.md`
+  summary: The newly implemented `useIsMobile` hook has no test at its only consumer (`ui/sidebar.tsx`), so its mobile behavior can regress with every gate green.
+  evidence: Story 1.2 review row 19. Only three test files exist (`prediction-contract`, `nba-utils`, `render-smoke`); none render `Sidebar` or call the hook, and the recorded browser checks cover prediction paths only. `render-smoke.test.tsx:11-12` already states that real component regression tests land in Story 1.4, and this hook is standard shadcn scaffold — writing the jsdom + `matchMedia`-stub test now would pre-empt that planned scope. Story 1.4: assert true below 768px, false above, and that the `change` listener updates it.
diff --git a/_bmad-output/implementation-artifacts/spec-1-2-one-prediction-contract-ad-2-consolidation.md b/_bmad-output/implementation-artifacts/spec-1-2-one-prediction-contract-ad-2-consolidation.md
index bbffbee..ccb4b15 100644
--- a/_bmad-output/implementation-artifacts/spec-1-2-one-prediction-contract-ad-2-consolidation.md
+++ b/_bmad-output/implementation-artifacts/spec-1-2-one-prediction-contract-ad-2-consolidation.md
@@ -2,9 +2,10 @@
 title: 'Story 1.2 — One prediction contract (AD-2 consolidation)'
 type: 'refactor'
 created: '2026-09-26'
-status: 'ready-for-dev'
+status: 'done'
 route: 'dispatch'
 review_loop_iteration: 0
+baseline_commit: '40d1475'
 context:
   - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
   - '{project-root}/AGENTS.md'
@@ -51,11 +52,11 @@ context:
 ## Tasks & Acceptance
 
 **Execution:**
-- [ ] `supabase/functions/_shared/contract.ts`, `supabase/functions/predict-game-7/index.ts` -- create and consume the canonical four-slug request/result contract, mirroring the function's present percentage response fields.
-- [ ] `src/types/prediction.ts`, `src/types/types.ts`, `src/pages/PredictPage.tsx` -- route frontend type usage through a type-only re-export, delete duplicate stale types, and align the Bayes selection/label with `bayes`.
-- [ ] `src/pages/MathsPage.tsx`, `src/pages/HistoricalPage.tsx`, `src/pages/InsightsPage.tsx` -- correct the documented Bayes home prior and remove or narrow the TypeScript drift surfaced by the baseline check.
-- [ ] `src/hooks/use-mobile.tsx`, `src/components/ui/video.tsx`, `src/components/ui/qrcodedataurl.tsx`, `package.json`, `package-lock.json` -- resolve the remaining hook, video-react, and QR-code declaration errors without changing their intended UI behavior.
-- [ ] `.github/workflows/ci.yml` -- run `npx tsc -b` as a blocking step after lint and before tests.
+- [x] `supabase/functions/_shared/contract.ts`, `supabase/functions/predict-game-7/index.ts` -- create and consume the canonical four-slug request/result contract, mirroring the function's present percentage response fields.
+- [x] `src/types/prediction.ts`, `src/types/types.ts`, `src/pages/PredictPage.tsx` -- route frontend type usage through a type-only re-export, delete duplicate stale types, and align the Bayes selection/label with `bayes`.
+- [x] `src/pages/MathsPage.tsx`, `src/pages/HistoricalPage.tsx`, `src/pages/InsightsPage.tsx` -- correct the documented Bayes home prior and remove or narrow the TypeScript drift surfaced by the baseline check.
+- [x] `src/hooks/use-mobile.tsx`, `src/components/ui/video.tsx`, `src/components/ui/qrcodedataurl.tsx`, `package.json`, `package-lock.json` -- resolve the remaining hook, video-react, and QR-code declaration errors without changing their intended UI behavior.
+- [x] `.github/workflows/ci.yml` -- run `npx tsc -b` as a blocking step after lint and before tests.
 
 **Acceptance Criteria:**
 - Given any of the four method choices, when a historical or custom prediction runs, then the current Edge Function response shape renders as before and the Bayes method label no longer falls back to “Not selected.”
@@ -65,10 +66,78 @@ context:
 
 ## Implementation Notes
 
+**Code Map (as built):**
+
+- `supabase/functions/_shared/contract.ts` (new, types only) — `MethodSlug`, `ConfidenceLevel`, `PredictionInput`, `ContributingFactor`, `PredictionResult`. Pure declarations, no platform APIs, so both the Deno function and the Vite type graph import it.
+- `supabase/functions/predict-game-7/index.ts` — local `PredictionInput`/`ContributingFactor` deleted; handler annotates `method: MethodSlug`, `confidence_level: ConfidenceLevel`, and the response object as `PredictionResult`, so the file documents the contract it implements. No algorithm, branch, or response-field change. **These annotations are enforced by nothing in this repo** — no CI gate parses `supabase/functions/**` (review row 1; deferred as D1).
+- `src/types/prediction.ts` (new) — `export type { … }` re-export from the shared contract; the only frontend door.
+- `src/types/types.ts` — stale `PredictionInput` (six-slug union incl. `bayesian`/`ensemble_v1`/`margin_model_v1`), `ContributingFactor`, and `PredictionResult` deleted. Domain rows (`Team`, `Series`, `SeriesGameScore`, `PredictionMethod`, `ModelParameters`, `InsightCache`, `TeamLogo`) untouched.
+- `src/lib/method-display.ts` (new, from review patch) — `METHOD_LABELS` and `METHOD_MATHS_ANCHORS`, both keyed `Record<MethodSlug, string>`. The one slug→display mapping in the app, so adding a slug fails `npm run typecheck` at the map instead of falling through to a wrong label.
+- `src/pages/PredictPage.tsx` — local `PredictionMethod` union removed; `selectedMethod` is `MethodSlug | null`; `getMethodLabel()` and the result card's label/Maths link now read `METHOD_LABELS` / `METHOD_MATHS_ANCHORS` (the "Not selected" fallback for the Bayes selection is gone, and an out-of-contract `method_used` echoes its own slug and links `/maths` instead of mislabelling itself "Exponential Smoothing"); untyped `supabase-js` rows pass through `asSeries()` / `asSeriesRow()` at the two query boundaries.
+- `src/pages/MathsPage.tsx` — Bayesian home-prior copy corrected 75% → 62% to match the function; unused `History` icon import removed.
+- `src/pages/HistoricalPage.tsx`, `src/pages/InsightsPage.tsx` — nullable `alt` guards on the team-crest images `HistoricalPage` renders; unused `InsightCache` import removed from `InsightsPage` (which has no `<img>`).
+- `src/hooks/use-mobile.tsx` — was a 0-byte file while `sidebar.tsx` imported `useIsMobile`; now the standard 768px `matchMedia` hook (no Sidebar API change).
+- `src/components/ui/video.tsx` — `Player` added to the `video-react` import list; `FullscreenToggle` wrapped in a locally typed alias because the vendor typing demands a `actions` prop that `ControlBar` injects itself.
+- `src/components/ui/qrcodedataurl.tsx` — unchanged; fixed by adding `@types/qrcode` (`package.json` + lock).
+- `.github/workflows/ci.yml`, `package.json`, `README.md` — `npm run typecheck` (`tsc -b`) added as a script, run by `predeploy` and as the blocking CI step between lint and test; the comment states the graph it covers rather than claiming the whole repo.
+- `src/types/__tests__/prediction-contract.test.ts` (new, 6 tests) — imports the real `METHOD_LABELS` / `METHOD_MATHS_ANCHORS` and pins the four-slug domain, label-per-slug, anchor parity, the custom request type, and the 0–100 percentage response shape, plus a `@ts-expect-error` on `'bayesian'` labelled as the compile-time guard it is.
+
+**Design Notes:**
+
+- Contract lives on the Edge Function side and the frontend re-exports it, per AD-2 — the function is the authority on the wire shape, so drift is fixed at the source rather than mirrored. Enforcement is asymmetric and now stated as such: the frontend half is inside `npm run typecheck`, the function half is checked by nothing (D1).
+- `series_id` is kept on `PredictionInput` because the app sends it; the function still ignores it (documented in the type).
+- `asSeries()` / `asSeriesRow()` are the only places an untyped `supabase-js` row is read as `Series`. They are casts, not validation — supabase-js types the to-one embeds as arrays, and `data` cannot be assigned to `Series` directly (TS2322), so the cast has to live somewhere; it lives in one documented pair instead of scattered `as` expressions.
+- Labels and Maths anchors moved into `src/lib/method-display.ts` during review rather than staying in `contract.ts`, which is types-only by design (its own header rule), and rather than as a `switch` in `PredictPage`, which has no exhaustiveness check at the point of use. Importing the map from the test means the test now observes the code the page runs.
+- `input.method` is still not validated at runtime: a posted `"bayesian"` falls through to logistic regression and echoes in `method_used` (review row 12). The frozen boundaries keep the function's existing validation and error response unchanged, so this story preserves the behavior and D2 carries the guard.
+- The `@ts-expect-error` case is a compile-time tripwire, not a runtime test — `vitest run` strips types without checking them. The blocking `npm run typecheck` step is the guard that fires if the deleted slug returns.
+
+**Verified:**
+
+- `npm run typecheck` (`tsc -b`) -- exits 0 (33 baseline errors cleared).
+- `npm run lint` -- Biome clean, 89 files.
+- `npm test` -- 14 tests green across 3 files, including the 6-test contract suite.
+- `npm run build` -- succeeds, `/predictgame7/` asset prefix preserved.
+- Gate is falsifiable, not decorative: deleting the `bayes` entry from `METHOD_LABELS` fails `npm run typecheck` with TS2741 (`Property 'bayes' is missing … but required in type 'Record<MethodSlug, string>'`), which the previous `switch` + copied test map did not.
+- Browser (local Vite dev against the live `predict-game-7` function, 2026-09-26): selecting Bayes now shows the Method card as "Bayes Method" (was "Not selected"); the 2016 Finals (CLE vs GSW) historical path returns CLE 62% / GSW 38% with Game-by-Game factors, "Confidence: Medium", computation time, and Elo on the same series returns CLE 57.27% / GSW 42.73%; the custom path (BOS vs MIA, six typed score pairs) returns MIA 52.5% / BOS 47.5%. No console errors.
+- Label/link equivalence after the review patches is held by the contract tests, not by a second browser pass: they assert `METHOD_LABELS.bayes === 'Bayes Method'`, anchor-key parity, and the exact four anchor values the result card linked to before (`logistic-regression`, `bayesian-inference`, `elo-rating`, `exponential-smoothing`), so the map-driven render produces the same strings for every in-contract slug. A re-run of the live Bayes and Elo paths is still worth doing when the dev server is next up.
+
 ## Verification
 
 **Commands:**
-- `npx tsc -b` -- expected: exits 0 with no diagnostics.
+- `npm run typecheck` (`tsc -b`) -- expected: exits 0 with no diagnostics.
 - `npm run lint` -- expected: Biome reports no errors.
 - `npm test` -- expected: the existing Node and jsdom Vitest harness remains green.
 - `npm run build` -- expected: production build succeeds and preserves the `/predictgame7/` base path.
+
+## Review Triage Log
+
+Three layers reviewed `_review-diff-1-2.txt` (15 files) on 2026-09-26: `blind-hunter` (BH), `edge-case-hunter` (ECH), `verification-gap` (VGV). Verdicts rendered here after checking each claim at the cited location; severities assigned by the reviewers were disregarded. `carried` marks a row re-logged from an earlier pass (there is none — this is loop 1).
+
+| # | Finding (layer) | Verdict | Evidence | Route |
+|---|---|---|---|---|
+| 1 | BH1 / ECH5 / VGV2 — `ci.yml` says "the whole repo type-checks"; `supabase/functions/**` is outside the program | high | Verified: `tsconfig.json` references only `tsconfig.app.json` (`include: ["src"]`) and `tsconfig.node.json` (`vite.config.ts`), so `predict-game-7/index.ts` is parsed by no gate. The comment asserted coverage the change does not have. | patch (comment) + defer D1 |
+| 2 | BH1 / ECH6 — Design Notes claim the function's response is "compiler-checked against the contract" | medium | True for frontend consumers of `contract.ts`; false for the producer, which no CI step type-checks. | patch (notes) + defer D1 |
+| 3 | BH5 / VGV1 — new test asserts its own hand-copied label map, never the page's mapping | high | Demonstrated before this pass: deleting `case 'bayes'` from `getMethodLabel` left typecheck, lint, tests and build green while AC-1 regressed. | patch |
+| 4 | BH4 / ECH2 — slug→label mapping left in four copies; result card defaults an unknown `method_used` to "Exponential Smoothing" and links `#exponential-smoothing` | medium | Verified at `PredictPage.tsx:954-961`: two more copies of the mapping this story exists to collapse, on the same failure mode that shipped the "Not selected" bug. | patch |
+| 5 | BH6 — `getMethodLabel()`'s `default: 'Not selected'` is dead on an exhaustive switch with no exhaustiveness check at the point of use | low | Verified; real for the next contract addition, and the fix is the same map as row 4. | patch |
+| 6 | VG-O1 — the `@ts-expect-error` case is a no-op under `npm test`; only the typecheck gate sees it | low | Correct: Vitest strips types. Guard is genuine but the title implied runtime enforcement. | patch (test comment) |
+| 7 | BH8 — `asSeries()` comment claims normalization the code does not perform; `asSeries([data])` wraps one row to reach it | low | Verified at `PredictPage.tsx:41-44`: the helper is an unchecked cast. The `undefined` half of the claim is unreachable — `[data]` is always length 1 — and `data` cannot be used directly (reverting it reproduces TS2322 on the array-shaped to-one embeds). | patch (comment + explicit row cast) |
+| 8 | BH10 / BH11 — no `typecheck` script, so the gate runs only in CI; local `predeploy` and README still describe lint/test/build | medium | Verified: `package.json` had no `typecheck`, `predeploy` was `lint && test && build`, `README.md:83` listed two commands. AGENTS.md's own "before any done claim" gate therefore never type-checked locally. | patch (script, predeploy, README) + defer D5 (AGENTS.md) |
+| 9 | BH12 / ECH4 — trackers left in pre-change state: `deferred-work.md` still lists this diff's fixed items as open, `sprint-status.yaml` still `backlog`, `ci.yml` dropped the pointer without closing | medium | Verified in `deferred-work.md` (entries "6 non-contract type errors", "Not selected" label) and `sprint-status.yaml`. | patch (deferred-work now; sprint-status in step 5) |
+| 10 | BH13 — spec file not staged with the code | low | Verified: `git diff --cached` held the 14 code files, the spec sat only in the working tree. | patch (commit in step 5) |
+| 11 | BH14a — `ContributingFactor.impact` unit-less while `win_probability_*` are percentages; two scales in one response | low | Verified: `index.ts:267` sets `impact: 0.12, // 0.62 - 0.50`, a 0-1 fraction, beside 0-100 fields. | patch (contract comments) |
+| 12 | BH2 / ECH1 — no runtime guard on `input.method`: a posted `"bayesian"` silently runs logistic regression and echoes back in `method_used` | medium | Verified at `index.ts:297,306` — `req.json()` is unvalidated, and the `if/else` chain's final `else` is logistic regression. Real, and reachable only from a non-browser client; the app's own callers are compile-gated. | defer D2 |
+| 13 | BH3 — frontend response boundary is an unchecked cast with no `{ error }` variant, so a non-conforming 2xx body renders `undefined%` | low | True as described, but the function's non-2xx path already throws through `invoke`'s `error.context.text()`, and a 2xx body that is not a `PredictionResult` cannot be produced by any code path in this repo. | rejected |
+| 14 | BH7 — request path still built with `seriesInput: any`, `as PredictionInput` casts and twelve `undefined as any` form-state fields | medium | Verified in the diff: `git diff HEAD` shows no hunk at `PredictPage.tsx:61-77,179-229` — the scaffolding predates this story and this story's Task list says to leave requests unaltered. | defer D3 |
+| 15 | BH9 — `contract.ts` and the Edge Function are outside Biome's `files.includes`; frontend reaches the contract through a relative hop with no alias | medium | Verified: `biome.json` includes `src/**` + `tailwind.config.js` only, and `npx biome lint supabase/functions` reports "No files were processed". Pre-existing config this story inherits. | defer D1 |
+| 16 | BH15 — `tsconfig.check.json` is dead config that excludes exactly the surfaces this story fixed (`*.test.ts`, `src/components/ui`) | medium | Verified: not in `tsconfig.json` references, not in any script or CI step; `spec-1-1-toolchain-foundation.md:93` still cites it. Deleting a file needs the owner's confirmation. | defer D4 |
+| 17 | BH16 / 14b — the corrected 62% now lives in four unlinked places with no single source | medium | Verified: `index.ts:206`, `index.ts:209` (38% counterpart), `index.ts:266` factor copy, `MathsPage.tsx:21`. The divergence already bit once (75% copy). A shared runtime constant is blocked by the spec's types-only contract rule. | defer D6 |
+| 18 | ECH3 — `use-mobile.tsx` assumes `window.matchMedia` exists | low | True, and unreachable: this is a browser-only Vite SPA and the hook mounts in an effect; a guard branch would protect nothing the app can reach. | rejected |
+| 19 | VGV3 — newly implemented `useIsMobile` has no test at its `sidebar.tsx` consumer | medium | Verified: only three test files exist, none render `Sidebar`. Component regression tests are explicitly scheduled for Story 1.4 in `render-smoke.test.tsx:11-12`. | defer D7 |
+| 20 | BH14c — `MathsPage.tsx:21` calls 0.62 a "prior" where the code applies it as a likelihood | low | The frontend copy matches the function's own user-visible string at `index.ts:266` ("a 62% prior probability"); no doc/code divergence. The statistics wording is a copy question, logged under D6. | rejected |
+| 21 | BH14d — `InsightsPage.tsx` deletes the `InsightCache` import instead of applying it | low | Verified the page still casts `insightData as InsightData[]`; typing that query is a separate change to an untyped page, not a correction of anything this diff broke. | rejected |
+| 22 | BH14e — `HistoricalPage.tsx:263,266` `?? ''` alt turns a real crest into an unlabeled image | false | The `<img>` renders only inside `{resolveTeamLogoUrl(...) && (…)}` — no crest means no image, so the empty-alt branch cannot ship an unlabeled image. The `:198`/`:210` sites are untouched by this diff. | rejected |
+| 23 | BH14f — spec Code Map attributes team-crest `alt` guards to `InsightsPage`, which has no `<img>` | low | True of the wording; the remedy is this build's own spec text, corrected in Implementation Notes below. | rejected (spec edit) |
+| 24 | BH14g — `Series.status` keeps a value domain `docs/CURRENT_DATA_MODEL.md` does not define | low | True and already an AGENTS.md guardrail; this story neither reads nor writes status semantics beyond the pre-existing `=== 'active'` line. | rejected |
+
+**Grouping and routing.** Rows 1-11 grouped by shared cause and applied as patches: **gate truthfulness** (1, 2), **one display mapping, actually tested** (3, 4, 5, 6), **query-boundary honesty** (7), **gate usable locally + trackers current** (8, 9, 10, 11). Rows 12, 14, 15, 16, 17, 19 are real but pre-existing or excluded by the frozen boundaries, so they go to `deferred-work.md` as D1-D7 with owners named. No `intent_gap` and no `bad_spec`: the two candidates for a loopback (runtime method validation, `any`-built request path) are both excluded by the frozen "preserve existing validation/error response" boundary and both pre-date this diff, so they defer rather than force re-derivation.
diff --git a/_bmad-output/implementation-artifacts/sprint-status.yaml b/_bmad-output/implementation-artifacts/sprint-status.yaml
index 8a52045..a05b9b3 100644
--- a/_bmad-output/implementation-artifacts/sprint-status.yaml
+++ b/_bmad-output/implementation-artifacts/sprint-status.yaml
@@ -29,7 +29,7 @@
 # - Dev moves story to 'review', then runs code-review (fresh context, different LLM recommended)
 # - Retrospective appends its action items to action_items; the status view surfaces open ones
 generated: 09-25-2026 09:38
-last_updated: 09-26-2026 13:53
+last_updated: 09-26-2026 16:28
 project: predictgame7
 project_key: NOKEY
 tracking_system: file-system
@@ -37,7 +37,7 @@ story_location: _bmad-output/implementation-artifacts
 development_status:
   epic-1: in-progress
   1-1-toolchain-foundation-vite-8-vitest-ci-gate: done
-  1-2-one-prediction-contract-ad-2-consolidation: backlog
+  1-2-one-prediction-contract-ad-2-consolidation: review
   1-3-error-states-that-never-lose-your-place-fr-8: backlog
   1-4-regression-suite-on-the-highest-risk-predict-paths-fr-30: backlog
   1-5-manual-qa-matrix-epic-verification-pass: backlog
diff --git a/package-lock.json b/package-lock.json
index 08b058b..2a5f641 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -80,6 +80,7 @@
         "@testing-library/react": "^16.3.3",
         "@types/bmapgl": "^0.0.7",
         "@types/lodash": "^4.17.24",
+        "@types/qrcode": "^1.5.6",
         "@types/react": "^19.2.2",
         "@types/react-dom": "^19.2.2",
         "@types/video-react": "^0.15.8",
@@ -4124,6 +4125,16 @@
         "undici-types": ">=7.24.0 <7.24.7"
       }
     },
+    "node_modules/@types/qrcode": {
+      "version": "1.5.6",
+      "resolved": "https://registry.npmjs.org/@types/qrcode/-/qrcode-1.5.6.tgz",
+      "integrity": "sha512-te7NQcV2BOvdj2b1hCAHzAoMNuj65kNBMz0KBaxM6c3VGBOhU0dURQKOtH8CFNI/dsKkwlv32p26qYQTWoB5bw==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@types/node": "*"
+      }
+    },
     "node_modules/@types/react": {
       "version": "19.2.15",
       "resolved": "https://registry.npmjs.org/@types/react/-/react-19.2.15.tgz",
diff --git a/package.json b/package.json
index 4bd0c82..2171df3 100644
--- a/package.json
+++ b/package.json
@@ -6,9 +6,10 @@
     "build": "vite build && node scripts/verify-build-base.mjs",
     "dev": "vite",
     "preview": "vite build && vite preview",
-    "predeploy": "npm run lint && npm run test && npm run build",
+    "predeploy": "npm run lint && npm run typecheck && npm run test && npm run build",
     "deploy": "gh-pages -d dist",
     "lint": "biome lint .",
+    "typecheck": "tsc -b",
     "test": "vitest run",
     "test:watch": "vitest"
   },
@@ -85,6 +86,7 @@
     "@testing-library/react": "^16.3.3",
     "@types/bmapgl": "^0.0.7",
     "@types/lodash": "^4.17.24",
+    "@types/qrcode": "^1.5.6",
     "@types/react": "^19.2.2",
     "@types/react-dom": "^19.2.2",
     "@types/video-react": "^0.15.8",
diff --git a/src/components/ui/video.tsx b/src/components/ui/video.tsx
index c4a2a59..058df7c 100644
--- a/src/components/ui/video.tsx
+++ b/src/components/ui/video.tsx
@@ -18,10 +18,16 @@ import {
     TimeDivider,
     DurationDisplay,
     FullscreenToggle,
+    Player,
     VolumeMenuButton,
     ProgressControl
 } from 'video-react';
 import 'video-react/dist/video-react.css';
+import type { FC } from 'react';
+
+// ControlBar injects `actions` into its children at runtime; the vendor typing
+// demands it as a caller-supplied prop on FullscreenToggle only.
+const FullscreenToggleControl = FullscreenToggle as unknown as FC;
 
 interface VideoProps {
     /** Video resource URL */
@@ -102,7 +108,7 @@ display: block;
         <TimeDivider key="time-divider" />
         <DurationDisplay key="duration-display" />
         <ProgressControl key="progress-control" />
-        <FullscreenToggle key="fullscreen-toggle" />
+        <FullscreenToggleControl key="fullscreen-toggle" />
         </ControlBar>
         <BigPlayButton position="center" />
     </Player>
diff --git a/src/hooks/use-mobile.tsx b/src/hooks/use-mobile.tsx
index e69de29..63a404e 100644
--- a/src/hooks/use-mobile.tsx
+++ b/src/hooks/use-mobile.tsx
@@ -0,0 +1,20 @@
+import { useCallback, useEffect, useState } from "react"
+
+const MOBILE_BREAKPOINT = 768
+
+export function useIsMobile() {
+  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined)
+
+  const onChange = useCallback(() => {
+    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
+  }, [])
+
+  useEffect(() => {
+    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
+    mql.addEventListener("change", onChange)
+    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
+    return () => mql.removeEventListener("change", onChange)
+  }, [onChange])
+
+  return !!isMobile
+}
diff --git a/src/lib/method-display.ts b/src/lib/method-display.ts
new file mode 100644
index 0000000..fef9e28
--- /dev/null
+++ b/src/lib/method-display.ts
@@ -0,0 +1,20 @@
+import type { MethodSlug } from '@/types/prediction';
+
+/**
+ * The only slug -> display mapping in the app (AD-2). Keyed by `MethodSlug`, so
+ * adding or renaming a slug in the contract fails the typecheck gate here first.
+ */
+export const METHOD_LABELS: Record<MethodSlug, string> = {
+  logistic_regression: 'Logistic Regression',
+  bayes: 'Bayes Method',
+  elo: 'Elo Rating',
+  exponential_smoothing: 'Exponential Smoothing',
+};
+
+/** MathsPage section `id` per method — see the `methods` array in `src/pages/MathsPage.tsx`. */
+export const METHOD_MATHS_ANCHORS: Record<MethodSlug, string> = {
+  logistic_regression: 'logistic-regression',
+  bayes: 'bayesian-inference',
+  elo: 'elo-rating',
+  exponential_smoothing: 'exponential-smoothing',
+};
diff --git a/src/pages/HistoricalPage.tsx b/src/pages/HistoricalPage.tsx
index dd55e48..eb08763 100644
--- a/src/pages/HistoricalPage.tsx
+++ b/src/pages/HistoricalPage.tsx
@@ -260,10 +260,10 @@ export default function HistoricalPage() {
               <div className="flex items-center gap-4">
                 <div className="flex -space-x-2">
                   {resolveTeamLogoUrl(selectedSeries.team_a?.logo_url) && (
-                    <img src={resolveTeamLogoUrl(selectedSeries.team_a?.logo_url)} alt={selectedSeries.team_a.full_name} className="h-10 w-10 rounded-full border-2 border-background bg-white p-1" />
+                    <img src={resolveTeamLogoUrl(selectedSeries.team_a?.logo_url)} alt={selectedSeries.team_a?.full_name ?? ''} className="h-10 w-10 rounded-full border-2 border-background bg-white p-1" />
                   )}
                   {resolveTeamLogoUrl(selectedSeries.team_b?.logo_url) && (
-                    <img src={resolveTeamLogoUrl(selectedSeries.team_b?.logo_url)} alt={selectedSeries.team_b.full_name} className="h-10 w-10 rounded-full border-2 border-background bg-white p-1" />
+                    <img src={resolveTeamLogoUrl(selectedSeries.team_b?.logo_url)} alt={selectedSeries.team_b?.full_name ?? ''} className="h-10 w-10 rounded-full border-2 border-background bg-white p-1" />
                   )}
                 </div>
                 <div className="space-y-1">
diff --git a/src/pages/InsightsPage.tsx b/src/pages/InsightsPage.tsx
index 39ee063..093195e 100644
--- a/src/pages/InsightsPage.tsx
+++ b/src/pages/InsightsPage.tsx
@@ -1,7 +1,6 @@
 import { useEffect, useState } from 'react';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { supabase } from '@/db/supabase';
-import { InsightCache } from '@/types/types';
 import { Loader2, TrendingUp, Home, Target } from 'lucide-react';
 import { toast } from 'sonner';
 
diff --git a/src/pages/MathsPage.tsx b/src/pages/MathsPage.tsx
index cefb2e3..795c90a 100644
--- a/src/pages/MathsPage.tsx
+++ b/src/pages/MathsPage.tsx
@@ -1,6 +1,6 @@
 import { Link } from 'react-router-dom';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
-import { BookOpen, Calculator, Sigma, TrendingUp, History, Trophy } from 'lucide-react';
+import { BookOpen, Calculator, Sigma, TrendingUp, Trophy } from 'lucide-react';
 
 export default function MathsPage() {
   const methods = [
@@ -18,7 +18,7 @@ export default function MathsPage() {
       icon: Sigma,
       description: 'Updating historical priors with current series observations.',
       math: 'P(A|B) = [P(B|A) * P(A)] / P(B)',
-      details: 'This method starts with a "prior" probability — the historical win rate of home teams in Game 7s (approx. 75%). As the current series unfolds, this probability is updated based on the "likelihood" of the observed Game 1-6 results, providing a posterior probability that balances history with current reality.',
+      details: 'This method starts with a "prior" probability — the historical win rate of home teams in Game 7s (approx. 62%). As the current series unfolds, this probability is updated based on the "likelihood" of the observed Game 1-6 results, providing a posterior probability that balances history with current reality.',
     },
     {
       id: 'elo-rating',
diff --git a/src/pages/PredictPage.tsx b/src/pages/PredictPage.tsx
index dd2212f..dcff93e 100644
--- a/src/pages/PredictPage.tsx
+++ b/src/pages/PredictPage.tsx
@@ -8,13 +8,14 @@ import { Link, useSearchParams } from 'react-router-dom';
 import { supabase } from '@/db/supabase';
 import { getTeamAbbreviation } from '@/lib/nba-utils';
 import { getTeamLogo, resolveTeamLogoUrl } from '@/lib/team-logos';
-import { PredictionInput, PredictionResult, Series } from '@/types/types';
+import { METHOD_LABELS, METHOD_MATHS_ANCHORS } from '@/lib/method-display';
+import type { Series } from '@/types/types';
+import type { MethodSlug, PredictionInput, PredictionResult } from '@/types/prediction';
 import { Check, Settings, TrendingUp, Trophy, Loader2, ChevronRight } from 'lucide-react';
 import { toast } from 'sonner';
 import { usePostHog } from '@posthog/react';
 
 type SeriesSource = 'current' | 'historical' | 'custom';
-type PredictionMethod = 'logistic_regression' | 'bayesian' | 'elo' | 'exponential_smoothing' | 'ensemble_v1' | 'margin_model_v1';
 
 interface SelectedSeries {
   source: SeriesSource;
@@ -38,11 +39,17 @@ const SERIES_SELECT = `
   series_game_scores(*)
 `;
 
+// supabase-js has no generated Database types in this app, so `series` rows come
+// back with their to-one embeds typed as arrays. These two casts are the only
+// place a row is read as `Series`; nothing is validated.
+const asSeries = (rows: unknown): Series[] => (Array.isArray(rows) ? rows : []) as Series[];
+const asSeriesRow = (row: unknown): Series => row as Series;
+
 export default function PredictPage() {
   const posthog = usePostHog();
   const [searchParams] = useSearchParams();
   const [selectedSeries, setSelectedSeries] = useState<SelectedSeries | null>(null);
-  const [selectedMethod, setSelectedMethod] = useState<PredictionMethod | null>(null);
+  const [selectedMethod, setSelectedMethod] = useState<MethodSlug | null>(null);
   const [isSeriesDialogOpen, setIsSeriesDialogOpen] = useState(false);
   const [isMethodDialogOpen, setIsMethodDialogOpen] = useState(false);
   const [loading, setLoading] = useState(false);
@@ -94,7 +101,7 @@ export default function PredictPage() {
         .order('year', { ascending: false });
 
       if (error) throw error;
-      setGames(Array.isArray(data) ? data : []);
+      setGames(asSeries(data));
     } catch (err) {
       console.error('Error fetching series:', err);
     }
@@ -111,7 +118,8 @@ export default function PredictPage() {
       if (error) throw error;
 
       if (data) {
-        setSelectedSeries({ source: data.status === 'active' ? 'current' : 'historical', data });
+        const series = asSeriesRow(data);
+        setSelectedSeries({ source: series.status === 'active' ? 'current' : 'historical', data: series });
       } else {
         toast.error('Series not found');
       }
@@ -277,15 +285,7 @@ export default function PredictPage() {
 
   const getMethodLabel = () => {
     if (!selectedMethod) return 'Not selected';
-    switch (selectedMethod) {
-      case 'logistic_regression': return 'Logistic Regression';
-      case 'bayesian': return 'Bayes Method';
-      case 'elo': return 'Elo Rating';
-      case 'exponential_smoothing': return 'Exponential Smoothing';
-      case 'ensemble_v1': return 'Ensemble V1';
-      case 'margin_model_v1': return 'Margin Model V1';
-      default: return 'Not selected';
-    }
+    return METHOD_LABELS[selectedMethod];
   };
 
   const selectSeries = (game: Series) => {
@@ -946,20 +946,17 @@ export default function PredictPage() {
         const teamBName = prediction.team_b || fallbackTeamB || 'Team B';
         const teamALogo = resolveTeamLogoUrl(prediction.team_a_logo) || resolveTeamLogoUrl(selectedSeries?.data?.team_a?.logo_url) || getTeamLogo(teamAName);
         const teamBLogo = resolveTeamLogoUrl(prediction.team_b_logo) || resolveTeamLogoUrl(selectedSeries?.data?.team_b?.logo_url) || getTeamLogo(teamBName);
+        const mathsAnchor = METHOD_MATHS_ANCHORS[prediction.method_used];
         return (
           <div className="space-y-8">
             <Card>
               <CardHeader>
                 <CardTitle>Prediction Result</CardTitle>
                 <CardDescription className="flex items-center gap-2">
-                  <span>Method: {prediction.method_used === 'logistic_regression' ? 'Logistic Regression' : 
-                                prediction.method_used === 'bayes' ? 'Bayes Method' :
-                                prediction.method_used === 'elo' ? 'Elo Rating' : 'Exponential Smoothing'}</span>
+                  <span>Method: {METHOD_LABELS[prediction.method_used] ?? prediction.method_used}</span>
                   <span className="text-muted-foreground/30">•</span>
                   <Link 
-                    to={`/maths#${prediction.method_used === 'logistic_regression' ? 'logistic-regression' : 
-                                  prediction.method_used === 'bayes' ? 'bayesian-inference' :
-                                  prediction.method_used === 'elo' ? 'elo-rating' : 'exponential-smoothing'}`}
+                    to={mathsAnchor ? `/maths#${mathsAnchor}` : '/maths'}
                     className="text-primary hover:underline text-xs flex items-center gap-0.5"
                   >
                     View Maths <ChevronRight className="h-3 w-3" />
diff --git a/src/types/__tests__/prediction-contract.test.ts b/src/types/__tests__/prediction-contract.test.ts
new file mode 100644
index 0000000..12afe37
--- /dev/null
+++ b/src/types/__tests__/prediction-contract.test.ts
@@ -0,0 +1,105 @@
+import { describe, expect, it } from 'vitest';
+
+import { METHOD_LABELS, METHOD_MATHS_ANCHORS } from '@/lib/method-display';
+import type {
+  MethodSlug,
+  PredictionInput,
+  PredictionResult,
+} from '@/types/prediction';
+
+const sixGameScores = {
+  game_1_score_a: 108,
+  game_1_score_b: 95,
+  game_2_score_a: 103,
+  game_2_score_b: 110,
+  game_3_score_a: 112,
+  game_3_score_b: 99,
+  game_4_score_a: 101,
+  game_4_score_b: 107,
+  game_5_score_a: 115,
+  game_5_score_b: 104,
+  game_6_score_a: 98,
+  game_6_score_b: 113,
+};
+
+const customRequest = (method: MethodSlug): PredictionInput => ({
+  team_a: 'Cleveland Cavaliers',
+  team_b: 'Golden State Warriors',
+  ...sixGameScores,
+  method,
+});
+
+describe('prediction contract (AD-2)', () => {
+  it('carries exactly the four slugs the Edge Function branches on', () => {
+    expect(Object.keys(METHOD_LABELS)).toEqual([
+      'logistic_regression',
+      'bayes',
+      'elo',
+      'exponential_smoothing',
+    ]);
+  });
+
+  it('labels every slug the pages read from, instead of a display fallback', () => {
+    expect(Object.values(METHOD_LABELS)).not.toContain('Not selected');
+    expect(METHOD_LABELS.bayes).toBe('Bayes Method');
+  });
+
+  it('gives every labelled slug a Maths section to link to', () => {
+    expect(Object.keys(METHOD_MATHS_ANCHORS)).toEqual(Object.keys(METHOD_LABELS));
+    expect(Object.values(METHOD_MATHS_ANCHORS)).toEqual([
+      'logistic-regression',
+      'bayesian-inference',
+      'elo-rating',
+      'exponential-smoothing',
+    ]);
+  });
+
+  it('types a custom-series request for each method', () => {
+    const slugs = Object.keys(METHOD_LABELS) as MethodSlug[];
+    const requests = slugs.map(customRequest);
+
+    expect(requests.map((request) => request.method)).toEqual(slugs);
+    expect(requests[1]).toMatchObject({
+      method: 'bayes',
+      team_a: 'Cleveland Cavaliers',
+      game_6_score_b: 113,
+    });
+  });
+
+  it('types the response the UI reads, with probabilities as 0-100 percentages', () => {
+    const result: PredictionResult = {
+      predicted_winner: 'Cleveland Cavaliers',
+      team_a: 'Cleveland Cavaliers',
+      team_b: 'Golden State Warriors',
+      team_a_logo: 'https://cdn.example/cle.png',
+      team_b_logo: null,
+      win_probability_a: 62.5,
+      win_probability_b: 37.5,
+      confidence_level: 'High',
+      contributing_factors: [
+        {
+          factor: 'Cleveland Cavaliers leads cumulative differential',
+          description: 'Cleveland Cavaliers outscored the opposition by 16 total points.',
+          impact: 0.16,
+        },
+      ],
+      computation_time_ms: 3,
+      method_used: 'bayes',
+    };
+
+    expect(result.win_probability_a + result.win_probability_b).toBeCloseTo(100);
+    expect(METHOD_LABELS[result.method_used]).toBe('Bayes Method');
+  });
+});
+
+describe('stale slug tripwire', () => {
+  // Enforced by `tsc -b`, not by this runner: Vitest strips types without
+  // checking them. The case stays so the compile gate has a named failure site
+  // if the slug the contract deleted ever comes back.
+  it('is a compile-time guard', () => {
+    // @ts-expect-error 'bayesian' is not a MethodSlug
+    const stale: MethodSlug = 'bayesian';
+
+    expect(stale).toBe('bayesian');
+  });
+});
diff --git a/src/types/prediction.ts b/src/types/prediction.ts
new file mode 100644
index 0000000..b2ef4ed
--- /dev/null
+++ b/src/types/prediction.ts
@@ -0,0 +1,8 @@
+/** Frontend door to the one prediction contract (AD-2). Type-only: none of this reaches the bundle. */
+export type {
+  ConfidenceLevel,
+  ContributingFactor,
+  MethodSlug,
+  PredictionInput,
+  PredictionResult,
+} from '../../supabase/functions/_shared/contract';
diff --git a/src/types/types.ts b/src/types/types.ts
index 81ab703..d5d6844 100644
--- a/src/types/types.ts
+++ b/src/types/types.ts
@@ -50,53 +50,6 @@ export interface PredictionMethod {
   updated_at?: string | null;
 }
 
-export interface PredictionInput {
-  series_id?: string;
-  team_a?: string;
-  team_b?: string;
-  game_1_score_a: number;
-  game_1_score_b: number;
-  game_2_score_a: number;
-  game_2_score_b: number;
-  game_3_score_a: number;
-  game_3_score_b: number;
-  game_4_score_a: number;
-  game_4_score_b: number;
-  game_5_score_a: number;
-  game_5_score_b: number;
-  game_6_score_a: number;
-  game_6_score_b: number;
-  home_team?: string;
-  method?: 'logistic_regression' | 'bayesian' | 'elo' | 'exponential_smoothing' | 'ensemble_v1' | 'margin_model_v1';
-  parameters?: Record<string, number>;
-}
-
-export interface ContributingFactor {
-  factor: string;
-  description: string;
-  impact: number;
-}
-
-export interface PredictionResult {
-  prediction_id?: string;
-  series_id?: string;
-  method_id?: string;
-  prediction_type: string;
-  prediction_statement: string;
-  probability: number;
-  team_a: string;
-  team_b: string;
-  team_a_logo?: string;
-  team_b_logo?: string;
-  win_probability_a?: number;
-  win_probability_b?: number;
-  confidence_level: string;
-  contributing_factors: ContributingFactor[];
-  metadata?: Record<string, unknown>;
-  computation_time_ms: number;
-  method_used?: string;
-}
-
 export interface ModelParameters {
   id: string;
   parameter_name: string;
diff --git a/supabase/functions/_shared/contract.ts b/supabase/functions/_shared/contract.ts
new file mode 100644
index 0000000..b538e76
--- /dev/null
+++ b/supabase/functions/_shared/contract.ts
@@ -0,0 +1,64 @@
+/**
+ * One prediction contract (AD-2) — the single source of truth for the
+ * `predict-game-7` request and response shapes.
+ *
+ * Pure type declarations only: no runtime code and no platform APIs, so the
+ * Deno Edge Function and the Vite frontend type graph can both import it.
+ * Probabilities are documented as 0-100 percentages.
+ */
+
+/** The four methods the Edge Function actually branches on. */
+export type MethodSlug =
+  | 'logistic_regression'
+  | 'bayes'
+  | 'elo'
+  | 'exponential_smoothing';
+
+/** Confidence band derived from the higher win probability. */
+export type ConfidenceLevel = 'High' | 'Medium' | 'Low';
+
+export interface PredictionInput {
+  /** Present when the caller predicts a stored series; the function ignores it. */
+  series_id?: string;
+  team_a: string;
+  team_b: string;
+  game_1_score_a: number;
+  game_1_score_b: number;
+  game_2_score_a: number;
+  game_2_score_b: number;
+  game_3_score_a: number;
+  game_3_score_b: number;
+  game_4_score_a: number;
+  game_4_score_b: number;
+  game_5_score_a: number;
+  game_5_score_b: number;
+  game_6_score_a: number;
+  game_6_score_b: number;
+  /** Full team name of the Game 7 home team, when known. */
+  home_team?: string;
+  method?: MethodSlug;
+  parameters?: Record<string, number>;
+}
+
+export interface ContributingFactor {
+  factor: string;
+  description: string;
+  /** Probability shift this factor contributes, as a 0-1 fraction — not a percentage. */
+  impact: number;
+}
+
+export interface PredictionResult {
+  predicted_winner: string;
+  team_a: string;
+  team_b: string;
+  team_a_logo?: string | null;
+  team_b_logo?: string | null;
+  /** Percentage probability (0-100, two decimals) that team A wins Game 7. */
+  win_probability_a: number;
+  /** Percentage probability (0-100, two decimals) that team B wins Game 7. */
+  win_probability_b: number;
+  confidence_level: ConfidenceLevel;
+  contributing_factors: ContributingFactor[];
+  computation_time_ms: number;
+  method_used: MethodSlug;
+}
diff --git a/supabase/functions/predict-game-7/index.ts b/supabase/functions/predict-game-7/index.ts
index c3443c2..5aaa65c 100644
--- a/supabase/functions/predict-game-7/index.ts
+++ b/supabase/functions/predict-game-7/index.ts
@@ -1,4 +1,11 @@
 import { createClient } from 'jsr:@supabase/supabase-js@2';
+import type {
+  ConfidenceLevel,
+  ContributingFactor,
+  MethodSlug,
+  PredictionInput,
+  PredictionResult,
+} from '../_shared/contract.ts';
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
@@ -8,32 +15,6 @@ const corsHeaders = {
 const W = [0.03, 0.03, 0.01, 0, 0.03, -0.01];
 const B = 0;
 
-interface PredictionInput {
-  team_a: string;
-  team_b: string;
-  game_1_score_a: number;
-  game_1_score_b: number;
-  game_2_score_a: number;
-  game_2_score_b: number;
-  game_3_score_a: number;
-  game_3_score_b: number;
-  game_4_score_a: number;
-  game_4_score_b: number;
-  game_5_score_a: number;
-  game_5_score_b: number;
-  game_6_score_a: number;
-  game_6_score_b: number;
-  home_team?: string;
-  method?: 'logistic_regression' | 'bayes' | 'elo' | 'exponential_smoothing';
-  parameters?: Record<string, number>;
-}
-
-interface ContributingFactor {
-  factor: string;
-  description: string;
-  impact: number;
-}
-
 function sigmoid(z: number): number {
   return 1 / (1 + Math.exp(-z));
 }
@@ -322,7 +303,7 @@ Deno.serve(async (req) => {
       );
     }
     
-    const method = input.method || 'logistic_regression';
+    const method: MethodSlug = input.method || 'logistic_regression';
     const features = calculateFeatures(input);
     
     let probability_a: number;
@@ -348,7 +329,7 @@ Deno.serve(async (req) => {
     const predicted_winner = probability_a > 0.5 ? input.team_a : input.team_b;
     const max_prob = Math.max(probability_a, probability_b);
     
-    let confidence_level = 'Low';
+    let confidence_level: ConfidenceLevel = 'Low';
     if (max_prob > 0.7) {
       confidence_level = 'High';
     } else if (max_prob > 0.6) {
@@ -368,7 +349,7 @@ Deno.serve(async (req) => {
     const team_a_logo = logoMap.get(input.team_a);
     const team_b_logo = logoMap.get(input.team_b);
     
-    const result = {
+    const result: PredictionResult = {
       predicted_winner,
       team_a: input.team_a,
       team_b: input.team_b,
