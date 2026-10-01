---
title: 'Story 2.4 — Automated adapter per the spike decision'
type: 'feature'
created: '2026-10-01'
status: 'in-progress'
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
- [ ] `supabase/scripts/pipeline/adapters/nbaCom.ts` (new) -- the adapter: one-request fetch with
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
- [ ] `supabase/scripts/pipeline/adapters/rounds.ts` (new, or inside `nbaCom.ts` if it stays under
      ~40 lines) -- the frozen canonical label list and the chain-depth derivation. Export the histogram
      formatter from here (or from `nbaCom.ts`) so `run.ts` renders the adapter's field by calling it rather
      than by keeping a second copy that can diverge.
- [ ] `supabase/scripts/pipeline/port.ts` -- register `nba_com` as implemented; generalize
      `AdapterDeps` per Decision 8 (CSV-only fields, injectable `fetch`, season/date seam).
      `teamIdByAbbreviation` is already in the bag (:61) — reuse it, do not add a second id path.
- [ ] `supabase/scripts/pipeline/run.ts` -- stop requiring CSV plumbing for non-CSV adapters; pass the
      new deps; add `--season=` to the flag set and the `unknownFlag` message, with its help text
      naming the freeze rule (Decision 11) so a drill onto an archived year reads as intentional;
      **refuse a flag that cannot apply to the selected adapter (`--csv=` with `nba_com`, `--season=` with
      `manual_csv`) — a silently discarded flag is the same class of mistake the file already refuses for a
      `--dryrun` typo**; and print the adapter's report — counts line, histogram, notes — **before**
      `readCurrent()` and `planPipeline()`, so an abort during planning still shows the parse that explains
      it. `manual_csv` has no report; a run with it prints none of those lines and must not error for it.
- [ ] `tests/pipeline/nba-com.test.ts` (new) -- the matrix rows above against an injected `fetch`
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
- [ ] `scripts/probe-nba-com-adapter.mjs` (new) -- the committed live leg for AC:369, **owner-run** per
      Decision 12: unkeyed, read-only (no Supabase at all), exit 2 if it cannot run. **It runs the shipped
      adapter** — import `createNbaComAdapter` and hand it an injected `fetch` that captures the real
      response — rather than re-implementing the headers, URL, season math, merge or depth walk, so a PASS
      certifies the code CI will run instead of a laxer copy of it. It prints the derived round, the depth
      histogram and per-game home/away scores for one real postseason, **prints each
      `TEAM_ID` ↔ abbreviation ↔ resolved `teams.id` triple it saw (the measurement
      `decision-2-1-q-4-data-source.md:104` never made — the owner reads whether the two spaces agree)**,
      and cross-checks one Game 7 against `boxscoretraditionalv2`. Its usage text names
      `--season=2025-26` as the season that has completed playoff games today.
- [ ] `_bmad-output/implementation-artifacts/seriesdatasource-port.md` -- document the `nba_com`
      adapter beside `manual_csv`: request count, selection rule, round vocabulary, **that team identity is
      resolved through the port's abbreviation resolver and what that means when the feed carries a team the
      table lacks**, freeze rule, and that `fantrax` stays rejected. Say plainly that a `--season=` drill onto
      a year the table holds as an unfinished **pending** series hits `plan.ts:377-379` (never rewrites stored
      games), which is a different message from the archived-row guard.
- [ ] `docs/CURRENT_DATA_MODEL.md`, `epic-2-context.md`, `deferred-work.md` -- record the
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

Loopback 1 reverted the first pass's code and docs (`## Spec Change Log` carries the KEEP list the
re-derivation must preserve, and `## Review Triage Log` row 1 the finding that caused it). This section is
rewritten by that pass: file-by-file what shipped, the verification run read bare, the mutation checks that
were executed, and the Owner-handover. Nothing here yet describes the current tree.

**The story is not `done`.** Decision 12 makes AC:369's live clause the owner's, and the live leg has not
been run: this session's policy refused the agent's outbound call to stats.nba.com. Until the output below
exists, no claim is made that the feed still answers the 2026-09-30 header posture, and no claim is made
about the feed's `TEAM_ID` space either.

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
  outbound call was refused by session policy). The flag is required: today's derived season is an offseason
  season with no completed playoff games, so an unflagged run exits 2 by design. Expected: one unkeyed
  postseason fetch through the shipped adapter, the derived round per series, the depth histogram, the
  `TEAM_ID` ↔ abbreviation ↔ resolved `teams.id` triples, and one Game 7 cross-checked field-by-field against
  `boxscoretraditionalv2`, exit 0. Its output is pasted into `## Implementation Notes` — that closes AC:369's
  live clause, and it is also the first evidence that Story 2.1's header posture still works a day later.
  **The id-space question is this leg's to answer**: if the printed `TEAM_ID`s differ from the resolved
  `teams.id`s, the decision record's claim is refuted by measurement and the resolver was load-bearing; if
  they agree, record that too, so the next reader has the measurement instead of the assertion.
- `node supabase/scripts/pipeline/run.ts --source=nba_com --dry-run` -- expected: needs
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` before it reaches the feed, then prints the counts line
  and an empty-or-real plan with zero writes. **Owner-run**: it opens a production session. Because the
  report now prints before planning, an abort on a missing env var still shows what the feed parsed.
- Mutation checks: make the adapter emit a 4-2 series and confirm the plan's 3–3 assertion reddens;
  drop the trailing period from the `vs.` split and confirm the two-row merge test reddens; make the
  season derive from `SEASON_ID` and confirm the calendar-year test reddens; let a same-UTC-day game
  through and confirm the certification test reddens; **make the adapter take the team id from the feed's
  `TEAM_ID` instead of the resolver and confirm the id-space tests redden** (that mutation is the one this
  story's first pass shipped, so it is the check that proves the fix is pinned); **delete the
  `for (const note of report.notes)` loop in `run.ts` and confirm the notes test reddens.**
