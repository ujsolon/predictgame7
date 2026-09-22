# Reconciliation: PostHog setup report + issues #2–#6 vs. PRD + Addendum

Reviewed 2026-09-22. Inputs:
- **A** = `posthog-setup-report.md` (wizard report: 10 events, dashboards/insights, next steps)
- **B** = GitHub issues #2–#6 (`ujsolon/predictgame7`, fetched via `gh issue view --json`)
- **Target** = `prd.md` + `addendum.md` in this folder

Each finding: quote from source, where the PRD/addendum misses or conflicts, recommended disposition.

## Gaps against INPUT A (PostHog setup report)

### A-1. Event registry (10 named events) is absent — HIGH
> "Ten events were instrumented across three pages and the auth context" + the event table (`series_selected`, `custom_series_selected`, `prediction_method_selected`, `prediction_generated`, `detailed_analysis_viewed`, `prediction_reset`, `banner_hotspot_clicked`, `contact_form_submitted`, `historical_series_expanded`, `historical_filter_applied` — with file locations).

PRD §4.6 and addendum §A say only "10 events"/"10 instrumented events" — no names, files, or semantics. This has **requirement-level impact**: SM-1's "total predictions made" and SM-2's funnel depend on knowing that `prediction_generated` is "the core conversion event"; FR-25's API/MCP retrievability is only testable against named events; NFR-V1's "event registry" refactor has no documented baseline to preserve names through the swap; and issue triage ("new vs. change", §0) can't decide whether a requested event already exists.
**Disposition:** add the full event table to addendum §A (or as a new §A.1), explicitly marking `prediction_generated` as the SM-1/SM-2 conversion source-of-truth, and note that NFR-V1's refactor must preserve these event names until FR-25 metrics are re-pointed.

### A-2. Built dashboards/insights (with IDs) not inventoried — MEDIUM
> "[Analytics basics dashboard](/dashboard/1649509)", "Prediction Funnel: Series → Method → Prediction (/insights/cu0V4HPZ)", "Predictions Generated Over Time", "Prediction Method Popularity", "Detailed Analysis Conversion Rate", "Home Page Engagement".

FR-25 demands gate figures "without ad-hoc surgery" and §4.6 says the gaps are "channel attribution depth and playoff-window reporting" — but neither doc records what already exists or where. Reconstructing or duplicating these assets is wasted work; the "Predictions Generated Over Time" and "Prediction Method Popularity" insights directly serve §4.6/FR-25 adjacent reporting.
**Disposition:** addendum §A — inventory the six assets (IDs + purpose) as the FR-25 starting point, and note IDs are wizard-generated and must be treated as disposable pointers behind the NFR-V1 query layer.

### A-3. FR-24 funnel claim conflicts with what exists today — MEDIUM (contradiction)
> FR-24: "The prediction funnel (Series → Method → Prediction → Detailed Analysis) is reportable as conversion today." Report: the built funnel insight is **three** steps ("Prediction Funnel: Series → Method → Prediction"); Detailed Analysis is a *separate* insight ("Detailed Analysis Conversion Rate"), not a stage of the shipped funnel.

Minor but it is a testable "[LIVE]" claim that doesn't hold literally. SM-2 correctly uses the 3-step funnel; FR-24's 4-step phrasing is inconsistent with SM-2.
**Disposition:** tighten FR-24 wording to "3-step funnel reportable today; Detailed Analysis conversion tracked as a companion insight" (PRD §4.6), and align §4.6's "gaps" sentence.

### A-4. "auth events" overstated in FR-24 — LOW/MEDIUM (contradiction)
> FR-24: "Key user actions (page views, prediction funnel steps, contact events, **auth events**) emit to PostHog". Report's auth coverage is *not* an event: "Users are identified by Supabase user ID on sign-in and sign-up, with `posthog.reset()` called on sign-out." No named auth event appears in the ten-event table; the intro's "…and user authentication" refers to identify/reset wiring, and pageview auto-capture isn't among the ten either.

