---
title: 'Story 1.5 — Manual QA matrix + Epic 1 verification pass'
type: 'feature'
created: '2026-09-28'
status: 'review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7f19589687609b6e96f00be765976d9f5575c39e'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/qa-manual-checks-1-3.md'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 1.1–1.4 are done and merged, but everything the suite cannot see — mobile layout, touch targets, real network shapes, keyboard and screen-reader operability — has never been verified end to end. Two known gaps sit in `deferred-work.md` waiting for this story: the three primary Predict surfaces (Series picker, Method picker, Generate) are absent from the Tab ring entirely, and Story 1.3's two screen-reader checks were never run because no assistive tech is installed. Issue #3 stays open and Epic 1 cannot be accepted without the results matrix.

**Approach:** Two parts, one story. First fix the keyboard gap on `/predict` so the matrix passes on its merits rather than recording a known failure, and pin the fix with tests. Then drive the matrix in a real browser across the six surfaces × desktop/mobile and the historical/active/custom prediction axes, recording pass/fail per cell with reproducible evidence — and *file* rather than fake what this machine cannot do (assistive tech, real-device network), as owner-side rows with exact runnable steps.

## Boundaries & Constraints

**Always:** Each of the three Predict surfaces must land in the Tab ring as a real `<button>` reachable by Enter and Space, with no interactive element nested inside it. The visible composition of the three cards stays as shipped — same cards, same order, same labels; the custom-matchup grid keeps its place inside the Series card. Evidence bar per cell: a measured value, a verbatim captured string, or the exact reproduction step a reader could re-run. Verdict vocabulary carries over from `qa-manual-checks-1-3.md`: `[x]` pass, `[!]` failure or harness limit, `[ ]` not run. Test harness conventions carry over unchanged: `__tests__/`, explicit `import { describe, expect, it, vi } from 'vitest'`, `// @vitest-environment jsdom` per component file, `vi.hoisted` mock bag, `fireEvent` (not user-event), shared DOM plumbing via `src/pages/__tests__/helpers.tsx`. `npm run gate` green.

