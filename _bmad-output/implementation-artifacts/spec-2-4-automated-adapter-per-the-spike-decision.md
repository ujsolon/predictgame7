---
title: 'Story 2.4 — Automated adapter per the spike decision'
type: 'feature'
created: '2026-10-01'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 1
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
  `teamIdByAbbreviation` (:61) is already in the deps bag and `manual_csv` already uses it, so the
  abbreviation→id path needs no new seam; `ADAPTER_REGISTRY` (:80-84) where `nba_com: unimplementedEntry()`
  (:83) becomes implemented; `assertAdapterImplemented` (:91) and `createAdapterSource` (:108).
- `supabase/scripts/pipeline/adapters/manualCsv.ts` -- the reference implementation to mirror:
  unordered-pair grouping key (:139), slots fixed by the game-1 row (:163-171), `rowRef()` message
  style (:50-52), eager read-then-validate so bad data fails before any write (:201-203), and
  **`deps.teamIdByAbbreviation` (:126-133)** — the port's abbreviation→id resolver, which throws naming the
  abbreviation and the row reference when a name is not in the `teams` table. `nba_com` reads abbreviations
  too (`MATCHUP`), so it uses the same resolver; it is the only path in the repo that turns a team name into
  an id, and the sink's FK columns are what the ids must satisfy.
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
- `supabase/migrations/00005_release_1_data_model.sql` -- :14-23 `teams` has `id`, `full_name`,
  `abbreviation`, `city`, `nickname`, `logo_url` and **no conference column** — the cost Decision 10
  avoids by keeping labels round-only. :104-133 seeds the 30 rows **alphabetically by city**, so `teams.id`
  is a repo-local numbering (`ATL`=1, `BOS`=2, `CLE`=6, `GSW`=10, `MIA`=16, `NYK`=20, `PHI`=23), not a
  league id. :30-31 and :44-45 put `REFERENCES teams(id)` on `series.team_a_id`/`team_b_id` and
  `series_game_scores.home_team_id`/`away_team_id` (`winner_team_id` likewise) — **every team id this
  adapter emits must be a `teams.id`**, and a foreign feed's own numeric `TEAM_ID` is a different namespace
  until something measures the two against each other.
- `_bmad-output/implementation-artifacts/decision-2-1-q-4-data-source.md:104` -- the mapping row that says
  "`team_a_id`, `team_b_id` | `TEAM_ID` from the two rows of a game | numeric ids already match the app's
  team ids". **Unsourced**: no script in `scripts/spike-2-1/` compares a feed `TEAM_ID` with `teams.id`, and
  both spike scripts group by abbreviation. Do not read it as a measurement — the id space is settled by
  `deps.teamIdByAbbreviation`, and the owner-run probe prints the pairs so the live feed can be checked
  against the seed on the first real run.
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
      rejection messages naming `GAME_ID`. **Team identity is resolved, not copied: each row's
      `TEAM_ABBREVIATION` goes through `deps.teamIdByAbbreviation` — the same resolver `manual_csv` uses —
      and the feed's `TEAM_ID` is never used as an id** (it is a foreign namespace; the sink's columns carry
      `REFERENCES teams(id)`, Code Map `00005:30-31,104-133`). An abbreviation the `teams` table does not
      hold rejects the run naming **both the abbreviation and the `GAME_ID`**. Consequences:
      `TEAM_ABBREVIATION` joins the required-column list because the parser reads it, and `WL` leaves it
      because nothing reads it — the list names what the adapter consumes, and an unconsumed requirement is
      a needless abort if the feed ever drops that column.
- [x] `supabase/scripts/pipeline/adapters/rounds.ts` (new, or inside `nbaCom.ts` if it stays under
      ~40 lines) -- the frozen canonical label list and the chain-depth derivation. Export the histogram
      formatter from here (or from `nbaCom.ts`) so `run.ts` renders the adapter's field by calling it rather
      than by keeping a second copy that can diverge.
- [x] `supabase/scripts/pipeline/port.ts` -- register `nba_com` as implemented; generalize
      `AdapterDeps` per Decision 8 (CSV-only fields, injectable `fetch`, season/date seam).
      `teamIdByAbbreviation` is already in the bag (:61) — reuse it, do not add a second id path.
- [x] `supabase/scripts/pipeline/run.ts` -- stop requiring CSV plumbing for non-CSV adapters; pass the
      new deps; add `--season=` to the flag set and the `unknownFlag` message, with its help text
      naming the freeze rule (Decision 11) so a drill onto an archived year reads as intentional;
      **refuse a flag that cannot apply to the selected adapter (`--csv=` with `nba_com`, `--season=` with
      `manual_csv`) — a silently discarded flag is the same class of mistake the file already refuses for a
      `--dryrun` typo**; and print the adapter's report — counts line, histogram, notes — **before**
      `readCurrent()` and `planPipeline()`, so an abort during planning still shows the parse that explains
      it. `manual_csv` has no report; a run with it prints none of those lines and must not error for it.
- [x] `tests/pipeline/nba-com.test.ts` (new) -- the matrix rows above against an injected `fetch`
      (a synthetic fixture postseason built in the test file, zero network): pending 3–3 → six rows +
      null winner; seven-game → winner = game 7's winner; 4-0 / 4-2 / in-flight 2-1 / same-UTC-day
      excluded and counted; the `vs.` period and date-order game numbers pinned; the two-row merge;
      tie and self-match rejected naming `GAME_ID`; 403-then-success retry and exhausted-retry exit;
      the depth histogram exactly {1:8, 2:4, 3:2, 4:1} with each label mapping through
      `getRoundImportance` to 1/2/3/4; a partial mid-playoff fixture printing its real histogram
      without complaint; a constructed feed whose chain walk derives depth 5, excluded and named; and
      one test pinning that a `--season=` drill onto a disagreeing archived year surfaces Story 2.3's
      archive-guard message rather than a write. **The fixture's id space is the `teams` seed's: abbreviations
      resolve to `00005:104-133`'s numbers (`BOS`=2, `MIA`=16, `CLE`=6, `GSW`=10, …), and the feed's
      `TEAM_ID` values are deliberately ids the seed assigns to other franchises, so a test fails if the
      adapter ever reads them.** Add: an unknown abbreviation rejecting with abbreviation + `GAME_ID`;
      the request contract asserted through the stub's second argument (the six header names and values, the
      25 s timeout present on the signal, the `[1000, 4000]` backoff sequence rather than a call count); the
      notes line reaching stdout through `runPipeline`; `describeRun()` throwing before the feed resolved;
      and `manual_csv` reporting nothing extra.
- [x] `scripts/probe-nba-com-adapter.mjs` (new) -- the committed live leg for AC:369, **owner-run** per
      Decision 12: unkeyed, read-only (no Supabase at all), exit 2 if it cannot run. **It runs the shipped
      adapter** — import `createNbaComAdapter` and hand it an injected `fetch` that captures the real
      response — rather than re-implementing the headers, URL, season math, merge or depth walk, so a PASS
      certifies the code CI will run instead of a laxer copy of it. It prints the derived round, the depth
      histogram and per-game home/away scores for one real postseason, **prints each
      `TEAM_ID` ↔ abbreviation ↔ resolved `teams.id` triple it saw (the measurement
      `decision-2-1-q-4-data-source.md:104` never made — the owner reads whether the two spaces agree)**,
      and cross-checks one Game 7 against `boxscoretraditionalv2`. Its usage text names
      `--season=2025-26` as the season that has completed playoff games today.