**Disposition:** correct FR-24's enumeration (PRD §4.6): replace "auth events" with "user identification via `identify(supabase_user_id)` on sign-in/sign-up and `reset()` on sign-out"; put the exact mechanism in addendum §A. This also matters for NFR-S2 (privacy: Supabase user ID as distinct_id is a pseudonymous identifier) — worth one line there.

### A-5. Identification/merge caveat for SM-1 UV counting — MEDIUM
> "Users are identified by Supabase user ID on sign-in and sign-up, with `posthog.reset()` called on sign-out."

SM-1 counts "unique visitors" via PostHog. The identify/reset lifecycle changes distinct_id mid-session and merges/splits persons; the PRD never notes that gate figures are affected by this instrumentation choice (or by the account launch under FR-22 changing identification density during the measured window). This is a known-analytics-caveat of exactly the kind NFR-S2's ad-blocker note is.
**Disposition:** addendum §A analytics bullet (or §F near the gate mechanics): document the distinct_id lifecycle and its implication that the 2027-window UV definition must be pinned before Apr 2027 (aFR-25 definition note).

### A-6. `contact_form_submitted` exists, started/failed do not — verify-only, no gap
FR-17 already carries the issue-#2 trio (`_started`/`_submitted`/`_failed`) and §4.6/Report agree `contact_form_submitted` ships today. Baseline/status consistent. The report's `captureException` in "prediction and contact form handlers" matches FR-24's exception claim. No action beyond A-1's registry.

### A-7. PostHog agent-skill folder untracked — LOW
> "We've left an agent skill folder in your project… for further agent development."

Neither PRD §0 (AI/agent workflows are an audience) nor addendum §A mentions it. The NFR-V1 decoupling pass should know a PostHog-specific agent artifact exists (and may need removal on vendor exit).
**Disposition:** one addendum §A line; alternatively fold into Q-8's housekeeping ("leftover artifacts: SamplePage.tsx, PostHog agent skill folder"). Intentional omission is *not* recommended — it's cheap and it prevents an orphaned instruction source steering future agents back at PostHog after a swap.

## Gaps against INPUT B (issues #2–#6)

### B-1. Issue #2: "reliable channel" vs. Resend-only spec — LOW (scope narrowing, likely intentional)
> AC: "A successful contact submission notifies the site owner through a **reliable channel**"; preferred options listed Resend/SendGrid with "store in DB and trigger a notification path" as fallback.

FR-17 hard-codes Resend — legitimate per owner decision 2026-09-22 (addendum §G records alternatives considered). Adequately captured; **intentional omit confirmed**, no change.

### B-2. Issue #2: contact *layout/visual* refresh not in any FR consequence — LOW
> Phase 3: "Optionally refresh the section copy/**layout** so the contact area feels more intentional as a product surface"; AC: "The contact section copy **and UI** feel intentional and production-ready."

FR-17 tests inline errors + success state; FR-18 covers contact **copy**. The optional layout/UI refresh AC is dropped.
**Disposition:** addendum §E row #2 — note the optional layout refresh is consciously de-scoped (or optionally appended to FR-18's surfaces). Flag so closing issue #2 against FR-17/FR-18 doesn't silently fail its fourth acceptance criterion.

### B-3. Issue #3: "Reproduce and document failure cases" not captured — MEDIUM
> Suggested work: "Reproduce and **document failure cases**"; also "possibly component/integration tests for the highest-risk paths."

FR-30 covers tests + manual QA matrix + issue #4-style error states, and the `[NOTE FOR PM]` captures the "framework alone won't close this" caveat. But the documented-failure-case catalog — the artifact that makes the reliability pass reusable and feeds FR-8's "distinguishes invalid input from service failure" — is not an acceptance item anywhere.
**Disposition:** FR-30 consequence: "A documented catalog of reproduced failure cases exists and maps each case to a test or error state." (PRD §4.8.)

