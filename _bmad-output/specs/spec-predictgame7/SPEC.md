---
id: SPEC-predictgame7
companions:
  - ../../planning-artifacts/prds/prd-predictgame7-2026-09-22/prd.md
  - ../../planning-artifacts/prds/prd-predictgame7-2026-09-22/addendum.md
  - ../../planning-artifacts/architecture/architecture-predictgame7-2026-09-23/ARCHITECTURE-SPINE.md
  - ../../../AGENTS.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Spec: Predict Game 7 — Pre-Playoff Platform (2027 Traffic Gate cycle)

## Why

An opportunity with a deadline. When FiveThirtyEight's transparent-model archive was dismantled in 2025–26, the "open, historical, explainable sports models" niche opened up and no one owns the Game 7 / series-decider angle. NBA search demand is brutally seasonal: the Apr–Jun 2027 playoff window is the next proving ground, and whether Predict Game 7 becomes a real product or stays a portfolio piece is decided there (SM-1 Traffic Gate). The force behind this spec: the site must be reliable, live-current via an automated data pipeline, polished, shareable, indexed, and fully measurable **before** the spike arrives — expansion features (accounts, betting-adjacent outputs, video) stay gated behind audience proof. Affected: NBA fans and sports-content creators (users); the solo owner-builder (operator and decision-maker). FR-level detail lives in the PRD companion; this kernel is the distilled contract downstream skills consume.

## Capabilities

- **CAP-1**
  - **intent:** User can generate a transparent win-probability prediction for a Historical, Active, or Custom matchup using any of the four documented Methods, and compare Methods on the same inputs.
  - **success:** FR-1..FR-8 consequences pass: probabilities sum to 100% ±rounding; Contributing Factors + confidence + computation time render for every Method; team-name resolution handles full name/nickname/abbreviation with placeholder fallback; method switch mid-flow loses nothing; failures produce non-breaking, retry-safe error states distinguishing invalid input from service failure.
- **CAP-2**
  - **intent:** User can search, filter, and expand the 177-series Historical Archive and view computed Insight pattern cards.
  - **success:** FR-10..FR-12 consequences pass: combined year+team filters intersect correctly; expanded records show every game per `series_game_scores`; defunct/relocated franchises render era-appropriately; Insight values come from `insights_cache`, never hard-coded.
- **CAP-3**
  - **intent:** Visitors get the product story (Home), the methodology (Maths page), and a working human channel (Contact) that reliably reaches the owner; all shipped copy reads release-quality.
  - **success:** FR-14..FR-18 consequences pass: every hotspot/featured card navigates to a working view; all four Methods documented with formulas matching the Edge Function; contact intake rejects bots via honeypot+timing with writes only through `handle-contact`; Resend notification delivers; `_started`/`_failed` contact events emit; zero mojibake in shipped strings; owner signs off per named surface.
- **CAP-4**
  - **intent:** The system keeps Active Series data current without manual intervention: offseason runs initialize/finalize the postseason bracket; daily inseason runs update statuses and scores.
  - **success:** FR-19..FR-21 consequences pass: runs are idempotent (AD-5 upserts on real keys); after a daily run Predict's Active list reflects latest results; outside playoffs the Active list is empty without breaking; a failed run exits non-zero so GitHub notification reaches the owner (SM-4). Prerequisite: Q-4 feasibility spike (Fantrax preferred, nba.com fallback, `manual_csv` always available).
- **CAP-5**
  - **intent:** All analytics instrumentation flows through one isolated vendor port, so the provider can be swapped or removed without touching feature logic.
  - **success:** `posthog-js` / `@posthog/react` imported in exactly one module (AD-1); the 10 event names from addendum §A.1 fire verbatim; `prediction_generated` remains the source-of-truth for SM-1/SM-2 counts; deleting the vendor touches only `src/lib/analytics/`.
- **CAP-6**
  - **intent:** The owner can read the Traffic Gate figures — window unique visitors, prediction completions, funnel conversion, acquisition-channel breakdown — programmatically for any date range.
  - **success:** FR-25 consequences pass: one query/API/MCP call yields the Apr–Jun 2027 numbers with no dashboard archaeology; share-link arrivals are attributable via the UTM convention (AD-6); the SM-1 unique-visitor definition is pinned in the analytics module's docs before Apr 2027.
- **CAP-7**
  - **intent:** User can share a completed Prediction as a stable link that reproduces inputs + Method + result and unfurls as a preview card in chat and social contexts.
  - **success:** FR-31 consequences pass: opening a Share Link re-renders the prediction with zero re-entry; `og:title/description/image` render on major social surfaces; the link resolves on GitHub Pages (404.html SPA fallback in the build chain, AD-6); arrivals count toward SM-3.
