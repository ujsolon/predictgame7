# Changelog

All notable changes to this project will be documented in this file.

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