### B-4. Issue #4: qualitative ACs not testable in FR-18 — LOW
> ACs: "Key product pages have **polished, consistent copy**"; "**Empty/error states are user-friendly**."

FR-18's testable consequences only cover surface-list and zero-mojibake automation. The subjective halves ("polished/consistent", "user-friendly") have no verification hook — and the second overlaps FR-8's error-message requirement without cross-reference.
**Disposition:** add to FR-18 a lightweight owner sign-off criterion per named surface (solo-builder-appropriate), and one line tying empty/error-state friendliness to FR-8. PRD §4.3.

### B-5. Issue #5: mobile/desktop support for video absent from FR-13 — LOW (covered by omission-defense)
> AC: "Mobile and desktop layouts both support the feature cleanly."

FR-13's consequences omit responsiveness, but NFR-U1 explicitly states "no other surface is exempt by omission" — the baseline covers it once shipped. **Recommend:** intentional-omit is defensible; optionally add a half-line "under NFR-U1 baseline" to FR-13 so the issue→FR map in §E closes visibly.

### B-6. Issue #6: "documented" requirement for new prediction types missing — MEDIUM
> AC: "The new prediction types are **documented** and validated against sample series data."

FR-26/27 capture the validation bar ("validated against a sample of Historical Archive series") and FR-28 the understandable presentation, but *documentation* — extending the Maths page (FR-15's living contract: "All four Methods are documented; formulas match the Edge Function") to cover spread/totals derivation — appears nowhere. If issue #6 is ever closed against FR-26..29, its documentation AC is uncaptured, and FR-15's "all four Methods" wording could go stale relative to the model catalog (`prediction_methods.is_active`).
**Disposition:** add to FR-28 (or FR-15) a consequence: "Maths page and `prediction_methods` catalog document the derivation of any shipped Betting-Adjacent Output." PRD §4.3/§4.7.

### B-7. Issue #6 evaluation goal — covered, verify-only
> "Evaluate which additional bet types can be supported reliably from the existing score data" / "Review whether the current models should be extended or whether new derived logic is needed."

Both captured (FR-27 design-decision clause + §4.7 description + the "existing Game 1–6 score data supports derived features" note carried into addendum-adjacent PRD text). No gap.

## Summary table

| # | Source item | Type | Severity | Disposition |
|---|---|---|---|---|
| A-1 | 10-event registry | Missing | High | Addendum §A table; mark `prediction_generated` as SM-1/SM-2 source |
| A-2 | 6 dashboards/insights with IDs | Missing | Med | Addendum §A inventory as FR-25 starting point |
| A-3 | 4-step funnel "reportable today" | Contradiction | Med | Fix FR-24 wording (3-step + companion insight) |
| A-4 | "auth events" emit | Contradiction | Low/Med | FR-24 → identify/reset; addendum §A mechanics |
| A-5 | distinct_id lifecycle vs. SM-1 UVs | Missing caveat | Med | Addendum §A/§F gate-definition note |
| A-6 | contact event names/status | Verified consistent | — | None |
| A-7 | PostHog agent skill folder | Missing | Low | Addendum §A line / fold into Q-8 |
| B-1 | Resend vs. "reliable channel" | Narrowing | Low | Intentional; already recorded §G |
| B-2 | Contact layout refresh | Missing (optional) | Low | Addendum §E note |
| B-3 | Documented failure-case catalog | Missing | Med | FR-30 consequence |
| B-4 | Copy/state qualitative ACs | Partially untestable | Low | FR-18 sign-off + FR-8 cross-ref |
| B-5 | Video mobile/desktop | Covered by NFR-U1 | Low | Intentional omit; optional cross-ref |
| B-6 | New outputs "documented" | Missing | Med | FR-28/FR-15 documentation consequence |
| B-7 | Bet-type evaluation | Covered | — | None |
