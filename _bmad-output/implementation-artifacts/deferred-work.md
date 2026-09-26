# Deferred Work

Entries carved out of specs by the scope standard, or discovered during implementation and left out of scope deliberately. Each names where it lands, so nothing rots in a warning nobody reads.

- source_spec: `spec-1-1-toolchain-foundation.md`
  summary: 6 non-contract type errors (shadcn/vendor typing + unused imports) that `tsc -b` reports today and that Story 1.2's contract work does not touch.
  evidence: Owner decision 2026-09-25 — Story 1.2 gains an explicit exit condition that `npx tsc -b` exits 0 and CI's typecheck step is then added as a blocking step, so all 33 baseline errors (27 contract-rooted in `PredictPage.tsx`/`HistoricalPage.tsx`, plus these 6) must be cleared before the gate goes strict. The 6: `ui/qrcodedataurl.tsx` missing `@types/qrcode`; `ui/sidebar.tsx` imports `useIsMobile` not exported by `@/hooks/use-mobile`; `ui/video.tsx` ×3 `Player` undefined (video-react typing); `MathsPage.tsx` + `InsightsPage.tsx` unused imports (TS6133).
- source_spec: `spec-1-1-toolchain-foundation.md`
  summary: Vite 8 warns that `vite.config.ts` and `vitest.config.ts` use `__dirname`, unsupported by the planned-default `configLoader: 'native'`.
  evidence: Spec froze `vite.config.ts` as no-change, so the one-liner (`import.meta.dirname`) was left alone; fix opportunistically the next time either config is touched, before it becomes a hard error.
- source_spec: `spec-1-1-toolchain-foundation.md`
  summary: `getRoundImportance('Semifinals')` returns 4 — a bare "semifinals" string matches a `finals` branch and outranks conference finals.
  evidence: Found while writing the smoke tests; a logic bug, out of bounds for a toolchain-only story. Belongs in the Story 1.4 issue-#3 failure catalog as a reproduced case with a regression test.
- source_spec: `spec-1-1-toolchain-foundation.md`
  summary: User-visible label bug — selecting the Bayes method leaves the Method card reading "Not selected".
  evidence: Observed live during Story 1.1's dev-server spot-check (prediction itself succeeded: CLE 62% / GSW 38%). `getMethodLabel()` in `src/pages/PredictPage.tsx:278` switches on `case 'bayesian'` while the Edge Function's canonical slug is `bayes`, so it hits `default: return 'Not selected'`. Pure instance of the contract drift Story 1.2 deletes; out of bounds for a toolchain-only story. Should be covered by a Story 1.4 regression test (display label per method) and verified fixed in Story 1.5's QA matrix.
- source_spec: `spec-1-1-toolchain-foundation.md`
  summary: First green CI run is unverified locally — GitHub Actions only executes after a push, which the build workflow forbids.
  evidence: `ci.yml` steps were reproduced locally (lint / test / build all green on the final state), but the workflow itself, the Node 22 runner, and `npm ci` from a clean cache need the owner's first push to confirm. **SETTLED 2026-09-25** — push `6242d17..848dae7` triggered run 36091766887 on the Node 22.x runner: `npm ci` from clean cache, lint "Checked 86 files", 2 test files passed, `vite build` succeeded, overall **success**. The workflow as written gates master.
- source_spec: `spec-1-1-toolchain-foundation.md`
  summary: `getRoundImportance('Conference Finals')` returns 0 — second round-vocabulary bug for Story 1.4's issue-#3 catalog.
  evidence: Verified in `src/lib/nba-utils.ts:49-56`: line 51 guards the finals branch with `!r.includes('conf')`, and "con**fer**ence" contains `conf`, so a conference-finals string misses branch 1, then fails branch 2's literal `'conf finals'` test, and falls through to 0. With the `'Semifinals'` → 4 entry above, the ranking only behaves correctly for one exact pipeline string shape. `nba-utils.ts` is untouched by Story 1.1, so neither bug is this story's defect; both need pinning tests in 1.4 plus a caller audit (`HistoricalPage`/`InsightsPage` sort on this value).
- source_spec: `spec-1-1-toolchain-foundation.md`
  summary: AGENTS.md is stale about the toolchain — its verification gate omits the test suite and its stack line still says `rolldown-vite`.
  evidence: Story 1.1 replaced the shim with `vite@^8.3.1`, added `npm test`, and wired the suite into `predeploy`, while AGENTS.md still defines the gate as "`npm run build` passes and Biome lint is clean" and names `rolldown-vite` in the stack line. Deferred because the fix edits an agent-context file. Update both lines next time AGENTS.md is touched, or now on the owner's word.
