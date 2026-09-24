---
title: predictgame7 (Predict Game 7)
status: final
created: 2026-09-22
updated: 2026-09-25
---

# PRD: Predict Game 7
*Live product baseline — reconstructed from repo documentation, code, and owner decisions. Requirement statuses: **[LIVE]** shipped today, **[PLANNED]** committed direction, **[PLANNED-GATED]** committed only after the Traffic Gate (SM-1) is passed.*

## 0. Document Purpose

This PRD is the stable baseline for the live app at https://ujsolon.github.io/predictgame7/, used to triage GitHub issues (#2–#6 open) and future feature requests: every request maps to a numbered FR/NFR here, and "new vs. change" is decided against requirement status. **Triage starts from the issue→requirement map (addendum §E).** Audience: the owner (solo builder) and any AI/agent workflows (epics, architecture, build). Source depth — tech stack, data model, market research, issue mapping — lives in `addendum.md`; facts come from the repo's documentation and code inspection plus owner decisions captured 2026-09-22.

## 1. Vision

Predict Game 7 turns basketball's biggest single game — the winner-take-all Game 7 — into a searchable, explainable, shareable analytics experience. Users explore an archive of every series-deciding game, learn the statistics behind four deliberately transparent prediction models, and generate win probabilities for real historical or active matchups, or for any custom series they invent. Where mainstream tools show a single opaque number, Predict Game 7 shows its work: method choice, contributing factors, confidence level, and computation are all visible, and a Maths page explains each model's formula. Game 7 is, as the original positioning copy puts it, "one of the most emotionally charged situations in sports — a moment where history, pressure, momentum, and probability collide"; the product is built to serve that moment with evidence.

The product is an indie, opinionated analytics destination *and a sports storytelling and discovery experience* — not only a calculator, never a betting market. Its strategic bet (grounded in research, see addendum): when FiveThirtyEight's transparent-model archive was dismantled in 2025–26, the "open, historical, explainable sports models" niche opened up, and no one owns the Game 7 / series-decider angle specifically.

**Timing (Why Now):** NBA search demand is brutally seasonal — traffic spikes several-fold during the Apr–Jun playoffs, and "Game 7" queries spike violently but briefly during live series. The 2027 playoff window is the next proving ground, which makes reliability, an automated active-series data pipeline, and full traffic observability the near-term priorities, with expansion features gated behind audience proof.

## 2. Target User

### 2.1 Jobs To Be Done

- **Settle debates with evidence** — NBA fans in arguments ("would your team have won Game 7?") want an authoritative, shareable number, not a vibe.
- **Understand, not just receive** — prediction-minded users and aspiring analysts want to see *why* a model says what it says (factors, confidence, formula).
- **Explore counterfactuals** — fans invent matchups ("Celtics–Lakers, best-of-7") and want the archive's statistics applied to a series that never happened.
- **Create content** — newsletter writers, YouTubers, and social posters need citable, differentiated facts (the transparent-model angle is linkable) at playoff-season speed.
- **Betting-adjacent curiosity** — some users want projections beyond the winner (margins, totals); owner sees this as the potential monetization seam, *not yet committed* (Q-2).
- **Build a portfolio piece** — the owner also uses this as a portfolio/demo product: if the audience doesn't materialize, that outcome has standalone value (stated 2026-09-22).

### 2.2 Non-Users (v1)

- Bettors seeking guaranteed picks, tips, or a place to wager (no markets, ever — §7 Non-Goals). Note: bettors seeking *transparent projections* remain users (§2.1) — the exclusion is picks-as-advice and wagering, not the betting audience.
- Fans of leagues other than NBA (NBA-only confirmed 2026-09-22; other leagues not in scope).
- Users wanting accounts, communities, or social feeds today (accounts are PLANNED-GATED).

### 2.3 Key User Journeys

*Drafted from documented segments and flows; confirmed by owner 2026-09-22. Persona names illustrative.*

- **UJ-1. Bert, mid-debate at 11 PM, proves his point in ninety seconds.**
  - **Persona + context:** casual NBA fan arguing in a group chat about a historic series.
  - **Entry state:** unauthenticated; arrives from a shared link or searches the site.
  - **Path:** opens Home, taps a featured iconic Game 7 → lands in Predict with the series preloaded → picks a method → runs the prediction.
  - **Climax:** sees winner probability split per team, contributing factors, confidence level — screenshot-worthy.
  - **Resolution:** shares the result back into the chat; the debate ends.
  - **Edge case:** if the model computation is slow or fails, an understandable error state lets him retry without losing his selection (→ FR-8, NFR-R2).

