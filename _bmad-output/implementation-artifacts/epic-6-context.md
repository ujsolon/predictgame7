# Epic 6 Context: Discoverability & flagship launch

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make every one of the 183 prerendered series pages reachable, readable and shareable by a human-friendly URL; give Home a designed, fast layout; and launch the five flagship series with real editorial content. The epic exists because the work left after Epic 4 (readable URLs, in-app entry points, a Home redesign, and the flagship content load) is new scope with one hard date: **everything live by about Feb 4–18, 2027**, 6–8 weeks before the Apr 1, 2027 Traffic Gate window, so social caches and the search index settle on final URLs and final pages before playoff traffic arrives. Epic order: Epic 4 (done) → **Epic 6** → Epic 3 → Epic 5.

## Stories

Execution order: **6.0 → 6.9 → 6.10 → 6.8 → 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7.** Numbers are not run order; 6.0, 6.8, 6.9 and 6.10 were added by the Epic 4 retro and keep their numbers.

- Story 6.0: PredictPage refactor (no behaviour change)
- Story 6.9: ABA Game 7 venue spike
- Story 6.10: Re-key the archive to home-court first
- Story 6.8: One team order on every surface: home team first
- Story 6.1: Readable series URLs
- Story 6.2: Series-page entry points
- Story 6.3: Home design session (from Story 4.9)
- Story 6.4: Home build (from Story 4.9)
- Story 6.5: Flagship five content load (from Story 4.6)
- Story 6.6: Bundle trim
- Story 6.7: Epic verification in production

## Requirements & Constraints

