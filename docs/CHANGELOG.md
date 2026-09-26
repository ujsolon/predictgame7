# Changelog

All notable changes to this project will be documented in this file.

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
