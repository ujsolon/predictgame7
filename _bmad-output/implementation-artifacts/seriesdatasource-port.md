# `SeriesDataSource` port contract — Stories 2.3 + 2.4

Status: shipped in `supabase/scripts/pipeline/` (Story 2.3), with the first
automated adapter (`nba_com`) registered behind the same seam (Story 2.4).
This is the port documentation `epics.md` Story 2.3 AC (:353) asks for, with
`manual_csv` as the reference implementation and `nba_com` documented beside
it. Source of truth for the boundary is `ARCHITECTURE-SPINE.md` AD-5; the
method names below are verbatim from AD-5 and must not drift.

## What the port is

One interface, two operations. Every series-data source — the spreadsheet
floor and the automated adapter shipped today — is reachable through it, and
the runner knows nothing about which adapter produced its rows.

```ts
interface SeriesDataSource {
  fetch_series_statuses(): Promise<SeriesStatusRow[]>;
  fetch_game_scores(): Promise<GameScoreRow[]>;
}
```

Definition: `supabase/scripts/pipeline/port.ts`.

AD-5 freezes those two method names; nothing else is part of the contract.
`SeriesDataSource` therefore has one **optional** member, `describeRun?():
AdapterRunReport`, which the automated adapter implements to report how it
picked its rows (selection counts, derived depth histogram, named
exclusions). The runner prints it after the two fetches resolve; an adapter
without it (`manual_csv`) simply reports nothing extra.

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
  `manual_csv | fantrax | nba_com`. `manual_csv` is the floor and the default
  and Story 2.4 neither removed nor demoted it; `nba_com` is implemented;
  `fantrax` stays in the registry as recognised-but-unimplemented.
- A recognised-but-unimplemented name (`fantrax`) fails the start with a
  message that names the Story 2.1 spike rejection — fantasy endpoints return
  fantasy point totals and playoff configuration, never real home/away game
  scores — and points at
  `_bmad-output/implementation-artifacts/decision-2-1-q-4-data-source.md`.
  Never a silent fallback to `manual_csv`, because a silent fallback would
  leave Active Series stale while looking healthy.
- An unrecognised name fails against the registry with the known list.

## Automated adapter: `nba_com`

`supabase/scripts/pipeline/adapters/nbaCom.ts` (+ `adapters/rounds.ts` for the
round vocabulary). Source: the unkeyed `stats.nba.com/stats/leaguegamelog`
team-side playoff feed Story 2.1 proved (`decision-2-1-q-4-data-source.md`).

- **One HTTP request per run.** `fetch_series_statuses()` and
  `fetch_game_scores()` are two views of a single cached parse of that one
  `leaguegamelog` response (`Counter=1000`, `PlayerOrTeam=T`,
  `SeasonType=Playoffs`, `SortColumn=DATE`). A run never fans out; the fetch
  is memoised, so calling both methods issues exactly one request.
- **Season is a fetch parameter derived from the run's UTC date**: Jan–Jun →
  `${year-1}-${yy}`, Jul–Dec → `${year}-${yy+1}` — the postseason of season
  `Y-1`–`Y` is played in calendar year `Y`. `--season=<YYYY-YY>` overrides it.
  An offseason run therefore asks for a season with no playoff games, gets
  zero rows, plans nothing and exits 0. It is a fetch scope only: no phase,
  group or page derives from a date (AD-4).
- **Game-7 selection.** A feed series enters the output iff its games are
  exactly {1..6} decided with a 3–3 split (→ birth as pending) or exactly
  {1..7} all decided (→ completion/archive). Every other shape — 4-0, 4-1,
  4-2, an in-flight 2-1, a pre-2003 best-of-5 — is excluded and counted in the
  run's summary line, so coverage cannot silently narrow. The best-of-5 era
  needs no code that knows about 2003: such a series never reaches either
  shape.
- **No same-UTC-day game is ever consumed.** A game whose `GAME_DATE` equals
  the run's UTC date is excluded and counted — `leaguegamelog` has no
  final/unfinal flag, and a game is not over until it is over. FR-21's daily
  09:00 UTC cadence makes those games tomorrow's input.
- **Slots, year and game numbers** (the spike's inherit list): `team_a_id` is
  game 1's home team (plan.ts re-asserts it), `year` is the **calendar** year
  of `GAME_DATE` — never `SEASON_ID` — and `game_number` is date order within
  the team pair — never the `GAME_ID` suffix. The `MATCHUP` home form is
  `"X vs. Y"` with a load-bearing trailing period; the away form is `"Y @ X"`.
  A game's two team rows merge on `(GAME_DATE, unordered pair)`; an unparseable
  `MATCHUP`, a self-match, a null `PTS` on a past date or a tie is rejected
  naming the `GAME_ID`.
- **Rounds come from chain depth**, not from the feed (no working endpoint
  returns a round name). Walking the postseason in date order, a series' depth
  is one more than the deeper of its two teams' previous series this
  postseason; depth 1..4 maps to exactly `First Round`, `Conference Semifinals`,
  `Conference Finals`, `NBA Finals` — round-only labels, so no conference map
  or 2.7 MB schedule blob is fetched, and all four land in the intended
  `getRoundImportance` branch (1/2/3/4). A depth outside 1..4 excludes the
  series and names it in the summary with the histogram; every run prints the
  derived histogram (a postseason in flight legitimately shows a partial one —
  information, not a gate).
- **Failure posture**: `AbortSignal.timeout(25000)`, three attempts with
  backoff `[1000, 4000]` ms on 403/429/5xx or a body that is not the expected
  `resultSets` shape, then a non-zero exit naming the URL and the status. The
  spike's header set is copied verbatim (`User-Agent`, `Accept`, `Referer`,
  `Origin`, `x-nba-stats-origin`, `x-nba-stats-token`) — no key, so nothing
  here becomes a Story 2.6 secret. A non-retryable HTTP status fails
  immediately. `nba_com` failing never selects `manual_csv`.
