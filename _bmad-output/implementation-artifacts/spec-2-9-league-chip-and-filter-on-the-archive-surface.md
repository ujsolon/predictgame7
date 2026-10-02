---
title: 'League chip and filter on the archive surface'
type: 'feature'
created: '2026-10-02'
status: 'in-review'
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
the polite live region carries `Showing {visibleSeries.length} of {filteredSeries.length} series.`
and sits as the **last** child of the list section — added there as first child, and relocated in the
review pass because `space-y-8 > :not([hidden]) ~ :not([hidden])` then matched the table wrapper and
gave it a 32px top margin it had never had. No scroll is triggered on selection.

**Layout note (why the legend is inside the card, not under it):** the list section is
`space-y-*`-driven, and Tailwind's `space-y-12 > :not([hidden]) ~ :not([hidden])` selector (the page
container at `:139`) outranks a single-class negative margin, so the first attempt at tucking the
legend up beside the filters (`-mt-8`) was silently a no-op. Restructuring the card to `md:flex-wrap`
and giving the legend `md:basis-full` puts it on its own line inside the controls' own card, which is
where D2's "reads as belonging to the filters" actually lives. Because D2's own wording says "under
the filter row", both UX docs shipped repeating that phrase; the review pass corrected
`DESIGN.md`/`EXPERIENCE.md` to describe the position the code actually renders — the card's last line,
immediately below the controls — so the docs no longer claim a DOM position this build does not have.

**Contrast, per element rather than one number for the pair:** the chip's `text-on-muted` `#595959`
measures 6.42:1 on its own `bg-muted` `#F5F5F5` plate. The legend shares the ink token but not the
substrate — it sits on the filter card's `bg-muted/20` over white, which computes to ≈ #FDFDFD, so
its ratio is ≈ 6.9:1, not 6.4:1. Both clear 4.5:1 at their size (chip 10px, legend 12px). The new
league `Select`'s own label went to `text-on-muted` for the same reason, which leaves it visibly
darker than the two sibling labels that stay on `muted-foreground` — a deliberate, AA-required
asymmetry, with the pre-existing pair handed to Story 5.2. `muted-foreground` `#808080` is ~3.95:1
on white and would fail small text; Story 5.2's app-wide retune stays untouched, and both docs say so
rather than implying the token is fixed. No new token, radius or elevation was introduced.

**Review pass (step-04) patches to the tree.** Four source/test changes, each proved to bite: the two
source patches by reverting them and watching exactly the matching cases go red (label token → the
AA-token case; live-region relocation → the structural case, and the wrapper's computed `margin-top`
back to 32px in Chrome), and the two new pins by breaking the source they watch (projection string
stripped of `league`-and-`*` → the projection case; `text-on-muted` → `text-muted-foreground` → the
AA-token case). Specifically: (1) the league label's `text-muted-foreground` → `text-on-muted`, which
is the AA rule applied to text this story added; (2) the live region relocated from first to last child
of the `space-y-8` section, restoring the table wrapper's `margin-top` to 0px (measured over CDP
against `vite preview` of the rebuilt bundle); (3) `reads \`league\` on the archive projection…` — the
archive half of the read path was unpinned because the mock returns fixtures whatever the projection
string says, so `'*'` could regress to an enumerated list without `league` and all 16 cases plus the
whole gate would stay green; (4) `puts every piece of text it adds on the AA-safe token` — a
`classList` pin on chip, legend and label, because computed contrast is unreachable from jsdom but the
forbidden `text-muted-foreground` swap is exactly what a later edit will do. Plus
`changes the league without moving the page`, which closes the Always rule that had no evidence at
all: it installs `window.scrollTo`/`window.scroll` spies and asserts neither fires on selection
(`scrollIntoView` is undefined in jsdom, so a call there throws rather than passing silently).

