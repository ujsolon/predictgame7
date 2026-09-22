# Addendum — Predict Game 7 PRD

Depth material that earned a place but doesn't fit the PRD body: technical implementation facts, market research digest with sources, issue→FR mapping, and options matrices for pending decisions.

**Lifecycle rule:** this addendum is a staging area, not a permanent home — it should shrink over time. When a downstream document (architecture, UX, epics) makes a section load-bearing for implementation, promote it: the new doc carries the content and the addendum section is replaced by a pointer. Decision *evidence* (§D research, §F benchmarks, §G resolved decisions, §E issue map) stays as the audit trail — do not re-decide what is recorded here.

## A. Technical Stack & Deployment (extracted from repo docs + code)

- **Frontend:** React 18 + TypeScript + Vite (`rolldown-vite`), Tailwind CSS, Radix UI / shadcn-style component set, react-router 7 (basename `/predictgame7/`), react-hook-form + zod, recharts, motion, lucide-react. Lint: Biome.
- **Backend:** Supabase — Postgres, two Edge Functions (`predict-game-7` = prediction engine, `handle-contact` = validated contact intake), Supabase Auth (email-based; `profiles` table tied to `auth.users`).
- **Analytics:** PostHog (`posthog-js` + `@posthog/react`, provider + error boundary in `src/main.tsx`), 10 instrumented events, `captureException` in prediction/contact catch blocks. Known blind spot: ad blockers locally.
- **Hosting:** GitHub Pages via `gh-pages` branch; site at `ujsolon.github.io/predictgame7/`.
- **Ops:** GitHub Actions `keepalive` workflow pings Supabase (rescheduled to run 9AM UTC, commit ed50349) to defend the free-tier instance from cold/pause — uses env secrets, fails on missing. Project memory notes: stay on Postgres; keep-alive vs. Xata-style alternatives were left open.
- **Env config:** `VITE_SUPABASE_URL/ANON_KEY`, `VITE_POSTHOG_KEY/HOST` (client-visible by design; service keys must never appear here — see issue #1 note).
- **Local dev/verification workflow (README):** secrets in `.env.local` (Vite needs a restart on env change); `npm run build` + lint must pass before deploy; `predeploy`/`deploy` scripts publish to the `gh-pages` branch. Given NFR-D2 (agents perform most commits), this is the standing verification gate for any agent-driven change.
- **Version discrepancy:** README says 0.2.0; `package.json`/CHANGELOG say 0.2.2. CHANGELOG treated as canonical (logged as decision); README version line to be removed per NFR-D2.

### A.1 PostHog instrumentation baseline (from `docs/archive/posthog-setup-report.md`; audited 2026-09-22)

**Event registry — 10 events** (full file locations in `docs/archive/posthog-setup-report.md`). The NFR-V1 isolation refactor must preserve these event names until FR-25 metrics are re-pointed:

| Event | Role |
|---|---|
| `prediction_generated` | **Core conversion event** — source of truth for SM-1 prediction count and SM-2 funnel completion |
| `series_selected` / `custom_series_selected` | Funnel step 1 (historical/active vs. custom) |
| `prediction_method_selected` | Funnel step 2 |
| `detailed_analysis_viewed` | Companion insight (not a funnel step) |
| `prediction_reset` | Flow reset |
| `banner_hotspot_clicked` | Home engagement |
| `contact_form_submitted` | Contact conversion (`_started`/`_failed` are FR-17 additions) |
| `historical_series_expanded` / `historical_filter_applied` | Archive engagement |

**Existing assets (FR-25 starting point — do not rebuild):** Analytics basics dashboard (`/dashboard/1649509`); Prediction Funnel: Series → Method → Prediction (`/insights/cu0V4HPZ`); Predictions Generated Over Time; Prediction Method Popularity; Detailed Analysis Conversion Rate; Home Page Engagement. Wizard-generated IDs are disposable pointers behind the NFR-V1 query layer.

**Auth instrumentation:** `identify(supabase_user_id)` on sign-in/sign-up + `posthog.reset()` on sign-out — **no named auth events** (PRD FR-24 corrected accordingly). Supabase user ID acts as a pseudonymous distinct_id (relevant to NFR-S2). The identify/reset lifecycle changes distinct_id mid-session and affects person merging — **SM-1's unique-visitor definition must be pinned in writing before Apr 2027** (FR-25 consequence).

**Leftover artifact:** a PostHog agent-skill folder sits in the repo — track with `SamplePage.tsx` under PRD Q-8 housekeeping (remove on any vendor exit, per NFR-V1).

## B. Data Model Detail (CURRENT_DATA_MODEL.md)

Active `public` schema:
- `teams` — canonical franchises: full_name, abbreviation, city, nickname, logo_url (one logo each). Custom-mode matching accepts full name / nickname / abbreviation. Coverage includes modern **and historical** franchises (defunct/relocated records backfilled in v0.1.0 — see PRD FR-11).
- `series` — year, round, team_a/team_b, winner, status. **The `status` value domain is undefined in every doc** — the pipeline design (FR-20/21) must fix the status enumeration and the Active-vs-Historical distinction rule; FR-2/FR-11/FR-21 acceptance criteria depend on it.
- `series_game_scores` — one row per game: home/away team + scores + winner.
- `prediction_methods` — slug, name, description, `is_active` catalog. **No runtime read path (code audit 2026-09-22)** — reference data only; see PRD FR-4 note.
- `predictions` — method, type, statement, probability, confidence, input scores, model parameters, contributing factors, metadata. Private by RLS default. **No runtime read/write path anywhere in src/ or edge functions (code audit 2026-09-22)** — CURRENT_DATA_MODEL's "active storage" phrasing describes schema presence, not behavior; PRD FR-23's "anonymous runs are ephemeral" premise is verified. Post-accounts persistence is Q-1 territory.
- `insights_cache` — server-cached Insight values.
- `contact_submissions` — direct public insert removed v0.2.2; writes only via `handle-contact`.
- `profiles` — auth-linked user records. CURRENT_DATA_MODEL lists `profiles` among actively-read tables; the product-level claim stands regardless: auth powers no user-facing feature today (vestigial groundwork, PRD §4.5).

Legacy/audit: flat tables `game_sevens` (177 records migrated), `current_game_sevens`, `model_parameters`, `team_logos` archived into an `archive` schema (rollback/audit only, never deleted). Original load path: Python script `supabase/scripts/load-games/main.py` from `NBASeriesResults.xlsx` — the precedent pattern for FR-20/21 pipeline automation.

RLS state (v0.2.1+): enabled on public normalized tables; explicit public-read for `teams`, `series`, `series_game_scores`, active `prediction_methods`.

Security incident: issue #1 (GitScan) flagged a possible `service_role` JWT leak in the repo; **key rotated, closed** (owner confirmed 2026-09-22).

## C. Change History (CHANGELOG.md)

- **v0.1.0 (2026-05-30)** — "Release 1": normalized data-model migration (flat legacy → teams/series/series_game_scores), 177-series backfill, fixes for 406 errors and nested-team rendering crashes.
- **v0.2.1 (2026-07-15)** — security sprint: RLS enabled after Supabase linter warnings; public-read policies.
- **v0.2.2 (2026-07-15)** — contact-flow hardening: direct inserts removed, server-side validation in `handle-contact`.
- Trajectory: foundation → security/quality → (this PRD) reliability/ops/traffic-proof before expansion.
- Housekeeping note: CHANGELOG itself skips 0.2.0 (0.1.0 → 0.2.1); acknowledged under NFR-D2's release-record convention.

## D. Market Research Digest (subagent, 2026-09-22)

**Comparables.** ESPN BPI — free team ratings/win probs, shallow on playoff history. FiveThirtyEight — wound down 2023–25; ABC removed thousands of archive articles May 2026; code/data remain on GitHub but no live open historical-NBA-model site exists → the positioning gap this product targets. Basketball-Reference — free aggregated playoff probs, no methodology. Cleaning the Glass / CraftedNBA — proof indie NBA analytics sustains ~$5–10/mo memberships at small scale. Betting-adjacent incumbents (OddsJam, Dimers Pro, FOX Sports Picks, Showstone) own "today's picks" keywords — do not compete there; nobody owns Game 7 / series-decider.

**Monetization patterns.** Sportsbook affiliates (DK/FD via partner programs) pay ~$50–200 CPA per activated deposit or rev-share; need qualifying US traffic + program approval. Realistic indie stack: free content → email → affiliate + small premium tier; display ads negligible at this scale; data licensing not viable.

**Compliance.** Publishing projections/picks is opinion — no gambling license needed absent taking wagers or acting as a market. Industry-standard kit: 21+ notice/gating, "no guarantee / not betting advice" disclaimers, responsible-gambling links (NCPG, 1-800-GAMBLER), state-aware affiliate disclosure; ad-content rules tighten yearly by state. Prediction markets (Kalshi) are a separate contested category. Note: prediction *markets* ≠ prediction *models*.

**SEO dynamics.** Demand is seasonally brutal: playoffs (Apr–Jun) spike traffic several-fold; "game 7" queries spike violently during live series. Winning patterns: evergreen historical pages ("all NBA Game 7s", specific iconic matchups) ranking year-round; per-matchup shareable prediction pages published *before* a series reaches 2-2 so they index during the spike; model-accuracy write-ups earning Reddit/X links (the 538-collapse angle is a current link magnet); programmatic pages + embeds outperform a static blog.

**Implications recorded in PRD:** Traffic Gate strategy (§9 SM-1), MVP scope (§8), FR-29 guardrails, Why Now (§1).

Sources: [ESPN BPI](https://www.espn.com/nba/bpi) · [538 removal — NYT](https://www.nytimes.com/2026-05-16/business/media/fivethirtyeight-abc-removed.html) · [Nate Silver](https://www.natesilver.net/p/a-few-words-about-fivethirtyeight) · [B-Ref](https://www.basketball-reference.com/friv/playoff_prob.html) · [CTG](https://cleaningtheglass.com/) · [CraftedNBA](https://craftednba.com/membership) · [OddsJam](https://oddsjam.com/) · [Dimers](https://www.syracuse.com/betting/dimers-pro/) · [FOX](https://www.foxsports.com/betting/nba) · [affiliate programs](https://statsdrone.com/best-affiliate-programs/sports-betting/) · [commissions](https://track360.io/learn/sportsbook-affiliate-program-management/commission-models-for-sportsbooks) · [15M](https://15m.com/affiliate-programs/betting/) · [Avvo picks legality](https://www.avvo.com/legal-answers/can-i-legally-sell-sports-betting-picks-and-make-i-5440762.html) · [ad rules](https://oddsindex.com/guides/sports-betting-advertising-rules) · [NCPG state regs](https://www.ncpgambling.org/wp-content/uploads/2024/09/NCPG_Vixio-U.S.-States-Online-Sports-Betting-Regulations.pdf) · [prediction markets](https://www.nytimes.com/athletic/7075799/2026-03-09/prediction-markets-sports-betting-legal-battles/)

## E. GitHub Issue → Requirement Map (triage baseline)

| Issue | State | Maps to | Triage read |
|---|---|---|---|
| #1 GitScan service_role leak | closed | NFR-S1 | Remediated (key rotated) — no PRD change |
| #2 Contact delivery/analytics/UX | open | FR-16, FR-17 | Refines existing LIVE into PLANNED phases 2–3; major-release candidate. Its *optional* contact layout/UI refresh is consciously de-scoped — flag when closing so the issue's 4th AC isn't silently dropped |
| #3 Predict flow reliability | open | FR-4, FR-8, FR-30, NFR-R2/U1 | Quality baseline work; major-release candidate |
| #4 Release-quality copy | open | FR-18 | Major-release candidate; voice anchors in §H |
| #5 Series video content | open | FR-13 (+ NFR-U1 for its responsive AC) | Post-gate; keep open but deprioritized |
| #6 Over/under + spread outputs | open | FR-26..29 | Post-gate + Q-2 posture decision |

## F. Traffic Benchmarks (subagent research, 2026-09-22 — third-party estimates, Sep 2026)

**Recommendation for Apr–Jun 2027, brand-new solo site with good SEO execution (window unique visitors):** conservative ~500; realistic ~2,000–3,000 (top-5 rankings in "Game 7"/"playoff probabilities" cluster); stretch ~8,000–10,000 (requires Reddit/X breakout, not SEO alone). Sanity anchor: tankathon took ~8 years to reach ~371K uniques/month; capturing 0.005–0.02% of the basketball-reference demand pool in a first window is the honest range. **Owner decision (2026-09-22): gate set at 1,500 window UVs** — below the realistic band by design (deliberately beatable), prediction count reported as secondary signal. PRD SM-1 is canonical for the figure.

Programmatic gate evaluation is viable: PostHog ships an official MCP server (query web traffic + insights; https://posthog.com/docs/model-context-protocol, https://posthog.com/docs/web-analytics/surfaces/mcp) and a query API — folded into FR-25.

| Site | Est. monthly visits | Uniques / notes | Seasonality |
|---|---|---|---|
| basketball-reference.com | ~15.9M | ~5.2M uniques (visits ≈ 3× uniques) | Heavy Oct–Jun tilt |
| nba.com | ~12M | ~7.2M uniques | In-season |
| cleaningtheglass.com | ~403K (likely inflated) | True engaged audience = subscribers, low thousands | Playoff spike plausible |
| craftednba.com | ~243K | ~65K uniques | In-season |
| thehoopsgeek.com | ~299K | No separate uniques | In-season |
| tankathon.com | ~883K | ~371K uniques; **best window-shape analog**: June Draft + playoffs, near-zero offseason | Extreme |
| oddsjam.com | ~1.37M | ~159K uniques (gap = bot/estimation noise) | Peaks playoff/finals weeks |
| dimers.com | ~682K | ~211K uniques | Offseason dip |

Caveats: visits ≠ uniques (uniques typically 30–60% of visits); sub-1M-site estimates from HypeStat/SEMrush can be off 2–5×; page-level traffic (ESPN BPI) isn't exposed by aggregators — espn.com's ~518M site-level visits are an unreachable benchmark, not a gate; near-zero sites (e.g., chartisity.nyc) don't register in aggregators at all.

Sources: [HypeStat](https://www.hypestat.com/info/basketball-reference.com) (per-site mirrors), [Similarweb basketball-reference](https://www.similarweb.com/website/basketball-reference.com/), [Similarweb top basketball sites](https://www.similarweb.com/top-websites/united-states/basketball/).

## G. Options Considered / Deferred Decisions

- **Contact notification (FR-17):** RESOLVED 2026-09-22 — **Resend** chosen (SendGrid and DB-store + notify fallback rejected for now); account provisioning is a build-time task; free tier required.
- **Versioning (NFR-D2):** RESOLVED 2026-09-22 — `package.json` canonical, CHANGELOG entry per release, no version in README (its stale "0.2.0" motivated the rule). Detail at NFR-D2. Commit conventions + bump cadence documented in root `AGENTS.md` (owner decisions 2026-09-23: imperative titles with FR/issue refs, direct-to-master, bumps at releases only).
- **Monetization shape (Q-2):** affiliate / premium tier (CTG-style, realistic ceiling ~hundreds of subs) / ads (negligible at current scale) / none — owner explicitly *open*, deliberately not decided in this PRD.
- **Betting posture (Q-2):** analytics-entertainment framing (assumed; lighter compliance) vs. picks framing (heavier disclaimers, 21+ gating closer to industry norm).
- **Video (FR-13):** external links (cheapest, e.g., YouTube) vs. Supabase Storage hosting (cost risk on free tier) vs. media service. Unresolved, parked.
- **DB platform (project memory):** stay on Supabase Postgres; Mongo rejected; alternatives to keep-alive ping (e.g., Xata) still open — out of PRD scope, tracked in project memory.
- **Analytics vendor (NFR-V1):** owner intends PostHog to be deprecatable/decoupled if the project doesn't gain traction — today it is wired via `posthog-js` + `@posthog/react` provider in `src/main.tsx`, 10 instrumented events, and `captureException` calls inside prediction/contact catch blocks (i.e., currently *interleaved* with feature code). The decoupling pass (adapter module + event registry; provider-agnostic metric query surface for FR-25) is the technical answer; design left to architecture doc.
- **Sharing (FR-31):** RESOLVED 2026-09-22 — deep-links + OG preview cards (option A) over screenshots-only; §8.1 candidate because share pages must be indexed before the playoff spike.
- **Positioning:** RESOLVED 2026-09-22 — "transparent analytics destination + sports storytelling/discovery experience," narrowed from the source doc's five open options (analytics platform / prediction engine / history archive / fan debate tool / storytelling product); PRD §1 records the choice.
- **Active-series source (Q-4):** RESOLVED (direction) 2026-09-22 — Fantrax API preferred, nba.com scrape fallback; feasibility spike is a build-time prerequisite; if both fail, Q-4 reopens as a phase-blocker (note lives at FR-21).

## H. Content-Marketing Levers (from `docs/archive/APP_FUNCTIONALITY_OVERVIEW.md` — that doc's stated purpose)

Consolidated here so the source's marketing intent survives; the PRD body deliberately carries no content calendar.

- **Voice anchors** (FR-18's copy pass should reference these): "Where data meets playoff drama" · "Decode the biggest game in basketball" · "Every Game 7 has a history" · "Not just who wins, but why" · "From iconic classics to hypothetical showdowns".
- **Story angles:** Game 7 history; probability vs. emotion; famous upsets and collapses; momentum and home-court debates; fan hypotheticals (custom matchups).
- **Marketing strengths:** clear niche (Game 7 only); built-in historical archive as recurring-content fuel; custom mode for audience participation; transparent methodology as post-538 differentiator; visual identity via team logos and famous matchups.
- **Recurring social formats:** "What would the model say?" posts; anniversary/this-day-in-Game-7-history posts; fan-submitted matchups; stat-of-the-day cards.
- **Insights as content factory:** pattern cards (FR-12) are written as short-form takeaways directly usable for marketing/social/educational content — which is why their wording quality is a product requirement, not decoration (ties FR-12 ↔ FR-18 ↔ SM-3).
