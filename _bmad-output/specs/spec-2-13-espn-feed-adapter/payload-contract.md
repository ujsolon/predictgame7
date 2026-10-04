# ESPN payload contract — what is measured, what is inferred

Companion to `SPEC.md`. Downstream builds against this file, so every row states whether it is **measured** (with the run that measured it), **inferred**, or **unobserved**. Nothing here is a claim about a field nobody has read.

Source of the measurements: `deferred-work.md` §"CONFIRMED GREEN AND BOTH THROWAWAYS RETIRED" (findings 1–5) and the verbatim runner log of `37119291248` (2026-10-03T11:19:32Z), plus `37118226487` and the Supabase-side round-2 probe at 10:30:19.443Z. The throwaways that produced them are retired — `.github/workflows/egress-probe-hosted.yml` and `supabase/functions/feed-egress-probe/` are gone from the tree; `git show c9745e2` restores the CI shape if a future round wants it, and the owner's cleanup leg (`supabase functions delete feed-egress-probe`) was **done 2026-10-03** — closed in `run-sheet.md`, not carried as a debt.

**Second source, added 2026-10-04: verbatim captures committed under `tests/pipeline/fixtures/`.** Three probe rounds had each diagnosed the payload through the reader under test — circular, and each round's fix was an assumption. The owner released the no-agent-fetch rule for four read-only GETs, and the bodies are now in the repo byte-for-byte: `espn-teams-site-20261004.json` (the 30-franchise table `00018` seeds from), `espn-teams-core-20261004.json` (the other teams route, kept because it looks like data and is not), `espn-scoreboard-20250503-game7.json` (one real Final Game 7), `espn-scoreboard-20250504-mixed.json` (a Game 7 whose home side lost, plus a Final Game 1 to be excluded). `espn-adapter.test.ts` replays them through `buildFeed`; the probe reads the two team lists through `--fixture-teamlist=`. Where a claim below now says "captured", it is ESPN's bytes on disk, not a transcript.

## Request

| Item | Value | Status |
|---|---|---|
| Endpoint | `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard` | measured |
| Parameter | `dates=YYYYMMDD`, exactly one date | measured |
| Range form | `dates=20260601-20260608` → `400`, 80 bytes, a JSON error body with no `.events` key | measured |
| Date semantics | `dates` filters by **US local date**. `dates=20260605` returned the game stamped `2026-06-06T00:30Z` | measured |
| Latency | 78 ms from a GitHub-hosted runner, 226 ms from Supabase, same URL | measured |
| Compression | Response is `application/json;charset=UTF-8`; a `--compressed` client sees ~5.9 KB where an uncompressed one sees ~46.9 KB for the same URL | measured |
| `seasontype` / `playoffType` | never probed | **out of scope** |
| Auth | none — the probe sent no key and no `Authorization` header. (The `apikey` + `Authorization: Bearer` requirement belongs to the Supabase function gateway, not to ESPN.) | measured |

## Response — fields the adapter reads

Top-level keys measured: `leagues`, `events`, `provider`.

| Path | Measured value | Use | Status |
|---|---|---|---|
| `events` | array, length 3 on `20260420`, 1 on the Finals day | the feed; `feedSeriesCount` counts series derived from it **before** exclusions | measured |
| `events[].date` | `2026-04-20T23:00Z`, `2026-06-06T00:30Z` | game date; the identity year comes from the **local** date, not this stamp's UTC year | measured |
| `events[].status.type.state` | `post` | the gate input | measured (only its `post` value) |
| `events[].status.type.description` | `Final` | the status half of the admit rule | measured |
| `events[].competitions[0].notes[0].headline` | `East 1st Round - Game 2`, `NBA Finals - Game 2`, `West 1st Round - Game 7`, `East Semifinals - Game 1` | round **and** game number | measured (last two in the committed captures) |
| `events[].competitions[0].type.shortName` | **absent** | unusable — this is why naming comes from the headline | measured absence |
| `events[].competitions[0].competitors[].homeAway` | `home` / `away` | real venue designation per game, which the archive cannot fake and `manual_csv` cannot supply | measured |
| `events[].competitions[0].competitors[].score` | `115` / `105`, `104` / `105`, `120` / `101`, `89` / `103` | per-side final score; a tie is an invalid row (port rule) | measured |
| `events[].competitions[0].competitors[].team.abbreviation` | `CLE`, `TOR`, `NY`, `DEN`, `SA`, and on the committed captures `DEN`, `LAC`, `CLE`, `IND`, `HOU`, `GS` | **the provider code — the join key** | measured |
| `events[].competitions[0].venue.fullName` | `Rocket Arena`, `Frost Bank Center`, `Ball Arena` | not read by this story; recorded because finding 1 lists it | measured |

