# Adversarial Review — Architecture Spine (finalize gate)

- **Reviewer role:** adversarial (BMAD finalize gate)
- **Artifact:** `ARCHITECTURE-SPINE.md` (status: draft, 2026-09-23)
- **Method:** for each attack, two units one level down (stories/epics) are constructed that each obey every AD to the letter yet integrate incompatibly. All code claims verified against `src/`, `supabase/`, `package.json`, `tsconfig*.json`, `vite.config.ts`, and `dist/` on 2026-09-23.
- **Verdict:** DO NOT FINALIZE AS-IS. The spine is coherent at paradigm level, but at least 5 constructible compliant-yet-incompatible unit pairs exist — concentrated on the FR-31 share seam (payload ownership, GitHub Pages routing reality, public auth), the AD-4 status migration sequencing, and the unpinned `series.round` domain. Each hole below closes with a new or tightened AD.

Severity scale: **Critical** (feature dead on arrival / data corruption), **High** (user-visible breakage or broken acceptance across units), **Medium** (drift/rework, recoverable), **Low** (friction only).

---

## Attack 1 — The share link 404s: `share-og` redirect target vs. GitHub Pages reality  **[CRITICAL]**

**Unit A — "Build `share-og` Edge Function" (FR-31).** Obeys AD-3 (Deno.serve, jsr:, `_shared` helpers) and AD-6 to the letter: serves OG meta from `?p=<payload>` and "immediately redirects humans to the site deep-link" — `https://ujsolon.github.io/predictgame7/predict?series=<id>&method=<slug>`, per AD-6's literal deep-link contract and the "extends today's `?series=` precedent" clause.

**Unit B — "Build-time prerender for archive" (AD-7).** Obeys AD-7 exactly: emits static HTML **only** for historical-series routes ("Active-series and custom routes stay client-rendered"); prerender "must not fork the app: same routes, same components". It emits nothing at `/predict` because AD-7's content scope is the historical archive, and `/predict` is already a client route.

**The incompatibility.** GitHub Pages serves files, not an SPA fallback. Verified today: `dist/` contains exactly one `index.html`; there is no `public/404.html` SPA-redirect hack and no per-route shells. A hard navigation (which is what a share-og 302 produces, and what every crawler and shared-link recipient performs) to `…/predictgame7/predict?series=…` returns GitHub's 404. The "`?series=` precedent" AD-6 cites only works via client-side routing after landing on `/` — `PredictPage.tsx` reads the param with `useSearchParams`, which never runs if the HTML never loads. Both units obeyed every AD; the entire FR-31 human path and SM-3 measurement are dead on arrival. AD-7's prerender step is the *only* mechanism in the spine that could make deep-link paths resolve, and it is scoped to the archive only.

**Severity: Critical** — FR-31, SM-3, and the addendum §D SEO play all fail; nothing in the verification gate (`npm run build` + lint) catches it.

**Proposed AD fix.** Extend AD-6 (or AD-7) with a hard rule: *every URL that any Edge Function, share link, or external surface can direct a browser to must resolve to a real file in `dist/`.* Concretely: the predeploy chain emits either (a) route shells (`dist/predict/index.html`, etc.) for all client-routed deep-link targets, or (b) the standard GH Pages `404.html` SPA-redirect — and pins the canonical site origin + basename (`https://ujsolon.github.io/predictgame7/`) as a shared constant (see Attack 6) so `share-og` never reconstructs the origin by hand. Add "curl the redirect target and get 200 + app HTML" to FR-31 acceptance.

---

## Attack 2 — Nobody owns the `?p=` payload: Share button vs. `share-og`  **[CRITICAL]**

**Unit A — "Add Share button to prediction result" (frontend, FR-31).** AD-6 says the copied link is the share-og URL with `?p=<payload>` and that custom matchups encode `{teams, scores, method}` as "url-safe base64". Unit A builds the encoder in `src/lib/` (AD-9: kebab-case lib modules): `p = base64url(JSON.stringify(result))` where `result` is the `PredictionResult` shape the function *actually returns today* (AD-2: "fields the function actually returns") — snake_case fields, `win_probability_a: 62.4` (percent scale, verified in `predict-game-7/index.ts` lines 377–378), `method_used: 'bayes'`.

