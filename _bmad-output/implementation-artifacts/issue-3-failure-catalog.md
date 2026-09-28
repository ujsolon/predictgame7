# Issue #3 Failure Catalog — Regression suite on the highest-risk Predict paths (FR-30, Story 1.4)

Source: issue #3 "Harden prediction flow reliability across selection, custom
inputs, and mobile" (still open). Its recorded failure cases lived as prose in
[`deferred-work.md`](./deferred-work.md); this catalog reproduces each one,
maps it to the code location that produced it and to the test (or the Story
1.3 / FR-8 error state) that now owns it, so the issue can be closed. Rows
already explained in `deferred-work.md` are cross-referenced, not restated.

Disposition vocabulary: **pinned-correct** (behavior was right; now frozen by
a test), **fixed-here** (recorded defect closed by Story 1.4), **owned by an
FR-8 error state** (Story 1.3 shipped the handling; its suite pins the copy),
**closed by Story 1.2** (settled before this story; Story 1.4 adds the render
pass its `deferred-work.md` entry promised). Where a row carries two
dispositions, they are named per clause. All `file:line` pins are as of this
story's commit `32e36e8` — reproduce any pin with `git show 32e36e8:<path>`
(`git show --stat` prints only the diffstat, no line content). They are not
the pre-story tree and not HEAD: the page edits here shift later lines by a
few, and the landed Story 1.2/1.3 external reviews (`e2e6140`, `890fbf1`)
shifted `PredictPage.tsx` and its error-state suite again after this commit.

Spec: `spec-1-4-regression-suite-on-the-highest-risk-predict-paths-fr-30.md`
(Decisions 1–4). All test names below are exact.

---

## 1. `getRoundImportance('Semifinals')` outranked the conference rounds

- **Symptom:** a bare `'Semifinals'` string ranked 4 — above conference finals
  — because it matched the finals branch (`'semi' + 'finals'` contains
  `'finals'`, and has no `'conf'` substring).
- **Code location that produced it:** `src/lib/nba-utils.ts` —
  `getRoundImportance` branch 1 (`r.includes('finals') && !r.includes('conf')`)
  ran first; recorded in `deferred-work.md` (source_spec `spec-1-1`,
  "`getRoundImportance('Semifinals')` returns 4").
- **Disposition:** **fixed-here** (Decision 1) — semifinal and conference
  branches now run before the bare-finals branch
  (`src/lib/nba-utils.ts:54-60`); a bare `'Semifinals'` ranks 2.
- **Pinned by:** `src/lib/__tests__/nba-utils.test.ts` →
  *"ranks the full issue-#3 round vocabulary after the Story 1.4 branch-order
  fix"* (and the pre-existing *"ranks rounds by significance (pipeline round
  vocabulary)"* keeps the previously-correct strings honest).

## 2. `getRoundImportance('Conference Finals')` ranked last, alongside unknowns

- **Symptom:** `'Conference Finals'` returned 0 — `'con**fer**ence'` contains
  `'conf'` so it failed branch 1, and it never contains the literal
  `'conf finals'` so it failed branch 2; it sorted with unrecognized rounds.
- **Code location that produced it:** `src/lib/nba-utils.ts:49-56` (pre-fix);
  recorded in `deferred-work.md` (source_spec `spec-1-1`, second
  round-vocabulary entry). The visible consequence is real:
  `src/pages/HistoricalPage.tsx:45-48` sorts **year descending first** and
  round importance only *within* a year — and most years in the live table
  hold several series (178 `status='historical'` rows; 2026, 2016 and 1994
  hold 5 each), so the tie-break fires constantly. Verified in the browser
  2026-09-28: 2026 now lists `Western Conference Finals` first, then
  `Eastern Conf Semifinals`, then the three `Eastern Conf First Round` rows;
  pre-fix `'Western Conference Finals'` scored 0 and sorted **last** within
  its year. Across the live data 13 positions in 5 years move. *(An earlier
  revision of this section claimed no row could move because "every seeded
  year holds exactly one series" — that was read off the migration seed files
  rather than the table. Corrected 2026-09-28; see the spec's Verification
  note.)* What this closes is `Conference Finals` outranking
  `Conference Semifinals` and `First Round` instead of sinking beside
  unrecognized rounds (spec Verification manual check).