**Never:** Deploy or publish anything — no `gh-pages` publish, no `supabase functions deploy`, no push, no branch protection or GitHub setting change (all owner actions). No new dependencies (Biome's `noUndeclaredDependencies` rejects `@testing-library/user-event`). No changes to `supabase/functions/**`. No matrix cell marked `[x]` from inference, expectation, or a prior story's note — only from something observed in this run. Do not fix or re-plan what `deferred-work.md` already lands elsewhere: whole-site WCAG remediation (Story 5.2), the device/viewport matrix (Story 5.3), round-vocabulary map and `series.status` enumeration (Epic 2), D1 `deno check` CI gap, D2/D3. No `console`-based assertions. No accounts, betting-adjacent, or live-scoring surfaces. Do not touch analytics wiring.

## I/O & Edge-Case Matrix — the keyboard fix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tab ring on `/predict` | Fresh load, focus the address bar, press Tab repeatedly | Series trigger, Method trigger, and the Generate control each receive focus in DOM order, with a visible focus ring; the ring is a superset of today's `5 nav/menu + 14 inputs` | n/a |
| Keyboard selection | Focus Series trigger, press Enter, then Space | Dialog opens on both; arrow/Tab movement inside reaches the decade/year/series options and Custom Matchup; Escape closes and returns focus to the trigger | n/a |
| Custom grid reachability | Custom Matchup chosen; Tab from the Series trigger's neighbours | `team_a`, `team_b` and the twelve score inputs stay individually focusable and typeable; the trigger never swallows their keystrokes | n/a |
| Generate by keyboard | Both selections present | Control is focusable and `Enter`/`Space` fires exactly one `invoke` | n/a |
| Incomplete selection | No series or no method | Submit affordance is not operable (disabled `<button>`, not opacity-only), announces no request | Field/precondition feedback as shipped in Story 1.3 |
| Retry panel in the tab ring | Service failure showing | `ErrorRetryPanel`'s Retry stays the single tab stop inside the panel; the panel container keeps `tabIndex={-1}` and `role="status"` | n/a |

## Decisions (owner-confirmed at the planning checkpoint, 2026-09-28)

1. **Series trigger: narrow it, do not ARIA-it.** The `<DialogTrigger asChild>` currently wraps the whole card body (`PredictPage.tsx:479-668`), including the custom name inputs and the twelve score inputs. Narrow the trigger to the header block (logo row + label + "Click to choose series") as a real `<button>`; the custom-matchup grid stays a sibling inside the same `CardContent` so the card's visible composition does not change. `role="button"` + `tabIndex` on the existing div was rejected — inputs nested inside a button are hidden from assistive tech in browse mode, so it passes a tab-ring measurement while failing NFR-A1 in substance.
2. **Generate: add the focusable control, keep the card click.** A real `<Button>` becomes the keyboard-operable affordance; the card's existing click stays as shipped. The accidental-repredict footgun (the card stays clickable while a result shows) is therefore recorded, not removed, in this story — it is a product call, not an accessibility side effect, and lands in `deferred-work.md`.
3. **Same-class gaps off `/predict` are recorded and filed, not fixed here.** `HistoricalPage.tsx`'s clickable `<TableRow>` and `HomePage.tsx`'s mouse-only carousel overlays get `[!]` matrix cells with evidence and `deferred-work.md` entries naming Story 5.2 as where they land. Epic 1's fix scope stays the Predict flow.
4. **NFR-P1 is measured both ways.** A DevTools-throttled run against `npm run preview` fills the matrix cell, plus a `curl -w` timing probe of the deployed Edge Function so the server share and the client share are separated and the number is interpretable. The deployed function's currency is confirmed before any timing is recorded.
5. **Nothing is scrapped for accessibility reasons; original scope stands.** When the AT-only surface turned out to be exactly two *announcement* behaviors — the screen reader speaking the retry panel when it replaces a result in place, and a field error being read together with its label — the owner withdrew the idea of removing features to avoid the verification. The rest of the accessibility column (roles, accessible names, focus order, state) is proven in this session without assistive tech. The two announcement cells stay `[ ]` with an owner-side NVDA/VoiceOver run sheet, and Epic 1 is verified *conditionally*: the story goes to `review` with those cells open, alongside the epic's remaining owner actions (push, `handle-contact` deploy, `gh-pages` release, branch protection) listed as a closing checklist. Removing the retry panel or the per-field errors was rejected — they are FR-8 behavior shipped by Story 1.3, and a toast is announced less reliably than a `role="status"` live region, so scrapping would trade a verifiable behavior for an unverifiable one.

</frozen-after-approval>

## Code Map

- `src/pages/PredictPage.tsx` — the three surfaces and their exact extents: Series `<DialogTrigger asChild>` → `CardContent` `:478-668` (hint `<p>` "Click to choose series" `:525`; custom name inputs `:542`/`:567`; score inputs `:613`/`:633`; `stopPropagation` guards `:531`/`:609`). Method `<DialogTrigger asChild>` → `CardContent` `:829-861` — text and logos only, nothing interactive nested, so it converts to a real `<button>` directly. Generate `<Card onClick>` `:970-1113` (disabled faked by `opacity-50 cursor-not-allowed` `:971`; `CardDescription` copy `:986`; result block with the details `<Button>` `:1095`; `ErrorRetryPanel` site `:995-999`). Already-real `<button>`s — do not touch: decade `:712`, Go-Back `:729`/`:767`, year `:746`, series rows `:421`, Custom Matchup `:791`, the four dialog method options `:873`/`:896`/`:919`/`:942`, "New Prediction" `:1228`.
- `src/components/ui/card.tsx` `:9-16`, `:56-61` — `Card`/`CardContent` are `forwardRef` divs spreading `{...props}`. Root cause: Radix `DialogTrigger asChild` merges `onClick`/`aria-expanded`/`data-state` onto that div and supplies no `role`/`tabIndex`, so the trigger is unfocusable.
- `src/components/ui/button.tsx` `:37-54` — house `Button`: `forwardRef` + `asChild` through Radix `Slot`. Correct in-repo usage of the pattern: `src/components/Layouts.tsx:61-66`.
- `src/components/common/ErrorRetryPanel.tsx` `:30`, `:36-37`, `:48-51` — the shipped focus/announcement pattern to stay consistent with (`role="status"`, container `tabIndex={-1}` focused on mount, `<Button type="button">` Retry, `stopPropagation`).
- `src/pages/__tests__/helpers.tsx` `:83-93`, `:109-111` — the coupling points: `chooseMethod`/`chooseCustomMatchup`/`submitPrediction` click the three hint `<p>` texts (`getByText('Click to choose method')`, `'Click to choose series'`, `'Click to generate prediction'`). Any element change must keep those text nodes reachable from the same query or update these helpers once, centrally.
- `src/pages/__tests__/predict-flow-regression.test.tsx` (`:65`,`:80`,`:225`,`:240`,`:252`,`:269`,`:273-274`,`:301`,`:316`,`:322`) and `predict-error-states.test.tsx` (`:150`,`:158`,`:225-228`,`:273`) — the ~15 assertions that fire through those helpers or query the trigger surfaces; the method option's nested "Details" `<Link>` (`PredictPage.tsx:887`) is role-queried at `:273-274` and must stay nested in the option button.
- `src/pages/HistoricalPage.tsx` `:172-189` — clickable `<TableRow onClick>`; `src/pages/HomePage.tsx` `:234-241` — mouse-only carousel overlays; `HomePage.tsx` contact form (real inputs + submit) is the sixth surface.
- `src/routes.tsx:17-48` — five routes (Home, Predict, Historical, Insights, Maths). The canonical six surfaces are Home, Predict, Archive, Insights, Maths, Contact (`epics.md:577`, `prd.md:329`); Contact is the form inside `HomePage.tsx`. `CurrentGame7sPage.tsx`, `InsightsPage.tsx`, `MathsPage.tsx`, `NotFound.tsx`, `SamplePage.tsx` are read-only or static.
- `_bmad-output/implementation-artifacts/qa-manual-checks-1-3.md` — Story 1.3's checks are now essentially all driven; reuse its verdict vocabulary, its §5 owner-run-sheet format, and its measured facts (tab ring = 5 nav/menu + 14 inputs; the archive is one mount-time `/rest/v1/series` request). Do not re-derive its checks. Remaining there: the literal DevTools-blocked network shape (a formality) and "a preloaded selection survives".
- `_bmad-output/implementation-artifacts/deferred-work.md` — `:16` Bayes label to be "verified fixed in Story 1.5's QA matrix"; `:25` (D1) "or as a Story 1.5 QA-matrix prerequisite"; `:66-70` 1.3's four checks + branch protection; `:75-76` 1.4's `'Nowhere FC'` check; `:105-106` live-function shape probe as "a Story 1.5 manual step"; `:110-115` `handle-contact` undeployed and NFR-P1 measured only after redeploy; `:120-121` verify data-shape claims against the database, never a migration; `:126-136` keyboard/NFR-A1, the AT pass, the one-request archive finding, PostHog dev traffic.
- `_bmad-output/implementation-artifacts/issue-3-failure-catalog.md` — the traceability artifact issue #3 is closed by; Story 1.5's matrix is the last missing evidence.
- **Unchanged by this story:** `supabase/functions/**`, `.github/workflows/**`, `vitest.config.ts`, `package.json` (no dependency or version change — release/version bumps are owner-gated), `src/lib/**`, `src/types/**`, `docs/**`.

## Tasks & Acceptance

**Execution:**
- [x] `src/pages/PredictPage.tsx` — apply Decision 1 and Decision 2: the Series trigger becomes a real `<button>` narrowed to the card's header block (custom grid stays a sibling inside the same `CardContent`), the Method trigger becomes a real `<button>`, and a focusable `<Button>` becomes the Generate affordance while the card's existing click stays. Keep each card's visible composition, the hint copy, and the four method options' nested "Details" `<Link>`s intact.
- [x] `src/pages/__tests__/helpers.tsx` — retarget the three click helpers to the accessible element once, centrally (single source for both suites); do not weaken any assertion while doing it.
- [x] `src/pages/__tests__/predict-keyboard.test.tsx` (new, per-file jsdom) — pin the keyboard matrix rows above: each surface resolves via `getByRole('button', { name })`, Enter and Space each activate, the custom grid's inputs stay individually focusable and typed into, and an incomplete selection leaves the submit control non-operable. Mutation-check it: reverting a surface to the unfocusable div must redden it.
- [x] `_bmad-output/implementation-artifacts/qa-matrix-1-5.md` (new) — the results matrix: rows = the six surfaces crossed with the historical/active/custom prediction axes where applicable, columns = desktop / mobile / keyboard / screen-reader. One verdict per cell plus an evidence line and a "how to re-run" line. Preceded by a short setup section (build + `npm run preview`, viewport/emulation settings, the data-shape facts to verify against the database first) and followed by an owner-only run sheet for every `[ ]` cell in the same style as `qa-manual-checks-1-3.md` §5. Must include: the NFR-P1 spot-check cell with its stated measurement method and the number, the `?series=` preload and DevTools-blocked-network cells `qa-manual-checks-1-3.md` could not close, 1.4's `'Nowhere FC'` single-warning check (`spec-1-4:156`), the live-function result-shape probe (`deferred-work.md:105`), the Bayes-label verification `deferred-work.md:16` owes, and the live Bayes/Elo path re-run `spec-1-2:102` left as worth doing.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — append one entry per matrix cell this story files rather than fixes, each naming where it lands (Story 5.2 / 5.3 / Epic 2 / owner action), with the evidence. Extend the existing keyboard and AT entries with the outcome rather than duplicating. Decision 3 and Decision 2 each guarantee at least one entry: `HistoricalPage`'s clickable rows and `HomePage`'s carousel overlays (→ Story 5.2), and the accidental-repredict click on the result card (product call, owner decides).
- [x] `_bmad-output/implementation-artifacts/issue-3-failure-catalog.md` — add the matrix as the closing evidence line so issue #3 is provably answerable.
- [x] Spec bookkeeping: fill `## Implementation Notes` and `## Spec Change Log`; set this spec's `status` and `sprint-status.yaml`'s `1-5-manual-qa-matrix-epic-verification-pass` per the workflow's own gates. Do not set `epic-1: done` — the retrospective is the owner's call.

**Acceptance Criteria:**
- Given the fixed `/predict`, when the tab ring is re-measured in a real browser, then it is a strict superset of the previous `5 nav/menu + 14 inputs`, contains the Series, Method and Generate controls, and each activates with Enter and Space — pinned by `predict-keyboard.test.tsx`, not only by observation.
- Given the matrix artifact, when it is read, then every cell carries a verdict and evidence a reader could re-run, no cell is marked pass on inference, and the six surfaces × desktop/mobile plus the historical/active/custom axes are all accounted for.
- Given a cell that cannot be run from this session, when the matrix records it, then it is `[ ]` with exact owner-side steps in the run sheet and a matching `deferred-work.md` entry naming where it lands — never `[x]`.
- Given every `[!]` the run produces, when the story closes, then each one is either fixed in this story or filed with a named landing story and its evidence.
- Given NFR-P1, when the spot-check cell is filled, then it states the measurement method chosen, the observed number(s), and how they compare to the provisional 3s P95 — including whether the deployed function was confirmed current first.
- Given the app-wide gate, when the story is finished, then `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass, and no deploy, publish, push, `supabase/functions/**` edit, or GitHub setting change was performed.

## Implementation Notes

**What shipped (code):**
- `src/pages/PredictPage.tsx` — Decision 1 at `:487-540`: `<DialogTrigger asChild>` now wraps `<Button type="button" variant="ghost" className="group flex h-auto w-full cursor-pointer … text-left … hover:bg-muted/50">` containing only the logo row, the series label and the "Click to choose series" hint; the custom-matchup grid moved out to a sibling `<div className="grid grid-cols-2 gap-2 pt-2" onClick={stopPropagation}>` at `:542-543` inside the same `CardContent`, so the card's visible composition is unchanged and no input is nested in a button. Decision 1 again for Method at `:840-879`. Decision 2 for Generate: a real `<Button type="button" variant="ghost" disabled={!selectedSeries || !selectedMethod || loading}>` labeled "Select series and method first" / "Click to generate prediction", with `stopPropagation` so the card's own click stays a second, separate affordance. `role="button"` was not used anywhere — see the rejected alternative below.
- `src/pages/__tests__/helpers.tsx` — the three click helpers retargeted to `getByRole('button', { name: … })` once, centrally; a private `settlePickerClose()` now awaits dialog removal. No assertion weakened or removed.
- `src/pages/__tests__/predict-keyboard.test.tsx` (new, 7 tests) — the six frozen matrix rows: real `<button>` triggers present in the ring in DOM order with `aria-haspopup="dialog"`; Enter and Space open both pickers; Escape returns focus to the trigger; the 14 custom inputs individually focusable and typeable with `trigger.contains(input) === false`; Generate Enter→exactly one invoke and Space→one invoke while the card click still predicts; incomplete selection = a disabled `<button>` named "Select series and method first", outside the ring, no invoke, no `toast.error`; Retry the only tab stop inside `role="status"` with `tabindex="-1"` on the panel.
- Docs: `qa-matrix-1-5.md` (new — 9 matrix rows × 4 columns, Epic 1 acceptance pass §3, NFR-P1 §4, harness near-misses §5, owner run sheet §6, findings register §7); `deferred-work.md` (keyboard entry settled, AT entry carried to the owner, live-shape-probe entry updated, +11 new F1–F11 entries); `issue-3-failure-catalog.md` §10 (the matrix as closing evidence).

**Mutation check, run and reported honestly:** `tabIndex={-1}` added to the Series trigger (the closest reversible stand-in for the old unfocusable `div`) reddens exactly **3 of the 7** new tests — the ring/DOM-order test, the Enter/Space/Escape picker test, and the custom-grid-nested-inputs test — while the Method picker, Generate, disabled-submit and Retry tests stay green, i.e. the suite discriminates per surface rather than failing globally. File restored byte-identically (`cmp`) and 7/7 green again. One limit worth naming: **the Enter/Space handlers are native `<button>` behavior, so no mutation of a handler can redden those tests** — they pin that the element accepting the key is the trigger, which is exactly the thing that was broken before. Gate at the final state: lint clean, `tsc -b` clean, **113 tests / 11 files** green, build with the `/predictgame7/` prefix (was 106 / 10 pre-story).

**Evidence bar held:** every `[x]` in the matrix names a measured value (tab-ring counts: 7 stops @1440 / 3 @390 fresh; **22 = 5 nav + 14 inputs + Series + Method + Generate** with a full custom selection), a verbatim string ("Couldn't load the series list.", "Series not found", "Team name is required", "Bayes Method", NF 64.11 / MIA 35.89, `computation_time_ms: 3`), or the exact reproduction step. No cell rests on a prior story's note.

**Matrix results in one line:** Predict passes on all four columns for the historical and custom axes; the **active axis is `[!]` because 178/178 series rows are `status: 'historical'`** — no active series exists to select, and defining the enumeration is Epic 2's, not this story's. Home, Historical and the unknown-path route carry `[!]` findings that are all filed (F2/F3/F5/F6). Insights' numbers are `[!]` stale-cache evidence for Story 2.5. Maths is clean.

**Rejected alternative, recorded so nobody re-tries it:** `role="button"` + `tabIndex={0}` on the existing `CardContent` divs. It passes a tab-ring measurement and fails NFR-A1 in substance — the 14 custom inputs live inside the Series card, and inputs nested inside a button are hidden from assistive tech in browse mode. That is a false pass, and Story 1.5's own evidence rule forbids it.

**Honest limits of this run (all recorded in the artifact, not worked around):** no assistive tech installed, so the two announcement cells are `[ ]` with a §6 run sheet; `take_screenshot` was unavailable in this browser, so purely visual verdicts are owner-side (§6.4); no DevTools throttling, so NFR-P1's percentile claim is not made; three observations that first looked like defects were traced to harness artifacts (stale `[role=dialog]` nodes under `document.hidden`, `getEntriesByType('resource')` under-reporting, a 1.0:1 "contrast failure" on an `opacity:0` hover label) and are documented as measurement notes in §5 rather than filed as findings.

## Spec Change Log

1. **Decision 4's DevTools-throttled run could not be executed here.** No throttling control exists in this harness, so NFR-P1 is reported as the two halves that *can* be measured — 20 live-server probes (`computation_time_ms` 1–5 ms; wall min 322 / median 496 / max 1324 ms) and three in-browser client runs (2151 / 2165 ms desktop custom, 4545 ms mobile historical) — with the throttled half `[ ]` and its own owner run sheet (§6.3). **No P95 is claimed from 20 samples**, which is a narrower statement than the provisional 3s P95 comparison the decision implied. The frozen decision is not weakened; its method was partly unavailable, so it is split rather than silently dropped.
2. **`performance.getEntriesByType('resource')` is not usable as the archive-request proof in a backgrounded tab,** which the `## Verification` browser-measurement line assumed. It stayed at one entry while a wrapped `fetch` counted two completed requests. The `?series=` / blocked-network cells are therefore evidenced by the wrapper's counter plus response status; the "one mount-time archive request" fact carries over from `deferred-work.md`'s measurement rather than being re-derived here.
3. **The active-series axis was expected to be drivable and is not.** The Code Map and matrix rows assumed a `current`/active path could be selected; the database holds 178 `status: 'historical'` rows and none active. Recorded as `[!]` with the owner's two closure options (§6.5) and a `deferred-work.md` F9 entry landing in 2.7. No code changed to compensate — faking an active row would have pre-empted Epic 2's enumeration.
4. **`epic-1` stays `in-progress` and the story goes to `review`, not `done`.** Per the task's own instruction, the retrospective is the owner's call, and Decision 5 makes Epic 1's acceptance *conditional* on §6.1–§6.3, which no agent here can close.

## Epic 1 closing checklist (owner-only, from Decision 5)

Open in the order that unblocks the most:

1. Run `qa-matrix-1-5.md` §6.1 and §6.2 with NVDA or VoiceOver — the two announcement cells. This is the condition on Epic 1's NFR-A1 row and on the epic's acceptance.
2. Run §6.3 (DevTools-throttled latency, 20+ samples) so NFR-P1 gets a real percentile instead of a median.
3. Decide F1 (clicking a completed result re-fires a prediction): accept it in EXPERIENCE.md or make the result card non-interactive.
4. Push `master` (7+ commits; the first push exercises the `pre-push` gate hook). Then, in any order: `supabase functions deploy handle-contact` (the four hardening fixes are inert until then), the `gh-pages` 0.2.4 release with its `docs/CHANGELOG.md` entry in the same commit, and branch protection on `master` (D-Decision 2 from Story 1.4 — the gate currently reports, it does not block).
5. §6.5: seed one `status: 'active'` series for QA, or accept the active axis as blocked on 2.7.
6. §6.4: the visual pass that no headless harness can do (focus ring on the 20×20 carousel dots, 16×16 dialog close, 20px Generate control at 390).
7. Run `bmad-retrospective` for epic-1 — the story stays at `review` until the owner accepts the epic.

## Review Triage Log

## Design Notes

Verdict vocabulary and evidence rule are inherited from `qa-manual-checks-1-3.md` so the two artifacts read as one QA program. Cell skeleton:

```
| Surface × axis | desktop | mobile | keyboard | screen reader |
| Predict / custom | [x] MIA 58.9% / BOS 41.1%, 480ms | [!] 390px: score grid overflows | [x] test: keyboard-ring | [ ] NVDA run, owner |
```

`[!]` and `[ ]` are results, not failures of the story — an honest incomplete matrix closes Epic 1; a fabricated complete one does not.

## Verification

**Commands:**
- `npm run gate` -- expected: lint, `tsc -b`, Vitest, and build all green, build keeping the `/predictgame7/` asset prefix.
- `npm test` -- expected: the pre-story 106 tests plus the new keyboard suite, all passing; each new file mutation-checked once (revert a surface to the unfocusable div, drop the Enter/Space handler) with exactly the intended test reddening, then restored.
- `npm run build && npm run preview` -- the matrix is driven against the production build at `http://localhost:4173/predictgame7/`, never the dev server.
- Browser measurement: re-run the tab-ring probe (`document.querySelectorAll` over focusable selectors, disabled excluded) on `/predict` before and after, and capture `performance.getEntriesByType('resource')` to prove the archive is still one mount-time request.

**Manual checks:**
- The matrix's own cells are the manual verification for this story; every `[x]` must name the observation that earned it.
