// The analytics event registry (AD-1, NFR-V1): the only place an event name is
// spelled. The first ten are addendum §A.1's names, verbatim — they must not be
// renamed until FR-25's metrics are re-pointed.
//
// Deliberate additions, each owner-decided and recorded in
// `epic-4-context.md` · Analytics (Story 4.7's continuity comparison lists them):
//   1. Story 4.0's archive reset (D1) — a new `filter_type: 'reset'` value on the
//      existing `historical_filter_applied`, not a new name.
//   2. Story 4.4's `prediction_shared` (owner decision 2026-10-08, option a):
//      one emission per share that reaches the native sheet or the clipboard,
//      `{ surface: 'predict' | 'series', kind: 'series' | 'custom',
//      channel: 'native' | 'clipboard' }`. A cancel or a failed copy emits
//      nothing.
//
// Deliberately free of any SDK import, so tests and types can use it cheaply.
export const EVENTS = {
  PREDICTION_GENERATED: 'prediction_generated',
  SERIES_SELECTED: 'series_selected',
  CUSTOM_SERIES_SELECTED: 'custom_series_selected',
  PREDICTION_METHOD_SELECTED: 'prediction_method_selected',
  DETAILED_ANALYSIS_VIEWED: 'detailed_analysis_viewed',
  PREDICTION_RESET: 'prediction_reset',
  BANNER_HOTSPOT_CLICKED: 'banner_hotspot_clicked',
  CONTACT_FORM_SUBMITTED: 'contact_form_submitted',
  HISTORICAL_SERIES_EXPANDED: 'historical_series_expanded',
  HISTORICAL_FILTER_APPLIED: 'historical_filter_applied',
  PREDICTION_SHARED: 'prediction_shared',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
