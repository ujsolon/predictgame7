# Reconciliation — README.md + CHANGELOG.md vs PRD + Addendum

*Reviewer pass: 2026-09-22. Inputs: `README.md`, `CHANGELOG.md` vs `_bmad-output/planning-artifacts/prds/prd-predictgame7-2026-09-22/prd.md` + `addendum.md`. Scope: content in the inputs MISSING from or CONTRADICTED by the PRD+addendum. Excluded per instruction: README's stale "Current version `0.2.0`" (already treated by design in NFR-D2, §11, addendum A/G).*

**Verdict:** coverage is strong — features, pages, stack, data model, edge functions, RLS, contact hardening, and the 177-record backfill all map cleanly. Findings below are 1 material gap, 3 medium gaps, and 5 minor/note-only items.

---

## G-1 (Material) — Legacy franchise coverage as a baseline behavior expectation (CHANGELOG v0.1.0)

- **Source quote:** "Added support for historical franchise coverage required by the migrated archive, including **missing legacy team records and related assets**." (`CHANGELOG.md` v0.1.0 Added)
- **Where absent:** No FR, NFR, glossary entry, or addendum note anywhere covers defunct/rebranded NBA franchises in the archive. FR-19 ("177 migrated Historical series with logos") and FR-11 (expanded panels "consistent with `series_game_scores`") are silent on historical-era team names/logos. Worse, addendum B says `teams` holds "canonical franchises … **one logo each**" — which sits in tension with the v0.1.0 fix's premise that legacy-era records *and assets* had to be added so the migrated archive would render correctly. Custom-input matching (FR-3: "full name, nickname, or abbreviation") also never addresses era names (e.g., a user typing a franchise's pre-rebrand name for a 1980s series).
- **Why it matters:** fix history in v0.1.0 explicitly reveals a user-facing baseline: archive rows for years predating relocations/rebrands must display the *correct era franchise and asset*, and 177-record completeness depends on those legacy rows existing. A future change that "normalizes" `teams` to current franchises only would regress this.
- **Recommended disposition:** add a testable consequence under FR-11 or FR-19 (e.g., "Series rows render the era-appropriate franchise record and logo asset, including legacy/defunct team records"), and add a one-line clarification to addendum B reconciling "one logo each" with legacy asset rows. Optionally extend FR-3 to state whether historical-era names resolve in custom input.

## G-2 (Medium) — Local development & verification workflow with requirement implications (README)

- **Source quotes:** "Create a local env file such as `.env.local` with: …"; "Restart the Vite dev server after changing env vars."; "### 4. Build and lint — `npm run build` / `npm run lint`"; "The current npm scripts include GitHub Pages deployment via: `npm run predeploy` / `npm run deploy`"; "VITE_POSTHOG_HOST=https://us.i.posthog.com".
- **Where absent:** Addendum A lists the env *variable names* and "Lint: Biome" but omits the env *file convention* (`.env.local`), the Vite-restart caveat, the regional PostHog host value (`us.i.posthog.com`), and the documented build/lint/deploy npm scripts as the verification and release path. The PRD has no requirement implying a pre-commit/pre-release gate.
- **Why it matters:** NFR-D2 states "agents perform most commits going forward" — that makes a documented verification gate (`build` + `lint` pass, deploy only via `predeploy`/`deploy`) an operating requirement for exactly the audience running this repo. It's setup/run guidance with a quality-bar implication, not just onboarding trivia.
- **Recommended disposition:** extend addendum A with the dev-workflow facts (`.env.local`, Vite restart after env change, US PostHog host value, `build`/`lint`/`predeploy`/`deploy` scripts); add a half-line to NFR-D2: "release hygiene includes a clean `npm run build` + `npm run lint` before release commits."

## G-3 (Medium) — FR-24's event enumeration diverges from README's analytics list

