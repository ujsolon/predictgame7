# `SeriesDataSource` port contract — Story 2.3, extended by Story 2.4 and Story 2.13

Status: shipped in `supabase/scripts/pipeline/` (Story 2.3; the `nba_com`
adapter landed beside it in Story 2.4; the `espn` adapter landed in Story 2.13
and became the SCHEDULED source there — `nba_com` stays registered and
hand-runnable). **[2026-10-06, Story 2.16: `nba_com` is retired — `nbaCom.ts`,
its registry entry, its two owner-run probes and its test suite were deleted
in one commit, `--season=` retired with it, and the name now refuses the start
as an unrecognised adapter. This reverses owner call C1. The registered sources
are `manual_csv` (the floor and the default), `espn` (scheduled) and `fantrax`
(the recorded refusal). The `nba_com` text below is kept as the record of what
the adapter did and why it left — see the dated notes in "Adapter selection"
and "Automated adapter: `nba_com`".]** This is the port documentation `epics.md` Story 2.3 AC (:353)
asks for, with `manual_csv` as the reference implementation. Source of truth for
the boundary is `ARCHITECTURE-SPINE.md` AD-5; the two fetch method names below
are verbatim from AD-5 and must not drift.

## What the port is

One interface, two operations. Every series-data source — the spreadsheet
floor shipped today and the automated adapters Story 2.4 swaps in — is
reachable through it, and the runner knows nothing about which adapter
produced its rows.

```ts
interface SeriesDataSource {
  fetch_series_statuses(): Promise<SeriesStatusRow[]>;
  fetch_game_scores(): Promise<GameScoreRow[]>;
  describeRun?(): AdapterRunReport; // optional, additive — Story 2.4
}
```

Definition: `supabase/scripts/pipeline/port.ts`.

**`describeRun?()` is an optional third member** (`AdapterRunReport`: counts
line, depth histogram, `feedSeriesCount`, named-exclusion notes) that lets an
adapter print what its parse saw before the runner plans anything. AD-5 as
written names only the two fetch operations; it does not forbid an optional
member, so this ships compliant, but amending the spine text to record the
extension is an owner architecture act (Review Triage row 9 deferred it) —
until then this paragraph is the only place the extension is contractually
described.
`manual_csv` has no report; a run with it prints none of those lines.

**`feedSeriesCount` is the one member a machine reads** (Story 2.6). It is the
number of series the feed carried *before* any adapter-side exclusion (for
`nba_com`, after the rows dated the run's own UTC day are withheld, since those
rows are not this run's feed), so
`--require-feed` can decide on a number rather than on `countsLine`'s wording —
the wording belongs to the human log and may be rephrased without breaking the
alarm. `histogramLine` and `notes` stay prose.

**`alerts` is the report's action channel** (Story 2.18, 2026-10-06), separate
from `notes`: things the owner must act on, such as a 3–3 the run could not
certify into a birth, a re-read or backfill date that could not be read, or a
Game 7 for a series that was never born. The runner prints each one after the
report lines, prefixed `BIRTH NEEDED:` (`run.ts` `BIRTH_NEEDED_PREFIX`), and
the two pipeline workflows grep their log for that prefix to file the
"Pipeline birth needed <UTC date>" issue (dated, so each day's lines open an
issue of their own). An alert never changes the exit code.

**`isPairStored` on `AdapterDeps`** (Story 2.18) answers "is `(year, pair)`
already a `series` row, in either slot order?". The runner reads the table
**before** it builds the adapter and answers from that one read, which it
then reuses for planning. Absent means "unknown": the `espn` adapter then
backfills every 3–3 it sees and leaves every Game 7 to the planner
(`port.ts`), which is what the live probe does.

**`hasRunReport` on the registry entry** (`port.ts`) is what lets the runner
answer "does this adapter have a report?" *before* the sink exists, so
`--require-feed` handed to `manual_csv` refuses the run up front instead of
silently passing a check that can never run. `tests/pipeline/run.test.ts` pins
that the declared flag agrees with the adapter's actual `describeRun` member.

## Row shapes

```ts
interface SeriesStatusRow {
  year: number;            // calendar year — identity component
  round: string;           // free-text display label; NOT part of the key, no CHECK (Story 2.2)
  team_a_id: number;       // teams.id; convention: game 1's HOME team (AD-5, measured 178/178)
  team_b_id: number;       // teams.id
  winner_team_id: number | null; // NULL ⟺ Game 7 pending (AD-4 derivation input)
}

interface GameScoreRow {
  year: number;            // with team_a_id/team_b_id this keys the series — the identity pair
  team_a_id: number;
  team_b_id: number;
  game_number: number;     // 1..7
  home_team_id: number;
  away_team_id: number;
  home_score: number;      // final scores only; a tie is an invalid source row
  away_score: number;
}
```

Adapters return rows keyed by the **ordered** identity pair
`(year, team_a_id, team_b_id)` — the same key the database enforces with
`series_year_team_pair_key` (00014). Score rows join to statuses on that
exact pair; the runner groups, plans, and asserts before any write.

## Adapter selection

- `SERIES_SOURCE` (env) selects the adapter; `--source=` (flag) overrides it.
  Default: `manual_csv`.
- Registry: `ADAPTER_REGISTRY` in `port.ts`, keyed by the AD-5 adapter list —
  `manual_csv | fantrax | nba_com | espn`. `espn` is the SCHEDULED source from
  Story 2.13 on (Story 2.6's egress evidence: `stats.nba.com` refuses every
  cloud while `site.api.espn.com` answers from both — 78 ms hosted, 226 ms from
  Supabase). `nba_com` stays registered and hand-runnable, because it remains
  the source a residential address can still reach and dropping a recognised
  name would only invite a future session to re-propose the endpoint
  unexamined (owner call C1). **[2026-10-06, Story 2.16 — C1 reversed: the
  `nba_com` entry is removed from `ADAPTER_REGISTRY`, so the AD-5 list as built
  is `manual_csv | fantrax | espn` and `--source=nba_com` /
  `SERIES_SOURCE=nba_com` refuse the start as an unrecognised adapter, never a
  fallback. C1's first reason is answered by keeping the egress conclusion in
  the docs instead of in a registry name: `stats.nba.com` (and `cdn.nba.com`)
  refuse every cloud — the four-cell table in
  `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-03.md`, and
  the 0/15 measurement cited under "Automated adapter: `espn`" below — so do not
  re-propose either host for a scheduled run. Its second reason (a residential
  address can still run it) stopped being worth a registered source once Game 7
  venue curation, its last live job, was complete: 160/160 NBA/BAA cells filled,
  F3 closed (`sprint-status.yaml`, Story 2.12).]**
- Implemented: `manual_csv` and `nba_com` (Story 2.4), `espn` (Story 2.13). A
  flag the selected adapter cannot use (`--csv=` with `nba_com`, `--season=`
  with `manual_csv`, anything at all with `espn`) refuses the run — a silently
  discarded flag would let the operator believe they steered it.
  **[2026-10-06, Story 2.16: implemented today are `manual_csv` and `espn`.
  `--season=` is no longer a flag at all: it is outside the runner's
  `SUPPORTED_FLAGS`, so it refuses the run as an unrecognised flag (exit 2,
  naming the token) with any source.]**
- `fantrax` stays recognised-but-unimplemented, and its refusal message now
  carries the Story 2.1 spike's actual rejection (Fantrax endpoints are
  fantasy-scoped and never return a real NBA game score with home/away sides,
  see `decision-2-1-q-4-data-source.md`) — a silent drop of the registry entry
  would let a future session re-propose it as unexamined.