- **The archive is frozen** (owner decision (a), 2026-10-01; Story 2.4
  Decision 11). Enforcement is the adapter's **fetch scope**, not a new guard:
  `nba_com` fetches the one postseason derived from the run date, so a year
  already archived cannot enter the plan. The protection that does exist is
  Story 2.3's archive guard (`plan.ts`: an archived row whose source matches is
  skipped, one that disagrees aborts naming the series) and this adapter leaves
  it untouched. Consequence accepted rather than engineered away: a
  `--season=2016-17` drill reaches that throw, which is why `--season=`'s help
  text and this section say the rule in plain words, and a test pins the message.
- **It never writes.** The adapter calls no sink, no RPC, no Supabase at all;
  it returns the port's two row shapes and the runner keeps planning, asserting
  and writing.
- **Deps** (Decision 8 — `AdapterDeps` generalized instead of accreting CSV
  fields): `season?` and `runDate?` are the date seam, `fetch?` is the network
  injection (`tests/pipeline` stubs it; no test reaches the network), `sleep?`
  stubs the retry backoff, and `csvPath?` is `manual_csv`-only — `run.ts` no
  longer resolves a CSV path for an adapter that cannot use it.

`scripts/probe-nba-com-adapter.mjs` is the committed **owner-run** live leg for
AC:369 (unkeyed, read-only, zero Supabase calls): it re-runs this parse against
one real postseason and cross-checks one completed Game 7 against
`boxscoretraditionalv2`. The story's live evidence is that script's pasted
output; nothing is claimed about the feed's current reachability until it
exists.

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
   slot honest; a mismatch names the row and aborts.
3. **AD-4 derivation invariant**: a winner implies exactly the seven decided
   score rows `{1..7}` whose game-7 winner matches `winner_team_id` **and** a
   games-1-6 split of 3–3 (a 4–2 through six is an impossible shape, not a
   completion); a null winner implies exactly `{1..6}`, all decided (no
   ties), split 3–3. The game-number-set half reuses `deriveSeriesPhase`
   (`src/lib/series-phase.ts`) rather than restating it.
4. **Source self-consistency**: no duplicate identities in either slot
   order, no duplicate game numbers, every game between the two slots.
5. **Never-rewrite rules**: an existing row is only ever *completed* (append
   game 7 + fill winner) — stored games are never restyled, archived outcomes
   are never overwritten; a source that disagrees with the table aborts. Two
   table rows that mirror each other in both slot orders also abort: the
   runner refuses to pick one and write against half the truth.

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
(00014). A `--dry-run` prints the plan and issues zero writes.

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
carry slots, not venues, so no venue-correct adapter can reconcile them
row-for-row. The owner's decision (2026-10-01, option (a)) is that those rows
are **frozen**: `nba_com` never reconciles, re-labels or rewrites them, and it
reaches them only through `--season=`, where the archive guard decides. See
`docs/CURRENT_DATA_MODEL.md` § "The archive carries slots, not venues".

## Operator usage

```
node --env-file=.env supabase/scripts/pipeline/run.ts --source=manual_csv --dry-run
node --env-file=.env supabase/scripts/pipeline/run.ts --source=nba_com --dry-run
```

Requires **Node ≥ 22.18** (also 23.6+; the repo develops on 24) — `run.ts` is
a plain `.ts` file executed by Node's native type-stripping, with no build
step and no loader flag. Nothing in the repo enforces it: `package.json` has
no `engines` field, so on an older Node the first command fails at parse time
rather than with a readable message. `--csv=<path>` points the `manual_csv`
adapter at a different file (it is CSV-only; an automated adapter is never
handed a path it cannot use). `--season=<YYYY-YY>` overrides `nba_com`'s
date-derived postseason — see the frozen-archive rule above before pointing it
at an archived year.

Flags are validated: `--dry-run`, `--source=`, `--csv=`, `--season=` are the
set, and anything else (a `--dryrun` typo included) refuses the run with the
help text instead of being ignored. `nba_com` prints its selection counts and
the derived depth histogram on every run, before the plan.

`.env` supplies `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (owner-only;
never committed) — needed even for `--dry-run`, because the plan asserts
against the current table. Drop `--dry-run` to apply. Exit 0 = plan applied (or
empty); exit 2 = refused or failed, message names the row. Checked by
`npm run gate` end to end: Biome (`supabase/scripts/**/*.ts`),
`tsc -b` via `tsconfig.pipeline.json`, and Vitest `tests/pipeline/*.test.ts`
against the fake sink and an injected `fetch` (no test reaches the network).
