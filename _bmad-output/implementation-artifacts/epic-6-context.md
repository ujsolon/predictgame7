# Epic 6 Context: Discoverability & flagship launch

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make every prerendered series page reachable, readable and shareable by a human-friendly URL; give Home a designed, fast layout; and launch the five flagship series with real editorial content. One hard date governs it: **everything live by about Feb 4–18, 2027**, 6–8 weeks before the Traffic Gate window, so social caches and the search index settle on final URLs and pages before playoff traffic. The foundation is in place: the archive is complete and home-court-first, one home-first team order is shown everywhere, and readable URLs shipped in 0.2.13 (deployed 2026-10-10). What remains is in-app entry points, the Home design and build, flagship content, a bundle trim and live verification.

## Stories

Execution order: **6.0 → 6.9 → 6.10 → 6.11 → 6.8 → 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7** (numbers are not run order). **Next: 6.2.**

- Story 6.0: PredictPage refactor (no behaviour change) — done
- Story 6.9: ABA Game 7 venue spike — done
- Story 6.10: Re-key the archive to home-court first — done
- Story 6.11: Add the 1968 ABA Finals to the archive — done
- Story 6.8: One team order on every surface: home team first — done
- Story 6.1: Readable series URLs — done (0.2.13, deployed 2026-10-10)
- Story 6.2: Series-page entry points
- Story 6.3: Home design session
- Story 6.4: Home build
- Story 6.5: Flagship five content load
- Story 6.6: Bundle trim
- Story 6.7: Epic verification in production

## Requirements & Constraints

- **Hard date** (above). URLs are now final; content lands last, onto final pages. A slip is escalated, not absorbed.
- **Home team first, everywhere.** Stored order (`team_a` first) is home-first for every series. Every "X vs Y" goes through one helper; never re-sort a pair. Preview spoiler discipline stands: no Game 7 score, winner or result text on preview surfaces or in page source. Display only: the `predict-game-7` payload never changes.
- **Canonical series URL** is `/series/<year>/<home>-<away>/` (plus `…/result/` for an archived flagship). Every in-app link, Share URL, canonical, `og:url` and sitemap entry uses it. Old uuid paths are redirect stubs only and never go in the sitemap. `/series/` and `/series/<year>/` redirect to Historical (`?year=`).
- **Entry points (6.2):** a "Series page" link for **every** series (not only flagships) from Historical's record overlay and from Predict when a series is selected. This supersedes the older UX rule that the overlay link shows only when editorial content exists. Historical's filter-reset button gets an accessible name and a ≥44×44 target.
- **Flagship five** (owner-authored): 2013 Heat–Spurs, 2016 Warriors–Cavaliers, 2019 Raptors–76ers, 2025 Thunder–Pacers, 2026 Thunder–Spurs. Previews are spoiler-free and results carry at least one video. Non-flagship pages stay unchanged. Editorial images must be openly licensed with a credit line (the build refuses missing credit or alt text) and are resized to WebP.
- **Home performance:** LCP today is ~13.3 s (Slow 4G + 4× CPU, ~4.9 MB of backgrounds), with a third-party font and a favicon requested outside `/predictgame7/`. Home must meet the design session's budget with no layout shift, re-measured under the same profile.
- **Analytics:** event names and payloads stay verbatim. A new event needs an owner decision.
- **Standing bars:** WCAG 2.1 AA and responsive layout on every new or changed surface. No oracle or guarantee framing.
- **Live verification is acceptance** (6.7): cold GETs on a slug URL and on an old uuid link, the OG debugger, JS-off fetches of a flagship preview and result, `probe-deep-links.mjs` and `probe-analytics-walk.mjs` GREEN live, the sitemap and the Search Console count, and Home LCP, each dated.

## Technical Decisions

- **Phase is derived, never stored** (`winner_team_id IS NULL` = pending). Never branch on `series.status`, dates or `league`.
- **Archive state (applied):** `00020` and `00021` are live. Live counts: 179 archived series, 60 teams, and `team_a` = the Game 7 host for all of them. The 1968 ABA Finals is `PTP` (distinct from `MNP`). Archived games 1–6 use the convention "home = `team_a`", so no home-court statistic may use them. Read the outcome from `winner_team_id`, never from slot order.
- **Order helper:** `src/lib/matchup.ts` (`matchupLabel`, `homeFirstPair`). It has no dependencies, so the OG renderer can import it under plain Node. The alphabetical `spoiler-neutral` module is retired.
- **Slug helper:** `src/lib/series-slug.ts` (`seriesPath`) is the one source of series URLs, shared by the router, the prerender, Share and the probe. Slugs come from team `nickname` (falling back to `full_name`) and are lowercase ASCII with runs of non-alphanumerics collapsed to `-`. They are derived at build time, with no stored column or migration. The prerender fails on a duplicate `year/slug` or on a row with no slug. Slug routes resolve from the preload, or else query that year's series. Uuid routes `replace` to the slug URL and keep the query.
- **Content storage stays hybrid:** text and YouTube ids in `series_content` (an owner-side loader sets `updated_at` on every write); images in `public/editorial/`.
- **Prerender/OG:** built in `predeploy` from a live anon read with synchronous SSR. Any 6.6 trim must keep no-JS content intact. JS baseline: 308 KB, ~2.4 s on Slow 4G, ~0.4 s of it from the markdown renderer.
- **Deploys are manual:** the owner runs `npm run deploy` after any `series_content` or `is_featured` change and after every playoff-window pipeline birth or completion. This rule goes into `docs/PLAYOFF_RUNBOOK.md` with 6.5.
- **Doc edit window:** AGENTS.md and the PRD addendum change only between epics. Wording owed there (the archive rule, E14, the URL shapes) is logged in `deferred-work.md`, not edited mid-epic.

## UX & Interaction Patterns

- Any story that fixes visible copy or layout gets an owner preview (mockup or headless screenshot) before its spec freezes. 6.3 → 6.4 is the structural case.
- 6.3 produces desktop and mobile mockups (one, several and no active series; flagship cards; entry points). It records in DESIGN.md / EXPERIENCE.md: the nothing-pending state, the image budget, the self-hosted font, the favicon path, and Home/app-shell title, meta and OG. It also corrects the stale OG-card mockup.

## Cross-Story Dependencies

- **Done foundation:** Predict is a thin composition over `src/pages/predict/` (6.0). The `?custom=` supersession, the preload race and the `?series=` else-branch are pinned in `predict-arrival-characterization.test.tsx`, and the race stays an open defect that no story owns. Stored order is home-first (6.10, 6.11), it is displayed through `matchup.ts` (6.8), and slugs encode it (6.1).
- **6.2** builds its links with `seriesPath` (never a uuid path) on Historical's overlay and on Predict's selected-series view.
- **6.4** needs the approved 6.3 mockup. It also carries `HomePage.tsx`'s stale comment pointer to `asSeries` (now in `predict/types.ts`).
- **6.5** needs 6.1–6.4 deployed. **6.6** re-measures after 6.4, and the owner picks a code-split or a smaller renderer. **6.7** needs 6.1–6.6 deployed.
- **Outside the epic:** a possible double `$pageview` on series-share arrivals must be settled before Story 3.4 reads SM-3. Epic 5's AA pass covers 6.5's flagship pages.
