# Epic 1 Context: A Prediction Flow That Never Breaks — on a Solid Toolchain

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the Predict flow trustworthy and locked down: users can run, compare, and retry predictions without losing state or hitting mystery failures (issue #3 closed), protected by an automated regression suite every later epic builds on. The epic starts by migrating the build off the deprecated `rolldown-vite` shim onto a supported toolchain with a CI test gate — deliberately done now, off-peak, while no release pressure exists — then consolidates the prediction contract so frontend and Edge Function can never disagree, overhauls error states, and proves reliability with tests plus a documented manual QA pass.

## Stories

- Story 1.1: Toolchain foundation — Vite 8 + Vitest + CI gate
- Story 1.2: One prediction contract (AD-2 consolidation)
- Story 1.3: Error states that never lose your place (FR-8)
- Story 1.4: Regression suite on the highest-risk Predict paths (FR-30)
- Story 1.5: Manual QA matrix + epic verification pass

## Requirements & Constraints

- Graceful degradation (FR-8): every failure — invalid input, network drop, Edge Function error — produces a non-breaking, retry-safe error state. UI must distinguish invalid-input errors (inline, field-level, pre-submission where possible) from service failures (retry-able). Retry re-runs without re-entering any data: series selection, custom inputs, and method choice all survive the failure.
- Regression protection (FR-30): automated tests over the four highest-risk paths — historical series selection/preload, custom team-name resolution (full/nickname/abbreviation with placeholder fallback) and score validation bounds, method switching mid-flow without state loss, and both error classes. A documented catalog of issue #3's reproduced failure cases maps each case to a regression test or an FR-8 error state. The suite runs in CI and blocks merge on red.
- Baseline surfaces under QA (FR-1/3/4/5/6/7): prediction outputs (winner, per-team probabilities, factors, confidence, computation time), method comparison, and one-action reset must keep working unchanged; the contract refactor is behavior-preserving — all four methods produce identical results pre/post, verified against a historical series and a custom matchup.
- Predictions contract: canonical method slugs are `logistic_regression | bayes | elo | exponential_smoothing`; probabilities are 0–100 percent. Stale frontend unions get deleted, not mapped. Adding a method = union + Maths page + event registry in the same change; Maths page formulas must stay in sync with the Edge Function (FR-15 check when the contract lands).
- Accessibility (NFR-A1): all new/changed UI is AA-clean — keyboard-reachable retry, screen-reader-announced errors, contrast-compliant styling, WCAG 2.1 AA as the standing bar.
- Performance (NFR-P1 partial): computation-time display preserved; manual QA includes a spot-check of prediction full-request time on a mobile network against the provisional P95 ≤ 3s target.
- Analytics boundary: failures emit through the existing `captureError` call pattern without importing `posthog-js` directly in feature code; full centralization lands in Epic 3 — do not pre-build the port here. The 10 event names stay verbatim.
- Edge Function errors use one envelope: `{ "error": string }` + status code, never stack traces. Server secrets never in repo, bundle, or `VITE_*` vars.
- Verification gate on every story: `npm run build` passes and Biome is lint-clean (plus Vitest green once 1.1 lands). No deploys unless the owner asks.
- Migration constraint: the Vite 8 move is toolchain-only — zero user-visible behavior change; dev-server `.env.local` restart behavior must keep working; the gh-pages base path (`/predictgame7/`) must still deploy correctly. Tailwind deliberately stays on v3.

## Technical Decisions

- Toolchain: replace the deprecated `rolldown-vite@latest` shim with `vite@^8` (Rolldown-powered), add Vitest (^4.1 is compatible), and a GitHub Actions workflow running build + lint + test on push.
- Single prediction contract at `supabase/functions/_shared/contract.ts` (also the future home of `SharePayload` for Epic 4's share features); frontend `src/types/prediction.ts` re-exports it type-only; `predict-game-7` imports from `_shared`. Contracts are shared via `_shared`, never via `src/`.
- Frontend conventions (AD-9): `@/` alias for imports; one type barrel; PascalCase pages/components, kebab-case in `ui/hooks/lib`; error handling in UI stays inline try/catch + `console.error` + sonner toast (no new state library, no react-query); react-hook-form + zod for new/changed forms. Dead vestigial modules (`AuthContext`, `RouteGuard`, `SamplePage`) are off-limits import targets.
- Client reads go only through the single anon Supabase client; all writes stay in Edge Functions/pipeline.
- Tests + QA artifacts (failure catalog, results matrices) live in `_bmad-output/implementation-artifacts/`.
- Dependency rule: the CI test gate from Story 1.1 is the enforcement mechanism for everything after; the contract consolidation is what makes the flow testable.

## UX & Interaction Patterns

- Retry panel is the treatment for re-attemptable service-failure regions (refines the toast-only default): replaces the failed region in place, not as a toast; preserves all inputs; a second failure re-renders the panel, never an infinite spinner. Announces via `role="status"` with Retry as the first tab stop; warning icon is decorative.
- Predict service failure pattern: sonner toast for the mutation + retry panel around the result region, form inputs preserved.
- Inline field errors: appear on submit (not per keystroke) via the zod resolver; deterministic constraints (e.g., score bounds) enforced pre-submission where possible; error text in `destructive-text #B91C1C`, field border `destructive #DC3C3C`, wired with `aria-describedby`; no toasts or alert boxes for validation.
- Error/empty-state shared shape: icon tile → title → one line → single onward action. Error copy names what failed and what happens next; never blames the user or the network.
- Contrast token floor lands in `src/index.css` while these surfaces are touched: small-text floor `#767676` (replacing `#808080` for small text app-wide), `on-muted #595959` for body copy on muted fills, `form-border #949494` for form control borders.
- Voice guardrails: no "oracle"/"guarantee"/accuracy-claiming framing anywhere in product copy.
- Reference mockup exists for error states, retry panel, inline errors, and empty states (see the UX package's `key-error-states.html`).

## Cross-Story Dependencies

- 1.1 → 1.4: Vitest harness and CI gate are prerequisites for the regression suite.
- 1.2 → 1.4: consolidated contract makes the Predict paths testable against one canonical shape.
- 1.3 → 1.4: both error classes (invalid input vs service failure) defined by 1.3 are covered by 1.4's tests.
- 1.1–1.4 → 1.5: manual QA matrix runs only after the automated foundation is in.
- Epic-outward: every later epic builds on this CI gate and contract; Epic 3 relocates `captureError` behind the analytics port (Story 1.3 must not fight that by building its own layer); Epic 4's `SharePayload` will come from the same contract file.
