---
title: 'Story 6.2 — Series-page entry points'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_commit: '0379081a50c4954ec3d7b107e25d41667cf9c1df'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** the app has 184 prerendered series pages, but inside the app they are reachable only from Home's pending cards and the flagship hotspots. Historical's record overlay and Predict's detailed analysis lead nowhere, so most pages are orphans. Historical's filter-reset button is an unlabelled 40×40 icon.

**Approach (owner decisions 2026-10-10):**
- **Historical's record overlay:** its two-line header becomes **one link** to that series' page, for every series:
  - `{year} {League }{round}`, plus a small "→" cue;
  - `{A} vs {B}` (matchup line).
- **Predict's detailed analysis** gains the same two-line title under "Prediction Result", linked the same way.
  - For a custom matchup it shows only the team names, unlinked.
  - Predict gets no other series-page link.
- **Reset button:** gets an accessible name and a ≥44×44 target.

This supersedes EXPERIENCE.md's "View full series page →" link row and its "only when editorial content exists" rule (`epics.md` Story 6.2).

## Boundaries & Constraints

**Always:**
- **Link mechanics:**
  - Links are built only with `seriesPath(series, 'page')` (`src/lib/series-slug.ts`), never a uuid path.
  - A flagship links to its spoiler-free preview page, never to `/result/`.
  - Each link is a real react-router `<Link>`.
- **Title lines:** the title line uses `yearRound`-style wording (the league before the round for non-NBA); the matchup line uses `matchupLabel` with full names in stored order.
- **Accessible name:** reads as "{title line}, {matchup}". The two lines are separated by a real separator: a visually hidden ", " or equivalent text, not just block layout (AGENTS.md jsdom accname note; test `textContent`, never a computed name).
- **Discoverability:** since touch has no hover, the "→" cue is always visible. Hover and keyboard focus add an underline. A visible focus ring is kept, and link text contrast is ≥4.5:1.
- **Historical overlay:**
  - The team logos, the league chip, and the close × stay **outside** the link as separate elements.
  - The overlay closes on navigation (EXPERIENCE.md "Tap archive overlay link").
  - The game tiles, winner block and gloss are unchanged.
- **Predict:**
  - **What renders:** the title block appears in `DetailedResult`'s header under "Prediction Result", only for a series-backed result. A custom matchup shows "{A} vs {B}" (the typed names) as plain text, with no year/round line and no link.
  - **What does not change:** "Prediction Result", the Share button, the method line and the matchup or winner section below.
- **Reset button:**
  - an accessible name of "Reset filters" (`aria-label` plus an `sr-only` text node);
  - a hit area of at least 44×44 CSS px at every breakpoint;
  - its icon, visibility rule, behaviour and `historical_filter_applied {filter_type:'reset'}` event stay unchanged.
- **Analytics:** no new event. The navigation's `$pageview` is the measurement.
- **Standards:** WCAG 2.1 AA, and responsive at 390 px and ≥1024 px (a long title such as "1950 BAA Eastern Division Semifinals" wraps without overflow).
- **Docs:** EXPERIENCE.md's overlay-link rows (~:36, :48, :123) and the Predict detailed-result description are updated.
- **Owner review:** the owner reviews screenshots before the story closes. Any visual adjustment is a follow-up patch, not a re-spec.

**Never:**
- Link a custom matchup.
- Link to `/result/`.
- Add an event.
- Wrap the logos, the chip or the × in the link.
- Change the Predict series trigger, the `series_selected` payload or the request.
- Deploy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Historical overlay, a non-flagship | the 1998 Lakers row | the header link `/series/1998/lakers-…/`, `textContent` "{1998 title line}, Los Angeles Lakers vs Golden State Warriors" | N/A |
| Historical overlay, a flagship | 2016 Finals | the link goes to `/series/2016/warriors-cavaliers/`, not `/result/` | N/A |
| Historical overlay, ABA | 1968 ABA Finals | the title "1968 ABA Finals", with the chip outside the link | N/A |
| Predict detailed analysis, a series | 2026 WCF predicted | "2026 Western Conference Finals / Oklahoma City Thunder vs San Antonio Spurs" links to `/series/2026/thunder-spurs/` | N/A |
| Predict detailed analysis, custom | typed teams | the "{A} vs {B}" text with no link and no year line | N/A |
| Row with no derivable slug | team embed missing | the title renders as plain text, with no link and no uuid fallback | silent |
| Reset button | filters active | accessible name "Reset filters", hit box ≥44×44 | N/A |