Unobserved and therefore gated by rule, never by expectation: `status.type.state == 'in'` and `== 'pre'`, and any `description` other than `Final`. There is no in-progress NBA game to fetch in October 2026.

**The regular-season shape, now measured (2026-10-04 throwaway fetches, bodies not committed).** Three regular-season dates (`20260307`, `20260321`, `20260410`) carry **no `notes` array at all** on any event — the headline is a playoff-only field. Every game on such a date is therefore excluded `unreadable headline`, and the run still reports its feed: `espn: 15 series in feed (dates=20260410), 0 Game-7 candidate(s) — excluded: 0 not final, 0 final but not game 7, 15 unreadable headline`. Consequences, both verified against the code: (1) `--require-feed` measures `feedSeriesCount`, which is counted before exclusions, so a regular-season night does **not** false-alarm; (2) the abort-on-unknown-code walks **every** event before admission, so a regular-season game carrying an unseeded franchise code still stops the run naming it — drift detection is not limited to Game 7s. What a regular-season date does *not* prove is any admission path; that is what the two committed Game-7 captures are for.

## Team codes — the reason `abbreviation` is not the key

All 30 modern franchises, measured 2026-10-04 from the committed `espn-teams-site-20261004.json` (route `…/nba/teams`, path `sports[0].leagues[0].teams[].team`) against `00005`'s seed. **24 agree** with `teams.abbreviation` (the full list of agreements is in the capture and is asserted by `espn-adapter.test.ts`); **6 diverge**, and the divergence column is now the table rather than a sample:

