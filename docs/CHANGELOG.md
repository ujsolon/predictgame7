# Changelog

All notable changes to this project will be documented in this file.

## [0.2.10] - 2026-10-08

### Added

- Share. One Share button: in Predict's detailed result (labelled) and in every series page's header (icon, "Share this series"). It opens the phone's share sheet, or copies the link and shows "Link copied.". A series prediction shares `/series/<id>/?method=<slug>`; a custom matchup shares `/predict/?custom=<link>`, which rebuilds the matchup and method on open and runs nothing until Generate; a series page shares its own address. Every share link carries `utm_source=share` (Story 4.4).
- `prediction_shared` analytics event: one per share that reaches the share sheet or the clipboard, never on a cancel or a failed copy. It is the second deliberate addition to the event registry; the ten original names are unchanged (Story 4.4, owner decision).
- Series editorial content (FR-13 pilot): migration `00019` adds `series.is_featured` (set for the five pilot series) and a `series_content` table with an optional "before" and "resolution" part per series: headline, markdown write-up and YouTube videos. Reads are public; writes are owner-only. The preview shows the "before" part, the result page the "resolution" part. Videos load from YouTube only when tapped. A preview's page source never carries the resolution. No content is loaded yet (Story 4.6), so every page looks as before (Story 4.5).
- Home shows each pending Game 7 as a card linking to its series page and to Predict, and "No active series right now — the next Game 7 is coming." when there is none (Story 4.5).

### Changed

- The `/series/<id>?method=` share arrival carries `utm_source` and every other query parameter through to Predict, so share arrivals are attributable (Story 4.4).
- Flagship series come from `series.is_featured` instead of a hard-coded list (Story 4.5).
- When a series' stored scores fail validation, the toasts use the same wording as the custom form, for example "Game 2: Score is required" (Story 4.4).
- The deploy's prerender also fails on invalid editorial content, a missing `public/editorial/` image, or no featured series (Story 4.5).

## [0.2.9] - 2026-10-08

### Added

- Every series has its own page. A non-flagship archived series shows its full record: the winner, all seven games and the Game 7 box. Each of the five flagship series, and any pending series, opens on a spoiler-free preview: games 1–6, links to the four prediction methods and the Predict CTA. A flagship's "See how the series ended →" link leads to its result page, which takes focus. Titles are distinct per page, and preview titles never name the winner. The teams on a preview are ordered alphabetically by nickname, because the stored order names the winner first in 177 of 178 series (Story 4.3, owner decision).
- Every series has a 1200×630 share card, rendered at deploy time to `og/<id>.png`, plus a generic `og/fallback.png`. A card shows the teams, logos and year · round · Game 7, never the score or the winner. The deploy fails on any card it cannot render, including an unreadable logo (Story 4.2).
- Series pages are prerendered as static HTML at deploy time: 183 pages from the 178 series (one per series, plus a result page per flagship). Each carries its OG/Twitter tags and a canonical link, so links unfurl and crawlers read the content without JavaScript. The browser takes over the page without fetching it again. A preview's embedded data has Game 7 and the winner removed, and a pending series' preview checks the live data in the background (Story 4.8).
- `/predict`, `/historical`, `/insights` and `/maths` are served from static shells with generic meta and the fallback card, so they answer HTTP 200 instead of going through the 404 fallback. The deploy also writes `sitemap.xml` (188 URLs) and `robots.txt` (Story 4.8).

### Changed

- `npm run deploy` now runs the gate, the card render and the prerender, in that order. The card render and the prerender both need `.env`. The prerender fails the deploy, and removes its own output, on an empty read, a series it cannot show, a missing flagship or a missing card (Stories 4.2, 4.8).
- A bare `/series/<id>` link opens the series page instead of redirecting to Predict. `?method=<slug>` still opens Predict with the series and method selected (Story 4.3).
- Directory URLs (`/predict/`, `/series/<id>/`) keep the matching nav item highlighted (Story 4.8).

## [0.2.8] - 2026-10-07

### Added

