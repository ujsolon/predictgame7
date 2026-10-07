# Analytics continuity: the after leg for Story 4.0 (2026-10-07)

This is the **after** leg of Story 4.0's measurement-continuity AC. It pairs with [analytics-continuity-before-4-0.md](analytics-continuity-before-4-0.md). Story 4.7 cites both files for its comparison AC.

## What was observed

- **Who / where:** the owner, in PostHog's live activity listing (same project as the before leg).
- **When:** 2026-10-07, minutes before the listing was copied.
- **Site:** https://ujsolon.github.io/predictgame7/ at release **0.2.8**, deployed from `bac0e3f`.
  - `gh-pages`: `d6e321a`
  - bundle: `index-DVoJqY8d.js`
  - It carries the Story 4.0 port and the Story 4.1 `404.html` fallback.
- **Person:** all events share one person, `01a11580-feb0-7eb8-8705-e46b3409406c`.
- **The walk:**
  1. Cold load of `/predict`, then Home.
  2. Click a banner hotspot.
  3. On Predict (series pre-selected by `?series=`), choose Logistic Regression, Generate, open the detailed analysis, then New Prediction.
  4. Go to Historical, apply the filters, and expand a row, then close it.

## Event sequence, oldest first, as the owner's listing recorded it

| # | Event | URL path | Kind |
|---|---|---|---|
| 1 | Pageview | `/predict` | SDK `$pageview` (**cold load through `404.html`**) |
| 2 | clicked link "Home" | `/predict` | autocapture |
| 3 | Pageview | `/` | SDK `$pageview` (history change) |
| 4 | Web vitals | `/` | SDK |
| 5 | clicked span | `/` | autocapture |
| 6 | **banner_hotspot_clicked** | `/` | §A.1 |
| 7 | Pageview | `/predict?series=29638c4e-…` | SDK `$pageview` (history change) |
| 8 | Web vitals | `/predict?series=…` | SDK |
| 9 | clicked span "Not selected" | `/predict?series=…` | autocapture |
| 10 | clicked span "Logistic Regression" | `/predict?series=…` | autocapture |
| 11 | **prediction_method_selected** | `/predict?series=…` | §A.1 |
| 12 | clicked svg | `/predict?series=…` | autocapture |
| 13 | **prediction_generated** | `/predict?series=…` | §A.1 |
| 14 | clicked button "View Detailed Analysis" | `/predict?series=…` | autocapture |
| 15 | **detailed_analysis_viewed** | `/predict?series=…` | §A.1 |
| 16 | clicked button "New Prediction" | `/predict?series=…` | autocapture |
| 17 | **prediction_reset** | `/predict?series=…` | §A.1 |
| 18 | clicked span "Historical" | `/predict?series=…` | autocapture |
| 19 | Pageview | `/historical` | SDK `$pageview` (history change) |
| 20 | **historical_filter_applied** | `/historical` | §A.1 |
| 21 | clicked input | `/historical` | autocapture |
| 22–26 | **historical_filter_applied** ×5 | `/historical` | §A.1 |
| 27 | **historical_series_expanded** | `/historical` | §A.1 |
| 28 | clicked button "× Close" | `/historical` | autocapture |

## Comparison with the before leg

**Event names: unchanged.** The same 7 of the 10 §A.1 events fire, at the same trigger points and in the same order as the before leg:
- `banner_hotspot_clicked`
- `prediction_method_selected`
- `prediction_generated`
- `detailed_analysis_viewed`
- `prediction_reset`
- `historical_filter_applied`
- `historical_series_expanded`

The same 3 are absent for the same reasons. `series_selected` fires only from the picker dialog, and the hotspot's `?series=` preload bypasses it. The custom matchup and the contact form were not walked.

**SDK behaviour: unchanged.**
- The landing `$pageview` fires.
- A `$pageview` fires on each pathname change.
- A query-only change produces no `$pageview`.
- Autocapture and Web vitals appear as before.

**Six `historical_filter_applied` rows.** One is the year pick (row 20), and five are team-search keystrokes, which fire on every non-empty keystroke. Existing behaviour, unchanged by 4.0. The before leg had four rows for a shorter search.

**New since the before leg: row 1.** A cold load of `/predict` delivered a `$pageview`. Before 0.2.8, that URL answered with GitHub's own 404 page and never booted the app. This is Story 4.1's `404.html` fallback working in production.

## What this record does not settle

- **Not confirmed live: D1's reset emission.** The archive reset button was not pressed in this walk: no click on it appears between rows 19 and 28. So `historical_filter_applied {filter_type:'reset'}`, the one deliberate addition, is confirmed only by the headless reset probe on the 4.0 build and by `historical-page-archive.test.tsx`. Story 4.7 should press reset once in live view.
- **Event properties.** As with the before leg, the copied listing has names, persons, URLs and times only. Property continuity rests on the headless before/after walk (identical decoded properties, `spec-4-0-…` Implementation Notes) and on the page tests' exact call-log pins. Story 4.7 can open one event of each kind in PostHog's event detail if it wants a live property comparison.