- A recognised-but-unimplemented name or an unrecognised one fails the start —
  never a silent fallback to `manual_csv`, because a silent fallback would
  leave Active Series stale while looking healthy.

## Automated adapter: `nba_com` (Story 2.4)

**[RETIRED 2026-10-06 by Story 2.16.]** Everything in this section describes
code that no longer exists: `adapters/nbaCom.ts`, `scripts/probe-nba-com-adapter.mjs`,
`scripts/probe-game7-venues.mjs` and `tests/pipeline/nba-com.test.ts` were
deleted together, and the chain-depth walk in `adapters/rounds.ts` went with its
only consumer. It is kept as the record of what the adapter measured (the
TEAM_ID namespace finding, the archive freeze) and of the egress conclusion
that retired it. If a Game 7 venue cell in `data/game7_venues_curated.csv` ever
goes blank again, the route is the hand-entry worksheet
(`node supabase/scripts/pipeline/venueBackfill.ts --worksheet`, which needs no
feed) with `basketball-reference.com` as the reference — see
`docs/CURRENT_DATA_MODEL.md` § "Story 2.8 status".

`supabase/scripts/pipeline/adapters/nbaCom.ts` — the route the Story 2.1 spike
proved: the unkeyed `stats.nba.com/stats/leaguegamelog` feed
(`PlayerOrTeam=T`, `SeasonType=Playoffs`, `Counter=1000`), fetched with the
spike's six headers copied verbatim.

- **Request count: exactly one per run.** Both port methods read the same
  memoised parse; a run never fans out (the route is Cloudflare-fronted and
  its rate limits are unmeasured). Tests pin `urls.length === 1`.
- **Season: derived, not configured.** The season parameter comes from the
  run's UTC date (`getUTCMonth() <= 5` → previous September–following May
  season). `--season=<YYYY-YY>` overrides the derivation; it is a FETCH
  PARAMETER only — no phase, group, or page derives from a date (AD-4).
- **Selection rule: Game-7 shapes only.** A series enters the output iff its
  games are exactly `{1..6}` decided 3–3 (pending birth) or exactly `{1..7}`
  all decided (archive). 4-0/4-1/4-2 sweeps, in-flight series and pre-2003
  best-of-5 shapes are excluded and COUNTED in the run report — that is AD-4's
  product rule. A game whose date equals the run's UTC date is withheld (the
  feed has no final/unfinal flag; those games belong to tomorrow's run) and
  named in the counts line. Two honest limits on that rule, both stated rather
  than guarded. (1) The ended-vs-in-flight COUNT assumes the best-of-7 era: a
  concluded pre-2003 best-of-5 (3-0/3-1/3-2) never reaches four wins, so a
  pre-2003 drill counts every ended series as "in flight". Excluding it needs
  no era rule; naming it correctly does, and the feed carries no format field.
  (2) The same-UTC-day withholding is a proxy whose safety argument is the
  cadence: FR-21's 09:00 UTC schedule puts every prior-night game past its
  final buzzer before the run, so non-null PTS on both sides means a finished
  game. An ad-hoc run at, say, 03:30 UTC can consume an in-progress game —
  `finalScore` rejects only null, negative and non-finite PTS — so scheduled
  runs are the supported mode. [Amended by Story 2.13: this source now carries
  NO cadence — `espn` is the scheduled adapter, at 07:30 UTC — so `nba_com` runs
  only by hand, where the operator picks the instant and applies this same
  margin reasoning to that instant. `espn` needs no such proxy: it admits a game
  only when the feed itself labels it `state=post` and `description=Final`.]
  Neither limit changes which series enter the plan; both change how the
  report's counts read.
