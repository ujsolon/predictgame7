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
- [x] `src/types/types.ts` -- add `league: string` to `Series`, one comment naming `00016` as its source -- read path closes before any UI reads it.
- [x] `src/pages/PredictPage.tsx` -- add `league,` to `SERIES_SELECT` -- keeps the declared type true on both read paths (E9).
- [x] `src/pages/HistoricalPage.tsx` -- league filter state + predicate in `filteredSeries`, reset and `visibleCount` handling, the `historical_filter_applied` capture, the chip in row (`:216` slot) and expanded record, the D2 legend line, and a polite live region carrying the filtered count.
- [x] `src/pages/__tests__/historical-page-archive.test.tsx` + `helpers.tsx` -- fixtures gain `league`; one case per I/O row: chip text per league incl. `BAA` verbatim, intersection with year and team search, the analytics payload, the existing empty state; no computed-name assertion.
- [x] `docs/CURRENT_DATA_MODEL.md` + `EXPERIENCE.md` + `DESIGN.md` -- retire `:142`, add the archive delta line (filter semantics + D2 wording) and the chip treatment line.
- [x] `npm run gate`, then commit staging these files only.

**Acceptance Criteria:**
- Given a rendered archive row whose `league` is `BAA`, when the surface displays it, then the chip text is `BAA` and nothing maps it to `NBA`.
- Given all three filters are set, when any one excludes a series, then that series is absent — filters intersect, none overrides.
- Given the league filter changes, when the result set changes, then `visibleCount` is 10 and `historical_filter_applied` fires with `filter_type: 'league'`, with no new event name.
- Given `league` is required on `Series`, when `npm run typecheck` runs, then it passes with both test fixtures carrying the field.
- Given the story is done, when `git status` is read, then nothing under `supabase/` changed.

## Implementation Notes

**Session outcome (2026-10-02): shipped, gate green, `review`-pending — owner review is the only leg left.**

**Read path (E9) closed first, in this order:** `src/types/types.ts` `Series` gains required
`league: string` with a one-comment source citation (`00016`'s `NOT NULL DEFAULT 'NBA'` + the
three-value CHECK, so the column can never be absent — hence required, not optional);
`src/pages/PredictPage.tsx` `SERIES_SELECT` now enumerates `league` between `round` and
`team_a_id`, which is what makes a `Series` built on that page really one. `HistoricalPage`'s
`.select('*, …')` already returned the column, so no query changed.

**Surface (`src/pages/HistoricalPage.tsx`):** a module-level `LeagueChip` (hand-rolled `span` in the
label motif — `text-[10px] uppercase tracking-widest font-semibold` on a `bg-muted` `rounded-md`
`border-border/60` plate, `text-on-muted`) renders `series.league` verbatim; it sits inline in the
"Matchup & Round" cell beside the round sub-label (D1's `:216` slot) and beside the expanded
record's `CardTitle`, so the table stays three columns and the empty row keeps `colSpan={3}`. The
game tiles and the home/away derivation are untouched. `leagues` is a `useMemo` over the stored
league using the same derive-options precedent as `years` (no hardcoded list; first-sighting order
inherits the year-desc sort → NBA, ABA, BAA). `filteredSeries` ANDs three predicates
(`matchesYear && matchesLeague && matchesTeam`), `applyLeagueFilter` sets state +
`setVisibleCount(10)` + captures the **existing** `historical_filter_applied` with
`{ filter_type: 'league', league: val }` (no new event name, no `posthog-js` import), and
`resetFilters` clears the league too — with the reset button's visibility condition extended to
`leagueFilter !== 'all'`. `Select` is the third control in the filter card; the D2 legend sentence
is the card's last child (`w-full md:basis-full` inside `md:flex-wrap`, always visible, no tooltip);
the polite live region is the first child of the list section and carries
`Showing {visibleSeries.length} of {filteredSeries.length} series.` No scroll is triggered on
selection.

**Layout note (why the legend is inside the card, not under it):** the list section is
`space-y-*`-driven, and Tailwind's `space-y-12 > :not([hidden]) ~ :not([hidden])` selector outranks
a single-class negative margin, so the first attempt at tucking the legend up beside the filters
(`-mt-8`) was silently a no-op. Restructuring the card to `md:flex-wrap` and giving the legend
`md:basis-full` puts it on its own line inside the controls' own card, which is where D2's "reads as
belonging to the filters" actually lives.

**Contrast:** the chip and the legend use `text-on-muted` `#595959`, ~6.4:1 on the `muted` `#F5F5F5`
fill (~7:1 on white) — AA at that size with headroom. `muted-foreground` `#808080` is ~3.95:1 on
white and would fail small text; Story 5.2's app-wide retune stays untouched, and both docs say so
rather than implying the token is fixed. No new token, radius or elevation was introduced.

**Tests (`src/pages/__tests__/historical-page-archive.test.tsx`, `src/pages/__tests__/helpers.tsx`,
`src/pages/__tests__/predict-phase-groups.test.tsx`):** 9 new cases in a Story 2.9 `describe` over a
three-league fixture set (1998 NBA, 1976 ABA, 1948 BAA) — one per I/O row plus the AA and analytics
legs: default scope + announced count, chip verbatim per league (asserting the BAA row's own cell
contains `BAA` and **no** `NBA` text anywhere in it), chip in the expanded record, the legend's exact
`textContent` and its document order after the team search input, filter + re-announcement,
three-filter intersection then an empty league × year intersection that reuses "No series found
matching your filters.", `visibleCount` back to 10 (12 rows → Load More → 12 → pick `NBA` → 10 +
Load More restored), the exact capture payload (`toEqual` on `db.capture.mock.calls`, so a new event
name would fail), and the reset button clearing the league. The league `Select` is driven through the
real Radix control with `fireEvent.click` — its trigger opens on click under jsdom because
`pointerTypeRef` starts non-mouse, and `role="option"` items select on click. All assertions are raw
`textContent` / `toBeInstanceOf(HTMLButtonElement)`; **no computed accessible name is read**
(AGENTS.md accname rule), the accessible name being a manual-QA leg. `historical-page-archive.test.tsx`
is 12/12 (3 pre-existing + 9 new); the projection test now also asserts the `Series` read carries
`league`.

