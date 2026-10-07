// Shared class strings for the Story 4.3 series pages (DESIGN.md · Series
// page). Existing tokens only — no new radius, colour or elevation.
//
// The label motif uses `text-on-muted` (#595959) rather than
// `text-muted-foreground` (#808080): the latter fails AA at 12px until Story
// 5.2 retunes the token (same call as Historical's league chip).
export const LABEL = 'text-xs font-semibold uppercase tracking-widest text-on-muted';

/** `mono-data`: scores and series scores, always tabular. */
export const MONO = 'font-mono tabular-nums';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Primary ink CTA with a ≥44px hit area. */
export const CTA_LINK = `mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 ${FOCUS}`;

/** A ruled row link (method list), ≥44px tall. */
export const ROW_LINK = `flex min-h-11 items-center gap-5 border-b border-border px-1 py-4 text-foreground hover:bg-muted ${FOCUS}`;

/** The reveal: a text link in ink with the standard underline — deliberately not a button. */
export const TEXT_LINK = `inline-flex min-h-11 items-center gap-1.5 font-medium text-foreground underline underline-offset-4 ${FOCUS}`;
