# Analytics continuity: the before leg for Story 4.0 (2026-10-07)

This is the **before** leg of Story 4.0's measurement-continuity AC (`epics.md` Story 4.0; spec D3; `sprint-change-proposal-2026-10-07.md` Proposal 2). Story 4.7 records the after leg against this file once a release carrying 4.0 is live.

## What was observed

- **Who / where:** the owner, in PostHog's live activity listing, project key `phc_qtJ3Lh…`, host `https://us.i.posthog.com`.
- **When:** 2026-10-07, about 11–14 minutes before the listing was copied.
- **Site:** https://ujsolon.github.io/predictgame7/ at release 0.2.7.
- **Bundle:** `assets/index-B2RSXBTe.js`, the same hash a local `vite build` of `282c1dd` produces (checked 2026-10-07).
- **Browser:** a private window with extensions off. All events share one person, `01a11314-e1a6-7886-9c86-5cd589ecd21a`.
- **The walk:**
  1. Land on Home and click a banner hotspot.
  2. On Predict, the series is pre-selected by `?series=`. Choose a method, Generate, open the detailed analysis, then click New Prediction (reset).
  3. Go to Historical, apply the filters, and expand a row.
  4. Click Home.

  The contact form was skipped on purpose, because submitting it sends a real message.

## Event sequence, oldest first, as the owner's listing recorded it

| # | Event | URL path | Kind |
|---|---|---|---|
| 1 | Pageview | `/` | SDK `$pageview` (landing) |
| 2 | Web vitals | `/` | SDK |
| 3 | clicked span | `/` | autocapture |
| 4 | **banner_hotspot_clicked** | `/` | §A.1 |
| 5 | Pageview | `/predict?series=29638c4e-…` | SDK `$pageview` (history change) |
| 6 | Web vitals | `/predict?series=…` | SDK |
| 7 | clicked span | `/predict?series=…` | autocapture |
| 8 | clicked button | `/predict?series=…` | autocapture |
| 9 | **prediction_method_selected** | `/predict?series=…` | §A.1 |
| 10 | clicked div | `/predict?series=…` | autocapture |
| 11 | **prediction_generated** | `/predict?series=…` | §A.1 |
| 12 | Web vitals | `/predict?series=…` | SDK |
| 13 | clicked link "Predict" | `/predict?series=…` | autocapture |
| 14 | clicked button "View Detailed Analysis" | `/predict` | autocapture |
| 15 | **detailed_analysis_viewed** | `/predict` | §A.1 |
| 16 | clicked button "New Prediction" | `/predict` | autocapture |
| 17 | **prediction_reset** | `/predict` | §A.1 |
| 18 | clicked link "Historical" | `/predict` | autocapture |
| 19 | Pageview | `/historical` | SDK `$pageview` (history change) |
| 20 | **historical_filter_applied** | `/historical` | §A.1 |
| 21 | clicked input | `/historical` | autocapture |
| 22–24 | **historical_filter_applied** ×3 | `/historical` | §A.1 |
| 25 | changed input | `/historical` | autocapture |
| 26 | clicked div | `/historical` | autocapture |
| 27 | **historical_series_expanded** | `/historical` | §A.1 |
| 28 | Web vitals | `/historical` | SDK |
| 29 | clicked button "× Close" | `/historical` | autocapture |
| 30 | clicked link "Home" | `/historical` | autocapture |
| 31 | Pageview | `/` | SDK `$pageview` (history change) |

The listing groups events by minute, so the order inside one minute is the listing's own order and may not be exact.

## Reading it against addendum §A.1

**7 of the 10 events fired:** `banner_hotspot_clicked`, `prediction_method_selected`, `prediction_generated`, `detailed_analysis_viewed`, `prediction_reset`, `historical_filter_applied`, `historical_series_expanded`.

**3 did not fire, each for a reason the code explains, so none of these is a gap:**
- **`series_selected`:** it fires only from the picker dialog (`PredictPage.tsx:471`, in the dialog's select handler). The hotspot's `?series=` preload bypasses the dialog, so no event is the expected result for this walk.
- **`custom_series_selected`:** the custom matchup was not part of the walk.
- **`contact_form_submitted`:** skipped on purpose.

**What else the after leg must reproduce.** The port must not change SDK behaviour, so Story 4.7 also expects these:
- `$pageview` on landing and on each pathname change. A change only in the query string does not count: Predict → `/predict` produced no pageview at row 13.
- autocapture `clicked …` / `changed input`
- Web vitals

**Four `historical_filter_applied` rows.** This is consistent with one year pick plus team-search typing, which fires on every non-empty keystroke (`HistoricalPage.tsx:198`). It is existing behaviour, and Story 4.0 keeps it as it is (spec Boundaries).

**Finding (a), the landing pageview, is refuted in production.** Row 1 is a `$pageview` on a cold landing at `/`. This matches the headless measurement in the 4.0 spec's Design Notes.

## What this record does not hold

**Event properties.** The copied listing shows names, persons, URLs and times only, so property continuity is not settled here. The property baseline is:
- the code at `282c1dd`, whose payloads the page tests pin exactly (e.g. `historical-page-archive.test.tsx` pins the whole call log);
- the headless decoded walk, which Story 4.0's build runs at baseline and after the change, with PostHog answered locally.

If Story 4.7 wants a live property comparison, it opens one event of each kind in PostHog's event detail on both sides.