- **Round vocabulary: four canonical labels by chain depth.** No working unkeyed
  endpoint returns a round name, so `adapters/rounds.ts` walks the
  postseason in date order (`depth = 1 + max(deeper side's previous depth)`,
  counting excluded series too) and maps depths 1..4 to `First Round`,
  `Conference Semifinals`, `Conference Finals`, `NBA Finals` — labels
  `getRoundImportance` already scores 1/2/3/4. A depth outside 1..4 is excluded
  AND named with the histogram that produced it.
- **Team identity is resolved, never copied.** Every id comes from the row's
  `TEAM_ABBREVIATION` through the port's `deps.teamIdByAbbreviation` — the
  same resolver `manual_csv` uses — because the sink's columns carry
  `REFERENCES teams(id)`. The feed's numeric `TEAM_ID` is a foreign namespace
  — **measured 2026-10-01** by the owner-run `scripts/probe-nba-com-adapter.mjs`
  against the live 2025-26 playoffs: 0 agree / 16 differ (`CLE` is
  `1610612739` on the wire and `6` here). That run retires
  `decision-2-1-q-4-data-source.md:104`'s unsourced claim that the two agree.
  Consequence to remember operationally: **a feed carrying a team the `teams`
  table lacks aborts the run naming the abbreviation and its `GAME_ID`, and
  writes nothing** — that is the loud failure replacing a silent wrong-franchise
  insert. `WL` is never read.
- **Failure posture:** 25 s `AbortSignal.timeout`, three attempts,
  `[1000, 4000]` ms backoff on 403/429/5xx or a body that is not the expected
  `resultSets` shape; non-retryable statuses fail at once. Every terminal
  message names the URL and reason and states that no `manual_csv` fallback
  was taken.
- **The archive is frozen (owner decision 2026-10-01, spec Decision 11):**
  without `--season=` this adapter can only ever fetch the postseason derived
  from the run date, so a year the table already holds cannot be re-fetched —
  that is the whole guarantee, and it does not stop *new* archive rows
  arriving: a series decided inside the fetched season enters the plan as
  fresh archive data with no drill involved. Enforcement of both is Story 2.3's
  own archive guard (`plan.ts:382-390`), untouched. With `--season=` pointed at
  an archived year the guard decides: identical source → skip, disagreeing
  source → non-zero abort naming the series, never a rewrite. Because the
  archived rows sit on the far side of the venue/slot boundary
  (`docs/CURRENT_DATA_MODEL.md`), a drill back through `manual_csv`-sourced
  years is expected to meet that abort, not a reconciliation. Note too the two
  different messages a drill can meet: a year the table holds as an unfinished
  **pending** series hits `plan.ts:377-379` ("the runner never rewrites stored
  games") when the source's games 1–6 differ — that is the stored-games guard,
  not the archived-outcome guard.

`scripts/probe-nba-com-adapter.mjs` is the committed live leg (owner-run per
Decision 12): it runs the SHIPPED adapter through a capturing fetch, prints
the TEAM_ID ↔ abbreviation ↔ resolved-id triples, and cross-checks one Game 7
against `boxscoretraditionalv2`. **Exit 0 means every check passed** — a
disagreement or an unexpected request count throws and exits 2, so a "PROBE
PASSED" line can never sit under a printed FAIL (review triage row 20). It
needs Node ≥ 22.18, since it imports the shipped TypeScript adapter under
native type-stripping. Two owner runs on 2026-10-01 are the evidence: the
first exited 2 on a defect in **this script's** own series selection (a
franchise that advanced contributed its later rounds — fixed in `4002893`),
the second passed every leg end to end against `Season=2025-26`.

## Automated adapter: `espn` (Story 2.13)

`supabase/scripts/pipeline/adapters/espn.ts` — the unkeyed
`site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard` route, the
source Story 2.6's egress evidence forced: `stats.nba.com` refuses every cloud
(0/15 across two providers and three client stacks) while this host answers from
both (78 ms hosted, 226 ms from Supabase). It is the SCHEDULED source; `nba_com`
stays registered and hand-runnable (owner call C1).