- **UJ-2. Wang, a data-curious season-ticket holder, stress-tests a fantasy matchup.**
  - **Persona + context:** analytics-minded fan who reads box scores for fun.
  - **Entry state:** unauthenticated returning visitor.
  - **Path:** Predict → custom series: types team names (matches by full name, nickname, or abbreviation), enters Game 1–6 scores → compares across two or three methods → opens View Detailed Analysis.
  - **Climax:** sees how different methods disagree and why — the contributing factors make the disagreement intelligible.
  - **Resolution:** leaves convinced this is a tool, not a toy; bookmarks it.
  - **Edge case:** unrecognized team spelling shows placeholder logo rather than breaking (→ FR-3).

- **UJ-3. Rhian, a newsletter writer against a Wednesday deadline, finds a citable stat during the playoffs.**
  - **Persona + context:** sports content creator needing an angle before Game 7 tips off.
  - **Entry state:** unauthenticated; arrives from Google or a Reddit thread.
  - **Path:** browses Historical archive filtered by year/round → checks an Insights pattern card (e.g., Game 6 winner impact) → runs the live Active Series prediction → cites the Maths page for methodology.
  - **Climax:** a specific, sourced, transparent-model number she can defend in print.
  - **Resolution:** publishes with a link back; a future account layer would let her save her working set (→ FR-22/23, gated).

## 3. Glossary

- **Game 7** — a winner-take-all, series-deciding NBA playoff game. The product's sole sports domain.
- **Series** — a best-of-seven playoff matchup; identified by year, round, and two Teams. Carries one row per game in its **Series Game Scores** (Game 1 through Game 7).
- **Series Game Scores** — the per-game records attached to a Series; prediction inputs are Games 1–6.
- **Historical Archive** — the browsable collection of 177 completed series-deciding games from past NBA playoffs.
- **Active Series** — a currently-played, in-progress playoff matchup requiring up-to-date scores. Fed by the **Data Pipeline** (FR-20/21).
- **Data Pipeline** — the automated process (FR-20/21) that keeps Series data — especially Active Series scores and statuses — current.
- **Custom Matchup** — a user-invented Series: two free-typed teams plus user-entered Game 1–6 scores; never stored as a Historical record.
- **Prediction Method** — one of four documented approaches (Logistic Regression, Bayesian Inference, Elo Rating, Exponential Smoothing) selectable by the user; cataloged in `prediction_methods`.
- **Prediction** — the output of running a Method on a Series/Custom Matchup: predicted winner, per-team win probabilities, **Contributing Factors**, **Confidence Level**, and computation time.
- **Detailed Analysis** — the expanded per-method explanation view behind a Prediction.
- **Insight** — a computed historical pattern (e.g., Game 6 winner impact, home-court advantage, average Game 7 margin) served from **Insights Cache**.
- **Maths page** — the educational surface explaining each Prediction Method's formula and concept.
- **Traffic Gate** — the SM-1 playoff-window unique-visitor threshold that unlocks investment in accounts and monetization; below it, the product's future is demo/portfolio.
- **Share Link** — a stable URL reproducing a completed Prediction with social preview metadata (FR-31). Arrivals via Share Links count toward SM-3.
- **Betting-Adjacent Output** — any projection beyond winner: points spread or over/under (totals). Not yet shipped; posture governed by FR-29 and Q-2.
- **Account** — a Supabase Auth identity with a **Profile**; planned to own saved Predictions (FR-22/23, PLANNED-GATED).
- **Anonymous Visitor** — a signed-out user (no Account); full access today, limited Prediction access planned at account launch (FR-9).

## 4. Features

### 4.1 Predict Flow (core loop)

**Description:** The product's reason to exist. A user picks a Historical, Active, or Custom matchup, chooses among the four Prediction Methods, and receives a transparent Prediction. Realizes UJ-1, UJ-2, UJ-3. Computation runs in the Supabase Edge Function `predict-game-7` (details in addendum).

**Functional Requirements:**

#### FR-1: Select a Historical matchup  **[LIVE]**
The user can browse/search the Historical Archive from Predict and choose a Series as prediction input. Realizes UJ-1.
**Consequences (testable):**
- A selected Series loads with its year, round, teams, and Game 1–6 scores populated.
- Deep-links from Home featured-series cards open Predict preloaded with that Series.

#### FR-2: Use an Active Series  **[LIVE]**
The user can select a current-playoff matchup as prediction input. Realizes UJ-3.
**Consequences (testable):**
- Active Series appear distinctly from Historical entries and reflect the latest data pipeline update.
- Outside the playoffs, the Active list is empty without breaking the flow.

#### FR-3: Create a Custom Matchup  **[LIVE]**
The user can enter two team names and Game 1–6 scores to predict a series that never happened. Realizes UJ-2.
**Consequences (testable):**
- Team identity resolves from full name, nickname, or abbreviation (e.g., "Boston Celtics" / "Celtics" / "BOS") to the canonical Team and logo.
- Unrecognized names fall back to placeholder logos without blocking prediction.
- Invalid/missing scores produce inline validation before submission; scores validate as non-negative integers within a plausible single-game range (bounds fixed at build time).

