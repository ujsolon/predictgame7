---
title: 'Story 6.8 — One team order on every surface: home team first'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_commit: '3c6f4768c26b19874115267eca521e16be3275aa'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A series appears in two orders today. Winner-free surfaces (the series preview, the OG card, every series page's `og:title`, the Home pending cards and the preview's stripped preload) sort the two teams alphabetically (E14, `src/lib/spoiler-neutral.ts`). Everything else shows stored `team_a` first, and Home's banner captions are hand-written. Measured live 2026-10-10: the alphabetical order differs from stored order in **90 of 179** series, including 4 of the 5 flagships.

**Approach:** since `00020` (applied), `series.team_a_id` is the home-court team (the real Game 7 host) for every series, so **stored order is home-first**. Every team-pair surface shows `team_a` first through one shared helper, the alphabetical ordering is retired, and E14 is marked superseded (owner decision 2026-10-09, option C; `epics.md` Story 6.8).

## Boundaries & Constraints

**Always:**
- **One helper:** a new small module (e.g. `src/lib/matchup.ts`) that owns the "{A} vs {B}" label in stored order. Every hand-rolled "vs" string in the Code Map goes through it, including the OG render (`scripts/og/render.ts`).
- **Preview spoiler discipline stands** apart from the order:
  - no Game 7 score, winner or result text on preview surfaces;
  - `stripOutcome` keeps dropping the game-7 row, the winner id and embed, and the `resolution` part (B10 page-source rule).
  - Only its **reorder** goes: the stripped row keeps stored `team_a`/`team_b` and every game row's real home/away. The old rewrite would now flip real venues (the 2026 WCF and the 1968 ABA Finals).
