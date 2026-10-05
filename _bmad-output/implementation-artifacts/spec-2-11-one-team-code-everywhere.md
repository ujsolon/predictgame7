---
title: 'One team code everywhere — search, archive rows and Predict answer the stored teams.abbreviation'
type: 'bugfix'
created: '2026-10-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 2
baseline_commit: '9c9105622d384486ec78e8f1376baa2b15b9ed72'
story_key: '2-11-one-team-code-everywhere-archive-rows-and-predict-answer-teams-abbreviation'
context:
  - '_bmad-output/planning-artifacts/epics.md'
  - '_bmad-output/implementation-artifacts/spec-2-10-nba-by-default-league-chip-and-in-record-gloss.md'
  - '_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/historical` filters on `full_name` substrings only (`HistoricalPage.tsx:109-112`) while the row it prints a code from already carries `teams.abbreviation` — so typing `SLB` or `WSB` returns nothing, and the code on the row is a name-derived initialism (`SS`, `WB`) that the fan cannot type back. Measured 2026-10-04 against the committed archive CSV: the shown initialism differs from the stored code on **39 of 178 series** (47 team cells, 20 franchises, years 1948→1997 — all 20 are `00007` historical identities; 29 of the 59 seeded team names are absent from the map the other 139 rows resolve through). The same divergence runs through 12 DB-backed renders on `PredictPage`.

**Approach:** Wherever the `teams` FK row is in hand, the stored `teams.abbreviation` is the single source — for display and for search. `getTeamAbbreviation` survives only as the no-row fallback for fan-typed names, and the hardcoded `TEAM_ABBREVIATIONS` map that duplicated the table is deleted. Owner decisions U1–U9 in `epics.md:536-552` settle every design call; this spec records the measured facts and the two copy/behavior gaps they leave open.

## Owner decisions (from epics.md, restated for the implementer)