#### FR-4: Choose and compare Prediction Methods  **[LIVE]**
The user can select among the four Methods (Logistic Regression, Bayesian Inference, Elo Rating, Exponential Smoothing) and compare their outputs on the same matchup — the README headline claim and UJ-2's climax.
**Consequences (testable):**
- All four Methods are offered and selectable for any valid Series/Custom Matchup.
- Successive runs of different Methods on the same inputs are possible within one session without losing prior inputs (side-by-side rendering not required).
- Method selection is consistent and non-breaking when changed mid-flow (issue #3 target).

`[NOTE FOR PM]` Code audit 2026-09-22: `prediction_methods` has no runtime read path — the Method set is effectively code-defined and `is_active` gating is not implemented (detail: addendum §B). Catalog-driven enable/disable is a future refinement, not a baseline claim.

#### FR-5: Receive a transparent Prediction  **[LIVE]**
The system returns predicted winner, per-team win probabilities, Contributing Factors, Confidence Level, and computation time. Realizes UJ-1, UJ-2, UJ-3.
**Consequences (testable):**
- Probabilities for the two teams sum to 100% (±rounding).
- Computation time is displayed to the user.
- Contributing Factors render for every Method, not just some.
- Results render canonical team identities with logos, consistent with the visual-branding posture of FR-19.

#### FR-6: Open Detailed Analysis  **[LIVE]**
The user can expand a Prediction into the per-method deep-dive view. Realizes UJ-2.
**Consequences (testable):**
- Opening analysis preserves the originating inputs and Method.

#### FR-7: Reset with New Prediction  **[LIVE]**
The user can clear the flow and start a fresh prediction in one action.
**Consequences (testable):**
- Reset returns to a clean selection state with no residue from the prior run.

#### FR-8: Degrade gracefully on failure  **[LIVE — quality target; issue #3 pending]**
When inputs, network, or the Edge Function fail, the user gets an understandable, non-breaking error state and can retry without re-entering data. Realizes UJ-1 edge case.
**Consequences (testable):**
- No flow state is lost on a retryable failure.
- Error messaging distinguishes invalid input from service failure. *(Currently the subject of issue #3 — treat as baseline requirement the issue must satisfy.)*

#### FR-9: Anonymous prediction limits  **[PLANNED-GATED]**
When Accounts launch (FR-22), Anonymous Visitors receive limited Prediction access while signed-in users receive full access. Realizes: retention design behind the Traffic Gate.
**Consequences (testable):**
- The limit definition (count/day, feature ceiling) is an Open Question — see Q-1; not speccable until Account-feature discovery. Confirmed 2026-09-22: limits are soft (e.g., daily count), not a paywall.

### 4.2 Historical Archive & Insights

**Description:** Browsing and learning surfaces that give the Predict Flow its evidentiary backbone and SEO substance (evergreen historical pages rank year-round — see addendum research). Insights doubles as a content factory: pattern cards are short-form takeaways usable directly in marketing/social/educational content (levers: addendum §H).

**Functional Requirements:**

#### FR-10: Search and filter the archive  **[LIVE]**
The user can search the Historical Archive by team and filter by year. Realizes UJ-3.
**Consequences (testable):**
- Filtering by year and searching by team name return matching Series; combined filters intersect correctly.

#### FR-11: Expand a Series record  **[LIVE]**
The user can expand any archive entry to see game-by-game scores, the winner, and final series status.
**Consequences (testable):**
- Each expanded panel shows every game with home/away teams and scores, consistent with `series_game_scores`.
- Defunct, relocated, and rebranded franchises render era-appropriately (v0.1.0 backfilled missing legacy team records); identity resolution never silently substitutes a modern franchise for a historical one.

#### FR-12: View Insight pattern cards  **[LIVE]**
The user can view computed patterns — Game 6 winner impact, home-court advantage, average Game 7 point differential — served from Insights Cache. Realizes UJ-3.
**Consequences (testable):**
- Insight values derive from the archive, refreshed by pipeline, not hard-coded in the client.

#### FR-13: Series video + editorial content  **[PLANNED — scoped pilot: 5 flagship series, owner decision 2026-09-25]**
The user can watch associated video content and read an editorial write-up on a Series view. Pilot scope: full additional content (video + write-up) for 5 flagship series, pinned by owner 2026-09-25 — 2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers, 2026 Thunder–Spurs; all other series stay bare (facts only). Doubles as marketing material.
**Consequences (testable):**
- A Series supports zero or more video assets and an optional editorial write-up (headline, body, images); missing content degrades cleanly to the bare facts page; layouts work on desktop and mobile under the NFR-U1 baseline (closes issue #5's responsiveness AC by reference).
- Q-5 resolved for the pilot (owner decision 2026-09-25): **external embeds (YouTube)** — no hosted media, no storage decision. Full-archive video (hosted media service vs. embeds at scale) remains parked by the Traffic Gate.
- Editorial content flows into the prerendered series pages (AD-7), so flagship pages are crawlable with full content.

The gate hard-stop is lifted for this scoped pilot only; archive-wide video remains a non-goal before the Traffic Gate.

### 4.3 Content, Brand & Feedback Surfaces

**Description:** Home tells the product story; Maths teaches the models; Contact is the human channel — and currently also the site's only inbound route to the owner.

**Functional Requirements:**

#### FR-14: Home product story  **[LIVE]**
The Home page presents the mission, iconic Game 7 moments (clickable banner hotspots), featured Series deep-links, and the contact section. Realizes UJ-1 entry.
**Consequences (testable):**
- Every hotspot/featured card navigates to a working Predict or archive view; Home also links into the Historical Archive and Insights surfaces.

#### FR-15: Methodology education  **[LIVE]**
The Maths page presents each Prediction Method's title, formula, and conceptual explanation. Realizes UJ-3 citation use.
**Consequences (testable):**
- All four Methods are documented; formulas match the Edge Function implementation (per addendum cross-check). If Betting-Adjacent Outputs ever ship (FR-26..28), the page extends to cover them — the Method count is a catalog attribute, not a constant.

#### FR-16: Spam-hardened contact intake  **[LIVE]**
The user can submit questions/feedback/collaboration offers; submissions are validated and stored server-side.
**Consequences (testable):**
- Honeypot field + submission-timing checks reject bots without a visible captcha.
- Direct public inserts to `contact_submissions` are blocked; writes occur only via the `handle-contact` Edge Function with server-side trimming, email validation, and length limits.

#### FR-17: Contact delivery & operations  **[PLANNED — issue #2, phases 2–3]**
A successful Contact Submission reliably notifies the owner, and the form gives clear feedback.
**Consequences (testable):**
- Email delivery via **Resend** — provider chosen by owner 2026-09-22; account not yet provisioned (setup is part of the build). Alternatives considered: SendGrid, DB-store + notification fallback (addendum G).
- Contact events emit `contact_form_submitted` (existing) plus new `_started` / `_failed` variants with failure-reason categories.
- Inline field errors and a visible success state render.

#### FR-18: Release-quality copy  **[PLANNED — issue #4]**
Home hero, Insights labels, contact copy, and empty/error states read as intentional; no encoding artifacts or garbled text remain anywhere.
**Consequences (testable):**
- A copy pass covers the named surfaces; automated search finds zero mojibake/encoding artifacts in shipped strings.
- Owner sign-off per named surface (solo-builder verification for the subjective "polished/consistent" acceptance criteria); empty/error-state wording satisfies FR-8's invalid-input-vs-service-failure distinction.

### 4.4 Data Pipeline & Content Operations

**Description:** How Series data — especially Active Series — stays correct without manual heroics during the playoffs. Current state (owner-confirmed 2026-09-22): historically loaded via a Python script from a spreadsheet; **active-series updates are manual today**; no committed automation exists yet.

#### FR-19: Canonical archive data  **[LIVE]**
The normalized schema (`teams`, `series`, `series_game_scores`) holds 177 migrated Historical series with logos; legacy flat tables archived (addendum).
**Consequences (testable):**
- Archive counts reconcile with source spreadsheet totals; legacy tables retained in `archive` schema for audit only.

#### FR-20: Offseason pipeline mode  **[PLANNED]**
The pipeline runs at the start and end of the NBA playoffs to initialize and finalize Season records.
**Consequences (testable):**
- A run idempotently creates/updates the current postseason bracket; a failed run is detectable (alert or logged status).

#### FR-21: Inseason pipeline mode  **[PLANNED]**
During the playoffs, the pipeline runs daily to update Active Series statuses and game scores. Realizes UJ-3's need for live accuracy.
**Consequences (testable):**
- After a daily run, Predict's Active Series reflect latest results.
- Script-based and CI-scheduled, consistent with the existing `supabase/scripts` precedent (owner-confirmed 2026-09-22).
- Data source direction is set (Q-4: Fantrax API preferred, nba.com scrape fallback) but unverified — a feasibility spike is a build-time prerequisite. `[NOTE FOR PM]` if both fail, FR-21 reopens as a phase-blocker: stale Active Series data during the playoffs would invalidate the Traffic Gate measurement itself.

### 4.5 Accounts & Persistence

**Description:** Planned layer, deliberately gated: accounts exist to reward the audience the Traffic Gate proves. Supabase Auth + `profiles` already exist in the stack today but power no user-facing feature — owner-confirmed as vestigial groundwork for planned account features.

#### FR-22: Sign-in / sign-up  **[PLANNED-GATED]**
A user can create an Account and sign in.
**Consequences (testable):**
- Exact surface and methods (email/OAuth) pending Account-feature discovery — Q-1.

#### FR-23: Saved predictions  **[PLANNED-GATED]**
A signed-in user's Predictions persist to their Profile and are retrievable as history.
**Consequences (testable):**
- Stored predictions link the Auth user to rows in `predictions` (table currently private-by-RLS — addendum); Anonymous Visitors' runs stay ephemeral. `[ASSUMPTION: no cross-device sync beyond account history in first cut.]`

### 4.6 Analytics & Observability

**Description:** The owner's explicit decision infrastructure: traffic must be *fully observable* during the playoffs because SM-1 determines whether the product grows or stays a demo. PostHog is instrumented today (10 events + error capture); gaps are channel attribution depth and playoff-window reporting.

#### FR-24: Behavioral analytics  **[LIVE]**
Instrumented user actions emit to PostHog via the 10-event registry (names, purposes, and file locations: addendum §A.1); client exceptions are captured in prediction and contact handlers. Auth coverage is identification only — `identify(supabase_user_id)` on sign-in/sign-up, `reset()` on sign-out — not named auth events.
**Consequences (testable):**
- The shipped 3-step prediction funnel (Series → Method → Prediction) is reportable as a saved PostHog insight today; Detailed Analysis conversion is a separate companion insight.
- `prediction_generated` is the source-of-truth event for SM-1's prediction count and SM-2's funnel completion.

#### FR-25: Traffic Gate reporting  **[PLANNED]**
The owner can read, for a chosen playoff window: unique visitors, prediction completions (aggregate count), funnel conversion, and acquisition channel breakdown (SEO/social/direct/share-link). Gate figures must be obtainable **programmatically** through the active analytics provider's query interface (NFR-V1), so the end-of-window evaluation (SM-1) needs no dashboard archaeology and survives a vendor swap. While PostHog is the provider, that means its query API or official MCP server (options: addendum §F).
**Consequences (testable):**
- A dashboard, saved query, or API call produces these numbers for Apr–Jun 2027 without ad-hoc surgery.
- Unique-visitor and prediction-count figures for an arbitrary date range are retrievable programmatically with the project's existing analytics key.
- Share-link visits are distinguishable (referral/UTM convention) — analytics **about** visitors who arrived via a prediction link others shared, not externally shareable dashboards. None exists today (owner-confirmed 2026-09-22); FR-31 supplies the links.
- The unique-visitor definition used for SM-1 is pinned in writing before Apr 2027 (identification/distinct_id caveats and the FR-22 launch effect: addendum §A.1).

### 4.7 Betting-Adjacent Outputs

**Description:** The monetization seam *if* it opens: using the same Game 1–6 inputs to project margins and totals (issue #6). Publishing projections is protected content — no gambling license is needed unless the site accepts wagers or acts as a market-maker (addendum research). Posture — "analytics entertainment" vs. "picks" — is Open Q-2; FRs below assume the entertainment posture, **working frame confirmed by owner 2026-09-22** until Q-2 decides otherwise.

#### FR-26: Over/under projection  **[PLANNED-GATED]**
The user can obtain a projected game total (over/under) for a Series/Custom Matchup from the same inputs.
**Consequences (testable):**
- Derived from existing Game 1–6 score features; validated against a sample of Historical Archive series with known Game 7 totals.

#### FR-27: Points spread projection  **[PLANNED-GATED]**
The user can obtain a projected margin (spread) for the matchup.
**Consequences (testable):**
- Same derivation and validation bar as FR-26; model extension vs. new derived logic is a design decision for architecture (note: existing Game 1–6 score data already supports margin/totals features).

#### FR-28: Clear presentation of new outputs  **[PLANNED-GATED]**
New projections render within the existing Prediction result presentation, understandable without betting fluency.
**Consequences (testable):**
- Terminology and framing readable to a non-bettor (ties to FR-18 copy standards).
- The Maths page and Method catalog document the derivation of any shipped Betting-Adjacent Output (issue #6's documentation acceptance criterion).

#### FR-29: Responsible-gaming guardrails  **[PLANNED-GATED]**
If any FR-26..28 ships: prominent 21+ notice, "not betting advice / no guarantee" disclaimer on betting-adjacent surfaces, responsible-gambling resource links, and affiliate disclosure if referral links are ever added.
**Consequences (testable):**
- Guardrails appear on every surface that shows a Betting-Adjacent Output; text reviewed against the standards in addendum §Compliance.

### 4.8 Reliability & Quality Baseline (cross-cutting feature)

**Description:** Issue #3 in requirement form: the Predict flow — its most-used path — must stop regressing.

#### FR-30: Regression-protected Predict flow  **[PLANNED — issue #3]**
The highest-risk Predict paths have automated regression coverage and pass manual QA on desktop and mobile.
**Consequences (testable):**
- Tests cover: series selection, custom-input validation, method switching, error states.
- A documented catalog of reproduced failure cases exists, each mapped to a regression test or an FR-8 error state (issue #3's "reproduce and document failure cases").
- Manual QA matrix: historical / active / custom × desktop / mobile, documented results.
`[NOTE FOR PM]` issue #3 itself notes a test framework alone won't close this — budget for manual QA passes.

### 4.9 Sharing & Discoverability

**Description:** The "shareable" leg of the product promise, now with a recorded decision (owner, 2026-09-22: deep-links + preview cards). A completed Prediction becomes an artifact worth circulating — this is UJ-1's resolution, SM-3's supply side, and the research-documented SEO play (per-matchup pages indexed before a series reaches 2-2 so they catch the playoff search spike; addendum §D).

#### FR-31: Shareable prediction results  **[PLANNED]**
The user can share a completed Prediction as a stable Share Link that reproduces the matchup, Method, and result, rendered with social preview metadata (OG title/description/image) so shared links unfurl as prediction cards in chat and social contexts. Realizes UJ-1's resolution; supplies SM-3.
**Consequences (testable):**
- Opening a Share Link re-renders the original Prediction (inputs + Method + outputs) without the recipient re-entering anything.
- Link previews render card metadata on major social/chat surfaces.
- Arrivals via Share Links are attributable to a share/referral channel in analytics (FR-25).

**Out of Scope:** in-product social posting, image export beyond the OG card. `[ASSUMPTION: OG card via static generation or a lightweight render service — mechanism is architecture's call.]`

## 5. Cross-Cutting NFRs

- **NFR-S1 (Security)** **[LIVE]**: RLS on all public normalized tables with explicit public-read policies; `predictions` private by default; no direct public inserts on `contact_submissions`. Service-role key leak (issue #1) was remediated by rotation 2026-09-22 — new secrets must never enter the client bundle or repo.
- **NFR-S2 (Privacy)** **[LIVE]**: PostHog analytics with known ad-blocker blind spot (documented); no PII collected beyond contact submissions (email + message) and account data when/if FR-22 ships. Contact submissions kept **indefinitely** — store until manually deleted (owner decision 2026-09-22; Q-6 closed).
- **NFR-P1 (Performance)** **[LIVE]**: Predictions return with visible computation time; Insights served from cache. Provisional target: P95 full-request time ≤ 3s on mobile 4G — a target created without benchmark basis (owner's direction, 2026-09-22); replace once FR-25 reporting exists.
- **NFR-R1 (Availability/cost)** **[LIVE]**: Supabase free tier protected by a keep-alive scheduled workflow (repo `keepalive`); GitHub Pages static hosting. Cold-start risk and free-tier ceilings are accepted operational constraints (see project memory: stay Postgres on free tier).
- **NFR-R2 (Reliability)** **[PLANNED]**: see FR-30; error states are non-breaking and retry-safe.
- **NFR-U1 (Usability/mobile)** **[LIVE requirement, PLANNED verification]**: responsiveness is a whole-site baseline — every surface (Home, Predict, Archive, Insights, Maths, Contact) renders and operates cleanly on mobile and desktop. Issue #3's mobile verification applies to the Predict flow specifically; no other surface is exempt by omission. Touch targets and reflow verified before each major release.
- **NFR-A1 (Accessibility)** **[PLANNED — COMMITTED]**: WCAG 2.1 AA (contrast, keyboard navigation, screen-reader labeling) on core flows by the pre-playoff major release; AA as the standing bar for newly built surfaces thereafter (owner commitment 2026-09-22; Q-7 closed). Radix/shadcn primitives carry the baseline; verification effort lands in §8.1.
- **NFR-D1 (Data integrity)** **[LIVE]**: legacy data archived in `archive` schema (not deleted) for rollback/audit; pipeline runs (FR-20/21) must be idempotent.
- **NFR-D2 (Version & release record)** **[PLANNED — COMMITTED]**: because agents perform most commits going forward, versioning is mechanical: `package.json` is the single source of truth for the version; CHANGELOG.md gains an entry at every release; README does **not** state a version number (its stale "0.2.0" is the cautionary case).
- **NFR-V1 (Analytics vendor decoupling)** **[PLANNED]**: the analytics service (PostHog today) must be swappable — the owner may deprecate it entirely if the project plateaus as a demo. All integration (SDK init, event definitions, exception capture, metric queries) lives behind one isolated layer that feature code emits through declaratively, so removing or replacing the vendor never touches feature logic, and FR-25's gate metrics stay obtainable from whatever provider is active. Implementation shape is architecture's call (addendum §G).

## 6. Constraints and Guardrails

- **Legal:** Never accept wagers, never act as a market — that line is what keeps the product in "content" law, not "gambling" law. Betting-Adjacent Outputs exist only under FR-29 guardrails. (Detail + sources: addendum.)
- **Platform:** Web-only, GitHub Pages static SPA; backend is Supabase (Postgres, Edge Functions, Auth). NBA-only. No native app, no PWA install promise in scope.
- **Cost ceiling:** Free-tier economics (Supabase, GitHub Pages, PostHog; any email service must have a free tier) until the Traffic Gate changes the equation.
- **Brand/voice:** Polished, credible, explanatory — a serious analytics tool with fan passion; anti-reference: opaque black-box tipster sites. Copy standard set by FR-18. `[ASSUMPTION: tone inferred from existing marketing sections of APP_FUNCTIONALITY_OVERVIEW.md.]`

## 7. Non-Goals (Explicit)

- Not a betting site: no odds markets, no wagers, no tipster guarantees — ever.
- Not multi-league: no WNBA, college, international leagues in this product's identity (NBA Game 7s only).
- Not a social product: no comments, feeds, or community features; sharing happens via FR-31 Share Links and screenshots — the product never posts on the user's behalf.
- Not a general NBA stats database: no per-player box scores, no regular-season coverage beyond what series context requires.
- Not a paid product today: no paywall, no ads, no affiliate links before the Traffic Gate.
- Not a live-scoring product: no in-game/real-time scores or play-by-play. Active Series data updates on the daily pipeline cadence (FR-21), not during games. (Owner confirmed 2026-09-22 — this also bounds §2.3: no "during-live-game mobile" journey exists; live data would make that a different product.)
- Not an accuracy oracle: models are explainable estimates; the product does not claim or guarantee prediction correctness.

## 8. Release Scope — "Pre-Playoff" Major Release (before Apr 2027)

*Release model (owner, 2026-09-22): issues and small functionality are addressed continuously as time allows — that rolling work is governed by the GitHub backlog, not this section. This section defines the **next major release**, whose sole purpose is to make the Traffic Gate test (SM-1) valid: the site must be reliable, live-current, polished, and fully measurable before the playoff spike arrives.*

### 8.1 Candidate Scope for the Major Release
- Reliability pass on Predict flow + regression coverage (FR-8, FR-30 / issue #3).
- Release-quality copy sweep (FR-18 / issue #4).
- Contact delivery + analytics + UX (FR-17 / issue #2).
- Data pipeline automation, both modes (FR-20/21) so Active Series are live-current without manual work.
- Traffic Gate reporting (FR-25).
- Analytics isolation refactor — move PostHog behind the NFR-V1 decoupling layer so the gate and instrumentation survive a vendor swap or exit.
- Shareable prediction deep-links + OG cards (FR-31) — the SEO/spike-capture play that must be indexed *before* the 2027 window.
- Flagship series content pilot (FR-13, scoped) — video (YouTube embeds) + editorial write-ups for 5 flagship series on the prerendered pages; marketing material and a fairer SEO test (owner decision 2026-09-25).
- WCAG 2.1 AA pass + verification on core flows (NFR-A1).
- Whole-site mobile responsiveness verification (NFR-U1).
- Housekeeping: strip the version number from README (NFR-D2).

### 8.2 Out of Scope for this Release
- Accounts and saved predictions (FR-9, FR-22, FR-23) — PLANNED-GATED on SM-1; discovery may run in parallel but no build.
- Betting-Adjacent Outputs (FR-26..29 / issue #6) — gated on SM-1 *and* the monetization-posture decision (Q-2).
- Archive-wide series video (FR-13 beyond the 5-series pilot / issue #5) — deferred; heavy content-ops cost with uncertain SEO payoff until the archive surfaces prove traffic. The scoped flagship pilot moved into §8.1 (owner decision 2026-09-25 — the "`[NOTE FOR PM]` one pilot series first" guidance, taken to five).
- Explicitly deferred to post-gate: monetization mechanics of any shape.

## 9. Success Metrics

**Primary**
- **SM-1 — Traffic Gate (decision metric):** Unique visitors during the 2027 playoff window (Apr–Jun 2027), measured per FR-25 (PostHog aggregate uniques over the range). **Gate = 1,500 unique visitors in the window (~500/month; owner-set 2026-09-22, ≈3× the ~500 conservative research floor and well under the ~2–3k realistic band — deliberately beatable).** Total predictions made in the window is reported alongside as a judgment signal (no fixed threshold — a UV pass with near-zero predictions means the funnel, not the audience, is the problem). Above → unlock Accounts (FR-22/23) and open the monetization decision (Q-2). Below → reposition as portfolio/demo; monetization plans scrapped (owner statement 2026-09-22). Validates the whole §4 investment.

**Secondary**
- **SM-2 — Funnel conversion:** % of Predict page sessions that complete a Prediction (Series → Method → Prediction), target ≥30% `[ASSUMPTION: placeholder until FR-25 baseline read]`. Validates FR-1..FR-5, FR-30.
- **SM-3 — Share behavior:** share-link/referral-driven visits as % of total, target >5% during playoffs. Validates the UJ-1 loop is real.
- **SM-4 — Owner ops signal:** zero missed contact submissions during the window (FR-17) and zero unhandled data-pipeline failures (FR-20/21).

**Counter-metrics (do not optimize)**
- **SM-C1:** Raw pageviews without prediction completion — SEO padding; SM-2 must not drop while chasing SM-1.
- **SM-C2:** Signups before the gate is passed — vanity; the whole point of gating accounts is that demand must precede the feature.
- **SM-C3:** Latency sacrificed for richer analysis views — P95 (NFR-P1) is a constraint on SM-2, not a trade-off.

## 10. Open Questions

1. **Q-1 Account feature set** — owner has a planned discovery session on exactly what the account does; FR-9/22/23 are placeholders for its output.
2. **Q-2 Monetization posture** — affiliate vs. premium vs. ads vs. none (owner "leaning open"), *and* the framing question: analytics entertainment vs. picks. Determines whether FR-26..29 exist as written.
3. ~~**Q-3 SM-1 threshold**~~ — RESOLVED 2026-09-22: gate = 1,500 window UVs (SM-1 is canonical).
4. ~~**Q-4 Active-series data source**~~ — RESOLVED (direction) 2026-09-22: Fantrax API preferred, nba.com scrape fallback; feasibility spike and phase-blocker note live at FR-21.
5. **Q-5 Video mechanism** (FR-13) — **resolved for the 5-series flagship pilot: external YouTube embeds (owner decision 2026-09-25)**. Hosted media service vs. embeds at archive scale remains parked by the Traffic Gate; needs an owner decision if archive-wide video is ever scheduled.
6. ~~**Q-6 Contact submission retention**~~ — RESOLVED 2026-09-22: keep indefinitely (NFR-S2).
7. ~~**Q-7 Accessibility bar**~~ — RESOLVED 2026-09-22: WCAG 2.1 AA committed (NFR-A1).
8. **Q-8 `SamplePage.tsx`** — leftover scaffold route in code; delete or document.
9. **Q-9 Model validation** — is there any accuracy back-test of the four Methods against held-out Historical Archive results? None documented; a credibility asset ("we scored our models") and linkable write-up if built.

## 11. Assumptions Index

*Status after owner review 2026-09-22. Confirmed items are now baseline facts; open items remain flagged.*

**Owner-confirmed (now stated as fact):** §2.3 UJ-1/2/3 narratives (persona names illustrative); §4.4 active-series updates are manual today; §4.5 Auth/`profiles` are vestigial groundwork; §4.6 no share-link analytics exists today; §4.7 entertainment posture is the working frame pending Q-2; FR-9 anon limits soft (count-based, not paywall); FR-21 pipeline script-based/CI-scheduled; FR-22 auth surface unspecified pending Q-1; SM-2 30% conversion placeholder recorded without benchmark basis (like NFR-P1), pending FR-25 baseline; README "0.2.0" stale — CHANGELOG/package.json 0.2.2 canonical; §6 brand voice inferred from existing marketing copy.

**Resolved at owner review (2026-09-22):** FR-17 → Resend chosen (provisioning pending); NFR-P1 → 3s P95 stays, explicitly recorded as no-basis provisional; NFR-S2/Q-6 → contact submissions kept indefinitely; NFR-A1/Q-7 → WCAG 2.1 AA committed (core flows by major release); NFR-D2 → new versioning convention (package.json canonical, CHANGELOG per release, no version in README); Q-4 → Fantrax API preferred / nba.com scrape fallback, feasibility spike required; sharing → FR-31 deep-links + OG cards (owner option A); positioning → "transparent analytics destination + storytelling/discovery experience," narrowed from five source options during this session; code audits → `predictions` has no runtime path (FR-23 ephemeral claim verified), `prediction_methods` never read at runtime (FR-4 rewritten).

**Still open (non-blocking; tracked as Q-1/Q-2/Q-8/Q-9):** account feature set (owner discovery pending), monetization posture (revisit at gate evaluation, Jun 2027), SamplePage/PostHog-agent-skill-folder disposition (next housekeeping), model-validation back-test (optional pre-playoff content asset). Q-5 resolved for the FR-13 flagship pilot (YouTube embeds, owner decision 2026-09-25); archive-wide video mechanism revisits only if scheduled post-gate. Remaining inline `[ASSUMPTION]` tags (FR-23 cross-device sync, FR-31 OG-card mechanism) stand as written at their requirements.
