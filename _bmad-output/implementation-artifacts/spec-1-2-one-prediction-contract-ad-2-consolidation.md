---
title: 'Story 1.2 — One prediction contract (AD-2 consolidation)'
type: 'refactor'
created: '2026-09-26'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
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
- [ ] `supabase/functions/_shared/contract.ts`, `supabase/functions/predict-game-7/index.ts` -- create and consume the canonical four-slug request/result contract, mirroring the function's present percentage response fields.
- [ ] `src/types/prediction.ts`, `src/types/types.ts`, `src/pages/PredictPage.tsx` -- route frontend type usage through a type-only re-export, delete duplicate stale types, and align the Bayes selection/label with `bayes`.
- [ ] `src/pages/MathsPage.tsx`, `src/pages/HistoricalPage.tsx`, `src/pages/InsightsPage.tsx` -- correct the documented Bayes home prior and remove or narrow the TypeScript drift surfaced by the baseline check.
- [ ] `src/hooks/use-mobile.tsx`, `src/components/ui/video.tsx`, `src/components/ui/qrcodedataurl.tsx`, `package.json`, `package-lock.json` -- resolve the remaining hook, video-react, and QR-code declaration errors without changing their intended UI behavior.
- [ ] `.github/workflows/ci.yml` -- run `npx tsc -b` as a blocking step after lint and before tests.

**Acceptance Criteria:**
- Given any of the four method choices, when a historical or custom prediction runs, then the current Edge Function response shape renders as before and the Bayes method label no longer falls back to “Not selected.”
- Given the contract refactor, when the frontend and Edge Function type-check, then only `logistic_regression`, `bayes`, `elo`, and `exponential_smoothing` are available as method slugs, and no obsolete prediction union or response fields remain.
- Given the Maths page, when the Bayesian explanation is read, then its home-court likelihood agrees with the function's 62% value and each of the four methods remains documented.
- Given the repository's current dependencies and UI source, when `npx tsc -b` runs, then it exits 0; CI runs that command between lint and test and blocks on failure.

## Implementation Notes

## Verification

**Commands:**
- `npx tsc -b` -- expected: exits 0 with no diagnostics.
- `npm run lint` -- expected: Biome reports no errors.
- `npm test` -- expected: the existing Node and jsdom Vitest harness remains green.
- `npm run build` -- expected: production build succeeds and preserves the `/predictgame7/` base path.
