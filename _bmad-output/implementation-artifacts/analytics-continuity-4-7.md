# Analytics continuity: the Story 4.7 walk (2026-10-08)

Story 4.7's live check of the analytics events on the deployed site. It compares against Story 4.0's two records: [analytics-continuity-before-4-0.md](analytics-continuity-before-4-0.md) (before the analytics port) and [analytics-continuity-after-4-0.md](analytics-continuity-after-4-0.md) (after it, on 0.2.8).

## What was observed

- **Who / where:** the owner, in PostHog's live activity listing (the same project as both 4.0 legs).
- **When:** 2026-10-08, in two walks minutes apart, each copied from the listing.
- **Site:** https://ujsolon.github.io/predictgame7/ at release **0.2.11**.
  - It has been live since the release commit `2a6c36f`, with the owner's commit `bd15433` on top (the Search Console verification file in `public/`).
  - `gh-pages`: `90f42ed`
  - bundle: `index-DCF4RgKj.js`
  - It carries Story 4.4's Share and `prediction_shared`, Story 4.5's content model, and the withdrawn Home empty state.
- **Persons:**
  - walk 1: `01a11bba-f281-7a1c-97d4-db3bd45db771`
  - walk 2: `01a11bbd-a22f-75ae-8ec5-b051054b7566`

## Walk 1, oldest first

1. Home loads, and a banner hotspot is clicked (`banner_hotspot_clicked`).
2. Predict opens at `/predict?series=626257bc-…` (the 2025 Finals flagship, preloaded by the hotspot): `$pageview`, then Web vitals.
3. A method is chosen (`prediction_method_selected`), then Generate (`prediction_generated`).
4. "View Detailed Analysis" is clicked (`detailed_analysis_viewed`), then "Share" (**`prediction_shared`**), then New Prediction (`prediction_reset`).
5. The owner goes to Historical: a filter input fires `historical_filter_applied` ×2.

## Walk 2, oldest first

1. Home → Historical: `$pageview`. Four `historical_filter_applied` for the year pick and the team-search keystrokes.
2. A series is expanded (`historical_series_expanded`) and closed with "× Close".
3. **The archive reset:** a bare "clicked button" (autocapture), then `historical_filter_applied`. On Historical the only button that fires `historical_filter_applied` is the icon-only reset (`HistoricalPage.tsx:204`, `resetFilters` → `track(HISTORICAL_FILTER_APPLIED, { filter_type: 'reset' })` at `:143`). It has no text, which is why autocapture records it without a label. The event's property was not copied, so `filter_type: 'reset'` is **identified from the code path, not read from the payload**.
4. A second series is expanded and closed (`historical_series_expanded`).
5. Predict via the nav. The owner picks a series from the dialog: "2020s" → "2025" → "OKCvsDEN" (**`series_selected`**). Then `prediction_method_selected`, `prediction_generated`, `detailed_analysis_viewed`, and "Share" (**`prediction_shared`**).
6. **The share arrival (SM-3):** the shared link opens and lands with **`utm_source=share`** in the URL.
   - Two `$pageview` rows read `/predict?series=de1c3bdd-a8ba-4f89-ad5b-4da04dac2258&method=logistic_regression&utm_source=share`. That is the `/series/<id>/?method=…&utm_source=share` link after `SeriesRoute`'s redirect, which carries `utm_source` through (Story 4.4).
   - The arrival restores the same series (OKC vs DEN, 2025) and method (Logistic Regression) that were shared.
   - A `Pageleave` precedes it, because the full page navigation unloaded the previous page (SDK behaviour).
7. Back to Home and a banner hotspot (`banner_hotspot_clicked`). Then Predict for the 2025 Finals flagship, a method, the detailed view and Share again (the "clicked button 'Share'" row).

## Comparison with Story 4.0's records

| §A.1 event | before 4.0 | after 4.0 (0.2.8) | **4.7 (0.2.11)** |
|---|---|---|---|
| `banner_hotspot_clicked` | ✓ | ✓ | ✓ |
| `series_selected` | — | — | **✓ (first live sighting)** |
| `custom_series_selected` | — | — | — (not walked) |
| `prediction_method_selected` | ✓ | ✓ | ✓ |
| `prediction_generated` | ✓ | ✓ | ✓ |
| `detailed_analysis_viewed` | ✓ | ✓ | ✓ |
| `prediction_reset` | ✓ | ✓ | ✓ |
| `historical_filter_applied` | ✓ | ✓ | ✓ (keystrokes + reset) |
| `historical_series_expanded` | ✓ | ✓ | ✓ |
| `contact_form_submitted` | — | — | — (skipped by design: a submit sends real mail and writes a `contact_submissions` row) |

- **Names, trigger points and order are unchanged** for every event seen in more than one record, and 8 of the 10 §A.1 events are seen live.
- **The two deliberate additions** are both seen:
  - `historical_filter_applied {filter_type:'reset'}` (Story 4.0, D1), identified, as above;
  - **`prediction_shared`** (Story 4.4, owner decision 2026-10-08), right after each "Share" click, twice.
- **SDK behaviour is unchanged:** the landing `$pageview`, a `$pageview` per pathname change, autocapture, and Web vitals. `Pageleave` appears because this walk had a full page navigation (the share arrival), which the 4.0 walks did not.
- **SM-3:** a share arrival's landing `$pageview` carries `utm_source=share`.

## What this record does not settle

- **Event properties.** The listing has names, persons, URLs and times only. `prediction_shared`'s props (`surface`, `kind`, `channel`) and the reset's `filter_type` are pinned by unit tests and by the deep-link probe's row 12, which decodes `prediction_shared` locally. They are not read from the live payload here.
- `custom_series_selected` and `contact_form_submitted` were not walked, as in both 4.0 records.