**Tests (`src/pages/__tests__/historical-page-archive.test.tsx`, `src/pages/__tests__/helpers.tsx`,
`src/pages/__tests__/predict-phase-groups.test.tsx`):** 13 new cases in a Story 2.9 `describe` over a
three-league fixture set (1998 NBA, 1976 ABA, 1948 BAA) — nine from the implement pass covering the
matrix plus the AA and analytics legs, four added by the review pass: default scope + announced count,
chip verbatim per league (asserting the BAA row's own cell
contains `BAA` and **no** `NBA` text anywhere in it), chip in the expanded record, the legend's exact
`textContent` and its document order after the team search input, filter + re-announcement,
three-filter intersection then an empty league × year intersection that reuses "No series found
matching your filters.", `visibleCount` back to 10 (12 rows → Load More → 12 → pick `NBA` → 10 +
Load More restored), the exact capture payload (`toEqual` on `db.capture.mock.calls`, so a new event
name would fail), and the reset button clearing the league. The mapping to the matrix is 13 cases over
5 rows, not one apiece: the "All three filters set" and "Empty intersection" rows are carried by the
same `it` (intersection then empty, in that order); the "Default" row by the default-scope case, which
also pins the ABA row's "stays listed" half (three rows, `1998/1976/1948`, none dropped by the new
predicate); the BAA row by the two chip cases plus the legend case; and the ABA row's chip by the
verbatim case. Its "and prerendered" half is not a client-test claim at all — the route list is built
outside this suite — so it rests on the AC's boundary statement (`no route list, page count or
prerender input changes`) and on no query having changed, not on a test. The league `Select` is driven through the
real Radix control with `fireEvent.click` — its trigger opens on click under jsdom because
`pointerTypeRef` starts non-mouse, and `role="option"` items select on click. All assertions are raw
`textContent` / `toBeInstanceOf(HTMLButtonElement)`; **no computed accessible name is read**
(AGENTS.md accname rule), the accessible name being a manual-QA leg. `historical-page-archive.test.tsx`
is 16/16 (3 pre-existing + 13 new); the projection test now also asserts the `Series` read carries
`league`.

**Verification — `npm run gate` (exit 0), re-run after the review patches; the load-bearing lines:**

```
biome lint .                                  → Checked 122 files in 2s. No fixes applied.
tsc -b                                        → (no output)
vitest run                                    → Test Files  20 passed (20)
                                                Tests  337 passed (337)
