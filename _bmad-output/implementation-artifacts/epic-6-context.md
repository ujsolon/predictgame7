# Epic 6 Context: Discoverability & flagship launch

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make every prerendered series page reachable, readable and shareable by a human-friendly URL; give Home a designed, fast layout; and launch the five flagship series with real editorial content. One hard date governs it: **everything live by about Feb 4–18, 2027**, 6–8 weeks before the Traffic Gate window, so social caches and the search index settle on final URLs and pages before playoff traffic. Before the URL work, the archive is made complete and home-court-first so that one team order (home team first) can be shown everywhere and encoded in slugs.

## Stories

Execution order: **6.0 → 6.9 → 6.10 → 6.11 → 6.8 → 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7** (numbers are not run order). 6.0 and 6.9 are done.

- Story 6.0: PredictPage refactor (no behaviour change) — done
- Story 6.9: ABA Game 7 venue spike — done
- Story 6.10: Re-key the archive to home-court first
- Story 6.11: Add the 1968 ABA Finals to the archive
- Story 6.8: One team order on every surface: home team first
- Story 6.1: Readable series URLs
- Story 6.2: Series-page entry points
- Story 6.3: Home design session
- Story 6.4: Home build
- Story 6.5: Flagship five content load
- Story 6.6: Bundle trim
- Story 6.7: Epic verification in production

## Requirements & Constraints

- **Hard date** (above). URL changes land first; content lands last, onto final pages. A slip is escalated, not absorbed.
- **Home team first, everywhere.** "Home" = the real Game 7 home team. Once the archive is re-keyed, stored order (`team_a` first) *is* home-first, so every "X vs Y" surface uses stored order through one shared helper; the alphabetical spoiler-neutral ordering is retired. The owner accepts that home-first correlates with the outcome; all other preview spoiler discipline stands (no Game 7 score, winner or result text on preview surfaces or in page source). Display only: the `predict-game-7` payload is unchanged.
- **Readable URLs.** Canonical `/series/<year>/<slug>/`, slug in home-first order, unique per year. Old `/series/<id>/` and `/result/` pages stay emitted as canonical stubs so no shared or indexed link breaks. `/series/` and `/series/<year>/` are no-JS redirect stubs to `/historical` (`?year=`). `og:url`, canonical, sitemap and Share URLs use the slug; `og:image:alt` names the matchup, never the winner.
- **Entry points:** a "Series page" link for every series from Historical's record overlay and Predict's selected series.
- **Flagship five** (owner-authored): 2013 Heat–Spurs, 2016 Cavs–Warriors, 2019 Raptors–76ers, 2025 Thunder–Pacers, 2026 Thunder–Spurs. Previews spoiler-free; results carry at least one video. Non-flagship pages stay unchanged. Editorial images must be openly licensed with a credit line (build refuses missing credit or alt) and are resized to WebP.
- **Home performance:** LCP today ~13.3 s (Slow 4G + 4× CPU, ~4.9 MB backgrounds), third-party font, favicon outside `/predictgame7/`. Must meet the design session's budget, no layout shift, re-measured under the same profile.
- **Analytics:** event names stay verbatim; 6.8's hotspot `caption` value change is recorded for continuity.
- **Standing bars:** WCAG 2.1 AA and responsive on every new or changed surface; no oracle/guarantee framing.
- **Live verification is acceptance** (6.7): cold GETs on slug and uuid URLs, OG debugger, JS-off flagship preview/result, `probe-deep-links.mjs` and `probe-analytics-walk.mjs` GREEN live, sitemap and Search Console count, Home LCP, each dated.

## Technical Decisions

