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
- FR-19: Canonical archive data (177 series per the source spreadsheet; **the live table measured 178 rows on 2026-09-30** — Story 2.1's archive audit, proposal §4.10, which pins 177 = spreadsheet and 178 = live. **The one-row delta is now reconciled (2026-10-01, `sprint-change-proposal-2026-10-01.md` §1):** the sheet's Game-7 rows are 158 NBA + 1 BAA + 18 ABA = 177 and it stops at the 2026 conference semifinals, so the live 178th is the 2026 Finals Game 7 and the archive is **160 NBA/BAA + 18 ABA** = nba.com's published 160 to the unit. Story 2.8's `00016` stores that composition as `series.league`. Normalized schema, legacy in `archive` schema) [BASELINE]
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
- AD-2: Canonical prediction contract in `supabase/functions/_shared/contract.ts` incl. `MethodSlug` (4 canonical slugs) and `SharePayload` schema; frontend re-exports type-only; stale unions (`'bayesian' | 'ensemble_v1' | 'margin_model_v1'`) deleted; probabilities 0–100.
- AD-3: Edge Function convention: `Deno.serve` + `jsr:` imports, `_shared` helpers (CORS, `jsonResponse`, contract, service-client); `handle-contact` migrates within FR-17; Resend server-side only; error envelope `{ "error": string }`.
- AD-4 (amended 2026-09-29): a series' phase is **derived, not stored** — `winner_team_id IS NULL` means Game 7 pending, `IS NOT NULL` means archive; rows are born only at a certified 3–3. `series.status` and `chk_series_status` are vestigial remnants of the un-cascaded two-table merge and are **dropped by Story 2.2's migration** (owner decision 2026-09-29); integrity is pipeline assertion + a defensive read path, not a DB trigger. **Sequencing rule unchanged**: one migration + the read-path flip to the derivation ship in the same release, scheduled outside the playoff window; `CURRENT_DATA_MODEL.md` updated same commit.
- AD-5: Pipeline as GH Actions scheduled workflows + `supabase/scripts/pipeline/` scripts; `SeriesDataSource` port with `fantrax`/`nba_com`/`manual_csv` adapters (env-selected) plus the optional `describeRun?()` run report (added by Story 2.4, ratified in the spine 2026-10-01); prerequisite migration adds `UNIQUE (year, team_a_id, team_b_id)` before upserts and drops the `00007` five-column `status` index (key corrected 2026-09-30 after Story 2.1's audit — `round` is excluded from the key and carries no CHECK, because the live table holds 19 duplicate `(year, round)` groups and 17 era spellings; the adapter owns the round vocabulary and the runner asserts team identity in either slot order); **the archived `team_a` is the series *winner*, not game 1's home team, and archived `home_team_id` is therefore not a venue (`sprint-change-proposal-2026-10-01.md`; Story 2.8's `00016` adds `series.league` ∈ {NBA,BAA,ABA} and backfills the Game-7 home/away of the 160 NBA/BAA series with their scores swapped, so `league IN ('NBA','BAA')` marks a real Game-7 venue; games 1–6 venues stay unknown and the freeze otherwise holds)**; row creation and winner completion follow AD-4's derivation — no step writes `status`; pipeline owns `insights_cache` refresh, fired **only by a run that filled at least one winner** (owner 2026-10-01; a purely offseason run refreshes nothing); failed runs exit non-zero → GitHub notification (SM-4).
- AD-6: Sharing: `share-og` Edge Function (anonymous, no JWT; `@vercel/og` card + per-link og:* meta; redirect humans to deep-link with `utm_source=share`); site deep-links `/series/<id>?method=<slug>` and `/predict?custom=<base64>`; **build chain emits `404.html` SPA fallback** (without it every deep-link 404s on GitHub Pages).
- AD-7: Build-time prerender: one static HTML per `/series/<id>` (series facts + meta + Predict CTA, no baked predictions), route list from the DB **via AD-4's derived phase** at build time; hydration only, no app fork.
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
During the 2027 window, Active Series reflect the latest results with zero manual heroics — and the epic still completes if both external sources fail. Story order: **Story 2.0 — the server-side gate (`deno check` on the Edge Functions + `predict-game-7` input validation), added by Epic 1's retrospective on 2026-09-30 to close `deferred-work.md` D1/D2 before this epic writes its first line of Deno** → Q-4 feasibility spike (Fantrax reachability, nba.com rate limits; also carries the read-only archive audit) → prerequisite migration (`UNIQUE (year, team_a_id, team_b_id)`, and **no** `round` CHECK — key corrected 2026-09-30 by `sprint-change-proposal-2026-09-30.md`) + the read-path flip to AD-4's derived phase, shipped in the same release → pipeline runner + `SeriesDataSource` port + **`manual_csv` floor adapter as an explicit early story** (owner decision 2026-09-25: E2 ships even if both API adapters fail; spreadsheet-export cadence is the fallback, `load-games` precedent) → automated adapter per the spike decision (nba.com primary, one keyed provider as alternate — fantasy Fantrax ruled out by Story 2.1's evidence, owner call 2026-09-30) → **Story 2.8 — archive league identity + Game 7 venue backfill (`00016`, one hand-curated committed CSV as the source, throwaway rehearsal; the one-time lift of Story 2.4's archive freeze, added by `sprint-change-proposal-2026-10-01.md`)** → **Story 2.9 — league chip and filter on the archive surface (FR-10/FR-11)** → **Story 2.10 — the chip made conditional and the gloss moved into the chipped record, with 2.9's league control deleted (owner review 2026-10-02; it is what ships in 2.9's place on the surface)** → `insights_cache` refresh (FR-12, Story 2.5's `00017` RPC — it runs only after `00016` is applied, because its populations are league-filtered and its home-team card reads backfilled venues) → GH Actions workflows (offseason + inseason) with non-zero-exit failure → GitHub notification (SM-4) → Story 2.7's verification drill. **Story numbers are append-only and do not sort into run order: the execution sequence is 2.0 → 2.1 → 2.2 → 2.3 → 2.4 → 2.8 → 2.9 → 2.10 → 2.5 → 2.6 → 2.7.** Story 2.11 (search answering the stored `teams.abbreviation` through the series foreign key) is backlog work found while building 2.9's surface and sits outside that chain.
**FRs covered:** FR-2, FR-10, FR-11, FR-12, FR-19, FR-20, FR-21; NFRs D1, R1, A1 (Story 2.9's league chip and 2.10's conditional chip + record gloss only). Story 2.0 also carries the server-side half of FR-30's gate (AD-2 producer-side enforcement, `deferred-work.md` D1/D2 — owner decision 2026-09-30).

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
**And** the suite runs in the CI gate on every push to `master`, and nightly — `.github/workflows/nightly-gate.yml` runs `npm run gate` and files an issue on red — while a red push is blocked locally by `.githooks/pre-push`. No required status check is claimed: work lands on `master` by direct push, not by merge

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

### Story 2.0: Gate the server side — Edge Function type-check and input validation

*Created from Epic 1's retrospective (`../implementation-artifacts/epic-1-retro-2026-09-29.md`, finding §F; `deferred-work.md` D1 and D2). Owner decision 2026-09-30: it gets an Epic 2 slot rather than a Story 1.6. It runs first because it is the prerequisite every later `supabase/` story inherits — Epic 2's pipeline, Epic 3's `handle-contact` migration and Epic 4's `share-og` all write server code into a directory no gate checks today.*

As a developer (human or agent),
I want the Edge Functions type-checked and their request inputs validated,
so that the AD-2 contract is enforced on the producer side too, and a malformed request fails with a real 400 instead of returning a plausible-looking wrong answer.

**Acceptance Criteria:**

**Given** `tsc -b` covers `src` + `vite.config.ts` only and Biome's `files.includes` is `src/**` + `tailwind.config.js`, so `supabase/functions/**` is checked by nothing (D1)
**When** the CI workflow gains a `deno check supabase/functions/**/*.ts` step with `actions/setup-deno`, and Biome's includes widen over the same paths
**Then** renaming a `PredictionResult` field, or emitting a `confidence_level` the contract does not list, turns CI red — including a break across the `../_shared/contract.ts` hop
**And** no local Deno install is required: the step is CI-only, `npm run gate` keeps its four commands, and the documentation says honestly that the first evidence this step can produce is a CI run (README + AGENTS.md), not a local check
**And** the story names a checker per directory under `supabase/` — Deno for the functions, and whatever fits Story 2.3's `supabase/scripts/pipeline/` runner. If that lands Python (the `load-games/main.py` precedent), the remaining gap is recorded explicitly rather than left for D1 to silently reopen

**Given** `predict-game-7` annotates `const input: PredictionInput = await req.json()` without validating it, and its branch chain's final `else` is logistic regression, so any unknown slug silently runs logistic and echoes the wrong slug back as `method_used` (D2)
**When** the request body is validated at the boundary
**Then** an out-of-contract `method` slug returns 400 with the `{ "error": string }` envelope, naming the accepted slugs
**And** non-numeric or missing `game_N_score_*` takes the same 400 path, instead of flowing through the arithmetic and serialising NaN probabilities as `null` — which renders `null%` client-side
**And** a self-vs-self custom matchup (`team_a === team_b`) returns 400; today it produces a successful 50/50, and the client's frozen validation matrix deliberately does not check it, so the function is the enforcement point
**And** the 400 and 500 shapes are typed in `_shared/contract.ts`, so the single source of truth documents the failure wire and not only the success path — one vocabulary, pinned by tests

**Given** Story 1.2's boundaries froze the function's existing validation and error response
**When** this story lands
**Then** the success path is unchanged for all four methods, verified against a historical series and a custom matchup, and `npm run gate` stays green
**And** the function is redeployed and probed over the wire before the story is called done — `supabase functions deploy` is a separate, ungated mechanism (AGENTS.md), so a green CI proves nothing about what production is serving

**Owner calls and measured facts, recorded at the Epic 2 prerequisite check (2026-09-30):**

- **CI-only stands.** The owner chose not to install Deno locally, so "no local Deno install is required" above is the plan rather than a compromise: the first evidence this step can produce is a CI run on `master`, and a red run there stops nothing, since CI reports and `master` has no branch protection. That is the accepted cost, and the docs must state it plainly.
- **The step must not ship red.** `supabase/functions/predict-game-7/index.ts:371-372` is `} catch (error) {` → `JSON.stringify({ error: error.message })`, which is one `TS18046` under a strict pass (re-read at `ddf0b1d` on 2026-09-30; `handle-contact:89` already narrows correctly). Narrow it **in the same commit** that adds the check step — `error instanceof Error ? error.message : String(error)` — or the new step is red on arrival.
- **`deno check` needs network egress.** Measured at HEAD: the two functions pull deps three different ways — `jsr:@supabase/supabase-js@2` (`predict-game-7:1`), `https://esm.sh/@supabase/supabase-js@2` and `https://deno.land/std@0.168.0/http/server.ts` (`handle-contact:1-2`) — and there is no `deno.json` or import map in the repo, so the check resolves remote dependencies on defaults. The CI step therefore inherits third-party availability as a gate dependency; say so in the docs instead of presenting the step as hermetic.
- **The glob is adequate today and silently insufficient later.** `supabase/functions/**/*.ts` does resolve all three current files in plain bash without `globstar` (verified 2026-09-30 — every file sits exactly one directory deep), but a file at depth three would match nothing and the step would pass having checked less. Echo the resolved file list in the step so its count is visible in the CI log.

### Story 2.1: Q-4 data-source feasibility spike

As the owner,
I want a time-boxed spike verifying whether the Fantrax API (preferred) or nba.com scraping (fallback) can actually deliver series statuses and game scores,
so that Story 2.4 builds on a confirmed source instead of the PRD's unverified assumption.

**Acceptance Criteria:**

**Given** a time-box (≤1 week) and a written spike script kept out of production paths
**When** each candidate source is probed for: current playoff bracket, series status, per-game scores (home/away), and historical consistency with the archive schema
**Then** a decision record lands in `_bmad-output/implementation-artifacts/` naming the chosen source, its rate/auth constraints, and the exact fields mapped to `series` / `series_game_scores`
**And** if BOTH sources fail: the decision record invokes the manual_csv floor (Story 2.3) as the inseason plan and flags the PRD phase-blocker note on FR-21 for the owner
**And** the decision record also carries the read-only archive audit (proposal §4.10): `series` left-joined to `series_game_scores` grouped by series, plus every row with `winner_team_id IS NULL` — the derivation Story 2.2 builds on only holds if each archived series has seven score rows and a decided winner, and it settles the 177/178/172+5 documentation discrepancy with one measured number. **Ran 2026-09-30** (`decision-2-1-q-4-data-source.md`, `scripts/spike-2-1/audit-archive.mjs` exit 0): **178 `series` rows, 1,246 `series_game_scores` rows, every series exactly seven score rows**, 0 NULL scores, 0 NULL per-game winners, 0 ties, 0 `game_number` outside 1–7, 0 duplicate `(series_id, game_number)` — AD-4's derivation premise holds on the data as it stood. The pin: **177 = the source-spreadsheet figure, 178 = the live table, 172+5 = AD-7's prerender route split.** That the live table sits one row above the spreadsheet is not reconciled row-by-row anywhere; settling that is a dashboard read (`SELECT count(*) FROM archive.game_sevens` against `SELECT count(*) FROM public.series`), since agent reads of production are not authorized
**And** no production code ships from this story

**The candidate list changed before the spike ran (owner call 2026-09-30).** The documentation the owner supplied for the *preferred* source — Fantrax REST API v1.8 (Beta) — is **fantasy-league scoped and cannot feed `series` / `series_game_scores`**, because no endpoint in it returns a real NBA game score. Mapping it against the four probes above: `getMatchupScores` returns each fantasy team's **fantasy point total** for a head-to-head *scoring period* (its own wording: "their fantasy point total for the period"), not a game result with home/away sides; `getLeagueInfo`'s `playoffs` element is **configuration** (`used`, `numPlayoffTeams`, `firstPlayoffPeriod`), not a bracket; there is no series-status surface at all; and auth is a `userSecretId` copied from a user-profile screen with **no documented rate limits** on a doc that describes itself as a draft. This is 2.1's evidence arriving early, not a re-decision of Q-4 — the architecture recorded the same doubt at authoring time (`architecture-predictgame7-2026-09-23/.memlog.md:20`: "Fantrax API current status NOT confirmable via search — Q-4 spike stays a hard prerequisite").

So the spike targets, in this order: **(1)** the **nba.com** route — free, unkeyed, `nba_api`-style CDN JSON endpoints, whose Cloudflare/rate-limit risk the spine already documents — as primary; **(2)** **one keyed real-NBA-data provider** as the alternate, recording that a vendor key becomes a Story 2.6 Actions secret and a tier/cost decision, which is a cost to state rather than a blocker; and **(3)** `manual_csv` as the floor, unchanged. **Fantasy Fantrax stays in the decision record as a ruled-out candidate with the reason above** — it is not silently dropped, or a future reader will re-propose it from the PRD's FR-21 line. Drive every probe by the requirement the ruled-out doc could not meet: a **per-game, home/away, real score** for each game of a current playoff series, plus a way to certify a series is **exactly 3–3** (AD-4's row-birth condition) and a way to learn that Game 7 has been played and won.

### Story 2.2: Schema prerequisites + derived phase on the read path

As the owner,
I want the uniqueness guards the pipeline depends on — UNIQUE(year, team_a_id, team_b_id) on `series` (AD-5 as amended 2026-09-30 by `sprint-change-proposal-2026-09-30.md`; `round` deliberately outside the key, no CHECK) — and every consumer of a series' phase reading the derivation instead of the vestigial `status` column (AD-4 as amended 2026-09-29),
so that upserts are idempotent and no client branch still speaks the un-cascaded two-table language before any automated writer touches the tables.

**Acceptance Criteria:**

**Given** the migration is applied off-playoff (currently satisfied — 2026-09-30 is offseason). The §4.10 archive audit **ran** in Story 2.1 on 2026-09-30 and the story is at the owner's review: it measured **178 series rows / 1,246 score rows / every series exactly seven rows / zero integrity anomalies**, so the table-wide total is settled at 178 (AD-7's `172+5` prerender split is one short of it and still needs the owner's featured list re-pinned — not this story's work). Build this story against the measured numbers, and re-run `scripts/spike-2-1/audit-unique-key.mjs` as the migration's pre-flight
**When** a duplicate `(year, team_a_id, team_b_id)` insert is attempted, and separately when the *same* matchup arrives with the team slots swapped
**Then** the duplicate is rejected by the database, and the slot-swapped insert is rejected by **the runner's pre-commit identity assertion** — the constraint cannot enforce the `team_a` = game-1-home convention (measured: `team_a_id` is game 1's home team in 178/178 rows, and `team_a_id > team_b_id` in 80, so there is no canonical id ordering) **[annotation 2026-10-01: the first measurement is falsified — for archived rows `team_a_id` is the series winner and `home_team_id` is not a venue; see `sprint-change-proposal-2026-10-01.md` §1. The no-canonical-ordering conclusion and this story's guard stand unchanged]**, so that half of the guard is pipeline-side and exits non-zero (AD-4 §4.2(b)'s mechanism, not a trigger)
**And** `round` values outside the adapter's mapping are **not** rejected by the database — no `round` CHECK ships in this story, and the 17-value vocabulary is Story 2.4's responsibility
**And** the `00007` five-column index `idx_series_identity` is dropped in the same migration that adds the UNIQUE (it is the same identity minus `round` and `status`, and it cannot survive `status`'s removal), and the new constraint is **satisfiable by all 178 existing rows** — that measurability is what makes the migration safe
**And** `status`, `chk_series_status` **and the column's `DEFAULT 'historical'` are dropped in this migration** — owner decision 2026-09-29 (§4.2(a)): no documented vestige, because a defaulting column would keep mis-tagging new pending rows and `types.ts` would keep carrying a field with no meaning
**And** every client branch that read `status` now reads the derivation through **one shared helper**: `HistoricalPage.tsx:40` → `.not('winner_team_id','is',null)`; `PredictPage.tsx:167/:396/:408`, the `:712-717` guard and the `:778` label → derived from `series_game_scores` + `winner_team_id`, and `status` leaves the `SERIES_SELECT` field list at `PredictPage.tsx:37`; `types.ts:34` loses `'historical' | 'active' | 'completed'` and `'completed'` dies with it
**And** the helper is **defensive** per AD-4 §4.2(b): a series that does not reconcile (a winner with fewer than seven score rows, or any other impossible shape) is excluded from both picker groups and reported, never guessed into one — enforcement itself stays with the pipeline's pre-commit assertion plus its non-zero exit, not a DB trigger
**And** `HistoricalPage.tsx:310-311`'s user-visible "Series Status" readout is **removed** — owner decision 2026-09-30, closing this AC's open clause. The argument: under derivation that detail sheet can only ever open rows the page's own predicate already decided (`winner_team_id IS NOT NULL`), so any truthful value there is the same word on every series, permanently — the field cannot carry information. It is **not replaced**: the same sheet already renders the seven game tiles (`:281-296`) and a "Series Winner" block (`:305-306`), so the proposed "Game 7: 104–99" would duplicate tile G7 and a series-record label would duplicate the winner. Delete the right-hand `<div>` at `:309-312` and let the winner block span the row; no new copy, and nothing else on the page reads `status`.
**And** the dead two-table remnant `src/pages/CurrentGame7sPage.tsx` is gone — **deleted 2026-09-29 under the owner's go-ahead** (§4.9), ahead of this story; it was unrouted, unimported, and held the repo's last `.eq('status','active')`. Gate green after the removal (116 tests / 11 files). If any `status` read path still exists, it is in scope here
**And** the helper is unit-tested against fixture rows covering six-and-null (pending), seven-and-set (archive), and six-and-set (the anomaly that must be excluded and reported)
**And** `docs/CURRENT_DATA_MODEL.md` is updated in the same commit as the migration
**And** post-migration verification: the archive still reconciles (FR-19) against Story 2.1's measured numbers — 178 series, 1,246 score rows, every series exactly seven — and with nothing pending the Predict flow shows an empty non-breaking Active group (FR-2) with `EXPERIENCE.md:112`'s copy intact
**And** before touching production, the migration is applied and verified in a throwaway database from a full `supabase db reset` replay, to confirm `00007`'s `ON CONFLICT (year, round, team_a_id, team_b_id, status)` target still resolves at its own point in the replay order (replay is ordered, so a later `status` drop cannot break the earlier backfill — verify that rather than assume it)
**And** `npm run gate` passes

**Deleted as work items:** the `('active','completed')` CHECK, the `'historical'→'completed'` backfill, and the status-domain frontend flip. This story **removes** the stored value domain rather than redefining it (`status`, its CHECK and its default all go), so the migration is subtractive plus the uniqueness guards — and the flip it ships is a predicate change, not a data change.

### Story 2.3: Pipeline runner + SeriesDataSource port + manual_csv floor

As the owner,
I want the pipeline runner (`supabase/scripts/pipeline/`) built against a documented `SeriesDataSource` port interface (`fetch_series_statuses`, `fetch_game_scores`) with manual_csv implemented first,
so that the pipeline works end-to-end on day one regardless of what Story 2.1 concludes, and any source can be swapped in behind the port.

**Acceptance Criteria:**

**Given** `SERIES_SOURCE` env selects the adapter (fantrax | nba_com | manual_csv; default manual_csv)
**When** the runner executes against a CSV of series + game scores
**Then** upserts into `series` / `series_game_scores` are idempotent — `series` on `(year, team_a_id, team_b_id)` via the client's `onConflict` target, `series_game_scores` on `(series, game_number)` — and re-running the same input changes nothing
**And** the runner **asserts series identity before inserting**: the `(year, team_a_id, team_b_id)` pair must be absent **in either slot order**, because the UNIQUE enforces the pair as stored and cannot enforce the `team_a` = game-1-home convention (Story 2.1 measured it in 178/178 rows, with `team_a_id > team_b_id` in 80), so a slot-swapped re-insert of a matchup already on the table is a bug this assertion catches and exits non-zero on **[annotation 2026-10-01: that 178/178 figure restates `00007`'s backfill rather than measuring the archive — archived `team_a` is the series winner and archived `home_team_id` is not a venue (`sprint-change-proposal-2026-10-01.md` §1). The either-slot-order assertion this AC requires is unaffected, and its archive guard (`plan.ts:382-390`) stays exactly as shipped — Story 2.8's `00016` deliberately does not route through it]**
**And** the runner implements AD-4's atomic birth (`certified 3–3` → one `series` row + its six `series_game_scores` rows, `winner_team_id` NULL) and completion (Game 7 score appended and `winner_team_id` filled, in one transaction) — a row it would create with content not yet ready is a bug, not a state
**And** no step ever writes `series.status` (AD-4: phase is derived)
**And** the runner **asserts the derivation's invariant before committing** — a winner implies seven decided score rows, a null winner implies exactly six with a 3–3 split — and a violation exits non-zero rather than writing (AD-4 §4.2(b): this assertion, plus Story 2.2's defensive read, is the enforcement mechanism; no DB trigger)
**And** the `service_role` key comes from environment only (never committed, never in client-visible `VITE_*` vars — NFR-S1)
**And** any failure exits non-zero with a clear message (SM-4 hook for Story 2.6)
**And** a dry-run mode computes and asserts the plan in memory, prints it, and issues **zero** writes (operator convention for playoff-week confidence) **[wording corrected 2026-10-01, closing the matching `deferred-work.md` item: the previous "previews changes in a transaction-wrapped session without committing" is unreachable over `supabase-js` — PostgREST exposes one statement per HTTP call and gives a client no session to roll back. Per-operation atomicity comes from `00015`'s one `SECURITY DEFINER` RPC per write; what Story 2.3 shipped is the stricter behavior, not a shortfall. `epic-2-context.md:43` already carried this correction]**
**And** the port interface is documented in `_bmad-output/implementation-artifacts/` with the manual_csv adapter as reference implementation
**And** the legacy `supabase/scripts/load-games/main.py:60` write to the archived `game_sevens` table is fixed or that script formally retired here — no runner step may leave archive writes pointing at a table nothing reads

### Story 2.4: Automated adapter per the spike decision

As the owner,
I want the winning source from Story 2.1 implemented as a `SeriesDataSource` adapter,
so that inseason updates need no human in the loop.

**Acceptance Criteria:**

**Given** the Story 2.1 decision record (or, if closed by the decision record itself, the manual_csv-only plan stands and this story is marked resolved-by-2.1)
**When** the adapter is wired via `SERIES_SOURCE` and run against live source data
**Then** it maps source fields to the schema exactly as the decision record specifies, with the same idempotency, env-secret, non-zero-exit, and dry-run behavior as Story 2.3
**And** it owns the `round` vocabulary that Story 2.2 deliberately left ungated by the database: it derives `round` from the bracket into one canonical display value per series, and it **never rewrites** the 17 era spellings already archived — old rows stay as written, and `getRoundImportance` (`src/lib/nba-utils.ts:49-65`) stays substring-tolerant so both vocabularies render
**And** it maps the higher seed to `team_a_id`, so the slot convention that `UNIQUE (year, team_a_id, team_b_id)` cannot enforce holds for every row this adapter writes (Story 2.1 measured `team_a_id` = game 1's home team in 178/178 archive rows) **[annotation 2026-10-01: that measurement restates `00007`'s backfill — archived `team_a` is the series winner (`sprint-change-proposal-2026-10-01.md` §1). The rule this AC asks for stands: both adapters supply game-true home/away, so every row written from here on carries real venues. Decision 11's archive freeze — this adapter fetches only the postseason derived from the run's UTC date, and `plan.ts`'s guard refuses an archived-year drill — stays in force; `00016` lifts it once, in a migration rather than in this adapter, for the Game-7 venues of the 160 NBA/BAA series]**
**And** it is exercised against at least one real current-or-recent playoff series and cross-checked against nba.com box scores
**And** manual_csv remains available as the fallback floor — the automated adapter never removes it

### Story 2.5: Insights cache refresh

As a fan browsing Insights (Rhian, UJ-3),
I want insight values recomputed from the archive whenever the pipeline finalizes data,
so that pattern cards never show stale or hard-coded numbers.

**Acceptance Criteria:**

**Given** the pipeline run filled at least one winner — a completion, or a birth carrying its Game 7 follow-up (AD-4: that write *is* the `active`→archive transition) — **and migration `00016` (Story 2.8) is already applied**. *Trigger narrowed 2026-10-01 by the owner (`spec-2-5-insights-cache-refresh.md`, frozen block): a purely offseason run that fills no winner refreshes nothing*; the earlier "completes an offseason run **or** fills a winner" phrasing is retired
**When** the refresh step executes
**Then** `insights_cache` is recomputed from `series` / `series_game_scores` over **one shared population** — archived series (`winner_team_id IS NOT NULL`), each one's **game-7 row**, `league IN ('NBA','BAA')` (FR-12): Game 6 winner impact and average Game 7 margin over the 160 NBA/BAA Game 7s, and **home-court advantage only under the same league filter — `00016` is what makes an NBA/BAA Game-7 `home_team_id` a real venue**. The 18 ABA series stay out of all three cards, and no card reads `home_team_id` from any archived game other than game 7 of an NBA/BAA row (AD-5 as amended 2026-10-01). Measured expectation for the home card over the backfilled archive: **117 of 160**
**And** **a short footer at the foot of `/insights` states the sample set those denominators come from** — added 2026-10-02 by owner decision U4 ("Maybe a text footer, a short one to explain the sample set for the insights?"), and it is this story's half of the 178-vs-160 reconciliation Story 2.10 D3' accepted as a consequence. One sentence, static, no control and no event: the count it prints is read from the cached `total_game_sevens` the same refresh wrote (`InsightsPage.tsx:9,14`), never a literal, and the sentence names the set by league rule (NBA and BAA Game 7s) rather than counting what was excluded — so nothing in it can drift from the denominators above. It sits on the page's own type scale (`text-on-muted`, not `muted-foreground`, so it clears AA at small size without waiting on Story 5.2). It does not live in `HistoricalPage` — that page's explanation is the in-record gloss of Story 2.10, and the two surfaces reconcile by stating the same population, not by sharing a component
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
**Then** results matrix recorded in `_bmad-output/implementation-artifacts/`: Active Series render distinctly from Historical (FR-2) **through the derivation** — a pending series appears because it has six score rows and a NULL `winner_team_id`, not because a flag says so, and the same series leaves the Active group and enters the archive on the single write that fills the winner; scores update after a run; the archive still reconciles at the count measured in Story 2.1 (FR-19) — **178 series / 1,246 score rows / seven each, now with the league composition pinned by `00016` at 159 NBA + 1 BAA + 18 ABA (NBA/BAA combined = 160) and 117 Game-7 home wins over the 160 NBA/BAA series (Story 2.8's post-apply facts; the 178 total is unchanged and remains the prerender route basis; `spec-2-8` D4 corrects the earlier `160 NBA + 1 BAA + 18 ABA` wording, which sums to 179)**; and the Story 2.9/2.10 league chip and record gloss are exercised on the same drill, so the archive's 178 and the insight cards' 160 denominators are shown side by side rather than inferred — **shown, not filtered: Story 2.10 deleted 2.9's league control, so the drill reads the announced 178 total, the chips on the 19 non-`NBA` rows, and the gloss sentence inside a chipped record as the three things that reconcile the pair**
**And** the matrix re-scores `qa-matrix-1-5.md §6.5` against the derivation: option **(c)** (CDP response override) fakes **six score rows + null winner** rather than a status flag — a shape the server would actually accept — and option (a)'s warning stands (the picker query is unfiltered, `PredictPage.tsx:133-136`, so a seeded row is live to every visitor the instant it exists)
**And** the drill asserts the pending-Game-7 data reach on Home (a pending series is present and its card resolves to that series' preview page); the visual treatment is owned by **Story 4.5** (owner call 2026-09-29, §4.9) — 2.7 proves the data arrives, not how it looks
**And** a failure drill: pipeline forced to fail → notification received within one cron cycle
**And** any failures found are fixed or filed as issues before the epic is marked done

### Story 2.8: Archive league identity + Game 7 venue backfill

As the owner,
I want the archive to record which league each series was played in, and who actually hosted Game 7 in the 160 NBA/BAA series,
so that the insight cards can count a real, defensible population instead of a statistic that returns 100% by construction. Added by `sprint-change-proposal-2026-10-01.md` (the Tier B lift of Story 2.4's Decision 11 archive freeze, owner calls 2026-10-01); it unblocks Story 2.5 and is the prerequisite of Story 2.9.

**Acceptance Criteria:**

**Given** the live archive as measured — 178 `series` rows, 1,246 `series_game_scores` rows, seven each, nothing pending — and `docs/NBASeriesResults.xlsx` as the committed source whose dropped `League` column this story restores
**When** migration `00016` is rehearsed and then applied
**Then** the throwaway ordered replay of `00001`–`00016` exits 0 with `scripts/rehearse-migration-00014.mjs` at `COVERED_THROUGH = 16`, and every guard below is **executed** against the replayed archive, not merely present in the SQL — a guard that cannot fail is not a guard

**And** `series.league` exists as `NOT NULL` with `DEFAULT 'NBA'` and `CHECK (league IN ('NBA','BAA','ABA'))`, added nullable → backfilled → then constrained, and the replayed archive splits exactly **159 NBA + 1 BAA + 18 ABA = 178** with zero NULL rows — **160 is the NBA/BAA *combined* population, not an NBA count** (corrected 2026-10-01 by `spec-2-8` D4, which found the earlier `160 / 1 / 18` wording sums to 179 and cannot hold)
**And** the hand-curated source is the single committed file `supabase/scripts/pipeline/data/game7_venues_curated.csv` (inside the re-included data directory), one row per archived series — 178 rows, `year,team_a,team_b,league,game7_home_team` — with `game7_home_team` **blank for the 18 ABA rows**, because a blank is how "games 1–6 stay unknown" and "the ABA is out of scope" are written down rather than implied
**And** a committed generator emits the migration's `VALUES` blocks from that CSV, and the rehearsal **fails if the migration's embedded lists and the CSV disagree in either direction** — two copies of 160 hand-typed values with nothing checking them against each other is the failure mode to prevent
**And** every curated row resolves to exactly one series through `(year, unordered team pair)` via `teams.abbreviation`, and any row matching zero or two series aborts the rehearsal naming the row — `round` is never a key here (17 era spellings, deliberately ungated since Story 2.2)
**And** for the 160 NBA/BAA series the **game-7** row names the curated home team and the other slot as away, **with `home_score`/`away_score` swapped alongside their teams** where the real home team lost (`00007:194-204` wrote `home_score` = the series winner's score, so ≈43 rows swap), and `winner_team_id` is **never** written
**And** after the update, all 1,246 rows still satisfy `winner_team_id` = the higher-scoring side, and all 178 series still satisfy `series.winner_team_id` = their game-7 winner — AD-4's derivation must survive the data change intact
**And** Game 7 home-team-wins over the 160 equals **117** (nba.com's published 117–43, over the same 160-series population). If it lands 116 or 118, the story resolves in writing **before the owner applies** which one it is — a mis-curated row, or the published as-of date excluding the 2026 Finals Game 7 — and relaxing or deleting the guard is not an acceptable resolution
**And** no statement in `00016` touches `game_number <> 7`, and the 18 ABA game-7 rows are left exactly as archived
**And** `00014`/`00015`, `plan.ts`'s never-rewrite-an-archived-outcome guard, and both adapters' fetch scope are unchanged: the venue list reaches the database **through this migration**, not through a pipeline run, because a run of the `manual_csv` floor against archived series aborts by design (`plan.ts:382-390`) and that is the freeze working, not a defect to route around
**And** `docs/CURRENT_DATA_MODEL.md` is updated **in the same commit** as the migration (the standing rule), replacing "The archive carries slots, not venues" and "the freeze stands as written" with the post-`00016` boundary — and stating plainly that archived `home_team_id` means a venue **only** on game 7 of an `NBA`/`BAA` row, so no later reader repeats the measurement this story corrects
**And** `seriesdatasource-port.md` gains one sentence in its `manual_csv` section: the floor writes live playoff rows only and is not a backfill vehicle, with a pointer to `00016`
**And** the agent touches no production data: it runs the rehearsal, records its output, and hands the owner `npx supabase db push` — the apply stays the owner's explicit action, as with `00014` and `00015`
**And** `npm run gate` passes, with the known coverage gap stated rather than glossed: no local step type-checks `supabase/scripts/**` beyond `tsc -b`'s reach, `scripts/**` is checked by none of the four, and a migration is verified only by the throwaway replay

### Story 2.9: League chip and filter on the archive surface

> **Superseded in part by Story 2.10 (owner review, 2026-10-02).** The read-path close, the stored-value-verbatim rule and the AA floor all stand as written below and shipped. The **surface** was renegotiated on the owner's call after previewing it: the chip is conditional (`NBA` renders none — `:456` as written put one on all 159 NBA rows), the gloss's carrier is static text inside the record of a chipped row — neither an always-visible line nor the filter-row trigger 2.10 first built, which the owner cut on reviewing that build the same day (`:457` left the choice open; this is how it landed), and the league **filter** (`:458`) and its `filter_type: 'league'` event (`:459`) are **deleted, not replaced** — FR-10's filters stay year and team. The text below is kept as the record of what shipped in `ad184e5`, not as an open contract.

As a fan browsing the Historical Archive,
I want to see which league each series was played in and to filter by it,
so that a 178-series archive and a 160-series insight denominator do not read as a contradiction. Added by `sprint-change-proposal-2026-10-01.md` Call 3, which places it in Epic 2 beside the refresh that makes the 160 visible rather than deferring it to the sharing epic.

**Acceptance Criteria:**

**Given** Story 2.8's `00016` is applied — **hard ordering, not preference**: a client that selects `league` against a table without the column gets `HTTP 400 42703` and the archive fails to load, so this story's build ships only after the migration
**When** `/historical` renders
**Then** each series row and the expanded series record carry a league chip showing the **stored** value (`NBA` / `BAA` / `ABA`) — never derived, never inferred, and `BAA` is not silently relabelled as `NBA`
**And** one honest explanation of `BAA` (1946–49, the league the NBA counts as its own) is reachable — tooltip or one-line legend — with the wording owned by this story and the floor pinned here, because a bare "BAA" chip is unparseable to a fan and the archive has no glossary to hang it on
**And** a league filter sits beside the existing year `Select` (`HistoricalPage.tsx:118-130`) and team search (`:140`), intersects correctly with both (FR-10's combined-filter rule), and resets the visible page counter the way the year filter does
**And** it emits the **existing** `historical_filter_applied` event with `filter_type: 'league'` and the league value, from the same call site the year filter uses — **no new event name** (addendum §A.1's ten names stand until FR-25 is re-pointed), and no new `posthog-js` import (Story 3.1 owns moving these call sites behind the analytics port)
**And** NFR-A1 / WCAG 2.1 AA on the new surface: keyboard-reachable, the control has an accessible name, the changed result set is announced or re-announced, contrast compliant at chip size, and no automatic scroll is introduced on selection (the owner's established behavior for this app)
**And** **no route list, page count or prerender input changes**: the filter is client-side over an already-fetched archive, all 178 series keep their pages, and the 18 ABA rows stay in the archive and in the SEO set (AD-7's caveat 2026-10-01)
**And** the game tiles' rendering is untouched (`HistoricalPage.tsx:282-298`): `00016` moved no pixels there — the read path already derives team-relative scores from home-relative rows via `home_team_id === team_a_id` (`:91-92`, `:284-286`, and `PredictPage.tsx:317-319`, `:328`, `:670-676`) and displays no home/away label — and this story does not either
**And** an empty filtered result reuses the existing "No series found matching your filters." (`:236`) — no new empty state
**And** component tests run in the repo's per-file jsdom convention and **assert no computed accessible name** (AGENTS.md: `dom-accessibility-api` inserts a separator Chrome's accname does not, so `getByRole({ name })` can stay green on a tree real AT reads as fused); names are settled over CDP with the existing harness or with real AT
**And** `npm run gate` passes

### Story 2.10: NBA-by-default archive rows, with the league gloss inside the record that needs it

As a fan browsing the Historical Archive,
I want the league marker only where it explains something and the explanation with the row that needs it,
so that the archive reads as NBA history with two annotated exceptions rather than as a filtered league database. Renegotiates Story 2.9's surface after the owner reviewed it in preview on 2026-10-02; spec `spec-2-10-nba-by-default-league-chip-and-in-record-gloss.md`.

> **Renamed on the owner's call, same day (2026-10-02).** This story was titled "Conditional league chip and gloss popover" — the name of its *first* answer to 2.9, which the owner then reviewed in preview and re-cut before any push: the gloss became static text inside a chipped record and the chip's guard moved in front of the element, so no popover exists to name. The title, the `sprint-status.yaml` slug and the spec filename (`spec-2-10-nba-by-default-league-chip-and-in-record-gloss.md`) all now describe what ships, and every pointer to the old name was rewritten in the same pass — `spec-2-9:14`, `epic-2-context.md:18`, `deferred-work.md:384/386/392`, `sprint-status.yaml:103` and this story's own spec reference below. Nothing else moved — the decisions, the ACs and the Verification Log are the same record, and `sprint-status.yaml` keeps the story's history in its comment block rather than in its key.

**Acceptance Criteria:**

**Given** Story 2.9's read-path close (`league` declared on `Series`, named on both projections) — it stays, because the chip still reads the column
**When** `/historical` renders a series whose stored `league` is `NBA`
**Then** no chip renders in the row or in its expanded record, and the 19 rows that are not `NBA` (`1948` `BAA`, the 18 `ABA`) carry theirs verbatim; a league value outside the three still renders rather than being silenced
**And** **no league control exists on the surface**: no `Select`, no toggle, no `filter_type: 'league'` capture — the filters are FR-10's year and team, intersecting as they did before 2.9, and the year list covers the whole archive (`1972` included, since that row is listed and carries its chip)
**And** the two-league gloss is **static text inside the expanded record of a series that carries a chip**, verbatim from Story 2.9 D2, and nowhere else on the surface: no trigger, no `Popover`, no standing legend line. It was behind a filter-row trigger until the owner's same-day review of the built story — BAA/ABA history is trivia to an audience here for the modern game, so the explanation belongs where a reader is already looking at an exception row. (A tooltip was rejected earlier and stays rejected: `@radix-ui/react-tooltip` returns on `pointerType === 'touch'`, and `EXPERIENCE.md` bans hover-only affordances — static text satisfies both by construction.)
**And** the archive opens on all 178 series and announces that count while Story 2.5's denominators read 160; the chip and the gloss, not a control, are what reconcile the two — the consequence the owner accepted with this call, and it is recorded as a comment at `HistoricalPage.tsx:84-98` so the pair is never "fixed" silently from either side
**And** NFR-A1 / WCAG 2.1 AA holds on the new surface: the chip and the gloss sentence sit on `text-on-muted` (#595959) not `muted-foreground`, the result set is still re-announced through the existing live region, and nothing scrolls the page on selection
**And** no route list, page count, prerender input, PostHog event **name** or `supabase/` file changes; the game tiles stay untouched
**And** `npm run gate` passes

### Story 2.11: Search the archive by the stored team abbreviation, over the series foreign key

As a fan looking for a franchise's Game 7s,
I want the abbreviation on the row to be the abbreviation the search accepts,
so that typing a franchise's code finds its series instead of a substring of its name. Raised by the owner 2026-10-02 while reviewing Story 2.9's surface (`/historical` typed `SAS` returned only Kansas City); routed here rather than folded into 2.10 because the measured change is materially bigger than "add a field to the predicate". **Re-cut the same day by the owner's U1/U3 calls — the search reaches the `teams` row through the series foreign key, and the name-substring noise stays.**

**Acceptance Criteria:**

**Given** the predicate today is `HistoricalPage.tsx:109-112` — `full_name` substrings only, never the `teams.abbreviation` the FK row carries — and the whole teams row is **already in the payload** (`:64` embeds `team_a:team_a_id(*)`, `Team.abbreviation` is declared at `src/types/types.ts:4`), so this costs no query change
**When** a fan types a stored code
**Then** it matches on the FK's `abbreviation` as well as the name: `SLB` returns the St. Louis Bombers and `WSB` returns the Washington Bullets — measured 2026-10-02 against `00007:32`/`:37` (stored `SLB`/`WSB`), where today both queries return nothing because neither string is a substring of "St. Louis Bombers" or "Washington Bullets". Pinned against the live per-code counts from the same day (`SAS` 14, `OKC` 7, `KCK` 1, `SLB` 1, `NY` 19). **Owner decision U1: "the team_id is a foreign key to this table's primary key, so that connection should be used."**
**And** the name path is **not** narrowed, and the `SAS`→Kansas City hit is **accepted rather than fixed** — owner decision U3 2026-10-02: "Current version is fine with Kansas showing for SAS, people would most likely want the most recent results anyway, which we show by default." That premise holds and is verified here, not assumed: the list sorts year-descending at `:72-74`, so the newest matching series is the first row a fan sees. This AC **retires** the earlier "the false positive is fixed, not merely outgrown" line.
**And** the display half is settled with it, because a code you can type must be a code you can see: the row prints `getTeamAbbreviation(full_name)` at `:207-208` — measured to render `WB` for the stored `WSB` Bullets and `SS` for the stored `SEA` SuperSonics, diverging on **39 of 178 rows** — so the archive row switches to the embedded `teams.abbreviation` and the search and the row read the same column. FR-11's era-appropriate-identity rule governs it (`identity resolution never silently substitutes a modern franchise for a historical one`), and `teams` holds one row per era identity, so the stored code is the era-appropriate one.
**And [OPEN — the one owner call left]** whether `getTeamAbbreviation`'s uses on `PredictPage` change in this story, or the archive changes alone and Predict keeps the name-derived code. Measured 2026-10-02: **16 calls on 14 lines** (`:423,424,430×2,492×2,1175,1180,1191,1211,1212,1275,1280,1291,1311,1312`), of which **14 calls on 12 lines are live** — `:1175` and `:1180` sit inside the commented-out Matchup block at `:1171-1182`, so they are not call sites a change has to survive. What the live ones are shapes the decision: nearly all of them can be handed a **fan-typed custom name** — `:423,424` read `customInput.team_a/b` when `selectedSeries.source === 'custom'`, and `:1160-1163` falls back to `customInput` whenever the prediction carries no team, feeding `:1191`/`:1291` and the six name slots at `:1211,1212,1275,1280,1311,1312` — and a custom name has no `teams` row, so no stored abbreviation exists to print. The helper therefore survives as the fallback path under any answer; only the DB-backed renders (`:430`, `:492×2` — `abbreviation` is already in `SERIES_SELECT` at `:41-43`) are actually in play. Decided at 2.11's planning turn, not here.
**And** the existing `historical_filter_applied` event keeps its name and its `filter_type: 'team_search'` value — no new event (addendum §A.1), and the call site moves behind the analytics port only in Story 3.1
**And** tests pin the behavior per fixture, with no assertion on a computed accessible name (AGENTS.md accname rule)
**And** `npm run gate` passes

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

Re-verified live on the `0.2.3` deploy (2026-09-26): a cold GET on `/predictgame7/predict` and `/predictgame7/historical` still returns the GitHub Pages 404 page; only the basename root serves `index.html`, and the repo carries no `public/404.html`. The shipped route surface is `/predict`, `/historical`, `/insights`, `/maths` plus query-string series selection (`/predict?series=<id>`) — there is no `/series/<id>` path today, so this story introduces it as an alias alongside the existing query form, and the fallback must serve every route above, not only the new one.

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
I want every archived series — AD-4's derived phase, `winner_team_id IS NOT NULL` — prerendered at build time to `dist/series/<id>/index.html` (AD-7),
so that the full archive (count pinned by Story 2.1's audit) is crawlable without JS and ranks year-round (evergreen SEO substance).

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
**And** this story inherits deferred-work **D3**, the `PredictPage` request-path rebuild its Share button sits on top of (owner decision 2026-09-29, Epic 1 retro §F). Four things, one change: a derived `Partial<PredictionInput>` form type exported from the frontend door plus typed payload builders, retiring `seriesInput: any`, the two `as PredictionInput` casts and the twelve `undefined as any` custom-form fields; the method-card `switch (selectedMethod)` description moved into a `Record<MethodSlug, string>` in `src/lib/method-display.ts`; the dead `PredictionFailure['invalid-input']` arm deleted or wired, with the Story 1.3 Spec Change Log annotated to match; and the duplicated validation and advisory-string paths (`validateScores` in `PredictPage.tsx` vs `src/lib/custom-matchup.ts`) collapsed to one request path and one failure vocabulary

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
**And** this story also owns the pending-Game-7 **Home highlight's visual treatment** (owner call 2026-09-29, `sprint-change-proposal-2026-09-29.md` §4.9): a **div on Home, not a route** — `CurrentGame7sPage.tsx` is deleted — presenting the certified 3–3 series' context and the drama, with its card resolving to that series' preview page (`/series/<id>`, UX-DR-2) and a deep-link into the Predict flow. Story 2.7 asserts the *data* reach; the rendering, copy, AA floor (NFR-A1) and responsive behavior (NFR-U1) are decided here. It is a highlight of an already-derived pending series — no new data state, and nothing that reads `status`

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