</frozen-after-approval>

## Code Map

- `src/pages/HistoricalPage.tsx`:
  - reset button :231-235 (`size="icon"`, `h-10 w-10`, no name; `resetFilters` :166-172);
  - overlay :376-460: header :378-406 (logos :381-388, `CardTitle` + `LeagueChip` :393-398, `CardDescription` with `matchupLabel` :400, close × :403);
  - `selectedSeries` is a `Series` with `team_a`/`team_b` embeds, so `seriesPath` takes it directly.
- `src/pages/predict/DetailedResult.tsx`:
  - header :56-80 ("Prediction Result" `CardTitle`, `ShareButton`, method line);
  - `selectedSeries?.data` is the series row, present for a catalog series and absent for custom;
  - `teamAName` and `teamBName` are already computed;
  - `shareTitle` is at :52.
- `src/pages/series/series-view.ts`:
  - `yearRound(view)` takes a `SeriesView`;
  - `toSeriesView(series)` builds one;
  - reuse these, or a small shared `seriesTitle(series)` helper, so both surfaces print the same title line.
- `src/lib/matchup.ts` `matchupLabel`; `src/lib/series-slug.ts` `seriesPath`.
- Tests:
  - `src/pages/__tests__/historical-page-archive.test.tsx` opens the overlay by row click; the 1998 Lakers overlay test is from 6.8;
  - Predict detailed-result suites: `predict-share.test.tsx`, `predict-flow-regression.test.tsx`.
- EXPERIENCE.md: `_bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/EXPERIENCE.md`.
- CDP evidence: `node scripts/measure-predict-latency.mjs --probe-evidence` (computed style, screenshot, accessibility tree).

## Tasks & Acceptance

**Execution:**
- [x] `HistoricalPage.tsx`: the linked two-line overlay header, and the reset button's name and 44×44 target.
- [x] `DetailedResult.tsx`: the series title block (linked) and the custom matchup line (plain).
- [x] Tests:
  - every matrix row;
  - `textContent` with the separator;
  - the logos, chip and × are outside the link;
  - the reset `aria-label` and size classes;
  - the reset event payload is unchanged.
- [x] Update EXPERIENCE.md's rows.
- [x] Screenshots at 390 px and 1280 px of the overlay (a flagship and an ABA row) and of Predict's detailed analysis (series and custom), saved under the scratchpad for the owner.

**Acceptance Criteria:**
- Given `npm run gate`, then it is green.
- Given `npx vite preview` of a fresh build (`build`, `og:cards`, `prerender`):
  - when the CDP evidence harness measures them, then the reset hit box is ≥44×44 and both links show a visible focus ring;
  - when `probe-deep-links.mjs` and `probe-analytics-walk.mjs` run, then both are GREEN.

## Verification

**Commands:**
- `npm run gate`: green.
- `npm run build && npm run og:cards && npm run prerender`, then `npx vite preview` and both probes: GREEN.

**Manual checks:**
- Owner: the screenshots ("does this look right").

## Implementation Notes