**Unit B — "Build `share-og`" (function side, FR-31).** AD-2/AD-3 say shared contracts live in `supabase/functions/_shared/contract.ts`. Unit B defines the share payload there — a compact discriminated union `{ kind:'series', series_id, method } | { kind:'custom', team_a, team_b, scores: number[12], method }` — because that is the minimum needed to render the card and rebuild the deep-link, and it follows the Consistency Conventions row "probabilities 0–1 in contract, % only at render", so it types any probability field 0–1. It decodes with strict validation and returns the AD-3 error envelope on mismatch.

**The incompatibility.** Both units obeyed AD-2, AD-3, AD-6, and the conventions table. Nothing in the spine defines: the payload's field names or shape; who owns its schema (frontend `src/`? `_shared/contract.ts`?); which base64 variant (padded/unpadded, `+/` vs `-_`); whether the payload carries rendered facts (winner, probabilities — needed for the OG card without a DB round-trip for custom matchups) or just keys; or the probability scale (the spine *contradicts itself* — see Attack 3). Result: every shared custom link fails `share-og` validation (`{error}` → no OG meta → no unfurl), or decodes to garbage; probabilities are off 100× wherever both sides "compromise". The two units discover this only at integration, after both are "done".

**Severity: Critical** — FR-31's core artifact (the share link) is precisely the cross-boundary contract the spine exists to pin, and it is unpinned.

**Proposed AD fix.** Tighten AD-2 + AD-6: add a `SharePayload` type **and its encode/decode function pair** to `supabase/functions/_shared/contract.ts` as the single owner of the base64 schema (contract.ts stays isomorphic — see Attack 8 — so `src/` may import the encoder, `share-og` the decoder, or both import one pair). Pin: base64url unpadded; canonical field list; probability scale; `MethodSlug` per AD-2; a version field (`v:1`) so payloads outlive schema changes; and a contract test executed against both the frontend build and the function (FR-30 territory, but the AD must require it).

---

## Attack 3 — The spine contradicts itself on probability scale: contract refactor vs. renderers  **[HIGH]**