- **U1** search matches the FK row's `abbreviation`, reached through the existing embed — no query change (`:64` embeds `team_a:team_a_id(*)`; `PredictPage` `SERIES_SELECT:41-43` already selects it).
- **U3** the name path is **not** narrowed; `SAS`→Kansas City is accepted, not fixed, because the list sorts year-descending (`:72-74`) so the newest match is the first row.
- **U6** one pass over **14 live call sites on 12 lines**; resolution order at every converted site: row `abbreviation` → placeholder literal → `getTeamAbbreviation(name)` (extended by U15 to a row matched by typed name).
- **U7** `predicted_winner` gets its code client-side: no contract change, no Edge Function deploy.
- **U8** `Team A`/`Team B` are one named client literal (`TMA`/`TMB`), never rows in `teams` (a row each would re-pin `EXPECTED_TEAM_COUNT = 59`).
- **U9** the committed-JSON team snapshot stays parked in `deferred-work.md:396-400` — not built here.
- **U14 (owner, 2026-10-04 — answers this spec's OQ2; numbered past U10-U13, which Stories 2.5/2.6 already consumed)** the search field's placeholder becomes `Search by team name or code...`, in place of `Search by team name...` at `HistoricalPage.tsx:177`. Rejected first, on the owner's read: `Search for a team` — redundant with the `Search Team` label directly above the field, which stays as written (Story 5.2's AA entry names it). The 7 `getByPlaceholderText` references in `historical-page-archive.test.tsx` move with the copy.
- **U15 (owner, 2026-10-04 — answers this spec's OQ1; the custom-matchup form after the map is deleted).** The typed name is resolved against the team rows the page **already holds in memory** (`games`, loaded once by `fetchAllGames` through `SERIES_SELECT`, which embeds `abbreviation`), and a hit prints that stored `abbreviation`. This renegotiates `epics.md:545`'s claim that `PredictPage.tsx:423,424` "stay on the name path **by construction** (no row, no stored code)" — true of the series FK, false of the app, which has every team row from the picker fetch. Accepted consequences, stated with the decision:
  - Resolution order becomes **matching row → placeholder literal → `getTeamAbbreviation(name)`**, one order on every surface — the story's title holds on all three.
  - The epic's clause "removing the map changes nothing for any modern team on any surface" and U8's "rendering exactly as it does today" are **recorded as falsified** for a typed modern name (24 of the 30 modern franchises fall from `BOS` to `BC`-class initialisms on the bare name path), and U15 is the fix, not the acceptance.
  - What U15 does **not** claim, and the owner verifies by looking at it: mid-typing transients still exist (`Utah J` has no matching row, so it shows `UJ` until `Utah Jazz` completes and corrects to `UTA`) — the direction of the mutation inverts from right→wrong to wrong→right; nicknames (`Celtics`) stay truncations, since only `full_name` is matched **[Amended by owner decision U16, 2026-10-05 — see U16 above.]**; and `New Orleans Pelicans` is the one seeded franchise with no archived series, so it is absent from `games` and falls to the name path (which yields `NOP` correctly by truncation).
- **U16 (owner, 2026-10-05 — raised in review pass 2's follow-up: "typing `jazz` would show the Utah Jazz logo, but then the abbreviation is `JAZ`").** On the custom-matchup form the code follows the logo: a typed name resolves through the **same alias table and the same normalization** `getTeamLogo` uses (`src/lib/team-logos.ts` — full name, nickname(s) and code per team; lower-cased with every non-alphanumeric stripped), and prints that entry's stored code (its last alias, pinned against the `00005` + `00007` seeds). Order on the custom form: matching loaded row (U15) → logo alias table (U16) → placeholder literal → name path. Measured before the change: 62 aliases already agreed and 119 did not (49 nicknames such as `Jazz` → `JAZ`, `Sixers` → `SIX`; 70 spacing/punctuation variants such as `UtahJazz` → `UTA`-by-accident and `UtahStars` → the Jazz's `UTA` beside the Stars logo). Recorded with the decision:
  - **Shared nicknames are the choice the alias table already made.** A nickname several franchises carried resolves to the one team the table files it under, which is the team whose logo the form already shows: `Bullets` → Baltimore (BLB), not Capital/Washington; `Royals` → Cincinnati, not Rochester; `Kings` → Sacramento, not Kansas City; `Warriors` → Golden State, not Philadelphia/San Francisco; `Hawks` → Atlanta, not St. Louis; `Lakers` → LA, not Minneapolis; `Rockets` → Houston, not Denver; `Nets` → Brooklyn, not New Jersey/New York; `Hornets` → Charlotte, not New Orleans; `Pistons` → Detroit, not Fort Wayne. Changing one of these is an alias-table edit, and it moves the logo and the code together.
  - **The archive is left as is.** `/historical` prints FK rows (code and logo from the same record, never from typed text), and its search stays the U1/U3 substring filter — no alias arm. Known gaps, accepted: `Sixers` finds none of the 76ers' 16 series, and glued or hyphenated spellings (`UtahJazz`, `Golden-State`) find nothing; a shared nickname returning every era (`Bullets` → all three franchises) is the right answer for a search.
  - Scope: the custom form only — its label, and the result card and detailed sheet when the selection is custom. Series selections and the archive keep `getTeamCode`, so an empty stored `abbreviation` stays visible there rather than being papered over by the alias table.
  - This renegotiates U15's "nicknames stay truncations", the Never bullet's "no second hardcoded name→code source" (the alias table is not new — it is the table that already picked the logo — and a pin forbids it from disagreeing with the seeds), matrix `:63`'s `Celtics` → `CEL`, AC 3's `Celtics` → `CEL`, and Design Notes' "no nickname arm"; each carries a dated pointer here. It also resolves the PRD UJ-2 nickname deferral in `deferred-work.md` for the custom form.

## Boundaries & Constraints

**Always:**
- Client-only: `src/**` and tests/records. The FK row's stored value wins wherever it exists; the archive search's name path keeps its current behavior everywhere else (never narrowed to exact match). U15's typed-name index is an **added** arm ahead of the name path on the custom form, not a narrowing of the search predicate. **[Owner decision D3, 2026-10-05 (review pass 2): the archive query is trimmed before both arms, so `SLB ` finds the Bombers and whitespace alone reads as empty. That changes the name path only for padded input, and only by widening — never narrowing — so U3 holds.]**
- Tests per-file jsdom, and **no assertion on a computed accessible name** (AGENTS.md accname rule) — `textContent` or literal attributes.
- `historical_filter_applied` keeps its name and its `filter_type: 'team_search'` value; the call site moves behind the analytics port only in Story 3.1.
- The 39-row visible change on `/historical` is pinned per row, with mutation evidence for each new pin.

**Never:**
- No migration, no `supabase/` change, no `db push`/`reset`/`start`, no Edge Function deploy, no read of `.env` or `supabase/.temp/project-ref`.
- No new PostHog event name; no route list / page count / prerender change; no change to the game tiles or home/away derivation.
- No `teams` rows for Team A/Team B; no JSON snapshot; no second hardcoded name→code source. **[Amended by owner decision U16, 2026-10-05: the custom form reads codes from the logo alias table that already existed — the table that picks the logo — with every name↔code pair pinned against the seeds; no new table was written.]**
- Do not delete or edit the commented-out Matchup block at `PredictPage.tsx:1171-1182` — its two calls stay dead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Archive row, code ≠ initialism | `Seattle SuperSonics`, stored `SEA` | row prints `SEA`; today it prints `SS` | n/a |
| Search by stored code | `SLB` 1 / `WSB` 5 / `KCK` 1 / `OKC` 7 / `SAS` 14 | matches on `abbreviation` (case-insensitive); live counts measured 2026-10-04 | n/a |
| Search by a 2-letter prefix | `NY` | 19 series — `NYK` 16 + `NYN` 3; 0 seeded full names contain the substring "ny", so today the query returns nothing | n/a |
| Search by name substring | `Sonics`, `Washington` | still matches — name path unchanged, `SAS`→Kansas City included | n/a |
| FK join miss | `team_a` null, name `'Team A'` | placeholder literal `TMA`, no `getTeamAbbreviation` call | fall through |
| Row present, `abbreviation` empty | `abbreviation: ''` | falls to name path — an empty cell never prints blank | fail visible |
| Custom matchup, typed name | `Boston Celtics`, `Utah Jazz` — a `games` row carries that `full_name` | the matched row's stored `abbreviation`: `BOS`, `UTA` (U15) | falls through below |
| Custom matchup, no row match | `Celtics`, `Nowhere FC`, mid-typing `Utah J` | the name path, unchanged from today: `CEL`, `NF`, `UJ` **[owner decision U16, 2026-10-05: `Celtics` is now a logo alias and prints `BOS`; a single word no alias knows, e.g. `Celtic`, still truncates to `CEL`]** **[owner renegotiation, 2026-10-05 (E7, review pass 2): this cell read `NOW`; two words take the initials arm, so `Nowhere FC` → `NF` — `NOW` is what a single-word `Nowhere` truncates to. Code and `predict-flow-regression.test.tsx` already printed `NF`; the frozen text was the error.]** | n/a |
| Custom matchup, blank | `''` | the caller's `\|\| 'TBD'`, unchanged | n/a |
| Predicted winner | `predicted_winner` equals an embedded row's `full_name` | that row's `abbreviation`; else the name path | n/a |

</frozen-after-approval>

## Code Map

- `src/lib/nba-utils.ts:1-34` — `TEAM_ABBREVIATIONS` (32 entries: 30 franchises + Team A/B), **deleted here**; `getTeamAbbreviation:36-47` survives as the name path (initials + truncation branches only); `getRoundImportance:58-65` untouched (also imported by `tests/pipeline/nba-com.test.ts:13`).
- `src/pages/HistoricalPage.tsx` — predicate `:104-115` (`matchesTeam :109-112` gains the abbreviation test); display `:204-210` (`abbrevA`/`abbrevB` `:207-208`), printed at `:243`/`:249`; chip guard `:263`,`:335`; live region `:311-313`; search `Input :176-181`, whose placeholder `:177` becomes `Search by team name or code...` per U14; `:84-98` 178-vs-160 comment must stay.
- `src/pages/PredictPage.tsx` — U6's 14 live calls on 12 lines: `:430×2` (DB branch of `getSeriesLabel :427-431`), `:492×2` (`renderSeriesOption`), `:1191`, `:1211`, `:1212`, `:1275`, `:1280`, `:1291`, `:1311`, `:1312`. U15 adds the custom branch's 2 calls, so the story's converted total is **16 live calls on 14 lines** (the epic's inventory: 16 calls on 14 lines of which 14 are live — `:423,424` move from "stays" to "converted"). Dead inside `:1171-1182`: `:1175`, `:1180`. Name chain feeding those renders: `:1160-1163` and `:1243-1248`; the request builder `:306-307` sends `full_name || 'Team A'`.
- `src/pages/PredictPage.tsx:148-170` + `:84` — U15's row source: `fetchAllGames` loads **every** series through `SERIES_SELECT:31-45` (which embeds `abbreviation`) into `games`, so the page already holds the team rows with no new query. Measured 2026-10-04: 58 of the 59 seeded franchises appear in the 178 archived rows; the exception is `NOP` / New Orleans Pelicans, which therefore stays on the name path and yields `NOP` correctly by truncation. The live logo chip at `:612-618`/`:637-643` resolves through `getTeamLogo`, which is unaffected — the row lookup gives it nothing new, so logo and code stay in agreement on hit and disagree only where the code was already a truncation today.
- Hidden consumers of the deleted map (four, not the two the AC names): `src/lib/__tests__/team-logos.test.ts:5,85` (cross-source oracle → iterates an empty object, green and vacuous), `src/lib/__tests__/nba-utils.test.ts:9-15` (map-through pins; `:19-32` no-row pins stay verbatim), `src/lib/__tests__/render-smoke.test.tsx:5,8,17` (renders `getTeamAbbreviation` and asserts `getByRole('button', {name: 'Team BOS'})` — goes red, and its assertion is itself an accname-rule violation), `src/pages/__tests__/predict-flow-regression.test.tsx:104-116` (the OQ1 dict-hit pins; `:75-101` is row-backed and unaffected).
- Fixtures already carry codes: `src/pages/__tests__/helpers.tsx:13-14` (`BOS`, `MIA`); `historical-page-archive.test.tsx:43-44,137-138` (`LAL`, `GSW`, `NYN`, `KEN`).
- `supabase/scripts/pipeline/venueBackfill.ts:232` `EXPECTED_TEAM_COUNT = 59`, `:251` `parseTeamsSeed` — the seed reader the re-keyed logo guard reuses (convention recorded at `deferred-work.md:343`: one regex serves probe and test).
- `src/lib/team-logos.ts:6-68` — `TEAM_LOGO_ENTRIES`, **not exported** (61 entries; each entry's first alias is the `full_name`, last is the stored code — both verified 2026-10-04).
- Records to correct in the same commit (see Tasks): the "all pre-1976" claim at `deferred-work.md:388`, `sprint-status.yaml:123` and `spec-2-10:32` (D5', inside its frozen block — a bracketed correction pointer, per 2.10's own D6' precedent), and the two falsified clauses in `epics.md:536-552`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/nba-utils.ts` -- delete `TEAM_ABBREVIATIONS`; add `PLACEHOLDER_ABBREVIATIONS` and the row-first `getTeamCode(name, ...rows)` per Design Notes -- one call site for the order U6 fixes.
- [x] `src/pages/HistoricalPage.tsx` -- `:207-208` through `getTeamCode` with the FK row; `:109-112` gains the case-insensitive `abbreviation` test on both sides, name path kept; placeholder `:177` reworded per U14.
- [x] `src/pages/PredictPage.tsx` -- convert the 12 live lines **and** the custom branch `:423,424` per U15: a `useMemo` index over `games` keyed by lower-cased `full_name` (both embedded sides, first hit wins), consulted before the placeholder step; `getTeamCode`'s row arm then does the rest. Leave `:1171-1182` and every logo/tile path alone.
- [x] `src/lib/__tests__/nba-utils.test.ts` -- move `:9-15` onto `getTeamCode` with a row fixture; add a no-row fall-through pin; keep `:19-32` verbatim.
- [x] `src/lib/__tests__/team-logos.test.ts` -- re-key `:85` on the 59 seeded abbreviations via `parseTeamsSeed` **and** keep the `TEAM_LOGO_ENTRIES` loop, so the guard cannot be vacuous.
- [x] `src/lib/__tests__/render-smoke.test.tsx` -- decouple from `getTeamAbbreviation` (render the raw name, assert `textContent`) -- removes the third hidden consumer and a standing accname violation.
- [x] `src/pages/__tests__/predict-flow-regression.test.tsx` -- U15 keeps `:104-116`'s four pins passing for a new reason (`BOS` from a row hit, not the dict), so the `// dict hit` comment at `:111` is corrected and new pins land beside them: a typed **historical** full name resolves to its stored code (`Seattle SuperSonics` → `SEA`, with its own fixture row), a mid-typing non-match stays a truncation (`Utah J` → `UJ`), and a nickname stays `CEL`. The `TBD` and unrecognized-name pins do not move.
- [x] `src/pages/__tests__/historical-page-archive.test.tsx` -- per-row pins for the divergent codes (`SEA`/`WSB`/`KCK`/`SLB` shown verbatim), code search hits, name-substring noise still returned, join-miss and empty-abbreviation fall-through, reset button still clears both paths, and the 9 `getByPlaceholderText('Search by team name...')` references moved to U14's copy (that move is itself the pin that the placeholder changed).
- [x] `epics.md`, `deferred-work.md`, `sprint-status.yaml`, `spec-2-10:32` -- correct the claims measurement falsified and register U14/U15: (1) "20 franchises, all pre-1976" (`deferred-work.md:388`, `sprint-status.yaml:123`, `spec-2-10` D5') → the divergent series span **1948→1997**, all 20 being `00007` historical identities; (2) `deferred-work.md:388`'s `Milwaukee Hawks` `MPL`/`ML` example is wrong — `MPL` is Minneapolis Lakers (shown `ML`) and no "Milwaukee Hawks" row exists; (3) the AC's "removing the map changes nothing for any modern team on any surface" and U8's "rendering exactly as it does today" → falsified, with U15 as the response; (4) `epics.md:545`'s "`:423,424` stay on the name path **by construction** (no row, no stored code)" → amended by U15 (in the AC's frozen text, a bracketed dated pointer, per 2.10's D6' precedent); (5) `sprint-status.yaml` 2.11's row and its comment carry U14/U15.

**Added by review pass 1 (each one is the pin for a patched finding):**
- [x] `src/lib/__tests__/nba-utils.test.ts` — "matches the row without regard to case, as the caller's index does" (`boston celtics` → `BOS`, `  SEATTLE superSonics ` → `SEA`) -- E1/E4.
- [x] `src/pages/__tests__/predict-flow-regression.test.tsx` — the U15 case's lowercase retype (`seattle supersonics` → `SEA vs UTA`, `SS vs UTA` absent) -- E1's page-side arm.
- [x] `src/pages/__tests__/predict-flow-regression.test.tsx` — "answers a custom matchup with the stored codes the trigger label used (U15)": label → card → sheet, `SEA`/`UTA` on all three with `SS`/`UJ` absent -- E2/E5/V2.
- [x] `src/pages/__tests__/predict-phase-groups.test.tsx` — the captured Predict projection names `abbreviation` inside both enumerated `team_a:`/`team_b:` embeds -- V1.
- [x] `src/pages/__tests__/historical-page-archive.test.tsx` — "checks the hand-typed divergent-census table against the teams seed": all 20 `stored` codes exist in the `00005`+`00007` seed, table length pinned -- B10/E6.

### Review Findings

**Review pass 2 — fresh context, 2026-10-05, against commit `55de7ee`** — all 3 decisions resolved by the owner and all 12 patches applied the same day (see Spec Change Log). (Four layers: Blind Hunter, Edge Case Hunter, Verification Gap, Acceptance Auditor; 38 raw findings → 3 decision-needed, 12 patch, 0 defer, 14 rejected; the Verification Gap layer reported no gaps. Every claim was checked at the cited location in the current tree before a verdict was given.)

- [x] [Review][Decision] AC 1's "39-row change pinned per row" is met only by 20 synthetic rows — `divergentRows()` builds one fixture per franchise (1948–1967, every opponent `warriors`). The seed cross-check proves each `stored` code *exists* in the seed, not the name↔code *pairing*, and the 39-series / 47-cell / 1948→1997 census is reproducible from nothing in the tree. E6 (pass 1) called the census "a live-table census no jsdom fixture reaches", but the spec says it was measured against the committed archive CSV plus the `00005`/`00007` seeds, all of which are tracked. Options: (a) add a Node-environment test that recomputes 39/47/20 and the span from the committed CSV + seeds; (b) renegotiate AC 1's wording to "20 franchise pins + seed tie" (frozen-adjacent, owner's call); (c) accept as-is, with the owner look carrying the census. (blind-hunter + edge-case-hunter + acceptance-auditor; medium) — **Resolved 2026-10-05, owner chose (a):** new case "recomputes the 39-series / 47-cell / 20-franchise census from the committed archive and seeds" in `historical-page-archive.test.tsx` reads `game7_venues_curated.csv` (178 rows) + the `00005`/`00007` seeds and pins 39 / 47 / 1948 / 1997 and the exact name↔code set of `DIVERGENT_FRANCHISES`; M17 proves the pairing half.
- [x] [Review][Decision] No programmatic substitute was tried for the owner look or the owed accessible-name re-measure — AGENTS.md (Evidence discipline) requires naming the substitute tried. `node scripts/measure-predict-latency.mjs --probe-evidence` against `npm run preview` returns the accessibility tree and screenshots. It could settle the U14 placeholder's accessible name that `spec-2-10:173` marks as owed, and could screenshot `SEA`/`UTA` and the `/historical` codes before acceptance. Options: run it now and record the result here, or leave it to the owner look. (blind-hunter; low) — **Resolved 2026-10-05, owner chose run it:** measured over CDP against `npm run preview`; results in Verification → "CDP evidence (review pass 2, D2)".
- [x] [Review][Decision] The archive search's stored-code arm does not trim the query — `HistoricalPage.tsx:115` is `teamSearch.toLowerCase()`, so a pasted `SLB ` finds nothing, while `sas ` still hits Kansas City through the name arm. Trimming would only widen results (it never narrows, consistent with U3), but it changes the name path's behaviour for padded input, which the Always bullet says stays as it is. Options: trim for both arms; trim for the code arm only; leave it. (blind-hunter + edge-case-hunter + acceptance-auditor; low) — **Resolved 2026-10-05, owner chose trim for both arms:** `HistoricalPage.tsx:118` trims, `query === ''` gates the empty case; pinned in the code-search case (`SLB `, `  kck	`, whitespace-only), M16; recorded as a dated bracket on the frozen Always bullet.
- [x] [Review][Patch] `getTeamCode` reads `Object.prototype` members as placeholder codes — `PLACEHOLDER_ABBREVIATIONS[trimmed] ?? …` returns a function for a typed `constructor`/`toString` (label prints `function Object() { [native code] } vs TBD`; `|| 'TBD'` cannot catch it) and `Object.prototype` for `__proto__`, which a React child render throws on. Use `Object.hasOwn`, and add a pin. The flaw predates this story (the baseline map lookup had it), but this diff rewrote the line. [src/lib/nba-utils.ts:73]
- [x] [Review][Patch] The `sas` test comment states the U3 consequence backwards — it says the sort "puts the noise row first (1985 > 1980)", but 1985 is the Spurs (the correct match) and the Kansas City noise row (1980) comes second. [src/pages/__tests__/historical-page-archive.test.tsx:870]
- [x] [Review][Patch] The `team-logos` test title is stale — "extracts every alias entry from the source (guards the regex harness itself)" now asserts seed→alias coverage, so a red run reads as an extractor regression. [src/lib/__tests__/team-logos.test.ts:103]
- [x] [Review][Patch] `nba-utils.ts`'s header says "0 names absent from the table" without the decomposition B1 added to the records (30 franchise entries, all in the table; the 2 placeholder literals were never table names). [src/lib/nba-utils.ts:8-11]
- [x] [Review][Patch] `deferred-work.md`'s BUILT paragraph says "the spec sits at `review`" — the spec is `done`; the *story* is at `review` (the Change Log's own rule). [_bmad-output/implementation-artifacts/deferred-work.md:388]
- [x] [Review][Patch] "pre-1976" survives uncorrected later in the same `deferred-work.md` entry — "leaves every visible pre-1976 code unfindable". [_bmad-output/implementation-artifacts/deferred-work.md:388]
- [x] [Review][Patch] The UJ-2 defer cites `src/lib/nba-utils.ts:39-52`'s "documented non-claims" — those lines are `getTeamCode`'s resolution-order comment; the no-nickname/city/fuzzy statement is `PredictPage.tsx:427-430`. [_bmad-output/implementation-artifacts/deferred-work.md:487]
- [x] [Review][Patch] The `spec-2-10` D5' pointer misnames its examples — it says "the two examples named here: the stored-`SEA` SuperSonics and stored-`WSB` Bullets rows are 1978-1996 series", but D5' names SuperSonics and **Philadelphia Warriors**, which is not a 1978–1996 franchise. B2 was marked patched; this site is still wrong. [_bmad-output/implementation-artifacts/spec-2-10-nba-by-default-league-chip-and-in-record-gloss.md:32]
- [x] [Review][Patch] `epics.md` has two falsified Story 2.11 clauses with no dated pointer — `:550`, "**two** test files are hidden consumers … re-key it onto `TEAM_LOGO_ENTRIES`" (four consumers; the build re-keyed onto `parseTeamsSeed` and Design Notes calls the `TEAM_LOGO_ENTRIES` re-key circular), and `:549`, "the name-derived initialism as the fallback for a custom matchup" (U15's index now serves the custom matchup on the answer surfaces). [_bmad-output/planning-artifacts/epics.md:549-550]
- [x] [Review][Patch] The U14 bracket's count "9 `getByPlaceholderText` references move with the copy" is wrong — the baseline held **7** (measured by `git show 9c91056:… | grep -c`), all 7 moved, and the other 2 are new call sites. B13's "7 → 9" turned a correct number into a wrong one. [_bmad-output/planning-artifacts/epics.md:543]
- [x] [Review][Patch] The `sprint-status.yaml` 2-11 tallies don't add up — "18 accepted … 5 refuted, 2 deferred" is 25 against 23 findings (the triage table has 15 whole patch rows, B6 and B13 split, B7 the one whole defer, 5 rejects). The BUILT line's "452 tests" also conflates the build (451) with the audit (+1). [_bmad-output/implementation-artifacts/sprint-status.yaml:139,147]
- [x] [Review][Patch] `epic-2-context.md`'s Story 2.11 bullet still says "backlog, see `deferred-work.md`", although the same commit moved the story to `review` with U14/U15. [_bmad-output/implementation-artifacts/epic-2-context.md:19]

**Rejected (pass 2):**
- `false` — the card/sheet skip `rowFor` when a present FK row names a different team (blind-hunter, edge-case-hunter ×2). A present row always carries `teamAName`: any selection change clears the result (`PredictPage.tsx:105-128`), and `predict-game-7` echoes the client's own `full_name` back (`index.ts:380-381`).
- `low` — a typed name prints `BC` while `games` is loading or after the fetch failed (edge-case-hunter). The window is transient, the failure state is visible (`:784`), and the fix adds a guard. This repeats pass 1's B8/E3.
- `low` — a team found only in a non-reconciling series is missing from the index (edge-case-hunter). Each of the 58 archived franchises appears in several series, and a fix would rebuild the index from pre-filter rows.
- `low` — repeated internal whitespace (`Seattle  SuperSonics`) misses the row (edge-case-hunter). Unlikely to be typed, and the fix adds normalisation in two places.
- `false` — the commented-out Matchup block is uncompilable (edge-case-hunter). The spec's Never bullet orders it untouched, and re-enabling it fails loudly in `tsc -b`.
- Spec edit — the frozen matrix `Nowhere FC` → `NOW` vs the code's `NF` (acceptance-auditor, blind-hunter). Rejected as a review patch because the fix edits the spec under review — **then renegotiated by the owner, 2026-10-05:** the cell now reads `NF` with a dated bracket (E7 closed).
- Spec edit — the spec's own frozen block carries no markers for E7/B13 (blind-hunter).
- Spec edit / `low` — tally and line-citation disagreements inside the spec (blind-hunter). Line citations in test comments drift with every edit, so they were not chased.
- Spec edit — the Code Map's U6 count mixes files (blind-hunter).
- Spec edit — the `docs/plans/…` delegation residue and the unparseable "Never violation" sentence in Implementation Notes (blind-hunter).
- Spec edit — the Tasks line's "9 references moved" (acceptance-auditor). The `epics.md` half is the patch above.
- `low` — the seed oracles read only `00005` + `00007` (blind-hunter). `00009` is the only later migration that writes `abbreviation`, and it sets `LAC`, already seeded. The reader convention is shared (`deferred-work.md:343`), and widening it adds complexity.
- `false` — the `PLACEHOLDER_ABBREVIATIONS` lookup is case-sensitive (blind-hunter). The baseline map was equally case-sensitive, and the literals reach the helper only from the code's own `'Team A'` fallbacks.
- `low` — `epic-2-context.md` carries 2.12/2.10 notes outside this story (acceptance-auditor). The notes are accurate, and no harm was named. The stale 2.11 bullet is the patch above.

**Acceptance Criteria:**
- Given a DB-backed archive row whose stored code differs from its name initialism, when the archive renders, then the cell shows the stored code, and the 39-row change is pinned per row with mutation evidence.
- Given a fan types a stored code (case-insensitively) into team search, then every series carrying that abbreviation on either FK matches, and the name path returns what it returns today.
- Given a fan types a team's `full_name` in the custom-matchup form and a loaded `games` row carries that name, then the label prints that row's stored `abbreviation` (`Boston Celtics` → `BOS`, `Seattle SuperSonics` → `SEA`), and a name with no matching row keeps today's truncation/initialism behavior (`Celtics` → `CEL`, `Utah J` → `UJ`) — U15. **[Amended by owner decision U16, 2026-10-05: a name the logo alias table knows prints that team's stored code (`Celtics` → `BOS`, `Jazz` → `UTA`); a name no alias knows keeps the name path (`Utah J` → `UJ`, `Celtic` → `CEL`).]**
- Given the map is gone, then `Team A`/`Team B` still print `TMA`/`TMB` wherever the code chain falls to the placeholder literal, and blank custom input still prints `TBD`.
- Given `TEAM_ABBREVIATIONS` no longer exists, then no test imports it, no cross-source guard iterates an empty collection, and `npm run gate` is green.

## Implementation Notes

**Built 2026-10-04 against `baseline_commit` 9c91056. Line numbers below are post-edit; the
Code Map's citations are the baseline's, and the two differ only by drift inside
`PredictPage.tsx` (the file grew 42 lines: the U15 comment + index + the site comments).**

- `src/lib/nba-utils.ts` — `TEAM_ABBREVIATIONS` deleted; `PLACEHOLDER_ABBREVIATIONS` (`:12-15`)
  and `getTeamCode(name, ...rows)` (`:68-74`) added as Design Notes shaped them: trim →
  first row whose `full_name` equals the name **case-insensitively** (added at review, E1/E4, so the
  arm agrees with `PredictPage`'s lower-cased index) **and** whose `abbreviation` is non-empty →
  placeholder literal → `getTeamAbbreviation`. `getTeamAbbreviation` (`:27-37`) keeps both
  branches and loses only the map lookup, so the bare name path now answers `BC` for
  "Boston Celtics" — documented in its own comment block (`:17-26`), which is what makes U15's
  row arm load-bearing rather than cosmetic. `getRoundImportance` untouched.
- `src/pages/HistoricalPage.tsx` — predicate `:104-130` gained `teamACode`/`teamBCode` (`:119-120`)
  and two OR arms (`:126-127`); the name arms are byte-identical to the baseline's, so the
  predicate **gained** an arm and did not swap one. Display `:233-234` route `abbrevA`/`abbrevB`
  through `getTeamCode` with the FK row. Placeholder `:192` carries U14's copy. The `:84-98`
  178-vs-160 comment and the `:64` embed are unchanged — no query edit anywhere in the story.
- `src/pages/PredictPage.tsx` — `teamRowByName` `:431-442` (a `useMemo` over `games`, both
  embedded sides, lower-cased `full_name`, first hit wins, rows with an empty `abbreviation`
  never indexed) and `rowFor` `:444`; the custom branch `:453-454` is
  `getTeamCode(customInput.team_X, rowFor(customInput.team_X)) || 'TBD'`; the DB branch `:460`;
  `renderSeriesOption` `:522`; the result-card IIFE hoists `rowA`/`rowB`/`codeA`/`codeB`/
  `winnerCode` at `:1203-1207` and the detailed sheet mirrors it at `:1294-1298`. Both `rowA` and
  `rowB` read `selectedSeries?.data?.team_X ?? rowFor(teamXName)` — added at review (E2/E5/V2),
  because a custom selection carries no `data` (`:915`) and the answer surfaces were falling to
  the name path beside a label that had already resolved the row. Print sites: card winner `:1235`
  and the losing ternary `:1253-1256`; sheet span `:1327`/`:1332`, winner `:1343`, losing ternary
  `:1361-1364`. `predicted_winner` gets both candidate rows (`:1207`, `:1298`) per U7 — no
  contract or function file changed. The commented-out Matchup block sits at `:1215-1226` and is
  untouched; its two `getTeamAbbreviation` calls stay dead and un-imported (the file imports only
  `getTeamCode`), which is why deleting the import would have been a `Never` violation the block
  cannot be compiled anyway.
- Hidden consumers, all four: `nba-utils.test.ts` moved its map-through pins onto `getTeamCode`
  with row fixtures and gained the absence pin (`expect(nbaUtils.TEAM_ABBREVIATIONS).toBeUndefined()`),
  the `PLACEHOLDER_ABBREVIATIONS` key-set pin, the two-candidate winner pin and the empty-`abbreviation`
  never-blank pin — 15 cases. `team-logos.test.ts` re-keyed its oracle on the DB seed through the
  shared `parseTeamsSeed` reader (`:5,101`) with `toHaveLength(EXPECTED_TEAM_COUNT)` **and** the
  non-vacuity comparison (`:106-107`) ahead of the loop — 12 cases. `render-smoke.test.tsx` renders
  `Team {name}` and asserts `button.textContent`, dropping both the map consumer and the standing
  accname violation. `predict-flow-regression.test.tsx`'s dict-hit pins became row-hit pins (U15).
- Page pins added: 8 cases in `historical-page-archive.test.tsx` (the 20-franchise table with its
  name-path rot-guards, code search on either FK case-insensitively, the `NY` leg with a fixture
  self-check, the never-narrowed name leg including `sas`→Kansas City newest-first, join-miss
  `TMA`/`TMB`, empty `abbreviation`, reset-on-code-search, and the whole-row-embed projection pin)
  and 2 in `predict-flow-regression.test.tsx` (stored codes on the card **and** the detailed sheet;
  join-miss `TMA vs MIA`).
- Not touched, by the boundaries: any `supabase/**`, any migration, any route/page-count/prerender
  file, the game tiles and home/away derivation, `:306-307`'s request builder, the logo/tile paths,
  and every PostHog event name. `historical_filter_applied` still fires with
  `filter_type: 'team_search'` for a code query — pinned in the new archive case.

## Spec Change Log

- **2026-10-04, implementation pass — one deviation from the Code Map's arithmetic, recorded
  rather than hidden.** U6's inventory expected **16 live `getTeamCode` calls on 14 lines**; the
  build has **14 calls on 12 lines** (2 in `HistoricalPage.tsx:233-234`, 12 in
  `PredictPage.tsx:453,454,460×2,522×2,1203,1204,1205,1293,1294,1295`). Nothing was left
  unconverted: the two answer surfaces each compute three codes once (`codeA`, `codeB`,
  `winnerCode`) and their four print sites read those locals, so 8 baseline call expressions
  became 6 helper calls. The invariant U6 actually protects — no site on a surface still on the
  bare name path — holds at every print site, and each surface's resolution order is one call
  list rather than four repetitions of the same arguments. Mutation evidence covers both IIFEs
  separately (see Verification, M3 and M3b).
- **2026-10-04 — the plan file this spec's Documentation Mode cites does not exist in this
  workspace.** `docs/plans/2026-10-28-dual-app-ship-plan.md` (and no `docs/plans/` directory at
  all; `docs/` holds `CHANGELOG.md`, `CURRENT_DATA_MODEL.md`, `NBASeriesResults.xlsx`, `archive/`)
  was verified absent by glob before any edit, so no content from it was injected into this task
  and nothing in it conflicted with the delegated spec. The spec therefore stayed the single
  source of truth, the task proceeded, and no irreversible operation (push, deploy, migration,
  delete) was performed.
- **2026-10-04 — test fixtures retyped.** `lakers`/`warriors`/`nets`/`colonels` in
  `historical-page-archive.test.tsx` were declared `Series['team_a']` (i.e. `Team | undefined`);
  they are now `Team`, which is what lets the new `seriesBetween(year, teamA: Team, teamB: Team)`
  builder narrow ids without casts. No assertion changed by it.
- **2026-10-04 — records written in this commit** (task 5, all four): `epics.md` gained U14 and
  U15 inline in Story 2.11's AC block and bracketed-dated falsifications of "removing the map
  changes nothing for any modern team on any surface" and "rendering exactly as it does today",
  plus the `:423,424` "by construction" amendment; `deferred-work.md:388` gained the
  1948→1997 correction, the `MPL` = Minneapolis Lakers correction (no "Milwaukee Hawks" row
  exists), the four-not-two hidden-consumer note, and the built-but-unaccepted status line;
  `sprint-status.yaml`'s 2-11 comment carries the same corrections with U14/U15 and the row flips
  `in-progress` → `review`; `spec-2-10` D5' gained a bracketed dated pointer inside its frozen
  block, per 2.10's own D6' precedent (the frozen wording is left as written).
- **2026-10-04, review pass 1 — 23 findings triaged, five patched, two deferred, five refuted; no
  loopback.** The triage is the table in Review Triage Log; what changed in the tree because of it:
  `getTeamCode`'s row arm became case-insensitive after trim (E1/E4 — the arm contradicted the
  caller's lower-cased index and both records); both answer surfaces' `rowA`/`rowB` gained
  `?? rowFor(name)` so a custom matchup resolves the same way on the label, the card and the sheet
  (E2/E5/V2); the Predict projection is now pinned for `abbreviation` in both enumerated embeds
  (V1, with the reviewer's 40/40-green demonstration as the evidence); the 20 hand-typed divergent
  pairs are cross-checked against the `00005`+`00007` seeds (B10/E6); and eight record errors were
  corrected (B1–B5, B11, B13's count, B6's `spec-2-10:173` half) plus `epics.md:547`'s `NOW`
  bracket. Three tests added — suite count 452 → **455** (`nba-utils` 15→16, `predict-flow-regression`
  30→31→… 31, `historical-page-archive` 33→34). Two findings are frozen-text or owner-visible-copy
  calls the build may not make: the matrix `:63` `NOW` cell (E7) and the same count sentence at `:32`
  (B13) are both inside `<frozen-after-approval>` and are escalated for the owner's renegotiation, and
  the label/placeholder pairing (B7) plus PRD UJ-2's nickname promise (B6b) are in
  `deferred-work.md`. **The step-03 implement subagent could not be re-engaged** (it hit its turn
  ceiling with an empty report in the previous pass), so per step-04's fallback the patches were
  applied by this session and re-verified here rather than delegated.
- **2026-10-04, review pass 1 (audit of the build session's mutation claim) — one test added, and
  the claim replaced.**
  The build reported "seven mutation runs, each proven red then reverted"; the runs were not
  reproducible from anything in the tree, and the harness the review session first wrote to check
  them was itself broken twice (`--reporter=basic` is not a reporter in this Vitest, so every spawn
  exited 1 at startup and read as RED; and `\e` in a JS regex literal is a literal `e`, not ESC, so
  the ANSI codes survived and real failures never parsed). Re-run with green baselines and a
  byte-exact restore: 13/13 mutations redden a named test, tabulated in Verification.
  That audit also found a genuine gap: the card's `codeA` sat on the untaken arm of a ternary on
  both answer surfaces, so no existing case could redden a mutation of it. Added
  "prints the stored code for the losing side when the other row wins" (predicted winner flipped to
  the second candidate row), which is still the only case that reaches the card's `codeA` arm —
  `:1205`, printed only when side A loses (line numbers re-derived after pass 1's edits). The suite
  count moves 451 → 452.
- **2026-10-05, review pass 2 (fresh context, against `55de7ee`) — 38 raw findings → 3 decisions,
  12 patches, 0 defers, 14 rejects; every decision answered by the owner and every patch applied in
  one pass.** Owner calls: **D1 (a)** — the census is now recomputed from committed files rather than
  recited: "recomputes the 39-series / 47-cell / 20-franchise census from the committed archive and
  seeds" reads `supabase/scripts/pipeline/data/game7_venues_curated.csv` (178 series with both
  stored codes) plus the `00005`/`00007` teams seeds and pins 39 series, 47 cells, 1948→1997 and the
  exact name↔code set of `DIVERGENT_FRANCHISES`. That settles AC 1 and the half of E6 pass 1 called
  unreachable — the inputs were committed all along. Its premise (no modern cell could diverge) was
  re-verified against `9c91056`'s retired map: 30 of 30 seed names present, 0 value mismatches.
  **D2** — the owner look's programmatic substitute was run (Verification → CDP evidence). **D3** —
  the archive query is trimmed before both arms (`HistoricalPage.tsx:118`), recorded as a dated
  bracket on the frozen Always bullet. **Frozen edit (owner-authorised, 2026-10-05):** matrix `:63`
  now reads `NF` for `Nowhere FC`, with a dated bracket naming E7; the only frozen-text changes in this
  pass are that cell and the D3 bracket. Patches: `getTeamCode`'s placeholder step is an own-key test
  (`Object.prototype.hasOwnProperty.call` — `Object.hasOwn` is ES2022 and the app's `lib` is ES2020),
  pinned by "never reads an Object.prototype member as a placeholder code"; the `sas` comment, the
  `team-logos` case title and the `nba-utils.ts` header decomposition corrected; record corrections in
  `deferred-work.md` (spec-vs-story status, the surviving "pre-1976", the UJ-2 citation),
  `spec-2-10` D5' (both named examples, and the SuperSonics span is 1978–1997, not 1996),
  `epics.md` (`:543` count 7 + 2 new, not 9 moved; dated pointers on `:549` and `:550`),
  `sprint-status.yaml` (the pass-1 tally summed to 25; build 451 vs audit 452) and
  `epic-2-context.md` (2.11 was still "backlog"). Mutation evidence M15–M17 in Verification.
  `npm run gate`: **exit 0, 24 files, 552 tests** (the count includes Story 2.13's suites, which
  landed after `55de7ee`), code read from the run itself.
- **2026-10-05, owner decision U16 (after review pass 2) — the custom form's code follows its logo.**
  The owner observed that typing `Jazz` showed the Jazz logo beside `JAZ`. Measured over every alias in
  `team-logos.ts`: 62 agreed, 119 did not (49 nicknames, 70 spacing/punctuation variants, including
  `UtahStars` printing the Jazz's `UTA` beside the Stars logo). Built: `getAliasTeamCode` in
  `team-logos.ts` (each entry's last alias, through `normalizeTeamAlias` — the same map key the logo
  uses) and `getTypedTeamCode` beside it (row → alias → `getTeamCode`'s placeholder and name path; it
  sits in `team-logos.ts` because `nba-utils.ts` is also compiled by the pipeline program, which has no
  `import.meta.env` types — `tsc -b` failed with TS2339 when it was first placed there). `PredictPage` routes the custom label through it, and the card and the sheet pick it with
  `codeFor` only when `selectedSeries.source === 'custom'`; series selections and the archive keep
  `getTeamCode`. Pins: `team-logos.test.ts` gains "pairs every seeded full_name with its own stored
  code" and "files no normalized alias under two entries"; `nba-utils.test.ts` gains four
  `getTypedTeamCode` cases (imported from `team-logos.ts`), including all ten shared nicknames; `predict-flow-regression.test.tsx`
  moves `Celtics` → `BOS` and `SuperSonics` → `SEA` (with `Celtic` → `CEL` keeping the truncation
  pin) and gains a label case (`UTA vs PHI`, `UTS vs GSW`, `BLB vs SAC`, `NOP`) plus a card + sheet
  case typed as nicknames (`Sonics` vs `Jazz`). Mutation evidence M18–M21 in Verification. The archive
  was deliberately left as is (owner call). Frozen-text pointers: U15's nickname clause, the Never
  bullet, matrix `:63`, AC 3, and Design Notes. `npm run gate`: exit 0, 24 files, 560 tests (the
  first attempt died with worker heap exhaustion at 758 MB free on the machine, not a test failure;
  the re-run was clean), and M18–M21 were re-run on the final file layout with the same results.
- **Frontmatter**: `status` `in-progress` → `review` → `done` at step 05 (2.5's precedent: the spec
  is finished work, the *story* stays at `review` in `sprint-status.yaml` because the owner's preview
  look is the acceptance), `review_loop_iteration` 0 → 1 → 2 (review pass 2, 2026-10-05).

## Review Triage Log

**Iteration 1, three layers against `story-2-11-review.diff` (1248 lines / 124,443 B, 13 files —
the file has since been rewritten to the patched tree: 1409 lines / 141,459 B, 14 files, the extra
one being `predict-phase-groups.test.tsx`):
23 findings (B1–B14 edge/breadth, E1–E7 claims and boundaries, V1–V2 verification).** Every claim
was verified at the cited location before a verdict was written — **one row per finding, 23 rows,
with findings that share a root cause listed separately and cross-referencing the shared fix.**
Routes: 5 patches (one per distinct root cause: the case-insensitive arm, the answer-surface
fallback, the projection pin, the seed cross-check, and the record corrections), 2 defers (appended
to `deferred-work.md`), 5 rejects (refuted below), plus partial rejects inside B6 and B13.
**No `intent_gap` and no `bad_spec` → no loopback; `review_loop_iteration` stays 1.** Suite count
moves 452 → 455.

| # | Finding | Verdict | Evidence, and route |
|---|---|---|---|
| B1 | Retired-map arithmetic is "arithmetically impossible" (30 vs 32 vs "0 names absent") | low | Measured: the map held **32** entries = **30** franchise names + the `Team A`/`Team B` literals U8 declares are not `teams` rows, so "0 map names absent" was true of franchise names and `spec-2-11:20`'s "29 of the 59 seeded names absent" is their complement, not a contradiction. No claim was wrong; the three artifacts stated counts without the decomposition that reconciles them. **patch (record)** — the decomposition is now written into `deferred-work.md:388`. |
| B2 | Two correction pointers name a `WSB` Bullets row that the text they point at never named | medium | Confirmed at both sites: `spec-2-10` D5' names SuperSonics and Philadelphia Warriors; `deferred-work.md`'s "named below" list holds SuperSonics/Warriors/Minneapolis-Lakers/Colonels. **patch (record)** — each pointer now names a row the same suite actually pins (stored-`SEA` SuperSonics two clauses below, stored-`WSB` Washington Bullets in the pinned table). |
| B3 | The falsified `Milwaukee Hawks` example was annotated, not struck | medium | Confirmed: the false pair survived inline with a bracket spliced inside the surrounding parenthetical, so the sentence read as a nested aside. **patch (record)** — struck; `MPL`/`ML` now shown as Minneapolis Lakers with the correction in a bracket of its own. |
| B4 | `deferred-work.md` says both "closes with the acceptance" and "nothing stays open" | medium | Confirmed, and contradicted in the same diff by `sprint-status.yaml` moving 2-11 to `review`. **patch (record)** — replaced with "the owner's acceptance only, not work", naming the status file that carries it. |
| B5 | The BUILT paragraph's spec pointer is the `sprint-status` story key, not a path | medium | Confirmed: no file with the long name exists on disk. **patch (record)** — pointer now `_bmad-output/implementation-artifacts/spec-2-11-one-team-code-everywhere.md`, with the key called out as not a path. |
| B6 | No stale-claim sweep for a copy-and-semantics change, unlike the 2.10 precedent | medium | Three clauses. (a) `prd.md:161` FR-10 "searching by team name" — **rejected**: the story added an arm, name search still returns what it returned, so the promise is not falsified. (b) `prd.md:55` UJ-2 promises nickname matching the custom form never did — **real, out of scope → defer**. (c) `spec-2-10:173` still records the CDP accessible name for the placeholder U14 replaced — **real → patch (record)**: bracketed dated pointer added there, mechanism unchanged and now load-bearing, re-measure owed. |
| B7 | U14's redundancy rationale rests on a label AT never sees; `:188` has no `htmlFor`, `:191` no `id` | medium | Confirmed at both lines — which is exactly what makes the placeholder the field's accessible name (what `spec-2-10:173` measured). Pairing is a real WCAG gap under NFR-A1, but fixing it changes the field's accessible name, which is owner-visible copy and outside this story's contract. **defer** — registered with the 2.10 pointer, to land beside Story 5.2's accessibility pass. |
| B8 | Typed names fall to initialisms "silently" while `games` is empty or its fetch failed | false | Not silent and not durable: `PredictPage.tsx:784` renders the visible picker-failure state and `:173-179` sets `seriesListFailed`; when the list resolves the same index answers `BOS`. The permanent miss of the same shape (a name no loaded row carries) is already documented in Design Notes. **rejected** |
| E3 | The same exposure filed as a missing guard (`games.length === 0 && selectedSeries?.source === 'custom'` → a visible hint) | false | One root cause with B8, kept as its own row rather than merged: the proposed branch would state a second condition for a failure the page already reports at `:784`, and it is only true inside a window that closes on its own — a guard for a state with no observable steady state. **rejected** |
| B9 | "First hit wins" has no test; the tie branch runs only untaken | false | Unreachable by fixture: the seed's 59 `full_name`s are distinct and both embedded sides feed one index, so a name-keyed collision requires a `supabase/**` change this story's boundaries forbid. A test would pin a state no writer can produce. **rejected** |
| B10 | `DIVERGENT_FRANCHISES` is free-floating — a seed `abbreviation` change reddens nothing | medium | Confirmed: the 20 pairs were hand-typed and never checked against the seeds, while a sibling suite already imports `parseTeamsSeed`. **patch** — the new archive case cross-checks all 20 `stored` codes against the `00005`+`00007` seed and asserts the table's length; M14 proves the tie (moving one code reddens that case and nothing else). |
| E6 | The claim "the 39-row change is pinned per row" rests on synthetic pairs, with 39/47/20 unasserted anywhere | medium | Confirmed, and only half of it is settleable inside this story: the pairs can be tied to the seeds (done — same root cause and the same patch as B10), but 39 series / 47 cells is a live-table census no jsdom fixture reaches, and the name↔code *pairing* would need a `supabase/**` read this story's boundaries forbid. Both limits are stated in the new test's own comment and in Verification's Owner look, so the pin no longer claims what it does not settle. **patch** |
| B11 | Comment says "Three `SEA` in the sheet" above `toHaveLength(2)` | medium | Confirmed: the enumeration listed two sites and the assertion counted two. **patch (record)** — rewritten to "two `SEA` (matchup span + losing line) and two `UTA` (span's other side + winner line)", which is what the pair of `toHaveLength(2)` pins. |
| B12 | The new code arm is substring-matching, unbounded and undocumented | false | Both halves are pinned in the contract the reviewer's own brief carried: frozen I/O matrix `:58` gives `NY` → 19 rows, and the archive case "finds a series by the stored abbreviation on either FK, case-insensitively" exercises that leg with a fixture self-check. Short-input widening is the same rule as the name arm U3 orders kept. **rejected** |
| B13 | "the archive suite's 7 `getByPlaceholderText` references" is 9; the copy has no shared constant | medium (count) | Confirmed by grep: 9 sites after this diff. **patch (record)** for the count — `epics.md` and the Tasks line now read "7 → 9"; the same sentence inside the frozen Intent block (`:32`) is left as written, frozen text being owner-owned exactly as E7's matrix cell is. **rejected** for consolidation: spelling the literal at each site is what makes the pin *be* the copy's pin; a module constant would let one edit move the copy and its assertion together. |
| B14 | No guard keeps "one team code everywhere" true, and the dead Matchup block is left uncompilable | false | The block's compile state is not debt: `:50`'s Never orders it untouched, and re-enabling it is a loud `tsc -b` error because `getTeamAbbreviation` is no longer imported. Grep confirms the only non-test call sites are `PredictPage.tsx:1219,1224` inside that comment; a "no page may import the name path" assertion would be a new guard for a regression with no remaining entry point, and `nba-utils.test.ts`'s absence pin already reddens a second hardcoded table inside the module. **rejected** |
| E1 | Step 1 compares exact-after-trim while the caller's index is lower-cased, so `boston celtics` hits the index and is then rejected | medium | Confirmed pre-patch at `nba-utils.ts:67` (`=== trimmed`) against `PredictPage.tsx:436`'s lower-cased key. **patch** — the arm is case-insensitive after trim, with the *why* (index and arm must agree) written into the step-1 comment; pinned at the unit by "matches the row without regard to case, as the caller's index does" and at the page by the U15 case's lowercase retype (`seattle supersonics` → `SEA vs UTA`, `SS vs UTA` absent). M10 reddens both. |
| E4 | …the same defect filed as a claim: `epics.md` and Design Notes both say the row resolves "lower-cased `full_name`, exact after trim", which `:67`'s exact compare falsified | high | Confirmed — the records promised case-insensitivity the code did not implement, so this was a contract break, not a style gap (it is why E1's fix moved to the code rather than to the wording). Same patch, same pins as E1; Design Notes now state the arm and the reason for it. **patch** |
| E2 | The card and the sheet read only `selectedSeries?.data?.team_a/b`, which a custom selection never carries, so a custom matchup prints initialisms there | medium | Confirmed: `:915` calls `setSelectedSeries({ source: 'custom' })` with no `data`, and the `:1199-1200` comment accepted the fall-through. **patch** — `rowA`/`rowB` on both surfaces fall to `?? rowFor(name)` (two lines per surface). |
| E5 | …the same defect filed as a claim: "one order on every surface — the story title holds on all three" is falsified for the answer surfaces | high | Confirmed — the story title is the contract, and the label half of it held while the two answer halves did not. Same root cause and the same patch as E2; M11/M12 show the card half and the sheet half are each pinned independently. **patch** |
| V2 | …the same defect filed as a verification gap: no case pins what the custom-path card and sheet print, so intent vs oversight was unobservable from the suite | medium | Confirmed — the two card cases are both `db.single`-backed, and the custom cases asserted method labels and clearing, not codes. Whether the divergence was acceptable was an owner call; the patch makes it unnecessary by making the surfaces agree. **patch** — the new case "answers a custom matchup with the stored codes the trigger label used (U15)" runs label → card → sheet, pinning `SEA`/`UTA` on all three with `SS`/`UJ` absent. |
| V1 | Nothing pins `abbreviation` in PredictPage's **enumerated** embeds, so a column-pruning pass reverts the page silently | medium | The demonstration is reproducible as filed: with `abbreviation,` deleted from all three embeds at `PredictPage.tsx:41-43`, both Predict suites stayed green (40/40) because every mock returns fixture rows regardless of `select`. The archive side of the same dependency is pinned at `historical-page-archive.test.tsx:903-904`, so the contract was half-guarded. **patch** — two projection assertions added at `predict-phase-groups.test.tsx:222-228` mirroring it. |
| E7 | The frozen I/O matrix claims `Nowhere FC` → `NOW`; code and test both print `NF` | high | Confirmed by measurement: two words take the initials arm, so `Nowhere FC` → `NF`; `NOW` is what a single-word `Nowhere` truncates to. **patch (record) + owner escalation** — the non-frozen bracket at `epics.md:547` is corrected in this pass; matrix `:63` sits inside `<frozen-after-approval>`, so the build did not touch it and the cell is escalated for the owner's renegotiation. |

## Design Notes

Helper shape (new, `src/lib/nba-utils.ts`):

```ts
export const PLACEHOLDER_ABBREVIATIONS: Record<string, string> = { 'Team A': 'TMA', 'Team B': 'TMB' };
export const getTeamCode = (name, ...rows) => {
  const trimmed = (name ?? '').trim();
  const needle = trimmed.toLowerCase();
  const match = rows.find((row) => row?.full_name?.toLowerCase() === needle && row.abbreviation); // 1. stored code
  if (match) return match.abbreviation;
  return PLACEHOLDER_ABBREVIATIONS[trimmed] ?? getTeamAbbreviation(trimmed);                       // 2. literals, 3. name path
};
```

Step 1 is case-insensitive after trim (added at review, E1/E4) because the caller's index
(`PredictPage.tsx:431-442`) is keyed on the lower-cased `full_name`; if the arms disagreed, a
lowercase-typed name would hit the index, be rejected by the helper, and print an initialism
forever.

`rows` is variadic because the predicted-winner sites hold two candidate rows and only a `full_name` to discriminate (`contract.ts:51-56` carries names; `supabase/functions/predict-game-7/index.ts:372,380` echoes the exact row names back, so equality matching is safe and U7 needs no deploy). Step 2 is load-bearing, not decorative: the result card's own fallback chain (`PredictPage.tsx:1192-1193`, `:1289-1290`) can hand the helper the literal `'Team A'`, which the map resolves to `TMA` today and the bare initialism would turn into `TA`. Golden divergence pair for the tests: `Seattle SuperSonics` → stored `SEA`, shown today `SS`.

U15 needs no new helper — the caller supplies the row. `PredictPage` builds one index over the rows it already has and consults it in the custom branch:

```ts
// lower-cased full_name -> team row, from the rows `fetchAllGames` already loaded
const teamRowByName = useMemo(() => { /* both embedded sides of every `games` row, first hit wins */ }, [games]);
const rowFor = (name: string) => teamRowByName.get((name ?? '').trim().toLowerCase());
// :423-424 become
getTeamCode(customInput.team_a, rowFor(customInput.team_a)) || 'TBD'
```

`full_name` only, and only exact-after-normalize — no nickname, city or fuzzy arm. **[Superseded on the custom form by owner decision U16, 2026-10-05: `getTypedTeamCode` (`team-logos.ts`, beside `getAliasTeamCode`) adds the logo alias arm after the row; `getTeamCode` keeps this contract for every FK-backed surface.]** That keeps the arm's contract one-line ("a name the database spells this way has this code") and leaves every non-match on today's behavior rather than inventing a second matching rule beside `HistoricalPage`'s substring search.

A literal re-key of `team-logos.test.ts:85` onto `TEAM_LOGO_ENTRIES` would be circular — the extractor at `:77` already reads its list out of that same file, so the loop would assert a file agrees with itself. The DB seed is the other source, which is the agreement the guard exists to protect.

## Verification

**Commands:**
- `npm run gate` -- expected: exit 0 (read the code from the run itself, never from a pipe).
- `npx vitest run src/lib/__tests__/team-logos.test.ts` -- expected: pass with the seed loop iterating 59 values, not 0.

**Mutation evidence — 18 runs in two passes, every one with a green baseline established first and
a byte-exact restore verified after.** Pass 1 (the review session, against the unpatched tree;
baselines `historical-page-archive` 33, `predict-flow-regression` 30, `nba-utils` 15, `team-logos`
12 — all passing unmutated; each run edited one file, ran one named suite, then `md5sum -c`
confirmed the restore). **13/13 reddened a named test:**

| # | Mutation | Reddened |
|---|---|---|
| M1 | Predicate loses both stored-code arms | 4 archive cases: code search on either FK, the `NY` leg, the never-narrowed name leg, reset-on-code-search |
| M2 | Archive cell calls `getTeamCode(name)` with no row | "prints the stored abbreviation on all 20 divergent franchise rows" |
| M3 | Result card resolves `predicted_winner` with no rows | card + details case, and the flipped-winner case |
| M3b | Details sheet resolves `predicted_winner` with no rows | the same two |
| M3c | Card `codeB` drops its row | "answers a DB-backed prediction…" (losing line `UJ` ≠ `UTA`) |
| M3d | Card `codeA` drops its row | "prints the stored code for the losing side when the other row wins" — the only case that reaches this arm |
| M3e | Sheet `codeA` drops its row | both sheet cases |
| M4 | Custom branch drops U15's `rowFor` lookup | the trigger-label pin and the U15 case |
| M5 | The deleted map returns with one entry | "leaves no second hardcoded name→code source in the module" |
| M6 | `getTeamCode` prints a row's empty `abbreviation` | "never prints a blank cell: an empty abbreviation falls through" |
| M7 | The placeholder-literal step is removed | the join-miss pins (`TA`/`TB` appear) |
| M8 | `getSeriesLabel`'s DB branch drops both rows | 18 predict-flow cases |
| M9 | `renderSeriesOption` drops both rows | the picker case |
| M10 | Step 1 back to exact-after-trim (`row?.full_name === trimmed`), undoing E1/E4 | "matches the row without regard to case, as the caller's index does" **and** the page-side pin "resolves a typed custom name through the rows the picker already loaded (U15)" |
| M11 | Card `rowA` stops falling back to `rowFor` (E2/E5/V2, card half) | "answers a custom matchup with the stored codes the trigger label used (U15)" |
| M12 | Sheet `rowA` stops falling back to `rowFor` (same patch, sheet half) | the same case, failing on the sheet's `SEA` count |
| M13 | `abbreviation` pruned out of the enumerated `team_a:` embed (V1) | "asks PostgREST for the derivation inputs and never for the dropped column" — and **only** that: `predict-flow-regression` stayed green, which is the reviewer's demonstration inverted |
| M14 | One hand-typed `DIVERGENT_FRANCHISES` `stored` code moved off the seed (`ROR` → `ZZZ`) (B10/E6) | "checks the hand-typed divergent-census table against the teams seed" alone — the display pins read the same literal and stay green by design, so this is the only tie between the table and the seeds |

Pass 2 (this session, against the patched tree; baselines re-measured first — the six touched
suites 104 passing: `nba-utils` 16, `predict-flow-regression` 31, `historical-page-archive` 34,
`predict-phase-groups` 10, `team-logos` 12, `render-smoke` 1). **5/5 reddened a named test and every
run restored byte-exactly** (`restored: true` from the in-script comparison, then `md5sum -c` clean
on the three edited files). `npm run gate` on the patched tree: **exit 0, 23 files, 455 tests
passing**, code read from the run itself.

M3d exists because of the audit: the losing-team line on both answer surfaces is a ternary
(`PredictPage.tsx:1253-1256`, `:1361-1364`), so with the Sonics as predicted winner only the
`codeB` arm paints and the card's `codeA` was **mutation-immune** until the flipped-winner case was
added. The harness that produced the first two attempts is on the record as untrustworthy:
`--reporter=basic` does not exist in this Vitest, so all thirteen spawns died at startup with exit 1
and read as RED, and the ANSI stripper used `\e` — not an ESC escape in a JS regex literal — so a
real red run parsed as "no failures reported". A mutation claim is only evidence with a green
baseline and a parser proven against captured output.

**Pass 3 mutations (review pass 2, 2026-10-05) — 3/3 reddened exactly their target, each
restored byte-exactly (`md5sum` compared before and after):**

| # | Mutation | Reddened |
|---|---|---|
| M15 | Placeholder step back to a bare index (`PLACEHOLDER_ABBREVIATIONS[trimmed]`) | "never reads an Object.prototype member as a placeholder code" alone (16/17 green) |
| M16 | Archive query loses `.trim()` | "finds a series by the stored abbreviation on either FK, case-insensitively" alone |
| M17 | `DIVERGENT_FRANCHISES` swaps two real seeded codes (`BLB` ↔ `WSB`) | the census case alone — the seed cross-check stays green on a swap of two real codes, which is the pairing gap the census closes |

**U16 mutations (2026-10-05) — 4/4 reddened, each restored byte-exactly:**

| # | Mutation | Reddened |
|---|---|---|
| M18 | Custom label's team A back to `getTeamCode` | 4 predict-flow cases: the trigger-label case, the U16 label case, the U15 case (`SuperSonics`), the U16 card case |
| M19 | Result card ignores U16 (`codeFor = getTeamCode`) | "answers a custom matchup typed as nicknames with the codes its logos show (U16)" alone |
| M20 | Detailed sheet ignores U16 | the same case alone, on the sheet's counts |
| M21 | Alias map returns an entry's first alias instead of its code | "pairs every seeded full_name with its own stored code (U16)" alone |

**CDP evidence (review pass 2, owner decision D2, 2026-10-05).** Harness: a scratch CDP script
(not committed; same approach as `scripts/measure-predict-latency.mjs --probe-evidence` — headless
Chrome it spawns itself, PostHog URLs blocked) against `npm run preview` on the working tree that
carries this pass's patches. Typing went through `Input.insertText` one character at a time, so the
mid-typing states are real keystroke states.
- **Accessible name of the archive search field** (the re-measure `spec-2-10:173` owed): the AX tree's
  only textbox is named `Search by team name or code...`, **source `placeholder`** — U14's copy is
  live, and it is the field's accessible name because the `Search Team` label is still not paired
  with the input (B7, deferred, unchanged).
- **`/historical` live counts** (from the `aria-live` region): unfiltered 178; `SLB` 1, `WSB` 5,
  `KCK` 1, `OKC` 7, `NY` 19 — every one equal to the matrix and to a recount over
  `game7_venues_curated.csv`; `SAS` **15** = 14 code-arm rows (matrix `:57`, and the CSV recount) + 1 from the name arm —
  inferred to be the archive's single `KCK` series, 1981 Kansas City Kings (U3's accepted noise), since
  the probe read only the first three rows; `SLB ` (trailing space) 1 (D3); `Sonics` 7. Rows
  print stored codes (`1979 WSB vs SAS`, `1948 PHW vs SLB`). Screenshot reviewed: `WSB` rows with
  logos.
- **`/predict` custom matchup label** (the trigger's `span`), typed in order: `Seattle SuperSonics`
  → `SEA vs TBD`; `Utah J` → `SEA vs UJ`; `Utah Jazz` → `SEA vs UTA`; `Celtics` → `CEL vs UTA`;
  `Boston Celtics` → `BOS vs UTA`; `boston celtics` → `BOS vs UTA` (E1); `Nowhere FC` → `NF vs UTA`
  (the renegotiated cell); `constructor` → `CON vs UTA` (M15's pin, live). Screenshot reviewed:
  `SEA vs UTA` with the Sonics and Jazz logos.
- What stays human: "does this look right" — the two screenshots are evidence for the owner's look,
  not a substitute for it.

**Owner look (U15 was accepted sight-unseen — "I have to see it to completely verify"):** `npm run preview`, then /predict → Custom Matchup and type, watching the label above the score boxes: `Seattle SuperSonics` → `SEA`, `Utah Jazz` → `UTA` (and `UJ` while the second word is still incomplete), `Celtics` → `CEL`, `Boston Celtics` → `BOS`. Then `/historical`: type `SLB` (1 row), `WSB` (5), `NY` (19) and check the row codes against what the same franchise shows on the predict side. The programmatic substitute for this look already exists as the jsdom pins in the Tasks list — this is confirmation of the reading, not the only evidence of the behavior; the 39-row `/historical` change is also diffable in preview against the pre-story build.
