---
title: 'Story 2.4 — Automated adapter per the spike decision'
type: 'feature'
created: '2026-10-01'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0f740f92adc485aa75d1a19e486002b4028bf235'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/decision-2-1-q-4-data-source.md'
  - '{project-root}/_bmad-output/implementation-artifacts/seriesdatasource-port.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md (Story 2.4 ACs :356-370)'
  - '{project-root}/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The pipeline has a floor and no automation. `SERIES_SOURCE=nba_com` is registered as
recognised-but-unimplemented (`port.ts:83`), so during the 2027 playoff window every Active Series
update still needs a human editing `series_manual.csv` — which FR-21 says must not be the plan, and
which the owner's own cadence rule ("CSV edited daily before 09:00 UTC") makes the weakest link in
the Traffic Gate measurement. Story 2.1 proved the unkeyed nba.com `leaguegamelog` route returns real
per-game home/away scores with historical depth, so the adapter can be built now.

**Approach:** implement `nba_com` as a second `SeriesDataSource` behind Story 2.3's port: one
unkeyed HTTP request per run fetches the current postseason's team-side game log, the adapter
reconstructs games and series from it, and it hands the runner exactly the two row shapes the plan
already consumes. No runner logic, no schema change, no new writer — the adapter's own rules are the
spike's inherit list (calendar-year season derivation, date-ordered game numbers, the `vs.` period,
Game-7-only selection) plus the `round` vocabulary Story 2.2 deliberately left ungated. The owner's
2026-10-01 decision that **archived score rows are frozen** shapes what the adapter may feed: rows
older than the pipeline are never reconciled or rewritten.

## Decisions

1. **One request per run.** The adapter fetches
   `https://stats.nba.com/stats/leaguegamelog?…&Season=<derived>&SeasonType=Playoffs&PlayerOrTeam=T&Counter=1000`
   once, parses it into an internal index, and both port methods (`fetch_series_statuses`,
   `fetch_game_scores`) read that cached parse. Rate limits are unmeasured on a Cloudflare-fronted
   route that 403s guessed paths, so a run must not fan out.
2. **Season derivation from the run's UTC date, `--season=` to override.** The postseason of season
   `Y-1`–`Y` is played in calendar year `Y`, so Jan–Jun → `${year-1}-${yy}`, Jul–Dec →
   `${year}-${yy+1}`. An offseason run therefore asks for a season with no playoff games, gets zero
   rows, and plans nothing — the empty-but-non-breaking offseason requirement met without a date
   *rule*. This is a fetch parameter only: no phase, group, or page derives from a date (AD-4).
3. **Game-7 series only.** A series enters the adapter's output iff its games are exactly {1..6}
   decided with a 3–3 split (→ birth/pending) or exactly {1..7} all decided (→ archive). Every other
   shape — a 4-0/4-1/4-2 series, an in-flight 2-1, a pre-2003 best-of-5 — is excluded and counted in
   the run summary ("N series in feed, M Game-7 candidates"). That is AD-4's product rule (coverage
   is born at a certified 3–3), it matches the archive's measured shape (178 rows, seven games each),
   and it discharges the spike's era caveat for free: a five-game series never reaches either shape,
   so nothing has to know about 2003.
4. **Slots and ids: `team_a` = game 1's home team.** The runner already asserts it
   (`plan.ts:194-200`), and NBA scheduling puts game 1 at the higher seed, so `epics.md:368`'s intent
   holds without any seed field — the feed does not carry one. `year` comes from the calendar year of
   `GAME_DATE`, never `SEASON_ID`; `game_number` from date order within the team pair, never the
   `GAME_ID` suffix (hazards 1 and 2 of the spike's inherit list).
5. **Never consume a same-UTC-day game.** A game whose `GAME_DATE` equals the run's UTC date is
   excluded: `leaguegamelog` has no final/unfinal status, and the product rule is that a game is not
   over until it is over. FR-21's daily 09:00 UTC cadence (Story 2.6) makes the exclusion invisible in
   practice — those games are in tomorrow's run.
6. **Failure posture:** `AbortSignal.timeout(25000)`, three attempts with backoff on 403/429/5xx or a
   body that is not the expected `resultSets` shape, then a non-zero exit naming the URL and status.
   The spike's header set is copied verbatim (`User-Agent`, `Accept`, `Referer`, `Origin`,
   `x-nba-stats-origin`, `x-nba-stats-token`) — no key, so nothing here becomes a Story 2.6 secret.
   No silent fallback to `manual_csv`, ever.
