---
title: 'Q-4 data-source feasibility spike — decision record'
type: 'spike-decision'
story: '2-1-q-4-data-source-feasibility-spike'
created: '2026-09-30'
status: 'review'
baseline_commit: '679201a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/epics.md (Story 2.1 ACs, owner call 2026-09-30)'
  - '{project-root}/docs/CURRENT_DATA_MODEL.md'
  - '{project-root}/scripts/spike-2-1/ (all probe scripts, run 2026-09-30)'
---

## Decision

**The unkeyed nba.com route is viable enough for Story 2.4 to build on, with one named
gap: no endpoint probed today returns a playoff round *name*.** Per-game home/away real
scores, series status, and historical depth to 1993-94 all passed against the live wire on
2026-09-30. The bracket/round-label probe is partial, so Story 2.4 carries a
round-vocabulary derivation step and Story 2.3 (`manual_csv`) stays the floor rather than
the plan. Both candidates did not fail, so the AC's FR-21 phase-blocker escalation is
**not** invoked.

Every number below is observed output from `scripts/spike-2-1/*.mjs` run on 2026-09-30,
not inferred from library docs.

## Probe results against the four AC requirements

| Requirement | Verdict | Evidence (measured) |
|---|---|---|
| Per-game scores, home/away, real | **pass** | `leaguegamelog` (`PlayerOrTeam=T`, `SeasonType=Playoffs`) returned 170 team rows / 85 games for 2025-26 and 154 rows / 77 games for 1993-94; reconstructing both sides of every game yielded 85/85 and 77/77 with distinct home and away scores, 0 parse collisions. |
| Series status | **pass** | Same feed groups cleanly into 15 series per postseason; 7-game series and the deciding game's winner are derivable (`BOS-PHI` 2026-04-19→05-02, game 7 `0042500117` won by PHI). `scoreboardv2?GameDate=06/13/2025` also returns a `SeriesStandings` sheet with `HOME_TEAM_WINS`/`HOME_TEAM_LOSSES`/`SERIES_LEADER` — 3-4 in that sample — so an in-flight status exists without reconstruction. |
| Current playoff bracket | **partial** | `playoffinline` returns HTTP 404 with the same 4,652-byte HTML as a bad path, for both current and legacy param sets — the endpoint is gone, not mis-parameterised (`boxscore` fails the same way, while `boxscoretraditionalv2` answers 200). No round **name** appears in any sheet that worked; `cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json` does carry `seriesText`, `gameLabel`, `seriesGameNumber`, `ifNecessary`, but on 2026-09-30 that blob is `seasonYear 2026-27` with 1,274 games and **0** finished ones. |
| Historical consistency with the archive schema | **pass, era-caveated** | 1993-94 series lengths are `{3:3, 4:3, 5:3, 6:1, 7:5}` — first round was best-of-5 then, so a pre-2003 "series" can hold 3–5 games, not 7. Post-2003 and the recent sample are all 4–7. |

## Cross-check that settles the archive premise

The read-only audit of the live tables (`scripts/spike-2-1/audit-archive.mjs`,
exit 0) measured **178 `series` rows and 1,246 `series_game_scores` rows; every one of the
178 series holds exactly 7 score rows; 0 NULL scores, 0 NULL per-game winners, 0 ties, 0
`game_number` outside 1–7, 0 duplicate `(series_id, game_number)`**. That closes the
177/178/1246 documentation discrepancy with one number and confirms AD-4's derivation
premise holds on today's data.

It also explains *why* it holds: the archive is only the seven-game series. The source
feed independently reports **5 seven-game series in the 2026 postseason and 5 in the 1994
postseason**, and the audit's own count for those years is 5 each. The two measurements
agree from opposite directions.

## Two blockers this spike found for Story 2.2, not for 2.4

1. **`UNIQUE(year, round)` will not apply to the real table.** The audit measured **19
   duplicate `(year, round)` groups** (e.g. `1969|Western Division Semifinals`,
   `1979|Eastern Conf Semifinals`, `2009|Eastern Conf First Round`). That is not dirty
   data — several series in one round of one year can each go seven games, which is
   precisely what this archive stores. AD-5's guard as written assumes one series per
   round per year and needs re-scoping (e.g. `UNIQUE(year, round, series_number)`) before
   2.2's migration runs, or the migration fails on production data.
2. **`round` has no controlled vocabulary.** The live column holds **17 distinct values**
   across 178 rows, mixing granularities and naming eras ("Eastern Conf Semifinals" ×35
   alongside "Western Conference Finals" ×1, "Eastern Div Semifinals" ×1). Any pipeline
   that writes `round` must map into a fixed list, and the existing rows are not in one.

## Field mapping

`series` — `id, year, round, team_a_id, team_b_id, winner_team_id, status`

