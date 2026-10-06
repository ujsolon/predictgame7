// The analytics event registry (AD-1, NFR-V1): the only place an event name is
// spelled. These are addendum §A.1's ten names, verbatim — they must not be
// renamed or extended until FR-25's metrics are re-pointed.
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
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
