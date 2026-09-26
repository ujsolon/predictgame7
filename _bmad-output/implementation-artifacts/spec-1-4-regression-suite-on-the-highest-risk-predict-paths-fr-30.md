---
title: 'Story 1.4 — Regression suite on the highest-risk Predict paths (FR-30)'
type: 'feature'
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

**Problem:** Issue #3 ("Harden prediction flow reliability across selection, custom inputs, and mobile") is still open, and the failure cases it recorded live only as prose in `deferred-work.md`. Two of them are live today — `getRoundImportance` mis-ranks bare `'Semifinals'` and `'Conference Finals'`, and `useIsMobile` has never been tested — and none of them is pinned by a test, so the flow that already regressed once can silently regress again.

**Approach:** A regression suite over the four named Predict paths, plus one catalog document that reproduces each issue-#3 case and maps it to the test (or the Story 1.3 error state) that now owns it. The suite mostly pins behavior as shipped; two recorded defects are closed rather than frozen, per the Decisions below. The catalog is what makes issue #3 closeable.

## Boundaries & Constraints

**Always:** Two behavior changes are in scope by owner decision (fix the round-ranking branches; warn on an unrecognized custom team name). Everything else is tests plus one catalog document. Reuse Story 1.3's harness conventions exactly: `__tests__/` directories, explicit `import { describe, expect, it, vi } from 'vitest'` (no globals), `// @vitest-environment jsdom` docblock per component/hook file, a `vi.hoisted` mock bag for module boundaries, `fireEvent` (not user-event). Every assertion otherwise pins behavior as shipped. `npm test` stays green and the whole suite runs in CI unchanged. The catalog cross-references `deferred-work.md` rows rather than restating them.