- Deep links survive a cold load. The build emits `404.html` as a byte copy of `index.html`, so GitHub Pages serves the app on every path: `/predict`, `/historical`, `/insights` and `/maths` open directly instead of GitHub's 404 page. Through the fallback these answers carry HTTP status 404, which is recorded for Story 4.3's prerender. `npm run build` fails if the copy is missing or differs (Story 4.1).
- `/series/<id>` links. `?method=<slug>` opens Predict with that series and method already selected, and nothing runs until Generate. A bare id opens Predict with the series selected, until the series pages arrive. An unknown or malformed id shows "This series doesn't exist." with a link to Historical (Story 4.1).
- `scripts/probe-deep-links.mjs` checks every route, the share arrival and the 404 in headless Chrome against a preview or the live site (Story 4.1).

### Changed

- An unknown `?series=` on Predict shows the not-found notice inside the series card (announced to screen readers) instead of a toast. A malformed id is never queried (Story 4.1).
- Analytics run through one module, `src/lib/analytics/`. The 10 event names and their properties are unchanged, and a lint rule rejects PostHog imports anywhere else (Story 4.0).
- The Historical page's reset button is now counted as `historical_filter_applied` with `filter_type: 'reset'` (Story 4.0).

## [0.2.7] - 2026-10-07

### Added

- Home lists every pending Game 7 as a link that opens its Predict page with the series already loaded (`/predict?series=<id>`). A failed read is logged, not shown as an empty list (Story 2.7).
- ESPN is the scheduled pipeline source. The daily run completes a pending series from its Game 7, matching teams on `teams.espn_code` (migration `00018`, applied 2026-10-04). Completions come from the run's own date, the previous US Eastern day (Story 2.13).
- The scheduled run now births a series by itself when it reaches 3–3. It detects a Final Game 6 tied 3–3, finds games 1–5 by walking back single dates (at most 21 dates, 25 extra requests and about 3 minutes per run), checks every game's own series standing against the scores, and births the series through the existing RPC. It also re-reads the previous date, for births only. When it cannot certify a 3–3, it prints `BIRTH NEEDED:`, opens a dated "Pipeline birth needed <date>" issue, and leaves the exit code alone (Story 2.18, FR-21). Operator tooling only: nothing fires before the April 2027 bracket unless dispatched by hand.
- `docs/PLAYOFF_RUNBOOK.md`, the 2027 playoff procedure. Since Story 2.18 it is the fallback for a birth the run could not certify, and for a Game 7 missed by a red or cancelled morning (Stories 2.15, 2.18).

### Changed

- The custom-matchup form prints the code of the team its logo shows. A typed name resolves through the same alias table as the logo, so Jazz → UTA, Sixers → PHI and Celtics → BOS (it printed JAZ/SIX/CEL). The archive is unchanged (Story 2.11, owner decision U16, plus the review pass 2 patches).
- Pipeline runner: every argv token that is not an exact supported flag is refused. A write failure after a winner has landed still refreshes the insights cache, or prints the recovery command (Story 2.14).
- The committed operator CSV can now hold playoff rows. The gate validates them against the real teams seed instead of requiring the file to be empty, so a curated 3–3 no longer blocks every push (Story 2.17).

### Removed

- The `nba_com` pipeline source: its adapter, probes and tests, and the `--season=` flag. The name now fails at startup as an unrecognised adapter (Story 2.16).

## [0.2.6] - 2026-10-04

### Added

- `/historical`'s team field matches a team **code** as well as a name, against the row's stored `teams.abbreviation` — typing `SLB`, `WSB` or `NY` now finds the series the database labels that way (Story 2.11, owner decisions U1/U15).
- The pipeline runs itself: `pipeline-inseason.yml` (daily across the mid-April–June bracket) and `pipeline-offseason.yml` (the two bracket edges), each reporting through the new `notify-failure` composite action, so a dead run sends a signal instead of quietly leaving the data stale (Story 2.6, FR-20/21, SM-4). The bracket is the season window, so nothing fires before April 2027 unless dispatched by hand.
- `run.ts --require-feed`, the empty-feed alarm: inside the bracket, a fetch that succeeds and returns nothing is a red run. The two offseason edges deliberately omit the flag — an empty feed in mid-April or late June is legitimate, and making those red would train the owner to ignore the alarm that matters (Story 2.6, owner decisions D-3/D-5).
- `migration-rehearsal.yml` runs `scripts/rehearse-migration-00014.mjs` on any push that edits a migration — the first CI job ever to run it, so the "migrations replay cleanly and every guard can fail" verdict now renews itself instead of being believed from a single manual pass (Story 2.6, CAP-5, D-2).

