---
title: 'Story 4.3 — Series pages: preview, result and full record'
type: 'feature'
created: '2026-10-07'
status: 'done'
baseline_commit: 'c8a7b1c974da4b7843dd06b3a332a8e431e9fdde'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-predictgame7-2026-09-25/mockups/key-series-page.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/series/<id>` has no page of its own today. Story 4.1's interim redirect sends a bare id to Predict, and `/series/<id>/result` does not exist. So a shared or searched series link never lands on a page about the series. Story 4.8 also needs real page components to prerender.

**Approach:** Implement `epics.md` Story 4.3 (as split by `sprint-change-proposal-2026-10-07-d.md`):
- `/series/:id` renders a **series page**:
  - non-flagship archive → the single full-record page;
  - flagship or pending → the spoiler-free preview.
- `/series/:id/result` renders the flagship result page.
- `?method=` keeps redirecting to Predict (4.1).
- Flagships come from a pinned list of the five owner-chosen ids until 4.5's `is_featured`.
- Every page component renders without a browser, so 4.8 can prerender it.

## Boundaries & Constraints

**Always:**
- **One fetch per page**: `supabase.from('series').select(SERIES_SELECT).eq('id', id).maybeSingle()`. The phase comes from `deriveSeriesPhase` (AD-4), never `status`, dates or `league`.
- **Kind of page:**
  - `archive` + not flagship → full record;
  - `archive` + flagship → preview at `/series/:id`, result at `/series/:id/result`;
  - `pending` → preview only;
  - phase `null` → the retry panel's sibling "This series doesn't exist." 404 (it cannot be shown truthfully).
- **Scores are mapped to teams by team id** (`home_team_id === team.id ? home_score : away_score`), never by home/away position. **No venue, home or away label is ever printed**: an archived row's home side is a real venue only for Game 7 of an NBA/BAA series (AGENTS.md, migration `00016`).
- **The preview is spoiler-free in the DOM**, not merely hidden:
  - Game 7's row, scores and winner, the final series score and any past-tense outcome copy are not rendered at all;
  - the document title is winner-free;
  - copy is present tense ("Game 7 stands.").
- **Copy:**
  - **Eyebrow:** `GAME 7 · {YEAR} {ROUND}`, uppercase, with `{LEAGUE} ` before the round when `league !== 'NBA'` (as 2.10's chip).
  - **Preview `<h1>`:** "{Nickname A} and {Nickname B} stand three games apiece".
  - **Result and full-record `<h1>`:** "{Winner nickname} win Game 7".
  - **Titles:**
    - preview: "{A} vs {B} — Game 7, {Year} {Round} · PredictGame7";
    - result and full record: "{A} vs {B}, {Year} {Round}: {Winner} win Game 7 · PredictGame7".

  Use the `nickname` and `full_name` columns, and no editorial copy (Story 4.5 adds it).
- **Score strip:**
  - Preview: "After six games 3–3", then games 1–6, each as "Game N" with `{A} {a}–{b} {B}` and its winner marked.
  - Full record and result: "Final series 4–3 · {W} over {L}", a Game 7 box, then all seven games.
  - Cells are hairline-ruled in `mono-data` (DESIGN.md · Series page).
- **The preview also has:**
  - "THE MODELS HAVE THEIR PICKS": four links to `/predict?series=<id>&method=<slug>`, labelled from `METHOD_LABELS`;
  - the CTA "Model this matchup yourself" → `/predict?series=<id>`;
  - **below them**, the reveal link "See how the series ended →" with "Spoilers for Game 7 ahead." (flagship only; a pending series has no reveal).

  The result and full-record pages have the generic "Model it yourself" CTA → `/predict?series=<id>`, with no per-method links.
- **The result `<h1>`** has `tabIndex={-1}` and receives focus on client navigation (`useNavigationType() !== 'POP'`).
- **Every page sets its title** through `PageMeta`. A fetch error shows `ErrorRetryPanel` (Retry re-fetches). An unknown, malformed or non-flagship `/result`, a pending `/result`, or an unknown id shows `SeriesNotFound` (h1 variant).
- **SSR-safe:** no `window`, `document`, `localStorage` or `navigator` during render (effects only), and no module-level browser access in these files.
- **Layout:** `max-w-3xl` single column, with `space-y-16` between sections. Tokens and the label motif per DESIGN.md. Targets are at least 44×44 px with focus visible. AA, responsive. No new radius, colour or elevation tokens.

**Never:**
- Prerender, emit OG/Twitter meta, write a sitemap or change the build (Story 4.8).
- Add a Share button (4.4), editorial sections, video, similar series, an archive-overlay link or a Home highlight (4.5/4.6).
- Change Home's or Predict's links. Read `series.status`. Print a venue. Add analytics events.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Non-flagship archive | `/series/<archived id>` | Full-record page: eyebrow, `<h1>` "{W} win Game 7", final 4–3, Game 7 box, all 7 games, Model-it-yourself CTA; outcome title | N/A |
| Flagship preview | `/series/06715a85-…` (2016 CLE–GSW) | Preview: games 1–6, "After six games 3–3", 4 method links, CTA, reveal link; **no Game 7 score, final score or winner name in the DOM**; winner-free title | N/A |
| Flagship result | `/series/06715a85-…/result` | Full record + `<h1>` focused on client nav; outcome title | N/A |
| Pending series | `winner_team_id` null, 6 games | Preview with no reveal link; `/result` → 404 | N/A |
| Non-flagship `/result` | `/series/<archived non-flagship>/result` | `SeriesNotFound` | N/A |
| Share arrival | `/series/<id>?method=elo` | Redirects (replace) to `/predict?series=<id>&method=elo` (4.1, unchanged) | N/A |
| Unknown / malformed id | `/series/abc` or an absent uuid | `SeriesNotFound` (h1, title, focus); no query for a malformed id | N/A |
| Fetch error | query rejects | `ErrorRetryPanel`; Retry re-fetches | retryable |
| Non-reconciling row | `deriveSeriesPhase` → null | `SeriesNotFound` | N/A |
| ABA series | `league = 'ABA'` | Eyebrow "GAME 7 · 1970 ABA WESTERN DIVISION SEMIFINALS"; no venue anywhere | N/A |
| SSR | `renderToString` of each page variant with a preloaded series | Renders without throwing, in a node (non-jsdom) environment | N/A |

</frozen-after-approval>

## Code Map

- `src/pages/SeriesRoute.tsx`: today it does the id check, then a `select('id')` lookup, then a redirect, the 404 or the retry panel. Keep the `?method=` redirect and the malformed-id 404. Replace the bare-id redirect with the series page, using the full `SERIES_SELECT` fetch.
- `src/routes.tsx`: add `/series/:id/result`.
- New page components, PascalCase per AD-9:
  - `src/pages/series/SeriesPreview.tsx`, `SeriesFullRecord.tsx` (used by the non-flagship page and the result page) and `SeriesHero.tsx` / `ScoreStrip.tsx`.
  - They are **pure over a `Series` prop**, so 4.8 can render them with preloaded data and no fetch.
  - The route container does the fetch and picks the variant.
- New `src/lib/flagship-series.ts`: `FLAGSHIP_SERIES_IDS` with the five owner-pinned ids, and `isFlagship(id)`. A header comment says Story 4.5's `is_featured` replaces it. The ids:
  - 2013 MIA–SAS `dd4e81bc-0e10-4ad2-b2eb-8b1fbd8c5e0a`
  - 2016 CLE–GSW `06715a85-ec33-46a4-8383-d058055eefe6`
  - 2019 TOR–PHI `29638c4e-261a-4d09-81aa-5740f76175f5`
  - 2025 OKC–IND `626257bc-1678-4c88-84a6-37e0a6cdb49c`
  - 2026 OKC–SAS `6ecb170c-e781-47f8-b7ee-881ba719d6d5`
- Reuse:
  - `src/lib/series-query.ts` `SERIES_SELECT` and `src/lib/series-phase.ts` `deriveSeriesPhase`;
  - `src/lib/series-id.ts` `isSeriesId` and `src/lib/method-display.ts` `METHOD_LABELS` / `isMethodSlug`;
  - `src/components/common/SeriesNotFound.tsx` and `ErrorRetryPanel.tsx`;
  - `src/components/common/PageMeta.tsx`;
  - `src/lib/team-logos.ts`, if a logo is shown (optional, not required by the mockup).
- Do not change: the `src/pages/HistoricalPage.tsx` record overlay; it keeps its own projection.
- Tests:
  - `src/pages/__tests__/series-route.test.tsx`: extend it, keeping the 4.1 cases (method redirect, malformed, unknown, retry, the real-`routes` case). Update the bare-id case, whose behaviour changes.
  - New `src/pages/__tests__/series-pages.test.tsx` (jsdom) covers every matrix row except SSR. **The spoiler test asserts the preview's `textContent` contains none of: the Game 7 score digits, "4–3", the winner's full name or nickname as a winner, or "win Game 7".**
  - New `src/pages/__tests__/series-ssr.test.tsx` (node env, `react-dom/server` `renderToString` inside a `StaticRouter`/`MemoryRouter` + `HelmetProvider`) covers the SSR row.
  - Use real-shaped fixtures: 7 `series_game_scores` rows, and an ABA row.
  - Never assert a computed accessible name (AGENTS.md).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/flagship-series.ts`: the pinned ids and `isFlagship`.