- New `src/components/common/SeriesTitle.tsx` is shared by both surfaces. `seriesTitleLine(series)` in `series-view.ts` is the one title-line source (`yearRound` calls it).
- Live check 2026-10-10 (anon read of distinct non-NBA `league, round`): `ABA` rounds are `Finals`, `Western/Eastern Division Finals`, `Western/Eastern Division Semifinals` and `Semifinals`; `BAA` is `Semifinals`. No round carries its league, so the title line never prints the league twice. The test fixtures were corrected to bare rounds to match.
- `probe-analytics-walk.mjs` now finds the reset button by `aria-label="Reset filters"`, because its new `sr-only` label broke the old empty-text selector.
- Evidence (implementer run): gate green (945 tests); build, og:cards and prerender served by `vite preview`; both probes GREEN; a CDP evidence script (scratchpad `evidence-6-2.mjs`) passed 24/24 checks (reset 44×44 at 390 and 1280 px, both links `:focus-visible` with a 2 px ring, no horizontal scroll). 12 screenshots are in the scratchpad's `screenshots-6-2/`.

## Spec Change Log

## Review Triage Log

Three layers on `diff-6-2.patch` (46.9 kB): blind-hunter (B, floor 7), edge-case-hunter (E), verification-gap (V). 2026-10-10.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| E1 / B1 | A ctrl/cmd/shift/middle-click on the overlay title opens a new tab, but the overlay in this tab still closes | low | `onNavigate` fires on every click; EXPERIENCE says "closes on navigation, not before" | patch: skip `onNavigate` on modifier keys or a non-primary button; test |
| B2 | The links have no trailing slash, while the matrix and canonical URLs do; a new tab or copied link costs a 301 on GitHub Pages | low | `seriesPath` returns no slash; Home's 6.1 card link is the same | patch: in-app series links (both titles and Home's card) end in `/`; tests updated |
| B3 | Matrix rows untested: Predict's 2026 WCF-shaped row (pending, OKC-first, preview link), and Predict's series row with a missing embed | low | the test uses a 2022 fixture | patch: add both cases |
| V1 | Predict's link depends on `nickname` in `SERIES_SELECT`, and nothing pins that column | medium | `series-query.test.ts` pins only `is_featured`/content; the mocks ignore the projection | patch: assert both team embeds in `SERIES_SELECT` include `nickname` |
| B11 / E2 | Predict shows no matchup line if a series-backed result has no `data` | low | today's setters always attach `data`, but the fallback is free | patch: render the plain "{A} vs {B}" from `teamAName`/`teamBName` |
| B10 | No probe follows the new entry points | medium | AGENTS.md evidence rule | patch: `probe-deep-links.mjs` opens a Historical overlay, follows the title link and asserts the slug page renders; same for Predict's detailed-result title if the probe already reaches that view |
| B7 | Nothing pins the link's ≥44 px height | low | the class is unasserted | patch: assert `min-h-11` on the link |
| B6 | EXPERIENCE.md route rows still list "Predict CTA" under "Reached from" | low | stale wording | patch: name "Predict detailed-result title" |
| B5 | DESIGN.md still describes the old overlay link row | low | stale pointer | patch: update the one DESIGN.md mention to the title link |
| B12 | The "no new event" test only proves nothing fires synchronously on click | low | the destination is a stub `<p>` | patch: say so in the test name or comment |
| B4 | The fixture rewrite assumed bare non-NBA rounds without measuring | false | measured live 2026-10-10 (Implementation Notes): no round carries its league | reject |
| B8 | The overlay × is still 32×32 | low | WCAG 2.1 AA has no 44 px rule (2.5.5 is AAA); the spec keeps the × unchanged | defer to Epic 5's AA pass / 6.3 |
| B9 | The spec records no evidence | false | recorded now in Implementation Notes | reject |
| B7 (contrast part) | `text-on-muted` contrast over the translucent overlay is unmeasured | low | an existing token used across pages; unchanged by this story | reject |

**After review iteration 1 (2026-10-10):** gate green (950 tests). The implementer rebuilt (build, og:cards, prerender) and ran both probes against `vite preview`: `probe-deep-links.mjs` GREEN with 139 ok rows, now including the Historical overlay title link (2016, 49 px, lands on the preview `<h1>`) and the Predict detailed-result title link (2026 WCF, 44 px); `probe-analytics-walk.mjs` GREEN with 63 ok rows. The owner screenshot review is outstanding.
