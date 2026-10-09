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

## Headless property walk (2026-10-09)

This closes the gap the record above leaves open: the event **properties**. A committed harness walks the live site in headless Chrome, fires every §A.1 event plus `prediction_shared` and the archive reset, and decodes each payload locally. No event reaches the production PostHog project.

- **Run:** 2026-10-09T00:37:56Z (UTC). Exit code **0**, verdict **GREEN**.
- **Site:** https://ujsolon.github.io/predictgame7/, bundle **`index-DCF4RgKj.js`** (read from the live HTML at run time). This is the same bundle as the owner's 2026-10-08 walk (release 0.2.11).
- **Command:** `node scripts/probe-analytics-walk.mjs https://ujsolon.github.io/predictgame7/` (needs `.env`: `VITE_POSTHOG_HOST`, `VITE_SUPABASE_URL`).
- **Harness:** `scripts/probe-analytics-walk.mjs`, built on `openBrowserSession` / `createLedger` from `scripts/measure-predict-latency.mjs`.
- **The walk, in order:**
  1. Home loads.
  2. A real click on the "Thunder vs Pacers, 2025" hotspot.
  3. Predict: Elo → Generate → View Detailed Analysis → Share (clipboard stubbed) → New Prediction.
  4. The picker: 2020s → 2025 → OKC vs IND.
  5. The picker again: Custom Matchup.
  6. Historical (SPA nav): Year = 2016 (Radix Select, keyboard Enter on the option), then a team search ("Cavaliers"), then the icon-only reset, then a click on the first row.
  7. Home (SPA nav): the contact form with synthetic values ("Probe Walk", `probe@example.invalid`).
- **How the property contract is set:**
  - The probe finds every `track(EVENTS.…)` call site in `src/**` at run time and extracts the literal keys of its props object.
  - It asserts (a) that those keys equal the probe's contract table, so a call-site edit turns the probe red, and (b) that each decoded event's app-level keys equal the keys at its call site, exactly, with value types and enums checked.
  - "App-level" means every key except `$`-prefixed SDK keys and the non-`$` keys that every decoded event carries (`token`, `distinct_id`, measured). `title` appears only on `$pageview`, so it is not excluded.
  - It also asserts that each action fired its event **exactly once**, and that no unregistered app event was emitted.

### Per event

| event | call site | decoded app-level properties | OK |
|---|---|---|---|
| `banner_hotspot_clicked` | `src/pages/HomePage.tsx:310` | `{"caption":"Thunder vs Pacers, 2025","series_id":"626257bc-1678-4c88-84a6-37e0a6cdb49c"}` (the clicked hotspot) | OK |
| `prediction_method_selected` | `src/pages/PredictPage.tsx:975`, `:998`, `:1021`, `:1044` | `{"method":"elo"}` | OK |
| `prediction_generated` | `src/pages/PredictPage.tsx:368` | `{"confidence_level":"Low","method":"elo","predicted_winner":"Oklahoma City Thunder","series_id":"626257bc-1678-4c88-84a6-37e0a6cdb49c","series_source":"historical","series_year":2025,"win_probability_a":51.33,"win_probability_b":48.67}` | OK |
| `detailed_analysis_viewed` | `src/pages/PredictPage.tsx:1240` | `{"method":"elo","series_id":"626257bc-1678-4c88-84a6-37e0a6cdb49c"}` | OK |
| `prediction_shared` | `src/components/common/ShareButton.tsx:55` | `{"channel":"clipboard","kind":"series","surface":"predict"}` | OK |
| `prediction_reset` | `src/pages/PredictPage.tsx:1403` | `{}` (no props, as at the call site) | OK |
| `series_selected` | `src/pages/PredictPage.tsx:447` | `{"series_id":"626257bc-1678-4c88-84a6-37e0a6cdb49c","series_round":"Finals","series_source":"historical","series_year":2025,"team_a":"Oklahoma City Thunder","team_b":"Indiana Pacers"}` | OK |
| `custom_series_selected` | `src/pages/PredictPage.tsx:895` | `{}` | OK |
| `historical_filter_applied` (year) | `src/pages/HistoricalPage.tsx:177` | `{"filter_type":"year","year":"2016"}` (the picked year) | OK |
| `historical_filter_applied` (team search) | `src/pages/HistoricalPage.tsx:199` | `{"filter_type":"team_search"}` | OK |
| `historical_filter_applied` (**reset**) | `src/pages/HistoricalPage.tsx:143` | `{"filter_type":"reset"}`, **read from the payload** | OK |
| `historical_series_expanded` | `src/pages/HistoricalPage.tsx:251` | `{"series_id":"6ecb170c-e781-47f8-b7ee-881ba719d6d5","series_round":"Western Conference Finals","series_year":2026,"team_a":"Oklahoma City Thunder","team_b":"San Antonio Spurs","winner":"San Antonio Spurs"}` | OK |
| `contact_form_submitted` | `src/pages/HomePage.tsx:266` | `{}` | OK |