### Changed

- One team code everywhere. Every surface that holds the `teams` row prints that row's `teams.abbreviation`, resolved as *matching row → placeholder literal → name derivation*: the archive's 39 divergent rows (20 franchises, spanning 1948→1997, all `00007` historical identities) and Predict's database-backed renders print the stored code instead of the helper's modern guess, and the custom-matchup card and result sheet print the codes the picker's own trigger label used (Story 2.11, U6/U15).
- The search field's placeholder reads "Search by team name or code..." (owner decision U14).
- Operator tooling, nothing published: `scripts/probe-game7-venues.mjs` and `supabase/scripts/pipeline/venueBackfill.ts` resolve a feed alias by **slot** rather than by name alone, so a franchise appearing on both sides of a series cannot borrow the wrong venue; the two `00016` guard messages now fence their own advice for the one case that cannot be appended — a series with no Game 7 played (Story 2.12, P3-1). `00016`'s data block is untouched and the migration is already applied, so nothing reached the database.
- Dev-only: `js-yaml` and `@types/js-yaml`, for the workflow YAML contract test in `tests/pipeline/workflows.test.ts`.

### Removed

- `TEAM_ABBREVIATIONS` from `src/lib/nba-utils.ts` — the hardcoded name→code map that was the second source of truth. Removing it changes nothing for any modern team whose row is in hand; it is what makes the divergent rows print correctly (Story 2.11).

## [0.2.5] - 2026-10-03

### Added

- `series.league` (`NBA` / `BAA` / `ABA`) and the real Game-7 venue for the 160 NBA/BAA archived series, carried by migration `00016` from a hand-curated, owner-reviewed CSV — the archive's Game-7 `home_team_id` is now a venue, not the series winner restated (Story 2.8). Applied to production 2026-10-02.
- A league marker on the archive rows that need one, with the two-league explanation inside the record: `/historical` filters by year and team, and opens on all 178 series (Stories 2.9, 2.10, FR-10).
- The insights cache writer: migration `00017` recomputes all three cached patterns from the league-filtered archived Game-7 population and replaces all three rows in one statement, so either all of them land or none does. It runs on a pipeline run that filled a winner, and through the new operator flag `node supabase/scripts/pipeline/run.ts --refresh-insights` (Story 2.5, owner decision U10).
- A sample-set line at the foot of `/insights` naming the population its cards count, read from the same cached field the denominators come from (owner decision U4).
- Server-side type-checking and request validation for `predict-game-7`, and a `seriesDatasource` pipeline with the `manual_csv` floor, the `nba_com` adapter, and idempotent birth/completion RPCs (Stories 2.0, 2.3, 2.4).
- A derived series phase on the read path — `winner_team_id IS NULL` means Game 7 pending — with the stored `status` column dropped and identity keyed on the team pair (Story 2.2, AD-4, AD-5).

### Changed

- `/insights` describes what the archive actually shows. The Game 6 card's sentence claimed recent performance is "a strong predictor" while its own refreshed number read 37.5%; it now states the count instead of the claim. Owner decision, recorded as Story 5.1's first slice (FR-18).

### Fixed

- The published page no longer presents `00001`'s 8-series seed — "Based on **8** historical Game 7s", 62.5% — against an archive of 178 series and 1,246 score rows. `00017` was applied and the refresh run on 2026-10-03 reported 160 Game 7s, 117 home wins, 60 Game 6 winners, average margin 10.88; this release publishes the client half, and deferred-work F7 closes on the read-back that follows it.

## [0.2.4] - 2026-09-30

### Added

- Shared prediction contract `supabase/functions/_shared/contract.ts` as the single definition of a prediction request and result, with `src/types/prediction.ts` re-exporting its types and the stale client-side unions deleted (Story 1.2, AD-2).
- Non-destructive error states on `/predict` via `src/lib/error-envelope.ts` and `src/components/common/ErrorRetryPanel.tsx`: Retry re-fires the identical attempt, a `?series=` preload failure gets the same panel treatment instead of a bare toast, and a `200` carrying a null probability no longer renders `undefined%` (Story 1.3).
- Inline submit-time validation for the custom matchup grid, so an impossible score combination is reported on the form instead of reaching the service (`src/lib/custom-matchup.ts`).
- Predict's three primary surfaces — series picker, method picker, Generate — are real buttons: in the tab ring, activated by Enter and Space, with focus returned to the trigger (Story 1.5, NFR-A1).
- A single source for method labels and anchors (`src/lib/method-display.ts`).
- A `pre-push` hook that runs the full gate on any push to `master`.
- A test suite that grew from 8 tests in 2 files to 123 across 11 files, including a shared Predict rendering harness (Story 1.4, FR-30).

