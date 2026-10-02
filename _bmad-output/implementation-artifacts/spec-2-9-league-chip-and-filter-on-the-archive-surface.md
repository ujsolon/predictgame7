---
title: 'League chip and filter on the archive surface'
type: 'feature'
created: '2026-10-02'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '84d4c78137fe3844b1496ee4026c4672e27bca59'
context:
  - '_bmad-output/planning-artifacts/epics.md'
  - 'docs/CURRENT_DATA_MODEL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `00016` is live, so `/historical` lists 178 series across three leagues (160 NBA/BAA + 18 ABA) while every insight denominator is 160. Nothing on the surface names a row's league, so the two numbers read as a contradiction — and the new column already reaches one client read path and not the other.

**Approach:** Close the read path first — declare `league` and select it on both pages — then show the **stored** value as a chip on each archive row and in the expanded record, and add a league filter beside the year and team filters. Client-side over an already-fetched archive: no new query, no route-list change.

## Decisions (owner, 2026-10-02 checkpoint)

- **D1 — chip placement:** inline in the "Matchup & Round" cell beside the existing `{series.round}` sub-label (`HistoricalPage.tsx:216`). The table stays three columns; the empty row keeps `colSpan={3}`.
- **D2 — gloss:** one plain-text legend line under the filter row, covering **both** BAA and ABA. No tooltip primitive, no hover-only affordance. Wording owned here; floor pinned: "BAA is the league that became the NBA in 1949, so its Game 7s are NBA history. ABA is the rival league that merged into the NBA in 1976; its series are archived here, but they are not NBA records." (Accurate against the data: one `BAA` row, 1948; 18 `ABA` rows, calendar years 1969–1976.)
- **D3 — filter control:** a third `Select` beside the year `Select`, mirroring it — "All leagues" plus the leagues present.
- **D4 — scope:** Story 2.8's two deferred carry-overs (`resolveFeedCode`'s context-free `WAS` collision; the census-pending guard) are **out**. They re-point to follow-on spec `spec-2-8b-venue-probe-and-guard-followup.md`; their `deferred-work.md` entries were updated at this checkpoint. **This story touches nothing under `supabase/`.**

## Boundaries & Constraints