**Verification — `npm run gate` (exit 0), the load-bearing lines:**

```
biome lint .                                  → Checked 122 files in 2s. No fixes applied.
tsc -b                                        → (no output)
vitest run                                    → Test Files  20 passed (20)
                                                Tests  333 passed (333)
vite build                                    → ✓ 1894 modules transformed / ✓ built in 13.36s
scripts/verify-build-base.mjs                 → Build output uses the /predictgame7/ asset prefix.
```

`tsc -b` did exactly the job the Code Map predicted: it named three sites for the required field —
`helpers.tsx:seriesFixture`, `historical-page-archive.test.tsx:archivedRow`,
`predict-phase-groups.test.tsx:archivedSeries` — and those three gained `league: 'NBA'` rather than
the type being softened to optional.

**Mutation checks (each revert-verified, archive suite only):** league predicate repointed at
`series.year` → 3 failures (filter+announcement, three-filter intersection, `visibleCount` reset);
row chip deleted → 1 failure (verbatim chip case, while the expanded-record case still passed, which
is the proof the two slots are separately pinned); `setVisibleCount(10)` and the `capture` both
removed from `applyLeagueFilter` → precisely the reset case and the analytics case; legend text
shortened and `aria-live` dropped → 4 failures (default announcement, legend, filter announcement,
reset). No mutation left the suite green.

**Docs:** `docs/CURRENT_DATA_MODEL.md:142`'s asymmetry hand-off sentence is retired — replaced by the
closure (type required, both read paths project `league`, chip + filter shipped) plus the honest
caveat that the `asSeries` casts stay unvalidated per the spec's Never list and the projection tests
are what watch that wire. `EXPERIENCE.md` (`updated: 2026-10-02`) gains a Component Patterns row for
the archive chip + filter carrying the filter semantics, the counter/reset rule, the event reuse, the
live-region announcement, the no-scroll rule, the verbatim D2 sentence and the reused empty state, and
its header records the one delta on a ratified surface. `DESIGN.md` (`updated: 2026-10-02`) gains the
chip treatment under Components.

**Boundary proof:** `git status --porcelain supabase/` is empty — nothing under `supabase/` changed,
no migration, no `db push`, no deploy, no route-list/prerender change, no new empty state, and D4's
two carry-overs were not touched (they stay with `spec-2-8b`).

## Spec Change Log

- 2026-10-02 (implementation): `DESIGN.md`'s new chip bullet first stated the `on-muted`-on-`muted`
  ratio as ~6.6:1; recomputed against WCAG relative luminance it is ~6.4:1 (and ~7:1 on white).
  Corrected in `DESIGN.md` and in the `HistoricalPage.tsx` comment. Passes either way, but the doc is
  load-bearing for the next contrast audit, so it carries the right number. No intent changed.
- 2026-10-02 (implementation): D2's legend ships as the filter card's last child
  (`md:basis-full`), not as a sibling paragraph under the card — see Implementation Notes' layout
  note. Same visible outcome, same always-visible/no-tooltip requirement; the code map's "under the
  filter row" is satisfied, and the alternative was unreachable because `space-y-*` outranks a
  negative-margin utility. No intent changed.
## Review Triage Log