**Never:** Change `supabase/functions/**` (Edge Function `input.method` validation stays deferred), add a dependency (Biome's `noUndeclaredDependencies` rejects `@testing-library/user-event`), add coverage tooling, edit `.github/workflows/**` or GitHub settings, change any `src/lib/nba-utils.ts` function other than `getRoundImportance`'s branch order (`getTeamAbbreviation` and `TEAM_ABBREVIATIONS` are pinned as-is), touch `HistoricalPage.tsx`'s own logic (it inherits the corrected ranking through the existing comparator at `:47` and changes nowhere else), restore the `'Team A'/'Team B'` name fallback Story 1.3's Decision 4 removed, make the unrecognized-name warning blocking or a field error, detect the unknown name by sniffing `console.warn`, re-derive Story 1.3's 11 error-state page tests, touch analytics wiring, or deploy anything. No accounts, betting, or live-scoring surfaces.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Series selection through the picker | Decade → year → series clicks, `series` select stubbed | `selectedSeries` holds `{source:'series', data}` and the trigger shows `BOS vs MIA`; back-navigation keeps the prior choice | n/a |
| `?series=` preload | List + `maybeSingle` stubbed to return a row | Card populated from the preloaded row; the selection survives a later method change | Failed fetch → the FR-8 preload panel (1.3 owns the copy; 1.4 owns the state) |
| Custom name resolution | `'Boston Celtics'`, `'Celtics'`, `'BOS'`, `'Los Angeles'`, `'Nowhere FC'`, `''` | Abbreviation: dict hit → `BOS`, initials → `LA`, truncation → `CEL`, blank → `''`. Logo alias match is normalized (case/space/punctuation-insensitive, exact after normalization) → real logo; `'Nowhere FC'` → generic `Team A`/`Team B` logo **plus** a non-blocking `toast.warning` naming the unrecognized team; blank → inline field error and no request | Warning never blocks the request; it is not a field error and never fires on keystroke |
| Custom score validation | Blank, `0`, `-3`, `abc`, `48` | Missing / `0` / non-integer / negative → error map keyed by input id; `48` → no error, non-blocking range `toast.warning` only | Any error → no `invoke` call |
| Method switching mid-flow | Fill the custom grid, switch logistic → bayes → elo | `customInput` survives every switch (nothing resets it); result, details, field errors and failure panels are cleared; each method's card label and picker option match `METHOD_LABELS` | n/a |
| "New Prediction" | Result showing, custom grid filled | Result/series/method/details cleared; `customInput`, fetched games and URL preserved | n/a |
| Round ranking | `'NBA Finals'`, `'Conference Finals'`, `'Conference Semifinals'`, `'Semifinals'`, `'West Conf Finals'`, `'First Round'`, `'Preseason'` | Fixed: 4, **3**, 2, 2, 3, 1, 0. Today it returns 4, **0**, 2, **4**, 3, 1, 0 — `'Conference Finals'` sorts last alongside unknowns, and a bare `'Semifinals'` outranks the conference rounds. Every value the data actually uses today (`'NBA Finals'` 4, `'Conference Semifinals'` 2, `'First Round'` 1) must come back unchanged | n/a |
| Mobile breakpoint | `matchMedia` stub: `(max-width: 767px)` true, false, then a dispatched `change` | `useIsMobile()` → true / false / updated value; the `change` listener is removed on unmount | n/a |

## Decisions (owner-confirmed at the planning checkpoint, 2026-09-26)

1. **Fix `getRoundImportance` in this story**, not pin it: a bare `'Semifinals'` ranks 2, `'Conference Finals'` ranks 3. `HistoricalPage`'s row order is the visible consequence and is accepted.
2. **"Blocks merge on red" is the owner's action, recorded as deferred work.** This story adds no CI step and touches no GitHub setting; the catalog names branch protection on `master` as the open owner action and `deferred-work.md` carries it.
3. **Round-ranking coverage stays at the function level.** No `HistoricalPage` render test — the page is not a Predict path and its comparator is unchanged.
4. **An unrecognized custom team name gets a non-blocking warning**, mirroring the existing score-range hint: `toast.warning` naming the team, request proceeds, generic logo still shown.

</frozen-after-approval>

## Code Map

- `src/pages/__tests__/predict-error-states.test.tsx` (315 lines, 11 tests) -- the harness to reuse: `vi.hoisted` `db` bag mocking `@/db/supabase` + `@posthog/react` + `sonner`; helpers `renderPage(entry)`, `chooseMethod(label)`, `chooseCustomMatchup()`, `fillField(id,value)`, `fillCustomForm()`, `submitPrediction()`, `panel()`, `pressRetry()`, fixtures `seriesFixture`/`conformingResult`/`httpError`/`fetchError`. Do not duplicate its error-state assertions.
- `src/lib/nba-utils.ts` -- `TEAM_ABBREVIATIONS` `:1-34` (30 teams + `Team A`/`Team B`); `getTeamAbbreviation` `:36-47` (falsy → `''`; exact dict hit; ≥2 words → initials if 2-3 chars; else 3-char truncation — no nickname map); `getRoundImportance` `:49-56` (branch 1 `includes('finals') && !includes('conf')` → 4; `'conf finals'` → 3; `'semifinals'` → 2; `'first round'` → 1; else 0).
- `src/lib/__tests__/nba-utils.test.ts` -- already pins BOS/DEN, abbrev passthrough, `LA`/`FM` initials, `CEL` truncation, blank → `''`, and pipeline-shaped round strings (`'East Conf Semifinals'` → 2). Neither bug is pinned. Extend this file; do not restate the existing cases.
- `src/lib/team-logos.ts` -- `normalizeTeamAlias` `:70-71` (lowercase, strip non-alphanumerics), 68-entry alias map `:7-67`, `getTeamLogo` `:85-94` (miss → `console.warn` + `undefined`), `resolveTeamLogoUrl` `:79-83` (`http(s)://` passthrough, else `import.meta.env.BASE_URL` prefix). No test file.
- `src/pages/HistoricalPage.tsx` -- `getRoundImportance(b.round) - getRoundImportance(a.round)` sort at `:47`; abbreviation badges `:165-166`; logo chain `:167-168`, `:262-266`. Only consumer of the ranking; not used in `InsightsPage.tsx` or `PredictPage.tsx`.
- `src/pages/PredictPage.tsx` (post-1.3) -- preload effect `:92-100` → `fetchAllGames()` `:120` + `loadSeriesById` `:139` (sets `seriesListFailed`/`seriesLoadFailed` `:129/:134/:151/:156/:163`); picker levels `:71`, decade `:685-688` (years hardcoded `:680`), year `:719-722`, `selectSeries` `:363-381`, custom button `:763-768`; reset effects `:103-111` and `:116-118`; `customInput` `:75` is never reset by any effect (only "New Prediction" `:1200-1205` and mount); custom ids `team_a`/`team_b` `:512/:536`, score grid `:556-632`; validation consumption `:185-193` (`validateCustomMatchup` error map + focus first invalid) and `:197` (`collectRangeHints` `:61-72` → `toast.warning`); method card label `:802` via `:358-361`, dialog option labels hardcoded `:854/:877/:900/:923`, description switch `:810-823`, details line `:1100`. jsdom friction: Radix Dialog portals (query from `screen`), `useSearchParams` needs a router, `getElementById().focus()` works, no asset imports.
- `src/lib/custom-matchup.ts` -- `validateCustomMatchup` `:42-55` returns `Record<fieldId, string>`; already tested in `src/lib/__tests__/custom-matchup.test.ts`.
- `src/lib/method-display.ts` `:7-20` + `src/types/__tests__/prediction-contract.test.ts` `:34-55,:91` -- the map is pinned, the page render is not; only `getByText('Logistic Regression')` in the 1.3 file incidentally proves one label.
- `src/hooks/use-mobile.tsx` -- `window.matchMedia('(max-width: 767px)')` `:13`, `change` listener `:14`, returns `!!isMobile`, no SSR guard. `src/components/ui/sidebar.tsx` consumes it via `useSidebar()` `:182`; `SidebarProvider` calls `useIsMobile()` `:74` and its mobile branch renders a `Sheet` (Radix portal). Testing the hook with `renderHook` (available in RTL 16.3.3, unused so far) avoids the whole Sidebar tree. `window.matchMedia` is not stubbed anywhere in the repo — `src/test/setup.ts` only does jest-dom + `cleanup`, so the stub belongs in the hook's own test file.
- `vitest.config.ts` -- `include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}']` `:17`, default `environment: 'node'` `:16`, `setupFiles` `:18`, merged from `vite.config.ts` (react + svgr plugins, `@` alias). Root `tests/` does not exist; keep new tests under `src/`.
- `supabase/migrations/00001_create_game_sevens_tables.sql` `:102-110` + `00007_backfill_missing_historical_series.sql` `:44-46` -- read-only evidence of the round strings production actually holds (`'NBA Finals'`, `'Conference Finals'`, `'Conference Semifinals'`), copied verbatim from `game_sevens.round` into `series.round`. Read-only: no migration is written or run by this story.
- `docs/CURRENT_DATA_MODEL.md`, `src/index.css`, `tailwind.config.js` -- untouched by this story.

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/nba-utils.ts` -- reorder `getRoundImportance`'s branches (Decision 1) so a bare `'Semifinals'` ranks 2 and `'Conference Finals'` ranks 3, keeping every already-correct input's value (Decision 3: no other function touched) -- the ranking is only right today for one exact string shape.
- [ ] `src/lib/team-logos.ts` -- export a side-effect-free predicate over `TEAM_LOGO_ALIAS_MAP` (same normalization as `:70-71`) so callers can ask "is this a recognized team?" without triggering `getTeamLogo`'s `console.warn`; behavior of `getTeamLogo`/`resolveTeamLogoUrl` unchanged.
- [ ] `src/lib/custom-matchup.ts` -- extend the non-blocking hint collector (alongside `collectRangeHints` `:61-72`) to report a non-empty custom team name the predicate rejects; stays hints, never the error map -- the request must still fire.
- [ ] `src/pages/PredictPage.tsx` -- surface that hint at the existing hint site `:197` with one `toast.warning` per unrecognized name, worded to name the team and say a placeholder logo is used (EXPERIENCE.md · Voice and Tone: never blames the user). No other page logic changes.
- [ ] `src/lib/__tests__/nba-utils.test.ts` (extend) -- the round-vocabulary row of the matrix against the fixed function (including `'East Conf Semifinals'` → 2 and `'Preseason'` → 0 staying put), plus the initials-vs-truncation boundary (`'Los Angeles'` → `'LA'`, `'Celtics'` → `'CEL'`) the catalog documents.
- [ ] `src/lib/__tests__/team-logos.test.ts` (new, node env) -- resolution table over `getTeamLogo`: full name, nickname, abbreviation, punctuation/case variants, unrecognized → `undefined` with `console.warn` asserted; the new predicate agrees with `getTeamLogo` on every alias entry and warns nowhere; plus `resolveTeamLogoUrl` passthrough and `BASE_URL` prefixing (stub `import.meta.env.BASE_URL`).
- [ ] `src/pages/__tests__/predict-flow-regression.test.tsx` (new, per-file jsdom) -- selection/preload/method-switching/new-prediction/name-warning rows of the matrix, reusing the 1.3 file's mock-and-helper approach (extract shared helpers into `src/pages/__tests__/helpers.ts` only if a direct copy would exceed a trivial duplication), and the render-level method-label assertions for all four slugs including the details line.
- [ ] `src/hooks/__tests__/use-mobile.test.tsx` (new, per-file jsdom) -- `renderHook` with a local `window.matchMedia` stub: true below 767px, false above, updates on a dispatched `change`, listener removed on unmount.
- [ ] `_bmad-output/implementation-artifacts/issue-3-failure-catalog.md` (new) -- written last, once the test names exist. One section per reproduced case: symptom, the code location that produces it today (`file:line`), disposition (pinned-correct / fixed-here / owned by an FR-8 error state), and the exact test name that proves it. Cross-reference the `deferred-work.md` entry instead of re-explaining it; mark the settled ones (Bayes label, contract drift) closed by Story 1.2 with their pinning test named; close with Decision 2's owner action item (branch protection on `master`, which this story does not touch).
- [ ] `deferred-work.md` -- append the two things this story leaves open, each with `source_spec: spec-1-4-...`: Decision 2's branch-protection owner action, and the `getTeamAbbreviation` truncation quirk that stays as-is (`'Nowhere FC'` → `'NF'`) now that only the logo path warns.

**Acceptance Criteria:**
- Given the suite after this story, when `npm test` runs, then every matrix row names at least one test added or extended by this story, and none of them is only the Story 1.3 error-state file.
- Given a picker option or method card for each of the four slugs, when the render-level label tests run, then each string equals `METHOD_LABELS[slug]` — so a label that drifts in either place turns the suite red rather than showing two different names for one method.
- Given an unrecognized custom team name, when the fan submits a valid grid, then the prediction still runs and the only feedback is the non-blocking warning — no field error, no blocked request.
- Given issue #3's recorded failure cases, when the catalog is read, then each case names its code location, its disposition, and the test or error state that owns it — with nothing assigned to Story 1.4 still missing from either list, and Decision 2's owner action item stated.
- Given the app-wide gate, when the story is finished, then `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all pass, `supabase/functions/**` is untouched, and no CI or GitHub setting was changed.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm test` -- expected: every existing case still green plus the new `nba-utils`, `team-logos`, `predict-flow-regression` and `use-mobile` files. Mutation-check each new file once: break the behavior it pins (swap a ranking branch, drop an alias entry, reset `customInput` on method change, remove the `change` listener) and confirm exactly the intended test goes red, then restore.
- `npm run lint` -- expected: Biome reports no errors (watch `noUndeclaredDependencies` — nothing new may be imported).
- `npm run typecheck` -- expected: `tsc -b` exits 0; the new `src/hooks/__tests__/` file is inside the checked graph.
- `npm run build` -- expected: succeeds and keeps the `/predictgame7/` asset prefix.

**Manual checks:**
- `/predictgame7/historical` on live data -- the seeded vocabulary is `Conference Finals` and `Conference Semifinals` (`supabase/migrations/00001_create_game_sevens_tables.sql:102-110`, copied into `series.round` by `00007_backfill_missing_historical_series.sql:44-46`), so the 2018 CLE-BOS and 2023 MIA-BOS conference finals must now sort directly under the `NBA Finals` rows instead of at the bottom with unrecognized rounds, and every `Conference Semifinals` row must keep its existing position.
- Custom mode with `'Nowhere FC'` as one name and a valid grid -- the prediction renders and exactly one warning toast appears, naming the team; blanking the other name still produces the inline field error with no request.
