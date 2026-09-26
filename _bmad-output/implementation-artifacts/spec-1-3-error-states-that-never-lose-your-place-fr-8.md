---
title: 'Story 1.3 — Error states that never lose your place (FR-8)'
type: 'feature'
created: '2026-09-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7beba604566f0d38c5999f645bd73ad6713e9188'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/EXPERIENCE.md'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every Predict failure today collapses into one sonner toast: the Edge Function's `{"error":"…"}` body is shown as raw JSON (`PredictPage.tsx:243-244`), a dropped network connection reads as `"Failed to fetch"`, a `200` with `win_probability_a: null` renders `undefined%`, and if both `data` and `error` come back nullish nothing says anything at all. Validation is submit-time toasts that never point at the offending field, and the series list fails silently on mount (`:105-107`). Issue #3 is exactly this surface.

**Approach:** One pure classifier turns anything the transport or function can return into a named error class — invalid input, service failure, or a non-conforming success body — and the page renders each class the way the UX spines specify: inline field errors for input, an in-place retry panel for service failures. Selections already survive failures (no `setState` in any catch); the job is to keep it that way and make retry re-fire the same attempt.

## Boundaries & Constraints

**Always:** Preserve `selectedSeries`, `selectedMethod` and every entered score across a failure and a retry. Copy names what failed and what happens next; never blames the user or the network (EXPERIENCE.md · Voice and Tone). Retry panel = `muted` fill, `rounded-lg`, `role="status"`, focus moves to the panel, Retry is its first tab stop (EXPERIENCE.md · Accessibility Floor). Small error copy uses `destructive-text #B91C1C`; panel body copy uses `on-muted #595959` (`destructive #DC3C3C` fails AA as small text). All four methods keep producing identical results. Run lint, typecheck, test and build before completion.