- [x] `_bmad-output/implementation-artifacts/seriesdatasource-port.md` -- document the `nba_com`
      adapter beside `manual_csv`: request count, selection rule, round vocabulary, **that team identity is
      resolved through the port's abbreviation resolver and what that means when the feed carries a team the
      table lacks**, freeze rule, and that `fantrax` stays rejected. Say plainly that a `--season=` drill onto
      a year the table holds as an unfinished **pending** series hits `plan.ts:377-379` (never rewrites stored
      games), which is a different message from the archived-row guard.
- [x] `docs/CURRENT_DATA_MODEL.md`, `epic-2-context.md`, `deferred-work.md` -- record the
      frozen-archive decision (a) and its enforcement point; update the slots-vs-venues paragraph so it
      states the decision rather than the open question. In `epic-2-context.md`, mark that the route shipped
      here needs **no key**, so the keyed-provider sentence reads as Story 2.1's open item and not an
      obligation this story took on.

**Acceptance Criteria:**
- Given the adapter with an injected fetch returning a fixture postseason, when both port methods run,
  then they produce only the two declared row shapes, from exactly one HTTP request, and the runner
  plans births/completions/skips for the Game-7 series with no plan assertion firing.
- Given a feed series that did not reach Game 7 (or is in flight, or was played the same UTC day),
  then it is absent from the output and named in the run's counts line — and no write is issued for it.
- Given every source game row, then `team_a_id` equals game 1's `home_team_id`, `year` equals the
  calendar year of `GAME_DATE`, and `game_number` follows date order — asserted by the plan, tested by
  the adapter.
- Given every team id the adapter emits, then it came from that row's `TEAM_ABBREVIATION` through
  `deps.teamIdByAbbreviation` — the `teams.id` space the sink's foreign keys require — and never from the
  feed's `TEAM_ID`; given an abbreviation the `teams` table does not hold, then the run aborts naming that
  abbreviation and its `GAME_ID`, and writes nothing.
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

This is the loopback-1 re-derivation: the first pass was reverted because it copied the feed's `TEAM_ID`
into `REFERENCES teams(id)` columns instead of resolving through the port's `teamIdByAbbreviation`. The
KEEP list in `## Spec Change Log` (loopback 1) is preserved point by point — one memoised request behind
both port methods, the six verbatim spike headers and a `URLSearchParams` URL, `deriveSeason` from the run's
UTC date with `--season=` override and eager format rejection before any request, `' @ '` then `' vs. '` with
the trailing period and an order-tolerant `(GAME_DATE, unordered pair)` merge, the chain-depth walk in its own
module with the frozen four-label list and a depth outside 1..4 excluded **and named**, Decision 5's
same-UTC-day filter applied before grouping, the 25 s/3-attempt/`[1000, 4000]` retry posture with every
terminal message naming URL + status and saying no `manual_csv` fallback was taken, the test file's fixture
discipline rebuilt to the `teams` seed id space, and `run.ts`'s report wiring plus the three docs' record of
decision (a) — all re-derived from the amended Tasks, with team identity now **resolved, never copied**.

**File-by-file, what ships:**

- `supabase/scripts/pipeline/adapters/rounds.ts` (new) — `CANONICAL_ROUND_LABELS` (the frozen four),
  `labelForDepth`, `walkChainDepth` (date-ordered postseason; `depth = 1 + max(prev(teamA) ?? 0,
  prev(teamB) ?? 0)` over **all** series including excluded ones, so a skipped series still deepens its
  successor; sorted by first game date, then a stable key), `histogramFromPlacements`, `formatHistogram`
  (→ `{1:8, 2:4, 3:2, 4:1}`). Exported from here so `run.ts` renders the adapter's field by calling the
  same formatter — one copy, no divergence.
- `supabase/scripts/pipeline/adapters/nbaCom.ts` (new) — `NbaComError`; `NBA_COM_HEADERS` (the six spike
  headers verbatim); `FETCH_TIMEOUT_MS = 25000`, `MAX_FEED_ATTEMPTS = 3`, `BACKOFF_MS = [1000, 4000]`;
  `deriveSeason` (`getUTCMonth() <= 5` → `${y - 1}-${yy}`, else `${y}-${yy + 1}`);
  `validateSeasonOverride` (pattern `/^\d{4}-\d{2}$/`, rejection message naming the freeze rule, thrown
  before any request); `gameLogUrl` via `URLSearchParams`; `buildFeed` — one request, memoised, served to
  both `fetch_series_statuses()` and `fetch_game_scores()` (the single-call rule is pinned by the stub's
  recorded URL list, not by an in-adapter assertion); `createNbaComAdapter`. `REQUIRED_COLUMNS` is GAME_ID, GAME_DATE, MATCHUP, TEAM_ABBREVIATION, PTS —
  `TEAM_ABBREVIATION` joined (the parser reads it), `WL` left (nothing reads it; an unconsumed requirement
  is a needless abort if the feed drops the column). Selection: {1..6} at 3–3 → pending, {1..7} decided →
  archive-eligible, everything else excluded and counted, same-UTC-day games filtered before grouping.
  Slots: `team_a` = game 1's home team, year from GAME_DATE's calendar year, game numbers by date order
  and never from a `GAME_ID` suffix. **Identity**: every emitted team id is
  `deps.teamIdByAbbreviation(abbreviation)` — the same resolver `manual_csv` uses — and an abbreviation
  the `teams` table lacks rejects the run naming both the abbreviation and the `GAME_ID`, with the message
  saying "Refusing to substitute the feed's TEAM_ID". A `finalScore()` helper keeps the PTS validation
  narrowing honest (non-finite/negative/non-number rejects naming game, date and the offending value).
- `supabase/scripts/pipeline/port.ts` — `nba_com` registered as implemented; `AdapterRunReport` plus the
  optional, additive `describeRun?(): AdapterRunReport` on the interface (AD-5 names two ops; shipping an
  optional extra method stays compliant with the spine, and the text amendment is the owner's to make —
  `## Review Triage Log` row 9 — which is why the port doc says so out loud); `FeedResponseLike` /
  `FeedRequestInit` / `FeedFetch` types; `AdapterDeps` generalized per Decision 8 (`csvPath` moved to
  CSV-only optional; injectable `fetch`, `now`, `seasonOverride`, `sleep`); `fantrax` stays
  recognised-but-unimplemented carrying the Story 2.1 rejection verbatim in its reason.
- `supabase/scripts/pipeline/run.ts` — CSV plumbing no longer required for non-CSV adapters; the new deps
  are passed; `--season=` joins the flag set, the `unknownFlag` message and the help text (naming the
  freeze rule per Decision 11); `ADAPTER_FLAGS = { manual_csv: ['csv'], nba_com: ['season'] }` refuses a
  flag that cannot apply to the selected adapter **before** any env check, in the same voice the file
  already uses for a `--dryrun` typo; the adapter's report — counts line, histogram, then every note —
  prints **before** `sink.readCurrent()` and `planPipeline()`, so an abort during planning still shows the
  parse that explains it; `manual_csv` has no report and prints none of those lines without erroring.
- `supabase/scripts/pipeline/adapters/manualCsv.ts` — `deps.csvPath` is now optional in the bag, so the
  adapter guards at construction: no `csvPath` → `ManualCsvError` naming the missing `--csv=`.
