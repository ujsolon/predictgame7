---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - _bmad-output/specs/spec-predictgame7/SPEC.md
  - _bmad-output/planning-artifacts/prds/prd-predictgame7-2026-09-22/prd.md
  - _bmad-output/planning-artifacts/prds/prd-predictgame7-2026-09-22/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-predictgame7-2026-09-23/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/EXPERIENCE.md
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-25.md
  - AGENTS.md
---

# predictgame7 - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for predictgame7, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

**Scope for this breakdown: the "Pre-Playoff" major release (PRD §8.1, before Apr 2027) per the invocation — make the Traffic Gate test (SM-1) valid. [LIVE] requirements are baseline context (preserve, don't rebuild); PLANNED-GATED requirements (FR-9, FR-22/23, FR-26..29) are excluded by the gate hard-stop (SPEC.md Constraints / Non-goals). Exception (owner decision 2026-09-25): FR-13 enters scope as a scoped pilot — video (YouTube embeds, Q-5 resolved) + editorial write-ups for 5 flagship series only; archive-wide video stays gated.**

## Requirements Inventory

### Functional Requirements

*Status tags from the PRD baseline. **[IN SCOPE]** = work this release must ship; **[BASELINE]** = shipped today, stories may only touch it as explicitly scoped; per-FR testable consequences live in `prd.md` §4 (companion).*

**Predict flow (core loop)**
- FR-1: Select a Historical matchup from Predict, incl. Home deep-links [BASELINE — issue #3 reliability work may touch]
- FR-2: Use an Active Series (distinct from Historical; empty off-season without breaking) [BASELINE — becomes pipeline-fed via FR-21]
- FR-3: Create a Custom Matchup (name resolution, placeholder fallback, score validation) [BASELINE]
- FR-4: Choose and compare the 4 Prediction Methods; method switch mid-flow non-breaking [BASELINE — issue #3 target: selection consistency]
- FR-5: Receive a transparent Prediction (winner, per-team probabilities, factors, confidence, computation time) [BASELINE]
- FR-6: Open Detailed Analysis preserving originating inputs + Method [BASELINE]
- FR-7: Reset with New Prediction in one action [BASELINE]
- FR-8: Degrade gracefully on failure — non-breaking, retry-safe, invalid-input vs service-failure distinction [IN SCOPE — quality target; issue #3 pending]

**Archive & Insights**
- FR-10: Search/filter the Historical Archive [BASELINE]
- FR-11: Expand a Series record; era-appropriate rendering of defunct franchises [BASELINE — prerender surface grows via AD-7]
- FR-12: Insight pattern cards from `insights_cache` [BASELINE — refresh owner assigned to pipeline by AD-5]
- FR-13: Series video + editorial content — scoped pilot: full content (YouTube-embed video + write-up) for 5 flagship series, pinned by owner 2026-09-25 (2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers, 2026 Thunder–Spurs); all other series bare; content flows into prerendered pages [IN SCOPE — owner decision 2026-09-25; Q-5 resolved as external embeds for the pilot]

**Content, brand & feedback**
- FR-14: Home product story (hotspots, featured deep-links) [BASELINE]
- FR-15: Methodology education on Maths page [BASELINE — formulas must stay in sync with the Edge Function during AD-2 refactor]
- FR-16: Spam-hardened contact intake [BASELINE]
- FR-17: Contact delivery & operations — Resend notification (account provisioning is build-time), `_started`/`_failed` events, inline errors + success state [IN SCOPE — issue #2]
- FR-18: Release-quality copy — Home hero, Insights labels, contact copy, empty/error states; zero mojibake; owner sign-off per surface [IN SCOPE — issue #4]

**Data pipeline**
- FR-19: Canonical archive data (177 series, normalized schema, legacy in `archive` schema) [BASELINE]
- FR-20: Offseason pipeline mode — idempotent bracket init/finalize at playoff start/end; failed run detectable [IN SCOPE]
- FR-21: Inseason pipeline mode — daily runs; Active Series reflect latest results; Q-4 feasibility spike (Fantrax preferred, nba.com fallback, manual_csv floor) is a build prerequisite [IN SCOPE]

**Analytics & observability**
- FR-24: Behavioral analytics — 10-event registry, `identify`/`reset` auth coverage, exception capture [BASELINE — relocated behind AD-1 port, names verbatim]
- FR-25: Traffic Gate reporting — unique visitors, prediction completions, funnel conversion, channel breakdown (SEO/social/direct/share-link), all retrievable programmatically via the AD-1 query surface (owner-local execution); SM-1 unique-visitor definition pinned in writing before Apr 2027 [IN SCOPE]

**Sharing & discoverability**
- FR-31: Shareable prediction results — stable Share Link reproducing inputs+Method+result, OG title/description/image unfurling on major surfaces, share arrivals attributable [IN SCOPE]

**Reliability**
- FR-30: Regression-protected Predict flow — automated tests on highest-risk paths (series selection, custom validation, method switching, error states), documented failure-case catalog, manual QA matrix (historical/active/custom × desktop/mobile) [IN SCOPE — issue #3]

**Excluded (Traffic Gate hard stop)**
- FR-9 (anonymous limits), FR-22/23 (accounts/saved predictions), FR-26..29 (betting-adjacent + guardrails) — [PLANNED-GATED]: no build without explicit owner decision; discovery may run in parallel for accounts. FR-13 moved into scope as a scoped pilot (owner decision 2026-09-25) — archive-wide video remains excluded.

### NonFunctional Requirements

- NFR1 (S1, Security) [BASELINE, enforce]: RLS all public tables; `predictions` private-by-default; no direct public inserts on `contact_submissions`; server secrets never in repo/bundle/`VITE_*`; service keys only in GH Actions secrets / Supabase function secrets.
- NFR2 (S2, Privacy): no PII beyond contact submissions + future account data; contact submissions kept indefinitely (manual delete only); ad-blocker analytics blind spot documented.
- NFR3 (P1, Performance): visible computation time; Insights from cache; provisional P95 ≤ 3s full-request mobile 4G (placeholder — re-set from FR-25 baseline); `share-og` ≈ 1s, measure in FR-31 spike.
- NFR4 (R1, Availability/cost): Supabase free tier protected by keepalive workflow; free-tier ceilings accepted as operational constraints.
- NFR5 (R2, Reliability): error states non-breaking and retry-safe (rides FR-30/FR-8).
- NFR6 (U1, Usability/mobile): whole-site responsive baseline (Home, Predict, Archive, Insights, Maths, Contact) verified on desktop + mobile before the major release.
- NFR7 (A1, Accessibility) [COMMITTED]: WCAG 2.1 AA (contrast, keyboard nav, screen-reader labeling) on core flows by this release; AA standing bar for new surfaces.
- NFR8 (D1, Data integrity): legacy tables archived not deleted; pipeline runs idempotent.
- NFR9 (D2, Version & release record): `package.json` canonical; CHANGELOG entry per release; no version in README (already applied); agents commit per AGENTS.md conventions.
- NFR10 (V1, Analytics vendor decoupling): all analytics integration — SDK init, events, exception capture, metric queries — behind one isolated layer; implemented per AD-1.

### Additional Requirements

*From ARCHITECTURE-SPINE.md (AD-1..AD-9 binding; IDs stable) + AGENTS.md. No starter template — brownfield, conventions ratified from existing code.*

- AD-1: All `posthog-js`/`@posthog/react` imports confined to `src/lib/analytics/` (typed `EVENTS` registry with the 10 names verbatim; `track/identify/resetUser/captureError`; `provider.tsx` bootstrap; owner-local metric-query surface typed here, personal API key never bundled).
- AD-2: Canonical prediction contract in `supabase/functions/_shared/contract.ts` incl. `MethodSlug` (5 canonical slugs) and `SharePayload` schema; frontend re-exports type-only; stale unions (`'bayesian' | 'ensemble_v1' | 'margin_model_v1'`) deleted; probabilities 0–100.
- AD-3: Edge Function convention: `Deno.serve` + `jsr:` imports, `_shared` helpers (CORS, `jsonResponse`, contract, service-client); `handle-contact` migrates within FR-17; Resend server-side only; error envelope `{ "error": string }`.
- AD-4: `series.status` = CHECK `('active','completed')`, rows exist only when active; **sequencing rule**: one migration drops/replace `chk_series_status` + default `'historical'`, backfills → `'completed'`, and the `HistoricalPage` query flip ships in the same release, scheduled outside the playoff window; `CURRENT_DATA_MODEL.md` updated same commit.
- AD-5: Pipeline as GH Actions scheduled workflows + `supabase/scripts/pipeline/` scripts; `SeriesDataSource` port with `fantrax`/`nba_com`/`manual_csv` adapters (env-selected); prerequisite migration adds `UNIQUE (year, round)` + `round` CHECK domain before upserts; pipeline owns `insights_cache` refresh; failed runs exit non-zero → GitHub notification (SM-4).
- AD-6: Sharing: `share-og` Edge Function (anonymous, no JWT; `@vercel/og` card + per-link og:* meta; redirect humans to deep-link with `utm_source=share`); site deep-links `/series/<id>?method=<slug>` and `/predict?custom=<base64>`; **build chain emits `404.html` SPA fallback** (without it every deep-link 404s on GitHub Pages).
- AD-7: Build-time prerender: one static HTML per `/series/<id>` (series facts + meta + Predict CTA, no baked predictions), route list from DB at build time; hydration only, no app fork.
- AD-8: Data boundary: client reads only via single anon client `src/db/supabase.ts`; ALL writes via Edge Functions/pipeline.
- AD-9: Frontend conventions: `@/` alias; one type barrel; PascalCase pages/components, kebab `ui/hooks/lib`; inline try/catch + sonner; dead `AuthContext`/`RouteGuard`/`SamplePage` off-limits until FR-22 (then deleted); RHF+zod for new forms.
- Infra: Edge Functions deploy via Supabase CLI; secrets via `supabase secrets`/dashboard. Deployment order: migration → `gh-pages` deploy.
- Stack seed note: `rolldown-vite@latest` is a deprecated shim — migrate to `vite@^8` at next dependency touch (Vitest 4.1 compat follows); Tailwind stays v3 deliberately.
- Housekeeping within scope surfaces only: preserve the 10 event names through the AD-1 refactor (FR-25 re-pointing comes later).
- Verification gate (every story): `npm run build` + Biome clean; deploys only on owner request.

### UX Design Requirements

Scoped bmad-ux run complete (2026-09-25, `status: final`, amended same day by `sprint-change-proposal-2026-09-25.md`): `_bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/` — `DESIGN.md` (visual contract), `EXPERIENCE.md` (behavior), `mockups/` (`key-og-card.html`, `key-series-page.html`, `key-error-states.html`). The spines are binding for the four new surfaces (OG card, series preview/result pages, Share + success states, error/empty states); the existing app is ratified practice, not re-specced. UX-DRs by story:

- **UX-DR-1 (Story 4.2)** — OG card: one fixed 1200×630 template, ink field, three variants; historic variant carries context only ("2016 FINALS · GAME 7") — **no series score or winner**; logos sit on white chips (`#FFFFFF`, 28px radius) so dark-bearing marks survive the ink field; essential content inside the 1080×540 safe zone. DESIGN.md · Components/Layout · OG card; EXPERIENCE.md · Component Patterns.
- **UX-DR-2 (Stories 4.3/4.5)** — Featured/active series render as a **spoiler-free preview + revealed result pair**; preview = facts through Game 6, method deep-links (never baked outputs), Predict CTA, reveal text link ("See how the series ended →") with explicit spoiler wording; result = full record + resolution write-up + video, generic CTA only. Non-flagship series keep the single full-record page. Sections render only when content exists. EXPERIENCE.md · Component Patterns/State Patterns; DESIGN.md · Layout & Spacing.
- **UX-DR-3 (Story 4.4)** — Share: single affordance, copies the share-og URL; native sheet where available, clipboard fallback; sonner toast "Link copied." (2s, no action) / blocked-clipboard copy per EXPERIENCE.md · Voice and Tone; ≥44×44px hit areas.
- **UX-DR-4 (Stories 4.1/4.3)** — Error/empty/404 states follow the shared pattern (icon tile → title → one line → single onward action) and the retry-panel treatment; 404 copy and focus behavior fixed in EXPERIENCE.md · State Patterns.
- **UX-DR-5 (all UI stories)** — Token floor lands in `src/index.css` when these surfaces build: small-text floor `#767676` (never `#808080`), `destructive-text #B91C1C`, `on-muted #595959`, `form-border #949494`; voice guardrails (no oracle/accuracy framing) per PRD §7.

Stories' AA-clean ACs stand as written; the spines' Accessibility Floor adds behavioral detail on top.

### FR Coverage Map

**Functional requirements:**
- FR-1: Epic 1 — baseline surface under reliability QA
- FR-2: Epic 2 — becomes pipeline-fed; empty-offseason behavior preserved
- FR-3: Epic 1 — baseline surface under reliability QA (custom-input validation tests)
- FR-4: Epic 1 — method-switching regression (issue #3)
- FR-5, FR-6, FR-7: Epic 1 — baseline surfaces under QA matrix; FR-15 formula sync checked when AD-2 lands
- FR-8: Epic 1 — error-state overhaul
- FR-9: excluded (Traffic Gate)
- FR-10, FR-11: Epic 4 — archive surfaces grow prerendered `/series/<id>` routes
- FR-12: Epic 2 — `insights_cache` refresh owned by pipeline (AD-5)
- FR-13: Epic 4 — flagship-five content pilot (editorial content model + content load on prerendered pages; two-page spoiler-free structure, featured/active only)
- FR-14, FR-15: Epic 5 — copy pass surfaces; FR-15 also touched by Epic 1 (AD-2 contract)
- FR-16: Epic 3 — baseline preserved through `handle-contact` migration
- FR-17: Epic 3 — Resend delivery + events + inline UX
- FR-18: Epic 5 — copy sweep
- FR-19: Epic 2 — canonical data maintained; migration integrity (NFR-D1)
- FR-20, FR-21: Epic 2 — pipeline modes
- FR-22, FR-23: excluded (Traffic Gate)
- FR-24: Epic 3 — instrumentation relocated behind AD-1 port, names verbatim
- FR-25: Epic 3 — gate reporting surface + UV definition pinned
- FR-26..FR-29: excluded (Traffic Gate)
- FR-30: Epic 1 — regression suite + failure catalog + QA matrix
- FR-31: Epic 4 — share links + OG cards + attribution

**Non-functional requirements:**
- NFR1 (S1): all epics — standing constraint on every story
- NFR2 (S2): Epic 3 — contact retention/PII posture through migration
- NFR3 (P1): Epic 4 — `share-og` ≈1s measured in spike; Epic 1 — computation-time display preserved
- NFR4 (R1): Epic 2 — pipeline keeps free-tier constraints; keepalive baseline untouched
- NFR5 (R2): Epic 1
- NFR6 (U1): Epic 5 — whole-site verification matrix
- NFR7 (A1): Epics 1–4 (AA-clean ACs on new/changed UI) + Epic 5 (verify & remediate)
- NFR8 (D1): Epic 2 — idempotency + archive-schema preservation
- NFR9 (D2): Epic 5 — release ceremony (version bump, CHANGELOG)
- NFR10 (V1): Epic 3

## Epic List

### Epic 1: A Prediction Flow That Never Breaks — on a Solid Toolchain
Users can run, compare, and retry predictions without losing state or hitting mystery failures (issue #3 closed), protected by a regression suite that every later epic builds on. **Story 1 is the toolchain foundation: migrate `rolldown-vite` shim → `vite@^8` + Vitest + CI test gate — done now, off-peak, while no release pressure exists** (owner decision 2026-09-25; satisfies the spine's "migrate at next dependency touch" and retires the Deferred test-compat question). Then: AD-2 contract consolidation (`_shared/contract.ts`, stale unions deleted), FR-8 error-state overhaul (invalid-input vs service-failure), regression tests on the four highest-risk paths, documented failure-case catalog + manual QA matrix. All new/changed UI carries an AA-clean AC (Radix primitives, contrast tokens, keyboard/screen-reader).
**FRs covered:** FR-8, FR-30 (+ FR-1/3/4/5/6/7 as QA surfaces); NFRs R2, A1 (partial), P1 (partial).

### Epic 2: Playoff-Current Active Series
During the 2027 window, Active Series reflect the latest results with zero manual heroics — and the epic still completes if both external sources fail. Story order: Q-4 feasibility spike (Fantrax reachability, nba.com rate limits) → prerequisite migrations (AD-4 status domain flip with same-release frontend sequencing; `UNIQUE (year, round)` + `round` CHECK) → pipeline runner + `SeriesDataSource` port + **`manual_csv` floor adapter as an explicit early story** (owner decision 2026-09-25: E2 ships even if both API adapters fail; spreadsheet-export cadence is the fallback, `load-games` precedent) → `fantrax` adapter → `nba_com` adapter → `insights_cache` refresh (FR-12) → GH Actions workflows (offseason + inseason) with non-zero-exit failure → GitHub notification (SM-4).
**FRs covered:** FR-2, FR-12, FR-19, FR-20, FR-21; NFRs D1, R1.

### Epic 3: Owner Operations — Measurable and Contactable
The owner can read every Traffic Gate figure programmatically and never misses a contact submission; PostHog is one module away from removable. AD-1 analytics port (`src/lib/analytics/`: EVENTS registry, track/identify/resetUser/captureError, provider bootstrap) — **every port story carries a measurement-continuity AC: events fire at identical trigger points, verified in PostHog live view before/after deploy** (owner decision 2026-09-25; protects the SM-2 baseline from splitting into two measurement regimes). AD-3 `handle-contact` migration + Resend provisioning (free tier, server-side key) + `_started`/`_failed` events + inline form UX (FR-17). FR-25 reporting surface (owner-local query execution, personal API key never bundled) + SM-1 unique-visitor definition pinned in module docs before Apr 2027.
**FRs covered:** FR-16 (preserved), FR-17, FR-24, FR-25; NFRs S2, V1.

### Epic 4: Shareable, Indexable Predictions
A completed prediction becomes a circulating artifact: copied links unfurl as OG cards and land on a working page; the archive indexes as 182 static per-series pages (172 full-record non-flagship pages + a preview/result pair for each of the 5 flagships; Active-series pairs added inseason). `share-og` Edge Function (anonymous — no JWT; `@vercel/og` card; `SharePayload` from `_shared/contract.ts`; redirect with `utm_source=share`) → **`404.html` SPA fallback with a live-deploy AC: cold GET on the real `gh-pages` URL loads the app under the `/predictgame7/` basename** (owner decision 2026-09-25; never tested against pushState routing on this deploy) → `/series/<id>` route + AD-7 prerender step in `predeploy` (route list from DB; series facts only) → Share button UI + attribution hook into Epic 3's port → **flagship-five content pilot (FR-13, owner decision 2026-09-25): optional per-series editorial content (write-up + YouTube-embed video) rendered and prerendered for 5 pinned flagship series (2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers, 2026 Thunder–Spurs); all other series stay bare; each flagship ships as a **spoiler-free preview + revealed result pair** (AD-7 amendment, `sprint-change-proposal-2026-09-25.md`); doubles as marketing material**. **Calendar-critical: this epic must be DEPLOYED ≥ 6–8 weeks before Apr 2027 so crawlers index before the spike — its position in the list is not its deadline** (owner decision 2026-09-25).
**FRs covered:** FR-31, FR-13 (scoped pilot) (+ FR-10/11 prerender surfaces); NFRs P1 (share-og timing), A1 (partial), U1 (partial — flagship page layouts).

### Epic 5: Release-Quality Polish — the Major Release Itself
The site reads and feels professional everywhere and ships as the pre-playoff major release. Copy pass (FR-18 / issue #4: Home hero, Insights labels, contact copy, empty/error states; zero mojibake; voice anchors from addendum §H; owner sign-off per surface) → WCAG 2.1 AA verification + remediation across all six surfaces (NFR-A1) → whole-site mobile/desktop responsiveness matrix (NFR-U1) → release ceremony: version bump (minor, NFR-D2), CHANGELOG entry, final `npm run build` + Biome gate. Epic goal note (owner decision 2026-09-25): the AA pass is verification + remediation of what Epics 1–4 built AA-clean; structural accessibility failures found here are recorded as findings against the epic that introduced them, not silently absorbed.
**FRs covered:** FR-14, FR-15 (copy surface), FR-18; NFRs A1 (verification), U1, D2.

## Epic 1: A Prediction Flow That Never Breaks — on a Solid Toolchain

Users can run, compare, and retry predictions without losing state or hitting mystery failures (issue #3 closed), protected by a regression suite that every later epic builds on. Story 1 is the toolchain foundation: migrate the deprecated `rolldown-vite` shim → `vite@^8` + Vitest + CI test gate — done now, off-peak (owner decision 2026-09-25). All new/changed UI carries an AA-clean AC.

### Story 1.1: Toolchain foundation — Vite 8 + Vitest + CI gate

As the owner/developer,
I want the build migrated off the deprecated `rolldown-vite` shim to `vite@^8` with Vitest wired into a CI test gate,
so that every later story has a supported toolchain and an automated place to prove it didn't break the app.

**Acceptance Criteria:**

**Given** the current app builds via `npm:rolldown-vite@latest`
**When** `vite@^8` replaces the shim and `vitest` is added as dev dependency
**Then** `npm run build` succeeds, Biome is clean, and the `dist/` output deploys correctly to the `/predictgame7/` basename (gh-pages base path verified)
**And** a smoke test suite (≥1 trivial Vitest test, e.g. route table imports) runs green locally
**And** a GitHub Actions workflow runs build + lint + test on push, failing the check on any red
**And** no user-visible behavior changes; dev-server env handling (`.env.local` restart quirk) still works per README

### Story 1.2: One prediction contract (AD-2 consolidation)

As a developer (human or agent),
I want the canonical prediction contract in `supabase/functions/_shared/contract.ts` with the frontend re-exporting it type-only,
so that the frontend and Edge Function can never disagree about method slugs or result shape again (the `'bayes'` vs `'bayesian'` class of bug, issue #3 territory).

**Acceptance Criteria:**

**Given** `src/types/types.ts` carries stale unions (`'bayesian' | 'ensemble_v1' | 'margin_model_v1'`) and `PredictionResult` declares fields the function never returns
**When** `contract.ts` is created with `MethodSlug = 'logistic_regression' | 'bayes' | 'elo' | 'exponential_smoothing'`, `PredictionInput`, and `PredictionResult` matching the function's actual returns (probabilities documented as 0–100 percent)
**Then** `src/types/prediction.ts` re-exports it via type-only import; the stale unions are deleted; `predict-game-7` imports from `_shared/contract.ts`
**And** all four methods remain selectable and produce identical results to pre-refactor (behavior-preserving; verified against a historical series and a custom matchup)
**And** Maths page formulas still match the function implementation (FR-15 sync check)
**And** `npm run build` + Biome + Vitest suite green
**And** `npx tsc -b` exits 0 — clearing the 33 type errors that pre-date Story 1.1 (27 contract-rooted in `PredictPage.tsx`/`HistoricalPage.tsx`, plus 6 typing-drift cases listed in `_bmad-output/implementation-artifacts/deferred-work.md`: `@types/qrcode`, `useIsMobile` export, `video.tsx` `Player` ×3, two unused imports) — and the blocking `- run: npx tsc -b` step is added to `.github/workflows/ci.yml` between lint and test, replacing the comment that explains its absence

### Story 1.3: Error states that never lose your place (FR-8)

As a fan mid-prediction (Bert, UJ-1),
I want failures — invalid input, network, or Edge Function — to produce an understandable, non-breaking error state with retry,
so that a slow night during the playoffs doesn't cost me my selection or my trust.

**Acceptance Criteria:**

**Given** a prediction run in any mode (historical/active/custom)
**When** the Edge Function fails, the network drops, or input is invalid
**Then** the UI distinguishes invalid-input errors (inline field-level, pre-submission where possible) from service failures (retry-able toast/panel), per the error envelope `{ "error": string }`
**And** retry re-runs without re-entering any data — series selection, custom inputs, and method choice survive the failure
**And** the failure emits through the analytics layer (`captureError`) without importing `posthog-js` directly (AD-1/AD-9 boundary respected even pre-Epic-3: via existing call pattern, centralized later)
**And** new/changed UI is AA-clean: keyboard-reachable retry, screen-reader-announced error, contrast-compliant styling
**And** `console.error` + sonner toast pattern per AD-9; build/lint/test green

### Story 1.4: Regression suite on the highest-risk Predict paths (FR-30)

As the owner,
I want automated regression tests over series selection, custom-input validation, method switching, and error states,
so that the flow that regressed once (issue #3) can't silently regress again.

**Acceptance Criteria:**

**Given** the Vitest harness from Story 1.1 and the consolidated contract from 1.2
**When** the suite lands
**Then** tests cover: historical series selection + preload, custom team-name resolution (full/nickname/abbreviation + placeholder fallback) and score validation bounds, method switching mid-flow without state loss, and both error classes from 1.3
**And** a documented catalog of issue #3's reproduced failure cases exists, each mapped to a regression test or an FR-8 error state
**And** the suite runs in the CI gate and blocks merge on red

### Story 1.5: Manual QA matrix + epic verification pass

As the owner,
I want a documented manual QA run — historical/active/custom × desktop/mobile,
so that what tests can't see (layout, touch targets, real network conditions) is verified before the epic closes.

**Acceptance Criteria:**

**Given** Stories 1.1–1.4 complete
**When** the manual QA pass runs across all six surfaces touched by this epic
**Then** a results matrix is recorded in `_bmad-output/implementation-artifacts/` with pass/fail per cell and evidence notes
**And** any failures found are fixed or filed as issues before the epic is marked done
**And** NFR-P1 spot-check: prediction full-request time observed on mobile network, noted against the provisional 3s P95

## Epic 2: Data Pipeline — Active Series stay true without manual heroics

Playoff-week data accuracy stops depending on hand-editing. Delivers FR-20/21 (offseason + inseason pipeline modes) and the FR-19 data-integrity invariants they rest on, behind the `SeriesDataSource` port (AD-5). Calendar-critical: inseason automation must be deployed and drilled **before** the Apr 2027 playoff window — a stale Active Series list during the playoffs would invalidate the Traffic Gate measurement itself.

### Story 2.1: Q-4 data-source feasibility spike

As the owner,
I want a time-boxed spike verifying whether the Fantrax API (preferred) or nba.com scraping (fallback) can actually deliver series statuses and game scores,
so that Story 2.4 builds on a confirmed source instead of the PRD's unverified assumption.

**Acceptance Criteria:**

**Given** a time-box (≤1 week) and a written spike script kept out of production paths
**When** each candidate source is probed for: current playoff bracket, series status, per-game scores (home/away), and historical consistency with the archive schema
**Then** a decision record lands in `_bmad-output/implementation-artifacts/` naming the chosen source, its rate/auth constraints, and the exact fields mapped to `series` / `series_game_scores`
**And** if BOTH sources fail: the decision record invokes the manual_csv floor (Story 2.3) as the inseason plan and flags the PRD phase-blocker note on FR-21 for the owner
**And** no production code ships from this story

### Story 2.2: Schema prerequisites — status domain + uniqueness guards

As the owner,
I want the two migrations the pipeline depends on — `series.status` CHECK ('active','completed') (AD-4) and UNIQUE(year, round) + round CHECK on `series` (AD-5),
so that upserts are idempotent and status is a real enumeration before any automated writer touches the tables.

**Acceptance Criteria:**

**Given** the migration is applied off-playoff (no active series exist to reclassify)
**When** status values outside the CHECK are attempted, or a duplicate (year, round) insert is attempted
**Then** both are rejected by the database
**And** the frontend flip consuming the new status domain ships in the SAME release (AD-4 sequencing) — Active list renders from status values, Historical unchanged
**And** `docs/CURRENT_DATA_MODEL.md` is updated in the same commit as the migration
**And** post-migration verification: all 177 historical series still reconcile (FR-19), and with an empty Active set the Predict flow shows an empty non-breaking Active list (FR-2)

### Story 2.3: Pipeline runner + SeriesDataSource port + manual_csv floor

As the owner,
I want the pipeline runner (`supabase/scripts/pipeline/`) built against a documented `SeriesDataSource` port interface (`fetch_series_statuses`, `fetch_game_scores`) with manual_csv implemented first,
so that the pipeline works end-to-end on day one regardless of what Story 2.1 concludes, and any source can be swapped in behind the port.

**Acceptance Criteria:**

**Given** `SERIES_SOURCE` env selects the adapter (fantrax | nba_com | manual_csv; default manual_csv)
**When** the runner executes against a CSV of series + game scores
**Then** upserts into `series` / `series_game_scores` are idempotent — re-running the same input changes nothing
**And** the `service_role` key comes from environment only (never committed, never in client-visible `VITE_*` vars — NFR-S1)
**And** any failure exits non-zero with a clear message (SM-4 hook for Story 2.6)
**And** a dry-run mode previews changes in a transaction-wrapped session without committing (operator convention for playoff-week confidence)
**And** the port interface is documented in `_bmad-output/implementation-artifacts/` with the manual_csv adapter as reference implementation

### Story 2.4: Automated adapter per the spike decision

As the owner,
I want the winning source from Story 2.1 implemented as a `SeriesDataSource` adapter,
so that inseason updates need no human in the loop.

**Acceptance Criteria:**

**Given** the Story 2.1 decision record (or, if closed by the decision record itself, the manual_csv-only plan stands and this story is marked resolved-by-2.1)
**When** the adapter is wired via `SERIES_SOURCE` and run against live source data
**Then** it maps source fields to the schema exactly as the decision record specifies, with the same idempotency, env-secret, non-zero-exit, and dry-run behavior as Story 2.3
**And** it is exercised against at least one real current-or-recent playoff series and cross-checked against nba.com box scores
**And** manual_csv remains available as the fallback floor — the automated adapter never removes it

### Story 2.5: Insights cache refresh

As a fan browsing Insights (Rhian, UJ-3),
I want insight values recomputed from the archive whenever the pipeline finalizes data,
so that pattern cards never show stale or hard-coded numbers.

**Acceptance Criteria:**

**Given** the pipeline runner completes an offseason run or marks any series 'active'→'completed' during an inseason run
**When** the refresh step executes
**Then** `insights_cache` is recomputed from `series` / `series_game_scores` — Game 6 winner impact, home-court advantage, average Game 7 margin (FR-12)
**And** the client reads only via `src/db/supabase.ts` from the cache — no insight computation in the browser (AD-8)
**And** refresh failure exits non-zero like any pipeline step

### Story 2.6: Scheduled workflows + failure notification (SM-4)

As the owner,
I want GitHub Actions workflows — `pipeline-offseason` (start/end of playoffs) and `pipeline-inseason` (daily during the playoff window) — with failure notification,
so that the cadence FR-20/21 requires runs without me remembering to run it.

**Acceptance Criteria:**

**Given** workflows added alongside (never modifying) the existing keepalive workflow
**When** scheduled runs execute
**Then** offseason runs at playoff start/end initialize and finalize the postseason bracket idempotently (FR-20); inseason runs daily within the configured window and Predict's Active Series reflect the latest results after each run (FR-21)
**And** `service_role` is injected from GH Actions secrets only (NFR-S1)
**And** a non-zero pipeline exit produces a detectable notification (SM-4) — verified by a deliberate dry failure in a test run
**And** if manual_csv is the inseason source (Story 2.1 both-fail outcome): documented operator cadence — owner edits the CSV daily before 09:00 UTC (aligned with the keepalive cron slot), so Active Series are never more than one day stale during the playoff window
**And** failed runs are visible in Actions history with logs sufficient to diagnose without local repro

### Story 2.7: Epic verification — simulated playoff week

As the owner,
I want a documented end-to-end drill simulating a playoff week,
so that the pipeline is proven before the real Apr–Jun 2027 window opens.

**Acceptance Criteria:**

**Given** Stories 2.1–2.6 complete
**When** the drill runs (scheduled trigger fired manually, real or fixture source data through to the live UI)
**Then** results matrix recorded in `_bmad-output/implementation-artifacts/`: Active Series render distinctly from Historical (FR-2), scores update after a run, 177-series archive still reconciles (FR-19)
**And** a failure drill: pipeline forced to fail → notification received within one cron cycle
**And** any failures found are fixed or filed as issues before the epic is marked done

## Epic 3: Owner Operations — analytics you can trust, contacts you never miss, gate numbers you can read

Covers FR-17 (contact delivery, issue #2 phases 2–3), FR-24/NFR-V1 (analytics isolation, AD-1), FR-25 (Traffic Gate reporting). This is the observability backbone SM-1 measurement depends on — every later epic's events flow through what lands here. Owner note (2026-09-25): analytics acceptance is "seeing it in action" — Story 3.5 requires the owner personally observing live events in PostHog, not a proxy report.

### Story 3.1: Analytics isolation layer (AD-1 port)

As the owner,
I want all analytics code — SDK init, the 10 event definitions, `captureError`, metric queries — moved behind a single port at `src/lib/analytics/`, with feature code emitting events declaratively through it,
so that NFR-V1's isolation invariant becomes real and FR-25 reporting has one place to read from.

**Acceptance Criteria:**

**Given** the port lands with the existing 10 event names verbatim (addendum §A.1 preserved until FR-25 metrics are re-pointed)
**When** every direct `posthog-js` import in feature code is replaced by port calls
**Then** zero direct SDK imports remain outside `src/lib/analytics/`
**And** measurement continuity: identical event trigger points pre/post refactor — verified in PostHog live view side-by-side (same events, same properties, same firing conditions) before and after deploy
**And** the owner's personal PostHog API key is used only in owner-local query tooling, never bundled into the client (NFR-S1)
**And** build/lint/test green; Epic 1's Story 1.3 error events (`captureError`) now route through the port

### Story 3.2: Reliable contact delivery via Resend (FR-17, issue #2 phase 2)

As the owner,
I want successful contact submissions to email me via Resend, with delivery failures observable,
so that the site's only inbound route to me stops being silent-failure-prone.

**Acceptance Criteria:**

**Given** Resend account provisioned (setup is part of this build) and the API key stored as a Supabase secret only
**When** `handle-contact` accepts a valid submission
**Then** the email arrives at the owner address and the submission is stored server-side as today — honeypot + timing checks + validation unchanged, direct public inserts still blocked (NFR-S1)
**And** `handle-contact` migrates to the Deno.serve + jsr convention (AD-3)
**And** contact events emit `contact_form_submitted` (existing) plus new `_started` / `_failed` variants with failure-reason categories, through the Story 3.1 port
**And** an email-send failure does not lose the submission — it's in `contact_submissions` and the failure is visible via the `_failed` event

### Story 3.3: Contact form feedback (FR-17, issue #2 phase 3)

As a visitor with a question or collaboration offer,
I want inline field errors and a visible success state,
so that I know whether my message actually went through.

**Acceptance Criteria:**

**Given** the contact form
**When** validation fails or submission errors
**Then** inline per-field errors render, distinguishing invalid input from service failure per FR-8's pattern, and no entered data is lost on retry
**And** on success a clear confirmation state renders
**And** new/changed UI is AA-clean: keyboard-reachable, screen-reader-announced status, contrast-compliant

### Story 3.4: Traffic Gate reporting surface (FR-25)

As the owner,
I want a documented, owner-local query surface for the success metrics — SM-1 window UVs, SM-2 contact/pipeline health, SM-4 failures — with the UV definition fixed in writing,
so that the Apr–Jun 2027 gate decision is a number I read, not a number I argue about.

**Acceptance Criteria:**

**Given** the analytics port from Story 3.1
**When** the reporting queries land in `_bmad-output/implementation-artifacts/` (or a small owner-local script)
**Then** SM-1 is defined precisely: unique visitors within the Apr 1–Jun 30 2027 window, counted via PostHog with a documented distinct-id/dedup rule
**And** queries run owner-local against the personal PostHog API key — never bundled, never deployed to the client (NFR-S1)
**And** each of SM-1..SM-4 has a runnable query + interpretation note; SM-3 (share-link arrivals) is registered as "wires up when Epic 4 ships share attribution" — query shape defined now, data flows later
**And** an ad-blocker blind-spot caveat is documented (SPEC.md constraint)

### Story 3.5: Epic verification — continuity proof + delivery drill

As the owner,
I want to see the epic working with my own eyes before it closes,
so that measurement integrity during the gate window is established fact, not a claim.

**Acceptance Criteria:**

**Given** Stories 3.1–3.4 complete
**When** the verification pass runs
**Then** the owner personally observes PostHog live view while exercising the deployed site: all 10 preserved events + new contact variants fire with correct names and properties
**And** a contact delivery drill: real test submission → email received → success state rendered; a forced failure → `_failed` event with reason category
**And** the SM-1 query returns a plausible number against current live traffic
**And** results recorded in `_bmad-output/implementation-artifacts/`; failures fixed or filed before the epic is marked done

## Epic 4: Sharing & SEO — results that travel, series pages that rank

Covers FR-31 (share links + OG cards, AD-6), CAP-8 (prerendered series pages, AD-7), and the FR-13 flagship-five content pilot (owner decision 2026-09-25; Q-5 resolved as external YouTube embeds; the five pinned in Story 4.6). **Calendar-critical: everything here must be DEPLOYED ≥6–8 weeks before the Apr 2027 playoff window** — OG cards need social-platform cache warm-up and prerendered pages need crawl/index lead time to pay off during the gate window. SM-3 (share-link arrivals) attribution lands here.

### Story 4.1: Series deep-links + 404 SPA fallback

As a fan receiving a shared link (Bert, UJ-1 resolution path),
I want `/series/<id>?method=<slug>` to open the app preloaded with that series and method,
so that a shared link lands somewhere meaningful instead of a GitHub Pages 404.

**Acceptance Criteria:**

**Given** GH Pages 404s all deep-links today (verified live during the spine run)
**When** a `404.html` SPA fallback ships and the router resolves `/series/<id>?method=<slug>` under the `/predictgame7/` basename
**Then** a cold GET on the real production URL renders Predict preloaded with the series and method applied
**And** unknown series ids degrade to a non-breaking not-found state (FR-8 pattern), not a blank page
**And** live-deploy verification is an AC, not a follow-up: cold GET (no client cache, direct navigation) on the deployed gh-pages URL passes, recorded with date
**And** new/changed UI is AA-clean; build/lint/test green

Re-verified live on the `0.2.3` deploy (2026-09-25): a cold GET on `/predictgame7/predict` and `/predictgame7/historical` still returns the GitHub Pages 404 page; only the basename root serves `index.html`, and the repo carries no `public/404.html`. The shipped route surface is `/predict`, `/historical`, `/insights`, `/maths` plus query-string series selection (`/predict?series=<id>`) — there is no `/series/<id>` path today, so this story introduces it as an alias alongside the existing query form, and the fallback must serve every route above, not only the new one.

### Story 4.2: OG card rendering — `share-og` Edge Function

As a content creator pasting a link (Rhian, UJ-3),
I want shared URLs to unfurl with a series-specific OG card (teams, logos, year/round context),
so that the link is worth clicking in chat and social feeds.

**Acceptance Criteria:**

**Given** the anonymous `share-og` Edge Function using `@vercel/og` (AD-6)
**When** a crawler or platform scraper fetches a share URL
**Then** OG/Twitter meta tags resolve to a rendered card image for that series — teams, logos (each on a white chip — the ink field must not swallow dark logo art), and a year/round context line ("2016 FINALS · GAME 7"); **no series score or winner on the historic variant** (AD-7 spoiler-free amendment), and never prediction outputs; predictions stay client-side
**And** the function requires no auth and holds no secrets beyond what rendering needs; the SharePayload shape follows the AD-2 contract
**And** missing/unknown ids render a generic branded fallback card, never a 500
**And** card verified with at least one platform debugger (e.g., Facebook Sharing Debugger or X card validator) against the deployed URL

### Story 4.3: Prerendered series pages (SEO)

As the owner,
I want every historical series prerendered at build time to `dist/series/<id>/index.html` (AD-7),
so that the 177-series archive is crawlable without JS and ranks year-round (evergreen SEO substance).

**Acceptance Criteria:**

**Given** a build-time prerender step in the Vite pipeline
**When** `npm run build` completes
**Then** the 172 non-flagship historical series keep one static page with the full record (unchanged shape, winner included); the 5 flagships (and any Active series inseason) emit **two** static pages — `/series/<id>` (facts through Game 6, winner-free, method deep-links + Predict CTA) and `/series/<id>/result` (full record + resolution) — per AD-7 as amended by `sprint-change-proposal-2026-09-25.md`
**And** all emitted pages are indexable with distinct titles/meta (the result page is the outcome-answering page search resolves to)
**And** the preview page's reveal link ("See how the series ended →", explicit spoiler wording on the link itself) navigates to the result route, moving focus to the result heading; the outcome appears nowhere in the preview's DOM or meta
**And** a crawler fetching the deployed URL with JS disabled receives the full content (verified via curl or equivalent)
**And** the prerender step fails the build (non-zero) if any expected page is missing or empty — no silent partial deploys
**And** new Active Series pages are generated by subsequent builds during the playoff window (pipeline data → next build → prerender)

### Story 4.4: Share button + attribution (FR-31, SM-3)

As a fan with a screenshot-worthy result (Bert, UJ-1 climax),
I want a Share action on the prediction result that produces a stable share link,
so that settling the debate takes one tap — and arrivals from my link are countable.

**Acceptance Criteria:**

**Given** a completed prediction
**When** Share is tapped
**Then** a stable URL per AD-6 (`/series/<id>?method=<slug>`; custom matchups encode via the AD-2 SharePayload contract — if encoded URLs grow ugly-long, the encoding scheme is a build-time design detail, flagged not decided here) is copied/offered with native share where available
**And** the share action emits through the Story 3.1 analytics port, and arriving visits are attributable — the SM-3 query from Story 3.4 now returns real data
**And** the Share button is AA-clean: keyboard-reachable, announced, contrast-compliant
**And** shared-link round-trip verified: link from a completed prediction reproduces the same series+method state on open in a fresh browser profile

### Story 4.5: Series editorial content model (FR-13 pilot)

As the owner,
I want optional per-series editorial content — **two parts: a before piece (tension-forward, no outcome) and a resolution piece (outcome)**, each with headline, markdown write-up, images, plus video embed URLs (YouTube), `is_featured` flag — stored server-side and mapped to the right page,
so that flagship series can carry full additional content while every other series stays bare, with no CMS and no rearchitecture.

**Acceptance Criteria:**

**Given** a schema addition for per-series editorial content (table or columns — shape decided at build time), populated by owner script/SQL only (writes stay server-side, AD-8)
**When** a series with content is viewed or its prerendered page fetched
**Then** the before part renders on the preview route and the resolution part on the result route (non-flagship single pages render whatever exists on their one page, retrospective voice); write-ups and video embeds appear in the prerendered HTML (Story 4.3 pipeline picks them up automatically)
**And** video embeds attach to either part — flagship highlight reels canonically sit on the result side, owner's call per series
**And** a series without content renders exactly as today — bare facts, no empty sections, no broken layout
**And** video is external-embed only (YouTube iframes with titles — Q-5 pilot resolution); no media hosting, no Supabase Storage usage
**And** content rendering is AA-clean: iframe titles, text contrast, keyboard-navigable embeds, responsive on desktop and mobile (NFR-U1 — closes issue #5's responsiveness AC for the pilot)
**And** `docs/CURRENT_DATA_MODEL.md` updated in the same commit as the schema change

### Story 4.6: Flagship five content load

As the owner,
I want write-ups + video embeds authored and loaded for the 5 flagship series — pinned (owner decision 2026-09-25), worked in chronological order: **2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers, 2026 Thunder–Spurs**,
so that the pilot doubles as marketing material and the SEO test runs on pages actually worth sharing — the 3–3 page is the ad, the result page the payoff; prediction links appear only on the 3–3 view.

**Acceptance Criteria:**

**Given** Story 4.5's content model deployed
**When** the owner authors both halves (before + resolution) for the 5 pinned flagship series (in the chronological order above) and loads it via the owner-side script
**Then** all 5 flagship preview/result pairs show their content on the deployed site (preview write-up spoiler-free; result write-up + at least one video embed each), verified live before the ≥6–8-week pre-window cutoff
**And** the 172 non-flagship series verify unchanged (bare) on a sample basis
**And** content authoring is owner work tracked in this story; any loading/validation tooling built for it stays owner-local or in `supabase/scripts/`
**And** flagship series are discoverable as such — Home hotspot/featured cards and archive views link through to the enriched pages (FR-14 deep-link pattern preserved)

### Story 4.7: Epic verification — the sharing round-trip in production

As the owner,
I want the whole travel path proven on the deployed site,
so that sharing and indexing work when playoff traffic actually arrives.

**Acceptance Criteria:**

**Given** Stories 4.1–4.6 deployed
**When** the drill runs
**Then** results recorded in `_bmad-output/implementation-artifacts/`: cold deep-link GET, OG debugger card render, JS-disabled prerendered page fetch (one bare + one flagship preview — verified spoiler-free — + its result page), share round-trip with SM-3 event observed in PostHog live view
**And** a sitemap/crawl spot-check: a sample of prerendered series URLs resolves 200 on the live domain
**And** deploy date recorded against the ≥6–8-week pre-window target; if slipping, owner escalation noted

## Epic 5: Release-Quality Polish — the major release itself

Covers FR-18 (copy pass, issue #4), NFR-A1 (AA verification + remediation), NFR-U1 (responsiveness matrix), NFR-D2 (release ceremony). Per the owner decision from elicitation (2026-09-25): Epics 1–4 built AA-clean; this epic **verifies and remediates** — structural accessibility failures found here are recorded as findings against the epic that introduced them, not silently absorbed.

### Story 5.1: Release-quality copy pass (FR-18, issue #4)

As a first-time visitor (Wang, UJ-2 first impression),
I want every surface to read as intentional,
so that the product feels like a destination, not a side project.

**Acceptance Criteria:**

**Given** the named surfaces — Home hero, Insights labels, contact copy, empty/error states
**When** the copy pass runs with voice anchors from addendum §H
**Then** rewritten copy lands with owner sign-off recorded per surface
**And** an automated scan of shipped strings finds zero mojibake/encoding artifacts
**And** empty/error-state wording satisfies FR-8's invalid-input vs service-failure distinction
**And** no copy change breaks layout on mobile or desktop (spot-checked against Story 5.3's matrix surfaces)

### Story 5.2: WCAG 2.1 AA verification + remediation (NFR-A1)

As the owner,
I want a full-site accessibility audit with remediation,
so that the standing AA bar is verified fact at release, not an assumption from per-story ACs.

**Acceptance Criteria:**

**Given** all six surfaces (Home, Predict, Archive, Insights, Maths, Contact) plus Epic 4's series pages
**When** the audit runs (automated scanner + manual keyboard/screen-reader passes)
**Then** findings are triaged: remediated in this story, or — if structural — recorded as a finding against the epic that introduced it with a fix filed
**And** remediated items are re-verified; audit results recorded in `_bmad-output/implementation-artifacts/`
**And** flagship content pages (Story 4.6) pass with video embeds included

### Story 5.3: Whole-site responsiveness matrix (NFR-U1)

As a mobile visitor arriving from a share link,
I want every surface to work on my device,
so that the traffic the share epic generates isn't lost to broken layouts.

**Acceptance Criteria:**

**Given** a documented device/viewport matrix (common phone + tablet + desktop breakpoints)
**When** every surface is walked
**Then** results are recorded per cell with pass/fail + evidence; failures fixed or filed before the epic is marked done
**And** the OG-card landing path (deep-link → preload → prediction) is specifically walked on a real phone viewport

### Story 5.4: Release ceremony (NFR-D2)

As the owner,
I want the release executed by the book,
so that the pre-playoff major release is traceable and the verification gate is honored.

**Acceptance Criteria:**

**Given** Stories 5.1–5.3 closed and Epics 1–4 verified
**When** the release ships
**Then** `package.json` minor bump (single source of truth), `docs/CHANGELOG.md` entry in the same commit, README version number stripped (housekeeping, PRD §8.1)
**And** final `npm run build` + Biome + full Vitest suite green (verification gate)
**And** deploy to gh-pages runs only on owner request, per AGENTS.md; post-deploy smoke check on the live URL recorded