**Never:** Change prediction algorithms, the database schema, RLS, or guarded accounts/betting/live-scoring surfaces. No new state or data-fetching library — local state + effects stays (AD-9). Do not create `src/lib/analytics/` or rename/add PostHog events: `src/lib/analytics/` is Story 3.1's port and addendum §A.1 freezes the ten event names; new failure sites use the existing `usePostHog()` → `captureException` call pattern. Do not touch the contact form (`HomePage.tsx:126-149`, Story 3.3), `MathsPage.tsx`, or `AuthContext.tsx`/`RouteGuard` (AD-9 dead modules). Do not deploy anything.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Function rejects the request | `400 {"error":"Team names are required"}` / `500 {"error":msg}` | Panel replaces the result region; the panel line is the server's `error` string, not JSON | Parse `error.context` body as the `{error: string}` envelope; panel offers Retry |
| Transport failure | Offline / DNS drop → `FunctionsFetchError`, whose `context` is **not** a `Response` | Panel: service-unreachable copy, distinct from the two rows above | Never `await context.text()` unguarded (`:243` does); classify on `error.name`/`context` shape |
| Non-conforming success | `200` with `win_probability_a: null` (missing scores, `index.ts:329-330`), a body that is not a `PredictionResult`, or both `data` and `error` nullish | Panel (service class) — never `undefined%`, never a silent stop | Runtime shape check at the boundary before `setResult` |
| Invalid custom input at submit | Blank team name, blank score, non-integer, or negative | Inline error under the named field, wired by `aria-describedby`; the request never leaves the browser | Validate before invoke. A score outside 50–200 stays a non-blocking `toast.warning` hint, not a field error |
| Retry | Any service failure above, user presses Retry | Same attempt re-fires with the same series, method and scores; success swaps the panel for the result | Second failure re-renders the panel — never a second spinner loop, never cleared inputs |
| Series list on mount | `supabase.from('series')` errors (`:105-107`) | Series picker explains itself instead of showing an empty list | Panel with Retry replaces the picker body; Retry re-runs the fetch and keeps `selectedSeries`/`selectedMethod`/`customInput` |
| Preload from a broken `?series=` link | Unreadable id, or the query errors (`:124`, `:126-129`) | A missing row keeps the existing "Series not found" toast; a failed query is a service failure | Query failure → panel; a genuinely absent row is not retryable, so it stays a toast (the 404 treatment is Story 4.1's) |

## Decisions (owner-confirmed at the planning checkpoint, 2026-09-26)

1. **No form-framework migration.** The custom-matchup form keeps its existing controlled `customInput` state; invalid input is reported through a per-field error map produced by a pure validator at submit. `react-hook-form` + zod stays the standard for genuinely new forms, so DESIGN.md/EXPERIENCE.md's "RHF + zod" line is met by the Contact rebuild (Story 3.3), not here. Deferred-work **D3** (the `any`-built request path, twelve `undefined as any`) therefore stays open on purpose.
2. **Panel reach = all of Predict's own fetch states** — the result region, the mount-time series list, and the `?series=` preload's query failure. Other pages are untouched; a genuinely missing series row stays a toast (not retryable).
3. **Client-side only.** `predict-game-7` is not modified and nothing is deployed; its silent-`200` paths are caught by the result shape check. Deferred-work **D2** stays open.
4. **Both custom team names become required**, validated inline before submit. The function's `400 "Team names are required"` becomes reachable from the app only via a non-browser client; the placeholder *logo* fallback is unchanged.

</frozen-after-approval>

## Code Map

- `src/pages/PredictPage.tsx` (1072 lines) -- the whole story's UI. Failure sites: `fetchAllGames` catch `:105-107` (console only); `loadSeriesById` `:124`, `:126-129`; `handlePredict` `:132-269` — guard toast `:134`, `validateScores` `:144-173` (toasts at `:151/:159/:164/:169`), custom fallbacks `:183-184`, series-shape toasts `:194/:209/:233`, invoke + `await error?.context?.text()` `:238-245`, `JSON.parse(data)` `:248`, catch `:262-266`. Render gates: `{!showDetails ? …}` `:353`, Predict Card `:820-938` with `loading ? spinner : result ? summary : placeholder` at `:840-936`, result card + New Prediction `:940-1069`. Custom inputs: team names `:439-445`/`:458-464`, twelve score `Input`s `:493-512`. **No catch block sets state today — keep it that way.**
- `src/lib/error-envelope.ts` (new, kebab-case per AD-9) -- pure, framework-free classifier: envelope parse, transport-vs-HTTP discrimination, `PredictionResult` shape check. Everything falsifiable gets tested here, not in the page.
- `src/components/common/ErrorRetryPanel.tsx` (new) -- PascalCase + default export, matching `src/components/common/PageMeta.tsx`. Props: message, onRetry, optional heading. Owns `role="status"`, `tabIndex={-1}`, focus-on-mount, `aria-hidden` icon.
- `src/lib/custom-matchup.ts` (new) -- pure submit-time validator over `customInput`: both team names required (Decision 4), six score pairs present, integer, non-negative; returns `Record<string, string>` keyed by the field ids the inputs already render, so the page owns no validation logic of its own. The `seriesInput: any` request scaffolding at `:199-231` stays as-is (Decision 1).
- `src/index.css` `:24-28`, `tailwind.config.js` `:46-52` -- add the two DESIGN.md · Colors tokens as HSL: `--destructive-text` (`#B91C1C` ≈ `0 74% 42%`), `--on-muted` (`#595959` = `0 0% 35%`), and their Tailwind mappings. `--destructive` already equals DESIGN's `#DC3C3C`. Do **not** change `--muted-foreground` app-wide — that owner decision lands with Story 5.2's AA pass.
- `supabase/functions/predict-game-7/index.ts` -- read-only reference (Decision 3: not modified): `corsHeaders` `:10-13`, `400` `:299-304`, fall-through `else` `:306/:321-325`, NaN math `:329-330`, swallowed logo error `:343-350`, `500` `:370-375`.
- `node_modules/@supabase/functions-js/dist/module/FunctionsClient.js` `:259-296`, `types.js` -- `FunctionsFetchError` / `FunctionsRelayError` / `FunctionsHttpError` all extend `FunctionsError { name, message, context }`; `context` is the raw `Response` **except** for fetch errors. Version pinned `@supabase/supabase-js@2.103.1`.
- `_bmad-output/planning-artifacts/architecture/architecture-predictgame7-2026-09-23/ARCHITECTURE-SPINE.md` AD-9 `:108-112` -- EXPERIENCE.md · Retry panel directs: "Add a companion note to AD-9 at implementation." One appended sentence recording that a re-attemptable region renders the retry panel and sonner stays for one-off mutations.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/error-envelope.ts`, `src/lib/__tests__/error-envelope.test.ts` -- classifier + pure unit tests over the matrix's service rows, including the `FunctionsFetchError` shape that breaks `:243` today.
- [x] `src/lib/custom-matchup.ts`, `src/lib/__tests__/custom-matchup.test.ts` -- validator + field-error map, tested over the invalid-input row. A score of `0` counts as missing (it never occurs in a played NBA game, so `:149-150` is not a live defect); out-of-50–200 stays a non-blocking `toast.warning` hint, not an error.
- [x] `src/components/common/ErrorRetryPanel.tsx` -- panel per DESIGN.md · Components + Accessibility Floor.
- [x] `src/index.css`, `tailwind.config.js` -- the two new tokens.
- [x] `src/pages/PredictPage.tsx` -- classify at every failure site; inline field errors on the custom inputs (names + scores) with `aria-invalid`/`aria-describedby`; panels around the result region, the series picker body, and the preload failure; `posthog?.captureException` at new failure sites. `customInput`'s twelve `undefined as any` fields and the `seriesInput: any` request build stay untouched (Decision 1).
- [x] `ARCHITECTURE-SPINE.md` AD-9 -- append the companion note (one sentence; never renumber or rewrite an existing AD).
- [x] `src/pages/__tests__/predict-error-states.test.tsx` -- 11 page-level tests (per-file jsdom, `MemoryRouter`; `supabase`/`@posthog/react`/`sonner` mocked) closing the Matrix Test Audit: every row of the frozen I/O matrix is asserted through the real component, not only through the classifier.

**Acceptance Criteria:**
- Given a service failure of any of the three classes, when it lands, then the visible copy differs per class, no raw JSON appears, and Retry re-fires the same attempt with the same series, method and scores.
- Given invalid custom-matchup input, when the fan submits, then no network request is made and each offending field carries a visible error reachable by its `aria-describedby`.
- Given a blank team name in custom mode, when the fan submits, then the name field is flagged inline and the `'Team A'`/`'Team B'` placeholder fallback at `:183-184` no longer silently supplies a request (Decision 4).
- Given a screen-reader user, when a failure replaces the result region, then the swap is announced (`role="status"`), focus lands on the replacement container, and Retry is the first tab stop inside it.
- Given the app-wide gate, when the story is finished, then `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all pass, and the four methods still produce the same predictions as before the change.

## Design Notes

Classifier shape — one function, three outputs, no React:

```ts
type Failure =
  | { kind: 'invalid-input'; fields: Record<string, string> }
  | { kind: 'service'; message: string; status?: number };
classifyInvokeResult(error, data): Failure | null
```

The `service` message prefers the server's own `{error}` string; a body that is not the envelope, or a `200` that fails the `PredictionResult` shape check, gets the service class with copy that names the prediction service rather than the network. The `null` probability case matters most: it is a `200`, so nothing in the current code path can catch it — `setResult(parsedData)` at `:249` accepts it and `:1000` prints `undefined%`.

Two calls made here rather than asked: the out-of-50–200 range stays a non-blocking `toast.warning` rather than becoming an error, and the compact `h-8` score inputs keep their size — DESIGN.md's ≥44×44 rule is met by every *new* control (Retry, the picker's action), while resizing the twelve-entry grid is a layout change belonging to Story 1.5's QA matrix and 5.3's responsiveness pass, not an error-state fix. No new dependencies: Decision 1 leaves react-hook-form and zod unused here.