- **Source quote:** "PostHog is wired into the frontend for: prediction flow events, **homepage interaction events**, **historical archive interaction events**, auth events, frontend exception capture." (`README.md` §Analytics)
- **Where conflicting:** FR-24 lists "(page views, prediction funnel steps, contact events, auth events)" — it drops homepage-interaction and historical-archive interaction events and adds contact events (README's list has no contact line; the README §What-the-app-does doesn't either, but addendum A's "10 instrumented events" presumably includes them per `captureException` in "prediction/contact catch blocks"). The two enumerations do not reconcile to a single inventory.
- **Why it matters:** FR-25's gate reporting and NFR-V1's event-registry refactor both depend on a known, complete event inventory; a mismatched baseline list risks the decoupling pass missing the homepage/archive event families.
- **Recommended disposition:** fix FR-24's parenthetical (or addendum A) so the event families match: prediction flow, homepage interaction, historical-archive interaction, contact, auth, exception capture. Ideal: enumerate the 10 named events in addendum A as the NFR-V1 registry seed.

## G-4 (Medium) — "Compare multiple prediction methods" is a headline claim without an owning FR

- **Source quote:** "Compare multiple prediction methods, including logistic regression, Bayesian, Elo, and exponential smoothing" (`README.md` §What the app does); also UJ-2's path: "compares across two or three methods".
- **Where absent/ambiguous:** FR-4 only requires the user "can select among" the four Methods; its consequences test catalog activity and non-breaking switching, and FR-5/FR-6 describe single-prediction output and per-method deep-dive. No FR states that side-by-side/comparative display across methods is a **LIVE** capability, nor what it renders (per-method list of results? disagreement view?). The vision (§1) says "method choice" but the comparison promise lives only in a journey narrative.
- **Why it matters:** if agents treat FR-4..FR-6 as the whole contract, a refactor could reduce the flow to one-method-at-a-time and "pass" requirements review while regressing a documented core differentiator ("shows its work" / how methods "disagree" per UJ-2 climax).
- **Recommended disposition:** add an explicit consequence to FR-4 or FR-5 (e.g., "results for multiple selected Methods are viewable for the same matchup, enabling method comparison"), or state comparison is sequential re-runs only — either way, disambiguate against README.

## G-5 (Minor) — Addendum C faithfully mirrors CHANGELOG's own 0.2.0 gap without noting it

- **Source observation:** `CHANGELOG.md` jumps 0.1.0 → 0.2.1 → 0.2.2; there is **no 0.2.0 entry**, yet README asserted a "0.2.0". Addendum C lists the same three releases silently.
- **Note on scope:** this is *not* re-flagging the README staleness exclusion; it's a change-history completeness issue for the versioning convention NFR-D2 makes CHANGELOG canonical. If CHANGELOG is "the" release record, its own discontinuity deserves one acknowledgment line so a future agent doesn't invent a phantom 0.2.0 release (or lose whatever shipped between May and July 2026).
- **Recommended disposition:** add to addendum C: "CHANGELOG has no 0.2.0 entry despite README's claim; the 0.1.0→0.2.1 gap is unreleased-version drift, not a lost release [verify with owner]." Verify against git tags if needed.

## G-6 (Minor) — Captcha-replacement history implies a standing anti-spam principle not stated

- **Source quote:** "**Replaced the client-trusted visible math captcha pattern** with quieter anti-spam checks using a honeypot field and submission timing validation." (`CHANGELOG.md` v0.2.2)
- **Where partially absent:** FR-16 captures the end state ("reject bots without a visible captcha"; honeypot + timing). The fix history's deeper lesson — the *previous* captcha was rejected because it was **client-trusted** — is nowhere recorded. The implied baseline requirement is "anti-spam gates must be server-trusted," which governs future additions (e.g., a new bot-check before live scoring or account launch).
- **Recommended disposition:** one clause in FR-16 consequences ("no client-trusted gate may be the sole anti-spam control") or a line in addendum C. Low effort, prevents regression of the security posture that motivated v0.2.2.

## G-7 (Minor) — Contact error-handling fix predates FR-17; live baseline state unstated

- **Source quote:** "Improved contact form error handling so frontend users receive clearer submission feedback." (`CHANGELOG.md` v0.2.2)
- **Where:** FR-17 [PLANNED — issue #2] requires "inline field errors and a visible success state render." The CHANGELOG shows *clearer submission feedback* already improved as a v0.2.2 fix — the PRD assigns feedback solely to a PLANNED item, slightly under-representing what's LIVE (partial error feedback exists today). Not a contradiction of substance; a status nuance.
- **Recommended disposition:** annotate FR-17 ("baseline error feedback shipped in v0.2.2; issue #2 completes delivery + full UX states") to keep "new vs. change" triage honest.

## G-8 (Note only) — README project-structure and phrasing items adequately covered

- "canonical team records and team logo assets" → FR-3/FR-19 (modulo G-1). ✓
- "high-level historical insights and methodology pages" → FR-12/FR-15. ✓
- Project structure (`contexts/` auth-wide state, `lib/` logo helpers, `supabase/scripts` "one-off data loading utilities") → addendum A/B reference these indirectly; PRD §4.5 already reconciles "auth exists in the stack but powers no user-facing feature." No action beyond G-2's addendum enrichment.
- "including logistic regression, Bayesian, Elo, exponential smoothing" (README's non-exhaustive "including") vs PRD's fixed "four Methods": consistent with the `prediction_methods` catalog; if a fifth method ever flips `is_active`, FR-4's catalog test holds while §1/§3's "four" hardcount would need editing. Consider wording FR-4 as "all active Methods" with the four named as today's set. No change required now.
- "The most pressurized game in basketball" tone claim → reflected in §1 vision voice and §6 brand/voice constraint. ✓
- Repo docs cross-links and "Release 1 normalized data model rollout … tracked in `supabase/migrations`" → addendum B/C. ✓

## G-9 (Note only) — CHANGELOG v0.1.0 Changed/Fixed items are covered as end-state

- Nested-team rendering fixes (abbrev/logos), 406 lookup errors, series-selection reliability, all-177 coverage, rebuilt `series_game_scores`, frontend types aligned to normalized schema → all subsumed by FR-1/FR-3/FR-8/FR-11/FR-19 and addendum B/C as baseline behavior. The one residual requirement-shaped insight (request-shape fragility behind the 406s) is appropriately captured by issue #3 → FR-30's regression coverage. No action.

---

## Summary table

| ID | Severity | Input | Artifact location | Disposition |
|---|---|---|---|---|
| G-1 | Material | CHANGELOG v0.1.0 legacy franchises/assets | Absent from FR-3/11/19, addendum B ("one logo each" tension) | Add consequence + addendum note |
| G-2 | Medium | README local dev/build/lint/deploy | Absent from addendum A, NFR-D2 | Extend addendum A; add gate line to NFR-D2 |
| G-3 | Medium | README analytics event list vs FR-24 list | FR-24 parenthetical incomplete | Reconcile enumeration; seed NFR-V1 registry |
| G-4 | Medium | README "compare multiple methods" | No FR owns multi-method comparison | Add consequence to FR-4/FR-5 |
| G-5 | Minor | CHANGELOG missing 0.2.0 entry | Addendum C silent mirror | One-line note (+git verify) |
| G-6 | Minor | CHANGELOG v0.2.2 client-trusted captcha | Principle not stated in FR-16 | Add server-trust clause |
| G-7 | Minor | CHANGELOG v0.2.2 contact error UX | FR-17 marks as PLANNED what's partly LIVE | Annotate status nuance |
| G-8 | Note | README structure/tone/phrasing | Covered | None |
| G-9 | Note | CHANGELOG v0.1.0 end-states | Covered | None |
