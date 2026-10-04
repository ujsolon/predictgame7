# ESPN payload contract — what is measured, what is inferred

Companion to `SPEC.md`. Downstream builds against this file, so every row states whether it is **measured** (with the run that measured it), **inferred**, or **unobserved**. Nothing here is a claim about a field nobody has read.

Source of the measurements: `deferred-work.md` §"CONFIRMED GREEN AND BOTH THROWAWAYS RETIRED" (findings 1–5) and the verbatim runner log of `37119291248` (2026-10-03T11:19:32Z), plus `37118226487` and the Supabase-side round-2 probe at 10:30:19.443Z. The throwaways that produced them are retired — `.github/workflows/egress-probe-hosted.yml` and `supabase/functions/feed-egress-probe/` are gone from the tree; `git show c9745e2` restores the CI shape if a future round wants it, and the owner's cleanup leg (`supabase functions delete feed-egress-probe`) was **done 2026-10-03** — closed in `run-sheet.md`, not carried as a debt.

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
| `events[].competitions[0].notes[0].headline` | `East 1st Round - Game 2`, `NBA Finals - Game 2` | round **and** game number | measured |
| `events[].competitions[0].type.shortName` | **absent** | unusable — this is why naming comes from the headline | measured absence |
| `events[].competitions[0].competitors[].homeAway` | `home` / `away` | real venue designation per game, which the archive cannot fake and `manual_csv` cannot supply | measured |
| `events[].competitions[0].competitors[].score` | `115` / `105`, `104` / `105` | per-side final score; a tie is an invalid row (port rule) | measured |
| `events[].competitions[0].competitors[].team.abbreviation` | `CLE`, `TOR`, `NY`, `DEN`, `SA` | **the provider code — the join key** | measured |
| `events[].competitions[0].venue.fullName` | `Rocket Arena`, `Frost Bank Center` | not read by this story; recorded because finding 1 lists it | measured |

Unobserved and therefore gated by rule, never by expectation: `status.type.state == 'in'` and `== 'pre'`, and any `description` other than `Final`. There is no in-progress NBA game to fetch in October 2026.

## Team codes — the reason `abbreviation` is not the key

| ESPN code | Stored row | `teams.abbreviation` | Status |
|---|---|---|---|
| `NY` | New York Knicks, id 20 | `NYK` | measured divergence (`00005_release_1_data_model.sql:123`), re-measured live 2026-10-04 (leg A: `NY` → id 20, "New York Knicks") |
| `SA` | San Antonio Spurs, id 27 | `SAS` | measured divergence (`:130`) |
| `CLE`, `TOR`, `DEN` | matching rows | same three letters | measured agreement, re-measured live 2026-10-04 |
| `ATL`, `MIN` | Atlanta Hawks id 1, Minnesota Timberwolves id 18 | same three letters | **newly measured live 2026-10-04** (probe leg A) — agree, so no new divergence row |
| the other 23 modern franchises | — | — | **assumed to agree; CAP-8's cross-check must measure them before `00018` seeds anything** |

The codes cannot be display names: `displayName` is `Knicks` / `Spurs`, and the probe's jq chain was `.team.abbreviation // .team.displayName`.

## Parse rules that are decisions, not readings

- **Admit** only a game whose status fields say the game is finished: `state == 'post'` AND `description == 'Final'`, both read as exact strings (`adapters/espn.ts:452`). The looser alternative this line first allowed — admitting any `description` matching the port's final vocabulary — was NOT built: on a date-granular feed `Final (OT)` and `Final 2OT` are real shapes no probe has stood on in October 2026, and a vocabulary match would read an unmeasured string as "finished" and write it as a Game 7 result. Everything else — `in`, `pre`, an unrecognised string — is **excluded and named** in `describeRun`'s notes. The alternative, defaulting an unobserved shape to "finished", is what the no-SLA constraint forbids.
- **Admit** only **Game 7** (owner call 2026-10-04, mid-build). The scheduled feed's job is completing a series whose six stored games already certify 3–3, never seeding the bracket: `plan.ts` learned exactly one new source shape — a stored *pending* series plus a source carrying only that series' game 7 — and games 1–6 the feed also prints are excluded with the rest. The 3–3 certification is not dropped; `pipeline_complete_series` re-reads the stored games server-side and raises unless they are six decided games split 3–3 (`supabase/migrations/00015_pipeline_series_functions.sql:286-308`). Consequence, recorded rather than discovered at build time: the April offseason edge can no longer initialize from this feed — births belong to `--source=manual_csv` and Story 2.7's drill.
- **Derive the requested date** as "yesterday in `America/New_York`" from the run instant: the 07:30 UTC cron (amended from 09:30 by owner call 2026-10-04 — `schedule-amendment.md`) fires at 02:30 ET in winter and 03:30 in summer, before that day's games, so the previous evening's results live under the earlier local date. A UTC-derived date reads an empty feed and trips CAP-7 on a day that had games.
- **Count `feedSeriesCount` before exclusions** (port rule) so a rest day and a route that answered `events: []` look identical to the alarm, and a parse that dropped every game on a rule still reports a non-zero feed.
- **Never invent a series.** A team code that matches no `teams.espn_code` aborts the run naming the code. This is the failure finding 5 warns about: a silent mismatch drops games.
- **Leave the archive's labels alone.** Round names produced here go through the canonical vocabulary in `adapters/rounds.ts`; the 17 era spellings already stored are never rewritten (Story 2.4's rule, and the identity key is `(year, team_a_id, team_b_id)`, not the label).