### Changed

- The result card is inert once a result is on screen; re-running a prediction is Generate's job.
- `handle-contact` source now requires the `startedAt` timing field, raises its ceiling from 2 hours to 24, rejects an empty `message` with `400` instead of writing it, and no longer logs submission PII. Edge Function deploys are a separate mechanism, so this entry covers the source on `master` and not the version currently serving.
- `npm run gate` is the single definition of the lint, typecheck, test, and build gate; the dead `tsconfig.check.json` was dropped.

### Fixed

- A prediction response landing after the fan switched method, changed the selection, or submitted again could paint its probabilities under the newer attempt's label. In-flight attempts are now superseded through a sequence counter, so only the newest one writes a result, owns the spinner, and reports success.

### Removed

- `src/pages/CurrentGame7sPage.tsx`, an unrouted remnant of the two-table merge (FR-2).

## [0.2.3] - 2026-09-26

### Changed

- Moved the build off the deprecated `rolldown-vite` alias onto supported `vite@^8.3.1`, with `@vitejs/plugin-react` 5.2 and `vite-plugin-svgr` 4.5. No user-visible behavior change.
- Deleted the unused Miaoda dev-config wrapper (`vite.config.dev.ts`), which imported a plugin that was no longer installed.

### Added

- Vitest test suite with a Node environment by default and per-file jsdom opt-in, plus logic and render smoke tests for `nba-utils`.
- GitHub Actions CI gate running lint, test, and build on every push to `master` and on pull requests.
- The test suite now runs as part of `predeploy`, so a red suite blocks a release.

### Fixed

- `.env.local` and other `*.local` env files are now gitignored, matching where local secrets are documented to live.

> First publish to GitHub Pages since the 2026-05-31 build, so the `0.2.1` and `0.2.2` fixes (RLS lockdown, contact-form server-side validation and honeypot) reach the live site with this release.

## [0.2.2] - 2026-07-15

### Fixed

- Hardened the `Get in Touch` flow by removing direct public insert access to `contact_submissions`.
- Added stronger server-side validation for contact form submissions, including trimmed inputs, email checks, and message length limits.
- Replaced the client-trusted visible math captcha pattern with quieter anti-spam checks using a honeypot field and submission timing validation.
- Improved contact form error handling so frontend users receive clearer submission feedback.

## [0.2.1] - 2026-07-15

### Fixed

- Enabled row level security on the public normalized release tables flagged by the Supabase linter.
- Added explicit public read policies for `teams`, `series`, `series_game_scores`, and active `prediction_methods` so the app keeps working while closing the exposed-table security warning.
- Kept `predictions` private by default under RLS.

## [0.1.0] - 2026-05-30

### Added

- Introduced the normalized Release 1 Supabase data model with `teams`, `series`, `series_game_scores`, `prediction_methods`, and related schema updates.
- Added migration backfills to rebuild normalized series score rows and restore missing historical series records.
- Added support for historical franchise coverage required by the migrated archive, including missing legacy team records and related assets.

### Changed

- Moved the app's series-driven pages to the normalized `series` and `series_game_scores` tables.
- Updated the predict page to load nested team data, render normalized scores, and resolve series selection more reliably.
- Updated the historical and current series views to read from normalized team and score relationships instead of legacy flat fields.
- Updated shared frontend types to match the normalized schema.

### Fixed

- Fixed Predict page `406` errors caused by the previous series lookup request shape.
- Fixed runtime failures caused by treating nested team objects as strings when rendering abbreviations and logos.
- Fixed incomplete historical migration coverage so all `177` legacy `game_sevens` records are now represented in the normalized `series` table.
- Rebuilt `series_game_scores` so normalized score data is available for all migrated historical series.