7. **`fantrax` stays in the registry** as recognised-but-unimplemented, with its message pointing at
   the decision record's rejection (fantasy-scoped payloads, no real game score). Recorded as
   rejected, not silently dropped.
8. **The port's deps generalize instead of accreting CSV fields.** `AdapterDeps` gains the
   adapter-specific pieces it needs (a season/date seam and an injectable `fetch`) while `csvPath`
   becomes CSV-only, so `run.ts` stops resolving a CSV path for adapters that cannot use it.
   `tests/pipeline` never touches the network — the adapter is tested against a fixture body through
   the injected `fetch`.
9. **This story records the owner's frozen-archive decision** (option (a), 2026-10-01) in
   `deferred-work.md`, `epic-2-context.md` and `docs/CURRENT_DATA_MODEL.md`, so the inheritance is
   repo state rather than conversation.
10. **Round labels are round-only, derived from chain depth** (owner call 2026-10-01: 1A). The
    canonical list is exactly `First Round`, `Conference Semifinals`, `Conference Finals`,
    `NBA Finals` — no conference prefix, so no 30-team conference map enters the repo and the blob's
    2.7 MB request stays unused. Depth is computed from the games: walk the postseason in date order
    and a series' depth is one more than the deeper of its two teams' previous series this postseason.
    The four labels must land in `getRoundImportance`'s 1/2/3/4 branches respectively. Two same-year
    "First Round" series are told apart by their teams — which `round` was never responsible for
    anyway, since Story 2.2 took it out of the identity key.
11. **The freeze is enforced by the adapter's scope, not by a new guard** (owner call 2026-10-01: 2A).
    No `FROZEN_ARCHIVE_YEAR` constant and no plan-level soft skip: `nba_com` fetches the one postseason
    derived from the run date, so a year already in the archive cannot enter the plan. The protection
    that does exist is Story 2.3's — `plan.ts:382-390` skips an archived row whose source matches and
    throws when it disagrees — and this story leaves that logic untouched. Consequence accepted and
    documented rather than engineered away: a `--season=2016` drill reaches that throw, so `--season`
    help text and the port doc name the frozen-archive rule in plain words, and a test pins that the
    disagreement message is what a drill sees.
12. **The live leg of AC:369 is owner-run** (owner call 2026-10-01: 3A). This session's policy refused
    the agent's outbound probe, so the story ships `scripts/probe-nba-com-adapter.mjs` (unkeyed,
    read-only, zero Supabase calls), the owner runs it, and its pasted output becomes this spec's
    evidence before the story can be called done. Nothing is claimed about the feed's current
    reachability until that output exists. Unit tests are served by a small synthetic fixture built in
    the test file — no captured production response is committed.

## Boundaries & Constraints

**Always:**
- The adapter returns the port's row shapes verbatim (`SeriesStatusRow`, `GameScoreRow`); it never
  calls the sink, the RPCs, or Supabase at all. Writes stay the runner's job.
- Idempotency, the either-slot-order identity assertion, the AD-4 invariant assertion, `--dry-run`
  issuing zero writes, `service_role` from environment only, and non-zero exit on any failure are
  inherited unchanged from Story 2.3 — the adapter adds none of them and weakens none.
- `round` values the adapter writes come from one fixed canonical list it derives itself, and it
  never rewrites an archived `round` spelling (the 17 era values stay as written).
- Every run prints the derived depth histogram (a postseason in flight legitimately shows a partial
  one, so it is information, not a gate). A series whose derived depth falls outside 1..4 is excluded
  and named in the summary — that is the chain walk meeting a bracket shape it cannot explain, and a
  wrong `round` label must not pass silently.
- `getRoundImportance` (`src/lib/nba-utils.ts:58-65`) stays untouched and substring-tolerant, so both
  vocabularies render on the same table.
- The adapter's selection of series (Decision 3) is reported as counts on every run, so a silent
  narrowing of coverage cannot pass unnoticed.
- The archive is frozen: nothing in this story mutates, deletes, or re-labels an existing row.

**Never:**
- No migration, no DDL, no `supabase db push`/`db reset`/`db start`, no `psql` at the linked project.
  The agent never runs the adapter against production writes.