- [x] `src/pages/series/*`: the hero, score strip, preview and full-record components (pure, SSR-safe).
- [x] `src/pages/SeriesRoute.tsx` and a new `SeriesResultRoute.tsx`, plus `src/routes.tsx`: fetch, variant choice, 404 and retry.
- [x] Tests: series-route updates, series-pages (jsdom) and series-ssr (node).
- [x] Run `npm run preview` and the 4.1 probe (`scripts/probe-deep-links.mjs`); its bare-id expectations may need updating. Then a headless check of one flagship preview, its result, and one ABA full-record page (focus on the result `<h1>` after clicking the reveal link; no Game 7 text in the preview DOM), via `openBrowserSession` as in 4.1.

**Acceptance Criteria:**
- Given `npm run gate`, then green.
- Given the preview headless check, when the reveal link is clicked, then `document.activeElement` is the result `<h1>`, and the preview's `document.body.innerText` contained no Game 7 score.

## Implementation Notes

- **Files.** `src/lib/flagship-series.ts`; `src/pages/series/` — `series-view.ts` (the pure `Series` → view projection: phase via `deriveSeriesPhase`, scores mapped by team id, copy/title builders; `null` for an unshowable row), `series-styles.ts`, `SeriesHero.tsx`, `ScoreStrip.tsx`, `SeriesPreview.tsx`, `SeriesFullRecord.tsx`, `useSeriesRecord.ts` (the one `SERIES_SELECT` fetch + retry), `SeriesFetchFallback.tsx` (loading / 404 / retry); `src/pages/SeriesRoute.tsx` (rewritten), new `src/pages/SeriesResultRoute.tsx`, `src/routes.tsx` (`/series/:id/result`).
- **`?method=` arrival.** Any `method` param redirects to Predict after the (now full) fetch, exactly as 4.1: a known slug is carried, an unknown one dropped. The 4.1 suite keeps its cases; its select assertion moved from `'id'` to `SERIES_SELECT`, and its bare-id case now asserts the page renders instead of redirecting.
- **`/result` short-circuit.** A malformed or non-flagship id is the 404 with no request; a flagship id fetches, and anything but `archive` (pending, unknown, non-reconciling) is the 404.
- **Label colour.** The label motif renders in `text-on-muted` (#595959), not `muted-foreground` (#808080, fails AA at 12px) — same call as Historical's league chip; no new token.
- **Eyebrow** is uppercased in the text itself (survives without CSS / in prerendered HTML); section labels stay sentence case in the DOM and are uppercased by CSS.
- **Probe.** `scripts/probe-deep-links.mjs` gained Story 4.3 rows 5–7 (flagship preview innerText vs the live Game 7 score, a CDP mouse click on the reveal → `document.activeElement` is the result `<h1>`, an ABA full record, non-flagship `/result` 404) and two cold-GET paths. It now waits for `document.title` before reading a page: react-helmet-async writes it a frame after commit, and the 4.1 unknown-id title row read `""` once on this run. The app shell's own wordmark `<h1>`s mean the page `<h1>` is matched by text. Run 2026-10-07 against `vite preview --port 4318`: 43 ok, GREEN.
- **Review fixes (same day).** Unshowable rows (`toSeriesView` → null) are now reported through `captureError` with the series id. Titles carry the non-NBA league (`yearRound`). Both series routes are keyed by `:id` (`KeyedById` in `routes.tsx`), so a history move from A to B never paints A. New tests: a pending non-flagship case and `isFlagship` (`src/lib/__tests__/flagship-series.test.ts`). Probe: a new row 5 checks the five pinned ids live (archived, expected teams); the ABA venue check is scoped to `<main>` with word boundaries; the result read waits for the outcome title; REST, Game 7 and reveal-href failures become ledger FAILs instead of aborting. Re-run: 49 ok, GREEN — all five flagships archived with the expected teams.

- **Orchestrator re-check (2026-10-07):** `npm run gate` exit 0 on the combined tree: 32 files / 655 tests, including a parallel session's in-flight 4.2 edits.
- **Deferred, not yet in `deferred-work.md`:** the triage log's two `defer` rows, E14 (team order leaks the winner: owner decision) and B10 (4.8 must not serialise the Game 7 row into preview HTML). They are appended to `deferred-work.md` once the parallel 4.2 session commits its pending edits to that file, so the two sessions' changes are not mixed.

## Spec Change Log

## Review Triage Log

Pass 1 (2026-10-07). Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V). Reviewed `src/**` and `scripts/probe-deep-links.mjs` only. A parallel session's in-flight Story 4.2 edits (`scripts/og/**`, `deferred-work.md`, the 4.2 spec) were excluded.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| V1 | A pending series whose id is **not** a flagship has no test on `/series/<id>`: dropping the `phase === 'archive'` half of the branch would 404 every real 2027 pending page with the gate green | medium | Pre-verified by V: the only pending fixture reuses a flagship id. Add a non-flagship pending fixture and its preview/no-reveal/`/result`-404 case | patch |
| B6 | The five pinned flagship ids are never checked against the live table. A wrong id silently gives that series the outcome-bearing full record | medium | True: the probe checks only the 2016 id. Add a probe row that reads all five over anon REST and asserts each exists, is archived, and has the expected team abbreviations | patch |
| B5 | A non-reconciling row renders the 404 without `captureError`, while `series-phase.ts` asks callers to report such rows | low | Verified: `PredictPage` reports via `captureError`, and the series routes do not. Direct one-line fix per route | patch |
| B7/E8 | The document titles omit the league for non-NBA series, while the eyebrow and description include it | low | Verified: `previewTitle`/`outcomeTitle` use `year round` and not `yearRound(view)`. Direct fix | patch |
| B8/E1/E2/E3/V-other | `useSeriesRecord` state is not keyed by `id`, so moving from `/series/A` to `/series/B` (back/forward) renders A for a frame, and a `?method=` arrival can redirect before B is checked | low | True. History navigation between two series URLs reaches it. Direct fix: key each route element by `id` | patch |
| V2 | `isFlagship`'s case-insensitive match is untested | low | Pre-verified by V. A cheap unit test | patch |
| B1/E10 | Probe ABA venue check runs `/(home\|away\|venue\|arena)/i` on `document.body.innerText`, which includes nav chrome, with no word boundaries | low | V ran the probe GREEN, so it does not always fail, but it is fragile. Direct fix: scope to the page container and use `` | patch |
| B2/E9 | Probe row 5 can read the preview's still-set title after the reveal | low | True (helmet writes a frame later). Direct fix: wait for the outcome-title pattern | patch |
| B3/E11/E12 | Probe REST/Game-7 lookups and `box.href` can throw and abort rows 5–7 without ledger lines | low | True. Direct fix: turn them into failed checks | patch |
| E14 | **Team order leaks the winner.** Archived rows store the winner as `team_a` in 177/178 (AGENTS.md), and the preview headline, title (and 4.2's card) put `team_a` first. A reader who knows the pattern could infer the Game 7 winner from a "spoiler-free" preview | medium | Verified against AGENTS.md's measured `team_a`-is-winner rule. The fix (outcome-neutral order, e.g. alphabetical) also touches 4.2's card, which is under a parallel review, and changes spoiler-discipline scope. It needs an owner decision | defer |
| B10 | The preview fetches the full row (Game 7 score + winner) into client memory and the network response. Story 4.8 must not serialise that into prerendered HTML | medium | True for 4.8's design. 4.3 renders nothing of it, and the DOM spoiler test holds | defer |
| B4 | A pending series' `/result` says "This series doesn't exist." though the series exists | low | Spec-defined (matrix: pending `/result` → 404). Changing the copy is a spec edit | reject |
| E4/E5/E6/E7/B9 | Duplicate game rows, inconsistent 3–3/4–3 tallies, a Game 7 winner mismatch, tie rows; `series-view` null-paths untested | low | No such rows exist: the pipeline and RPCs assert 3–3 and the winner (AD-4/AD-5), and the 178-row sweep reconciled every row. Guards for undemonstrated state | reject |
| E13 | The probe's ABA pick may not reconcile | low | All 178 rows reconcile (4.2 live run: skipped none) | reject |
| B11 | Extra round trips: the redirect waits for the full fetch, and the reveal re-fetches | low | A performance nicety; correctness is unaffected | reject |

## Design Notes

**Why a pinned list rather than a column.** `is_featured` is Story 4.5's schema change, and 4.3 must not run a migration. The five ids are the owner's 2026-09-25 pins. The 2026 Thunder–Spurs id is the 2026 Western Conference Finals row.

**Why no venue.** `series_game_scores.home_team_id` is a winner-slot placeholder for every archived game except Game 7 of an NBA/BAA series, so "Game 1 · Oracle" (as in the mockup) would print fiction for most rows. The mockup's venue and editorial lines wait for 4.5's content model.