vite build                                    → ✓ 1894 modules transformed / ✓ built in 2.58s
scripts/verify-build-base.mjs                 → Build output uses the /predictgame7/ asset prefix.
```

(The 333 → 337 is the four review-pass pins plus the no-scroll pin landing after the first record was
written. `historical-page-archive.test.tsx` alone: 16 passed.)

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

**Surface re-measured over CDP against `vite preview` of the built bundle, reading production data
(same session as the implementation — *not* an independent review, 2026-10-02).** The implement pass
is a report; these numbers were re-measured through the deployed client's own read path, in real
Chrome, because three of the spec's "Always" items are not observable from jsdom. Each is an
observation, not a derivation. Independence this session cannot offer is what the owner's fresh-context
re-run on another model supplies.

- **Default scope is the real archive.** The live region read `Showing 10 of 178 series.` on first
  paint — the fetch returned all 178 rows and every league stayed in scope at `all` — and
  `list_console_messages` was empty (0 messages across the whole session: load, three filter
  changes, opening a record, and reset).
- **The two data-shaped matrix rows, on production rows rather than fixtures.** All ten rows visible
  at the default carried an `NBA` chip, so the column arrives populated. Choosing `ABA` →
  `Showing 10 of 18 series.` with all ten chips reading `ABA` (1976/1975/1974… — the 18-row span the
  census says); then choosing `BAA` → `Showing 1 of 1 series.`, one row,
  `1948 PW vs SLB / SEMIFINALS / BAA / 85−46` (the row's separator is U+2212, which is what `:290`
  renders). Opening that row put the same `BAA` text beside the expanded record's title, with the
  seven game tiles (`G1` … `G7`, each stacking its two scores vertically with no separator glyph at
  all — so the earlier `58-60` flattening in this record was my transcription, not the app's) and
  "SERIES WINNER
  Philadelphia Warriors" unchanged. The reset button returned the trigger to `All leagues` and the
  count to 178, and removed itself (`svg.lucide-funnel-x` absent afterwards).
- **Chip contrast measured, not asserted.** `getComputedStyle` on a rendered chip: color
  `rgb(89, 89, 89)` (`#595959` = `--on-muted`) on `rgb(245, 245, 245)` (`#F5F5F5` = `muted`),
  `font-size: 10px`, `font-weight: 600` → 6.42:1 by WCAG relative luminance, ≥4.5:1 at the smallest
  size on the surface. The legend and the new league label share that ink at 12px and 10px but **not**
  that substrate — the review pass measured their background stack rather than assuming the chip's:
  `rgba(245, 245, 245, 0.2)` (the card's `bg-muted/20`) over `rgb(255, 255, 255)`, which composites to
  ≈ #FDFDFD → ≈ 6.9:1. So the legend's ratio is higher than the chip's, not the same, and the earlier
  sentence that quoted one figure for both was measuring the chip only.
- **The accessible-name leg the tests are forbidden to assert.** Chrome's own accessibility tree
  gives the new control a computed name — `combobox "FILTER LEAGUE" … hasPopup="listbox" focusable`,
  next to its `StaticText "FILTER LEAGUE"` — while the pre-existing year combobox in the same row
  still has **no** computed name in the same tree (`combobox … value="All Years"`). The open listbox
  reported `option "BAA" focusable selectable`, so the control is in the tab order and operable
  without a pointer. What remains genuinely human is announcement *behaviour*: the live region's text
  is in the tree, but whether AT speaks the change is not measurable here.
- **Viewport limit, stated.** This browser's viewport measured 638 CSS px (`matchMedia('(min-width:
  768px)')` false), so what was observed is the mobile stack — year, league, search, legend each on
  its own line at x=41, w=546. The `md:flex-wrap` + `md:basis-full` desktop arrangement is therefore
  **not observed**; it is the one leg a human eyeball settles, and the layout class change
  (`md:flex-wrap`) that carries it is otherwise inert at this width. No screenshot exists: the popup
  route to a wider viewport was refused, same as Story 2.8's run.

**A deviation from D2's wording, recorded rather than hidden:** the legend is the filter card's *last
child* (`md:basis-full`), not a sibling paragraph under the card. First attempt at the sibling (`-mt-8`
beside the card) was silently a no-op because the list section's `space-y-*` selector outranks a
single-class negative margin — so the always-visible, plain-text, both-leagues requirement is met with
the line sitting inside the controls' own card at its bottom. Owner accepts or renegotiates.

## Spec Change Log

- 2026-10-02 (step-04 review, BH-2): `DESIGN.md`'s chip bullet said "Below the filter row" and
  `EXPERIENCE.md`'s Component Patterns row said "sits under the filter row" for the D2 legend. Both
  corrected to the position the code renders (immediately below the controls, as the filter card's own
  last line). This is not a D2 renegotiation — the requirement (plain text, always visible, both
  leagues, never hover-only, verbatim wording) is unchanged and still met; only two downstream docs had
  copied D2's phrasing literally while the shipped DOM parentage differs. The earlier change-log entry
  below claimed the code map's "under the filter row" was satisfied; it was, for the requirement, but
  the claim left the docs describing a position the build does not have, which is what this entry
  closes. No intent changed.

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

Pass 1 (step-04, 2026-10-02). Diff 56.45 kB → blind-hunter floor N = min(⌊√56.45 + 1⌋, 10) = 8, filed
10. Edge-case hunter filed 4; verification-gap filed 2 gaps + 2 other findings. 18 rows below, one per
finding, before deduplication. Verdicts are this session's, made by reading the cited code and, for the
four layout/contrast claims, re-measuring the built bundle over CDP; reviewer severities disregarded.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| BH-1 | `sprint-status.yaml` still says `in-progress` while the spec says `in-review`; `## Review Triage Log` is an empty heading stuck to the previous section with no blank line. | low | Both true at filing: the tracked state contradicted the frontmatter and the section was bare. | patch — the log is this step's own output; sprint-status flips to `review` in the same commit, blank line added. |
| BH-2 | D2's frozen wording ("legend line **under** the filter row") and both UX docs repeat that placement, while the shipped legend is the card's *last child*; the Change Log claimed satisfaction without reconciling the docs. | medium | Confirmed: `DESIGN.md:157` read "Below the filter row" and `EXPERIENCE.md:96` "sits under the filter row", so the docs of record described a DOM position this build does not ship — the next agent auditing placement against them would find a false match. | patch — both doc lines now state the shipped position ("immediately below the filter controls, as the card's own last line"); D2's requirement (always visible, plain text, both leagues, no tooltip) is what the code meets, and the owner-facing acceptance leg stays open below. |
| BH-3 | The AA rule is applied to the chip while its immediate neighbour, the round sub-label at `text-muted-foreground/50` (≈ #C0C0C0 on white ≈ 1.8:1), is left failing on the surface this story declares AA for, unmentioned. | medium | Real, and it is in the diff's context lines — but `git diff 84d4c78` shows that span's class string is unchanged; this story only re-wrapped it in a flex container. Pre-existing, not caused here. | defer — Story 5.2 (NFR-A1 remediation); it names the year/search labels and the `/50` round sub-label. |
| BH-4 | The legend's contrast is documented with the chip's substrate: `#F5F5F5` is the chip's `bg-muted` fill, but the legend sits on the filter card's `bg-muted/20` over white. | medium | Confirmed by measurement, and it strengthens rather than breaks the claim: post-patch `getComputedStyle` gives the label stack `rgba(245,245,245,0.2)` over `rgb(255,255,255)` ≈ #FDFDFD → ~6.9:1. | patch — Implementation Notes and the CDP bullet now carry each element's own substrate and ratio. |
| BH-5 | "No automatic scroll on selection" is an Always constraint with no test, no mutation check and no CDP observation. | medium | True at filing: the constraint appeared in the Always list and in the notes, backed by nothing. | patch — `changes the league without moving the page` spies `window.scrollTo`/`window.scroll` and asserts neither fires; `scrollIntoView` is undefined in jsdom, so a call would throw loudly. |
| BH-6 | `resetFilters` now clears the league but emits nothing, so the event stream counts application and never removal — undocumented, and FR-25 will read a biased funnel. | low | Real asymmetry. It mirrors the pre-existing year filter, which also captures on apply only (`:150`), and the AC settled only the apply-side payload. | defer — Story 3.1 / FR-25 (the analytics port owns event semantics before FR-25 is re-pointed). |
| BH-7 | The CDP leg observed the pre-existing year `Select` has no computed accessible name and generated no follow-up for a demonstrated AA gap on the same surface. | medium | Confirmed both ways: `:149`'s `<label>` has no `htmlFor` and the trigger has no `id`, and Chrome's tree gives that combobox no name while the league control has one. Pre-existing markup, untouched by this diff. | defer — Story 5.2, same entry family as BH-3. |
| BH-8 | The live region announces "Showing 0 of 0 series." during the initial load, a false result set. | false | The page returns a spinner while `loading` (`HistoricalPage.tsx:128-134`), so the list section — and the region — never mounts before data arrives; the empty row and the region are downstream of that guard. Measured: CDP's first paint read `Showing 10 of 178 series.`, with 0 console messages. | rejected |
| BH-9 | The verification header claims "Independent" while disclosing the same session; the score glyph appears as both `85−46` and `85-46`; and "one case per I/O row" is bent by one `it` bundling two rows, with no case↔row mapping stated. | low (2 of 3 sub-claims) | The self-contradicting heading and the missing mapping are both real about the record. The glyph sub-claim is **false**: the two strings come from two different render sites — the row's score cell emits U+2212 (`:290`), while each game tile stacks its two scores vertically with no separator glyph at all (`:374-377`), so the `85-46` was my own flattening of a vertical pair, not a transcription of a dash. Nothing to unify; the transcription is what needed correcting. | patch — heading reworded to "same session, not independent", the tile/row glyphs documented at their source, and the mapping written out (13 cases over 5 matrix rows; the intersection case carries two; the default-scope case carries ABA-stays-listed). |
| BH-10a | The frozen Approach says "select it on both pages" while `HistoricalPage`'s query is untouched, contradicting the notes. | false | `.select('*, teams(…)')` does project the column, so "select it on both pages" holds of the read path, which is what the sentence describes; the notes' "no query changed" narrows the mechanism, not the outcome. No contradiction to resolve, and the fix would be a spec edit. | rejected |
| BH-10b | The Problem statement is 178-rows-vs-160-denominators, but the gloss ships only on `/historical`; the surfaces that display 160-based insights still say nothing about the ABA exclusion, and no story owns that half. | medium | True: `InsightsPage` renders the `insights_cache` lines with no league framing, and this story's AC place the legend on the archive. | defer — Story 2.5, which owns the insights refresh and that page's copy. |
| ECH-1 | `LeagueChip` renders a blank plate if `series.league` is undefined/null through the unvalidated `asSeries` cast. | false | Unreachable: `00016:456-458` leaves the column `NOT NULL DEFAULT 'NBA'` with a three-value CHECK, so no row can carry null; and the spec's Never list explicitly forbids adding validation to those casts, so the guard the finding asks for is excluded by intent. Measured on production: 178 rows, every chip populated, 0 console messages. | rejected |
| ECH-2 | One missing `league` puts `undefined` in the `leagues` Set, and a Radix `SelectItem` with an undefined value throws, failing the whole page. | false | Same `NOT NULL` + CHECK proof — the Set's source cannot contain null/undefined. Same "no validation on the casts" exclusion. | rejected |
| ECH-3 | A client that meets a pre-`00016` database gets an enumerated-select error and PredictPage's series read fails wholesale. | false | Ordering is already settled and executed: `00016` was applied 2026-10-02 before this client ships, which is Story 2.1's/hard-ordering AC's own point. A rollback of an applied migration is not a state any client-side guard could serve, and `if (error) throw error` at `PredictPage.tsx:155` already routes it to the failure panel rather than a blank page. | rejected |
| ECH-4 | The new "Filter League" label keeps `text-muted-foreground` — 10px meaningful text at ~3.95:1, failing WCAG 1.4.3 on the surface the story promises AA for. | medium | Confirmed at `:165` pre-patch, and it is text this story added, so the AC's own AA leg was unmet. | patch — token now `text-on-muted`; measured `rgb(89,89,89)` post-patch. Cost: it reads visibly darker than its two sibling labels (BH-3), which is the one owner-facing call in this batch. |
| VG-1 | `HistoricalPage`'s `league` read is unpinned — the mocked client returns fixtures whatever the projection says, so dropping the column keeps all 16 tests and the whole gate green. | medium | Confirmed by the reviewer's demonstration and by the file's own history: the Story 2.2 header records `.eq('status', …)` blanking the archive with the gate green, and `docs/CURRENT_DATA_MODEL.md:142` now says the projection tests "are what watch that wire" while only PredictPage's was watched. | patch — `reads \`league\` on the archive projection, not only on the predict one` asserts `db.projection` still carries a wildcard or the named column. |
| VG-2 | The AA token is an Always rule that no verification observes; flipping `text-on-muted` → `text-muted-foreground` passes every gate step, and Story 5.2's retune makes that drift plausible in this very file. | medium | Confirmed: searched `src` tests for `text-on-muted`/`classList` — no match; the chip tests read `textContent` only, and `npm run gate` has no visual leg. | patch — `puts every piece of text it adds on the AA-safe token` pins chip, legend and label to `text-on-muted` and against `text-muted-foreground`. |
| VG-o1 | The live region entered `div.space-y-8` as its **first** child, so Tailwind's `space-y-8 > :not([hidden]) ~ :not([hidden])` — the exact mechanism this story's layout note documents — gave the table wrapper a `margin-top: 2rem` it never had, an unobserved layout shift on a ratified surface. | medium | Confirmed by measurement, not inference: pre-patch computed `marginTop` on the wrapper read 32px against 0px before this story. `sr-only` does not set `hidden`, so the region counted. | patch — region relocated to the last child with the measured mechanism in the comment; re-measured `tableWrapperMarginTop: "0px"`, plus the structural pin. |
| VG-o2 | `applyLeagueFilter` captures `league: 'all'` when the user re-selects "All leagues", and captures even when the value is unchanged — noted for FR-25 rather than as a gap. | low | Accurate, and by design: the AC requires capture "from the same call site the year filter uses", and `:150` behaves identically, so mirroring it is the spec-faithful outcome, not drift. | grouped with BH-6 → defer (same root cause: the event contract covers application only). |

**Net effect of this pass on the tree:** four source patches (ECH-4 label token, VG-o1 live-region
relocation, VG-1 projection pin, VG-2 AA-token pin) plus BH-5's no-scroll pin, BH-2/BH-4/BH-9's record
corrections, and BH-1's bookkeeping. Five findings rejected on refutation (BH-8, BH-10a, ECH-1, ECH-2,
ECH-3), four deferred with named owners (BH-3, BH-6+VG-o2, BH-7, BH-10b). No `intent_gap` and no
`bad_spec` entry survived verification, so there is no loopback: `review_loop_iteration` stays 0 and
the code is not re-derived.