- **One request, one date.** `dates=YYYYMMDD` with exactly one value. The range
  form answers `400` with a body carrying no `events` (measured, and re-checked
  by the probe's range control), so a backfill is a bounded loop of single-date
  runs and this adapter builds only the single-date form — `scoreboardUrl()`
  throws on anything that is not eight digits. **[2026-10-06, Story 2.18: still
  single-date, but no longer one per run: the re-read and the backfill below
  add requests. `feedSeriesCount` counts the run's own date only.]**
- **The date is derived, never passed.** The PREVIOUS `America/New_York`
  calendar day of the run instant (`deriveRequestDate`), because ESPN filters
  `dates` by US local date (measured: `dates=20260605` returned the game stamped
  `2026-06-06T00:30Z`) and the 07:30 UTC slot fires at 02:30–03:30 ET, before
  that day's tips. A UTC-derived date reads an empty feed and trips
  `--require-feed` on a day that had games. `ADAPTER_FLAGS` gives `espn` no
  flags at all: a `--date=` would be the calendar logic AD-4 refuses.
- **Identity resolves through `teams.espn_code`, not `abbreviation`.** Measured
  divergences (all 30 franchises captured 2026-10-04): ESPN prints `NY`, `SA`,
  `GS`, `NO`, `UTAH` and `WSH` where the table holds `NYK`, `SAS`, `GSW`, `NOP`,
  `UTA` and `WAS`; the other 24 agree. A code that resolves to nothing aborts the run
  naming the code, and substring, city and nickname matching are refused by the
  adapter's own text — a silent mismatch drops games. `team.displayName` is
  never read as an identity. The column is migration `00018` (additive,
  nullable, partial unique index), seeded from the committed capture
  `tests/pipeline/fixtures/espn-teams-site-20261004.json`, which
  `espn-adapter.test.ts` audits every `UPDATE` against.
- **Round and game number come from the headline.**
  `competitions[0].notes[0].headline` ("East 1st Round - Game 2") is the only
  naming source on the measured payload — `competitions[0].type.shortName` is
  ABSENT there. The round phrase maps onto `rounds.ts`' frozen canonical
  vocabulary through `labelForDepth`, so no new `round` spelling can reach the
  table and the archive's 17 era spellings stay untouched. An absent headline or
  an out-of-vocabulary phrase excludes the game and NAMES it in
  `describeRun().notes`.
- **Selection rule: Final AND game 7.** The feed is date-granular while the plan
  model is series-granular, so this adapter's live job is Game 7 of a series the
  curated path already stored as pending. `plan.ts` admits that one shape and
  refuses to birth a series from a partial source; games 1–6 still arrive only
  through `manual_csv`. **[2026-10-06, Story 2.18: this still decides what a
  date admits as a game-7-only source, but games 1–6 now also arrive from the
  feed, through the backfill below. `plan.ts` is unchanged: the backfill hands
  it an ordinary six-game source.]** Admission requires `status.type.state === 'post'` with
  `description === 'Final'` — `in`, `pre` and any unrecognised string are
  excluded and named, never defaulted to "finished", because the host is
  undocumented Disney-side infrastructure with no SLA.
- **Failure posture:** 25 s `AbortSignal.timeout`, three attempts,
  `[1000, 4000]` ms backoff on 429/5xx or a body that is not the scoreboard
  shape; non-retryable statuses fail at once, and every terminal message names
  the URL and states that no `manual_csv` fallback was taken. **[Story 2.18:
  this holds for the run's own date. A re-read or backfill date that fails
  the same way becomes an alert and the run carries on.]**

### Births at a feed-observed 3–3 (Story 2.18, 2026-10-06)

`sprint-change-proposal-2026-10-06.md` (owner decision, option B) reversed the
2026-10-04 "the feed completes; it does not seed" call. It was measured first on
two 2025 first-round series; the payloads are committed under
`tests/pipeline/fixtures/espn-backfill-2025/` with their provenance.

- **The re-read.** Every run also reads the date **before** its own (one
  more single-date request), **for births only**: Final Game 6s at 3–3 not yet
  stored. A Game 6 that one red or late run missed is caught by the next. It
  is idempotent: a pair stored yesterday is skipped. Game 7s on the re-read
  page are ignored and only counted in its report line (owner decision
  2026-10-06 at the Story 2.18 review, amending the change proposal's option (i)): a completion
  comes from the run's own date only, so yesterday's finished series is never
  re-planned and a red run always points at the run's own date.
- **Detection.** A Final event is a Game 6 when its headline says so, or, if
  the headline is unreadable, when `competitions[0].series` stands 3–3 and not
  completed. Wins are read **per team**: `series.competitors[].id` is joined to
  the event's `competitors[].team.id` (ESPN's numeric team id, used for this
  join only, never as an identity), and never read by position. The spike
  measured GS–HOU reading `[0,1]` after Game 1. A pair stored in either slot
  order is skipped with no request. A Game 6 the series ended (4–2) is silent.
  A Game 6 whose `series` is missing or malformed, or whose headline and
  standing disagree, is an alert.
- **The backfill.** It walks back single dates from Game 6's date, at most
  **21 dates** counting Game 6's own, and stops once games 1–5 are found.
  Each game must be Final, between the same pair, and headline-numbered 1–5.
  Dates are fetched **at most once per run** and shared by the walks, which
  run one after another, and the re-read. A walked page contributes **only** the target pair's games
  1–5; every other event on it is never admitted, completed, backfilled from,
  or counted.
- **Certification before the planner.** The six games must share one round
  and one year, carry no tie, and split 3–3. Each game's own `series` standing
  must equal the running wins computed from the scores of games 1..N; any
  mismatch refuses the birth with an alert naming the series and the game.
- **The source.** An ordinary six-game source, seven when the pair's Game 7
  is also seen this run. It uses the single `team_a` = Game 1 home orientation
  for every row, because `groupSourceRows` keys on the ordered pair. It goes
  through the unchanged `plan.ts` and the `pipeline_birth_series` RPC, so every
  AD-4/AD-5 check still runs.
- **A Game 7 whose pair is known to be unborn**, with no birth assembled for it
  this run, is left out of the plan and alerted. Before Story 2.18 it reached
  the planner, which refused it and turned the whole run red. The adapter does
  this only when the runner told it what is stored (`isPairStored`).
- **Budget and isolation.** The re-read plus the backfills are bounded per run
  at **25 extra dates and 180 s** of wall clock, checked before each new date
  (one date's own retries can run past the line, worst case about 80 s, still
  well under the 10-minute step). A spent budget stops the walk and alerts the
  unfinished series. Any fetch error, drift or timeout on an extra date is an
  alert, never a thrown run. With the 21-date bound and two detection dates,
  the request budget cannot be reached by detection alone: the union of the
  two walks is at most 21 extra dates, the re-read included. The request
  budget is a backstop, and the wall-clock budget is the one that can bind.
- **`feedSeriesCount`** is the run's own date only, so `--require-feed`'s
  independence (Story 2.6 D-3) holds: an empty run date with games on the
  previous date is still red.

`scripts/probe-espn-adapter.mjs` is the committed live leg (owner-run, in the
Story 2.4 precedent): one leg drives the SHIPPED adapter over a named date and
prints the field coverage the parse depends on, one measures the 30-franchise
code table `00018` seeds from, and one re-checks the range refusal. Any
disagreement exits 2 with every leg's reason listed, so a "PROBE PASSED" line
can never sit under a printed failure.

**Fallback of last resort: `basketball-reference.com`** — measured reachable
from both clouds (`200 text/html`, 215,254 bytes in 220 ms) and deliberately
UNIMPLEMENTED (owner call C4). The scrape cost — HTML coupling, no published
schema, a Cloudflare guard — makes it a conditional story authored only if the
ESPN route actually fails, not a standby in this repo. `manual_csv` stays the
floor beneath both.

## What the runner asserts before it writes (plan.ts)

1. **Either-slot-order identity** (AD-5): the `(year, pair)` must be absent
   from `series` in BOTH slot orders. The UNIQUE guards the pair as stored
   and cannot enforce the game-1-home convention, so a slot-swapped source
   row against an existing table row aborts the run — non-zero exit, nothing
   written, message names the row. The 00015 birth RPC repeats the same
   check in SQL, but as an unlocked `EXISTS`, so it narrows the window
   between two concurrent runs rather than closing it: it catches a twin that
   already committed, not one mid-insert. Simultaneous runs are therefore
   only safe when one writer exists — Story 2.6's scheduled CI run is that
   single writer.
2. **Game-1-home convention** (AD-5): `team_a_id` must equal game 1's
   `home_team_id`. The adapter derives the slots from the game-1 row, so this
   is the check that a hand-edited or future automated row keeps the first
   slot honest; a mismatch names the row and aborts. Story 2.13's game-7-only
   shape cannot be checked this way and is not: `espn` sets `team_a` to game
   7's HOME side because it never sees game 1, so there is no game-1 row to
   compare against (the game-1 check in `validatedShape` fires only when one
   exists). What holds that shape's slots honest instead is the STORED pair:
   `planPipeline` looks the pair up in either slot order and, for this shape
   only, adopts the stored row's slots when it finds the pair reversed
   (`reversedIsMatch`), because game 7 is often hosted by the stored `team_b`.
   A game 7 whose sides leave the pair is still refused by `validatedShape`,
   mirror rows in both orders still abort, and a source that carries game 1
   still aborts on a reversed stored row.
3. **AD-4 derivation invariant**: a winner implies exactly the seven decided
   score rows `{1..7}` whose game-7 winner matches `winner_team_id` **and** a
   games-1-6 split of 3–3 (a 4–2 through six is an impossible shape, not a
   completion); a null winner implies exactly `{1..6}`, all decided (no
   ties), split 3–3. The game-number-set half reuses `deriveSeriesPhase`
   (`src/lib/series-phase.ts`) rather than restating it. Story 2.13 adds ONE
   exception to that shape set — item 6 below — and it is the only one.
4. **Source self-consistency**: no duplicate identities in either slot
   order, no duplicate game numbers, every game between the two slots.
5. **Never-rewrite rules**: an existing row is only ever *completed* (append
   game 7 + fill winner) — stored games are never restyled, archived outcomes
   are never overwritten; a source that disagrees with the table aborts. Two
   table rows that mirror each other in both slot orders also abort: the
   runner refuses to pick one and write against half the truth.
6. **Story 2.13's one new source shape** — a winner plus exactly ONE score row,
   game 7 (`gameSevenOnly`). It exists because the feed is date-granular while
   this model is series-granular: one run can see a Game 7 and nothing else.
   What it changes is the *source side* of the equality checks, never the write:
   - the 3–3 certification is NOT dropped. `pipeline_complete_series` re-reads
     the STORED games 1..6 and raises unless they are six decided games split
     3–3 (`00015:286-308`), and the plan mirrors that on the stored row with
     `storedPendingCertification` in `plan.ts` so the run keeps its
     promise that nothing reaches a write the database would reject.
   - it never births. A game 7 with no stored pending row aborts naming the
     path that does supply games 1–6 (`--source=manual_csv`), rather than
     inserting a series that starts at one game (the `!exact && gameSevenOnly`
     refusal in `planPipeline`).
   - the pending completion compares against the stored row instead of the
     source's games 1–6, which the shape does not carry (the pending branch's
     `mismatch` in `planPipeline`).
   - an archived replay of the same game 7 SKIPS rather than aborting, so
     dispatching one date twice stays green (the archive branch's `agrees`), and the
     non-reconciling repair branch is excluded for this shape — agreeing with
     one row out of seven would prove nothing about the 3–3 (the `!gameSevenOnly`
     guard on the repair branch).
   Births and whole-series archive rows therefore stay on the curated path; the
   scheduled feed's job is Game 7 admissions only.

Violations are `PlanAssertionError`s naming the offending row; the entry
point maps any failure to exit code 2 with zero writes issued (the plan is
fully computed and asserted before the sink is touched).

## Writes (writer.ts + migration 00015)

`PipelineSink` is the injectable seam (tests use a fake; no network):

- `readTeams()` / `readCurrent()` — service_role reads of `teams` and `series`
  with embedded `series_game_scores`.
- `birth(PlannedBirth)` → `SELECT pipeline_birth_series(p_year, p_round,
  p_team_a_id, p_team_b_id, p_scores jsonb)` — one RPC: series row + six
  score rows, one transaction, `ON CONFLICT ON CONSTRAINT
  series_year_team_pair_key` / `unique_series_game` handled in SQL, returns
  the server-generated uuid.
- `complete(PlannedCompletion)` → `SELECT pipeline_complete_series(p_series_id,
  p_game jsonb, p_winner_team_id)` — one RPC: append (or repair) game 7 and
  fill `winner_team_id`, one transaction.
- `refreshInsights()` → `SELECT pipeline_refresh_insights_cache()` —
  **Story 2.5, migration `00017`**. One RPC, **no arguments**: recomputes all
  three `insights_cache` keys (`game_6_winner_stats`, `home_team_stats`,
  `avg_point_differential`) from `series` / `series_game_scores` and writes
  the three rows in ONE statement (`ON CONFLICT (insight_key) DO UPDATE`),
  so either all three land or none does. Population: archived series
  (`winner_team_id IS NOT NULL`), each one's game-7 row,
  `league IN ('NBA','BAA')` — the league filter is the "this Game-7 venue is
  real" marker from `00016`; the 18 ABA series are excluded from every card.
  `win_rate` members are **percentages** (seed units — the page appends `%`).
  Returns the census jsonb (`total_game_sevens`, `home_team_wins`,
  `game_6_winners_won`, `average_margin`) so the run's report line prints
  what the server wrote instead of re-reading the table; a null census
  throws (birth's second-throw convention). Like the other two, it is
  `SECURITY DEFINER` with `EXECUTE` for `service_role` only.

The payload keys are the SQL parameter names verbatim, `p_`-prefixed:
`client.rpc(name, params)` hands the object to PostgREST, which binds by
**named** parameter, so a bare `year`/`scores` key would not match
`p_year`/`p_scores`. `scripts/rehearse-migration-00014.mjs` section 4 calls
both RPCs with `p_year => …` named notation against the replayed 00015 schema
and asserts both the accepted shapes and the rejections, which is the executed
evidence for this contract — no local test can see it, because the real
functions only exist on a database the agent never touches.

`service_role` comes from the environment (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` — non-`VITE_*`, NFR-S1); the runner never accepts
an anon key for writes. No step writes `series.status` — the column is gone
(00014). A `--dry-run` prints the plan and issues zero writes, refresh
included.

## Insights cache refresh (Story 2.5, migration 00017)

Two firing paths, one shared implementation (`sink.refreshInsights()`), one
report line — printed **only on the branch that refreshed**, because an
unconditional "cache refreshed" line on a run that did nothing would be a
false report:

1. **Automatic (the frozen trigger).** A run refreshes the cache only when it
   filled at least one winner — a completion, or a birth carrying its Game 7
   follow-up (that write *is* the active→archive transition, AD-4). The
   refresh runs **after** the write phase, never before. A purely offseason
   run fills none and refreshes nothing; production currently holds no
   pending series, so today no ordinary run can fire this branch — it is the
   future path, shipped per the frozen rule.
2. **Operator (`--refresh-insights`, owner decision U10).** A bare flag that
   short-circuits right after the sink is built and before `sink.readTeams()`:
   one RPC against the archive as it stands, one census line, exit 0. No
   adapter is fetched, no `series` row is read or written — enforced by
   structure (everything downstream is simply not reached), asserted by the
   call log in `tests/pipeline/run.test.ts`. `--refresh-insights --dry-run` is
   refused by the flag validator **before any credential is read or client
   built** — dry-run promises zero writes and the refresh is three; the two
   are mutually exclusive by validation, not by ordering. `--csv=` and
   `--season=` **[2026-10-06, Story 2.16: `--season=` retired; it is now
   refused as an unrecognised flag before this rule is reached]** are refused on this path by the same rule: it selects no
   adapter, so no scoping flag can narrow it and silently discarding one
   would mislead the operator. Adapter selection is not validated here at all
   — a `SERIES_SOURCE` naming an unimplemented adapter cannot refuse a refresh
   that uses none.

A refresh failure on either path exits 2 naming
`pipeline_refresh_insights_cache` (the single catch already turns any sink
throw into exit 2); series writes from a completed write phase stay landed —
a PostgREST client cannot roll them back — and the run is not a success.
The automatic trigger is **one-shot**: once those writes have landed, a re-run
plans them as skips and does not refresh on their account, so a failed
automatic refresh stays stale until the operator path runs. The exit-2 message
says so and names the `--refresh-insights` command (review pass 2,
2026-10-05).

Rehearsal: `scripts/rehearse-migration-00014.mjs` section 6 exercises the
function in the replayed 00001–00017
schema over four archive states — the synthetic 178-fixture archive,
hand-authored mechanics fixtures (zero denominator, pending exclusion, ABA
exclusion, game-7-only read, percentage-unit pins), the empty population, and
U11's real-score fixture built in-repo from the committed
`docs/NBASeriesResults.xlsx` joined to the committed
`supabase/scripts/pipeline/data/game7_venues_curated.csv` on the **unordered
(year, team pair)** — never slot order — with game-7 rows seeded venue-true
from the CSV and seeded **after** the ordered replay so `00016`'s pinned
census guards are never asked to run over a 159-series archive. Section 6e
then tampers the schema — drops `series.league` and re-applies `00017` inside
one transaction — so that migration's `league_column_present` guard is
**observed refusing**, and asserts the tamper left nothing behind (Story 2.8's
convention: a guard never seen to fail is not yet a guard); 6f flips one
curated Game-7 home side in memory to prove the pinned 117 is *sensitive*
rather than sticky, which is the only in-repo check the "backfill short or
mis-keyed" row has. `node
scripts/rehearse-migration-00014.mjs --fixture-report` runs the
join-and-measure half alone, no Docker, no database.

## Reference implementation: `manual_csv`

`supabase/scripts/pipeline/adapters/manualCsv.ts`. Two committed files under
`data/`:

- `series_manual.csv` — the **operator's live data**, and the default path.
  It is intentionally header-only outside a playoff window: an apply run
  writes exactly these rows to production, so a fabricated row becomes a real
  Active Series the moment it exists. An empty plan writes zero rows and exits
  0. Story 2.6's CI workflow reads the same file.
- `series_manual.example.csv` — the worked example (a finished 2016 GSW/CLE
  series plus a live 3–3), with the venue warning below. Tests never read
  either file; they pin their own fixture, so editing the operator's data
  cannot turn the gate red or green.

Long-format CSV, one row per game, columns in this order:

| column | meaning |
| --- | --- |
| `year` | calendar year of the series |
| `round` | free-text display label (one per series; mismatches name the row) |
| `game_number` | 1..7; the game-1 row fixes the slots (`home_team` → `team_a_id`) |
| `home_team` | `teams.abbreviation` (UNIQUE), resolved to `teams.id` at runtime |
| `away_team` | `teams.abbreviation` |
| `home_score` / `away_score` | final, decided scores; ties are rejected naming the row |

`#` lines and blank lines are comments. An abbreviation the `teams` table
does not hold fails the plan, naming the abbreviation and the line. The
adapter derives what the database derives: no winner column exists — a
series' `winner_team_id` is game 7's higher-scoring team when a game-7 row
is present, otherwise NULL. Completing a live series is **appending one
game-7 line** and running the pipeline (the operator cadence Story 2.6
documents: edit the CSV before the daily run slot).

`home_team`/`away_team` must be the real game-1-venue order for a new series,
because `team_a_id` is derived from it — but note what the archive holds:
measured over 178 archived series / 1,246 game rows, in 177 of the 178 every
game names the SAME team as home (the series' `team_a`). The archived rows
carry slots, not venues, so a future venue-correct adapter cannot reconcile
them row-for-row. See `docs/CURRENT_DATA_MODEL.md` § "The archive carries
slots, not venues".

**The floor writes live playoff rows only and is not a backfill vehicle
(Story 2.8, Call 1):** a `manual_csv` run against archived series aborts at
`plan.ts:382-390` by design — that is the archive freeze working, not a defect
to route around — which is why the curated Game-7 venues and the `league`
column reach the database through migration `00016` instead, emitted by
`supabase/scripts/pipeline/venueBackfill.ts` from the committed
`data/game7_venues_curated.csv` (see
`docs/CURRENT_DATA_MODEL.md` § "Story 2.8 status").

## Operator usage

```
node --env-file=.env supabase/scripts/pipeline/run.ts --source=manual_csv --dry-run
node --env-file=.env supabase/scripts/pipeline/run.ts --source=espn --dry-run
node --env-file=.env supabase/scripts/pipeline/run.ts --source=nba_com --dry-run
node --env-file=.env supabase/scripts/pipeline/run.ts --source=nba_com --season=2016-17 --dry-run
node --env-file=.env supabase/scripts/pipeline/run.ts --refresh-insights
```

**[2026-10-06, Story 2.16: the two `nba_com` lines above are retired. The first
now refuses the start as an unrecognised adapter; the second is refused even
earlier, as an unrecognised `--season=` flag. Both exit 2 having opened no
sink.]**

The last line is **the owner's Story 2.5 command** (U10): after `npx supabase
db push` applies `00017`, it is how the insights cache gets its first real
population without waiting for a winner-filling run. It writes only the three
`insights_cache` rows, prints one census line, and its home-card reading is
expected to match the recorded **117 of 160** pair
(`epic-2-context.md:44`); a mismatch stops the story in Story 2.8's scope,
not here.

Requires **Node ≥ 22.18** (also 23.6+; the repo develops on 24) — `run.ts` is
a plain `.ts` file executed by Node's native type-stripping, with no build
step and no loader flag. Nothing in the repo enforces it: `package.json` has
no `engines` field, so on an older Node the first command fails at parse time
rather than with a readable message. `--csv=<path>` points `manual_csv` at a
different file; `--season=<YYYY-YY>` points `nba_com` at one postseason
(the archive is frozen — a drill onto an archived year reaches the archive
guard, never a rewrite) **[2026-10-06, Story 2.16: retired with `nba_com`;
`--csv=` is the only scoping flag left]**. `espn` takes **no flag at all**: its single date is
derived from the run instant, so a hand run of it asks the feed for yesterday in
`America/New_York` and nothing else — a `--date=` would put calendar logic in the
operator's hands, which AD-4 refuses. Each flag refuses the run when handed to
an adapter that cannot use it.

`.env` supplies `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (owner-only;
never committed). Drop `--dry-run` to apply. Exit 0 = plan applied (or
empty); exit 2 = refused or failed, message names the row. Only those two codes
exist — there is no third. Exit codes are the runner's own: it sets
`process.exitCode`, never `process.exit`. Checked by
`npm run gate` end to end: Biome (`supabase/scripts/**/*.ts`),
`tsc -b` via `tsconfig.pipeline.json`, and Vitest `tests/pipeline/*.test.ts`
against the fake sink.

**`--require-feed` (Story 2.6) turns a silent empty run into a failure.** The
runner was always date-blind, so nothing in code knows it is April: the flag is
how a workflow file says "this schedule is inside the playoff window, so zero
series from the feed is an alarm". It reads `report.feedSeriesCount`, throws
before any plan is computed and before any write, and so applies to `--dry-run`
too — which is what gives the alarm a zero-write red the owner can prove in
October instead of waiting for April. Two refusals come with it, both up front
before a credential is read and before the adapter is constructed: `--refresh-insights`
(the operator refresh recomputes from the archive and never fetches, so there is
no feed to require), and `--source=manual_csv` (that adapter declares no run
report — its rows are a file the operator edited, not a feed that can come back
empty). A recognised-but-unimplemented name like `fantrax` refuses one step
earlier, as unimplemented, which is why dispatching the inseason workflow with
`source=fantrax` is a zero-write red the alarm can be proven against.
The scheduled inseason workflow adds the flag unconditionally; a
`workflow_dispatch` can ask for it with the `require_feed` input. The offseason
edge runs deliberately carry it nowhere: an empty feed at the bracket's edges is
legitimate, and alarming there would train the owner to ignore the alarm that
matters.

## The scheduled pipelines (Story 2.6)

`.github/workflows/pipeline-inseason.yml`, `pipeline-offseason.yml` and
`migration-rehearsal.yml` are the cadence FR-20/21 requires without the owner
remembering a command, and all three end with
`./.github/actions/notify-failure` — one composite action, `if: failure()`,
which files a titled issue and comments "Still red:" on a later break instead
of opening a duplicate. The workflows' contract is pinned by
`tests/pipeline/workflows.test.ts`: before it, nothing in `npm run gate` read
`.github/**` at all (Biome's `files.includes` excludes it and no actionlint
exists here), so a dropped flag or a widened permission could only be found in
April.

Two things a reader must not get wrong from that file:

- **The three inseason cron lines are one bracket.** A cron day-of-month range
  cannot express mid-April through June in a single line, so `30 7 16-30 4 *` /
  `30 7 * 5 *` / `30 7 1-30 6 *` together *are* the design's only date
  expression — the runner still derives nothing from a date. When the bracket
  moves (lockout, shifted Play-In, Finals past June 30) the edit happens in that
  file and nowhere else. [The minute is `30 7`, moved from `30 9` by owner call
  2026-10-04 (Story 2.13) and argued in `spec-2-13-espn-feed-adapter/schedule-amendment.md`;
  `keepalive.yml` moved with it to `0 7 * * *`, because the ordering — warm the
  PostgREST instance, then run — is the reason the minute exists. What the move
  trades away is the margin: at 07:30 UTC it is 02:30–03:30 ET, so a game still
  in overtime when the run fires is excluded as non-Final, named in the report,
  and never re-fetched.]
- **The scheduled source is `espn` since Story 2.13, and that changed what the
  offseason edges can do.** Both workflows dispatch `--source=espn` by default,
  and a date-granular feed carries a Game 7 but never a series' first six games.
  So the April edge's "initialize the bracket" half is served by `--source=manual_csv`
  — Story 2.7's curated drill — while the June edge's "finalize" half is exactly
  what the feed does. **[2026-10-06, Story 2.18: the feed now births at a 3–3
  too (above), so both halves run from the feed, with `manual_csv` as the
  fallback. Both workflows `tee` the run log, and after their failure step two
  more steps grep it for `BIRTH NEEDED:` and file a separate "Pipeline birth
  needed" issue through the same `notify-failure` action. That issue is not a
  failure, and the exit code is unchanged by it.]** The re-point is in the same commit as the adapter by
  design: a cadence defaulting to a source that cannot be reached from a runner
  is the failure Story 2.6's egress evidence was about.
- **`--env-file` is absent on purpose.** Node treats a missing env-file as
  fatal and a runner has no `.env`, so credentials enter through the step's
  `env:` block from repository secrets — never on a command line, never from a
  committed value (NFR-S1). The guard step that names a missing secret before
  the run exists so a rotation failure reports as a name, not as a fetch error
  several legs late.