- **Banner captions** become home-first: `'Cavs vs Warriors, 2016'` → `'Warriors vs Cavs, 2016'` (GSW hosted Game 7); the other three are already home-first. This is a `caption` **value** change on `banner_hotspot_clicked`, recorded for analytics continuity in Implementation Notes and in the next CHANGELOG entry. The event name and its properties are unchanged.
- **Retire** `src/lib/spoiler-neutral.ts`, `spoilerNeutralView` and their tests. The tests that pin alphabetical order are rewritten to pin stored order (prerender, series-pages, home-pending, `tests/og/card-order.test.ts`). The E14 entry in `deferred-work.md` and the 6.10 B12 entry are annotated as superseded/closed by 6.8.
- **`scripts/probe-deep-links.mjs`:** drop `swapsForNeutralOrder`. The preload check asserts stored order and the unchanged home/away of games 1–6 instead of "neutral-first".
- **Carry-ins (deferred to 6.8 by 6.10 and 6.11):**
  - **Comments:** rewrite the stale "177/178" and "178" comments, including `series-view.ts:99`, `preload.ts:61`, `HistoricalPage.tsx:24,84-90,229` and `insights.ts:6`. `HistoricalPage.tsx:229` is re-measured for PTP's initialism.
  - **Logo alias:** add a `PTP` / "Pittsburgh Pipers" entry to `src/lib/team-logos.ts`. **Owner decision 2026-10-10 (1a):** a bare "Pipers" keeps resolving to the Minnesota Pipers (`MNP`); "Pittsburgh Pipers" and "PTP" resolve to Pittsburgh. Spec size kept whole (owner, about 2,400 tokens). Widen the `team-logos.test.ts` oracle to every `INSERT INTO public.teams` across `supabase/migrations/*.sql` (00021's `INSERT … SELECT` shape included), with its own count of 60. The shared `venueBackfill.EXPECTED_TEAM_COUNT` stays 59.
- WCAG 2.1 AA and the responsive layout are unchanged (text order only).

**Never:**
- Change the `predict-game-7` request payload, any data or migration, or event names.
- Branch on `series.status`, dates or `league`.
- Touch AGENTS.md or the PRD addendum (their E14/archive wording waits for the between-epics window; log it in `deferred-work.md`).
- Deploy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Flagship preview, 2016 Finals | stored GSW, CLE | title, headline, game rows, OG card and `og:title`: "Golden State Warriors vs Cleveland Cavaliers" (was Cavaliers first) | N/A |
| Preview whose alphabetical and stored orders agree (2013 Finals) | stored MIA, SAS | unchanged | N/A |
| Preview preload of the 2026 WCF | real venues in games 3, 4, 6 | the stripped row keeps OKC as `team_a` and games 3/4/6 SAS-home; no game 7, no winner | N/A |
| Pending series (none today) | stored `team_a` = Game 1 host | shown `team_a` first | N/A |
| Typed "Pittsburgh Pipers" or "PTP" | custom matchup | PTP logo and code | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/spoiler-neutral.ts`: `shouldSwapForNeutralOrder` and `neutralPair` (ordering only). Importers:
  - `series-view.ts:17`
  - `preload.ts:18`
  - `scripts/og/render.ts:24` (used at `:170`)
  - its test
- `src/pages/series/series-view.ts`:
  - `spoilerNeutralView` (:97-116, which swaps teams, scores and per-game winners);
  - `previewTitle`, `previewHeadline` and `previewDescription` (:129-139);
  - `outcomeTitle` (:143).
- Callers of `spoilerNeutralView`:
  - `SeriesPreview.tsx:21,41` ("Run X vs Y" at :96)
  - `HomePage.tsx:11,90` (pending cards)
  - `src/prerender/plan.ts:40-46` (`historicOgTitle`)
- `src/prerender/preload.ts:55-92` `stripOutcome`: lines :68-70 strip (keep them); lines :71-91 reorder (remove them).
- `scripts/og/render.ts:160-176`: the card's left and right sides come from `neutralPair` and should come from `team_a`/`team_b`. `card.ts` just receives the two teams.
- `HomePage.tsx:299-303`: the hotspot literals. The `track(BANNER_HOTSPOT_CLICKED, { caption, series_id })` call is at :310.
- Hand-rolled "vs" strings to route through the helper:
  - `series-view.ts:130,143`
  - `plan.ts:45`
  - `SeriesPreview.tsx:96`
  - `HistoricalPage.tsx:367`
  - `DetailedResult.tsx:51`
  - `SeriesPicker.tsx:69`
  - `SeriesCard.tsx:58,63`

  The "{A} and {B}" strings at `series-view.ts:134,138` keep their wording, in stored order.
- Tests that pin alphabetical order:
  - `src/lib/__tests__/spoiler-neutral.test.ts`
  - `tests/og/card-order.test.ts:31-38`
  - `src/prerender/__tests__/prerender.test.tsx`: :110-112, :128, :154, :315-316, the :370 describe "spoiler-neutral (E14)" (:379, :405), :522
  - `src/pages/__tests__/series-pages.test.tsx:300-307`
  - `src/pages/__tests__/home-pending.test.tsx:122-131`
- Captions unchanged and already pinned: `home-pending.test.tsx:268-274` (Raptors) and `probe-analytics-walk.mjs:55,582` (Thunder).
- `scripts/probe-deep-links.mjs`:
  - :192-200 `swapsForNeutralOrder`;
  - :527-542, the neutral-first preload check;
  - :631 and :927 match `${codes[0]} vs ${codes[1]}` in Predict and are already in stored order.
- `src/lib/team-logos.ts:9` is `TEAM_LOGO_ENTRIES`, and :39 holds MNP's `'Pipers'` alias. `src/lib/__tests__/team-logos.test.ts:92-128` parses only `00005` and `00007` through `parseTeamsSeed`, which throws unless there are 59 rows (`venueBackfill.ts:237,265`).
- `deferred-work.md`: :685-690 (E14), :766-767 (6.10 B12) and :774-779 (6.11 D1, D2).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/matchup.ts` (new) and its test: the stored-order "vs" label helper.
- [x] `series-view.ts`, `SeriesPreview.tsx`, `HomePage.tsx`, `plan.ts`, `HistoricalPage.tsx`, `DetailedResult.tsx`, `SeriesPicker.tsx`, `SeriesCard.tsx`: use the helper. Remove `spoilerNeutralView` and its call sites. Change the 2016 caption.
- [x] `src/prerender/preload.ts`: remove the reorder from `stripOutcome`, keep the stripping, and rewrite its comment.
- [x] `scripts/og/render.ts`: render the card sides as `team_a` on the left and `team_b` on the right.
- [x] Delete `src/lib/spoiler-neutral.ts` and its test. Rewrite the pinned tests listed above to stored order. Add a preload test showing the 2026 WCF's real venues survive.
- [x] `scripts/probe-deep-links.mjs`: update the preload check to stored order.
- [x] `src/lib/team-logos.ts`: add the PTP entry (no bare "Pipers" alias; it stays with MNP). In `team-logos.test.ts`, widen the oracle to all migrations.
- [x] Rewrite the stale comments listed in the Boundaries.
- [x] `deferred-work.md`:
  - annotate E14 and B12 as superseded or closed, and D1 and D2 as done;
  - add an entry for the between-epics window covering the AGENTS.md and addendum E14 and spoiler-neutral wording.

**Acceptance Criteria:**
- Given any series, when its preview, result, record, OG card, `og:title`, Home card, Historical row or overlay, or Predict picker, trigger or result is rendered, then the teams appear `team_a` first.
- Given a preview's page source, then it carries no game-7 row, no winner and no resolution (B10 holds).
- Given `npm run gate`, then it is green, and `grep -r spoiler-neutral src scripts tests` finds nothing.
- Given `npm run preview`, when `node scripts/probe-deep-links.mjs <preview base>` and `node scripts/probe-analytics-walk.mjs <preview base>` run, then both are GREEN.

## Verification

**Commands:**
- `npm run gate`: green.
- `npm run build && npm run preview`, then the two probes against the preview base: GREEN.

**Manual checks:**
- Owner, after the next deploy: the 2016 Finals preview and its OG card show the Warriors first.

## Implementation Notes

- **Helper:** `src/lib/matchup.ts` — `matchupLabel(a, b)` ("{A} vs {B}" in the order given) and `homeFirstPair(row)` (`[team_a, team_b]`, used by the OG render). Dependency-free so `scripts/og/render.ts` imports it under plain Node. Every Code Map "vs" string goes through `matchupLabel`; the Historical overlay falls back to `Team A`/`Team B` on a join miss, as its row already does.
- **Analytics continuity:** the 2016 Home banner hotspot's `banner_hotspot_clicked` `caption` value changes from `'Cavs vs Warriors, 2016'` to `'Warriors vs Cavs, 2016'`. Event name and properties unchanged; the other three captions unchanged. Logged in `deferred-work.md` for the next `docs/CHANGELOG.md` entry (written at release, with the version bump).
- **Fixtures:** the shared series fixtures keep their pre-`00020` shapes (stored order is shown whatever it is). A new `flagship2016HomeFirst` fixture is the 2016 Finals as `00020` stores it (GSW `team_a`) and pins the I/O matrix's first row in `series-pages.test.tsx` (title, headline, game rows, CTA) and `prerender.test.tsx` (title, `og:title`, headline, preload). `tests/og/card-order.test.ts` pins GSW left / CLE right.
- **Preload:** `stripOutcome` is now strip-only; a test asserts it equals the plain strip for four rows, and the 2026 WCF keeps OKC as `team_a` with games 3, 4 and 6 SAS-home.
- **Probe:** `probe-deep-links.mjs`'s live-row read now selects `team_a_id`, `team_b_id`, the team abbreviations and each game's home/away ids, so the preload check compares stored order and every game 1–6 row against the live row.
- **Verification (2026-10-10):** `npm run gate` green (891 tests). `npm run og:cards` (179 series + fallback) and `npm run prerender` (184 series pages, 5 previews) into local `dist/`, then `vite preview` on a free port (not `npm run preview`, which rebuilds and wipes those outputs): `probe-deep-links.mjs` GREEN (115 rows, every flagship preload "stored team order and unchanged games 1–6 home/away", 2016 `team_a` GSW) and `probe-analytics-walk.mjs` GREEN.

## Spec Change Log

## Review Triage Log

Three layers on `diff-6-8.patch` (88.8 kB): blind-hunter (B, floor 10), edge-case-hunter (E, claims = this spec), verification-gap (V). 2026-10-10. Verified in code before routing.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| V1 / B4 | The 2016 caption change (the one `banner_hotspot_clicked` value that moves) is pinned by no test or probe | medium | `home-pending.test.tsx` clicks only 2019, and the analytics walk only 2025 | patch: a 2016-hotspot click test asserting `caption: 'Warriors vs Cavs, 2016'` |
| E6 / B5 | Home captions are hand-written "vs" literals, outside the helper | low | `HomePage.tsx:300-307`; trivial to route through `matchupLabel` | patch: build each caption as `` `${matchupLabel(a, b)}, ${year}` ``, with identical strings |
| B1 | `docs/CURRENT_DATA_MODEL.md` still says `00021` "written, apply pending" (:17, :37, :222) and "no `PTP` alias … deferred to 6.8" (:17) | medium | both are false: 00021 was read back live 2026-10-10 (179 / 1,253 / 60 teams, 1968 Finals 4–3), and this diff adds the alias | patch: mark 00021 APPLIED with that read-back; the alias exists since 6.8 |
| B7 | `probe-deep-links.mjs` `FLAGSHIPS` compares team codes sorted, so no live check sees the order this story changes | medium | `:372-378` with `["CLE","GSW"]`; AGENTS.md evidence rule: programmatic before manual | patch: list each flagship home-first (`GSW,CLE`; `TOR,PHI`; `OKC,IND`; `OKC,SAS`; `MIA,SAS`) and compare in order where the probe reads a page's teams or `og:title`, replacing the owner's manual post-deploy check |
| B2 | `HistoricalPage.tsx:229` now claims 40 / 48 / 21, but the census test still pins 20 franchises from the 178-row CSV, with no PTP case | low | `historical-page-archive.test.tsx:799`; the CSV is `00016`'s frozen input (never edited) | patch: keep the CSV census, and add one assertion that `00021`'s PTP row's initialism (`PP`) differs from its stored code, making 21 identities; align the comment |
| B3 | The `card-order.test.ts` fixture claims "the 2016 Finals as `00020` stores it" but has the Warriors winning | low | `:53` `winner_team_id: 2` (GSW); CLE won | patch: `winner_team_id: 1` (CLE), which also shows home ≠ winner |
| B11 | `render.ts` comment calls the left side "the Game 7 host"; for a pending row it is the Game 1 / home-court team | low | `matchup.ts` says the same | patch: comment reads "home-court team" |
| B12 | The deferred-work analytics entry has no target | low | — | patch: target the next release's CHANGELOG entry |
| V2 / B10 | The Historical overlay's order and its new `Team A`/`Team B` fallback are untested; `??` here vs `||` in `SeriesCard` | low | the order did not change in this story; the fallback fires only on an FK join miss; an empty `full_name` is impossible (NOT NULL) | patch: one overlay test asserting stored order. Reject the `??`/`||` part (unreachable) |
| E2 / B9 | The widened team-logos oracle reads INSERTs, ignores later UPDATEs (`00009` rewrites id 13) | medium (pre-existing) | the old `00005`+`00007` oracle had the same blind spot | defer |
| E1 | An INSERT row the regex misses would be skipped silently | low | the count is pinned at 60, equal to the live count; hypothetical future shape | reject |
| E3 | A commented-out `INSERT` would be counted | low | none exists (60 = live); hypothetical | reject |
| E4 | `not.toContain('game_number":7')` could pass vacuously if serialisation changed | false | `prerender.test.tsx:166` asserts the result page *contains* the same substring, proving the format | reject |
| E5 / V-other | The probe's preload check never covers a pending preview | low | 0 pending rows live; the 2026 WCF unit test pins the venue case | reject |
| E7 | Historical row, `DetailedResult:91` and `PredictCard:137` print their own "vs" | false | these are layout separators between `team_a` and `team_b` blocks, not labels; the order comes from JSX position on stored order | reject |
| B6 | No source-scan test stops a new hand-rolled "vs" | low | none remain; adds a test harness for a hypothetical | reject |
| B8 | The `flagship2016HomeFirst` prerender test checks B10 only by the game-7 substring | low | the strip path is shared and pinned by the strip-only equality test over four rows | reject |