- **Coverage:** all ten §A.1 names were decoded, plus `prediction_shared` and the reset.
- **Firing counts:** each fired ×1 per action (`historical_filter_applied` ×3 for its three actions), and no other app event was emitted.
- **SDK events, decoded but not asserted:** `$pageview` ×4, `$autocapture` ×19, `$rageclick` ×1. The rage click is the probe's own quick trigger/option clicks.

### What was stubbed, and how each stub was proven

- **PostHog:** every request to `*posthog*` and to `VITE_POSTHOG_HOST` is answered inside Chrome over CDP `Fetch` and decoded. None is forwarded. The probe fails closed:
  - It refuses to start unless the live bundle contains the intercepted host (`https://us.i.posthog.com`, found).
  - It aborts after Home unless the landing `$pageview` was decoded in-probe and every guarded request so far was answered locally (4 of 4).
  - At the end, every Network-level request to a guarded host must have a request id that the stub fulfilled, and none may carry a remote IP. Result: **34 / 34 answered locally**, zero remote addresses. The 34 were `us.i.posthog.com` ×28, `us-assets.i.posthog.com` ×2, and handle-contact ×4.
  - An interception error now fails a guarded request (`Fetch.failRequest`) instead of forwarding it.
- **handle-contact:** a new opt-in, `openBrowserSession({ stubContact: true })` (default off; existing callers unchanged), answers `*/functions/v1/handle-contact*` locally. It mirrors the real function's shapes: `'ok'` to the preflight, and `{ "message": "Success" }` 200 to a POST, with CORS headers and an `X-Probe-Stub` marker.
  - **Proof before submitting:** an in-page preflighted `fetch` to the live handle-contact URL came back `200`, with `X-Probe-Stub: handle-contact` and `{"message":"Success"}`. The stub logged both its OPTIONS and its POST. Without that proof the probe skips the submit and records a FAIL.
  - Then the form's own POST, carrying the synthetic values, was answered by the stub, exactly once.
  - So no mail was sent and no `contact_submissions` row was written.
- **Share:** `navigator.share` was removed and `navigator.clipboard.writeText` was stubbed, the same as `probe-deep-links.mjs` row 12. The copied URL was `…/series/626257bc-…/?method=elo&utm_source=share`.
- **Live and unstubbed:** one `predict-game-7` call (asserted exactly one; the function is stateless) and the app's own anon REST reads.
- **Earlier runs the same day:** three development runs went red on harness issues: an evaluate returned a DOM node, the custom-picker trigger lookup failed, and a pointer click on the Radix year list landed on 2020. In all three, every guarded request was answered locally. In the two that reached the contact step, the handle-contact stub proved itself before the submit.

### What this does not settle

- **The production ingest path.** These are the payloads the browser *hands to* PostHog. This walk does not show what PostHog stores or displays, or that FR-25's queries read them. The owner's live listing above is the evidence for ingestion, by name only.
- **The native share channel.** `channel: 'native'` and `surface: 'series'` (the series-page header's Share) were not walked. Only the Predict detailed view's clipboard path was.
- **Other branches of the same events:**
  - `series_source: 'current'`: no pending series was picked.
  - `prediction_generated` for a custom matchup, where `series_source: 'custom'` and `series_id`/`series_year` are absent.
  - `detailed_analysis_viewed` without `series_id`.
  - The other three `method` values.
  - A deep-link-preloaded `series_selected`: by the code, the preload does not emit it.
- **One viewport and one browser:** desktop headless Chrome at 1440×900, with the user agent de-headlessed so posthog-js does not drop the events as bot traffic. Mobile layouts and other browsers were not walked.
- **The leak detector's failure case.** No forwarded request was produced to show that the detector flags one. Its pass rests on every guarded Network request id matching an id the stub fulfilled (34 / 34), plus the absence of any remote IP.
- **Comparison with before Story 4.0.** The pre-port records hold names only, so "same properties as before" is shown against the code's call sites and Story 4.0's verbatim-forwarding port (`src/lib/analytics/index.ts`), not against an older payload.