**Unit A — "Unify prediction contract" (AD-2, issue #3).** AD-2 defines `PredictionResult` as "fields the function actually returns: winner, probabilities, contributing factors, confidence, computation time, method_used". The function actually returns `win_probability_a: Math.round(probability_a * 100 * 100) / 100` — **0–100 percent scale** (verified). Unit A faithfully types the contract as percent-scale, documents it, and leaves `PredictPage`'s existing `{prediction.win_probability_a}%` render untouched (correct under this contract).

**Unit B — "OG card template + new result components" (AD-6/AD-7 era work).** The Consistency Conventions table binds it: "probabilities 0–1 in contract, % only at render". Unit B therefore writes every new consumer (satori card text, prerendered CTA data attributes, any FR-26..29 extension point) as `(p * 100).toFixed(0) + '%'`.

**The incompatibility.** Two spine clauses give opposite answers about the same contract type. Unit A's world renders "62%"; Unit B's world renders "6200%" (or, reading it the other way, "0.62%"). This is not hypothetical drift — it is a contradiction *inside the ratified document*, so a compliance-focused agent on either side is "obeying the spine". Note the DB is a third scale world: `predictions.probability` is `NUMERIC(5,2)` with `CHECK (probability >= 0 AND probability <= 100)` (migration 00005) — i.e., percent — which will matter the moment FR-23 persistence ships.

**Severity: High** — user-visible wrong numbers on the exact surfaces (share cards, predictions) the product's credibility rests on; trivially missed in code review because each side can cite the spine.

**Proposed AD fix.** Amend AD-2 to state the scale explicitly and reconcile the conventions row: either (a) contract stays 0–1 and `predict-game-7` is *changed* (AD-2 must then say the function output changes and PredictPage render divides — a migration of behavior, not just types), or (b) contract is percent 0–1 and the Consistency Conventions row is corrected to match reality + `predictions.probability`'s existing CHECK. Pick one, write the number into AD-2, and delete the ambiguity.

---

## Attack 4 — Status enum migration darkens the live archive: DB migration vs. deployed frontend  **[HIGH]**

**Unit A — "Pin `series.status` domain" (AD-4).** Ships exactly what AD-4 mandates, in one change: numbered migration with `CHECK (status IN ('active','completed'))`, backfill existing rows → `completed`, `docs/CURRENT_DATA_MODEL.md` update. The migration applies to the single production Supabase project the moment it runs (AGENTS.md: migrations need owner confirmation, but nothing sequences them against frontend deploys).

**Unit B — "Archive & Insights work" (FR-10/11, AD-8 direct reads).** The live `HistoricalPage` queries `.eq('status', 'historical')` (verified, line 40). AD-4 tells Unit B that Historical = `status = 'completed'`, and Unit B duly updates the page — but its change only reaches users at the **next gh-pages deploy**, which per AGENTS.md happens "only when the owner asks for a release". `src/types/types.ts`'s `Series.status` union (`'historical' | 'active' | 'completed'`) is not covered by AD-2's deletion order (that only names `src/types/prediction.ts` / the stale method unions), so nothing forces Unit B to touch it.

**The incompatibility.** Between migration-run and next frontend deploy — potentially days — production `HistoricalPage` filters for a value that no longer exists: **the 177-series archive, the site's SEO asset, renders empty**. Conversely, a strict-reading Unit B that refuses to change anything until "AD-4's same change" includes it produces a mega-change spanning DB + frontend + deploy, which the spine never asks for. Neither unit violated an AD; the spine simply has no deployment-sequencing rule for schema changes consumed by a separately-deployed static frontend, and AD-4's "same change" is ambiguous about whether frontend query updates are inside it.

**Severity: High** — outage-class breakage of a LIVE requirement (FR-10/11) during the exact window (pre-playoff) the release targets.

**Proposed AD fix.** Tighten AD-4 with a rollout order: (1) frontend first — Historical must be queried as `status <> 'active'` (or `IN ('historical','completed')` transitionally) and shipped/deployed; (2) then migration + backfill; (3) then cleanup to the two-value test. Enumerate every status consumer as bound by AD-4: `HistoricalPage`, `CurrentGame7sPage`, `PredictPage` (already resilient: `status === 'active' ? current : historical`), the AD-7 prerender route query, and `share-og`. Require `src/types` `Series.status` union to become `'active' | 'completed'` in the frontend-first step. State the general rule (belongs in AD-8 or the Migrations convention row): *no migration may remove a value the deployed bundle still queries; contract-narrowing migrations ship behind a compatible frontend deploy.*

---

## Attack 5 — Crawlers get 401: `share-og` auth posture vs. the copy-link flow  **[HIGH]**

**Unit A — "Deploy `share-og`" (AD-3).** Follows every runtime convention: `Deno.serve`, jsr: imports, `_shared` CORS + `jsonResponse`. The repo has **no `supabase/config.toml`** (verified — `supabase/` holds only functions/migrations/scripts/.temp), and the spine never mentions JWT verification, so Unit A deploys with platform defaults (JWT verification on for CLI/dashboard deploys unless explicitly disabled) and tests via the same `supabase.functions.invoke` pattern the frontend uses everywhere — which silently attaches the anon `Authorization` header. Works.

**Unit B — "Share button + link copying" (AD-6, frontend).** Builds the copied URL as `…/functions/v1/share-og?p=…` per AD-6's literal text ("the link users copy is the share-og Edge Function URL"), verifies the unfurl using in-app tooling/preview with the apikey header present, and ships.

**The incompatibility.** Twitter/WhatsApp/Slack/iMessage crawlers — and humans pasting the URL into a fresh browser — issue a bare GET with **no Authorization header**: 401 before any handler code runs. No OG meta, no redirect, SM-3 reads zero, and the failure is invisible to both units' tests because everything inside the app carries the anon key. AD-8's "client-side = reads only through `src/db/supabase.ts`" reinforced the habit of never touching raw function URLs, so no one tested the raw path. The spine fixed the *content* of the share contract but not its *auth posture* — the one property that distinguishes `share-og` from every other function in the system.

**Severity: High** — FR-31's crawler path (the entire reason `share-og` exists per AD-6) fails silently in production only.

**Proposed AD fix.** Extend AD-3 and/or AD-6: `share-og` is a **public function** — deployed with JWT verification disabled (`--no-verify-jwt` / `verify_jwt = false` in a newly required `supabase/config.toml`, which becomes the committed source of truth for function config), GET-only, no secrets beyond the anon/service client it needs, and abuse-bounded (payload validation + free-tier invocation budget per AD-6). Acceptance must include an unauthenticated `curl` returning 200 HTML with OG tags. Generalize: every Edge Function declares its auth posture (public / anon-JWT / user-JWT) in the spine's function inventory.

---

## Attack 6 — Two canonical URLs per series: prerender routes vs. deep-link identity  **[HIGH]**

**Unit A — "Prerender historical archive" (AD-7).** AD-7 requires "one static HTML per historical series route, route list generated from the DB" — but **no per-series route exists**: `routes.tsx` has only `/`, `/predict`, `/historical`, `/insights`, `/maths` (verified), and `HistoricalPage` expands a series in a modal with no URL. Unit A must therefore invent the route; following the Consistency Conventions row "Series identity = `(year, round)`" and SEO best practice, it ships `/historical/1988/first-round` style paths, slugging the free-text `round` column.

**Unit B — "Share deep-links + `share-og`" (AD-6).** AD-6 literally specifies the deep-link as `/predict?series=<id>` — where `<id>` per the existing `?series=` precedent is the **UUID** (`PredictPage.loadSeriesById` does `.eq('id', seriesId)`, verified). Unit B sets `og:url`/canonical to that deep-link and links CTAs by UUID.

**The incompatibility.** Every historical series now has two URLs: Unit A's crawlable `(year, round)` page and Unit B's UUID deep-link. `og:url`, canonical tags, sitemap entries, and internal links disagree → duplicate-content split of exactly the SEO equity AD-7 exists to accumulate; the prerendered page's "CTA into the Predict flow with that series preloaded" must cross-map identities (year/round → UUID) with no defined mechanism. Worse, the identity split is unstable: `(year, round)` is the pipeline's upsert key (AD-5) but nothing constrains UUID stability — a re-backfill or row recreation silently invalidates every share link ever circulated, while `(year, round)` URLs survive. And `round` is free TEXT seeded from a spreadsheet, so Unit A's slug function is guesswork that Unit B's og:title rendering may not match ("Conference Semifinals" vs "conference-semifinals" vs "conf-semis").

**Severity: High** — the two SEO/sharing ADs, built by different agents, produce divergent URL contracts for the same entity; AD-7 is literally unimplementable without inventing a route scheme the spine doesn't fix.

**Proposed AD fix.** New AD (or joint amendment of AD-6/AD-7): **one canonical series URL**, recommended `/series/<year>/<round-slug>` (or under `/historical/`), owned by the route table; the canonical URL is what `og:url`, canonicals, and sitemaps carry; `/predict?series=<uuid>` remains an internal deep-link but 301/canonicals to the series page for crawlers. Pin the `round` slug domain (ties into Attack 7) and require a single `seriesUrl(series)` helper (isomorphic, `_shared` or `src/lib` per Attack 8's rule) used by prerender, share-og, and all internal links. State UUID-stability requirements for anything encoded in a share link.

---

## Attack 7 — `(year, round)` is not a key yet: fantrax adapter vs. nba_com adapter vs. legacy rows  **[HIGH]**

**Unit A — "Fantrax adapter" (AD-5, post-spike).** Implements `SeriesDataSource.fetch_series_statuses` faithfully; the port's method shapes are explicitly deferred ("adapter internals still pending Q-4 spike"), so it returns `round` as the source renders it — e.g., `"First Round"`, `"Conference Semifinals"`. Writes are "idempotent upserts keyed `(year, round)`" per AD-5.

**Unit B — "nba.com fallback adapter + manual_csv" (AD-5).** Equally faithful; its sources render rounds differently — `"first_round"`, `"Conf. Semis"`, or the spreadsheet's legacy spellings (the 177 backfilled rows came from `NBASeriesResults.xlsx` via `load-games/main.py`; their `round` text is whatever that sheet held).

**The incompatibility.** The "idempotent" upsert key is a free-text column with **no value domain anywhere in the spine** (AD-4 pinned `status`; nothing pins `round`) and **no unique constraint in the DB** — migration 00005 creates no `UNIQUE (year, round)` on `series` (verified; only team-difference and status checks). The first inseason run where the adapter's spelling diverges from the existing row's spelling inserts a *second* series for the same matchup: the archive shows it twice, prerender emits two routes, `PredictPage`'s dialog lists both, status transitions hit one row while scores hit the other, and the Consistency Conventions' "Series identity = (year, round)" is quietly false. AD-5's "fail loudly" principle never fires — the run *succeeds*. The two adapter units, plus the offline/inseason workflow split (offseason mode may run `manual_csv`, inseason `fantrax`), guarantee the collision is cross-unit and cross-time.

**Severity: High** — silent data corruption in the single entity the whole product is organized around; undetectable by either unit's own tests; directly undermines AD-4 (which row does the pipeline flip to `completed`?) and Attacks 1/6 (which row does a share link point at?).

**Proposed AD fix.** Tighten AD-5: the `SeriesDataSource` port contract must return a **canonical round enum** (pinned value domain, e.g. `'first_round' | 'conference_semifinals' | 'conference_finals' | 'finals'`), with source-specific mapping done *inside each adapter* and normalization validated in the shared runner — never trusting source text. Accompanying migration: canonicalize existing `series.round` values to the enum and add `UNIQUE (year, round)` so a violation fails the run loudly (satisfying AD-5's own principle at the DB layer). Update the Consistency Conventions row to point at the enum, and `docs/CURRENT_DATA_MODEL.md` per the migrations convention.

---

## Attack 8 — The type-only bridge that doesn't bridge: `src/types` re-export vs. `_shared` Deno reality  **[MEDIUM-HIGH]**

**Unit A — "Create `_shared/contract.ts` and re-export" (AD-2 + AD-3).** AD-3 puts shared code in `supabase/functions/_shared/` including runtime helpers (CORS, `jsonResponse`, **service-role client factory** — necessarily Deno-flavored, `jsr:` imports). AD-2 puts `contract.ts` there too and says the frontend "re-exports it via type-only import". Unit A writes contract.ts with a runtime `METHOD_SLUGS` const (needed by the function to validate input — and by the SharePayload encoder of Attack 2), and imports it from `src/types/prediction.ts` via a relative path (the `@/` alias maps only to `./src/*`, verified in both tsconfig and vite.config — AD-9's "imports use the `@/` alias exclusively" is *unfollowable* for this one import).

**Unit B — "Keep the verification gate green" (AGENTS.md + existing tooling).** `tsconfig.app.json` has `include: ["src"]`, `strict`, `isolatedModules`, DOM-only libs, `typeRoots: ["./node_modules/**/*"]` (verified). There is **no `deno.json`/`deno.lock` anywhere in the repo** (verified) — Edge Functions are not type-checked or linted by any committed config, and Biome lints the workspace as configured. Unit B's gate is `npm run build` + Biome; nothing on the Deno side is verified by anything.

**The incompatibility.** The bridge file has two compilers with disjoint capabilities and *no shared check*: (1) the moment contract.ts (or anything it imports) references `Deno.*` or a `jsr:` specifier, `tsc -p tsconfig.app.json` and/or the Vite build fails — but no rule in the spine forbids runtime/Deno content in contract.ts, and AD-3 actively colocates it with Deno-only modules, so a function-side agent adding a validation helper to `_shared` can break the frontend build from across the boundary with no gate catching it on *their* side. (2) Conversely, nothing type-checks contract.ts under Deno at all — the function-side "does it compile" question is untested until deploy. (3) If Unit A plays it safe and keeps contract.ts pure types, the function and the frontend each grow their own runtime slug constant — recreating the exact `'bayes'` vs `'bayesian'` drift AD-2 exists to prevent. (4) `isolatedModules` forces `export type` re-exports; the "delete stale unions in `src/types/types.ts`" order leaves `Series`/`PredictionInput` consumers importing from two files during the transition, with no rule for which wins. (5) Vite dev-server `fs.allow` defaults to the workspace root so the import *resolves*, masking the fact that the file lives outside every frontend config's `include` — a false sense of coverage.

**Severity: Medium-High** — a build-breakage and re-drift vector on the spine's flagship anti-drift mechanism, exercised by every future contract change.

**Proposed AD fix.** Tighten AD-2/AD-3: `contract.ts` is **dependency-free and isomorphic** — pure types plus pure constants/functions with zero imports, no Deno globals, no `jsr:` specifiers; runtime helpers live in sibling `_shared` files that `src/` may never import. Register an explicit AD-9 carve-out for the single sanctioned import path (e.g., add a `@shared/*` alias in vite.config + tsconfig.app so the convention "alias exclusively" stays true). Add `supabase/functions/deno.json` with a `check`/`lint` task and wire both `tsc -p tsconfig.app.json` and `deno check` into the AGENTS.md verification gate. Require contract changes to land with a test that imports the contract from both runtimes.

---

## Attack 9 — Prerender vs. pipeline: stale builds and the silent-empty-route failure  **[MEDIUM-HIGH]**

**Unit A — "Prerender step in predeploy" (AD-7 + Deployment section).** Route list "generated from the DB at build time". Deploy is owner-triggered (AGENTS.md); the verification gate is *local* `npm run build`. Unit A reads the DB with the anon key from `.env.local`/CI env, and — because AD-7 says nothing about failure behavior and AD-5's "fail loudly" is scoped to the pipeline — treats an unreachable DB (free-tier cold start/pause is a documented reality; the keepalive cron exists precisely for this) as a warning and emits **zero** prerendered pages, so local builds keep working for everyone without DB creds.

**Unit B — "Inseason pipeline" (AD-5).** Runs daily during the playoffs, flips series `active → completed` and writes Game 7 scores as they finish — including the Finals, the single most link-worthy series of the year.

**The incompatibility.** Nothing couples a pipeline state transition to a site rebuild. A series completed after the last deploy has **no static page at all** until an owner happens to request a release — during the exact playoff spike the SEO play targets (addendum §D: pages must be indexed *before* the spike; the Finals completing is the peak). Meanwhile, prerendered pages baked from an earlier build carry stale facts (AD-7 pins "year, round, teams, winner" and the scores table into HTML). And Unit A's silent-skip behavior means a deploy can ship with an empty archive — violating the *spirit* of AD-5's loud-failure principle while obeying its letter (AD-5 binds pipeline scripts only). Two compliant units; the SEO asset is arbitrarily stale or absent, with no alarm.

**Severity: Medium-High** — business-outcome failure (SM-1 depends on the SEO traffic this feeds) rather than crash; also makes the "local build" verification gate environment-dependent in an undeclared way.

**Proposed AD fix.** Extend AD-7: (a) prerender DB failure = **non-zero build exit**, never a silent empty-route skip (explicit: `npm run build` requires build-time DB env — name the variables in the Config conventions row, anon key, read-only); (b) the inseason pipeline workflow triggers a site rebuild+deploy on any `active → completed` transition (or a bounded cadence, e.g. hourly during the window), with the staleness ceiling stated; (c) pin where the prerender script lives (build tooling, not `supabase/scripts/pipeline/`, to respect the dependency rule) and that it reads through the anon key only (AD-8).

---

## Attack 10 — "10 names, verbatim" vs. FR-17/FR-31's new events: registry freeze ambiguity  **[MEDIUM]**

**Unit A — "Build `src/lib/analytics`" (AD-1/NFR-V1).** Implements exactly what AD-1 says: "`EVENTS` constant object with the 10 names from addendum §A.1, **verbatim**", four functions, typed props. A strict reading makes the registry closed: 10 events, no more — "verbatim" admits no additions, and AGENTS.md's "preserve the 10 event names" reinforces the freeze reading.

**Unit B — "FR-17 contact phases + FR-31 share attribution".** The addendum itself names `contact_form_submitted_started`/`_failed` as "FR-17 additions", and FR-31/FR-25 need share events (link generated/copied; arrivals are attributed via `utm_source=share` per AD-6). Unit B follows AD-1's own command that "feature code emits events declaratively through it" and the Naming convention "registry is the only source" — so it opens a PR adding 3–4 new names to `EVENTS`.

**The incompatibility.** Unit A rejects the PR as an AD-1 violation (the registry is the frozen 10 until FR-25 re-points metrics); Unit B cannot ship instrumented features without it, and the escape hatches both diverge: capturing raw strings outside `EVENTS` (breaks "registry is the only source") or importing `posthog-js` directly in the feature (breaks AD-1's core isolation rule). A third agent, facing the same deadlock, quietly picks one escape hatch — recreating the interleaved-vendor-calls state AD-1 exists to prevent. The spine never says whether the 10 names are a *floor to preserve* or a *ceiling*.

**Severity: Medium** — guaranteed collision the moment the first PLANNED feature ships; resolution is cheap if written down now, expensive if each agent improvises.

**Proposed AD fix.** Tighten AD-1: the registry is **extensible; the 10 baseline names are frozen** (no rename/removal/semantic change) until FR-25 metrics are re-pointed — preservation, not prohibition. New events may only be added via `EVENTS` with typed props in the same change as the feature (mirroring AD-2's method-addition rule), and AD-1 should pre-list the known upcoming additions (`contact_form_submitted_started/_failed`, share-link events) so the first two units don't negotiate it at merge time.

---

## Attack 11 — Contact intake has no contract: `handle-contact` migration vs. form rework  **[MEDIUM]**

**Unit A — "Migrate `handle-contact` + Resend" (AD-3, FR-17).** Rewrites to `Deno.serve`/jsr: per AD-3, errors become the `{ "error": string }` envelope and "never stack traces". Unit A reads "never stack traces" conservatively and also genericizes the current user-facing validation strings ("Please enter a valid name between 2 and 80 characters." → "Invalid submission.") to avoid leaking internals, and drops or renames the honeypot/`startedAt` timing fields as part of the rewrite (they're not in any contract).

**Unit B — "Contact form to react-hook-form + zod" (AD-9, FR-17 rides along).** AD-9 mandates the new form stack; AD-2's contract discipline covers *predictions only*, so Unit B writes its own zod schema from the current function's observable behavior: mirrors today's error copy verbatim into toast expectations, keeps sending `startedAt` and `website`, and instruments `contact_form_submitted_failed` with `error.message` as the failure reason.

**The incompatibility.** Nothing in the spine makes the contact request/response a shared contract. Unit A's genericized errors render Unit B's UX copy wrong (users see "Invalid submission." for a fixable name-length problem — an FR-16/17 regression); if Unit A dropped `startedAt` validation, Unit B's client still sends it and the spam posture silently changes; the two validation rule sets (zod client vs. function server) drift from day one with no single source — the *exact* failure mode AD-2 fixed for predictions, left open for the second-most-used write path. AD-3's error envelope defines the shape but not which strings are user-facing.

**Severity: Medium** — no crash, but a LIVE requirement's UX and spam defenses degrade through two individually-compliant changes.

**Proposed AD fix.** Extend AD-2's principle (or AD-3): every Edge Function's request/response is a typed contract in `_shared/contract.ts` — contact intake included (`ContactRequest`, error semantics: "`error` strings are user-safe and may be surfaced verbatim; validation rule constants shared with the zod schema"). Require the FR-17 migration to preserve the existing validation field set (`website`, `startedAt` timing window) or explicitly re-decide it in the story, not implicitly in a rewrite.

---

## Cross-cutting observations (not full attack pairs, flagged for the finalize decision)

1. **No committed Edge Function config or Deno toolchain** (no `supabase/config.toml`, no `deno.json`, verified). Attacks 5 and 8 both exploit this. The Structural Seed lists `_shared/` files but no config; the spine should add both to the seed and to the verification gate.
2. **`predictions` table scale/domain collisions waiting for FR-23:** `probability NUMERIC(5,2) CHECK 0..100` (percent) vs. Attack 3's unresolved contract scale, and `method_id` FK → `prediction_methods.slug` where the seeded slugs are `bayesian`, `ensemble_v1`, `margin_model_v1` (migration 00005, verified) — **not** AD-2's canonical `MethodSlug` (`bayes`, `exponential_smoothing`). The gate says `prediction_methods` has no runtime read path, but AD-2 never says who reconciles the catalog rows; the accounts/persistence unit and the contract unit will each assume the other did. Worth one sentence in AD-2: canonical slugs are the contract's, and the `prediction_methods` seed rows are migrated to match (or the table is explicitly marked legacy until FR-23).
3. **Env var naming for new build-time and workflow contexts** (prerender DB reads, pipeline service_role, share-og site origin): the Config conventions row covers client and secrets but not build-time reads or cross-unit constants; Attacks 6/9 each need one pinned constant (site origin, anon DB URL). A small "shared constants" clause would close both.

## Summary table

| # | Attack | Units | Severity | Fix lands in |
|---|---|---|---|---|
| 1 | Share deep-link 404s on GH Pages | share-og fn vs. prerender/deploy | Critical | AD-6/AD-7 + acceptance |
| 2 | `?p=` payload schema unowned | Share button vs. share-og fn | Critical | AD-2 + AD-6 (`SharePayload` in contract.ts) |
| 3 | Probability scale self-contradiction | contract refactor vs. new renderers | High | AD-2 vs. Conventions row — pick one |
| 4 | Status migration darkens archive | AD-4 migration vs. deployed frontend | High | AD-4 rollout order + consumer list |
| 5 | Crawlers 401 on share-og | fn deploy defaults vs. copy-link flow | High | AD-3/AD-6 public-function posture + config.toml |
| 6 | Two canonical URLs per series | prerender routes vs. deep-link identity | High | New AD: canonical series URL + `seriesUrl()` |
| 7 | `(year, round)` not actually a key | fantrax vs. nba_com/csv adapters | High | AD-5 canonical round enum + UNIQUE migration |
| 8 | Type-only bridge across src/supabase | contract.ts authors vs. build gate | Med-High | AD-2/AD-3 isomorphic-contract rule + deno check |
| 9 | Stale/empty prerender vs. pipeline | predeploy prerender vs. inseason cron | Med-High | AD-7 loud failure + rebuild trigger |
| 10 | Registry freeze vs. new events | analytics layer vs. FR-17/FR-31 | Medium | AD-1 extensibility clause |
| 11 | Contact intake contract-less | handle-contact migration vs. form rework | Medium | AD-2/AD-3 contract-per-function |

**Gate recommendation:** revise and re-review. Attacks 1, 2, and 5 mean FR-31 cannot be built correctly from this spine by independent agents no matter how careful they are; Attacks 4 and 7 are production-data/outage risks that fire on the *first* pipeline run and *first* migration. All eleven fixes are AD-level text changes — none requires reopening an owner decision recorded in the addendum (§D–§G evidence untouched); Attack 3 is the only one that must pick between two already-ratified-sounding clauses, and it needs an explicit owner/architect call.
