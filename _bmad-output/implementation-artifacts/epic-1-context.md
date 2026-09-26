# Epic 1 Context: A Prediction Flow That Never Breaks — on a Solid Toolchain

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the Predict flow reliably selectable, understandable, and recoverable before the 2027 playoff window. The epic first establishes a supported Vite/Vitest/CI base, then makes the Edge Function and React app share one accurate prediction contract, adds non-destructive error handling, and locks the highest-risk paths behind automated and manual verification. It protects the product's core promise: transparent probability estimates for historical, active, and custom NBA Game 7 matchups—not betting advice, live scoring, or an accuracy guarantee.

## Stories

- Story 1.1: Toolchain foundation — Vite 8 + Vitest + CI gate
- Story 1.2: One prediction contract (AD-2 consolidation)
- Story 1.3: Error states that never lose your place (FR-8)
- Story 1.4: Regression suite on the highest-risk Predict paths (FR-30)
- Story 1.5: Manual QA matrix + epic verification pass

## Requirements & Constraints

- The Predict flow must preserve its existing behavior across historical, active, and custom matchups. Historical selection populates series facts and Games 1–6; custom matching accepts full team names, nicknames, and abbreviations, using a placeholder logo rather than failing on unrecognized teams. All four methods remain selectable and changing method must not discard the current inputs.
- Prediction results must continue to provide a winner, two team probabilities that total 100% subject to rounding, contributing factors, confidence, and visible computation time. The probability scale is 0–100 percent, not a 0–1 fraction.
- The Maths page documents the same four methods and formulas as the Edge Function. Any method-contract change must preserve this synchronization.
- Failures must remain non-breaking and retry-safe. Later epic work distinguishes invalid input from service failures, preserves selections and custom input on retry, and uses the Edge Function error envelope `{ "error": string }`.
- New or changed UI must meet WCAG 2.1 AA: keyboard operation, meaningful screen-reader status, and compliant contrast. Existing UI practice remains the baseline unless a story explicitly changes it.
- Keep guarded work out of scope: do not introduce accounts, saved predictions, betting-adjacent outputs, odds, wagers, picks, or real-time/in-game scoring. Active-series data changes only through the future pipeline cadence.
- Do not add secrets to source control or client-visible `VITE_*` variables. The frontend uses the anonymous read client only; server computation and all writes stay in Edge Functions or pipeline scripts.
- Each story closes with `npm run build`, Biome lint, and the Vitest suite passing. Deployments and release/version changes happen only when the owner requests them.

## Technical Decisions

- The canonical prediction contract lives in `supabase/functions/_shared/contract.ts`; Edge Functions share this directory directly and never import from `src/`. React re-exports the contract's types from `src/types/prediction.ts` through a type-only import, keeping one client-facing type barrel.
- `MethodSlug` has exactly four current values: `logistic_regression`, `bayes`, `elo`, and `exponential_smoothing`. The database `prediction_methods` table has no runtime read path, so code must not treat it as a dynamic catalog.
- `PredictionInput` and `PredictionResult` describe what `predict-game-7` actually accepts and returns. The result owns winner, per-team percentage probabilities, contributing factors, confidence, computation time, and `method_used`; obsolete frontend-only result fields and stale method unions are removed.
- The same contract will later own the share payload schema. Keep this work general enough for that extension but do not build sharing in this epic.
- Frontend imports use the `@/` alias. Pages and components use PascalCase filenames; `lib`, hooks, and UI helpers use kebab-case. UI errors remain local `try/catch`, console logging, and sonner—no new state or query library.
- The codebase is on Vite 8 with Vitest and a CI build/lint/test gate from Story 1.1. Story 1.2 must also remove the known TypeScript contract drift, bring `npx tsc -b` to zero errors, and add the blocking type-check step between lint and test in CI.

## UX & Interaction Patterns

- The core flow is selection → method → transparent result → optional detailed analysis or reset. Contract consolidation is intentionally invisible to users: visual results and all four method choices must remain unchanged for a historical series and a custom matchup.
- Error work in this epic follows a state-preserving pattern: field-level feedback for invalid input, retryable service feedback for requests, and no forced re-entry of selections or scores. Error and retry controls must be keyboard reachable and announced.

## Cross-Story Dependencies

- Story 1.1's Vite/Vitest/CI foundation is complete and supplies the test and type-check location for the remaining stories.
- Story 1.2 is the foundation for the error-state and regression stories: one shared contract removes the `bayesian` versus `bayes` drift that made Predict behavior fragile.
- Story 1.3's error states become test cases in Story 1.4. Story 1.5 verifies all completed Predict paths on desktop and mobile and records evidence before Epic 1 closes.
- Future sharing uses the contract's planned share payload, analytics later owns any event isolation, and future pipeline work owns active-series freshness; neither is part of this story.
