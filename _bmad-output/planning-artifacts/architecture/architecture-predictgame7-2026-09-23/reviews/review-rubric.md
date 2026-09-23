# Rubric Review — Architecture Spine (predictgame7)

- **Reviewer:** rubric-walker (BMAD finalize gate)
- **Artifact:** `_bmad-output/planning-artifacts/architecture/architecture-predictgame7-2026-09-23/ARCHITECTURE-SPINE.md` (status: draft, 2026-09-23)
- **Reviewed against:** good-spine checklist (7 items), PRD + addendum (`prd-predictgame7-2026-09-22`), and direct code inspection (`src/`, `supabase/`, `.github/`, `package.json`), plus live-site and vendor-doc verification.
- **Date:** 2026-09-23

## Overall verdict

**PASS WITH CONDITIONS** — a strong, code-grounded spine whose nine ADs demonstrably ratify the brownfield codebase and fix most real divergence points, but it ships two high-severity gaps: the GitHub Pages deep-link 404 that undermines AD-6's core mechanism (verified live), and an AD-4 rollout plan that contradicts the existing schema/frontend and would silently empty the Historical Archive if executed as written. Neither invalidates the decisions; both need rule text fixes before finalize.

## Checklist item verdicts

| # | Item | Verdict |
|---|------|---------|
| 1 | Fixes the real divergence points for the level below, misses none | **PARTIAL** — nails the sweep-verified drifts (AD-1/2/3 all confirmed real in code) but misses three: GH Pages SPA fallback (Finding 1), `insights_cache` refresh ownership (Finding 4), prerendered-series URL scheme vs. share deep-link canonicalization (Finding 5) |
| 2 | Every AD's Rule is enforceable and prevents its stated divergence | **PARTIAL** — AD-1, AD-2, AD-3, AD-5, AD-7 (constraint), AD-8, AD-9 are enforceable; AD-4's rollout sequence is not enforceable as written against the actual schema/queries (Finding 2); AD-1's metric-query surface has an unenforceable execution location (Finding 3); AD-6's "opening it re-renders" is not achievable under the current hosting behavior (Finding 1) |
| 3 | Nothing under Deferred could let two units diverge | **PASS (with note)** — every deferred item has an owner-decision trigger or a boundary already fixed by an AD (staging has a revisit trigger + shape; pipeline language is bounded by the AD-5 port; betting outputs extend the AD-2 contract). Note: the AD-7 prerender *mechanism and route scheme* is effectively undecided but is **not listed** in Deferred — a silent gap rather than an honest deferral (Finding 5) |
| 4 | Named tech verified-current | **PASS (with notes)** — verified: satori + resvg is Supabase's official Edge Function OG-image pattern ([supabase.com/docs/guides/functions/examples/og-image](https://supabase.com/docs/guides/functions/examples/og-image)); PostHog official MCP server exists ([posthog.com/docs/model-context-protocol](https://posthog.com/docs/model-context-protocol)); Resend has a current free tier ([resend.com/pricing](https://resend.com/pricing)); `Deno.serve` + `jsr:` is current Supabase convention (matches `predict-game-7/index.ts`); every version in the Stack table matches `package.json` exactly. Notes: `vite: npm:rolldown-vite@latest` is a floating pin replicated without comment (Finding 7); pipeline language deliberately unverified pending Q-4 spike — correctly flagged |
| 5 | Ratifies rather than contradicts the brownfield codebase | **PASS (with corrections)** — spot-checked claims are accurate: AD-2 drift is real (`src/types/types.ts:70` union `'bayesian' | 'ensemble_v1' | 'margin_model_v1'` + `PredictPage.tsx:17` vs. function's `'bayes'` at `predict-game-7/index.ts:28`); AD-3 dual runtime is real (`handle-contact/index.ts:1-2` uses `deno.land/std@0.168.0` + `esm.sh`; `predict-game-7` uses `Deno.serve` + `jsr:`); AD-1's bound file list matches (posthog imports in `main.tsx`, `PredictPage`, `HistoricalPage`, `HomePage`, `AuthContext`); AD-8 ratifies `src/db/supabase.ts` (anon key, direct page reads); `?series=` precedent exists (`PredictPage.tsx:77`, `HomePage.tsx:181`). Corrections: the "PostHog agent-skill folder in the repo" does not exist (Finding 6); AuthContext emits two events outside the 10-name registry (Finding 9) |
| 6 | Covers the driving spec's capabilities | **PARTIAL** — the Capability→Architecture Map covers FR-1..31 and gated items are honestly parked. Gap: FR-12's testable consequence ("Insight values … refreshed by pipeline") has no owner — AD-5's port covers only series statuses and game scores, and `insights_cache` is populated solely by legacy migration `00001` (Finding 4) |
| 7 | Every altitude-owned dimension decided / deferred / open | **PARTIAL** — data model, module structure, security boundary, analytics, pipeline, sharing, SEO, config/secrets, migrations, performance are all decided; deployment & environments has an explicit paragraph (single env, no staging + revisit trigger, build→prerender→gh-pages chain, keepalive). Missing from the operational envelope: SPA/404 behavior of the GH Pages host (Finding 1), Edge Function deployment & secrets provisioning mechanics (Finding 8), and where FR-25 metric queries execute (Finding 3) |

## Findings

### Finding 1 — HIGH — AD-6/AD-7 + "Deployment & environments": GitHub Pages 404s every deep-link URL; the share mechanism is dead on arrival as deployed

- **Location:** AD-6 Rule ("a Share Link is a site deep-link … opening it re-renders without re-entry"; `share-og` "redirects humans to the site deep-link"); AD-7 Rule (CTA into Predict with series preloaded); Structural Seed → "Deployment & environments" paragraph.
- **Evidence:** The app uses `BrowserRouter` (`src/App.tsx:11`, basename from `vite.config.ts:23`). GitHub Pages serves static files only — it does not rewrite unknown paths to `index.html`. Verified live: `https://ujsolon.github.io/predictgame7/predict?series=1` returns **404 Not Found**. Neither `public/` nor `dist/` contains a `404.html`. Existing in-app navigation works only because it is client-side; every *fresh* visitor arriving at a deep-link — the exact population FR-31/SM-3 depends on — hits GitHub's 404 page. The spine's own AD-6 "Prevents" clause ("any design assuming [per-URL meta] is dead on arrival") applies, ironically, to its redirect target.
- **Why it matters:** AD-6's rule cannot prevent its stated divergence if the mechanism it standardizes does not function on the chosen host. This silently breaks FR-31 acceptance ("Opening a Share Link re-renders the original Prediction"), SM-3 attribution, and AD-7's "CTA into the Predict flow with that series preloaded" when the CTA is a link out of a prerendered page.
- **Fix:** Add an explicit decision to the Deployment & environments paragraph (or AD-6): the build emits a `404.html` SPA fallback (standard GH Pages pattern — a copy of `index.html`, optionally with the 404→redirect status handling), included in the `predeploy` chain and verified by the AGENTS.md gate ("fresh-load a deep-link URL, not just in-app navigation"). One sentence in the spine is enough; the point is that *some* unit must own it before FR-31 is built.

### Finding 2 — HIGH — AD-4: rule contradicts the existing schema and omits the frontend from the rollout; executing it as written silently empties the Historical Archive

- **Location:** AD-4 Rule ("`status text NOT NULL CHECK (status IN ('active','completed'))` … Ship as a numbered migration + backfill (existing rows → `completed`) + `docs/CURRENT_DATA_MODEL.md` update in the same change").
- **Evidence:** The DB already has a *three-value* constraint and default: `00005_release_1_data_model.sql:33-36` — `status TEXT DEFAULT 'historical'` + `CONSTRAINT chk_series_status CHECK (status IN ('historical','active','completed'))`. The Historical Archive query is `HistoricalPage.tsx:40` — `.eq('status', 'historical')`; the frontend union is `types.ts:34` (`'historical' | 'active' | 'completed'`); `CurrentGame7sPage.tsx:29` queries `'active'`; `PredictPage.tsx:114,293,305` branch on `status === 'active'`. AD-4's ship-list (migration + backfill + docs) omits: dropping/replacing `chk_series_status`, changing the column DEFAULT, and updating `HistoricalPage`'s query and `types.ts`. If the migration lands first (or alone), `status='historical'` rows become `'completed'` and the archive page — the site's SEO asset per AD-7 — renders **empty** with no error.
- **Why it matters:** checklist item 2 — the rule as written does not prevent its stated divergence ("every consumer inventing its own Active-vs-Historical test"); it creates a new one between the pipeline/migration unit and the frontend unit.
- **Fix:** Extend AD-4's ship sentence: "the migration replaces the existing `chk_series_status` constraint and the `'historical'` default; `HistoricalPage`'s archive query flips to `status='completed'` and `src/types` union narrows **in the same release** as the migration; no release may contain the migration without the frontend change." Optionally note `CurrentGame7sPage.tsx` (unrouted — see Finding 9's dead-code family) so nobody "fixes" it in isolation.

### Finding 3 — MEDIUM — AD-1 / FR-25: the metric-query surface has no execution location, and the obvious ones violate NFR-S1

- **Location:** AD-1 Rule ("The module also owns the provider-agnostic **metric-query surface** for FR-25's gate figures (today: wrapping the PostHog query API / official MCP server)").
- **Evidence:** PostHog's query API and MCP server authenticate with a **personal API key**, which is a secret — it can never live in a `VITE_*` var or the client bundle (NFR-S1; the Consistency Conventions "Config" row agrees). But AD-1 places the query surface inside `src/lib/analytics/` — a client module. FR-25 only requires the figures be "obtainable programmatically"; where that program runs is undecided. Two implementers could diverge (one adds a query wrapper into the SPA, another builds an owner-local script), and the first path either leaks a key or silently can't work.
- **Fix:** One clarifying clause in AD-1: the query surface is *documented and typed* by `src/lib/analytics/` (event/property names, metric definitions) but *executes outside the bundle* — owner-local tooling (PostHog MCP or a script) holding a personal API key stored outside the repo. That keeps NFR-V1's "gate numbers survive a vendor swap" while respecting NFR-S1.

### Finding 4 — MEDIUM — AD-5 / FR-12: `insights_cache` refresh has no owner anywhere in the spine

- **Location:** AD-5 Rule (port methods: `fetch_series_statuses`, `fetch_game_scores`; writes keyed on series/scores only); Capability map row "Archive & Insights FR-10..12 → AD-8, AD-7".
- **Evidence:** FR-12's testable consequence: "Insight values derive from the archive, **refreshed by pipeline**, not hard-coded in the client." `InsightsPage.tsx:38` reads `insights_cache`; the table is created/populated only by legacy migration `00001_create_game_sevens_tables.sql`; no current script, function, or workflow writes it. AD-5 — the only pipeline decision — covers statuses and scores but not insight recomputation, and Deferred does not list it. The pipeline unit and the Insights surface can diverge (stale insights after every playoff update) with no rule violated.
- **Fix:** Add one clause to AD-5's Rule: after upserts, the runner recomputes/refreshes `insights_cache` rows (idempotent, same failure-loudness rule) — or explicitly move it to Deferred with a trigger ("before the first inseason run, Apr 2027").

### Finding 5 — MEDIUM — AD-7 vs AD-6: the prerendered series URL scheme is undecided, and its canonical relationship to share deep-links is unfixed

- **Location:** AD-7 Rule ("emits one static HTML per historical series route … route list generated from the DB at build time"; "Prerendering must not fork the app: same routes, same components, hydration only"); AD-6 Rule (`/predict?series=<id>` deep-links).
- **Evidence:** No per-series route exists today — `/historical` is one page with expandable panels (`routes.tsx`), and the series identity in share links is a DB id (`?series=<id>`). "One static HTML per historical series route" therefore implies ~177 **new** URLs whose pattern (`/series/:year/:round`? `/historical/:id`?) is nowhere fixed, and each series would then have two public URLs (the prerendered archive page and the `/predict?series=` deep-link) with no canonical/redirect rule. That is precisely the duplicate-content/split-link-equity divergence the addendum §D SEO play cannot absorb, and two units (archive-SEO builder vs. share builder) can each invent a different scheme.
- **Fix:** Pin in AD-7: (a) the route pattern for prerendered series pages, (b) that they are the canonical archive URLs, and (c) that `/predict?series=` links remain the share/CTA target (or vice versa) — one sentence each. If the mechanism itself (how prerender works with declarative-mode react-router 7 + `rolldown-vite`, which has no built-in prerender) is genuinely undecided, say so in Deferred with the constraint AD-7 already states ("must not fork the app") rather than leaving it implicit.

### Finding 6 — LOW — AD-1: "the PostHog agent-skill folder in the repo" does not exist

- **Location:** AD-1 Rule, last clause ("On any vendor exit, the PostHog agent-skill folder in the repo exits with it (Q-8)"), sourcing addendum §A.1's "Leftover artifact".
- **Evidence:** Searched the repo (excluding `node_modules`): no PostHog skill folder. `.claude/skills/` contains only `integration-react-react-router-7-declarative`; `.qoder/skills/` contains only bmad-* skills; the only PostHog artifact is `docs/archive/posthog-setup-report.md` (documentation, not a skill). The addendum claim appears stale.
- **Fix:** Correct the clause (drop the folder reference or point at the actual artifact) so a build agent doesn't hunt for a nonexistent directory; note the addendum correction per its lifecycle rule.

### Finding 7 — LOW — Stack table: `npm:rolldown-vite@latest` is a floating pin replicated without comment

- **Location:** Stack table, "Vite" row ("verified from `package.json` … at authoring 2026-09-23").
- **Evidence:** `package.json:94` — `"vite": "npm:rolldown-vite@latest"`. The version literally cannot be "verified" — it floats to whatever is newest at install time, which contradicts the spine's SEED claim and makes builds non-reproducible across machines/CI (and interacts with the deferred Vitest-compatibility question). Related: `@types/react` ^19 against React ^18 is a latent mismatch the sweep didn't flag.
- **Fix:** Either pin a concrete `rolldown-vite` version in the Stack table with a note ("pin at next build-affecting change"), or add a Consistency Conventions row: "floating `@latest` pins are prohibited once a release depends on them."

### Finding 8 — LOW — Deployment & environments: Edge Function deployment and secrets provisioning mechanics are silent

- **Location:** Structural Seed → "Deployment & environments" paragraph; AD-3 (Resend key "is a Supabase function secret").
- **Evidence:** The paragraph covers only the frontend chain (build → prerender → gh-pages) and the Supabase project's existence. How `predict-game-7` / `handle-contact` / future `share-og` are deployed (Supabase CLI in CI vs. dashboard paste), how migrations are applied (no `supabase db push` anywhere in scripts), and how function secrets (Resend key, `SUPABASE_SERVICE_ROLE_KEY` for GH Actions per AD-5) get provisioned and rotated are decided nowhere — every one of these is a place where two build stories diverge or a secret lands in the wrong store (issue #1 history).
- **Fix:** One or two sentences: e.g., "Edge Functions and migrations deploy via Supabase CLI (linked project ref committed in `supabase/.temp`/config, access token in GH secrets); function secrets set via `supabase secrets set`, never in the repo; manual dashboard deploys are the interim until CLI wiring lands."

### Finding 9 — LOW — AD-1/AD-9: dead-code inventory is incomplete and the registry clause doesn't account for dead-code events

- **Location:** AD-1 Rule ("`EVENTS` … the 10 names from addendum §A.1, verbatim"); AD-9 Rule (dead modules: "`AuthContext`/`RouteGuard`, `SamplePage.tsx`").
- **Evidence:** (a) `AuthContext.tsx:94,113` captures `user_signed_in` / `user_signed_up` — two events **outside** the 10-name registry, contradicting addendum §A.1's "no named auth events"; AD-1's "verbatim 10" rule doesn't say what happens to them (they die with the module, but the rule should say so, since AD-1 explicitly binds AuthContext). (b) `src/pages/CurrentGame7sPage.tsx` is a third dead page — it is not in `routes.tsx` and is unreachable — and it queries `series` by `status='active'`, making it an AD-4 migration casualty nobody owns. AD-9's deletion list misses it.
- **Fix:** Add `CurrentGame7sPage.tsx` to AD-9's dead-module list (delete at FR-22 work or with the AD-4 migration, whichever comes first) and one clause to AD-1: "the two auth-event captures in dead `AuthContext` are not part of the registry and are removed with it."

## Checklist-item → findings trace

- Item 1: Findings 1, 4, 5
- Item 2: Findings 1, 2, 3
- Item 3: Finding 5 (note)
- Item 4: Finding 7 (note; all other named tech verified current)
- Item 5: Findings 6, 9 (corrections; ratification otherwise confirmed against code)
- Item 6: Finding 4
- Item 7: Findings 1, 3, 8

## Severity summary

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| High | 2 | 1, 2 |
| Medium | 3 | 3, 4, 5 |
| Low | 4 | 6, 7, 8, 9 |

## Gate recommendation

Do not finalize as-is. Findings 1 and 2 are rule-text fixes (a hosting-fallback decision and an AD-4 rollout correction) that take minutes and remove the two ways the next level down could ship a broken FR-31 or an emptied archive. Findings 3–5 should be resolved with one clarifying clause each; Findings 6–9 can ride as edits during finalize. No AD needs to be re-decided — the decisions themselves are sound and well-grounded in the codebase.