- **Phase is derived, never stored** (`winner_team_id IS NULL` = pending). Never branch on `series.status`, dates or `league`.
- **Archive re-key (`00020`).** Swap `team_a_id`/`team_b_id` for the 42 NBA/BAA series (41 NBA + 1 BAA, measured live) plus the 6 ABA series from 6.9, keeping every `series_game_scores` row correct by team id (games 1–6: home is `team_a`; Game 7 keeps its real venue). `winner_team_id` and phase unchanged; the pipeline's "`team_a` = Game 1 home" assertion must hold. Insights cache refreshed and home-court census re-verified; `docs/CURRENT_DATA_MODEL.md` updated in the same commit.
- **1968 ABA Finals (`00021`).** New `teams` row for Pittsburgh Pipers (`PTP`, distinct from `MNP`) with an owner-supplied logo; one `series` row (`team_a` = PTP, winner PTP, `is_featured` false) plus seven game rows with real venues. Coverage check of the 1968 playoffs comes first; other gaps go to the owner. Every count pinning 178 / 18 ABA (data-model census, tests, probes) is updated; the applied `00016` and its input file are never edited.
- **Migrations** are written and rehearsed by the agent (throwaway Postgres + CI rehearsal) and **applied by the owner** (`00020` and `00021` in one `npx supabase db push`). Until applied, the old rule holds: archived venues are real only for Game 7 of `league IN ('NBA','BAA')`.
- **Content storage stays hybrid:** text and YouTube ids in `series_content` (owner-side loader sets `updated_at` on every write); images in `public/editorial/`.
- **Prerender/OG:** built in `predeploy` from a live anon read; synchronous SSR, no request-time rendering. 6.1 adds an amendment note to AD-6/AD-7; any 6.6 trim keeps no-JS content intact.
- **Deploys are manual:** owner runs `npm run deploy` after any `series_content`/`is_featured` change and every playoff-window pipeline birth or completion (rule goes into `docs/PLAYOFF_RUNBOOK.md`).
- **Doc edit window:** AGENTS.md and the PRD addendum change only between epics; the archive-rule rewrite (from 6.10 and 6.11) is logged to `deferred-work.md`, not edited mid-epic.

## UX & Interaction Patterns

- Any story fixing visible copy or layout gets an owner preview before its spec freezes; 6.3 → 6.4 is the structural case.
- 6.3 produces desktop + mobile mockups (one, several, no active series; flagship cards; entry points) and records in DESIGN.md / EXPERIENCE.md: the nothing-pending state, image budget, self-hosted font, favicon path, Home/app-shell title/meta/OG. It also corrects the stale OG-card mockup.
- Historical's filter-reset button gets an accessible name and a ≥44×44 target.

## Cross-Story Dependencies

- **6.0 (done):** Predict is now a ~88-line composition over hooks and components in `src/pages/predict/`; 6.8, 6.1 and 6.2 edit there. The `?custom=` supersession, preload race and `?series=` else-branch are pinned in `predict-arrival-characterization.test.tsx` (the race stays an open defect no story owns). `HomePage.tsx`'s stale pointer to `asSeries` (now `predict/types.ts`) rides with 6.4.
- **6.9 (done) → 6.10:** `supabase/scripts/pipeline/data/aba_game7_venues.csv` settles all 18 ABA series from two sources; **6 need a swap** (1971 UTS/IND, 1972 IND/UTS, 1972 NYN/VAS, 1973 IND/KEN, 1973 KEN/CAC, 1975 IND/DEN). Note rule for 6.10's consumer: a non-blank `note` starting with `info:` is a settled row's remark, not an unsettled reason. Pinned by `tests/pipeline/aba-game7-venues.test.ts`.
- **6.10 → 6.11 → 6.8 → 6.1:** the re-key and the 1968 row make stored order home-first; 6.8 displays it; 6.1's slugs encode it.
- **6.1's first task:** pin the remaining missing tests (analytics init and barrel purity). Carry-ins: league in the OG card's center slot for non-NBA rows, the probe's sitemap expectation from `is_featured`, `probe-analytics-walk.mjs` in the `node --check` smoke list.
- **6.2** needs 6.1. **6.4** needs the approved 6.3 mockup. **6.5** needs 6.1–6.4 deployed. **6.6** re-measures after 6.4 (baseline JS 308 KB, ~2.4 s Slow 4G); owner picks code-split or smaller renderer. **6.7** needs 6.1–6.6 deployed.
- **Outside the epic:** a possible double `$pageview` on series-share arrivals must be settled before Story 3.4 reads SM-3; Epic 5's AA pass covers 6.5's flagship pages.
