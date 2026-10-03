# Changelog

All notable changes to this project will be documented in this file.

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