- `tests/pipeline/nba-com.test.ts` (new) — 57 tests across six suites (49 at pass 1's close, plus the 8
  pass 2's patch route added): the port rows and the
  one-request-per-run assertion; selection and exclusion counts over a synthetic fixture postseason;
  Decision 10's rounds (full 16-team / 15-series bracket → exactly `{1:8, 2:4, 3:2, 4:1}` with all 15
  statuses emitted, each label verified against `getRoundImportance`'s branches, out-of-range depth
  excluded and named with its histogram); shape-drift rejections (tie, self-match, impossible shape,
  non-final PTS) naming `GAME_ID`; the request posture (headers verbatim, URL params, timeout signal,
  403-then-success retry, backoff sleeps recorded, non-retryable failing at once, terminal message naming
  URL + status + "no manual_csv fallback was taken", season derivation, `--season=` override and its eager
  rejection); the runner legs through a `RecordingSink` (report lines reach stdout before planning,
  exclusion notes reach stdout, misflagged runs refuse before env checks, archive-agree skips and
  archive-disagree aborts with the freeze message pinned); `manual_csv`'s `csvPath` guard. All served by
  an injected `fetch`, zero network, zero Supabase; fixture dates rolled by real `Date.UTC`, fixture ids
  from the `teams` seed order, with a deliberately decoying `TEAM_ID` namespace
  (`((SEED_IDS[abbr] * 7) % 30) + 1` — `BOS`→15 which is MEM's id, `PHI`→12 which is IND's id, so any
  test that passed by consuming the feed's id would fail). **Pass 2's 8 additions**, each pinned to a
  triage row: three drift/refusal branches that shipped unpinned — a `fetch` that *throws* (the 25 s
  timeout firing) being retried then terminal with its reason, a non-`YYYY-MM-DD` `GAME_DATE` rejecting
  naming the game, and a row with no `GAME_ID` rejecting (row 33); a non-array `rowSet` entry being
  retryable shape drift rather than an escaping `TypeError` (row 24); `--season=` reaching the **wire**
  through `runPipeline` and not just the adapter (row 21 — the mutation pass 1 could not see); a
  duplicate `--season=` refusing the run instead of silently taking the first (row 37); `SERIES_SOURCE=nba_com`
  selecting the adapter end to end, past the registry check (row 34); and `--dry-run` printing the report
  and the asserted plan while writing nothing (row 34). The pre-2003 best-of-5 test is **retitled** (row 25)
  and now asserts the counts line does *not* say `1 ended`.
- `tests/pipeline/run.test.ts` — the unimplemented-adapter test now driven by `fantrax` plus a new test
  that `nba_com` passes selection.
- `scripts/probe-nba-com-adapter.mjs` (new) — the owner-run live leg, outside every gate by design like the
  Story 2.1 spike scripts. It imports the **shipped** adapter (`createNbaComAdapter`, `deriveSeason`,
  `validateSeasonOverride`, `NBA_COM_HEADERS`) and builds `teamIdByAbbreviation` by parsing the 30
  abbreviation rows from `supabase/migrations/00005_release_1_data_model.sql`'s `teams` seed, with a
  30-count sanity check. Its injected fetch records the request URLs, passes `{ok, status, json}` to the
  adapter, and keeps the raw `resultSets` to print the `TEAM_ID` ↔ abbreviation ↔ resolved `teams.id`
  triples per team with an agree / differ / not-in-table verdict — the first measurement against
  `decision-2-1-q-4-data-source.md:104`'s unsourced claim. It prints each series' derived round and each
  game's scores from the adapter's own rows, then cross-checks the one Game 7 field-by-field against
  `boxscoretraditionalv2` (`GameID, EndPeriod=10, EndRange=28800, RangeType=0, StartPeriod=0,
  StartRange=0`, the spike-probed params, same headers, `AbortSignal.timeout(25000)`), and exits 2 with a
  named reason when a leg cannot run — including a season with no completed Game 7, which is why the usage
  line shows `node scripts/probe-nba-com-adapter.mjs --season=2025-26`. **Pass 2 rewrote its exit contract
  (row 20): a run that disagrees must go red.** The Decision-1 leg now throws on more than one *distinct*
  URL (a `Set`, not the raw call count — so Decision 6's legitimate retry no longer reads as a violation,
  and a real violation can no longer print `FAIL` and still reach the `PROBE PASSED` line); the cross-check
  leg collects `MISMATCH` lines and throws a single `Game 7 cross-check FAILED — …` before the completion
  line; and named throws replace bare `TypeError`s when the boxscore lacks a home or away row (row 31). The
  header now states **exit 0 ONLY on a full pass** and the Node ≥ 22.18 requirement the `await import()` of
  the TypeScript adapter inherits (rows 29, 30).
- `_bmad-output/implementation-artifacts/seriesdatasource-port.md` — intro now names Story 2.3 extended by
  Story 2.4; the interface snippet shows `describeRun?()` marked optional/additive with the AD-5
  amendment the owner owes; the selection section lists the implemented adapters, the flag-pairing refusal
  and the recorded fantrax rejection; a new `## Automated adapter: nba_com (Story 2.4)` section records request
  count, season derivation, selection rule, resolved identity and what an unknown abbreviation means, the
  `WL`-never-read note, the failure posture, the freeze rule (with `plan.ts:377-379`'s pending-drill message
  distinguished from `:382-390`'s archive-drill ones); operator usage gained the `--source=nba_com` lines.
- `docs/CURRENT_DATA_MODEL.md` — the slots-not-venues section records **Resolved 2026-10-01 (Decision 11,
  owner call 2A): archive frozen — option (a)**, enforced by fetch scope only, with `plan.ts:382-390`
  unchanged as the guard that catches a deliberate drill.
- `_bmad-output/implementation-artifacts/epic-2-context.md` — the slot-convention bullet records the freeze
  decision; the keyed-provider bullet clarifies that the route which actually shipped needs no key at all;
  the hazards bullet
  names each inherited hazard now pinned by `tests/pipeline/nba-com.test.ts`, ending with the owner-run
  probe deferral of the live legs.
- `_bmad-output/implementation-artifacts/deferred-work.md` — the Story 2.3 slots-vs-venues entry is marked
  **RESOLVED 2026-10-01 by Story 2.4 (spec Decision 11, owner call 2A): option (a)**, with the enforcement
  points and the three doc locations that now carry it.

**Verification run, read bare — pass 2 (2026-10-01, after every patch above):**

- `npm run gate` → **`GATE_EXIT=0`**. Biome: `Checked 120 files in 1856ms. No fixes applied.` `tsc -b`:
  clean. Vitest: `Test Files  19 passed (19)`, `Tests  262 passed (262)`. Vite build: `✓ built in 2.69s`,
  and the `/predictgame7/` asset prefix check inside it still passes. Pass 1 recorded 253; the +9 is
  commit `acc9e40`'s tie-score test (added after that count was written) plus pass 2's 8.
- `npx vitest run tests/pipeline` → **exit 0**, `4 passed (4)` files / `106 passed (106)` tests (97 at
  pass 1's count), of which `tests/pipeline/nba-com.test.ts` carries **57** (checked alone: `1 passed (1)`
  / `57 passed (57)`).
- `node --check scripts/probe-nba-com-adapter.mjs` → clean parse, re-run after the exit-contract rewrite.
- `node --input-type=module -e "import('./supabase/scripts/pipeline/adapters/nbaCom.ts').then(m=>console.log(typeof m.createNbaComAdapter))"`
  → `function`.
- No command in this session reached the network or a Supabase instance; the probe was never run.

**Mutation checks executed (each red in exactly the intended tests, then reverted; after the revert
`npx vitest run tests/pipeline` → 106/106 and `npm run gate` → exit 0):**

1. Emit a 4-2 series through the selection path → 1 test red: Decision 3's selection/exclusion test (the
   plan's 3–3 assertion has no 4-2 series to certify).
2. Drop the trailing period from the `' vs. '` split → 34 red: the split is the merge, so nearly every
   fixture collapses; this is the sharpest pin in the file.
3. Derive the season year from the feed's `SEASON_ID` instead of GAME_DATE's calendar year → 8 red,
   including the calendar-year test that pins Decision 4.
4. Let a same-UTC-day game through (skip Decision 5's filter) → 2 red: both certification tests — an
   unfinished game makes a shape that cannot be certified.
5. Take the team id from the feed's `TEAM_ID` instead of `deps.teamIdByAbbreviation` — **the mutation that
   caused loopback 1** → 10 red, including the id-space test (`BOS` would resolve to MEM's id via the
   decoy formula) and the unknown-abbreviation test (a copied id never looks up, so the loud rejection
   disappears). This is the evidence that the second pass does not repeat the first.
6. Delete `run.ts`'s report-notes loop → 1 red: the exclusion-notes-through-stdout runner test (counts and
   histogram still print, so only the notes pin moves).

**Pass 2's mutation evidence, and its gap:**

7. Row 21's own mutation, re-run against the patched suite: `run.ts:197`'s `seasonOverride: seasonArg` →
   `seasonOverride: undefined` → **exactly one test red**, the new 'the --season= override reaches the WIRE
   through the runner, not just the adapter'. That is the closure the reviewer asked for: the same mutation
   left pass 1's suite green (their run reported 98/98). Reverted with `cp` from a snapshot, not `git
   checkout` — see the `## Spec Change Log` entry's note on the incident that taught that.
8. **Two mutation checks could not be executed.** Deleting the `rowSet`-row guard (row 24) and the
   duplicate-flag refusal in `flagValue` (row 37) were both refused by this session's action classifier
   ("This action intentionally breaks production code by removing validation checks…"). Not circumvented.
   The evidence for those two pins is therefore the tests themselves — 'a rowSet entry that is not an array
   is retryable shape drift, not an escaping TypeError' and 'a duplicate --season= refuses the run instead
   of silently taking the first value' both assert the guarded behaviour directly, and both were written
   against the patched code — but no mutation proves they would catch the guard's *removal*. If a future
   pass wants that evidence, it needs a session whose policy allows the mutation.
9. Row 22's reorder was **not** mutation-checked, because nothing to check: `groupSourceRows` cannot throw
   on this adapter's output (see the row's caveat), so no fixture makes the old order observable.

**Owner handover (what is not closed by unit evidence):**

- AC:369's live clause is the owner's (Decision 12). Run `node scripts/probe-nba-com-adapter.mjs
  --season=2025-26` (Node ≥ 22.18) and paste its output into the block below. Until then this story's
  frontmatter `status` stays `in-review` and `sprint-status.yaml` stays at `review`, and no claim is made
  that the feed still answers the 2026-09-30 header posture — nor that the live `TEAM_ID`s agree with
  `teams.id`. The probe answers `decision-2-1-q-4-data-source.md:104`; that row stays marked unsourced
  until a measurement is cited. A non-zero exit is evidence too: paste it, and the story records the route
  as red rather than untested.
- Optional, also owner-run because it opens a production session:
  `node supabase/scripts/pipeline/run.ts --source=nba_com --dry-run --season=2025-26 --env-file=.env` —
  expect the report lines first, then a plan summary, then zero writes.
- AD-5's port text still names exactly two operations; `describeRun?()` is additive and optional, and the
  amendment (triage row 9) is the owner's call to make in the spine.

**The story is not `done`.** Decision 12 makes AC:369's live clause the owner's, and the live leg has not
been run: this session's policy refused the agent's outbound call to stats.nba.com (the agent did not run
the probe, not even its offline failure path).

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

- 2026-10-01 (loopback 1): triggered by Review Triage Log row 1 (`high` → bad_spec). The spec's Code Map
  inherited `decision-2-1-q-4-data-source.md:104`'s unsourced claim that the feed's `TEAM_ID` "already
  match[es] the app's team ids", and no Task said which id space the adapter writes — so the derived code
  wrote the feed's raw `TEAM_ID` into columns that carry `REFERENCES teams(id)` (`00005:30-31,44-45`) and
  never called the port's `teamIdByAbbreviation`, which is exactly the resolver `manual_csv` uses. Rows
  3-7 and 10-14 are folded into this pass so one amended spec produces them coherently instead of five
  bolt-on patches. **No frozen Decision, AC or Boundary changed:** Decision 4 fixes *slots* (`team_a` =
  game 1's home team), not the id space, so the root cause sits in the non-frozen Code Map / Tasks and the
  fix is to make them explicit.

  **Amended.** Code Map — the `teams` seed order and the FK lines are cited, `:104` is marked as an
  unverified claim, and `manualCsv.ts`'s abbreviation resolver is named as the pattern to mirror. Tasks —
  the adapter resolves every team through `deps.teamIdByAbbreviation` and refuses an unknown abbreviation
  naming both the abbreviation and the `GAME_ID`; `TEAM_ID` is no longer consumed as an id; the run report
  prints before planning and its notes are pinned through the runner; the probe runs the *shipped* adapter
  through an injected capturing `fetch` rather than re-implementing it; the request contract (headers,
  timeout, backoff values) is asserted; a flag mismatched to the adapter refuses the run; one histogram
  formatter shared by adapter and runner. Design Notes — why the resolver is the only defensible reading.
  Verification — the probe command carries `--season=2025-26`, and the id-space question is named as the
  live leg's to answer.

  **Known-bad avoided.** The first pass's failure mode was treating an inherited planning-decision sentence
  as a measurement. It is not one: nothing in the repo compares `TEAM_ID` against `teams.id`, and both spike
  scripts grouped by abbreviation. The second pass must not re-import that assumption, and must not resolve
  the ambiguity by writing a constant id table into the adapter — the port already owns abbreviation→id
  resolution and the runner already supplies it.

  **KEEP (what the reverted pass got right, and that re-derivation must preserve).** (1) One request per
  run, memoised behind both port methods, asserted as `urls.length === 1`. (2) The six verbatim headers from
  `probe-series-rebuild.mjs:5-12` and a `URLSearchParams`-built URL. (3) `deriveSeason` from the run's UTC
  date (`getUTCMonth() <= 5`) with a `--season=` override and an eager format rejection before any request.
  (4) `' @ '` then `' vs. '` with the trailing period, and the `(GAME_DATE, unordered pair)` merge that
  tolerates **either row arriving first**. (5) The chain-depth walk in its own module: the frozen
  four-label list, `depth = 1 + max(prev(teamA), prev(teamB))` over a date-ordered postseason, the
  `{1:8, 2:4, 3:2, 4:1}` fixture result, and a depth outside 1..4 excluded **and named**. (6) Decision 5's
  same-UTC-day filter applied *before* grouping, so an unfinished game cannot reach a series shape.
  (7) Retry posture: 25 s `AbortSignal.timeout`, 3 attempts, `[1000, 4000]` ms backoff, a non-retryable
  status failing at once, and every terminal message naming URL + status and saying no `manual_csv` fallback
  was taken. (8) The test file's fixture discipline: real `Date.UTC`-rolled dates, deliberately
  non-sequential `GAME_ID` suffixes (hazard 1), injected `fetch` only, zero Supabase — with the fixture id
  space **rebuilt to match the `teams` seed**. (9) `run.ts`'s report wiring and the three docs' record of
  decision (a): same content, re-derived from the amended Tasks.

- 2026-10-01 (re-derivation build, loopback 1 executed): no frozen Decision, AC or Boundary changed, and no
  KEEP item dropped — this entry records the build against the amended spec rather than a spec edit. All
  eight Execution checkboxes ticked. The root-cause fix is present in code and pinned by tests: team identity
  resolves through `deps.teamIdByAbbreviation` (the `manual_csv` resolver), `TEAM_ID` is consumed nowhere as
  an id, and an unknown abbreviation aborts naming abbreviation + `GAME_ID`. Verification read bare in
  `## Implementation Notes`: `npm run gate` exit 0 (Biome 120 files clean, `tsc -b` clean, 19 files / 253
  tests, vite build ✓), `npx vitest run tests/pipeline` 4 files / 97 tests (48 in `nba-com.test.ts`),
  `node --check` on the probe clean, module import printing `function`. All **six** mutation checks in
  `## Verification` were executed and each reddened the intended tests before reverting (2: 34 tests, 5:
  10 tests including the id-space and unknown-abbreviation pins), which is the evidence that loopback 1's
  finding cannot silently return. Frontmatter `status` deliberately stays `in-progress`: AC:369's live clause
  is the owner's (Decision 12) and the probe was never run — this session's policy refused the agent's
  outbound call, so `decision-2-1-q-4-data-source.md:104` remains an unsourced claim awaiting measurement.
  Step 04's second review pass on this diff is also outstanding (not runnable in the implementing session).

- 2026-10-01 (review pass 2 executed, patch route): no frozen Decision, AC or Boundary changed — this entry
  records what pass 2 measured, not a spec amendment. 24 findings → 21 rows; 17 patched, 2 rejected (rows
  36, 38), and 1 rejected as an owner note on the frozen Intent's wording (row 39), while pass 1's two
  `defer` routes (rows 8,
  9) executed into `deferred-work.md` with named owners. Verification re-read bare after the patches: `npm
  run gate` exit 0 (Biome 120 files, `tsc -b` clean, 19 files / **262** tests, build ✓ with the
  `/predictgame7/` prefix), `npx vitest run tests/pipeline` 4 files / **106** tests, `node --check` on the
  probe clean. **Process incident, recorded because it cost work:** a mutation-check revert used
  `git checkout -- supabase/scripts/pipeline/run.ts` while that file also held uncommitted pass-2 patches,
  and the checkout discarded them along with the mutation. Caught from `git diff --stat` (the file had
  vanished from the list) and both edits re-applied. From then on mutation checks snapshot with `cp` and
  restore from the copy — never `git checkout`, whenever a file carries uncommitted work. Two of pass 2's
  mutation checks (the `rowSet`-row guard, the duplicate-flag refusal) were refused by this session's action
  classifier and were **not** circumvented; that gap is stated in `## Implementation Notes` rather than
  papered over.

## Review Triage Log

Pass 1 (2026-10-01, three layers over `story24-review-3DGmiq.diff`, 161 kB). Verdicts rendered by this
session against the code, not by the reviewers. Grouped entries note their members.

| # | Finding (layer) | Verdict | Evidence | Route |
|---|---|---|---|---|
| 1 | `nbaCom.ts` writes the feed's raw `TEAM_ID` into `team_a_id`/`home_team_id` and never resolves through the port's `teamIdByAbbreviation` (verification-gap) | high | `00005:30-31,44-45` put `REFERENCES teams(id)` on every one of those columns; `00005:104-133` seeds `teams` alphabetically (`CLE`=6, `GSW`=10); `manualCsv.ts:126-133` resolves abbreviations and refuses unknown ones, `nbaCom.ts` never calls the resolver (`grep` of the file: zero uses); the sole in-repo tie between the two id spaces is `decision-2-1-q-4-data-source.md:104`'s unsourced "numeric ids already match the app's team ids", and the spike scripts group by abbreviation, never by `TEAM_ID`. A production run either aborts on the FK or births a series naming the wrong franchise. | bad_spec (loopback 1) |
| 2 | `REQUIRED_COLUMNS` demands `WL` and `TEAM_ABBREVIATION`, neither of which the parser reads (edge-1, blind-6) | medium | True as written, but it dissolves under fix 1: `TEAM_ABBREVIATION` becomes the resolution key, so only `WL` stays unconsumed. The real harm was the missing resolver, not the column list. | folded into 1 |
| 3 | `run.ts` prints the adapter's report only after `readCurrent()` and `planPipeline()` succeed, so "every run prints the counts + histogram" is false on every abort path (blind-3); and `for (const note of report.notes)` is printed by no test — deleting the loop leaves the suite green (verification-gap) | medium | Read `run.ts`: `log(report.countsLine)` sits after `planPipeline`; every `runPipeline` test in `nba-com.test.ts` uses depth 1–2 fixtures, so `notes` is `[]` on every runner path exercised. A shape-drift or drill abort therefore loses the histogram that explains it, and the named-exclusion valve ships unpinned. | patch (in loopback) |
| 4 | `scripts/probe-nba-com-adapter.mjs` re-implements the adapter's headers, URL, season derivation, merge, grouping and depth walk instead of running the shipped code, and its copy is laxer (no duplicate-`GAME_ID`-on-one-date, same-side, empty-name or numeric checks; requires 6 columns where the adapter requires 7) (blind-5, edge-2, verification-gap) | medium | Confirmed by reading both files: the probe's own `H`/`gamelogUrl`/`deriveSeason`/merge duplicate `nbaCom.ts`'s, and `nbaCom.ts` already exports `gameLogUrl` + `deriveSeason`. Since Decision 12 makes this script the story's only live evidence, a PASS can certify a parse the shipping adapter would abort on while `seriesdatasource-port.md` claims it "re-runs this parse". | patch (in loopback) |
| 5 | The injected-fetch stub never sees the request `init`, so headers, the 25 s timeout and the backoff values are unasserted; deleting `x-nba-stats-token` or setting the timeout to 1 ms keeps the suite green (verification-gap) | medium | `nba-com.test.ts` stub signature is `async (url) => …` — the second argument is dropped; URL coverage is 4 of 16 params; backoff asserted as a count, not `[1000, 4000]`. The request contract is the one thing that decides whether every scheduled run returns data or aborts. | patch (in loopback) |
| 6 | Flag/adapter pairing is silently permissive: `--csv=` is discarded for `nba_com` and `--season=` ignored for `manual_csv`, while the same file insists a `--dryrun` typo must refuse the run; the new `csvPath`-missing guard in `manualCsv.ts` has no test (blind-7, edge-3) | low | `run.ts` builds `unknownFlag` from a name list, then resolves `csvPath` by adapter, so a mismatched flag reads as accepted. Developer-visible confusion at the exact flag surface this story extended. | patch (in loopback) |
| 7 | `formatHistogram` is duplicated verbatim in `nbaCom.ts` and `run.ts` (verification-gap) | low | Two renderings of one report field; the note-side copy is asserted nowhere, so a change to one silently diverges from the other. | patch (in loopback) |
| 8 | Nothing distinguishes "offseason, legitimately empty" from "playoff window, unexpectedly empty feed"; a 200 with zero rows exits 0 identically, and no `Counter=1000` truncation check exists (blind-4) | medium | Real, and AD-5 names silent staleness as the thing to prevent — but the fix is a date-based rule the frozen Decision 2 excludes ("no phase, group, or page derives from a date"), and alerting is Story 2.6's SM-4 scope, which this story's Never list puts out of bounds. | defer (Story 2.6) |
| 9 | The port gained a third interface member (`describeRun?`) while `ARCHITECTURE-SPINE.md` AD-5 still describes only the two fetch operations, and `seriesdatasource-port.md` says "nothing else is part of the contract" in the paragraph that adds it (blind-9) | medium | Verified against the spine (`:97`): the rule names the two ops and does not forbid an optional member, so the shipped code is not non-compliant — but the source of truth does not know about the extension. Amending AD-5 is an owner architecture act (its identity-key amendment came through an approved course correction), not this story's. | defer (owner architecture pass) |
| 10 | `epic-2-context.md` still says the keyed provider's "key becomes a CI secret and a stated tier/cost decision" with no note that the shipped route needs no key (blind-8) | low | The sentence predates this story and is still true of Story 2.1's open deferred item, but shipping unkeyed makes it read as an obligation this story completed. One clause names the owner. | patch (doc) |
| 11 | The freeze docs and `--season=` help name only the archive branch; a drill onto a year the table holds as an unfinished **pending** series hits `plan.ts:377-379` ("never rewrites stored games") — a different message with no documented explanation (blind-14) | low | Confirmed: `plan.ts:377-379` guards stored games, `:382-390` guards archived rows. Operator-facing clarity, one sentence in the port doc. | patch (doc) |
| 12 | `## Implementation Notes` says `status` is "deliberately left `in-progress`" while frontmatter reads `in-review`; verification counts (236 total / 80 pipeline) are stale after this session's test edits (blind-1, blind-2) | low | Both true of the artifact text; a stale measured claim in a load-bearing doc is the failure mode AGENTS.md calls out. Fixed as part of the loopback's notes rewrite. | patch (doc) |
| 13 | `## Verification` lists `node scripts/probe-nba-com-adapter.mjs` expecting exit 0, but today's derived season is empty, so the script exits 2 on "no completed Game 7" (blind-10) | low | The Owner-handover already prescribes `--season=2025-26`; the two lines disagree. Kept as a row, fixed by making the Verification command carry the flag. | patch (doc) |
| 14 | "`describeRun()` throws if called before the feed resolved" and "`manual_csv` reports nothing extra" are documented but untested; "both vocabularies render on the same table" is asserted only numerically (blind-15) | low | The first two are honest disclosures of untested internal guards — both are cheap to pin, so they ride with the test amendments. The third is refuted: `src/lib/__tests__/nba-utils.test.ts:38-59` pins the branch outputs for both spellings. | patch (tests, partial) |
| 15 | Decision 5's same-UTC-day exclusion costs up to a day of freshness and nowhere records that user-visible consequence (blind-11) | false | Decision 5 states it: the feed has no final/unfinal flag, "a game is not over until it is over", and FR-21's daily 09:00 UTC cadence puts those games in tomorrow's run — which is the recording of exactly this trade-off. | rejected |
| 16 | `## Review Triage Log` is an empty heading, which reads as "triage ran, found nothing" (blind-12) | false | It is the template's append-only section, empty until step-04 runs; this pass is what populates it. | rejected |
| 17 | No traceability table from `epics.md`'s Story 2.4 ACs to spec ACs/tests (blind-13) | false | The spec's AC list is that mapping in prose and its context line cites `epics.md:356-370`; the fix would be a spec edit with no behavioral effect. | rejected |
| 18 | Memoised `feed()`, the retry loop, the two-row merge, selection's implicit branch and malformed-`--season=` handling were each probed for a gap and found guarded (edge-case hunter path trace) | false | Trace agreed with this session's own read of the diff: no reachable unhandled state; `describeRun` before the feed and the eager season check both fail loudly. | rejected |

Pass 2 (2026-10-01, three layers over `story24-pass2-review.diff`, 137.8 kB — the loopback's diff, so the
`bad_spec` finding's fix is what was under review). 24 findings → 21 rows after grouping. No second
loopback: nothing pass 2 raised is a spec-level `intent_gap` or `bad_spec`, so `review_loop_iteration`
stays 1. This pass also **executes pass 1's two `defer` routes** (rows 8 and 9), which pass 1 could only
record — both entries are now in `_bmad-output/implementation-artifacts/deferred-work.md` with their owners
named (Story 2.6 for the empty-feed/alarm gap, the owner's architecture pass for the AD-5 amendment).
Routing tally: 17 `patch` (rows 19–35), 2 `rejected` (rows 36, 38), 1 `rejected` as an owner note on the
frozen Intent's wording (row 39).

| # | Finding (layer) | Verdict | Evidence | Route |
|---|---|---|---|---|
| 19 | Decision 5's same-UTC-day guard compares a US-local `GAME_DATE` to the run's UTC date, and the safety of that rests on an undocumented cadence assumption (blind-1); a row dated *after* the run day passes the guard entirely (edge-2) | medium | Real documentation gap: `finalScore()` only requires finite and ≥ 0, so an early-UTC run could consume a half-played game whose PTS happens to be non-null. The `>=` guard edge-2 proposes is refused — the harmful case is already loud (a scheduled or in-progress row carries null PTS, and `finalScore` rejects naming that game), and a strictly-future `GAME_DATE` is not something a game-log feed emits. Taken as one doc patch beside Decision 5's bullet, naming Story 2.6's 09:00 UTC cadence as part of the safety argument instead of leaving it implicit. | patch (doc) |
| 20 | The probe prints `FAIL — Decision 1 violated` (verify-gap-2, edge-3) and `MISMATCH` (edge-4) without throwing, then asserts the cross-check succeeded and prints `PROBE PASSED` at exit 0 | high | Read `scripts/probe-nba-com-adapter.mjs:108,207-211`: both are `console.log`s, and the only throw in that block fires on *missing* boxscore rows, not disagreeing scores. Worse, the count check trips on a legitimate Decision-6 retry (`tests/pipeline/nba-com.test.ts` '403 then success' pins two requests as correct), so a passing run reads as a violation and a failing run reads as PASSED — in the one artifact whose output the spec ingests as live evidence. `scripts/probe-predict-contract.mjs` set the opposite convention for this repo's other committed probe. | patch |
| 21 | `--season=` reaching the adapter through `runPipeline` is observed by no test (verify-gap-1) | medium | Their mutation is the evidence: setting the deps' `seasonOverride` to `undefined` leaves 98/98 green (the reviewer cited `run.ts:184`; that line is `run.ts:197` — `seasonOverride: seasonArg` — after pass 2's edits). Adapter-level coverage exists, but the only runner leg that passes the flag uses a value identical to `deriveSeason`'s for the pinned 2027-06-20 clock, and `stubFeed` answers by call count while ignoring the URL. The drill is the documented route to an archived postseason, so a dropped flag prints a wrong-bracket plan and exits 0. | patch (test) |
| 22 | `run.ts` calls `groupSourceRows` before printing `describeRun()`, so an abort during source assembly loses the report the comment promises (edge-7) | medium | Confirmed pre-patch at `run.ts:190-200`. Pass-1 row 3's fix moved the print before *planning* but not before *grouping*, and grouping is the step that can throw on adapter/runner disagreement. Patched by moving the `describeRun()` print above `groupSourceRows` (now `run.ts:209` vs `:218`). **Caveat: the reorder cannot be pinned by a test.** `groupSourceRows` throws at exactly two places — a duplicate `(year, pair)` status key (`plan.ts:266`) and a score row with no matching status (`plan.ts:277`) — and neither is reachable from this adapter: it builds one status per franchise pair and every score row it emits carries ids from that same pair, with duplicates already refused upstream (`nbaCom.ts`'s duplicate-`GAME_ID`-on-one-date check). So no `nba_com` fixture can make it abort after the print. Pass 1's planning-abort test ('a planning abort still shows the parse: the report prints, then the slot assertion reddens', `tests/pipeline/nba-com.test.ts:790`) is the only leg that pins an ordering, and it exercises the planning throw, not the grouping one. | patch |
| 23 | "an archived year never enters the plan by construction" over-states the freeze: a series decided in the derived season enters as a fresh archive row with no drill, and meets `plan.ts:382-390` on any later run (edge-8, claim) | medium | Accurate reading of my sentence in `docs/CURRENT_DATA_MODEL.md` and the adapter header. What the fetch scope forecloses is reaching a year the table already holds; it does not stop new archive rows arriving. The wording also buries the consequence of the owner's venue decision — a stored archived row whose venues came from `manual_csv`'s slot convention disagrees with a feed row on games 1–6, and the guard aborts the run. Fixed by tightening both sentences to name which years are frozen and what a disagreement costs. | patch (doc) |
| 24 | A `rowSet` whose elements are not arrays escapes `parseBodyShape` as a `TypeError`, bypassing the terminal no-fallback message (edge-1) | low | `parseBodyShape` checks `Array.isArray(first.rowSet)` but never the rows, and `readRow` indexes `row[...]` directly. A guard belongs in the same retryable-shape path that already rejects a non-string headers entry. | patch |
| 25 | `excludedEnded` requires first-to-4, so a concluded pre-2003 best-of-5 (3-0/3-1/3-2) is counted as "in flight", and the test naming that case passes for the wrong reason (blind-2) | low | Confirmed: `total <= 6 && (teamAWins ≥ 4 \|\| teamBWins ≥ 4)`. But the classification is unfixable on purpose — 3-2 through five is genuinely in flight in a best-of-7 and ended in a best-of-5, and nothing on the wire distinguishes them; Decision 3 discharges the era by exclusion, not by era detection. What is wrong is the claim, so the fix is honesty in the counts-line documentation and in the test's own name: the shape is excluded without an era rule, and the *category* is era-blind. | patch (doc + test wording) |
| 26 | The unexplainable-series note says "seven games" for any `total > 7` shape (blind-3) | low | `nbaCom.ts:486` hardcodes the count while `describe` two lines above already carries the real one. One interpolation. | patch |
| 27 | `assertAdapterImplemented`'s fallback reason still reads `' (Story 2.4)'` after Story 2.4 shipped (blind-4) | low | `port.ts:153`. A future recognised-but-unimplemented name would be told it lands in the story that just landed. Re-pointed at the registry, which is where the truth lives. | patch |
| 28 | `rounds.ts`'s header says the four labels land in `getRoundImportance`'s "2/3/4/1 branches respectively", which reads as a claim about label order (blind-5) | low | Verified `src/lib/nba-utils.ts:58-65`: the *branch order* is semifinals→2, conf+finals→3, finals→4, first round→1, while the labels score 1/2/3/4. The sentence states one and implies the other. Reworded to say both. | patch (wording) |
| 29 | The probe's usage block omits the Node ≥ 22.18 requirement its `await import('…/nbaCom.ts')` silently inherits (blind-6) | low | `seriesdatasource-port.md` spells the requirement out for `run.ts` and notes nothing enforces it; the probe imports the same TypeScript entry and would hand an owner on Node 20 a parse-time crash instead of the exit 2 with a reason the script is designed to produce. | patch |
| 30 | The probe's header says `--season=` "is required today" while the code accepts its absence, spends a real fetch on a derived offseason postseason, and only then fails at the boxscore leg — whose message suggests a season the operator may already have passed (blind-7) | low | Both true. The flag cannot be hard-required (an in-season run derives a postseason whose earlier rounds do have completed Game 7s), so the wording is the defect, including the `(e.g. 2025-26)` example that is nonsense once that season is the one passed. | patch |
| 31 | The probe's boxscore leg picks home/away by `MATCHUP.includes(' vs. ')` with no undefined check, and takes one shot at the wire where the rest of the story retries (blind-8) | low | A missing home row would surface as a bare `TypeError` under exit 2 — the failure shape the probe exists to avoid, since its output is pasted as spec evidence. The single-shot posture is defensible (interactive evidence, not a scheduled job) but must be stated rather than discovered. | patch |
| 32 | `createNbaComAdapter` treats `seasonOverride === ''` as "no override", a branch no entry point can produce that contradicts `validateSeasonOverride` (blind-9) | low | `nbaCom.ts:522`. `run.ts`'s stray-flag regex requires a non-space after `=`, and the probe routes `''` into the validator, which rejects it. Grep confirms no test depends on empty-string derivation. Deleted, leaving one owner of empty values. | patch |
| 33 | Three drift/refusal branches ship unpinned despite the header claiming every matrix row is pinned: `fetch` throwing, a non-`YYYY-MM-DD` `GAME_DATE`, and a row with no `GAME_ID` (blind-10) | low | Confirmed against `tests/pipeline/nba-com.test.ts`: the retry legs cover 403/404/non-JSON/missing-`resultSets` only, and `readRow`'s two earliest rejections appear nowhere. These are precisely the messages the ops docs promise name a reason. | patch (tests) |
| 34 | No runner leg drives `--source=nba_com --dry-run`, and no positive test selects `nba_com` through the `SERIES_SOURCE` env var — the leg that did was flipped to `fantrax` (blind-11) | low | Verified: `tests/pipeline/run.test.ts:329` selects `nba_com` with `argv: ['--source=nba_com']` and `env: {}`, so the env-var path for the adapter that is now the practice default is exercised only up to `assertAdapterImplemented`. | patch (tests) |
| 35 | `docs/CURRENT_DATA_MODEL.md` records the freeze but not the canonical round vocabulary — a written-in-value constraint the next consumer needs (blind-12) | low | True, and AGENTS.md names that file the active schema documentation. The four labels currently live only in the port doc and `rounds.ts`, while 17 era spellings sit in the same column. | patch (doc) |
| 36 | The probe drops a second, identical `--season=` instead of refusing it (edge-5) | false | Refuted by reading the filter: `otherArgs` keeps anything not equal to `seasonArg`, so `--season=A --season=B` already refuses with `unrecognised argument "B"`. Only a *duplicate identical* flag is absorbed, and it cannot mislead anyone about the value used. The fix is a `Set` guarding an inexpressible harm. | rejected |
| 37 | `run.ts`'s `flagValue` takes the first `--season=` while the widened `unknownFlag` lets a second, *different* value pass unremarked (edge-6) | low | Real, and it contradicts the invariant this story's own misplaced-flag guard states ("refusing instead of silently discarding the flag"). Unlike row 36, this one is a silently-lost operator instruction. Counted and refused inside `flagValue`, which covers `--source=` and `--csv=` in the same move. | patch |
| 38 | The six-headers test asserts the request against the adapter's own `NBA_COM_HEADERS` constant, so nothing executable pins the "copied verbatim from the spike" claim (verify-gap-3) | low | The reviewer's own note settles it: they hand-checked the values against `scripts/spike-2-1/probe-series-rebuild.mjs:5-12` and they match today, and the only available pin — comparing source text across two files — re-asserts the copy rather than testing behaviour. The live feed certifies the headers, which is why Decision 12 exists. | rejected |
| 39 | The frozen Intent's "No runner logic" conflicts with the runner changes this diff ships, and the port doc's deleted "no runner logic changes" line was the contract that said so (edge-9, claim) | low | The contradiction is internal to the spec, and the spec's own non-frozen sections resolve it: Decision 7, the Code Map's `run.ts` entry, Task 6 and the Implementation Notes all mandate the flag and report edits. What the clause rules out — new planning or writing logic in the runner — still holds: `planPipeline` and the sink are untouched and Story 2.3's suite still pins them. Amending `<frozen-after-approval>` is the owner's act, not this pass's, so the finding is recorded here where step-04 records a spec-wording defect. | rejected (owner note) |

Pass-2 patches, grouped by the file each landed in (all uncommitted until this story's commit at step-05):

- `scripts/probe-nba-com-adapter.mjs` — rows 20, 29, 30, 31: the count leg's distinct-URL `Set` throw, the
  cross-check leg's collecting throw and named missing-side throws, exit-0-only-on-a-full-pass and
  Node ≥ 22.18 in the header, reworded `--season=` guidance.
- `supabase/scripts/pipeline/run.ts` — rows 22, 37: `describeRun()` moved above `groupSourceRows`, and
  `flagValue` counting/refusing duplicate flags (covers `--source=`, `--csv=`, `--season=`).
- `supabase/scripts/pipeline/adapters/nbaCom.ts` — rows 19, 23, 24, 26, 32: the row-is-array shape guard,
  the real-count interpolation in the unexplainable note, the `seasonOverride === ''` branch deleted, and
  the header's cadence-dependency, era-blind-counts and freeze-scope paragraphs.
- `supabase/scripts/pipeline/port.ts` — row 27: the fallback reason re-pointed at the registry.
- `supabase/scripts/pipeline/adapters/rounds.ts` — row 28: branch-order vs label-score wording.
- `tests/pipeline/nba-com.test.ts` — rows 21, 25, 33, 34: 8 new tests plus the pre-2003 retitle.
- `docs/CURRENT_DATA_MODEL.md` — rows 23, 35: the freeze sentence corrected and the four canonical labels
  recorded.
- `_bmad-output/implementation-artifacts/seriesdatasource-port.md` — rows 19, 20, 23, 25, 29, 30: the
  selection bullet's two honest limits (era-blind counts; the withheld-day cadence proxy), the tightened
  freeze bullet, and the probe paragraph's exit discipline plus Node requirement.
- `_bmad-output/implementation-artifacts/deferred-work.md` — rows 8 and 9 executed as the two Story 2.4
  defer entries.

## Design Notes

**Chain depth instead of a bracket feed.** The bracket endpoint is retired and the round-name gap is
the spike's one unmet AC, so the label is computed from the games themselves: walk the postseason in
date order, and each series' depth is one more than the deeper of its two teams' previous series'
depth. Depths 1-4 map to the four canonical labels. It needs no conference table, no extra request,
and it prints its own working: a complete 16-team postseason yields 8/4/2/1 by depth, a postseason in
flight yields a partial histogram, and either way the numbers are on the run's output where a reviewer
can see them.

**Abbreviations, not ids, are the join key.** The feed's `TEAM_ID` looks authoritative — it is numeric,
stable-looking, and a decision record says it "already match[es] the app's team ids". That sentence is the
reason this story's first pass shipped a defect, and reading the repo says why it cannot be trusted:
`00005:104-133` seeds `teams` alphabetically, so `teams.id` is a repo-local numbering that happens to sit in
the same 1..30 range as the league's, and no script in `scripts/spike-2-1/` ever compared the two. The
adapter already parses `MATCHUP` for its abbreviations, `teams.abbreviation` is `UNIQUE`, the port already
injects `teamIdByAbbreviation`, and `manual_csv` — the adapter this one is mirrored on — refuses an
abbreviation the table lacks. Resolving through that resolver is the only reading that (a) can fail loudly on
a team the app genuinely does not hold instead of writing a wrong franchise's id under a valid FK, and (b)
keeps one mapping from name to id in the repo. If the two spaces do agree, the resolver returns the same
numbers and the run costs nothing extra; if they do not, a copied `TEAM_ID` is a silent data corruption at
exactly the moment the playoff window makes the table load-bearing. The owner-run probe prints the
`TEAM_ID` ↔ abbreviation ↔ resolved id triples so the live feed settles the question on the first run, and
the decision record's claim stays marked unsourced until someone cites a measurement.

## Verification

**Commands:**
- `npm run gate` -- expected exit 0, read bare (redirect to a file and check `$?` — piping to `tail` reports
  `tail`'s status). Covers the new adapter (Biome's `supabase/scripts/**`, `tsconfig.pipeline.json`,
  `tests/pipeline`), which is what makes an HTTP adapter safe to land in a repo whose live evidence is
  otherwise CI-only.
- `npx vitest run tests/pipeline` -- expected: the matrix above green, every test served by an injected
  `fetch`, none reaching the network.
- `node --check scripts/probe-nba-com-adapter.mjs` -- expected: clean parse (the committed live leg;
  `scripts/**` is outside every gate by design, same as the Story 2.1 spike scripts).
- `node --input-type=module -e "import('./supabase/scripts/pipeline/adapters/nbaCom.ts').then(m=>console.log(typeof m.createNbaComAdapter))"`
  -- expected: `function`. `node --check` cannot see module resolution or TypeScript stripping, and since the
  probe now imports the shipped adapter this is the only pre-owner evidence that the import will resolve at
  all. Zero network, zero Supabase.
- `node scripts/probe-nba-com-adapter.mjs --season=2025-26` -- **owner-run** (Decision 12; the agent's
  outbound call was refused by session policy). Requires Node ≥ 22.18 (it imports the TypeScript adapter and
  relies on native type-stripping). `--season=` is not hard-required: in the Apr–Jun window the derived
  season carries completed Game 7s — but on 2026-10-01 the derivation is an offseason season, so an
  unflagged run today stops at the boxscore leg with that named and exits 2. Expected on a good run: one
  unkeyed postseason fetch through the shipped adapter (the Decision-1 line counts **distinct URLs**, so a
  Decision-6 retry of the same URL reads PASS), the derived round per series, the depth histogram, the
  `TEAM_ID` ↔ abbreviation ↔ resolved `teams.id` triples, and one Game 7 cross-checked field-by-field against
  `boxscoretraditionalv2` — **exit 0 only if every check passed** (row 20: a disagreeing PTS pair now throws
  `Game 7 cross-check FAILED` instead of printing `MISMATCH` and then declaring the run passed). Its output
  is pasted into `## Implementation Notes` — that closes AC:369's live clause, and it is also the first
  evidence that Story 2.1's header posture still works a day later.
  **The id-space question is this leg's to answer**: if the printed `TEAM_ID`s differ from the resolved
  `teams.id`s, the decision record's claim is refuted by measurement and the resolver was load-bearing; if
  they agree, record that too, so the next reader has the measurement instead of the assertion.
- `node supabase/scripts/pipeline/run.ts --source=nba_com --dry-run` -- expected: needs
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` before it reaches the feed, then prints the counts line
  and an empty-or-real plan with zero writes. **Owner-run**: it opens a production session. Because the
  report now prints before the adapter's rows are even grouped, an abort in `groupSourceRows`, in planning,
  or on a missing env var still shows what the feed parsed.
- Mutation checks: make the adapter emit a 4-2 series and confirm the plan's 3–3 assertion reddens;
  drop the trailing period from the `vs.` split and confirm the two-row merge test reddens; make the
  season derive from `SEASON_ID` and confirm the calendar-year test reddens; let a same-UTC-day game
  through and confirm the certification test reddens; **make the adapter take the team id from the feed's
  `TEAM_ID` instead of the resolver and confirm the id-space tests redden** (that mutation is the one this
  story's first pass shipped, so it is the check that proves the fix is pinned); **delete the
  `for (const note of report.notes)` loop in `run.ts` and confirm the notes test reddens**; **set
  `seasonOverride: undefined` in `run.ts` and confirm only the `--season=`-reaches-the-wire runner test
  reddens** (row 21 — pass 1 left this mutation fully green, so it is the check that closes it); delete the
  `rowSet`-row `Array.isArray` guard and confirm the shape-drift test reddens, and delete `flagValue`'s
  duplicate refusal and confirm the duplicate-flag test reddens — **both refused by this session's action
  classifier and not executed**; see `## Implementation Notes` for the resulting evidence gap. Row 22's
  print-order reorder has **no mutation to run**: `groupSourceRows` cannot throw on this adapter's output,
  so the old order is unobservable from any fixture.
