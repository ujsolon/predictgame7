---
title: 'Story 6.9 — ABA Game 7 venue spike'
type: 'chore'
created: '2026-10-09'
status: 'done'
baseline_commit: 'a22f9f5fe5dc8927fc36105d7a7ccdacd4a485ec'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 6.10 re-keys the archive so `series.team_a_id` is the real Game 7 home team. Migration `00016` gave the 160 NBA/BAA series real Game 7 venues (from an owner-run nba.com probe). The **18 ABA series** have none: nba.com has no ABA data, `supabase/scripts/pipeline/data/game7_venues_curated.csv` leaves their `game7_home_team` blank, and their stored home sides are winner-slot placeholders.

**Approach:** a research spike, with no database writes and no migration. Find the real Game 7 home team for each of the 18 ABA series from the agreed source(s). Cross-check each one, and record the result with a citation per series in a new committed data file that Story 6.10 consumes. Any series that cannot be settled is named for an owner ruling.

## Boundaries & Constraints

**Always:**
- **Output** is a new file, `supabase/scripts/pipeline/data/aba_game7_venues.csv`, in the house CSV style (`#` comment header stating columns, sources, method and date). Its columns are `year,team_a,team_b,game7_home_team,source,cross_check,note`:
  - `team_a`/`team_b` exactly as in `game7_venues_curated.csv` (the archive's stored slots);
  - `game7_home_team` is one of the two abbreviations, or blank with a `note` when unsettled;
  - `source`/`cross_check` are a citation (URL or reference plus the page or section that shows the Game 7 site).
- **Coverage:** exactly the 18 `league = ABA` rows of `game7_venues_curated.csv`, matched by `year,team_a,team_b`. No row added or dropped.
- **Settled** means two independent sources agree on the Game 7 home team. One source alone is recorded as `note: single-source`, and the owner rules on it.
- **A spike report section** in this spec's Implementation Notes gives:
  - the sources used and their terms (scraping or automation limits);
  - per-series results: settled, single-source or unsettled;
  - how many of the 18 have `game7_home_team` already equal to the stored `team_a`, which 6.10 needs (stored `team_a` = winner);
  - any anomalies (neutral-site games, franchise relocations, abbreviation mismatches).
- **Measured facts only:** no inferring a venue from seeding without a source saying so.
- **Sources (owner decision 2026-10-09, option 1a):** basketball-reference.com is primary (the per-series and per-game pages showing the game site). Wikipedia's ABA season and playoff articles (CC BY-SA) are the independent cross-check.
- **Lookups (owner decision 2026-10-09, option 2a):** the agent reads the pages with its web tools. These are manual-style lookups, about 18–36 page reads, with no script. Nothing is committed except the CSV and its citations, and the owner reviews the CSV.

**Never:**
- Edit `game7_venues_curated.csv`. It is the input that re-emits the **applied** migration `00016`, so changing it would make the committed migration drift.
- Write to the database, emit a migration (that is 6.10), or change app code.
- Bulk-scrape a site against its terms, or commit a fetcher script.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Settled | two sources name the same Game 7 host | row filled, both citations | N/A |
| Single source | only one source shows the site | row filled, `note: single-source` | owner ruling |
| Unsettled | no source shows the site | `game7_home_team` blank, `note` says why | owner ruling |
| Sources disagree | the two sources name different hosts | blank, `note: conflict <a> vs <b>` | owner ruling |
| Neutral site | Game 7 at a neutral venue | recorded as `note: neutral`; owner rules which side counts as home | owner ruling |

</frozen-after-approval>

## Code Map

- `supabase/scripts/pipeline/data/game7_venues_curated.csv`: the 18 ABA rows (e.g. `:70-75, :82-88, :93, :95, :97`); header `:1-40` (house style; D6 names basketball-reference as the spot-check route). **Read-only.**
- `supabase/migrations/00016_archive_league_identity_and_game7_venues.sql`, `supabase/scripts/pipeline/venueBackfill.ts`: how the NBA/BAA venues were applied (context for 6.10). Read-only.
- `supabase/scripts/pipeline/data/game7_feed_aliases.csv`: abbreviation aliases (relocated or renamed franchises); a model for any ABA naming notes.
- `teams` abbreviations for ABA franchises (e.g. `MFL`, `MNP`, `NOB`, `DCH`, `OAK`, `DNR`, `WSC`, `NYN`, `UTS`, `VAS`, `CAC`, `KEN`, `IND`, `SAS`, `DEN`): match the curated file exactly.

## Tasks & Acceptance

**Execution:**
- [x] Per the recorded source and lookup decisions, look up the Game 7 site for each of the 18 series in the agreed sources.
- [x] `supabase/scripts/pipeline/data/aba_game7_venues.csv` -- write the 18 rows with citations and notes.
- [x] This spec's Implementation Notes -- the spike report.
- [x] `docs/CURRENT_DATA_MODEL.md` -- one line pointing at the new data file, marked "curated, not yet applied (Story 6.10)".

**Acceptance Criteria:**
- Given the CSV, when it is compared with `game7_venues_curated.csv`, then it has exactly the 18 ABA rows by `year,team_a,team_b`, each with a filled `game7_home_team` and two citations, or a `note` naming why not.
- Given the report, then every non-settled row is listed for an owner ruling, and the count of rows where `game7_home_team ≠ team_a` (the ABA rows 6.10 must swap) is stated.

## Implementation Notes

### Spike report (2026-10-09)

**Headline.** All **18 of 18** ABA series are **settled**: basketball-reference.com and Wikipedia name the same Game 7 host for every one. There are no single-source, unsettled, conflicting or neutral-site rows, so **no venue needs an owner ruling**. The stored `team_a` (the winner) is already the Game 7 home team on **12**. It is the road team on **6**, which are the ABA rows Story 6.10 must swap. The ABA Game 7 home record over these 18 is 12–6.

**Sources and their terms.**
- *Primary:* basketball-reference.com (Sports Reference). These are the season playoff pages `https://www.basketball-reference.com/playoffs/ABA_<year>.html`. In the "Playoff Series" section, each series box prints its Game 7 line as `<visitor> <pts> @ <home> <pts>`, and the Game 7 box score is linked from that line. Sports Reference's terms allow normal reading. They forbid automated scraping that burdens the site and rate-limit bots (about 20 requests/minute). This spike read **18 distinct pages in 18 reads**: the nine season pages `ABA_1968`–`ABA_1976` (1968 for the coverage check only) and the nine Game 7 box scores cited in the CSV (1971 ×2, 1973 ×2, 1974 ×2, 1975, 1976 ×2). Each was read once, one at a time, with the agent's web tool. Each box score's date and arena agree with its season-page Game 7 line. No script was written or committed.
- *Cross-check:* Wikipedia's `<year> ABA playoffs` articles and `1971 ABA Finals`, licensed CC BY-SA 4.0. Their per-series game-by-game summaries give the arena and city of every game. This spike read **9 distinct pages in 11 reads**: the eight season articles 1969–1976 and `1971 ABA Finals`. The 1969 article was read three times (the series list, the Miami–Minnesota series, and the Game 7 dates of the other three 1969 series). Wikipedia allows reading and reuse with attribution. The CSV records facts (venues) with a URL for each, not copied prose.
- *Method caveat:* the web tool returns a model-made extract of each page, not the raw HTML. The CSV quotes the Game 7 lines as the extract returned them. The "@ home" line (basketball-reference) and the arena and city (Wikipedia) were then checked against each other for every row. The owner's review of the CSV is the human spot-check that spec 1a/2a provides for.
- *What was verified at source and what comes from the extract.* Every fact in the CSV went through one model-extraction step. No raw HTML was inspected, so nothing here was verified at source in the strict sense. What the cross-check settles is that two independent extracts, from two independent sites, name the same host on all 18 rows. For the nine rows with a box score, a third read of a separate basketball-reference page gives the same date and arena. The following come only from the extract, without a second confirmation: the weekday and score of each Game 7 line, the exact arena names, and the series-section labels in the citations. These are descriptive and are not keys. The one score disagreement they produced (anomaly 3) was settled against the live archive.

**Per-series results.**

| Year | Stored `team_a` (winner) / `team_b` | Game 7 host | BR line | Wikipedia arena | Status | = `team_a`? |
|---|---|---|---|---|---|---|
| 1969 | IND / KEN | IND | KEN 111 @ IND 120 | Indiana State Fairgrounds Coliseum | settled | yes |
| 1969 | MFL / MNP | MFL | MNP 128 @ MFL 137 | Miami Beach Auditorium | settled | yes |
| 1969 | NOB / DCH | NOB | DCH 95 @ NOB 101 | Loyola Field House | settled | yes |
| 1969 | OAK / DNR | OAK | DNR 102 @ OAK 115 | Oakland–Alameda County Coliseum Arena | settled | yes |
| 1970 | DNR / WSC | DNR | WSC 119 @ DNR 143 | Denver Auditorium Arena | settled | yes |
| 1970 | KEN / NYN | KEN | NYN 101 @ KEN 112 | Louisville Convention Center | settled | yes |
| 1971 | UTS / IND | **IND** | UTS 108 @ IND 101 | Indiana State Fair Coliseum | settled | **no — swap** |
| 1971 | UTS / KEN | UTS | KEN 121 @ UTS 131 | Salt Palace | settled | yes |
| 1972 | IND / DNR | IND | DNR 89 @ IND 91 | Indiana State Fair Coliseum | settled | yes |
| 1972 | IND / UTS | **UTS** | IND 117 @ UTS 113 | Salt Palace | settled | **no — swap** |
| 1972 | NYN / VAS | **VAS** | NYN 94 @ VAS 88 | Norfolk Scope | settled | **no — swap** |
| 1973 | IND / KEN | **KEN** | IND 88 @ KEN 81 | Freedom Hall | settled | **no — swap** |
| 1973 | KEN / CAC | **CAC** | KEN 107 @ CAC 96 | Charlotte Coliseum | settled | **no — swap** |
| 1974 | IND / SAS | IND | SAS 79 @ IND 86 | Indiana State Fair Coliseum | settled | yes |
| 1974 | UTS / IND | UTS | IND 87 @ UTS 109 | Salt Palace | settled | yes |
| 1975 | IND / DEN | **DEN** | IND 104 @ DEN 96 | Denver Auditorium Arena | settled | **no — swap** |
| 1976 | DEN / KEN | DEN | KEN 110 @ DEN 133 | McNichols Sports Arena | settled | yes |
| 1976 | NYN / SAS | NYN | SAS 114 @ NYN 121 | Nassau Veterans Memorial Coliseum | settled | yes |

**Count for 6.10:** `game7_home_team = team_a` on **12**. `game7_home_team ≠ team_a` on **6**: 1971 UTS/IND, 1972 IND/UTS, 1972 NYN/VAS, 1973 IND/KEN, 1973 KEN/CAC and 1975 IND/DEN. In each of those six the BR line also shows that the stored `team_a` won on the road, so the CSV's "`team_a` = winner" premise holds on all 18 rows.

**Rows for an owner ruling:** none on venue. One non-venue item remains open for the owner: anomaly 4 (the 1968 Finals coverage gap). Anomaly 3 is resolved.

**Anomalies.**
1. *No neutral sites.* Three franchises played home games in more than one city. The Miami Floridians played Game 2 of 1969 in West Palm Beach. The Virginia Squires and the Carolina Cougars were regional teams. In each case Game 7 was played in that team's own home city (Miami Beach, Norfolk, Charlotte), so each is recorded as a home date and not as `neutral`. Each has an `info:` note in the CSV.
2. *Relocations and renames.* The abbreviations match the curated file exactly, and no alias was needed. Some codes are the same franchise under different names: `OAK` (1969) became `WSC` (1970). `DNR` (Rockets, 1969–72) is the same franchise as `DEN` (Nuggets, 1975–76). `DCH` (Dallas Chaparrals) is the earlier name of `SAS`. Basketball-reference's own box score codes differ from the `teams` abbreviations (`INA`, `DNA`, `NYA`, `CAR`). They appear only inside citation URLs and are not keys.
3. *Score disagreement, venue unaffected.* In the 1971 ABA Finals Game 7 (UTS/KEN), basketball-reference's year page and box score give Kentucky **121**, while Wikipedia's `1971 ABA Finals` gives **127**. Both put the game at the Salt Palace, so the venue is settled. **Resolved, no data defect:** the orchestrator read the live archive through anon REST, and the stored Game 7 score is 131–121, which matches basketball-reference. Wikipedia's 127 is the outlier. This spike itself made no database read.
4. *Coverage: the archive has no 1968 ABA Game 7.* Basketball-reference shows that the 1968 ABA Finals went seven games (New Orleans Buccaneers 113 @ Pittsburgh Pipers 122, Sat May 4). Neither `game7_venues_curated.csv` nor the archive has a 1968 row. The archive's ABA set covers 1969–1976 only (18 series), and a reading of every ABA season page from 1968 to 1976 found exactly those 18 Game 7s plus the 1968 Finals. Adding that series is outside this spike (coverage is fixed at the 18 rows). It is recorded here for an owner decision on whether the archive should ever add it.

**Verification run.** A throwaway `node -e` check compared the CSV with `game7_venues_curated.csv`. It found 18 rows with 7 fields each, and the `year,team_a,team_b` keys equal to the 18 `ABA` rows in the same order. Every `game7_home_team` is one of the row's two teams, there are 12 rows equal to `team_a` with the six listed above as the rest, and both citations start with `https://`. The same checks are now pinned durably in `tests/pipeline/aba-game7-venues.test.ts` (6 tests, green). That file also pins the six-row swap set by name and the note rule: a non-blank `note` must start with `info:` or belong to an unsettled row. `node supabase/scripts/pipeline/venueBackfill.ts --check` still reports `--check ok` (the curated CSV and `00016` were not touched).

## Spec Change Log

## Review Triage Log

Pass 1 (2026-10-09). Layers: blind-hunter (B), edge-case-hunter (E), verification-gap (V: "no verification gaps found"). The diff ran from `a22f9f5` to the working tree.

| # | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|
| B1/E1 | Nine box-score URLs are cited, while the report and header say one box score was read and define `source` as "given where one was read". Up to eight citations may have been built from the URL pattern, not read | medium | True: nine distinct `/boxscores/` URLs in the CSV vs "+ 1 box score" in the header and the spec. Provenance is the spike's deliverable | patch |
| B2/E2 | Read counts disagree (Wikipedia 9 in the CSV header vs 10 in the spec) | low | True. Direct correction | patch |
| B6/B7 | The "independent" cross-check went through one model extraction step; the 1971 Finals "121 vs 127" score note has no follow-through | medium/low | The extraction caveat is true; the report must state what was verified at the raw source vs the extract. The 1971 item was checked by the orchestrator against the live archive: the stored Game 7 is **131–121**, matching basketball-reference (Wikipedia's 127 is the outlier), so there is no data defect | patch (report wording) |
| B8 | Nothing durable guards the new CSV (the counts and key equality were checked only by a throwaway `node -e`) | low | True; an edit before 6.10 could break it silently. A small test is a direct addition | patch |
| B9 | The authoritative "Story 2.8 status" section of `CURRENT_DATA_MODEL.md` still says the ABA Game 7 rows stay winner-fiction, with no pointer to the curated file | low | True. A one-line pointer | patch |
| B10 | The citation format is uneven (1971 UTS/KEN cites a box score as `source`; some Wikipedia citations lack the date) | low | True. Widen the header definitions and make the fields uniform | patch |
| B5 | Six settled rows carry an `info:` remark in `note`, while the frozen definition uses `note` for "why not settled" | low | True but self-describing: the header defines the `info:` prefix. The consumer rule ("a note starting with `info:` = settled") belongs in 6.10's spec | defer (to 6.10) |
| B11 | The 1968 ABA Finals (seven games) is missing from the archive; adding it would change the pinned 178/18 counts (D5) | low | True and pre-existing (an archive coverage gap). Owner question, recorded in deferred-work | defer |
| B3 | The Code Map's line refs cover 16 of the 18 ABA rows | low | The fix edits this spec; rejected per the rules | reject |
| B4/E5 | Spec `in-review` vs tracker `in-progress` | false | In flight: step 5 syncs | reject |
