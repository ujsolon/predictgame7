---
title: 'Conditional league chip and gloss popover on the archive surface'
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'bc21f66a6e7bc44fac5779e9913cce8ad09c9999'
context:
  - '_bmad-output/planning-artifacts/epics.md'
  - '_bmad-output/implementation-artifacts/spec-2-9-league-chip-and-filter-on-the-archive-surface.md'
  - 'docs/CURRENT_DATA_MODEL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.9 shipped and the owner reviewed it in a local preview on 2026-10-02. The data truth holds; the surface economy does not. An `NBA` chip on each of the 159 NBA rows is "clutter for modern day nba fans", and the three-value league `Select` 2.9 added is a filter nobody reaches for — "remove it, just the chips would do", with the archive's filters back to what FR-10 actually promises: year and team.

**Approach:** Keep every rule 2.9 pinned about the *data* (stored `league` verbatim, `BAA` never folded into `NBA`, client-side over an already-fetched archive, the read path closed) and change only what the surface shows and when: the chip marks only the 19 rows that need explaining, and the gloss moves behind one click. No league control at all — the chip is the marker and the popover is the explanation.

## Decisions (owner, 2026-10-02 — renegotiates Story 2.9's D1/D2/D3)

- **D1' — chip is conditional.** Render the chip only when `league !== 'NBA'` (19 of 178 rows: the one `BAA` row and the 18 `ABA` rows). An `NBA` row carries no chip in the row or in the expanded record. The verbatim rule is unchanged for the chips that do render, and an unrecognized future league value renders its chip verbatim rather than being silenced — the fail-visible direction, because a missing chip hides a fact the archive exists to state.
- **D2' — the gloss keeps its wording and changes its carrier.** The sentence ratified in Story 2.9 D2 moves, verbatim, into a `Popover` opened by its own trigger button in the filter row. It is **not** a tooltip: `@radix-ui/react-tooltip`'s own trigger returns on `pointerType === 'touch'` (`node_modules/@radix-ui/react-tooltip/dist/index.mjs:185`), so a tooltip puts the sentence out of reach on the mobile half of NFR-U1 — the same reason `EXPERIENCE.md` Interaction Primitives bans hover-only affordances. A click/Enter/Space trigger is reachable by pointer, keyboard and screen reader alike.
- **D3' — no league control.** The `Select` 2.9 added is deleted, not replaced. This decision was revised twice on 2026-10-02 and the record stays: 2.9's per-league option list → a proposed `[NBA + BAA | ALL]` scope toggle (built, gate-green, CDP-measured) → **removed** on the owner's call, "revert to the old FR-10 where filters are just on year and team". Consequences accepted with it: the archive opens on all 178 series, so the announced count reads 178 while Story 2.5's insight denominators read 160, and the chip plus the gloss sentence — not a control — is what reconciles the two. `1972` returns to the year list (it exists in this archive only as an `ABA` series, which is honest: the row is listed and carries its chip).
- **D4' — analytics shrink, and no name changes.** `historical_filter_applied` keeps its name and its `filter_type` vocabulary for the filters that remain (`year`, `team_search`). With no league control, **nothing emits `filter_type: 'league'` any more** — 2.9 introduced that value and this story retires it, which is a payload change, not an addendum §A.1 event-name change (the ten names stand). The gloss trigger emits nothing: an explanation is not a filter application, and inventing an event here is blocked by §A.1, not by oversight.
- **D5' — the search change is a separate story (owner's rule, 2026-10-02).** The owner asked whether adding `teams.abbreviation` to the team search is really a 4-line change. Measured answer: the predicate is 4 lines and the field is already fetched (`missingAbbr: 0` over 178 rows), **but** the abbreviation the row *displays* is `getTeamAbbreviation(full_name)` — a name-derived initialism — and it differs from the stored `teams.abbreviation` on **39 of 178 rows** (`Seattle SuperSonics`: stored `SEA`, shown `SS`; `Philadelphia Warriors`: `PHW` vs `PW`; 20 distinct teams, all pre-1976). So a stored-field OR would find rows by a code the fan never sees, and the visible codes stay unsearchable; the fix has to settle the display too, and `getTeamAbbreviation` is called **16 times on 14 more lines of `PredictPage.tsx`** (`:423,424,430×2,492×2,1175,1180,1191,1211,1212,1275,1280,1291,1311,1312`; the file's grep line count is 15 because one of them is the import). Out of scope here; lands as **Story 2.11**.
- **D6' — the stale-claim sweep is this story's, not a course correction.** The renegotiation changes no requirement: FR-10 (`prd.md:158-161`) promises team search and a **year** filter only, FR-11 (`:163-167`) the expanded record. The chip, the league filter and the gloss were all invented by `sprint-change-proposal-2026-10-01.md` Call 3, so no correct-course pass is warranted — but ten live artifacts outside Story 2.9's own block describe the deleted control or the always-visible legend, and each is corrected in this commit (listed in the Code Map). Dated audit trail (`sprint-change-proposal-2026-10-01.md`, `spec-2-8`'s frozen text) is left as written; `spec-2-9`'s frozen block gains a revision pointer rather than a rewrite. **Not** in that sweep, because "league filter" there is a different thing — the backend population rule `league IN ('NBA','BAA')` — and stays untouched: `epics.md:382` (Story 2.5's AC), `ARCHITECTURE-SPINE.md:89`, `epic-2-context.md:44`, `sprint-status.yaml:253-254`, `spec-2-5:91,98`.
- **D7' — 2.9's tracker row is corrected.** `sprint-status.yaml` still reads `2-9-…: review`; commit `ad184e5` ("Mark Story 2.9 done") flipped only the spec frontmatter. This story's commit sets it to `done` and registers 2.10 and 2.11.