The "select both a series and a method" guard at `:134` stays a toast — it is a precondition on the whole flow, not a field error, and both pickers already render "Not selected".

## Implementation Notes

## Spec Change Log

- 2026-09-26 (implementation): built as specced. Two small fidelity notes, neither changing frozen intent: (1) `classifyInvokeResult` is typed `Promise<ServiceFailure | null>` (an `Extract` of the service arm) because the classifier only ever produces service failures — the `invalid-input` arm is produced by the page via `validateCustomMatchup`, matching the Design Notes' three-output shape; (2) added one component test beyond the listed files (`src/lib/__tests__/error-retry-panel.test.tsx`, per-file jsdom) to prove the Accessibility Floor AC (announced `role="status"`, focus on the container at mount, Retry as first and only tab stop). Verification gate ran green: `npm run lint` (Biome, 95 files), `npm run typecheck` (`tsc -b`), `npm test` (49 tests, 6 files), `npm run build` (keeps the `/predictgame7/` asset prefix; `text-on-muted`/`text-destructive-text` confirmed in the emitted CSS). Four spec-listed manual browser checks (offline transport panel + keyboard Retry, blocked-function 400 string, blank-score inline errors, blocked series query) remain for owner QA — no deploy performed.
- 2026-09-26 (review pass): the Matrix Test Audit found rows 4-7 covered only at the classifier level, so `src/pages/__tests__/predict-error-states.test.tsx` (per-file jsdom; `supabase`/`@posthog/react`/`sonner` mocked, `MemoryRouter`) was added — 11 page tests over every matrix row. The three-layer review then produced 25 findings; 10 were patched (see the Review Triage Log rows 1-9), 3 deferred, 12 rejected. Largest of the patches: the preload panel used to mask any result fetched after it (row 1), and a `text/plain` `200` reached `setResult` as a raw string (row 3). Nothing in the frozen block changed; the Edge Function is still untouched and nothing was deployed. Re-run green: lint (96 files), `tsc -b`, `npm test` (61 tests, 7 files), build with the `/predictgame7/` prefix.