| ESPN code | Stored row | `teams.abbreviation` | How found |
|---|---|---|---|
| `NY` | New York Knicks, id 20 | `NYK` | measured 2026-10-04, capture; first flagged by Story 2.4 |
| `SA` | San Antonio Spurs, id 27 | `SAS` | measured 2026-10-04, capture; first flagged by Story 2.4 |
| `GS` | Golden State Warriors, id 10 | `GSW` | **newly measured 2026-10-04** — the probe's leg B refused to seed a 26/30 table and named these four |
| `NO` | New Orleans Pelicans, id 19 | `NOP` | **newly measured 2026-10-04** |
| `UTAH` | Utah Jazz, id 29 | `UTA` | **newly measured 2026-10-04** (4 letters — `00018`'s CHECK is `^[A-Z]{2,4}$` because of this row) |
| `WSH` | Washington Wizards, id 30 | `WAS` | **newly measured 2026-10-04** |

`payload-contract.md` carried `GS`, `NO`, `UTAH` and `WSH` as "assumed to agree" until CAP-8 measured them. Measuring them is what closed the assumption out — four of the assumed twenty-six disagreed, and an adapter built on the assumption would have aborted every Warriors, Pelicans, Jazz and Wizards game with `unknown ESPN team code` while looking correct in review. `00018` seeds exactly these 30 pairs, and `espn-adapter.test.ts` re-reads the migration's `UPDATE` statements against the capture on every `npm test`, so the seed cannot drift from its source silently.

**The codes cannot be display names, measured twice.** On the teams route, `team.displayName` is the full name (`New York Knicks`, and **`LA Clippers`** — where `00005` stores `Los Angeles Clippers`, the one row a name join gets wrong) while `team.name` is the nickname (`Knicks`, `Clippers`); on the scoreboard, the competitor's `team` object carries `abbreviation` and nothing else code-shaped (its fields are `id, uid, location, name, abbreviation, displayName, shortDisplayName, color, alternateColor, isActive, venue, links, logo`), and the six codes that appear in **both** committed payloads — `DEN`, `LAC`, `CLE`, `IND`, `HOU`, `GS` — agree on all six. That is a sample, not a proof that the two routes never diverge; what makes the table a lawful seed is the single code field plus the abort that names a code the moment the scoreboard prints one the table does not hold. The probe's jq chain was `.team.abbreviation // .team.displayName`; the reader now prints *which* field supplied each code, because "it resolved" hid the fact that only one field ever existed.

## Where the seed comes from — the two teams routes

| Route | Shape as measured | Use |
|---|---|---|
| `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams` | `sports[0].leagues[0].teams[]`, each `{ team: { id, abbreviation, displayName, name, location, … } }` — 30 rows, every one carrying a code | **the seed table for `00018`**, committed verbatim as `espn-teams-site-20261004.json` |
| `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/<year>/teams` | `{ count: 30, pageIndex, pageSize, pageCount, items: [ { $ref: "…" } ] }` — 30 objects, each with exactly ONE key, a URL | **seeds nothing.** Committed as `espn-teams-core-20261004.json` because it looks like a table and is a pointer list; the first leg B read it as rows and printed six `entry null has no code` for an array it never reached |

Provenance of both captures: fetched 2026-10-04 from the owner's machine, in a shell the owner released for this, over HTTPS with a DNS lookup forced through a public `dns-over-https` resolver — this machine's UDP/53 path answers `EREFUSED` for `site.api.espn.com` from all three tested resolvers (1.1.1.1, 8.8.8.8, 9.9.9.9) while answering other names correctly, i.e. a filter on port 53 rather than a dead record. The DoH path is a property of the capture environment, not of the probe: the live leg B run from the owner's normal shell is what still has to answer for the feed.

## Parse rules that are decisions, not readings

- **Admit** only a game whose status fields say the game is finished: `state == 'post'` AND `description == 'Final'`, both read as exact strings (`adapters/espn.ts:452`). The looser alternative this line first allowed — admitting any `description` matching the port's final vocabulary — was NOT built: on a date-granular feed `Final (OT)` and `Final 2OT` are real shapes no probe has stood on in October 2026, and a vocabulary match would read an unmeasured string as "finished" and write it as a Game 7 result. Everything else — `in`, `pre`, an unrecognised string — is **excluded and named** in `describeRun`'s notes. The alternative, defaulting an unobserved shape to "finished", is what the no-SLA constraint forbids.
- **Admit** only **Game 7** (owner call 2026-10-04, mid-build). The scheduled feed's job is completing a series whose six stored games already certify 3–3, never seeding the bracket: `plan.ts` learned exactly one new source shape — a stored *pending* series plus a source carrying only that series' game 7 — and games 1–6 the feed also prints are excluded with the rest. The 3–3 certification is not dropped; `pipeline_complete_series` re-reads the stored games server-side and raises unless they are six decided games split 3–3 (`supabase/migrations/00015_pipeline_series_functions.sql:286-308`). Consequence, recorded rather than discovered at build time: the April offseason edge can no longer initialize from this feed — births belong to `--source=manual_csv` and Story 2.7's drill.
- **Derive the requested date** as "yesterday in `America/New_York`" from the run instant: the 07:30 UTC cron (amended from 09:30 by owner call 2026-10-04 — `schedule-amendment.md`) fires at 02:30 ET in winter and 03:30 in summer, before that day's games, so the previous evening's results live under the earlier local date. A UTC-derived date reads an empty feed and trips CAP-7 on a day that had games.
- **Count `feedSeriesCount` before exclusions** (port rule) so a rest day and a route that answered `events: []` look identical to the alarm, and a parse that dropped every game on a rule still reports a non-zero feed.
- **Never invent a series.** A team code that matches no `teams.espn_code` aborts the run naming the code. This is the failure finding 5 warns about: a silent mismatch drops games.
- **Leave the archive's labels alone.** Round names produced here go through the canonical vocabulary in `adapters/rounds.ts`; the 17 era spellings already stored are never rewritten (Story 2.4's rule, and the identity key is `(year, team_a_id, team_b_id)`, not the label).