- No scheduling, no CI workflow, no notification (Story 2.6). No insights refresh (Story 2.5). No
  historical backfill of the archive (the freeze decision rules it out).
- No new dependency (Node's built-in `fetch`), no new secret, no `VITE_*` change, no PostHog event
  name or `series_source` value change.
- No change to `src/**` read paths, `supabase/functions/**`, earlier migrations, or 00015.
- No wagering/odds/guaranteed-pick mechanics; no live/in-game scoring surface.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error handling |
|----------|--------------|---------------------------|----------------|
| In-flight 3–3 | feed has one series, games 1–6 decided, 3 wins each | status: `winner_team_id NULL`; six game rows; slots from game 1's home → runner births | N/A |
| Completed Game 7 | feed has seven decided games | status carries the game-7 winner; seven rows → runner completes (or skips if already archived by us) | N/A |
| 4-2 sweep | series ended in six games | excluded from output, counted in the summary; a series already archived from it is never touched | N/A |
| In-flight 2-1 | three games so far | excluded, counted | N/A |
| 4-0 sweep | four games, all won by one team | excluded by Decision 3 (never reaches six or seven), counted in the summary | N/A |
| Game played today | `GAME_DATE` == run UTC date | excluded (Decision 5) — an unfinished game can never become a certified score | counted in the summary |
| Offseason run | derived season has no playoff games | zero rows, empty plan, exit 0 | N/A |
| Feed refuses | 403 / non-JSON / missing `resultSet` | retried per Decision 6, then exit non-zero naming URL + status | never a `manual_csv` fallback |
| Feed shape drift | row present but `MATCHUP` unparseable, or `PTS` null on a final game | adapter rejects naming the `GAME_ID` | exit non-zero, zero writes |
| Two teams, one game id | both rows of a game merge on (date, unordered pair) | one game row with home/away ids + both scores | self-match and tie rejected as today |
| Round derivation | a fixture 16-team postseason (8/4/2/1 bracket) | labels are exactly `First Round` / `Conference Semifinals` / `Conference Finals` / `NBA Finals` by chain depth, and map through `getRoundImportance` to 1/2/3/4 | N/A |
| Chain walk unexplained | a derived depth outside 1..4 (more rounds than a 16-team bracket holds, or one team in two series at the same depth) | excluded from the output and named in the summary with the histogram that produced it | exit 0, zero writes for it — a display gap, not a corrupt row |
| Frozen year in feed | reachable only through `--season=` pointed at an archived year | Story 2.3's archive guard decides: source matches the stored rows → `skip`; disagrees → abort naming the series and the rule it protects | exit non-zero, zero writes |
| Re-run identical | same feed, rows already on the table | plan is all skips, zero writes | N/A |

</frozen-after-approval>

## Code Map

- `supabase/scripts/pipeline/port.ts` -- `SeriesDataSource` (:45-48, both method names verbatim from
  AD-5); `SeriesStatusRow` (:22-30) `year, round, team_a_id, team_b_id, winner_team_id|null`;
  `GameScoreRow` (:33-42) five comparable fields, **no per-game winner** (plan derives it,
  `plan.ts:178`); `AdapterEntry`/`AdapterDeps` (:55-67) — CSV-shaped today, Decision 8 generalizes;
  `ADAPTER_REGISTRY` (:80-84) where `nba_com: unimplementedEntry()` (:83) becomes implemented;
  `assertAdapterImplemented` (:91) and `createAdapterSource` (:108).
- `supabase/scripts/pipeline/adapters/manualCsv.ts` -- the reference implementation to mirror:
  unordered-pair grouping key (:139), slots fixed by the game-1 row (:163-171), `rowRef()` message
  style (:50-52), eager read-then-validate so bad data fails before any write (:201-203).
- `supabase/scripts/pipeline/plan.ts` -- `planPipeline(sources, current)` (:291) and
  `groupSourceRows` (:260, joins on the *ordered* pair, so the adapter must emit slots itself);
  the assertions the adapter must satisfy: either-slot source duplicate (:302-305), team_a = game 1
  home (:194-200), archive shape (:206-219), 3–3 before game 7 (:223-231), pending 3–3 (:235-247),
  never-rewrite-stored-games (:377-379), **archive branch** (:382-390: identical source → `skip` at
  :384, disagreement → throw at :387-389), unrepairable → :414-416.
- `supabase/scripts/pipeline/writer.ts` -- `PipelineSink` (:25-32), `scorePayload` (:34) — the five
  fields, no winner; `SERIES_SELECT` (:61-62) fetches **no `created_at` and no `round`**, which is why
  the freeze is a fetch-scope rule (Decision 11) and not a stored-timestamp comparison — reading a row
  date to decide anything would break AD-4. Not edited by this story.
- `supabase/scripts/pipeline/run.ts` -- flags (:48-62), `unknownFlag` (:60), adapter assertion before
  secrets (:123), `csvPath` resolution (:124 — CSV-only after Decision 8), `requiredEnv` order
  (:126-127), `loadSource` (:180-185), `describePlan` (:76-94), exit code 2 (:173-177).
- `scripts/spike-2-1/probe-series-rebuild.mjs` -- the *proven* parse to port into the adapter: header
  set (:5-12), URL template (:13-14), `Object.fromEntries(headers.map)` column index (:20), MATCHUP
  parse with the trailing period and the two-row merge on (date, unordered pair) (:29-46), date-order
  sort (:68), unordered-pair series grouping (:54-58), win tallies + deciding game (:66-72).
- `scripts/spike-2-1/probe-history-and-providers.mjs` -- :53/:58 are the **superseded** `split(' vs ')`
  and `startsWith(abbr + ' @')` parsers that shatter series; do not reuse. :29 shows the only
  rate-header capture in the repo. `boxscoretraditionalv2` (:92) is the endpoint that answered 200 for
  the cross-check leg; `boxscore` 404s.
- `scripts/spike-2-1/probe-cdn-shape.mjs` -- :6-9 the lean CDN header set; :25/:29 the
  `gameStageType`/`gameStatus` histograms — the only scripted evidence behind the blob route Decision
  10 declines.
- `src/lib/nba-utils.ts:49-65` -- `getRoundImportance` branch order (semifinals → conf+finals →
  finals → first round): the adapter's canonical labels must land in the intended branch, and the
  comment pins "NBA Finals" 4 / "Conference Semifinals" 2 / "First Round" 1 as a vocabulary the tests
  already assert (`src/lib/__tests__/nba-utils.test.ts:38-59`).
- `supabase/migrations/00005_release_1_data_model.sql:14-23` -- `teams` has `id`, `full_name`,
  `abbreviation`, `city`, `nickname`, `logo_url` and **no conference column** — the cost Decision 10
  avoids by keeping labels round-only.
- `_bmad-output/implementation-artifacts/seriesdatasource-port.md` -- the port contract doc; gains the
  `nba_com` adapter section (epics.md:353's location).
- `_bmad-output/implementation-artifacts/deferred-work.md` :293-294 (slots-not-venues, → this story),
  :285-286, and the Story 2.2 entry at :280 — the freeze decision lands here.
- Not touching: `src/**`, `supabase/functions/**`, `supabase/migrations/**`,
  `scripts/probe-predict-contract.mjs`, the 00015 RPCs.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/scripts/pipeline/adapters/nbaCom.ts` (new) -- the adapter: one-request fetch with
      Decision 6's posture, game reconstruction ported from `probe-series-rebuild.mjs:29-46`, series
      grouping, Game-7-only selection, slots from game 1's home, `round` derivation, and the
      rejection messages naming `GAME_ID`.
- [x] `supabase/scripts/pipeline/adapters/rounds.ts` (new, or inside `nbaCom.ts` if it stays under
      ~40 lines) -- the frozen canonical label list and the chain-depth derivation.
- [x] `supabase/scripts/pipeline/port.ts` -- register `nba_com` as implemented; generalize
      `AdapterDeps` per Decision 8 (CSV-only fields, injectable `fetch`, season/date seam).
- [x] `supabase/scripts/pipeline/run.ts` -- stop requiring CSV plumbing for non-CSV adapters; pass the
      new deps; add `--season=` to the flag set and the `unknownFlag` message, with its help text
      naming the freeze rule (Decision 11) so a drill onto an archived year reads as intentional;
      print the adapter's selection counts and the derived depth histogram.
- [x] `tests/pipeline/nba-com.test.ts` (new) -- the matrix rows above against an injected `fetch`
      (a synthetic fixture postseason built in the test file, zero network): pending 3–3 → six rows +
      null winner; seven-game → winner = game 7's winner; 4-0 / 4-2 / in-flight 2-1 / same-UTC-day
      excluded and counted; the `vs.` period and date-order game numbers pinned; the two-row merge;
      tie and self-match rejected naming `GAME_ID`; 403-then-success retry and exhausted-retry exit;
      the depth histogram exactly {1:8, 2:4, 3:2, 4:1} with each label mapping through
      `getRoundImportance` to 1/2/3/4; a partial mid-playoff fixture printing its real histogram
      without complaint; a constructed feed whose chain walk derives depth 5, excluded and named; and
      one test pinning that a `--season=` drill onto a disagreeing archived year surfaces Story 2.3's
      archive-guard message rather than a write.
- [x] `scripts/probe-nba-com-adapter.mjs` (new) -- the committed live leg for AC:369, **owner-run** per
      Decision 12: unkeyed, read-only (no Supabase at all), prints the derived round, depth histogram
      and per-game home/away scores for one real postseason, and cross-checks one Game 7 against
      `boxscoretraditionalv2`; exit 2 if it cannot run. Its pasted output is the story's live evidence.
- [x] `_bmad-output/implementation-artifacts/seriesdatasource-port.md` -- document the `nba_com`
      adapter beside `manual_csv`: request count, selection rule, round vocabulary, freeze rule, and
      that `fantrax` stays rejected.
- [x] `docs/CURRENT_DATA_MODEL.md`, `epic-2-context.md`, `deferred-work.md` -- record the
      frozen-archive decision (a) and its enforcement point; update the slots-vs-venues paragraph so it
      states the decision rather than the open question.

**Acceptance Criteria:**
- Given the adapter with an injected fetch returning a fixture postseason, when both port methods run,
  then they produce only the two declared row shapes, from exactly one HTTP request, and the runner
  plans births/completions/skips for the Game-7 series with no plan assertion firing.
- Given a feed series that did not reach Game 7 (or is in flight, or was played the same UTC day),
  then it is absent from the output and named in the run's counts line — and no write is issued for it.
- Given every source game row, then `team_a_id` equals game 1's `home_team_id`, `year` equals the
  calendar year of `GAME_DATE`, and `game_number` follows date order — asserted by the plan, tested by
  the adapter.
- Given two runs with the same feed, then the second plans zero writes (existing all-skip behavior).
- Given a feed request that 403s three times, then the run exits non-zero naming the URL and status,
  writes nothing, and does not select `manual_csv`.
- Given the round derivation over a fixture 16-team postseason, then the depth histogram is exactly
  {1:8, 2:4, 3:2, 4:1} and every emitted label maps through `getRoundImportance` to the intended
  branch; given a chain walk that derives a depth outside 1..4, then that series is excluded, named,
  and written nowhere.
- Given a source series in an archived year (reachable only via `--season=`), then Story 2.3's existing
  archive guard decides — skip when the source matches, non-zero abort naming the series when it
  disagrees — and nothing in this story weakens either outcome.
- Given the probe script has been run by the owner, then its pasted output in this spec is the story's
  only live-source evidence; until that output exists the story cannot be marked done, and no claim is
  made that the feed still answers the 2026-09-30 header posture.
- `manual_csv` still selectable and still the default; `nba_com` never removes or demotes it.
- No credential, no new dependency, no migration, no DDL, no `src/**` edit ships from this story;
  `npm run gate` green read bare.

## Implementation Notes

Built 2026-10-01 on `baseline_commit 0f740f9`. **The story is not `done`:** Decision 12 makes AC:369's
live clause the owner's, and `node scripts/probe-nba-com-adapter.mjs` has not been run yet (this
session's policy refused the agent's outbound call to stats.nba.com). Until its output is pasted at the
bottom of this section, nothing here claims the feed still answers the 2026-09-30 header posture.
`status` stays `in-progress` and `sprint-status.yaml:51` stays `in-progress` for the same reason.

**Files created**

- `supabase/scripts/pipeline/adapters/rounds.ts` (69 lines) — `ROUND_LABELS_BY_DEPTH`
  (`First Round` / `Conference Semifinals` / `Conference Finals` / `NBA Finals`, the frozen Decision 10
  list), `deriveChainDepths(series)` (sort by `startDate` then `key`; `depth = 1 + max(prevDepth(teamA),
  prevDepth(teamB))`, per team kept at its deepest series), `roundLabelForDepth(depth)` (undefined
  outside 1..4, which is what makes the exclusion loud instead of silent).
- `supabase/scripts/pipeline/adapters/nbaCom.ts` (458 lines) — `NbaComError`; `NBA_STATS_HEADERS`
  copied verbatim from `probe-series-rebuild.mjs:5-12`; `gameLogUrl(season)` (Decision 1's single
  URL, `URLSearchParams`-built); `deriveSeason(runDate)` (Decision 2, `getUTCMonth() <= 5`);
  `fetchFeed` (Decision 6: `AbortSignal.timeout(25000)`, 3 attempts, `[1000, 4000]` ms backoff on
  403/429/5xx, a thrown `json()` or a non-`resultSets` body; a non-retryable status fails at once;
  every terminal message names the URL and status and says no `manual_csv` fallback was taken);
  `parseMatchup` (`' @ '` then `' vs. '` — the period; anything else throws naming the `GAME_ID`);
  `buildGames` (two-row merge on `(GAME_DATE, unordered pair)`, placeholder-aware so **either row may
  arrive first** — a side's real claim is its `TEAM_ID`, a bare abbreviation written by the opponent's
  row is not); `buildSeries` (both ids present, no self-match, no null `PTS`, no tie — each rejected
  naming the `GAME_ID`; key `${calendar year}|${min id}|${max id}`; games sorted by date then `GAME_ID`);
  `loadParsedFeed` (Decision 5 same-UTC-day exclusion counted, chain depths over **all** feed series so
  the walk sees the real bracket while selection emits only Game-7 shapes, the histogram, then
  Decision 3's `{1..6}@3–3` / `{1..7}` selection with everything else excluded+counted and a
  depth-outside-1..4 exclusion **named** in `notes`); `createNbaComAdapter` (memoised single fetch
  behind both port methods; malformed `--season=` throws at factory time, before any request;
  `describeRun()` throws if called before the feed resolved, so a run can never report a parse it
  never did).
- `tests/pipeline/nba-com.test.ts` (32 tests) — the I/O matrix row by row against an injected `fetch`
  and a synthetic fixture postseason built in the file (zero network, zero Supabase): the season
  derivation table, the one Decision-1 URL, malformed `--season=`, both methods reading one cached
  parse (`urls.length === 1`), offseason zero rows → runner exit 0, pending 3–3, completed Game 7,
  4-2/4-0/in-flight 2-1 excluded+counted, the impossible 4-2-then-Game-7 reaching `plan.ts`'s 3–3
  assertion (exit 2, `went 4-2 through six`, zero births), same-UTC-day exclusion, two-row merge,
  date-order numbers vs. the `101+3n` GAME_ID suffixes, calendar year ≠ `SEASON_ID`, the
  no-trailing-period `MATCHUP` reject, tie / null-`PTS` / half-merged / self-match rejects, 403×2-then-
  success (3 calls, 2 backoff sleeps), non-JSON + bad-shape retries, 3×403 → exit 2 naming URL+status
  with zero writes and no `manual_csv`, 404 → immediate, histogram exactly `{1:8, 2:4, 3:2, 4:1}`, the
  four labels each landing in `getRoundImportance`'s 1/2/3/4 branch, a mid-playoff partial histogram
  printed without complaint, a constructed depth-5 series excluded and named, the runner birth printing
  the counts line + histogram, a re-run that is all skips, completing a pending series, the
  `--season=2016-17` **disagreeing** drill landing on the archive guard's message with zero writes, the
  **matching** drill skipping with `already archived with identical games 1–7`, and the unknown-flag
  help text naming `--season=` and the freeze rule.
- `scripts/probe-nba-com-adapter.mjs` (237 lines) — the owner-run live leg: unkeyed, read-only, zero
  Supabase calls; one `leaguegamelog` fetch (adapter's headers/posture), the same two-row merge,
  same-UTC-day count, series grouping + chain-depth labels + histogram, the counts line, every Game-7
  candidate's round and per-game `AWAY pts @ HOME pts` lines, then one completed Game 7 cross-checked
  field-by-field against `boxscoretraditionalv2` (summing `PTS` by `TEAM_ID` on the first sheet that
  carries both). `--season=` picks the postseason; without it the season derives from today. Exit 2 on
  refusal, shape drift, no completed Game 7, or a cross-check disagreement; sets `process.exitCode`
  only (never `process.exit` — the Windows libuv race this repo already recorded).

**Files edited**

- `supabase/scripts/pipeline/port.ts` — `nba_com` registered as implemented (Decision 7: `fantrax`
  stays recognised-but-unimplemented, its `reason` naming the Story 2.1 spike rejection and the
  decision record); `AdapterEntry.reason`; `assertAdapterImplemented`'s message now quotes that reason
  and repeats that the runner never falls back silently; `AdapterDeps` generalized per Decision 8
  (`csvPath?` now CSV-only, plus `season?`, `runDate?`, `fetch?`, `sleep?`); the narrow
  `AdapterFetch`/`AdapterFetchInit`/`AdapterFetchResponse` seam; the optional `describeRun?():
  AdapterRunReport` (documented as **not** one of AD-5's frozen two). AD-5's two method names, the two
  row shapes and the identity convention are unchanged.
- `supabase/scripts/pipeline/adapters/manualCsv.ts` — `createManualCsvAdapter` now fails loudly if
  `csvPath` is missing (the consequence of making it optional; `manual_csv`'s behaviour with a path is
  unchanged and it is still `DEFAULT_ADAPTER_NAME`).
- `supabase/scripts/pipeline/run.ts` — `--season=` added to the flag set and to `unknownFlag`;
  `flagHelp()` names the frozen-archive rule beside it (Decision 11); `csvPath` resolved only for
  `manual_csv` (Decision 8); `RunDeps` gained `now?`, `fetch?`, `sleep?` test seams (the `sleep` seam
  is what keeps a refused-feed test off real timers); `loadSource` collects the adapter's
  `describeRun?.()` report and the run prints `countsLine`, `depth histogram: {…}` and every note
  before the plan. No planning, asserting or writing logic changed; `plan.ts`, `writer.ts`,
  `src/**`, `supabase/functions/**` and every migration are untouched.
- `tests/pipeline/run.test.ts` — the "unimplemented adapter refuses the start" case moved from
  `nba_com` (now implemented) to `fantrax`, asserting the spike-rejection message and
  `never falls back silently`, with the sink never built.
- Docs (Decision 9): `seriesdatasource-port.md` gained the `nba_com` section (one request per run,
  Game-7 selection, round vocabulary, failure posture, the freeze rule, `describeRun`, the generalized
  deps, `fantrax` still rejected) and lost the stale "`nba_com` until Story 2.4" wording;
  `docs/CURRENT_DATA_MODEL.md` § "The archive carries slots, not venues — and it is frozen" records
  option (a) and names the enforcement point (fetch scope + Story 2.3's guard, no constant, no date
  comparison); `epic-2-context.md`'s slot-convention bullet states the decided rule instead of the
  open question, its source-access bullet records that `nba_com` shipped, and its hazards bullet
  records which hazards the adapter inherited and what it still does not claim; `deferred-work.md`
  closes the slots-not-venues entry, closes the round-vocabulary entry to the chain-depth derivation,
  and narrows the in-season spike entry (Decision 5 makes the live-status question moot for this
  adapter while the owner-run probe and the 2027 rate ceiling stay owed).

**Verification run**

- `npm run gate` — exit 0 read bare: Biome clean, `tsc -b` clean (pipeline tsconfig covers
  `supabase/scripts/pipeline` + `tests`), 19 files / 236 tests green, `vite build` + base-prefix
  verify green. `npx vitest run tests/pipeline` — 4 files / 80 tests green, every `nba_com` test served
  by the injected `fetch`; nothing in the suite reaches the network or Supabase.
- `node --check scripts/probe-nba-com-adapter.mjs` — clean parse (exit 0). `scripts/**` is outside every
  gate by design, same as the Story 2.1 spike scripts.
- Mutation checks (all four applied, run, and reverted by the exact reverse edit — the four regions were
  then re-read in the file and the whole gate re-run green from the reverted state):
  1. `isPendingShape = count === 6` (emit a 4-2 series) → 2 tests red: *"a 4-2, a 4-0 and an in-flight
     2-1 are excluded and counted"* and *"a postseason in flight prints its real partial histogram"*.
     Independently confirmed against the plan: feeding the mutated adapter's output to
     `planPipeline(groupSourceRows(…))` threw `(2027, team 18 vs 20): not a certified 3–3 — games 1–6
     split 4-2; birth requires six final games with three wins each` — the AD-4 assertion is what
     catches it, exactly as the spec predicted.
  2. `' vs. '` → `' vs '` (period dropped) → 23 tests red, including *"merges a game's two rows on
     (date, unordered pair)"* and *"rejects a MATCHUP without the trailing period naming the GAME_ID"*;
     the naive split really does shatter the feed.
  3. year from the season identifier instead of `GAME_DATE` → 4 tests red, including *"year comes from
     the calendar year of GAME_DATE, never SEASON_ID"*.
  4. same-UTC-day filter removed → 1 test red: *"a game played the run UTC day is excluded and counted"*.
- Not run by the agent (owner-only, each for a stated reason): `node scripts/probe-nba-com-adapter.mjs`
  (Decision 12 — session policy refused the outbound call), and
  `node supabase/scripts/pipeline/run.ts --source=nba_com --dry-run` (needs `service_role` and opens a
  production session).

**Owner handover — what closes this story**

1. Run `node scripts/probe-nba-com-adapter.mjs --season=2025-26` (the most recent completed postseason;
   without `--season=` today's UTC date derives `2026-27`, which is empty until the 2027 playoffs and an
   empty feed there is the expected shape, not a failure). Paste the full output below. Exit 0 plus the
   `cross-check … PASS` lines is AC:369's live evidence; exit 2 says which leg refused and the story
   stays open by design.
2. Then `node --env-file=.env supabase/scripts/pipeline/run.ts --source=nba_com --dry-run` inside a
   playoff window and read the counts line + histogram against the feed.
3. Only after 1: `status` → `done` here and in `sprint-status.yaml`.

### Live evidence (AC:369) — OWED, owner-run

```
(paste the output of `node scripts/probe-nba-com-adapter.mjs --season=2025-26` here)
```

## Spec Change Log

- 2026-10-01 (build): no frozen Decision, AC or Boundary changed — the implementation follows the
  approved text as written, and the three owner calls the spec already records (1A round-only chain
  depth, 2A freeze-by-fetch-scope, 3A owner-run live leg) are the ones that shaped it. Task checkboxes
  ticked for everything shipped; `## Implementation Notes` drafted with the verification run and the
  four mutation checks. Frontmatter `status` deliberately left `in-progress`: AC:369's live clause is
  unmet until the owner pastes the probe output (Decision 12), so this story cannot be called done from
  unit evidence alone.

## Review Triage Log

## Design Notes

**Chain depth instead of a bracket feed.** The bracket endpoint is retired and the round-name gap is
the spike's one unmet AC, so the label is computed from the games themselves: walk the postseason in
date order, and each series' depth is one more than the deeper of its two teams' previous series'
depth. Depths 1-4 map to the four canonical labels. It needs no conference table, no extra request,
and it prints its own working: a complete 16-team postseason yields 8/4/2/1 by depth, a postseason in
flight yields a partial histogram, and either way the numbers are on the run's output where a reviewer
can see them.

## Verification

**Commands:**
- `npm run gate` -- expected exit 0, read bare. Covers the new adapter (Biome's `supabase/scripts/**`,
  `tsconfig.pipeline.json`, `tests/pipeline`), which is what makes an HTTP adapter safe to land in a
  repo whose live evidence is otherwise CI-only.
- `npx vitest run tests/pipeline` -- expected: the matrix above green, every test served by an injected
  `fetch`, none reaching the network.
- `node --check scripts/probe-nba-com-adapter.mjs` -- expected: clean parse (the committed live leg;
  `scripts/**` is outside every gate by design, same as the Story 2.1 spike scripts).
- `node scripts/probe-nba-com-adapter.mjs` -- **owner-run** (Decision 12; the agent's outbound call was
  refused by session policy). Expected: one unkeyed postseason fetch, the derived round per series, the
  depth histogram, and one Game 7 cross-checked field-by-field against `boxscoretraditionalv2`, exit 0.
  Its output is pasted into `## Implementation Notes` here — that is what closes AC:369's live clause,
  and it is also the first evidence that Story 2.1's header posture still works a day later.
- `node supabase/scripts/pipeline/run.ts --source=nba_com --dry-run` -- expected: needs
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` before it reaches the feed, then prints the counts line
  and an empty-or-real plan with zero writes. **Owner-run**: it opens a production session.
- Mutation checks: make the adapter emit a 4-2 series and confirm the plan's 3–3 assertion reddens;
  drop the trailing period from the `vs.` split and confirm the two-row merge test reddens; make the
  season derive from `SEASON_ID` and confirm the calendar-year test reddens; let a same-UTC-day game
  through and confirm the certification test reddens.