## Review Triage Log

Three layers ran against the staged diff (blind hunter, edge-case hunter, verification gap). 25 findings; 10 patched, 3 deferred, 12 rejected. No `intent_gap` or `bad_spec`, so no loopback.

| # | Finding (layer) | Location | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | `seriesLoadFailed` is never cleared on a new selection, so the preload panel masks a later result (blind, edge, verification — one root cause) | `PredictPage.tsx:103` | high | The reset effect cleared `result`/`showDetails`/`predictFailure` only, and the result gate tests `seriesLoadFailed` ahead of `result`, so after a failed `?series=` a hand-picked prediction rendered "Couldn't load this series." forever. **Patched**: the effect now clears the flag; test "stops masking the result region after a failed preload…" fails without it (mutation-checked). |
| 2 | Preload Retry clears the flag before checking the param — silent no-op (blind, edge) | `PredictPage.tsx:975` | medium | Reachable only if the param disappears under the panel, but the ordering was wrong either way. **Patched**: return before clearing when there is no id to re-fetch. |
| 3 | `setResult` receives the raw `invoke` body, so a string `200` renders `undefined%` (edge) | `PredictPage.tsx:300` | medium | Real regression against the pre-change `:248` behavior: the classifier parses a string internally to validate it, then the page used `data` untouched. **Patched**: one shared `parseInvokeBody` now decodes for both; test "renders a string response body as a result…". |
| 4 | Invalid submit is silent to a screen reader — no announcement, no focus (blind) | `PredictPage.tsx:186` | medium | Inline `aria-invalid`/`aria-describedby` gives a path per field, but nothing says the submit failed, and the spine forbids the toast on this path. WCAG 4.1.3. **Patched**: focus moves to the first invalid field (reading order), which announces its label + description; asserted in the invalid-input test. |
| 5 | Field errors survive a method/series change and "New Prediction" (edge) | `PredictPage.tsx:68` | low | Stale red borders before any submit. **Patched**: a second effect retires them on selection/method change only — EXPERIENCE.md clears them on the next valid submit, not per keystroke. |
| 6 | `METHOD_SLUGS`/`CONFIDENCE_LEVELS` duplicate the contract domain as untyped arrays (blind, verification) | `error-envelope.ts:47` | medium | A renamed contract slug would silently reject every healthy `200` with nothing failing. **Patched**: method membership now reads `METHOD_LABELS` (`Record<MethodSlug, string>`, exhaustive by construction — AD-2), confidence is `Record<ConfidenceLevel, true>`; verification-gap 2's mutation (drop a slug) is now caught by construction and by the four-slug test. |
| 7 | No test feeds a conforming `200`, so "success swaps the panel for the result" is unproven (verification, blind) | `predict-error-states.test.tsx` | medium | True as filed: every case asserted a failure, and deleting `setPredictFailure(null)` at `:276` left the suite green. **Patched**: two success tests added (object body; string body). AC 5's parity half is evidence-by-boundary — no algorithm or function file is in this diff (Decision 3), so the client change cannot move a prediction; the new tests prove the payload renders. |
| 8 | Page-test probability fixture uses a 0-1 scale the contract does not send (blind) | `predict-error-states.test.tsx:70` | low | `contract.ts:57` documents 0-100; the unit fixture already used 61.25. **Patched**: the page fixture now matches and the test asserts `61.25%` renders as sent. |
| 9 | `invalidInputFailure` is a dead export; the "Retry re-fires exactly these values" comment overstates the snapshot (blind) | `error-envelope.ts:181`, `PredictPage.tsx:176` | low | Confirmed unused (only its own test called it). **Patched**: deleted with its test; the comment now says what the code does (the attempt is live state, and any change clears the panel first). |
| 10 | Three parallel validation systems; the series path keeps its own rules and copy (blind) | `PredictPage.tsx:211` | low | Real, and intentional: Decision 1 pinned the series path, and EXPERIENCE.md keeps those guards as toasts. **Deferred** — folded under D3, which already owns that request path. |
| 11 | `form-border #949494` was not adopted, so the touched inputs keep 1.3:1 borders (blind) | `index.css:36`, `tailwind.config.js` | medium | Pre-existing (`--input` is shadcn's, and every other form in the app shares it), not caused here. **Deferred** to Story 5.2's AA pass, which owns the app-wide token sweep. |
| 12 | EXPERIENCE.md still specs RHF + zod for this form, "toast + panel" for Predict failures, and the mockup's amber tile color (blind) | `EXPERIENCE.md:92,108` | low | Decisions 1 and 2 override all three, owner-confirmed; the shipped "panel only" reading matches AD-9's companion note. The stale spine lines **deferred** for the next UX refresh. |
| 13 | Rejected on verification (one line each): no-SR-path-beyond-focus (disproven by #4's fix) · dead `?? SERVICE_MESSAGES.transport` (needed for TS narrowing in the `seriesLoadFailed` arm) · catch-all transport copy (last-resort path, unreachable while the classifier holds) · dark counterparts for the new tokens (DESIGN.md:97 "Do not build dark variants") · `undefined%`-scale shape check (the contract fixes the unit, not the shape) · server string with no trust boundary (AD-3's whole point; React escapes it) · scores below 50 submittable (frozen matrix: non-blocking hint) · two failure states in one slot (upstream cause wins by design) · early-return stale panel + toast (unreachable: any change that could produce that toast clears the panel first) · `focus:outline-none` on the panel container (shadcn's own pattern; Retry is the visible tab stop) · test-file location and empty spec headings (cosmetic) · panel-clears-on-keystroke (pre-existing reset semantics, kept). | — | false/low | Each claim was checked at the cited line; none produces the described bad outcome in shipped code. |
| 14 | Stale spec prose: "No catch block sets state today — keep it that way" (edge) | spec Code Map | false | The finding's fix is an edit to this build's spec, which the review rules reject outright; the sentence describes the pre-change baseline the Code Map inventories. |

## Verification

**Commands:**
- `npm run lint` -- expected: Biome reports no errors.
- `npm run typecheck` -- expected: `tsc -b` exits 0 (this story adds the runtime shape check precisely because the compiler cannot see the wire).
- `npm test` -- expected: existing suites plus the new `error-envelope` cases green. Ran: 61 tests across 7 files, all passing.
- `npm run build` -- expected: succeeds and keeps the `/predictgame7/` asset prefix.

**Manual checks:**
- DevTools offline → Predict → panel with the transport copy and a working Retry; keyboard `Tab` reaches Retry first and the panel is announced.
- DevTools → block `predict-game-7` with a `400` body → panel shows the server's string, not JSON.
- Custom mode with two blank scores submitted → inline errors under those two fields only, no toast, and the Network tab shows no request.
- Reload with the series query blocked → the picker body shows the panel rather than an empty list, and Retry repopulates it.