- **CAP-8**
  - **intent:** The historical archive is indexable as per-series evergreen pages, so the site ranks before and during the playoff spike.
  - **success:** AD-7 holds: build emits one static HTML per `/series/<id>` containing real meta, game-by-game scores, and a Predict CTA (no prediction outputs baked in); initial HTML carries full content to a JS-disabled crawler; active/custom routes stay client-rendered.
- **CAP-9**
  - **intent:** The highest-risk Predict paths are protected by automated regression tests so reliability stops regressing between changes.
  - **success:** FR-30 consequences pass: tests cover series selection, custom-input validation, method switching, and error states; a documented catalog of reproduced issue-#3 failure cases maps each to a test or an FR-8 error state; manual QA matrix (historical/active/custom × desktop/mobile) documented and passing.
- **CAP-10**
  - **intent:** Every surface works on mobile and desktop, and core flows meet the committed accessibility bar.
  - **success:** NFR-U1: all six surfaces (Home, Predict, Archive, Insights, Maths, Contact) render and operate cleanly at both viewports before the major release. NFR-A1: WCAG 2.1 AA contrast, keyboard navigation, and screen-reader labeling verified on core flows.

## Constraints

- Free-tier economics until the Traffic Gate (Supabase, GitHub Pages, PostHog; any email provider must have a free tier) — rules out paid hosting, prerender SaaS, and hosted media.
- Legal line, never crossed: no wagers, no odds markets, no guaranteed picks — the product stays "content" law, not gambling law.
- PLANNED-GATED features (accounts FR-9/22/23, betting-adjacent FR-26..29, video FR-13) must not be built without an explicit owner decision — hard stop for every agent downstream.
- AD-1..AD-9 of `ARCHITECTURE-SPINE.md` are binding consistency rules; anything contradicting one is a conflict to surface, never a local override; AD IDs stay stable.
- Secrets (NFR-S1): server keys never in repo, bundle, or `VITE_*`; `contact_submissions` writes only via `handle-contact`; RLS on all public tables; `predictions` private-by-default. (History: one `service_role` leak, rotated 2026-09-22.)
- Privacy (NFR-S2): no PII beyond contact submissions (email + message) and future account data; contact submissions kept indefinitely (manual delete only); analytics ad-blocker blind spot documented, not hidden.
- Platform fixed: web-only static SPA on GitHub Pages + Supabase; NBA-only.
- The 10 PostHog event names (addendum §A.1) stay verbatim until FR-25 metrics are re-pointed.
- Active Series data updates on pipeline cadence only — no live/in-game scoring, ever in this spec.
- Verification gate before any deploy or "done" claim: `npm run build` passes + Biome clean; deploys only when the owner asks (AGENTS.md).

## Non-goals

- Accounts, sign-in, saved predictions, anonymous limits — gated on SM-1; discovery may run in parallel, no build.
- Betting-adjacent outputs (spread/over-under), monetization of any shape (paywall, ads, affiliate links) — gated on SM-1 **and** the Q-2 posture decision.
- Series video content (FR-13) — not scheduled before the gate.
- No social product: no comments, feeds, community; the product never posts on the user's behalf.
- No multi-league expansion (NBA Game 7s only); no per-player box scores or general NBA stats database.
- No live scoring or play-by-play.
- No claim of prediction accuracy — models are explainable estimates, not an oracle.

## Success signal

By Jul 2027 the owner can state, from a single programmatic query (CAP-6): ≥ 1,500 unique visitors in Apr–Jun 2027 with a non-trivial prediction count and share-link arrivals visible — the gate that converts the project from portfolio bet to growth product. During the same window: zero missed contact submissions and zero unhandled pipeline failures (SM-4), and the issue-#3 failure catalog reproduces in zero cases against the regression suite (CAP-9).

## Assumptions

- Spec scope = live baseline + the pre-playoff major release (PRD §8.1), gated features excluded — inferred from the PRD's release-scope section.
- SM-2's 30% funnel target and NFR-P1's 3s P95 are no-basis placeholders carried as provisional, to be re-set once CAP-6 reporting yields a baseline.

## Open Questions

- Q-1: What exactly do accounts do (feature set behind FR-9/22/23)? Owner discovery session pending; blocks nothing pre-gate.
- Q-2: Monetization posture — affiliate vs. premium vs. ads vs. none, and analytics-entertainment vs. picks framing. Decide at gate evaluation, Jun 2027.
- Q-5: Video mechanism (external links vs. hosted) — only if FR-13 is ever scheduled.
- Q-8: `SamplePage.tsx` and the PostHog agent-skill folder — delete or document at the next housekeeping pass.
- Q-9: Is there an accuracy back-test of the four Methods against held-out archive results? Undocumented; a credibility/linkable asset if built.