- **Hard date.** Live by about Feb 4–18, 2027. URL changes land first; content lands last, onto final pages. Any slip is escalated, not absorbed.
- **One team order everywhere: home team first.** "Home" means the real Game 7 home team. After the archive re-key, stored order (`team_a` first) *is* home-first, so every "X vs Y" surface (preview, result, full record, OG cards and `og:title`, Historical, Predict labels and share title, Home cards, hotspot captions) displays stored order through one shared helper. The alphabetical spoiler-neutral ordering is retired. The owner accepts that home-first correlates with the outcome; all other preview spoiler discipline stands (no Game 7 score, winner or result text on preview surfaces or in page source).
- **Readable URLs.** Canonical is `/series/<year>/<slug>/`, slug in home-first order, unique per year (exact rules fixed in 6.1's spec). Old `/series/<id>/` and `/result/` pages stay emitted as **canonical stubs**, so no shared or indexed link breaks. `/series/` and `/series/<year>/` are no-JS redirect stubs to `/historical` and `/historical?year=<year>`. `og:url`, canonical, sitemap and Share URLs all use the slug. `og:image:alt` names the matchup, never the winner.
- **Entry points.** Every series (not only flagships) gets a "Series page" link from Historical's record overlay and from Predict's selected series.
- **Spoiler-free previews, no baked predictions.** Preview pages carry facts through Game 6, method deep-links and a Predict CTA only. Result pages carry the outcome, write-up and at least one video.
- **Flagship five** (owner-pinned, owner-authored, real content required): 2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers, 2026 Thunder–Spurs. Non-flagship pages stay bare and unchanged.
- **Editorial images** must be openly licensed with a credit line; the build refuses a missing credit or alt text and resizes to WebP.
- **Home performance.** Today LCP is ~13.3 s on Slow 4G + 4× CPU (~4.9 MB of CSS background images), the font loads from a third-party CDN, and the favicon resolves outside `/predictgame7/`. Home must meet the budget set by the design session, with no layout shift, and be re-measured under the same profile.
- **Predict refactor is behaviour-neutral.** Existing tests pass unchanged apart from imports, wire bodies to `predict-game-7` stay byte-identical, analytics events fire at the same points. Team-order work is display-only; the request payload is unchanged.
- **Analytics.** The registered event names stay verbatim; the hotspot `caption` property value change from 6.8 is recorded for continuity.
- **Standing bars.** WCAG 2.1 AA and mobile/desktop responsiveness on every new or changed surface (≥44×44 targets, accessible names, visible focus). No oracle/accuracy/guarantee framing in copy or meta.
- **Live verification is acceptance.** Cold GETs on slug and uuid URLs, OG debugger, JS-off fetches of a flagship preview and result, `probe-deep-links.mjs` and `probe-analytics-walk.mjs` GREEN live, sitemap spot-check plus Search Console indexed count, Home LCP, each recorded with its date.

## Technical Decisions

- **Phase is derived, never stored.** `winner_team_id IS NULL` = pending, `IS NOT NULL` = archive. Never branch on `series.status`, dates or `league`.
- **Archive re-key (migration `00020`).** Of 160 NBA/BAA series, 42 store the non-home team as `team_a`; the re-key swaps `team_a_id`/`team_b_id` for those (plus ABA rows per the spike), keeping every `series_game_scores` row correct by team id (games 1–6 follow the home-is-`team_a` convention; Game 7 keeps its real venue). `winner_team_id` and phase stay unchanged; the pipeline's "`team_a` = Game 1 home" assertion must still hold. Written and rehearsed by the agent (throwaway Postgres + CI rehearsal), **applied by the owner** with `npx supabase db push` before the deploy that needs it. Insights cache refreshed and its home-court census re-verified; `docs/CURRENT_DATA_MODEL.md` updated in the same commit. Until it is applied, the old rule holds: archived venue data is real only for Game 7 of `league IN ('NBA','BAA')`.
- **ABA venues** come from the 6.9 research spike (no writes): sources with terms and reliability, per-series coverage, and a committed curation file in the `00016` emission style. Unsettled series go to the owner (stated "venue unknown" or a cited manual pick).
- **Content storage stays hybrid (A).** Text and YouTube ids live in `series_content` rows written by an owner-side loader (sets `updated_at` on every write); images live in `public/editorial/`. Contributor authoring is parked; if ever wanted, the migration is files-as-CMS (B).
- **Prerender / OG (AD-6/AD-7).** Pages, cards, route shells and sitemap are built in `predeploy` from a live anon read; synchronous SSR with hydration only, no app fork, no request-time rendering, no Edge Function for meta. 6.1 adds an amendment note to AD-6/AD-7 for the slug URLs. Any trim (6.6) must keep no-JS content intact.
- **Deploys are manual.** The owner runs `npm run deploy` after any `series_content` or `is_featured` change and, in the playoff window, after every pipeline birth or completion; pages, cards and sitemap reflect data only as of the last deploy. The rule goes into `docs/PLAYOFF_RUNBOOK.md`. CI auto-deploy is deferred unless a deploy is missed.
- **Doc edit window.** AGENTS.md and the PRD addendum are edited only between epics, in one batched commit with the diff shown to the owner first (addendum takes pointers only). Mid-epic findings go to `deferred-work.md`. 6.10's AGENTS.md archive-rule rewrite waits for that window.
- **Data boundary.** Client reads only through the single anon client; all writes via Edge Functions, the pipeline, or owner-side scripts.

## UX & Interaction Patterns

- **Preview before freeze.** Any story whose AC fixes visible copy or layout gets an owner preview (mockup or headless screenshot) before its spec freezes; 6.3 → 6.4 is the structural application.
- **Home design session (6.3)** produces a desktop + mobile mockup with simulated active series (one, several, none), the flagship featured cards and the entry points, and records in DESIGN.md / EXPERIENCE.md: what Home shows when nothing is pending, the image budget, the self-hosted font, the favicon path, and Home/app-shell `<title>`/meta/OG. It also corrects the stale OG-card mockup ("3 variants"). Home's pending card should show the editorial headline where one exists.
- Historical's filter-reset button gets an accessible name and a ≥44×44 target; Historical reads `?year=`.

## Cross-Story Dependencies

- **6.0 first:** 6.8, 6.1 and 6.2 all edit Predict. Pin the deferred preload-race and `?custom=` supersession tests before splitting.
- **6.9 → 6.10 → 6.8 → 6.1:** the spike feeds the re-key; the re-key makes stored order home-first, which 6.8 displays; 6.1's slugs encode that order.
- **6.1's first task:** pin the missing tests (analytics init and barrel purity, `?custom=` supersession, Predict preload race, the `?series=` else-branch). It also carries Epic 4 carry-ins: the league in the OG card's center slot for non-NBA rows, the probe's sitemap expectation from `is_featured` rather than a pinned list, and `probe-analytics-walk.mjs` in the `node --check` smoke list.
- **6.2** needs 6.1's URLs. **6.4** needs the approved 6.3 mockup. **6.5** needs 6.1–6.4 deployed. **6.6** re-measures after 6.4 (baseline: JS 308 KB, ~2.4 s on Slow 4G, ~0.4 s from the markdown renderer); the owner chooses code-split or a smaller renderer. **6.7** needs 6.1–6.6 deployed.
- **Outside the epic:** a possible double `$pageview` on series-share arrivals must be settled before Story 3.4 reads SM-3. Epic 5's AA pass covers the flagship pages from 6.5.