| target | source | note |
|---|---|---|
| `year` | calendar year of `GAME_DATE` in `leaguegamelog` | **not** `SEASON_ID`: the 2026 postseason is season `"42025"` / `Season=2025-26`. `scoreboardv2` labels the 2025-06-13 Finals game `SEASON "2024"`. |
| `team_a_id`, `team_b_id` | `TEAM_ID` from the two rows of a game | numeric ids already match the app's team ids. |
| `winner_team_id` | `WL` on the deciding game | for Game 7 it is the last game by `GAME_DATE`; 4th-win logic needed for non-7 lengths. |
| `round` | **no direct source** | derive from the `GAME_ID` series number or in-season `seriesText`, then normalise to a fixed vocabulary (finding 2). |
| `status` | do not write | vestigial per AD-4; phase derives from `winner_team_id`. |

`series_game_scores` — `series_id, game_number, home_team_id, away_team_id, home_score, away_score, winner_team_id`

| target | source | note |
|---|---|---|
| `game_number` | ordinal of `GAME_DATE` within the two-team group | `GAME_ID`'s trailing digits are **not** the game number in old seasons — 1994 `HOU-PHX` ids are `031,036,040,044,050,054,057` (global postseason numbers) while 2026's are contiguous `0111..0117`. |
| `home_team_id`, `away_team_id` | `MATCHUP` read from the row's own perspective | `"NYK @ PHI"` ⇒ this team is away; `"GOS vs. PHX"` ⇒ this team is home. The home form carries a **period** after `vs` — splitting on `' vs '` silently yields a `". PHX"` team and shatters a real series into phantom pairs; it took two corrected passes of this spike before the grouping matched the source's own game counts. |
| `home_score`, `away_score` | `PTS` on the home row and the away row | each game emits two rows; both sides only appear once they are merged on `(GAME_DATE, team pair)`. |
| `winner_team_id` | `WL` per game | no ties observed. |

## Constraints and costs

- **Auth:** none for stats.nba.com, but a browser-ish `User-Agent` **plus**
  `Referer`/`Origin` of `nba.com` are required; plain requests are refused. No token is
  needed, so nothing here becomes a Story 2.6 secret.
- **Rate limits:** **unmeasured** — no `x-ratelimit-*` headers came back and nothing
  published them. Observed latencies were ~230–1,750 ms per call across the passes. FR-20/21's cadence must be
  assumed hostile until proven, because the route is Cloudflare-fronted and already
  returns 403 for guessed CDN paths (`playoffBracket/playoffBracket.json`,
  `standings/divisionStandings.json`).
- **Retired hosts:** `data.nba.net` does not resolve at all (DNS failure on three paths),
  so every `nba_api`-era recipe citing it is dead.
- **Big-blob cost:** the `cdn.nba.com` schedule file is 2.7 MB (4.8 MB on the wire before
  parse) for a whole season, and rolls to the next pre-season as soon as the playoffs end.
- **The keyed alternate could not be probed.** No provider key exists in `.env` (it holds
  only the four `VITE_*` names), and `api.balldontlie.io/v1/games` answers **401
  Unauthorized** keyless — auth is mandatory, so the alternate's payload shape, limits and
  tier are unknown. Running that leg needs the owner to supply a key, which then becomes a
  Story 2.6 Actions secret and a paid/free tier decision. This spike deliberately did not
  sign up for a third-party account to obtain one.
- **Fantrax stays ruled out** (owner call 2026-09-30, recorded in `epics.md` above): its
  documented endpoints return fantasy point totals and playoff *configuration*, never a
  real NBA game score with home/away sides, so it cannot populate either table.

## What Story 2.4 must inherit

1. A **round vocabulary and derivation** — the one AC requirement no working unkeyed
   endpoint satisfies today.
2. **Game-number derivation by date**, never by `GAME_ID` suffix.
3. An **era rule**: pre-2003 first-round series are best-of-5, so "every series has 7
   score rows" is a property of *this* archive's selection, not of the source. Anything
   that validates the feed against 7 must exclude, or specially handle, 3–5 game series.
4. A **request posture** for stats.nba.com: required headers, no rate-limit knowledge,
   backoff, and a probe before any in-season dependency is announced.

## Owed before this record can be called complete

- **The in-season leg is unprovable today.** It is 2026-09-30; the playoffs are concluded
  and the schedule blob has rolled to 2026-27, so "current playoff bracket" was measured
  against the finished 2026 postseason. Re-run `probe-resultsheets.mjs` during the 2027
  window (SM-1, Apr–Jun 2027) before trusting in-series `SeriesStandings` freshness.
- **The keyed alternate's shape** needs an owner-supplied key (see constraints).
- **The 19 duplicate `(year, round)` groups and the 17-value `round` domain** must land in
  Story 2.2's spec before its migration is written — this record states them; 2.2's spec
  has not yet been updated.

## Deliberately not done here

No production code shipped (AC: "no production code ships from this story") — the spike is
`scripts/spike-2-1/**`, which `npm run gate` does not lint (Biome's includes are `src/**`
and `supabase/functions/**/*.ts`) and `tsc -b` does not type-check, so the scripts are
checked by `node --check` and by running them. No write touched the database; every
Supabase call in `audit-archive.mjs` is a GET with the client-visible anon key.