- **Disposition:** **fixed-here** (Decision 1, same branch reorder as §1).
- **Pinned by:** the same test as §1 (*"ranks the full issue-#3 round
  vocabulary…"*, `'Conference Finals'` → 3, `'NBA Finals'` → 4,
  `'Conference Semifinals'` → 2, `'First Round'` → 1 unchanged). Per Decision
  3 there is deliberately no `HistoricalPage` render test — coverage stays at
  the function level.

## 3. Selecting Bayes left the Method card reading "Not selected"

- **Symptom:** the user-visible label bug observed during Story 1.1's spot
  check — `getMethodLabel()` switched on the stale `'bayesian'` slug.
- **Code location that produced it:** the old `PredictPage.tsx:278` switch;
  recorded in `deferred-work.md` (source_spec `spec-1-1`, "**SETTLED
  2026-09-26**" entry). The mapping now lives in
  `src/lib/method-display.ts:7-12` (`METHOD_LABELS`).
- **Disposition:** closed by **Story 1.2**; Story 1.4 owns the render-level
  pass that entry promised.
- **Pinned by:** map level — `src/types/__tests__/prediction-contract.test.ts`
  → *"labels every slug the pages read from, instead of a display fallback"*.
  Render level — `src/pages/__tests__/predict-flow-regression.test.tsx` →
  *"labels 'bayes' identically in the picker, the card and the details line"*
  (one such test exists per `MethodSlug`; drift turns the suite red at any of
  the four hardcoded sites: the dialog option labels
  `PredictPage.tsx:858/:881/:904/:927`, their hardcoded `Details` anchors at
  `:861/:884/:907/:930` (pinned against `METHOD_MATHS_ANCHORS`, because they
  are literals rather than reads of it), the card label at `:806`, and the
  details line at `:1104`).

## 4. Contract drift — `bayesian` vs `bayes` between frontend and Edge Function

- **Symptom:** the frontend's method union and the Edge Function's canonical
  slug disagreed, which made method-dependent display fragile (§3 was its
  visible instance).
- **Code location that produced it:** the pre-1.2 frontend-only type unions;
  `supabase/functions/_shared/contract.ts` is now the single source, re-exported
  through `src/types/prediction.ts`.
- **Disposition:** closed by **Story 1.2** (AD-2).
- **Pinned by:** `src/types/__tests__/prediction-contract.test.ts` →
  *"carries exactly the four slugs the Edge Function branches on"* and the
  stale-slug tripwire *"is a compile-time guard"* (plus the blocking
  `tsc -b` gate).

## 5. `useIsMobile` had never been tested

- **Symptom:** the hook backing every mobile branch had zero coverage; its
  `matchMedia('(max-width: 767px)')` wiring could regress with all gates
  green. Flagged in `deferred-work.md` (source_spec `spec-1-2`, review row 19
  — "Story 1.4: assert true below 768px, false above, and that the `change`
  listener updates it").
- **Code location:** `src/hooks/use-mobile.tsx:12-17`; consumed by
  `src/components/ui/sidebar.tsx` via `useSidebar()`.
- **Disposition:** **pinned-correct** — behavior unchanged, now frozen. The
  stub records the event *type* it was registered for, so `addEventListener`
  and `removeEventListener` must both say `change` (the older shadcn variant
  used `resize`, which would freeze mobile detection in a real browser while a
  type-blind stub stayed green), and the widths are asserted at the exact
  767/768 seam the query names.
- **Pinned by:** `src/hooks/__tests__/use-mobile.test.tsx` →
  *"reports mobile below the breakpoint, watching the 767px query for changes"*,
  *"splits at the breakpoint the query names: 767 mobile, 768 desktop"*,
  *"updates when the media query dispatches a change event"*,
  *"removes the change listener on unmount"*.

## 6. Selection, preload and method switching — the flow that already regressed once

- **Symptom:** issue #3's "Areas to review" named series selection, custom
  inputs and method selection; none of it was pinned by any test, so the
  picker levels, the `?series=` preload and the `customInput` preservation
  rules could silently break.
- **Code locations:** `src/pages/PredictPage.tsx` — picker levels `:71`,
  decade/year/series buttons `:683-759`, `selectSeries` `:367-384`, preload
  effect `:92-100` / `loadSeriesById` `:139-166`, reset effects `:103-111` and
  `:116-118`, `customInput` `:75` (never reset by any effect).
- **Disposition:** **pinned-correct** (as shipped post-1.3).
- **Pinned by:** `src/pages/__tests__/predict-flow-regression.test.tsx` →
  *"selects a series through the decade → year → series picker and keeps it
  across back-navigation"*,
  *"populates the card from a ?series= preload and keeps the selection across
  a later method change"*,
  *"derives the custom trigger label from dict hits, initials and
  truncation"*,
  *"carries custom input through logistic → bayes → elo while clearing
  result, field errors and failure panels"*,
  *"clears the flow on New Prediction while preserving custom input, fetched
  games and the URL"*.

## 7. Custom name resolution — abbreviation fallbacks and the placeholder logo

- **Symptom:** custom team names resolve through three branches (dictionary
  hit → initials for multi-word → 3-char truncation) with no nickname map, so
  `'Celtics'` shows as `CEL`; an unrecognized name used to fail silently — no
  signal beyond the console warning inside `getTeamLogo`.
- **Code locations:** `src/lib/nba-utils.ts:36-47`
  (`getTeamAbbreviation`, pinned as-is), `src/lib/team-logos.ts:85-88`
  (`isRecognizedTeam`, new) and `:96-105` (`getTeamLogo`, behavior unchanged),
  custom-name hint collection at `src/lib/custom-matchup.ts:82-91`, surfaced
  at `src/pages/PredictPage.tsx:198-201`.
- **Disposition:** **fixed-here** for the silent failure (Decision 4:
  non-blocking `toast.warning` naming the team; request proceeds, placeholder
  logo still shown); **pinned-correct** for the resolution branches. The
  truncation quirk that stays (`'Nowhere FC'` → badge `'NF'`) is carried in
  `deferred-work.md`.
- **Pinned by:** `src/lib/__tests__/custom-matchup.test.ts` →
  *"emits one hint per unrecognized name, in field order"*,
  *"flags the team_b field independently of team_a"* (the copy is pinned
  byte-exact here, so the wording cannot drift silently),
  *"stays silent for names the logo alias map recognizes, in any of its
  forms"*, *"skips blank and whitespace-only names — the validator owns
  those"*; `predict-flow-regression.test.tsx` →
  *"warns once per unrecognized custom name without blocking the request"*
  (page level: the warning is not a field error, never fires on keystroke, and
  the request still goes out with the placeholder logo shown);
  `src/lib/__tests__/team-logos.test.ts` →
  *"resolves a full team name, a nickname and an abbreviation to the same
  logo"*, *"matches aliases case-, space- and punctuation-insensitively,
  exact after normalization"*, *"agrees with getTeamLogo on every alias entry,
  warning nowhere"*; and the pre-existing `nba-utils.test.ts` boundary cases
  *"derives initials from multi-word custom input"* (`'Los Angeles'` → `LA`)
  and *"truncates single-word nickname input (full nickname mapping is the
  app's job)"* (`'Celtics'` → `CEL`).

## 8. Custom score validation — errors block the wire, ranges only advise

- **Symptom:** issue #3's "custom matchup flow": previously submit-time toasts
  with no field pointing; a mistyped score could ride to the Edge Function.
- **Code locations:** `src/lib/custom-matchup.ts` (`validateCustomMatchup`
  error map, `collectRangeHints`), consumed at
  `src/pages/PredictPage.tsx:185-201`.
- **Disposition:** blank/`0`/non-integer/negative are **owned by an FR-8
  error state** — Story 1.3's inline field errors (copy pinned by
  `predict-error-states.test.tsx` → *"flags invalid custom input inline and
  never leaves the browser (matrix: invalid input)"*). Story 1.4 adds the
  flow-level regression for the same matrix row: which values block the wire
  and which only advise.
- **Pinned by:** `predict-flow-regression.test.tsx` →
  *"blocks the wire on invalid scores but treats 48 as only a non-blocking
  range hint"*.

## 9. Failure/error states of the Predict flow

- **Symptom:** raw JSON in a toast, `undefined%`, silent series-list failure —
  issue #3's "error states" area.
- **Disposition:** **owned by an FR-8 error state.** Story 1.3 shipped the
  classifier (`src/lib/error-envelope.ts`), the retry panel and the picker /
  preload / result panels; its page tests in
  `src/pages/__tests__/predict-error-states.test.tsx` pin the copy (11 at
  this story's commit; 13 at HEAD once the landed 1.3 external review added
  its two race-patch tests). Story 1.4
  deliberately does not re-derive them; it reuses the same harness
  (`src/pages/__tests__/helpers.tsx` now holds the shared mock-and-helper
  plumbing both suites import).

---

## 10. Epic 1 verification pass — the catalog re-driven in a real browser (Story 1.5, 2026-09-28)

Every case above that has a browser-observable symptom was re-observed on
`npm run preview` against the deployed Edge Function, not only in jsdom:

- §1/§2 round ranking — automation-pinned (`nba-utils.test.ts`) and
  re-confirmed against the corrected 2026-09-28 expectation; this pass added
  nothing to the ordering question, but drove the same page at 1440 and 390
  and found the row/detail-sheet surfaces keyboard-inert (matrix §2.6, filed
  to 5.2).
- §6/§7 series-list and preload failures — blocked network at mount produces
  "Couldn't load the series list." with a Retry that restores the picker and
  preserves the selection; an unknown `?series=` id produces exactly one
  "Series not found" toast and no crash.
- §8 invalid input — a blank custom score blocks the wire with the inline
  field error and issues **zero** requests (request counter, not the
  resource-timing API); `'Nowhere FC'` produces one naming warning and still
  renders a prediction (NF 64.11 / MIA 35.89).
- §9 error envelopes — two live methods re-observed end to end (bayes, elo);
  all 11 `PredictionResult` keys present on the wire, no `undefined%`, no raw
  JSON in a toast.

Sections **not** re-driven here, so the traceability gap is stated rather than
silent: §3 and §4 are copy/label cases already pinned by
`prediction-contract.test.ts` and visible in the §2.1/§2.3 evidence above
("Bayes Method", the four `MethodSlug` descriptions on `/maths`); §5 is the
`useIsMobile` hook, which has no browser symptom that a DOM measurement can
show — its seam is pinned by `use-mobile.test.tsx`, and its fractional-viewport
quirk stays open in `deferred-work.md`.

Results matrix: `_bmad-output/implementation-artifacts/qa-matrix-1-5.md`. The
new issue-#3-class finding that came out of the pass is a **keyboard** one, not
a data one, and it is now fixed rather than catalogued: the three Predict
pickers were clickable `div`s sitting outside the tab ring (the
`deferred-work.md` keyboard-operability entry filed under Story 1.4, settled by
Story 1.5's Decisions 1–2). Two announcement cells in that matrix stay `[ ]`
because no assistive tech is installed on this machine — the owner-side NVDA /
VoiceOver run sheet is its §6.1–§6.2.

---

## Open owner action (Decision 2 — not touched by this story)

The suite only protects the flow if red blocks merge. **Enabling branch
protection on `master` (required status check on the CI gate: lint →
typecheck → test → build) is the owner's action item**, recorded as deferred
work with `source_spec: spec-1-4-regression-suite-on-the-highest-risk-predict-paths-fr-30.md`.
This story adds no CI step and changes no GitHub setting.