## Boundaries & Constraints

**Always:**
- Chip text is the stored `series.league` verbatim where the chip renders; no year-derived value, no `BAA`→`NBA` merge.
- The gloss trigger is ≥44 px tall (`EXPERIENCE.md` Interaction Primitives) and carries its own visible text as its accessible name — no icon-only button.
- The archive fetches and lists all 178 series; every row stays openable and keeps its prerender page (AD-7).
- FR-10's two filters keep their behavior exactly as they had it before 2.9: year and team search intersect, changing either resets `visibleCount` to 10, and the existing reset button clears both.
- The changed result set is re-announced through the existing polite live region; the live region stays the last child of the list section (the 2.9 review-pass placement rule).
- New small text on `text-on-muted` (#595959), not `muted-foreground` (#808080), until Story 5.2 retunes the token.
- No automatic scroll on any of these interactions. Tests run per-file jsdom and assert **no computed accessible name** (AGENTS.md accname rule) — `textContent` or literal attributes instead.

**Never:**
- No migration, no `db push`, no `supabase/` change, no deploy, no production data touched.
- No route list / page count / prerender change; the 18 `ABA` rows stay in the archive, in the fetch, and in the SEO set.
- No change to the game tiles or to home/away derivation (`HistoricalPage.tsx:355-372`; derivation `:137-138` and `:357-359`); no new empty state; no new PostHog event name.
- No team-search behavior change in this story (D5'), and no `getTeamAbbreviation` edit — that is Story 2.11's subject.
- No re-litigating Story 2.5's population rule, `00016`, or `CURRENT_DATA_MODEL.md`'s home-court boundary — D6' names the decoys precisely so they stay put.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| NBA row | `league: 'NBA'` | no chip in the row, none in the expanded record; table stays three columns | n/a |
| BAA row | `league: 'BAA'` (the 1948 row) | chip reads `BAA` verbatim in row and sheet, `NBA` appears nowhere in the row | n/a |
| ABA row | any of the 18 | listed by default with an `ABA` chip; counted in the announced total | n/a |
| Unknown league value | `league` outside the three | chip renders verbatim — a row nobody recognizes shows what it says | fail visible |
| Default load | no interaction | all series listed, year list covers the whole archive (1972 included), no reset button | n/a |
| Year × team search | both set, one excludes the other's rows | intersection; empty result reuses "No series found matching your filters." | n/a |
| Gloss trigger | click / Enter / Space | popover carries the 2.9 D2 sentence verbatim; Escape closes it; no row and no count changes | n/a |
| Any of these interactions | — | no page scroll; `visibleCount` back to 10 on a filter change only | n/a |
| Analytics | year and team search used | `historical_filter_applied` with `year` / `team_search` only; no `league` value emitted from anywhere | n/a |

</frozen-after-approval>

## Code Map

- `src/pages/HistoricalPage.tsx:33-40` — `LeagueChip`, `league === 'NBA' → null`; the definition comment and both call-site comments are re-titled to this story's D1'. Call sites: row `:272`, expanded record `:344`.
- `:42-66` — `LeagueGloss`: the Popover trigger + content carrying 2.9 D2's sentence; the content gained `aria-label="What the league chips mean"` at `:61` during verification, because Chrome's tree reported the panel unnamed. Rendered at `:193`, after the team search and before the reset button (`:194`'s condition loses its league clause).
- `:105-108` `years` — whole-archive list (the scope-derived version died with the toggle). `:110-121` `filteredSeries` — year AND team, no league predicate. `:127-131` `resetFilters`. `:163`/`:179` are the two standing labels the Story 5.2 AA entry names.
- Deleted from 2.9's shape: the `leagueFilter` state, the `leagues` memo, `applyLeagueFilter`, the league `Select` block, and the always-visible legend `<p>`.
- `src/components/ui/popover.tsx` — `Popover`/`PopoverTrigger`/`PopoverContent` (Radix, `^1.1.15` already a dependency; `bg-popover`/`text-popover-foreground`). `src/components/ui/toggle-group.tsx` is not imported here and never was at `bc21f66` — it belonged to the discarded intermediate toggle, which exists only as an uncommitted build, not in this diff.
- `src/types/types.ts` + `src/pages/PredictPage.tsx` `SERIES_SELECT` — 2.9's read-path close (E9) **stays**: the chip still reads `series.league`, so `league: string` remains required and named on both read paths.
- `src/lib/nba-utils.ts:1-37,39-50` — `TEAM_ABBREVIATIONS` + `getTeamAbbreviation`: the display/search divergence D5' measures. **Not touched here.**
- `src/pages/__tests__/historical-page-archive.test.tsx` — **24 tests** in four describes: Story 2.2's archive read (3, untouched), conditional chip (5, incl. the projection pin and the three-column `thead` pin), **no league control** (7: default lists all three leagues, exactly one combobox, no `league` capture ever — pinned against the exact three-call capture array — FR-10 intersection + existing empty state, reset, counter reset on year, counter reset on team search), gloss popover (9, incl. the literal `aria-label` pin, Escape closed from inside the panel, and the live-region placement pin inherited from 2.9). No computed-name assertion anywhere.
- **D6' sweep (stale claims outside Story 2.9's own block):** `epics.md:157` and `:158` (Epic 2 narrative + NFR-A1 attribution), `epics.md:412` (Story 2.7's drill), `epics.md:444-463` (2.9's block gains the renegotiation pointer) and `:485-500` (Story 2.11), `epic-2-context.md:17` and the tail of `:42`, `docs/CURRENT_DATA_MODEL.md:142`, `DESIGN.md:157`, `EXPERIENCE.md:16,96`, `spec-2-5-insights-cache-refresh.md:32,83`, `deferred-work.md:325,335,363,375,381` plus the new Story 2.11 section at its tail.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:83` — `2-9-…: review` → `done`, plus 2.10/2.11 (D7').

## Tasks & Acceptance

**Execution:**
- [x] `src/pages/HistoricalPage.tsx` — conditional chip at both sites; `Popover` gloss trigger carrying the D2 sentence; league `Select`, `leagueFilter`, `leagues` memo and the always-visible legend removed; reset condition and `filteredSeries` back to year + team.
- [x] `src/pages/__tests__/historical-page-archive.test.tsx` — one case per I/O row; 2.9's filter cases rewritten to the deletion (including the "no `league` capture ever" pin); no computed-name assertion.
- [x] `epics.md` (Story 2.10 + 2.11) + `sprint-status.yaml` (2-9 done, 2-10 review, 2-11 backlog) + `deferred-work.md` (the search divergence routed to 2.11 with its measurement).
- [x] The D6' sweep: `CURRENT_DATA_MODEL.md` + `DESIGN.md` + `EXPERIENCE.md` + `epic-2-context.md` + `spec-2-5` + `spec-2-9`'s revision pointer, decoys left alone.
- [x] `npm run gate` re-run after the verification and review patches — exit 0, recorded in the Review Pass section — then commit staging these files only. No push.

**Acceptance Criteria:**
- Given an archive row whose `league` is `NBA`, when the row or its expanded record renders, then no league chip renders anywhere in it, and the table stays three columns.
- Given `league` is `BAA` or `ABA`, when it renders, then the chip text is that stored value verbatim.
- Given the page loads with no user interaction, then every fetched series is in scope — the ABA rows listed, `1972` offered in the year list — and the filter row offers exactly one dropdown.
- Given any interaction on this surface, when the capture log is read, then no `historical_filter_applied` carries `filter_type: 'league'`, and no event name outside addendum §A.1's ten appears.
- Given the gloss trigger, when activated by click or keyboard, then the popover text equals Story 2.9 D2's sentence character for character, no row count changes, and Escape closes it; given a touch pointer, it is still reachable (no hover requirement anywhere on the surface).
- Given `league` is required on `Series`, when `npm run typecheck` runs, then it passes with both test fixtures carrying the field.
- Given the story is done, when `git status` is read, then nothing under `supabase/` changed and no push was made.

## Verification Log

_(2026-10-02 build pass. Everything below was measured on this commit's own artifacts — the Vitest run against the shipped page, and a throwaway CDP harness driving headless Chrome over `vite preview` of the real bundle against the real 178-series production archive. The harness and its JSON were deleted before this commit landed (see the Review Pass section — they survived the first pass, which the log then falsely claimed otherwise); the screenshots went to the OS temp dir, not the repo.)_

**Automated gate — `npm run gate`, exit 0.** Biome: "Checked 122 files … No fixes applied". `tsc -b`: clean. Vitest: "Test Files 20 passed (20)", including `src/pages/__tests__/historical-page-archive.test.tsx` at **22 tests** — that run's state; the review pass below added two cases, and its re-run is recorded at the foot of the Review Pass section. `vite build`: succeeded and "Build output uses the /predictgame7/ asset prefix." (One typecheck failure came first and was fixed, not worked around: `resetButton()` narrowed `Element | null` into a `| undefined` signature — the helper now returns `?? undefined`. Its selector `svg.lucide-funnel-x` was checked against `node_modules/lucide-react/dist/esm/icons/funnel-x.js` (`createLucideIcon("funnel-x")`) rather than guessed, because an absent-element pass on a wrong selector would have made the "no reset button by default" case vacuous.)

**Surface, as Chrome rendered it (desktop 1440×900 and mobile 390×844, both passes identical on every assertion):**

| Measured | Desktop | Mobile |
|---|---|---|
| Default live-region text | `Showing 10 of 178 series.` | same |
| `[role="combobox"]` count / value | **1** / `All Years` | same |
| `[role="radio"]` / `[role="radiogroup"]` | **0 / 0** — the toggle is gone | same |
| Filter-row `<label>` elements naming a league | **none** | same |
| Chips among the default 10 rows | **0** (all ten are `NBA` rows) | same |
| Gloss trigger rect | 104×44 px at (1239, 257) | 104×44 px at (245, 465) |
| Trigger color / size | `rgb(89, 89, 89)` 12px (`text-on-muted`) | same |
| Horizontal overflow (`scrollWidth − innerWidth`) | 0 | 0 |
| Popover panel after activation | `role="dialog"`, 320×148 px, `rgb(38,38,38)` 14px, text = D2's sentence verbatim | same, at x=70 (70+320 = 390, fits) |
| Rows/count with the popover open | 10 / `Showing 10 of 178 series.` — unchanged | same |
| `scrollY` across activation | 0 → 0 | 0 → 0 |
| After Escape | panel removed, `document.activeElement` back on the trigger | same |
| Search `Colonels` | 6 rows, **6 `ABA` chips**, each `rgb(89,89,89)` on `rgb(245,245,245)` | same |

**Keyboard activation, measured in Chrome (the leg the first draft of this log lacked):** on both passes Tab landed the trigger — `document.activeElement` read `BUTTON:Leagues` — and the panel opened from the keyboard alone. A real Space (`Input.dispatchKeyEvent`, key `" "`, code `"Space"`) left `document.activeElement` on `DIV:BAA is the leagu…`, so focus moved into the panel, and Escape returned it to the trigger. Enter took a second attempt with a different synthesis, and the retry belongs in the record because the first reading was a harness artifact, not a defect: `type: "rawKeyDown"` produced `open: false` with the click counter still at 0 — Chrome never fired the click — while `type: "keyDown"` carrying `text: "\r"` (so the `char` event follows and Chrome synthesizes the button's activation) produced **clicks: 1**, `data-state="open"`, focus in the panel. The AC's "activated by click or keyboard" is therefore pinned by measurement rather than by a jsdom case: `fireEvent.keyDown(el, { key: 'Enter' })` does not synthesize a button activation in jsdom, so such a case would fail for the wrong reason and invite someone to weaken it, and `@testing-library/user-event` is not a dependency here — adding one for a single keyboard case is outside this story.

**Touch reachability (D2's whole reason for the carrier):** on the mobile pass the panel was opened by `Input.dispatchTouchEvent` (`touchStart`/`touchEnd`) on the trigger's centre, not by a mouse event, and it opened — `data-state="open"`, `aria-expanded="true"`, panel present. A `Tooltip` on the same pointer path returns early (`@radix-ui/react-tooltip/dist/index.mjs:185`).

**Chrome's computed accessible names (the accname jsdom cannot give, per AGENTS.md):** `button "LEAGUES"`, `textbox "Search by team name..."`, `button "Load More History"`, `combobox ""`. Two things came out of that list.

- **Patched in this story:** the first probe reported `dialog ""` — the panel Radix gives no name of its own, so a screen reader announced an unnamed dialog on a surface this story introduced. `PopoverContent` now carries `aria-label="What the league chips mean"` at `HistoricalPage.tsx:61`, the why in the comment above it (`:56-60`); the re-run reports `dialog "What the league chips mean"` on both passes. A jsdom case pins the literal attribute (`historical-page-archive.test.tsx`, "names the panel it opens, by literal attribute") — the attribute, not the computed name, which the accname rule forbids asserting.
- **Not this story's, and re-confirmed for Story 5.2:** `combobox ""` is the unnamed year `Select` the deferred-work AA entry already carries — `HistoricalPage.tsx:163`'s `<label>` still has no `htmlFor`. Measured again on 2.10's markup, so the entry's "surviving half" sentence is now 2.10's own measurement, not 2.9's. The two standing labels are `rgb(128,128,128)` at 10px and the round sub-labels `rgba(128,128,128,0.5)`, both unchanged, while everything this story added is `rgb(89,89,89)` — the mixed-row finding stands with the league control deleted.

**Chip contrast, computed from the measured pair** (#595959 on #F5F5F5): 6.43:1 — passes AA for text at any size, and matches the ~6.4:1 the code comment and `DESIGN.md` claim.

**FR-10 revert, checked against the requirement rather than the diff:** the filter row is now year `Select` + team search + (conditionally) the reset button, which is what `prd.md:158-161` promises. The archive opens on all 178 series, so `/historical` says 178 while Story 2.5's denominators say 160; the 19 chips and the gloss sentence are what reconcile them, as D3' records.

**Boundaries held:** `git status` shows no change under `supabase/`, `docs/` schema files except `CURRENT_DATA_MODEL.md`'s prose line, no migration, no deploy, no push. `HistoricalPage.tsx:355-372`'s game tiles and the `:137-138` / `:357-359` home-away derivation untouched; the route list and prerender set unchanged.

## Review Pass (step-04, 2026-10-02)

Two reviewers, both run from this build session, so both are same-model and neither is independent —
the owner's standing rule is that the real review happens when `bmad-code-review` is re-run in a fresh
context on their own model. Reviewer ADV read the spec, the page and the test file; reviewer REV re-ran
`npm run gate` themselves before filing, then audited the record's claims. 20 rows, one per finding,
before deduplication; the severities are the reviewers' own and were disregarded when triaging.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| ADV-1 | **BLOCKER — the projection pin is vacuous.** `db.projection` was matched with `/(\*\|\bleague\b)/`, but every plausible projection contains nested `(*)` selects, so an enumerated rewrite that dropped `league` still passed and the chip's data wire had no pin. | true, and the false claim is the worse half | Reproduced: the regex matched the shipped string at `HistoricalPage.tsx:85` on its nested wildcards alone. Replaced with a depth-aware split that keeps only top-level columns, so `*` means the whole-row wildcard and nothing else. Mutation-proven: swapping in an enumerated select without `league` turns the case red, and `HistoricalPage.tsx` was restored byte-identically afterwards (`cmp`). | patch |
| ADV-2 | Keyboard activation is an AC and an I/O row ("click / Enter / Space") but only `fireEvent.click` is exercised, so a keyboard regression stays green. | true of the suite | The Chrome leg is now in the Verification Log: Tab focuses the trigger, Space opens and moves focus into the panel, Escape returns it, and Enter opens when dispatched with its `char` event (click counter 1, `data-state="open"`). A jsdom keyboard case was deliberately **not** added — `fireEvent.keyDown(…, { key: 'Enter' })` does not synthesize a button activation, so it would fail on jsdom's plumbing rather than the app's and invite someone to weaken it. `@testing-library/user-event` is not a dependency here, and adding one for a single case is out of scope. | patch — by measurement |
| ADV-3 | The team-search half of the `visibleCount` reset is untested; deleting `setVisibleCount(10)` at `HistoricalPage.tsx:186` passes the suite. | true | New case pages out to 20 over 15 matching rows, types a search, and pins `Showing 10 of 15 series.`. Mutation-proven: removing the call yields `Showing 15 of 15` and the case goes red. | patch |
| ADV-4 | "No page scroll" is pinned only around the gloss click, and the module-scope `scrollIntoView` stub silently absorbs scroll during the `chooseYear` tests. | true | New case `moves the page for no filter interaction either` drives year `Select` → search → reset → row-click and pins `window.scrollTo` / `window.scroll` never called. It asserts neither window method on `scrollIntoView` and says why in the test: opening the year `Select` makes Radix scroll its own highlighted option inside the popup, which is the popup moving, not the page. The gloss case still pins all three, because nothing in that interaction legitimately scrolls. | patch |
| ADV-5 | No case reads the capture log after a row expansion, so the AC "no event name outside §A.1's ten" is only partly covered — `historical_series_expanded` fires at `HistoricalPage.tsx:231` in the very tests that click rows. | true | The no-league-capture case now asserts the exact three-call array: year filter, team search, and `historical_series_expanded` with its full payload (`series_id`, `series_year`, `series_round`, both teams, `winner`). An added event of any name fails it. | patch |
| ADV-6 | "Table stays three columns" (AC 1) has no assertion. | true | `expect(document.querySelectorAll('thead th')).toHaveLength(3)` in the no-chip case. | patch |
| ADV-7 | `getByText('BAA').textContent).toBe('BAA')` is tautological — exact-match `getByText` already guarantees it. | true and harmless | Kept. The lookup is the mechanism; the follow-on `.textContent` is what states D1's verbatim rule in the assertion a later reader edits, and the mapping half is carried by the `queryByText('NBA')` sibling. | logged, no change |
| ADV-8 | The Escape case fires on the trigger, which only passes because Radix's listener is document-level, and never pins focus return. | true | Rewritten as `closes the gloss on Escape from inside the panel`: it asserts `document.activeElement` is the panel before dispatching, so the case sits where real focus is. Focus return after Escape is measured over CDP on both passes rather than in jsdom. | patch |
| REV-1 | The Verification Log says the CDP harness "was deleted after the run" while `.scratch-cdp-210.mjs`, `.scratch-cdp-210.json` and `.scratch-cdp-210.err` were still on disk — untracked and **not** gitignored, so a broad `git add` or the stray-path publish hazard in AGENTS.md would have shipped them. | true, and the false claim is the finding | Deletion is now the last step before this commit, and the log says when it happened instead of claiming it already had. | patch |
| REV-2 | `sprint-status.yaml`'s `last_updated` moved backwards (18:05 → 13:44) in the same edit that registered 2.10/2.11. | true as filed, for a different reason | 18:05 was the impossible value — later than any clock on that day's commits — so it had been written forward rather than recorded. Now the real time, with a two-line comment naming the correction so the backwards move reads as deliberate. | patch |
| REV-3 | Status drift: frontmatter said `in-progress` and a task line prescribed `2-10 in-progress` while the yaml registered `review`; the last Execution box was still `[ ]` under a log claiming gate exit 0. | true | Frontmatter → `review`, `review_loop_iteration` → 1, task text → `2-10 review`. The final Execution box was closed only after the re-run actually went green, and its text now says which run it refers to. | patch |
| REV-4 | `epics.md:446`'s supersession pointers cite `:454-457` while the ACs they name sit at `:456-459` — the pointer block shifted them. | true | Re-pointed against the file as it stands: `:456` chip, `:457` gloss, `:458` filter, `:459` event. | patch |
| REV-5 | Story 2.11's block cites `HistoricalPage.tsx:212-213` for the two calls that print the displayed code. | true | `:217-218`, corrected in `epics.md` and in the new `deferred-work.md` entry, re-verified by grep rather than by re-counting from memory. | patch |
| REV-6 | `sprint-status.yaml:92` says 15 call sites on PredictPage while the spec and deferred-work say 16. | true | `grep -n getTeamAbbreviation src/pages/PredictPage.tsx` → 16 calls on 14 lines plus the import line. The yaml now carries 16 with the line count. | patch |
| REV-7 | `deferred-work.md:379` still points the year filter at `HistoricalPage.tsx:150`, which is now `visibleSeries`. | true | `:164`. The sibling entry at `:375` had already been renumbered to `:163`/`:179`, so the pair is consistent again. | patch |
| REV-8 | The Code Map's test arithmetic is wrong in shape and count: "22 tests in three describes (5/6/7)" — 5+6+7=19, there are four describes, and the gloss describe holds more cases than stated. | true | Rewritten as 24 across four describes (3/5/7/9), enumerated from the file's own `describe`/`it` lines. The Verification Log's earlier "22 tests" stays as that run's dated measurement with the delta named, because it is what the gate printed at that moment. | patch |
| REV-9 | Boundary evidence cites `HistoricalPage.tsx:270-286` as the game tiles when that range is the row matchup cells, and cites `:56-60` for an attribute that is at `:61`. | true | Both ranges re-pointed — `:355-372` tiles, `:137-138` and `:357-359` derivation, `:61` attribute — in the Never list and in the log. "Untouched by this diff" stayed true; only the pointers were wrong. | patch |
| REV-10 | The Code Map claims `toggle-group.tsx` "is no longer imported here", but `bc21f66` never imported it — the sentence describes the discarded intermediate build. | true | Reworded to what is true of the diff: not imported, and never was at baseline; the toggle exists only as an uncommitted build. | patch |
| REV-11 | Both chip call-site comments still read as 2.9's unconditional rule; only the definition comment had been re-titled. | true | Re-titled to "Story 2.9 (D1), re-cut by 2.10 (D1')" at `:266-269` and `:339-341`. | patch |
| REV-12 | Categories 4 and the decoys are clean: no `supabase/`, migration, route/prerender, event-name or game-tile change; all five named decoys intact; no live artifact still claims a league filter or an always-visible legend exists. | confirmation | Independent re-verification of D6' by a reviewer who did not write it, including `git show HEAD:src/pages/HistoricalPage.tsx` to byte-check the reset condition and predicate against `7bef587^`. | no action |

**Net effect on the tree:** one source patch from the verification leg (the `dialog` `aria-label`, not a
review finding), six test patches (ADV-1, -3, -4, -5, -6, -8), eleven record corrections (ADV-2's
measurement leg and REV-1..REV-11), and one finding logged with no change (ADV-7). No `intent_gap` and
no `bad_spec` entry survived, so `review_loop_iteration` stays at 1 and the code is not re-derived.

**Self-caught after the work commit (not reviewer findings):** three of this spec's own pointers had
drifted because this story's edits added lines to the very files they name — D6' now says
`epic-2-context.md:44` (was `:48`) and `sprint-status.yaml:253-254` (was `:229`), and the Code Map's
tracker row is `sprint-status.yaml:83` (was `:78`). The fourth, REV-11's call-site comment range, was
wrong in my own triage text and became `:266-269` / `:339-341`. `ARCHITECTURE-SPINE.md:89` and
`epics.md:382` were checked and are correct. Each was re-derived by reading the pointed-at line rather
than re-counting from memory — which is the mistake this story keeps documenting about other people's
artifacts, so it is recorded here about its own.

**Re-run after the review pass — `npm run gate`, exit 0, captured from the command itself, not from a pipe:** Vitest "Test Files 20 passed (20)", "Tests 345 passed (345)" — the archive file at 24, two more than the run above — Biome clean, `tsc -b` clean, and the build still reports "Build output uses the /predictgame7/ asset prefix."

**Process note worth carrying:** the first "gate exit 0" recorded here was wrong, and REV's own green
run is what exposed it — `npm run gate` piped to `tail` reported tail's exit status, so the command looked
green while a real `error TS2322` sat in the output. Since then the gate's own output goes to a file via
`>` and `echo $?` reads the exit code of `npm run gate` itself, with nothing downstream of it in the
pipeline. The underlying type error was fixed; the reporting was tightened. Neither was relaxed to go green.