**Always:**
- Chip renders the stored `league` verbatim — never derived from the year, never relabelled, `BAA` not folded into `NBA`.
- The filter intersects with year **and** team search (FR-10), resets `visibleCount` to 10 like the year filter, and the existing reset button clears it too.
- Analytics reuse the **existing** `historical_filter_applied` with `filter_type: 'league'` and the league value. No new event name (addendum §A.1 stands), no new `posthog-js` import.
- AA on the new surface: keyboard-reachable control with an accessible name, changed result set re-announced, chip text ≥4.5:1 at its size — `text-on-muted` or `text-foreground`, not `muted-foreground` (#808080 fails small text until Story 5.2).
- No automatic scroll on selection. Tests per-file jsdom, asserting **no computed accessible name** (AGENTS.md accname rule) — raw `textContent` instead.

**Never:**
- No migration, no `db push`, no deploy, no re-emit of `00016`, no production data touched, nothing under `supabase/`.
- No change to the game tiles (`HistoricalPage.tsx:282-298`) or to home/away derivation; no route list / prerender change; the 18 ABA rows stay listed and in the SEO set.
- No new empty state — reuse "No series found matching your filters." No validation added to the unvalidated `asSeries` casts.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| The one BAA row | `1948 PHW/SLB` | chip reads `BAA` verbatim in row and sheet; legend present below the filters | n/a |
| ABA row | any of the 18 | chip reads `ABA`; row stays in list and prerender set | n/a |
| All three filters set | league × year × team | intersection of all three; counter back to 10 | n/a |
| Empty intersection | league × year with no series | existing empty row, no new copy | n/a |
| Default | `league = 'all'` | all 178 series in scope | n/a |

</frozen-after-approval>

## Code Map

- `src/types/types.ts:27-40` — `Series`; add `league: string`. **Required, not optional**: `00016:456-458` leaves the column `NOT NULL DEFAULT 'NBA'` + three-value CHECK.
- `src/pages/HistoricalPage.tsx:39` — `.select('*, …')` already returns `league`; **no query change**. Rest of the file: `:59-62` `years` memo (the derive-options precedent), `:64-75` `filteredSeries` (add the league predicate), `:81-85` `resetFilters`, `:104` slice, `:115-149` filter row (`Select` `:118-130`, team `Input` `:132-143`, reset `:144-148` + its visibility condition), `:154-159` headers, `:192-218` row cells (round sub-label `:216` — the chip's slot per D1), `:234-238` empty row, `:258-320` expanded sheet (title block `:271-274`), `:282-298` game tiles — **untouched**.
- `src/pages/PredictPage.tsx:31-44` — `SERIES_SELECT` enumerates columns and omits `league`; add it so a `Series` built here really is one. `:46-50` casts, `:327-331` `home_team` derivation untouched.
- `src/components/ui/badge.tsx:6-24` — `Badge` (cva default/secondary/destructive/outline), **unused by any page today**; `src/components/common/ErrorRetryPanel.tsx:47` is the `text-on-muted` precedent. A hand-rolled `span` in the label motif is equally acceptable — what is not optional is the ≥4.5:1 colour.
- `src/pages/__tests__/historical-page-archive.test.tsx:14-77` — mocked supabase observing the real `select().not()` chain, `archivedRow: Series` at `:38-59`; `src/pages/__tests__/helpers.tsx:16` `seriesFixture` is the other full `Series` literal. Both must gain `league` once it is required — `npm run typecheck` is what says so.
- `docs/CURRENT_DATA_MODEL.md:142` — the sentence handing this asymmetry to Story 2.9 ("owns closing that asymmetry before it ships a chip or a filter"). Retire it here.
- `_bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/` — `EXPERIENCE.md` (Component Patterns `:78`, State Patterns `:97`, hover-only ban `:124`, Accessibility Floor `:126`) gains the archive delta line; `DESIGN.md:146-157` Components gains the chip treatment, `:118` is the contrast rule it must satisfy.

## Tasks & Acceptance

**Execution:**
- [ ] `src/types/types.ts` -- add `league: string` to `Series`, one comment naming `00016` as its source -- read path closes before any UI reads it.
- [ ] `src/pages/PredictPage.tsx` -- add `league,` to `SERIES_SELECT` -- keeps the declared type true on both read paths (E9).
- [ ] `src/pages/HistoricalPage.tsx` -- league filter state + predicate in `filteredSeries`, reset and `visibleCount` handling, the `historical_filter_applied` capture, the chip in row (`:216` slot) and expanded record, the D2 legend line, and a polite live region carrying the filtered count.
- [ ] `src/pages/__tests__/historical-page-archive.test.tsx` + `helpers.tsx` -- fixtures gain `league`; one case per I/O row: chip text per league incl. `BAA` verbatim, intersection with year and team search, the analytics payload, the existing empty state; no computed-name assertion.
- [ ] `docs/CURRENT_DATA_MODEL.md` + `EXPERIENCE.md` + `DESIGN.md` -- retire `:142`, add the archive delta line (filter semantics + D2 wording) and the chip treatment line.
- [ ] `npm run gate`, then commit staging these files only.

**Acceptance Criteria:**
- Given a rendered archive row whose `league` is `BAA`, when the surface displays it, then the chip text is `BAA` and nothing maps it to `NBA`.
- Given all three filters are set, when any one excludes a series, then that series is absent — filters intersect, none overrides.
- Given the league filter changes, when the result set changes, then `visibleCount` is 10 and `historical_filter_applied` fires with `filter_type: 'league'`, with no new event name.
- Given `league` is required on `Series`, when `npm run typecheck` runs, then it passes with both test fixtures carrying the field.
- Given the story is done, when `git status` is read, then nothing under `supabase/` changed.

## Implementation Notes

## Spec Change Log

## Review Triage Log
